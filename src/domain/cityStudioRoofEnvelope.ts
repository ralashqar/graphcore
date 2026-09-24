import {STUDIO_FAMILIES,STUDIO_MODULE_MAP} from './cityStudioCatalog.ts';
import polygonClipping,{type MultiPolygon} from 'polygon-clipping';
import {ShapeUtils,Vector2} from 'three';
import {sculptFloorBottom,sculptFloorTop,sculptPrimitiveBoundary,sculptFootprint,type SculptResolved,type SculptVolume} from './citySculpt.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioRecipe,StudioRoof,StudioRoofSettings,StudioRoofFace,StudioRoofEdge,StudioRoofPatch} from './cityStudioTypes.ts';
type Point=[number,number];type Plane=[number,number,number];
const EPS=1e-6;
/** The kit wall is centred on the sculpt contour; leave its visible half outside the roof cut. */
export const ROOF_WALL_CLEARANCE=(STUDIO_MODULE_MAP.get('wall-full')?.size[2]??.30)/2+.03;
function normalized(input:MultiPolygon):MultiPolygon{return input.flatMap(poly=>{const rings=poly.map(ring=>{const points=ring.map(p=>p.map(n=>Math.round(n*1e8)/1e8) as Point).filter((p,i,all)=>!i||p[0]!==all[i-1][0]||p[1]!==all[i-1][1]);if(points.length>1&&points[0][0]===points.at(-1)![0]&&points[0][1]===points.at(-1)![1])points.pop();return points;});if(rings[0].length<3)return [];return [rings.filter(r=>r.length>=3)];});}
const intersection=(first:MultiPolygon,...rest:MultiPolygon[])=>normalized(polygonClipping.intersection(normalized(first),...rest.map(normalized)));
const difference=(first:MultiPolygon,...rest:MultiPolygon[])=>normalized(polygonClipping.difference(normalized(first),...rest.map(normalized)));

export const ROOF_TYPES: {id:StudioRoof;label:string}[]=[{id:'flat',label:'Flat'},{id:'terrace',label:'Terrace'},{id:'pitched',label:'Gable'},{id:'hip',label:'Hipped'},{id:'shed',label:'Lean-to'},{id:'mansard',label:'Mansard'},{id:'half-hip',label:'Half-hipped'},{id:'gambrel',label:'Gambrel'},{id:'pyramid',label:'Pyramidal'},{id:'cone',label:'Conical'}];
export function roofChoice(r:StudioRecipe,id:string){const a=r.studio.defaults,b=r.studio.parts[id];return {type:b?.roof??a.roof??'flat',settings:{boundary:(b?.roof??a.roof??'flat')==='flat'?'none' as const:'rail' as const,rise:2,overhang:.2,ridge:'z' as const,shoulder:.65,crown:.45,connection:'auto' as const,finish:'slate' as const,...a.roofSettings,...b?.roofSettings}};}
export function editStudioRoof(r:StudioRecipe,ids:string[],patch:{type?:StudioRoof;settings?:StudioRoofSettings}):StudioRecipe{const next=structuredClone(r);next.studio.roofRevision='roof-envelope-2';for(const id of ids){const p=next.studio.parts[id]??={};if(patch.type)p.roof=patch.type;p.roofSettings={...roofChoice(next,id).settings,...patch.settings};}return next;}
export function connectedRoofParts(r:StudioRecipe,id:string){const chosen=r.volumes.find(v=>v.id===id);if(!chosen)return [];const found=new Set([id]);let changed=true;while(changed){changed=false;for(const v of r.volumes){if(v.operation!=='add'||found.has(v.id)||v.startFloor+v.spanFloors!==chosen.startFloor+chosen.spanFloors)continue;if(r.volumes.some(o=>found.has(o.id)&&intersection(region(footprint(v,.005)),region(footprint(o,.005))).length>0)){found.add(v.id);changed=true;}}}return [...found];}
const at=(p:Plane,v:Point)=>p[0]*v[0]+p[1]*v[1]+p[2];
function clip(poly:Point[],line:Plane){const out:Point[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ha=at(line,a),hb=at(line,b);if(ha>=-EPS)out.push(a);if(ha*hb<0){const t=ha/(ha-hb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}return out;}
const region=(p:Point[]):MultiPolygon=>p.length<3?[]:[[p]];
const half=(p:Plane)=>region(clip([[-64,-64],[64,-64],[64,64],[-64,64]],p));
function offsetRing(ring:Point[],e:number):Point[]{
 if(!e)return ring;
 // Offset the existing facet lines, never resample an expanded ellipse: doing
 // so can change the bay count and rotate the roof relative to its walls.
 return ring.map((p,i)=>{const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length],al=Math.hypot(p[0]-a[0],p[1]-a[1]),bl=Math.hypot(b[0]-p[0],b[1]-p[1]);
  const n:Point=[(p[1]-a[1])/al,(a[0]-p[0])/al],m:Point=[(b[1]-p[1])/bl,(p[0]-b[0])/bl],scale=e/(1+n[0]*m[0]+n[1]*m[1]);return [p[0]+(n[0]+m[0])*scale,p[1]+(n[1]+m[1])*scale];
 });
}
function footprint(v:SculptVolume,e=0):Point[]{return offsetRing(sculptPrimitiveBoundary(v),e);}
/** Offset the final union, including inward facing courtyard rings, without losing wall facets. */
function wallTileEnvelope(polygons:MultiPolygon):MultiPolygon{
 return polygons.reduce<MultiPolygon>((result,polygon)=>{
  let grown=region(offsetRing(polygon[0],ROOF_WALL_CLEARANCE));
  for(const hole of polygon.slice(1))grown=difference(grown,region(offsetRing(hole,ROOF_WALL_CLEARANCE)));
  return result.length?normalized(polygonClipping.union(result,grown)):grown;
 },[]);
}
const wallEnvelopeCache=new Map<string,MultiPolygon>();
function cachedWallTileEnvelope(polygons:MultiPolygon):MultiPolygon{
 const key=JSON.stringify(polygons),previous=wallEnvelopeCache.get(key);if(previous)return previous;
 const envelope=wallTileEnvelope(polygons);wallEnvelopeCache.set(key,envelope);
 if(wallEnvelopeCache.size>64)wallEnvelopeCache.delete(wallEnvelopeCache.keys().next().value!);
 return envelope;
}
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

type OccupiedLayer={bottom:number;top:number;polygons:MultiPolygon;wallEnvelope:MultiPolygon};
const lower=(f:StudioRoofFace)=>f.underside??f.base-.12;
const area=(ring:Point[])=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-p[1]*q[0];},0))/2;
function contains(p:Point,polygon:Point[][]){
 const ringContains=(ring:Point[])=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 return ringContains(polygon[0])&&!polygon.slice(1).some(ringContains);
}

/** Resolve additions and cuts together at every occupied height interval. */
function buildingLayers(r:StudioRecipe,d:CityBuildingDesignV3,floors?:SculptResolved['floors']):OccupiedLayer[]{
 const layers:OccupiedLayer[]=[],keys:string[]=[];
 const add=(bottom:number,top:number,polygons:MultiPolygon)=>{
  if(!polygons.length)return;const key=JSON.stringify(polygons),last=layers.at(-1);
  if(last&&keys.at(-1)===key&&Math.abs(last.top-bottom)<EPS){last.top=top;return;}
  layers.push({bottom,top,polygons,wallEnvelope:cachedWallTileEnvelope(polygons)});keys.push(key);
 };
 if(floors){for(const f of floors)add(f.bottom,f.top,f.polygons);return layers;}
 const parts=r.volumes.map(v=>({v,bottom:sculptFloorBottom(v.startFloor,d.groundHeight),top:sculptFloorTop(v.startFloor+v.spanFloors-1,d.groundHeight)}));
 const heights=[...new Set(parts.flatMap(p=>[p.bottom,p.top]))].sort((a,b)=>a-b);
 for(let i=0;i<heights.length-1;i++){
  const bottom=heights[i],top=heights[i+1],mid=(bottom+top)/2,active=parts.filter(p=>p.bottom<mid&&p.top>mid);
  const polygons=sculptFootprint(active.map(p=>p.v));
  add(bottom,top,polygons);
 }
 return layers;
}

function fragments(face:StudioRoofFace,polygons:MultiPolygon,plane=face.plane,underside=lower(face)):StudioRoofFace[]{
 const domain=polygons.flat().flat().every(p=>at(plane,p)>=underside-EPS)?polygons:intersection(polygons,half([plane[0],plane[1],plane[2]-underside]));
 return domain.filter(p=>area(p[0])>1e-8&&p.flat().some(v=>at(plane,v)>underside+EPS)).map(polygon=>({...face,plane,underside,polygon}));
}

/** Subtract a building layer from the entire roof solid, including its underside. */
function subtractLayer(face:StudioRoofFace,layer:OccupiedLayer):StudioRoofFace[]{
 if(layer.top<=lower(face)+EPS||face.polygon.flat().every(p=>at(face.plane,p)<=layer.bottom+EPS))return [face];
 const occupied=layer.top>face.base+EPS?layer.wallEnvelope:layer.polygons;
 const inside=intersection([face.polygon],occupied);if(!inside.length)return [face];
 const out=fragments(face,difference([face.polygon],occupied));
 // Under a bridge, retain both the untouched slopes and the capped lower solid.
 if(lower(face)<layer.bottom-EPS){
  out.push(...fragments(face,intersection(inside,half([-face.plane[0],-face.plane[1],layer.bottom-face.plane[2]]))));
  out.push(...fragments(face,intersection(inside,half([face.plane[0],face.plane[1],face.plane[2]-layer.bottom])),[0,0,layer.bottom]));
 }
 // Keep a roof above its own supporting floor, but never let a lower roof
 // re-emerge through the top of an upper-storey obstruction.
 if(layer.top<=face.base+EPS)out.push(...fragments(face,inside,face.plane,Math.max(lower(face),layer.top)));
 return out;
}

/** A geometric bend, independent of which original part owns either slope. */
function bendKind(face:StudioRoofFace,other:StudioRoofFace,outward:Point):'ridge'|'valley'{
 const ownSlope=face.plane[0]*outward[0]+face.plane[1]*outward[1];
 const nextSlope=other.plane[0]*outward[0]+other.plane[1]*outward[1];
 return nextSlope>ownSlope?'valley':'ridge';
}

export function connectedStudioRoofs(r:StudioRecipe,d:CityBuildingDesignV3,floors?:SculptResolved['floors']){
 const notes:string[]=[],layers=buildingLayers(r,d,floors);
 const limit=(r.plotSize??24)===48?11.25:10.5,plot=region([[-limit,-limit],[limit,-limit],[limit,limit],[-limit,limit]]);
 let all=r.volumes.filter(v=>v.operation==='add').flatMap(v=>candidates(r,v,d,notes)).flatMap(f=>fragments(f,intersection([f.polygon],plot)));
 // Roof-opening intentions extend above cuts which reach their source roof floor.
 all=all.flatMap(face=>{
  let domain:MultiPolygon=[face.polygon];
  const connection=roofChoice(r,face.partId).settings.connection,host=r.volumes.find(v=>v.id===face.partId)!;
  if(connection!=='auto')for(const other of r.volumes){
   if(other.id===host.id||other.operation!=='add')continue;
   const top=sculptFloorTop(other.startFloor+other.spanFloors-1,d.groundHeight),bottom=sculptFloorBottom(other.startFloor,d.groundHeight);
   const priority=other.width*other.depth-host.width*host.depth||other.x-host.x||other.z-host.z||other.width-host.width||other.depth-host.depth||host.id.localeCompare(other.id);
   const yields=top>face.base+.001||Math.abs(top-face.base)<.001&&(roofChoice(r,other.id).settings.connection==='auto'||priority>0);
   if(yields&&bottom<=face.base+.001)domain=difference(domain,region(footprint(other,ROOF_WALL_CLEARANCE+(connection==='separate'?.035:0))));
  }

  for(const cut of r.volumes.filter(v=>v.operation==='subtract'))if(sculptFloorTop(cut.startFloor+cut.spanFloors-1,d.groundHeight)>=face.base-.01&&sculptFloorBottom(cut.startFloor,d.groundHeight)<=face.base+.01)domain=difference(domain,region(footprint(cut)));
  let cells=fragments(face,domain);for(const layer of layers)cells=cells.flatMap(cell=>subtractLayer(cell,layer));return cells;
 });
 const faces:StudioRoofFace[]=[];
 for(const [i,face] of all.entries()){
  let visible:MultiPolygon=[face.polygon];
  for(const [j,other] of all.entries()){
   if(!visible.length)break;if(i===j||face.partId===other.partId)continue;
   const delta:Plane=[other.plane[0]-face.plane[0],other.plane[1]-face.plane[1],other.plane[2]-face.plane[2]],coplanar=delta.every(n=>Math.abs(n)<EPS);
   if(coplanar&&(other.partId>face.partId||other.partId===face.partId&&j>i))continue;
   let mask=intersection([other.polygon],half([face.plane[0],face.plane[1],face.plane[2]-lower(other)]));
   if(!coplanar)mask=intersection(mask,half(delta));
   if(mask.length)visible=difference(visible,mask);
  }
  faces.push(...fragments(face,visible));
 }
 const patches=new Map<string,StudioRoofPatch>(),edges:StudioRoofEdge[]=[];
 for(const face of faces){
  let patch=patches.get(face.partId);
  if(!patch){const s=roofChoice(r,face.partId).settings,style={...r.studio.defaults,...r.studio.parts[face.partId]},finish=r.studio.parts[face.partId]?.finishes?.wall??r.studio.defaults.finishes?.wall;
   patch={partId:face.partId,vertices:[],wallVertices:[],finish:s.finish,color:s.color,wallColor:finish?.color??STUDIO_FAMILIES[style.family??'pastel-stucco'].wall,wallTexture:finish?.texture};patches.set(face.partId,patch);
  }
  const rings=face.polygon,points=rings.flat(),triangles=ShapeUtils.triangulateShape(rings[0].map(p=>new Vector2(...p)),rings.slice(1).map(r=>r.map(p=>new Vector2(...p))));
  const xyz=(p:Point):[number,number,number]=>[p[0],at(face.plane,p),p[1]];
  for(const t of triangles){
   const a=xyz(points[t[0]]),b=xyz(points[t[1]]),c=xyz(points[t[2]]),up=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])>=0;
   patch.vertices.push(...a,...(up?b:c),...(up?c:b));
   const bottom=t.map(i=>[points[i][0],lower(face),points[i][1]]);patch.vertices.push(...bottom[0],...(up?bottom[2]:bottom[1]),...(up?bottom[1]:bottom[2]));
  }
  for(const [a,b] of splitRoofEdges(rings,faces)){
   const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<EPS)continue;
   const mid:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2],outward:Point=[dz/length,-dx/length],probe:Point=[mid[0]+outward[0]*.0001,mid[1]+outward[1]*.0001];
   const neighbours=faces.filter(f=>f!==face&&contains(probe,f.polygon));
   const height=at(face.plane,mid),adjacent=neighbours.find(f=>Math.abs(at(f.plane,mid)-height)<.0001&&lower(f)<height-EPS);
   const wall=layers.some(l=>l.bottom<height+.001&&l.top>height+.001&&l.wallEnvelope.some(p=>contains(probe,p)));
   const covered=neighbours.some(f=>lower(f)<height-EPS&&at(f.plane,mid)>height+.0001);
   let kind:StudioRoofEdge['kind']|null=wall?'abutment':covered?null:adjacent?face.plane.every((n,k)=>Math.abs(n-adjacent.plane[k])<EPS)?null:bendKind(face,adjacent,outward):neighbours.some(f=>at(f.plane,mid)<height&&at(f.plane,mid)>lower(face))?'step':Math.abs(at(face.plane,a)-at(face.plane,b))>.001?'rake':'eave';
   // A top surface flush against a bridge underside has no exposed roof trim.
   if(layers.some(l=>Math.abs(l.bottom-height)<.001&&l.wallEnvelope.some(p=>contains(mid,p))))kind=null;
   if(kind)edges.push({partId:face.partId,kind,a:xyz(a),b:xyz(b)});

   // Close only exposed vertical intervals. Neighbouring roof cells and the
   // finished building union remove internal fascias and buried gable walls.
   let side=region([[0,lower(face)],[1,lower(face)],[1,at(face.plane,b)],[0,at(face.plane,a)]]);
   for(const f of neighbours)side=difference(side,region([[0,lower(f)],[1,lower(f)],[1,at(f.plane,b)],[0,at(f.plane,a)]]));
   for(const l of layers)if(l.wallEnvelope.some(p=>contains(probe,p)))side=difference(side,region([[0,l.bottom],[1,l.bottom],[1,l.top],[0,l.top]]));
   for(const polygon of side){
    const pts=polygon.flat(),ts=ShapeUtils.triangulateShape(polygon[0].map(p=>new Vector2(...p)),polygon.slice(1).map(r=>r.map(p=>new Vector2(...p))));
    const target=Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1]))>.18?patch.wallVertices!:patch.vertices;
    for(const t of ts){const vs=t.map(i=>[a[0]+dx*pts[i][0],pts[i][1],a[1]+dz*pts[i][0]]),[u,v,w]=vs;
     const nx=(v[1]-u[1])*(w[2]-u[2])-(v[2]-u[2])*(w[1]-u[1]),nz=(v[0]-u[0])*(w[1]-u[1])-(v[1]-u[1])*(w[0]-u[0]);
     target.push(...u,...(nx*outward[0]+nz*outward[1]>=0?v:w),...(nx*outward[0]+nz*outward[1]>=0?w:v));
    }
   }
  }
 }
 // Faceted curves can leave collinear triangulation ears at shared boundaries.
 const nondegenerate=(vertices:number[])=>{const result:number[]=[];for(let i=0;i<vertices.length;i+=9){const a=vertices.slice(i,i+3),u=vertices.slice(i+3,i+6).map((v,k)=>v-a[k]),v=vertices.slice(i+6,i+9).map((n,k)=>n-a[k]);if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-10)result.push(...vertices.slice(i,i+9));}return result;};
 for(const patch of patches.values()){patch.vertices=nondegenerate(patch.vertices);patch.wallVertices=nondegenerate(patch.wallVertices!);}
 return {vertices:[...patches.values()].flatMap(p=>[...p.vertices,...p.wallVertices!]),notes:[...new Set(notes)],faces,edges:[...new Map(edges.map(e=>[[e.a,e.b].map(p=>p.map(v=>v.toFixed(5)).join(',')).sort().join('|'),e])).values()],patches:[...patches.values()]};
}
