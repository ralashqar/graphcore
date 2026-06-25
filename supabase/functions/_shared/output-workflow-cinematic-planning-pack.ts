import {
  buildCinematicV2StoryboardGroupPlan,
  buildCinematicV3StoryboardGroupPlan,
  buildCinematicV3StoryboardLayout,
  cinematicV2SceneLayoutPlanSchema,
  cinematicV2SceneStateSchema,
  cinematicV2ShotPlanSchema,
  cinematicV2StoryboardGroupPlanSchema,
  deriveCinematicV2MaxShotCount,
} from '../../../src/domain/cinematics.ts'
import type { z } from 'zod'
import {
  createWorkflowNodeExtensionScaffold,
  workflowNodeManifestToContract,
  type WorkflowNodeExtensionScaffold,
  type WorkflowNodeRuntimeKind,
} from '../../../src/domain/outputWorkflowManifests.ts'
import { outputWorkflowNodeManifestsByPurpose } from '../../../src/domain/outputWorkflowNodeContracts.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'
import {
  buildCinematicV3ShotBreakPlan,
} from './output-workflow-sequence-animatic-planning-runtime.ts'

type LooseRecord = Record<string, unknown>

type CinematicPlanningNodeExecutionContext = {
  inputHash: string
  node: {
    key: string
    config: unknown
  }
  run: {
    prompt?: string | null
  }
  upstream: Record<string, LooseRecord>
}

type CinematicPlanningNodeExecutionResult = {
  inputHash: string
  outputHash: string
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string
}

type CinematicPlanningStructuredResult<TValue> = {
  value: TValue
  response: {
    ok?: boolean
    outputText?: string
    usage?: unknown
    id?: unknown
  }
  provider: string
  model: string
  providerRequestId?: string | null
  fallbackUsed: boolean
  fallbackReason: string
}

export type CinematicPlanningWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readStringArray: (value: unknown) => string[]
  readFirstUpstreamRecord: (upstream: Record<string, LooseRecord>, fields: string[]) => LooseRecord
  guidanceMarkdown: (bundle: LooseRecord) => string
  compactForPrompt: (value: unknown, maxLength?: number) => string
  hashOutputWorkflowValue: (value: unknown) => string
  buildFallbackCinematicV2SceneState: (input: {
    parsedScript: LooseRecord
    context: LooseRecord
  }) => z.infer<typeof cinematicV2SceneStateSchema>
  buildFallbackCinematicV2LayoutPlan: (input: {
    parsedScript: LooseRecord
    sceneState: LooseRecord
  }) => z.infer<typeof cinematicV2SceneLayoutPlanSchema>
  buildFallbackCinematicV2ShotPlan: (input: {
    parsedScript: LooseRecord
    sceneState: LooseRecord
    maxShotCount: number
  }) => z.infer<typeof cinematicV2ShotPlanSchema>
  runStructuredNode: <TValue>(input: {
    nodeKey: string
    schemaName: string
    schema: unknown
    instructions: string
    prompt: string
    fallback: TValue
    maxOutputTokens?: number
  }) => Promise<CinematicPlanningStructuredResult<TValue>>
  providerSafeCinematicV2DurationSeconds: (durationSeconds: unknown) => number
  validateCinematicV2ShotPlanReferences: (input: {
    shotPlan: z.infer<typeof cinematicV2ShotPlanSchema>
    referenceIds: Set<string>
  }) => string[]
  cinematicV2ReferenceIds: (assetPack: LooseRecord, context: LooseRecord) => Set<string>
}

function result(input: {
  context: CinematicPlanningNodeExecutionContext
  helpers: CinematicPlanningWorkflowNodePackHelpers
  outputs: LooseRecord
  model: string
}): CinematicPlanningNodeExecutionResult {
  return createWorkflowNodeExecutionResult<CinematicPlanningNodeExecutionResult>(input)
}

function worldContextFromUpstream(context: CinematicPlanningNodeExecutionContext, helpers: CinematicPlanningWorkflowNodePackHelpers) {
  return helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
}

function guidanceFromUpstream(context: CinematicPlanningNodeExecutionContext, helpers: CinematicPlanningWorkflowNodePackHelpers) {
  return helpers.asRecord(helpers.asRecord(context.upstream.guidance).guidance ?? context.upstream.guidance)
}

function providerResult(input: {
  context: CinematicPlanningNodeExecutionContext
  helpers: CinematicPlanningWorkflowNodePackHelpers
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string
}): CinematicPlanningNodeExecutionResult {
  return {
    ...createWorkflowNodeExecutionResult<CinematicPlanningNodeExecutionResult>({
      context: input.context,
      helpers: input.helpers,
      outputs: input.outputs,
      model: input.model,
    }),
    provider: input.provider,
    providerRequestId: input.providerRequestId,
  }
}

async function cinematicV2SceneCompileNode(
  context: CinematicPlanningNodeExecutionContext,
  helpers: CinematicPlanningWorkflowNodePackHelpers,
) {
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = guidanceFromUpstream(context, helpers)
  const parsedScript = helpers.readFirstUpstreamRecord(context.upstream, ['parsedScript', 'parsed_script'])
  const fallback = helpers.buildFallbackCinematicV2SceneState({ parsedScript, context: worldContext })
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft'])
  const structured = await helpers.runStructuredNode({
    nodeKey: context.node.key,
    schemaName: 'output_workflow_cinematic_v2_scene_compile',
    schema: cinematicV2SceneStateSchema,
    instructions: 'You are a cinematic scene compiler. Return strict JSON only. Instantiate existing world references into a scene state; do not redesign characters or locations.',
    prompt: [
      'Create a lightweight cinematic scene state from the parsed beats, world style, and canonical references.',
      'Derive character emotional baselines and performance continuity from the screenplay arc; do not reset character acting between shots.',
      'Specify lighting, atmosphere, mood, visual continuity, character scene states, and location state.',
      'Do not create new canon and do not redesign existing identities.',
      `User brief:\n${helpers.readText(context.run.prompt)}`,
      helpers.compactForPrompt({ screenplayDraft }, 4500),
      helpers.guidanceMarkdown(guidance),
      helpers.compactForPrompt({
        parsedScript,
        world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
        assetPack,
      }, 9000),
    ].filter(Boolean).join('\n\n'),
    fallback,
    maxOutputTokens: 3600,
  })
  const outputs = {
    sceneState: structured.value,
    scene_state: structured.value,
    text: JSON.stringify(structured.value, null, 2),
    guidance,
    usage: helpers.asRecord(structured.response).usage,
  }
  return providerResult({
    context,
    helpers,
    outputs,
    provider: structured.provider,
    model: structured.model,
    providerRequestId: structured.providerRequestId || helpers.readText(structured.response.id) || undefined,
  })
}

async function cinematicV2LayoutPlanNode(
  context: CinematicPlanningNodeExecutionContext,
  helpers: CinematicPlanningWorkflowNodePackHelpers,
) {
  const guidance = guidanceFromUpstream(context, helpers)
  const parsedScript = helpers.readFirstUpstreamRecord(context.upstream, ['parsedScript', 'parsed_script'])
  const sceneState = helpers.readFirstUpstreamRecord(context.upstream, ['sceneState', 'scene_state'])
  const fallback = helpers.buildFallbackCinematicV2LayoutPlan({ parsedScript, sceneState })
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft'])
  const structured = await helpers.runStructuredNode({
    nodeKey: context.node.key,
    schemaName: 'output_workflow_cinematic_v2_layout_plan',
    schema: cinematicV2SceneLayoutPlanSchema,
    instructions: 'You are a cinematic blocking and continuity planner. Return strict JSON only. Plan spatial continuity before storyboards or videos.',
    prompt: [
      'Plan scene geography, character positions, landmarks, camera positions, eyelines, lighting direction, and screen-direction rules.',
      'Keep it practical for short cinematic AI video shots. This is a JSON blocking plan, not final art.',
      'Do not use game or app language such as playable, level, sandbox, UI, or mechanics unless the user explicitly requested a game/app cinematic.',
      'Keep the camera plan compact and production-useful; prefer the fewest camera setups needed for the planned shots.',
      `User brief:\n${helpers.readText(context.run.prompt)}`,
      helpers.compactForPrompt({ screenplayDraft }, 4500),
      helpers.guidanceMarkdown(guidance),
      helpers.compactForPrompt({ parsedScript, sceneState, assetPack }, 9000),
    ].filter(Boolean).join('\n\n'),
    fallback,
    maxOutputTokens: 3600,
  })
  const outputs = {
    layoutPlan: structured.value,
    layout_plan: structured.value,
    text: JSON.stringify(structured.value, null, 2),
    guidance,
    usage: helpers.asRecord(structured.response).usage,
  }
  return providerResult({
    context,
    helpers,
    outputs,
    provider: structured.provider,
    model: structured.model,
    providerRequestId: structured.providerRequestId || helpers.readText(structured.response.id) || undefined,
  })
}

async function cinematicV2ShotPlanNode(
  context: CinematicPlanningNodeExecutionContext,
  helpers: CinematicPlanningWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const guidance = guidanceFromUpstream(context, helpers)
  const parsedScript = helpers.readFirstUpstreamRecord(context.upstream, ['parsedScript', 'parsed_script'])
  const sceneState = helpers.readFirstUpstreamRecord(context.upstream, ['sceneState', 'scene_state'])
  const layoutPlan = helpers.readFirstUpstreamRecord(context.upstream, ['layoutPlan', 'layout_plan'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft'])
  const parsedDuration = Number(helpers.asRecord(parsedScript).targetDurationSeconds ?? 0) || null
  const derivedMaxShotCount = deriveCinematicV2MaxShotCount(parsedDuration)
  const configuredMaxShotCount = Number(config.maxShotCount ?? 0) || 0
  const maxShotCount = Math.max(1, Math.min(36, configuredMaxShotCount > 0 && configuredMaxShotCount < 36 ? configuredMaxShotCount : derivedMaxShotCount))
  const fallback = helpers.buildFallbackCinematicV2ShotPlan({ parsedScript, sceneState, maxShotCount })
  let structured = await helpers.runStructuredNode({
    nodeKey: context.node.key,
    schemaName: 'output_workflow_cinematic_v2_shot_plan',
    schema: cinematicV2ShotPlanSchema,
    instructions: 'You are a cinematic shot planner. Return strict JSON only. Split scenes into short controllable shots for AI video generation.',
    prompt: [
      `Plan at most ${maxShotCount} shots. Each shot should have one purpose, one camera intent, explicit visible/speaker reference keys, and short editorial timing.`,
      'Dialogue closeups should be 2-4 editorial seconds. Reactions can be 1-2 seconds. Action/impact shots should be 1-3 seconds. Provider durations must be 4-15 seconds; final assembly trims to editorial timing.',
      'Use the authored screenplay as the creative source. Preserve its emotional progression and do not collapse the total runtime to 15 seconds unless explicitly requested; use more shots when the scene needs more time.',
      'For every visible character in a shot, fill performanceBeats with valence (-1 to 1), arousal/confidence/dominance (0 to 1), plus concrete body language, facial expression, gaze, gesture, and voice energy when relevant.',
      'Fill performanceArc at the shot-plan level so the timeline can show how each character changes across the scene.',
      'Fill visibleCharacterRefIds, speakerRefIds, locationRefId, and propRefIds only with keys from the supplied cinematic reference plan/asset pack. Do not invent refs and do not pull in unrelated sequence entities.',
      'Use layout rules for screen direction, eyelines, and lighting continuity. Mark requiresLipSync only for visible mouth dialogue; V2 MVP stores placeholder audio only.',
      `User brief:\n${helpers.readText(context.run.prompt)}`,
      helpers.compactForPrompt({ screenplayDraft }, 5000),
      helpers.guidanceMarkdown(guidance),
      helpers.compactForPrompt({ parsedScript, sceneState, layoutPlan, assetPack }, 10000),
    ].filter(Boolean).join('\n\n'),
    fallback,
    maxOutputTokens: 12000,
  })
  if (structured.fallbackUsed && structured.response.ok) {
    structured = await helpers.runStructuredNode({
      nodeKey: context.node.key,
      schemaName: 'output_workflow_cinematic_v2_shot_plan_repair',
      schema: cinematicV2ShotPlanSchema,
      instructions: 'Repair a Cinematics V2 shot plan into strict valid JSON only. Preserve the authored scene coverage and do not shorten the scene unless the user requested it.',
      prompt: [
        'The previous directed shot-plan response failed validation. Return a complete valid shot plan JSON matching the schema.',
        `Validation or parse failure:\n${structured.fallbackReason}`,
        `Maximum shots: ${maxShotCount}. Preferred total editorial duration: ${helpers.readText(helpers.asRecord(parsedScript).targetDurationSeconds) || 'story-driven'}.`,
        'Use the screenplay and parsed beats to cover the whole scene. Do not collapse the plan to one 3x3 storyboard sheet.',
        `Previous model output:\n${helpers.readText(structured.response.outputText).slice(0, 24000)}`,
        helpers.compactForPrompt({ screenplayDraft, parsedScript, sceneState, layoutPlan, assetPack }, 14000),
      ].filter(Boolean).join('\n\n'),
      fallback,
      maxOutputTokens: 12000,
    })
  }
  const normalizedShotPlan = cinematicV2ShotPlanSchema.parse({
    ...structured.value,
    shots: structured.value.shots.map((shot) => ({
      ...shot,
      providerDurationSeconds: helpers.providerSafeCinematicV2DurationSeconds(shot.editorialDurationSeconds),
    })),
  })
  const referenceDiagnostics = helpers.validateCinematicV2ShotPlanReferences({
    shotPlan: normalizedShotPlan,
    referenceIds: helpers.cinematicV2ReferenceIds(assetPack, {}),
  })
  const outputShotPlan = {
    ...normalizedShotPlan,
    diagnostics: [
      ...normalizedShotPlan.diagnostics,
      ...(structured.fallbackUsed ? [`Directed shot planner failed; fallback plan generated. ${structured.fallbackReason}`] : []),
      ...referenceDiagnostics,
    ],
  }
  const outputs = {
    shotPlan: outputShotPlan,
    shot_plan: outputShotPlan,
    shots: normalizedShotPlan.shots,
    text: JSON.stringify(outputShotPlan, null, 2),
    referenceDiagnostics,
    fallbackUsed: structured.fallbackUsed,
    fallbackReason: structured.fallbackReason,
    guidance,
    usage: helpers.asRecord(structured.response).usage,
  }
  return providerResult({
    context,
    helpers,
    outputs,
    provider: structured.provider,
    model: structured.model,
    providerRequestId: structured.providerRequestId || helpers.readText(structured.response.id) || undefined,
  })
}

async function cinematicV3ShotBreakPlanNode(
  context: CinematicPlanningNodeExecutionContext,
  helpers: CinematicPlanningWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft'])
  const suggestedDurationSeconds = Number(helpers.asRecord(screenplayDraft).suggestedDurationSeconds ?? 0) || null
  const configuredMaxShotCount = Number(config.maxShotCount ?? 0) || 0
  const shotBreakPlan = buildCinematicV3ShotBreakPlan({
    screenplayDraft,
    maxShotCount: configuredMaxShotCount > 0 ? configuredMaxShotCount : deriveCinematicV2MaxShotCount(suggestedDurationSeconds),
    maxPanelsPerSheet: Number(config.maxPanelsPerSheet ?? 9) || 9,
    maxDurationPerGroupSeconds: Number(config.maxDurationPerGroupSeconds ?? 15) || 15,
  })
  const outputs = {
    shotBreakPlan,
    shot_break_plan: shotBreakPlan,
    shotBreaks: shotBreakPlan.shotBreaks,
    shot_breaks: shotBreakPlan.shotBreaks,
    groups: shotBreakPlan.groups,
    text: JSON.stringify(shotBreakPlan, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-v3-shot-break-plan-v1' })
}

async function cinematicV3ShotPlanMergeNode(
  context: CinematicPlanningNodeExecutionContext,
  helpers: CinematicPlanningWorkflowNodePackHelpers,
) {
  const shotBreakPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotBreakPlan', 'shot_break_plan'])
  const groupPlans = Object.values(context.upstream)
    .map((outputs) => helpers.asRecord(outputs.shotPlan ?? outputs.shot_plan))
    .filter((plan) => Array.isArray(plan.shots))
  const breakGroups = Array.isArray(shotBreakPlan.groups) ? shotBreakPlan.groups.map(helpers.asRecord) : []
  const diagnostics = [
    ...helpers.readStringArray(shotBreakPlan.diagnostics),
    `Merged ${groupPlans.length} storyboard parse group${groupPlans.length === 1 ? '' : 's'}.`,
  ]
  const shots = groupPlans
    .flatMap((plan) => Array.isArray(plan.shots) ? plan.shots.map(helpers.asRecord) : [])
    .map((shot, index) => ({
      ...shot,
      id: helpers.readText(shot.id) || `shot_${String(index + 1).padStart(3, '0')}`,
      index: index + 1,
      editorialDurationSeconds: Math.max(0.5, Math.min(8, Number(shot.editorialDurationSeconds ?? 0) || 3)),
      providerDurationSeconds: helpers.providerSafeCinematicV2DurationSeconds(Number(shot.editorialDurationSeconds ?? 0) || 3),
    }))
  if (shots.length === 0) throw new Error('No parsed Cinematics V3 shot groups were available to merge.')
  const duplicateIds = shots
    .map((shot) => helpers.readText(shot.id))
    .filter((id, index, list) => id && list.indexOf(id) !== index)
  const finalShots = duplicateIds.length > 0
    ? shots.map((shot, index) => ({ ...shot, id: `shot_${String(index + 1).padStart(3, '0')}` }))
    : shots
  if (duplicateIds.length > 0) diagnostics.push(`Renumbered duplicate shot IDs: ${[...new Set(duplicateIds)].join(', ')}.`)
  const audioPlanSource = groupPlans.map((plan) => helpers.asRecord(plan.audioPlan)).find((plan) => Object.keys(plan).length > 0) ?? {}
  const performanceArc = groupPlans.flatMap((plan) => Array.isArray(plan.performanceArc) ? plan.performanceArc.map(helpers.asRecord) : [])
  const shotPlan = cinematicV2ShotPlanSchema.parse({
    sceneId: 'scene_1',
    totalEditorialDurationSeconds: finalShots.reduce((total, shot) => total + Number(shot.editorialDurationSeconds ?? 0), 0),
    shots: finalShots,
    performanceArc,
    audioPlan: {
      ambience: helpers.readText(audioPlanSource.ambience),
      music: helpers.readText(audioPlanSource.music),
      sfx: Array.isArray(audioPlanSource.sfx) ? audioPlanSource.sfx : [],
      dialogueTrackCount: finalShots.reduce((total, shot) => {
        const dialogue = helpers.asRecord(shot).dialogue
        return total + (Array.isArray(dialogue) && dialogue.length > 0 ? 1 : 0)
      }, 0),
      placeholderOnly: true,
    },
    diagnostics,
  })
  const preferredStoryboardGroupPlan = cinematicV2StoryboardGroupPlanSchema.safeParse({
    groups: breakGroups.map((group, index) => {
      const shotIds = helpers.readStringArray(group.shotBreakIds).filter((id) => shotPlan.shots.some((shot) => shot.id === id))
      const groupShots = shotIds.length > 0 ? shotPlan.shots.filter((shot) => shotIds.includes(shot.id)) : []
      const layout = buildCinematicV3StoryboardLayout(Math.max(1, groupShots.length || Number(group.panelCount ?? 1) || 1))
      const duration = groupShots.reduce((total, shot) => total + shot.editorialDurationSeconds, 0) || Number(group.approximateDurationSeconds ?? 0) || 3
      const startSeconds = shotPlan.shots
        .slice(0, Math.max(0, shotPlan.shots.findIndex((shot) => shot.id === groupShots[0]?.id)))
        .reduce((total, shot) => total + shot.editorialDurationSeconds, 0)
      return {
        id: helpers.readText(group.id) || `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`,
        index: index + 1,
        shotIds: groupShots.length > 0 ? groupShots.map((shot) => shot.id) : shotPlan.shots.slice(index, index + 1).map((shot) => shot.id),
        summary: helpers.readText(group.summary) || groupShots.map((shot) => shot.title).join(' / '),
        rows: layout.rows,
        columns: layout.columns,
        panelCount: layout.panelCount,
        startSeconds,
        endSeconds: startSeconds + duration,
        editorialDurationSeconds: duration,
        providerDurationSeconds: helpers.providerSafeCinematicV2DurationSeconds(duration),
        continuityNotes: [`Parse group ${index + 1} from screenplay shot markers.`],
      }
    }).filter((group) => group.shotIds.length > 0),
    maxPanelsPerSheet: Math.max(1, Math.min(9, Number(shotBreakPlan.maxPanelsPerSheet ?? 9) || 9)),
    maxDurationPerGroupSeconds: Math.max(1, Math.min(15, Number(shotBreakPlan.maxDurationPerGroupSeconds ?? 15) || 15)),
    diagnostics: ['Storyboard groups preserved from screenplay shot-marker parse groups.'],
  }).data ?? buildCinematicV3StoryboardGroupPlan(shotPlan, {
    maxPanelsPerSheet: Number(shotBreakPlan.maxPanelsPerSheet ?? 9) || 9,
    maxDurationPerGroupSeconds: Number(shotBreakPlan.maxDurationPerGroupSeconds ?? 15) || 15,
  })
  const outputs = {
    shotPlan,
    shot_plan: shotPlan,
    shots: shotPlan.shots,
    preferredStoryboardGroupPlan,
    preferred_storyboard_group_plan: preferredStoryboardGroupPlan,
    text: JSON.stringify(shotPlan, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-cinematic-v3-shot-plan-merge-v1' })
}

async function cinematicStoryboardGroupPlanNode(
  context: CinematicPlanningNodeExecutionContext,
  helpers: CinematicPlanningWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const purpose = helpers.readText(config.purpose)
  const shotPlan = cinematicV2ShotPlanSchema.parse(helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan']))
  const maxPanelsPerSheet = Math.max(1, Math.min(9, Number(config.maxPanelsPerSheet ?? 9) || 9))
  const maxDurationPerGroupSeconds = Math.max(1, Math.min(15, Number(config.maxDurationPerGroupSeconds ?? 15) || 15))
  const preferredStoryboardGroupPlan = cinematicV2StoryboardGroupPlanSchema.safeParse(helpers.readFirstUpstreamRecord(context.upstream, ['preferredStoryboardGroupPlan', 'preferred_storyboard_group_plan']))
  const storyboardGroupPlan = purpose === 'cinematic_v3_storyboard_group_plan' && preferredStoryboardGroupPlan.success
    ? preferredStoryboardGroupPlan.data
    : purpose === 'cinematic_v3_storyboard_group_plan'
    ? buildCinematicV3StoryboardGroupPlan(shotPlan, {
      maxPanelsPerSheet,
      maxDurationPerGroupSeconds,
    })
    : buildCinematicV2StoryboardGroupPlan(shotPlan, maxPanelsPerSheet)
  const outputs = {
    storyboardGroupPlan,
    storyboard_group_plan: storyboardGroupPlan,
    groups: storyboardGroupPlan.groups,
    maxPanelsPerSheet: storyboardGroupPlan.maxPanelsPerSheet,
    maxDurationPerGroupSeconds: storyboardGroupPlan.maxDurationPerGroupSeconds,
    text: JSON.stringify(storyboardGroupPlan, null, 2),
    deterministic: true,
  }
  return result({
    context,
    helpers,
    outputs,
    model: purpose === 'cinematic_v3_storyboard_group_plan'
      ? 'deterministic-cinematic-v3-storyboard-group-plan-v2'
      : 'deterministic-cinematic-v2-storyboard-group-plan-v1',
  })
}

const cinematicPlanningHandlers = {
  cinematic_v2_scene_compile: cinematicV2SceneCompileNode,
  cinematic_v2_layout_plan: cinematicV2LayoutPlanNode,
  cinematic_v2_shot_plan: cinematicV2ShotPlanNode,
  cinematic_v3_shot_break_plan: cinematicV3ShotBreakPlanNode,
  cinematic_v3_shot_plan_merge: cinematicV3ShotPlanMergeNode,
  cinematic_v2_storyboard_group_plan: cinematicStoryboardGroupPlanNode,
  cinematic_v3_storyboard_group_plan: cinematicStoryboardGroupPlanNode,
}

const cinematicPlanningWorkflowNodePackKey = 'output_workflow_cinematic_planning'

export const cinematicPlanningWorkflowNodePack = defineWorkflowNodePack<
  CinematicPlanningNodeExecutionContext,
  CinematicPlanningNodeExecutionResult,
  CinematicPlanningWorkflowNodePackHelpers,
  typeof cinematicPlanningHandlers
>({
  packKey: cinematicPlanningWorkflowNodePackKey,
  handlers: cinematicPlanningHandlers,
})

export const cinematicPlanningWorkflowNodeHandlerKeys = cinematicPlanningWorkflowNodePack.handlerKeys

function createCinematicPlanningNodeScaffold(input: {
  purpose: keyof typeof cinematicPlanningHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Cinematic planning workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: cinematicPlanningWorkflowNodePackKey,
    runtimeKind: input.runtimeKind,
    sourceHashKeys: input.sourceHashKeys,
    projectionMetadataKeys: input.projectionMetadataKeys,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    configSchema: manifest.configSchema,
    executable: manifest.executable,
    executionPolicy: manifest.executionPolicy,
    retryPolicy: manifest.retryPolicy,
    cachePolicy: {
      ...manifest.cachePolicy,
      sourceHashKeys: manifest.cachePolicy.sourceHashKeys.length > 0
        ? manifest.cachePolicy.sourceHashKeys
        : input.sourceHashKeys,
    },
    cancellationPolicy: manifest.cancellationPolicy,
    streamingPolicy: manifest.streamingPolicy,
  })
}

export const cinematicPlanningWorkflowNodeScaffolds = [
  createCinematicPlanningNodeScaffold({
    purpose: 'cinematic_v2_scene_compile',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.parsedScript', 'upstream.assetPack', 'upstream.screenplayDraft', 'upstream.guidance', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'recoveryHints'],
  }),
  createCinematicPlanningNodeScaffold({
    purpose: 'cinematic_v2_layout_plan',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.parsedScript', 'upstream.sceneState', 'upstream.assetPack', 'upstream.screenplayDraft', 'upstream.guidance', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'recoveryHints'],
  }),
  createCinematicPlanningNodeScaffold({
    purpose: 'cinematic_v2_shot_plan',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.parsedScript', 'upstream.sceneState', 'upstream.layoutPlan', 'upstream.assetPack', 'upstream.screenplayDraft', 'upstream.guidance', 'config.maxShotCount', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'recoveryHints'],
  }),
  createCinematicPlanningNodeScaffold({
    purpose: 'cinematic_v3_shot_break_plan',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.screenplayDraft', 'config.maxShotCount', 'config.maxPanelsPerSheet', 'config.maxDurationPerGroupSeconds'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'recoveryHints'],
  }),
  createCinematicPlanningNodeScaffold({
    purpose: 'cinematic_v3_shot_plan_merge',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.shotBreakPlan', 'upstream.shotPlan'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'recoveryHints'],
  }),
  createCinematicPlanningNodeScaffold({
    purpose: 'cinematic_v2_storyboard_group_plan',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.shotPlan', 'config.maxPanelsPerSheet'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'recoveryHints'],
  }),
  createCinematicPlanningNodeScaffold({
    purpose: 'cinematic_v3_storyboard_group_plan',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.shotPlan', 'upstream.preferredStoryboardGroupPlan', 'config.maxPanelsPerSheet', 'config.maxDurationPerGroupSeconds'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'recoveryHints'],
  }),
] as const

export const cinematicPlanningWorkflowNodeScaffoldHandlerKeys = cinematicPlanningWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerCinematicPlanningWorkflowNodePack(input: {
  helpers: CinematicPlanningWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: CinematicPlanningNodeExecutionContext) => Promise<CinematicPlanningNodeExecutionResult>) => void
}) {
  cinematicPlanningWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
