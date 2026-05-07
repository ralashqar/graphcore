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
  outputRequestDeleteResponseSchema,
  outputRequestStartRequestSchema,
  outputWorkflowNodeRegistry,
  outputWorkflowPlanRequestSchema,
  planOutputPrompt,
  planOutputRequestWorkflow,
  planOutputWorkflow,
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

test('cinematic output preset creates script-first dynamic take fanout placeholder', () => {
  const plan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1 with a shot-by-shot storyboard.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    videoBlockCount: 3,
    durationPerBlockSeconds: 8,
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
  assert.equal(fanout?.config.videoModel, 'bytedance/seedance-2.0/fast/reference-to-video')
  assert.equal(fanout?.config.cinematicReferenceMode, 'storyboard_sheet')
  assert.equal(fanout?.config.debugSkipVideoGeneration, true)
  assert.ok(plan.diagnostics.some((line) => line.includes('Storyboard-grid reference mode')))
  const skillContext = plan.nodes.find((node) => node.key === 'skill_context')
  assert.ok(Array.isArray(skillContext?.config.skillKeys))
  assert.ok((skillContext?.config.skillKeys as string[]).includes('cinematic_beat_sheet_planning'))
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
    snapshot,
  }, 'cinematic_episode')
  const costEnabledFanout = costEnabledPlan.nodes.find((node) => node.key === 'cinematic_dynamic_take_fanout')
  assert.equal(costEnabledFanout?.config.debugSkipVideoGeneration, false)

  const keyframeModePlan = planOutputRequestWorkflow({
    projectId: 'project-1',
    draftId: 'draft-1',
    prompt: 'Create a cinematic sequence from Chapter 1.',
    targetFormat: 'video',
    selectedSequenceUnitKeys: ['chapter-1'],
    cinematicReferenceMode: 'keyframes',
    snapshot,
  }, 'cinematic_episode')
  const keyframeModeFanout = keyframeModePlan.nodes.find((node) => node.key === 'cinematic_dynamic_take_fanout')
  assert.equal(keyframeModeFanout?.config.cinematicReferenceMode, 'keyframes')
  assert.ok(keyframeModePlan.diagnostics.some((line) => line.includes('Keyframe reference mode')))
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
  assert.equal(readConfigQuality(comicPlan.nodes.find((node) => node.key === 'comic_atlas_image') ?? {}), 'medium')
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
  assert.equal(readConfigOutputFormat(comicPlan.nodes.find((node) => node.key === 'comic_atlas_image') ?? {}), 'webp')
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
  assert.equal(chapterNode ? getOutputWorkflowNodeExecutionMetadata(chapterNode).maxConcurrency : undefined, 8)
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
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'comic_scene_script' && edge.targetNodeKey === 'comic_page_plan'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'comic_page_plan' && edge.targetNodeKey === 'comic_script'))
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'comic_page_prompt').length, 4)
  assert.equal(plan.nodes.filter((node) => readConfigPurpose(node) === 'comic_page').length, 4)
  assert.equal(plan.nodes.find((node) => node.key === 'page_001_prompt')?.nodeType, 'utility_transform')
  assert.ok(plan.nodes.some((node) => node.key === 'relevant_entities' && readConfigPurpose(node) === 'comic_entity_selector'))
  assert.ok(plan.nodes.some((node) => node.key === 'comic_atlas_image' && node.nodeType === 'image_generation'))
  assert.ok(plan.nodes.some((node) => node.key === 'comic_pdf_render' && node.nodeType === 'document_render'))
  const pageImage = plan.nodes.find((node) => node.key === 'page_001_image')
  const pageImageSize = pageImage?.config.imageSize as { width?: number; height?: number } | undefined
  assert.equal((pageImageSize?.width ?? 0) % 16, 0)
  assert.equal((pageImageSize?.height ?? 0) % 16, 0)
  assert.equal(pageImage ? getOutputWorkflowNodeExecutionMetadata(pageImage).maxConcurrency : undefined, 8)
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'comic_atlas_image' && edge.targetNodeKey === 'page_001_image' && edge.targetPort === 'references'))
  assert.ok(plan.edges.some((edge) => edge.sourceNodeKey === 'page_004_image' && edge.targetNodeKey === 'comic_pdf_render' && edge.targetPort === 'pages'))
  assert.equal(validateOutputWorkflowGraph({ nodes: plan.nodes, edges: plan.edges }).ok, true)
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
    'comic_atlas_image',
    'comic_script',
    'page_001_image',
    'page_002_image',
    'page_003_image',
  ])
  assert.deepEqual(executionPlan.dependencyKeysByNodeKey.page_001_image.sort(), [
    'comic_atlas_image',
    'page_001_prompt',
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
