import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {freezeGraph} from '../src/domain/game/animation-studio/graph.ts'
import {studioTemplate} from '../src/domain/game/animation-studio/templates.ts'
import {studioRecipe} from '../src/domain/game/animation-studio/recipes.ts'
import {studioPose} from '../src/domain/game/animation-studio/poses.ts'
import {somaMannequin} from '../src/domain/game/v3/mannequin.ts'
const graph=await freezeGraph(studioTemplate()),sourceRig=await somaMannequin()
const sourceExample=JSON.parse(readFileSync('output/game-fabric-kimodo/idle/source.json','utf8'))
const report=[]
for(const id of ['upright.idle','upright.walk','sword.strike_1','sword.strike_2','sword.strike_3']){
 const {recipe,rig}=await studioRecipe(graph,id),directory=`output/animation-studio-bake/${id}`
 mkdirSync(directory,{recursive:true});writeFileSync(`${directory}/recipe.json`,JSON.stringify(recipe));writeFileSync(`${directory}/rig.json`,JSON.stringify(rig))
 if(id.startsWith('upright'))copyFileSync(`output/game-fabric-kimodo/${recipe.state}/source.json`,`${directory}/source.json`)
 else{
  const node=graph.nodes.find(n=>n.id===id),stance=graph.stances.find(s=>s.id===node.group)
  const frames=Array.from({length:Math.round(recipe.duration*30)},(_,i)=>{const pose=studioPose(sourceRig,node,stance,i/30);return {root:pose.root,rotations:sourceExample.joints.map(j=>pose.rotations[j.name])}})
  writeFileSync(`${directory}/source.json`,JSON.stringify({...sourceExample,seed:recipe.seed,frames}))
 }
 for(const stage of ['retarget','process','export','validate']){
  const result=spawnSync(process.env.GAME_BLENDER_BINARY??'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe',['-b','--factory-startup','--disable-autoexec','--python-exit-code','1','--python','workers/game/animation/bake.py','--',directory,stage],{encoding:'utf8',timeout:180000})
  writeFileSync(`${directory}/${stage}.log`,result.stdout+result.stderr)
  assert.equal(result.status,0,`${id}/${stage} failed; inspect ${directory}/${stage}.log`)
 }
 const validation=JSON.parse(readFileSync(`${directory}/validate.json`,'utf8'))
 report.push({node:id,source:id.startsWith('upright')?'saved Kimodo':'synthetic contract fixture',accepted:validation.accepted,failures:validation.failures})
 assert.equal(validation.accepted,true,JSON.stringify(report.at(-1)))
 assert.equal(validation.boundary.start.length,77)
}
writeFileSync('output/animation-studio-bake/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
