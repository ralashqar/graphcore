import test from 'node:test'
import assert from 'node:assert/strict'

import { deriveSequenceOutputStatuses } from './outputSequenceStatus.ts'

const now = '2026-05-10T00:00:00.000Z'

function request(overrides: Record<string, unknown>) {
  return {
    id: 'request-1',
    projectId: 'project-1',
    draftId: 'draft-1',
    workflowId: 'workflow-1',
    latestRunId: 'run-1',
    requestedBy: null,
    sourceSurface: 'outputs',
    prompt: '',
    title: 'Output',
    intent: 'output_generation',
    outputKind: 'cinematic_episode',
    status: 'completed',
    selectedEntityKeys: [],
    selectedSequenceUnitKeys: ['chapter-1'],
    pageCount: null,
    targetFormat: 'video',
    plannerNotes: '',
    errorMessage: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as never
}

function artifact(overrides: Record<string, unknown>) {
  return {
    id: 'artifact-1',
    projectId: 'project-1',
    draftId: 'draft-1',
    workflowId: 'workflow-1',
    runId: 'run-1',
    nodeId: null,
    key: 'artifact-1',
    name: 'Artifact',
    kind: 'video',
    assetKey: null,
    mimeType: 'video/mp4',
    summary: '',
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as never
}

const sequence = {
  id: 'entity-1',
  key: 'chapter-1',
  name: 'Chapter 1',
  summary: '',
  context: '',
  nodeType: 'sequence_unit',
  aliases: [],
  tags: [],
  status: 'active',
  thumbnailAssetKey: null,
  linkedDefinitionKey: null,
  source: 'ai',
  customProperties: {},
  metadata: {},
  createdAt: now,
  updatedAt: now,
} as never

test('sequence output status marks animatic and final video states', () => {
  const animaticStatuses = deriveSequenceOutputStatuses({
    sequenceUnits: [sequence],
    outputRequests: [request({})],
    outputRuns: [],
    outputArtifacts: [],
  })
  assert.equal(animaticStatuses.get('chapter-1')?.cinematicState, 'animatic_ready')

  const videoStatuses = deriveSequenceOutputStatuses({
    sequenceUnits: [sequence],
    outputRequests: [request({})],
    outputRuns: [],
    outputArtifacts: [artifact({})],
  })
  assert.equal(videoStatuses.get('chapter-1')?.cinematicState, 'video_ready')
})

test('sequence output status marks comics and active requests', () => {
  const inProgressStatuses = deriveSequenceOutputStatuses({
    sequenceUnits: [sequence],
    outputRequests: [request({ status: 'running' })],
    outputRuns: [],
    outputArtifacts: [],
  })
  assert.equal(inProgressStatuses.get('chapter-1')?.cinematicState, 'in_progress')

  const comicStatuses = deriveSequenceOutputStatuses({
    sequenceUnits: [sequence],
    outputRequests: [request({
      outputKind: 'comic_issue_from_sequence',
      targetFormat: 'pdf',
      workflowId: 'comic-workflow',
      latestRunId: 'comic-run',
    })],
    outputRuns: [],
    outputArtifacts: [artifact({
      workflowId: 'comic-workflow',
      runId: 'comic-run',
      kind: 'comic_pdf',
      mimeType: 'application/pdf',
    })],
  })
  assert.equal(comicStatuses.get('chapter-1')?.comicState, 'comic_ready')
})
