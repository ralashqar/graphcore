import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,Quaternion} from 'three';
const base='public/city/furniture/v1',read=p=>readFileSync(p),hash=p=>createHash('sha256').update(read(p)).digest('hex'),catalogue=JSON.parse(read(`${base}/catalogue.json`)),manifest=JSON.parse(read(`${base}/manifest.json`));
assert.equal(hash(`${base}/furniture.glb`),manifest.exportHash);assert.equal(hash('assets/city/furniture/v1/city-furniture-v1.blend'),manifest.sourceHash);assert.equal(hash('scripts/build-city-furniture.py'),manifest.scriptHash);
const glb=read(`${base}/furniture.glb`);assert.equal(glb.toString('ascii',0,4),'glTF');const size=glb.readUInt32LE(12),doc=JSON.parse(glb.toString('utf8',20,20+size));
assert.equal(Object.keys(catalogue.items).length,48);assert.equal(manifest.items.length,48);
const matrix=n=>n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));
for(const item of manifest.items){const spec=catalogue.items[item.id];assert.ok(spec,item.id);assert.ok(existsSync(`${base}/thumbnails/${item.id}.png`));assert.ok(read(`${base}/thumbnails/${item.id}.png`).length>1000);assert.deepEqual(item.size,[spec.width,spec.height,spec.depth]);assert.ok(item.triangles>50&&item.triangles<8000,item.id);
 const root=doc.nodes.find(n=>n.extras?.furniture_id===item.id);assert.ok(root,item.id);const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 function visit(node,parent){const m=parent.clone().multiply(matrix(node));if(node.mesh!==undefined)for(const p of doc.meshes[node.mesh].primitives){const positions=doc.accessors[p.attributes.POSITION],view=doc.bufferViews[positions.bufferView],offset=28+size+(view.byteOffset??0)+(positions.byteOffset??0);assert.equal(positions.componentType,5126);assert.ok(p.attributes.NORMAL!==undefined);for(let j=0;j<positions.count;j++){const v=new Vector3(...[0,1,2].map(i=>glb.readFloatLE(offset+j*(view.byteStride??12)+i*4))).applyMatrix4(m);v.toArray().forEach((x,i)=>{assert.ok(Number.isFinite(x));min[i]=Math.min(min[i],x);max[i]=Math.max(max[i],x);});}}for(const i of node.children??[])visit(doc.nodes[i],m);}
 visit(root,new Matrix4());assert.ok(Math.abs(min[1])<.001,`${item.id}: ground origin`);item.size.forEach((n,i)=>assert.ok(Math.abs(max[i]-min[i]-n)<.06,`${item.id}: measured axis ${i} drift`));
}
console.log(`Validated 48 furniture assets, dimensions, normals, thumbnails, source/script/export hashes; ${manifest.items.reduce((n,p)=>n+p.triangles,0)} triangles, ${(glb.length/1024/1024).toFixed(2)} MB.`);
