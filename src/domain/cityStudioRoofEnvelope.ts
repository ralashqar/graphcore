import polygonClipping,{type MultiPolygon} from 'polygon-clipping';
import {ShapeUtils,Vector2} from 'three';
import {sculptFloorBottom,sculptFloorTop,type SculptVolume} from './citySculpt.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioRecipe,StudioRoof,StudioRoofSettings,StudioRoofFace,StudioRoofEdge,StudioRoofPatch} from './cityStudioTypes.ts';
type Point=[number,number];type Plane=[number,number,number];
const EPS=1e-6;
function normalized(input:MultiPolygon):MultiPolygon{return input.flatMap(poly=>{const rings=poly.map(ring=>{const points=ring.map(p=>p.map(n=>Math.round(n*1e8)/1e8) as Point).filter((p,i,all)=>!i||p[0]!==all[i-1][0]||p[1]!==all[i-1][1]);if(points.length>1&&points[0][0]===points.at(-1)![0]&&points[0][1]===points.at(-1)![1])points.pop();return points;});if(rings[0].length<3)return [];return [rings.filter(r=>r.length>=3)];});}
const intersection=(first:MultiPolygon,...rest:MultiPolygon[])=>normalized(polygonClipping.intersection(normalized(first),...rest.map(normalized)));
const difference=(first:MultiPolygon,...rest:MultiPolygon[])=>normalized(polygonClipping.difference(normalized(first),...rest.map(normalized)));

export const ROOF_TYPES: {id:StudioRoof;label:string}[]=[{id:'flat',label:'Flat'},{id:'terrace',label:'Terrace'},{id:'pitched',label:'Gable'},{id:'hip',label:'Hipped'},{id:'shed',label:'Lean-to'},{id:'mansard',label:'Mansard'},{id:'half-hip',label:'Half-hipped'},{id:'gambrel',label:'Gambrel'},{id:'pyramid',label:'Pyramidal'},{id:'cone',label:'Conical'}];
export function roofChoice(r:StudioRecipe,id:string){const a=r.studio.defaults,b=r.studio.parts[id];return {type:b?.roof??a.roof??'flat',settings:{boundary:(b?.roof??a.roof??'flat')==='flat'?'none' as const:'rail' as const,rise:2,overhang:.2,ridge:'z' as const,shoulder:.65,crown:.45,connection:'auto' as const,finish:'slate' as const,...a.roofSettings,...b?.roofSettings}};}
export function editStudioRoof(r:StudioRecipe,ids:string[],patch:{type?:StudioRoof;settings?:StudioRoofSettings}):StudioRecipe{const next=structuredClone(r);next.studio.roofRevision='roof-envelope-2';for(const id of ids){const p=next.studio.parts[id]??={};if(patch.type)p.roof=patch.type;p.roofSettings={...roofChoice(next,id).settings,...patch.settings};}return next;}
export function connectedRoofParts(r:StudioRecipe,id:string){const chosen=r.volumes.find(v=>v.id===id);if(!chosen)return [];const found=new Set([id]);let changed=true;while(changed){changed=false;for(const v of r.volumes){if(v.operation!=='add'||found.has(v.id)||v.startFloor+v.spanFloors!==chosen.startFloor+chosen.spanFloors)continue;if(r.volumes.some(o=>found.has(o.id)&&Math.abs(v.x-o.x)<=(v.width+o.width)/2+.01&&Math.abs(v.z-o.z)<=(v.depth+o.depth)/2+.01)){found.add(v.id);changed=true;}}}return [...found];}
const at=(p:Plane,v:Point)=>p[0]*v[0]+p[1]*v[1]+p[2];
function clip(poly:Point[],line:Plane){const out:Point[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ha=at(line,a),hb=at(line,b);if(ha>=-EPS)out.push(a);if(ha*hb<0){const t=ha/(ha-hb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}return out;}
const region=(p:Point[]):MultiPolygon=>p.length<3?[]:[[p]];
const half=(p:Plane)=>region(clip([[-64,-64],[64,-64],[64,64],[-64,64]],p));
function footprint(v:SculptVolume,e=0):Point[]{if(v.kind==='ellipse')return Array.from({length:32},(_,i)=>{const a=i*Math.PI/16;return [v.x+Math.cos(a)*(v.width/2+e),v.z+Math.sin(a)*(v.depth/2+e)];});return [[v.x-v.width/2-e,v.z-v.depth/2-e],[v.x+v.width/2+e,v.z-v.depth/2-e],[v.x+v.width/2+e,v.z+v.depth/2+e],[v.x-v.width/2-e,v.z+v.depth/2+e]];}
function plane3(a:[number,number,number],b:[number,number,number],c:[number,number,number]):Plane{const dx=b[0]-a[0],dz=b[2]-a[2],ex=c[0]-a[0],ez=c[2]-a[2],det=dx*ez-ex*dz;const x=((b[1]-a[1])*ez-(c[1]-a[1])*dz)/det,z=(dx*(c[1]-a[1])-ex*(b[1]-a[1]))/det;return [x,z,a[1]-x*a[0]-z*a[2]];}
function candidates(r:StudioRecipe,v:SculptVolume,d:CityBuildingDesignV3,notes:string[]):StudioRoofFace[]{
 const {type,settings:s}=roofChoice(r,v.id),base=sculptFloorTop(v.startFloor+v.spanFloors-1,d.groundHeight),e=type==='flat'||type==='terrace'?0:s.overhang,w=v.width/2+e,h=v.depth/2+e,rise=s.rise,domain=footprint(v,s.connection==='separate'?-.035:e);let profile=type;
 if(v.kind==='ellipse'&&!['flat','terrace','cone'].includes(profile)){profile='flat';notes.push('This round part keeps a flat roof. Choose Conical for a pointed roof.');}
 if(profile==='cone'&&v.kind!=='ellipse')notes.push('Conical roofs follow rectangular parts as pyramidal caps. Use a round part for a circular cone.');
 if(profile==='cone')return domain.map((a,i)=>{const b=domain[(i+1)%domain.length];return {partId:v.id,base,polygon:[[a,b,[v.x,v.z]]],plane:plane3([a[0],base,a[1]],[b[0],base,b[1]],[v.x,base+rise,v.z])};});
 const pair=(axis:'x'|'z',slope:number,peak:number):Plane[]=>axis==='x'?[[slope,0,peak-slope*v.x],[-slope,0,peak+slope*v.x]]:[[0,slope,peak-slope*v.z],[0,-slope,peak+slope*v.z]];
 const cross=s.ridge==='z'?'x':'z',span=cross==='x'?w:h,min=Math.min(w,h);let planes:Plane[];
 if(profile==='flat'||profile==='terrace')planes=[[0,0,base+.02]];
 else if(profile==='shed'){const k=(s.flip?-1:1)*rise/(2*span);planes=cross==='x'?[[k,0,base+rise/2-k*v.x]]:[[0,k,base+rise/2-k*v.z]];}
 else if(profile==='mansard')planes=[...pair('x',rise/(min*(1-s.crown)),base+rise*w/(min*(1-s.crown))),...pair('z',rise/(min*(1-s.crown)),base+rise*h/(min*(1-s.crown))),[0,0,base+rise]];
 else if(profile==='gambrel')planes=[...pair(cross,rise*s.shoulder/(span*(1-s.crown)),base+rise*s.shoulder/(1-s.crown)),...pair(cross,rise*(1-s.shoulder)/(span*s.crown),base+rise)];
 else if(profile==='hip')planes=[...pair(cross,rise/span,base+rise),...pair(cross==='x'?'z':'x',rise/((cross==='x'?h:w)*(1-s.crown)),base+rise/(1-s.crown))];
 else if(profile==='pyramid')planes=[...pair('x',rise/w,base+rise),...pair('z',rise/h,base+rise)];
 else {planes=pair(cross,rise/span,base+rise);if(profile==='half-hip')planes.push(...pair(cross==='x'?'z':'x',rise/span,base+rise*s.shoulder+rise*(cross==='x'?h:w)/span));}
 return planes.flatMap(plane=>{let poly=domain;for(const other of planes)if(other!==plane)poly=clip(poly,[other[0]-plane[0],other[1]-plane[1],other[2]-plane[2]]);return poly.length>=3?[{partId:v.id,base,plane,polygon:[poly]}]:[];});
}
function splitRoofEdges(rings:Point[][],faces:StudioRoofFace[]){
 const result:[Point,Point][]=[],vertices=faces.flatMap(f=>f.polygon.flat());
 for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;if(length<EPS)continue;const cuts=[0,1];
 for(const p of vertices){const t=((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length;if(t>EPS&&t<1-EPS&&Math.abs(dx*(p[1]-a[1])-dz*(p[0]-a[0]))<EPS)cuts.push(t);}
 const sorted=[...new Set(cuts.map(t=>Math.round(t*1e7)/1e7))].sort((a,b)=>a-b);for(let j=0;j<sorted.length-1;j++)result.push([[a[0]+dx*sorted[j],a[1]+dz*sorted[j]],[a[0]+dx*sorted[j+1],a[1]+dz*sorted[j+1]]]);
 }return result;
}
/** All families participate in one height-aware planar arrangement. */
export function connectedStudioRoofs(r:StudioRecipe,d:CityBuildingDesignV3){
 const notes:string[]=[],all=r.volumes.filter(v=>v.operation==='add').flatMap(v=>candidates(r,v,d,notes)),faces:StudioRoofFace[]=[];
 const limit=(r.plotSize??24)===48?11.25:10.5,plot=region([[-limit,-limit],[limit,-limit],[limit,limit],[-limit,limit]]);
 for(const [index,face] of all.entries()){
  let visible=intersection([face.polygon],plot);
  for(const volume of r.volumes){if(volume.id===face.partId)continue;const bottom=sculptFloorBottom(volume.startFloor,d.groundHeight),top=sculptFloorTop(volume.startFloor+volume.spanFloors-1,d.groundHeight);if(volume.operation==='subtract'&&top<face.base-.01)continue;let mask=region(footprint(volume));
   // Cuts are openings through a roof at the cut's upper boundary too.
   mask=intersection(mask,half([face.plane[0],face.plane[1],face.plane[2]-bottom+.001]),half([-face.plane[0],-face.plane[1],top-face.plane[2]+(volume.operation==='subtract'?9:-.001)]));
   if(mask.length&&visible.length)visible=difference(visible,mask);
  }
  for(const [j,other] of all.entries()){
   if(!visible.length)break;if(j===index||other.partId===face.partId)continue;
   // Roofs at different storeys may pass beneath an elevated bridge.

   const delta:Plane=[other.plane[0]-face.plane[0],other.plane[1]-face.plane[1],other.plane[2]-face.plane[2]];
   if(delta.every(n=>Math.abs(n)<EPS)){if(other.partId.localeCompare(face.partId)>0)continue;}
   let mask:MultiPolygon=intersection([other.polygon],half([face.plane[0],face.plane[1],face.plane[2]-other.base+.12]));const separate=roofChoice(r,face.partId).settings.connection!=='auto'||roofChoice(r,other.partId).settings.connection!=='auto';
   if(separate){if(other.partId.localeCompare(face.partId)>0)continue;const host=r.volumes.find(v=>v.id===other.partId)!;mask=intersection(mask,region(footprint(host)));}
   else if(!delta.every(n=>Math.abs(n)<EPS))mask=intersection(mask,half(delta));
   if(mask.length)visible=difference(visible,mask);
  }
  for(const polygon of visible)faces.push({...face,polygon});
 }
 const patches=new Map<string,StudioRoofPatch>(),edges:StudioRoofEdge[]=[];
 for(const face of faces){let patch=patches.get(face.partId);if(!patch){const s=roofChoice(r,face.partId).settings;patch={partId:face.partId,vertices:[],finish:s.finish,color:s.color};patches.set(face.partId,patch);}
  const rings=face.polygon.map(ring=>{const a=ring.slice();if(a.length>1&&Math.hypot(a[0][0]-a.at(-1)![0],a[0][1]-a.at(-1)![1])<EPS)a.pop();return a;}),points=rings.flat(),triangles=ShapeUtils.triangulateShape(rings[0].map(p=>new Vector2(...p)),rings.slice(1).map(r=>r.map(p=>new Vector2(...p))));
  const xyz=(p:Point):[number,number,number]=>[p[0],at(face.plane,p),p[1]],tri=(a:number[],b:number[],c:number[])=>{const normal=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);patch!.vertices.push(...a,...(normal>=0?b:c),...(normal>=0?c:b));};
  for(const t of triangles){tri(xyz(points[t[0]]),xyz(points[t[1]]),xyz(points[t[2]]));const bottom=t.map(i=>[points[i][0],face.base-.12,points[i][1]]);const n=(bottom[1][2]-bottom[0][2])*(bottom[2][0]-bottom[0][0])-(bottom[1][0]-bottom[0][0])*(bottom[2][2]-bottom[0][2]);patch.vertices.push(...bottom[0],...(n>=0?bottom[2]:bottom[1]),...(n>=0?bottom[1]:bottom[2]));}
  for(const [a,b] of splitRoofEdges(rings,faces)){const mid:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<EPS)continue;
   const adjacent=faces.find(other=>other!==face&&(Math.abs(other.base-face.base)<.01||Math.abs(at(other.plane,mid)-at(face.plane,mid))<.001)&&other.polygon.some(r=>r.some((p,k)=>{const q=r[(k+1)%r.length],cross=Math.abs((q[0]-p[0])*(mid[1]-p[1])-(q[1]-p[1])*(mid[0]-p[0]));return cross<1e-5&&mid[0]>=Math.min(p[0],q[0])-EPS&&mid[0]<=Math.max(p[0],q[0])+EPS&&mid[1]>=Math.min(p[1],q[1])-EPS&&mid[1]<=Math.max(p[1],q[1])+EPS;})));
   let kind:StudioRoofEdge['kind']='eave';
   if(adjacent){const gap=at(face.plane,mid)-at(adjacent.plane,mid);if(Math.abs(gap)<.001){if(face.plane.every((n,k)=>Math.abs(n-adjacent.plane[k])<EPS))continue;kind=face.partId===adjacent.partId?'ridge':'valley';}else{if(gap<0)continue;kind='step';}}
   else if(r.volumes.some(v=>v.id!==face.partId&&v.operation==='add'&&sculptFloorBottom(v.startFloor,d.groundHeight)<=at(face.plane,mid)&&sculptFloorTop(v.startFloor+v.spanFloors-1,d.groundHeight)>at(face.plane,mid)+.01&&footprint(v).some((p,k,ring)=>{const q=ring[(k+1)%ring.length];return Math.abs((q[0]-p[0])*(mid[1]-p[1])-(q[1]-p[1])*(mid[0]-p[0]))<.01&&mid[0]>=Math.min(p[0],q[0])-.01&&mid[0]<=Math.max(p[0],q[0])+.01&&mid[1]>=Math.min(p[1],q[1])-.01&&mid[1]<=Math.max(p[1],q[1])+.01;})))kind='abutment';
   const aa=xyz(a),bb=xyz(b);edges.push({partId:face.partId,kind,a:aa,b:bb});
   // Close external gables and height steps only; never extrude internal seams.
   if(kind==='eave'||kind==='step'){const lower=(p:Point)=>adjacent?at(adjacent.plane,p):face.base-.12;patch.vertices.push(...aa,b[0],lower(b),b[1],a[0],lower(a),a[1],...aa,...bb,b[0],lower(b),b[1]);}
  }
 }
 return {vertices:[...patches.values()].flatMap(p=>p.vertices),notes:[...new Set(notes)],faces,edges:[...new Map(edges.map(e=>[[e.a,e.b].map(p=>p.map(v=>v.toFixed(5)).join(',')).sort().join('|'),e])).values()],patches:[...patches.values()]};
}
