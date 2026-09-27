/**
 * Geometry for one studio face with free openings, in face-local metres:
 * x = viewer right along the face, y = up from the part base, z = outward normal
 * (outer skin at +thickness/2, matching the 0.3 m kit tiles centred on the wall line).
 * The wall is the exposed region minus the opening outlines, split into a near band
 * and a far field so the per-vertex `distance` (metres to the nearest opening edge,
 * clamped) interpolates smoothly for the wall wear shader. Frames are swept around
 * the actual outlines, so arches and pointed heads get fitted surrounds.
 * Output is plain typed arrays so the whole build can run in the sculpt worker.
 * Distance LOD packaging: the wall's inner skin is indexed last (`rearStart`), so a far
 * representation can draw only the leading outer skin, caps and reveals; `aperture` holds
 * far-only inset fills for unglazed openings (see cityStudioDetailBatches).
 */
import polygonClipping from 'polygon-clipping';
import type {MultiPolygon,Polygon} from 'polygon-clipping';
// @deno-types="npm:@types/three@0.186.0"
import {Color,ShapeUtils,Vector2} from 'three';
import {freeOpeningOutline,freeRegion,type FreeOpeningGroup,type FreeOpeningStyle,type FreeRect} from './cityStudioFreeOpenings.ts';
import {paintPartition,paintSegmentBreaks,paintSlotAt,splitPaintedTriangles,splitTrianglesAtX,trimPaintColor,type FacePaint} from './cityStudioPaintGeometry.ts';
import type {StudioFinish} from './cityStudioTypes.ts';
import {hashString} from './cityStudioFaceCache.ts';

/** `planar` (curved faces, before bending): per vertex, the opening group whose flat chord plane it belongs to, or -1 (follows the arc). */
export type FreeFaceBuffers={positions:Float32Array;normals:Float32Array;uvs:Float32Array;indices:Uint32Array;distance?:Float32Array;colors?:Float32Array;rearStart?:number;planar?:Int16Array};
export type FreeFaceChannel='wall'|'trim'|'frame'|'glass'|'door';
/** `wallPaint`: painted outer-skin pieces (and their caps/reveals), one buffer per region finish; `wall` keeps the rest. */
export type FreeFaceGeometry=Record<FreeFaceChannel,FreeFaceBuffers>&{triangles:number;aperture?:FreeFaceBuffers;/** Glazed static door leaves (see the door branch). */doorGlass?:FreeFaceBuffers;wallPaint?:{finish:StudioFinish;buffers:FreeFaceBuffers}[];/** Instanced opening detail (built with `instance`): not in the channels. */openings?:FreeFaceOpening[]};
export type FreeFacePalette=Record<FreeOpeningStyle,{trim:string;frame:string}>&{door:string};
export const FREE_FACE={thickness:.3,inset:.2,band:.45,maxDistance:1.5} as const;
export const STYLE_DIMS:Record<FreeOpeningStyle,{surround:number;proud:number}>={stone:{surround:.2,proud:.05},timber:{surround:.13,proud:.04},painted:{surround:.11,proud:.03}};
export const DEFAULT_FREE_PALETTE:FreeFacePalette={stone:{trim:'#d8cdb7',frame:'#4f5552'},timber:{trim:'#6f5039',frame:'#5a3f2c'},painted:{trim:'#efe8da',frame:'#f3efe6'},door:'#4c6456'};

type P2=[number,number];type V3=[number,number,number];type Rgb=[number,number,number];
type Buf={p:number[];n:number[];uv:number[];i:number[];d:number[]|null;c:number[]|null;t:number[]|null};
// Curved faces tag every vertex with the opening group whose flat plane it belongs to (`plane`, -1 = the arc).
let tagging=false,plane=-1;
const buf=(distance=false,colors=false):Buf=>({p:[],n:[],uv:[],i:[],d:distance?[]:null,c:colors?[]:null,t:tagging?[]:null});
function vert(b:Buf,p:V3,n:V3,d:number,c?:Rgb){b.p.push(p[0],p[1],p[2]);b.n.push(n[0],n[1],n[2]);b.uv.push(p[0]+p[2],p[1]);b.d?.push(d);b.t?.push(plane);if(b.c){if(c)b.c.push(c[0],c[1],c[2]);else b.c.push(1,1,1);}return b.p.length/3-1;}
/** Planar quad with optional per-vertex normals; winding follows `facing`. */
function quad(b:Buf,q:V3[],facing:V3,c?:Rgb,normals?:V3[],d=[0,0,0,0]){
 const e1=[q[1][0]-q[0][0],q[1][1]-q[0][1],q[1][2]-q[0][2]],e2=[q[2][0]-q[0][0],q[2][1]-q[0][1],q[2][2]-q[0][2]];
 const cross=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]],flip=cross[0]*facing[0]+cross[1]*facing[1]+cross[2]*facing[2]<0;
 const ids=q.map((p,k)=>vert(b,p,normals?.[k]??facing,d[k],c));
 if(Math.hypot(cross[0],cross[1],cross[2])<1e-12&&q.length===4){const e3=[q[3][0]-q[0][0],q[3][1]-q[0][1],q[3][2]-q[0][2]];if(Math.hypot(e3[0],e3[1],e3[2])<1e-12)return;}
 if(flip)b.i.push(ids[0],ids[2],ids[1],ids[0],ids[3],ids[2]);else b.i.push(ids[0],ids[1],ids[2],ids[0],ids[2],ids[3]);
}
function box(b:Buf,x0:number,x1:number,y0:number,y1:number,z0:number,z1:number,c?:Rgb){
 if(x1-x0<1e-4||y1-y0<1e-4||z1-z0<1e-4)return;
 quad(b,[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],[0,0,1],c);quad(b,[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],[0,0,-1],c);
 quad(b,[[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],[0,1,0],c);quad(b,[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],[0,-1,0],c);
 quad(b,[[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]],[1,0,0],c);quad(b,[[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]],[-1,0,0],c);
}
const openRing=(ring:P2[]):P2[]=>{const out=ring.map(p=>[p[0],p[1]] as P2);if(out.length>1&&Math.hypot(out[0][0]-out.at(-1)![0],out[0][1]-out.at(-1)![1])<1e-9)out.pop();return out.filter((p,i)=>Math.hypot(p[0]-out[(i+out.length-1)%out.length][0],p[1]-out[(i+out.length-1)%out.length][1])>1e-6);};
const ringArea=(r:P2[])=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
const toPolygon=(ring:P2[]):Polygon=>[[...ring,ring[0]].map(p=>[p[0],p[1]] as P2)];
/** Triangulate one polygon with holes; returns counter-clockwise, non-degenerate triangles. */
export function triangulateFreePolygon(poly:Polygon):{points:P2[];triangles:number[]}{
 const rings=poly.map(r=>openRing(r as P2[])).filter(r=>r.length>=3);if(!rings.length)return {points:[],triangles:[]};
 const contour=rings[0].map(p=>new Vector2(p[0],p[1])),holes=rings.slice(1).map(r=>r.map(p=>new Vector2(p[0],p[1])));
 const faces=ShapeUtils.triangulateShape(contour,holes),points=[...contour,...holes.flat()].map(v=>[v.x,v.y] as P2),triangles:number[]=[];
 for(const [a,b,c] of faces){const area=(points[b][0]-points[a][0])*(points[c][1]-points[a][1])-(points[c][0]-points[a][0])*(points[b][1]-points[a][1]);if(Math.abs(area)<1e-9)continue;if(area>0)triangles.push(a,b,c);else triangles.push(a,c,b);}
 return {points,triangles};
}
const bottomEdge=(g:FreeOpeningGroup,a:P2,b:P2)=>g.role==='door'&&a[1]<=g.y0+1e-4&&b[1]<=g.y0+1e-4;
/** Metres from (x,y) to the nearest opening edge (door thresholds excluded), clamped. */
export function freeOpeningDistance(x:number,y:number,groups:FreeOpeningGroup[],max:number=FREE_FACE.maxDistance){
 let best=max;
 for(const g of groups){if(x<g.x0-best||x>g.x1+best||y<g.y0-best||y>g.y1+best)continue;const o=g.outline;
  for(let i=0;i<o.length;i++){const a=o[i],b=o[(i+1)%o.length];if(bottomEdge(g,a,b))continue;const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t));}
 }
 return best;
}
/** Right-hand (outward for CCW) unit normal of each segment. */
const segNormals=(pts:P2[],closed:boolean)=>Array.from({length:closed?pts.length:pts.length-1},(_,i)=>{const a=pts[i],b=pts[(i+1)%pts.length],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(b[1]-a[1])/l,-(b[0]-a[0])/l] as P2;});
/** Per-vertex normals for each segment end: smooth across gentle bends, split at corners. */
function endNormals(normals:P2[],closed:boolean,i:number):[P2,P2]{
 const count=normals.length,n=normals[i],smooth=(m:P2|undefined):P2=>{if(!m||m[0]*n[0]+m[1]*n[1]<Math.cos(Math.PI*40/180))return n;const s:P2=[m[0]+n[0],m[1]+n[1]],l=Math.hypot(s[0],s[1])||1;return [s[0]/l,s[1]/l];};
 return [smooth(i>0?normals[i-1]:closed?normals[count-1]:undefined),smooth(i<count-1?normals[i+1]:closed?normals[0]:undefined)];
}
function offsetLine(pts:P2[],closed:boolean,distance:number):P2[]{
 const normals=segNormals(pts,closed),count=normals.length;
 return pts.map((p,i)=>{const prev=i>0?normals[i-1]:closed?normals[count-1]:undefined,next=i<count?normals[i]:closed?normals[0]:undefined,a=prev??next!,b=next??prev!;let m:P2=[a[0]+b[0],a[1]+b[1]];const l=Math.hypot(m[0],m[1]);m=l<1e-6?a:[m[0]/l,m[1]/l];const s=distance/Math.max(.35,m[0]*a[0]+m[1]*a[1]);return [p[0]+m[0]*s,p[1]+m[1]*s];});
}
/** Sweep a flat band of `width` beside a polyline (side +1 outward/right, -1 inward/left) between two depths. */
function sweepBand(b:Buf,pts:P2[],closed:boolean,width:number,side:1|-1,z0:number,z1:number,c:Rgb,faces:{back?:boolean;inner?:boolean;outer?:boolean;ends?:boolean}){
 const q=offsetLine(pts,closed,width*side),normals=segNormals(pts,closed);
 for(let i=0;i<normals.length;i++){
  const j=(i+1)%pts.length,[na,nb]=endNormals(normals,closed,i),n=normals[i];
  quad(b,[[pts[i][0],pts[i][1],z1],[pts[j][0],pts[j][1],z1],[q[j][0],q[j][1],z1],[q[i][0],q[i][1],z1]],[0,0,1],c);
  if(faces.back)quad(b,[[pts[i][0],pts[i][1],z0],[pts[j][0],pts[j][1],z0],[q[j][0],q[j][1],z0],[q[i][0],q[i][1],z0]],[0,0,-1],c);
  if(faces.inner)quad(b,[[pts[i][0],pts[i][1],z0],[pts[j][0],pts[j][1],z0],[pts[j][0],pts[j][1],z1],[pts[i][0],pts[i][1],z1]],[-n[0]*side,-n[1]*side,0],c,[[-na[0]*side,-na[1]*side,0],[-nb[0]*side,-nb[1]*side,0],[-nb[0]*side,-nb[1]*side,0],[-na[0]*side,-na[1]*side,0]]);
  if(faces.outer)quad(b,[[q[i][0],q[i][1],z0],[q[j][0],q[j][1],z0],[q[j][0],q[j][1],z1],[q[i][0],q[i][1],z1]],[n[0]*side,n[1]*side,0],c,[[na[0]*side,na[1]*side,0],[nb[0]*side,nb[1]*side,0],[nb[0]*side,nb[1]*side,0],[na[0]*side,na[1]*side,0]]);
 }
 // End caps face away from the path (start: backwards along the first segment).
 if(!closed&&faces.ends)for(const k of [0,pts.length-1]){const s=k?pts[k-1]:pts[1],e=pts[k],l=Math.hypot(e[0]-s[0],e[1]-s[1])||1;quad(b,[[pts[k][0],pts[k][1],z0],[q[k][0],q[k][1],z0],[q[k][0],q[k][1],z1],[pts[k][0],pts[k][1],z1]],[(e[0]-s[0])/l,(e[1]-s[1])/l,0],c);}
}
/** Door outlines open along the threshold: the ring from the first non-threshold vertex. */
function openingPath(g:FreeOpeningGroup,o:P2[]=g.outline):{points:P2[];closed:boolean}{
 const n=o.length;if(g.role!=='door')return {points:o,closed:true};
 const bottom=(i:number)=>bottomEdge(g,o[(i+n)%n],o[(i+1+n)%n]);let start=-1;
 for(let i=0;i<n;i++)if(bottom(i-1)&&!bottom(i)){start=i;break;}
 if(start<0)return {points:o,closed:true};
 const points:P2[]=[];for(let k=0;k<n;k++){const i=(start+k)%n;points.push(o[i]);if(bottom(i))break;}
 return {points,closed:false};
}
function fill(b:Buf,poly:Polygon,z:number,c?:Rgb,back=true){const {points,triangles}=triangulateFreePolygon(poly);
 const front=points.map(p=>vert(b,[p[0],p[1],z],[0,0,1],0,c));for(let i=0;i<triangles.length;i+=3)b.i.push(front[triangles[i]],front[triangles[i+1]],front[triangles[i+2]]);
 if(back){const rear=points.map(p=>vert(b,[p[0],p[1],z],[0,0,-1],0,c));for(let i=0;i<triangles.length;i+=3)b.i.push(rear[triangles[i]],rear[triangles[i+2]],rear[triangles[i+1]]);}
}
const clipAbove=(ring:P2[],y:number,above:boolean):MultiPolygon=>{const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),x0=Math.min(...xs)-1,x1=Math.max(...xs)+1,lo=above?y:Math.min(...ys)-1,hi=above?Math.max(...ys)+1:y;try{return polygonClipping.intersection(toPolygon(ring),toPolygon([[x0,lo],[x1,lo],[x1,hi],[x0,hi]]));}catch{return [];}};
/**
 * Region minus holes, fast for the common kit case: a hole that is an axis-aligned rectangle strictly inside one region
 * polygon (clear of its rings and of every other hole) is just added to that polygon as a hole ring, no clipping sweep.
 * The rest (holes at the region edge such as doors, abutting tiles, shaped or facet-refined outlines) are clipped
 * first; the added holes stay clear of the clipped edges, which lie on the other holes or the region.
 */
function holesInside(reg:MultiPolygon,holes:Polygon[]):MultiPolygon{
 const eps=1e-4,rects:([number,number,number,number]|null)[]=holes.map(h=>{const ring=openRing(h[0] as P2[]);if(ring.length!==4)return null;const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),r:[number,number,number,number]=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
  return ring.some(p=>(Math.abs(p[0]-r[0])>1e-9&&Math.abs(p[0]-r[1])>1e-9)||(Math.abs(p[1]-r[2])>1e-9&&Math.abs(p[1]-r[3])>1e-9))?null:r;});
 // Bounding boxes of every hole (shaped ones too), to keep added holes clear of all others.
 const boxes=holes.map(h=>{const ring=h[0] as P2[],xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);return [Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)] as [number,number,number,number];});
 const order=boxes.map((_,i)=>i).sort((a,b)=>boxes[a][0]-boxes[b][0]),clear=rects.map(r=>!!r);
 for(let i=0;i<order.length;i++)for(let j=i+1;j<order.length&&boxes[order[j]][0]<=boxes[order[i]][1]+eps;j++){const a=boxes[order[i]],b=boxes[order[j]];if(a[2]<=b[3]+eps&&b[2]<=a[3]+eps){clear[order[i]]=false;clear[order[j]]=false;}}
 // Segment a-b within eps of rectangle r (Liang-Barsky clip against r inflated by eps).
 const touches=(a:P2,b:P2,r:[number,number,number,number])=>{let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];
  for(const [p,q] of [[-dx,a[0]-(r[0]-eps)],[dx,r[1]+eps-a[0]],[-dy,a[1]-(r[2]-eps)],[dy,r[3]+eps-a[1]]] as [number,number][]){if(Math.abs(p)<1e-15){if(q<0)return false;continue;}const t=q/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t;}else{if(t<t0)return false;if(t<t1)t1=t;}}return true;};
 const inside=(p:P2,ring:P2[])=>{let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
 const rings=reg.map(poly=>poly.map(r=>openRing(r as P2[]))),owners=holes.map(()=>-1);
 for(let k=0;k<holes.length;k++){
  const r=rects[k];if(!r||!clear[k])continue;
  const centre:P2=[(r[0]+r[1])/2,(r[2]+r[3])/2],owner=rings.findIndex(poly=>inside(centre,poly[0])&&!poly.slice(1).some(hole=>inside(centre,hole)));
  if(owner>=0&&!rings[owner].some(ring=>ring.some((a,i)=>touches(a,ring[(i+1)%ring.length],r))))owners[k]=owner;
 }
 const rest=holes.filter((_,k)=>owners[k]<0);if(!owners.some(o=>o>=0))return polygonClipping.difference(reg,...holes);
 const clipped=rest.length?polygonClipping.difference(reg,...rest):reg;
 if(clipped!==reg){
  // Re-home the added holes in the clipped polygons (clipping can split a region polygon).
  const out=clipped.map(poly=>[...poly]),outRings=clipped.map(poly=>openRing(poly[0] as P2[]));
  for(let k=0;k<holes.length;k++){if(owners[k]<0)continue;const r=rects[k]!,centre:P2=[(r[0]+r[1])/2,(r[2]+r[3])/2],i=outRings.findIndex(ring=>inside(centre,ring));if(i<0)return polygonClipping.difference(reg,...holes);out[i].push(holes[k][0]);}
  return out;
 }
 return reg.map((poly,i)=>[...poly,...holes.filter((_,k)=>owners[k]===i).map(h=>h[0])]);
}
/** Parameters (0..1, exclusive) where segment a-b crosses a facet break. */
function facetBreaks(breaks:readonly number[]|undefined,a:P2,b:P2):number[]{
 if(!breaks?.length)return [];const dx=b[0]-a[0];if(Math.abs(dx)<1e-9)return [];
 const out:number[]=[];for(const x of breaks){const t=(x-a[0])/dx;if(t>1e-5&&t<1-1e-5)out.push(t);}return out;
}
const rgbMemo=new Map<string,Rgb>();
/** Linear RGB of a hex colour (memoised, shared read-only arrays). */
const rgb=(hex:string):Rgb=>{let v=rgbMemo.get(hex);if(!v){const c=new Color(hex);v=[c.r,c.g,c.b];rgbMemo.set(hex,v);}return v;};
const pack=(b:Buf,rearStart?:number):FreeFaceBuffers=>({positions:new Float32Array(b.p),normals:new Float32Array(b.n),uvs:new Float32Array(b.uv),indices:new Uint32Array(b.i),...(b.d?{distance:new Float32Array(b.d)}:{}),...(b.c?{colors:new Float32Array(b.c)}:{}),...(rearStart!==undefined?{rearStart}:{}),...(b.t?.some(v=>v>=0)?{planar:new Int16Array(b.t)}:{})});
/** Outline with extra vertices where it crosses a facet break, so a bent hole edge follows the arc. */
function refineOutline(o:P2[],breaks:readonly number[]):P2[]{
 const out:P2[]=[];for(let i=0;i<o.length;i++){const a=o[i],b=o[(i+1)%o.length];out.push(a);for(const t of facetBreaks(breaks,a,b))out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}return out;
}

/**
 * `breaks` (curved faces): sorted face-x lines where skins, caps and hole outlines are split, one strip per facet
 * of the bend (cityStudioCurvedWalls); vertices of flat opening parts are tagged `planar` with their group index.
 * `seam` (curved faces): the face is an unrolled ring, so its x = 0 and x = L ends meet and get no end caps.
 */
export type FreeFaceBuildOptions={/** Leave each opening group's own detail out of the channels and list it as `openings` instead (cityStudioOpeningPieces). */instance?:{openable:boolean;/** authored interiors behind the face: dark aperture fills draw far only (see-through into rooms near) */interior?:boolean}};
export function buildFreeOpeningFaceGeometry(face:{length:number;height:number;region?:FreeRect[];thickness?:number;breaks?:readonly number[];seam?:boolean},groups:FreeOpeningGroup[],palette:FreeFacePalette=DEFAULT_FREE_PALETTE,paint?:FacePaint,options:FreeFaceBuildOptions={}):FreeFaceGeometry{
 tagging=!!face.breaks?.length;plane=-1;
 try{return buildFace(face,groups,palette,paint,options);}finally{tagging=false;plane=-1;}
}
function buildFace(face:{length:number;height:number;region?:FreeRect[];thickness?:number;breaks?:readonly number[];seam?:boolean},groups:FreeOpeningGroup[],palette:FreeFacePalette,paint:FacePaint|undefined,options:FreeFaceBuildOptions):FreeFaceGeometry{
 // Curved faces: hole outlines gain vertices at every facet break (the wall, reveals and surrounds follow the arc).
 const outlines=new Map(groups.map(g=>[g,face.breaks?.length?refineOutline(g.outline,face.breaks):g.outline]));
 const t=(face.thickness??FREE_FACE.thickness)/2,zg=t-FREE_FACE.inset,L=face.length,H=face.height;
 // Wear (stone through plaster) frames shaped openings only: kit pieces bring their own finished surround.
 const wearGroups=groups.filter(g=>!g.module);
 // Region paint: the outer skin is split per finish run; caps and reveals follow the topmost region at their midpoint.
 const partition=paint?.wall.length?paintPartition(L,H,paint.wall,paint.base):null,paintBufs=partition?partition.slots.map(()=>buf(true)):[],skinAt=(x:number,y:number)=>{const s=paintSlotAt(partition,x,y);return s<0?wall:paintBufs[s];};
 const wall=buf(true),trim=buf(false,true),frame=buf(false,true),glass=buf(),door=buf(false,true),doorGlass=buf(),aperture=buf(),rear:number[]=[];
 const region:MultiPolygon=face.region?.length?freeRegion(face.region):[toPolygon([[0,0],[L,0],[L,H],[0,H]])];
 // Far field (plain wall) and near band (around openings) minus the holes.
 // Two sweeps: the far field is the region minus bands and holes; the near band is the rest minus the holes. Kit
 // apertures get no band: the wear band frames shaped openings only, so their wall is uniform (one sweep).
 const carve=(reg:MultiPolygon,gs:FreeOpeningGroup[]):{far:MultiPolygon;near:MultiPolygon}=>{
  if(!gs.length)return {far:reg,near:[]};
  const holes=gs.map(g=>toPolygon(outlines.get(g)!)),bands:Polygon[]=gs.filter(g=>!g.module).flatMap(g=>[...g.panels.map(p=>toPolygon(freeOpeningOutline({...p,y0:g.y0},FREE_FACE.band))),...(g.panels.length>1?[toPolygon(freeOpeningOutline({shape:'rect',x0:g.x0,x1:g.x1,y0:g.y0,y1:g.spring,rise:0},FREE_FACE.band))]:[])]);
  try{
   if(!bands.length)return {far:holesInside(reg,holes),near:[]};
   const far=polygonClipping.difference(reg,...bands,...holes);return {far,near:polygonClipping.difference(reg,far,...holes)};
  }catch{return {far:polygonClipping.difference(reg,...holes),near:[]};}
 };
 let far:MultiPolygon=region,near:MultiPolygon=[];
 if(face.breaks?.length&&groups.length){
  // Curved faces: carve per vertical zone (openings with their band, and plain wall between) so the wall between
  // openings triangulates as short strips instead of face-long slivers that the facet split would shred.
  const pad=FREE_FACE.band+.05,zones:{a:number;b:number;gs:FreeOpeningGroup[]}[]=[];
  for(const g of [...groups].sort((p,q)=>p.x0-q.x0)){const a=Math.max(0,g.x0-pad),b=Math.min(L,g.x1+pad),last=zones.at(-1);if(last&&a<=last.b){last.b=Math.max(last.b,b);last.gs.push(g);}else zones.push({a,b,gs:[g]});}
  const rects:FreeRect[]=face.region?.length?face.region:[[0,L,0,H]],cuts:{a:number;b:number;gs:FreeOpeningGroup[]}[]=[];let at=0;
  for(const z of zones){if(z.a>at)cuts.push({a:at,b:z.a,gs:[]});cuts.push(z);at=z.b;}if(at<L)cuts.push({a:at,b:L,gs:[]});
  far=[];for(const c of cuts){const reg=freeRegion(rects.map(r=>[Math.max(r[0],c.a),Math.min(r[1],c.b),r[2],r[3]] as FreeRect));if(!reg.length)continue;const piece=carve(reg,c.gs);far.push(...piece.far);near.push(...piece.near);}
 }else ({far,near}=carve(region,groups));
 // Wall skins: outer at +t, inner at -t (interiors see a finished wall), distance per vertex.
 // Skins: each polygon is triangulated once; the outer skin is split per paint run when painted.
 const skin=(target:Buf,points:P2[],triangles:number[],d:number[],outer:boolean)=>{const z=outer?t:-t,ids=points.map((p,k)=>vert(target,[p[0],p[1],z],[0,0,outer?1:-1],d[k]));
  for(let i=0;i<triangles.length;i+=3)if(outer)target.i.push(ids[triangles[i]],ids[triangles[i+1]],ids[triangles[i+2]]);else rear.push(ids[triangles[i]],ids[triangles[i+2]],ids[triangles[i+1]]);};
 for(const poly of [...far,...near]){let {points,triangles}=triangulateFreePolygon(poly);if(!triangles.length)continue;let d=points.map(p=>freeOpeningDistance(p[0],p[1],wearGroups));
  if(face.breaks?.length)({points,triangles,distance:d}=splitTrianglesAtX(points,triangles,d,face.breaks));
  if(!partition)skin(wall,points,triangles,d,true);else for(const [slot,piece] of splitPaintedTriangles(points,triangles,d,partition))skin(slot<0?wall:paintBufs[slot],piece.points,piece.triangles,piece.distance,true);
  skin(wall,points,triangles,d,false);}
 // Caps close the slab on the exposed perimeter (not the base line).
 for(const poly of region)poly.forEach((raw,k)=>{let ring=openRing(raw as P2[]);if((ringArea(ring)>0)!==(k===0))ring=ring.reverse();const n=segNormals(ring,true);
  ring.forEach((a0,i)=>{const b0=ring[(i+1)%ring.length];if(a0[1]<1e-4&&b0[1]<1e-4)return;
   if(face.seam&&Math.abs(a0[0]-b0[0])<1e-6&&(a0[0]<1e-4||a0[0]>L-1e-4))return;
   // Painted faces split each cap where it crosses a region edge, so corners follow the paint.
   const ts=[0,...paintSegmentBreaks(partition,a0,b0),...facetBreaks(face.breaks,a0,b0),1].sort((x,y)=>x-y).filter((t,k,all)=>!k||t-all[k-1]>1e-5);
   for(let s=0;s+1<ts.length;s++){const a:P2=[a0[0]+(b0[0]-a0[0])*ts[s],a0[1]+(b0[1]-a0[1])*ts[s]],b:P2=[a0[0]+(b0[0]-a0[0])*ts[s+1],a0[1]+(b0[1]-a0[1])*ts[s+1]],da=freeOpeningDistance(a[0],a[1],wearGroups),db=freeOpeningDistance(b[0],b[1],wearGroups);
    quad(skinAt((a[0]+b[0])/2-n[i][0]*.01,(a[1]+b[1])/2-n[i][1]*.01),[[a[0],a[1],-t],[b[0],b[1],-t],[b[0],b[1],t],[a[0],a[1],t]],[n[i][0],n[i][1],0],undefined,undefined,[da,db,db,da]);}});});
 const openings:FreeFaceOpening[]=[],curved=!!face.breaks?.length,thickness=face.thickness??FREE_FACE.thickness;
 groups.forEach((g,gi)=>{
  plane=-1;
  const style=palette[g.style],dims0=STYLE_DIMS[g.style].surround+.12,trimTone=rgb(trimPaintColor(paint?.trim,[g.x0-dims0,g.x1+dims0,g.y0-dims0,g.y1+dims0],g.style==='painted')??style.trim),frameTone=rgb(style.frame),dims=STYLE_DIMS[g.style],o=outlines.get(g)!,path=openingPath(g,o),normals=segNormals(o,true);
  // Reveal: the real hole sides, facing into the opening (wall material, distance 0 = full wear).
  for(let i=0;i<o.length;i++){const a=o[i],b=o[(i+1)%o.length];if(bottomEdge(g,a,b))continue;const [na,nb]=endNormals(normals,true,i),n=normals[i];
   quad(skinAt((a[0]+b[0])/2+n[0]*.01,(a[1]+b[1])/2+n[1]*.01),[[a[0],a[1],t],[b[0],b[1],t],[b[0],b[1],-t],[a[0],a[1],-t]],[-n[0],-n[1],0],undefined,[[-na[0],-na[1],0],[-nb[0],-nb[1],0],[-nb[0],-nb[1],0],[-na[0],-na[1],0]],g.module?[FREE_FACE.maxDistance,FREE_FACE.maxDistance,FREE_FACE.maxDistance,FREE_FACE.maxDistance]:undefined);}
  // Kit pieces bring their own surround, frame, glass and leaf (cityStudioModuleSpec): the wall keeps only the reveal.
  if(g.module)return;
  const leafTone=rgb(palette.door);
  if(options.instance){
   // Instanced (cityStudioOpeningPieces): the opening's own detail is one canonical piece placed by a transform.
   // A curved face keeps its surround here, because the surround follows the arc (everything else is planar).
   if(curved)sweepBand(trim,path.points,path.closed,dims.surround,1,t,t+dims.proud,trimTone,{inner:true,outer:true,ends:true});
   const spec=openingPieceSpec(g,{openable:options.instance.openable,interior:!!options.instance.interior,surround:!curved,thickness});
   openings.push({group:gi,key:spec.key,x:spec.x,y:spec.y,trim:trimTone,frame:frameTone,door:leafTone});
   return;
  }
  emitOpeningDetail({trim,frame,glass,door,doorGlass,aperture},g,path,o===g.outline?path:openingPath(g),{trim:trimTone,frame:frameTone,door:leafTone},t,zg,gi,true);
  plane=-1;
 });
 // Inner skin last: everything before rearStart is visible from outside.
 const rearStart=wall.i.length;for(const i of rear)wall.i.push(i);
 const out={wall:pack(wall,rearStart),trim:pack(trim),frame:pack(frame),glass:pack(glass),door:pack(door)};
 const wallPaint=partition?partition.slots.map((s,k)=>({finish:s.finish,buffers:pack(paintBufs[k])})).filter(p=>p.buffers.indices.length):[];
 return {...out,triangles:Object.values(out).reduce((s,b)=>s+b.indices.length/3,0)+wallPaint.reduce((s,p)=>s+p.buffers.indices.length/3,0)+doorGlass.i.length/3,...(aperture.i.length?{aperture:pack(aperture)}:{}),...(doorGlass.i.length?{doorGlass:pack(doorGlass)}:{}),...(wallPaint.length?{wallPaint}:{}),...(options.instance?{openings}:{})};
}
type DetailBufs={trim:Buf;frame:Buf;glass:Buf;door:Buf;doorGlass:Buf;aperture:Buf};
/**
 * One opening group's own detail: surround (optional), frame, mullions, sill, glass or dark aperture fill, glazing
 * bars and the static door leaf. `path` is the surround's path (the facet-refined outline on curved faces),
 * `flatPath` the frame's; `gi` tags the planar parts on curved faces. Colours are the tones given (the canonical
 * pieces pass slot tokens, see OPENING_TINT).
 */
/**
 * The size thresholds of an opening's detail (vertical glazing bar on wide panels, transom bar on arched or tall
 * panels, arched door leaf, wide double door). Taken from the group as built: a canonical piece is quantised, and a
 * dimension exactly on a threshold (a 0.85 m rhythm panel) could otherwise fall the other way.
 */
export type OpeningDecisions={bars:boolean[];transoms:(0|1|2)[];arched:boolean;wideDoor:boolean};
export const openingDecisions=(g:FreeOpeningGroup):OpeningDecisions=>({bars:g.panels.map(p=>p.x1-p.x0>.85),transoms:g.panels.map(p=>p.rise>.1?1:p.y1-g.y0>1.5?2:0),arched:g.spring<g.y1-.1,wideDoor:g.x1-g.x0>1.5});
function emitOpeningDetail(b:DetailBufs,g:FreeOpeningGroup,path:{points:P2[];closed:boolean},flatPath:{points:P2[];closed:boolean},tone:{trim:Rgb;frame:Rgb;door:Rgb},t:number,zg:number,gi:number,surround:boolean,d:OpeningDecisions=openingDecisions(g)){
 const {trim,frame,glass,door,doorGlass,aperture}=b,dims=STYLE_DIMS[g.style],trimTone=tone.trim,frameTone=tone.frame;
 // Surround on the facade and a slim frame at the glazing line, both following the outline.
 if(surround)sweepBand(trim,path.points,path.closed,dims.surround,1,t,t+dims.proud,trimTone,{inner:true,outer:true,ends:true});
 // Everything below sits on the opening's flat plane on curved faces (frames, sill, mullions, glass, leaves).
 // (planar parts need no facet vertices: they map onto one plane)
 plane=gi;
 sweepBand(frame,flatPath.points,flatPath.closed,.075,-1,zg-.04,zg+.04,frameTone,{back:true,outer:true,ends:true});
 for(const m of g.mullions)box(trim,m.x-.07,m.x+.07,m.y0,m.y1,zg-.05,t+Math.min(.02,dims.proud),trimTone);
 if(g.role==='window'&&!(g.panels.length===1&&g.panels[0].shape==='round'))box(trim,g.x0-.12,g.x1+.12,g.y0-.08,g.y0,zg,t+.09,trimTone);
 if(g.role==='window'){
  if(g.glazing)fill(glass,toPolygon(g.outline),zg);else fill(aperture,toPolygon(g.outline),zg,undefined,false);
  if(g.glazing)g.panels.forEach((p,k)=>{const y0=g.y0,w=.045,cx=(p.x0+p.x1)/2,cy=(p.y0+p.y1)/2,r=Math.min(p.x1-p.x0,p.y1-p.y0)/2;
   if(p.shape==='round'){box(frame,cx-w/2,cx+w/2,cy-r,cy+r,zg-.025,zg+.025,frameTone);box(frame,cx-r,cx+r,cy-w/2,cy+w/2,zg-.025,zg+.025,frameTone);return;}
   if(d.bars[k])box(frame,cx-w/2,cx+w/2,y0,p.y1,zg-.025,zg+.025,frameTone);
   const bar=d.transoms[k]===1?p.spring:d.transoms[k]===2?y0+(p.y1-y0)*.62:null;if(bar!==null)box(frame,p.x0,p.x1,bar-w/2,bar+w/2,zg-.025,zg+.025,frameTone);});
 }else if(g.style==='stone'){
  // Stone doorways are open arcades: no leaf and no glass; the far view fills the hole dark.
  fill(aperture,toPolygon(g.outline),zg,undefined,false);
 }else{
  // The static leaf is everything below the spring (`door`, or `doorGlass` when glazed, with rail/bar/handle in
  // `door`); an openable portal replaces it near the camera (freeDoorLeaves). Fanlight and transom stay fixed.
  const leafTone=tone.door,arched=d.arched;
  for(const poly of arched?clipAbove(g.outline,g.spring,false):[toPolygon(g.outline)])fill(g.glazing?doorGlass:door,poly,zg,g.glazing?undefined:leafTone);
  if(arched){for(const poly of clipAbove(g.outline,g.spring,true))fill(glass,poly,zg);box(frame,g.x0,g.x1,g.spring-.05,g.spring+.05,zg-.04,zg+.04,frameTone);}
  if(!g.glazing){const rail=Math.min(1,g.spring*.45);box(door,g.x0,g.x1,rail-.04,rail+.04,zg,zg+.035,frameTone);
   if(d.wideDoor&&!g.mullions.length)box(door,(g.x0+g.x1)/2-.04,(g.x0+g.x1)/2+.04,0,g.spring,zg-.04,zg+.04,frameTone);
   const hx=d.wideDoor?(g.x0+g.x1)/2+.14:g.x1-.2;box(door,hx-.03,hx+.03,.98,1.1,zg,zg+.07,HANDLE);}
 }
 plane=-1;
}
const HANDLE:Rgb=rgb('#c9b27a');

/**
 * Instanced opening detail (docs/city-generated-walls-at-scale.md, "Instanced openings"). `x`/`y`: face position of
 * the canonical piece's origin; the tones are per instance (a trim paint region, the palette's frame and door).
 */
export type FreeFaceOpening={group:number;key:string;x:number;y:number;trim:Rgb;frame:Rgb;door:Rgb};
/** `interior`: the building has authored rooms, so unglazed apertures show them near (dark fill far only); without
 * interiors the dark fill closes the aperture near as well (no void behind the wall). */
export type OpeningPieceOptions={openable:boolean;interior?:boolean;surround:boolean;thickness:number};
/** Switch for measurements and tests: off builds every opening's detail into its face channels as before. */
export const OPENING_INSTANCING={enabled:true};
/** Vertex colour tokens of the canonical pieces: the tinted parts carry their slot (1 trim, 2 frame, 3 door leaf). */
export const OPENING_TINT={trim:[-1,0,0] as Rgb,frame:[-2,0,0] as Rgb,door:[-3,0,0] as Rgb};
const qm=(v:number)=>Math.round(v*1e4)/1e4;
/**
 * Canonical form of an opening group: every coordinate relative to the piece origin (x0, and y0 for windows; doors
 * keep face heights, since rail and handle heights are measured from the base) and quantised to 0.1 mm, so the
 * geometry is a pure function of the key whichever building built it first.
 */
export function openingPieceSpec(g:FreeOpeningGroup,o:OpeningPieceOptions):{key:string;x:number;y:number;group:FreeOpeningGroup;decisions:OpeningDecisions}{
 const x=g.x0,y=g.role==='door'?0:g.y0,px=(v:number)=>qm(v-x),py=(v:number)=>qm(v-y);
 const group:FreeOpeningGroup={id:'piece',members:[],role:g.role,style:g.style,glazing:g.glazing,clamped:false,x0:0,x1:px(g.x1),y0:py(g.y0),y1:py(g.y1),spring:py(g.spring),
  panels:g.panels.map(p=>({id:'',shape:p.shape,x0:px(p.x0),x1:px(p.x1),y0:py(p.y0),y1:py(p.y1),rise:qm(p.rise),spring:py(p.spring),clamped:false})),
  mullions:g.mullions.map(m=>({x:px(m.x),y0:py(m.y0),y1:py(m.y1)})),outline:g.outline.map(([a,b])=>[px(a),py(b)] as [number,number])};
 const decisions=openingDecisions(g);
 const key='o'+hashString(JSON.stringify([2,o.openable,!!o.interior,o.surround,qm(o.thickness),group.role,group.style,group.glazing,group.x1,group.y0,group.y1,group.spring,group.panels.map(p=>[p.shape,p.x0,p.x1,p.y0,p.y1,p.rise,p.spring]),group.mullions.map(m=>[m.x,m.y0,m.y1]),group.outline,decisions]));
 return {key,x,y,group,decisions};
}
/** Channels of one canonical opening piece (face-space around its origin, tints as OPENING_TINT tokens). */
export function buildOpeningPieceChannels(group:FreeOpeningGroup,o:OpeningPieceOptions,decisions=openingDecisions(group)):{trim:FreeFaceBuffers;frame:FreeFaceBuffers;glass:FreeFaceBuffers;door:FreeFaceBuffers;doorGlass:FreeFaceBuffers;aperture:FreeFaceBuffers}{
 tagging=false;plane=-1;
 const t=o.thickness/2,zg=t-FREE_FACE.inset,b:DetailBufs={trim:buf(false,true),frame:buf(false,true),glass:buf(),door:buf(false,true),doorGlass:buf(),aperture:buf()},path=openingPath(group);
 emitOpeningDetail(b,group,path,path,OPENING_TINT,t,zg,-1,o.surround,decisions);
 return {trim:pack(b.trim),frame:pack(b.frame),glass:pack(b.glass),door:pack(b.door),doorGlass:pack(b.doorGlass),aperture:pack(b.aperture)};
}
