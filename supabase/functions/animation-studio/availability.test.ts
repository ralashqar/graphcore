import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioAvailability } from './availability.ts'

test('development pricing is zero only for allowed accounts and preserves GPU gates',()=>{
 const env:Record<string,string>={GAME_GENERATION_ENABLED:'true',GAME_GENERATION_USERS:'creator',GAME_DEV_CREDIT_BYPASS_ENABLED:'true',GAME_PLAN_CREDITS:'25',GAME_ANIMATION_RESERVATION_CENTS:'200',GAME_ANIMATION_PRICING_EVIDENCE:'verified'}
 const read=(key:string)=>env[key]
 assert.equal(studioAvailability(read,'creator').planCredits,0)
 assert.equal(studioAvailability(read,'other').planCredits,25)
 assert.equal(studioAvailability(read,'creator').generation.enabled,false)
 assert.equal(studioAvailability(read,'creator').generation.reservationPerClipCents,200)
 env.GAME_GENERATION_ENABLED='false'
 assert.equal(studioAvailability(read,'creator').planningEnabled,false)
})

test('advisory pricing preserves account and provider gates', () => {
  const env:Record<string,string>={GAME_GENERATION_ENABLED:'true',GAME_GENERATION_USERS:'creator',GAME_PLAN_CREDITS:'25',GAME_ANIMATION_RESERVATION_CENTS:'200',GAME_ANIMATION_PRICING_EVIDENCE:'verified'}
  const read=(key:string)=>env[key]
  assert.equal(studioAvailability(read,'other').planningEnabled,false)
  assert.equal(studioAvailability(read,'creator').generation.enabled,false)
  assert.equal(studioAvailability(read,'creator').generation.reservationPerClipCents,200)
  env.GAME_ANIMATION_STUDIO_GENERATION_ENABLED='true';env.GAME_ANIMATION_ENABLED='true'
  assert.equal(studioAvailability(read,'creator').generation.enabled,true)
  env.GAME_ANIMATION_RESERVATION_CENTS='NaN'
  assert.equal(studioAvailability(read,'creator').generation.enabled,false)
  assert.equal(studioAvailability(read,'creator').generation.reservationPerClipCents,null)
  env.GAME_PLAN_CREDITS='-1'
  assert.equal(studioAvailability(read,'creator').planningEnabled,false)
})
