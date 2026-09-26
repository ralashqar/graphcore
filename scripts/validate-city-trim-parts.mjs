// Validates public/city/trims/v1: hashes, catalogue <-> GLB node names, measured bounds, origin
// placement per anchor type, stretch bands, triangle budgets, normals and thumbnails.
// (src/domain/cityStudioTrimParts.test.ts checks catalogue.json against TRIM_PARTS.)
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,Quaternion} from 'three';
const base='public/city/trims/v1',read=p=>readFileSync(p),hash=p=>createHash('sha256').update(read(p)).digest('hex'),catalogue=JSON.parse(read(`${base}/catalogue.json`));
assert.equal(hash(`${base}/trims.glb`),catalogue.exportHash,'trims.glb does not match catalogue.exportHash (rebuild)');
assert.equal(hash('scripts/build-city-trim-parts.py'),catalogue.scriptHash,'build script changed since the last build (rebuild)');
const glb=read(`${base}/trims.glb`);assert.equal(glb.toString('ascii',0,4),'glTF');const size=glb.readUInt32LE(12),doc=JSON.parse(glb.toString('utf8',20,20+size)),bin=28+size;
const roots=doc.nodes.filter(n=>n.extras?.trim_id),ids=Object.keys(catalogue.parts);
assert.deepEqual(roots.map(n=>n.extras.trim_id).sort(),[...ids].sort(),'catalogue parts and GLB roots differ');
for(const n of roots)assert.equal(n.name,n.extras.trim_id,'root node name matches its id');
assert.ok(doc.materials.every(m=>/^(trim|planting|metal|light)\//.test(m.name)),'material classes are trim/planting/metal/light');
const matrix=n=>n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));
const accessorCount=i=>doc.accessors[i].count;
let total=0;
for(const [id,spec] of Object.entries(catalogue.parts)){
 const root=roots.find(n=>n.extras.trim_id===id),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let triangles=0;
 (function visit(node,parent){const m=parent.clone().multiply(matrix(node));
  if(node.mesh!==undefined)for(const p of doc.meshes[node.mesh].primitives){
   assert.ok(p.attributes.NORMAL!==undefined,`${id}: normals`);assert.ok(p.material!==undefined,`${id}: material`);
   triangles+=(p.indices!==undefined?accessorCount(p.indices):accessorCount(p.attributes.POSITION))/3;
   const a=doc.accessors[p.attributes.POSITION],view=doc.bufferViews[a.bufferView],offset=bin+(view.byteOffset??0)+(a.byteOffset??0);assert.equal(a.componentType,5126);
   for(let j=0;j<a.count;j++){const v=new Vector3(...[0,1,2].map(i=>glb.readFloatLE(offset+j*(view.byteStride??12)+i*4))).applyMatrix4(m);v.toArray().forEach((x,i)=>{assert.ok(Number.isFinite(x));min[i]=Math.min(min[i],x);max[i]=Math.max(max[i],x);});}
  }
  for(const i of node.children??[])visit(doc.nodes[i],m);
 })(root,new Matrix4());
 total+=triangles;
 assert.equal(triangles,spec.triangles,`${id}: triangle count`);assert.ok(triangles<=spec.budget&&triangles<=400,`${id}: ${triangles} triangles over budget`);
 spec.bounds.forEach(([lo,hi],i)=>{assert.ok(Math.abs(min[i]-lo)<2e-3&&Math.abs(max[i]-hi)<2e-3,`${id}: axis ${i} measured ${min[i].toFixed(3)}..${max[i].toFixed(3)} vs ${lo}..${hi}`);});
 // Every part is authored on the wall skin, out of the wall, with its origin at the attachment point.
 const [[x0,x1],[y0,y1],[z0,z1]]=spec.bounds,cx=(x0+x1)/2;if(spec.anchor!=="child")assert.ok(z0>-1e-3&&z0<.12&&z1>0,`${id}: z starts at the wall skin`);
 const anchor={
  'opening-side':()=>x0<=1e-3&&x0>-.05&&x1>.3&&Math.abs(y0)<1e-3,
  'opening-bottom':()=>Math.abs(cx)<1e-3&&y1<=1e-3&&y0<0,
  'opening-top':()=>Math.abs(cx)<1e-3&&y1>0,
  apex:()=>Math.abs(cx)<1e-3&&y0<0&&y1>0,
  'wall-point':()=>Math.abs(cx)<1e-3&&y0<0&&y1>0,
  child:()=>Math.abs(cx)<.05&&spec.parent in catalogue.parts&&Math.abs(y0)<.3,
 }[spec.anchor];
 assert.ok(anchor&&anchor(),`${id}: origin does not match anchor ${spec.anchor}`);
 for(const [axis,i] of [['x',0],['y',1]]){const bands=spec.stretch[axis]??[];let last=-Infinity;for(const [a,b] of bands){assert.ok(a<b&&a>last&&a>=spec.bounds[i][0]&&b<=spec.bounds[i][1],`${id}: ${axis} band ${a}..${b}`);last=b;}}
 assert.ok(['accent','trim','none'].includes(spec.tint));assert.ok(spec.materials.every(m=>doc.materials.some(d=>d.name===m)),`${id}: materials`);
 assert.ok(existsSync(`${base}/thumbnails/${id}.png`)&&read(`${base}/thumbnails/${id}.png`).length>1000,`${id}: thumbnail`);
}
console.log(`Validated ${ids.length} trim parts: hashes, node names, bounds, anchors, stretch bands, normals, thumbnails; ${total} triangles, ${(glb.length/1024).toFixed(1)} KiB.`);
