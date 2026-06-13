import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeWorkerWakeFamilies,
  notifyWorkerWake,
  notifyWorkerWakeBestEffort,
  setLocalWorkerWakeSink,
  signWorkerWakeBody,
  verifyWorkerWakeSignature,
} from './worker-wake.ts'

test('worker wake family normalization supports all and filters unknown values', () => {
  assert.deepEqual(normalizeWorkerWakeFamilies('visual'), ['visual'])
  assert.deepEqual(normalizeWorkerWakeFamilies(['output_workflow', 'bogus', 'visual', 'visual']), ['output_workflow', 'visual'])
  assert.deepEqual(normalizeWorkerWakeFamilies(['all']), ['visual', 'spatial_world', 'output_workflow', 'generation', 'app_generation'])
})

test('worker wake signatures verify valid HMAC requests', async () => {
  const body = JSON.stringify({ family: 'visual', source: 'test' })
  const timestamp = '2026-06-11T12:00:00.000Z'
  const signature = await signWorkerWakeBody({
    secret: 'test-secret',
    timestamp,
    body,
  })

  const verification = await verifyWorkerWakeSignature({
    secret: 'test-secret',
    timestamp,
    body,
    signature,
    nowMs: Date.parse(timestamp),
  })

  assert.equal(verification.ok, true)
})

test('worker wake signatures reject stale timestamps and invalid signatures', async () => {
  const body = JSON.stringify({ family: 'visual', source: 'test' })
  const timestamp = '2026-06-11T12:00:00.000Z'
  const signature = await signWorkerWakeBody({
    secret: 'test-secret',
    timestamp,
    body,
  })

  const stale = await verifyWorkerWakeSignature({
    secret: 'test-secret',
    timestamp,
    body,
    signature,
    nowMs: Date.parse(timestamp) + 10 * 60_000,
  })
  assert.deepEqual(stale, { ok: false, reason: 'stale_timestamp' })

  const invalid = await verifyWorkerWakeSignature({
    secret: 'test-secret',
    timestamp,
    body,
    signature: `${signature.slice(0, -1)}0`,
    nowMs: Date.parse(timestamp),
  })
  assert.deepEqual(invalid, { ok: false, reason: 'invalid_signature' })
})

test('worker wake uses local sink before HTTP configuration', async () => {
  const received: unknown[] = []
  setLocalWorkerWakeSink((families, payload) => {
    received.push({ families, source: payload.source })
  })
  try {
    const result = await notifyWorkerWake({ family: 'output_workflow', source: 'unit-test' })
    assert.equal(result.ok, true)
    assert.equal(result.local, true)
    assert.deepEqual(received, [{ families: ['output_workflow'], source: 'unit-test' }])
  } finally {
    setLocalWorkerWakeSink(null)
  }
})

test('worker wake best effort schedules HTTP wake with EdgeRuntime waitUntil', async () => {
  const globalWithEdgeRuntime = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void }
  }
  const previous = globalWithEdgeRuntime.EdgeRuntime
  const scheduled: Promise<unknown>[] = []
  globalWithEdgeRuntime.EdgeRuntime = {
    waitUntil: (promise) => {
      scheduled.push(promise)
    },
  }
  try {
    const result = await notifyWorkerWakeBestEffort({ family: 'visual', source: 'unit-test' })
    assert.equal(result.ok, true)
    assert.equal(result.scheduled, true)
    assert.equal(scheduled.length, 1)
    await scheduled[0]
  } finally {
    globalWithEdgeRuntime.EdgeRuntime = previous
  }
})
