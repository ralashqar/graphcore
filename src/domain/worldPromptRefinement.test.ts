import assert from 'node:assert/strict'
import test from 'node:test'

import {
  appendRefinementHistory,
  mergeCanonicalContext,
  mergeCanonicalText,
} from './worldPromptRefinement.ts'

test('mergeCanonicalText preserves prior canon while appending distinct new detail', () => {
  const result = mergeCanonicalText({
    existing: 'Queen Mirelle rules Veyrhold through fear and ceremony.',
    incoming: 'Her council is quietly losing control of the ports and beacon stations.',
    maxUnits: 4,
  })

  assert.equal(result.strategy, 'merged_distinct')
  assert.match(result.text, /Queen Mirelle rules Veyrhold/)
  assert.match(result.text, /losing control of the ports/)
})

test('mergeCanonicalContext reconciles separate context lines instead of overwriting', () => {
  const result = mergeCanonicalContext({
    existing: 'Public Role / Reputation: The queen is feared by the harbor cities.',
    incoming: 'Hidden Truth: Her court hides how unstable the beacon network has become.',
  })

  assert.equal(result.strategy, 'merged_distinct')
  assert.match(result.text, /Public Role \/ Reputation:/)
  assert.match(result.text, /Hidden Truth:/)
})

test('appendRefinementHistory records prior, incoming, and reconciled text without discarding old canon', () => {
  const metadata = appendRefinementHistory({
    metadata: {},
    field: 'notes',
    previousText: 'The council keeps order in the capital.',
    incomingText: 'The council is also losing control of the ports.',
    resultText: 'The council keeps order in the capital. The council is also losing control of the ports.',
    strategy: 'merged_distinct',
    changed: true,
    at: '2026-04-24T12:00:00.000Z',
  })

  assert.ok(Array.isArray(metadata.refinementHistory))
  assert.equal((metadata.refinementHistory as Array<unknown>).length, 1)
  assert.deepEqual((metadata.refinementHistory as Array<Record<string, unknown>>)[0], {
    at: '2026-04-24T12:00:00.000Z',
    field: 'notes',
    strategy: 'merged_distinct',
    previousText: 'The council keeps order in the capital.',
    incomingText: 'The council is also losing control of the ports.',
    resultText: 'The council keeps order in the capital. The council is also losing control of the ports.',
  })
})
