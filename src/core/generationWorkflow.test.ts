// @ts-nocheck
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertGenerationPhaseTransition,
  mergeWorldBuildJobContext,
  parseWorldBuildJobContext,
  workflowAdvanceResultSchema,
} from './generationWorkflow.ts'

test('world build cinematic workflow context merges queue metadata and preserves legacy fields', () => {
  const context = mergeWorldBuildJobContext({
    kind: 'cinematic_graph',
    current: {
      authoringAttempts: 1,
    },
    phase: 'authoring_script',
    attemptCount: 2,
    transitionReason: 'cinematic_authorship_started',
    patch: {
      authorshipPromptVersion: 'story_prompt_slim_v1',
      authorshipPipeline: 'story_script_ingest_v1',
    },
    diagnostics: [{
      category: 'quality_gate',
      message: 'Waiting for authored script output.',
      source: 'author-cinematic-script',
    }],
  })

  assert.equal(context.phase, 'authoring_script')
  assert.equal(context.workflow?.phase, 'authoring_script')
  assert.equal(context.attemptCount, 2)
  assert.equal(context.workflow?.attemptCount, 2)
  assert.equal(context.authorshipPromptVersion, 'story_prompt_slim_v1')
})

test('phase validation rejects illegal terminal transitions', () => {
  assert.throws(() => assertGenerationPhaseTransition('completed', 'authoring_script'))
})

test('world build context parsing recovers from sparse legacy result_context payloads', () => {
  const parsed = parseWorldBuildJobContext({
    kind: 'cinematic_graph',
    current: {
      phase: 'needs_repair',
      repairAttempts: 1,
      providerRequestId: 'req_42',
    },
  })

  assert.equal(parsed.phase, 'needs_repair')
  assert.equal(parsed.providerQueue?.providerRequestId, 'req_42')
})

test('workflow advance result schema supports typed workflow outcomes', () => {
  const parsed = workflowAdvanceResultSchema.parse({
    status: 'running',
    phase: 'provider_running',
    resultContext: {
      workflowKind: 'world_build',
    },
    diagnostics: [],
    transitionReason: 'provider_submission_succeeded',
  })

  assert.equal(parsed.phase, 'provider_running')
  assert.equal(parsed.status, 'running')
})
