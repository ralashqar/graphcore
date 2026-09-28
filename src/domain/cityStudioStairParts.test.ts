// The Blender stair parts pack (scripts/build-city-stair-parts.py → public/city/stairs/v1): the catalogue mirrors
// STAIR_PARTS, both levels of detail exist with matching hashes, the medium level is lighter, sizes agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {STAIR_PARTS,STAIR_PART_IDS} from './cityStudioRailings.ts';

const dir=new URL('../../public/city/stairs/v1/',import.meta.url);
const catalogue=JSON.parse(readFileSync(new URL('catalogue.json',dir),'utf8')),manifest=JSON.parse(readFileSync(new URL('manifest.json',dir),'utf8'));

test('the stair pack catalogue mirrors STAIR_PARTS and both GLBs match the manifest',()=>{
 assert.deepEqual(Object.keys(catalogue.parts).sort(),[...STAIR_PART_IDS].sort());assert.deepEqual([...manifest.parts].sort(),[...STAIR_PART_IDS].sort());
 for(const file of ['kit.glb','kit-medium.glb']){const bytes=readFileSync(new URL(file,dir));assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.files[file],file);assert.equal(bytes.readUInt32LE(0),0x46546c67,`${file} is a GLB`);}
 for(const id of STAIR_PART_IDS){const part=catalogue.parts[id];
  assert.ok(part.trianglesMedium<=part.triangles&&part.triangles<=part.budget,`${id}: ${part.triangles}/${part.trianglesMedium}`);
  STAIR_PARTS[id].size.forEach((v,k)=>assert.ok(Math.abs(v-part.size[k])<Math.max(.05,v*.25),`${id} size ${k}: ${v} vs ${part.size[k]}`));
 }
 assert.ok(manifest.triangles.medium<manifest.triangles.full*.7,'the medium level roughly halves the pack');
});
