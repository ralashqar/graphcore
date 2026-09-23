import {NodeIO,Document} from '@gltf-transform/core';
import {dedup,prune,resample} from '@gltf-transform/functions';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
// Run after extracting the two free official itch downloads into output/kaykit-source.
const source=process.argv[2]||'output/kaykit-source';
const chars=path.join(source,'kaykit-adventurers/KayKit_Adventurers_2.0_FREE');
const anims=path.join(source,'kaykit-character-animations/KayKit_Character_Animations_1.1');
const dest='public/assets/city/character';await fs.mkdir(dest,{recursive:true});
const io=new NodeIO(),hash=b=>createHash('sha256').update(b).digest('hex'),inputs={};
async function read(p){const data=await fs.readFile(p);inputs[path.relative(source,p).replaceAll('\\','/')]=hash(data);return io.read(p);}
const ranger=await read(path.join(chars,'Characters/gltf/Ranger.glb'));
const rogue=await read(path.join(chars,'Characters/gltf/Rogue.glb'));
function rig(doc){const skin=doc.getRoot().listSkins()[0];return skin.listJoints().map(n=>({name:n.getName(),parent:n.getParentNode()?.getName(),t:n.getTranslation(),r:n.getRotation(),s:n.getScale(),bind:Array.from(skin.getInverseBindMatrices().getArray().slice(skin.listJoints().indexOf(n)*16,skin.listJoints().indexOf(n)*16+16))})).sort((a,b)=>a.name.localeCompare(b.name));}
function verify(a,b){if(a.length!==b.length)throw Error('Joint count mismatch');for(let i=0;i<a.length;i++){if(a[i].name!==b[i].name||a[i].parent!==b[i].parent)throw Error('Hierarchy mismatch');for(const k of ['t','r','s','bind'])if(a[i][k].some((v,j)=>Math.abs(v-b[i][k][j])>1e-4))throw Error('Bind mismatch '+a[i].name+' '+k);}}
const reference=rig(ranger);verify(reference,rig(rogue));
for(const [name,doc] of [['ranger',ranger],['rogue',rogue]]){
 for(const n of doc.getRoot().listNodes())if(/quiver|weapon|bow|sword/i.test(n.getName()))n.dispose();
 await doc.transform(prune(),dedup());await io.write(path.join(dest,name+'.glb'),doc);
}
const clips=new Document(),buffer=clips.createBuffer(),scene=clips.createScene('Rig_Medium');
const nodes=new Map();for(const n of ranger.getRoot().listNodes())if(!n.getMesh())nodes.set(n.getName(),clips.createNode(n.getName()).setTranslation(n.getTranslation()).setRotation(n.getRotation()).setScale(n.getScale()));
for(const n of ranger.getRoot().listNodes())if(nodes.has(n.getName())){const target=nodes.get(n.getName()),parent=n.getParentNode();if(parent&&nodes.has(parent.getName()))nodes.get(parent.getName()).addChild(target);else scene.addChild(target);}
const choices={General:{Idle_A:'idle'},MovementBasic:{Walking_A:'walk',Running_A:'run',Jump_Start:'jump',Jump_Idle:'airborne',Jump_Land:'land'},Simulation:{Waving:'wave'}};
for(const [file,selected] of Object.entries(choices)){
 const doc=await read(path.join(anims,'Animations/gltf/Rig_Medium/Rig_Medium_'+file+'.glb'));verify(reference,rig(doc));
 for(const original of doc.getRoot().listAnimations()){
  const name=selected[original.getName()];if(!name)continue;const animation=clips.createAnimation(name);
  for(const channel of original.listChannels()){
   const target=channel.getTargetNode().getName(),property=channel.getTargetPath();
   // Simulation owns root translation/rotation. Keep the hips/body motion on child joints.
   if(target==='root')continue;
   if(!nodes.has(target))throw Error('Unbound animation '+target);
   const sampler=channel.getSampler(),copy=a=>clips.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setBuffer(buffer);
   const copied=clips.createAnimationSampler().setInterpolation(sampler.getInterpolation()).setInput(copy(sampler.getInput())).setOutput(copy(sampler.getOutput()));
   animation.addSampler(copied).addChannel(clips.createAnimationChannel().setTargetNode(nodes.get(target)).setTargetPath(property).setSampler(copied));
  }
 }
}
await clips.transform(resample(),dedup(),prune());await io.write(path.join(dest,'locomotion.glb'),clips);
await fs.copyFile(path.join(chars,'License.txt'),path.join(dest,'LICENSE-characters.txt'));await fs.copyFile(path.join(anims,'License.txt'),path.join(dest,'LICENSE-animations.txt'));
const outputs={};for(const f of ['ranger.glb','rogue.glb','locomotion.glb']){const b=await fs.readFile(path.join(dest,f));outputs[f]={sha256:hash(b),bytes:b.length};}
await fs.writeFile(path.join(dest,'source.json'),JSON.stringify({version:1,characters:{url:'https://kaylousberg.itch.io/kaykit-adventurers',version:'Free 2.0',archiveSha256:hash(await fs.readFile(path.join(source,'kaykit-adventurers.zip')))},animations:{url:'https://kaylousberg.itch.io/kaykit-character-animations',version:'Free 1.1',archiveSha256:hash(await fs.readFile(path.join(source,'kaykit-character-animations.zip')))},licence:'CC0',rig:'Rig_Medium',verifiedSkins:['Ranger','Rogue'],joints:reference.length,bindTolerance:1e-4,rootMotion:'root tracks removed; hips/body motion retained',inputs,outputs},null,2)+'\n');
console.log(outputs);
