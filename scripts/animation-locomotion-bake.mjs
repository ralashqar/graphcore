import {createHash} from 'node:crypto'
import {defaultLocomotion} from '../src/domain/game/animation-studio/locomotionProfile.ts'
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {freezeGraph} from '../src/domain/game/animation-studio/graph.ts'
import {studioTemplate} from '../src/domain/game/animation-studio/templates.ts'
import {flexibleRecipe} from '../src/domain/game/animation-studio/flexibleRecipes.ts'
import {blankGraph,clipNode,freezeFlexible} from '../src/domain/game/animation-studio/flexible.ts'
import {studioPose} from '../src/domain/game/animation-studio/poses.ts'
import {somaMannequin} from '../src/domain/game/v3/mannequin.ts'
const sourceExample=JSON.parse(readFileSync('output/game-fabric-kimodo/walk/source.json','utf8'))
let draft=blankGraph();draft.nodes=[{...clipNode('custom_walk','Walking'),duration:sourceExample.frames.length/30,loop:true,locomotion:defaultLocomotion()}];draft.entry='custom_walk';const graph=await freezeFlexible(draft)
const report=[]
for(const id of ['custom_walk','custom_run']){
 const kind=id==='custom_run'?'run':'walk',sourcePath=`output/game-fabric-kimodo/${kind}/source.json`;const draft=structuredClone(graph);draft.entry=id;draft.nodes[0]={...draft.nodes[0],id,duration:JSON.parse(readFileSync(sourcePath,'utf8')).frames.length/30,locomotion:{...defaultLocomotion(),gait:kind}};const frozen=await freezeFlexible(draft)
 const {recipe,rig}=await flexibleRecipe(frozen,id),directory=`output/animation-locomotion-bake/${id}`
 mkdirSync(directory,{recursive:true});writeFileSync(`${directory}/recipe.json`,JSON.stringify(recipe));writeFileSync(`${directory}/rig.json`,JSON.stringify(rig))
 copyFileSync(sourcePath,`${directory}/source.json`)
 for(const stage of ['retarget','process','export','validate']){
  const result=spawnSync(process.env.GAME_BLENDER_BINARY??'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe',['-b','--factory-startup','--disable-autoexec','--python-exit-code','1','--python','workers/game/animation/bake.py','--',directory,stage],{encoding:'utf8',timeout:180000})
  writeFileSync(`${directory}/${stage}.log`,result.stdout+result.stderr)
  assert.equal(result.status,0,`${id}/${stage} failed; inspect ${directory}/${stage}.log`)
 }
 assert.equal(createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),createHash('sha256').update(readFileSync(`${directory}/source.json`)).digest('hex'))
 const validation=JSON.parse(readFileSync(`${directory}/validate.json`,'utf8'))
 report.push({node:id,source:`saved Kimodo ${kind} through opt-in locomotion processing`,accepted:validation.accepted,failures:validation.failures})
 assert.equal(validation.accepted,true,JSON.stringify(report.at(-1)))
 assert.equal(validation.boundary.start.length,77);assert.ok(validation.metrics.leftStanceCoverage>=(kind==='run'?.05:.12));assert.ok(validation.metrics.rightStanceCoverage>=(kind==='run'?.05:.12))
}
writeFileSync('output/animation-locomotion-bake/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report))
