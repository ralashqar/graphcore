// Explicit one-shot setup benchmark. Never called by prompt planning or production.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { serverKey } from './game-animation-auth.mjs'
import { humanoidMannequin } from '../src/domain/game/v3/mannequin.ts'
import { motionRecipeSchema } from '../src/domain/game/v3/animation.ts'
import { RunpodTransport, kimodoRelease, sourceMotionSchema } from '../src/domain/game/v3/animationTransport.ts'

const endpoint = 'dr79dd76cb16de', directory = 'output/kimodo-benchmark-20260909-attempt2'
const expectedImage = 'registry.runpod.net/ralashqar-graphcore-codex-hosted-game-animation-workers-game-animation-dockerfile:4e9b1efcd'
const headers = { Authorization: `Bearer ${serverKey()}`, 'Content-Type': 'application/json' }
const controlUrl = `https://api.runpod.io/v2/serverless/${endpoint}`
const response = await fetch(controlUrl, { headers, signal: AbortSignal.timeout(30000) })
if (!response.ok) throw new Error(`Endpoint check HTTP ${response.status}`)
const endpointConfig = await response.json()
if (endpointConfig.image !== expectedImage || endpointConfig.workers.min !== 0 || endpointConfig.workers.max !== 1 || endpointConfig.timeout !== 600000) throw new Error('Benchmark endpoint image or budget controls do not match')
if (existsSync(`${directory}/submission.json`)) throw new Error('Benchmark already attempted; reconcile the saved request instead of resubmitting')
mkdirSync(directory, { recursive: true })
const rig = await humanoidMannequin()
const recipe = motionRecipeSchema.parse({ version: 1, id: 'benchmark.idle', state: 'idle', rigRevision: rig.revision, model: 'Kimodo-SOMA-RP-v1.1', prompt: 'A person stands still in a relaxed neutral pose, feet planted, arms resting at their sides.', duration: 2, candidates: 1, seed: 42, loop: true, targetSpeed: 0, rootMode: 'in_place', contacts: [], poses: [], path: [], thresholds: { version: 1, maxContactError: .03, maxBoneLengthError: .005, maxSeamAngle: .1, maxSeamVelocity: .2, maxCorrection: .1 } })
writeFileSync(`${directory}/rig.json`, JSON.stringify(rig))
writeFileSync(`${directory}/recipe.json`, JSON.stringify(recipe))
const record = { endpoint, budgetReservation: '48f6de62-96fb-4565-a7e4-7ccf954eb7fb', startedAt: new Date().toISOString(), deadline: Date.now()+900000, status: 'submission_uncertain', requestId: null }
writeFileSync(`${directory}/submission.json`, JSON.stringify(record), { flag: 'wx' })
const persist = () => writeFileSync(`${directory}/submission.json`, JSON.stringify(record, null, 2))
const transport = new RunpodTransport(serverKey(), async (...args) => {
  const response = await fetch(...args)
  if (!response.ok) {
    const body = (await response.clone().text()).slice(0,4000).replaceAll(serverKey(), '[redacted]').replaceAll(serverKey('HF_TOKEN'), '[redacted]')
    writeFileSync(`${directory}/http-rejection.json`, JSON.stringify({ status: response.status, body }))
  }
  return response
})
let terminal = false
try {
  record.requestId = await transport.submit(endpointConfig.requestUrls.run, { version: 1, recipe, modelRevision: kimodoRelease.model })
  record.status = 'submitted'; persist()
  console.log(JSON.stringify({ requestId: record.requestId, status: record.status }))
  while (Date.now() < record.deadline) {
    const status = await transport.status(endpointConfig.requestUrls.status.replace('/{job_id}', ''), record.requestId)
    record.status = status.status; persist()
    console.log(JSON.stringify({ status: status.status, elapsedSeconds: Math.round((Date.now()-Date.parse(record.startedAt))/1000) }))
    if (['COMPLETED','FAILED','CANCELLED','TIMED_OUT'].includes(status.status)) {
      terminal = true
      writeFileSync(`${directory}/provider-result.json`, JSON.stringify(status))
      if (status.status !== 'COMPLETED') throw new Error(`Benchmark ${status.status}; inspect saved provider result`)
      if (status.output?.candidates?.length !== 1) throw new Error('Benchmark returned wrong candidate count')
      const source = sourceMotionSchema.parse(status.output.candidates[0])
      if (source.frames.length !== 60) throw new Error('Unexpected benchmark motion duration')
      writeFileSync(`${directory}/source.json`, JSON.stringify(source))
      console.log(JSON.stringify({ completed: true, frames: source.frames.length, joints: source.joints.length, executionMs: status.executionTime, directory }))
      break
    }
    await new Promise(resolve => setTimeout(resolve, 15000))
  }
  if (!terminal) throw new Error('Benchmark exceeded fifteen-minute wall-clock limit')
} finally {
  if (!terminal && record.requestId) await transport.cancel(endpointConfig.requestUrls.cancel.replace('/{job_id}', ''), record.requestId).catch(() => {})
  // End this experiment's compute admission even after a crash/uncertain result.
  const stopped = await fetch(controlUrl, { method: 'PATCH', headers, body: JSON.stringify({ workers: { min: 0, max: 0 } }), signal: AbortSignal.timeout(30000) })
  console.log(JSON.stringify({ benchmarkAdmissionStopped: stopped.ok, httpStatus: stopped.status }))
  if (!stopped.ok) throw new Error('Could not stop benchmark worker admission; inspect endpoint immediately')
}
