// Construction studio outline editing (docs/city-studio-sculpt-v2.md): vertex/edge operations on a part outline and
// the content re-fit that keeps walls, openings, paint, rules and interiors in step with the new outline.
//
// Edge ids are the polygon `edgeIds`: rectangle sides keep their names (south/east/north/west), new walls receive
// `edge:<random>` ids. An id belongs to one wall for its lifetime, so inserting or removing corners elsewhere never
// renames an untouched wall and its openings, paint and rules stay exactly where they were.
import {effectiveSculptShapes,sculptFloorBottom,sculptFootprint,sculptPrimitiveBoundary,sculptSourceEdge,SCULPT_STUDIO_POLYGON_LIMIT,type SculptVolume,type SculptWallSide} from './citySculpt.ts';
import {outlineVolume,OUTLINE_MESSAGES} from './cityStudioOutline.ts';
import {facePose,faceU,faceX,isFrame,studioFaceFrame,type StudioFaceFrame} from './cityStudioFreeOpenings.ts';
import {pruneFreeTrims} from './cityStudioTrimParts.ts';
import {interiorContains} from './cityStudioInteriors.ts';
import type {StudioAnchor,StudioRecipe} from './cityStudioTypes.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';

export type OutlinePoint=[number,number];
export type OutlineEdit=SculptVolume|{reason:string};
export const isOutlineRefusal=(e:OutlineEdit):e is {reason:string}=>'reason' in e;
/** Snapping and tolerances used by the 3D outline editor and the inspector. */
export const OUTLINE_EDIT={grid:.25,angleStep:15,align:.3,minEdge:.5,limit:SCULPT_STUDIO_POLYGON_LIMIT} as const;

type P=OutlinePoint;
const sub=(a:P,b:P):P=>[a[0]-b[0],a[1]-b[1]];
const len=(a:P)=>Math.hypot(a[0],a[1]);
const dot=(a:P,b:P)=>a[0]*b[0]+a[1]*b[1];
const cross=(a:P,b:P)=>a[0]*b[1]-a[1]*b[0];
const unit=(a:P):P=>{const l=len(a)||1;return [a[0]/l,a[1]/l];};
const clean=(n:number)=>Math.round(n*1e6)/1e6;

/** Outline of a solid part as absolute points plus one edge id per wall (rectangles and ovals become editable). */
export function editableOutline(v:SculptVolume):{points:P[];ids:SculptWallSide[]}|null{
 if(v.operation!=='add')return null;
 const points=sculptPrimitiveBoundary(v).map(p=>[p[0],p[1]] as P);
 if(v.kind==='rectangle')return {points,ids:['south','east','north','west']};
 if(v.kind==='polygon')return {points,ids:[...(v.edgeIds??[])]};
 // Ovals become their canonical bay-sized facets: the footprint is unchanged, each facet is a straight wall.
 return {points,ids:points.map((_,i)=>`edge:arc${i}` as SculptWallSide)};
}
/** The editable polygon of a part without changing its footprint (rectangle and oval conversion on first edit). */
export function asOutlinePolygon(v:SculptVolume):SculptVolume|null{
 if(v.kind==='polygon')return v;const o=editableOutline(v);if(!o)return null;
 const {curvedFacade:_c,...rest}=v;return outlineVolume(rest as SculptVolume,o.points,o.ids);
}
/** A new wall id, unique within the outline. */
export function newOutlineEdgeId(taken:Iterable<string>,random:()=>number=Math.random):SculptWallSide{
 const used=new Set(taken);for(;;){const id=`edge:${Math.floor(random()*36**6).toString(36).padStart(6,'0')}`;if(!used.has(id))return id as SculptWallSide;}
}
function build(v:SculptVolume,points:P[],ids:SculptWallSide[]):OutlineEdit{
 // Drop zero-length walls (two corners on the same spot) and keep the surviving neighbour's id.
 const pts=points.map(p=>[clean(p[0]),clean(p[1])] as P),out:P[]=[],outIds:SculptWallSide[]=[];
 for(let i=0;i<pts.length;i++){const next=pts[(i+1)%pts.length];if(len(sub(next,pts[i]))<.01&&pts.length>3){continue;}out.push(pts[i]);outIds.push(ids[i]);}
 if(out.length<3)return {reason:OUTLINE_MESSAGES.min};
 if(out.length>OUTLINE_EDIT.limit)return {reason:OUTLINE_MESSAGES.limit};
 const {curvedFacade:_c,...rest}=v;return outlineVolume(rest as SculptVolume,out,outIds);
}
const outlineOf=(v:SculptVolume)=>editableOutline(v);

/** Move one corner to an absolute building-local point. */
export function setOutlineVertex(v:SculptVolume,index:number,point:P):OutlineEdit{
 const o=outlineOf(v);if(!o||index<0||index>=o.points.length)return {reason:OUTLINE_MESSAGES.ellipse};
 const points=o.points.map(p=>[...p] as P);points[index]=[point[0],point[1]];return build(v,points,o.ids);
}
/** Move several corners together by the same offset. */
export function moveOutlineVertices(v:SculptVolume,indices:readonly number[],delta:P):OutlineEdit{
 const o=outlineOf(v);if(!o)return {reason:OUTLINE_MESSAGES.ellipse};const set=new Set(indices);
 return build(v,o.points.map((p,i)=>set.has(i)?[p[0]+delta[0],p[1]+delta[1]]:[...p] as P),o.ids);
}
/**
 * Insert a corner on a wall at `t` (0–1 along the outline direction) or at the projection of a point. The first half
 * keeps the wall id; the second half gets a new id. Content re-fit moves items on the second half across.
 */
export function insertOutlineVertex(v:SculptVolume,edgeIndex:number,at:number|P=.5,newId?:SculptWallSide):OutlineEdit{
 const o=outlineOf(v);if(!o||edgeIndex<0||edgeIndex>=o.points.length)return {reason:OUTLINE_MESSAGES.ellipse};
 if(o.points.length>=OUTLINE_EDIT.limit)return {reason:OUTLINE_MESSAGES.limit};
 const a=o.points[edgeIndex],b=o.points[(edgeIndex+1)%o.points.length],d=sub(b,a),l=len(d);
 let t=typeof at==='number'?at:dot(sub(at,a),d)/(l*l||1);
 // Snap the new corner along the wall to the grid measured from the wall's start.
 t=Math.round(t*l/OUTLINE_EDIT.grid)*OUTLINE_EDIT.grid/(l||1);
 if(t*l<OUTLINE_EDIT.minEdge-1e-6||(1-t)*l<OUTLINE_EDIT.minEdge-1e-6)return {reason:OUTLINE_MESSAGES.short};
 const p:P=[a[0]+d[0]*t,a[1]+d[1]*t],points=[...o.points.slice(0,edgeIndex+1),p,...o.points.slice(edgeIndex+1)],ids=[...o.ids.slice(0,edgeIndex+1),newId??newOutlineEdgeId(o.ids),...o.ids.slice(edgeIndex+1)];
 return build(v,points,ids);
}
/** Remove corners; each merged wall keeps the id of its longest former wall. */
export function deleteOutlineVertices(v:SculptVolume,indices:readonly number[]):OutlineEdit{
 const o=outlineOf(v);if(!o)return {reason:OUTLINE_MESSAGES.ellipse};const n=o.points.length,drop=new Set(indices.filter(i=>i>=0&&i<n));
 if(!drop.size)return v;if(n-drop.size<3)return {reason:OUTLINE_MESSAGES.min};
 const keep=o.points.map((_,i)=>i).filter(i=>!drop.has(i)),points:P[]=[],ids:SculptWallSide[]=[];
 for(let k=0;k<keep.length;k++){
  const from=keep[k],to=keep[(k+1)%keep.length];let best=o.ids[from],bestLength=-1;
  for(let i=from;;i=(i+1)%n){const l=len(sub(o.points[(i+1)%n],o.points[i]));if(l>bestLength){bestLength=l;best=o.ids[i];}if((i+1)%n===to)break;}
  points.push(o.points[from]);ids.push(best);
 }
 return build(v,points,ids);
}
/** Outward unit normal of wall `index` (outlines run counter-clockwise). */
export function outlineEdgeNormal(v:SculptVolume,index:number):P|null{
 const o=outlineOf(v);if(!o)return null;const a=o.points[index],b=o.points[(index+1)%o.points.length];if(!a||!b)return null;const t=unit(sub(b,a));return [t[1],-t[0]];
}
/**
 * SketchUp-style push/pull: the wall moves `distance` along its outward normal (negative carves a notch). Where a
 * neighbouring wall runs along the normal it simply stretches; otherwise a new return wall is created so the
 * neighbour stays put. The pushed wall keeps its id.
 */
export function extrudeOutlineEdge(v:SculptVolume,index:number,distance:number,ids?:{start?:SculptWallSide;end?:SculptWallSide}):OutlineEdit{
 const o=outlineOf(v);if(!o||!Number.isFinite(distance))return {reason:OUTLINE_MESSAGES.ellipse};if(Math.abs(distance)<1e-6)return v;
 const n=o.points.length,i=((index%n)+n)%n,a=o.points[i],b=o.points[(i+1)%n],prev=o.points[(i+n-1)%n],next=o.points[(i+2)%n],t=unit(sub(b,a)),normal:P=[t[1],-t[0]],shift:P=[normal[0]*distance,normal[1]*distance];
 const along=(p:P,q:P)=>Math.abs(cross(unit(sub(q,p)),normal))<.02;
 const startStretch=along(prev,a),endStretch=along(b,next),a2:P=[a[0]+shift[0],a[1]+shift[1]],b2:P=[b[0]+shift[0],b[1]+shift[1]];
 const taken=new Set(o.ids),startId=ids?.start??newOutlineEdgeId(taken);taken.add(startId);const endId=ids?.end??newOutlineEdgeId(taken);
 const points:P[]=[],newIds:SculptWallSide[]=[];
 for(let k=0;k<n;k++){
  if(k===i){
   if(startStretch){points.push(a2);newIds.push(o.ids[i]);}else{points.push(a);newIds.push(startId);points.push(a2);newIds.push(o.ids[i]);}
   if(!endStretch){points.push(b2);newIds.push(endId);}
   continue;
  }
  if(k===(i+1)%n){points.push(endStretch?b2:b);newIds.push(o.ids[k]);continue;}
  points.push(o.points[k]);newIds.push(o.ids[k]);
 }
 // Rotate so indices before the wall are unchanged (k===i+1 wrapping to 0 keeps the order valid).
 if(points.length>OUTLINE_EDIT.limit)return {reason:OUTLINE_MESSAGES.limit};
 return build(v,points,newIds);
}
/** Move a wall along its normal; both neighbours stretch (Alt in the editor). */
export function moveOutlineEdge(v:SculptVolume,index:number,distance:number):OutlineEdit{
 const o=outlineOf(v),normal=outlineEdgeNormal(v,index);if(!o||!normal)return {reason:OUTLINE_MESSAGES.ellipse};const n=o.points.length;
 return moveOutlineVertices(v,[index%n,(index+1)%n],[normal[0]*distance,normal[1]*distance]);
}
/** Set a wall's length by moving its end corner along the wall (the next wall stretches). */
export function setOutlineEdgeLength(v:SculptVolume,index:number,length:number):OutlineEdit{
 const o=outlineOf(v);if(!o||!Number.isFinite(length))return {reason:OUTLINE_MESSAGES.ellipse};if(length<OUTLINE_EDIT.minEdge)return {reason:OUTLINE_MESSAGES.short};
 const n=o.points.length,a=o.points[index],b=o.points[(index+1)%n];if(!a||!b)return v;const t=unit(sub(b,a));
 return setOutlineVertex(v,(index+1)%n,[a[0]+t[0]*length,a[1]+t[1]*length]);
}
function rotate(p:P,angle:number):P{const c=Math.cos(angle),s=Math.sin(angle);return [p[0]*c-p[1]*s,p[0]*s+p[1]*c];}
/**
 * Walls within `tolerance` of the frame axes become exactly axis-aligned (shared coordinates are averaged). With the
 * world frame the result snaps to the grid.
 */
function alignToFrame(v:SculptVolume,angle:number,tolerance:number,grid:boolean):OutlineEdit{
 const o=outlineOf(v);if(!o)return {reason:OUTLINE_MESSAGES.ellipse};const n=o.points.length,local=o.points.map(p=>rotate(p,-angle));
 const parentX=local.map((_,i)=>i),parentZ=local.map((_,i)=>i),find=(parent:number[],i:number):number=>parent[i]===i?i:(parent[i]=find(parent,parent[i]));
 for(let i=0;i<n;i++){const a=local[i],b=local[(i+1)%n],d=sub(b,a),angleOf=Math.abs(Math.atan2(d[1],d[0]));
  const nearHorizontal=Math.min(angleOf,Math.PI-angleOf)<=tolerance,nearVertical=Math.abs(angleOf-Math.PI/2)<=tolerance;
  if(nearHorizontal)parentZ[find(parentZ,i)]=find(parentZ,(i+1)%n);else if(nearVertical)parentX[find(parentX,i)]=find(parentX,(i+1)%n);}
 const average=(parent:number[],axis:0|1)=>{const sums=new Map<number,{s:number;c:number}>();local.forEach((p,i)=>{const r=find(parent,i),e=sums.get(r)??{s:0,c:0};e.s+=p[axis];e.c++;sums.set(r,e);});return local.map((_,i)=>{const e=sums.get(find(parent,i))!;const value=e.s/e.c;return grid&&e.c>1?Math.round(value/OUTLINE_EDIT.grid)*OUTLINE_EDIT.grid:value;});};
 const xs=average(parentX,0),zs=average(parentZ,1);
 return build(v,local.map((_,i)=>rotate([xs[i],zs[i]],angle)),o.ids);
}
/** Straighten: walls within 10° of the plot axes become exactly straight and snap to the grid. */
export const straightenOutline=(v:SculptVolume)=>alignToFrame(v,0,10*Math.PI/180,true);
/** Square corners: walls within 15° of the longest wall's direction (or its perpendicular) become exactly square. */
export function squareOutlineCorners(v:SculptVolume):OutlineEdit{
 const o=outlineOf(v);if(!o)return {reason:OUTLINE_MESSAGES.ellipse};let best=0,angle=0;
 o.points.forEach((p,i)=>{const d=sub(o.points[(i+1)%o.points.length],p),l=len(d);if(l>best){best=l;angle=Math.atan2(d[1],d[0]);}});
 angle=((angle%(Math.PI/2))+Math.PI/2)%(Math.PI/2);if(angle>Math.PI/4)angle-=Math.PI/2;
 return alignToFrame(v,angle,15*Math.PI/180,Math.abs(angle)<1e-9);
}
/** Simplify: remove straight-through and nearly straight corners (within `tolerance` metres) and walls shorter than 0.5 m. */
export function simplifyOutline(v:SculptVolume,tolerance=.15):OutlineEdit{
 const o=outlineOf(v);if(!o)return {reason:OUTLINE_MESSAGES.ellipse};let current:SculptVolume=v;
 for(let guard=0;guard<OUTLINE_EDIT.limit;guard++){
  const c=outlineOf(current)!,n=c.points.length;if(n<=3)break;
  let worst=-1,score=Infinity;
  for(let i=0;i<n;i++){const a=c.points[(i+n-1)%n],p=c.points[i],b=c.points[(i+1)%n],d=sub(b,a),l=len(d),deviation=l?Math.abs(cross(d,sub(p,a)))/l:0,short=Math.min(len(sub(p,a)),len(sub(b,p)))<OUTLINE_EDIT.minEdge;
   const s=short?deviation-1000:deviation;if((deviation<tolerance||short)&&s<score){score=s;worst=i;}}
  if(worst<0)break;const next=deleteOutlineVertices(current,[worst]);if(isOutlineRefusal(next))break;current=next;
 }
 return current;
}

// ---- Content re-fit ------------------------------------------------------------------------------------------------

type Design=Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>;
type Line={side:SculptWallSide;a:P;b:P;t:P;len:number;frame:StudioFaceFrame|null};
type OldEdge=Line&{curve?:SculptVolume};
export type OutlineRemoval={kind:string;count:number;where:'wall'|'inside'};
export type OutlineRefit={recipe:StudioRecipe;removed:OutlineRemoval[];moved:number;summary:string;changedSides:SculptWallSide[]};

function lineOf(v:SculptVolume,side:SculptWallSide):{a:P;b:P}|null{
 if(v.kind==='ellipse')return null;const poly=v.kind==='polygon'?v:asOutlinePolygon(v);if(!poly)return null;
 const e=sculptSourceEdge(poly,side);return e?{a:e.a,b:e.b}:null;
}
function edgesOf(r:StudioRecipe,v:SculptVolume,d:Design):OldEdge[]{
 const frame=(side:SculptWallSide)=>{const f=studioFaceFrame(r,d,v.id,side);return isFrame(f)?f:null;};
 if(v.kind==='ellipse'){const f=frame('curve');return f?[{side:'curve',a:[0,0],b:[0,0],t:[1,0],len:f.length,frame:f,curve:v}]:[];}
 const o=editableOutline(v);if(!o)return [];
 return o.ids.flatMap(side=>{const l=lineOf(v,side);if(!l)return [];const d0=sub(l.b,l.a),length=len(d0);return [{side,a:l.a,b:l.b,t:unit(d0),len:length,frame:frame(side)}];});
}
const pluralise=(kind:string,count:number)=>count===1?kind:kind.endsWith('ch')||kind.endsWith('sh')?`${kind}es`:kind.endsWith('y')&&!/[aeiou]y$/.test(kind)?`${kind.slice(0,-1)}ies`:kind==='furniture piece'?'furniture pieces':`${kind}s`;
export function outlineRemovalSummary(removed:readonly OutlineRemoval[],changedWalls:number):string{
 const list=(where:'wall'|'inside')=>{const items=removed.filter(r=>r.where===where&&r.count>0).map(r=>`${r.count} ${pluralise(r.kind,r.count)}`);return items.length>1?`${items.slice(0,-1).join(', ')} and ${items.at(-1)}`:items[0]??'';};
 const wall=list('wall'),inside=list('inside');
 return [wall?`removed ${wall} on the ${changedWalls===1?'changed wall':'changed walls'}`:'',inside?`removed ${inside} outside the new outline`:''].filter(Boolean).join('; ');
}
const DECOR_KIND:Record<string,string>={balcony:'balcony',cornice:'cornice',canopy:'canopy',stair:'outside stair',pilaster:'pilaster',ornament:'ornament',planter:'planter',light:'light'};

/**
 * Re-fit everything attached to a part's walls after its outline changed from `base` to `next` (same recipe apart
 * from that part's volume). Content on unchanged walls is untouched. On changed walls, an item keeps its absolute
 * position along the wall when it still fits, else its relative position, else it is nudged by at most its half
 * width, else it is removed. Whole-wall choices (wall paint, bands, paint and rhythm rules) follow a split wall onto
 * both halves. Interior furniture, stairs and rooms left outside the new footprint are removed; interior walls are
 * clipped. The removal summary is meant for the undo label and toast.
 */
export function refitOutlineContent(base:StudioRecipe,next:StudioRecipe,partId:string,d:Design={groundHeight:3,upperHeight:3}):OutlineRefit{
 const oldV=base.volumes.find(v=>v.id===partId),newV=next.volumes.find(v=>v.id===partId);
 if(!oldV||!newV)return {recipe:next,removed:[],moved:0,summary:'',changedSides:[]};
 const oldEdges=edgesOf(base,oldV,d),newEdges=edgesOf(next,newV,d),newBySide=new Map(newEdges.map(e=>[e.side,e]));
 const same=(a:OldEdge,b:OldEdge|undefined)=>!!b&&!a.curve&&!b.curve&&len(sub(a.a,b.a))<1e-4&&len(sub(a.b,b.b))<1e-4;
 const unchanged=new Set(oldEdges.filter(e=>same(e,newBySide.get(e.side))).map(e=>e.side));
 const oldBySide=new Map(oldEdges.map(e=>[e.side,e]));
 const candidates=newEdges.filter(e=>!unchanged.has(e.side));
 const changedSides=oldEdges.filter(e=>!unchanged.has(e.side)).map(e=>e.side);
 if(!changedSides.length&&candidates.length===0)return {recipe:next,removed:[],moved:0,summary:'',changedSides:[]};
 const r=structuredClone(next),removedCounts=new Map<string,OutlineRemoval>();let moved=0;
 const remove=(kind:string,where:'wall'|'inside'='wall',count=1)=>{const key=`${where}/${kind}`,e=removedCounts.get(key)??{kind,count:0,where};e.count+=count;removedCounts.set(key,e);};
 const ownWall=(shapeId:string,side:string)=>shapeId===partId&&oldBySide.has(side as SculptWallSide)&&!unchanged.has(side as SculptWallSide);
 /** Old wall point and direction at parameter u (anchor u for kit anchors, face u for free openings and paint). */
 const oldAt=(side:SculptWallSide,u:number,face:boolean):{p:P;dir:P}|null=>{
  const e=oldBySide.get(side);if(!e)return null;
  if(e.curve){const v=e.curve;if(!face){const angle=u*Math.PI*2;return {p:[v.x+Math.cos(angle)*v.width/2,v.z+Math.sin(angle)*v.depth/2],dir:unit([-Math.sin(angle)*v.width/2,Math.cos(angle)*v.depth/2])};}
   if(!e.frame)return null;const pose=facePose(e.frame,faceX(e.frame,u));return {p:[pose.x,pose.z],dir:[pose.normal[1],-pose.normal[0]]};}
  return {p:[e.a[0]+e.t[0]*u*e.len,e.a[1]+e.t[1]*u*e.len],dir:e.t};
 };
 const collinearChildren=(side:SculptWallSide)=>{const e=oldBySide.get(side);if(!e||e.curve)return [] as Line[];
  return candidates.filter(c=>Math.abs(dot(c.t,e.t))>.999&&Math.abs(cross(sub(c.a,e.a),e.t))<.02&&Math.abs(cross(sub(c.b,e.a),e.t))<.02&&Math.min(e.len,Math.max(dot(sub(c.a,e.a),e.t),dot(sub(c.b,e.a),e.t)))-Math.max(0,Math.min(dot(sub(c.a,e.a),e.t),dot(sub(c.b,e.a),e.t)))>.05);};
 /** New wall and u for an item of half width `hw` metres centred at old (side, u); null when it no longer fits. */
 const mapPoint=(side:SculptWallSide,u:number,hw:number,face:boolean):{side:SculptWallSide;u:number}|null=>{
  const at=oldAt(side,u,face);if(!at)return null;const {p,dir}=at,fits=(s:number,l:number)=>s-hw>=-1e-3&&s+hw<=l+1e-3;
  let best:{side:SculptWallSide;s:number;len:number;perp:number}|null=null;
  // The item's own wall (if it still exists) may turn; other walls must run the same way (a split-off half, or the
  // wall that absorbed a deleted one).
  const kept=newBySide.has(side),aligned=candidates.filter(c=>{const a=Math.abs(dot(dir,c.t));return c.side===side?a>=.2:kept?a>=.95:a>=.7;});
  for(const c of aligned){const s=dot(sub(p,c.a),c.t),perp=Math.abs(cross(sub(p,c.a),c.t));
   if(!fits(s,c.len))continue;if(!best||perp<best.perp-1e-6||Math.abs(perp-best.perp)<=1e-6&&c.side===side)best={side:c.side,s,len:c.len,perp};}
  if(best)return {side:best.side,u:best.s/best.len};
  const own=aligned.find(c=>c.side===side),split=collinearChildren(side).length>1;
  if(own&&!split){const s=u*own.len;if(fits(s,own.len))return {side,u:s/own.len};}
  // Nudge an item straddling a new corner into the wall holding most of it (at most its half width).
  let nudge:{side:SculptWallSide;s:number;len:number;perp:number}|null=null;
  for(const c of aligned){if(c.len<2*hw+.1)continue;const s=dot(sub(p,c.a),c.t),perp=Math.abs(cross(sub(p,c.a),c.t)),clamped=Math.max(hw+.05,Math.min(c.len-hw-.05,s));
   if(Math.abs(clamped-s)>Math.max(hw,.25))continue;if(!nudge||perp<nudge.perp)nudge={side:c.side,s:clamped,len:c.len,perp};}
  return nudge?{side:nudge.side,u:nudge.s/nudge.len}:null;
 };
 /** Sides a whole-wall choice lands on: the same wall (when it still exists) plus any split-off halves. */
 const mapWall=(side:SculptWallSide):SculptWallSide[]=>{
  const e=oldBySide.get(side);if(!e)return [side];if(unchanged.has(side))return [side];
  if(e.curve)return newEdges.map(n=>n.side);
  const out=new Set<SculptWallSide>();if(newBySide.has(side))out.add(side);for(const c of collinearChildren(side))out.add(c.side);return [...out];
 };
 const mapAnchor=<A extends StudioAnchor|{shapeId:string;side:SculptWallSide;u:number}>(a:A,hw=0):A|null=>{
  if(!ownWall(a.shapeId,a.side))return a;const m=mapPoint(a.side,a.u,hw,false);if(!m)return null;
  if(m.side!==a.side||Math.abs(m.u-a.u)>1e-9)moved++;return {...a,side:m.side,u:Math.max(0,Math.min(1,m.u))};
 };
 const s=r.studio;
 // Kit tiles, wall paint, decorations and storefronts (bay anchors: they resolve against the bay containing u).
 s.openings=s.openings.flatMap(o=>{const a=mapAnchor(o.anchor);if(!a){remove(o.module.startsWith('door')?'door':'window');return [];}return [{...o,anchor:a}];});
 const surfaces:typeof s.surfaces=[];
 for(const x of s.surfaces){
  if(!ownWall(x.anchor.shapeId,x.anchor.side)){surfaces.push(x);continue;}
  if(x.scope==='wall'){const sides=mapWall(x.anchor.side);if(!sides.length){remove('paint patch');continue;}sides.forEach((side,i)=>surfaces.push({...x,id:i?`${x.id}~${side.replace(/^edge:/,'')}`:x.id,anchor:{...x.anchor,side,u:.5}}));continue;}
  const a=mapAnchor(x.anchor);if(a)surfaces.push({...x,anchor:a});else remove('paint patch');
 }
 s.surfaces=surfaces;
 s.assemblies=s.assemblies.flatMap(x=>{const anchors=x.anchors.map(a=>mapAnchor(a));if(anchors.some(a=>!a)){remove(DECOR_KIND[x.kind]??'decoration');return [];}
  const out={...x,anchors:anchors as StudioAnchor[]};if(x.exit){const exit=mapAnchor(x.exit);if(exit)out.exit=exit;else delete out.exit;}return [out];});
 if(s.stamps)s.stamps=s.stamps.flatMap(x=>{const a=mapAnchor(x.anchor);if(!a){remove('storefront');return [];}return [{...x,anchor:a}];});
 if(r.tileAnchors)r.tileAnchors=r.tileAnchors.flatMap(t=>{if(t.volumeId!==partId)return [t];const a=mapAnchor({shapeId:t.volumeId,side:t.side,u:t.u});if(!a){remove('kit tile');return [];}return [{...t,side:a.side,u:a.u}];});
 r.attachments=r.attachments.flatMap(x=>{if(!x.anchor)return [x];const a=mapAnchor(x.anchor);if(!a){remove(x.kind==='door'?'entrance door':DECOR_KIND[x.kind]??x.kind);return [];}
  if(a===x.anchor)return [x];const e=newBySide.get(a.side);if(!e)return [{...x,anchor:a}];const p:P=[e.a[0]+e.t[0]*a.u*e.len,e.a[1]+e.t[1]*a.u*e.len];return [{...x,anchor:a,x:p[0],z:p[1],nx:e.t[1],nz:-e.t[0]}];});
 // Free openings (face u of their centre, with their width).
 if(s.freeOpenings){const before=s.freeOpenings.length;s.freeOpenings=s.freeOpenings.flatMap(o=>{if(!ownWall(o.shapeId,o.side))return [o];const m=mapPoint(o.side,o.u,o.width/2,true);if(!m){remove(o.bottom<.05?'door':'window');return [];}if(m.side!==o.side||Math.abs(m.u-o.u)>1e-9)moved++;return [{...o,side:m.side,u:Math.max(0,Math.min(1,m.u))}];});
  if(s.freeOpenings.length!==before&&s.freeTrims)Object.assign(r,pruneFreeTrims(r));}
 // Paint regions (face metres): bands follow the wall; rects move with their centre and split across walls.
 const frameOf=(side:SculptWallSide)=>oldBySide.get(side)?.frame??null,newFrame=(side:SculptWallSide)=>newBySide.get(side)?.frame??null;
 if(s.paintRegions){const out:typeof s.paintRegions=[];
  for(const region of s.paintRegions){
   if(!ownWall(region.shapeId,region.side)){out.push(region);continue;}
   const side=region.side as SculptWallSide;
   if(region.band){const sides=mapWall(side);if(!sides.length){remove('paint patch');continue;}sides.forEach((ns,i)=>{const f=newFrame(ns);out.push({...region,id:i?`${region.id}~${ns.replace(/^edge:/,'')}`:region.id,side:ns,rects:region.rects.map(q=>[f?Math.min(q[0],0):q[0],f?Math.max(q[1],f.length):q[1],q[2],q[3]])});});continue;}
   const f0=frameOf(side);if(!f0){remove('paint patch');continue;}
   const groups=new Map<SculptWallSide,typeof region.rects>();let lost=0;
   for(const q of region.rects){const cx=(q[0]+q[1])/2,hw=(q[1]-q[0])/2,m=mapPoint(side,faceU(f0,cx),Math.min(hw,.05),true),f=m&&newFrame(m.side);if(!m||!f){lost++;continue;}
    const nx=faceX(f,m.u),x0=Math.max(-.5*hw,nx-hw),x1=Math.min(f.length+.5*hw,nx+hw);if(x1-x0<.05){lost++;continue;}
    const list=groups.get(m.side)??[];list.push([x0,x1,q[2],q[3]]);groups.set(m.side,list);}
   if(!groups.size){remove('paint patch');continue;}if(lost)moved++;
   [...groups.entries()].sort(([a],[b])=>(a===side?-1:0)-(b===side?-1:0)).forEach(([ns,rects],i)=>out.push({...region,id:i?`${region.id}~${ns.replace(/^edge:/,'')}`:region.id,side:ns,rects}));
  }
  s.paintRegions=out;}
 // Paint rules scoped to walls.
 if(s.paintRules)s.paintRules=s.paintRules.flatMap(rule=>{const walls=rule.scope?.walls;if(!walls?.some(w=>ownWall(w.partId,w.side)))return [rule];
  const mapped=walls.flatMap(w=>ownWall(w.partId,w.side)?mapWall(w.side as SculptWallSide).map(side=>({partId:w.partId,side})):[w]),unique=mapped.filter((w,i)=>mapped.findIndex(x=>x.partId===w.partId&&x.side===w.side)===i);
  if(!unique.length&&!rule.scope?.parts?.length){remove('paint rule');return [];}return [{...rule,scope:{...rule.scope,walls:unique}}];});
 // Facade rhythm rules on walls (whole wall, or a painted face-metre range).
 if(s.facadeRhythm?.rules){const out:NonNullable<typeof s.facadeRhythm.rules>=[],key=(x:{partId?:string;side?:string;fromFloor?:number;toFloor?:number;x0?:number;x1?:number})=>[x.partId,x.side,x.fromFloor,x.toFloor,x.x0,x.x1].join('|');
  for(const rule of s.facadeRhythm.rules){
   if(!rule.partId||!rule.side||!ownWall(rule.partId,rule.side)){out.push(rule);continue;}
   if(rule.x0===undefined||rule.x1===undefined){const sides=mapWall(rule.side);if(!sides.length){remove('facade rule');continue;}for(const side of sides){const n={...rule,side};if(!out.some(o=>key(o)===key(n)))out.push(n);}continue;}
   const f0=frameOf(rule.side),cx=(rule.x0+rule.x1)/2,hw=(rule.x1-rule.x0)/2,m=f0&&mapPoint(rule.side,faceU(f0,cx),Math.min(hw,.05),true),f=m&&newFrame(m.side);
   if(!m||!f){remove('facade rule');continue;}const nx=faceX(f,m.u),x0=Math.max(0,nx-hw),x1=Math.min(f.length,nx+hw);if(x1-x0<.1){remove('facade rule');continue;}
   const n={...rule,side:m.side,x0,x1};if(!out.some(o=>key(o)===key(n)))out.push(n);
  }
  s.facadeRhythm={...s.facadeRhythm,rules:out};}
 // Business-style variation region rules (u ranges on walls).
 if(s.variation?.rules)s.variation={...s.variation,rules:s.variation.rules.flatMap(rule=>{const faces=rule.scope.faces;if(!faces?.some(f=>ownWall(f.partId,f.side)))return [rule];
  const out=faces.flatMap(f=>{if(!ownWall(f.partId,f.side))return [f];if(f.from<=.001&&f.to>=.999)return mapWall(f.side).map(side=>({...f,side}));
   const mid=(f.from+f.to)/2,e=oldBySide.get(f.side)!,hw=(f.to-f.from)/2*e.len,m=mapPoint(f.side,mid,Math.min(hw,.05),false),n=m&&newBySide.get(m.side);if(!m||!n)return [];const du=hw/n.len;return [{...f,side:m.side,from:Math.max(0,m.u-du),to:Math.min(1,m.u+du)}];});
  if(!out.length){remove('variation rule');return [];}return [{...rule,scope:{...rule.scope,faces:out}}];})};
 // Interiors: items left outside the new footprint on this part's storeys.
 if(r.version===6&&base.version===6){const i=r.interior,floors=new Set(Array.from({length:newV.spanFloors},(_,k)=>newV.startFloor+k));const cache=new Map<number,{old:ReturnType<typeof sculptFootprint>;now:ReturnType<typeof sculptFootprint>}>();
  const foot=(f:number)=>{let c=cache.get(f);if(!c){c={old:sculptFootprint(effectiveSculptShapes(base,f)),now:sculptFootprint(effectiveSculptShapes(r,f))};cache.set(f,c);}return c;};
  const lost=(f:number,x:number,z:number)=>{if(!floors.has(f))return false;const c=foot(f);return interiorContains(c.old,x,z)&&!interiorContains(c.now,x,z);};
  const furniture=i.furniture?.length??0;i.furniture=i.furniture?.filter(x=>!lost(x.floor,x.x,x.z));if(i.furniture&&i.furniture.length<furniture)remove('furniture piece','inside',furniture-i.furniture.length);
  const stairs=i.stairs.length;i.stairs=i.stairs.filter(x=>!lost(x.floor,x.x,x.z));if(i.stairs.length<stairs)remove('inside stair','inside',stairs-i.stairs.length);
  const rooms=i.roomFinishes?.length??0;i.roomFinishes=i.roomFinishes?.filter(x=>!lost(x.floor,x.x,x.z));if(i.roomFinishes&&i.roomFinishes.length<rooms)remove('room finish','inside',rooms-i.roomFinishes.length);
  const partitions:typeof i.partitions=[],droppedWalls=new Set<string>();
  for(const w of i.partitions){
   if(!floors.has(w.floor)){partitions.push(w);continue;}const c=foot(w.floor),length=len(sub(w.b,w.a)),n=Math.max(8,Math.ceil(length/.2)),ts=Array.from({length:n+1},(_,k)=>Math.min(1-.02/length,Math.max(.02/length,k/n))),at=(t:number):P=>[w.a[0]+(w.b[0]-w.a[0])*t,w.a[1]+(w.b[1]-w.a[1])*t];
   const inNow=ts.map(t=>{const p=at(t);return interiorContains(c.now,p[0],p[1]);});if(inNow.every(Boolean)){partitions.push(w);continue;}
   if(!ts.every(t=>{const p=at(t);return interiorContains(c.old,p[0],p[1]);})){partitions.push(w);continue;}
   let bestFrom=-1,bestTo=-1;for(let k=0;k<ts.length;){if(!inNow[k]){k++;continue;}let e=k;while(e+1<ts.length&&inNow[e+1])e++;if(bestFrom<0||ts[e]-ts[k]>ts[bestTo]-ts[bestFrom]){bestFrom=k;bestTo=e;}k=e+1;}
   if(bestFrom<0||(ts[bestTo]-ts[bestFrom])*length<1.25){droppedWalls.add(w.id);remove('interior wall','inside');continue;}
   const t0=ts[bestFrom],t1=ts[bestTo],clipped={...w,a:at(t0),b:at(t1)};partitions.push(clipped);
   i.doors=i.doors.flatMap(door=>door.partitionId!==w.id?[door]:door.u<t0||door.u>t1?(remove('interior door','inside'),[]):[{...door,u:(door.u-t0)/(t1-t0)}]);
  }
  i.partitions=partitions;if(droppedWalls.size){const before=i.doors.length;i.doors=i.doors.filter(door=>!droppedWalls.has(door.partitionId));if(i.doors.length<before)remove('interior door','inside',before-i.doors.length);}
 }
 const removed=[...removedCounts.values()];
 return {recipe:r,removed,moved,summary:outlineRemovalSummary(removed,Math.max(1,changedSides.length)),changedSides};
}

/** Replace a part's volume and re-fit its content in one step; the label carries the removal summary. */
export function applyOutlineEdit(base:StudioRecipe,partId:string,volume:SculptVolume,label:string,d?:Design):{recipe:StudioRecipe;label:string;refit:OutlineRefit}{
 const next={...base,volumes:base.volumes.map(v=>v.id===partId?volume:v)},refit=refitOutlineContent(base,next,partId,d);
 return {recipe:refit.recipe,label:refit.summary?`${label} · ${refit.summary}`:label,refit};
}

/**
 * Per-storey outlines: split a multi-storey part at `floor` so the storeys from `floor` up become their own part
 * (same outline and style) whose outline can then be edited on its own. Wall content on those storeys moves to the
 * new part (kit anchors by floor, free openings and paint by height); free openings crossing the split are removed.
 */
export function splitStudioPartAtStorey(r:StudioRecipe,partId:string,floor:number,newId:string,d:Design={groundHeight:3,upperHeight:3}):{recipe:StudioRecipe;removed:OutlineRemoval[]}|{reason:string}{
 const v=r.volumes.find(x=>x.id===partId);
 if(!v||v.operation!=='add')return {reason:'Choose a solid part.'};
 if(floor<=v.startFloor||floor>=v.startFloor+v.spanFloors)return {reason:'Choose a storey inside this part (not its lowest).'};
 if(r.volumes.length>=32)return {reason:'This building has reached its part limit.'};
 const next=structuredClone(r),lower={...v,spanFloors:floor-v.startFloor},upper:SculptVolume={...structuredClone(v),id:newId,startFloor:floor,spanFloors:v.startFloor+v.spanFloors-floor};
 next.volumes=next.volumes.flatMap(x=>x.id===partId?[lower,upper]:[x]);
 if(next.studio.parts[partId])next.studio.parts[newId]=structuredClone(next.studio.parts[partId]);
 const split=sculptFloorBottom(floor,d.groundHeight,d.upperHeight)-sculptFloorBottom(v.startFloor,d.groundHeight,d.upperHeight),s=next.studio;let dropped=0;
 const move=<A extends {shapeId:string;floor:number}>(a:A):A=>a.shapeId===partId&&a.floor>=floor?{...a,shapeId:newId}:a;
 s.openings=s.openings.map(o=>({...o,anchor:move(o.anchor)}));s.surfaces=s.surfaces.map(x=>({...x,anchor:move(x.anchor)}));
 s.assemblies=s.assemblies.map(a=>({...a,anchors:a.anchors.map(move),...(a.exit?{exit:move(a.exit)}:{})}));
 if(s.stamps)s.stamps=s.stamps.map(x=>({...x,anchor:move(x.anchor)}));
 if(next.tileAnchors)next.tileAnchors=next.tileAnchors.map(t=>t.volumeId===partId&&t.floor>=floor?{...t,volumeId:newId}:t);
 next.attachments=next.attachments.map(a=>a.anchor?.shapeId===partId&&a.floor>=floor?{...a,anchor:{...a.anchor,shapeId:newId}}:a);
 if(s.freeOpenings)s.freeOpenings=s.freeOpenings.flatMap(o=>{if(o.shapeId!==partId||o.bottom+o.height<=split+1e-6)return [o];if(o.bottom>=split-1e-6)return [{...o,shapeId:newId,bottom:o.bottom-split}];dropped++;return [];});
 if(dropped&&s.freeTrims)Object.assign(next,pruneFreeTrims(next));
 if(s.paintRegions){const out:typeof s.paintRegions=[];for(const region of s.paintRegions){if(region.shapeId!==partId){out.push(region);continue;}
  const low=region.rects.filter(q=>q[2]<split).map(q=>[q[0],q[1],q[2],Math.min(q[3],split)] as typeof q),high=region.rects.filter(q=>q[3]>split).map(q=>[q[0],q[1],Math.max(0,q[2]-split),q[3]-split] as typeof q);
  if(low.length)out.push({...region,rects:low});if(high.length)out.push({...region,id:low.length?`${region.id}~${newId.slice(0,12)}`:region.id,shapeId:newId,rects:high});}
  s.paintRegions=out;}
 if(s.paintRules)s.paintRules=s.paintRules.map(rule=>{const scope=rule.scope;if(!scope)return rule;return {...rule,scope:{...scope,...(scope.parts?.includes(partId)?{parts:[...scope.parts,newId]}:{}),...(scope.walls?.some(w=>w.partId===partId)?{walls:[...scope.walls,...scope.walls.filter(w=>w.partId===partId).map(w=>({...w,partId:newId}))]}:{})}};});
 if(s.facadeRhythm?.rules)s.facadeRhythm={...s.facadeRhythm,rules:s.facadeRhythm.rules.flatMap(rule=>rule.partId===partId?[rule,{...rule,partId:newId}]:[rule])};
 if(s.variation?.rules)s.variation={...s.variation,rules:s.variation.rules.flatMap(rule=>rule.scope.partId===partId?[rule,{...structuredClone(rule),id:`${rule.id}~${newId.slice(0,12)}`,scope:{...rule.scope,partId:newId,...(rule.scope.faces?{faces:rule.scope.faces.map(f=>f.partId===partId?{...f,partId:newId}:f)}:{})}}]:[rule])};
 // The roof belongs to the top part now.
 if(s.roofOpenings)s.roofOpenings=s.roofOpenings.map(o=>o.partId===partId?{...o,partId:newId}:o);
 if(s.roofDetails)s.roofDetails=s.roofDetails.map(o=>o.partId===partId?{...o,partId:newId}:o);
 return {recipe:next,removed:dropped?[{kind:'window',count:dropped,where:'wall'}]:[]};
}
