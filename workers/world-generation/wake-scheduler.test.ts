import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkerWakeScheduler, idleDelayForEmptyPolls } from './wake-scheduler.ts'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('worker wake scheduler resolves waits on timeout', async () => {
  const scheduler = createWorkerWakeScheduler()
  const started = Date.now()
  await scheduler.waitForWakeOrTimeout('visual', 15)
  assert.ok(Date.now() - started >= 10)
})

test('worker wake scheduler resolves matching family immediately', async () => {
  const scheduler = createWorkerWakeScheduler()
  let resolved = false
  const wait = scheduler.waitForWakeOrTimeout('visual', 1000).then(() => {
    resolved = true
  })
  await sleep(10)
  assert.equal(resolved, false)
  assert.equal(scheduler.signal(['visual']), 1)
  await wait
  assert.equal(resolved, true)
  assert.ok(scheduler.lastWakeAt('visual') > 0)
})

test('worker wake scheduler does not wake unrelated families', async () => {
  const scheduler = createWorkerWakeScheduler()
  let visualResolved = false
  let outputResolved = false
  const visualWait = scheduler.waitForWakeOrTimeout('visual', 30).then(() => {
    visualResolved = true
  })
  const outputWait = scheduler.waitForWakeOrTimeout('output_workflow', 1000).then(() => {
    outputResolved = true
  })
  await sleep(10)
  assert.equal(scheduler.signal(['output_workflow']), 1)
  await outputWait
  assert.equal(outputResolved, true)
  assert.equal(visualResolved, false)
  await visualWait
  assert.equal(visualResolved, true)
})

test('worker wake idle delay backs off after repeated empty polls', () => {
  assert.equal(idleDelayForEmptyPolls({ emptyPolls: 1, activePollIntervalMs: 5000, idlePollIntervalMs: 60000 }), 5000)
  assert.equal(idleDelayForEmptyPolls({ emptyPolls: 2, activePollIntervalMs: 5000, idlePollIntervalMs: 60000 }), 10000)
  assert.equal(idleDelayForEmptyPolls({ emptyPolls: 3, activePollIntervalMs: 5000, idlePollIntervalMs: 60000 }), 20000)
  assert.equal(idleDelayForEmptyPolls({ emptyPolls: 4, activePollIntervalMs: 5000, idlePollIntervalMs: 60000 }), 40000)
  assert.equal(idleDelayForEmptyPolls({ emptyPolls: 5, activePollIntervalMs: 5000, idlePollIntervalMs: 60000 }), 60000)
})

test('worker wake scheduler consumes wakes that arrive before sleeping', async () => {
  const scheduler = createWorkerWakeScheduler()
  const pollStartedAt = Date.now()
  await sleep(5)
  assert.equal(scheduler.signal(['visual']), 0)
  const started = Date.now()
  await scheduler.waitForWakeOrTimeout('visual', 1000, pollStartedAt)
  assert.ok(Date.now() - started < 50)
})

test('worker wake idle delay applies bounded jitter when requested', () => {
  for (let index = 0; index < 20; index += 1) {
    const delay = idleDelayForEmptyPolls({
      emptyPolls: 2,
      activePollIntervalMs: 5000,
      idlePollIntervalMs: 60000,
      jitterRatio: 0.2,
    })
    assert.ok(delay >= 8000)
    assert.ok(delay <= 12000)
  }
})
