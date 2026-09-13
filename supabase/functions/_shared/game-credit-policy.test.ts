import test from 'node:test'
import assert from 'node:assert/strict'
import { gameCredits, gameCreditBypass } from './game-credit-policy.ts'
test('development credits require both the server flag and exact account allowlisting',()=>{
 const env:Record<string,string>={GAME_GENERATION_USERS:' owner, another '};const read=(k:string)=>env[k]
 assert.equal(gameCredits(read,'owner',25),25)
 env.GAME_DEV_CREDIT_BYPASS_ENABLED='true'
 assert.equal(gameCredits(read,'owner',25),0);assert.equal(gameCredits(read,'owner',150),0)
 assert.equal(gameCredits(read,'outsider',25),25)
 env.GAME_GENERATION_USERS='*';assert.equal(gameCreditBypass(read,'owner'),false)
 env.GAME_GENERATION_USERS='';assert.equal(gameCreditBypass(read,''),false)
 env.GAME_GENERATION_USERS='owner';env.GAME_DEV_CREDIT_BYPASS_ENABLED='false';assert.equal(gameCredits(read,'owner',25),25)
})
test('invalid pricing cannot be masked by development bypass',()=>{
 const env:Record<string,string>={GAME_DEV_CREDIT_BYPASS_ENABLED:'true',GAME_GENERATION_USERS:'owner'};const read=(k:string)=>env[k]
 for(const price of [-1,10001,1.5,NaN])assert.ok(Object.is(gameCredits(read,'owner',price),price))
})
