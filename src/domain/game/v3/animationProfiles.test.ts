import test from 'node:test'
import assert from 'node:assert/strict'
import { animationStates } from './animation.ts'
import { animationRecipeProfile } from './animationProfiles.ts'
import { validateKimodoConstraints } from './animationTransport.ts'
test('versioned recipes satisfy admission and milestone constraints',()=>{
  for(const state of animationStates){
    const recipe=animationRecipeProfile(state,'a'.repeat(64))
    assert.doesNotThrow(()=>validateKimodoConstraints(recipe))
    assert.equal(recipe.id,`humanoid.${state}.v1`)
  }
  assert.equal(animationRecipeProfile('roll','a'.repeat(64)).rootMode,'controller_curve')
  assert.equal(animationRecipeProfile('climb','a'.repeat(64)).loop,false)
})
