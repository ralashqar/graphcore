import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isPlaceholderLikeThreadTitle,
  preparePlannerThreadMutations,
  type PlannerThreadAction,
  type PlannerThreadCandidate,
} from './worldPromptThreads.ts'

test('isPlaceholderLikeThreadTitle rejects generic fallback thread labels', () => {
  assert.equal(isPlaceholderLikeThreadTitle('Emerging Story Thread'), true)
  assert.equal(isPlaceholderLikeThreadTitle('Story Thread'), true)
  assert.equal(isPlaceholderLikeThreadTitle('The Succession Fracture'), false)
})

test('preparePlannerThreadMutations creates a concrete new thread from planner action', () => {
  const result = preparePlannerThreadMutations({
    existingThreads: [],
    knownEntityKeys: ['world.actor.yara', 'world.group.red-hand-coalition'],
    threadActions: [{
      action: 'create',
      key: 'thread.yara-red-hand-scandal',
      title: 'Yara and the Red Hand Scandal',
      summary: 'The queen’s daughter risks the throne through her secret romance across faction lines.',
      priority: 'primary',
      linkedEntityKeys: ['world.actor.yara', 'world.group.red-hand-coalition'],
      linkMode: 'merge',
      metadata: {},
    }] satisfies PlannerThreadAction[],
  })

  assert.deepEqual(result.diagnostics, ['thread_actions_applied'])
  assert.equal(result.rejected.length, 0)
  assert.equal(result.mutations.length, 1)
  assert.equal(result.mutations[0]?.existing, false)
  assert.equal(result.mutations[0]?.title, 'Yara and the Red Hand Scandal')
})

test('preparePlannerThreadMutations updates an existing thread additively', () => {
  const result = preparePlannerThreadMutations({
    existingThreads: [{
      key: 'thread.yara-red-hand-scandal',
      title: 'Yara and the Red Hand Scandal',
      summary: 'The queen’s daughter risks the throne.',
      status: 'open',
      priority: 'secondary',
      linkedEntityKeys: ['world.actor.yara'],
      metadata: {},
    }],
    knownEntityKeys: ['world.actor.yara', 'world.actor.caelan'],
    threadActions: [{
      action: 'update',
      key: 'thread.yara-red-hand-scandal',
      title: '',
      summary: 'The queen’s daughter risks the throne through a forbidden romance.',
      linkedEntityKeys: ['world.actor.caelan'],
      linkMode: 'merge',
      metadata: {},
    }] satisfies PlannerThreadAction[],
  })

  assert.deepEqual(result.diagnostics, ['thread_actions_applied'])
  assert.equal(result.mutations.length, 1)
  assert.deepEqual(result.mutations[0]?.linkedEntityKeys, ['world.actor.yara', 'world.actor.caelan'])
  assert.equal(result.mutations[0]?.summary, 'The queen’s daughter risks the throne through a forbidden romance.')
})

test('preparePlannerThreadMutations resolves and reprioritizes an existing thread', () => {
  const result = preparePlannerThreadMutations({
    existingThreads: [{
      key: 'thread.beacon-failures',
      title: 'The Beacon Failures',
      summary: 'Failing towers threaten the coast.',
      status: 'open',
      priority: 'primary',
      linkedEntityKeys: ['world.place.veyrhold'],
      metadata: {},
    }],
    knownEntityKeys: ['world.place.veyrhold'],
    threadActions: [
      {
        action: 'reprioritize',
        key: 'thread.beacon-failures',
        title: '',
        summary: '',
        priority: 'background',
        linkedEntityKeys: [],
        linkMode: 'merge',
        metadata: {},
      },
      {
        action: 'resolve',
        key: 'thread.beacon-failures',
        title: '',
        summary: '',
        linkedEntityKeys: [],
        linkMode: 'merge',
        metadata: {},
      },
    ] satisfies PlannerThreadAction[],
  })

  assert.deepEqual(result.diagnostics, ['thread_actions_applied'])
  assert.equal(result.mutations.length, 2)
  assert.equal(result.mutations[0]?.priority, 'background')
  assert.equal(result.mutations[1]?.status, 'resolved')
})

test('preparePlannerThreadMutations rejects malformed and placeholder thread actions without fallback creation', () => {
  const result = preparePlannerThreadMutations({
    existingThreads: [],
    knownEntityKeys: ['world.actor.yara'],
    threadActions: [{
      action: 'create',
      key: 'thread.generic',
      title: 'Emerging Story Thread',
      summary: '',
      linkedEntityKeys: ['world.actor.yara'],
      linkMode: 'merge',
      metadata: {},
    }] satisfies PlannerThreadAction[],
  })

  assert.deepEqual(result.diagnostics, ['thread_actions_rejected'])
  assert.equal(result.mutations.length, 0)
  assert.equal(result.rejected[0]?.reason, 'Create action used a placeholder-like thread title.')
})

test('preparePlannerThreadMutations supports legacy threadCandidates without inventing fallback threads', () => {
  const result = preparePlannerThreadMutations({
    existingThreads: [],
    knownEntityKeys: [],
    threadCandidates: [] satisfies PlannerThreadCandidate[],
  })

  assert.deepEqual(result.diagnostics, ['no_thread_change'])
  assert.equal(result.mutations.length, 0)
  assert.equal(result.rejected.length, 0)
})
