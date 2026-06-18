import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { AssetDefinition } from '../../../domain/graphcore.ts'
import type { OutputArtifact, OutputRequest, OutputWorkflowRun, OutputWorkflowRunStep } from '../../../domain/outputWorkflow.ts'
import { buildOutputLibraryModel } from './outputLibraryPresentation.ts'

const now = '2026-01-01T00:00:00.000Z'
const repoRoot = resolve(import.meta.dirname, '../../../..')

function request(overrides: Partial<OutputRequest>): OutputRequest {
  return {
    id: overrides.id ?? 'request-1',
    projectId: 'project',
    draftId: 'draft',
    parentRequestId: overrides.parentRequestId ?? null,
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
    metadata: overrides.metadata ?? {},
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

test('buildOutputLibraryModel treats completed runs as ready when request status lags', () => {
  const model = buildOutputLibraryModel({
    assets: [],
    outputRequests: [
      request({
        id: 'poster-request',
        latestRunId: 'poster-run',
        outputKind: 'poster_image',
        status: 'running',
      }),
    ],
    outputWorkflowRuns: [
      run({
        id: 'poster-run',
        status: 'completed',
        steps: [
          step({ id: 's1', runId: 'poster-run', nodeKey: 'world_context', orderIndex: 0, label: 'World context', status: 'completed' }),
          step({ id: 's2', runId: 'poster-run', nodeKey: 'generated_image', orderIndex: 1, label: 'Generated image', status: 'completed' }),
        ],
      }),
    ],
    outputWorkflowNodes: [],
    worldEntities: [],
    outputArtifacts: [
      artifact({
        id: 'poster-artifact',
        key: 'poster-artifact',
        kind: 'image',
        mimeType: 'image/webp',
        runId: 'poster-run',
      }),
    ],
  })

  const row = model.rows.find((entry) => entry.id === 'poster-request')
  assert.equal(row?.groupKey, 'ready')
  assert.equal(row?.canCancel, false)
  assert.equal(row?.progress.label, '2/2 steps')
  assert.equal(model.groups.find((group) => group.key === 'ready')?.rows[0]?.id, 'poster-request')
  assert.equal(model.groups.find((group) => group.key === 'generating')?.rows.length, 0)
})

test('buildOutputLibraryModel treats cinematic authoring timelines as ready despite noncritical branch errors', () => {
  const model = buildOutputLibraryModel({
    assets: [],
    outputRequests: [
      request({
        id: 'cinematic-request',
        latestRunId: 'cinematic-run',
        outputKind: 'cinematic_episode',
        status: 'completed_with_errors',
      }),
    ],
    outputWorkflowRuns: [
      run({
        id: 'cinematic-run',
        status: 'completed_with_errors',
        steps: [
          step({ id: 's1', runId: 'cinematic-run', nodeKey: 'screenplay', orderIndex: 0, label: 'Screenplay', status: 'completed' }),
          step({ id: 's2', runId: 'cinematic-run', nodeKey: 'storyboard_sheet', orderIndex: 1, label: 'Storyboard Sheet', status: 'completed' }),
          step({ id: 's3', runId: 'cinematic-run', nodeKey: 'optional_video_prompt', orderIndex: 2, label: 'Video Prompt', status: 'failed' }),
        ],
      }),
    ],
    outputWorkflowNodes: [],
    worldEntities: [],
    outputArtifacts: [
      artifact({
        id: 'authoring-artifact',
        key: 'authoring-artifact',
        kind: 'other',
        mimeType: 'application/json',
        runId: 'cinematic-run',
        metadata: { role: 'cinematic_v3_authoring_timeline' },
      }),
    ],
  })

  const row = model.rows.find((entry) => entry.id === 'cinematic-request')
  assert.equal(row?.groupKey, 'ready')
  assert.equal(row?.canOpenTimeline, true)
  assert.equal(model.groups.find((group) => group.key === 'ready')?.rows[0]?.id, 'cinematic-request')
})

test('buildOutputLibraryModel uses compact status projection for live progress rows', () => {
  const outputStatusProjection = {
    requestId: 'cinematic-request',
    projectId: 'project',
    draftId: 'draft',
    workflowId: 'workflow-1',
    latestRunId: 'run-projected',
    status: 'running',
    outputKind: 'cinematic_episode',
    title: 'Cinematic',
    progress: {
      totalSteps: 20,
      steps: {
        completed: 18,
        running: 2,
        queued: 0,
        failed: 0,
        cancelled: 0,
        completedWithErrors: 0,
      },
      activeNodes: [
        { nodeKey: 'storyboard_001_sheet', label: 'Storyboard 1 Sheet', status: 'running', orderIndex: 8, provider: 'fal', providerStatus: 'IN_PROGRESS', providerElapsedMs: 185000, falRequestId: '019e2c48-da61-7421-b710-c9595a0f38a5' },
        { nodeKey: 'storyboard_002_sheet', label: 'Storyboard 2 Sheet', status: 'running', orderIndex: 9, provider: 'fal', providerStatus: 'IN_QUEUE', providerElapsedMs: 61000, falRequestId: '019e2c48-da97-7a92-92ab-5dc32599a2be' },
      ],
    },
    activeNodeKey: 'cinematic_v3_shot_parse',
    activeNodeLabel: 'Parse Shots',
    latestError: null,
    artifactKeys: [],
    previewAssetKeys: [],
    graphRevision: 'rev-1',
    timelineRevision: 'timeline-1',
    terminal: false,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  } as const

  const model = buildOutputLibraryModel({
    assets: [],
    outputRequests: [
      request({
        id: 'cinematic-request',
        latestRunId: null,
        status: 'running',
        outputKind: 'cinematic_episode',
        metadata: { outputStatusProjection },
      }),
    ],
    outputWorkflowRuns: [],
    outputWorkflowNodes: [],
    worldEntities: [],
    outputArtifacts: [],
  })

  const row = model.rows.find((entry) => entry.id === 'cinematic-request')
  assert.equal(row?.groupKey, 'generating')
  assert.equal(row?.latestRunId, 'run-projected')
  assert.equal(row?.progress.label, '18/20 steps')
  assert.equal(row?.progress.percent, 90)
  assert.equal(row?.currentStepLabel, 'Parse Shots')
  assert.deepEqual(row?.activeStepLabels, [
    'Storyboard 1 Sheet - fal IN PROGRESS - 3m 05s elapsed - 019e2c48',
    'Storyboard 2 Sheet - fal IN QUEUE - 1m 01s elapsed - 019e2c48',
  ])
  const source = readFileSync(resolve(repoRoot, 'src/features/world-builder/wiki/outputLibraryPresentation.ts'), 'utf8')
  assert.match(source, /buildWorkflowProgressViewModel/)
  assert.match(source, /workflowProgressNodeDetailLabel/)
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

test('buildOutputLibraryModel prefers cropped variant icons for selected reference variants', () => {
  const model = buildOutputLibraryModel({
    assets: [],
    imageUrlByEntityKey: new Map([['suri', 'blob:default-suri']]),
    referenceVariantIconUrlByVariantKey: new Map([['suri:samurai_outfit', 'blob:suri-samurai']]),
    outputRequests: [request({
      outputKind: 'poster_image',
      selectedEntityKeys: ['suri'],
    })],
    outputWorkflowRuns: [run({
      steps: [
        step({
          nodeKey: 'image_references',
          status: 'completed',
          outputs: {
            assetPack: {
              entities: [{
                key: 'suri',
                label: 'Suri',
                selectedReferenceVariantKey: 'samurai_outfit',
                selectedReferenceVariantLabel: 'Samurai outfit',
              }],
            },
          },
        }),
      ],
    })],
    outputWorkflowNodes: [],
    worldEntities: [{
      key: 'suri',
      name: 'Suri',
      nodeType: 'actor',
      thumbnailAssetKey: null,
    }] as never,
    outputArtifacts: [],
  })

  assert.equal(model.rows[0]?.entityRefs[0]?.label, 'Suri')
  assert.equal(model.rows[0]?.entityRefs[0]?.variantKey, 'samurai_outfit')
  assert.equal(model.rows[0]?.entityRefs[0]?.variantLabel, 'Samurai outfit')
  assert.equal(model.rows[0]?.entityRefs[0]?.imageUrl, 'blob:suri-samurai')
})

test('buildOutputLibraryModel shows persisted reference variants before artifacts complete', () => {
  const assets: AssetDefinition[] = [{
    id: 'asset-suri-samurai',
    key: 'asset-suri-samurai',
    name: 'Suri samurai outfit',
    kind: 'image',
    storagePath: '',
    mimeType: 'image/webp',
    metadata: { sourceUrl: 'https://cdn.example.com/suri-samurai.webp' },
    llmHints: {},
  }]
  const model = buildOutputLibraryModel({
    assets,
    imageUrlByEntityKey: new Map([['suri', 'blob:default-suri']]),
    referenceVariantIconUrlByVariantKey: new Map(),
    outputRequests: [request({
      outputKind: 'cinematic_episode',
      status: 'running',
      selectedEntityKeys: ['suri'],
      metadata: {
        outputReferenceSelection: {
          selectedReferenceVariants: [{
            entityKey: 'suri',
            variantKey: 'samurai_outfit',
            label: 'Samurai outfit',
            summary: 'Suri wearing ceremonial samurai armor and helmet.',
            assetKey: 'asset-suri-samurai',
          }],
          entities: [{
            key: 'suri',
            name: 'Suri',
            selectedReferenceVariantKey: 'samurai_outfit',
            selectedReferenceVariantLabel: 'Samurai outfit',
            selectedReferenceVariantSummary: 'Suri wearing ceremonial samurai armor and helmet.',
            selectedReferenceVariantAssetKey: 'asset-suri-samurai',
            primaryAssetKey: 'asset-suri-samurai',
          }],
        },
      },
    })],
    outputWorkflowRuns: [run({ status: 'running', steps: [] })],
    outputWorkflowNodes: [],
    worldEntities: [{
      key: 'suri',
      name: 'Suri',
      nodeType: 'actor',
      thumbnailAssetKey: null,
    }] as never,
    outputArtifacts: [],
  })

  const ref = model.rows[0]?.entityRefs[0]
  assert.equal(ref?.variantKey, 'samurai_outfit')
  assert.equal(ref?.variantLabel, 'Samurai outfit')
  assert.equal(ref?.imageUrl, 'https://cdn.example.com/suri-samurai.webp')
})

test('buildOutputLibraryModel falls back to selected variant asset before default entity icon', () => {
  const assets: AssetDefinition[] = [{
    id: 'asset-suri-variant',
    key: 'asset-suri-variant',
    name: 'Suri military gear',
    kind: 'image',
    storagePath: '',
    mimeType: 'image/webp',
    metadata: { sourceUrl: 'https://cdn.example.com/suri-military.webp' },
    llmHints: {},
  }]
  const model = buildOutputLibraryModel({
    assets,
    imageUrlByEntityKey: new Map([['suri', 'blob:default-suri']]),
    referenceVariantIconUrlByVariantKey: new Map(),
    outputRequests: [request({ outputKind: 'poster_image', selectedEntityKeys: ['suri'] })],
    outputWorkflowRuns: [run({
      steps: [
        step({
          nodeKey: 'image_generation',
          status: 'completed',
          outputs: {
            selectedReferenceVariants: [{
              entityKey: 'suri',
              variantKey: 'military_gear',
              label: 'Military gear',
              assetKey: 'asset-suri-variant',
            }],
          },
        }),
      ],
    })],
    outputWorkflowNodes: [],
    worldEntities: [{
      key: 'suri',
      name: 'Suri',
      nodeType: 'actor',
      summary: 'A brave rainforest scout with a careful eye for danger.',
      thumbnailAssetKey: null,
    }] as never,
    outputArtifacts: [],
  })

  const ref = model.rows[0]?.entityRefs[0]
  assert.equal(ref?.variantKey, 'military_gear')
  assert.equal(ref?.variantLabel, 'Military gear')
  assert.equal(ref?.summary, 'A brave rainforest scout with a careful eye for danger.')
  assert.equal(ref?.imageUrl, 'https://cdn.example.com/suri-military.webp')
})

test('buildOutputLibraryModel reads selected variants from completed artifact metadata when steps are compact', () => {
  const assets: AssetDefinition[] = [{
    id: 'asset-suri-samurai',
    key: 'asset-suri-samurai',
    name: 'Suri samurai outfit',
    kind: 'image',
    storagePath: '',
    mimeType: 'image/webp',
    metadata: { sourceUrl: 'https://cdn.example.com/suri-samurai.webp' },
    llmHints: {},
  }]
  const model = buildOutputLibraryModel({
    assets,
    imageUrlByEntityKey: new Map([['suri', 'blob:default-suri']]),
    referenceVariantIconUrlByVariantKey: new Map(),
    outputRequests: [request({ outputKind: 'poster_image', selectedEntityKeys: ['suri'] })],
    outputWorkflowRuns: [run({
      steps: [
        step({
          nodeKey: 'generated_image',
          status: 'completed',
          outputs: {},
        }),
      ],
    })],
    outputWorkflowNodes: [],
    worldEntities: [{
      key: 'suri',
      name: 'Suri',
      nodeType: 'actor',
      summary: 'A brave rainforest scout.',
      thumbnailAssetKey: null,
    }] as never,
    outputArtifacts: [
      artifact({
        id: 'poster',
        key: 'poster',
        kind: 'image',
        mimeType: 'image/webp',
        metadata: {
          selectedReferenceVariants: [{
            entityKey: 'suri',
            variantKey: 'samurai_outfit',
            label: 'Samurai outfit',
            assetKey: 'asset-suri-samurai',
          }],
        },
      }),
    ],
  })

  const ref = model.rows[0]?.entityRefs[0]
  assert.equal(ref?.variantKey, 'samurai_outfit')
  assert.equal(ref?.variantLabel, 'Samurai outfit')
  assert.equal(ref?.imageUrl, 'https://cdn.example.com/suri-samurai.webp')
})
