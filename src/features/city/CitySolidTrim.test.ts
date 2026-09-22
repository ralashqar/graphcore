import {test} from "node:test";
import assert from "node:assert/strict";
import {NodeIO} from "@gltf-transform/core";
import {BufferGeometry,Float32BufferAttribute,PlaneGeometry,Vector3} from "three";
import {isOpenArchitecturalTrim,solidifyCityTrim} from "./CitySolidTrim.ts";
function boundaries(g:BufferGeometry){
 const p=g.getAttribute("position"),edges=new Map<string,number>();
 const key=(i:number)=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>n.toFixed(4)).join(",");
 for(let i=0;i<p.count;i+=3)for(let k=0;k<3;k++){const a=key(i+k),b=key(i+(k+1)%3);if(a===b)continue;const e=[a,b].sort().join("/");edges.set(e,(edges.get(e)||0)+1);}
 return [...edges.values()].filter(n=>n===1).length;
}
test("open trim gains closed returns with correctly wound normals",()=>{
 const source=new PlaneGeometry(2,3),closed=solidifyCityTrim(source);
 assert.equal(boundaries(closed),0);
 const p=closed.getAttribute("position"),n=closed.getAttribute("normal");
 for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,i+k));const normal=v[1].sub(v[0]).cross(v[2].sub(v[0])).normalize();assert.ok(normal.dot(new Vector3().fromBufferAttribute(n,i))>.99);}
 assert.ok(closed.getAttribute("uv"));source.dispose();closed.dispose();
});
test("all exported corner columns and cornices close their source boundaries",async()=>{
 const doc=await new NodeIO().read("public/city/decorators/decorators.glb");let checked=0;
 for(const node of doc.getRoot().listNodes().filter(n=>isOpenArchitecturalTrim(n.getName()))){
  for(const primitive of node.getMesh()!.listPrimitives()){
   const g=new BufferGeometry();for(const [semantic,name] of [["POSITION","position"],["NORMAL","normal"],["TEXCOORD_0","uv"],["COLOR_0","color"]]){const a=primitive.getAttribute(semantic);if(a)g.setAttribute(name,new Float32BufferAttribute(a.getArray()!,a.getElementSize()));}
   const indices=primitive.getIndices();if(indices)g.setIndex(Array.from(indices.getArray()!));
   const closed=solidifyCityTrim(g);const flat=closed.index?closed.toNonIndexed():closed;
   assert.equal(boundaries(flat),0,node.getName());assert.ok(flat.getAttribute("uv"));
   if(g.getAttribute("color"))assert.ok(flat.getAttribute("color"));
   if(flat!==closed)flat.dispose();if(closed!==g)closed.dispose();g.dispose();checked++;
  }
 }
 assert.ok(checked>=30);
});
