import assert from 'node:assert/strict'
import { test, beforeEach } from 'node:test'
import {
  __resetRequestCoordinatorForTests,
  createPollGroup,
  isTransientRequestError,
  runCoalescedRequest,
  runLimitedRequest,
} from './requestCoordinator.ts'

beforeEach(() => {
  __resetRequestCoordinatorForTests()
})

test('coalesces identical in-flight requests', async () => {
  let calls = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  const first = runCoalescedRequest({
    key: 'visual-status:job-1',
    className: 'visual-status',
    fn: async () => {
      calls += 1
      await gate
      return { ok: true }
    },
  })
  const second = runCoalescedRequest({
    key: 'visual-status:job-1',
    className: 'visual-status',
    fn: async () => {
      calls += 1
      return { ok: false }
    },
  })

  release()
  assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }])
  assert.equal(calls, 1)
})

test('respects class concurrency caps', async () => {
  let active = 0
  let maxActive = 0
  const requests = Array.from({ length: 8 }, (_, index) => runLimitedRequest({
    className: 'visual-status',
    fn: async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active -= 1
      return index
    },
  }))

  await Promise.all(requests)
  assert.equal(maxActive, 4)
})

test('retries transient read failures with backoff', async () => {
  let calls = 0
  const result = await runLimitedRequest({
    className: 'edge-function',
    retryPolicy: { attempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
    fn: async () => {
      calls += 1
      if (calls === 1) throw new Error('Failed to fetch')
      return 'ok'
    },
  })

  assert.equal(result, 'ok')
  assert.equal(calls, 2)
})

test('classifies aborted and service unavailable refresh failures as transient', () => {
  assert.equal(isTransientRequestError(new DOMException('signal is aborted without reason', 'AbortError')), true)
  const serviceUnavailable = new Error('Service Unavailable') as Error & { status?: number }
  serviceUnavailable.status = 503
  assert.equal(isTransientRequestError(serviceUnavailable), true)
})

test('serializes mutation requests for the same resource key', async () => {
  const order: string[] = []
  const first = runLimitedRequest({
    className: 'mutation',
    resourceKey: 'world_entities:entity-a',
    fn: async () => {
      order.push('first-start')
      await new Promise((resolve) => setTimeout(resolve, 10))
      order.push('first-end')
    },
  })
  const second = runLimitedRequest({
    className: 'mutation',
    resourceKey: 'world_entities:entity-a',
    fn: async () => {
      order.push('second-start')
      order.push('second-end')
    },
  })

  await Promise.all([first, second])
  assert.deepEqual(order, ['first-start', 'first-end', 'second-start', 'second-end'])
})

test('poll groups chunk items and skip overlapping ticks', async () => {
  const polled: number[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const group = createPollGroup({
    key: 'test-poll',
    intervalMs: 1000,
    maxPerTick: 2,
    getItems: () => [1, 2, 3, 4],
    pollItem: async (item) => {
      polled.push(item)
      await gate
      return item
    },
  })

  const firstTick = group.tick()
  await group.tick()
  release()
  await firstTick
  assert.deepEqual(polled, [1, 2])
})
