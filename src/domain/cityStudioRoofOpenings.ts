/**
 * Tiny Glade-style roof openings (local studio proof of concept): skylights cut into a
 * pitched roof slope and dormers that project out of it, placed anywhere on the slope.
 *
 * Storage (`studio.roofOpenings`, local plots only):
 *  {id, partId, facing, tier?, u, v, width, height, kind:'skylight'|'dormer', roof?:'gable'|'flat'|'shed', shape?:'rect'|'arch'}
 * Face descriptor: a roof slope is its part plus the plan direction its surface drains to
 * (`facing`, whole degrees, 0 = +z, 90 = +x) and, when one part has several slopes that
 * drain the same way (gambrel), the `tier` counted from the eave. Roof planes are axis
 * aligned per part, so rise, overhang, eave, connection and gable/hip/half-hip edits keep
 * the descriptor; turning the ridge, choosing a flat roof or removing the part reports
 * the opening inactive instead. `u` runs along the eave (viewer right, looking up the
 * slope), `v` from the lowest (0) to the highest (1) point of the slope's plan extent.
 * Skylights store their centre; dormers the centre of the front wall's sill line.
 * `width` is along the eave; `height` is the skylight length along the slope or the
 * dormer's front wall height. Stored intent is never moved: resolution clamps the drawn
 * position and reports openings that cannot fit as inactive with a reason.
 *
 * UI API (all in building-local coordinates; `faces` = preparedStudioPlot(plot.id)?.result.roofFaces,
 * which stay uncut by the openings, so they are stable while openings are edited):
 *  roofFaceRayHit(faces,origin,direction) -> {face,point,distance}|null   nearest roof plane hit (opening holes ignored)
 *  roofOpeningHitFromFace(recipe,design,faces,point) -> RoofOpeningHit|null
 *  placeRoofOpening(recipe,design,faces,hit,preset) -> {recipe,id,opening}|{reason}   centres the preset on the hit
 *  nudgeRoofOpening(recipe,design,faces,id,change) -> {recipe,opening}|{reason}
 *    change: {dx?,dy?} metres (along the eave / up the slope) or absolute {u?,v?}, plus {width?,height?,roof?,shape?}
 *  removeRoofOpening(recipe,id) -> recipe
 *  roofOpeningAtHit(recipe,design,faces,hit) -> StudioRoofOpening|null   (a ray through a dormer lands on the slope inside its footprint)
 *  roofOpeningGhost(recipe,design,faces,hit,preset) -> RoofOpeningGhost|null   translucent preview triangles + outline
 */
import polygonClipping from 'polygon-clipping';
import type {MultiPolygon,Polygon} from 'polygon-clipping';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioRecipe,StudioRoofEdge,StudioRoofFace} from './cityStudioTypes.ts';

export const ROOF_OPENING_KINDS=['skylight','dormer'] as const;
export const ROOF_OPENING_ROOFS=['gable','flat','shed'] as const;
export const ROOF_OPENING_SHAPES=['rect','arch'] as const;
export type RoofOpeningKind=typeof ROOF_OPENING_KINDS[number];
export type RoofOpeningRoof=typeof ROOF_OPENING_ROOFS[number];
export type RoofOpeningShape=typeof ROOF_OPENING_SHAPES[number];
export type StudioRoofOpening={id:string;partId:string;facing:number;tier?:number;u:number;v:number;width:number;height:number;kind:RoofOpeningKind;roof?:RoofOpeningRoof;shape?:RoofOpeningShape};
export type RoofOpeningPreset={kind:RoofOpeningKind;width:number;height:number;roof?:RoofOpeningRoof;shape?:RoofOpeningShape;id?:string};
/**
 * Tuning (metres): edge margin, spacing, dormer minimum slope (tan ~20deg) and window
 * height, wall thickness, drop of dormer walls below the slope, roof panel thickness,
 * side/front dormer overhangs, skylight frame/flashing widths.
 */
export const ROOF_OPENING={limit:24,minSize:.4,maxWidth:6,maxHeight:4,edge:.3,gap:.15,dormerSlope:.36,dormerHeight:1.1,wall:.2,drop:.15,panel:.1,side:.12,front:.15,frame:.07,flashing:.2,grab:.08} as const;
export const ROOF_OPENING_PRESETS:readonly {id:string;label:string;preset:RoofOpeningPreset}[]=[
 {id:'skylight',label:'Skylight',preset:{kind:'skylight',width:.9,height:1.3}},
 {id:'gable-dormer',label:'Gable dormer',preset:{kind:'dormer',roof:'gable',width:1.7,height:1.45,shape:'rect'}},
 {id:'shed-dormer',label:'Wide shed dormer',preset:{kind:'dormer',roof:'shed',width:3.4,height:1.35,shape:'rect'}},
 {id:'arched-dormer',label:'Arched dormer',preset:{kind:'dormer',roof:'gable',width:1.6,height:1.7,shape:'arch'}},
];

type P2=[number,number];type V3=[number,number,number];
const KEYS=['id','partId','facing','tier','u','v','width','height','kind','roof','shape'];
const idOk=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=100&&!['__proto__','constructor','prototype'].includes(v);
const finite=(n:unknown,lo:number,hi:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
export function validateRoofOpenings(list:unknown):string|null{
 if(list===undefined)return null;
 if(!Array.isArray(list)||list.length>ROOF_OPENING.limit)return 'This building has reached its roof opening limit.';
 const ids=new Set<string>();
 for(const o of list as Record<string,unknown>[]){
  if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!KEYS.includes(k)))return 'A roof opening is invalid.';
  if(!idOk(o.id)||ids.has(o.id as string)||!idOk(o.partId))return 'A roof opening is invalid.';ids.add(o.id as string);
  if(!finite(o.facing,0,359.999)||o.tier!==undefined&&(!Number.isInteger(o.tier)||!finite(o.tier,0,3))||!finite(o.u,0,1)||!finite(o.v,0,1))return 'A roof opening is invalid.';
  if(!finite(o.width,ROOF_OPENING.minSize,ROOF_OPENING.maxWidth)||!finite(o.height,ROOF_OPENING.minSize,ROOF_OPENING.maxHeight))return 'A roof opening is outside the supported size.';
  if(!ROOF_OPENING_KINDS.includes(o.kind as RoofOpeningKind))return 'A roof opening is invalid.';
  if((o.roof!==undefined||o.shape!==undefined)&&o.kind!=='dormer'||o.roof!==undefined&&!ROOF_OPENING_ROOFS.includes(o.roof as RoofOpeningRoof)||o.shape!==undefined&&!ROOF_OPENING_SHAPES.includes(o.shape as RoofOpeningShape))return 'A roof opening is invalid.';
 }
 return null;
}

// ---- Slopes: roof faces grouped by part and plane, with an eave-aligned frame ----
export type RoofSlope={key:string;partId:string;plane:V3;k:number;m:number;g:P2;t:P2;facing:number;tier:number;region:MultiPolygon;local:MultiPolygon;x0:number;x1:number;q0:number;q1:number;faces:StudioRoofFace[]};
/** Plan point -> slope-local (x along the eave, q uphill in plan metres). */
export const slopeLocal=(s:Pick<RoofSlope,'g'|'t'>,p:P2):P2=>[p[0]*s.t[0]+p[1]*s.t[1],-(p[0]*s.g[0]+p[1]*s.g[1])];
export const slopePlan=(s:Pick<RoofSlope,'g'|'t'>,x:number,q:number):P2=>[x*s.t[0]-q*s.g[0],x*s.t[1]-q*s.g[1]];
/** Point on the slope surface (x,q local), lifted `n` metres along its normal. */
export function slopePoint(s:Pick<RoofSlope,'g'|'t'|'plane'|'k'|'m'>,x:number,q:number,n=0):V3{
 const p=slopePlan(s,x,q),y=s.plane[2]+s.k*q;
 return [p[0]+n*s.k*s.g[0]/s.m,y+n/s.m,p[1]+n*s.k*s.g[1]/s.m];
}
const angle=(a:number,b:number)=>{const d=Math.abs(((a-b)%360+540)%360-180);return d;};
const ringArea=(r:P2[])=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
export const multiArea=(m:MultiPolygon)=>m.reduce((s,poly)=>s+poly.reduce((t,ring,i)=>t+(i?-1:1)*Math.abs(ringArea(ring as P2[])),0),0);
const openRing=(ring:P2[]):P2[]=>{const out=ring.map(p=>[Math.round(p[0]*1e8)/1e8,Math.round(p[1]*1e8)/1e8] as P2).filter((p,i,all)=>!i||p[0]!==all[i-1][0]||p[1]!==all[i-1][1]);if(out.length>1&&out[0][0]===out.at(-1)![0]&&out[0][1]===out.at(-1)![1])out.pop();return out;};
const slopeCache=new WeakMap<StudioRoofFace[],RoofSlope[]>();
/** Sloped roof planes of the resolved (uncut) faces. Cached per faces array. */
export function studioRoofSlopes(faces:StudioRoofFace[]):RoofSlope[]{
 const cached=slopeCache.get(faces);if(cached)return cached;
 const groups=new Map<string,StudioRoofFace[]>();
 for(const f of faces){if(Math.hypot(f.plane[0],f.plane[1])<.05)continue;const key=`${f.partId}|${f.plane.map(n=>n.toFixed(5)).join(',')}`;groups.set(key,[...(groups.get(key)??[]),f]);}
 const slopes:RoofSlope[]=[];
 for(const [key,list] of groups){
  const plane=list[0].plane,k=Math.hypot(plane[0],plane[1]),g:P2=[-plane[0]/k,-plane[1]/k],t:P2=[g[1],-g[0]];
  let region:MultiPolygon;try{region=list.length===1?[list[0].polygon as Polygon]:polygonClipping.union(list[0].polygon as Polygon,...list.slice(1).map(f=>f.polygon as Polygon));}catch{region=list.map(f=>f.polygon as Polygon);}
  const local=region.map(poly=>poly.map(ring=>openRing(ring as P2[]).map(p=>slopeLocal({g,t},p)))) as MultiPolygon,pts=local.flat(2) as unknown as P2[];
  if(!pts.length)continue;
  slopes.push({key,partId:list[0].partId,plane,k,m:Math.hypot(1,k),g,t,facing:(Math.round(Math.atan2(g[0],g[1])*180/Math.PI)+360)%360,tier:0,region,local,x0:Math.min(...pts.map(p=>p[0])),x1:Math.max(...pts.map(p=>p[0])),q0:Math.min(...pts.map(p=>p[1])),q1:Math.max(...pts.map(p=>p[1])),faces:list});
 }
 // Tiers: slopes of one part that drain the same way, counted from the lowest.
 const height=(s:RoofSlope)=>{const pts=s.local.flat(2) as unknown as P2[];return s.plane[2]+s.k*pts.reduce((a,p)=>a+p[1],0)/pts.length;};
 for(const s of slopes)s.tier=slopes.filter(o=>o.partId===s.partId&&angle(o.facing,s.facing)<=12&&height(o)<height(s)-1e-6).length;
 slopeCache.set(faces,slopes);return slopes;
}
export function findRoofSlope(slopes:RoofSlope[],partId:string,facing:number,tier=0):RoofSlope|null{
 const same=slopes.filter(s=>s.partId===partId&&angle(s.facing,facing)<=12).sort((a,b)=>angle(a.facing,facing)-angle(b.facing,facing));
 return same.find(s=>s.tier===tier)??null;
}

// ---- Layout: fitted footprint, roof hole and dormer dimensions for one opening ----
export type DormerDims={roof:RoofOpeningRoof;shape:RoofOpeningShape;hw:number;H:number;ks:number;rise:number;y0:number;depth:number;meet:(x:number)=>number;under:(x:number)=>number};
export type RoofOpeningLayout={o:StudioRoofOpening;slope:RoofSlope;xc:number;qc:number;clamped:boolean;footprint:P2[];hole:P2[];dormer?:DormerDims;length?:number};
const settingsOf=(r:StudioRecipe,id:string)=>({overhang:.2,...r.studio.defaults.roofSettings,...r.studio.parts[id]?.roofSettings});
export const roofOpeningMargin=(r:StudioRecipe,partId:string)=>Math.max(ROOF_OPENING.edge,settingsOf(r,partId).overhang+.15);
/** Dormer geometry in its local frame: x' across (0 = centre), dq uphill from the front wall line. */
export function dormerDims(s:Pick<RoofSlope,'k'|'plane'>,o:Pick<StudioRoofOpening,'width'|'height'|'roof'|'shape'>,q0:number):DormerDims{
 const roof=o.roof??'gable',hw=o.width/2,H=o.height,ks=roof==='shed'?Math.min(.3,s.k*.3):0,rise=roof==='gable'?hw*.8:0,th=ROOF_OPENING.panel,mg=roof==='gable'?rise/hw:0;
 // meet(x'): where the panel top meets the slope; under(x'): where its underside meets it.
 const meet=(x:number)=>roof==='gable'?(H+rise+th-mg*Math.abs(x))/s.k:(H+th)/(s.k-ks),under=(x:number)=>roof==='gable'?(H+rise-mg*Math.abs(x))/s.k:H/(s.k-ks);
 return {roof,shape:o.shape??'rect',hw,H,ks,rise,y0:s.plane[2]+s.k*q0,depth:meet(0),meet,under};
}
function dormerFootprint(d:DormerDims):P2[]{
 const xe=d.hw+ROOF_OPENING.side,f=-ROOF_OPENING.front;
 return d.roof==='gable'?[[-xe,f],[xe,f],[xe,d.meet(xe)],[0,d.meet(0)],[-xe,d.meet(xe)]]:[[-xe,f],[xe,f],[xe,d.meet(0)],[-xe,d.meet(0)]];
}
function dormerHole(d:DormerDims):P2[]{
 const hi=d.hw-ROOF_OPENING.wall/2-.02,f=ROOF_OPENING.wall/2;
 return d.roof==='gable'?[[-hi,f],[hi,f],[hi,d.under(hi)-.12],[0,d.under(0)-.12],[-hi,d.under(hi)-.12]]:[[-hi,f],[hi,f],[hi,d.under(0)-.12],[-hi,d.under(0)-.12]];
}
/** Offset a convex polygon outward by `e` (orientation independent). */
export function inflateConvex(ring:P2[],e:number):P2[]{
 const r=ringArea(ring)>0?ring:[...ring].reverse();
 return r.map((p,i)=>{const a=r[(i+r.length-1)%r.length],b=r[(i+1)%r.length],al=Math.hypot(p[0]-a[0],p[1]-a[1])||1,bl=Math.hypot(b[0]-p[0],b[1]-p[1])||1;
  const n:P2=[(p[1]-a[1])/al,-(p[0]-a[0])/al],m:P2=[(b[1]-p[1])/bl,-(b[0]-p[0])/bl],s=e/Math.max(.2,1+n[0]*m[0]+n[1]*m[1]);return [p[0]+(n[0]+m[0])*s,p[1]+(n[1]+m[1])*s] as P2;});
}
const shift=(ring:P2[],x:number,q:number)=>ring.map(p=>[p[0]+x,p[1]+q] as P2);
const outside=(ring:P2[],region:MultiPolygon)=>{try{return multiArea(polygonClipping.difference([ring],region))>1e-4;}catch{return true;}};
/** Fit one opening on its slope. `x`/`q` override the stored centre (used by placement). */
export function layoutRoofOpening(r:StudioRecipe,slope:RoofSlope,o:StudioRoofOpening,at?:{x:number;q:number}):RoofOpeningLayout|{reason:string}{
 const e=roofOpeningMargin(r,o.partId),span=slope.x1-slope.x0,rise=slope.q1-slope.q0;
 let xc=at?.x??slope.x0+o.u*span,qc=at?.q??slope.q0+o.v*rise,clamped=false;
 const skylight=o.kind==='skylight',lp=o.height/slope.m;
 if(!skylight&&slope.k<ROOF_OPENING.dormerSlope)return {reason:'This slope is too shallow for a dormer.'};
 if(!skylight&&o.height<ROOF_OPENING.dormerHeight)return {reason:'This dormer is too low for a window.'};
 // The margin-inflated footprint at the origin decides the clamp range.
 const hole0:P2[]=[[-o.width/2,-lp/2],[o.width/2,-lp/2],[o.width/2,lp/2],[-o.width/2,lp/2]],probe=skylight?null:dormerDims(slope,o,0);
 const guard=inflateConvex(skylight?hole0:dormerFootprint(probe!),e),gx=guard.map(p=>p[0]),gq=guard.map(p=>p[1]);
 const [lx,hx,lq,hq]=[Math.min(...gx),Math.max(...gx),Math.min(...gq),Math.max(...gq)];
 if(span<hx-lx)return {reason:skylight?'This roof slope is too narrow for that opening.':'This roof slope is too narrow for that dormer.'};
 if(rise<hq-lq)return {reason:skylight?'This roof slope is too short for that skylight.':'This slope is too shallow for a dormer this tall.'};
 const clamp=(v:number,lo:number,hi:number)=>{const c=Math.max(lo,Math.min(hi,v));if(Math.abs(c-v)>1e-9)clamped=true;return c;};
 xc=clamp(xc,slope.x0-lx,slope.x1-hx);qc=clamp(qc,slope.q0-lq,slope.q1-hq);
 if(outside(shift(guard,xc,qc),slope.local))return {reason:skylight?'Not enough roof here for that opening.':'Not enough roof here for that dormer.'};
 if(skylight){const hole=shift(hole0,xc,qc);return {o,slope,xc,qc,clamped,hole,footprint:inflateConvex(hole,ROOF_OPENING.flashing),length:o.height};}
 const dormer=dormerDims(slope,o,qc);
 return {o,slope,xc,qc,clamped,footprint:shift(dormerFootprint(dormer),xc,qc),hole:shift(dormerHole(dormer),xc,qc),dormer};
}
const overlaps=(a:P2[],b:P2[])=>{try{return multiArea(polygonClipping.intersection([inflateConvex(a,ROOF_OPENING.gap/2)],[inflateConvex(b,ROOF_OPENING.gap/2)]))>1e-6;}catch{return true;}};
const roofType=(r:StudioRecipe,id:string)=>r.studio.parts[id]?.roof??r.studio.defaults.roof??'flat';
/** Resolve every stored roof opening against the uncut roof faces. Later openings lose overlaps. */
export function resolveRoofOpeningLayouts(r:StudioRecipe,faces:StudioRoofFace[]):{layouts:RoofOpeningLayout[];inactive:{id:string;reason:string}[]}{
 const list=r.studio.roofOpenings??[],layouts:RoofOpeningLayout[]=[],inactive:{id:string;reason:string}[]=[];if(!list.length)return {layouts,inactive};
 const slopes=studioRoofSlopes(faces);
 for(const o of list){
  if(!r.volumes.some(v=>v.id===o.partId&&v.operation==='add')){inactive.push({id:o.id,reason:'This part no longer exists.'});continue;}
  const type=roofType(r,o.partId),own=slopes.filter(s=>s.partId===o.partId);
  if(type==='flat'||type==='terrace'||!own.length){inactive.push({id:o.id,reason:'Roof openings need a pitched roof.'});continue;}
  const slope=findRoofSlope(slopes,o.partId,o.facing,o.tier??0);if(!slope){inactive.push({id:o.id,reason:'This roof slope no longer exists.'});continue;}
  const fit=layoutRoofOpening(r,slope,o);if('reason' in fit){inactive.push({id:o.id,reason:fit.reason});continue;}
  if(layouts.some(l=>l.slope===slope&&overlaps(l.footprint,fit.footprint))){inactive.push({id:o.id,reason:'Too close to another roof opening.'});continue;}
  layouts.push(fit);
 }
 return {layouts,inactive};
}
/** Roof faces with the opening holes cut out (in plan), and a filter for trims along the holes. */
export function cutRoofOpeningFaces(faces:StudioRoofFace[],layouts:RoofOpeningLayout[]):{faces:StudioRoofFace[];holes:P2[][];keepEdge:(e:StudioRoofEdge)=>boolean}{
 if(!layouts.length)return {faces,holes:[],keepEdge:()=>true};
 const byFace=new Map<StudioRoofFace,P2[][]>(),holes:P2[][]=[];
 for(const l of layouts){const plan=l.hole.map(p=>slopePlan(l.slope,p[0],p[1]));holes.push(plan);for(const f of l.slope.faces)byFace.set(f,[...(byFace.get(f)??[]),plan]);}
 const out:StudioRoofFace[]=[];
 for(const f of faces){const cut=byFace.get(f);if(!cut){out.push(f);continue;}
  let pieces:MultiPolygon;try{pieces=polygonClipping.difference([f.polygon as Polygon],...cut.map(h=>[h] as Polygon));}catch{out.push(f);continue;}
  for(const poly of pieces){const rings=poly.map(ring=>openRing(ring as P2[])).filter(ring=>ring.length>=3);if(rings.length&&Math.abs(ringArea(rings[0]))>1e-8)out.push({...f,polygon:rings});}
 }
 const near=(p:P2,a:P2,b:P2)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t)<2e-3;};
 const onHole=(p:P2)=>holes.some(h=>h.some((a,i)=>near(p,a,h[(i+1)%h.length])));
 return {faces:out,holes,keepEdge:e=>!(onHole([e.a[0],e.a[2]])&&onHole([e.b[0],e.b[2]])&&onHole([(e.a[0]+e.b[0])/2,(e.a[2]+e.b[2])/2]))};
}

// ---- UI helpers ----
export type RoofOpeningHit={partId:string;facing:number;tier:number;u:number;v:number;x:number;q:number;point:V3};
const inRing=(p:P2,ring:P2[])=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
const inFace=(p:P2,f:StudioRoofFace)=>inRing(p,f.polygon[0])&&!f.polygon.slice(1).some(r=>inRing(p,r));
/** Nearest roof plane hit along a building-local ray (the faces are uncut, so openings do not block it). */
export function roofFaceRayHit(faces:StudioRoofFace[],origin:V3,direction:V3):{face:StudioRoofFace;point:V3;distance:number}|null{
 let best:{face:StudioRoofFace;point:V3;distance:number}|null=null;
 for(const f of faces){const [a,b,c]=f.plane,den=direction[1]-a*direction[0]-b*direction[2];if(Math.abs(den)<1e-9)continue;
  const t=(a*origin[0]+b*origin[2]+c-origin[1])/den;if(t<=0||best&&t>=best.distance)continue;
  const p:V3=[origin[0]+direction[0]*t,origin[1]+direction[1]*t,origin[2]+direction[2]*t];if(inFace([p[0],p[2]],f))best={face:f,point:p,distance:t};}
 return best;
}
export function roofOpeningHitFromFace(_r:StudioRecipe,_d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>|null,faces:StudioRoofFace[],point:{x:number;y:number;z:number}):RoofOpeningHit|null{
 const p:P2=[point.x,point.z];let face:StudioRoofFace|null=null,dy=.35;
 for(const f of faces){const h=Math.abs(f.plane[0]*p[0]+f.plane[1]*p[1]+f.plane[2]-point.y);if(h<dy&&inFace(p,f)){face=f;dy=h;}}
 if(!face)return null;const slope=studioRoofSlopes(faces).find(s=>s.faces.includes(face!));if(!slope)return null;
 const [x,q]=slopeLocal(slope,p);
 return {partId:slope.partId,facing:slope.facing,tier:slope.tier,u:Math.max(0,Math.min(1,(x-slope.x0)/(slope.x1-slope.x0||1))),v:Math.max(0,Math.min(1,(q-slope.q0)/(slope.q1-slope.q0||1))),x,q,point:[point.x,point.y,point.z]};
}
const uv=(s:RoofSlope,x:number,q:number)=>({u:Math.max(0,Math.min(1,(x-s.x0)/(s.x1-s.x0||1))),v:Math.max(0,Math.min(1,(q-s.q0)/(s.q1-s.q0||1)))});
/** Where a preset centred on the hit would sit: skylight centre, or the dormer front line. */
function presetAt(r:StudioRecipe,slope:RoofSlope,hit:Pick<RoofOpeningHit,'x'|'q'>,p:RoofOpeningPreset){
 const o:StudioRoofOpening={id:p.id??'preview',partId:slope.partId,facing:slope.facing,...(slope.tier?{tier:slope.tier}:{}),u:0,v:0,width:p.width,height:p.height,kind:p.kind,...(p.kind==='dormer'?{roof:p.roof??'gable',shape:p.shape??'rect'}:{})};
 const q=p.kind==='dormer'?hit.q-dormerDims(slope,o,0).depth/2:hit.q;
 return {o,fit:layoutRoofOpening(r,slope,o,{x:hit.x,q})};
}
type Placed={recipe:StudioRecipe;opening:StudioRoofOpening};
function commitRoof(r:StudioRecipe,faces:StudioRoofFace[],o:StudioRoofOpening,list:StudioRoofOpening[]):Placed|{reason:string}{
 const error=validateRoofOpenings(list);if(error)return {reason:error};
 const next:StudioRecipe={...r,studio:{...r.studio,roofOpenings:list}},miss=resolveRoofOpeningLayouts(next,faces).inactive.find(i=>i.id===o.id);
 return miss?{reason:miss.reason}:{recipe:next,opening:o};
}
export function placeRoofOpening(r:StudioRecipe,_d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>|null,faces:StudioRoofFace[],hit:RoofOpeningHit,preset:RoofOpeningPreset):(Placed&{id:string})|{reason:string}{
 const slope=findRoofSlope(studioRoofSlopes(faces),hit.partId,hit.facing,hit.tier);if(!slope)return {reason:'Roof openings need a pitched roof slope.'};
 const {o,fit}=presetAt(r,slope,hit,preset);if('reason' in fit)return fit;
 const opening={...o,id:preset.id??globalThis.crypto.randomUUID(),...uv(slope,fit.xc,fit.qc)};
 const out=commitRoof(r,faces,opening,[...(r.studio.roofOpenings??[]),opening]);return 'reason' in out?out:{...out,id:opening.id};
}
export function nudgeRoofOpening(r:StudioRecipe,_d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>|null,faces:StudioRoofFace[],id:string,change:{dx?:number;dy?:number;u?:number;v?:number;width?:number;height?:number;roof?:RoofOpeningRoof;shape?:RoofOpeningShape}):Placed|{reason:string}{
 const list=r.studio.roofOpenings??[],old=list.find(o=>o.id===id);if(!old)return {reason:'This opening no longer exists.'};
 const slope=findRoofSlope(studioRoofSlopes(faces),old.partId,old.facing,old.tier??0);if(!slope)return {reason:'This roof slope no longer exists.'};
 const next:StudioRoofOpening={...old,width:change.width??old.width,height:change.height??old.height,...(old.kind==='dormer'?{roof:change.roof??old.roof??'gable',shape:change.shape??old.shape??'rect'}:{})};
 const x=slope.x0+(change.u??old.u)*(slope.x1-slope.x0)+(change.dx??0),q=slope.q0+(change.v??old.v)*(slope.q1-slope.q0)+(change.dy??0)/slope.m;
 const fit=layoutRoofOpening(r,slope,next,{x,q});if('reason' in fit)return fit;
 const o={...next,...uv(slope,fit.xc,fit.qc)};return commitRoof(r,faces,o,list.map(p=>p.id===id?o:p));
}
export function removeRoofOpening(r:StudioRecipe,id:string):StudioRecipe{const list=(r.studio.roofOpenings??[]).filter(o=>o.id!==id);const studio:StudioRecipe['studio']={...r.studio,roofOpenings:list};if(!list.length)delete studio.roofOpenings;return {...r,studio};}
/** The stored opening whose footprint contains the hit (with a small grab margin). */
export function roofOpeningAtHit(r:StudioRecipe,_d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>|null,faces:StudioRoofFace[],hit:Pick<RoofOpeningHit,'partId'|'x'|'q'|'facing'|'tier'>):StudioRoofOpening|null{
 const {layouts}=resolveRoofOpeningLayouts(r,faces),slope=findRoofSlope(studioRoofSlopes(faces),hit.partId,hit.facing,hit.tier);if(!slope)return null;
 return layouts.find(l=>l.slope===slope&&inRing([hit.x,hit.q],inflateConvex(l.footprint,ROOF_OPENING.grab)))?.o??null;
}
export type RoofOpeningGhost={kind:RoofOpeningKind;valid:boolean;reason?:string;center:V3;normal:V3;outline:V3[];triangles:number[]};
/** Preview of `preset` centred on the hit: plot-local triangles (a simple shell) and the footprint outline on the slope. */
export function roofOpeningGhost(r:StudioRecipe,_d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>|null,faces:StudioRoofFace[],hit:RoofOpeningHit,preset:RoofOpeningPreset):RoofOpeningGhost|null{
 const slope=findRoofSlope(studioRoofSlopes(faces),hit.partId,hit.facing,hit.tier);if(!slope)return null;
 const {o,fit}=presetAt(r,slope,hit,preset);let layout=fit,reason:string|undefined;
 if('reason' in fit){reason=fit.reason;const q=preset.kind==='dormer'&&slope.k>=ROOF_OPENING.dormerSlope?hit.q-dormerDims(slope,o,0).depth/2:hit.q,d=preset.kind==='dormer'&&slope.k>.05?dormerDims(slope,o,q):undefined;
  layout={o,slope,xc:hit.x,qc:q,clamped:false,dormer:d,hole:[],footprint:d?shift(dormerFootprint(d),hit.x,q):[[hit.x-o.width/2,q-o.height/slope.m/2],[hit.x+o.width/2,q-o.height/slope.m/2],[hit.x+o.width/2,q+o.height/slope.m/2],[hit.x-o.width/2,q+o.height/slope.m/2]]};}
 else if(resolveRoofOpeningLayouts(r,faces).layouts.some(l=>l.slope===slope&&overlaps(l.footprint,fit.footprint)))reason='Too close to another roof opening.';
 const L=layout as RoofOpeningLayout,tris:number[]=[],tri=(a:V3,b:V3,c:V3)=>tris.push(...a,...b,...c),quad=(a:V3,b:V3,c:V3,d:V3)=>{tri(a,b,c);tri(a,c,d);};
 const at=(x:number,y:number,dq:number):V3=>{const p=slopePlan(slope,L.xc+x,L.qc+dq);return [p[0],y,p[1]];};
 if(L.dormer&&preset.kind==='dormer'){
  const d=L.dormer,yTop=d.y0+d.H,yR=yTop+d.rise,hw=d.hw,roofY=(dq:number)=>d.y0+slope.k*dq,top=(x:number,dq:number)=>d.roof==='gable'?yR-d.rise/hw*Math.abs(x):yTop+d.ks*dq;
  quad(at(-hw,d.y0,0),at(hw,d.y0,0),at(hw,yTop,0),at(-hw,yTop,0));if(d.rise)tri(at(-hw,yTop,0),at(hw,yTop,0),at(0,yR,0));
  const de=d.H/(slope.k-d.ks);for(const s of [-1,1])tri(at(s*hw,d.y0,0),at(s*hw,yTop,0),at(s*hw,roofY(de),de));
  for(const s of d.roof==='gable'?[-1,1]:[0]){const x0=d.roof==='gable'?0:-hw,x1=d.roof==='gable'?s*hw:hw;quad(at(x0,top(x0,0),0),at(x1,top(x1,0),0),at(x1,top(x1,d.under(x1)),d.under(x1)),at(x0,top(x0,d.under(x0)),d.under(x0)));}
 }else{const [a,b,c,e]=L.footprint;const s=(p:P2)=>slopePoint(slope,p[0],p[1],.06);quad(s(a),s(b),s(c),s(e));}
 const ring=L.footprint,centre=slopePoint(slope,L.xc,L.qc+(L.dormer?L.dormer.depth/2:0),.05);
 return {kind:preset.kind,valid:!reason,...(reason?{reason}:{}),center:centre,normal:[slope.k*slope.g[0]/slope.m,1/slope.m,slope.k*slope.g[1]/slope.m],outline:ring.map(p=>slopePoint(slope,p[0],p[1],.05)),triangles:tris};
}
