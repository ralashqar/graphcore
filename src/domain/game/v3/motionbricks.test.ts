import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motionRecipeSchema, clipRevisionSchema } from './animation.ts'
import { animationRecipeProfile } from './animationProfiles.ts'
import { motionbricksRecipe, providerRequest, decodeProviderMotion } from './animationProviders.ts'
import { inferenceRequestSchema, motionbricksRequestSchema, RunpodTransport } from './animationTransport.ts'

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
 assert.equal(retargetRevision,'g1-soma-1.1.0')
 assert.deepEqual(providerRequest(recipe),providerRequest(original))
 assert.equal(motionRecipeSchema.parse(original).version,2)
 assert.equal(motionRecipeSchema.safeParse({...recipe,retargetRevision:'unversioned'}).success,false)
})
