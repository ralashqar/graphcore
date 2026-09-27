// The prepared medium kit (public/city/synarc-kit/v*/kit-medium.glb, scripts/build-city-kit-medium.py) must match the
// kit it was derived from: same modules and channel materials, built from the current kit.glb, and much cheaper.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {STUDIO_MODULES_V5,studioModules} from './cityStudioCatalog.ts';
// Kit v5's own modules (the studio's v5 catalogue also lists the Tokyo pack, tested in cityStudioTokyoKit.test.ts).
const kitModules=(v:2|3|4|5)=>v===5?STUDIO_MODULES_V5:studioModules(v);

type Gltf={scenes:{nodes:number[]}[];scene?:number;nodes:{name?:string;children?:number[];mesh?:number}[];meshes:{primitives:{material?:number}[]}[];materials:{name:string}[]};
const folder=(v:number)=>new URL(`../../public/city/synarc-kit/v${v}/`,import.meta.url);
function readGlb(file:URL):Gltf{
 const b=readFileSync(file),length=b.readUInt32LE(12);
 assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(16),0x4e4f534a);
 return JSON.parse(b.toString('utf8',20,20+length));
}
const channel=(material:string)=>material.replace(/\.\d+$/,'').split('/').at(-1)!.replace(/^studio_/,'');
/** Module name -> channels of its meshes, as loadStudioKit reads them. */
function modules(g:Gltf){
 const out=new Map<string,Set<string>>();
 for(const root of g.scenes[g.scene??0].nodes){
  const name=(g.nodes[root].name??'').replace(/^v[345]\//,''),channels=new Set<string>();
  const walk=(i:number)=>{const n=g.nodes[i];if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives)if(p.material!==undefined)channels.add(channel(g.materials[p.material].name));n.children?.forEach(walk);};
  walk(root);out.set(name,channels);
 }
 return out;
}

for(const version of [2,3,4,5] as const){
 test(`medium kit v${version} matches its kit`,()=>{
  const manifest=JSON.parse(readFileSync(new URL('kit-medium.json',folder(version)),'utf8'));
  assert.equal(manifest.sourceSha256,createHash('sha256').update(readFileSync(new URL('kit.glb',folder(version)))).digest('hex'),'kit.glb changed: rebuild with scripts/build-city-kit-medium.py');
  assert.equal(manifest.glbSha256,createHash('sha256').update(readFileSync(new URL('kit-medium.glb',folder(version)))).digest('hex'));
  const full=modules(readGlb(new URL('kit.glb',folder(version)))),medium=modules(readGlb(new URL('kit-medium.glb',folder(version))));
  assert.equal(medium.size,kitModules(version).length);
  assert.deepEqual([...medium.keys()].sort(),[...full.keys()].sort());
  // A medium module never gains a channel (every channel keeps its instance colour and material).
  for(const [id,channels] of medium)for(const c of channels)assert.ok(full.get(id)!.has(c),`${id}: ${c}`);
  // Modules that are drawn beyond 120 m keep geometry; the kit as a whole is less than 60 % of the full triangles.
  // (v2's `sill` root is exported as `sill.014` in both files, as the runtime reads it.)
  for(const part of kitModules(version))if(part.minDetail!=='near'&&full.get(part.id)?.size)assert.ok(medium.get(part.id)!.size>0,part.id);
  assert.ok(manifest.triangles.medium<.6*manifest.triangles.full);
 });
}
