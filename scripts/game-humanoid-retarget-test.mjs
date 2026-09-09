// Re-bake stored sources only. No provider or credential access.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { somaMannequin, fabricMannequin } from '../src/domain/game/v3/mannequin.ts'
import { sourceMotionSchema } from '../src/domain/game/v3/animationTransport.ts'
import { motionRecipeSchema } from '../src/domain/game/v3/animation.ts'
const base='output/game-motionbricks-compatibility'
const blender='C:/Program Files/Blender Foundation/Blender 5.0/blender.exe'
for(const kind of ['soma','fabric'])for(const state of ['idle','walk']){
 const prior=`${base}/${state==='idle'?'idle':'walk-generated'}`
 const directory=`${base}/${kind}-${state}-1-2`;mkdirSync(directory,{recursive:true})
 const rig=await(kind==='soma'?somaMannequin():fabricMannequin())
 const recipe=motionRecipeSchema.parse({...JSON.parse(readFileSync(`${prior}/recipe.json`)),id:`${kind}.${state}.retarget_1_2`,rigRevision:rig.revision,retargetRevision:'g1-humanoid-1.2.0'})
 writeFileSync(`${directory}/recipe.json`,JSON.stringify(recipe));writeFileSync(`${directory}/rig.json`,JSON.stringify(rig))
 copyFileSync(`${prior}/source.json`,`${directory}/source.json`)
 for(const stage of ['source_convert','retarget','process','export','validate']){
  const script=stage==='source_convert'?'workers/game/motionbricks/bake_adapter_v1_2.py':'workers/game/animation/bake.py'
  const result=spawnSync(blender,['-b','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',script,'--',directory,stage],{encoding:'utf8',timeout:180000})
  writeFileSync(`${directory}/${stage}.log`,result.stdout+result.stderr)
  assert.equal(result.status,0,`${kind}/${state}/${stage}: ${result.stdout+result.stderr}`)
  if(stage==='source_convert'){sourceMotionSchema.parse(JSON.parse(readFileSync(`${directory}/converted-source.json`)));}
  if(stage==='source_convert')copyFileSync(`${directory}/converted-source.json`,`${directory}/source.json`)
 }
 copyFileSync(`${prior}/source.json`,`${directory}/source.json`)
 const validation=JSON.parse(readFileSync(`${directory}/validate.json`));console.log(JSON.stringify({kind,state,...validation}))
 assert.equal(validation.accepted,true,`${kind}/${state}: ${JSON.stringify(validation)}`)
}
