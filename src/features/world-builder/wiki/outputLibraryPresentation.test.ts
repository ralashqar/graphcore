import assert from 'node:assert/strict'
import test from 'node:test'

import type { AssetDefinition } from '../../../domain/graphcore.ts'
import type { OutputArtifact, OutputRequest, OutputWorkflowRun, OutputWorkflowRunStep } from '../../../domain/outputWorkflow.ts'
import { buildOutputLibraryModel } from './outputLibraryPresentation.ts'

const now = '2026-01-01T00:00:00.000Z'

function request(overrides: Partial<OutputRequest>): OutputRequest {
  return {
    id: overrides.id ?? 'request-1',
    projectId: 'project',
    draftId: 'draft',
    workflowId: overrides.workflowId ?? 'workflow-1',
    latestRunId: overrides.latestRunId ?? 'run-1',
    requestedBy: null,
    sourceSurface: 'outputs',
    prompt: overrides.prompt ?? 'Create a designed reference document.',
    title: overrides.title ?? 'Reference document',
    intent: 'output_generation',
    outputKind: overrides.outputKind ?? 'story_bible_from_world',
    status: overrides.status ?? 'completed',
    selectedEntityKeys: overrides.selectedEntityKeys ?? [],
    selectedSequenceUnitKeys: overrides.selectedSequenceUnitKeys ?? [],
    pageCount: null,
    targetFormat: 'pdf',
    plannerNotes: '',
    errorMessage: null,
    metadata: {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

function run(overrides: Partial<OutputWorkflowRun>): OutputWorkflowRun {
  return {
    id: overrides.id ?? 'run-1',
    projectId: 'project',
    draftId: 'draft',
    workflowId: overrides.workflowId ?? 'workflow-1',
    requestedBy: null,
    status: overrides.status ?? 'completed',
    preset: 'story_bible_from_world',
    prompt: '',
    targetFormat: 'pdf',
    worldSnapshotFingerprint: '',
    input: {},
    outputs: overrides.outputs ?? {},
    errorMessage: null,
    workerId: null,
    heartbeatAt: null,
    attemptCount: 0,
    metadata: {},
    steps: overrides.steps ?? [],
    artifacts: [],
    startedAt: null,
    completedAt: null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

function artifact(overrides: Partial<OutputArtifact>): OutputArtifact {
  return {
    id: overrides.id ?? 'artifact-1',
    projectId: 'project',
    draftId: 'draft',
    workflowId: overrides.workflowId ?? 'workflow-1',
    runId: overrides.runId ?? 'run-1',
    nodeId: null,
    key: overrides.key ?? 'artifact-1',
    name: overrides.name ?? 'Artifact',
    kind: overrides.kind ?? 'pdf',
    assetKey: overrides.assetKey ?? null,
    mimeType: overrides.mimeType ?? 'application/pdf',
    summary: '',
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  }
}

function step(overrides: Partial<OutputWorkflowRunStep>): OutputWorkflowRunStep {
  return {
    id: overrides.id ?? 'step-1',
    runId: overrides.runId ?? 'run-1',
    workflowId: overrides.workflowId ?? 'workflow-1',
    nodeId: null,
    nodeKey: overrides.nodeKey ?? 'node',
    nodeType: overrides.nodeType ?? 'text_llm',
    status: overrides.status ?? 'queued',
    orderIndex: overrides.orderIndex ?? 0,
    label: overrides.label ?? 'Step',
    inputHash: '',
    outputHash: '',
    outputs: overrides.outputs ?? {},
    provider: null,
    model: null,
    providerRequestId: null,
    errorMessage: null,
    metadata: {},
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

test('buildOutputLibraryModel chooses document artifacts before images', () => {
  const model = buildOutputLibraryModel({
    assets: [],
    outputRequests: [request({})],
    outputWorkflowRuns: [run({})],
    outputWorkflowNodes: [],
    worldEntities: [],
    outputArtifacts: [
      artifact({ id: 'image', key: 'image', kind: 'image', mimeType: 'image/webp', name: 'Cover' }),
      artifact({ id: 'pdf', key: 'pdf', kind: 'pdf', mimeType: 'application/pdf', name: 'Final PDF' }),
    ],
  })

  assert.equal(model.rows[0]?.primaryArtifact?.name, 'Final PDF')
  assert.equal(model.groups.find((group) => group.key === 'ready')?.rows.length, 1)
})

test('buildOutputLibraryModel groups running and failed requests separately', () => {
  const model = buildOutputLibraryModel({
    assets: [],
    outputRequests: [
      request({ id: 'running-request', latestRunId: 'running-run', status: 'running', createdAt: '2026-01-02T00:00:00.000Z' }),
      request({ id: 'failed-request', latestRunId: 'failed-run', status: 'failed' }),
    ],
    outputWorkflowRuns: [
      run({
        id: 'running-run',
        status: 'running',
        steps: [
          step({ id: 's1', runId: 'running-run', nodeKey: 'context', orderIndex: 0, label: 'World context', status: 'completed' }),
          step({ id: 's2', runId: 'running-run', nodeKey: 'render', orderIndex: 1, label: 'Render document', status: 'running' }),
        ],
      }),
      run({ id: 'failed-run', status: 'failed' }),
    ],
    outputWorkflowNodes: [],
    worldEntities: [],
    outputArtifacts: [],
  })

  assert.equal(model.groups.find((group) => group.key === 'generating')?.rows[0]?.id, 'running-request')
  assert.equal(model.groups.find((group) => group.key === 'needs_attention')?.rows[0]?.id, 'failed-request')
  assert.equal(model.rows.find((row) => row.id === 'running-request')?.progress.label, '1/2 steps')
  assert.equal(model.rows.find((row) => row.id === 'running-request')?.currentStepLabel, 'Render document')
})

test('buildOutputLibraryModel resolves gallery URLs from assets and artifact metadata', () => {
  const assets: AssetDefinition[] = [{
    id: 'asset-image',
    key: 'asset-image',
    name: 'Image asset',
    kind: 'image',
    storagePath: '',
    mimeType: 'image/webp',
    metadata: { sourceUrl: 'https://cdn.example.com/image.webp' },
    llmHints: {},
  }]
  const model = buildOutputLibraryModel({
    assets,
    outputRequests: [request({})],
    outputWorkflowRuns: [run({})],
    outputWorkflowNodes: [],
    worldEntities: [],
    outputArtifacts: [
      artifact({ id: 'image', key: 'image', kind: 'image', mimeType: 'image/webp', assetKey: 'asset-image' }),
      artifact({ id: 'html', key: 'html', kind: 'html', mimeType: 'text/html', metadata: { previewUrl: 'https://cdn.example.com/page.html' } }),
    ],
  })

  assert.equal(model.artifacts.find((entry) => entry.key === 'image')?.thumbnailUrl, 'https://cdn.example.com/image.webp')
  assert.equal(model.artifacts.find((entry) => entry.key === 'html')?.url, 'https://cdn.example.com/page.html')
})

test('buildOutputLibraryModel exposes wiki row entity refs and cinematic actions', () => {
  const assets: AssetDefinition[] = [{
    id: 'asset-ilya',
    key: 'asset-ilya',
    name: 'Ilya icon',
    kind: 'image',
    storagePath: '',
    mimeType: 'image/webp',
    metadata: { sourceUrl: 'https://cdn.example.com/ilya.webp' },
    llmHints: {},
  }]
  const model = buildOutputLibraryModel({
    assets,
    outputRequests: [request({
      outputKind: 'cinematic_episode',
      selectedEntityKeys: ['ilya_sorin'],
    })],
    outputWorkflowRuns: [run({
      steps: [
        step({
          nodeKey: 'cinematic_v2_scene_compile',
          status: 'completed',
          outputs: {
            sceneState: {
              characterRefIds: ['nara_quill'],
              locationRefId: 'underrail_warrens',
            },
          },
        }),
      ],
    })],
    outputWorkflowNodes: [],
    worldEntities: [
      {
        key: 'ilya_sorin',
        name: 'Ilya Sorin',
        nodeType: 'actor',
        thumbnailAssetKey: 'asset-ilya',
      },
      {
        key: 'nara_quill',
        name: 'Nara Quill',
        nodeType: 'actor',
        thumbnailAssetKey: null,
      },
      {
        key: 'underrail_warrens',
        name: 'Underrail Warrens',
        nodeType: 'place',
        thumbnailAssetKey: null,
      },
    ] as never,
    outputArtifacts: [],
  })

  assert.deepEqual(model.rows[0]?.entityRefs.map((ref) => ref.label), ['Ilya Sorin', 'Nara Quill', 'Underrail Warrens'])
  assert.equal(model.rows[0]?.entityRefs[0]?.imageUrl, 'https://cdn.example.com/ilya.webp')
  assert.equal(model.rows[0]?.canOpenGraph, true)
  assert.equal(model.rows[0]?.canOpenTimeline, true)
})
