import test from 'node:test'
import assert from 'node:assert/strict'

import { analyzeWorldPromptEntityRequirements } from './worldPromptRequirements.ts'

test('analyzeWorldPromptEntityRequirements extracts explicit seed-world counts', () => {
  const requirements = analyzeWorldPromptEntityRequirements(
    'Create a dark fantasy political world centered on House Veyr. Add the capital city, two rival factions, three major characters, one forbidden artifact, and an active succession crisis thread.',
  )

  assert.equal(requirements.counts.actor, 3)
  assert.equal(requirements.counts.group, 3)
  assert.equal(requirements.counts.place, 1)
  assert.equal(requirements.counts.object, 1)
  assert.equal(requirements.minimumEntityOps, 8)
  assert.equal(requirements.hasExplicitCount, true)
  assert.equal(requirements.hasSeedWorldShape, true)
})

test('analyzeWorldPromptEntityRequirements handles numeric counts', () => {
  const requirements = analyzeWorldPromptEntityRequirements('Add 4 characters, 2 places, and 1 artifact.')

  assert.equal(requirements.counts.actor, 4)
  assert.equal(requirements.counts.place, 2)
  assert.equal(requirements.counts.object, 1)
  assert.equal(requirements.minimumEntityOps, 7)
})

test('analyzeWorldPromptEntityRequirements does not force counts for advisory prompts', () => {
  const requirements = analyzeWorldPromptEntityRequirements('What kinds of factions would fit this kingdom?')

  assert.deepEqual(requirements.counts, {})
  assert.equal(requirements.minimumEntityOps, 0)
  assert.equal(requirements.hasExplicitCount, false)
})
