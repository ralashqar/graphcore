import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildOpenAiUsageLine,
  estimateFalMediaCost,
  estimateOpenAiTextCost,
  estimateOutputWorkflowUsage,
  readAiTokenUsage,
} from './aiUsage.ts'

test('normalizes current OpenAI Responses usage shape', () => {
  const usage = readAiTokenUsage({
    input_tokens: 1200,
    output_tokens: 300,
    total_tokens: 1500,
    input_tokens_details: { cached_tokens: 200 },
    output_tokens_details: { reasoning_tokens: 40 },
  })

  assert.equal(usage.inputTokens, 1200)
  assert.equal(usage.outputTokens, 300)
  assert.equal(usage.totalTokens, 1500)
  assert.equal(usage.cachedInputTokens, 200)
  assert.equal(usage.reasoningTokens, 40)
})

test('normalizes old prompt/completion token usage shape', () => {
  const usage = readAiTokenUsage({
    prompt_tokens: 100,
    completion_tokens: 50,
  })

  assert.equal(usage.inputTokens, 100)
  assert.equal(usage.outputTokens, 50)
  assert.equal(usage.totalTokens, 150)
})

test('prices OpenAI text using cached input discount when available', () => {
  const uncached = estimateOpenAiTextCost({
    model: 'gpt-4o-mini',
    inputTokens: 1_000_000,
    outputTokens: 0,
  })
  const cached = estimateOpenAiTextCost({
    model: 'gpt-4o-mini',
    inputTokens: 1_000_000,
    cachedInputTokens: 1_000_000,
    outputTokens: 0,
  })

  assert.ok(cached.actualCostUsd < uncached.actualCostUsd)
  assert.equal(uncached.priceSnapshot.provider, 'openai')
})

test('builds an OpenAI usage line with actual cost and credits', () => {
  const line = buildOpenAiUsageLine({
    model: 'gpt-4o-mini',
    usage: { input_tokens: 5000, output_tokens: 2000 },
    requestId: 'req_123',
    responseId: 'resp_123',
  })

  assert.equal(line.provider, 'openai')
  assert.equal(line.requestId, 'req_123')
  assert.equal(line.tokens?.totalTokens, 7000)
  assert.ok(line.cost.actualCostUsd > 0)
  assert.ok(line.cost.actualCredits > 0)
})

test('prices Fal media by model unit fallback', () => {
  const cost = estimateFalMediaCost({
    model: 'openai/gpt-image-2',
    units: 2,
  })

  assert.equal(cost.priceSnapshot.provider, 'fal')
  assert.ok(cost.actualCostUsd > 0)
})

test('prices Seedance 2 video estimates per generated second', () => {
  const cost = estimateFalMediaCost({
    model: 'bytedance/seedance-2.0/fast/reference-to-video',
    units: 8,
    durationSeconds: 8,
  })

  assert.equal(cost.priceSnapshot.provider, 'fal')
  assert.equal(cost.priceSnapshot.model, 'bytedance/seedance-2.0/fast/reference-to-video')
  assert.equal(cost.actualCostUsd, 8 * 0.2419)
})

test('estimates output workflow text image and video nodes', () => {
  const summary = estimateOutputWorkflowUsage({
    prompt: 'Create a short comic issue.',
    nodes: [
      { key: 'script', label: 'Script', nodeType: 'text_llm', config: { purpose: 'comic_script' } },
      { key: 'cover', label: 'Cover', nodeType: 'image_generation', config: { model: 'openai/gpt-image-2' } },
      { key: 'clip', label: 'Clip', nodeType: 'video_generation', config: { model: 'bytedance/seedance-2.0/fast/reference-to-video', durationSeconds: 5 } },
    ],
  })

  assert.equal(summary.lines.length, 3)
  assert.equal(summary.lines.find((line) => line.nodeKey === 'script')?.model, 'gpt-5.4')
  assert.ok(summary.estimatedCostUsd > 0)
  assert.ok(summary.totalTokens > 0)
  assert.equal(summary.mediaUnits, 6)
  assert.equal(summary.lines.find((line) => line.nodeKey === 'clip')?.media?.units, 5)
})
