import { BufferGeometry, Vector3 } from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
/** Single flat chamfer on convex shared primitives; coplanar triangles form one face. */
export function bevelCityGeometry(source: BufferGeometry, inset = .035): BufferGeometry {
 const position=source.getAttribute("position"), index=source.index;
 const faces=new Map<string,{normal:Vector3;points:Map<string,Vector3>}>();
 const vertex=(i:number)=>new Vector3().fromBufferAttribute(position,index?index.getX(i):i);
 const count=index?index.count:position.count;
 for(let i=0;i<count;i+=3){
  const a=vertex(i),b=vertex(i+1),c=vertex(i+2);
  const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  const key=[normal.x,normal.y,normal.z,normal.dot(a)].map(v=>v.toFixed(5)).join(":");
  const face=faces.get(key)||{normal,points:new Map<string,Vector3>()};
  for(const p of [a,b,c])face.points.set(p.toArray().join(":"),p);
  faces.set(key,face);
 }
 const points:Vector3[]=[];
 for(const face of faces.values()){
  const vertices=[...face.points.values()];
  const center=vertices.reduce((sum,p)=>sum.add(p),new Vector3()).divideScalar(vertices.length);
  for(const p of vertices)points.push(p.clone().lerp(center,inset));
 }
 const result=new ConvexGeometry(points);
 source.dispose();
 return result;
}
