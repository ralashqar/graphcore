import {BufferGeometry, Float32BufferAttribute, Vector3} from "three";
import type {NATIVE_MODULES} from "../../domain/cityNativeModules";

/** Close open panel perimeter edges inward. Never cap a window/door aperture.
 * The source kit often supplies a front sheet plus an interior sheet rather than
 * a solid volume. Shared geometry gains returns; instances remain one draw call.
 */
export function closeNativePanel(source:BufferGeometry, module:typeof NATIVE_MODULES[string]):BufferGeometry {
 const geometry=source.index?source.toNonIndexed():source.clone();
 const positions=geometry.getAttribute("position"), normals=geometry.getAttribute("normal"),uv=geometry.getAttribute("uv");
 const point=(i:number)=>new Vector3(positions.getX(i),positions.getY(i),positions.getZ(i));
 const edges=new Map<string,{a:number;b:number;count:number}>();
 const key=(v:Vector3)=>[v.x,v.y,v.z].map(n=>n.toFixed(4)).join(",");
 for(let i=0;i<positions.count;i+=3)for(const [a,b] of [[i,i+1],[i+1,i+2],[i+2,i]]){
  const ka=key(point(a)),kb=key(point(b)),k=[ka,kb].sort().join("/");
  const edge=edges.get(k);if(edge)edge.count++;else edges.set(k,{a,b,count:1});
 }
 const extra:number[]=[],extraNormals:number[]=[],extraUv:number[]=[],extraSources:number[]=[];
 const back=module.face-.24;
 const perimeter=(a:Vector3,b:Vector3)=>
  [-module.width/2,module.width/2].some(x=>Math.abs(a.x-x)<.004&&Math.abs(b.x-x)<.004)||
  [0,module.height].some(y=>Math.abs(a.y-y)<.004&&Math.abs(b.y-y)<.004);
 for(const {a,b,count} of edges.values()){
  const p=point(a),q=point(b);
  if(count!==1||!perimeter(p,q)||Math.min(p.z,q.z)<=back+.001)continue;
  const pb=p.clone().setZ(back),qb=q.clone().setZ(back);
  for(const tri of [[q,p,pb],[q,pb,qb]]){
   const normal=tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])).normalize();
   for(const v of tri){extra.push(v.x,v.y,v.z);extraNormals.push(normal.x,normal.y,normal.z);extraUv.push(v.x/module.width,v.y/module.height);extraSources.push(v===p||v===pb?a:b);}
  }
 }
 if(!extra.length){geometry.dispose();return source;}
 const baseP=Array.from({length:positions.count},(_,i)=>[positions.getX(i),positions.getY(i),positions.getZ(i)]).flat();
 const baseN=Array.from({length:positions.count},(_,i)=>[normals.getX(i),normals.getY(i),normals.getZ(i)]).flat();
 const baseUV=Array.from({length:positions.count},(_,i)=>uv?[uv.getX(i),uv.getY(i)]:[0,0]).flat();
 const out=new BufferGeometry();
 out.setAttribute("position",new Float32BufferAttribute([...baseP,...extra],3));
 out.setAttribute("normal",new Float32BufferAttribute([...baseN,...extraNormals],3));
 out.setAttribute("uv",new Float32BufferAttribute([...baseUV,...extraUv],2));
 // Quaternius uses vertex colours as well as textures. Preserve all auxiliary
 // attributes; dropping COLOR_0 makes instanced native materials render black.
 for(const [name,attribute] of Object.entries(geometry.attributes)){
  if(["position","normal","uv"].includes(name))continue;
  const values:number[]=[];
  const component=(i:number,j:number)=>[attribute.getX(i),attribute.getY(i),attribute.getZ(i),attribute.getW(i)][j];
  for(let i=0;i<attribute.count;i++)for(let j=0;j<attribute.itemSize;j++)values.push(component(i,j));
  for(const i of extraSources)for(let j=0;j<attribute.itemSize;j++)values.push(component(i,j));
  out.setAttribute(name,new Float32BufferAttribute(values,attribute.itemSize));
 }
 geometry.dispose();
 return out;
}
