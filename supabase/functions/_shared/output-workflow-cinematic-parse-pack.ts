import {
  cinematicV2ParsedScriptSchema,
  cinematicV2ShotPlanSchema,
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

type LooseRecord = Record<string, unknown>

type CinematicParseNodeExecutionContext = {
  inputHash: string
  node: {
    key: string
    config: unknown
  }
  run: {
    prompt?: string | null
  }
  upstream: Record<string, LooseRecord>
  priorStep?: {
    providerRequestId?: string | null
    metadata?: unknown
  } | null
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    providerRequestId: string
    providerStatus: string
    providerMode: string
    lastProviderPollAt: string
    providerStartedAt: string
  }) => Promise<void>
}

type CinematicParseNodeExecutionResult = {
  inputHash: string
  outputHash: string
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string
}

type CinematicParseStructuredResult<TValue> = {
  value: TValue
  response: unknown
  provider: string
  model: string
  providerRequestId?: string | null
  fallbackUsed: boolean
  fallbackReason: string
}

export type CinematicParseWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readFirstUpstreamRecord: (upstream: Record<string, LooseRecord>, fields: string[]) => LooseRecord
  guidanceMarkdown: (bundle: LooseRecord) => string
  compactForPrompt: (value: unknown, maxLength?: number) => string
  hashOutputWorkflowValue: (value: unknown) => string
  buildFallbackCinematicV2ParsedScript: (input: {
    context: LooseRecord
    assetPack: LooseRecord
    prompt: string
    screenplayDraft: LooseRecord
  }) => z.infer<typeof cinematicV2ParsedScriptSchema>
  buildFallbackCinematicV2SceneState: (input: {
    parsedScript: LooseRecord
    context: LooseRecord
  }) => LooseRecord
  buildFallbackCinematicV2ShotPlan: (input: {
    parsedScript: LooseRecord
    sceneState: LooseRecord
    maxShotCount: number
  }) => z.infer<typeof cinematicV2ShotPlanSchema>
  buildCinematicV3ShotPlanFromVisualScript: (input: {
    screenplayDraft: LooseRecord
    assetPack: LooseRecord
    context: LooseRecord
    prompt: string
    maxShotCount: number
  }) => {
    shotPlan: z.infer<typeof cinematicV2ShotPlanSchema>
    shotBlocks: Array<LooseRecord>
    unknownRefNames: string[]
  } | null
  deriveCinematicV2MaxShotCount: (durationSeconds: unknown) => number
  runCinematicV3ShotParseGroup: (input: {
    nodeKey: string
    schemaName: string
    instructions: string
    prompt: string
    fallback: z.infer<typeof cinematicV2ShotPlanSchema>
    maxOutputTokens?: number
    priorProviderRequestId?: string | null
    shouldCancel?: () => Promise<boolean>
    onProgress?: CinematicParseNodeExecutionContext['onProgress']
  }) => Promise<CinematicParseStructuredResult<z.infer<typeof cinematicV2ShotPlanSchema>>>
  runCinematicV2ScriptParse: (input: {
    nodeKey: string
    schemaName: string
    instructions: string
    prompt: string
    fallback: z.infer<typeof cinematicV2ParsedScriptSchema>
    maxOutputTokens?: number
  }) => Promise<CinematicParseStructuredResult<z.infer<typeof cinematicV2ParsedScriptSchema>>>
  providerSafeCinematicV2DurationSeconds: (durationSeconds: unknown) => number
  repairCinematicV2ShotPlanVisualReferences: (input: {
    shotPlan: z.infer<typeof cinematicV2ShotPlanSchema>
    assetPack: LooseRecord
  }) => z.infer<typeof cinematicV2ShotPlanSchema>
  validateCinematicV2ShotPlanReferences: (input: {
    shotPlan: z.infer<typeof cinematicV2ShotPlanSchema>
    referenceIds: Set<string>
  }) => string[]
  cinematicV2ReferenceIds: (assetPack: LooseRecord, context: LooseRecord) => Set<string>
}

function result(input: {
  context: CinematicParseNodeExecutionContext
  helpers: CinematicParseWorkflowNodePackHelpers
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string
}): CinematicParseNodeExecutionResult {
  return {
    ...createWorkflowNodeExecutionResult<CinematicParseNodeExecutionResult>({
      context: input.context,
      helpers: input.helpers,
      outputs: input.outputs,
      model: input.model,
    }),
    provider: input.provider,
    providerRequestId: input.providerRequestId,
  }
}

async function cinematicV2ScriptParseNode(
  context: CinematicParseNodeExecutionContext,
  helpers: CinematicParseWorkflowNodePackHelpers,
) {
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft'])
  const worldContext = helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
  const guidance = helpers.asRecord(helpers.asRecord(context.upstream.guidance).guidance ?? context.upstream.guidance)
  const promptText = helpers.readText(context.run.prompt)
  const fallback = helpers.buildFallbackCinematicV2ParsedScript({
    context: worldContext,
    assetPack,
    prompt: promptText,
    screenplayDraft,
  })
  const structured = await helpers.runCinematicV2ScriptParse({
    nodeKey: context.node.key,
    schemaName: 'output_workflow_cinematic_v2_script_parse',
    instructions: 'You are a cinematic script parser. Return strict JSON only. Resolve references to existing world asset keys when supplied; do not invent new entity keys.',
    prompt: [
      'Parse the authored screenplay/treatment into cinematic beats for a shot-orchestrated production graph. The screenplay is the story spine; the raw user brief is only supporting context.',
      'Identify characters, location, props, dialogue, actions, emotional turns, and story-driven target duration.',
      'Do not target a fixed 15-second total runtime. The total animatic may exceed 15 seconds by using multiple short shots; 15 seconds is only a provider-safe ceiling for one generated clip.',
      'Use only canonical reference keys from the supplied asset pack/context. If a subject is implied but not bound, leave it as prose in the beat text rather than inventing a key.',
      `User brief:\n${promptText}`,
      helpers.compactForPrompt({ screenplayDraft }, 6000),
      helpers.guidanceMarkdown(guidance),
      helpers.compactForPrompt({
        world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
        assetPack,
        entities: Array.isArray(worldContext.entities) ? worldContext.entities.map(helpers.asRecord).slice(0, 30) : [],
      }, 9000),
    ].filter(Boolean).join('\n\n'),
    fallback,
    maxOutputTokens: 3600,
  })
  const outputs = {
    parsedScript: structured.value,
    parsed_script: structured.value,
    text: JSON.stringify(structured.value, null, 2),
    guidance,
    usage: helpers.asRecord(structured.response).usage,
  }
  return result({
    context,
    helpers,
    outputs,
    provider: structured.provider,
    model: structured.model,
    providerRequestId: structured.providerRequestId || helpers.readText(helpers.asRecord(structured.response).id) || undefined,
  })
}

async function cinematicV3ShotParseGroupNode(
  context: CinematicParseNodeExecutionContext,
  helpers: CinematicParseWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const group = helpers.asRecord(config.storyboardGroup)
  const groupIndex = Number(group.index ?? 0) || 1
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft'])
  const shotBreakPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotBreakPlan', 'shot_break_plan'])
  const worldContext = helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
  const guidance = helpers.asRecord(helpers.asRecord(context.upstream.guidance).guidance ?? context.upstream.guidance)
  const groupBreaks = (Array.isArray(group.shotBreaks) ? group.shotBreaks.map(helpers.asRecord) : [])
  const groupExcerpt = helpers.readText(group.screenplayExcerpt) || groupBreaks.map((entry) => helpers.readText(entry.text)).filter(Boolean).join('\n\n')
  const promptText = helpers.readText(context.run.prompt)
  const parsedScript = helpers.buildFallbackCinematicV2ParsedScript({ context: worldContext, assetPack, prompt: promptText, screenplayDraft })
  const sceneState = helpers.buildFallbackCinematicV2SceneState({ parsedScript, context: worldContext })
  const maxShotCount = Math.max(1, Math.min(9, groupBreaks.length || Number(config.maxShotCount ?? 0) || 6))
  const fallback = helpers.buildFallbackCinematicV2ShotPlan({ parsedScript, sceneState, maxShotCount })
  const expectedShotIds = groupBreaks.map((entry, index) => helpers.readText(entry.id) || `shot_${String(index + 1).padStart(3, '0')}`)
  const structured = await helpers.runCinematicV3ShotParseGroup({
    nodeKey: context.node.key,
    schemaName: 'output_workflow_cinematic_v3_shot_parse_group',
    instructions: 'You are a cinematic shot parser. Return strict JSON only. Parse one screenplay segment into timed storyboard/video shots using only supplied reference keys.',
    prompt: [
      `Parse only storyboard/video block ${groupIndex} into at most ${maxShotCount} cinematic shots.`,
      'The screenplay excerpt is the authority for this block. Preserve its creative beats, dialogue, emotional turn, and shot markers.',
      'Each output shot must be a concrete storyboard panel and future short video beat: timing, visible action, dialogue/caption meaning, camera, lighting, mood, acting direction, and reference IDs.',
      'Fill caption as semantic beat meaning only; it must not become visible text in generated images.',
      'Fill storyboardPanelPrompt with a concise visual panel instruction. Fill videoDirection with concise movement/action continuity for the future storyboard-group video.',
      'Use only canonical reference keys from the supplied asset pack/context. If a subject is implied but not bound, leave it in prose rather than inventing a key.',
      'For spatial continuity, every shot must include worldLocationRefId, continuitySetId, continuityZoneId, continuitySpotIds, continuityAngleId, and spatialContinuity. Use provisional stable IDs such as set_whistlewick_primary, zone_service_lane, spot_leak_pipe, and angle_service_lane_ots. These are output-local continuity IDs, not world entity keys.',
      'spatialContinuity must describe cameraPosition, facingDirection, subjectPosition, visibleLandmarks, entryPath, exitPath, and lightSourceDirection when inferable.',
      'For dialogue, preserve the exact script speaker label in dialogue[].speakerName. Set dialogue[].speakerRefId only when the speaker is confidently one of the supplied canonical reference keys; for minor or temporary speakers such as a shopkeeper, guard, mechanic, crowd voice, or passerby, use a stable temporary speakerRefId like temporary_vole_mechanic and keep speakerRefIds limited to canonical reference keys only.',
      'Provider durations must be 4-15 seconds; editorial durations should reflect actual timeline timing.',
      expectedShotIds.length > 0 ? `Preferred shot IDs in order: ${expectedShotIds.join(', ')}` : '',
      `User brief:\n${promptText}`,
      `Screenplay excerpt for this block:\n${groupExcerpt}`,
      helpers.compactForPrompt({ shotBreakPlan: { groups: [group], diagnostics: helpers.asRecord(shotBreakPlan).diagnostics ?? [] } }, 5000),
      helpers.guidanceMarkdown(guidance),
      helpers.compactForPrompt({
        world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
        assetPack,
        entities: Array.isArray(worldContext.entities) ? worldContext.entities.map(helpers.asRecord).slice(0, 30) : [],
      }, 9000),
    ].filter(Boolean).join('\n\n'),
    fallback,
    maxOutputTokens: 9000,
    priorProviderRequestId: helpers.readText(context.priorStep?.providerRequestId) || helpers.readText(helpers.asRecord(context.priorStep?.metadata).providerRequestId),
    shouldCancel: context.shouldCancel,
    onProgress: context.onProgress,
  })
  const parsedShotPlan = cinematicV2ShotPlanSchema.parse({
    ...structured.value,
    shots: structured.value.shots.slice(0, maxShotCount).map((shot, index) => ({
      ...shot,
      id: expectedShotIds[index] || helpers.readText(shot.id) || `shot_${String(index + 1).padStart(3, '0')}`,
      index: index + 1,
      providerDurationSeconds: helpers.providerSafeCinematicV2DurationSeconds(shot.editorialDurationSeconds),
    })),
  })
  const normalizedShotPlan = helpers.repairCinematicV2ShotPlanVisualReferences({
    shotPlan: parsedShotPlan,
    assetPack,
  })
  const referenceDiagnostics = helpers.validateCinematicV2ShotPlanReferences({
    shotPlan: normalizedShotPlan,
    referenceIds: helpers.cinematicV2ReferenceIds(assetPack, {}),
  })
  const outputShotPlan = {
    ...normalizedShotPlan,
    diagnostics: [
      ...normalizedShotPlan.diagnostics,
      `parsed_storyboard_group_${String(groupIndex).padStart(3, '0')}`,
      ...(structured.fallbackUsed ? [`V3 group shot parser fallback used. ${structured.fallbackReason}`] : []),
      ...referenceDiagnostics,
    ],
  }
  const outputs = {
    shotPlan: outputShotPlan,
    shot_plan: outputShotPlan,
    shots: outputShotPlan.shots,
    storyboardGroup: group,
    storyboard_group: group,
    storyboardGroupId: helpers.readText(group.id),
    text: JSON.stringify(outputShotPlan, null, 2),
    referenceDiagnostics,
    fallbackUsed: structured.fallbackUsed,
    fallbackReason: structured.fallbackReason,
    guidance,
    usage: helpers.asRecord(structured.response).usage,
  }
  return result({
    context,
    helpers,
    outputs,
    provider: structured.provider,
    model: structured.model,
    providerRequestId: structured.providerRequestId || helpers.readText(helpers.asRecord(structured.response).id) || undefined,
  })
}

async function cinematicV3ShotParseNode(
  context: CinematicParseNodeExecutionContext,
  helpers: CinematicParseWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft'])
  const worldContext = helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
  const guidance = helpers.asRecord(helpers.asRecord(context.upstream.guidance).guidance ?? context.upstream.guidance)
  const promptText = helpers.readText(context.run.prompt)
  const parsedScript = helpers.buildFallbackCinematicV2ParsedScript({
    context: worldContext,
    assetPack,
    prompt: promptText,
    screenplayDraft,
  })
  const sceneState = helpers.buildFallbackCinematicV2SceneState({ parsedScript, context: worldContext })
  const configuredMaxShotCount = Number(config.maxShotCount ?? 0) || 0
  const suggestedDurationSeconds = Number(helpers.asRecord(screenplayDraft).suggestedDurationSeconds ?? 0) || null
  const maxShotCount = Math.max(1, Math.min(
    36,
    configuredMaxShotCount > 0
      ? configuredMaxShotCount
      : helpers.deriveCinematicV2MaxShotCount(suggestedDurationSeconds),
  ))
  const fallback = helpers.buildFallbackCinematicV2ShotPlan({ parsedScript, sceneState, maxShotCount })
  const deterministicVisualScript = helpers.buildCinematicV3ShotPlanFromVisualScript({
    screenplayDraft,
    assetPack,
    context: worldContext,
    prompt: promptText,
    maxShotCount,
  })
  let structured: CinematicParseStructuredResult<z.infer<typeof cinematicV2ShotPlanSchema>> & {
    shotBlocks?: Array<LooseRecord>
    unknownRefNames?: string[]
  }
  if (deterministicVisualScript) {
    structured = {
      value: deterministicVisualScript.shotPlan,
      response: { usage: {}, id: null },
      provider: 'graphcore',
      model: 'deterministic-visual-shot-script-v1',
      providerRequestId: null,
      fallbackUsed: false,
      fallbackReason: '',
      shotBlocks: deterministicVisualScript.shotBlocks,
      unknownRefNames: deterministicVisualScript.unknownRefNames,
    }
  } else {
    const repair = await helpers.runCinematicV3ShotParseGroup({
      nodeKey: context.node.key,
      schemaName: 'output_workflow_cinematic_v3_shot_parse_repair',
      instructions: 'Repair or parse a Cinematics V3 visual script into strict valid JSON only. Preserve screenplay coverage, use only supplied reference keys, and keep shots storyboard/video ready.',
      prompt: [
        'The authored script did not match the visual_shot_script_v1 deterministic contract. Return a complete valid shot plan JSON matching the schema.',
        `Maximum shots: ${maxShotCount}.`,
        'Do not invent entity/location/prop keys. Unknown subjects must remain in prose fields.',
        'Fill caption as semantic beat meaning only; it must not become visible text in generated images.',
        'Fill storyboardPanelPrompt and videoDirection for every shot.',
        'Every shot must include provisional spatial continuity fields: worldLocationRefId, continuitySetId, continuityZoneId, continuitySpotIds, continuityAngleId, and spatialContinuity with cameraPosition, facingDirection, subjectPosition, visibleLandmarks, entryPath, exitPath, and lightSourceDirection.',
        `User brief:\n${promptText}`,
        helpers.compactForPrompt({ screenplayDraft }, 12000),
        helpers.guidanceMarkdown(guidance),
        helpers.compactForPrompt({ world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki), assetPack, fallback }, 12000),
      ].filter(Boolean).join('\n\n'),
      fallback,
      maxOutputTokens: 12000,
      priorProviderRequestId: helpers.readText(context.priorStep?.providerRequestId) || helpers.readText(helpers.asRecord(context.priorStep?.metadata).providerRequestId),
      shouldCancel: context.shouldCancel,
      onProgress: context.onProgress,
    })
    structured = {
      ...repair,
      fallbackUsed: repair.fallbackUsed || repair.provider === 'graphcore',
      fallbackReason: repair.fallbackReason || 'llm_repair_used',
    }
  }
  const parsedShotPlan = cinematicV2ShotPlanSchema.parse({
    ...structured.value,
    shots: structured.value.shots.map((shot) => ({
      ...shot,
      providerDurationSeconds: helpers.providerSafeCinematicV2DurationSeconds(shot.editorialDurationSeconds),
    })),
  })
  const normalizedShotPlan = helpers.repairCinematicV2ShotPlanVisualReferences({
    shotPlan: parsedShotPlan,
    assetPack,
  })
  const referenceDiagnostics = helpers.validateCinematicV2ShotPlanReferences({
    shotPlan: normalizedShotPlan,
    referenceIds: helpers.cinematicV2ReferenceIds(assetPack, {}),
  })
  const outputShotPlan = {
    ...normalizedShotPlan,
    diagnostics: [
      ...normalizedShotPlan.diagnostics,
      ...(deterministicVisualScript ? ['deterministic_visual_script_parse'] : ['llm_repair_used']),
      ...(structured.fallbackUsed ? [`V3 shot parser fallback used. ${structured.fallbackReason}`] : []),
      ...referenceDiagnostics,
    ],
  }
  const outputs = {
    shotPlan: outputShotPlan,
    shot_plan: outputShotPlan,
    shots: outputShotPlan.shots,
    parsedShotBlocks: structured.shotBlocks ?? [],
    parsed_shot_blocks: structured.shotBlocks ?? [],
    unknownRefNames: structured.unknownRefNames ?? [],
    text: JSON.stringify(outputShotPlan, null, 2),
    referenceDiagnostics,
    fallbackUsed: structured.fallbackUsed,
    fallbackReason: structured.fallbackReason,
    guidance,
    usage: helpers.asRecord(structured.response).usage,
  }
  return result({
    context,
    helpers,
    outputs,
    provider: structured.provider,
    model: structured.model,
    providerRequestId: structured.providerRequestId || helpers.readText(helpers.asRecord(structured.response).id) || undefined,
  })
}

const cinematicParseHandlers = {
  cinematic_v2_script_parse: cinematicV2ScriptParseNode,
  cinematic_v3_shot_parse: cinematicV3ShotParseNode,
  cinematic_v3_shot_parse_group: cinematicV3ShotParseGroupNode,
}

const cinematicParseWorkflowNodePackKey = 'output_workflow_cinematic_parse'

export const cinematicParseWorkflowNodePack = defineWorkflowNodePack<
  CinematicParseNodeExecutionContext,
  CinematicParseNodeExecutionResult,
  CinematicParseWorkflowNodePackHelpers,
  typeof cinematicParseHandlers
>({
  packKey: cinematicParseWorkflowNodePackKey,
  handlers: cinematicParseHandlers,
})

export const cinematicParseWorkflowNodeHandlerKeys = cinematicParseWorkflowNodePack.handlerKeys

function createCinematicParseNodeScaffold(input: {
  purpose: keyof typeof cinematicParseHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Cinematic parse workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: cinematicParseWorkflowNodePackKey,
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

export const cinematicParseWorkflowNodeScaffolds = [
  createCinematicParseNodeScaffold({
    purpose: 'cinematic_v2_script_parse',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.screenplayDraft', 'upstream.assetPack', 'upstream.guidance', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'recoveryHints'],
  }),
  createCinematicParseNodeScaffold({
    purpose: 'cinematic_v3_shot_parse',
    runtimeKind: 'provider_polling',
    sourceHashKeys: ['upstream.screenplayDraft', 'upstream.assetPack', 'upstream.guidance', 'config.maxShotCount', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'streaming', 'recoveryHints'],
  }),
  createCinematicParseNodeScaffold({
    purpose: 'cinematic_v3_shot_parse_group',
    runtimeKind: 'provider_polling',
    sourceHashKeys: ['upstream.screenplayDraft', 'upstream.assetPack', 'upstream.shotBreakPlan', 'config.storyboardGroup', 'config.maxShotCount', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'streaming', 'recoveryHints'],
  }),
] as const

export const cinematicParseWorkflowNodeScaffoldHandlerKeys = cinematicParseWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerCinematicParseWorkflowNodePack(input: {
  helpers: CinematicParseWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: CinematicParseNodeExecutionContext) => Promise<CinematicParseNodeExecutionResult>) => void
}) {
  cinematicParseWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
