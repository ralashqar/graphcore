import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUnified } from './recipes.ts'
import { actorAnimationRequirements, proposeAnimations } from './animationRequirements.ts'
test('requirements follow actor mechanics and do not invent roll support',()=>{
 const design=createUnified('exploration'),actor=design.nodes.find(n=>n.kind==='actor_definition')!
 assert.equal(actor.kind,'actor_definition');if(actor.kind!=='actor_definition')return
 actor.canClimb=false
 const requirements=actorAnimationRequirements(design,actor.id)
 assert(requirements.includes('takeoff'));assert(!requirements.includes('roll'));assert(!requirements.includes('climb'))
 actor.canClimb=true;assert(actorAnimationRequirements(design,actor.id).includes('climb'))
 assert.deepEqual(actorAnimationRequirements(design,'missing'),[])
 const proposed=proposeAnimations(design,'a'.repeat(64),[])
 assert(proposed.every(p=>p.requirements.every(r=>r.clipRevision===null)))
 assert(proposed[0].requirements.find(r=>r.state==='climb')?.support==='awaiting_motion_acceptance')
})
