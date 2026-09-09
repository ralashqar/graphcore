// Synthetic transform round-trip test; never evidence of model motion quality.
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { g1Skeleton } from '../src/domain/game/v3/g1Skeleton.ts'
import { somaMannequin } from '../src/domain/game/v3/mannequin.ts'
import { motionbricksRecipe } from '../src/domain/game/v3/animationProviders.ts'
import { animationRecipeProfile } from '../src/domain/game/v3/animationProfiles.ts'
import { sourceMotionSchema } from '../src/domain/game/v3/animationTransport.ts'
const directory=mkdtempSync(join(tmpdir(),'graphcore-g1-bake-'))
const blender=process.env.GAME_BLENDER_BINARY??'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe'
try {
 const rig=await somaMannequin(),recipe={...motionbricksRecipe(animationRecipeProfile('idle',rig.revision)),retargetRevision:'g1-soma-1.1.0'}
 const floor=-Math.min(...g1Skeleton.map(j=>j.rest[1]))
 const source=sourceMotionSchema.parse({version:2,model:recipe.model,modelRevision:recipe.provenance.modelRevision,provenance:recipe.provenance,space:'g1',fps:30,seed:42,joints:g1Skeleton,restRotations:g1Skeleton.map(()=>[0,0,0,1]),frames:Array.from({length:120},(_,i)=>{
  const angle=Math.sin(i/119*Math.PI*2)*.03
  return{root:[0,floor,0],rotations:g1Skeleton.map((_,j)=>j===0?[0,Math.sin(angle/2),0,Math.cos(angle/2)]:[0,0,0,1])}
 })})
 for(const [key,value]of Object.entries({source,rig,recipe}))writeFileSync(join(directory,`${key}.json`),JSON.stringify(value))
 for(const stage of ['native_export','source_convert','retarget','process','export','validate']){
  const script=stage==='source_convert'?'workers/game/motionbricks/bake_adapter_v1_1.py':stage==='native_export'?'workers/game/motionbricks/bake_adapter.py':'workers/game/animation/bake.py'
  const result=spawnSync(blender,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',script,'--',directory,stage],{encoding:'utf8',timeout:180000})
  assert.equal(result.status,0,result.stdout+result.stderr)
  if(stage==='source_convert'){
   const converted=sourceMotionSchema.parse(JSON.parse(readFileSync(join(directory,'converted-source.json'),'utf8')))
   assert.equal(converted.space,'soma');assert.equal(converted.frames.length,120)
   copyFileSync(join(directory,'converted-source.json'),join(directory,'source.json'))
  }
 }
 const validation=JSON.parse(readFileSync(join(directory,'validate.json'),'utf8'))
 assert.equal(validation.accepted,true,JSON.stringify(validation))
 console.log(JSON.stringify({syntheticRoundTripPassed:true,metrics:validation.metrics}))
}finally{rmSync(directory,{recursive:true,force:true})}
