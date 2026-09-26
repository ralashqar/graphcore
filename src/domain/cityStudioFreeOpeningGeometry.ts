/**
 * Geometry for one studio face with free openings, in face-local metres:
 * x = viewer right along the face, y = up from the part base, z = outward normal
 * (outer skin at +thickness/2, matching the 0.3 m kit tiles centred on the wall line).
 * The wall is the exposed region minus the opening outlines, split into a near band
 * and a far field so the per-vertex `distance` (metres to the nearest opening edge,
 * clamped) interpolates smoothly for the wall wear shader. Frames are swept around
 * the actual outlines, so arches and pointed heads get fitted surrounds.
 * Output is plain typed arrays so the whole build can run in the sculpt worker.
 */
import polygonClipping from 'polygon-clipping';
import type {MultiPolygon,Polygon} from 'polygon-clipping';
// @deno-types="npm:@types/three@0.186.0"
import {Color,ShapeUtils,Vector2} from 'three';
import {freeOpeningOutline,freeRegion,type FreeOpeningGroup,type FreeOpeningStyle,type FreeRect} from './cityStudioFreeOpenings.ts';

export type FreeFaceBuffers={positions:Float32Array;normals:Float32Array;uvs:Float32Array;indices:Uint32Array;distance?:Float32Array;colors?:Float32Array};
export type FreeFaceChannel='wall'|'trim'|'frame'|'glass'|'door';
export type FreeFaceGeometry=Record<FreeFaceChannel,FreeFaceBuffers>&{triangles:number};
export type FreeFacePalette=Record<FreeOpeningStyle,{trim:string;frame:string}>&{door:string};
export const FREE_FACE={thickness:.3,inset:.2,band:.45,maxDistance:1.5} as const;
export const STYLE_DIMS:Record<FreeOpeningStyle,{surround:number;proud:number}>={stone:{surround:.2,proud:.05},timber:{surround:.13,proud:.04},painted:{surround:.11,proud:.03}};
export const DEFAULT_FREE_PALETTE:FreeFacePalette={stone:{trim:'#d8cdb7',frame:'#4f5552'},timber:{trim:'#6f5039',frame:'#5a3f2c'},painted:{trim:'#efe8da',frame:'#f3efe6'},door:'#4c6456'};

type P2=[number,number];type V3=[number,number,number];type Rgb=[number,number,number];
type Buf={p:number[];n:number[];uv:number[];i:number[];d:number[]|null;c:number[]|null};
const buf=(distance=false,colors=false):Buf=>({p:[],n:[],uv:[],i:[],d:distance?[]:null,c:colors?[]:null});
function vert(b:Buf,p:V3,n:V3,d:number,c?:Rgb){b.p.push(p[0],p[1],p[2]);b.n.push(n[0],n[1],n[2]);b.uv.push(p[0]+p[2],p[1]);b.d?.push(d);if(b.c){if(c)b.c.push(c[0],c[1],c[2]);else b.c.push(1,1,1);}return b.p.length/3-1;}
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
function openingPath(g:FreeOpeningGroup):{points:P2[];closed:boolean}{
 const o=g.outline,n=o.length;if(g.role!=='door')return {points:o,closed:true};
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
const rgb=(hex:string):Rgb=>{const c=new Color(hex);return [c.r,c.g,c.b];};
const pack=(b:Buf):FreeFaceBuffers=>({positions:new Float32Array(b.p),normals:new Float32Array(b.n),uvs:new Float32Array(b.uv),indices:new Uint32Array(b.i),...(b.d?{distance:new Float32Array(b.d)}:{}),...(b.c?{colors:new Float32Array(b.c)}:{})});

export function buildFreeOpeningFaceGeometry(face:{length:number;height:number;region?:FreeRect[];thickness?:number},groups:FreeOpeningGroup[],palette:FreeFacePalette=DEFAULT_FREE_PALETTE):FreeFaceGeometry{
 const t=(face.thickness??FREE_FACE.thickness)/2,zg=t-FREE_FACE.inset,L=face.length,H=face.height;
 const wall=buf(true),trim=buf(false,true),frame=buf(false,true),glass=buf(),door=buf(false,true);
 const region:MultiPolygon=face.region?.length?freeRegion(face.region):[toPolygon([[0,0],[L,0],[L,H],[0,H]])];
 let far:MultiPolygon=region,near:MultiPolygon=[];
 if(groups.length){
  const holes=groups.map(g=>toPolygon(g.outline)),bands:Polygon[]=groups.flatMap(g=>[...g.panels.map(p=>toPolygon(freeOpeningOutline({...p,y0:g.y0},FREE_FACE.band))),...(g.panels.length>1?[toPolygon(freeOpeningOutline({shape:'rect',x0:g.x0,x1:g.x1,y0:g.y0,y1:g.spring,rise:0},FREE_FACE.band))]:[])]);
  try{const band=polygonClipping.union(bands[0],...bands.slice(1)),hole=polygonClipping.union(holes[0],...holes.slice(1));far=polygonClipping.difference(region,band,hole);near=polygonClipping.difference(polygonClipping.intersection(region,band),hole);}
  catch{far=polygonClipping.difference(region,...holes);near=[];}
 }
 // Wall skins: outer at +t, inner at -t (interiors see a finished wall), distance per vertex.
 for(const poly of [...far,...near]){const {points,triangles}=triangulateFreePolygon(poly);if(!triangles.length)continue;
  const d=points.map(p=>freeOpeningDistance(p[0],p[1],groups)),front=points.map((p,k)=>vert(wall,[p[0],p[1],t],[0,0,1],d[k])),rear=points.map((p,k)=>vert(wall,[p[0],p[1],-t],[0,0,-1],d[k]));
  for(let i=0;i<triangles.length;i+=3){wall.i.push(front[triangles[i]],front[triangles[i+1]],front[triangles[i+2]],rear[triangles[i]],rear[triangles[i+2]],rear[triangles[i+1]]);}
 }
 // Caps close the slab on the exposed perimeter (not the base line).
 for(const poly of region)poly.forEach((raw,k)=>{let ring=openRing(raw as P2[]);if((ringArea(ring)>0)!==(k===0))ring=ring.reverse();const n=segNormals(ring,true);
  ring.forEach((a,i)=>{const b=ring[(i+1)%ring.length];if(a[1]<1e-4&&b[1]<1e-4)return;const da=freeOpeningDistance(a[0],a[1],groups),db=freeOpeningDistance(b[0],b[1],groups);quad(wall,[[a[0],a[1],-t],[b[0],b[1],-t],[b[0],b[1],t],[a[0],a[1],t]],[n[i][0],n[i][1],0],undefined,undefined,[da,db,db,da]);});});
 for(const g of groups){
  const style=palette[g.style],trimTone=rgb(style.trim),frameTone=rgb(style.frame),dims=STYLE_DIMS[g.style],path=openingPath(g),o=g.outline,normals=segNormals(o,true);
  // Reveal: the real hole sides, facing into the opening (wall material, distance 0 = full wear).
  for(let i=0;i<o.length;i++){const a=o[i],b=o[(i+1)%o.length];if(bottomEdge(g,a,b))continue;const [na,nb]=endNormals(normals,true,i),n=normals[i];
   quad(wall,[[a[0],a[1],t],[b[0],b[1],t],[b[0],b[1],-t],[a[0],a[1],-t]],[-n[0],-n[1],0],undefined,[[-na[0],-na[1],0],[-nb[0],-nb[1],0],[-nb[0],-nb[1],0],[-na[0],-na[1],0]]);}
  // Surround on the facade and a slim frame at the glazing line, both following the outline.
  sweepBand(trim,path.points,path.closed,dims.surround,1,t,t+dims.proud,trimTone,{inner:true,outer:true,ends:true});
  sweepBand(frame,path.points,path.closed,.075,-1,zg-.04,zg+.04,frameTone,{back:true,outer:true,ends:true});
  for(const m of g.mullions)box(trim,m.x-.07,m.x+.07,m.y0,m.y1,zg-.05,t+Math.min(.02,dims.proud),trimTone);
  if(g.role==='window'&&!(g.panels.length===1&&g.panels[0].shape==='round'))box(trim,g.x0-.12,g.x1+.12,g.y0-.08,g.y0,zg,t+.09,trimTone);
  if(g.role==='window'){
   if(g.glazing)fill(glass,toPolygon(o),zg);
   if(g.glazing)for(const p of g.panels){const y0=g.y0,w=.045,cx=(p.x0+p.x1)/2,cy=(p.y0+p.y1)/2,r=Math.min(p.x1-p.x0,p.y1-p.y0)/2;
    if(p.shape==='round'){box(frame,cx-w/2,cx+w/2,cy-r,cy+r,zg-.025,zg+.025,frameTone);box(frame,cx-r,cx+r,cy-w/2,cy+w/2,zg-.025,zg+.025,frameTone);continue;}
    if(p.x1-p.x0>.85)box(frame,cx-w/2,cx+w/2,y0,p.y1,zg-.025,zg+.025,frameTone);
    const bar=p.rise>.1?p.spring:p.y1-y0>1.5?y0+(p.y1-y0)*.62:null;if(bar!==null)box(frame,p.x0,p.x1,bar-w/2,bar+w/2,zg-.025,zg+.025,frameTone);}
  }else{
   const leafTone=rgb(palette.door),arched=g.spring<g.y1-.1;
   if(g.glazing)fill(glass,toPolygon(o),zg);
   else{for(const poly of arched?clipAbove(o,g.spring,false):[toPolygon(o)])fill(door,poly,zg,leafTone);if(arched){for(const poly of clipAbove(o,g.spring,true))fill(glass,poly,zg);box(frame,g.x0,g.x1,g.spring-.05,g.spring+.05,zg-.04,zg+.04,frameTone);}
    const rail=Math.min(1,g.spring*.45);box(frame,g.x0,g.x1,rail-.04,rail+.04,zg,zg+.035,frameTone);
    if(g.x1-g.x0>1.5&&!g.mullions.length)box(frame,(g.x0+g.x1)/2-.04,(g.x0+g.x1)/2+.04,0,g.spring,zg-.04,zg+.04,frameTone);
    const hx=g.x1-g.x0>1.5?(g.x0+g.x1)/2+.14:g.x1-.2;box(frame,hx-.03,hx+.03,.98,1.1,zg,zg+.07,rgb('#c9b27a'));}
  }
 }
 const out={wall:pack(wall),trim:pack(trim),frame:pack(frame),glass:pack(glass),door:pack(door)};
 return {...out,triangles:Object.values(out).reduce((s,b)=>s+b.indices.length/3,0)};
}
