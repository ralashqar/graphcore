import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {freezeGraph} from '../src/domain/game/animation-studio/graph.ts'
import {studioTemplate} from '../src/domain/game/animation-studio/templates.ts'
import {flexibleRecipe} from '../src/domain/game/animation-studio/flexibleRecipes.ts'
import {blankGraph,clipNode,freezeFlexible} from '../src/domain/game/animation-studio/flexible.ts'
import {studioPose} from '../src/domain/game/animation-studio/poses.ts'
import {somaMannequin} from '../src/domain/game/v3/mannequin.ts'
const sourceExample=JSON.parse(readFileSync('output/game-fabric-kimodo/idle/source.json','utf8'))
let draft=blankGraph();draft.nodes=[{...clipNode('custom_wait','Quiet waiting'),duration:sourceExample.frames.length/30}];draft.entry='custom_wait';const graph=await freezeFlexible(draft)
const report=[]
for(const id of ['custom_wait']){
 const {recipe,rig}=await flexibleRecipe(graph,id),directory=`output/animation-flexible-bake/${id}`
 mkdirSync(directory,{recursive:true});writeFileSync(`${directory}/recipe.json`,JSON.stringify(recipe));writeFileSync(`${directory}/rig.json`,JSON.stringify(rig))
 copyFileSync('output/game-fabric-kimodo/idle/source.json',`${directory}/source.json`)
 for(const stage of ['retarget','process','export','validate']){
  const result=spawnSync(process.env.GAME_BLENDER_BINARY??'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe',['-b','--factory-startup','--disable-autoexec','--python-exit-code','1','--python','workers/game/animation/bake.py','--',directory,stage],{encoding:'utf8',timeout:180000})
  writeFileSync(`${directory}/${stage}.log`,result.stdout+result.stderr)
  assert.equal(result.status,0,`${id}/${stage} failed; inspect ${directory}/${stage}.log`)
 }
 const validation=JSON.parse(readFileSync(`${directory}/validate.json`,'utf8'))
 report.push({node:id,source:'saved Kimodo idle through generic adapter, not a newly generated custom motion',accepted:validation.accepted,failures:validation.failures})
 assert.equal(validation.accepted,true,JSON.stringify(report.at(-1)))
 assert.equal(validation.boundary.start.length,77)
}
writeFileSync('output/animation-flexible-bake/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
