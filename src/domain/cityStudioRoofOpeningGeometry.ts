/**
 * Roof opening geometry and the roof pass that runs inside connectedStudioRoofs (and so
 * inside the sculpt worker). Output is plain typed arrays in building-local metres, one
 * buffer set per roof part so materials follow that part's roof finish and wall colour.
 *  - Skylight: the roof solid is cut through (the envelope closes the shaft), then a
 *    slim frame, recessed glazing just above the roof plane and a flashing collar.
 *  - Dormer: the roof is cut inside its walls; a front wall reusing the free opening
 *    geometry (surround, sill, recessed frame, glazing), two cheeks whose lower edge runs
 *    below the slope, a gable (ridge perpendicular to the main ridge), flat or shed roof
 *    panel whose top meets the slope along its valleys, verge/fascia trim, ridge cap and
 *    lead flashing along the cheeks and front apron.
 * The dormer frame: x' across (0 = centre, viewer right), y up, dq uphill in plan from the
 * front wall's outer skin. The slope is y = y0 + k*dq.
 */
// @deno-types="npm:@types/three@0.186.0"
import {Color,ShapeUtils,Vector2} from 'three';
import {resolveFreeOpenings} from './cityStudioFreeOpenings.ts';
import {buildFreeOpeningFaceGeometry,DEFAULT_FREE_PALETTE,FREE_FACE,type FreeFaceBuffers,type FreeFacePalette} from './cityStudioFreeOpeningGeometry.ts';
import {STUDIO_FAMILIES} from './cityStudioCatalog.ts';
import {cutRoofOpeningFaces,resolveRoofOpeningLayouts,slopePlan,slopePoint,ROOF_OPENING,type RoofOpeningKind,type RoofOpeningLayout,type RoofSlope} from './cityStudioRoofOpenings.ts';
import type {StudioBox,StudioFamily,StudioRecipe,StudioRoofEdge,StudioRoofFace,StudioRoofSettings} from './cityStudioTypes.ts';

export type RoofOpeningChannel='wall'|'trim'|'frame'|'glass'|'roof'|'flashing';
export const ROOF_OPENING_CHANNELS:RoofOpeningChannel[]=['wall','trim','frame','glass','roof','flashing'];
export type RoofOpeningGeometry=Record<RoofOpeningChannel,FreeFaceBuffers>&{triangles:number};
export type StudioRoofOpeningPart={partId:string;family:StudioFamily;wallColor:string;wallTexture?:string;finish?:StudioRoofSettings['finish'];color?:string;openings:{id:string;kind:RoofOpeningKind;center:[number,number,number]}[];geometry:RoofOpeningGeometry};
export type RoofOpeningPass={faces:StudioRoofFace[];keepEdge:(e:StudioRoofEdge)=>boolean;parts:StudioRoofOpeningPart[];inactive:{id:string;reason:string}[];blockers:StudioBox[]};

type P2=[number,number];type V3=[number,number,number];type Rgb=[number,number,number];
type Buf={p:number[];n:number[];uv:number[];i:number[];d:number[]|null;c:number[]|null};
const buf=(distance=false,colors=false):Buf=>({p:[],n:[],uv:[],i:[],d:distance?[]:null,c:colors?[]:null});
const FAR=FREE_FACE.maxDistance;
const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit=(a:V3):V3=>{const l=Math.hypot(...a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
const rgb=(hex:string):Rgb=>{const c=new Color(hex);return [c.r,c.g,c.b];};
function vert(b:Buf,p:V3,n:V3,c?:Rgb,d=FAR){b.p.push(...p);b.n.push(...n);b.uv.push(p[0]+p[2],p[1]);b.d?.push(d);if(b.c)b.c.push(...(c??[1,1,1] as Rgb));return b.p.length/3-1;}
/** Planar convex polygon; winding follows `facing` (flat normal). Degenerate input is skipped. */
function poly(b:Buf,pts:V3[],facing:V3,c?:Rgb,d=FAR){
 let n:V3=[0,0,0];for(let i=0;i<pts.length;i++){const a=pts[i],q=pts[(i+1)%pts.length];n=[n[0]+(a[1]-q[1])*(a[2]+q[2]),n[1]+(a[2]-q[2])*(a[0]+q[0]),n[2]+(a[0]-q[0])*(a[1]+q[1])];}
 if(Math.hypot(...n)<1e-10)return;const f=unit(facing),order=dot(n,f)<0?[...pts].reverse():pts,ids=order.map(p=>vert(b,p,f,c,d));
 for(let i=1;i+1<ids.length;i++){const a=order[0],u=sub(order[i],a),v=sub(order[i+1],a);if(Math.hypot(...cross(u,v))<1e-10)continue;b.i.push(ids[0],ids[i],ids[i+1]);}
}
/** Extrude a 2D ring (u,v) along w through an affine map to building space. */
function prism(b:Buf,ring:P2[],map:(u:number,v:number,w:number)=>V3,w0:number,w1:number,c?:Rgb,d=FAR){
 const area=ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0);if(Math.abs(area)<1e-8||w1-w0<1e-5)return;
 const r=area>0?ring:[...ring].reverse(),W=sub(map(0,0,1),map(0,0,0));
 for(const t of ShapeUtils.triangulateShape(r.map(p=>new Vector2(p[0],p[1])),[])){
  poly(b,t.map(i=>map(r[i][0],r[i][1],w1)),W,c,d);poly(b,t.map(i=>map(r[i][0],r[i][1],w0)),[-W[0],-W[1],-W[2]],c,d);
 }
 r.forEach((a,i)=>{const q=r[(i+1)%r.length],l=Math.hypot(q[0]-a[0],q[1]-a[1]);if(l<1e-6)return;const nu=(q[1]-a[1])/l,nv=-(q[0]-a[0])/l;
  poly(b,[map(a[0],a[1],w0),map(q[0],q[1],w0),map(q[0],q[1],w1),map(a[0],a[1],w1)],sub(map(a[0]+nu,a[1]+nv,w0),map(a[0],a[1],w0)),c,d);});
}
/** Append free-face buffers through a rigid transform (positions and normals). */
function append(b:Buf,src:FreeFaceBuffers,place:(p:V3)=>V3,rot:(n:V3)=>V3,wear=1){
 const base=b.p.length/3,count=src.positions.length/3;
 for(let k=0;k<count;k++){const p=place([src.positions[k*3],src.positions[k*3+1],src.positions[k*3+2]]);b.p.push(...p);b.n.push(...rot([src.normals[k*3],src.normals[k*3+1],src.normals[k*3+2]]));b.uv.push(src.uvs[k*2],src.uvs[k*2+1]);
  b.d?.push(Math.min(FAR,(src.distance?.[k]??FAR)*wear));if(b.c){if(src.colors)b.c.push(src.colors[k*3],src.colors[k*3+1],src.colors[k*3+2]);else b.c.push(1,1,1);}}
 for(const i of src.indices)b.i.push(base+i);
}
const pack=(b:Buf):FreeFaceBuffers=>({positions:new Float32Array(b.p),normals:new Float32Array(b.n),uvs:new Float32Array(b.uv),indices:new Uint32Array(b.i),...(b.d?{distance:new Float32Array(b.d)}:{}),...(b.c?{colors:new Float32Array(b.c)}:{})});
type Bufs=Record<RoofOpeningChannel,Buf>;
const bufs=():Bufs=>({wall:buf(true),trim:buf(false,true),frame:buf(false,true),glass:buf(),roof:buf(),flashing:buf()});

/** Box in the slope frame: x along the eave, q uphill (plan), n along the roof normal. */
function slopeBox(b:Buf,s:RoofSlope,x0:number,x1:number,q0:number,q1:number,n0:number,n1:number,c?:Rgb){
 if(x1-x0<1e-4||q1-q0<1e-4)return;const P=(x:number,q:number,n:number)=>slopePoint(s,x,q,n),N:V3=[s.k*s.g[0]/s.m,1/s.m,s.k*s.g[1]/s.m],E:V3=[-s.g[0]/s.m,s.k/s.m,-s.g[1]/s.m],T:V3=[s.t[0],0,s.t[1]],neg=(v:V3):V3=>[-v[0],-v[1],-v[2]];
 poly(b,[P(x0,q0,n1),P(x1,q0,n1),P(x1,q1,n1),P(x0,q1,n1)],N,c);poly(b,[P(x0,q0,n0),P(x1,q0,n0),P(x1,q1,n0),P(x0,q1,n0)],neg(N),c);
 poly(b,[P(x0,q1,n0),P(x1,q1,n0),P(x1,q1,n1),P(x0,q1,n1)],E,c);poly(b,[P(x0,q0,n0),P(x1,q0,n0),P(x1,q0,n1),P(x0,q0,n1)],neg(E),c);
 poly(b,[P(x1,q0,n0),P(x1,q1,n0),P(x1,q1,n1),P(x1,q0,n1)],T,c);poly(b,[P(x0,q0,n0),P(x0,q1,n0),P(x0,q1,n1),P(x0,q0,n1)],neg(T),c);
}
/** Rectangular ring of slope boxes between an outer and an inner rectangle. */
function slopeRing(b:Buf,s:RoofSlope,o:[number,number,number,number],i:[number,number,number,number],n0:number,n1:number,c?:Rgb){
 slopeBox(b,s,o[0],o[1],o[2],i[2],n0,n1,c);slopeBox(b,s,o[0],o[1],i[3],o[3],n0,n1,c);slopeBox(b,s,o[0],i[0],i[2],i[3],n0,n1,c);slopeBox(b,s,i[1],o[1],i[2],i[3],n0,n1,c);
}
const SKY_FRAME=rgb('#3f4846'),SKY_SASH=rgb('#52605c');

function buildSkylight(g:Bufs,l:RoofOpeningLayout){
 const s=l.slope,[x0,x1,q0,q1]=[l.hole[0][0],l.hole[1][0],l.hole[0][1],l.hole[2][1]],f=ROOF_OPENING.frame,m=s.m;
 const outer:[number,number,number,number]=[x0-f,x1+f,q0-f/m,q1+f/m],inner:[number,number,number,number]=[x0+.06,x1-.06,q0+.06/m,q1-.06/m];
 slopeRing(g.frame,s,outer,inner,-.06,.12,SKY_FRAME);
 const c=f+.1;slopeRing(g.flashing,s,[x0-c,x1+c,q0-c/m,q1+c/m],outer,-.02,.03);
 const n=.06,N:V3=[s.k*s.g[0]/m,1/m,s.k*s.g[1]/m];
 poly(g.glass,[slopePoint(s,inner[0],inner[2],n),slopePoint(s,inner[1],inner[2],n),slopePoint(s,inner[1],inner[3],n),slopePoint(s,inner[0],inner[3],n)],N);
 if((q1-q0)*m>1.25){const c=(q0+q1)/2;slopeBox(g.frame,s,inner[0],inner[1],c-.03/m,c+.03/m,.03,.1,SKY_SASH);}
 if(x1-x0>1.25){const c=(x0+x1)/2;slopeBox(g.frame,s,c-.03,c+.03,inner[2],inner[3],.03,.1,SKY_SASH);}
}

function buildDormer(g:Bufs,l:RoofOpeningLayout,palette:FreeFacePalette,trimTone:Rgb){
 const s=l.slope,d=l.dormer!,xc=l.xc,q0=l.qc,k=s.k,T=ROOF_OPENING.wall,drop=ROOF_OPENING.drop,th=ROOF_OPENING.panel,xe=d.hw+ROOF_OPENING.side,ovf=ROOF_OPENING.front;
 const D=(x:number,y:number,dq:number):V3=>{const p=slopePlan(s,xc+x,q0+dq);return [p[0],y,p[1]];};
 const Dn=(nx:number,ny:number,nq:number):V3=>unit([nx*s.t[0]-nq*s.g[0],ny,nx*s.t[1]-nq*s.g[1]]);
 const hw=d.hw,y0=d.y0,yTop=y0+d.H,yR=yTop+d.rise,yRt=yR+th,mg=d.roof==='gable'?d.rise/hw:0,ks=d.ks;
 // Front wall: the free opening wall with one window, its skin on the front line.
 const w=2*hw,Hf=d.H+drop,res=resolveFreeOpenings({length:w,height:Hf,ground:false},[{id:l.o.id,x:w/2,bottom:drop+.3,width:Math.max(.5,w-.8),height:Math.max(.5,d.H-.55),shape:d.shape,style:'painted',glazing:true}]);
 const face=buildFreeOpeningFaceGeometry({length:w,height:Hf,thickness:T},res.groups,palette);
 const place=(p:V3)=>D(-hw+p[0],y0-drop+p[1],T/2-p[2]),rot=(n:V3):V3=>[n[0]*s.t[0]+n[2]*s.g[0],n[1],n[0]*s.t[1]+n[2]*s.g[1]];
 // A narrower wear band than full walls: dormer fronts are small, keep plaster around the window.
 for(const ch of ['wall','trim','frame','glass'] as const)append(g[ch],face[ch],place,rot,ch==='wall'?2.2:1);
 append(g.frame,face.door,place,rot);
 // Gable end above the front wall, then the two cheeks (lower edge below the slope).
 if(d.rise>0)prism(g.wall,[[-hw,yTop],[hw,yTop],[0,yR]],(u,v,wv)=>D(u,v,wv),0,T);
 const ce=(d.H+drop)/(k-ks);
 if(ce>T+.05)for(const [a,b] of [[hw-T,hw],[-hw,-hw+T]])prism(g.wall,[[T,y0-drop+k*T],[ce,y0-drop+k*ce],[T,yTop+ks*T]],(u,v,wv)=>D(wv,v,u),a,b);
 // Roof panels: top surfaces meet the main slope along the valleys.
 if(d.roof==='gable'){
  const yE=yRt-mg*xe,back=d.meet(xe),ridge=d.meet(0);
  for(const sg of [-1,1]){const x=sg*xe;
   poly(g.roof,[D(0,yRt,-ovf),D(x,yE,-ovf),D(x,yE,back),D(0,yRt,ridge)],Dn(sg*mg,1,0));
   poly(g.roof,[D(0,yRt-th,-ovf),D(x,yE-th,-ovf),D(x,yE-th,back),D(0,yRt-th,ridge)],Dn(-sg*mg,-1,0));
   poly(g.roof,[D(x,yE,-ovf),D(x,yE,back),D(x,yE-th,back),D(x,yE-th,-ovf)],Dn(sg,0,0));
   poly(g.roof,[D(0,yRt,-ovf),D(x,yE,-ovf),D(x,yE-th,-ovf),D(0,yRt-th,-ovf)],Dn(0,0,-1));
  }
  // Verge boards follow the front edges; a ridge cap runs back into the slope.
  const xb=xe+.02,top=(x:number)=>yRt+.02-mg*Math.abs(x),bot=(x:number)=>yRt-.17-mg*Math.abs(x);
  prism(g.trim,[[-xb,bot(xb)],[0,bot(0)],[xb,bot(xb)],[xb,top(xb)],[0,top(0)],[-xb,top(xb)]],(u,v,wv)=>D(u,v,wv),-ovf-.045,-ovf+.01,trimTone);
  const cy=yRt-mg*.09;prism(g.roof,[[-.09,cy-.005],[.09,cy-.005],[.09,cy+.03],[0,yRt+.045],[-.09,cy+.03]],(u,v,wv)=>D(u,v,wv),-ovf-.05,ridge+.06/k);
 }else{
  const back=d.meet(0),yt=(dq:number)=>yTop+th+ks*dq;
  poly(g.roof,[D(-xe,yt(-ovf),-ovf),D(xe,yt(-ovf),-ovf),D(xe,yt(back),back),D(-xe,yt(back),back)],Dn(0,1,-ks));
  poly(g.roof,[D(-xe,yt(-ovf)-th,-ovf),D(xe,yt(-ovf)-th,-ovf),D(xe,yt(back)-th,back),D(-xe,yt(back)-th,back)],Dn(0,-1,ks));
  for(const sg of [-1,1])poly(g.roof,[D(sg*xe,yt(-ovf),-ovf),D(sg*xe,yt(back),back),D(sg*xe,yt(back)-th,back),D(sg*xe,yt(-ovf)-th,-ovf)],Dn(sg,0,0));
  poly(g.roof,[D(-xe,yt(-ovf),-ovf),D(xe,yt(-ovf),-ovf),D(xe,yt(-ovf)-th,-ovf),D(-xe,yt(-ovf)-th,-ovf)],Dn(0,0,-1));
  const f0=-ovf-.045;prism(g.trim,[[-xe-.045,yt(f0)-th-.07],[xe+.045,yt(f0)-th-.07],[xe+.045,yt(f0)+.02],[-xe-.045,yt(f0)+.02]],(u,v,wv)=>D(u,v,wv),f0,-ovf+.01,trimTone);
  for(const [a,b] of [[xe,xe+.045],[-xe-.045,-xe]])prism(g.trim,[[f0,yt(f0)-th-.07],[back,yt(back)-th-.07],[back,yt(back)+.02],[f0,yt(f0)+.02]],(u,v,wv)=>D(wv,v,u),a,b,trimTone);
 }
 // Lead flashing: soakers along both cheeks and an apron in front of the wall.
 const de=d.H/(k-ks)+.1;
 slopeBox(g.flashing,s,xc+hw-.02,xc+hw+.1,q0-.02,q0+de,-.02,.03);slopeBox(g.flashing,s,xc-hw-.1,xc-hw+.02,q0-.02,q0+de,-.02,.03);
 slopeBox(g.flashing,s,xc-hw-.1,xc+hw+.1,q0-.14/s.m,q0+.02,-.02,.03);
}

const finishOf=(r:StudioRecipe,id:string)=>({...r.studio.defaults,...r.studio.parts[id],finishes:{...r.studio.defaults.finishes,...r.studio.parts[id]?.finishes}});
/** Cut the roof faces and build every active opening. A no-op when the recipe has none. */
export function studioRoofOpeningPass(r:StudioRecipe,faces:StudioRoofFace[]):RoofOpeningPass{
 if(!r.studio.roofOpenings?.length)return {faces,keepEdge:()=>true,parts:[],inactive:[],blockers:[]};
 const {layouts,inactive}=resolveRoofOpeningLayouts(r,faces),cut=cutRoofOpeningFaces(faces,layouts),byPart=new Map<string,{g:Bufs;layouts:RoofOpeningLayout[]}>(),blockers:StudioBox[]=[];
 for(const l of layouts){let entry=byPart.get(l.o.partId);if(!entry){entry={g:bufs(),layouts:[]};byPart.set(l.o.partId,entry);}entry.layouts.push(l);}
 const parts:StudioRoofOpeningPart[]=[];
 for(const [partId,{g,layouts:list}] of byPart){
  const style=finishOf(r,partId),family=style.family??'pastel-stucco',tones=STUDIO_FAMILIES[family],settings={finish:'slate' as const,...r.studio.defaults.roofSettings,...r.studio.parts[partId]?.roofSettings};
  const trim=style.finishes.trim?.color??tones.trim,palette:FreeFacePalette={...DEFAULT_FREE_PALETTE,painted:{trim,frame:style.finishes.frame?.color??'#f4f0e6'},door:tones.door};
  const openings:StudioRoofOpeningPart['openings']=[];
  for(const l of list){
   if(l.dormer){buildDormer(g,l,palette,rgb(trim));const d=l.dormer,c=slopePlan(l.slope,l.xc,l.qc+(d.depth-ROOF_OPENING.front)/2),top=d.y0+d.H+d.rise+ROOF_OPENING.panel;
    blockers.push({id:`roof-opening/${l.o.id}`,x:c[0],y:(d.y0+top)/2,z:c[1],width:2*d.hw,height:top-d.y0,depth:d.depth+ROOF_OPENING.front,rotation:Math.atan2(l.slope.g[0],l.slope.g[1])});
    openings.push({id:l.o.id,kind:'dormer',center:slopePoint(l.slope,l.xc,l.qc+d.depth/2,d.H/2)});}
   else{buildSkylight(g,l);openings.push({id:l.o.id,kind:'skylight',center:slopePoint(l.slope,l.xc,l.qc,.06)});}
  }
  const geometry=Object.fromEntries(Object.entries(g).map(([k,b])=>[k,pack(b)])) as Record<RoofOpeningChannel,FreeFaceBuffers>;
  parts.push({partId,family,wallColor:style.finishes.wall?.color??tones.wall,...(style.finishes.wall?.texture?{wallTexture:style.finishes.wall.texture}:{}),finish:settings.finish,...(settings.color?{color:settings.color}:{}),openings,geometry:{...geometry,triangles:Object.values(geometry).reduce((n,b)=>n+b.indices.length/3,0)}});
 }
 return {faces:cut.faces,keepEdge:cut.keepEdge,parts,inactive,blockers};
}
/** resolveStudio hook: report openings, add dormer blockers and return the render payload. */
export function applyStudioRoofOpenings(r:StudioRecipe,roof:{faces?:StudioRoofFace[];openings?:RoofOpeningPass},inactive:{id:string;reason:string}[],blockers:StudioBox[]):StudioRoofOpeningPart[]|undefined{
 const list=r.studio.roofOpenings??[];if(!list.length)return undefined;
 if(!roof.faces||!roof.openings){for(const o of list)inactive.push({id:o.id,reason:'Enable connected roof editing to add roof openings.'});return undefined;}
 inactive.push(...roof.openings.inactive);blockers.push(...roof.openings.blockers);
 return roof.openings.parts.length?roof.openings.parts:undefined;
}
