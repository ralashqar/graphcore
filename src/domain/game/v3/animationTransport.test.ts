import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RunpodTransport, runpodUrl } from './animationTransport.ts'

test('provider URLs cannot redirect credentials to another origin', () => {
  for (const url of ['http://api.runpod.ai/v2/a/run', 'https://evil.test/v2/a/run', 'https://api.runpod.ai@evil.test/v2/a/run', 'https://api.runpod.ai/v2/a/run?key=x']) assert.throws(() => runpodUrl(url))
  assert.equal(runpodUrl('https://api.runpod.ai/v2/abc/run').hostname, 'api.runpod.ai')
})
test('poll failures do not retry or expose provider bodies', async () => {
  let calls = 0
  const transport = new RunpodTransport('secret', async () => { calls++; return new Response('secret signed url', { status: 503 }) })
  await assert.rejects(transport.status('https://api.runpod.ai/v2/abc/status', 'job'), { message: 'Runpod request returned HTTP 503' })
  assert.equal(calls, 1)
})
test('oversized provider output is rejected while streaming', async () => {
  const transport = new RunpodTransport('secret', async () => new Response(new Uint8Array(16_000_001)))
  await assert.rejects(transport.status('https://api.runpod.ai/v2/abc/status', 'job'), /byte limit/)
})
