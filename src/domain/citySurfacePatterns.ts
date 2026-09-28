// Procedural surface patterns for the construction studio (docs/city-surfaces.md): wall claddings and floor
// finishes written once against a tiny arithmetic interface (`SurfaceOps`). The same source runs
//  - as numbers: swatch thumbnails, the colour picker preview and unit tests (NUMERIC_OPS), and
//  - as TSL nodes: the shared node material on WebGPU and the WebGL2 node backend (citySurfacePatternMaterial).
// Everything is branchless (step/mix instead of if), so it compiles to one straight-line shader per pattern.
// Coordinates are metres in pattern space: x along the wall (or floor x), y up the wall (or floor z), already
// scaled and rotated by the finish. Outputs: `tone` (albedo multiplier around 1), `accent` (0..1 share of the
// accent colour: mortar, grout, chips, borders), `height` (0..1 relief for the bump) and `rough` (0..1).
// Self-authored (no third-party assets); CC0 ambientCG photo sets stay available as `cc0-*` patterns.
import type {CityTextureId} from './cityTexturePresets.ts';

export interface SurfaceOps<S>{
 n(v:number):S;
 add(a:S|number,b:S|number):S;sub(a:S|number,b:S|number):S;mul(a:S|number,b:S|number):S;div(a:S|number,b:S|number):S;
 floor(a:S|number):S;fract(a:S|number):S;abs(a:S|number):S;sqrt(a:S|number):S;sin(a:S|number):S;
 min(a:S|number,b:S|number):S;max(a:S|number,b:S|number):S;clamp(a:S|number,lo:number,hi:number):S;
 mix(a:S|number,b:S|number,t:S|number):S;step(edge:S|number,x:S|number):S;smoothstep(e0:S|number,e1:S|number,x:S|number):S;
 /** Screen-space footprint of a value (fwidth on the GPU, 0 for numbers): thin joints widen and fade instead of aliasing. */aa(a:S|number):S;
}
export type PatternOut<S>={tone:S;accent:S;height:S;rough:S};
export type PatternFn=<S>(o:SurfaceOps<S>,x:S,y:S)=>PatternOut<S>;

export const NUMERIC_OPS:SurfaceOps<number>={
 n:v=>v,add:(a,b)=>a+b,sub:(a,b)=>a-b,mul:(a,b)=>a*b,div:(a,b)=>a/b,floor:Math.floor,fract:a=>a-Math.floor(a),abs:Math.abs,sqrt:a=>Math.sqrt(Math.max(0,a)),sin:Math.sin,
 min:Math.min,max:Math.max,clamp:(a,lo,hi)=>Math.min(hi,Math.max(lo,a)),mix:(a,b,t)=>a+(b-a)*t,step:(e,x)=>x>=e?1:0,
 smoothstep:(e0,e1,x)=>{const t=Math.min(1,Math.max(0,(x-e0)/(e1-e0)));return t*t*(3-2*t);},aa:()=>0,
};

// ---- Shared helpers (generic over numbers and nodes) -------------------------------------------------------
type O<S>=SurfaceOps<S>;type V<S>=S|number;
/** Hash without sine (Dave Hoskins), 2D to [0,1): stable for large world coordinates (fract first). */
export function hash2<S>(o:O<S>,x:V<S>,y:V<S>):S{
 const a=o.fract(o.mul(x,.1031)),b=o.fract(o.mul(y,.1031));
 const d=o.add(o.add(o.mul(a,o.add(b,33.33)),o.mul(b,o.add(a,33.33))),o.mul(a,o.add(a,33.33)));
 const px=o.add(a,d);return o.fract(o.mul(o.add(px,o.add(b,d)),px));
}
/** Smooth value noise in [0,1]. */
export function noise2<S>(o:O<S>,x:V<S>,y:V<S>):S{
 const ix=o.floor(x),iy=o.floor(y),fx=o.fract(x),fy=o.fract(y);
 const ux=o.mul(o.mul(fx,fx),o.sub(3,o.mul(fx,2))),uy=o.mul(o.mul(fy,fy),o.sub(3,o.mul(fy,2)));
 const a=hash2(o,ix,iy),b=hash2(o,o.add(ix,1),iy),c=hash2(o,ix,o.add(iy,1)),d=hash2(o,o.add(ix,1),o.add(iy,1));
 return o.mix(o.mix(a,b,ux),o.mix(c,d,ux),uy);
}
export const fbm2=<S>(o:O<S>,x:V<S>,y:V<S>):S=>o.add(o.mul(noise2(o,x,y),.65),o.mul(noise2(o,o.add(o.mul(x,2.07),5.3),o.add(o.mul(y,2.07),1.7)),.35));
/** Parity of an integer-valued cell sum: 0 or 1. */
const parity=<S>(o:O<S>,v:V<S>)=>o.mul(o.fract(o.mul(v,.5)),2);
/**
 * 1 on a joint of half-width w (distance d to the nearest cell edge), softened over 40 %. Below a pixel the joint widens
 * to the pixel footprint and dims by sqrt(w/footprint) (a little above strict coverage, so grout still reads at studio
 * distances) and never aliases into dashes.
 */
const joint=<S>(o:O<S>,d:V<S>,w:number)=>{const jw=o.max(w,o.mul(o.aa(d),.75));return o.mul(o.sub(1,o.smoothstep(o.mul(jw,.6),jw,d)),o.sqrt(o.div(w,jw)));};
/** 1 while a sub-feature of `period` metres is resolved on screen, fading to 0 as it drops below ~half a pixel. */
const fine=<S>(o:O<S>,v:V<S>,period:number)=>o.sub(1,o.smoothstep(.35,.9,o.div(o.aa(v),period)));
const edgeDist=<S>(o:O<S>,f:V<S>,size:V<S>)=>o.mul(o.min(f,o.sub(1,f)),size);
/** Worley (cellular) noise: nearest and second distances plus a hash of the nearest cell. 3x3, unrolled. */
function worley<S>(o:O<S>,x:V<S>,y:V<S>){
 const ix=o.floor(x),iy=o.floor(y);let f1=o.n(9),f2=o.n(9),id=o.n(0);
 for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){
  const cx=o.add(ix,i),cy=o.add(iy,j),px=o.add(cx,o.add(.15,o.mul(hash2(o,cx,cy),.7))),py=o.add(cy,o.add(.15,o.mul(hash2(o,o.add(cx,19.1),o.add(cy,7.3)),.7)));
  const dx=o.sub(px,x),dy=o.sub(py,y),d=o.sqrt(o.add(o.mul(dx,dx),o.mul(dy,dy))),closer=o.step(d,f1);
  f2=o.min(f2,o.max(f1,d));id=o.mix(id,hash2(o,o.add(cx,3.7),o.add(cy,1.3)),closer);f1=o.min(f1,d);
 }
 return {f1,f2,id};
}
/** Running bond of `len` x `h` units (metres incl. joint), rows shifted by `shift` of a unit. */
function bond<S>(o:O<S>,x:V<S>,y:V<S>,len:V<S>,h:number,shift:V<S>){
 const row=o.floor(o.div(y,h)),u=o.add(o.div(x,len),o.mul(row,shift)),cell=o.floor(u);
 const d=o.min(edgeDist(o,o.fract(u),len),edgeDist(o,o.fract(o.div(y,h)),h));
 return {row,cell,d,id:hash2(o,cell,row)};
}
const out=<S>(o:O<S>,tone:V<S>,accent:V<S>,height:V<S>,rough:V<S>):PatternOut<S>=>({tone:o.add(tone,0),accent:o.add(accent,0),height:o.add(height,0),rough:o.add(rough,0)});

// ---- Herringbone (planks n widths long, w wide) -----------------------------------------------------------
/**
 * Axis-aligned herringbone on the lattice (1,1)/(n,-n) in plank widths: strip j holds H_k=[k,k+n]x[k,k+1] and
 * V_k=[k+n,k+n+1]x[k-n+1,k+1] shifted by j(n,-n). Candidate strips j-1..j+1 are tested branchlessly.
 */
export function herringbone<S>(o:O<S>,x:V<S>,y:V<S>,w:number,n:number){
 const qx=o.div(x,w),qy=o.div(y,w),j=o.floor(o.div(o.sub(qx,qy),2*n));
 let found=o.n(0),along=o.n(0),across=o.n(0),id=o.n(0),vertical=o.n(0);
 for(const dj of [0,-1,1]){
  const jj=o.add(j,dj),rx=o.sub(qx,o.mul(jj,n)),ry=o.add(qy,o.mul(jj,n));
  const k=o.floor(ry),u=o.sub(rx,k),inH=o.mul(o.step(0,u),o.step(u,n)),mH=o.mul(inH,o.sub(1,found));
  along=o.mix(along,u,mH);across=o.mix(across,o.sub(ry,k),mH);id=o.mix(id,hash2(o,o.add(o.mul(jj,7),.5),k),mH);vertical=o.mix(vertical,0,mH);found=o.max(found,inH);
  const k2=o.floor(o.sub(rx,n)),lo=o.sub(o.add(k2,1),n),inV=o.mul(o.step(lo,ry),o.step(ry,o.add(k2,1))),mV=o.mul(inV,o.sub(1,found));
  along=o.mix(along,o.sub(ry,lo),mV);across=o.mix(across,o.sub(rx,o.add(k2,n)),mV);id=o.mix(id,hash2(o,o.add(o.mul(jj,7),3.5),k2),mV);vertical=o.mix(vertical,1,mV);found=o.max(found,inV);
 }
 const d=o.mul(o.min(o.min(along,o.sub(n,along)),o.min(across,o.sub(1,across))),w);
 return {along:o.mul(along,w),across:o.mul(across,w),d,id,vertical,found};
}

// ---- Patterns -------------------------------------------------------------------------------------------------
const brickStretcher:PatternFn=(o,x,y)=>{const b=bond(o,x,y,.225,.075,.5);return out(o,o.add(.78,o.add(o.mul(b.id,.34),o.mul(noise2(o,o.mul(x,9),o.mul(y,9)),.08))),joint(o,b.d,.005),o.smoothstep(0,.006,b.d),.84);};
const brickFlemish:PatternFn=(o,x,y)=>{
 const P=.3375,row=o.floor(o.div(y,.075)),u=o.add(o.div(x,P),o.mul(row,.5)),cell=o.floor(u),fu=o.mul(o.fract(u),P),header=o.step(.225,fu);
 const a=o.sub(fu,o.mul(header,.225)),len=o.mix(.225,.1125,header),d=o.min(o.min(a,o.sub(len,a)),edgeDist(o,o.fract(o.div(y,.075)),.075));
 const id=hash2(o,o.add(o.mul(cell,2),header),row);
 return out(o,o.mul(o.add(.8,o.add(o.mul(id,.3),o.mul(noise2(o,o.mul(x,9),o.mul(y,9)),.08))),o.sub(1,o.mul(header,.16))),joint(o,d,.005),o.smoothstep(0,.006,d),.84);
};
const brickEnglish:PatternFn=(o,x,y)=>{
 const row=o.floor(o.div(y,.075)),hr=parity(o,row),len=o.mix(.225,.1125,hr),b=bond(o,x,y,len,.075,o.mul(hr,.5));
 return out(o,o.mul(o.add(.8,o.add(o.mul(b.id,.3),o.mul(noise2(o,o.mul(x,9),o.mul(y,9)),.08))),o.sub(1,o.mul(hr,.1))),joint(o,b.d,.005),o.smoothstep(0,.006,b.d),.84);
};
const stoneAshlar:PatternFn=(o,x,y)=>{
 const row=o.floor(o.div(y,.34)),u=o.add(o.div(x,.68),hash2(o,row,3.1)),cell=o.floor(u),d=o.min(edgeDist(o,o.fract(u),.68),edgeDist(o,o.fract(o.div(y,.34)),.34));
 return out(o,o.add(.76,o.add(o.mul(hash2(o,cell,row),.28),o.mul(fbm2(o,o.mul(x,3),o.mul(y,3)),.14))),joint(o,d,.006),o.add(o.mul(o.smoothstep(0,.03,d),.8),o.mul(noise2(o,o.mul(x,7),o.mul(y,7)),.2)),.9);
};
const stoneRubble:PatternFn=(o,x,y)=>{
 const c=worley(o,o.div(x,.34),o.div(y,.22)),d=o.mul(o.sub(c.f2,c.f1),.24);
 return out(o,o.add(.68,o.add(o.mul(c.id,.42),o.mul(noise2(o,o.mul(x,6),o.mul(y,6)),.1))),joint(o,d,.028),o.mul(o.smoothstep(0,.05,d),o.clamp(o.sub(1.25,c.f1),0,1)),.92);
};
const smoothPaint:PatternFn=(o,x,y)=>out(o,o.add(.98,o.mul(noise2(o,o.mul(x,2),o.mul(y,2)),.04)),0,0,.8);
const renderStucco:PatternFn=(o,x,y)=>out(o,o.add(.9,o.add(o.mul(fbm2(o,o.mul(x,1.3),o.mul(y,1.3)),.12),o.mul(noise2(o,o.mul(x,11),o.mul(y,11)),.05))),0,o.add(o.mul(noise2(o,o.mul(x,23),o.mul(y,23)),.6),o.mul(fbm2(o,o.mul(x,3),o.mul(y,3)),.4)),.93);
const weatherboard:PatternFn=(o,x,y)=>{
 const bh=.16,row=o.floor(o.div(y,bh)),fv=o.fract(o.div(y,bh)),u=o.add(o.div(x,3.6),hash2(o,row,11)),butt=joint(o,edgeDist(o,o.fract(u),3.6),.004);
 const lap=joint(o,o.mul(fv,bh),.014);
 return out(o,o.add(.86,o.add(o.mul(hash2(o,o.floor(u),row),.12),o.mul(noise2(o,o.mul(x,1.4),o.mul(y,45)),.06))),o.max(o.mul(lap,.85),butt),o.mul(o.sub(1,fv),o.sub(1,butt)),.78);
};
const shingles:PatternFn=(o,x,y)=>{
 const sh=.13,row=o.floor(o.div(y,sh)),fv=o.fract(o.div(y,sh)),u=o.add(o.div(x,.2),hash2(o,row,5)),cell=o.floor(u),gap=joint(o,edgeDist(o,o.fract(u),.2),.006);
 const shadow=joint(o,o.mul(fv,sh),.018);
 return out(o,o.add(.76,o.mul(hash2(o,cell,row),.38)),o.max(gap,o.mul(shadow,.8)),o.mul(o.sub(1,fv),o.sub(1,gap)),.88);
};
const timberCladding:PatternFn=(o,x,y)=>{
 const bw=.14,col=o.floor(o.div(x,bw)),side=joint(o,edgeDist(o,o.fract(o.div(x,bw)),bw),.004),v=o.add(o.div(y,2.4),hash2(o,col,7)),end=joint(o,edgeDist(o,o.fract(v),2.4),.003);
 return out(o,o.add(.82,o.add(o.mul(hash2(o,col,o.floor(v)),.22),o.mul(noise2(o,o.mul(x,40),o.mul(y,1.2)),.08))),o.max(side,end),o.sub(1,o.max(side,end)),.8);
};
const corrugatedMetal:PatternFn=(o,x,y)=>{
 const s=o.mul(o.sin(o.mul(x,Math.PI*2/.076)),fine(o,x,.076)),seam=o.mul(joint(o,edgeDist(o,o.fract(o.div(x,.912)),.912),.004),.6);void y;
 return out(o,o.add(.86,o.mul(s,.14)),seam,o.add(.5,o.mul(s,.5)),.42);
};
const concretePanel:PatternFn=(o,x,y)=>{
 const pw=1.2,ph=.6,fu=o.fract(o.div(x,pw)),fv=o.fract(o.div(y,ph)),d=o.min(edgeDist(o,fu,pw),edgeDist(o,fv,ph)),lx=o.mul(fu,pw),ly=o.mul(fv,ph);
 const hole=(cx:number)=>{const dx=o.sub(lx,cx),dy=o.sub(ly,.3);return joint(o,o.sqrt(o.add(o.mul(dx,dx),o.mul(dy,dy))),.014);};
 const holes=o.max(hole(.3),hole(.9)),panel=hash2(o,o.floor(o.div(x,pw)),o.floor(o.div(y,ph)));
 return out(o,o.add(.86,o.add(o.mul(panel,.08),o.mul(fbm2(o,o.mul(x,2.2),o.mul(y,2.2)),.1))),o.max(joint(o,d,.008),o.mul(holes,.8)),o.mul(o.smoothstep(0,.01,d),o.sub(1,holes)),.88);
};
function grid<S>(o:O<S>,x:V<S>,y:V<S>,w:number,h:number,shift:number,grout:number,variety:number,rough:number){
 const b=bond(o,x,y,w,h,shift);return out(o,o.add(1-variety*.5,o.mul(b.id,variety)),joint(o,b.d,grout),o.smoothstep(0,grout*1.5,b.d),o.mix(rough,.85,joint(o,b.d,grout)));
}
const glazedTile:PatternFn=(o,x,y)=>grid(o,x,y,.15,.15,0,.0025,.08,.12);
const tokyoTile:PatternFn=(o,x,y)=>grid(o,x,y,.1,.05,0,.0028,.42,.38);
const tileSubway:PatternFn=(o,x,y)=>grid(o,x,y,.15,.075,.5,.002,.07,.16);
const tileSquare:PatternFn=(o,x,y)=>grid(o,x,y,.3,.3,0,.003,.08,.38);
const tileHex:PatternFn=<S,>(o:O<S>,x:S,y:S)=>{
 const s=.12,qx=o.div(x,s),qy=o.div(y,s),rx=1,ry=1.7320508;
 const m=(v:V<S>,r:number)=>o.sub(o.sub(v,o.mul(o.floor(o.div(v,r)),r)),r/2);
 const ax=m(qx,rx),ay=m(qy,ry),bx=m(o.sub(qx,rx/2),rx),by=m(o.sub(qy,ry/2),ry);
 const sel=o.step(o.add(o.mul(ax,ax),o.mul(ay,ay)),o.add(o.mul(bx,bx),o.mul(by,by))),gx=o.mix(bx,ax,sel),gy=o.mix(by,ay,sel);
 const hd=o.max(o.add(o.mul(o.abs(gx),.5),o.mul(o.abs(gy),.8660254)),o.abs(gx)),d=o.mul(o.sub(.5,hd),s),id=hash2(o,o.floor(o.mul(o.sub(qx,gx),2)),o.floor(o.mul(o.sub(qy,gy),2)));
 return out(o,o.add(.95,o.mul(id,.1)),joint(o,d,.0025),o.smoothstep(0,.004,d),o.mix(.3,.85,joint(o,d,.0025)));
};
const tileChecker:PatternFn=(o,x,y)=>{
 const s=.3,c=parity(o,o.add(o.floor(o.div(x,s)),o.floor(o.div(y,s)))),d=o.min(edgeDist(o,o.fract(o.div(x,s)),s),edgeDist(o,o.fract(o.div(y,s)),s)),j=joint(o,d,.002);
 return out(o,o.sub(o.add(.97,o.mul(noise2(o,o.mul(x,5),o.mul(y,5)),.05)),o.mul(j,.3)),c,o.smoothstep(0,.003,d),.3);
};
const terrazzo:PatternFn=(o,x,y)=>{
 const f=fine(o,x,.035),a=o.mul(o.mix(.12,o.step(.74,noise2(o,o.mul(x,24),o.mul(y,24))),f),1),b=o.mul(o.step(.77,noise2(o,o.add(o.mul(x,37),7),o.add(o.mul(y,37),3))),f),c=o.mul(o.step(.8,noise2(o,o.add(o.mul(x,61),3),o.add(o.mul(y,61),11))),f);
 return out(o,o.mul(o.mul(o.add(.95,o.mul(noise2(o,o.mul(x,3),o.mul(y,3)),.06)),o.sub(1,o.mul(b,.45))),o.add(1,o.mul(c,.22))),a,0,.2);
};
const stoneFlags:PatternFn=(o,x,y)=>{
 const row=o.floor(o.div(y,.55)),u=o.add(o.div(x,.75),o.mul(hash2(o,row,9),.9)),cell=o.floor(u),d=o.min(edgeDist(o,o.fract(u),.75),edgeDist(o,o.fract(o.div(y,.55)),.55));
 return out(o,o.add(.74,o.add(o.mul(hash2(o,cell,row),.3),o.mul(fbm2(o,o.mul(x,3),o.mul(y,3)),.12))),joint(o,d,.007),o.add(o.mul(o.smoothstep(0,.02,d),.75),o.mul(noise2(o,o.mul(x,6),o.mul(y,6)),.25)),.86);
};
const concretePolished:PatternFn=(o,x,y)=>{
 const d=o.min(edgeDist(o,o.fract(o.div(x,3)),3),edgeDist(o,o.fract(o.div(y,3)),3));
 return out(o,o.add(.88,o.add(o.mul(fbm2(o,o.mul(x,.8),o.mul(y,.8)),.12),o.mul(noise2(o,o.mul(x,27),o.mul(y,27)),.04))),o.mul(joint(o,d,.002),.7),0,.26);
};
const marble:PatternFn=(o,x,y)=>{
 const d=o.min(edgeDist(o,o.fract(o.div(x,.8)),.8),edgeDist(o,o.fract(o.div(y,.8)),.8));
 const w=o.sin(o.add(o.mul(o.add(o.mul(x,1.2),o.mul(y,.7)),5),o.mul(fbm2(o,o.mul(x,1.5),o.mul(y,1.5)),6)));
 const w2=o.sin(o.add(o.mul(o.sub(o.mul(x,.6),o.mul(y,1.4)),11),o.mul(fbm2(o,o.add(o.mul(x,3),4),o.mul(y,3)),5)));
 const veins=o.max(o.sub(1,o.smoothstep(0,.13,o.abs(w))),o.mul(o.sub(1,o.smoothstep(0,.06,o.abs(w2))),.55));
 return out(o,o.add(.95,o.mul(noise2(o,o.mul(x,4),o.mul(y,4)),.06)),o.max(veins,o.mul(joint(o,d,.0015),.5)),0,.12);
};
const carpet:PatternFn=(o,x,y)=>{
 const c=parity(o,o.add(o.floor(o.div(x,.5)),o.floor(o.div(y,.5))));
 const f=fine(o,x,.011);return out(o,o.add(.88,o.add(o.mul(o.sub(noise2(o,o.mul(x,90),o.mul(y,90)),.5),o.mul(f,.1)),o.add(.05,o.mul(c,.05)))),0,o.mul(noise2(o,o.mul(x,140),o.mul(y,140)),f),1);
};
const rubber:PatternFn=(o,x,y)=>{
 const fx=o.sub(o.fract(o.div(x,.05)),.5),fy=o.sub(o.fract(o.div(y,.05)),.5),r=o.mul(o.sqrt(o.add(o.mul(fx,fx),o.mul(fy,fy))),.05),stud=joint(o,r,.012);
 return out(o,o.add(.9,o.mul(stud,.1)),0,stud,.74);
};
const cobbles:PatternFn=(o,x,y)=>{
 const c=worley(o,o.div(x,.13),o.div(y,.11)),d=o.mul(o.sub(c.f2,c.f1),.12),j=joint(o,d,.032);
 return out(o,o.add(.66,o.mul(c.id,.46)),j,o.mul(o.clamp(o.sub(1.25,o.mul(c.f1,1.3)),0,1),o.sub(1,j)),.8);
};
const brickPaving:PatternFn=(o,x,y)=>{const h=herringbone(o,x,y,.1,2);return out(o,o.add(.78,o.add(o.mul(h.id,.34),o.mul(noise2(o,o.mul(x,9),o.mul(y,9)),.06))),joint(o,h.d,.004),o.smoothstep(0,.006,h.d),.86);};
const timberHerringbone:PatternFn=(o,x,y)=>{
 const h=herringbone(o,x,y,.07,5),grain=noise2(o,o.add(o.mul(h.along,1.6),o.mul(h.id,31)),o.add(o.mul(h.across,70),o.mul(h.id,17)));
 return out(o,o.add(.78,o.add(o.mul(h.id,.28),o.mul(grain,.12))),joint(o,h.d,.0012),o.smoothstep(0,.002,h.d),.62);
};
const timberChevron:PatternFn=(o,x,y)=>{
 const c=.5,w=.09,col=o.floor(o.div(x,c)),fx=o.sub(x,o.mul(col,c)),p=parity(o,col),lx=o.mix(fx,o.sub(c,fx),p),s=o.div(o.add(y,lx),w*1.4142),k=o.floor(s);
 const d=o.min(edgeDist(o,o.fract(s),w),o.mul(o.min(fx,o.sub(c,fx)),.7)),id=hash2(o,col,k),grain=noise2(o,o.add(o.mul(o.sub(y,lx),1.2),o.mul(id,29)),o.mul(o.fract(s),9));
 return out(o,o.add(.78,o.add(o.mul(id,.28),o.mul(grain,.12))),joint(o,d,.0012),o.smoothstep(0,.002,d),.62);
};
const timberParquet:PatternFn=(o,x,y)=>{
 const s=.32,cx=o.floor(o.div(x,s)),cy=o.floor(o.div(y,s)),c=parity(o,o.add(cx,cy)),lx=o.fract(o.div(x,s)),ly=o.fract(o.div(y,s));
 const across=o.mix(ly,lx,c),along=o.mix(lx,ly,c),st=o.floor(o.mul(across,4));
 const d=o.min(edgeDist(o,o.fract(o.mul(across,4)),s/4),o.min(edgeDist(o,lx,s),edgeDist(o,ly,s))),id=hash2(o,o.add(o.mul(cx,4),st),o.add(cy,o.mul(c,97)));
 return out(o,o.add(.78,o.add(o.mul(id,.26),o.mul(noise2(o,o.add(o.mul(along,5),o.mul(id,13)),o.mul(o.fract(o.mul(across,4)),6)),.12))),joint(o,d,.0012),o.smoothstep(0,.002,d),.6);
};
const timberPlanks:PatternFn=(o,x,y)=>{
 const w=.19,L=1.9,row=o.floor(o.div(y,w)),u=o.add(o.div(x,L),hash2(o,row,1)),cell=o.floor(u),d=o.min(edgeDist(o,o.fract(o.div(y,w)),w),edgeDist(o,o.fract(u),L)),id=hash2(o,cell,row);
 return out(o,o.add(.78,o.add(o.mul(id,.28),o.mul(noise2(o,o.add(o.mul(x,1.3),o.mul(id,23)),o.mul(y,48)),.12))),joint(o,d,.0012),o.smoothstep(0,.002,d),.64);
};
const tatami:PatternFn=(o,x,y)=>{
 const B=1.8,bx=o.floor(o.div(x,B)),by=o.floor(o.div(y,B)),c=parity(o,o.add(bx,by)),lx=o.sub(x,o.mul(bx,B)),ly=o.sub(y,o.mul(by,B));
 const along=o.mix(lx,ly,c),full=o.mix(ly,lx,c),mat=o.floor(o.div(full,.9)),across=o.sub(full,o.mul(mat,.9));
 const border=joint(o,o.min(across,o.sub(.9,across)),.036),seam=joint(o,o.min(along,o.sub(B,along)),.003);
 const weave=o.add(.5,o.mul(o.sin(o.mul(along,Math.PI*2/.015)),o.mul(fine(o,along,.015),.5)));
 return out(o,o.sub(o.add(.9,o.add(o.mul(weave,.07),o.mul(hash2(o,o.add(o.mul(bx,2),mat),by),.05))),o.mul(seam,.3)),border,o.mul(weave,o.sub(1,border)),.84);
};

export type SurfaceUse='wall'|'floor';
export type SurfaceGroup='Brick'|'Stone'|'Render'|'Timber'|'Tile'|'Metal'|'Concrete'|'Soft'|'Classic';
/**
 * `feature`: main cell size in metres (the shader fades the pattern to its mean once pixels approach it; finer
 * sub-features such as weave, grain and ribs fade on their own through `aa`).
 * `jointShare`: mean accent share at that distance. `bump`: relief strength (height units per metre of bump).
 * `opening`: generated walls reveal coursed stone near openings (render-like finishes only).
 * `texture`: CC0 photo set backing a `cc0-*` pattern (no procedural fn).
 */
export type SurfacePatternMeta={label:string;group:SurfaceGroup;use:readonly SurfaceUse[];tint:string;accent:string;feature:number;jointShare:number;bump:number;metal?:number;opening?:boolean;fn?:PatternFn;texture?:Exclude<CityTextureId,'none'|'checker'>};
const W=['wall'] as const,F=['floor'] as const,B=['wall','floor'] as const;
export const SURFACE_PATTERNS={
 'brick-stretcher':{label:'Brick · stretcher',group:'Brick',use:B,tint:'#a4583f',accent:'#cdc3b2',feature:.075,jointShare:.18,bump:.006,fn:brickStretcher},
 'brick-flemish':{label:'Brick · Flemish',group:'Brick',use:W,tint:'#9c513c',accent:'#d2c8b6',feature:.075,jointShare:.2,bump:.006,fn:brickFlemish},
 'brick-english':{label:'Brick · English',group:'Brick',use:W,tint:'#a15a41',accent:'#cfc6b4',feature:.075,jointShare:.2,bump:.006,fn:brickEnglish},
 'brick-paving':{label:'Brick paving',group:'Brick',use:F,tint:'#a3614a',accent:'#b9ab94',feature:.1,jointShare:.12,bump:.005,fn:brickPaving},
 'stone-ashlar':{label:'Stone ashlar',group:'Stone',use:W,tint:'#c9bea7',accent:'#b7ab96',feature:.34,jointShare:.05,bump:.012,fn:stoneAshlar},
 'stone-rubble':{label:'Stone rubble',group:'Stone',use:W,tint:'#a8a092',accent:'#7a7266',feature:.22,jointShare:.14,bump:.02,fn:stoneRubble},
 'stone-flags':{label:'Stone flags',group:'Stone',use:F,tint:'#a9a597',accent:'#8c877a',feature:.55,jointShare:.04,bump:.01,fn:stoneFlags},
 'cobbles':{label:'Cobbles',group:'Stone',use:F,tint:'#8f8a80',accent:'#5e5a53',feature:.11,jointShare:.16,bump:.02,fn:cobbles},
 'marble':{label:'Marble · veined',group:'Stone',use:B,tint:'#ece8e1',accent:'#8d8a86',feature:.8,jointShare:.06,bump:0,fn:marble},
 'paint-smooth':{label:'Smooth paint',group:'Render',use:B,tint:'#e8e2d6',accent:'#c8bba4',feature:.5,jointShare:0,bump:0,opening:true,fn:smoothPaint},
 'render-stucco':{label:'Render / stucco',group:'Render',use:W,tint:'#e3d6bf',accent:'#c8bba4',feature:.3,jointShare:0,bump:.004,opening:true,fn:renderStucco},
 'weatherboard':{label:'Weatherboard',group:'Timber',use:W,tint:'#dcd8cc',accent:'#6f6b62',feature:.16,jointShare:.1,bump:.012,fn:weatherboard},
 'shingles':{label:'Shingles',group:'Timber',use:W,tint:'#8f7a63',accent:'#40352c',feature:.13,jointShare:.14,bump:.012,fn:shingles},
 'timber-cladding':{label:'Timber cladding',group:'Timber',use:W,tint:'#a47a55',accent:'#4a3a2b',feature:.14,jointShare:.06,bump:.004,fn:timberCladding},
 'timber-planks':{label:'Timber planks',group:'Timber',use:F,tint:'#b0875e',accent:'#4d3a28',feature:.19,jointShare:.02,bump:.002,fn:timberPlanks},
 'timber-herringbone':{label:'Herringbone',group:'Timber',use:F,tint:'#a97d55',accent:'#4d3a28',feature:.07,jointShare:.04,bump:.002,fn:timberHerringbone},
 'timber-chevron':{label:'Chevron',group:'Timber',use:F,tint:'#b48a60',accent:'#4d3a28',feature:.09,jointShare:.04,bump:.002,fn:timberChevron},
 'timber-parquet':{label:'Parquet',group:'Timber',use:F,tint:'#a27650',accent:'#4d3a28',feature:.08,jointShare:.05,bump:.002,fn:timberParquet},
 'tile-square':{label:'Square tile',group:'Tile',use:B,tint:'#d6cfc0',accent:'#a39c90',feature:.3,jointShare:.03,bump:.003,fn:tileSquare},
 'tile-hex':{label:'Hex tile',group:'Tile',use:B,tint:'#e8e4da',accent:'#8e8981',feature:.12,jointShare:.05,bump:.003,fn:tileHex},
 'tile-checker':{label:'Checker tile',group:'Tile',use:F,tint:'#ece8df',accent:'#2c2c2e',feature:.3,jointShare:.5,bump:.002,fn:tileChecker},
 'tile-subway':{label:'Subway tile',group:'Tile',use:B,tint:'#f1efe9',accent:'#b5b0a6',feature:.075,jointShare:.06,bump:.002,fn:tileSubway},
 'glazed-tile':{label:'Glazed tile',group:'Tile',use:W,tint:'#4d7f86',accent:'#d8d3c8',feature:.15,jointShare:.05,bump:.002,fn:glazedTile},
 'tokyo-tile':{label:'Tokyo tile',group:'Tile',use:W,tint:'#b8a184',accent:'#d5cbbb',feature:.05,jointShare:.1,bump:.002,fn:tokyoTile},
 'terrazzo':{label:'Terrazzo',group:'Tile',use:B,tint:'#e6e0d4',accent:'#7a8a8c',feature:.3,jointShare:.12,bump:0,fn:terrazzo},
 'corrugated-metal':{label:'Corrugated metal',group:'Metal',use:W,tint:'#9aa6a6',accent:'#5d6666',feature:.9,jointShare:.02,bump:.008,metal:.55,fn:corrugatedMetal},
 'concrete-panel':{label:'Concrete panels',group:'Concrete',use:W,tint:'#b9b6ae',accent:'#6e6c67',feature:.6,jointShare:.03,bump:.006,fn:concretePanel},
 'concrete-polished':{label:'Polished concrete',group:'Concrete',use:B,tint:'#aeaba4',accent:'#6e6c67',feature:.5,jointShare:0,bump:0,fn:concretePolished},
 'carpet':{label:'Carpet',group:'Soft',use:F,tint:'#6c7a8c',accent:'#3d4550',feature:.5,jointShare:0,bump:.0015,fn:carpet},
 'rubber':{label:'Rubber studded',group:'Soft',use:F,tint:'#4a4f52',accent:'#2b2e30',feature:.05,jointShare:0,bump:.003,fn:rubber},
 'tatami':{label:'Tatami',group:'Soft',use:F,tint:'#c8bd84',accent:'#2f3b35',feature:.9,jointShare:.04,bump:.002,fn:tatami},
 'cc0-brick':{label:'Red brick (photo)',group:'Classic',use:B,tint:'#ffffff',accent:'#ffffff',feature:1,jointShare:0,bump:.08,texture:'brick'},
 'cc0-plaster':{label:'Painted plaster (photo)',group:'Classic',use:W,tint:'#ffffff',accent:'#ffffff',feature:1,jointShare:0,bump:.015,opening:true,texture:'plaster'},
 'cc0-concrete':{label:'Concrete (photo)',group:'Classic',use:B,tint:'#ffffff',accent:'#ffffff',feature:1,jointShare:0,bump:.025,texture:'concrete'},
 'cc0-timber':{label:'Timber siding (photo)',group:'Classic',use:W,tint:'#ffffff',accent:'#ffffff',feature:1,jointShare:0,bump:.04,texture:'timber'},
 'cc0-metal':{label:'Metal (photo)',group:'Classic',use:W,tint:'#ffffff',accent:'#ffffff',feature:1,jointShare:0,bump:.025,metal:.65,texture:'metal'},
 'cc0-pavers':{label:'Paving stones (photo)',group:'Classic',use:F,tint:'#ffffff',accent:'#ffffff',feature:1,jointShare:0,bump:.07,texture:'pavers'},
 'cc0-terracotta':{label:'Terracotta tiles (photo)',group:'Classic',use:W,tint:'#ffffff',accent:'#ffffff',feature:1,jointShare:0,bump:.07,texture:'terracotta'},
} as const satisfies Record<string,SurfacePatternMeta>;
export type SurfacePatternId=keyof typeof SURFACE_PATTERNS;
export const SURFACE_PATTERN_IDS=Object.keys(SURFACE_PATTERNS) as SurfacePatternId[];
export const surfacePattern=(id:string):SurfacePatternMeta|undefined=>Object.hasOwn(SURFACE_PATTERNS,id)?(SURFACE_PATTERNS as Record<string,SurfacePatternMeta>)[id]:undefined;
export const isSurfacePattern=(id:unknown):id is SurfacePatternId=>typeof id==='string'&&!!surfacePattern(id);
export const SURFACE_GROUPS:readonly SurfaceGroup[]=['Brick','Stone','Render','Timber','Tile','Metal','Concrete','Soft','Classic'];
export const patternsFor=(use:SurfaceUse)=>SURFACE_PATTERN_IDS.filter(id=>(SURFACE_PATTERNS[id].use as readonly SurfaceUse[]).includes(use));

/** Legacy ids: curated texture presets and the three original interior floor finishes. */
export const LEGACY_TEXTURE_PATTERN:Partial<Record<CityTextureId,SurfacePatternId>>={brick:'cc0-brick',plaster:'cc0-plaster',concrete:'cc0-concrete',timber:'cc0-timber',metal:'cc0-metal',pavers:'cc0-pavers',checker:'cc0-pavers',terracotta:'cc0-terracotta'};
export const LEGACY_FLOOR_PATTERN={timber:'timber-planks',tile:'tile-square',stone:'stone-flags'} as const satisfies Record<'timber'|'tile'|'stone',SurfacePatternId>;
export const LEGACY_FLOOR_COLOR={timber:'#ad8864',tile:'#d0c4aa',stone:'#aaa99b'} as const;

/** Numeric evaluation (swatches, tests). */
export function samplePattern(id:SurfacePatternId,x:number,y:number):PatternOut<number>|null{const fn=surfacePattern(id)?.fn;return fn?fn(NUMERIC_OPS,x,y):null;}
