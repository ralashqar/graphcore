import {BufferGeometry,Float32BufferAttribute,Vector3} from "three";
export const isOpenArchitecturalTrim=(name:string)=>/^(?:Brick_CornerColumn_|Marble_BevelColumn_|Metal_Column_|Cornice_)/.test(name);
/** Give source sheet-like trim a thin inner skin and outward edge returns.
 * Runs once per shared asset, never per instance/frame. Visible authored faces
 * and UVs stay unchanged; recessing the inner skin avoids coplanar duplicates. */
export function solidifyCityTrim(source:BufferGeometry,thickness=.025):BufferGeometry {
 const g=source.index?source.toNonIndexed():source.clone(),p=g.getAttribute("position");
 const point=(i:number)=>new Vector3(p.getX(i),p.getY(i),p.getZ(i));
 const key=(v:Vector3)=>[v.x,v.y,v.z].map(n=>n.toFixed(4)).join(",");
 const vertices=new Map<string,{point:Vector3;normal:Vector3}>();
 const edges=new Map<string,{a:number;b:number;count:number}>();
 for(let i=0;i<p.count;i+=3){
  const v=[point(i),point(i+1),point(i+2)];
  const n=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));
  for(let k=0;k<3;k++){
   const id=key(v[k]);let entry=vertices.get(id);
   if(!entry){entry={point:v[k],normal:new Vector3()};vertices.set(id,entry);}entry.normal.add(n);
   const ka=id,kb=key(v[(k+1)%3]);if(ka===kb)continue;
   const edgeKey=[ka,kb].sort().join("/");const edge=edges.get(edgeKey);
   if(edge)edge.count++;else edges.set(edgeKey,{a:i+k,b:i+(k+1)%3,count:1});
  }
 }
 const boundary=[...edges.values()].filter(e=>e.count===1);
 if(!boundary.length){g.dispose();return source;}
 for(const entry of vertices.values())entry.normal.normalize();
 const inner=(i:number)=>{const v=vertices.get(key(point(i)))!;return v.point.clone().addScaledVector(v.normal,-thickness);};
 const values:Record<string,number[]>={};
 for(const name of Object.keys(g.attributes))if(name!=="tangent")values[name]=[];
 values.normal ??=[];
 const emit=(i:number,position:Vector3,normal:Vector3)=>{
  for(const [name,out] of Object.entries(values)){
   if(name==="position"){out.push(position.x,position.y,position.z);continue;}
   if(name==="normal"){out.push(normal.x,normal.y,normal.z);continue;}
   const attr=g.getAttribute(name);
   for(let c=0;c<attr.itemSize;c++)out.push([attr.getX(i),attr.getY(i),attr.getZ(i),attr.getW(i)][c]);
  }
 };
 const normals=g.getAttribute("normal");
 for(let i=0;i<p.count;i+=3){
  for(const k of [0,1,2])emit(i+k,point(i+k),new Vector3(normals.getX(i+k),normals.getY(i+k),normals.getZ(i+k)));
  for(const k of [2,1,0])emit(i+k,inner(i+k),new Vector3(-normals.getX(i+k),-normals.getY(i+k),-normals.getZ(i+k)));
 }
 for(const {a,b} of boundary){
  const va=point(a),vb=point(b),ia=inner(a),ib=inner(b);
  for(const tri of [[{i:b,p:vb},{i:a,p:va},{i:a,p:ia}],[{i:b,p:vb},{i:a,p:ia},{i:b,p:ib}]]){
   const n=tri[1].p.clone().sub(tri[0].p).cross(tri[2].p.clone().sub(tri[0].p)).normalize();
   for(const v of tri)emit(v.i,v.p,n);
  }
 }
 const out=new BufferGeometry();
 for(const [name,data] of Object.entries(values))out.setAttribute(name,new Float32BufferAttribute(data,name==="normal"?3:g.getAttribute(name).itemSize));
 g.dispose();return out;
}
