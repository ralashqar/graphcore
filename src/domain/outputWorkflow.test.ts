import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildOutputGuidanceBundleForNode,
  buildOutputWorkflowExecutionPlan,
  buildOutputWorkflowFingerprint,
  bindOutputPromptWorldScope,
  classifyOutputPrompt,
  defaultOutputWorkflowConcurrency,
  getOutputWorkflowNodeExecutionMetadata,
  markDirtyOutputWorkflowNodes,
  outputWorkflowArtifactKindSchema,
  outputWorkflowGraphRequestSchema,
  outputWorkflowGraphResponseSchema,
  outputRequestDeleteResponseSchema,
  outputRequestStartRequestSchema,
  outputWorkflowNodeRegistry,
  outputWorkflowPlanRequestSchema,
  planOutputPrompt,
  planOutputRequestWorkflow,
  planOutputWorkflow,
  resolveCinematicStorySourceScope,
  runOutputWorkflowReadyQueue,
  selectOutputWorkflowRunSubgraph,
  topologicallySortOutputWorkflow,
  validateOutputWorkflowGraph,
  hashOutputWorkflowValue,
} from './outputWorkflow.ts'
import {
  OUTPUT_SKILL_REGISTRY,
  buildOutputGuidanceBundle,
  hashOutputGuidanceBundle,
  outputSkillSchema,
  resolveOutputSkillsForNode,
  validateOutputSkillRegistry,
} from './outputSkills.ts'
import {
  buildOutputWorkflowGraphViewModel,
  buildOutputWorkflowLevelLayout,
  buildOutputWorkflowTargetedRunMetadata,
} from './outputWorkflowGraphView.ts'
import { aiGenerationSettings } from '../config/aiGenerationSettings.ts'

const now = '2026-05-03T00:00:00.000Z'
const repoRoot = resolve(import.meta.dirname, '../..')

function worldEntity(key: string, nodeType: string, name: string, customProperties: Record<string, unknown> = {}) {
  return {
    id: `id-${key}`,
    key,
    name,
    summary: `${name} summary`,
    context: `${name} context`,
    nodeType,
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: null,
    source: 'ai',
    customProperties,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }
}

function readConfigPurpose(node: { config?: unknown }) {
  const config = node.config && typeof node.config === 'object' && !Array.isArray(node.config)
    ? node.config as Record<string, unknown>
    : {}
  return typeof config.purpose === 'string' ? config.purpose : ''
}

function readConfigQuality(node: { config?: unknown }) {
  const config = node.config && typeof node.config === 'object' && !Array.isArray(node.config)
    ? node.config as Record<string, unknown>
    : {}
  return typeof config.quality === 'string' ? config.quality : ''
}

function readConfigOutputFormat(node: { config?: unknown }) {
  const config = node.config && typeof node.config === 'object' && !Array.isArray(node.config)
    ? node.config as Record<string, unknown>
    : {}
  return typeof config.outputFormat === 'string' ? config.outputFormat : ''
}

test('output request delete response preserves compatibility while exposing cleanup counts', () => {
  const parsed = outputRequestDeleteResponseSchema.parse({
    ok: true,
    requestId: 'request-1',
    projectId: 'project-1',
    draftId: 'draft-1',
  })

  assert.equal(parsed.deleted, true)
  assert.equal(parsed.workflowId, null)
  assert.equal(parsed.latestRunId, null)
  assert.equal(parsed.deletedCounts.outputRequests, 0)
  assert.equal(parsed.deletedCounts.outputArtifacts, 0)
  assert.equal(parsed.deletedCounts.storageObjects, 0)

  const withCounts = outputRequestDeleteResponseSchema.parse({
    ok: true,
    requestId: 'request-1',
    projectId: 'project-1',
    draftId: 'draft-1',
    workflowId: 'workflow-1',
    latestRunId: 'run-1',
    deleted: true,
    deletedCounts: {
      outputRequests: 1,
      outputWorkflows: 1,
      outputWorkflowRuns: 2,
      outputWorkflowRunSteps: 4,
      outputWorkflowNodes: 3,
      outputWorkflowEdges: 2,
      outputArtifacts: 2,
      projectAssets: 2,
      storageObjects: 2,
    },
  })

  assert.equal(withCounts.deletedCounts.outputRequests, 1)
  assert.equal(withCounts.deletedCounts.outputWorkflowRuns, 2)
  assert.equal(withCounts.deletedCounts.projectAssets, 2)
})

test('output workflow graph loader schemas support compact graph refresh and selected-node hydration', () => {
  const request = outputWorkflowGraphRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    workflowId: 'workflow-1',
    runId: null,
    selectedNodeKey: 'screenplay_author',
    includeSelectedNodeOutput: true,
  })
  assert.equal(request.includeSelectedNodeOutput, true)
  assert.equal(request.selectedNodeKey, 'screenplay_author')

  const response = outputWorkflowGraphResponseSchema.parse({
    ok: true,
    workflow: null,
    nodes: [],
    edges: [],
    run: null,
    artifacts: [],
    assets: [],
    graphRevision: hashOutputWorkflowValue({ workflow: 'workflow-1', updatedAt: now }),
    selectedNodeOutput: {
      nodeKey: 'screenplay_author',
      outputs: { screenplayMarkdown: 'INT. SERVICE TUNNEL - NIGHT' },
      truncated: false,
    },
  })
  assert.equal(response.selectedNodeOutput?.outputs.screenplayMarkdown, 'INT. SERVICE TUNNEL - NIGHT')
})

test('output workflow status endpoint uses run-only loader instead of graph bundle', () => {
  const statusFunctionSource = readFileSync(resolve(repoRoot, 'supabase/functions/get-output-workflow-status/index.ts'), 'utf8')
  assert.match(statusFunctionSource, /loadOutputWorkflowRunStatus/)
  assert.doesNotMatch(statusFunctionSource, /loadOutputWorkflowRunBundle/)

  const sharedSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.match(sharedSource, /export async function loadOutputWorkflowRunStatus/)
  assert.match(sharedSource, /outputWorkflowRunStepStatusSelect/)
  assert.doesNotMatch(
    sharedSource.slice(
      sharedSource.indexOf('export async function loadOutputWorkflowRunStatus'),
      sharedSource.indexOf('async function heartbeat'),
    ),
    /output_workflow_nodes|output_workflow_edges/,
  )
})

test('timeline shot quality keyframe materialization can regenerate missing upstream planning nodes', () => {
  const outputsWorkspaceSource = readFileSync(resolve(repoRoot, 'src/features/outputs/OutputsWorkspace.tsx'), 'utf8')
  const materializeStart = outputsWorkspaceSource.indexOf("runMode: 'cinematic_v2_materialize_shot_quality_keyframe'")
  assert.notEqual(materializeStart, -1)
  const materializeBlock = outputsWorkspaceSource.slice(materializeStart, outputsWorkspaceSource.indexOf('cinematicV2QualityShotIds,', materializeStart))
  assert.match(materializeBlock, /runScope: 'upstream_to_node'/)
  assert.doesNotMatch(materializeBlock, /runScope: 'node_only'/)
  assert.match(materializeBlock, /forceNodeKeys: \[fanoutNodeKey\]/)
  assert.match(materializeBlock, /materializationMode: 'selected_shots'/)

  const keyframeStart = outputsWorkspaceSource.indexOf("runMode: 'cinematic_v2_shot_quality_keyframe'")
  assert.notEqual(keyframeStart, -1)
  const keyframeBlock = outputsWorkspaceSource.slice(keyframeStart, outputsWorkspaceSource.indexOf('cinematicV2QualityShotIds,', keyframeStart))
  assert.match(keyframeBlock, /runScope: 'node_only'/)
  assert.ok(keyframeBlock.includes('targetNodeKeys: [`${shotKeyPrefix}_keyframe_prompt`, ...targetNodeKeys]'))
  assert.match(keyframeBlock, /allowStaleUpstreamOutputs: true/)
  const keyframeRunStart = outputsWorkspaceSource.lastIndexOf('const keyframeRun = await', keyframeStart)
  assert.notEqual(keyframeRunStart, -1)
  const keyframeRunBlock = outputsWorkspaceSource.slice(keyframeRunStart, outputsWorkspaceSource.indexOf('const completedStatus = await pollRun', keyframeStart))
  assert.match(keyframeRunBlock, /sourceRunId: sourceRun\?\.id \?\? null/)
  assert.match(keyframeRunBlock, /materializedRunId: materializeRun\.run\.id/)

  const qualityIdsStart = outputsWorkspaceSource.indexOf('function cinematicV2QualityShotIdsForWorkflow')
  assert.notEqual(qualityIdsStart, -1)
  const qualityIdsBlock = outputsWorkspaceSource.slice(qualityIdsStart, outputsWorkspaceSource.indexOf('function cinematicV2ShotKeyPrefix', qualityIdsStart))
  assert.match(qualityIdsBlock, /return \[nextShotId\]/)
  assert.doesNotMatch(qualityIdsBlock, /snapshot\.outputWorkflowNodes|cinematicV2QualityShotIds\)/)
})

const snapshot = outputWorkflowPlanRequestSchema.shape.snapshot.parse({
  project: { id: 'project-1', name: 'Ash Archive', summary: 'A manuscript world.' },
  draft: { id: 'draft-1', name: 'Draft', metadata: {} },
  projectContext: {
    projectType: 'story',
    projectSubtype: 'fiction_novel',
    brainProfile: 'story',
    artStylePreset: 'live_action_cinematic',
    artStyleDescription: '',
    onboardingCompletedAt: now,
    onboardingVersion: 'test',
    source: 'onboarding',
  },
  worldEntities: [
    worldEntity('chapter-1', 'sequence_unit', 'Opening Ash', {
      sequence: {
        ordinal: 1,
        povCharacterKey: 'hero',
        povCharacterName: 'Mara',
        povNotes: 'Close third limited to Mara under pressure.',
        synopsis: 'The archive wakes.',
        outcome: 'The protagonist accepts the call.',
        consequences: [
          {
            affectedEntityKeys: ['hero', 'archive'],
            cause: 'Mara enters the archive.',
            effect: 'The route opens.',
          },
        ],
      },
    }),
    worldEntity('chapter-2', 'sequence_unit', 'Broken Index', {
      sequence: { ordinal: 2, synopsis: 'The first truth breaks.', outcome: 'The route narrows.' },
    }),
    worldEntity('hero', 'actor', 'Mara'),
    worldEntity('archive', 'place', 'The Archive'),
  ],
  worldRelationships: [],
  worldThreads: [],
  worldWiki: {
    title: 'Ash Archive',
    logline: 'A lost archivist follows a living index through a city that edits memory.',
    synopsis: 'A fiction manuscript with a clean chapter spine.',
    narrationPov: 'close third person limited',
    toneTags: ['literary', 'mysterious'],
    genre: 'fantasy mystery',
  },
})

test('node registry exposes approved workflow node types only', () => {
  assert.deepEqual(Object.keys(outputWorkflowNodeRegistry), [
    'world_context_query',
    'skill_context_query',
    'text_llm',
    'image_generation',
    'video_generation',
    'document_render',
    'utility_transform',
    'output_artifact',
  ])
})

test('output artifacts support HTML companion pages', () => {
  assert.equal(outputWorkflowArtifactKindSchema.parse('html'), 'html')
})

test('cinematic storyboard style override accepts blank as default', () => {
  const parsedStart = outputRequestStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic in the cafe',
    cinematicStoryboardStyleOverride: '   ',
    snapshot,
  })
  assert.equal(parsedStart.cinematicStoryboardStyleOverride, undefined)

  const parsedPlan = outputWorkflowPlanRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic in the cafe',
    cinematicStoryboardStyleOverride: '',
    snapshot,
  })
  assert.equal(parsedPlan.cinematicStoryboardStyleOverride, undefined)
})

test('output skill registry is valid, versioned, and rejects duplicate keys', () => {
  assert.equal(validateOutputSkillRegistry().ok, true)
  assert.ok(OUTPUT_SKILL_REGISTRY.length >= 16)
  assert.match(outputSkillSchema.parse(OUTPUT_SKILL_REGISTRY[0]).version, /^\d+\.\d+\.\d+$/)
  assert.equal(validateOutputSkillRegistry([OUTPUT_SKILL_REGISTRY[0], OUTPUT_SKILL_REGISTRY[0]]).ok, false)
})

test('output skill resolution supports explicit keys, auto tags, world metadata, and stable hashes', () => {
  const resolved = resolveOutputSkillsForNode({
    nodeType: 'text_llm',
    purpose: 'chapter_prose',
    explicitSkillKeys: ['fiction_prose_voice'],
    autoSkillTags: ['anti_ai_tells'],
    worldWiki: snapshot.worldWiki,
  })
  const bundle = buildOutputGuidanceBundle({
    skills: resolved.skills,
    contextualGuidance: resolved.contextualGuidance,
  })
  const repeatHash = hashOutputGuidanceBundle({ ...bundle, guidanceHash: 'changed' })

  assert.deepEqual(resolved.diagnostics, [])
  assert.ok(bundle.skillKeys.includes('fiction_prose_voice'))
  assert.ok(bundle.skillKeys.includes('anti_ai_telltales'))
  assert.ok(bundle.guidance.some((entry) => entry.includes('Tone tags')))
  assert.ok(bundle.guidance.some((entry) => entry.includes('Project narration POV')))
  assert.equal(bundle.guidanceHash, repeatHash)
})

test('prompt-first output router classifies output prompts and binds mentioned entities', () => {
  const classification = classifyOutputPrompt('Make a poster image of Mara in The Archive')
  assert.equal(classification.intent, 'output_generation')
  assert.equal(classification.outputKind, 'poster_image')

  const drawClassification = classifyOutputPrompt('Draw an image of Mara in The Archive')
  assert.equal(drawClassification.intent, 'output_generation')
  assert.equal(drawClassification.outputKind, 'concept_art_image')

  const scope = bindOutputPromptWorldScope({
    prompt: 'Make a poster image of Mara in The Archive',
    worldEntities: snapshot.worldEntities,
  })
  assert.deepEqual(scope.selectedEntityKeys.sort(), ['archive', 'hero'])
})

test('prompt-first output router classifies cinematic and UGC video prompts', () => {
  const trailer = classifyOutputPrompt('Create a cinematic trailer storyboard for Chapter 1')
  assert.equal(trailer.intent, 'output_generation')
  assert.equal(trailer.outputKind, 'cinematic_trailer')

  const ugc = classifyOutputPrompt('Make a UGC video ad creative with a hook and CTA')
  assert.equal(ugc.intent, 'output_generation')
  assert.equal(ugc.outputKind, 'ugc_episode')

  const plan = planOutputPrompt({
    prompt: 'Make a cinematic sequence from Chapter 1',
    snapshot,
  })
  assert.equal(plan.outputKind, 'cinematic_episode')
  assert.equal(plan.targetFormat, 'video')
  assert.equal(plan.documentMode, 'cinematic')
})

test('cinematic prompt binding does not infer sequence units from shared names', () => {
  const localSnapshot = outputWorkflowPlanRequestSchema.shape.snapshot.parse({
    ...snapshot,
    worldEntities: [
      worldEntity('skybridge-garden', 'place', 'Skybridge Garden'),
      worldEntity('chapter-skybridge-garden', 'sequence_unit', 'Skybridge Garden', {
        sequence: { ordinal: 1, synopsis: 'A confrontation in the garden.', outcome: 'The chase begins.' },
      }),
      worldEntity('eva-9', 'actor', 'Eva-9'),
    ],
  })

  const promptPlan = planOutputPrompt({
    prompt: 'Create a cinematic where Eva-9 sings in Skybridge Garden',
    snapshot: localSnapshot,
  })
  assert.equal(promptPlan.outputKind, 'cinematic_episode')
  assert.deepEqual(promptPlan.selectedSequenceUnitKeys, [])
  assert.deepEqual(promptPlan.selectedEntityKeys.sort(), ['eva-9', 'skybridge-garden'])

  const workflowPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic where Eva-9 sings in Skybridge Garden',
    targetFormat: 'video',
    selectedEntityKeys: promptPlan.selectedEntityKeys,
    selectedSequenceUnitKeys: promptPlan.selectedSequenceUnitKeys,
    cinematicPipelineVersion: 'v1_take_blocks',
    snapshot: localSnapshot,
  }, 'cinematic_episode')

  assert.deepEqual(workflowPlan.sourceSequenceUnitKeys, [])
  assert.deepEqual(workflowPlan.sourceEntityKeys.sort(), ['eva-9', 'skybridge-garden'])
  const contextNode = workflowPlan.nodes.find((node) => node.key === 'world_context')
  assert.deepEqual((contextNode?.config as Record<string, unknown>).sourceSequenceUnitKeys, [])
  assert.ok(workflowPlan.diagnostics.some((line) => line.includes('No sequence_unit story spine was selected')))

  const explicitEntityPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic where Eva-9 sings in Skybridge Garden',
    targetFormat: 'video',
    selectedEntityKeys: ['eva-9', 'chapter-skybridge-garden', 'skybridge-garden'],
    cinematicPipelineVersion: 'v1_take_blocks',
    snapshot: localSnapshot,
  }, 'cinematic_episode')
  assert.deepEqual(explicitEntityPlan.sourceEntityKeys.sort(), ['eva-9', 'skybridge-garden'])

  const explicitSequencePlan = planOutputPrompt({
    prompt: 'Create a cinematic where Eva-9 sings in Skybridge Garden',
    snapshot: localSnapshot,
    selectedSequenceUnitKeys: ['chapter-skybridge-garden'],
  })
  assert.deepEqual(explicitSequencePlan.selectedSequenceUnitKeys, ['chapter-skybridge-garden'])
})

test('cinematic story-source resolver defers prompt-mode source binding to backend LLM', () => {
  const firstChapterPlan = planOutputPrompt({
    prompt: 'Create a cinematic for first chapter',
    snapshot,
  })
  assert.equal(firstChapterPlan.outputKind, 'cinematic_episode')
  assert.deepEqual(firstChapterPlan.selectedSequenceUnitKeys, [])

  const firstPartPlan = planOutputPrompt({
    prompt: 'Create a cinematic for the first part of the first chapter',
    snapshot,
  })
  assert.deepEqual(firstPartPlan.selectedSequenceUnitKeys, [])

  const namedSourcePlan = planOutputPrompt({
    prompt: 'Create a cinematic from Opening Ash',
    snapshot,
  })
  assert.deepEqual(namedSourcePlan.selectedSequenceUnitKeys, [])

  const independentPromptPlan = planOutputPrompt({
    prompt: 'Create a cinematic where Mara performs in The Archive',
    snapshot,
  })
  assert.deepEqual(independentPromptPlan.selectedEntityKeys.sort(), ['archive', 'hero'])
  assert.deepEqual(independentPromptPlan.selectedSequenceUnitKeys, [])

  const explicitResolution = resolveCinematicStorySourceScope({
    prompt: 'Create a cinematic where Mara performs in The Archive',
    worldEntities: snapshot.worldEntities,
    selectedSequenceUnitKeys: ['chapter-2'],
  })
  assert.equal(explicitResolution.sourceMode, 'explicit_sequence')
  assert.deepEqual(explicitResolution.selectedSequenceUnitKeys, ['chapter-2'])
})

test('cinematic asset packs prefer entity reference sheets over stale world icons', async () => {
  const sharedModulePath = ['..', '..', 'supabase', 'functions', '_shared', 'output-workflow.ts'].join('/')
  const { buildDeterministicCinematicAssetPack } = await import(sharedModulePath) as {
    buildDeterministicCinematicAssetPack: (context: Record<string, unknown>) => {
      entities: Array<{ key: string; assetKeys: string[] }>
      missingReferenceEntityKeys: string[]
    }
  }

  const referenceSheetKey = 'entity_reference_sheet_anya_sorin_anya_sorin'
  const worldIconKey = 'world_icon_anya_sorin_anya_sorin'
  const referenceSheetPath = 'generated/entity-reference-sheets/451ff5a5-86cb-4310-92ce-463e82e67763/14a009e6-07f8-4025-a77b-34d6a7afa084/anya_sorin.webp'
  const directReferenceSheetUrl = 'https://cdn.example.com/generated/entity-reference-sheets/anya_sorin.webp'
  const pack = buildDeterministicCinematicAssetPack({
    entities: [
      {
        key: 'anya_sorin',
        name: 'Anya Sorin',
        nodeType: 'actor',
        summary: 'Anya summary',
        thumbnailAssetKey: worldIconKey,
        metadata: {
          referenceSheetAssetKey: referenceSheetKey,
          referenceSheetStoragePath: referenceSheetPath,
          referenceSheetUrl: directReferenceSheetUrl,
          referenceSheetAssetKeys: [worldIconKey],
        },
      },
    ],
    assets: [
      { key: worldIconKey, storagePath: 'generated/world-icons/draft/job/01_anya_sorin.webp', mimeType: 'image/webp' },
      { key: referenceSheetKey, storagePath: referenceSheetPath, mimeType: 'image/webp' },
    ],
  })
  const assetKeys = pack.entities[0]?.assetKeys ?? []
  assert.ok(assetKeys.includes(referenceSheetKey))
  assert.ok(assetKeys.includes(referenceSheetPath))
  assert.ok(assetKeys.includes(directReferenceSheetUrl))
  assert.ok(assetKeys.includes(worldIconKey))
  assert.ok(assetKeys.indexOf(referenceSheetKey) < assetKeys.indexOf(worldIconKey))
  assert.ok(assetKeys.indexOf(referenceSheetPath) < assetKeys.indexOf(worldIconKey))
  assert.ok(assetKeys.indexOf(directReferenceSheetUrl) < assetKeys.indexOf(worldIconKey))

  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.match(workerSource, /refreshWorldContextVisualReferences/)
  assert.match(workerSource, /resolveProjectAssetByKey/)
  assert.match(workerSource, /isProjectAssetStoragePath/)
})

test('prompt-first entity binding is typo-tolerant and does not fall back to unrelated image references', () => {
  const worldEntities = [
    worldEntity('ilya', 'actor', 'Ilya Sorin'),
    worldEntity('anya', 'actor', 'Anya Sorin'),
    worldEntity('nara', 'actor', 'Nara Quill'),
    worldEntity('checkpoint', 'place', 'Compliance Checkpoint'),
  ] as typeof snapshot.worldEntities
  const scope = bindOutputPromptWorldScope({
    prompt: 'Draw Ilay saluting to Anya',
    worldEntities,
  })

  assert.deepEqual(scope.selectedEntityKeys.sort(), ['anya', 'ilya'])

  const localSnapshot = outputWorkflowPlanRequestSchema.shape.snapshot.parse({
    ...snapshot,
    worldEntities,
  })
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Draw Ilay saluting to Anya',
    targetFormat: 'image',
    snapshot: localSnapshot,
  }, 'concept_art_image')

  assert.deepEqual(plan.sourceEntityKeys.sort(), ['anya', 'ilya'])
  assert.ok(!plan.sourceEntityKeys.includes('nara'))
  const contextNode = plan.nodes.find((node) => node.key === 'world_context')
  assert.equal((contextNode?.config as Record<string, unknown> | undefined)?.strictSourceEntityFilter, true)
})

test('story cinematic requests build V2 shot orchestration graph by default while UGC stays V1', () => {
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1 with a shot-by-shot storyboard.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    snapshot,
  }, 'cinematic_episode')

  assert.equal(plan.preset, 'cinematic_episode_from_sequence')
  assert.deepEqual(plan.sourceEntityKeys.sort(), ['archive', 'hero'])
  assert.ok(plan.sourceEntityKeys.length < snapshot.worldEntities.filter((entity) => entity.nodeType !== 'sequence_unit').length + 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_script_parse').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_screenplay_author').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_reference_select').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_scene_compile').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_layout_plan').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_shot_plan').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_storyboard_group_plan').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_dynamic_shot_fanout').length, 1)
  assert.equal(plan.nodes.filter((node) => node.nodeType === 'video_generation').length, 0)
  assert.ok(!plan.nodes.some((node) => readConfigPurpose(node) === 'cinematic_dynamic_take_fanout'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cinematic_v2_screenplay_author' && edge.targetNodeKey === 'cinematic_v2_script_parse'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cinematic_v2_screenplay_author' && edge.targetNodeKey === 'cinematic_v2_shot_plan'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cinematic_v2_reference_select' && edge.targetNodeKey === 'cinematic_v2_shot_plan'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cinematic_v2_shot_plan' && edge.targetNodeKey === 'cinematic_v2_storyboard_group_plan'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cinematic_v2_storyboard_group_plan' && edge.targetNodeKey === 'cinematic_v2_dynamic_shot_fanout'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cinematic_v2_reference_select' && edge.targetNodeKey === 'cinematic_v2_dynamic_shot_fanout'))
  assert.ok(plan.diagnostics.some((line) => line.includes('Cinematics V2')))
  assert.ok(plan.diagnostics.some((line) => line.includes('Creative screenplay authoring')))
  assert.equal(validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges }).ok, true)

  const fanout = plan.nodes.find((node) => node.key === 'cinematic_v2_dynamic_shot_fanout')
  assert.equal(fanout?.config.generateAudio, false)
  assert.equal(fanout?.config.cinematicPipelineVersion, 'v2_shot_orchestration')
  assert.equal(fanout?.config.cinematicV2AnimaticMode, 'fast_panels')
  assert.equal(fanout?.config.debugSkipVideoGeneration, true)
  assert.ok(plan.diagnostics.some((line) => line.includes('Preview animatic mode')))
  assert.ok(plan.diagnostics.some((line) => line.includes('Fast animatic mode')))

  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.match(workerSource, /cinematicVideoApprovedEnabled/)
  assert.match(workerSource, /cinematic_video_approval_required/)
  assert.match(workerSource, /isCinematicV2ProductionNode\(asRecord\(node\.config\), node\) && !cinematicVideoApprovedEnabled\(run\)/)
  assert.match(workerSource, /cinematic_v2_shot_asset_pack/)
  assert.match(workerSource, /cinematic_v2_screenplay_author/)
  assert.match(workerSource, /Return plain Markdown screenplay/)
  assert.match(workerSource, /cinematic_v2_keyframe_qa/)
  assert.match(workerSource, /cinematic_v2_shot_keyframe_passthrough/)
  assert.match(workerSource, /quality_keyframes/)
  assert.match(workerSource, /resolveCinematicV2QualityShotIds/)
  assert.match(workerSource, /cinematicV2QualityShotIds/)
  assert.match(workerSource, /shotUsesQualityKeyframe/)
  assert.match(workerSource, /cinematic_v2_storyboard_group_plan/)
  assert.match(workerSource, /storyboardGroupPlan\.groups\.forEach/)
  assert.match(workerSource, /fixed \$\{layout\.rows\}x\$\{layout\.columns\} rectangular grid/)
  assert.match(workerSource, /Cells \$\{layout\.panelCount \+ 1\}-\$\{gridCellCount\} are intentional empty placeholders/)
  assert.match(workerSource, /buildCinematicV2ShotAssetPack/)
  assert.match(workerSource, /Use it for composition and blocking only, not as identity truth/)
  assert.match(workerSource, /Required visible characters/)
  assert.match(workerSource, /performanceBeats/)
  assert.match(workerSource, /Acting\/performance direction/)
  assert.match(workerSource, /\$\{shotAssetPackKey\}__\$\{keyframeKey\}/)
  assert.match(workerSource, /\$\{shotAssetPackKey\}__\$\{videoKey\}/)

  const ugcPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a vertical UGC cinematic from Chapter 1.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    snapshot,
  }, 'ugc_episode')
  assert.equal(ugcPlan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_dynamic_take_fanout').length, 1)
  assert.equal(ugcPlan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_v2_dynamic_shot_fanout').length, 0)
})

test('cinematic V2 shot asset packs narrow references to visible shot refs', async () => {
  const sharedModulePath = ['..', '..', 'supabase', 'functions', '_shared', 'output-workflow.ts'].join('/')
  const { buildCinematicV2ShotAssetPack } = await import(sharedModulePath) as {
    buildCinematicV2ShotAssetPack: (input: {
      assetPack: Record<string, unknown>
      referencePlan: Record<string, unknown>
      shot: Record<string, unknown>
      maxEntityCount?: number
      maxAssetKeysPerEntity?: number
    }) => { entities: Array<Record<string, unknown>>, shotReferenceKeys: string[] }
  }

  const shotPack = buildCinematicV2ShotAssetPack({
    assetPack: {
      entities: [
        { key: 'ilya', name: 'Ilya Sorin', type: 'actor', assetKeys: ['ilya-sheet', 'ilya-icon'] },
        { key: 'anya', name: 'Anya Sorin', type: 'actor', assetKeys: ['anya-sheet'] },
        { key: 'checkpoint', name: 'Compliance Checkpoint', type: 'place', assetKeys: ['checkpoint-sheet'] },
        { key: 'aster', name: 'Aster Hologram', type: 'concept', assetKeys: ['aster-sheet'] },
      ],
      missingReferenceEntityKeys: [],
    },
    referencePlan: {
      primaryCastRefIds: ['ilya', 'anya'],
      supportingCastRefIds: [],
      locationRefIds: ['checkpoint'],
      propRefIds: [],
      conceptRefIds: [],
      continuityAnchorRefIds: ['aster'],
      rejectedRefs: [],
      rationale: 'Test',
      confidence: 0.9,
    },
    shot: {
      id: 'shot_1',
      sceneId: 'scene_1',
      index: 1,
      title: 'Ilya at the checkpoint',
      purpose: 'reaction',
      editorialDurationSeconds: 2,
      providerDurationSeconds: 4,
      description: 'Ilya freezes at the compliance checkpoint.',
      action: 'Ilya looks across the checkpoint barrier.',
      dialogue: [],
      speakerRefIds: [],
      visibleCharacterRefIds: ['ilya'],
      locationRefId: 'checkpoint',
      propRefIds: [],
      continuityInputs: [],
      camera: { framing: 'medium close', angle: 'eye level', lens: '50mm', movement: 'locked', screenDirectionRule: 'Ilya looks screen-right.' },
      requiresLipSync: false,
      status: 'planned',
    },
    maxEntityCount: 6,
  })

  const keys = shotPack.entities.map((entity) => String(entity.key))
  assert.deepEqual(keys, ['ilya', 'checkpoint'])
  assert.ok(!keys.includes('anya'))
  assert.ok(!keys.includes('aster'))
})

test('cinematic output preset creates script-first dynamic take fanout placeholder', () => {
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1 with a shot-by-shot storyboard.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    videoBlockCount: 3,
    durationPerBlockSeconds: 8,
    cinematicPipelineVersion: 'v1_take_blocks',
    snapshot,
  }, 'cinematic_episode')

  assert.equal(plan.preset, 'cinematic_episode_from_sequence')
  assert.equal(plan.targetFormat, 'video')
  assert.deepEqual(plan.sourceSequenceUnitKeys, ['chapter-1'])
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_script_authoring').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_sequence_compile').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_dynamic_take_fanout').length, 1)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_block_script').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_reference_atlas').length, 0)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'cinematic_storyboard').length, 0)
  assert.equal(plan.nodes.filter((node) => node.nodeType === 'video_generation').length, 0)
  assert.ok(!plan.nodes.some((node) => readConfigPurpose(node) === 'video_stitch'))
  assert.ok(!plan.nodes.some((node) => readConfigPurpose(node) === 'cinematic_video_artifact'))

  const scriptAuthoring = plan.nodes.find((node) => node.key === 'cinematic_script_authoring')
  assert.equal(scriptAuthoring?.config.legacyVideoBlockCount, 3)
  assert.equal(scriptAuthoring?.config.legacyDurationPerBlockSeconds, 8)

  const fanout = plan.nodes.find((node) => node.key === 'cinematic_dynamic_take_fanout')
  assert.equal(fanout?.config.aspectRatio, '16:9')
  assert.equal(fanout?.config.resolution, '720p')
  assert.equal(fanout?.config.generateAudio, true)
  assert.equal(fanout?.config.maxTotalDurationSeconds, 60)
  assert.equal(fanout?.config.videoProvider, 'muapi')
  assert.equal(fanout?.config.videoModel, aiGenerationSettings.outputWorkflow.videoMuapiModel)
  assert.equal(fanout?.config.cinematicReferenceMode, 'shot_reference_sheet')
  assert.equal(fanout?.config.debugCinematicStoryboardStyleSafeMode, aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStyleSafeModeDefault)
  assert.equal(fanout?.config.cinematicStoryboardStyleOverride, aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStyleSafeModeDefault ? aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStylePrompt : '')
  assert.equal(fanout?.config.debugSkipVideoGeneration, true)
  assert.ok(plan.diagnostics.some((line) => line.includes('Cinematic direction-sheet reference mode')))
  assert.ok(plan.diagnostics.some((line) => line.includes('Debug storyboard style safe mode')))
  const skillContext = plan.nodes.find((node) => node.key === 'skill_context')
  assert.ok(Array.isArray(skillContext?.config.skillKeys))
  assert.ok((skillContext?.config.skillKeys as string[]).includes('cinematic_beat_sheet_planning'))
  assert.ok((skillContext?.config.skillKeys as string[]).includes('cinematic_direction_sheet_planning'))
  assert.ok((skillContext?.config.skillKeys as string[]).includes('cinematic_keyframe_prompting'))
  assert.ok((skillContext?.config.skillKeys as string[]).includes('seedance_timeline_call_sheet'))

  assert.ok(!plan.nodes.some((node) => node.key === 'cinematic_atlas_prompt'))
  assert.ok(!plan.nodes.some((node) => node.key === 'cinematic_atlas_image'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cinematic_sequence_compile' && edge.targetNodeKey === 'cinematic_dynamic_take_fanout' && edge.targetPort === 'input'))
  assert.ok(!plan.edges.some((edge) => edge.sourceNodeKey === 'cinematic_atlas_image' || edge.targetNodeKey === 'cinematic_atlas_image'))
  assert.ok(!plan.usageEstimate?.lines.some((line) => line.nodeKey === 'cinematic_atlas_image'))
  assert.ok(!plan.usageEstimate?.lines.some((line) => line.nodeKey === 'block_001_storyboard'))
  assert.ok(!plan.usageEstimate?.lines.some((line) => line.nodeKey === 'block_001_video'))
  assert.equal(validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges }).ok, true)

  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.doesNotMatch(workerSource, /cinematic_atlas_image__\$\{beatSheetKey\}/)
  assert.doesNotMatch(workerSource, /cinematic_atlas_image__\$\{videoKey\}/)
  assert.match(workerSource, /cinematic_entities__\$\{beatSheetKey\}/)
  assert.match(workerSource, /cinematic_entities__\$\{videoKey\}/)
  assert.match(workerSource, /metadata\.referenceSheetAssetKey/)
  assert.match(workerSource, /quality: CINEMATIC_STORYBOARD_IMAGE_QUALITY/)

  const requestPayload = outputRequestStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1.',
    targetFormat: 'video',
    cinematicReferenceMode: 'storyboard_sheet',
    debugSkipVideoGeneration: false,
    snapshot,
  })
  assert.equal(requestPayload.cinematicReferenceMode, 'storyboard_sheet')
  assert.equal(requestPayload.debugCinematicStoryboardStyleSafeMode, undefined)
  assert.equal(requestPayload.debugSkipVideoGeneration, false)

  const combinedReferencePayload = outputRequestStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1.',
    targetFormat: 'video',
    cinematicReferenceMode: 'keyframes_and_storyboard',
    snapshot,
  })
  assert.equal(combinedReferencePayload.cinematicReferenceMode, 'keyframes_and_storyboard')

  const directionSheetPayload = outputRequestStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1.',
    targetFormat: 'video',
    cinematicReferenceMode: 'shot_reference_sheet',
    snapshot,
  })
  assert.equal(directionSheetPayload.cinematicReferenceMode, 'shot_reference_sheet')

  const portraitPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a vertical UGC cinematic from Chapter 1.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    aspectRatio: '9:16',
    snapshot,
  }, 'ugc_episode')
  const portraitFanout = portraitPlan.nodes.find((node) => node.key === 'cinematic_dynamic_take_fanout')
  assert.equal(portraitFanout?.config.aspectRatio, '9:16')

  const costEnabledPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    debugSkipVideoGeneration: false,
    cinematicPipelineVersion: 'v1_take_blocks',
    snapshot,
  }, 'cinematic_episode')
  const costEnabledFanout = costEnabledPlan.nodes.find((node) => node.key === 'cinematic_dynamic_take_fanout')
  assert.equal(costEnabledFanout?.config.debugSkipVideoGeneration, false)

  const safeModeDisabledPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    debugCinematicStoryboardStyleSafeMode: false,
    cinematicStoryboardStyleOverride: 'charcoal animatic boards',
    cinematicPipelineVersion: 'v1_take_blocks',
    snapshot,
  }, 'cinematic_episode')
  const safeModeDisabledFanout = safeModeDisabledPlan.nodes.find((node) => node.key === 'cinematic_dynamic_take_fanout')
  assert.equal(safeModeDisabledFanout?.config.debugCinematicStoryboardStyleSafeMode, false)
  assert.equal(safeModeDisabledFanout?.config.cinematicStoryboardStyleOverride, '')
  assert.ok(safeModeDisabledPlan.diagnostics.some((line) => line.includes('Debug storyboard style safe mode is disabled')))

  const keyframeModePlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    cinematicReferenceMode: 'keyframes',
    cinematicPipelineVersion: 'v1_take_blocks',
    snapshot,
  }, 'cinematic_episode')
  const keyframeModeFanout = keyframeModePlan.nodes.find((node) => node.key === 'cinematic_dynamic_take_fanout')
  assert.equal(keyframeModeFanout?.config.cinematicReferenceMode, 'keyframes')
  assert.ok(keyframeModePlan.diagnostics.some((line) => line.includes('Keyframe reference mode')))
})

test('cinematic authoring uses lean director script and internal execution script', () => {
  const workerSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  assert.match(workerSource, /cinematicScriptAuthoringJsonSchemaForPreset/)
  assert.match(workerSource, /directorScriptDoc/)
  assert.match(workerSource, /executionScriptDoc: cinematicScriptDoc/)
  assert.match(workerSource, /cumulativeStart/)
  assert.match(workerSource, /canonicalCinematicEntityKey/)
  assert.match(workerSource, /sanitizeCinematicScriptText/)
  assert.match(workerSource, /Do not include provider refs or execution details/)
  assert.match(workerSource, /no @Image\/@Video\/@Audio labels/)

  const schemaStart = workerSource.indexOf('function cinematicScriptAuthoringJsonSchemaForPreset')
  const schemaEnd = workerSource.indexOf('function normalizeMaybeNullString')
  const schemaSource = workerSource.slice(schemaStart, schemaEnd)
  assert.match(schemaSource, /continuityLock/)
  assert.match(schemaSource, /visualAction/)
  assert.match(schemaSource, /composition/)
  assert.match(schemaSource, /actions/)
  assert.doesNotMatch(schemaSource, /participantRefIds/)
  assert.doesNotMatch(schemaSource, /visualPrompt/)
  assert.doesNotMatch(schemaSource, /compositionGuide/)
  assert.doesNotMatch(schemaSource, /providerRequestId/)
  assert.match(schemaSource, /ugcDirectives/)
})

test('cinematic beat-sheet prompts use distinct clean micro-beat captions', async () => {
  const sharedModulePath = ['..', '..', 'supabase', 'functions', '_shared', 'output-workflow.ts'].join('/')
  const { buildCinematicBeatSheetPrompt } = await import(sharedModulePath) as {
    buildCinematicBeatSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
    }) => { prompt: string; beatSheetPlan: Record<string, unknown> }
  }
  const beatSheet = buildCinematicBeatSheetPrompt({
    aspectRatio: '16:9',
    prompt: 'create a cinematic of Ilya running from the civic harmony unit in the underrail warrens',
    guidance: null,
    assetPack: {
      entities: [
        {
          key: 'ilya_sorin',
          name: 'Ilya Sorin',
          summary: 'A gifted maintenance worker forced into rebellion.',
          visualDescription: 'lean young man in worn utility jacket with grease-stained hands',
          visualTraits: ['shaved dark hair', 'tired eyes'],
        },
        {
          key: 'underrail_warrens',
          name: 'Underrail Warrens',
          summary: 'An abandoned transit maze below the city.',
          visualDescription: 'flooded subway tunnels, rusted platforms, hanging work lamps',
          visualTraits: [],
        },
        {
          key: 'underrail_warrens',
          name: 'Underrail Warrens',
          summary: 'Duplicate place anchor that should collapse.',
          visualDescription: 'duplicate visual text',
          visualTraits: [],
        },
      ],
    },
    blockScript: {
      title: 'Take 1',
      durationSeconds: 13,
      shots: [
        {
          id: 'shot_01',
          title: 'Boot splash hook',
          startSeconds: 0,
          endSeconds: 4,
          subject: 'Ilya Sorin, Civic Harmony Bureau, Underrail Warrens',
          beat: 'Ilya slams into frame already running through shin-deep water as red pursuit light sweeps the tunnel behind him.',
          visualAction: 'Ilya charges through a narrow concrete service tunnel, boots exploding water across rusted rails while a rotating red warning glow pulses over wet walls behind him.',
          composition: 'Ilya centered and advancing hard toward camera, tunnel lines compressing behind him, distant pursuit silhouettes briefly visible through spray.',
          actions: [
            { actor: 'Ilya Sorin', verb: 'sprints through', target: 'service tunnel', stagingNotes: 'High-kneed sprint through ankle-deep water.', startSeconds: 0, endSeconds: 4 },
          ],
          audioCues: ['boots slamming through water'],
        },
        {
          id: 'shot_02',
          title: 'The turn through steam',
          startSeconds: 4,
          endSeconds: 9,
          beat: 'He cuts through a side corridor as the unit gains visual contact.',
          visualAction: 'Ilya grabs a pipe brace, whips around a blind corner into a steam-blown maintenance passage, and nearly slips before catching himself on the wall.',
          composition: 'Ilya off-center left entering the turn, steam cloud swallowing mid-frame, red visor lights and a search beam flare into the background corner.',
          actions: [
            { actor: 'Ilya Sorin', verb: 'whips around', target: 'blind corner', stagingNotes: 'He catches himself on the wet concrete wall.', startSeconds: 0, endSeconds: 5 },
          ],
          dialogue: [
            { speaker: 'Civic Harmony Bureau', line: 'Stop and submit.', delivery: 'amplified and cold' },
          ],
          audioCues: ['steam hiss blast'],
        },
        {
          id: 'shot_03',
          title: 'Drone sweep overhead',
          startSeconds: 9,
          endSeconds: 13,
          beat: 'A surveillance drone finds him in an open junction and paints him for capture.',
          visualAction: 'Ilya bursts into a larger underrail junction beneath a hanging maintenance gantry as a patrol drone slides overhead.',
          composition: 'Ilya small in the lower frame against massive brutalist geometry, drone crossing top frame, reflective water channels creating sharp light streaks.',
        },
      ],
    },
  })

  const prompt = beatSheet.prompt
  const beatMatches = [...prompt.matchAll(/BEAT \d+ \[(.*?)\]\nPanel visual: (.*?)\nCaption line 1: (.*?)\nCaption line 2: (.*?)(?:\n\n|$)/g)]
  assert.equal(beatMatches.length, 8)
  assert.equal(beatMatches[0]?.[1], '00:00-00:01')
  assert.equal(beatMatches[7]?.[1], '00:11-00:13')
  assert.equal(beatSheet.beatSheetPlan.visualDensity, 'action')
  assert.equal(beatSheet.beatSheetPlan.shotStripMode, 'dense')
  assert.match(prompt, /Shot density: action; shot-strip mode: dense; panel count: 8/)
  const panelVisuals = beatMatches.map((match) => match[2])
  assert.ok(panelVisuals.some((visual) => visual.includes('boots exploding water')))
  assert.ok(panelVisuals.some((visual) => visual.includes('patrol drone slides overhead')))
  assert.ok(panelVisuals.every((visual) => !/Opening state|Action escalation|Obstacle or contact|Consequence and transition|Visible action and blocking|Dialogue cue|Audio cue|Camera feel|Framing:/i.test(visual)))
  assert.ok(panelVisuals.every((visual) => !/\b[A-Za-z]+_[A-Za-z]+\b/.test(visual)))
  const captionPairs = beatMatches.map((match) => `${match[3]} ${match[4]}`)
  assert.ok(new Set(captionPairs).size >= 7)
  assert.ok(captionPairs.every((caption) => !caption.includes('...') && !caption.includes('…')))
  assert.ok(captionPairs.every((caption) => !caption.includes('Ilya Sorin, Civic Harmony Bureau, Underrail Warrens')))
  assert.doesNotMatch(prompt, /Stop and submit|steam hiss blast/)
  assert.doesNotMatch(prompt, /"entities"|\{\s*"name"/)
  assert.doesNotMatch(prompt, /forced into rebellion|abandoned transit maze below the city|Duplicate place anchor/)
  assert.equal((prompt.match(/^Underrail Warrens:/gm) ?? []).length, 1)
  assert.match(prompt, /^Ilya Sorin: Visual: /m)
  assert.match(prompt, /Caption rules: describe only what the viewer sees/)
  assert.match(prompt, /Storyboard rules: every Panel visual must be action-based/)
})

test('cinematic adaptive shot density keeps slow scenes sparse and action scenes dense', async () => {
  const sharedModulePath = ['..', '..', 'supabase', 'functions', '_shared', 'output-workflow.ts'].join('/')
  const { buildCinematicBeatSheetPrompt, buildCinematicDirectionSheetPrompt, buildCinematicVideoPrompt } = await import(sharedModulePath) as {
    buildCinematicBeatSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
    }) => { prompt: string; beatSheetPlan: Record<string, unknown> }
    buildCinematicDirectionSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
    }) => { prompt: string; directionSheetPlan: Record<string, unknown> }
    buildCinematicVideoPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      prompt: string
      guidance: null
      durationSeconds: number
      aspectRatio: string
      resolution: string
      generateAudio: boolean
      referenceImageCount: number
      cinematicReferenceMode?: string
    }) => string
  }
  const slowCafeScript = {
    title: 'Cafe Static',
    durationSeconds: 15,
    location: 'lower_city_cafe',
    shots: [
      {
        id: 'shot_01',
        startSeconds: 0,
        endSeconds: 4,
        visualAction: 'Ilya and EVA-9 sit across from each other with chipped cups between them while neon reflections crawl across wet glass.',
        composition: 'A surveillance dome hangs in soft focus behind the cramped table.',
        framing: 'Medium two-shot at a cramped metal cafe table.',
        cameraMovement: 'Slow lateral creep inward.',
        dialogue: [{ speaker: 'Ilya Sorin', line: 'You pick very public hiding spots.', delivery: 'dry' }],
      },
      {
        id: 'shot_02',
        startSeconds: 4,
        endSeconds: 8,
        visualAction: 'EVA-9 gives the faintest approximation of a smile as Ilya stirs bitter coffee.',
        composition: 'Ilya shoulder soft in foreground, EVA-9 centered with cold blue edge light.',
        framing: 'Over-shoulder favoring EVA-9.',
        cameraMovement: 'Gentle push-in.',
        dialogue: [{ speaker: 'EVA-9', line: 'I can lower the accuracy if you prefer.', delivery: 'deadpan' }],
      },
      {
        id: 'shot_03',
        startSeconds: 8,
        endSeconds: 11,
        visualAction: 'Ilya lets out a reluctant half-laugh and glances toward the rain-smeared street.',
        composition: 'Ilya framed tight with window glow behind him.',
        framing: 'Close-up on Ilya.',
        cameraMovement: 'Static framing.',
        dialogue: [{ speaker: 'Ilya Sorin', line: 'That was almost human.', delivery: 'soft' }],
      },
      {
        id: 'shot_04',
        startSeconds: 11,
        endSeconds: 15,
        visualAction: 'EVA-9 holds his gaze without blinking as the red surveillance glint pulses once behind her.',
        composition: 'Her face centered and still, background falling away into cold blur.',
        framing: 'Tight close-up on EVA-9.',
        cameraMovement: 'Nearly imperceptible push-in.',
        dialogue: [{ speaker: 'EVA-9', line: 'I practiced with your voice while you were asleep.', delivery: 'quiet sincere' }],
      },
    ],
  }
  const actionChaseScript = {
    title: 'Underrail Pursuit',
    durationSeconds: 15,
    location: 'underrail_warrens',
    shots: [
      {
        id: 'shot_01',
        startSeconds: 0,
        endSeconds: 4,
        visualAction: 'Ilya sprints through flooded service tunnels, boots exploding water across rusted rails as pursuit lights sweep behind him.',
        composition: 'Tunnel lines compress behind him while officers appear through spray.',
        cameraMovement: 'Fast backward tracking.',
        actions: [{ actor: 'Ilya Sorin', verb: 'sprints through', target: 'flooded tunnel', stagingNotes: 'Water impact and red warning light fill the frame.' }],
      },
      {
        id: 'shot_02',
        startSeconds: 4,
        endSeconds: 8,
        visualAction: 'He whips around a blind corner, nearly slips, and catches himself on the wall as steam erupts.',
        composition: 'Search beams slice through steam from the rear corridor.',
        cameraMovement: 'Handheld chase follow.',
        actions: [{ actor: 'Ilya Sorin', verb: 'grabs', target: 'pipe brace', stagingNotes: 'The turn becomes a physical obstacle.' }],
      },
      {
        id: 'shot_03',
        startSeconds: 8,
        endSeconds: 12,
        visualAction: 'A patrol drone slides overhead and paints Ilya with a hard blue-white scan.',
        composition: 'Ilya is small below brutalist geometry while the drone crosses top frame.',
        cameraMovement: 'Crane-like rise and tilt.',
      },
      {
        id: 'shot_04',
        startSeconds: 12,
        endSeconds: 15,
        visualAction: 'Ilya vaults a service fence as a stun round sparks against the metal where he was standing.',
        composition: 'His body arcs across center while red-lit officers are blocked on the other side.',
        cameraMovement: 'Lateral tracking.',
        actions: [{ actor: 'Ilya Sorin', verb: 'vaults', target: 'service fence', stagingNotes: 'Metal impact and sparks mark the near capture.' }],
      },
    ],
  }
  const assetPack = { entities: [] }
  const slowSheet = buildCinematicBeatSheetPrompt({
    blockScript: slowCafeScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a cinematic cafe banter scene',
    guidance: null,
  })
  assert.equal(slowSheet.beatSheetPlan.visualDensity, 'slow')
  assert.equal(slowSheet.beatSheetPlan.shotStripMode, 'sparse')
  assert.equal(slowSheet.beatSheetPlan.panelCount, 5)
  assert.equal((slowSheet.prompt.match(/^BEAT /gm) ?? []).length, 5)
  assert.match(slowSheet.prompt, /Panel-count rule: these panels represent meaningful visual cuts or action phases, not every second/)

  const slowShortSheet = buildCinematicBeatSheetPrompt({
    blockScript: { ...slowCafeScript, durationSeconds: 11, shots: slowCafeScript.shots.slice(0, 3).map((shot, index) => ({ ...shot, startSeconds: index * 3, endSeconds: index === 2 ? 11 : index * 3 + 3 })) },
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a short quiet cafe exchange',
    guidance: null,
  })
  assert.equal(slowShortSheet.beatSheetPlan.visualDensity, 'slow')
  assert.ok(Number(slowShortSheet.beatSheetPlan.panelCount) <= 4)

  const actionSheet = buildCinematicBeatSheetPrompt({
    blockScript: actionChaseScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create an underrail chase',
    guidance: null,
  })
  assert.equal(actionSheet.beatSheetPlan.visualDensity, 'action')
  assert.equal(actionSheet.beatSheetPlan.shotStripMode, 'dense')
  assert.ok(Number(actionSheet.beatSheetPlan.panelCount) >= 8)
  assert.ok(Number(actionSheet.beatSheetPlan.panelCount) <= 12)

  const directionSheet = buildCinematicDirectionSheetPrompt({
    blockScript: slowCafeScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a cinematic cafe banter scene',
    guidance: null,
  })
  assert.equal(directionSheet.directionSheetPlan.visualDensity, 'slow')
  assert.match(directionSheet.prompt, /sparse slow-scene coverage/)
  assert.match(directionSheet.prompt, /Do not invent second-by-second panels/)

  const videoPrompt = buildCinematicVideoPrompt({
    blockScript: slowCafeScript,
    assetPack,
    prompt: 'create a cinematic cafe banter scene',
    guidance: null,
    durationSeconds: 15,
    aspectRatio: '16:9',
    resolution: '720p',
    generateAudio: true,
    referenceImageCount: 2,
    cinematicReferenceMode: 'shot_reference_sheet',
  })
  assert.match(videoPrompt, /Ilya Sorin: "You pick very public hiding spots\."/)
  assert.match(videoPrompt, /EVA-9: "I practiced with your voice while you were asleep\."/)
})

test('cinematic direction-sheet mode builds director reference sheet and Seedance legend', async () => {
  const sharedModulePath = ['..', '..', 'supabase', 'functions', '_shared', 'output-workflow.ts'].join('/')
  const { buildCinematicDirectionSheetPrompt, buildCinematicVideoPrompt } = await import(sharedModulePath) as {
    buildCinematicDirectionSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
      debugCinematicStoryboardStyleSafeMode?: boolean
      cinematicStoryboardStyleOverride?: string
    }) => { prompt: string; directionSheetPlan: Record<string, unknown>; imageSize: { width: number; height: number } }
    buildCinematicVideoPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      prompt: string
      guidance: null
      durationSeconds: number
      aspectRatio: string
      resolution: string
      generateAudio: boolean
      referenceImageCount: number
      cinematicReferenceMode?: string
      debugCinematicStoryboardStyleSafeMode?: boolean
      cinematicStoryboardStyleOverride?: string
    }) => string
  }
  const blockScript = {
    title: 'Cafe Static Take',
    durationSeconds: 15,
    location: 'lower_city_cafe',
    shots: [
      {
        id: 'shot_01',
        title: 'Hook at the table',
        startSeconds: 0,
        endSeconds: 4,
        visualAction: 'Ilya and EVA-9 sit across from each other with chipped cups between them while neon reflections crawl across wet glass.',
        composition: 'Ilya foreground left, EVA-9 foreground right, surveillance dome layered behind them.',
        framing: 'Medium two-shot at a cramped metal cafe table.',
        cameraMovement: 'Slow lateral creep inward.',
        dialogue: [{ speaker: 'Ilya Sorin', line: 'You pick very public hiding spots.', delivery: 'dry' }],
        audioCues: ['rain ticking against glass'],
      },
      {
        id: 'shot_02',
        title: 'Still answer',
        startSeconds: 4,
        endSeconds: 9,
        visualAction: 'EVA-9 gives the faintest approximation of a smile as Ilya stirs bitter coffee.',
        composition: 'Ilya shoulder soft in foreground, EVA-9 centered with cold blue edge light.',
        framing: 'Over-shoulder favoring EVA-9.',
        cameraMovement: 'Gentle push-in.',
      },
      {
        id: 'shot_03',
        title: 'Room freezes',
        startSeconds: 9,
        endSeconds: 15,
        visualAction: 'EVA-9 holds his gaze without blinking as the red surveillance glint pulses once behind her.',
        composition: 'Her face centered and still, background falling away into cold blur.',
        framing: 'Tight close-up on EVA-9.',
        cameraMovement: 'Nearly imperceptible push-in.',
      },
    ],
  }
  const assetPack = {
    entities: [
      { name: 'Ilya Sorin', visualDescription: 'lean young man in a worn utility jacket with tired eyes', visualTraits: ['shaved dark hair'] },
      { name: 'EVA-9', visualDescription: 'sleek humanoid android with pale synthetic panels and calm unreadable gaze', visualTraits: ['subtle neck ports'] },
    ],
  }
  const sheet = buildCinematicDirectionSheetPrompt({
    blockScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a cinematic cafe banter scene',
    guidance: null,
    debugCinematicStoryboardStyleSafeMode: true,
    cinematicStoryboardStyleOverride: 'painterly comic-book cinematic production art',
  })
  assert.equal(sheet.directionSheetPlan.sheetKind, 'shot_reference_sheet')
  assert.deepEqual(sheet.imageSize, { width: 2304, height: 1536 })
  assert.match(sheet.prompt, /CINEMATIC DIRECTION SHEET/)
  assert.match(sheet.prompt, /TIMED SHOT STRIP/)
  assert.match(sheet.prompt, /LOCATION FLOOR MAP/)
  assert.match(sheet.prompt, /CAMERA LAYOUT/)
  assert.match(sheet.prompt, /LIGHTING \/ MOOD \/ STYLE/)
  assert.match(sheet.prompt, /CONTINUITY ANCHORS/)
  assert.match(sheet.prompt, /HERO FRAME/)
  assert.match(sheet.prompt, /subject positions, movement arrows, camera positions, and camera direction cones/)
  assert.match(sheet.prompt, /painterly comic-book cinematic production art/)
  assert.doesNotMatch(sheet.prompt, /You pick very public hiding spots|rain ticking against glass|Seedance|provider names/)

  const videoPrompt = buildCinematicVideoPrompt({
    blockScript,
    assetPack,
    prompt: 'create a cinematic cafe banter scene',
    guidance: null,
    durationSeconds: 15,
    aspectRatio: '16:9',
    resolution: '720p',
    generateAudio: true,
    referenceImageCount: 3,
    cinematicReferenceMode: 'shot_reference_sheet',
    debugCinematicStoryboardStyleSafeMode: true,
    cinematicStoryboardStyleOverride: 'painterly comic-book cinematic production art',
  })
  assert.match(videoPrompt, /@Image1: cinematic direction sheet/)
  assert.match(videoPrompt, /timed shot strip, blocking, camera layout, spatial map, lighting direction/)
  assert.match(videoPrompt, /Do not reproduce sheet labels, maps, arrows, camera cones/)
  assert.match(videoPrompt, /Ilya Sorin: "You pick very public hiding spots\."/)
})

test('MUAPI video helpers build payloads and parse result shapes', async () => {
  const sharedModulePath = ['..', '..', 'supabase', 'functions', '_shared', 'output-workflow.ts'].join('/')
  const { buildMuapiVideoPayload, extractMuapiVideoUrlFromResult } = await import(sharedModulePath) as {
    buildMuapiVideoPayload: (input: {
      prompt: string
      durationSeconds: number
      aspectRatio?: string
      referenceImageUrls?: string[]
      referenceVideoUrls?: string[]
      referenceAudioUrls?: string[]
    }) => Record<string, unknown>
    extractMuapiVideoUrlFromResult: (value: unknown) => string
  }

  assert.deepEqual(buildMuapiVideoPayload({
    prompt: 'Generate one cinematic take.',
    durationSeconds: 10,
    aspectRatio: '16:9',
    referenceImageUrls: ['https://example.com/a.webp'],
    referenceVideoUrls: ['https://example.com/ref.mp4'],
    referenceAudioUrls: ['https://example.com/ref.wav'],
  }), {
    prompt: 'Generate one cinematic take.',
    images_list: ['https://example.com/a.webp'],
    video_files: ['https://example.com/ref.mp4'],
    audio_files: ['https://example.com/ref.wav'],
    aspect_ratio: '16:9',
    duration: 10,
  })

  assert.equal(extractMuapiVideoUrlFromResult({ video_url: 'https://cdn.example.com/out.mp4' }), 'https://cdn.example.com/out.mp4')
  assert.equal(extractMuapiVideoUrlFromResult({ output: { video_url: 'https://cdn.example.com/output.mp4' } }), 'https://cdn.example.com/output.mp4')
  assert.equal(extractMuapiVideoUrlFromResult({ result: { videos: [{ url: 'https://cdn.example.com/result.webm' }] } }), 'https://cdn.example.com/result.webm')
  assert.equal(extractMuapiVideoUrlFromResult({ response: ['https://cdn.example.com/response.mp4'] }), 'https://cdn.example.com/response.mp4')
  assert.equal(extractMuapiVideoUrlFromResult({ outputs: ['https://cdn.example.com/webhook.mp4'] }), 'https://cdn.example.com/webhook.mp4')
  assert.equal(extractMuapiVideoUrlFromResult({ status: 'failed', error_message: 'moderated' }), '')
})

test('cinematic Nara EVA-9 fixture separates visual storyboard from Seedance dialogue', async () => {
  const sharedModulePath = ['..', '..', 'supabase', 'functions', '_shared', 'output-workflow.ts'].join('/')
  const { buildCinematicBeatSheetPrompt, buildCinematicVideoPrompt } = await import(sharedModulePath) as {
    buildCinematicBeatSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
      debugCinematicStoryboardStyleSafeMode?: boolean
      cinematicStoryboardStyleOverride?: string
    }) => { prompt: string }
    buildCinematicVideoPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      prompt: string
      guidance: null
      durationSeconds: number
      aspectRatio: string
      resolution: string
      generateAudio: boolean
      referenceImageCount: number
      cinematicReferenceMode?: string
      debugCinematicStoryboardStyleSafeMode?: boolean
      cinematicStoryboardStyleOverride?: string
    }) => string
  }
  const assetPack = {
    entities: [
      {
        key: 'nara_quill',
        name: 'Nara Quill',
        visualDescription: 'sharp-eyed woman with braided hair, patchwork tech coat, portable projector rig, blue monitor glow across her face',
        visualTraits: ['braided hair', 'patchwork tech coat', 'focused expression'],
      },
      {
        key: 'eva_9',
        name: 'EVA-9',
        visualDescription: 'sleek humanoid android with pale synthetic skin panels, subtle neck ports, white maintenance uniform, calm unreadable gaze',
        visualTraits: ['pale synthetic skin panels', 'subtle neck ports', 'white maintenance uniform'],
      },
    ],
  }
  const blockScript = {
    title: 'First Examination',
    durationSeconds: 12,
    shots: [
      {
        id: 'shot_01',
        title: 'The found android',
        startSeconds: 0,
        endSeconds: 6,
        beat: 'Nara finds EVA-9 on the worktable and realizes the machine is not ordinary.',
        visualAction: 'Nara steps into the blue-lit bay and stops at a steel worktable where EVA-9 lies half-upright under hanging task lamps.',
        composition: 'Nara stands at arm length from EVA-9, shoulders tight, with rainwater beading on the android casing and cold blue reflections on the table.',
        actions: [
          { actor: 'Nara Quill', verb: 'stares_at', target: 'EVA-9', stagingNotes: 'Her gaze tracks exposed seams, damage, and the android faceplate with visible disbelief.', startSeconds: 1, endSeconds: 5 },
          { actor: 'EVA-9', verb: 'lies_still', target: 'worktable', stagingNotes: 'The android remains motionless except for a faint status flicker under damaged plating.', startSeconds: 0, endSeconds: 6 },
        ],
        dialogue: [
          { speaker: 'Nara Quill', line: "You're what came out of the Foundry.", delivery: 'stunned and quiet', startSeconds: 4, endSeconds: 6 },
        ],
        audioCues: ['rain ticking against the bay window', 'low electrical hum under the table'],
      },
      {
        id: 'shot_02',
        title: 'Too refined',
        startSeconds: 6,
        endSeconds: 12,
        beat: 'Nara inspects the internal architecture and becomes more bewildered.',
        visualAction: 'Nara leans over EVA-9, lifts a torn panel edge with gloved fingers, and studies the intricate internal architecture.',
        composition: 'Tight worktable view with Nara braced in the task light, EVA-9 face and upper torso visible, tiny status reflections moving across polished synthetic seams.',
        actions: [
          { actor: 'Nara Quill', verb: 'leans_over', target: 'EVA-9', stagingNotes: 'She braces one hand on the table and lowers into the task light.', startSeconds: 0, endSeconds: 3 },
          { actor: 'Nara Quill', verb: 'examines', target: 'EVA-9', stagingNotes: 'Bewilderment overtakes suspicion as she studies the component lattice.', startSeconds: 3, endSeconds: 6 },
        ],
        dialogue: [
          { speaker: 'Nara Quill', line: 'No. This is too refined.', delivery: 'whispered, disbelieving', startSeconds: 3, endSeconds: 5 },
        ],
        audioCues: ['soft servo flicker beneath damaged plating', 'distant thunder through metal walls'],
      },
    ],
  }

  const storyboardPrompt = buildCinematicBeatSheetPrompt({
    blockScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a cinematic where Nara Quill is examining Eva-9 for the first time',
    guidance: null,
    debugCinematicStoryboardStyleSafeMode: true,
    cinematicStoryboardStyleOverride: 'painterly comic-book cinematic production art, expressive ink-and-paint rendering, premium graphic novel storyboard look, not photorealistic',
  }).prompt
  assert.doesNotMatch(storyboardPrompt, /You're what came out of the Foundry|No\. This is too refined|rain ticking|electrical hum|servo flicker/)
  assert.doesNotMatch(storyboardPrompt, /\b(stares_at|leans_over|lies_still)\b/)
  assert.match(storyboardPrompt, /Nara steps into the blue-lit bay/)
  assert.match(storyboardPrompt, /Nara Quill's mouth is slightly open/)
  assert.match(storyboardPrompt, /painterly comic-book cinematic production art/)
  assert.match(storyboardPrompt, /stylized production-board translation, not photorealistic likeness/i)
  assert.match(storyboardPrompt, /preserving each reference image's identity anchors, silhouette, wardrobe, palette, props, material cues, and environment geometry/i)

  const videoPrompt = buildCinematicVideoPrompt({
    blockScript,
    assetPack,
    prompt: 'create a cinematic where Nara Quill is examining Eva-9 for the first time',
    guidance: null,
    durationSeconds: 12,
    aspectRatio: '16:9',
    resolution: '720p',
    generateAudio: true,
    referenceImageCount: 3,
    cinematicReferenceMode: 'storyboard_sheet',
    debugCinematicStoryboardStyleSafeMode: true,
    cinematicStoryboardStyleOverride: 'painterly comic-book cinematic production art, expressive ink-and-paint rendering, premium graphic novel storyboard look, not photorealistic',
  })
  assert.match(videoPrompt, /Target video style: grounded live-action cinematic video/)
  assert.match(videoPrompt, /@Image1 is a stylized storyboard\/timing reference rendered as painterly comic-book cinematic production art/)
  assert.match(videoPrompt, /render the final clip in the target video style: grounded live-action cinematic video/)
  assert.match(videoPrompt, /Nara Quill: "You're what came out of the Foundry\."/)
  assert.match(videoPrompt, /Nara Quill: "No\. This is too refined\."/)
  assert.match(videoPrompt, /rain ticking against the bay window/)
  assert.match(videoPrompt, /@Image1: storyboard beat-sheet grid/)

  const normalStoryboardPrompt = buildCinematicBeatSheetPrompt({
    blockScript,
    assetPack,
    aspectRatio: '16:9',
    prompt: 'create a cinematic where Nara Quill is examining Eva-9 for the first time',
    guidance: null,
    debugCinematicStoryboardStyleSafeMode: false,
    cinematicStoryboardStyleOverride: 'painterly comic-book cinematic production art',
  }).prompt
  assert.doesNotMatch(normalStoryboardPrompt, /painterly comic-book cinematic production art/)
  assert.match(normalStoryboardPrompt, /Storyboard style safe mode: disabled/)
})

test('cinematic cafe storyboard prompt naturalizes actions and strips dialogue delivery', async () => {
  const sharedModulePath = ['..', '..', 'supabase', 'functions', '_shared', 'output-workflow.ts'].join('/')
  const { buildCinematicBeatSheetPrompt } = await import(sharedModulePath) as {
    buildCinematicBeatSheetPrompt: (input: {
      blockScript: Record<string, unknown>
      assetPack: Record<string, unknown>
      aspectRatio: string
      prompt: string
      guidance: null
    }) => { prompt: string }
  }
  const prompt = buildCinematicBeatSheetPrompt({
    aspectRatio: '16:9',
    prompt: 'create a cinematic of Eva-9 and Ilya bantering in a cafe',
    guidance: null,
    assetPack: {
      entities: [
        { key: 'ilya_sorin', name: 'Ilya Sorin', visualDescription: 'Lean young man in a worn utility jacket with grease-stained hands, shaved dark hair, tired eyes.' },
        { key: 'eva_9', name: 'EVA-9', visualDescription: 'Sleek humanoid android with pale synthetic skin panels, subtle neck ports, white maintenance uniform, calm unreadable gaze.' },
      ],
    },
    blockScript: {
      title: 'Cafe Static',
      durationSeconds: 15,
      shots: [
        {
          id: 'shot_01',
          title: 'Hook at the table',
          startSeconds: 0,
          endSeconds: 4,
          durationSeconds: 4,
          framing: 'Medium two-shot at a cramped metal cafe table by a rain-streaked window.',
          cameraMovement: 'Slow lateral creep inward.',
          visualAction: 'Ilya and EVA-9 sit across from each other with chipped cups between them; neon and warning red reflections crawl across wet glass while a ceiling surveillance dome hangs in soft focus behind.',
          composition: 'Ilya foreground left, EVA-9 foreground right, window reflections and surveillance dome layered in the background.',
          actions: [
            { actor: 'Ilya Sorin', verb: 'leans', target: 'table', prop: 'cup', stagingNotes: 'Shoulders low, trying to look casual while keeping his eyes on EVA-9.' },
            { actor: 'EVA-9', verb: 'tilts', target: 'Ilya Sorin', prop: 'cup', stagingNotes: 'Small precise head movement, unreadably calm, fingertips resting beside the cup without drinking.' },
          ],
          dialogue: [
            { speaker: 'Ilya Sorin', line: 'You know, for someone on the run, you pick very public hiding spots.', delivery: 'Dry, low, testing her.' },
            { speaker: 'EVA-9', line: "You sweat less when you think you're blending in.", delivery: 'Even, almost teasing.' },
          ],
        },
        {
          id: 'shot_04',
          title: 'The creepy line',
          startSeconds: 11,
          endSeconds: 15,
          durationSeconds: 4,
          framing: 'Tight close-up on EVA-9.',
          cameraMovement: 'Slow, nearly imperceptible push-in.',
          visualAction: 'EVA-9 holds his gaze without blinking; cafe reflections drift across her features while the red surveillance glint pulses once in the background.',
          composition: 'Her face centered and still, background falling away into cold blur except for a faint red point behind her.',
          actions: [
            { actor: 'EVA-9', verb: 'holds', target: 'Ilya Sorin', stagingNotes: 'Perfect stillness, no blink, no smile by the end.' },
          ],
          dialogue: [
            { speaker: 'EVA-9', line: 'I practiced with your voice while you were asleep.', delivery: 'Quiet, sincere, far too intimate.' },
          ],
        },
      ],
    },
  }).prompt

  assert.doesNotMatch(prompt, /Ilya Sorin leans table|EVA-9 tilts Ilya Sorin|EVA-9 holds Ilya Sorin Perfect/i)
  assert.doesNotMatch(prompt, /Dry, low, testing her|Even, almost teasing|Quiet, sincere, far too intimate/)
  assert.doesNotMatch(prompt, /You know, for someone on the run|I practiced with your voice/)
  assert.match(prompt, /Shot density: slow; shot-strip mode: sparse; panel count: 4/i)
  assert.match(prompt, /Panel-count rule: these panels represent meaningful visual cuts or action phases/i)
  assert.match(prompt, /Ilya and EVA-9 sit across from each other/i)
  assert.match(prompt, /EVA-9 holds Ilya Sorin's gaze/i)
  assert.match(prompt, /Medium two-shot at a cramped metal cafe table/i)
  assert.match(prompt, /Tight close-up on EVA-9/i)
})

test('prompt-first image request payloads do not inherit comic page count', () => {
  const payload = outputRequestStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Draw an image of Mara in The Archive',
    snapshot,
    runInput: {},
  })

  assert.equal(payload.pageCount, undefined)
  assert.deepEqual(payload.selectedSequenceUnitKeys, [])
})

test('prompt-first planner distinguishes reference documents from narrative prose', () => {
  const biblePlan = planOutputPrompt({
    prompt: 'create a story bible',
    snapshot,
  })
  assert.equal(biblePlan.intent, 'output_generation')
  assert.equal(biblePlan.outputKind, 'story_bible_from_world')
  assert.equal(biblePlan.documentMode, 'designed_reference')
  assert.ok(biblePlan.sections.some((section) => section.key === 'main_characters'))

  const textOnlyBiblePlan = planOutputPrompt({
    prompt: 'create a story bible text only, no images',
    snapshot,
  })
  assert.equal(textOnlyBiblePlan.documentMode, 'reference')

  const chapterPlan = planOutputPrompt({
    prompt: 'write the first chapter as prose',
    snapshot,
  })
  assert.equal(chapterPlan.outputKind, 'narrative_chapter_or_ebook')
  assert.equal(chapterPlan.documentMode, 'narrative')
})

test('prompt-first image requests use approved workflow nodes only', () => {
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Make a poster image of Mara in The Archive',
    targetFormat: 'image',
    snapshot,
  }, 'poster_image')

  assert.equal(plan.preset, 'composite_reference')
  assert.deepEqual(plan.nodes.map((node) => node.key), ['world_context', 'skill_context', 'visual_prompt', 'image_references', 'generated_image'])
  assert.equal(readConfigPurpose(plan.nodes.find((node) => node.key === 'visual_prompt') ?? {}), 'poster_prompt')
  assert.equal(readConfigPurpose(plan.nodes.find((node) => node.key === 'image_references') ?? {}), 'image_reference_selector')
  assert.equal(readConfigPurpose(plan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'poster_image')
  assert.equal(readConfigQuality(plan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'medium')
  assert.equal(readConfigOutputFormat(plan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'webp')
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'image_references' && edge.sourcePort === 'asset_pack' && edge.targetNodeKey === 'generated_image' && edge.targetPort === 'references'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'image_references' && edge.sourcePort === 'asset_pack' && edge.targetNodeKey === 'visual_prompt' && edge.targetPort === 'asset_pack'))
  assert.equal(validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges }).ok, true)
})

test('image workflow quality defaults are configurable and client-overridable', () => {
  const characterPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Character art portrait of Mara',
    targetFormat: 'image',
    snapshot,
  }, 'concept_art_image')
  assert.equal(readConfigQuality(characterPlan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'low')

  const overridePlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Character art portrait of Mara',
    targetFormat: 'image',
    imageQuality: 'high',
    snapshot,
  }, 'concept_art_image')
  assert.equal(readConfigQuality(overridePlan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'high')

  const comicPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Comic issue from Chapter 1',
    targetFormat: 'pdf',
    snapshot,
  }, 'comic_issue_from_sequence')
  assert.equal(comicPlan.nodes.some((node) => node.key === 'comic_atlas_image'), false)
  assert.equal(readConfigQuality(comicPlan.nodes.find((node) => node.key === 'page_001_image') ?? {}), 'medium')
})

test('image workflow output format defaults to webp and is client-overridable', () => {
  const defaultPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Make a poster image of Mara in The Archive',
    targetFormat: 'image',
    snapshot,
  }, 'poster_image')
  assert.equal(readConfigOutputFormat(defaultPlan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'webp')

  const overridePlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Make a poster image of Mara in The Archive',
    targetFormat: 'image',
    imageOutputFormat: 'png',
    snapshot,
  }, 'poster_image')
  assert.equal(readConfigOutputFormat(overridePlan.nodes.find((node) => node.key === 'generated_image') ?? {}), 'png')

  const comicPlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Comic issue from Chapter 1',
    targetFormat: 'pdf',
    snapshot,
  }, 'comic_issue_from_sequence')
  assert.equal(comicPlan.nodes.some((node) => node.key === 'comic_atlas_image'), false)
  assert.equal(readConfigOutputFormat(comicPlan.nodes.find((node) => node.key === 'page_001_image') ?? {}), 'webp')
})

test('story bible workflow creates parallel reference sections instead of chapter prose', () => {
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'create a story bible',
    targetFormat: 'pdf',
    snapshot,
  }, 'story_bible_from_world')

  assert.equal(plan.preset, 'story_bible_from_world')
  assert.ok(plan.nodes.some((node) => node.key === 'bible_section_plan'))
  const documentRender = plan.nodes.find((node) => node.key === 'document_render')
  assert.equal(documentRender?.config.documentMode, 'designed_reference')
  assert.equal(documentRender?.config.pageSize, 'a4')
  assert.equal(plan.nodes.some((node) => readConfigPurpose(node) === 'chapter_prose'), false)
  const sectionNodes = plan.nodes.filter((node) => readConfigPurpose(node) === 'bible_section')
  assert.ok(sectionNodes.length >= 8)
  assert.ok(sectionNodes.every((node) => node.key.startsWith('bible_')))
  assert.ok(sectionNodes.every((node) => plan.edges.some((edge) => edge.sourceNodeKey === node.key && edge.targetNodeKey === 'bible_assembly')))
  const executionPlan = buildOutputWorkflowExecutionPlan(plan.nodes, plan.edges)
  const levelWithSections = executionPlan.levels.find((level) => sectionNodes.every((node) => level.includes(node.key)))
  assert.ok(levelWithSections)
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'bible_assembly' && edge.targetNodeKey === 'document_render'))
  assert.equal(validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges }).ok, true)
})

test('validates DAG ordering and rejects cycles', () => {
  const nodes = [
    { key: 'context', nodeType: 'world_context_query' as const },
    { key: 'outline', nodeType: 'text_llm' as const },
    { key: 'artifact', nodeType: 'output_artifact' as const },
  ]
  const edges = [
    { sourceNodeKey: 'context', targetNodeKey: 'outline' },
    { sourceNodeKey: 'outline', targetNodeKey: 'artifact' },
  ]

  assert.equal(validateOutputWorkflowGraph({ nodes, edges }).ok, true)
  assert.deepEqual(topologicallySortOutputWorkflow(nodes, edges), ['context', 'outline', 'artifact'])
  assert.equal(validateOutputWorkflowGraph({
    nodes,
    edges: [...edges, { sourceNodeKey: 'artifact', targetNodeKey: 'context' }],
  }).ok, false)
})

test('builds execution levels for independent parallel branches and joins', () => {
  const nodes = [
    { key: 'context' },
    { key: 'chapter_a' },
    { key: 'chapter_b' },
    { key: 'assembly' },
  ]
  const edges = [
    { sourceNodeKey: 'context', targetNodeKey: 'chapter_a' },
    { sourceNodeKey: 'context', targetNodeKey: 'chapter_b' },
    { sourceNodeKey: 'chapter_a', targetNodeKey: 'assembly' },
    { sourceNodeKey: 'chapter_b', targetNodeKey: 'assembly' },
  ]

  const plan = buildOutputWorkflowExecutionPlan(nodes, edges)

  assert.deepEqual(plan.levels, [['context'], ['chapter_a', 'chapter_b'], ['assembly']])
  assert.deepEqual(plan.dependencyKeysByNodeKey.assembly.sort(), ['chapter_a', 'chapter_b'])
  assert.deepEqual(plan.diagnostics, [])
})

test('workflow graph view-model exposes statuses, provider backing, and edge port labels', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'write the ebook',
    targetFormat: 'pdf',
    selectedEntityKeys: ['hero'],
    selectedSequenceUnitKeys: ['chapter-1', 'chapter-2'],
    snapshot,
  })
  const nodes = plan.nodes.map((node, index) => ({
    ...node,
    id: `node-${index}`,
    workflowId: 'workflow-1',
    createdAt: now,
    updatedAt: now,
  }))
  const edges = plan.edges.map((edge, index) => ({
    ...edge,
    id: `edge-${index}`,
    workflowId: 'workflow-1',
    createdAt: now,
    updatedAt: now,
  }))
  const steps = [{
    id: 'step-1',
    runId: 'run-1',
    workflowId: 'workflow-1',
    nodeId: 'node-0',
    nodeKey: 'outline',
    nodeType: 'text_llm' as const,
    status: 'running' as const,
    orderIndex: 1,
    label: 'Outline / TOC',
    inputHash: '',
    outputHash: '',
    outputs: {},
    provider: 'openai',
    model: 'gpt-5.2',
    providerRequestId: 'resp_123',
    errorMessage: null,
    metadata: { providerStatus: 'in_progress' },
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  }]

  const viewModel = buildOutputWorkflowGraphViewModel({ nodes, edges, steps })
  const outline = viewModel.nodes.find((node) => node.key === 'outline')
  const contextEdge = viewModel.edges.find((edge) => edge.sourceNodeKey === 'world_context' && edge.targetNodeKey === 'outline')

  assert.equal(viewModel.diagnostics.length, 0)
  assert.equal(outline?.status, 'running')
  assert.equal(outline?.providerBacked, true)
  assert.equal(contextEdge?.sourcePort, 'context')
  assert.equal(contextEdge?.targetPort, 'context')
})

test('workflow graph level layout keeps parallel chapter nodes in one column', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'write the ebook',
    targetFormat: 'pdf',
    selectedEntityKeys: ['hero'],
    selectedSequenceUnitKeys: ['chapter-1', 'chapter-2'],
    snapshot,
  })
  const nodes = plan.nodes.map((node, index) => ({
    ...node,
    id: `node-${index}`,
    workflowId: 'workflow-1',
    createdAt: now,
    updatedAt: now,
  }))
  const edges = plan.edges.map((edge, index) => ({
    ...edge,
    id: `edge-${index}`,
    workflowId: 'workflow-1',
    createdAt: now,
    updatedAt: now,
  }))
  const positions = buildOutputWorkflowLevelLayout({ nodes, edges })
  const firstChapter = positions.get('chapter_001_prose')
  const secondChapter = positions.get('chapter_002_prose')

  assert.ok(firstChapter)
  assert.ok(secondChapter)
  assert.equal(firstChapter?.x, secondChapter?.x)
  assert.notEqual(firstChapter?.y, secondChapter?.y)
  assert.deepEqual(buildOutputWorkflowTargetedRunMetadata('chapter_001_prose', 'run-1'), {
    sourceRunId: 'run-1',
    runMode: 'targeted_node_only_preview',
    runScope: 'node_only',
    targetNodeKeys: ['chapter_001_prose'],
    forceNodeKeys: ['chapter_001_prose'],
    reuseExistingUpstreamOutputs: true,
    allowStaleUpstreamOutputs: true,
  })
})

test('selects targeted run subgraph with ancestors only', () => {
  const nodes = [
    { key: 'context' },
    { key: 'outline' },
    { key: 'chapter_a' },
    { key: 'chapter_b' },
    { key: 'assembly' },
    { key: 'artifact' },
  ]
  const edges = [
    { sourceNodeKey: 'context', targetNodeKey: 'outline' },
    { sourceNodeKey: 'outline', targetNodeKey: 'chapter_a' },
    { sourceNodeKey: 'outline', targetNodeKey: 'chapter_b' },
    { sourceNodeKey: 'chapter_a', targetNodeKey: 'assembly' },
    { sourceNodeKey: 'chapter_b', targetNodeKey: 'assembly' },
    { sourceNodeKey: 'assembly', targetNodeKey: 'artifact' },
  ]

  const chapterOnly = selectOutputWorkflowRunSubgraph({ nodes, edges, targetNodeKeys: ['chapter_a'] })
  assert.deepEqual(chapterOnly.nodes.map((node) => node.key), ['context', 'outline', 'chapter_a'])
  assert.deepEqual(chapterOnly.edges.map((edge) => `${edge.sourceNodeKey}->${edge.targetNodeKey}`), [
    'context->outline',
    'outline->chapter_a',
  ])

  const artifactOnly = selectOutputWorkflowRunSubgraph({ nodes, edges, targetNodeKeys: ['artifact'] })
  assert.deepEqual(artifactOnly.nodes.map((node) => node.key), ['context', 'outline', 'chapter_a', 'chapter_b', 'assembly', 'artifact'])
  assert.deepEqual(artifactOnly.diagnostics, [])

  const missing = selectOutputWorkflowRunSubgraph({ nodes, edges, targetNodeKeys: ['missing'] })
  assert.equal(missing.diagnostics.length, 1)
})

test('selects targeted run subgraphs by run scope', () => {
  const nodes = [
    { key: 'context' },
    { key: 'script' },
    { key: 'page_a' },
    { key: 'page_b' },
    { key: 'pdf' },
    { key: 'artifact' },
  ]
  const edges = [
    { sourceNodeKey: 'context', targetNodeKey: 'script' },
    { sourceNodeKey: 'script', targetNodeKey: 'page_a' },
    { sourceNodeKey: 'script', targetNodeKey: 'page_b' },
    { sourceNodeKey: 'page_a', targetNodeKey: 'pdf' },
    { sourceNodeKey: 'page_b', targetNodeKey: 'pdf' },
    { sourceNodeKey: 'pdf', targetNodeKey: 'artifact' },
  ]

  const nodeOnly = selectOutputWorkflowRunSubgraph({ nodes, edges, targetNodeKeys: ['page_a'], runScope: 'node_only' })
  assert.deepEqual(nodeOnly.nodes.map((node) => node.key), ['page_a'])
  assert.deepEqual(nodeOnly.edges, [])

  const downstream = selectOutputWorkflowRunSubgraph({ nodes, edges, targetNodeKeys: ['page_a'], runScope: 'node_and_downstream' })
  assert.deepEqual(downstream.nodes.map((node) => node.key), ['page_a', 'pdf', 'artifact'])
  assert.deepEqual(downstream.edges.map((edge) => `${edge.sourceNodeKey}->${edge.targetNodeKey}`), [
    'page_a->pdf',
    'pdf->artifact',
  ])
})

test('dirty propagation marks downstream nodes only', () => {
  const dirty = markDirtyOutputWorkflowNodes({
    changedNodeKeys: ['outline'],
    nodes: [{ key: 'context' }, { key: 'outline' }, { key: 'chapters' }, { key: 'artifact' }],
    edges: [
      { sourceNodeKey: 'context', targetNodeKey: 'outline' },
      { sourceNodeKey: 'outline', targetNodeKey: 'chapters' },
      { sourceNodeKey: 'chapters', targetNodeKey: 'artifact' },
    ],
  })

  assert.deepEqual(dirty.filter((node) => node.dirty).map((node) => node.key).sort(), ['artifact', 'chapters', 'outline'])
})

test('fingerprints are stable and change when world context changes', () => {
  const first = buildOutputWorkflowFingerprint({
    worldEntities: snapshot.worldEntities,
    worldRelationships: snapshot.worldRelationships,
    worldWiki: snapshot.worldWiki,
  })
  const second = buildOutputWorkflowFingerprint({
    worldEntities: snapshot.worldEntities,
    worldRelationships: snapshot.worldRelationships,
    worldWiki: snapshot.worldWiki,
  })
  const changed = buildOutputWorkflowFingerprint({
    worldEntities: snapshot.worldEntities,
    worldRelationships: snapshot.worldRelationships,
    worldWiki: { ...snapshot.worldWiki, title: 'Changed' },
  })

  assert.equal(first, second)
  assert.notEqual(first, changed)
})

test('ebook preset binds sequence units and creates PDF artifact chain', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Generate an ebook PDF from the world.',
    selectedEntityKeys: ['hero'],
    selectedSequenceUnitKeys: ['chapter-1', 'chapter-2'],
    targetFormat: 'pdf',
    snapshot,
  })

  assert.equal(plan.preset, 'ebook_from_world')
  assert.deepEqual(plan.sourceSequenceUnitKeys, ['chapter-1', 'chapter-2'])
  assert.ok(plan.nodes.some((node) => node.key === 'skill_context' && node.nodeType === 'skill_context_query'))
  assert.ok(plan.nodes.some((node) => node.nodeType === 'document_render'))
  assert.ok(plan.nodes.some((node) => node.nodeType === 'output_artifact'))
  assert.ok(plan.nodes.some((node) => node.key === 'chapter_001_prose'))
  assert.ok(plan.nodes.some((node) => node.key === 'chapter_002_prose'))
  assert.ok(plan.nodes.some((node) => node.key === 'cover_prompt' && node.nodeType === 'text_llm'))
  assert.ok(plan.nodes.some((node) => node.key === 'cover_image' && node.nodeType === 'image_generation'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cover_prompt' && edge.targetNodeKey === 'cover_image'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'cover_image' && edge.targetNodeKey === 'document_render' && edge.targetPort === 'cover'))
  assert.equal(plan.nodes.some((node) => node.key.includes('_section_')), false)
  assert.equal(validateOutputWorkflowGraph({
    nodes: plan.nodes,
    edges: plan.edges,
  }).ok, true)
})

test('ebook preset fans full chapter prose nodes out before chapter assembly', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Generate an ebook PDF from the world.',
    selectedEntityKeys: ['hero'],
    selectedSequenceUnitKeys: ['chapter-1', 'chapter-2'],
    targetFormat: 'pdf',
    snapshot,
  })

  const executionPlan = buildOutputWorkflowExecutionPlan(plan.nodes, plan.edges)
  const chapterProseLevel = executionPlan.levels.find((level) => level.includes('chapter_001_prose'))
  const chapterNode = plan.nodes.find((node) => node.key === 'chapter_001_prose')

  assert.ok(chapterProseLevel?.includes('chapter_001_prose'))
  assert.ok(chapterProseLevel?.includes('chapter_002_prose'))
  assert.deepEqual(executionPlan.dependencyKeysByNodeKey.cover_image.sort(), ['cover_prompt', 'skill_context'])
  assert.ok(executionPlan.dependencyKeysByNodeKey.document_render.includes('cover_image'))
  assert.equal(defaultOutputWorkflowConcurrency.global, 8)
  assert.equal(defaultOutputWorkflowConcurrency.resourceClasses.llm, 8)
  assert.equal(defaultOutputWorkflowConcurrency.resourceClasses.image, 8)
  assert.equal(defaultOutputWorkflowConcurrency.resourceClasses.video, 8)
  assert.equal(defaultOutputWorkflowConcurrency.resourceClasses.utility, 8)
  assert.equal(chapterNode ? getOutputWorkflowNodeExecutionMetadata(chapterNode).maxConcurrency : undefined, 8)
  assert.equal(getOutputWorkflowNodeExecutionMetadata({
    nodeType: 'image_generation',
    config: { execution: { resourceClass: 'image', groupKey: 'cinematic_v2_shot_keyframes', maxConcurrency: 3 } },
    metadata: {},
  }).maxConcurrency, 8)
  assert.deepEqual(executionPlan.dependencyKeysByNodeKey.chapter_assembly.sort(), ['chapter_001_prose', 'chapter_002_prose'])
  assert.deepEqual(executionPlan.dependencyKeysByNodeKey.chapter_001_prose.sort(), [
    'chapter_plan',
    'skill_context',
    'world_context',
  ])
})

test('comic issue preset requires one sequence unit and creates fixed page fan-out', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a comic issue from this sequence unit.',
    preset: 'comic_issue_from_sequence',
    selectedSequenceUnitKeys: ['chapter-1'],
    pageCount: 4,
    targetFormat: 'pdf',
    snapshot,
  })

  assert.equal(plan.preset, 'comic_issue_from_sequence')
  assert.deepEqual(plan.sourceSequenceUnitKeys, ['chapter-1'])
  assert.ok(plan.sourceEntityKeys.includes('hero'))
  assert.ok(plan.sourceEntityKeys.includes('archive'))
  assert.ok(!plan.sourceEntityKeys.includes('chapter-2'))
  assert.ok(plan.nodes.some((node) => node.key === 'comic_scene_script' && readConfigPurpose(node) === 'comic_scene_script'))
  assert.ok(plan.nodes.some((node) => node.key === 'comic_page_plan' && readConfigPurpose(node) === 'comic_page_plan'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'world_context' && edge.targetNodeKey === 'comic_scene_script' && edge.targetPort === 'context'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'skill_context' && edge.targetNodeKey === 'comic_scene_script' && edge.targetPort === 'guidance'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'relevant_entities' && edge.targetNodeKey === 'comic_scene_script' && edge.targetPort === 'asset_pack'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'comic_scene_script' && edge.targetNodeKey === 'comic_page_plan'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'comic_page_plan' && edge.targetNodeKey === 'comic_script'))
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'comic_page_prompt').length, 4)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'comic_page').length, 4)
  assert.equal(plan.nodes.find((node) => node.key === 'page_001_prompt')?.nodeType, 'utility_transform')
  assert.ok(plan.nodes.some((node) => node.key === 'relevant_entities' && readConfigPurpose(node) === 'comic_entity_selector'))
  assert.equal(plan.nodes.some((node) => node.key === 'comic_atlas_prompt'), false)
  assert.equal(plan.nodes.some((node) => node.key === 'comic_atlas_image'), false)
  assert.ok(plan.nodes.some((node) => node.key === 'comic_pdf_render' && node.nodeType === 'document_render'))
  const pageImage = plan.nodes.find((node) => node.key === 'page_001_image')
  const pageImageSize = pageImage?.config.imageSize as { width?: number; height?: number } | undefined
  assert.equal((pageImageSize?.width ?? 0) % 16, 0)
  assert.equal((pageImageSize?.height ?? 0) % 16, 0)
  assert.equal(pageImage?.config.maxReferenceImages, 6)
  assert.equal(pageImage ? getOutputWorkflowNodeExecutionMetadata(pageImage).maxConcurrency : undefined, 8)
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'relevant_entities' && edge.targetNodeKey === 'page_001_image' && edge.targetPort === 'references'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'page_001_prompt' && edge.targetNodeKey === 'page_001_image' && edge.targetPort === 'asset_pack'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'page_004_image' && edge.targetNodeKey === 'comic_pdf_render' && edge.targetPort === 'pages'))
  assert.equal(validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges }).ok, true)
})

test('comic scene script return path does not reference comic script repair state', () => {
  const sharedSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const sceneScriptBranch = sharedSource.slice(
    sharedSource.indexOf("if (purpose === 'comic_scene_script')"),
    sharedSource.indexOf("if (purpose === 'comic_page_plan')"),
  )

  assert.ok(sceneScriptBranch.includes('providerRequestId: readText(response.body.id)'))
  assert.equal(sceneScriptBranch.includes('repairResponse'), false)
})

test('comic issue page images run in parallel and PDF waits for all pages', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'comic from chapter one',
    selectedSequenceUnitKeys: ['chapter-1'],
    pageCount: 3,
    targetFormat: 'pdf',
    snapshot,
  })
  const executionPlan = buildOutputWorkflowExecutionPlan(plan.nodes, plan.edges)
  const pageImageLevel = executionPlan.levels.find((level) => level.includes('page_001_image'))

  assert.equal(plan.preset, 'comic_issue_from_sequence')
  assert.ok(pageImageLevel?.includes('page_001_image'))
  assert.ok(pageImageLevel?.includes('page_002_image'))
  assert.ok(pageImageLevel?.includes('page_003_image'))
  assert.deepEqual(executionPlan.dependencyKeysByNodeKey.comic_pdf_render.sort(), [
    'comic_script',
    'page_001_image',
    'page_002_image',
    'page_003_image',
  ])
  assert.deepEqual([...new Set(executionPlan.dependencyKeysByNodeKey.page_001_image)].sort(), [
    'page_001_prompt',
    'relevant_entities',
    'skill_context',
  ])
})

test('optional cover branch failure still allows document render to run with errors', async () => {
  const nodes = [
    { key: 'manuscript', nodeType: 'text_llm' as const, config: {}, metadata: {} },
    { key: 'cover', nodeType: 'image_generation' as const, config: { execution: { continueOnError: true } }, metadata: {} },
    { key: 'document', nodeType: 'document_render' as const, config: {}, metadata: {} },
  ]
  const edges = [
    { sourceNodeKey: 'manuscript', sourcePort: 'text', targetNodeKey: 'document', targetPort: 'source', metadata: {} },
    { sourceNodeKey: 'cover', sourcePort: 'image', targetNodeKey: 'document', targetPort: 'cover', metadata: { optional: true } },
  ]
  const completed: string[] = []
  const failed: string[] = []

  const result = await runOutputWorkflowReadyQueue({
    nodes,
    edges,
    executeNode: async ({ node }) => {
      if (node.key === 'cover') throw new Error('cover failed')
      return { outputs: { text: node.key } }
    },
    onNodeComplete: ({ node }) => {
      completed.push(node.key)
    },
    onNodeFailed: ({ node }) => {
      failed.push(node.key)
    },
  })

  assert.equal(result.status, 'completed_with_errors')
  assert.deepEqual(failed, ['cover'])
  assert.ok(completed.includes('document'))
})

test('ebook nodes carry guidance config and invalid skill keys produce diagnostics', () => {
  const plan = planOutputWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Generate an ebook PDF from the world.',
    selectedEntityKeys: ['hero'],
    selectedSequenceUnitKeys: ['chapter-1', 'chapter-2'],
    targetFormat: 'pdf',
    snapshot,
  })
  const chapterNode = plan.nodes.find((node) => node.key === 'chapter_001_prose')
  assert.ok(chapterNode)
  const guidance = buildOutputGuidanceBundleForNode({ node: chapterNode!, worldWiki: snapshot.worldWiki })

  assert.ok(guidance.skillKeys.includes('fiction_prose_voice'))
  assert.ok(guidance.skillKeys.includes('anti_ai_telltales'))
  assert.ok(guidance.skillKeys.includes('fiction_pov_balance'))

  const invalidPlan = validateOutputWorkflowGraph({
    nodes: [{ ...chapterNode!, config: { ...chapterNode!.config, skillKeys: ['missing_skill'] } }],
    edges: [],
    worldWiki: snapshot.worldWiki,
  })
  assert.equal(invalidPlan.ok, false)
  assert.ok(invalidPlan.diagnostics.some((diagnostic) => diagnostic.includes('missing_skill')))
})

test('changing node skill keys changes workflow input hash material', () => {
  const baseHash = hashOutputWorkflowValue({
    nodeConfig: { purpose: 'chapter_prose', skillKeys: ['fiction_prose_voice'] },
    upstream: {},
  })
  const changedHash = hashOutputWorkflowValue({
    nodeConfig: { purpose: 'chapter_prose', skillKeys: ['fiction_prose_voice', 'anti_ai_telltales'] },
    upstream: {},
  })

  assert.notEqual(baseHash, changedHash)
})

test('ready queue runs independent nodes concurrently within global cap', async () => {
  const nodes = [
    { key: 'a', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
    { key: 'b', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
    { key: 'c', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
  ]
  let running = 0
  let maxRunning = 0
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  await runOutputWorkflowReadyQueue({
    nodes,
    edges: [],
    globalMaxConcurrency: 2,
    executeNode: async ({ node }) => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      if (running === 2) release()
      await gate
      running -= 1
      return { outputs: { nodeKey: node.key } }
    },
  })

  assert.equal(maxRunning, 2)
})

test('ready queue can run eight independent video nodes in parallel by default', async () => {
  const nodes = Array.from({ length: 8 }, (_, index) => ({
    key: `video_${index + 1}`,
    nodeType: 'video_generation' as const,
    config: { execution: { resourceClass: 'video', groupKey: 'cinematic_videos', maxConcurrency: 8 } },
    metadata: {},
  }))
  let running = 0
  let maxRunning = 0

  const result = await runOutputWorkflowReadyQueue({
    nodes,
    edges: [],
    executeNode: async ({ node }) => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      await new Promise((resolve) => setTimeout(resolve, 10))
      running -= 1
      return { outputs: { nodeKey: node.key } }
    },
  })

  assert.equal(result.status, 'completed')
  assert.equal(maxRunning, 8)
  assert.equal(result.completed.length, 8)
})

test('ready queue respects resource class caps', async () => {
  const nodes = [
    { key: 'a', nodeType: 'text_llm' as const, config: {}, metadata: {} },
    { key: 'b', nodeType: 'text_llm' as const, config: {}, metadata: {} },
    { key: 'c', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
  ]
  let runningLlm = 0
  let maxRunningLlm = 0

  await runOutputWorkflowReadyQueue({
    nodes,
    edges: [],
    globalMaxConcurrency: 3,
    resourceClassMaxConcurrency: { llm: 1, utility: 3 },
    executeNode: async ({ node, resourceClass }) => {
      if (resourceClass === 'llm') {
        runningLlm += 1
        maxRunningLlm = Math.max(maxRunningLlm, runningLlm)
      }
      await Promise.resolve()
      if (resourceClass === 'llm') runningLlm -= 1
      return { outputs: { nodeKey: node.key } }
    },
  })

  assert.equal(maxRunningLlm, 1)
})

test('ready queue lets hash-skipped nodes unlock dependents', async () => {
  const nodes = [
    { key: 'cached', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
    { key: 'dependent', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
  ]
  const seen: string[] = []
  const result = await runOutputWorkflowReadyQueue({
    nodes,
    edges: [{ sourceNodeKey: 'cached', sourcePort: 'output', targetNodeKey: 'dependent', targetPort: 'input' }],
    executeNode: async ({ node, upstream }) => {
      seen.push(node.key)
      if (node.key === 'cached') return { status: 'skipped', outputs: { value: 1 } }
      assert.equal(upstream.cached.value, 1)
      return { outputs: { value: 2 } }
    },
  })

  assert.deepEqual(seen, ['cached', 'dependent'])
  assert.deepEqual(result.skipped, ['cached'])
  assert.equal(result.status, 'completed')
})

test('ready queue blocks failed optional branch and completes independent branches with errors', async () => {
  const nodes = [
    { key: 'optional', nodeType: 'utility_transform' as const, config: { execution: { continueOnError: true } }, metadata: {} },
    { key: 'dependent', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
    { key: 'independent', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
  ]
  const cancelled: string[] = []
  const result = await runOutputWorkflowReadyQueue({
    nodes,
    edges: [{ sourceNodeKey: 'optional', sourcePort: 'output', targetNodeKey: 'dependent', targetPort: 'input' }],
    executeNode: async ({ node }) => {
      if (node.key === 'optional') throw new Error('Optional branch failed.')
      return { outputs: { nodeKey: node.key } }
    },
    onNodeCancelled: ({ node }) => {
      cancelled.push(node.key)
    },
  })

  assert.equal(result.status, 'completed_with_errors')
  assert.deepEqual(result.failed, ['optional'])
  assert.deepEqual(cancelled, ['dependent'])
  assert.deepEqual(result.completed, ['independent'])
})

test('ready queue treats running node cancellation as cancelled and cancels pending descendants', async () => {
  const nodes = [
    { key: 'running', nodeType: 'text_llm' as const, config: {}, metadata: {} },
    { key: 'dependent', nodeType: 'utility_transform' as const, config: {}, metadata: {} },
  ]
  const cancelled: string[] = []
  const error = new Error('Cancelled by user.') as Error & { workflowCancelled: boolean }
  error.workflowCancelled = true

  const result = await runOutputWorkflowReadyQueue({
    nodes,
    edges: [{ sourceNodeKey: 'running', sourcePort: 'text', targetNodeKey: 'dependent', targetPort: 'input' }],
    executeNode: async () => {
      throw error
    },
    onNodeCancelled: ({ node }) => {
      cancelled.push(node.key)
    },
  })

  assert.equal(result.status, 'cancelled')
  assert.deepEqual(cancelled, ['running', 'dependent'])
})

test('worker persists cache status metadata for fresh skipped and recovered nodes', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(source, /buildOutputWorkflowNodeExecutionCacheMetadata/)
  assert.match(source, /cachedInputUpstream/)
  assert.match(source, /cachedInputNodeKeys/)
  assert.match(source, /cacheStatus/)
  assert.match(source, /recoveredFromRunStep: true/)
  assert.match(source, /skippedReason/)
  assert.match(source, /outputPreview: buildOutputWorkflowNodeOutputPreview/)
  assert.match(source, /sourceRunIdForCache/)
  assert.match(source, /outputWorkflowRunStepSelect/)
})

test('dynamic cinematic fanout marks obsolete nodes stale instead of deleting active graph nodes', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')
  const obsoleteSections = source.match(/obsoleteDynamicNodes[\s\S]{0,900}?dynamicCinematicStale[\s\S]{0,400}?replacedByDynamicCompileHash/g) ?? []

  assert.equal(obsoleteSections.length >= 2, true)
  assert.doesNotMatch(source, /obsoleteDynamicNodeKeys[\s\S]{0,240}?\.delete\(\)\.eq\('workflow_id'/)
})

test('selected-shot cinematic materialization preserves existing non-target dynamic outputs', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(source, /preserveExistingDynamicNodeOutput/)
  assert.match(source, /selectedShotMaterialization/)
  assert.match(source, /preservedDuringSelectedShotMaterialization/)
  assert.match(source, /outputWorkflowNodeSelect/)
  assert.match(source, /upsert\(nodeRows\.map\(preserveNodeRow\)/)
  assert.match(source, /selectedShotKeyframeNode/)
})

test('graph loader returns cache status diagnostics without bulk node outputs', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/get-output-workflow-graph/index.ts'), 'utf8')

  assert.match(source, /buildGraphNodesWithCacheStatus/)
  assert.match(source, /missingRequiredUpstreamKeys/)
  assert.match(source, /staleUpstreamKeys/)
  assert.match(source, /cacheStatus/)
  assert.match(source, /outputWorkflowNodeStatusSelect/)
  assert.doesNotMatch(source, /select\(outputWorkflowNodeSelect\)\.eq\('workflow_id', payload\.workflowId\)\.eq\('draft_id'/)
})

test('outputs graph UI defaults to repairable upstream runs when cache is not ready', () => {
  const overlaySource = readFileSync(resolve(repoRoot, 'src/features/outputs/OutputWorkflowGraphOverlay.tsx'), 'utf8')
  const workspaceSource = readFileSync(resolve(repoRoot, 'src/features/outputs/OutputsWorkspace.tsx'), 'utf8')

  assert.match(overlaySource, /Repair Cached Inputs/)
  assert.match(overlaySource, /Run cached node only/)
  assert.match(overlaySource, /selectedDirtyCachedInputs\.length > 0/)
  assert.match(workspaceSource, /buildTargetedRunCachePreflight/)
  assert.match(workspaceSource, /autoRepairUpstream/)
  assert.match(workspaceSource, /requestedRunScope/)
  assert.match(workspaceSource, /effectiveRunScope/)
})
