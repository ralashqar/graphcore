import {exposedWalls} from "./cityBuildingV2.ts";
import type {BuildingMass} from "./cityBuildingDesign.ts";
import type {DesignPart,Palette} from "./cityBuildingV2.ts";
export const RESIDENTIAL_TYPES=["bungalow","cottage","detached","townhouse","modern-house","villa","farmhouse","apartment"] as const;
export type ConnectedArchitecture={
 openingLayout?:"compact"|"balanced"|"paired";
 roofPitch?:number; roofOverhang?:number; ridgeDirection?:"x"|"z";
 porch?:"none"|"entrance"|"veranda"|"side"|"courtyard";
 supportStyle?:"timber"|"classical"|"metal";
 dormers?:0|1|2; dormerRoof?:"gable"|"shed";
 shutters?:boolean; windowBoxes?:boolean; chimney?:boolean; gutters?:boolean; balconies?:boolean;
};
type Point=[number,number];
type Plane=[number,number,number];
type Face={polygon:Point[];plane:Plane;base:number};
const EPS=1e-7;
const height=(p:Plane,v:Point)=>p[0]*v[0]+p[1]*v[1]+p[2];
function area(p:Point[]){return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;}
function clip(p:Point[],line:Plane,positive=true):Point[]{
 const out:Point[]=[];
 for(let i=0;i<p.length;i++){
  const a=p[i],b=p[(i+1)%p.length],ha=height(line,a)*(positive?1:-1),hb=height(line,b)*(positive?1:-1);
  if(ha>=-EPS)out.push(a);
  if((ha>EPS&&hb< -EPS)||(ha< -EPS&&hb>EPS)){const t=ha/(ha-hb);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
 }
 return out.filter((v,i)=>i===0||Math.hypot(v[0]-out[i-1][0],v[1]-out[i-1][1])>EPS);
}
function subtract(p:Point[],cut:Point[]):Point[][]{
 let inside=p;const out:Point[][]=[];
 for(let i=0;i<cut.length&&inside.length>=3;i++){
  const a=cut[i],b=cut[(i+1)%cut.length],line:Plane=[a[1]-b[1],b[0]-a[0],a[0]*b[1]-b[0]*a[1]];
  const exterior=clip(inside,line,false);if(exterior.length>=3&&Math.abs(area(exterior))>EPS)out.push(exterior);
  inside=clip(inside,line);
 }
 return out;
}
const rectangle=(x:number,z:number,w:number,d:number):Point[]=>[[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]];
/** Exact planar roof-envelope arrangement; no runtime booleans or overlapping roof solids. */
export function roofFaces(masses:BuildingMass[],profile:string,pitch:number,overhang:number,ridge:"x"|"z"):Face[]{
 const slope=Math.tan(pitch*Math.PI/180),faces:Face[]=[];
 for(const m of masses){
  const base=m.y+m.height;
  if(masses.some(u=>u.y>=base-EPS&&u.y>m.y&&Math.abs(u.x-m.x)+m.width/2<=u.width/2+EPS&&Math.abs(u.z-m.z)+m.depth/2<=u.depth/2+EPS))continue;
  const w=m.width+2*overhang,d=m.depth+2*overhang,rect=rectangle(m.x,m.z,w,d);
  const px:Plane[]=[[slope,0,base-slope*(m.x-w/2)],[-slope,0,base+slope*(m.x+w/2)]];
  const pz:Plane[]=[[0,slope,base-slope*(m.z-d/2)],[0,-slope,base+slope*(m.z+d/2)]];
  let planes=profile==="flat"?[[0,0,base+.12] as Plane]:profile==="hip"?[...px,...pz]:profile==="shed"?[ridge==="x"?pz[0]:px[0]]:profile==="mansard"?[...px,...pz,[0,0,base+Math.min(w,d)*slope*.32] as Plane]:ridge==="x"?pz:px;
  for(const plane of planes){
   let polygon=rect;
   for(const other of planes)if(other!==plane)polygon=clip(polygon,[other[0]-plane[0],other[1]-plane[1],other[2]-plane[2]]);
   if(polygon.length>=3&&Math.abs(area(polygon))>EPS)faces.push({polygon,plane,base});
  }
 }
 const out:Face[]=[];
 faces.forEach((face,index)=>{
  let pieces=[face.polygon];
  faces.forEach((other,j)=>{
   if(index===j)return;
   const delta:Plane=[other.plane[0]-face.plane[0],other.plane[1]-face.plane[1],other.plane[2]-face.plane[2]];
   if(delta.every(v=>Math.abs(v)<EPS)&&j>index)return;
   const cutter=clip(other.polygon,delta);
   if(cutter.length>=3&&Math.abs(area(cutter))>EPS)pieces=pieces.flatMap(p=>subtract(p,cutter));
  });
  // Upper walls own their footprint, including at roof/extension abutments.
  for(const m of masses)if(m.y>=face.base-EPS)pieces=pieces.flatMap(p=>subtract(p,rectangle(m.x,m.z,m.width,m.depth)));
  pieces.forEach(polygon=>out.push({...face,polygon}));
 });
 return out;
}
function solidFace(face:Face,thickness:number):number[]{
 const p=face.polygon,vertices:number[]=[];
 const v=(i:number,lower=false)=>[p[i][0],height(face.plane,p[i])-(lower?thickness:0),p[i][1]];
 const tri=(a:number[],b:number[],c:number[])=>vertices.push(...a,...b,...c);
 for(let i=1;i<p.length-1;i++){tri(v(0),v(i+1),v(i));tri(v(0,true),v(i,true),v(i+1,true));}
 for(let i=0;i<p.length;i++){const j=(i+1)%p.length;tri(v(i),v(j),v(j,true));tri(v(i),v(j,true),v(i,true));}
 return vertices;
}
export function connectedRoof(masses:BuildingMass[],profile:string,options:ConnectedArchitecture,p:Palette,lod:string){
 const pitch=options.roofPitch??35,overhang=options.roofOverhang??.3,ridge=options.ridgeDirection??"x";
 let faces=roofFaces(masses,profile,pitch,overhang,ridge);
 const parts:DesignPart[]=[],notes:string[]=[];
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:string)=>parts.push({kind:"box",position:[x,y,z],size:[w,h,d],color,squareEdges:true});
 const mesh=(vertices:number[],color:string,textureRole:"roof"|"wall"|"none")=>{
  const clean:number[]=[];for(let i=0;i<vertices.length;i+=9){const t=vertices.slice(i,i+9),u=[t[3]-t[0],t[4]-t[1],t[5]-t[2]],v=[t[6]-t[0],t[7]-t[1],t[8]-t[2]];if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>EPS)clean.push(...t);}
  if(clean.length)parts.push({kind:"mesh",vertices:clean,position:[0,0,0],size:[1,1,1],color,textureRole});
 };
 // Dormers occupy a reserved rectangle on one front-facing roof surface.
 const candidates=faces.filter(f=>f.plane[1]<-.1&&Math.abs(f.plane[0])<EPS).sort((a,b)=>Math.abs(area(b.polygon))-Math.abs(area(a.polygon)));
 const host=candidates[0],count=options.dormers??0;
 if(count&&(!host||profile==="flat"))notes.push("Dormers need a clear front-facing sloped roof; the selection is retained.");
 else if(count&&host){
  const xs=host.polygon.map(v=>v[0]),zs=host.polygon.map(v=>v[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2;
  for(let i=0;i<count;i++){
   const x=cx+(i-(count-1)/2)*2.2,z=cz,w=1.6,d=1.7,cut=rectangle(x,z,w,d);
   const contained=cut.every(v=>host.polygon.every((a,j)=>{const b=host.polygon[(j+1)%host.polygon.length];return (b[0]-a[0])*(v[1]-a[1])-(b[1]-a[1])*(v[0]-a[0])>.06;}));
   if(!contained){notes.push("A dormer cannot fit clear of this roof edge or valley.");continue;}
   const floor=Math.min(...cut.map(v=>height(host.plane,v)))-.12,top=Math.max(...cut.map(v=>height(host.plane,v)))+1.25;
   faces=faces.flatMap(f=>f.plane===host.plane?subtract(f.polygon,cut).map(polygon=>({...f,polygon})): [f]);
   // Closed cheek walls join the roof cut. Front wall has a real window aperture.
   for(const side of [-1,1])box(x+side*(w/2-.08),(floor+top)/2,z,.16,top-floor,d,p.wall);
   box(x,(floor+top)/2,z-d/2+.08,w-.32,top-floor,.16,p.wall);
   const windowY=top-.65;
   box(x,floor+(windowY-.4-floor)/2,z+d/2-.08,w-.32,windowY-.4-floor,.16,p.wall);
   box(x,top-.075,z+d/2-.08,w-.32,.15,.16,p.wall);
   for(const side of [-1,1])box(x+side*.56,windowY,z+d/2-.08,.16,1,.16,p.wall);
   box(x,windowY,z+d/2-.11,.96,1,.035,p.glass);
   parts.push({kind:options.dormerRoof==="shed"?"shed":"roof",position:[x,top+.28,z],size:[w+.2,.56,d+.2],color:p.roof});
  }
 }
 // Each planar cell is closed. Shared side faces are removed below by matching triangles.
 const roofVertices=faces.flatMap(f=>solidFace(f,.12));
 const duplicate=new Map<string,number[]>();
 for(let i=0;i<roofVertices.length;i+=9){const t=roofVertices.slice(i,i+9),key=[t.slice(0,3),t.slice(3,6),t.slice(6,9)].map(v=>v.map(n=>n.toFixed(6)).join(",")).sort().join(";");if(duplicate.has(key))duplicate.delete(key);else duplicate.set(key,t);}
 mesh([...duplicate.values()].flat(),p.roof,"roof");
 // Perimeter infill, fascia and gutters derive from actual roof boundaries.
 const edges=new Map<string,{a:Point;b:Point;face:Face}>();
 for(const face of faces)for(let i=0;i<face.polygon.length;i++){
  const a=face.polygon[i],b=face.polygon[(i+1)%face.polygon.length];
  const key=[a,b].map(v=>v.map(n=>n.toFixed(6)).join(",")).sort().join(";");
  if(edges.has(key))edges.delete(key);else edges.set(key,{a,b,face});
 }
 const contains=(poly:Point[],point:Point)=>poly.every((a,i)=>{const b=poly[(i+1)%poly.length];return (b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0])>=-EPS;});
 for(const {a,b,face} of edges.values()){
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<EPS)continue;
  const outside:Point=[(a[0]+b[0])/2+(b[1]-a[1])/len*.0001,(a[1]+b[1])/2-(b[0]-a[0])/len*.0001];
  if(faces.some(f=>f!==face&&contains(f.polygon,outside)))continue;
  const ya=height(face.plane,a)-.12,yb=height(face.plane,b)-.12;

  if(Math.abs(ya-yb)<EPS){
   const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.05)continue;
   const angle=-Math.atan2(b[1]-a[1],b[0]-a[0]);
   parts.push({kind:"box",position:[(a[0]+b[0])/2,ya-.025,(a[1]+b[1])/2],size:[length,.16,.1],rotation:angle,color:p.trim,squareEdges:true,textureRole:"none"});
   if(options.gutters&&lod==="near" && length>2 && masses.some(m=>Math.abs(Math.abs(a[0]-m.x)-m.width/2-overhang)<.001 && Math.abs(Math.abs(a[1]-m.z)-m.depth/2-overhang)<.001))box(a[0],(.3+ya)/2,a[1],.085,Math.max(.1,ya-.3),.085,p.roof);
   if(options.gutters&&lod==="near")parts.push({kind:"box",position:[(a[0]+b[0])/2,ya-.08,(a[1]+b[1])/2],size:[length,.1,.16],rotation:angle,color:p.roof,squareEdges:true});
  }
 }
 // Gable infill is hosted on the actual wall plane, not on the overhang edge.
 for(const wall of exposedWalls(masses))for(const face of faces){
  const base=wall.y+wall.height;if(Math.abs(base-face.base)>.001)continue;
  const a:Point=[wall.x+(wall.nz?-wall.length/2:0),wall.z+(wall.nx?-wall.length/2:0)],b:Point=[wall.x+(wall.nz?wall.length/2:0),wall.z+(wall.nx?wall.length/2:0)];
  let lo=0,hi=1;
  for(let i=0;i<face.polygon.length;i++){const p0=face.polygon[i],p1=face.polygon[(i+1)%face.polygon.length],line:Plane=[p0[1]-p1[1],p1[0]-p0[0],p0[0]*p1[1]-p1[0]*p0[1]],ha=height(line,a),hb=height(line,b),delta=hb-ha;
   if(Math.abs(delta)<EPS){if(ha< -EPS){hi=-1;break;}}else if(delta>0)lo=Math.max(lo,-ha/delta);else hi=Math.min(hi,-ha/delta);
  }
  if(hi-lo<EPS)continue;
  const start:Point=[a[0]+(b[0]-a[0])*lo,a[1]+(b[1]-a[1])*lo],end:Point=[a[0]+(b[0]-a[0])*hi,a[1]+(b[1]-a[1])*hi];
  const ya=Math.max(base,height(face.plane,start)-.12),yb=Math.max(base,height(face.plane,end)-.12);if(Math.max(ya,yb)<=base+EPS)continue;
  const verts=[[start[0],base,start[1]],[end[0],base,end[1]],[end[0],yb,end[1]],[start[0],ya,start[1]]];
  verts.push(...verts.map(v=>[v[0]-wall.nx*.3,v[1],v[2]-wall.nz*.3]));
  let ids=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0];
  if(wall.nz===-1||wall.nx===1)ids=ids.flatMap((_,i)=>i%3===0?[ids[i],ids[i+2],ids[i+1]]:[]);
  mesh(ids.flatMap(i=>verts[i]),p.wall,"wall");
 }
 if(options.chimney){const m=masses.at(-1)!;const x=m.x-m.width*.25,z=m.z;const roofY=Math.max(...faces.filter(f=>contains(f.polygon,[x,z])).map(f=>height(f.plane,[x,z])),m.y+m.height);box(x,roofY+.55,z,.65,1.4,.65,p.wall);box(x,roofY+1.29,z,.85,.12,.85,p.trim);}
 const merged=new Map<string,DesignPart>();
 const assembled:DesignPart[]=[];
 for(const part of parts){if(part.kind!=="mesh"){assembled.push(part);continue;}const key=part.color+":"+part.textureRole;const existing=merged.get(key);if(existing)existing.vertices!.push(...part.vertices!);else merged.set(key,{...part,vertices:[...part.vertices!]});}
 assembled.push(...merged.values());
 return {parts:assembled,notes,faces};
}

export type AssemblyEnvelope={label:string;position:[number,number,number];size:[number,number,number]};
export function connectedPorch(masses:BuildingMass[],o:ConnectedArchitecture,p:Palette,front:number){
 const parts:DesignPart[]=[],notes:string[]=[],envelopes:AssemblyEnvelope[]=[];
 if(!o.porch||o.porch==="none")return {parts,notes,envelopes};
 const side=o.porch==="side",courtyard=o.porch==="courtyard";
 if(courtyard && masses.filter(m=>m.y===masses[0].y).length<2){notes.push("A covered courtyard needs an L-shaped or courtyard footprint.");return {parts,notes,envelopes};}
 const right=Math.max(...masses.map(m=>m.x+m.width/2));
 const depth=Math.min(2.2,10.6-(side?right:front));
 const width=o.porch==="entrance"?3.8:Math.min(masses[0].width-.8,courtyard?6:12);
 if(depth<1.2||width<3){notes.push("This porch needs more clear space inside the plot. Reduce the footprint to restore it.");return {parts,notes,envelopes};}
 const m=masses[0],y=m.y+m.height-.3;
 const transform=(x:number,z:number):[number,number]=>side?[right+z,x]:[x,front+z];
 const box=(x:number,cy:number,z:number,w:number,h:number,d:number,color:string)=>{const [xx,zz]=transform(x,z);parts.push({kind:"box",position:[xx,cy,zz],size:side?[d,h,w]:[w,h,d],color,squareEdges:true});};
 const center=transform(0,depth/2);
 envelopes.push({label:"Porch clearance",position:[center[0],y/2,center[1]],size:side?[depth,y+.3,width]:[width,y+.3,depth]});
 box(0,.52,depth/2,width,.26,depth,p.trim);
 box(0,.32,depth+.15,Math.min(3,width),.14,.3,p.trim);
 box(0,y-.08,.08,width,.18,.16,p.trim);
 box(0,y-.36,depth-.14,width,.2,.2,p.trim);
 const postWidth=o.supportStyle==="metal"?.12:.22;
 for(const x of [-width/2+.2,width/2-.2]){
  box(x,(.65+y-.46)/2,depth-.14,postWidth,y-.46-.65,postWidth,p.trim);
  if(o.supportStyle==="classical"){box(x,.73,depth-.14,.42,.16,.42,p.trim);box(x,y-.51,depth-.14,.4,.1,.4,p.trim);}
 }
 // Closed sloping canopy. Its high edge attaches to the wall ledger.
 const [x,z]=transform(0,depth/2);
 parts.push({kind:"shed",position:[x,y-.04,z],size:[width,.32,depth],rotation:side?-Math.PI/2:Math.PI,color:p.roof});
 for(const part of parts)if(part.kind==="box"&&part.size[0]<.5&&part.size[2]<.5&&part.size[1]>.8)envelopes.push({label:"Porch support",position:part.position,size:part.size});
 return {parts,notes,envelopes};
}
