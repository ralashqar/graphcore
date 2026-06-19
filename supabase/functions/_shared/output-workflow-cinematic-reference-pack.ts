import {
  cinematicV2ReferencePlanSchema,
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
import { buildCinematicV2ShotAssetPack } from './output-workflow-cinematic-asset-pack-runtime.ts'

type LooseRecord = Record<string, unknown>

type CinematicReferenceNodeExecutionContext = {
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

type CinematicReferenceNodeExecutionResult = {
  inputHash: string
  outputHash: string
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string
}

type CinematicReferenceStructuredResult = {
  value: z.infer<typeof cinematicV2ReferencePlanSchema>
  response: unknown
  provider: string
  model: string
}

export type CinematicReferenceWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readFirstUpstreamRecord: (upstream: Record<string, LooseRecord>, fields: string[]) => LooseRecord
  resolveGuidanceForExecution: (context: CinematicReferenceNodeExecutionContext) => LooseRecord
  guidanceMarkdown: (bundle: LooseRecord) => string
  compactForPrompt: (value: unknown, maxLength?: number) => string
  hashOutputWorkflowValue: (value: unknown) => string
  buildDeterministicCinematicAssetPack: (context: LooseRecord) => LooseRecord
  buildFallbackCinematicV2ReferencePlan: (assetPack: LooseRecord, maxReferenceCount?: number) => z.infer<typeof cinematicV2ReferencePlanSchema>
  runCinematicV2ReferenceSelector: (input: {
    nodeKey: string
    schemaName: string
    instructions: string
    prompt: string
    fallback: z.infer<typeof cinematicV2ReferencePlanSchema>
    maxOutputTokens?: number
  }) => Promise<CinematicReferenceStructuredResult>
  sanitizeCinematicV2ReferencePlan: (plan: LooseRecord, assetPack: LooseRecord, maxReferenceCount?: number) => z.infer<typeof cinematicV2ReferencePlanSchema>
  strengthenCinematicReferencePlanWithVariantMatches: (
    plan: z.infer<typeof cinematicV2ReferencePlanSchema>,
    assetPack: LooseRecord,
    prompt: string,
    maxReferenceCount?: number,
  ) => z.infer<typeof cinematicV2ReferencePlanSchema>
  referencePlanKeys: (plan: z.infer<typeof cinematicV2ReferencePlanSchema>) => string[]
  filterCinematicAssetPack: (assetPack: LooseRecord, selectedKeys: string[], maxEntityCount?: number, maxAssetKeysPerEntity?: number) => LooseRecord
  cinematicAssetPackEntityKeys: (assetPack: LooseRecord) => string[]
}

function result(input: {
  context: CinematicReferenceNodeExecutionContext
  helpers: CinematicReferenceWorkflowNodePackHelpers
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string
}): CinematicReferenceNodeExecutionResult {
  return {
    ...createWorkflowNodeExecutionResult<CinematicReferenceNodeExecutionResult>({
      context: input.context,
      helpers: input.helpers,
      outputs: input.outputs,
      model: input.model,
    }),
    provider: input.provider,
    providerRequestId: input.providerRequestId,
  }
}

async function cinematicV3ReferenceSelectNode(
  context: CinematicReferenceNodeExecutionContext,
  helpers: CinematicReferenceWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const maxReferenceCount = Math.max(1, Math.min(16, Number(config.maxReferenceCount ?? 16) || 16))
  const sourceAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const worldContext = helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
  const fallbackPlan = helpers.buildFallbackCinematicV2ReferencePlan(sourceAssetPack, maxReferenceCount)
  const guidance = helpers.resolveGuidanceForExecution(context)
  const structured = await helpers.runCinematicV2ReferenceSelector({
    nodeKey: context.node.key,
    schemaName: 'output_workflow_cinematic_v3_reference_select',
    instructions: 'You are a cinematic reference selector. Return strict JSON only. Choose only supplied reference keys needed for a V3 cinematic scene.',
    prompt: [
      'Choose the cinematic-level reference plan from the already sequence-scoped asset pack.',
      'Do not add or invent world entities. Do not select every available reference by default.',
      'Select primary cast, supporting cast, locations, props, concepts, and continuity anchors that are genuinely needed for the storyboard and shot plan.',
      'Visual variants are not separate refs. When the user names a room, chamber, cafe, outfit, gear, or other visual variant, select the parent entity that owns the matching referenceVariants entry.',
      'For location phrases such as "in the leader\'s chamber of Whistlewick" or "inside the Pact Chamber", prefer the parent location with the matching shot_location_sheet variant. Do not select unrelated props/items merely because one word like "chamber" appears in their name.',
      'A multi-word variant label or summary match beats a single-token entity-name match.',
      'Reject refs that are unrelated to this prompt/sequence and explain briefly.',
      `User brief:\n${helpers.readText(context.run.prompt)}`,
      helpers.guidanceMarkdown(guidance),
      helpers.compactForPrompt({
        world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
        sequenceUnits: Array.isArray(worldContext.sequenceUnits) ? worldContext.sequenceUnits.map(helpers.asRecord).slice(0, 4) : [],
        sourceAssetPack,
      }, 9000),
    ].filter(Boolean).join('\n\n'),
    fallback: fallbackPlan,
    maxOutputTokens: 2800,
  })
  const cinematicReferencePlan = helpers.strengthenCinematicReferencePlanWithVariantMatches(
    helpers.sanitizeCinematicV2ReferencePlan(helpers.asRecord(structured.value), sourceAssetPack, maxReferenceCount),
    sourceAssetPack,
    helpers.readText(context.run.prompt),
    maxReferenceCount,
  )
  const assetPack = helpers.filterCinematicAssetPack(sourceAssetPack, helpers.referencePlanKeys(cinematicReferencePlan), maxReferenceCount, 2)
  const outputs = {
    cinematicReferencePlan,
    cinematic_reference_plan: cinematicReferencePlan,
    assetPack,
    asset_pack: assetPack,
    sourceAssetPackEntityCount: helpers.cinematicAssetPackEntityKeys(sourceAssetPack).length,
    selectedEntityCount: helpers.cinematicAssetPackEntityKeys(assetPack).length,
    text: JSON.stringify({ cinematicReferencePlan, assetPack }, null, 2),
    guidance,
    usage: helpers.asRecord(structured.response).usage,
  }
  return result({
    context,
    helpers,
    outputs,
    provider: structured.provider,
    model: structured.model,
    providerRequestId: helpers.readText(helpers.asRecord(structured.response).id) || undefined,
  })
}

async function cinematicEntitySelectorNode(
  context: CinematicReferenceNodeExecutionContext,
  helpers: CinematicReferenceWorkflowNodePackHelpers,
) {
  const worldContext = helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
  const assetPack = helpers.buildDeterministicCinematicAssetPack(worldContext)
  const guidance = helpers.resolveGuidanceForExecution(context)
  const outputs = {
    assetPack,
    asset_pack: assetPack,
    text: JSON.stringify(assetPack, null, 2),
    guidance,
  }
  return result({
    context,
    helpers,
    outputs,
    provider: 'graphcore',
    model: 'deterministic-cinematic-asset-pack-v1',
  })
}

async function cinematicV2ReferenceSelectNode(
  context: CinematicReferenceNodeExecutionContext,
  helpers: CinematicReferenceWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const maxReferenceCount = Math.max(1, Math.min(16, Number(config.maxReferenceCount ?? 16) || 16))
  const sourceAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const worldContext = helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
  const fallbackPlan = helpers.buildFallbackCinematicV2ReferencePlan(sourceAssetPack, maxReferenceCount)
  const guidance = helpers.resolveGuidanceForExecution(context)
  const structured = await helpers.runCinematicV2ReferenceSelector({
    nodeKey: context.node.key,
    schemaName: 'output_workflow_cinematic_v2_reference_select',
    instructions: 'You are a cinematic reference selector. Return strict JSON only. Choose only supplied reference keys needed for a V2 cinematic scene.',
    prompt: [
      'Choose the cinematic-level reference plan from the already sequence-scoped asset pack.',
      'Do not add or invent world entities. Do not select every available reference by default.',
      'Select primary cast, supporting cast, locations, props, concepts, and continuity anchors that are genuinely needed for the storyboard and shot plan.',
      'Visual variants are not separate refs. When the user names a room, chamber, cafe, outfit, gear, or other visual variant, select the parent entity that owns the matching referenceVariants entry.',
      'For location phrases such as "in the leader\'s chamber of Whistlewick" or "inside the Pact Chamber", prefer the parent location with the matching shot_location_sheet variant. Do not select unrelated props/items merely because one word like "chamber" appears in their name.',
      'A multi-word variant label or summary match beats a single-token entity-name match.',
      'Reject refs that are unrelated to this prompt/sequence and explain briefly.',
      `User brief:\n${helpers.readText(context.run.prompt)}`,
      helpers.guidanceMarkdown(guidance),
      helpers.compactForPrompt({
        world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
        sequenceUnits: Array.isArray(worldContext.sequenceUnits) ? worldContext.sequenceUnits.map(helpers.asRecord).slice(0, 4) : [],
        sourceAssetPack,
      }, 9000),
    ].filter(Boolean).join('\n\n'),
    fallback: fallbackPlan,
    maxOutputTokens: 2800,
  })
  const cinematicReferencePlan = helpers.strengthenCinematicReferencePlanWithVariantMatches(
    helpers.sanitizeCinematicV2ReferencePlan(helpers.asRecord(structured.value), sourceAssetPack, maxReferenceCount),
    sourceAssetPack,
    helpers.readText(context.run.prompt),
    maxReferenceCount,
  )
  const assetPack = helpers.filterCinematicAssetPack(sourceAssetPack, helpers.referencePlanKeys(cinematicReferencePlan), maxReferenceCount, 2)
  const outputs = {
    cinematicReferencePlan,
    cinematic_reference_plan: cinematicReferencePlan,
    assetPack,
    asset_pack: assetPack,
    sourceAssetPackEntityCount: helpers.cinematicAssetPackEntityKeys(sourceAssetPack).length,
    selectedEntityCount: helpers.cinematicAssetPackEntityKeys(assetPack).length,
    text: JSON.stringify({ cinematicReferencePlan, assetPack }, null, 2),
    guidance,
    usage: helpers.asRecord(structured.response).usage,
  }
  return result({
    context,
    helpers,
    outputs,
    provider: structured.provider,
    model: structured.model,
    providerRequestId: helpers.readText(helpers.asRecord(structured.response).id) || undefined,
  })
}

async function cinematicV2ShotAssetPackNode(
  context: CinematicReferenceNodeExecutionContext,
  helpers: CinematicReferenceWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotId = helpers.readText(config.shotId)
  const shotIndex = Number(config.shotIndex ?? 0) || 0
  const shotPlan = cinematicV2ShotPlanSchema.parse(helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan']))
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const referencePlan = helpers.readFirstUpstreamRecord(context.upstream, ['cinematicReferencePlan', 'cinematic_reference_plan'])
  const shot = shotPlan.shots.find((entry) => entry.id === shotId)
    ?? shotPlan.shots.find((entry) => entry.index === shotIndex)
    ?? shotPlan.shots[0]
  const shotAssetPack = buildCinematicV2ShotAssetPack({
    assetPack,
    referencePlan,
    shot,
    maxEntityCount: Math.max(1, Math.min(8, Number(config.maxEntityCount ?? 6) || 6)),
    maxAssetKeysPerEntity: Math.max(1, Math.min(3, Number(config.maxAssetKeysPerEntity ?? 2) || 2)),
  })
  const outputs = {
    assetPack: shotAssetPack,
    asset_pack: shotAssetPack,
    shot,
    shotReferenceKeys: Array.isArray(shotAssetPack.shotReferenceKeys)
      ? shotAssetPack.shotReferenceKeys.map(helpers.readText).filter(Boolean)
      : [],
    selectedEntityCount: helpers.cinematicAssetPackEntityKeys(shotAssetPack).length,
    deterministic: true,
    text: JSON.stringify(shotAssetPack, null, 2),
  }
  return result({
    context,
    helpers,
    outputs,
    provider: 'graphcore',
    model: 'deterministic-cinematic-v2-shot-asset-pack-v1',
  })
}

const cinematicReferenceHandlers = {
  cinematic_entity_selector: cinematicEntitySelectorNode,
  cinematic_v2_reference_select: cinematicV2ReferenceSelectNode,
  cinematic_v2_shot_asset_pack: cinematicV2ShotAssetPackNode,
  cinematic_v3_reference_select: cinematicV3ReferenceSelectNode,
}

const cinematicReferenceWorkflowNodePackKey = 'output_workflow_cinematic_reference'

export const cinematicReferenceWorkflowNodePack = defineWorkflowNodePack<
  CinematicReferenceNodeExecutionContext,
  CinematicReferenceNodeExecutionResult,
  CinematicReferenceWorkflowNodePackHelpers,
  typeof cinematicReferenceHandlers
>({
  packKey: cinematicReferenceWorkflowNodePackKey,
  handlers: cinematicReferenceHandlers,
})

export const cinematicReferenceWorkflowNodeHandlerKeys = cinematicReferenceWorkflowNodePack.handlerKeys

function createCinematicReferenceNodeScaffold(input: {
  purpose: keyof typeof cinematicReferenceHandlers
  runtimeKind: WorkflowNodeRuntimeKind
  sourceHashKeys: string[]
  projectionMetadataKeys?: string[]
}): WorkflowNodeExtensionScaffold {
  const manifest = outputWorkflowNodeManifestsByPurpose.get(input.purpose)
  if (!manifest) throw new Error(`Cinematic reference workflow node scaffold missing registered manifest: ${input.purpose}`)
  return createWorkflowNodeExtensionScaffold({
    ...workflowNodeManifestToContract(manifest),
    nodeType: manifest.nodeType,
    handlerKey: manifest.handlerKey,
    packKey: cinematicReferenceWorkflowNodePackKey,
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

export const cinematicReferenceWorkflowNodeScaffolds = [
  createCinematicReferenceNodeScaffold({
    purpose: 'cinematic_entity_selector',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.worldContext', 'upstream.guidance', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicReferenceNodeScaffold({
    purpose: 'cinematic_v2_reference_select',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.worldContext', 'upstream.assetPack', 'upstream.guidance', 'config.maxReferenceCount', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicReferenceNodeScaffold({
    purpose: 'cinematic_v2_shot_asset_pack',
    runtimeKind: 'deterministic_transform',
    sourceHashKeys: ['upstream.shotPlan', 'upstream.assetPack', 'upstream.cinematicReferencePlan', 'config.shotId', 'config.shotIndex', 'config.maxEntityCount', 'config.maxAssetKeysPerEntity'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'scopedAssetKeys', 'recoveryHints'],
  }),
  createCinematicReferenceNodeScaffold({
    purpose: 'cinematic_v3_reference_select',
    runtimeKind: 'structured_llm',
    sourceHashKeys: ['upstream.worldContext', 'upstream.assetPack', 'upstream.guidance', 'config.maxReferenceCount', 'run.prompt'],
    projectionMetadataKeys: ['activeManifestPurpose', 'activeProgressLabel', 'providerStatus', 'scopedAssetKeys', 'recoveryHints'],
  }),
] as const

export const cinematicReferenceWorkflowNodeScaffoldHandlerKeys = cinematicReferenceWorkflowNodeScaffolds.map((scaffold) => scaffold.handlerKey)

export function registerCinematicReferenceWorkflowNodePack(input: {
  helpers: CinematicReferenceWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: CinematicReferenceNodeExecutionContext) => Promise<CinematicReferenceNodeExecutionResult>) => void
}) {
  cinematicReferenceWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
