// Explicit, bounded setup experiment. Never invoked by planning or normal jobs.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { serverKey } from './game-animation-auth.mjs'
import { humanoidMannequin } from '../src/domain/game/v3/mannequin.ts'
import { motionRecipeSchema } from '../src/domain/game/v3/animation.ts'
import { RunpodTransport, kimodoRelease, sourceMotionSchema } from '../src/domain/game/v3/animationTransport.ts'

const endpoint = 'dr79dd76cb16de'
const reservation = 'd105efcf-ec6c-49d5-9b21-710f510c9fc0'
const directory = 'output/kimodo-locomotion-20260909-attempt2'
const headers = { Authorization: `Bearer ${serverKey()}`, 'Content-Type': 'application/json' }
const control = `https://api.runpod.io/v2/serverless/${endpoint}`
const request = async (method, body) => {
  const response = await fetch(control, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Runpod control HTTP ${response.status}`)
  return response.json()
}
const config = await request('GET')
if (!config.image.endsWith(':4e9b1efcd') || config.workers.min !== 0 || config.workers.max !== 0 || config.timeout !== 600000) throw new Error('Unexpected endpoint configuration')
if (existsSync(directory)) throw new Error('Batch already attempted. Reconcile saved request IDs; never resubmit automatically.')
mkdirSync(directory, { recursive: true })
const record = { reservation, endpoint, startedAt: new Date().toISOString(), deadline: Date.now() + 20*60000, requests: [], stopped: false }
const persist = () => writeFileSync(`${directory}/batch.json`, JSON.stringify(record, null, 2))
persist()
const rig = await humanoidMannequin()
const transport = new RunpodTransport(serverKey())
let active = null
try {
  await request('PATCH', { workers: { min: 0, max: 1, idleTimeout: 60 } })
  await new Promise(resolve => setTimeout(resolve, 30000))
  for (const [state, speed, description] of [
    ['walk', 1.5, 'A person walks steadily straight forward, facing forward, with a natural repeating walking gait.'],
    ['run', 3.5, 'A person runs steadily straight forward, facing forward, with a natural repeating running gait.'],
    ['backward', 1, 'A person walks steadily backward while their torso and face remain facing forward.'],
    ['strafe_left', 1.5, 'A person sidesteps steadily to their own left, keeping their torso and face forward, without turning.'],
    ['strafe_right', 1.5, 'A person sidesteps steadily to their own right, keeping their torso and face forward, without turning.'],
  ]) {
    // Allow a full ten-minute request plus shutdown before the global deadline.
    if (Date.now() + 610000 > record.deadline) throw new Error('Insufficient remaining batch time for another request')
    const path = `${directory}/${state}`
    mkdirSync(path)
    const recipe = motionRecipeSchema.parse({ version: 1, id: `integration.${state}`, state, rigRevision: rig.revision, model: 'Kimodo-SOMA-RP-v1.1', prompt: description, duration: 4, candidates: 1, seed: 42, loop: true, targetSpeed: speed, rootMode: 'in_place', contacts: [], poses: [], path: [], thresholds: { version: 1, maxContactError: .03, maxBoneLengthError: .005, maxSeamAngle: .1, maxSeamVelocity: .2, maxCorrection: .1 } })
    writeFileSync(`${path}/rig.json`, JSON.stringify(rig))
    writeFileSync(`${path}/recipe.json`, JSON.stringify(recipe))
    active = { state, requestId: null, status: 'submission_uncertain', startedAt: new Date().toISOString() }
    record.requests.push(active); persist()
    active.requestId = await transport.submit(config.requestUrls.run, { version: 1, recipe, modelRevision: kimodoRelease.model })
    active.status = 'submitted'; persist()
    console.log(JSON.stringify(active))
    const deadline = Math.min(record.deadline, Date.now()+610000)
    let complete = false
    while (Date.now() < deadline) {
      const status = await transport.status(config.requestUrls.status.replace('/{job_id}', ''), active.requestId)
      active.status = status.status; persist()
      if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(status.status)) {
        writeFileSync(`${path}/provider-result.json`, JSON.stringify(status))
        if (status.status !== 'COMPLETED') throw new Error(`${state}: ${status.status}`)
        if (status.output?.candidates?.length !== 1) throw new Error('Wrong candidate count')
        writeFileSync(`${path}/source.json`, JSON.stringify(sourceMotionSchema.parse(status.output.candidates[0])))
        active.executionMs = status.executionTime; active.completedAt = new Date().toISOString(); persist()
        console.log(JSON.stringify(active))
        active = null; complete = true; break
      }
      await new Promise(resolve => setTimeout(resolve, 15000))
    }
    if (!complete) throw new Error('Bounded request deadline reached')
  }
} finally {
  if (active?.requestId && !['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(active.status)) await transport.cancel(config.requestUrls.cancel.replace('/{job_id}', ''), active.requestId).catch(() => {})
  await request('PATCH', { workers: { min: 0, max: 0, idleTimeout: 5 } })
  record.stopped = true; record.finishedAt = new Date().toISOString(); persist()
  console.log(JSON.stringify({ admissionStopped: true, directory }))
}
