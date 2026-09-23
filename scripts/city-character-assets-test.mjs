import {NodeIO} from '@gltf-transform/core';
import {validateBytes} from 'gltf-validator';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base='public/assets/city/character/',manifest=JSON.parse(await readFile(base+'source.json','utf8')),io=new NodeIO();
for(const [file,info] of Object.entries(manifest.outputs)){
 const b=await readFile(base+file);assert.equal(createHash('sha256').update(b).digest('hex'),info.sha256);const result=await validateBytes(b);assert.equal(result.issues.numErrors,0,JSON.stringify(result.issues));
}
const docs=await Promise.all(['ranger','rogue'].map(n=>io.read(base+n+'.glb'))),clips=await io.read(base+'locomotion.glb');
assert.equal(clips.getRoot().listMeshes().length,0);assert.equal(clips.getRoot().listAnimations().length,7);
for(const doc of docs){const nodes=new Map(doc.getRoot().listNodes().map(n=>[n.getName(),n]));assert.equal(doc.getRoot().listSkins()[0].listJoints().length,23);assert.ok(!doc.getRoot().listNodes().some(n=>/quiver|sword|bow|weapon/i.test(n.getName())));
 for(const a of clips.getRoot().listAnimations())for(const c of a.listChannels()){assert.ok(nodes.has(c.getTargetNode().getName()));assert.notEqual(c.getTargetNode().getName(),'root');assert.ok(c.getSampler()?.getOutput());}
}
console.log('Three valid hash-checked GLBs; 7 clips bind to both 23-joint skins without root tracks or weapons.');
