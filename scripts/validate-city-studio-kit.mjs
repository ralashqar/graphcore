import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root)),json=p=>JSON.parse(read(p));
const hash=p=>createHash('sha256').update(read(p)).digest('hex');
for(const version of [2,3]){
const base=`public/city/synarc-kit/v${version}`,manifest=json(`${base}/manifest.json`),catalogue=json(`${base}/catalogue.json`);
assert.equal(hash(`${base}/kit.glb`),manifest.glbSha256);
assert.equal(hash(`assets/city/synarc-kit/v${version}/synarc-city-kit-v${version}.blend`),manifest.sourceSha256);
const glb=read(`${base}/kit.glb`);assert.equal(glb.toString('ascii',0,4),'glTF');
const doc=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)).trim());
assert.equal(manifest.parts.length,version===2?64:72);assert.equal(new Set(manifest.parts.map(p=>p.id)).size,manifest.parts.length);
assert.deepEqual(new Set(doc.materials.map(m=>m.name.replace(/\.\d+$/,'').split('/').at(-1))),new Set(['wall','trim','frame','door','glass']));
for(const part of catalogue.parts){
 const measured=manifest.parts.find(p=>p.id===part.id);assert.ok(measured,part.id);
 for(const key of Object.keys(part))assert.deepEqual(measured[key],part[key],`${part.id} metadata drift: ${key}`);
 assert.ok(measured.triangles>0);assert.ok(measured.bounds.min.every((v,i)=>Number.isFinite(v)&&v<measured.bounds.max[i]));
 assert.ok(doc.nodes.some(n=>n.name===(version===3?`v3/${part.id}`:part.id)),`${part.id} export missing`);
 assert.ok(existsSync(new URL(`${base}/thumbnails/${part.id}.png`,root)));
 assert.ok(part.size.every(n=>n>0));for(const socket of Object.values(part.connectors))assert.ok(socket.every(Number.isFinite));
 if(part.opening){assert.ok(part.opening.width<part.size[0]);assert.ok(part.opening.top<=part.size[1]);assert.ok(part.opening.bottom>=0);}
}
for(const mesh of doc.meshes)for(const primitive of mesh.primitives){assert.ok(primitive.attributes.POSITION!==undefined);assert.ok(primitive.attributes.NORMAL!==undefined);const normal=doc.accessors[primitive.attributes.NORMAL];assert.equal(normal.type,'VEC3');assert.ok(normal.count>0);}
console.log(`Validated v${version}: ${manifest.parts.length} modules, source/export hashes, metadata, bounds, sockets, openings, normals and thumbnails; ${manifest.parts.reduce((n,p)=>n+p.triangles,0)} triangles.`);
}

