/**
 * Interior stairs (docs/city-stairs-entrances.md): straight, L with a quarter landing, U / dog-leg with a half landing,
 * spiral and an enclosed switch-back core. Local studio data only (recipe v6 `interior.stairs`).
 *
 * Frame of one stair: the placed point is where you step on (the centre of the first riser, or the walk line of a
 * spiral); `rotation` points up the main flight (local +v, world (sin r, cos r)); local +u is the climber's left.
 * Every shape is a sequence of flights ("legs") joined by landings:
 *  - a quarter landing turns left or right (L, side entries, side exits);
 *  - a half landing turns back into a parallel flight beside the first (U, core), with a 0.12 m well between them;
 *  - `entry: 'left'|'right'` prepends a three-riser side flight and a quarter landing (you approach from that side);
 *  - `exit: 'left'|'right'` ends on a landing at the upper floor level that you leave sideways.
 * `flip` turns L, U, core and spiral stairs the other way.
 *
 * Geometry follows a 0.19 m maximum riser and a 0.27 m going (spirals 0.22 m on the walk line). Walking surfaces are
 * ramps along the tread midpoints (half a riser at each end), so the character climbs smoothly and never floats
 * more than half a riser. The upper slab is cut only where standing on the stair would leave less than 2.05 m to
 * its underside; guards then surround that stairwell on the floor above except where the stair arrives.
 */
import polygonClipping from 'polygon-clipping';
import type {MultiPolygon} from 'polygon-clipping';
import type {SculptPolygon} from './citySculpt.ts';
import type {StudioDeck,StudioInteriorBlock,StudioInteriorStair} from './cityStudioTypes.ts';
import {RAIL_STYLES,StairworkBuilder,railing,type RailStyle,type StairworkMaterial,type StudioStairwork,type V3} from './cityStudioRailings.ts';

export const STAIR_SHAPES=['straight','l','u','spiral','core'] as const;
export type StairShape=typeof STAIR_SHAPES[number];
export const STAIR_SHAPE_LABELS:Record<StairShape,string>={straight:'Straight',l:'L with quarter landing',u:'U / dog-leg',spiral:'Spiral',core:'Switch-back core'};
export type StairEntry='front'|'left'|'right';
export type StairExit='ahead'|'left'|'right';
export const STAIR={riserMax:.19,going:.27,width:1,minWidth:.8,maxWidth:1.6,gap:.12,headroom:2.05,slab:.2,zone:1,margin:.08,spiralRadius:1,spiralColumn:.1,spiralAngle:.36,spiralWalk:.62,minStorey:2.3} as const;
/** Old saved layouts keep working: 'switchback' was the two-flight return stair, now the U. */
export const stairShapeOf=(layout:StudioInteriorStair['layout']):StairShape|null=>layout==='auto'?null:layout==='switchback'?'u':layout;
/** 'auto' tries these in order. */
export const AUTO_SHAPES:readonly StairShape[]=['straight','u','l','spiral'];
export const stairRail=(s:Pick<StudioInteriorStair,'rail'>):RailStyle=>s.rail??'timber';
const FINISH:Record<RailStyle,{tread:StairworkMaterial;riser:StairworkMaterial;stringer:StairworkMaterial;landing:StairworkMaterial}>={
 timber:{tread:'oak',riser:'paint',stringer:'paint',landing:'oak'},iron:{tread:'oak',riser:'oak',stringer:'iron',landing:'oak'},
 glass:{tread:'stone',riser:'stone',stringer:'steel',landing:'stone'},steel:{tread:'concrete',riser:'concrete',stringer:'steel',landing:'concrete'},
 stone:{tread:'stone',riser:'stone',stringer:'stone',landing:'stone'},
};

type P2=[number,number];
const add=(a:P2,b:P2):P2=>[a[0]+b[0],a[1]+b[1]],mul=(a:P2,k:number):P2=>[a[0]*k,a[1]*k],neg=(a:P2):P2=>[-a[0],-a[1]];
/** Left of a heading in (u, v): +v's left is +u. */
const left=(d:P2):P2=>[d[1],-d[0]];
export type StairSegment=[[number,number],[number,number]];
export type StairFitContext={lower:SculptPolygon[];upper:SculptPolygon[];low:number;top:number;floor:number;upperHeight:number;lowerPartitions:StairSegment[];upperPartitions:StairSegment[]};
export type StairFit={
 reason?:string;shape:StairShape;
 /** upper slab cut (building-local) */void:MultiPolygon;
 /** everything the stair stands on at the lower floor (flights, landings, zones excluded) */footprint:MultiPolygon;
 decks:StudioDeck[];blockers:import('./cityStudioTypes.ts').StudioBox[];work:StudioStairwork;walls:StudioInteriorBlock[];
 /** open edges of the void where the stair arrives on the floor above (no guard) */exits:StairSegment[];
 style:RailStyle;core:boolean;
 /** walking route from the entry zone to the exit zone (tests, the placement ghost) */route:V3[];
 entry:{x:number;z:number;dx:number;dz:number};exit:{x:number;z:number;dx:number;dz:number};
 /** clear zones in front of the first riser (lower floor) and past the arrival (upper floor) */zones:{entry:[number,number][];exit:[number,number][]};
 riser:number;going:number;risers:number;
};
const fail=(shape:StairShape,reason:string):StairFit=>({reason,shape,void:[],footprint:[],decks:[],blockers:[],work:{id:'',floor:0,kind:'stair',boxes:[],cyls:[],parts:[],meshes:[]},walls:[],exits:[],style:'timber',core:false,route:[],entry:{x:0,z:0,dx:0,dz:1},exit:{x:0,z:0,dx:0,dz:1},zones:{entry:[],exit:[]},riser:0,going:0,risers:0});

const ringContains=(x:number,z:number,ring:[number,number][])=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
export const polygonsContain=(polygons:SculptPolygon[],x:number,z:number)=>polygons.some(p=>ringContains(x,z,p[0])&&!p.slice(1).some(h=>ringContains(x,z,h)));
const multiContains=(m:MultiPolygon,x:number,z:number)=>m.some(p=>ringContains(x,z,p[0] as [number,number][])&&!p.slice(1).some(h=>ringContains(x,z,h as [number,number][])));
const segmentDistance=(x:number,z:number,a:[number,number],b:[number,number])=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);};
const q=(v:number,step:number)=>Math.round(v/step)*step;
const ringOf=(pts:[number,number][]):MultiPolygon=>{const r=pts.map(p=>[q(p[0],1e-4),q(p[1],1e-4)] as [number,number]);return [[[...r,r[0]]]];};
const snapMulti=(m:MultiPolygon,step:number):MultiPolygon=>m.map(p=>p.map(r=>r.map(v=>[q(v[0],step),q(v[1],step)] as [number,number])));
/** Union of stair pieces. polygon-clipping can fail on nearly coincident edges (turned frames): retry on coarser grids. */
const union=(parts:MultiPolygon[]):MultiPolygon=>{const list=parts.filter(p=>p.length);for(const step of [1e-4,1e-3,5e-3]){try{return list.map(p=>snapMulti(p,step)).reduce<MultiPolygon>((acc,p)=>acc.length?polygonClipping.union(acc,p):p,[]);}catch{/* next grid */}}return list[0]??[];};

type Flight={c:P2;d:P2;k:number;y0:number;run:number};
type Landing={pts:P2[];y:number;top?:boolean};
/**
 * Fit one stair. Returns the geometry, or `reason` (a readable refusal) when it does not fit, lacks headroom or
 * cannot reach the floor above. `shape` must be concrete (resolve 'auto' by trying AUTO_SHAPES).
 */
export function fitInteriorStair(stair:StudioInteriorStair,shape:StairShape,ctx:StairFitContext):StairFit{
 const rise=ctx.top-ctx.low;if(rise<STAIR.minStorey)return fail(shape,'This storey is too low for a stair.');
 const style=RAIL_STYLES.includes(stair.rail as RailStyle)?stair.rail as RailStyle:'timber',W=Math.min(STAIR.maxWidth,Math.max(STAIR.minWidth,stair.width??STAIR.width)),r=stair.rotation;
 const toWorld=(p:P2):[number,number]=>[stair.x+Math.cos(r)*p[0]+Math.sin(r)*p[1],stair.z-Math.sin(r)*p[0]+Math.cos(r)*p[1]];
 const angleOf=(d:P2)=>{const w=toWorld(d),o=toWorld([0,0]);return Math.atan2(w[0]-o[0],w[1]-o[1]);};
 const W3=(p:P2,y:number):V3=>{const w=toWorld(p);return [w[0],y,w[1]];};
 const n=Math.ceil(rise/STAIR.riserMax-1e-9),h=rise/n;
 if(shape==='spiral')return fitSpiral(stair,ctx,style,n,h,toWorld,W3);
 const g=STAIR.going,flip=stair.flip?-1:1,core=shape==='core';
 const entry:StairEntry=core?'front':stair.entry??'front',exit:StairExit=core?'ahead':stair.exit??'ahead';
 // Legs and turns.
 let legs:number[],turns:({kind:'q'|'h'|'top';s:number}|null)[];
 if(shape==='straight'){legs=[n];turns=[null];}
 else {const a=Math.ceil(n/2);legs=[a,n-a];turns=[{kind:shape==='l'?'q':'h',s:flip},null];}
 let d0:P2=[0,1];
 if(entry!=='front'){const s=entry==='left'?1:-1;d0=s>0?neg(left([0,1])):left([0,1]);legs=[3,legs[0]-3,...legs.slice(1)];turns=[{kind:'q',s},...turns];}
 if(exit!=='ahead')turns[turns.length-1]={kind:'top',s:exit==='left'?1:-1};
 if(legs.some(k=>k<2))return fail(shape,'This storey is too low for that stair shape.');
 const flights:Flight[]=[],landings:Landing[]=[],chainL:V3[]=[],chainR:V3[]=[];
 const pushStart=(chain:V3[],p:P2,y:number)=>{const last=chain.at(-1);if(last){const w=toWorld(p);if(Math.hypot(last[0]-w[0],last[2]-w[1])>1e-3&&Math.abs(last[1]-y)>1e-3)chain.push(W3(p,last[1]));}chain.push(W3(p,y));};
 let c:P2=[0,0],d:P2=d0,y=ctx.low,arrival:StairSegment|null=null,exitDir:P2=[0,1],exitMid:P2=[0,0];
 for(let i=0;i<legs.length;i++){
  const k=legs[i],run=(k-1)*g,end=add(c,mul(d,run)),l=left(d);
  flights.push({c,d,k,y0:y,run});
  const Ls=add(c,mul(l,W/2)),Rs=add(c,mul(l,-W/2)),Le=add(end,mul(l,W/2)),Re=add(end,mul(l,-W/2));
  pushStart(chainL,Ls,y+h);chainL.push(W3(Le,y+k*h));pushStart(chainR,Rs,y+h);chainR.push(W3(Re,y+k*h));
  y+=k*h;const t=turns[i];
  if(!t){arrival=[toWorld(add(end,mul(l,W/2+STAIR.margin))),toWorld(add(end,mul(l,-W/2-STAIR.margin)))];exitDir=d;exitMid=end;break;}
  if(t.kind==='q'){const Rf=add(Re,mul(d,W)),Lf=add(Le,mul(d,W));landings.push({pts:[Le,Re,Rf,Lf],y});
   if(t.s>0)chainR.push(W3(Rf,y),W3(Lf,y));else chainL.push(W3(Lf,y),W3(Rf,y));
   const nd=t.s>0?l:neg(l);c=add(add(end,mul(d,W/2)),mul(nd,W/2));d=nd;continue;}
  if(t.kind==='h'){const lo=t.s>0?-W/2:-(W/2+STAIR.gap+W),hi=t.s>0?W/2+STAIR.gap+W:W/2,A=add(end,mul(l,lo)),B=add(end,mul(l,hi));landings.push({pts:[A,B,add(B,mul(d,W)),add(A,mul(d,W))],y});
   if(t.s>0)chainR.push(W3(add(A,mul(d,W)),y),W3(add(B,mul(d,W)),y));else chainL.push(W3(add(B,mul(d,W)),y),W3(add(A,mul(d,W)),y));
   c=add(end,mul(l,t.s*(W+STAIR.gap)));d=neg(d);continue;}
  // Top landing at the upper floor level, left sideways.
  const Rf=add(Re,mul(d,W)),Lf=add(Le,mul(d,W));landings.push({pts:[Le,Re,Rf,Lf],y,top:true});
  const m=STAIR.margin;
  if(t.s>0){chainR.push(W3(Rf,y),W3(Lf,y));arrival=[toWorld(add(add(Le,mul(l,m)),mul(d,-m))),toWorld(add(add(Lf,mul(l,m)),mul(d,m)))];exitDir=l;exitMid=add(add(end,mul(d,W/2)),mul(l,W/2));}
  else {chainL.push(W3(Lf,y),W3(Rf,y));arrival=[toWorld(add(add(Rf,mul(l,-m)),mul(d,m))),toWorld(add(add(Re,mul(l,-m)),mul(d,-m)))];exitDir=neg(l);exitMid=add(add(end,mul(d,W/2)),mul(l,-W/2));}
  break;
 }
 if(!arrival)return fail(shape,'This stair could not reach the floor above.');
 // Footprint on the lower floor (flights and landings, with room for rails) and the upper slab void (headroom).
 const rect=(c0:P2,d:P2,from:number,to:number,half:number):[number,number][]=>{const l=left(d);return [add(add(c0,mul(d,from)),mul(l,-half)),add(add(c0,mul(d,to)),mul(l,-half)),add(add(c0,mul(d,to)),mul(l,half)),add(add(c0,mul(d,from)),mul(l,half))].map(toWorld);};
 const grow=(pts:P2[],by:number)=>{const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length;return pts.map(p=>{const dx=p[0]-cx,dz=p[1]-cz,l=Math.hypot(dx,dz)||1;return [p[0]+dx/l*by*1.414,p[1]+dz/l*by*1.414] as P2;});};
 const half=W/2+STAIR.margin,underside=ctx.top-STAIR.slab,cutFrom=underside-STAIR.headroom;
 const footprint=union([...flights.map(f=>ringOf(rect(f.c,f.d,-.02,Math.max(f.run,.05)+.02,half))),...landings.map(l=>ringOf(grow(l.pts,STAIR.margin).map(toWorld)))]);
 const cuts:MultiPolygon[]=[];
 for(const f of flights){let j=1;while(j<f.k&&f.y0+j*h<=cutFrom)j++;if(f.y0+j*h<=cutFrom&&f.y0+f.k*h<=cutFrom)continue;const from=Math.max(-.02,(j-1)*g-.3);cuts.push(ringOf(rect(f.c,f.d,from,f.run+.001,half)));}
 for(const l of landings)if(l.y>cutFrom)cuts.push(ringOf(grow(l.pts,STAIR.margin).map(toWorld)));
 const voidShape=union(cuts);
 const b=new StairworkBuilder(stair.id,ctx.floor,'stair'),fin=FINISH[style];b.work.label=shape;
 // Fit: inside this floor, under the floor above, clear zones at both ends, headroom.
 const fitRects:[number,number][][]=[...flights.map(f=>rect(f.c,f.d,-.02,Math.max(f.run,.05)+.02,W/2+.05)),...landings.map(l=>grow(l.pts,.05).map(toWorld))];
 const inset=(pts:[number,number][],by:number)=>{const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length;return pts.map(p=>{const dx=cx-p[0],dz=cz-p[1],l=Math.hypot(dx,dz)||1;return [p[0]+dx/l*by,p[1]+dz/l*by] as [number,number];});};
 const edgePoints=(pts:[number,number][])=>pts.flatMap((p,i)=>{const e=pts[(i+1)%pts.length];return [p,[(p[0]+e[0])/2,(p[1]+e[1])/2] as [number,number]];});
 if(fitRects.some(q=>edgePoints(inset(q,.02)).some(p=>!polygonsContain(ctx.lower,p[0],p[1]))))return fail(shape,'The stair does not fit within this floor.');
 for(const poly of voidShape)for(const ring of poly)for(const p of inset(ring.slice(0,-1) as [number,number][],.04))if(!polygonsContain(ctx.upper,p[0],p[1]))return fail(shape,'The stair must stay under the floor above.');
 const entryZone=rect([0,0],d0,-STAIR.zone,-.02,W/2),exitZone=rect(exitMid,exitDir,STAIR.margin+.02,STAIR.margin+STAIR.zone,W/2);
 if(inset(entryZone,.05).some(p=>!polygonsContain(ctx.lower,p[0],p[1])))return fail(shape,'Needs clear floor space at the bottom of the stair.');
 if(inset(exitZone,.05).some(p=>!polygonsContain(ctx.upper,p[0],p[1])||multiContains(voidShape,p[0],p[1])))return fail(shape,'Needs clear floor space where the stair arrives.');
 // Headroom over every tread and landing: the slab above (outside the void) and the stair itself.
 const surfaces:{pts:[number,number][];y:number}[]=[...flights.flatMap(f=>Array.from({length:f.k-1},(_,j)=>({pts:rect(f.c,f.d,j*g,(j+1)*g,W/2),y:f.y0+(j+1)*h}))),...landings.map(l=>({pts:l.pts.map(toWorld),y:l.y}))];
 {const worst=stairHeadroom(surfaces,(x,z)=>multiContains(voidShape,x,z),underside);if(worst.clearance<STAIR.headroom-.005)return fail(shape,`Not enough headroom over the stair (${worst.clearance.toFixed(2)} m); move or turn it.`);}
 // Walking surfaces: tread-midpoint ramps, flat landings, the arrival zone.
 flights.forEach((f,i)=>{if(f.k<2)return;const m=toWorld(add(f.c,mul(f.d,f.run/2)));b.deck({id:`${stair.id}/ramp${i}`,x:m[0],z:m[1],y:f.y0+h/2,width:W,depth:f.run,rotation:angleOf(f.d),rise:(f.k-1)*h});});
 landings.forEach((l,i)=>{const cx=(l.pts[0][0]+l.pts[2][0])/2,cz=(l.pts[0][1]+l.pts[2][1])/2,m=toWorld([cx,cz]),e=[l.pts[1][0]-l.pts[0][0],l.pts[1][1]-l.pts[0][1]],f=[l.pts[3][0]-l.pts[0][0],l.pts[3][1]-l.pts[0][1]];b.deck({id:`${stair.id}/landing${l.top?'-top':i}`,x:m[0],z:m[1],y:l.y,width:Math.hypot(e[0],e[1]),depth:Math.hypot(f[0],f[1]),rotation:angleOf(f as P2),rise:0});});
 {const m=toWorld(add(exitMid,mul(exitDir,STAIR.zone/2)));b.deck({id:`${stair.id}/upper`,x:m[0],z:m[1],y:ctx.top,width:W,depth:STAIR.zone,rotation:angleOf(exitDir),rise:0});}
 // Treads, risers, stringers and landings.
 for(const f of flights){const l=left(f.d),ry=angleOf(f.d);
  for(let j=1;j<f.k;j++){const t=toWorld(add(f.c,mul(f.d,(j-.5)*g-.015)));b.box(fin.tread,[t[0],f.y0+j*h-.02,t[1]],[W,.04,g+.03],ry);}
  for(let j=1;j<=f.k;j++){const p=toWorld(add(f.c,mul(f.d,(j-1)*g+.012)));b.box(fin.riser,[p[0],f.y0+(j-.5)*h-.02,p[1]],[W-.02,h-.04,.02],ry);}
  if(f.k>=2)for(const s of [-1,1]){const a=add(add(f.c,mul(f.d,.5*g)),mul(l,s*(W/2+.03))),e=add(add(f.c,mul(f.d,f.run)),mul(l,s*(W/2+.03)));b.beam(fin.stringer,W3(a,f.y0+1.5*h-.16),W3(e,f.y0+f.k*h-.16),.05,.3);}
 }
 for(const l of landings){const cx=(l.pts[0][0]+l.pts[2][0])/2,cz=(l.pts[0][1]+l.pts[2][1])/2,m=toWorld([cx,cz]),e=[l.pts[1][0]-l.pts[0][0],l.pts[1][1]-l.pts[0][1]],f=[l.pts[3][0]-l.pts[0][0],l.pts[3][1]-l.pts[0][1]];b.box(fin.landing,[m[0],l.y-.08,m[1]],[Math.hypot(e[0],e[1])+.04,.16,Math.hypot(f[0],f[1])+.04],angleOf(f as P2));
  if(!l.top&&l.y-ctx.low>.6)for(const p of [l.pts[1],l.pts[2],l.pts[3],l.pts[0]]){const w=toWorld(p),inner=flights.some(fl=>{const q=[p[0]-fl.c[0],p[1]-fl.c[1]],along=q[0]*fl.d[0]+q[1]*fl.d[1],across=Math.abs(q[0]*left(fl.d)[0]+q[1]*left(fl.d)[1]);return along>-.01&&along<fl.run+.01&&across<W/2+.01;});if(!inner)b.box(fin.stringer==='iron'?'iron':fin.stringer,[w[0],ctx.low+(l.y-.16-ctx.low)/2,w[1]],[.08,l.y-.16-ctx.low,.08]);}}
 // Rails: each side chain splits into runs against walls (wall handrails) and free runs (balustrades).
 const walls:StudioInteriorBlock[]=[];
 const nearWall=(a:V3,e:V3,o:1|-1)=>{const dx=e[0]-a[0],dz=e[2]-a[2],l=Math.hypot(dx,dz);if(l<1e-3)return false;const nx=dz/l*o,nz=-dx/l*o,mx=(a[0]+e[0])/2,mz=(a[2]+e[2])/2,upper=Math.min(a[1],e[1])>=ctx.top-.01,polys=upper?ctx.upper:ctx.lower,parts=upper?ctx.upperPartitions:ctx.lowerPartitions;return !polygonsContain(polys,mx+nx*.22,mz+nz*.22)||parts.some(w=>segmentDistance(mx+nx*.2,mz+nz*.2,w[0],w[1])<.16);};
 // A chain follows the walking direction; the left chain's outside is to its left (world left of (dx, dz) is (dz, -dx)).
 let runIndex=0;
 const runChain=(chain:V3[],side:'L'|'R',forceWall:boolean)=>{
  const o:1|-1=side==='L'?1:-1;let run:V3[]=[chain[0]],wall=false,first=true;
  const flush=(end:boolean)=>{if(run.length>=2){if(wall)railing(b,`${stair.id}/rail${side}${runIndex++}`,run,style,{wall:true});else railing(b,`${stair.id}/rail${side}${runIndex++}`,run,style,{newelStart:first,newelEnd:end});}first=false;};
  for(let i=0;i+1<chain.length;i++){const w=forceWall||nearWall(chain[i],chain[i+1],o);if(i===0)wall=w;if(w!==wall){flush(false);run=[chain[i]];wall=w;}run.push(chain[i+1]);}
  flush(true);
 };
 // Core: the outer chain runs along the enclosure walls (wall handrail); the inner well keeps its balustrade.
 const outerSide=core?(turns[0]&&turns[0].s>0?'R':'L'):null;
 runChain(chainL,'L',outerSide==='L');runChain(chainR,'R',outerSide==='R');
 if(style==='timber'&&!core&&chainL.length&&chainR.length){/* a volute curls off the bottom of the open handrail */}
 if(core){
  // Enclosure on the lower floor: long sides and the far end of the U; the entry end stays open.
  const f0=flights[0],l0=left(f0.d),s=turns[0]?.s??1,lo=s>0?-W/2-STAIR.margin:-(W/2+STAIR.gap+W)-STAIR.margin,hi=s>0?W/2+STAIR.gap+W+STAIR.margin:W/2+STAIR.margin,far=f0.run+W+STAIR.margin,height=ctx.top-STAIR.slab-ctx.low;
  const wall=(id:string,a:P2,e:P2)=>{const A=toWorld(a),E=toWorld(e),m=[(A[0]+E[0])/2,(A[1]+E[1])/2],len=Math.hypot(E[0]-A[0],E[1]-A[1]);walls.push({id:`${stair.id}/core/${id}`,floor:ctx.floor,kind:'wall',x:m[0],z:m[1],y:ctx.low+height/2,width:len,height,depth:.12,rotation:Math.atan2(-(E[1]-A[1]),E[0]-A[0])});};
  const P=(u:number,v:number)=>add(add(f0.c,mul(l0,u)),mul(f0.d,v));
  wall('far',P(lo-.06,far+.06),P(hi+.06,far+.06));wall('lo',P(lo-.06,.3),P(lo-.06,far+.06));wall('hi',P(hi+.06,.3),P(hi+.06,far+.06));
 }
 // Route for tests and the ghost: entry zone → each flight → landings → exit zone.
 const route:V3[]=[W3(mul(d0,-.7),ctx.low)];
 flights.forEach((f,i)=>{route.push(W3(add(f.c,mul(f.d,-.05)),f.y0),W3(add(f.c,mul(f.d,f.run+W/2)),f.y0+f.k*h));const l=landings[i];if(l&&!l.top){const cx=(l.pts[0][0]+l.pts[2][0])/2,cz=(l.pts[0][1]+l.pts[2][1])/2;route.push(W3([cx,cz],l.y));}});
 route.push(W3(add(exitMid,mul(exitDir,.75)),ctx.top));
 const ew=toWorld(add(exitMid,mul(exitDir,.4))),e0=toWorld(exitMid),en=toWorld(mul(d0,-.4)),o=toWorld([0,0]);
 return {shape,void:voidShape,footprint,decks:b.decks,blockers:b.blockers,work:b.finish(),walls,exits:[arrival],style,core,route,entry:{x:en[0],z:en[1],dx:o[0]-en[0],dz:o[1]-en[1]},exit:{x:e0[0],z:e0[1],dx:ew[0]-e0[0],dz:ew[1]-e0[1]},zones:{entry:entryZone,exit:exitZone},riser:h,going:g,risers:n};
}

function fitSpiral(stair:StudioInteriorStair,ctx:StairFitContext,style:RailStyle,n:number,h:number,toWorld:(p:P2)=>[number,number],W3:(p:P2,y:number)=>V3):StairFit{
 const R=STAIR.spiralRadius,rw=STAIR.spiralWalk,s=stair.flip?-1:1,theta=STAIR.spiralAngle,d0:P2=[0,1],e1=mul(left(d0),-s),C=mul(left(d0),s*rw),fin=FINISH[style];
 const at=(radius:number,a:number):P2=>add(C,add(mul(e1,Math.cos(a)*radius),mul(d0,Math.sin(a)*radius)));
 const sweepEnd=(n-1)*theta,landingEnd=sweepEnd+Math.PI/2;
 const circle:[number,number][]=Array.from({length:32},(_,i)=>toWorld(at(R+.06,i/32*Math.PI*2)));
 const voidShape=ringOf(circle),footprint=ringOf(Array.from({length:32},(_,i)=>toWorld(at(R+.03,i/32*Math.PI*2))));
 for(const [x,z] of circle)if(!polygonsContain(ctx.lower,x,z))return fail('spiral','The stair does not fit within this floor.');
 for(const [x,z] of circle)if(!polygonsContain(ctx.upper,x,z))return fail('spiral','The stair must stay under the floor above.');
 // Headroom where the spiral passes over itself: one turn must climb at least the headroom plus the tread.
 const perTurn=(Math.PI*2/theta)*h;if(landingEnd>Math.PI*2&&perTurn-STAIR.slab<STAIR.headroom)return fail('spiral',`Not enough headroom where the spiral passes over itself (${(perTurn-STAIR.slab).toFixed(2)} m).`);
 const exitMidA=sweepEnd+Math.PI/4,exitOut=at(R+.06+STAIR.zone/2,exitMidA),exitZoneC=exitOut,radial=(a:number):P2=>add(mul(e1,Math.cos(a)),mul(d0,Math.sin(a)));
 const ez=(()=>{const dv=radial(exitMidA),l=left(dv),c0=at(R+.06,exitMidA);return [add(add(c0,mul(l,-.45)),mul(dv,.02)),add(add(c0,mul(l,-.45)),mul(dv,STAIR.zone)),add(add(c0,mul(l,.45)),mul(dv,STAIR.zone)),add(add(c0,mul(l,.45)),mul(dv,.02))].map(toWorld);})();
 const entryZone=[add(mul(left(d0),-.45),mul(d0,-STAIR.zone)),add(mul(left(d0),-.45),mul(d0,-.02)),add(mul(left(d0),.45),mul(d0,-.02)),add(mul(left(d0),.45),mul(d0,-STAIR.zone))].map(toWorld);
 for(const [x,z] of ez)if(!polygonsContain(ctx.upper,x,z))return fail('spiral','Needs clear floor space where the stair arrives.');
 for(const [x,z] of entryZone)if(!polygonsContain(ctx.lower,x,z))return fail('spiral','Needs clear floor space at the bottom of the stair.');
 const b=new StairworkBuilder(stair.id,ctx.floor,'stair');b.work.label='spiral';
 const wedge=(a0:number,a1:number,r0:number,r1:number):[number,number][]=>{const pts:[number,number][]=[toWorld(at(r0,a0))];for(let k=0;k<=3;k++)pts.push(toWorld(at(r1,a0+(a1-a0)*k/3)));pts.push(toWorld(at(r0,a1)));return pts;};
 for(let j=1;j<n;j++){const a0=(j-1)*theta,a1=j*theta+.04,y=ctx.low+j*h,pts=wedge(a0,a1,STAIR.spiralColumn,R);{const cx=pts.reduce((a,p)=>a+p[0],0)/pts.length,cz=pts.reduce((a,p)=>a+p[1],0)/pts.length;// A plane through the tread's middle rising along the walk line (half a riser up to each neighbour), so large plots (scaled up) never need a whole-riser step.
  const am=(j-.5)*theta,pm=toWorld(at(rw,am)),o=toWorld([0,0]),tw=toWorld(add(mul(e1,-Math.sin(am)),mul(d0,Math.cos(am)))),tx=tw[0]-o[0],tz=tw[1]-o[1],k=h/(theta*rw);
  b.deck({id:`${stair.id}/ramp/t${j}`,x:cx,z:cz,y,width:.8,depth:.8,rotation:0,polygon:[pts.map(p=>[p[0],p[1]] as [number,number])],plane:[k*tx,k*tz,y-k*(pm[0]*tx+pm[1]*tz)]});}
  b.prism(fin.tread,pts.map(p=>[p[0],y,p[1]] as V3),[0,-.05,0]);}
 {const pts=wedge(sweepEnd,landingEnd,STAIR.spiralColumn,R+.06),poly:[number,number][]=[];for(let k=0;k<=8;k++)poly.push(toWorld(at(R+.06,sweepEnd+(landingEnd-sweepEnd)*k/8)));poly.push(toWorld(at(STAIR.spiralColumn,landingEnd)),toWorld(at(STAIR.spiralColumn,sweepEnd)));
  b.deck({id:`${stair.id}/landing-top`,x:pts[2][0],z:pts[2][1],y:ctx.top,width:0,depth:0,rotation:0,polygon:[poly]});b.prism(fin.landing,poly.map(p=>[p[0],ctx.top,p[1]] as V3),[0,-.16,0]);}
 {const o=toWorld(C);b.cyl(style==='timber'?'oak':style==='stone'?'stone':'steel',[o[0],ctx.low,o[1]],[o[0],ctx.top+1,o[1]],style==='stone'||style==='timber'?.1:.06);b.blocker(`${stair.id}/column`,[o[0],(ctx.low+ctx.top+1)/2,o[1]],[.2,ctx.top+1-ctx.low,.2],0);}
 const exitDeck=toWorld(exitZoneC);b.deck({id:`${stair.id}/upper`,x:exitDeck[0],z:exitDeck[1],y:ctx.top,width:.9,depth:STAIR.zone,rotation:0,rise:0});
 // Outer handrail: from the first tread to the last, leaving the top landing's arc open (the exit).
 const rail:V3[]=[];for(let j=1;j<n;j++)rail.push(W3(at(R-.05,(j-1)*theta+.02),ctx.low+j*h),W3(at(R-.05,j*theta-.02),ctx.low+j*h));
 const smooth:V3[]=rail.filter((_,i)=>i%2===1).map((p,i,all)=>i<all.length-1?[p[0],(p[1]+all[i+1][1])/2,p[2]] as V3:p);smooth.unshift(rail[0]);
 railing(b,`${stair.id}/rail`,smooth,style,{newelStart:true});
 const exitArc:StairSegment[]=[];for(let k=0;k<8;k++)exitArc.push([toWorld(at(R+.06,sweepEnd+(landingEnd-sweepEnd)*k/8)),toWorld(at(R+.06,sweepEnd+(landingEnd-sweepEnd)*(k+1)/8))]);
 const route:V3[]=[W3(mul(d0,-.7),ctx.low),W3([0,0],ctx.low)];for(let j=1;j<n;j+=2)route.push(W3(at(rw,(j-.5)*theta),ctx.low+j*h));route.push(W3(at(rw+.1,sweepEnd+Math.PI/4),ctx.top));route.push(W3(exitZoneC,ctx.top));
 const e0=toWorld(at(R+.06,exitMidA)),ew=toWorld(at(R+.5,exitMidA)),en=toWorld(mul(d0,-.4)),o=toWorld([0,0]);
 return {shape:'spiral',void:voidShape,footprint,decks:b.decks,blockers:b.blockers,work:b.finish(),walls:[],exits:exitArc,style,core:false,route,entry:{x:en[0],z:en[1],dx:o[0]-en[0],dz:o[1]-en[1]},exit:{x:e0[0],z:e0[1],dx:ew[0]-e0[0],dz:ew[1]-e0[1]},zones:{entry:entryZone,exit:ez},riser:h,going:theta*rw,risers:n};
}

/**
 * The least headroom over a set of walking surfaces (treads, landings): the slab underside above wherever the floor
 * above is not open (`open`), and any higher surface of the same stair (less its slab thickness).
 */
export function stairHeadroom(surfaces:{pts:[number,number][];y:number}[],open:(x:number,z:number)=>boolean,underside:number){
 let worst={clearance:Infinity,x:0,z:0};
 for(const s of surfaces){const cx=s.pts.reduce((a,p)=>a+p[0],0)/s.pts.length,cz=s.pts.reduce((a,p)=>a+p[1],0)/s.pts.length;
  const probes:[number,number][]=[[cx,cz],...s.pts.map(p=>{const dx=cx-p[0],dz=cz-p[1],l=Math.hypot(dx,dz)||1,k=Math.min(.12,l*.5);return [p[0]+dx/l*k,p[1]+dz/l*k] as [number,number];})];
  for(const [x,z] of probes){let ceiling=open(x,z)?Infinity:underside;for(const o of surfaces)if(o!==s&&o.y>s.y+.05&&ringContains(x,z,o.pts))ceiling=Math.min(ceiling,o.y-STAIR.slab);if(ceiling-s.y<worst.clearance)worst={clearance:ceiling-s.y,x,z};}}
 return worst;
}

/** Fit an intent: its shape, or the first 'auto' candidate that fits. */
export function fitStairIntent(stair:StudioInteriorStair,ctx:StairFitContext):StairFit{
 const shape=stairShapeOf(stair.layout);if(shape)return fitInteriorStair(stair,shape,ctx);
 let last:StairFit|null=null;for(const candidate of AUTO_SHAPES){last=fitInteriorStair(stair,candidate,ctx);if(!last.reason)return last;}
 return last!;
}

/**
 * Guards (or, for a stair core, walls) around one stair's opening on the floor above: every void edge that has floor
 * beside it, except where the stair arrives (`fit.exits`), outside walls and other stairwells.
 */
export function stairwellGuards(id:string,fit:StairFit,ctx:StairFitContext&{otherVoids:MultiPolygon[]}){
 const b=new StairworkBuilder(`${id}/well`,ctx.floor+1,'guard'),walls:StudioInteriorBlock[]=[],y=ctx.top;
 const onExit=(x:number,z:number)=>fit.exits.some(([a,e])=>segmentDistance(x,z,a,e)<.05);
 const runs:V3[][]=[];
 for(const poly of fit.void)for(const ring of poly){
  const pts=ring.slice(0,-1) as [number,number][];let run:V3[]=[];
  // Densify each edge so partial edges (a U's arrival lane) split cleanly.
  const samples:{p:[number,number];guard:boolean}[]=[];
  for(let i=0;i<pts.length;i++){const a=pts[i],e=pts[(i+1)%pts.length],len=Math.hypot(e[0]-a[0],e[1]-a[1]),steps=Math.max(1,Math.ceil(len/.1));for(let k=0;k<steps;k++){const t=(k+.5)/steps,x=a[0]+(e[0]-a[0])*t,z=a[1]+(e[1]-a[1])*t,nx=-(e[1]-a[1])/(len||1),nz=(e[0]-a[0])/(len||1),probe=multiContains(fit.void,x+nx*.05,z+nz*.05)?-1:1,ox=x+nx*.25*probe,oz=z+nz*.25*probe;
   const guard=!onExit(x,z)&&polygonsContain(ctx.upper,ox,oz)&&!ctx.otherVoids.some(v=>multiContains(v,ox,oz))&&!ctx.upperPartitions.some(w=>segmentDistance(x,z,w[0],w[1])<.12);
   samples.push({p:[a[0]+(e[0]-a[0])*k/steps,a[1]+(e[1]-a[1])*k/steps],guard});}}
  // Rotate so we start at a gap (if any) and collect guarded runs.
  const startAt=samples.findIndex(s=>!s.guard),order=startAt<0?samples:[...samples.slice(startAt),...samples.slice(0,startAt)];
  for(let i=0;i<order.length;i++){const s=order[i],next=order[(i+1)%order.length];if(s.guard){if(!run.length)run.push([s.p[0],y,s.p[1]]);run.push([next.p[0],y,next.p[1]]);}else if(run.length){runs.push(run);run=[];}}
  if(run.length){if(startAt<0)run.push(run[0]);runs.push(run);}
 }
 const simplify=(run:V3[])=>run.filter((p,i)=>{if(i===0||i===run.length-1)return true;const a=run[i-1],c=run[i+1],cross=(p[0]-a[0])*(c[2]-a[2])-(p[2]-a[2])*(c[0]-a[0]);return Math.abs(cross)>1e-4;});
 runs.map(simplify).forEach((run,k)=>{
  if(fit.core){for(let i=0;i+1<run.length;i++){const a=run[i],e=run[i+1],len=Math.hypot(e[0]-a[0],e[2]-a[2]);if(len<.05)continue;const height=ctx.upperHeight-STAIR.slab;walls.push({id:`${id}/core-up/${k}/${i}`,floor:ctx.floor+1,kind:'wall',x:(a[0]+e[0])/2,z:(a[2]+e[2])/2,y:y+height/2,width:len+.12,height,depth:.12,rotation:Math.atan2(-(e[2]-a[2]),e[0]-a[0])});}return;}
  railing(b,`${id}/well/${k}`,run,fit.style,{});
 });
 return {work:b.finish(),blockers:b.blockers,walls};
}
