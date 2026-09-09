import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motionRecipeSchema, clipRevisionSchema } from './animation.ts'
import { animationRecipeProfile } from './animationProfiles.ts'
import { motionbricksRecipe, providerRequest, decodeProviderMotion } from './animationProviders.ts'
import { inferenceRequestSchema, motionbricksRequestSchema, RunpodTransport, sourceMotionSchema } from './animationTransport.ts'
import { fabricMannequin, somaMannequin } from './mannequin.ts'

const legacy=animationRecipeProfile('walk','a'.repeat(64))
const recipe=motionbricksRecipe(legacy)
test('provider versions preserve legacy commands and reject crossed requests',()=>{
 assert.deepEqual(motionRecipeSchema.parse(legacy),legacy)
 assert.equal(inferenceRequestSchema.safeParse(providerRequest(legacy)).success,true)
 assert.equal(motionbricksRequestSchema.safeParse(providerRequest(recipe)).success,true)
 assert.equal(inferenceRequestSchema.safeParse(providerRequest(recipe)).success,false)
 assert.equal(motionRecipeSchema.safeParse({...legacy,provider:'motionbricks'}).success,false)
})
test('G1 capability gaps never discard constraints or substitute mechanics',()=>{
 for(const state of ['roll','run','uppercut','climb'] as const) assert.throws(()=>motionbricksRecipe(animationRecipeProfile(state,'a'.repeat(64))))
 for(const change of [{candidates:2},{rootMode:'anchor_relative'},{path:[{time:0,x:0,z:0}]},{poses:[{time:0,joints:{Hips:[0,1,0]}}]},{motionContract:'b'.repeat(64)},{primitive:'idle'},{loop:false}])
  assert.equal(motionRecipeSchema.safeParse({...recipe,...change}).success,false)
})
test('diagnostics cannot be interpreted as clips and provenance cannot drift',()=>{
 assert.equal(motionRecipeSchema.safeParse({...recipe,purpose:'diagnostic',primitive:'idle_walk_turn_stop',state:'idle',loop:false}).success,true)
 assert.equal(motionRecipeSchema.safeParse({...recipe,purpose:'diagnostic'}).success,false)
 if(recipe.version!==2)throw new Error('Wrong provider')
 assert.equal(motionRecipeSchema.safeParse({...recipe,provenance:{...recipe.provenance,adapter:'unreviewed'}}).success,false)
 assert.equal(clipRevisionSchema.safeParse({provenance:recipe.provenance,state:'roll'}).success,false)
 assert.throws(()=>decodeProviderMotion(recipe,{version:1}))
})
test('uncertain MotionBricks submissions are attempted once, without retry',async()=>{
 let attempts=0
 const transport=new RunpodTransport('test',async()=>{attempts++;throw new Error('network uncertain')})
 await assert.rejects(transport.submit('https://api.runpod.ai/v2/test/run',providerRequest(recipe)))
 assert.equal(attempts,1)
 await assert.rejects(transport.submit('https://evil.invalid/run',providerRequest(recipe)))
 assert.equal(attempts,1)
})

test('CPU retarget upgrades preserve the exact native inference request',()=>{
 if(recipe.version!==2)throw new Error('Wrong provider')
 const {retargetRevision,...original}=recipe
 assert.equal(retargetRevision,'g1-humanoid-1.2.0')
 assert.deepEqual(providerRequest(recipe),providerRequest(original))
 assert.equal(motionRecipeSchema.parse(original).version,2)
 assert.equal(motionRecipeSchema.safeParse({...recipe,retargetRevision:'unversioned'}).success,false)
})

test('Fabric target has a separate immutable rig and cannot masquerade as SOMA or inference',async()=>{
 const rig=await fabricMannequin(),soma=await somaMannequin()
 assert.notEqual(rig.revision,soma.revision)
 assert.equal(rig.joints.length,77)
 const positions:number[][]=[]
 const joints=rig.joints.map(j=>{const parent=rig.joints.findIndex(p=>p.id===j.parent);const rest=j.translation.map((v,k)=>v+(parent>=0?positions[parent][k]:0));positions.push(rest);return {name:j.id,parent,rest:rest.map((v,k)=>v-positions[0][k])}})
 if(recipe.version!==2)throw Error('Wrong provider')
 const source={version:2,model:recipe.model,modelRevision:recipe.provenance.modelRevision,provenance:recipe.provenance,space:'fabric_ybot',fps:30,seed:42,joints,restRotations:joints.map(()=>[0,0,0,1]),frames:Array.from({length:120},()=>({root:[0,1,0],rotations:joints.map(()=>[0,0,0,1])}))}
 assert.equal(sourceMotionSchema.safeParse(source).success,true)
 assert.equal(sourceMotionSchema.safeParse({...source,space:'soma'}).success,false)
 assert.throws(()=>decodeProviderMotion(recipe,source))
 const malformed=structuredClone(source);malformed.joints[5].rest[0]+=.01
 assert.equal(sourceMotionSchema.safeParse(malformed).success,false)
})
