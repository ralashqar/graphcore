import { outputArtifactSchema, type OutputArtifact } from '../../../src/domain/outputWorkflow.ts'
import { cinematicV2ShotPlanSchema, cinematicV2ShotSchema, providerSafeCinematicV2DurationSeconds } from '../../../src/domain/cinematics.ts'
import { formatSequenceAnimaticSceneStateForPrompt } from '../../../src/domain/sequenceAnimaticSceneState.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import {
  applySequenceAnimaticCoveragePlanToDirectorPlan,
  normalizeSequenceAnimaticCoveragePlan,
  sequenceAnimaticCoveragePlanLlmSchema,
  sequenceAnimaticCoverageShotRefs,
  sequenceAnimaticCoverageSpatialFields,
} from './output-workflow-sequence-animatic-coverage-runtime.ts'
import {
  runSequenceAnimaticOrchestratorRuntime,
  type SequenceAnimaticOrchestratorRuntimeHelpers,
} from './output-workflow-sequence-animatic-orchestrator-runtime.ts'
import {
  materializeSequenceAnimaticScenePlanFanoutRuntime,
  runSequenceAnimaticDirectorPlanRuntime,
  runSequenceAnimaticScenePackageAssignmentRuntime,
  runSequenceAnimaticSceneShotPlanRuntime,
  type SequenceAnimaticDirectorPlanRuntimeHelpers,
} from './output-workflow-sequence-animatic-planning-runtime.ts'
import { sequenceAnimaticStableHash } from './sequence-animatic-workflow-factory.ts'
import { z } from 'zod'

type LooseRecord = Record<string, unknown>

type OutputArtifactRow = {
  id: string
  project_id: string
  draft_id: string
  workflow_id: string | null
  run_id: string | null
  node_id: string | null
  key: string
  name: string
  kind: string
  asset_key: string | null
  mime_type: string | null
  summary: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type SequenceAnimaticNodeExecutionContext = {
  client: unknown
  inputHash: string
  node: {
    id: string
    key: string
    label: string
    type?: string
    config: unknown
  }
  workflow: {
    id: string
    key: string
    name: string
    metadata?: unknown
  }
  run: {
    id: string
    projectId: string
    draftId: string
    preset: string
    requestId?: string | null
    prompt?: string | null
    input?: LooseRecord
    metadata?: LooseRecord | null
  }
  upstream: Record<string, Record<string, unknown>>
  priorStep?: {
    providerRequestId?: string | null
    metadata?: unknown
  } | null
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<void>
}

type SequenceAnimaticNodeExecutionResult = {
  status?: string
  inputHash: string
  outputHash: string
  outputs: Record<string, unknown>
  provider: string
  model: string
  providerRequestId?: string
}

type SequenceAnimaticScenePackageOutput = LooseRecord & {
  scenePackages: Array<LooseRecord & {
    sceneId: string
    index: number
    worldLocationRefId?: string | null
    locationRefId?: string | null
    setId?: string | null
    zoneId?: string | null
    spotIds: string[]
  }>
  sceneGraphDraft: {
    additions: Array<LooseRecord & {
      kind: string
      id: string
      parentId?: string | null
      worldLocationRefId?: string | null
      setId?: string | null
      zoneId?: string | null
      spotId?: string | null
      name?: string | null
      visualBrief?: string | null
    }>
  }
}

export type SequenceAnimaticWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readArray: (value: unknown) => unknown[]
  readStringArray: (value: unknown) => string[]
  readFirstUpstreamRecord: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => LooseRecord
  readPreferredUpstreamRecord: (upstream: Record<string, Record<string, unknown>>, preferredNodeKeys: string[], fields: string[]) => LooseRecord
  readFirstUpstreamArray: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => unknown[]
  readFirstUpstreamText: (upstream: Record<string, Record<string, unknown>>, fields?: string[]) => string
  readFirstUpstreamImage: (upstream: Record<string, Record<string, unknown>>, fields?: string[]) => LooseRecord | null
  slugify: (value: string) => string
  titleFromRefLike: (value: string) => string
  hashOutputWorkflowValue: (value: unknown) => string
  coverageAnchorMode: string
  buildCinematicV3StoryboardGroupAssetPack: (input: {
    assetPack: LooseRecord
    shots: LooseRecord[]
    maxEntityCount: number
    maxAssetKeysPerEntity: number
    includeSpeakerRefs?: boolean
    includePerformanceRefs?: boolean
    includeTextMentionedRefs?: boolean
  }) => LooseRecord
  scopeAssetPackToReferenceAssetKeys: (input: {
    assetPack: LooseRecord
    referenceAssetKeys: string[]
    fallbackEntities: LooseRecord[]
    referenceScope: string
    limit: number
  }) => LooseRecord
  orderSequenceAnimaticAssetPackReferences: (assetPack: LooseRecord) => LooseRecord
  sequenceAnimaticReferenceManifestEntries: (assetPack: LooseRecord) => unknown[]
  sequenceAnimaticReferenceManifestText: (assetPack: LooseRecord) => string
  sequenceAnimaticReferenceRole: (record: LooseRecord) => string
  sequenceAnimaticReferenceName: (record: LooseRecord, fallback?: string) => string
  sequenceAnimaticReferenceVisual: (record: LooseRecord, maxWords?: number) => string
  compactStoryboardSentence: (value: unknown, fallback?: string, maxWords?: number) => string
  compactForPrompt: (value: unknown, maxLength?: number) => string
  compactSequenceAnimaticText: (value: unknown, maxLength?: number) => string
  outputWorkflowTextModel: () => string
  cinematicAssetPackEntityKeys: (assetPack: LooseRecord) => string[]
  buildSequenceAnimaticReferenceCatalog: (input: {
    context?: LooseRecord
    assetPack: LooseRecord
  }) => unknown[]
  parseSequenceAnimaticShotPlan: (value: unknown) => LooseRecord & { shots: LooseRecord[] }
  safeParseSequenceAnimaticShotPlan: (value: unknown) => { success: true; data: LooseRecord & { shots: LooseRecord[] } } | { success: false }
  buildCinematicV3StoryboardLayout: (panelCount: number) => { rows: number; columns: number; panelCount: number }
  buildSequenceAnimaticShotPlanFromBreaks: (input: {
    shotBreakPlan: LooseRecord
    assetPack: LooseRecord
    context?: LooseRecord
  }) => LooseRecord & { shots: LooseRecord[] }
  buildCinematicV3ShotBreakPlan: (input: {
    screenplayDraft: LooseRecord
    maxShotCount: number
    maxPanelsPerSheet: number
    maxDurationPerGroupSeconds: number
  }) => LooseRecord
  deriveCinematicV2MaxShotCount: (suggestedDurationSeconds: number | null) => number
  buildSequenceAnimaticScriptShotProjection: (shotBreakPlan: LooseRecord) => LooseRecord & {
    scriptShots: unknown[]
  }
  buildCinematicV3StoryboardGroupFromShotBreakGroup: (group: LooseRecord, index: number) => LooseRecord
  collectCinematicV3ShotPlansFromUpstream: (upstream: Record<string, Record<string, unknown>>) => Array<LooseRecord & { shots: LooseRecord[] }>
  mergeCinematicV3ShotPlansForTimeline: (plans: Array<LooseRecord & { shots: LooseRecord[] }>) => LooseRecord & { shots: LooseRecord[] }
  repairCinematicV2ShotPlanVisualReferences: (input: {
    shotPlan: LooseRecord
    assetPack: LooseRecord
  }) => LooseRecord & { shots: LooseRecord[] }
  parseSequenceAnimaticScenePackageOutput: (value: unknown) => SequenceAnimaticScenePackageOutput
  safeParseSequenceAnimaticTaggedScenePackage: SequenceAnimaticDirectorPlanRuntimeHelpers['safeParseSequenceAnimaticTaggedScenePackage']
  loadWorkflowNodes: SequenceAnimaticDirectorPlanRuntimeHelpers['loadWorkflowNodes']
  loadWorkflowRunSteps: SequenceAnimaticDirectorPlanRuntimeHelpers['loadWorkflowRunSteps']
  loadWorkflowEdges: SequenceAnimaticDirectorPlanRuntimeHelpers['loadWorkflowEdges']
  hasStoredOutputs: SequenceAnimaticDirectorPlanRuntimeHelpers['hasStoredOutputs']
  isStaleDynamicCinematicNode: SequenceAnimaticDirectorPlanRuntimeHelpers['isStaleDynamicCinematicNode']
  preserveExistingDynamicNodeOutput: SequenceAnimaticDirectorPlanRuntimeHelpers['preserveExistingDynamicNodeOutput']
  dynamicNodeRow: SequenceAnimaticDirectorPlanRuntimeHelpers['dynamicNodeRow']
  dynamicEdgeRow: SequenceAnimaticDirectorPlanRuntimeHelpers['dynamicEdgeRow']
  persistDynamicWorkflowGraphRevision: SequenceAnimaticDirectorPlanRuntimeHelpers['persistDynamicWorkflowGraphRevision']
  buildSequenceAnimaticScenePackageFromTaggedScreenplay: SequenceAnimaticDirectorPlanRuntimeHelpers['buildSequenceAnimaticScenePackageFromTaggedScreenplay']
  buildFallbackSequenceAnimaticSceneGraphAssignment: SequenceAnimaticDirectorPlanRuntimeHelpers['buildFallbackSequenceAnimaticSceneGraphAssignment']
  runSequenceAnimaticSceneGraphAssignmentProvider: SequenceAnimaticDirectorPlanRuntimeHelpers['runSequenceAnimaticSceneGraphAssignmentProvider']
  mergeSequenceAnimaticSceneGraphAssignment: SequenceAnimaticDirectorPlanRuntimeHelpers['mergeSequenceAnimaticSceneGraphAssignment']
  runSequenceAnimaticShotContinuityPlanStreamWithRetry: SequenceAnimaticDirectorPlanRuntimeHelpers['runSequenceAnimaticShotContinuityPlanStreamWithRetry']
  sequenceAnimaticShotContinuityPolicy: SequenceAnimaticDirectorPlanRuntimeHelpers['sequenceAnimaticShotContinuityPolicy']
  sequenceAnimaticStableHash: SequenceAnimaticOrchestratorRuntimeHelpers['sequenceAnimaticStableHash']
  sequenceAnimaticGraphSpecVersion: SequenceAnimaticOrchestratorRuntimeHelpers['sequenceAnimaticGraphSpecVersion']
  readScreenplayAnimaticRoleFromMetadata: SequenceAnimaticOrchestratorRuntimeHelpers['readScreenplayAnimaticRoleFromMetadata']
  readScreenplayAnimaticSourceFromMetadata: SequenceAnimaticOrchestratorRuntimeHelpers['readScreenplayAnimaticSourceFromMetadata']
  sequenceAnimaticBlocksFromManifestAndDirectorPlan: SequenceAnimaticOrchestratorRuntimeHelpers['sequenceAnimaticBlocksFromManifestAndDirectorPlan']
  sequenceAnimaticContinuityAssetBatches: SequenceAnimaticOrchestratorRuntimeHelpers['sequenceAnimaticContinuityAssetBatches']
  sequenceAnimaticContinuityVisualDependencyEdges: SequenceAnimaticOrchestratorRuntimeHelpers['sequenceAnimaticContinuityVisualDependencyEdges']
  sequenceAnimaticStoryboardImageSize: SequenceAnimaticOrchestratorRuntimeHelpers['sequenceAnimaticStoryboardImageSize']
  loadMasterRequestForWorkflow: SequenceAnimaticOrchestratorRuntimeHelpers['loadMasterRequestForWorkflow']
  loadChildRequests: SequenceAnimaticOrchestratorRuntimeHelpers['loadChildRequests']
  buildSequenceAnimaticTemplateGraph: SequenceAnimaticOrchestratorRuntimeHelpers['buildSequenceAnimaticTemplateGraph']
  sequenceAnimaticContinuityBatchTemplateKey: SequenceAnimaticOrchestratorRuntimeHelpers['sequenceAnimaticContinuityBatchTemplateKey']
  sequenceAnimaticStoryboardBlocksTemplateKey: SequenceAnimaticOrchestratorRuntimeHelpers['sequenceAnimaticStoryboardBlocksTemplateKey']
  ensureMappedChildWorkflow: SequenceAnimaticOrchestratorRuntimeHelpers['ensureMappedChildWorkflow']
  startSequenceAnimaticChildRun: SequenceAnimaticOrchestratorRuntimeHelpers['startSequenceAnimaticChildRun']
  updateMasterRequestMetadata: SequenceAnimaticOrchestratorRuntimeHelpers['updateMasterRequestMetadata']
  refreshOutputRequestStatusProjection: SequenceAnimaticOrchestratorRuntimeHelpers['refreshOutputRequestStatusProjection']
  parseSequenceAnimaticShotContinuityPlanV2: (value: unknown) => LooseRecord
  sequenceAnimaticUniqueTexts: (values: unknown[]) => string[]
  mergeById: (records: LooseRecord[]) => LooseRecord[]
  sequenceAnimaticReferenceCatalog: (input: {
    animaticReferenceCatalog?: LooseRecord
    assetPack: LooseRecord
  }) => LooseRecord
  buildSequenceAnimaticContinuityPlannerContext: (input: {
    screenplayDraft: LooseRecord
    shotPlan: LooseRecord
    shotBreakPlan: LooseRecord
    assetPack: LooseRecord
    animaticReferenceCatalog: LooseRecord
  }) => LooseRecord
  normalizeSequenceAnimaticDirectorPlan: (input: {
    rawPlan: LooseRecord
    manifest: LooseRecord
    manifestHash: string
    masterManifestArtifactKey: string
    continuityPlannerContext: LooseRecord
  }) => LooseRecord & {
    shots: LooseRecord[]
    blocks: LooseRecord[]
    continuityGraphV2?: unknown
    shotBindings?: unknown
  }
  planSequenceAnimaticShotRevision: (input: {
    nodeKey: string
    shot: LooseRecord
    revisionPrompt: string
    assetPack: LooseRecord
    baseKeyframe: LooseRecord
    priorProviderRequestId?: string | null
    shouldCancel?: () => Promise<boolean>
    onProgress?: (progress: {
      providerRequestId: string
      providerStatus: string
      providerMode: string
      lastProviderPollAt: string
    }) => Promise<void>
  }) => Promise<LooseRecord & {
    revisedShot: unknown
    changeSummary?: unknown
    keyframeIntent?: unknown
    diagnostics?: unknown
    provider?: unknown
    model?: unknown
    providerRequestId?: unknown
    fallbackUsed?: unknown
    fallbackReason?: unknown
  }>
  executeImageGeneration: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>
  executeVideoGeneration: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>
  cinematicEntityByKey: (assetPack: LooseRecord) => Map<string, LooseRecord>
  inferSequenceShotVideoTiming: (input: {
    nodeKey: string
    shot: LooseRecord
    entityByKey?: Map<string, LooseRecord>
  }) => Promise<LooseRecord & {
    editorialDurationSeconds?: unknown
    rationale?: unknown
    pacingNotes?: unknown
    directedControls?: unknown
    provider?: unknown
    model?: unknown
    fallbackUsed?: unknown
    fallbackReason?: unknown
  }>
  buildSeedanceReferenceManifest: (input: {
    imageReferences?: LooseRecord[]
    videoReferences?: LooseRecord[]
    audioReferences?: LooseRecord[]
    cinematicReferenceMode?: string
  }) => unknown[]
  seedanceReferenceRecordsFromImages: (images: LooseRecord[], cinematicReferenceMode: string) => LooseRecord[]
  seedanceReferenceRecordsFromAssetPack: (assetPack: LooseRecord, limit?: number) => LooseRecord[]
  buildSeedanceCharacterVoiceGuide: (input: {
    assetPack: LooseRecord
    shots: LooseRecord[]
    limit?: number
    visualIdentityKeys?: Set<string>
  }) => string
  formatSeedanceShotLine: (input: {
    shot: LooseRecord
    startSeconds: number
    endSeconds: number
    dialogueLines?: string
  }) => string
  compactSeedanceControlText: (value: unknown, maxWords?: number) => string
  buildCompactSeedanceVideoPrompt: (input: {
    durationSeconds: number
    aspectRatio: string
    resolution: string
    referenceManifest: unknown[]
    referenceInstruction?: string
    directedControls: unknown
    shotSectionTitle?: 'SHOT' | 'SHOTS'
    shotLines: string
    identityGuide?: string
    audioPolicy?: string
    movementLogic?: string
    artifactBan?: string
    clipLabel?: string
  }) => string
  seedanceLabanMovementBlock: (shots: LooseRecord[], prompt: string) => string
  seedanceProductionBoardArtifactBan: (manifest: unknown[]) => string
  readUpstreamGuidanceBundle: (upstream: Record<string, Record<string, unknown>>) => LooseRecord
  sequenceAnimaticContinuityAssetStateParse: (value: unknown) => LooseRecord
  sequenceAnimaticContinuityAssetTargetInputHash: (targetNode: LooseRecord) => string
  sequenceAnimaticAssetGenerationStatus: (assetStateByNodeId: Record<string, unknown>) => string
  outputArtifactSelect: string
  registerOtherOutputArtifact: (input: {
    client: unknown
    run: SequenceAnimaticNodeExecutionContext['run']
    workflow: SequenceAnimaticNodeExecutionContext['workflow']
    node: SequenceAnimaticNodeExecutionContext['node']
    key: string
    name: string
    summary: string
    metadata: Record<string, unknown>
  }) => Promise<OutputArtifact>
  persistSequenceAnimaticDirectorPlanRequestState: (input: {
    client: unknown
    run: SequenceAnimaticNodeExecutionContext['run']
    workflow: SequenceAnimaticNodeExecutionContext['workflow']
    artifactKey: string
    directorPlan: LooseRecord
  }) => Promise<void>
  registerVideoArtifact: (input: {
    client: unknown
    run: SequenceAnimaticNodeExecutionContext['run']
    workflow: SequenceAnimaticNodeExecutionContext['workflow']
    node: SequenceAnimaticNodeExecutionContext['node']
    assetKey: string
    storagePath: string
    name: string
    summary: string
    mimeType: string
    metadata: Record<string, unknown>
  }) => Promise<OutputArtifact>
  insertSequenceAnimaticEvent: (input: {
    client: unknown
    projectId: string
    draftId: string
    requestId: string
    workflowId?: string | null
    runId?: string | null
    eventType: string
    payload: Record<string, unknown>
    metadata?: Record<string, unknown>
    dedupe?: Record<string, unknown>
  }) => Promise<void>
  runStructuredNode: <TValue>(input: {
    nodeKey: string
    schemaName: string
    schema: z.ZodType<TValue>
    instructions: string
    prompt: string
    fallback: TValue
    maxOutputTokens?: number
  }) => Promise<{
    value: TValue
    provider: string
    model: string
    fallbackUsed: boolean
    fallbackReason: string
  }>
  runBackgroundStructuredNode: <TValue>(input: {
    nodeKey: string
    schemaName: string
    schema: z.ZodType<TValue>
    instructions: string
    prompt: string
    fallback: TValue
    maxOutputTokens?: number
    shouldCancel?: () => Promise<boolean>
    onProgress?: (progress: {
      providerRequestId: string
      providerStatus: string
      providerMode: string
      providerStartedAt?: string
      lastProviderPollAt: string
    }) => Promise<void>
  }) => Promise<{
    value: TValue
    provider: string
    model: string
    providerRequestId: string
    fallbackUsed: boolean
    fallbackReason: string
  }>
}

function result(input: {
  context: SequenceAnimaticNodeExecutionContext
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  outputs: Record<string, unknown>
  model: string
  provider?: string | null
  providerRequestId?: string | null
}): SequenceAnimaticNodeExecutionResult {
  return {
    inputHash: input.context.inputHash,
    outputHash: input.helpers.hashOutputWorkflowValue(input.outputs),
    outputs: input.outputs,
    provider: input.provider || 'graphcore',
    model: input.model,
    providerRequestId: input.providerRequestId || undefined,
  }
}

const sequenceAnimaticCoverageIntentBatchSchema = z.object({
  intents: z.array(z.object({
    shotId: z.string().max(160),
    cameraFraming: z.string().max(220).default(''),
    cameraAngle: z.string().max(220).default(''),
    screenDirection: z.string().max(220).default(''),
    subjectFocus: z.string().max(360).default(''),
    stagingBrief: z.string().max(520).default(''),
    coverageIntent: z.string().max(700).default(''),
  })).min(1).max(150),
  diagnostics: z.array(z.string().max(260)).default([]),
})

const sequenceAnimaticCoverageAnchorBriefSchema = z.object({
  cameraPosition: z.string().max(420).default(''),
  framing: z.string().max(260).default(''),
  screenDirection: z.string().max(260).default(''),
  subjectBlocking: z.string().max(720).default(''),
  foregroundBackgroundPlan: z.string().max(620).default(''),
  movementArrows: z.array(z.string().max(160)).max(12).default([]),
  labels: z.array(z.string().max(80)).max(16).default([]),
  visualNotes: z.array(z.string().max(220)).max(12).default([]),
  mustNotInclude: z.array(z.string().max(160)).max(12).default([]),
})

function mapOutputArtifactRow(row: OutputArtifactRow): OutputArtifact {
  return outputArtifactSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    workflowId: row.workflow_id,
    runId: row.run_id,
    nodeId: row.node_id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    assetKey: row.asset_key,
    mimeType: row.mime_type ?? '',
    summary: row.summary ?? '',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function readPreferredUpstreamImage(input: {
  upstream: Record<string, Record<string, unknown>>
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  preferredNodeKeys: string[]
  fields?: string[]
  role?: string
}) {
  const fields = input.fields ?? ['image', 'keyframe', 'primaryReferenceImage', 'coverImage']
  const readFromOutputs = (outputs: unknown) => {
    const record = input.helpers.asRecord(outputs)
    for (const field of fields) {
      const image = input.helpers.asRecord(record[field])
      if (input.helpers.readText(image.assetKey) || input.helpers.readText(image.storagePath) || input.helpers.readText(image.url)) return image
    }
    if (input.helpers.readText(record.assetKey) || input.helpers.readText(record.storagePath) || input.helpers.readText(record.url)) return record
    return null
  }
  for (const key of input.preferredNodeKeys) {
    const direct = readFromOutputs(input.upstream[key])
    if (direct) return direct
  }
  if (input.role) {
    for (const outputs of Object.values(input.upstream)) {
      const image = readFromOutputs(outputs)
      if (!image) continue
      if (input.helpers.readText(image.role) === input.role || input.helpers.readText(input.helpers.asRecord(outputs).role) === input.role) return image
    }
  }
  return input.helpers.readFirstUpstreamImage(input.upstream, fields)
}

function readUpstreamImages(
  upstream: Record<string, Record<string, unknown>>,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  fields = ['image', 'coverImage'],
) {
  const images: LooseRecord[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = helpers.asRecord(entry)
          if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.url)) images.push(record)
        }
        continue
      }
      const record = helpers.asRecord(value)
      if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.url)) images.push(record)
    }
    if (
      (helpers.readText(outputs.assetKey) || helpers.readText(outputs.storagePath) || helpers.readText(outputs.storage_path) || helpers.readText(outputs.url))
      && !images.some((image) => helpers.readText(image.assetKey) === helpers.readText(outputs.assetKey) && helpers.readText(image.storagePath ?? image.storage_path) === helpers.readText(outputs.storagePath ?? outputs.storage_path))
    ) {
      images.push(outputs)
    }
  }
  return images
}

function readUpstreamVideos(
  upstream: Record<string, Record<string, unknown>>,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  fields = ['video', 'videos'],
) {
  const videos: LooseRecord[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = helpers.asRecord(entry)
          if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.storage_path) || helpers.readText(record.url)) videos.push(record)
        }
        continue
      }
      const record = helpers.asRecord(value)
      if (helpers.readText(record.assetKey) || helpers.readText(record.storagePath) || helpers.readText(record.storage_path) || helpers.readText(record.url)) videos.push(record)
    }
    if (
      (helpers.readText(outputs.assetKey) || helpers.readText(outputs.storagePath) || helpers.readText(outputs.storage_path) || helpers.readText(outputs.url))
      && !videos.some((video) => helpers.readText(video.assetKey) === helpers.readText(outputs.assetKey) && helpers.readText(video.storagePath ?? video.storage_path) === helpers.readText(outputs.storagePath ?? outputs.storage_path))
    ) {
      videos.push(outputs)
    }
  }
  return videos
}

async function sequenceAnimaticShotInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const rawShot = helpers.asRecord(config.shot)
  const isShotProduction = helpers.readText(config.screenplayAnimaticRole) === 'shot_production' || helpers.readText(config.sequenceAnimaticRole) === 'shot_production'
  const shot = cinematicV2ShotPlanSchema.shape.shots.element.parse({
    ...rawShot,
    editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(rawShot.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3)),
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(Number(rawShot.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3),
  })
  const panel = helpers.asRecord(config.panel)
  const panelAssetKey = helpers.readText(panel.assetKey)
  if (!panelAssetKey && !isShotProduction) {
    throw new Error('Sequence animatic shot video requires a cropped panel asset. Generate/extract the storyboard panel before generating shot video.')
  }
  const assetPack = helpers.buildCinematicV3StoryboardGroupAssetPack({
    assetPack: helpers.asRecord(config.assetPack),
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 6) || 6)),
    maxAssetKeysPerEntity: 1,
  })
  const editorialDurationSeconds = Math.max(0.5, Math.min(15, Number(config.editorialDurationSeconds ?? shot.editorialDurationSeconds ?? 0) || 3))
  const providerDurationSeconds = providerSafeCinematicV2DurationSeconds(editorialDurationSeconds)
  const image = panelAssetKey ? {
    ...panel,
    assetKey: panelAssetKey,
    role: 'cinematic_v2_shot_keyframe',
    name: helpers.readText(panel.name) || `${shot.title || `Shot ${shot.index}`} cropped panel keyframe`,
    shotId: shot.id,
    shotIndex: shot.index,
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    usedAsVideoReference: true,
    metadata: {
      ...helpers.asRecord(panel.metadata),
      role: 'cinematic_v2_shot_keyframe',
      shotId: shot.id,
      shotIndex: shot.index,
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
    },
  } : null
  const shotPlan = cinematicV2ShotPlanSchema.parse({
    sceneId: 'sequence_animatic_shot',
    totalEditorialDurationSeconds: editorialDurationSeconds,
    shots: [{ ...shot, editorialDurationSeconds, providerDurationSeconds }],
    performanceArc: [],
    audioPlan: {
      ambience: '',
      music: '',
      sfx: [],
      dialogueTrackCount: shot.dialogue.length > 0 ? 1 : 0,
      placeholderOnly: true,
    },
    diagnostics: ['Sequence animatic shot input built from a cropped storyboard panel.'],
  })
  const outputs = {
    shot: { ...shot, editorialDurationSeconds, providerDurationSeconds },
    shots: [{ ...shot, editorialDurationSeconds, providerDurationSeconds }],
    shotPlan,
    shot_plan: shotPlan,
    ...(image ? { image, keyframe: image, primaryReferenceImage: image } : {}),
    assetPack,
    asset_pack: assetPack,
    panel,
    editorialDurationSeconds,
    providerDurationSeconds,
    durationSeconds: providerDurationSeconds,
    screenplayAnimaticRole: isShotProduction ? 'shot_production' : 'shot_video',
    screenplayAnimaticSource: helpers.readText(config.screenplayAnimaticSource),
    sequenceAnimaticRole: isShotProduction ? 'shot_production' : 'shot_video',
    text: JSON.stringify({ shot, image, assetPack }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-input-v1' })
}

async function sequenceAnimaticSharedAssetRef(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const referenceRole = helpers.readText(config.referenceRole) || 'continuity_asset'
  const sourceArtifactRole = helpers.readText(config.sourceArtifactRole)
  const identityKey = helpers.readText(config.identityKey)
  const identityValue = helpers.readText(config.identityValue)
  const expectedAssetKey = helpers.readText(config.expectedAssetKey) || (identityKey === 'assetKey' ? identityValue : '')
  const directReference = helpers.asRecord(config.directReference)
  const directAssetKey = helpers.readText(directReference.assetKey) || expectedAssetKey
  const artifactFromDirect = helpers.asRecord(directReference.artifact)
  const directReferenceReady = Boolean(directAssetKey)
  let artifact: OutputArtifact | null = null
  if (!directReferenceReady) {
    const client = context.client as { from: (table: string) => any }
    let query = client
      .from('output_artifacts')
      .select(helpers.outputArtifactSelect)
      .eq('project_id', context.run.projectId)
      .eq('draft_id', context.run.draftId)
      .order('updated_at', { ascending: false })
      .limit(200)
    if (sourceArtifactRole) query = query.contains('metadata', { role: sourceArtifactRole })
    const masterRequestId = helpers.readText(config.masterRequestId)
    if (masterRequestId) query = query.contains('metadata', { masterRequestId })
    if (identityKey && identityValue && identityKey !== 'assetKey') query = query.contains('metadata', { [identityKey]: identityValue })
    if (expectedAssetKey) query = query.eq('asset_key', expectedAssetKey)
    const response = await query
    if (response.error) throw new Error(response.error.message)
    artifact = ((response.data ?? []) as OutputArtifactRow[])
      .map(mapOutputArtifactRow)
      .find((entry) => {
        const metadata = helpers.asRecord(entry.metadata)
        if (sourceArtifactRole && helpers.readText(metadata.role) !== sourceArtifactRole) return false
        if (identityKey && identityValue && identityKey !== 'assetKey' && helpers.readText(metadata[identityKey]) !== identityValue) return false
        if (expectedAssetKey && helpers.readText(entry.assetKey) !== expectedAssetKey) return false
        return true
      }) ?? null
  }
  const assetKey = directAssetKey || helpers.readText(artifact?.assetKey)
  const ready = Boolean(assetKey)
  const required = config.required === true
  if (!ready && required) {
    throw new Error(`Required ${referenceRole.replace(/_/g, ' ')} reference is missing${identityValue ? ` for ${identityValue}` : ''}.`)
  }
  const metadata = helpers.asRecord(artifact?.metadata)
  const image = ready ? {
    ...directReference,
    assetKey,
    artifactKey: helpers.readText(artifactFromDirect.key) || helpers.readText(artifact?.key),
    mimeType: helpers.readText(directReference.mimeType) || helpers.readText(artifact?.mimeType),
    role: referenceRole,
    sourceArtifactRole: sourceArtifactRole || helpers.readText(metadata.role),
    sourceWorkflowId: helpers.readText(artifact?.workflowId) || helpers.readText(config.sourceWorkflowId),
    sourceRequestId: helpers.readText(config.sourceRequestId),
    metadata: {
      ...helpers.asRecord(directReference.metadata),
      ...metadata,
      referenceRole,
      sourceArtifactRole: sourceArtifactRole || helpers.readText(metadata.role),
    },
  } : null
  const reference = {
    status: ready ? 'ready' : 'missing',
    assetKey: assetKey || null,
    artifactKey: helpers.readText(artifactFromDirect.key) || helpers.readText(artifact?.key) || null,
    role: referenceRole,
    sourceArtifactRole: sourceArtifactRole || helpers.readText(metadata.role) || null,
    sourceWorkflowId: helpers.readText(artifact?.workflowId) || helpers.readText(config.sourceWorkflowId) || null,
    sourceRequestId: helpers.readText(config.sourceRequestId) || null,
    identityKey,
    identityValue,
    blockingReason: ready ? '' : `missing_${referenceRole}`,
  }
  const outputs = {
    reference,
    status: reference.status,
    assetKey: assetKey || '',
    artifact: artifact ?? (Object.keys(artifactFromDirect).length > 0 ? artifactFromDirect : null),
    ...(image ? { image, keyframe: image, primaryReferenceImage: image } : {}),
    text: JSON.stringify(reference, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shared-asset-ref-v1' })
}

async function sequenceAnimaticShotReferencePack(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const rawAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const references = Object.values(context.upstream)
    .map((outputs) => helpers.asRecord(outputs.reference))
    .filter((reference) => helpers.readText(reference.status) === 'ready' && helpers.readText(reference.assetKey))
  const upstreamImages = readUpstreamImages(context.upstream, helpers, ['image', 'keyframe', 'primaryReferenceImage'])
  const imageByAssetKey = new Map(upstreamImages.map((image) => [helpers.readText(image.assetKey), image] as const).filter(([assetKey]) => assetKey))
  const referenceAssetKeys = references.map((reference) => helpers.readText(reference.assetKey)).filter(Boolean)
  const fallbackEntities = references.map((reference, index) => {
    const assetKey = helpers.readText(reference.assetKey)
    const role = helpers.readText(reference.role) || 'continuity_asset'
    const label = role === 'coverage_anchor'
      ? 'Coverage anchor'
      : role === 'previous_keyframe'
        ? 'Previous keyframe'
        : role === 'storyboard_panel'
          ? 'Storyboard panel'
          : `${helpers.titleFromRefLike(role)} ${index + 1}`
    return {
      key: `shot_ref_${index + 1}_${helpers.slugify(assetKey || role)}`,
      name: label,
      type: role.includes('character') ? 'character' : role.includes('prop') ? 'prop' : 'continuity_asset',
      role,
      summary: 'Shot-scoped visual reference resolved from the sequence animatic graph.',
      visualDescription: 'Use this attached reference for identity, spatial, material, lighting, and continuity grounding.',
      assetKeys: [assetKey],
      primaryAssetKey: assetKey,
      selectedReferenceAssetKey: assetKey,
      selectedReferenceVariantKey: role,
      selectedReferenceVariantLabel: label,
      selectedReferenceVariantType: 'continuity_asset',
      referenceSelectionReason: 'Resolved by the shot production graph.',
    }
  }).filter((entity) => helpers.readText(entity.primaryAssetKey))
  const scopedReferenceAssetKeys = [...new Set([
    ...helpers.readStringArray(config.requiredReferenceAssetKeys),
    ...referenceAssetKeys,
  ])]
  const assetPack = helpers.orderSequenceAnimaticAssetPackReferences(helpers.scopeAssetPackToReferenceAssetKeys({
    assetPack: rawAssetPack,
    referenceAssetKeys: scopedReferenceAssetKeys.length > 0 ? scopedReferenceAssetKeys : referenceAssetKeys,
    fallbackEntities,
    referenceScope: 'sequence_animatic_shot_production',
    limit: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8)),
  }))
  const coverageAnchor = references.find((reference) => helpers.readText(reference.role) === 'coverage_anchor')
  const previousKeyframe = references.find((reference) => helpers.readText(reference.role) === 'previous_keyframe')
  const storyboardPanel = references.find((reference) => helpers.readText(reference.role) === 'storyboard_panel')
  const coverageAnchorImage = coverageAnchor ? imageByAssetKey.get(helpers.readText(coverageAnchor.assetKey)) ?? null : null
  const previousKeyframeImage = previousKeyframe ? imageByAssetKey.get(helpers.readText(previousKeyframe.assetKey)) ?? null : null
  const storyboardPanelImage = storyboardPanel ? imageByAssetKey.get(helpers.readText(storyboardPanel.assetKey)) ?? null : null
  const primaryImage = coverageAnchorImage ?? storyboardPanelImage ?? previousKeyframeImage ?? upstreamImages[0] ?? null
  const referenceManifest = helpers.sequenceAnimaticReferenceManifestEntries(assetPack)
  const referenceManifestText = helpers.sequenceAnimaticReferenceManifestText(assetPack)
  const outputs = {
    shot,
    shots: Object.keys(shot).length > 0 ? [shot] : [],
    assetPack,
    asset_pack: assetPack,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    references,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    coverageAnchor: coverageAnchorImage ? { ...coverageAnchorImage, ...helpers.asRecord(coverageAnchor) } : coverageAnchor ?? {},
    coverage_anchor: coverageAnchorImage ? { ...coverageAnchorImage, ...helpers.asRecord(coverageAnchor) } : coverageAnchor ?? {},
    previousKeyframe: previousKeyframeImage ? { ...previousKeyframeImage, ...helpers.asRecord(previousKeyframe) } : previousKeyframe ?? {},
    previous_keyframe: previousKeyframeImage ? { ...previousKeyframeImage, ...helpers.asRecord(previousKeyframe) } : previousKeyframe ?? {},
    storyboardPanel: storyboardPanelImage ? { ...storyboardPanelImage, ...helpers.asRecord(storyboardPanel) } : storyboardPanel ?? {},
    storyboard_panel: storyboardPanelImage ? { ...storyboardPanelImage, ...helpers.asRecord(storyboardPanel) } : storyboardPanel ?? {},
    ...(primaryImage ? { image: primaryImage, keyframe: primaryImage, primaryReferenceImage: primaryImage } : {}),
    text: JSON.stringify({ shot, references, referenceAssetKeys }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-reference-pack-v1' })
}

async function sequenceAnimaticBlockInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const block = helpers.asRecord(config.block)
  const shotPlan = cinematicV2ShotPlanSchema.parse(config.shotPlan)
  const storyboardGroup = helpers.asRecord(config.storyboardGroup)
  const storyboardLayout = helpers.asRecord(config.storyboardLayout)
  const assetPack = helpers.asRecord(config.assetPack)
  const manifestSummary = helpers.asRecord(config.manifestSummary)
  const outputs = {
    block,
    shotPlan,
    shot_plan: shotPlan,
    storyboardGroup,
    storyboardGroupId: helpers.readText(storyboardGroup.id) || helpers.readText(block.id),
    storyboardLayout,
    assetPack,
    asset_pack: assetPack,
    manifestSummary,
    screenplayAnimaticRole: 'storyboard_block',
    sequenceAnimaticRole: 'storyboard_block',
    text: JSON.stringify({
      block,
      shotPlan,
      storyboardGroup,
      storyboardLayout,
    }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-block-input-v1' })
}

async function sequenceAnimaticBlockArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const block = helpers.readFirstUpstreamRecord(context.upstream, ['block'])
  const shotPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan'])
  const panels = helpers.readFirstUpstreamArray(context.upstream, ['panels'])
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-block`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${context.node.label} Manifest`,
    summary: 'Sequence animatic storyboard block manifest with panels and video prompt.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-block-artifact-v1',
      role: 'sequence_animatic_block_manifest',
      sequenceAnimaticRole: 'storyboard_block',
      parentRequestId: helpers.readText(config.parentRequestId) || helpers.readText(helpers.asRecord(context.workflow.metadata).parentRequestId) || null,
      sequenceUnitKey: helpers.readText(config.sequenceUnitKey) || helpers.readText(helpers.asRecord(context.workflow.metadata).sequenceUnitKey) || null,
      storyboardBlockId: helpers.readText(config.storyboardBlockId) || helpers.readText(block.id) || null,
      block,
      shotPlan,
      panelAssetKeys: panels.map((panel) => helpers.readText(helpers.asRecord(panel).assetKey)).filter(Boolean),
      panelCount: panels.length,
      videoPromptHash: prompt ? helpers.hashOutputWorkflowValue(prompt) : '',
    },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: '',
    artifact,
    artifacts: [artifact],
    block,
    shotPlan,
    panels,
    videoPrompt: prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-block-artifact-v1' })
}

async function sequenceAnimaticScenePlanFanout(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const compileOutputs = {
    screenplayDraft: helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft']),
    scenePackage: helpers.readFirstUpstreamRecord(context.upstream, ['scenePackage', 'scene_package']),
    cinematicReferencePlan: helpers.readFirstUpstreamRecord(context.upstream, ['cinematicReferencePlan', 'cinematic_reference_plan']),
    compileHash: helpers.readText(config.compileHash),
  }
  const fanout = await materializeSequenceAnimaticScenePlanFanoutRuntime({
    context: {
      client: context.client,
      run: context.run,
      workflow: context.workflow,
    },
    compileOutputs,
    config,
    helpers,
  })
  const outputs = {
    dynamicGraphExpanded: fanout.expanded,
    graphExpanded: fanout.expanded,
    compileHash: fanout.compileHash,
    sceneCount: fanout.sceneCount,
    scene_count: fanout.sceneCount,
    text: fanout.expanded
      ? `Materialized ${fanout.sceneCount} parallel scene shot planner node(s), merge, manifest, and orchestrator.`
      : `Scene shot planner graph already materialized for ${fanout.sceneCount} scene(s).`,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-scene-plan-fanout-v1' })
}

async function sequenceAnimaticScenePackageAssignment(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
  purpose: 'sequence_animatic_scene_package' | 'sequence_animatic_scene_graph_assignment',
) {
  const executed = await runSequenceAnimaticScenePackageAssignmentRuntime({
    context: {
      client: context.client,
      run: context.run,
      workflow: context.workflow,
      node: context.node,
      upstream: context.upstream,
      shouldCancel: context.shouldCancel,
      onProgress: context.onProgress,
    },
    helpers,
    purpose,
  })
  return result({
    context,
    helpers,
    outputs: executed.outputs,
    provider: executed.provider,
    model: executed.model,
    providerRequestId: executed.providerRequestId || undefined,
  })
}

async function sequenceAnimaticScenePackage(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return sequenceAnimaticScenePackageAssignment(context, helpers, 'sequence_animatic_scene_package')
}

async function sequenceAnimaticSceneGraphAssignment(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return sequenceAnimaticScenePackageAssignment(context, helpers, 'sequence_animatic_scene_graph_assignment')
}

async function sequenceAnimaticSceneShotPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const executed = await runSequenceAnimaticSceneShotPlanRuntime({
    context: {
      client: context.client,
      run: context.run,
      workflow: context.workflow,
      node: context.node,
      upstream: context.upstream,
      shouldCancel: context.shouldCancel,
      onProgress: context.onProgress,
    },
    helpers,
  })
  return result({
    context,
    helpers,
    outputs: executed.outputs,
    provider: executed.provider,
    model: executed.model,
    providerRequestId: executed.providerRequestId || undefined,
  })
}

async function sequenceAnimaticDirectorPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const executed = await runSequenceAnimaticDirectorPlanRuntime({
    context: {
      client: context.client,
      run: context.run,
      workflow: context.workflow,
      node: context.node,
      upstream: context.upstream,
      shouldCancel: context.shouldCancel,
      onProgress: context.onProgress,
    },
    helpers,
  })
  return result({
    context,
    helpers,
    outputs: executed.outputs,
    provider: executed.provider,
    model: executed.model,
    providerRequestId: executed.providerRequestId || undefined,
  })
}

async function sequenceAnimaticSceneInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const scenePackageOutput = helpers.parseSequenceAnimaticScenePackageOutput(helpers.asRecord(config.scenePackage))
  const screenplayText = helpers.readText(config.sceneScreenplayText) || helpers.readText(config.screenplayText)
  if (!screenplayText) throw new Error('Sequence animatic scene input requires the authored screenplay text.')
  const screenplayDraft = { screenplayMarkdown: screenplayText, text: screenplayText }
  const assetPack = helpers.asRecord(config.sceneAssetPack ?? config.assetPack)
  const worldContext = helpers.asRecord(config.sceneContext ?? config.context)
  const guidance = helpers.asRecord(config.sceneGuidance)
  const outputs = {
    scenePackage: scenePackageOutput,
    scene_package: scenePackageOutput,
    screenplayDraft,
    screenplay_draft: screenplayDraft,
    screenplay: screenplayDraft,
    assetPack,
    asset_pack: assetPack,
    context: worldContext,
    guidance,
    sceneId: helpers.readText(config.sceneId),
    sceneIndex: Number(config.sceneIndex ?? 0) || 0,
    text: screenplayText,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-scene-input-v1' })
}

async function sequenceAnimaticSceneRegister(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const scenePackageOutput = helpers.parseSequenceAnimaticScenePackageOutput(
    helpers.readFirstUpstreamRecord(context.upstream, ['scenePackage', 'scene_package']),
  )
  const scenePackages = scenePackageOutput.scenePackages.length > 0
    ? scenePackageOutput.scenePackages.map(helpers.asRecord)
    : helpers.readArray((scenePackageOutput as LooseRecord).screenplayScenes ?? (scenePackageOutput as LooseRecord).screenplay_scenes).map(helpers.asRecord)
  if (scenePackages.length === 0) throw new Error('Sequence animatic scene registration requires at least one screenplay scene.')
  const orderedScenes = [...scenePackages].sort((left, right) => (Number(left.index) || 9999) - (Number(right.index) || 9999))
  const registerConfig = helpers.asRecord(context.node.config)
  const scenes = orderedScenes.map((scene, index) => ({
    id: helpers.readText(scene.sceneId ?? scene.scene_id) || `scene_${String(index + 1).padStart(3, '0')}`,
    index: Number(scene.index) || index + 1,
    title: helpers.readText(scene.title) || `Scene ${index + 1}`,
    summary: helpers.compactSequenceAnimaticText(scene.sourceText ?? scene.source_text, 280),
    setId: helpers.readText(scene.setId ?? scene.set_id),
    zoneId: helpers.readText(scene.zoneId ?? scene.zone_id),
    worldLocationRefId: helpers.readText(scene.worldLocationRefId ?? scene.world_location_ref_id ?? scene.locationRefId ?? scene.location_ref_id),
    dialogueRowCount: helpers.readArray(scene.dialogueRows ?? scene.dialogue_rows).length,
    autoStart: index === 0 && registerConfig.autoStartFirstScene === true,
  }))
  const runMetadata = helpers.asRecord((context.run as { metadata?: unknown }).metadata)
  const outputRequestId = helpers.readText(runMetadata.outputRequestId) || helpers.readText(runMetadata.masterRequestId)
  if (outputRequestId) {
    await helpers.insertSequenceAnimaticEvent({
      client: context.client,
      projectId: context.run.projectId,
      draftId: context.run.draftId,
      requestId: outputRequestId,
      workflowId: context.workflow.id,
      runId: context.run.id,
      eventType: 'scenes_registered',
      payload: { sceneCount: scenes.length, scenes },
      metadata: { source: 'sequence_animatic_scene_register' },
      dedupe: { source: 'sequence_animatic_scene_register' },
    }).catch(() => null)
    for (const scene of scenes) {
      await helpers.insertSequenceAnimaticEvent({
        client: context.client,
        projectId: context.run.projectId,
        draftId: context.run.draftId,
        requestId: outputRequestId,
        workflowId: context.workflow.id,
        runId: context.run.id,
        eventType: 'scene_registered',
        payload: scene,
        metadata: { source: 'sequence_animatic_scene_register' },
        dedupe: { id: scene.id },
      }).catch(() => null)
    }
    const graphAdditions = helpers.readArray(scenePackageOutput.sceneGraphDraft?.additions).map(helpers.asRecord)
    const nodePayloadByKind = (addition: LooseRecord) => {
      const base = {
        id: helpers.readText(addition.id),
        name: helpers.readText(addition.name),
        visualBrief: helpers.readText(addition.visualBrief ?? addition.visual_brief),
        worldLocationRefId: helpers.readText(addition.worldLocationRefId ?? addition.world_location_ref_id),
      }
      const kind = helpers.readText(addition.kind)
      if (kind === 'set') return { ...base, nodeKind: 'set', worldLocationRefId: helpers.readText(addition.worldLocationRefId ?? addition.world_location_ref_id ?? addition.parentId ?? addition.parent_id) }
      if (kind === 'zone') return { ...base, nodeKind: 'zone', setId: helpers.readText(addition.setId ?? addition.set_id ?? addition.parentId ?? addition.parent_id) }
      if (kind === 'spot') return { ...base, nodeKind: 'spot', setId: helpers.readText(addition.setId ?? addition.set_id), zoneId: helpers.readText(addition.zoneId ?? addition.zone_id ?? addition.parentId ?? addition.parent_id) }
      return {
        ...base,
        nodeKind: 'angle',
        setId: helpers.readText(addition.setId ?? addition.set_id),
        zoneId: helpers.readText(addition.zoneId ?? addition.zone_id),
        spotIds: helpers.readText(addition.spotId ?? addition.spot_id) ? [helpers.readText(addition.spotId ?? addition.spot_id)] : [],
      }
    }
    for (const addition of graphAdditions) {
      const nodeId = helpers.readText(addition.id)
      if (!nodeId) continue
      await helpers.insertSequenceAnimaticEvent({
        client: context.client,
        projectId: context.run.projectId,
        draftId: context.run.draftId,
        requestId: outputRequestId,
        workflowId: context.workflow.id,
        runId: context.run.id,
        eventType: 'scene_graph_node_registered',
        payload: { nodeId, node: nodePayloadByKind(addition) },
        metadata: { source: 'sequence_animatic_scene_register' },
        dedupe: { nodeId },
      }).catch(() => null)
    }
  }
  const sceneIndex = {
    role: 'sequence_animatic_scene_index',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    sequenceAnimaticRole: 'scene_index',
    screenplayAnimaticRole: 'scene_index',
    requestId: outputRequestId || null,
    workflowId: context.workflow.id,
    runId: context.run.id,
    sceneCount: scenes.length,
    scenes,
    scenePackageOutput,
  }
  const outputs = {
    scenes,
    sceneCount: scenes.length,
    scene_count: scenes.length,
    sceneIndex,
    sequence_animatic_scene_index: sceneIndex,
    scenePackage: scenePackageOutput,
    scene_package: scenePackageOutput,
    planningDefaults: {
      maxShotCount: Number(registerConfig.maxShotCount ?? 0) || 150,
      aspectRatio: helpers.readText(registerConfig.aspectRatio) || '16:9',
      resolution: helpers.readText(registerConfig.resolution) || '720p',
      autoStartFirstScene: registerConfig.autoStartFirstScene === true,
    },
    text: JSON.stringify({ sceneCount: scenes.length, scenes }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-scene-register-v1' })
}

async function sequenceAnimaticOrchestrator(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const outputs = await runSequenceAnimaticOrchestratorRuntime({
    context: {
      client: context.client,
      run: context.run,
      workflow: context.workflow,
      node: context.node,
      upstream: context.upstream,
    },
    helpers,
  })
  return result({ context, helpers, outputs, model: 'sequence-animatic-orchestrator-v1' })
}

async function sequenceAnimaticScenePlanMerge(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  // Prefer the scene_input/master node's full scene-package output. Scene shot
  // plan nodes also emit scenePackage, but those are single tagged scenes.
  const scenePackageOutput = helpers.parseSequenceAnimaticScenePackageOutput(
    helpers.readPreferredUpstreamRecord(context.upstream, ['scene_input'], ['scenePackage', 'scene_package']),
  )
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const scenePlanEntries = Object.entries(context.upstream)
    .map(([nodeKey, outputs]) => ({
      nodeKey,
      sourceSceneIndex: Number(outputs.sourceSceneIndex ?? outputs.source_scene_index ?? 0) || 0,
      sourceSceneId: helpers.readText(outputs.sceneId ?? outputs.scene_id),
      plan: helpers.asRecord(outputs.directorPlan ?? outputs.director_plan ?? outputs.shotContinuityPlan ?? outputs.shot_continuity_plan ?? outputs.sceneShotPlan ?? outputs.scene_shot_plan),
    }))
    .filter((entry) => Object.keys(entry.plan).length > 0 && helpers.readArray(entry.plan.shots).length > 0)
    .sort((left, right) => (left.sourceSceneIndex || 9999) - (right.sourceSceneIndex || 9999) || left.nodeKey.localeCompare(right.nodeKey))
  if (scenePlanEntries.length === 0) throw new Error('Scene shot plan merge requires completed scene shot plans.')

  const shots: LooseRecord[] = []
  const blocks: LooseRecord[] = []
  const shotIdMap = new Map<string, string>()
  const blockIdMap = new Map<string, string>()
  const scenePackageById = new Map(scenePackageOutput.scenePackages.map((scene) => [scene.sceneId, scene] as const))
  const preserveSceneScopedIds = helpers.asRecord(context.node.config).preserveSceneScopedIds === true
  let globalShotIndex = 1
  let globalBlockIndex = 1

  for (const entry of scenePlanEntries) {
    const sceneId = entry.sourceSceneId || helpers.readText(entry.plan.sourceSceneId) || `scene_${String(entry.sourceSceneIndex || globalBlockIndex).padStart(3, '0')}`
    const planBlocks = helpers.readArray(entry.plan.blocks).map(helpers.asRecord)
    const planShots = helpers.readArray(entry.plan.shots).map(helpers.asRecord)
    for (const block of planBlocks) {
      const oldBlockId = helpers.readText(block.id) || `${sceneId}_block_${String(globalBlockIndex).padStart(3, '0')}`
      const newBlockId = preserveSceneScopedIds ? oldBlockId : `block_${String(globalBlockIndex).padStart(3, '0')}`
      blockIdMap.set(`${sceneId}:${oldBlockId}`, newBlockId)
      globalBlockIndex += 1
    }
    for (const shot of planShots) {
      const oldShotId = helpers.readText(shot.id) || `${sceneId}_shot_${String(globalShotIndex).padStart(3, '0')}`
      const newShotId = preserveSceneScopedIds ? oldShotId : `shot_${String(globalShotIndex).padStart(3, '0')}`
      shotIdMap.set(`${sceneId}:${oldShotId}`, newShotId)
      globalShotIndex += 1
    }
  }

  globalShotIndex = 1
  globalBlockIndex = 1
  for (const entry of scenePlanEntries) {
    const sceneId = entry.sourceSceneId || helpers.readText(entry.plan.sourceSceneId) || `scene_${String(entry.sourceSceneIndex || globalBlockIndex).padStart(3, '0')}`
    const scenePackage = scenePackageById.get(sceneId) ?? scenePackageOutput.scenePackages.find((scene) => scene.index === entry.sourceSceneIndex) ?? null
    const planBlocks = helpers.readArray(entry.plan.blocks).map(helpers.asRecord)
    const planShots = helpers.readArray(entry.plan.shots).map(helpers.asRecord)
    for (const block of planBlocks) {
      const oldBlockId = helpers.readText(block.id) || `${sceneId}_block_${String(globalBlockIndex).padStart(3, '0')}`
      const newBlockId = blockIdMap.get(`${sceneId}:${oldBlockId}`) || `block_${String(globalBlockIndex).padStart(3, '0')}`
      const mappedShotIds = helpers.readStringArray(block.shotIds ?? block.shot_ids)
        .map((shotId) => shotIdMap.get(`${sceneId}:${shotId}`))
        .filter((shotId): shotId is string => Boolean(shotId))
      blocks.push({
        ...block,
        id: newBlockId,
        index: globalBlockIndex,
        title: helpers.readText(block.title) || `Scene ${entry.sourceSceneIndex || globalBlockIndex}`,
        summary: helpers.readText(block.summary) || helpers.readText(block.title),
        shotIds: mappedShotIds,
        sourceSceneId: sceneId,
      })
      globalBlockIndex += 1
    }
    for (const shot of planShots) {
      const oldShotId = helpers.readText(shot.id) || `${sceneId}_shot_${String(globalShotIndex).padStart(3, '0')}`
      const oldBlockId = helpers.readText(shot.blockId) || helpers.readText(shot.storyboardBlockId)
      const planShotBindings = helpers.asRecord(entry.plan.shotBindings ?? entry.plan.shot_bindings)
      const shotBinding = helpers.asRecord(planShotBindings[oldShotId])
      const rawSceneBinding = helpers.asRecord(shot.sceneBinding ?? shot.scene_binding)
      const sceneBinding = {
        ...rawSceneBinding,
        worldLocationRefId: helpers.readText(rawSceneBinding.worldLocationRefId ?? rawSceneBinding.world_location_ref_id)
          || helpers.readText(shot.worldLocationRefId ?? shot.world_location_ref_id ?? shot.locationRefId ?? shot.location_ref_id)
          || helpers.readText(shotBinding.worldLocationRefId ?? shotBinding.world_location_ref_id)
          || scenePackage?.worldLocationRefId
          || scenePackage?.locationRefId
          || '',
        setId: helpers.readText(rawSceneBinding.setId ?? rawSceneBinding.set_id)
          || helpers.readText(shot.continuitySetId ?? shot.continuity_set_id)
          || helpers.readText(shotBinding.setId ?? shotBinding.set_id)
          || scenePackage?.setId
          || '',
        zoneId: helpers.readText(rawSceneBinding.zoneId ?? rawSceneBinding.zone_id)
          || helpers.readText(shot.continuityZoneId ?? shot.continuity_zone_id)
          || helpers.readText(shotBinding.zoneId ?? shotBinding.zone_id)
          || scenePackage?.zoneId
          || '',
        primarySpotId: helpers.readText(rawSceneBinding.primarySpotId ?? rawSceneBinding.primary_spot_id)
          || helpers.readText(shot.primarySpotId ?? shot.primary_spot_id)
          || helpers.readText(shotBinding.primarySpotId ?? shotBinding.primary_spot_id)
          || scenePackage?.spotIds[0]
          || '',
        spotIds: helpers.sequenceAnimaticUniqueTexts([
          rawSceneBinding.spotIds,
          rawSceneBinding.spot_ids,
          shot.continuitySpotIds,
          shot.continuity_spot_ids,
          shotBinding.spotIds,
          shotBinding.spot_ids,
          scenePackage?.spotIds ?? [],
        ]),
        viewpointId: helpers.readText(rawSceneBinding.viewpointId ?? rawSceneBinding.viewpoint_id)
          || helpers.readText(shot.viewpointId ?? shot.viewpoint_id ?? shot.continuityAngleId ?? shot.continuity_angle_id)
          || helpers.readText(shotBinding.viewpointId ?? shotBinding.viewpoint_id ?? shotBinding.angleId ?? shotBinding.angle_id),
        localReferenceIds: helpers.sequenceAnimaticUniqueTexts([
          rawSceneBinding.localReferenceIds,
          rawSceneBinding.local_reference_ids,
          shot.localReferenceIds,
          shot.local_reference_ids,
          shotBinding.localReferenceIds,
          shotBinding.local_reference_ids,
        ]),
      }
      if (!sceneBinding.primarySpotId && sceneBinding.spotIds.length > 0) {
        sceneBinding.primarySpotId = sceneBinding.spotIds[0]
      }
      const newShotId = shotIdMap.get(`${sceneId}:${oldShotId}`) || `shot_${String(globalShotIndex).padStart(3, '0')}`
      const newBlockId = blockIdMap.get(`${sceneId}:${oldBlockId}`)
        || blocks.find((block) => helpers.readStringArray(block.shotIds).includes(newShotId))?.id
        || `block_${String(Math.max(1, globalBlockIndex - 1)).padStart(3, '0')}`
      const continuityLink = helpers.asRecord(shot.continuityLink ?? shot.continuity_link)
      const continuityLinkFromShotId = helpers.readText(continuityLink.fromShotId ?? continuityLink.from_shot_id)
      const remappedContinuityLink = Object.keys(continuityLink).length > 0
        ? {
          ...continuityLink,
          fromShotId: continuityLinkFromShotId
            ? shotIdMap.get(`${sceneId}:${continuityLinkFromShotId}`) || continuityLinkFromShotId
            : '',
          from_shot_id: continuityLinkFromShotId
            ? shotIdMap.get(`${sceneId}:${continuityLinkFromShotId}`) || continuityLinkFromShotId
            : '',
        }
        : continuityLink
      shots.push({
        ...shot,
        id: newShotId,
        index: globalShotIndex,
        blockId: newBlockId,
        storyboardBlockId: newBlockId,
        coverageSetupId: '',
        coverage_setup_id: '',
        continuityLink: remappedContinuityLink,
        continuity_link: remappedContinuityLink,
        sceneBinding,
        scene_binding: sceneBinding,
        sourceSceneId: sceneId,
        sourceSceneShotId: oldShotId,
      })
      globalShotIndex += 1
    }
  }

  const mergeSceneGraphArray = (field: string) => helpers.mergeById(scenePlanEntries.flatMap((entry) => helpers.readArray(helpers.asRecord(entry.plan.sceneGraphAdditions)[field]).map(helpers.asRecord)))
  const localReferences = helpers.mergeById(scenePlanEntries.flatMap((entry) => helpers.readArray(entry.plan.localReferences ?? entry.plan.outputLocalReferences).map(helpers.asRecord)))
  const coverageSetups: LooseRecord[] = []
  const mergedV2 = helpers.parseSequenceAnimaticShotContinuityPlanV2({
    role: 'sequence_animatic_director_plan',
    contractVersion: 'shot_continuity_plan_v2',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'director_plan',
    sequenceAnimaticRole: 'director_plan',
    planningMode: 'single_director_pass',
    screenplaySummary: `Merged ${scenePlanEntries.length} scene-scoped shot plan${scenePlanEntries.length === 1 ? '' : 's'}.`,
    shots,
    blocks: blocks.filter((block) => helpers.readStringArray(block.shotIds).length > 0),
    sceneGraphAdditions: {
      sets: helpers.mergeById([
        ...scenePackageOutput.sceneGraphDraft.additions.filter((addition) => addition.kind === 'set').map((addition) => ({ id: addition.id, worldLocationRefId: addition.worldLocationRefId || addition.parentId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('sets'),
      ]),
      zones: helpers.mergeById([
        ...scenePackageOutput.sceneGraphDraft.additions.filter((addition) => addition.kind === 'zone').map((addition) => ({ id: addition.id, setId: addition.setId || addition.parentId, worldLocationRefId: addition.worldLocationRefId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('zones'),
      ]),
      spots: helpers.mergeById([
        ...scenePackageOutput.sceneGraphDraft.additions.filter((addition) => addition.kind === 'spot').map((addition) => ({ id: addition.id, setId: addition.setId, zoneId: addition.zoneId || addition.parentId, worldLocationRefId: addition.worldLocationRefId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('spots'),
      ]),
      viewpoints: helpers.mergeById([
        ...scenePackageOutput.sceneGraphDraft.additions.filter((addition) => addition.kind === 'viewpoint').map((addition) => ({ id: addition.id, setId: addition.setId, zoneId: addition.zoneId, spotIds: [addition.spotId].filter(Boolean), worldLocationRefId: addition.worldLocationRefId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('viewpoints'),
      ]),
      angles: mergeSceneGraphArray('angles'),
      edges: mergeSceneGraphArray('edges'),
    },
    coverageSetups,
    localReferences,
    notes: scenePlanEntries.flatMap((entry) => helpers.readStringArray(entry.plan.notes)),
  })
  const runMetadata = helpers.asRecord((context.run as { metadata?: unknown }).metadata)
  const manifest = {
    role: 'sequence_animatic_director_source',
    requestId: runMetadata.outputRequestId ?? runMetadata.masterRequestId ?? null,
    workflowId: context.workflow.id,
    runId: context.run.id,
    screenplayDraft,
    screenplayMarkdown: helpers.readText(screenplayDraft.screenplayMarkdown) || helpers.readText(screenplayDraft.markdown) || helpers.readText(screenplayDraft.text),
    scenePackageOutput,
    assetPack,
  }
  const animaticReferenceCatalog = helpers.sequenceAnimaticReferenceCatalog({
    animaticReferenceCatalog: helpers.readFirstUpstreamRecord(context.upstream, ['animaticReferenceCatalog', 'animatic_reference_catalog']),
    assetPack,
  })
  const continuityPlannerContext = helpers.buildSequenceAnimaticContinuityPlannerContext({
    screenplayDraft,
    shotPlan: {},
    shotBreakPlan: {},
    assetPack,
    animaticReferenceCatalog,
  })
  const directorPlan = helpers.normalizeSequenceAnimaticDirectorPlan({
    rawPlan: mergedV2,
    manifest,
    manifestHash: helpers.hashOutputWorkflowValue(manifest),
    masterManifestArtifactKey: `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-merged-shot-plan`,
    continuityPlannerContext,
  })
  const shotPlan = {
    sceneId: 'sequence_animatic_master',
    shots: directorPlan.shots,
    totalEditorialDurationSeconds: directorPlan.shots.reduce((total, shot) => total + (Number(helpers.asRecord(shot).editorialDurationSeconds) || 0), 0),
  }
  const outputs = {
    directorPlan,
    director_plan: directorPlan,
    shotContinuityPlan: directorPlan,
    shot_continuity_plan: directorPlan,
    shotPlan,
    shot_plan: shotPlan,
    blocks: directorPlan.blocks,
    continuityGraphV2: directorPlan.continuityGraphV2,
    continuity_graph_v2: directorPlan.continuityGraphV2,
    shotBindings: directorPlan.shotBindings,
    shot_bindings: directorPlan.shotBindings,
    scenePackage: scenePackageOutput,
    scene_package: scenePackageOutput,
    text: JSON.stringify(directorPlan, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-scene-plan-merge-v1' })
}

async function sequenceAnimaticManifest(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const directorPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
  const workflowMetadata = helpers.asRecord(context.workflow.metadata)
  const runMetadata = helpers.asRecord((context.run as { metadata?: unknown }).metadata)
  const screenplayAnimaticSource = helpers.readText(workflowMetadata.screenplayAnimaticSource)
    || (helpers.readText(workflowMetadata.cinematicAnimaticMode) === 'prompt_cinematic_master' ? 'prompt_cinematic' : 'wiki_sequence_unit')

  if (Object.keys(directorPlan).length > 0) {
    const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
    const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
    const worldContext = helpers.readFirstUpstreamRecord(context.upstream, ['context'])
    if (!Object.keys(screenplayDraft).length) throw new Error('Sequence animatic manifest requires the authored screenplay.')
    if (!Object.keys(assetPack).length) throw new Error('Sequence animatic manifest requires the visual reference asset pack.')

    const selectedVisualReferenceKeys = helpers.cinematicAssetPackEntityKeys(assetPack)
    const animaticReferenceCatalog = helpers.buildSequenceAnimaticReferenceCatalog({ context: worldContext, assetPack })
    const rawShotPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotPlan', 'shot_plan'])
    const directorShots = helpers.readArray(directorPlan.shots).map(helpers.asRecord)
    if (directorShots.length === 0) throw new Error('Sequence animatic manifest requires shot-continuity-owned shots.')
    const parsedShotPlan = helpers.safeParseSequenceAnimaticShotPlan(rawShotPlan)
    const shotPlan = parsedShotPlan.success
      ? parsedShotPlan.data
      : helpers.parseSequenceAnimaticShotPlan({
        sceneId: 'sequence_animatic_master',
        totalEditorialDurationSeconds: directorShots.reduce((total, shot) => total + (Number(shot.editorialDurationSeconds) || 0), 0),
        shots: directorShots,
        performanceArc: [],
        audioPlan: { ambience: '', music: '', sfx: [], dialogueTrackCount: 0, placeholderOnly: true },
        diagnostics: ['Built shot plan from authoritative shot continuity plan shots.'],
      })
    const shotById = new Map(shotPlan.shots.map((shot) => [helpers.readText(shot.id), shot] as const).filter(([shotId]) => shotId))
    const coverageSetups = helpers.readArray(directorPlan.coverageSetups ?? directorPlan.coverage_setups).map(helpers.asRecord)
    const coverageSetupById = new Map(coverageSetups.map((setup) => [helpers.readText(setup.id), setup] as const).filter(([id]) => id))
    let cursor = 0
    const blocks = helpers.readArray(directorPlan.blocks).map(helpers.asRecord).map((block, index) => {
      const blockId = helpers.readText(block.id) || `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`
      const shotIds = helpers.readStringArray(block.shotIds ?? block.shot_ids).filter((shotId) => shotById.has(shotId))
      const blockShots = shotIds.map((shotId) => shotById.get(shotId)).filter((shot): shot is LooseRecord => Boolean(shot))
      if (blockShots.length === 0) throw new Error(`Sequence animatic shot continuity block ${blockId} has no valid shots.`)
      const layout = helpers.buildCinematicV3StoryboardLayout(blockShots.length)
      const duration = blockShots.reduce((total, shot) => total + (Number(shot.editorialDurationSeconds) || 0), 0)
      const startSeconds = cursor
      const endSeconds = startSeconds + duration
      cursor = endSeconds
      const summary = helpers.readText(block.summary) || blockShots.map((shot) => helpers.readText(shot.title)).filter(Boolean).join(' / ')
      const blockCoverageSetupIds = [...new Set(blockShots.map((shot) => helpers.readText(shot.coverageSetupId ?? shot.coverage_setup_id)).filter(Boolean))]
      const blockCoverageSetups = blockCoverageSetupIds.map((setupId) => coverageSetupById.get(setupId)).filter((setup): setup is LooseRecord => Boolean(setup))
      const storyboardGroup = {
        id: blockId,
        index: Number(block.index ?? index + 1) || index + 1,
        shotIds,
        summary,
        rows: layout.rows,
        columns: layout.columns,
        panelCount: layout.panelCount,
        startSeconds,
        endSeconds,
        editorialDurationSeconds: duration,
        providerDurationSeconds: providerSafeCinematicV2DurationSeconds(duration),
        coverageSetupIds: blockCoverageSetupIds,
        coverageSetups: blockCoverageSetups,
        continuityNotes: [
          ...helpers.readStringArray(block.continuityNotes ?? block.continuity_notes),
          helpers.readText(block.summary),
          ...blockCoverageSetups.slice(0, 8).map((setup) => `Coverage ${helpers.readText(setup.id)}: ${helpers.readText(setup.title) || helpers.readText(setup.setupKind)}; ${helpers.readText(setup.screenDirection ?? setup.screen_direction)}; ${helpers.readText(setup.stagingBrief ?? setup.staging_brief)}`),
        ].filter(Boolean),
      }
      return {
        ...block,
        id: blockId,
        index: Number(block.index ?? index + 1) || index + 1,
        title: helpers.readText(block.title) || summary || `Storyboard block ${index + 1}`,
        summary,
        sourceText: helpers.readText(block.sourceText ?? block.source_text),
        shotIds,
        shots: blockShots,
        coverageSetupIds: blockCoverageSetupIds,
        coverageSetups: blockCoverageSetups,
        continuityAnchorIds: [...new Set(blockShots.flatMap((shot) => helpers.readStringArray(shot.continuityAnchorIds)))],
        storyboardGroup,
        storyboardLayout: { rows: layout.rows, columns: layout.columns, panelCount: layout.panelCount },
        durationSeconds: duration,
        startSeconds,
        endSeconds,
        childRequestId: null,
        childWorkflowId: null,
      }
    })
    if (blocks.length === 0) throw new Error('Sequence animatic manifest requires shot-continuity-owned storyboard blocks.')

    const roughShotBreakPlan = helpers.readFirstUpstreamRecord(context.upstream, ['roughShotBreakPlan', 'rough_shot_break_plan', 'shotBreakPlan', 'shot_break_plan'])
    const directorPlanHash = helpers.readText(directorPlan.shotPlanHash) || sequenceAnimaticStableHash(directorPlan)
    const continuityGraphV2 = helpers.asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2)
    const shotBindings = helpers.asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings)
    const manifest = {
      role: 'sequence_animatic_manifest',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      screenplayAnimaticRole: 'master',
      screenplayAnimaticSource,
      sequenceAnimaticRole: 'master',
      requestId: runMetadata.outputRequestId ?? null,
      workflowId: context.workflow.id,
      runId: context.run.id,
      screenplayDraft,
      screenplayMarkdown: helpers.readText(screenplayDraft.screenplayMarkdown) || helpers.readText(screenplayDraft.markdown) || helpers.readText(screenplayDraft.text),
      shotBreakPlan: roughShotBreakPlan,
      roughShotBreakPlan,
      shotPlan,
      blocks,
      assetPack,
      selectedReferences: assetPack,
      selectedVisualReferenceKeys,
      animaticReferenceCatalog,
      directorPlan,
      directorPlanHash,
      shotContinuityPlan: directorPlan,
      shotContinuityPlanHash: directorPlanHash,
      continuityGraphV2,
      shotBindings,
      diagnostics: [
        ...helpers.readStringArray(directorPlan.diagnostics),
        `Built final sequence animatic manifest from shot continuity plan with ${blocks.length} storyboard block${blocks.length === 1 ? '' : 's'} and ${shotPlan.shots.length} shot${shotPlan.shots.length === 1 ? '' : 's'}.`,
      ],
    }
    const outputs = {
      manifest,
      sequenceAnimaticManifest: manifest,
      sequence_animatic_manifest: manifest,
      screenplayDraft,
      screenplay_draft: screenplayDraft,
      shotBreakPlan: roughShotBreakPlan,
      shot_break_plan: roughShotBreakPlan,
      shotPlan,
      shot_plan: shotPlan,
      blocks,
      assetPack,
      asset_pack: assetPack,
      selectedVisualReferenceKeys,
      selected_visual_reference_keys: selectedVisualReferenceKeys,
      animaticReferenceCatalog,
      animatic_reference_catalog: animaticReferenceCatalog,
      directorPlan,
      director_plan: directorPlan,
      shotContinuityPlan: directorPlan,
      shot_continuity_plan: directorPlan,
      continuityGraphV2,
      continuity_graph_v2: continuityGraphV2,
      shotBindings,
      shot_bindings: shotBindings,
      text: JSON.stringify(manifest, null, 2),
      deterministic: true,
    }
    return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-director-manifest-v1' })
  }

  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft'])
  const shotBreakPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotBreakPlan', 'shot_break_plan'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const worldContext = helpers.readFirstUpstreamRecord(context.upstream, ['context'])
  const animaticReferenceCatalog = helpers.buildSequenceAnimaticReferenceCatalog({ context: worldContext, assetPack })
  const selectedVisualReferenceKeys = helpers.cinematicAssetPackEntityKeys(assetPack)
  const continuityAnchorPlan = helpers.readFirstUpstreamRecord(context.upstream, ['continuityAnchorPlan', 'continuity_anchor_plan'])
  const readAnchorArray = (fields: string[]) => {
    const arrays = Object.values(context.upstream).flatMap((outputs) => fields.flatMap((field) => {
      const value = outputs[field]
      return Array.isArray(value) ? value.map(helpers.asRecord) : []
    }))
    const withAssets = arrays.filter((anchor) => helpers.readText(anchor.assetKey))
    return (withAssets.length > 0 ? withAssets : arrays)
      .filter((anchor, index, values) => helpers.readText(anchor.id) && values.findIndex((candidate) => helpers.readText(candidate.id) === helpers.readText(anchor.id)) === index)
  }
  const characterAnchors = readAnchorArray(['characterAnchors', 'character_anchors']).filter((anchor) => helpers.readText(anchor.anchorType) === 'character')
  const propAnchors = readAnchorArray(['propAnchors', 'prop_anchors']).filter((anchor) => helpers.readText(anchor.anchorType) !== 'location_spot' && helpers.readText(anchor.anchorType) !== 'character')
  const locationSpotAnchors = readAnchorArray(['locationSpotAnchors', 'location_spot_anchors']).filter((anchor) => helpers.readText(anchor.anchorType) === 'location_spot' || helpers.readText(anchor.baseLocationRefId))
  const anchorAssets = [...characterAnchors, ...propAnchors, ...locationSpotAnchors].map(helpers.asRecord).filter((anchor) => helpers.readText(anchor.id))
  const continuityAnchorIdsByShotId = helpers.asRecord(continuityAnchorPlan.continuityAnchorIdsByShotId ?? continuityAnchorPlan.shotContinuityAnchorIds)
  const groupPlans = helpers.collectCinematicV3ShotPlansFromUpstream(context.upstream)
  const rawMergedShotPlan = groupPlans.length > 0
    ? helpers.mergeCinematicV3ShotPlansForTimeline(groupPlans)
    : helpers.buildSequenceAnimaticShotPlanFromBreaks({ shotBreakPlan, assetPack, context: worldContext })
  const baseMergedShotPlan = helpers.repairCinematicV2ShotPlanVisualReferences({
    shotPlan: rawMergedShotPlan,
    assetPack,
  })
  const mergedShots: LooseRecord[] = baseMergedShotPlan.shots.map((shot) => {
    const anchorIds = helpers.readStringArray(continuityAnchorIdsByShotId[helpers.readText(shot.id)])
    return {
      ...shot,
      continuityAnchorIds: anchorIds,
      continuityAnchorRefIds: anchorIds,
    }
  })
  const mergedShotPlan = {
    ...baseMergedShotPlan,
    shots: mergedShots,
  }
  const breakGroups = Array.isArray(shotBreakPlan.groups) ? shotBreakPlan.groups.map(helpers.asRecord) : []
  const blocks = breakGroups.map((group, index) => {
    const storyboardGroup = helpers.buildCinematicV3StoryboardGroupFromShotBreakGroup(group, index)
    const shotIds = helpers.readStringArray(group.shotBreakIds)
    const shots = mergedShotPlan.shots.filter((shot) => shotIds.includes(helpers.readText(shot.id)))
    const storyboardShotIds = helpers.readStringArray(storyboardGroup.shotIds)
    const resolvedShots = shots.length > 0
      ? shots
      : mergedShotPlan.shots.filter((shot) => storyboardShotIds.includes(helpers.readText(shot.id)))
    const blockAnchorIds = [...new Set(resolvedShots.flatMap((shot) => helpers.readStringArray(shot.continuityAnchorIds)))]
    return {
      id: storyboardGroup.id,
      index: storyboardGroup.index,
      title: helpers.readText(group.title) || helpers.readText(group.summary) || helpers.readText(storyboardGroup.summary) || `Storyboard block ${helpers.readText(storyboardGroup.index) || index + 1}`,
      summary: storyboardGroup.summary,
      sourceText: helpers.readText(group.sourceText),
      shotIds: (resolvedShots.length > 0 ? resolvedShots.map((shot) => helpers.readText(shot.id)).filter(Boolean) : storyboardShotIds),
      shots: resolvedShots,
      continuityAnchorIds: blockAnchorIds,
      storyboardGroup,
      storyboardLayout: { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount },
      durationSeconds: storyboardGroup.editorialDurationSeconds,
      startSeconds: storyboardGroup.startSeconds,
      endSeconds: storyboardGroup.endSeconds,
      childRequestId: null,
      childWorkflowId: null,
    }
  })
  const manifest = {
    role: 'sequence_animatic_manifest',
    graphSpecVersion: 'sequence_animatic_graph_v1',
    screenplayAnimaticRole: 'master',
    screenplayAnimaticSource,
    sequenceAnimaticRole: 'master',
    requestId: runMetadata.outputRequestId ?? null,
    workflowId: context.workflow.id,
    runId: context.run.id,
    screenplayDraft,
    screenplayMarkdown: helpers.readText(screenplayDraft.screenplayMarkdown) || helpers.readText(screenplayDraft.markdown) || helpers.readText(screenplayDraft.text),
    shotBreakPlan,
    shotPlan: mergedShotPlan,
    blocks,
    assetPack,
    selectedReferences: assetPack,
    selectedVisualReferenceKeys,
    animaticReferenceCatalog,
    continuityAnchorPlan,
    characterAnchors,
    propAnchors,
    locationSpotAnchors,
    anchorAssets,
    diagnostics: [
      ...helpers.readStringArray(shotBreakPlan.diagnostics),
      ...helpers.readStringArray(continuityAnchorPlan.diagnostics),
      ...(groupPlans.length === 0 ? ['Skipped parse-group LLM shot planning for sequence animatic master; shot continuity plan will assign shot references and scene graph continuity in one coherent pass.'] : []),
      `Built sequence animatic manifest with ${blocks.length} storyboard block${blocks.length === 1 ? '' : 's'} and ${mergedShotPlan.shots.length} shot${mergedShotPlan.shots.length === 1 ? '' : 's'}.`,
    ],
  }
  const outputs = {
    manifest,
    sequenceAnimaticManifest: manifest,
    sequence_animatic_manifest: manifest,
    screenplayDraft,
    screenplay_draft: screenplayDraft,
    shotBreakPlan,
    shot_break_plan: shotBreakPlan,
    shotPlan: mergedShotPlan,
    shot_plan: mergedShotPlan,
    blocks,
    assetPack,
    asset_pack: assetPack,
    selectedVisualReferenceKeys,
    selected_visual_reference_keys: selectedVisualReferenceKeys,
    animaticReferenceCatalog,
    animatic_reference_catalog: animaticReferenceCatalog,
    continuityAnchorPlan,
    continuity_anchor_plan: continuityAnchorPlan,
    characterAnchors,
    character_anchors: characterAnchors,
    propAnchors,
    prop_anchors: propAnchors,
    locationSpotAnchors,
    location_spot_anchors: locationSpotAnchors,
    anchorAssets,
    anchor_assets: anchorAssets,
    text: JSON.stringify(manifest, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-manifest-v1' })
}

async function sequenceAnimaticManifestArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const manifest = helpers.readFirstUpstreamRecord(context.upstream, ['manifest', 'sequenceAnimaticManifest', 'sequence_animatic_manifest'])
  if (!Object.keys(manifest).length) throw new Error('Sequence animatic manifest artifact requires a manifest input.')
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-manifest`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${context.node.label} Manifest`,
    summary: 'Sequence-unit screenplay animatic manifest with shot-continuity storyboard blocks and shot data.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-manifest-artifact-v1',
      role: 'sequence_animatic_manifest',
      graphSpecVersion: helpers.readText(manifest.graphSpecVersion) || 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'master',
      manifest,
      screenplayDraft: helpers.asRecord(manifest.screenplayDraft),
      shotBreakPlan: helpers.asRecord(manifest.shotBreakPlan),
      directorPlan: helpers.asRecord(manifest.directorPlan),
      shotPlan: helpers.asRecord(manifest.shotPlan),
      blocks: Array.isArray(manifest.blocks) ? manifest.blocks : [],
      blockCount: Array.isArray(manifest.blocks) ? manifest.blocks.length : 0,
    },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: '',
    artifact,
    artifacts: [artifact],
    manifest,
    sequenceAnimaticManifest: manifest,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-manifest-artifact-v1' })
}

async function sequenceAnimaticDirectorPlanArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const directorPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
  if (!Object.keys(directorPlan).length) throw new Error('Sequence animatic shot continuity plan artifact requires a shot continuity plan input.')
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-director-plan`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${context.node.label} Shot Continuity Plan`,
    summary: 'Sequence-unit animatic shot continuity plan with all shots, canonical references, output-local scene graph bindings, and asset requirements.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-director-plan-artifact-v1',
      role: 'sequence_animatic_director_plan',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'director_plan',
      screenplayAnimaticRole: 'director_plan',
      directorPlan,
      director_plan: directorPlan,
      shotContinuityPlan: directorPlan,
      shot_continuity_plan: directorPlan,
      shots: helpers.readArray(directorPlan.shots).map(helpers.asRecord),
      blocks: helpers.readArray(directorPlan.blocks).map(helpers.asRecord),
      coverageSetups: helpers.readArray(directorPlan.coverageSetups ?? directorPlan.coverage_setups).map(helpers.asRecord),
      coverage_setups: helpers.readArray(directorPlan.coverageSetups ?? directorPlan.coverage_setups).map(helpers.asRecord),
      coverageSetupByShotId: helpers.asRecord(directorPlan.coverageSetupByShotId ?? directorPlan.coverage_setup_by_shot_id),
      coverage_setup_by_shot_id: helpers.asRecord(directorPlan.coverageSetupByShotId ?? directorPlan.coverage_setup_by_shot_id),
      continuityGraphV2: helpers.asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2),
      continuity_graph_v2: helpers.asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2),
      shotBindings: helpers.asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings),
      shot_bindings: helpers.asRecord(directorPlan.shotBindings ?? directorPlan.shot_bindings),
      assetRequirements: helpers.readArray(directorPlan.assetRequirements ?? directorPlan.asset_requirements).map(helpers.asRecord),
      asset_requirements: helpers.readArray(directorPlan.assetRequirements ?? directorPlan.asset_requirements).map(helpers.asRecord),
      outputLocalReferences: helpers.readArray(directorPlan.outputLocalReferences ?? directorPlan.output_local_references).map(helpers.asRecord),
      output_local_references: helpers.readArray(directorPlan.outputLocalReferences ?? directorPlan.output_local_references).map(helpers.asRecord),
      rejectedCandidates: helpers.readArray(directorPlan.rejectedCandidates ?? directorPlan.rejected_candidates).map(helpers.asRecord),
      warnings: helpers.readStringArray(directorPlan.warnings),
      diagnostics: helpers.readStringArray(directorPlan.diagnostics),
      shotCount: helpers.readArray(directorPlan.shots).length,
      blockCount: helpers.readArray(directorPlan.blocks).length,
      manifestHash: helpers.readText(directorPlan.manifestHash),
      shotPlanHash: helpers.readText(directorPlan.shotPlanHash),
    },
  })
  await helpers.persistSequenceAnimaticDirectorPlanRequestState({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    artifactKey: artifact.key,
    directorPlan,
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: '',
    artifact,
    artifacts: [artifact],
    directorPlan,
    director_plan: directorPlan,
    shotContinuityPlan: directorPlan,
    shot_continuity_plan: directorPlan,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-director-plan-artifact-v1' })
}

async function sequenceAnimaticCoverageIntentInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const intentBatch = helpers.asRecord(config.intentBatch ?? config.intent_batch)
  const shots = helpers.readArray(config.shots).map(helpers.asRecord)
  const assetPack = helpers.asRecord(config.assetPack ?? config.asset_pack)
  const shotIds = helpers.readStringArray(intentBatch.shotIds ?? intentBatch.shot_ids)
  const outputs = {
    intentBatch,
    intent_batch: intentBatch,
    shots,
    assetPack,
    asset_pack: assetPack,
    shotIds,
    shot_ids: shotIds,
    text: JSON.stringify({
      sceneId: helpers.readText(intentBatch.sceneId),
      setId: helpers.readText(intentBatch.setId),
      zoneId: helpers.readText(intentBatch.zoneId),
      shotIds,
    }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-coverage-intent-input-v1' })
}

async function sequenceAnimaticCoverageIntentPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const intentBatch = helpers.readFirstUpstreamRecord(context.upstream, ['intentBatch', 'intent_batch'])
  const batchRecord = Object.keys(intentBatch).length > 0
    ? intentBatch
    : helpers.asRecord(config.intentBatch ?? config.intent_batch)
  const upstreamShots = helpers.readFirstUpstreamArray(context.upstream, ['shots']).map(helpers.asRecord)
  const shots = upstreamShots.length > 0 ? upstreamShots : helpers.readArray(config.shots).map(helpers.asRecord)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const pack = Object.keys(assetPack).length > 0 ? assetPack : helpers.asRecord(config.assetPack ?? config.asset_pack)
  const shotById = new Map(shots.map((shot) => [helpers.readText(shot.id), shot] as const).filter(([shotId]) => Boolean(shotId)))
  const fallbackIntents = helpers.readStringArray(batchRecord.shotIds ?? batchRecord.shot_ids).map((shotId) => {
    const shot = helpers.asRecord(shotById.get(shotId))
    const camera = helpers.asRecord(shot.camera)
    const cameraFraming = helpers.readText(camera.framing) || helpers.readText(shot.framing) || 'shot-appropriate framing'
    const cameraAngle = [helpers.readText(camera.angle), helpers.readText(camera.lens), helpers.readText(camera.movement)].filter(Boolean).join('; ')
    const screenDirection = helpers.readText(camera.screenDirectionRule ?? camera.screen_direction_rule)
      || helpers.readText(shot.screenDirection ?? shot.screen_direction)
    const action = helpers.readText(shot.action) || helpers.readText(shot.description) || helpers.readText(shot.title)
    return {
      shotId,
      cameraFraming,
      cameraAngle,
      screenDirection,
      subjectFocus: helpers.readText(shot.subjectFocus ?? shot.subject_focus)
        || helpers.readStringArray(helpers.asRecord(shot.refs).visibleCharacterRefIds ?? helpers.asRecord(shot.refs).visible_character_ref_ids)[0]
        || 'primary story subject',
      stagingBrief: helpers.readText(shot.stagingBrief ?? shot.staging_brief) || action,
      coverageIntent: [
        `Create a coverage direction for ${helpers.readText(shot.title) || shotId}.`,
        cameraFraming ? `Framing: ${cameraFraming}.` : '',
        cameraAngle ? `Angle/lens/movement: ${cameraAngle}.` : '',
        screenDirection ? `Screen direction: ${screenDirection}.` : '',
        action ? `Stage around: ${action}.` : '',
      ].filter(Boolean).join(' '),
    }
  }).filter((intent) => intent.shotId)
  const fallback = sequenceAnimaticCoverageIntentBatchSchema.parse({
    intents: fallbackIntents.length > 0 ? fallbackIntents : [{
      shotId: 'shot',
      cameraFraming: 'wide',
      coverageIntent: 'Create a clear coverage direction from the shot camera facts and spatial binding.',
    }],
    diagnostics: ['Deterministic coverage intent fallback.'],
  })
  const planningPrompt = [
    'Plan shot coverage directions for a fresh Scene Board zone before image generation.',
    'Return one compact JSON intent per shot. Do not create coverage setup ids, image prompts, captions, labels, or storyboard text.',
    'Each intent should preserve camera/framing, subject focus, screen direction, staging, and the specific coverage purpose for this shot.',
    'Use existing formal camera facts first. If a shot is sparse, infer a conservative cinematic coverage direction from title, action, dialogue, and spatial binding.',
    '',
    'Board scope',
    JSON.stringify({
      sceneId: helpers.readText(batchRecord.sceneId),
      setId: helpers.readText(batchRecord.setId),
      zoneId: helpers.readText(batchRecord.zoneId),
      shotIds: helpers.readStringArray(batchRecord.shotIds ?? batchRecord.shot_ids),
      sceneGraphOverrides: helpers.readArray(batchRecord.sceneGraphOverrides ?? batchRecord.scene_graph_overrides).map(helpers.asRecord),
      referenceAssetKeys: helpers.readStringArray(batchRecord.referenceAssetKeys ?? batchRecord.reference_asset_keys),
    }, null, 2),
    '',
    'Shots',
    JSON.stringify(shots.map((shot) => ({
      id: helpers.readText(shot.id),
      title: helpers.readText(shot.title),
      action: helpers.readText(shot.action) || helpers.readText(shot.description),
      camera: helpers.asRecord(shot.camera),
      lighting: helpers.readText(shot.lighting),
      dialogue: helpers.readArray(shot.dialogue).map(helpers.asRecord).slice(0, 5),
      performance: helpers.readArray(shot.performance ?? shot.performanceBeats ?? shot.performance_beats).map(helpers.asRecord).slice(0, 5),
      refs: helpers.asRecord(shot.refs),
      sceneBinding: helpers.asRecord(shot.sceneBinding ?? shot.scene_binding ?? shot.shotBinding ?? shot.shot_binding),
    })), null, 2),
    '',
    'Location references',
    JSON.stringify(helpers.readArray(pack.entities).map(helpers.asRecord).map((entity) => ({
      name: helpers.readText(entity.name ?? entity.title ?? entity.label),
      role: helpers.readText(entity.role),
      summary: helpers.readText(entity.summary ?? entity.visualDescription ?? entity.visual_description),
    })).slice(0, 16), null, 2),
  ].filter(Boolean).join('\n')
  const structuredResult = await helpers.runStructuredNode({
    nodeKey: context.node.key,
    schemaName: 'sequence_animatic_coverage_intent_batch',
    schema: sequenceAnimaticCoverageIntentBatchSchema,
    instructions: 'Return strict JSON only. Produce coverage direction records keyed by shot id; never invent workflow ids or reusable coverage setup ids.',
    prompt: planningPrompt,
    fallback,
    maxOutputTokens: 5200,
  })
  const requestedShotIds = new Set(helpers.readStringArray(batchRecord.shotIds ?? batchRecord.shot_ids))
  const intents = structuredResult.value.intents
    .map((intent) => ({
      ...intent,
      shotId: helpers.readText(intent.shotId),
      cameraFraming: helpers.readText(intent.cameraFraming),
      cameraAngle: helpers.readText(intent.cameraAngle),
      screenDirection: helpers.readText(intent.screenDirection),
      subjectFocus: helpers.readText(intent.subjectFocus),
      stagingBrief: helpers.readText(intent.stagingBrief),
      coverageIntent: helpers.readText(intent.coverageIntent),
    }))
    .filter((intent) => intent.shotId && requestedShotIds.has(intent.shotId))
  const normalized = sequenceAnimaticCoverageIntentBatchSchema.parse({
    ...structuredResult.value,
    intents: intents.length > 0 ? intents : fallback.intents,
  })
  const outputs = {
    coverageIntents: normalized.intents,
    coverage_intents: normalized.intents,
    coverageIntentBatch: normalized,
    coverage_intent_batch: normalized,
    intentBatch: batchRecord,
    intent_batch: batchRecord,
    shots,
    assetPack: pack,
    asset_pack: pack,
    text: JSON.stringify(normalized, null, 2),
    prompt: planningPrompt,
    fallbackUsed: structuredResult.fallbackUsed,
    fallbackReason: structuredResult.fallbackReason,
    deterministic: structuredResult.fallbackUsed,
  }
  return {
    inputHash: context.inputHash,
    outputHash: helpers.hashOutputWorkflowValue(outputs),
    outputs,
    provider: structuredResult.provider,
    model: structuredResult.model,
  }
}

async function sequenceAnimaticCoverageIntentArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const upstreamIntentBatch = helpers.readFirstUpstreamRecord(context.upstream, ['intentBatch', 'intent_batch'])
  const batchRecord = Object.keys(upstreamIntentBatch).length > 0
    ? upstreamIntentBatch
    : helpers.asRecord(config.intentBatch ?? config.intent_batch)
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const intents = helpers.readFirstUpstreamArray(context.upstream, ['coverageIntents', 'coverage_intents']).map(helpers.asRecord)
  const batchId = helpers.readText(batchRecord.id ?? batchRecord.batchId) || helpers.readText(config.coverageIntentBatchId)
  if (!batchId) throw new Error('Coverage intent artifact requires a batch id.')

  const now = new Date().toISOString()
  const masterRequestId = helpers.readText(config.masterRequestId)
  const sourceHash = helpers.readText(batchRecord.sourceHash ?? config.sourceHash)
  const coverageIntentByShotId = Object.fromEntries(intents.map((intent) => {
    const shotId = helpers.readText(intent.shotId)
    return [shotId, {
      shotId,
      sceneId: helpers.readText(batchRecord.sceneId ?? config.sceneId),
      setId: helpers.readText(batchRecord.setId ?? config.setId),
      zoneId: helpers.readText(batchRecord.zoneId ?? config.zoneId),
      primarySpotId: helpers.readText(intent.primarySpotId ?? intent.primary_spot_id),
      coverageIntent: helpers.readText(intent.coverageIntent ?? intent.coverage_intent),
      cameraFraming: helpers.readText(intent.cameraFraming ?? intent.camera_framing),
      cameraAngle: helpers.readText(intent.cameraAngle ?? intent.camera_angle),
      screenDirection: helpers.readText(intent.screenDirection ?? intent.screen_direction),
      subjectFocus: helpers.readText(intent.subjectFocus ?? intent.subject_focus),
      stagingBrief: helpers.readText(intent.stagingBrief ?? intent.staging_brief),
      sourceHash,
      updatedAt: now,
      workflowRequestId: context.run.requestId,
    }]
  }).filter(([shotId]) => Boolean(shotId)))
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(batchId)}.sequence-animatic-coverage-intent-batch`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${helpers.readText(batchRecord.title) || helpers.titleFromRefLike(batchId)} Coverage Directions`,
    summary: 'Shot coverage directions planned for a Scene Board zone before zone camera grid generation.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-coverage-intent-artifact-v1',
      role: 'sequence_animatic_coverage_intent_batch',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'coverage_intent_batch',
      screenplayAnimaticRole: 'coverage_intent_batch',
      masterRequestId,
      sceneId: helpers.readText(batchRecord.sceneId ?? config.sceneId),
      setId: helpers.readText(batchRecord.setId ?? config.setId),
      zoneId: helpers.readText(batchRecord.zoneId ?? config.zoneId),
      shotIds: helpers.readStringArray(batchRecord.shotIds ?? batchRecord.shot_ids),
      sourceHash,
      intentBatch: batchRecord,
      intent_batch: batchRecord,
      prompt,
      coverageIntentByShotId,
      coverage_intent_by_shot_id: coverageIntentByShotId,
      coverageIntents: Object.values(coverageIntentByShotId),
      coverage_intents: Object.values(coverageIntentByShotId),
    },
  })

  if (masterRequestId) {
    const client = context.client as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
          }
        }
        update: (values: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
        }
      }
    }
    const masterResponse = await client
      .from('output_requests')
      .select('metadata')
      .eq('id', masterRequestId)
      .maybeSingle()
    if (!masterResponse.error && masterResponse.data) {
      const masterMetadata = helpers.asRecord(helpers.asRecord(masterResponse.data).metadata)
      const previousRegistry = helpers.asRecord(masterMetadata.sequenceAnimaticZoneCoverageRegistry ?? masterMetadata.sequence_animatic_zone_coverage_registry)
      const previousCoverageRegistry = helpers.asRecord(masterMetadata.sequenceAnimaticCoverageRegistry ?? masterMetadata.sequence_animatic_coverage_registry)
      const previousIntents = {
        ...helpers.asRecord(previousCoverageRegistry.coverageIntentByShotId ?? previousCoverageRegistry.coverage_intent_by_shot_id),
        ...helpers.asRecord(previousRegistry.coverageIntentByShotId ?? previousRegistry.coverage_intent_by_shot_id),
      }
      const nextIntents = { ...previousIntents, ...coverageIntentByShotId }
      const registry = {
        ...previousRegistry,
        role: 'sequence_animatic_zone_coverage_registry',
        contractVersion: helpers.readText(previousRegistry.contractVersion) || 'zone_camera_coverage_grid_registry_v1',
        sourceMasterRequestId: masterRequestId,
        revision: (Number(previousRegistry.revision ?? 0) || 0) + 1,
        coverageIntentByShotId: nextIntents,
        coverage_intent_by_shot_id: nextIntents,
        updatedAt: now,
        updatedByCoverageIntentBatchId: batchId,
      }
      const coverageRegistry = {
        ...previousCoverageRegistry,
        coverageIntentByShotId: nextIntents,
        coverage_intent_by_shot_id: nextIntents,
        updatedAt: now,
        updatedByCoverageIntentBatchId: batchId,
      }
      const updateResponse = await client
        .from('output_requests')
        .update({
          metadata: {
            ...masterMetadata,
            sequenceAnimaticZoneCoverageRegistry: registry,
            sequence_animatic_zone_coverage_registry: registry,
            sequenceAnimaticCoverageRegistry: coverageRegistry,
            sequence_animatic_coverage_registry: coverageRegistry,
          },
        })
        .eq('id', masterRequestId)
      if (updateResponse.error) throw new Error(updateResponse.error.message)
    }
  }

  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: masterRequestId,
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: 'coverage_intent_batch_ready',
    payload: {
      batchId,
      artifactKey: artifact.key,
      shotIds: Object.keys(coverageIntentByShotId),
    },
    metadata: { source: 'sequence_animatic_coverage_intent_workflow' },
    dedupe: { batchId },
  })

  const outputs = {
    artifactKey: artifact.key,
    artifact,
    artifacts: [artifact],
    coverageIntentByShotId,
    coverage_intent_by_shot_id: coverageIntentByShotId,
    coverageIntents: Object.values(coverageIntentByShotId),
    coverage_intents: Object.values(coverageIntentByShotId),
    intentBatch: batchRecord,
    intent_batch: batchRecord,
    prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-coverage-intent-artifact-v1' })
}

async function sequenceAnimaticCoveragePlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const directorPlan = helpers.readFirstUpstreamRecord(context.upstream, ['shotContinuityPlan', 'shot_continuity_plan', 'directorPlan', 'director_plan'])
  const screenplayDraft = helpers.readFirstUpstreamRecord(context.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const worldContext = helpers.readFirstUpstreamRecord(context.upstream, ['context'])
  if (!Object.keys(directorPlan).length) throw new Error('Coverage planner requires a merged shot continuity plan.')
  const fallbackCoveragePlan = normalizeSequenceAnimaticCoveragePlan({ directorPlan })
  let providerRequestId: string | undefined
  let fallbackUsed = false
  let fallbackReason = ''
  let proposedCoveragePlan: LooseRecord = {}
  try {
    const structuredResult = await helpers.runBackgroundStructuredNode({
      nodeKey: context.node.key,
      schemaName: 'sequence_animatic_coverage_plan',
      schema: sequenceAnimaticCoveragePlanLlmSchema,
      instructions: [
        'You are a film coverage supervisor assigning reusable camera/staging setups after shots already exist.',
        'Return strict JSON only. Do not create shots, scene graph nodes, image prompts, or coverage anchor art.',
      ].join('\n'),
      prompt: [
        'Assign every shot to exactly one coverage setup.',
        'Only group shots when they share the same set, zone, primary spot, camera side/framing intent, screen direction, and visible subject arrangement.',
        'Never assign a setup subject that is not visible in every shot using that setup.',
        'Never group shots across different primarySpotId values unless the setupKind is wide_master and all shots share the same set and zone.',
        'Create a new setup when blocking, camera side, subject arrangement, or primary spot changes.',
        'Use concise setup titles and stagingBrief fields. These are planning records, not image prompts.',
        'Return coverageSetups plus coverageSetupByShotId. Every shot id must appear in coverageSetupByShotId exactly once.',
        helpers.compactForPrompt({
          shots: helpers.readArray(directorPlan.shots).map(helpers.asRecord).map((shot) => ({
            id: helpers.readText(shot.id),
            index: Number(shot.index ?? 0) || 0,
            blockId: helpers.readText(shot.blockId ?? shot.storyboardBlockId),
            title: helpers.readText(shot.title),
            action: helpers.readText(shot.action ?? shot.description),
            camera: helpers.asRecord(shot.camera),
            lighting: helpers.readText(shot.lighting),
            refs: sequenceAnimaticCoverageShotRefs(shot),
            sceneBinding: sequenceAnimaticCoverageSpatialFields(shot),
            sourceSceneId: helpers.readText(shot.sourceSceneId ?? shot.sceneId),
          })),
          blocks: helpers.readArray(directorPlan.blocks).map(helpers.asRecord).map((block) => ({
            id: helpers.readText(block.id),
            index: Number(block.index ?? 0) || 0,
            title: helpers.readText(block.title),
            summary: helpers.readText(block.summary),
            shotIds: helpers.readStringArray(block.shotIds ?? block.shot_ids),
          })),
          continuityGraphV2: helpers.asRecord(directorPlan.continuityGraphV2 ?? directorPlan.continuity_graph_v2),
          screenplay: {
            title: helpers.readText(screenplayDraft.title),
            summary: helpers.readText(screenplayDraft.summary),
            text: helpers.readText(screenplayDraft.screenplayMarkdown ?? screenplayDraft.markdown ?? screenplayDraft.text).slice(0, 8000),
          },
          assetPackSummary: {
            selectedEntityKeys: helpers.cinematicAssetPackEntityKeys(assetPack),
            entityCount: helpers.readArray(assetPack.entities).length,
          },
          world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
        }, 22000),
      ].join('\n\n'),
      fallback: fallbackCoveragePlan,
      maxOutputTokens: 12000,
      shouldCancel: context.shouldCancel,
      onProgress: async (progress) => {
        await context.onProgress?.({
          provider: 'openai',
          model: helpers.outputWorkflowTextModel(),
          providerRequestId: progress.providerRequestId,
          metadata: {
            providerMode: progress.providerMode,
            providerStatus: progress.providerStatus,
            lastProviderPollAt: progress.lastProviderPollAt,
            providerStartedAt: progress.providerStartedAt,
            sequenceAnimaticCoveragePlan: true,
          },
        })
      },
    })
    providerRequestId = structuredResult.providerRequestId
    fallbackUsed = structuredResult.fallbackUsed
    fallbackReason = structuredResult.fallbackReason
    proposedCoveragePlan = helpers.asRecord(structuredResult.value)
  } catch (error) {
    fallbackUsed = true
    fallbackReason = error instanceof Error ? error.message : 'Coverage planner LLM failed.'
    proposedCoveragePlan = fallbackCoveragePlan
  }
  const coveragePlan = normalizeSequenceAnimaticCoveragePlan({ directorPlan, proposedPlan: proposedCoveragePlan })
  const finalizedDirectorPlan = applySequenceAnimaticCoveragePlanToDirectorPlan({ directorPlan, coveragePlan })
  const outputs = {
    coveragePlan,
    coverage_plan: coveragePlan,
    coverageSetups: helpers.readArray(coveragePlan.coverageSetups),
    coverage_setups: helpers.readArray(coveragePlan.coverageSetups),
    coverageSetupByShotId: helpers.asRecord(coveragePlan.coverageSetupByShotId),
    coverage_setup_by_shot_id: helpers.asRecord(coveragePlan.coverageSetupByShotId),
    directorPlan: finalizedDirectorPlan,
    director_plan: finalizedDirectorPlan,
    shotContinuityPlan: finalizedDirectorPlan,
    shot_continuity_plan: finalizedDirectorPlan,
    blocks: helpers.readArray(finalizedDirectorPlan.blocks),
    continuityGraphV2: helpers.asRecord(finalizedDirectorPlan.continuityGraphV2),
    continuity_graph_v2: helpers.asRecord(finalizedDirectorPlan.continuityGraphV2),
    shotBindings: helpers.asRecord(finalizedDirectorPlan.shotBindings),
    shot_bindings: helpers.asRecord(finalizedDirectorPlan.shotBindings),
    fallbackUsed,
    fallbackReason,
    text: JSON.stringify({ coveragePlan, fallbackUsed, fallbackReason }, null, 2),
    deterministic: fallbackUsed,
  }
  return {
    inputHash: context.inputHash,
    outputHash: helpers.hashOutputWorkflowValue(outputs),
    outputs,
    provider: fallbackUsed ? 'graphcore' : 'openai',
    model: fallbackUsed ? 'deterministic-sequence-animatic-coverage-plan-v1' : helpers.outputWorkflowTextModel(),
    providerRequestId,
  }
}

async function sequenceAnimaticCoverageAnchorInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const coverageSetup = helpers.asRecord(config.coverageSetup ?? config.coverage_setup)
  const shots = helpers.readArray(config.shots).map(helpers.asRecord)
  const rawAssetPack = helpers.asRecord(config.assetPack ?? config.asset_pack)
  const referenceLimit = Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8))
  const baseAssetPack = helpers.buildCinematicV3StoryboardGroupAssetPack({
    assetPack: rawAssetPack,
    shots,
    maxEntityCount: referenceLimit,
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: true,
    includePerformanceRefs: true,
    includeTextMentionedRefs: false,
  })
  const referenceAssetKeys = helpers.readStringArray(config.referenceAssetKeys ?? config.reference_asset_keys)
  const extraReferenceEntities = referenceAssetKeys.map((assetKey, index) => ({
    key: `coverage_anchor_ref_${index + 1}_${helpers.slugify(assetKey)}`,
    name: `Coverage dependency ${index + 1}`,
    type: 'continuity_asset',
    role: 'coverage_anchor_dependency_reference',
    summary: 'Generated scene-graph or canonical reference used to ground this coverage anchor.',
    visualDescription: 'Use this image to preserve spatial layout, materials, palette, lighting logic, and identity continuity.',
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
    selectedReferenceVariantKey: 'coverage_anchor_dependency',
    selectedReferenceVariantLabel: `Coverage dependency ${index + 1}`,
    selectedReferenceVariantType: 'continuity_asset',
    referenceSelectionReason: 'Coverage anchor visual reference plan dependency.',
  }))
  const assetPack = helpers.orderSequenceAnimaticAssetPackReferences({
    ...helpers.scopeAssetPackToReferenceAssetKeys({
      assetPack: baseAssetPack,
      referenceAssetKeys,
      fallbackEntities: extraReferenceEntities,
      referenceScope: 'sequence_animatic_coverage_anchor',
      limit: referenceLimit,
    }),
    continuityReferenceAssetKeys: referenceAssetKeys,
    coverageAnchorReferenceAssetKeys: referenceAssetKeys,
  })
  const referenceManifest = helpers.sequenceAnimaticReferenceManifestEntries(assetPack)
  const setupId = helpers.readText(coverageSetup.id) || helpers.readText(config.coverageSetupId)
  const outputs = {
    coverageSetup,
    coverage_setup: coverageSetup,
    shots,
    assetPack,
    asset_pack: assetPack,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText: helpers.sequenceAnimaticReferenceManifestText(assetPack),
    reference_manifest_text: helpers.sequenceAnimaticReferenceManifestText(assetPack),
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    coverageSetupId: setupId,
    coverage_setup_id: setupId,
    text: JSON.stringify({ coverageSetup, shots, assetPack }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-coverage-anchor-input-v1' })
}

async function sequenceAnimaticCoverageAnchorBrief(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const coverageSetup = helpers.readFirstUpstreamRecord(context.upstream, ['coverageSetup', 'coverage_setup'])
  const sceneGraphOverride = helpers.asRecord(
    coverageSetup.sceneGraphOverride
      ?? coverageSetup.scene_graph_override
      ?? config.sceneGraphOverride
      ?? config.scene_graph_override,
  )
  const visualBriefOverride = helpers.readText(sceneGraphOverride.visualBriefOverride)
  const extraPromptDirection = helpers.readText(sceneGraphOverride.extraPromptDirection)
  const shots = helpers.readFirstUpstreamArray(context.upstream, ['shots']).map(helpers.asRecord)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const setupId = helpers.readText(coverageSetup.id) || helpers.readText(config.coverageSetupId)
  const subjectLabels = [...new Set([
    ...helpers.readArray(assetPack.entities).map(helpers.asRecord)
      .filter((entity) => ['character_reference', 'temp_character_reference'].includes(helpers.sequenceAnimaticReferenceRole(entity)))
      .map((entity) => helpers.sequenceAnimaticReferenceName(entity, 'Subject')),
    ...shots.flatMap((shot) => helpers.readStringArray(shot.visibleCharacterNames ?? shot.visible_character_names)),
    ...shots.flatMap((shot) => helpers.readStringArray(shot.characterNames ?? shot.character_names)),
  ].map((label) => label.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 8)
  const camera = helpers.asRecord(coverageSetup.camera)
  const fallbackBrief = sequenceAnimaticCoverageAnchorBriefSchema.parse({
    cameraPosition: helpers.readText(coverageSetup.cameraBrief ?? coverageSetup.camera_brief) || helpers.readText(camera.framing),
    framing: helpers.readText(camera.framing) || helpers.readText(coverageSetup.setupKind ?? coverageSetup.setup_kind).replace(/_/g, ' '),
    screenDirection: helpers.readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction)
      || helpers.readText(camera.screenDirectionRule ?? camera.screen_direction_rule),
    subjectBlocking: helpers.readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief)
      || shots.map((shot) => helpers.compactStoryboardSentence(helpers.readText(shot.action), '', 18)).filter(Boolean).join(' '),
    foregroundBackgroundPlan: 'Keep the parent spot/zone geography readable with clear foreground, midground, and background depth.',
    movementArrows: helpers.readStringArray(coverageSetup.movementArrows ?? coverageSetup.movement_arrows),
    labels: subjectLabels.length > 0 ? [...subjectLabels, 'camera', 'movement'] : ['subject', 'camera', 'movement'],
    visualNotes: shots.slice(0, 4)
      .map((shot) => helpers.compactStoryboardSentence(helpers.readText(shot.action ?? shot.description), '', 20))
      .filter(Boolean),
    mustNotInclude: ['final character likeness', 'wardrobe detail', 'decorative captions', 'UI panels', 'watermarks'],
  })
  let providerRequestId: string | undefined
  let brief = fallbackBrief
  let fallbackUsed = false
  let fallbackReason = ''
  try {
    const structuredResult = await helpers.runBackgroundStructuredNode({
      nodeKey: context.node.key,
      schemaName: 'sequence_animatic_coverage_anchor_brief',
      schema: sequenceAnimaticCoverageAnchorBriefSchema,
      instructions: [
        'You are a cinematographer making a concise coverage-anchor staging brief.',
        'Return strict JSON only. This is not final art and not an image prompt.',
      ].join('\n'),
      prompt: [
        'Create a visual staging brief for one coverage anchor blockout plate.',
        'Use only the scoped setup, shot actions, visible subjects, camera facts, and location/reference summary below.',
        'Decide the camera position, framing, screen direction, subject placeholder positions, movement arrows, and foreground/background layout.',
        'Do not add subjects that are not visible in the provided shots. Do not create coverage setup ids.',
        JSON.stringify({
          coverageSetup: {
            id: setupId,
            title: helpers.readText(coverageSetup.title),
            setupKind: helpers.readText(coverageSetup.setupKind ?? coverageSetup.setup_kind),
            setId: helpers.readText(coverageSetup.setId ?? coverageSetup.set_id),
            zoneId: helpers.readText(coverageSetup.zoneId ?? coverageSetup.zone_id),
            primarySpotId: helpers.readText(coverageSetup.primarySpotId ?? coverageSetup.primary_spot_id),
            viewpointId: helpers.readText(coverageSetup.viewpointId ?? coverageSetup.viewpoint_id),
            characterRefIds: helpers.readStringArray(coverageSetup.characterRefIds ?? coverageSetup.character_ref_ids),
            screenDirection: helpers.readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction),
            camera,
            lighting: helpers.readText(coverageSetup.lighting),
            stagingBrief: helpers.readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief),
            visualBriefOverride,
            extraPromptDirection,
          },
          shots: shots.slice(0, 8).map((shot) => ({
            id: helpers.readText(shot.id),
            title: helpers.readText(shot.title),
            action: helpers.readText(shot.action ?? shot.description),
            camera: helpers.asRecord(shot.camera),
            lighting: helpers.readText(shot.lighting),
            refs: helpers.asRecord(shot.refs),
            sceneBinding: helpers.asRecord(shot.sceneBinding ?? shot.scene_binding ?? shot.shotBinding ?? shot.shot_binding),
          })),
          referenceSummary: helpers.sequenceAnimaticReferenceManifestText(assetPack),
        }, null, 2).slice(0, 14000),
      ].join('\n\n'),
      fallback: fallbackBrief,
      maxOutputTokens: 3000,
      shouldCancel: context.shouldCancel,
      onProgress: async (progress) => {
        await context.onProgress?.({
          provider: 'openai',
          model: helpers.outputWorkflowTextModel(),
          providerRequestId: progress.providerRequestId,
          metadata: {
            providerMode: progress.providerMode,
            providerStatus: progress.providerStatus,
            sequenceAnimaticCoverageAnchorBrief: true,
          },
        })
      },
    })
    providerRequestId = structuredResult.providerRequestId
    brief = sequenceAnimaticCoverageAnchorBriefSchema.parse(structuredResult.value)
    fallbackUsed = structuredResult.fallbackUsed
    fallbackReason = structuredResult.fallbackReason
  } catch (error) {
    fallbackUsed = true
    fallbackReason = error instanceof Error ? error.message : 'Coverage anchor brief LLM failed.'
    brief = fallbackBrief
  }
  const text = [
    brief.cameraPosition ? `Camera position: ${brief.cameraPosition}` : '',
    brief.framing ? `Framing: ${brief.framing}` : '',
    brief.screenDirection ? `Screen direction: ${brief.screenDirection}` : '',
    brief.subjectBlocking ? `Subject blocking: ${brief.subjectBlocking}` : '',
    brief.foregroundBackgroundPlan ? `Foreground/background: ${brief.foregroundBackgroundPlan}` : '',
    brief.movementArrows.length > 0 ? `Movement arrows: ${brief.movementArrows.join('; ')}` : '',
    brief.labels.length > 0 ? `Labels: ${brief.labels.join(', ')}` : '',
    brief.visualNotes.length > 0 ? `Visual notes: ${brief.visualNotes.join('; ')}` : '',
  ].filter(Boolean).join('\n')
  const outputs = {
    coverageBrief: brief,
    coverage_brief: brief,
    promptBrief: text,
    prompt_brief: text,
    coverageSetup,
    coverage_setup: coverageSetup,
    sceneGraphOverride,
    scene_graph_override: sceneGraphOverride,
    shots,
    assetPack,
    asset_pack: assetPack,
    coverageSetupId: setupId,
    coverage_setup_id: setupId,
    fallbackUsed,
    fallbackReason,
    text,
  }
  return {
    inputHash: context.inputHash,
    outputHash: helpers.hashOutputWorkflowValue(outputs),
    outputs,
    provider: fallbackUsed ? 'graphcore' : 'openai',
    model: fallbackUsed ? 'deterministic-sequence-animatic-coverage-anchor-brief-v1' : helpers.outputWorkflowTextModel(),
    providerRequestId,
  }
}

async function sequenceAnimaticCoverageAnchorPrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const coverageSetup = helpers.readFirstUpstreamRecord(context.upstream, ['coverageSetup', 'coverage_setup'])
  const sceneGraphOverride = helpers.asRecord(
    coverageSetup.sceneGraphOverride
      ?? coverageSetup.scene_graph_override
      ?? config.sceneGraphOverride
      ?? config.scene_graph_override,
  )
  const visualBriefOverride = helpers.readText(sceneGraphOverride.visualBriefOverride)
  const extraPromptDirection = helpers.readText(sceneGraphOverride.extraPromptDirection)
  const shots = helpers.readFirstUpstreamArray(context.upstream, ['shots']).map(helpers.asRecord)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const coverageBrief = helpers.readFirstUpstreamRecord(context.upstream, ['coverageBrief', 'coverage_brief'])
  const coverageBriefText = helpers.readFirstUpstreamText(context.upstream, ['promptBrief', 'prompt_brief', 'coverageBriefText', 'coverage_brief_text'])
  const referenceManifestText = helpers.sequenceAnimaticReferenceManifestText(assetPack)
  const coverageScope = helpers.readText(config.coverageAnchorScope ?? config.coverage_anchor_scope)
  const placementLabels = [...new Set([
    ...helpers.readArray(assetPack.entities).map(helpers.asRecord)
      .filter((entity) => ['character_reference', 'temp_character_reference'].includes(helpers.sequenceAnimaticReferenceRole(entity)))
      .map((entity) => helpers.sequenceAnimaticReferenceName(entity, 'Subject')),
    ...shots.flatMap((shot) => helpers.readStringArray(shot.visibleCharacterNames ?? shot.visible_character_names)),
    ...shots.flatMap((shot) => helpers.readStringArray(shot.characterNames ?? shot.character_names)),
  ].map((label) => label.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 8)
  const setupId = helpers.readText(coverageSetup.id) || helpers.readText(config.coverageSetupId)
  const linkedShotSummary = shots.slice(0, 8).map((shot) => {
    const camera = helpers.asRecord(shot.camera)
    return [
      helpers.readText(shot.title),
      helpers.readText(shot.action) || helpers.readText(shot.description),
      [helpers.readText(camera.framing), helpers.readText(camera.angle), helpers.readText(camera.lens), helpers.readText(camera.movement)].filter(Boolean).join('; '),
    ].filter(Boolean).join(' / ')
  }).join('\n')
  const promptText = [
    'Create one labeled coverage blockout plate for an animatic shot setup. This is a planning reference, not final art.',
    'Show environment framing, camera position feel, screen direction, movement arrows, and simple subject placeholders.',
    'Use attached set/zone/spot reference images as location references for spatial layout, materials, weather, lighting logic, and geography.',
    'Use named character/item reference images only to know which placeholders to place, their scale, and their rough silhouette; do not render detailed faces, wardrobe likeness, or final character art.',
    'Every subject placeholder must correspond to a visible shot subject in the reference map or linked shot summary. Do not add unrelated setup subjects.',
    'Sparse placement labels and arrows are allowed and required. Keep labels short and readable.',
    'Ban decorative captions, paragraphs, UI panels, watermarks, borders, split panels, and polished final-frame character detail.',
    '',
    `Coverage blockout: ${helpers.readText(coverageSetup.title) || setupId}`,
    coverageBriefText ? `Creative staging brief:\n${coverageBriefText}` : '',
    helpers.readStringArray(coverageBrief.labels).length > 0 ? `Required labels: ${helpers.readStringArray(coverageBrief.labels).join(', ')}` : '',
    helpers.readText(coverageSetup.setupKind ?? coverageSetup.setup_kind) ? `Setup kind: ${helpers.readText(coverageSetup.setupKind ?? coverageSetup.setup_kind).replace(/_/g, ' ')}` : '',
    helpers.readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief) ? `Staging: ${helpers.readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief)}` : '',
    helpers.readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction) ? `Screen direction: ${helpers.readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction)}` : '',
    helpers.readText(coverageSetup.cameraBrief ?? coverageSetup.camera_brief) ? `Camera: ${helpers.readText(coverageSetup.cameraBrief ?? coverageSetup.camera_brief)}` : '',
    helpers.readText(coverageSetup.lightingBrief ?? coverageSetup.lighting_brief) ? `Lighting: ${helpers.readText(coverageSetup.lightingBrief ?? coverageSetup.lighting_brief)}` : '',
    coverageScope === 'shot_scoped' ? 'Scope: current shot only; ignore unrelated linked setup shots.' : '',
    placementLabels.length > 0 ? `Placement labels: ${placementLabels.join(', ')}, camera, movement` : 'Placement labels: camera, movement, subject placeholders',
    linkedShotSummary ? `Linked shots:\n${linkedShotSummary}` : '',
    referenceManifestText ? `Reference map:\n${referenceManifestText}` : '',
    visualBriefOverride ? `User-edited coverage visual brief:\n${visualBriefOverride}` : '',
    extraPromptDirection ? `Additional user generation direction:\n${extraPromptDirection}` : '',
  ].filter(Boolean).join('\n')
  const referenceManifest = helpers.sequenceAnimaticReferenceManifestEntries(assetPack)
  const outputs = {
    prompt: promptText,
    text: promptText,
    coverageSetup,
    coverage_setup: coverageSetup,
    coverageBrief,
    coverage_brief: coverageBrief,
    sceneGraphOverride,
    scene_graph_override: sceneGraphOverride,
    promptBrief: coverageBriefText,
    prompt_brief: coverageBriefText,
    shots,
    assetPack,
    asset_pack: assetPack,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    coverageAnchorMode: helpers.coverageAnchorMode,
    coverage_anchor_mode: helpers.coverageAnchorMode,
    coverageSetupId: setupId,
    coverage_setup_id: setupId,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-coverage-anchor-prompt-v1' })
}

async function sequenceAnimaticCoverageAnchorArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const coverageSetup = helpers.readFirstUpstreamRecord(context.upstream, ['coverageSetup', 'coverage_setup'])
  const image = helpers.readFirstUpstreamImage(context.upstream, ['image']) ?? {}
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const coverageAnchorScopeKey = helpers.readText(config.coverageAnchorScopeKey)
  const coverageSetupId = helpers.readText(coverageSetup.id) || helpers.readText(config.coverageSetupId)
  const coverageIdentityValue = coverageAnchorScopeKey || coverageSetupId
  if (!coverageIdentityValue) throw new Error('Coverage anchor artifact requires a coverage scope key or setup id.')
  const coverageAnchorScope = helpers.readText(config.coverageAnchorScope)
  const assetKey = helpers.readText(image.assetKey)
  if (!assetKey) throw new Error('Coverage anchor image did not produce an asset key.')
  const qcFindings = assetKey ? [] : ['Coverage anchor image did not produce an asset key.']
  const qcStatus = qcFindings.length === 0 ? 'passed' : 'failed'
  const anchor = {
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'coverage_anchor',
    sequenceAnimaticRole: 'coverage_anchor',
    coverageAnchorMode: helpers.coverageAnchorMode,
    coverage_anchor_mode: helpers.coverageAnchorMode,
    masterRequestId: helpers.readText(config.masterRequestId),
    coverageSetupId,
    coverageAnchorScopeKey,
    coverageAnchorScope,
    coverageSetup,
    coverage_setup: coverageSetup,
    shotIds: helpers.readStringArray(config.shotIds).length > 0 ? helpers.readStringArray(config.shotIds) : helpers.readStringArray(coverageSetup.shotIds),
    storyboardBlockIds: helpers.readStringArray(config.storyboardBlockIds).length > 0 ? helpers.readStringArray(config.storyboardBlockIds) : helpers.readStringArray(coverageSetup.blockIds ?? coverageSetup.storyboardBlockIds),
    assetKey,
    image,
    prompt,
    qcStatus,
    qcFindings,
    status: assetKey ? 'ready' : 'failed',
    generatedAt: new Date().toISOString(),
  }
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(coverageIdentityValue)}.sequence-animatic-coverage-anchor`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${helpers.readText(coverageSetup.title) || helpers.titleFromRefLike(coverageIdentityValue)} Coverage Anchor`,
    summary: 'Reusable visual keyframe anchor for a sequence animatic coverage setup.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-coverage-anchor-artifact-v1',
      role: 'sequence_animatic_coverage_anchor',
      coverageAnchorMode: helpers.coverageAnchorMode,
      coverage_anchor_mode: helpers.coverageAnchorMode,
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'coverage_anchor',
      screenplayAnimaticRole: 'coverage_anchor',
      masterRequestId: anchor.masterRequestId,
      coverageSetupId,
      coverageAnchorScopeKey,
      coverageAnchorScope,
      coverageSetup,
      coverage_setup: coverageSetup,
      shotIds: anchor.shotIds,
      storyboardBlockIds: anchor.storyboardBlockIds,
      assetKey,
      requiredReferenceAssetKeys: helpers.readStringArray(config.requiredReferenceAssetKeys),
      omittedReferenceAssetKeys: helpers.readStringArray(config.omittedReferenceAssetKeys),
      sourceReferenceHash: helpers.readText(config.sourceReferenceHash),
      visualPlanHash: helpers.readText(config.visualPlanHash),
      qcStatus,
      qcFindings,
      prompt,
      image,
      anchor,
    },
  })
  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: anchor.masterRequestId,
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: assetKey ? 'coverage_anchor_ready' : 'coverage_anchor_failed',
    payload: {
      coverageSetupId,
      coverageAnchorScopeKey,
      coverageAnchorScope,
      assetKey,
      artifactKey: artifact.key,
      status: anchor.status,
      shotIds: anchor.shotIds,
    },
    metadata: { source: 'sequence_animatic_keyframe_workflow' },
    dedupe: { coverageSetupId: coverageSetupId || null, coverageAnchorScopeKey: coverageAnchorScopeKey || null },
  })
  const identityKey = coverageAnchorScopeKey ? 'coverageAnchorScopeKey' : 'coverageSetupId'
  const identityValue = coverageIdentityValue
  const globalAssetStatus = assetKey ? helpers.readText(image.globalAssetStatus ?? image.global_asset_status) || 'generated' : 'missing'
  const outputs = {
    artifactKey: artifact.key,
    assetKey,
    artifact,
    artifacts: [artifact],
    reference: {
      status: assetKey ? 'ready' : 'missing',
      assetKey: assetKey || null,
      artifactKey: artifact.key,
      role: 'coverage_anchor',
      sourceArtifactRole: 'sequence_animatic_coverage_anchor',
      identityKey,
      identityValue,
      coverageSetupId,
      coverageAnchorScopeKey,
      coverageAnchorScope,
      globalAssetStatus,
    },
    coverageAnchor: anchor,
    coverage_anchor: anchor,
    coverageAnchorMode: helpers.coverageAnchorMode,
    coverage_anchor_mode: helpers.coverageAnchorMode,
    coverageSetup,
    coverage_setup: coverageSetup,
    image,
    keyframe: image,
    primaryReferenceImage: image,
    globalAssetStatus,
    global_asset_status: globalAssetStatus,
    prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-coverage-anchor-artifact-v1' })
}

async function sequenceAnimaticContinuityAssetInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const targetNode = helpers.asRecord(config.targetNode)
  const continuityPack = helpers.asRecord(config.continuityPack)
  const relevantShots = helpers.readArray(config.relevantShots).map(helpers.asRecord)
  const shotBindings = helpers.asRecord(config.shotBindings)
  const assetPack = helpers.asRecord(config.assetPack)
  const referenceAssetKeys = helpers.readStringArray(config.referenceAssetKeys)
  const outputs = {
    continuityPack,
    continuity_pack: continuityPack,
    targetNode,
    target_node: targetNode,
    relevantShots,
    relevant_shots: relevantShots,
    shotBindings,
    shot_bindings: shotBindings,
    assetPack,
    asset_pack: assetPack,
    referenceAssetKeys,
    reference_asset_keys: referenceAssetKeys,
    text: JSON.stringify({
      targetNode,
      relevantShotCount: relevantShots.length,
      referenceAssetKeys,
    }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-asset-input-v1' })
}

async function sequenceAnimaticContinuityAssetArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const upstreamTargetNode = helpers.readFirstUpstreamRecord(context.upstream, ['targetNode', 'target_node'])
  const targetNode = Object.keys(upstreamTargetNode).length > 0 ? upstreamTargetNode : helpers.asRecord(config.targetNode)
  const image = helpers.readFirstUpstreamImage(context.upstream, ['image']) ?? {}
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const targetNodeId = helpers.readText(config.targetNodeId) || helpers.readText(targetNode.id)
  if (!targetNodeId) throw new Error('Continuity asset artifact requires a target node id.')
  const assetKey = helpers.readText(image.assetKey)
  if (!assetKey) throw new Error('Continuity asset image did not produce an asset key.')
  const referenceAssetKeys = helpers.readStringArray(config.referenceAssetKeys)
  const assetKind = helpers.readText(config.assetKind) || helpers.readText(targetNode.assetKind) || helpers.readText(targetNode.nodeKind) || 'continuity_asset'
  const referenceRole = helpers.sequenceAnimaticReferenceRole({
    role: assetKind,
    type: assetKind,
    name: helpers.readText(targetNode.name) || helpers.readText(targetNode.title),
  })
  const qcFindings = assetKey ? [] : ['Continuity asset image did not produce an asset key.']
  const qcStatus = qcFindings.length === 0 ? 'passed' : 'failed'
  const assetState = helpers.sequenceAnimaticContinuityAssetStateParse({
    status: assetKey ? 'ready' : 'failed',
    inputHash: helpers.readText(config.assetInputHash) || helpers.sequenceAnimaticContinuityAssetTargetInputHash(targetNode),
    assetKey: assetKey || null,
    artifactKey: helpers.readText(helpers.asRecord(image.artifact).key) || null,
    prompt,
    referenceAssetKeys,
    sourceNodeId: targetNodeId,
    assetKind,
    generatedAt: new Date().toISOString(),
    warnings: qcFindings,
    error: assetKey ? '' : 'Continuity asset image did not produce an asset key.',
  })
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(targetNodeId)}.sequence-animatic-continuity-asset`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${helpers.readText(targetNode.name) || helpers.titleFromRefLike(targetNodeId)} Continuity Asset`,
    summary: 'Node-scoped sequence animatic continuity asset generated from the evolving scene graph.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-continuity-asset-artifact-v1',
      role: 'sequence_animatic_continuity_asset',
      graphSpecVersion: 'sequence_animatic_graph_v1',
      sequenceAnimaticRole: 'continuity_asset',
      masterRequestId: helpers.readText(config.masterRequestId),
      continuityRequestId: helpers.readText(config.continuityRequestId),
      worldLocationRefId: helpers.readText(config.worldLocationRefId),
      parentNodeIds: helpers.readStringArray(config.parentNodeIds),
      targetNodeId,
      assetKind,
      targetNode,
      prompt,
      referenceAssetKeys,
      qcStatus,
      qcFindings,
      assetState,
      image,
      assetKey,
    },
  })

  const continuityWorkflowId = helpers.readText(config.continuityWorkflowId)
  if (continuityWorkflowId) {
    const client = context.client as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => unknown
        }
        update: (values: Record<string, unknown>) => {
          eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
        }
      }
    }
    const packQuery = client
      .from('output_artifacts')
      .select(helpers.outputArtifactSelect) as unknown as {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          order: (column: string, options: { ascending: boolean }) => {
            limit: (count: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>
          }
        }
      }
    }
    const latestPackResponse = await packQuery
      .eq('draft_id', context.run.draftId)
      .eq('workflow_id', continuityWorkflowId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (!latestPackResponse.error) {
      const packRow = (latestPackResponse.data ?? []).find((row: unknown) => helpers.readText(helpers.asRecord(helpers.asRecord(row).metadata).role) === 'sequence_animatic_continuity_pack') ?? null
      if (packRow) {
        const packMetadata = helpers.asRecord(helpers.asRecord(packRow).metadata)
        const pack = helpers.asRecord(packMetadata.continuityPack ?? packMetadata.continuity_pack)
        const assetStateByNodeId = {
          ...helpers.asRecord(pack.assetStateByNodeId ?? pack.asset_state_by_node_id),
          [targetNodeId]: assetState,
        }
        const assetGenerationStatus = helpers.sequenceAnimaticAssetGenerationStatus(assetStateByNodeId)
        const nextPack = {
          ...pack,
          assetStateByNodeId,
          asset_state_by_node_id: assetStateByNodeId,
          assetGenerationStatus,
          asset_generation_status: assetGenerationStatus,
          anchorAssets: [
            ...helpers.readArray(pack.anchorAssets).map(helpers.asRecord).filter((entry) => helpers.readText(entry.id) !== targetNodeId),
            {
              ...targetNode,
              id: targetNodeId,
              anchorType: assetKind === 'temporary_character' ? 'character' : assetKind === 'prop' ? 'prop' : 'location_spot',
              type: assetKind === 'temporary_character' ? 'character' : assetKind === 'prop' ? 'prop' : 'location_spot',
              assetKey,
              artifactKey: artifact.key,
              prompt,
              referenceAssetKeys,
            },
          ].filter((entry) => helpers.readText(entry.assetKey)),
        }
        await client
          .from('output_artifacts')
          .update({
            metadata: {
              ...packMetadata,
              continuityPack: nextPack,
              continuity_pack: nextPack,
              assetStateByNodeId,
              asset_state_by_node_id: assetStateByNodeId,
              assetGenerationStatus,
              asset_generation_status: assetGenerationStatus,
              anchorAssets: nextPack.anchorAssets,
            },
          })
          .eq('id', helpers.readText(helpers.asRecord(packRow).id))
      }
    }
  }

  const globalAssetStatus = assetKey ? helpers.readText(image.globalAssetStatus ?? image.global_asset_status) || 'generated' : 'missing'
  const outputs = {
    artifactKey: artifact.key,
    assetKey,
    artifact,
    artifacts: [artifact],
    reference: {
      status: assetKey ? 'ready' : 'missing',
      assetKey: assetKey || null,
      artifactKey: artifact.key,
      role: referenceRole,
      sourceArtifactRole: 'sequence_animatic_continuity_asset',
      identityKey: 'targetNodeId',
      identityValue: targetNodeId,
      sourceSceneGraphNodeId: targetNodeId,
      globalAssetStatus,
    },
    continuityAsset: {
      targetNodeId,
      assetKind,
      assetState,
      image,
    },
    continuity_asset: {
      targetNodeId,
      assetKind,
      assetState,
      image,
    },
    assetState,
    asset_state: assetState,
    assetStateByNodeId: { [targetNodeId]: assetState },
    asset_state_by_node_id: { [targetNodeId]: assetState },
    targetNode,
    target_node: targetNode,
    image,
    keyframe: image,
    primaryReferenceImage: image,
    globalAssetStatus,
    global_asset_status: globalAssetStatus,
    prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-continuity-asset-artifact-v1' })
}

async function sequenceAnimaticPlannedKeyframePrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const sceneState = helpers.asRecord(config.sceneState ?? config.scene_state)
  const sceneStateText = helpers.compactStoryboardSentence(formatSequenceAnimaticSceneStateForPrompt(sceneState as never), '', 42)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const coverageSetup = helpers.readFirstUpstreamRecord(context.upstream, ['coverageSetup', 'coverage_setup'])
  const coverageAnchor = helpers.readFirstUpstreamRecord(context.upstream, ['coverageAnchor', 'coverage_anchor'])
  const previousKeyframe = helpers.readFirstUpstreamRecord(context.upstream, ['previousKeyframe', 'previous_keyframe'])
  const storyboardPanel = helpers.readFirstUpstreamRecord(context.upstream, ['storyboardPanel', 'storyboard_panel'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const referenceManifest = helpers.sequenceAnimaticReferenceManifestEntries(assetPack)
  const referenceManifestText = referenceManifest
    .map((entry) => helpers.readText(helpers.asRecord(entry).line))
    .filter(Boolean)
    .join('\n')
  const visibleSubjects = helpers.readArray(assetPack.entities).map(helpers.asRecord)
    .filter((entity) => ['character_reference', 'temp_character_reference'].includes(helpers.sequenceAnimaticReferenceRole(entity)))
    .map((entity) => {
      const name = helpers.sequenceAnimaticReferenceName(entity, 'Subject')
      const visual = helpers.sequenceAnimaticReferenceVisual(entity, 16)
      return visual ? `${name} - ${visual}` : name
    })
    .filter(Boolean)
    .slice(0, 8)
    .join('\n')
  const locationRefs = helpers.readArray(assetPack.entities).map(helpers.asRecord)
    .filter((entity) => ['spot_reference', 'zone_reference', 'set_reference', 'viewpoint_reference', 'location_reference'].includes(helpers.sequenceAnimaticReferenceRole(entity)))
    .map((entity) => {
      const name = helpers.sequenceAnimaticReferenceName(entity, 'Location ref')
      const visual = helpers.sequenceAnimaticReferenceVisual(entity, 14)
      return visual ? `${name} - ${visual}` : name
    })
    .filter(Boolean)
    .slice(0, 5)
    .join('\n')
  const propRefs = helpers.readArray(assetPack.entities).map(helpers.asRecord)
    .filter((entity) => helpers.sequenceAnimaticReferenceRole(entity) === 'prop_reference')
    .map((entity) => {
      const name = helpers.sequenceAnimaticReferenceName(entity, 'Prop')
      const visual = helpers.sequenceAnimaticReferenceVisual(entity, 12)
      return visual ? `${name} - ${visual}` : name
    })
    .filter(Boolean)
    .slice(0, 5)
    .join('\n')
  const camera = helpers.asRecord(shot.camera)
  const dialogue = helpers.readArray(shot.dialogue).map(helpers.asRecord).map((line) => {
    const text = helpers.readText(line.text)
    if (!text) return ''
    return `${helpers.readText(line.speakerName) || helpers.readText(line.speakerRefId) || 'Speaker'}: "${text}"`
  }).filter(Boolean).join(' ')
  const action = helpers.compactStoryboardSentence(helpers.readText(shot.action) || helpers.readText(shot.description) || helpers.readText(shot.storyboardPanelPrompt), '', 34)
  const cameraBrief = [helpers.readText(camera.framing), helpers.readText(camera.angle), helpers.readText(camera.lens), helpers.readText(camera.movement)].filter(Boolean).join('; ') || helpers.readText(shot.camera)
  const lighting = helpers.compactStoryboardSentence(helpers.readText(shot.lighting) || helpers.readText(coverageSetup.lightingBrief ?? coverageSetup.lighting_brief), '', 26)
  const coverageFallback = !helpers.readText(coverageAnchor.assetKey) && (
    helpers.readText(coverageSetup.stagingBrief ?? coverageSetup.staging_brief)
    || helpers.readText(coverageSetup.screenDirection ?? coverageSetup.screen_direction)
    || helpers.readText(coverageSetup.cameraBrief ?? coverageSetup.camera_brief)
  )
  const hasCoverageAnchor = Boolean(helpers.readText(coverageAnchor.assetKey))
  const promptText = [
    'Generate one finished cinematic keyframe for this exact animatic shot. Single final frame only.',
    hasCoverageAnchor
      ? 'Composition lock: @Image1 is the coverage anchor. Match its camera position, framing, screen direction, horizon/ground plane, major foreground/background shapes, and subject placement. Replace blockout placeholders with final art.'
      : '',
    '',
    'Reference map',
    referenceManifestText || 'No attached image references; use only the written visual facts.',
    '',
    'Frame target',
    `${helpers.readText(shot.title) || 'Untitled shot'} - ${action || 'one clear visible moment.'}`,
    dialogue ? `Dialogue visible cue: ${helpers.compactStoryboardSentence(dialogue, '', 26)}` : '',
    '',
    'Visible subjects',
    visibleSubjects || 'Only subjects explicitly visible in the shot action.',
    propRefs ? `Props/items\n${propRefs}` : '',
    '',
    'Action/blocking',
    action || 'Hold the exact readable action from the shot.',
    hasCoverageAnchor
      ? 'Use @Image1 coverage anchor as the framing/background/blocking source of truth. Do not copy labels, arrows, placeholder figures, or blockout styling.'
      : (coverageFallback ? `Coverage facts: ${helpers.compactStoryboardSentence(coverageFallback, '', 30)}` : ''),
    helpers.readText(previousKeyframe.assetKey) ? 'Use the previous keyframe reference only for same-setup motion continuity and established state.' : '',
    '',
    'Camera/framing',
    cameraBrief || 'Camera and framing follow the shot plan.',
    helpers.readText(shot.performance) ? `Performance: ${helpers.compactStoryboardSentence(shot.performance, '', 20)}` : '',
    '',
    'Lighting/environment',
    [lighting, locationRefs ? `Location refs\n${locationRefs}` : '', sceneStateText ? `Visual continuity facts: ${sceneStateText}` : ''].filter(Boolean).join('\n') || 'Preserve environment, weather, material, and lighting continuity.',
    '',
    'Negative rules',
    'No captions, labels, arrows, UI, watermarks, borders, split panels, speech bubbles, or visible text. Do not render blockout labels from the coverage anchor. Do not change the coverage-anchor camera angle, lens feel, background layout, or screen direction unless the written shot facts explicitly contradict it. Do not mention workflow, schema, IDs, or asset keys in the image.',
  ].filter(Boolean).join('\n')
  const outputs = {
    prompt: promptText,
    text: promptText,
    shot,
    coverageSetup,
    coverage_setup: coverageSetup,
    coverageAnchor,
    coverage_anchor: coverageAnchor,
    previousKeyframe,
    previous_keyframe: previousKeyframe,
    storyboardPanel,
    storyboard_panel: storyboardPanel,
    assetPack,
    asset_pack: assetPack,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    shotId: helpers.readText(shot.id) || helpers.readText(config.shotId),
    shot_id: helpers.readText(shot.id) || helpers.readText(config.shotId),
    sceneState,
    scene_state: sceneState,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-planned-keyframe-prompt-v3' })
}

async function sequenceAnimaticPlannedKeyframeInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.asRecord(config.shot)
  const coverageSetup = helpers.asRecord(config.coverageSetup ?? config.coverage_setup)
  const coverageAnchor = helpers.asRecord(config.coverageAnchor ?? config.coverage_anchor)
  const previousKeyframe = helpers.asRecord(config.previousKeyframe ?? config.previous_keyframe)
  const storyboardPanel = helpers.asRecord(config.storyboardPanel ?? config.storyboard_panel)
  const requiredReferenceAssetKeys = helpers.readStringArray(config.requiredReferenceAssetKeys ?? config.required_reference_asset_keys)
  const extraReferenceEntities = [
    coverageAnchor,
    previousKeyframe,
    storyboardPanel,
  ].flatMap((image, index): LooseRecord[] => {
    const assetKey = helpers.readText(image.assetKey)
    if (!assetKey) return []
    const label = index === 0 ? 'Coverage anchor' : index === 1 ? 'Previous keyframe' : 'Storyboard panel'
    return [{
      key: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${helpers.slugify(assetKey)}`,
      name: label,
      type: 'continuity_asset',
      role: index === 0 ? 'coverage_anchor_reference' : index === 1 ? 'previous_keyframe_reference' : 'storyboard_panel_reference',
      summary: `${label} for this shot.`,
      visualDescription: `Use this ${label.toLowerCase()} to preserve composition and continuity.`,
      assetKeys: [assetKey],
      primaryAssetKey: assetKey,
      selectedReferenceAssetKey: assetKey,
      selectedReferenceVariantKey: index === 0 ? 'coverage_anchor' : index === 1 ? 'previous_keyframe' : 'storyboard_panel',
      selectedReferenceVariantLabel: label,
      selectedReferenceVariantType: 'continuity_asset',
    }]
  }).filter((entry) => !requiredReferenceAssetKeys.includes(helpers.readText(entry.primaryAssetKey)))
  const baseAssetPack = helpers.buildCinematicV3StoryboardGroupAssetPack({
    assetPack: helpers.asRecord(config.assetPack ?? config.asset_pack),
    shots: [shot],
    maxEntityCount: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8)),
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: true,
    includePerformanceRefs: true,
    includeTextMentionedRefs: false,
  })
  const extraReferenceAssetKeys = extraReferenceEntities
    .map((entity) => helpers.readText(entity.primaryAssetKey))
    .filter(Boolean)
  const assetPack = helpers.orderSequenceAnimaticAssetPackReferences(helpers.scopeAssetPackToReferenceAssetKeys({
    assetPack: baseAssetPack,
    referenceAssetKeys: [...requiredReferenceAssetKeys, ...extraReferenceAssetKeys],
    fallbackEntities: extraReferenceEntities,
    referenceScope: 'sequence_animatic_shot_keyframe',
    limit: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 8) || 8)),
  }))
  const referenceManifest = helpers.sequenceAnimaticReferenceManifestEntries(assetPack)
  const referenceManifestText = helpers.sequenceAnimaticReferenceManifestText(assetPack)
  const outputs = {
    shot,
    coverageSetup,
    coverage_setup: coverageSetup,
    coverageAnchor,
    coverage_anchor: coverageAnchor,
    previousKeyframe,
    previous_keyframe: previousKeyframe,
    storyboardPanel,
    storyboard_panel: storyboardPanel,
    assetPack,
    asset_pack: assetPack,
    referenceManifest,
    reference_manifest: referenceManifest,
    referenceManifestText,
    reference_manifest_text: referenceManifestText,
    shotId: helpers.readText(shot.id) || helpers.readText(config.shotId),
    shot_id: helpers.readText(shot.id) || helpers.readText(config.shotId),
    text: JSON.stringify({ shot, coverageSetup, coverageAnchor, previousKeyframe, storyboardPanel, assetPack }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-planned-keyframe-input-v1' })
}

async function sequenceAnimaticPlannedKeyframeArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const image = readPreferredUpstreamImage({
    upstream: context.upstream,
    helpers,
    preferredNodeKeys: ['planned_keyframe_image', 'shot_keyframe_image'],
    fields: ['image', 'keyframe', 'primaryReferenceImage'],
    role: 'sequence_animatic_shot_keyframe',
  }) ?? {}
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text'])
  const shotId = helpers.readText(shot.id) || helpers.readText(config.shotId)
  if (!shotId) throw new Error('Shot keyframe artifact requires a shot id.')
  const assetKey = helpers.readText(image.assetKey)
  if (!assetKey) throw new Error('Shot keyframe image did not produce an asset key.')
  const qcFindings: string[] = assetKey ? [] : ['Shot keyframe image did not produce an asset key.']
  const qcStatus = qcFindings.length === 0 ? 'passed' : 'failed'
  const keyframe = {
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'shot_keyframe',
    sequenceAnimaticRole: 'shot_keyframe',
    masterRequestId: helpers.readText(config.masterRequestId),
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    shotId,
    coverageSetupId: helpers.readText(config.coverageSetupId),
    assetKey,
    image,
    prompt,
    qcStatus,
    qcFindings,
    status: assetKey ? 'ready' : 'failed',
    generatedAt: new Date().toISOString(),
  }
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.${helpers.slugify(shotId)}.sequence-animatic-shot-keyframe`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${helpers.readText(shot.title) || helpers.titleFromRefLike(shotId)} Keyframe`,
    summary: 'Final shot keyframe generated from the animatic shot plan, coverage anchor, and shot-scoped references.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-shot-keyframe-artifact-v1',
      role: 'sequence_animatic_shot_keyframe',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'shot_keyframe',
      screenplayAnimaticRole: 'shot_keyframe',
      masterRequestId: keyframe.masterRequestId,
      storyboardBlockId: keyframe.storyboardBlockId,
      shotId,
      coverageSetupId: keyframe.coverageSetupId,
      assetKey,
      requiredReferenceAssetKeys: helpers.readStringArray(config.requiredReferenceAssetKeys),
      omittedReferenceAssetKeys: helpers.readStringArray(config.omittedReferenceAssetKeys),
      sourceReferenceHash: helpers.readText(config.sourceReferenceHash),
      visualPlanHash: helpers.readText(config.visualPlanHash),
      qcStatus,
      qcFindings,
      prompt,
      image,
      shot,
      keyframe,
    },
  })
  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: keyframe.masterRequestId,
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: assetKey ? 'shot_keyframe_ready' : 'shot_keyframe_failed',
    payload: {
      shotId,
      storyboardBlockId: keyframe.storyboardBlockId,
      coverageSetupId: keyframe.coverageSetupId,
      assetKey,
      artifactKey: artifact.key,
      status: keyframe.status,
    },
    metadata: { source: 'sequence_animatic_keyframe_workflow' },
    dedupe: { shotId },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey,
    artifact,
    artifacts: [artifact],
    shotKeyframe: keyframe,
    shot_keyframe: keyframe,
    keyframe,
    image,
    shot,
    prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-shot-keyframe-artifact-v1' })
}

async function sequenceAnimaticPlannedKeyframeImage(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return helpers.executeImageGeneration(context)
}

async function sequenceAnimaticShotVideoPrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shotRecord = helpers.readFirstUpstreamRecord(context.upstream, ['shot'])
  const shot = cinematicV2ShotPlanSchema.shape.shots.element.parse({
    ...shotRecord,
    editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(shotRecord.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3)),
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(Number(shotRecord.editorialDurationSeconds ?? config.editorialDurationSeconds ?? 0) || 3),
  })
  const rawAssetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const upstreamImages = readUpstreamImages(context.upstream, helpers, ['image', 'keyframe', 'primaryReferenceImage'])
  const assetPackReferenceLimit = Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 6) || 6))
  const visualAssetPack = helpers.buildCinematicV3StoryboardGroupAssetPack({
    assetPack: rawAssetPack,
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: assetPackReferenceLimit,
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: false,
    includePerformanceRefs: false,
    includeTextMentionedRefs: false,
  })
  const voiceGuideAssetPack = helpers.buildCinematicV3StoryboardGroupAssetPack({
    assetPack: rawAssetPack,
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: assetPackReferenceLimit,
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: true,
    includePerformanceRefs: true,
    includeTextMentionedRefs: false,
  })
  const entityByKey = helpers.cinematicEntityByKey(voiceGuideAssetPack)
  const timing = await helpers.inferSequenceShotVideoTiming({
    nodeKey: context.node.key,
    shot: shot as unknown as LooseRecord,
    entityByKey,
  })
  const editorialDurationSeconds = Math.max(1, Math.min(15, Number(timing.editorialDurationSeconds) || 3))
  const providerDurationSeconds = providerSafeCinematicV2DurationSeconds(editorialDurationSeconds)
  const dialogueLines = shot.dialogue
    .map((line) => {
      const text = helpers.readText(line.text)
      if (!text) return ''
      const speakerKey = helpers.readText(line.speakerRefId)
      const speaker = helpers.readText(entityByKey.get(speakerKey)?.name) || helpers.readText(line.speakerName) || speakerKey || 'Speaker'
      const emotion = helpers.readText(line.emotion)
      return `${speaker}: "${text}"${emotion ? ` (${emotion})` : ''}`
    })
    .filter(Boolean)
    .join(' ')
  const seedanceReferenceManifest = helpers.buildSeedanceReferenceManifest({
    imageReferences: [
      ...helpers.seedanceReferenceRecordsFromImages(upstreamImages.slice(0, 1), 'keyframes'),
      ...helpers.seedanceReferenceRecordsFromAssetPack(visualAssetPack, assetPackReferenceLimit),
    ].slice(0, 9),
    cinematicReferenceMode: 'keyframes',
  })
  const characterVoiceGuide = helpers.buildSeedanceCharacterVoiceGuide({
    assetPack: voiceGuideAssetPack,
    shots: [shot as unknown as LooseRecord],
    limit: 4,
    visualIdentityKeys: new Set(shot.visibleCharacterRefIds),
  })
  const shotAction = helpers.readText(shot.action) || helpers.readText(shot.description) || helpers.readText(shot.storyboardPanelPrompt) || helpers.readText(shot.title)
  const shotLine = [
    helpers.formatSeedanceShotLine({
      shot: shot as unknown as LooseRecord,
      startSeconds: 0,
      endSeconds: providerDurationSeconds,
      dialogueLines,
    }),
    helpers.readText(shot.lighting) ? `Lighting: ${helpers.compactSeedanceControlText(shot.lighting, 12)}.` : '',
  ].filter(Boolean).join(' ')
  const prompt = helpers.buildCompactSeedanceVideoPrompt({
    durationSeconds: providerDurationSeconds,
    aspectRatio: helpers.readText(config.aspectRatio) || '16:9',
    resolution: helpers.readText(config.resolution) || '720p',
    referenceManifest: seedanceReferenceManifest,
    referenceInstruction: 'Treat @Image1 as the cropped shot keyframe reference, not a storyboard sheet. Preserve composition, visible subjects, lighting, environment, and props while animating the shot.',
    directedControls: timing.directedControls,
    shotSectionTitle: 'SHOT',
    shotLines: shotLine || shotAction,
    identityGuide: characterVoiceGuide,
    audioPolicy: 'No music, score, audio bed, room tone, crowd wash, or background ambience. Use only scripted dialogue and direct diegetic sound effects caused by visible or explicitly offscreen shot action.',
    movementLogic: helpers.seedanceLabanMovementBlock([shot as unknown as LooseRecord], helpers.readText(context.run.prompt)),
    artifactBan: helpers.seedanceProductionBoardArtifactBan(seedanceReferenceManifest),
    clipLabel: 'this single shot',
  })
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const timedShot = { ...shot, editorialDurationSeconds, providerDurationSeconds }
  const outputs = {
    prompt,
    text: prompt,
    shot: timedShot,
    shotPlan: {
      sceneId: 'sequence_animatic_shot',
      totalEditorialDurationSeconds: editorialDurationSeconds,
      shots: [timedShot],
    },
    shot_plan: {
      sceneId: 'sequence_animatic_shot',
      totalEditorialDurationSeconds: editorialDurationSeconds,
      shots: [timedShot],
    },
    assetPack: visualAssetPack,
    asset_pack: visualAssetPack,
    voiceGuideAssetPack,
    voice_guide_asset_pack: voiceGuideAssetPack,
    primaryReferenceImage: upstreamImages[0] ?? null,
    referenceImageCount: upstreamImages.length,
    seedanceReferenceManifest,
    directedControls: timing.directedControls,
    audioPolicy: 'dialogue_and_direct_diegetic_sfx_only',
    visualReferencePolicy: 'visible_characters_location_props_only',
    offscreenSpeakerVisualReferencesExcluded: true,
    editorialDurationSeconds,
    providerDurationSeconds,
    durationSeconds: providerDurationSeconds,
    timingInference: {
      mode: 'llm_from_shot_details',
      ignoredTaggedShotTiming: true,
      rationale: helpers.readText(timing.rationale),
      pacingNotes: helpers.readText(timing.pacingNotes),
      provider: helpers.readText(timing.provider),
      model: helpers.readText(timing.model),
      fallbackUsed: timing.fallbackUsed,
      fallbackReason: helpers.readText(timing.fallbackReason),
    },
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    sequenceAnimaticRole: 'shot_video',
    guidance,
    deterministic: helpers.readText(timing.provider) === 'graphcore',
  }
  return {
    inputHash: context.inputHash,
    outputHash: helpers.hashOutputWorkflowValue(outputs),
    outputs,
    provider: helpers.readText(timing.provider) || 'graphcore',
    model: helpers.readText(timing.model) || 'sequence-animatic-shot-video-prompt-v2',
  }
}

async function sequenceAnimaticShotVideoArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const video = readUpstreamVideos(context.upstream, helpers, ['video', 'videos'])[0] ?? {}
  const prompt = helpers.readFirstUpstreamText(context.upstream, ['prompt', 'text', 'providerPrompt'])
  const keyframe = helpers.readFirstUpstreamImage(context.upstream, ['keyframe', 'image', 'primaryReferenceImage'])
  const shotId = helpers.readText(config.shotId)
  if (!shotId) throw new Error('Shot video artifact requires a shot id.')
  const assetKey = helpers.readText(video.assetKey)
  if (!assetKey) {
    const outputs = {
      video,
      prompt,
      keyframe,
      assetKey: '',
      skipped: true,
      skippedReason: helpers.readText(video.skippedReason) || 'shot_video_missing_asset',
      authoringReady: false,
    }
    return {
      status: 'skipped',
      inputHash: context.inputHash,
      outputHash: helpers.hashOutputWorkflowValue(outputs),
      outputs,
      provider: 'graphcore',
      model: 'sequence-animatic-shot-video-artifact-skip-v1',
    }
  }
  const storagePath = helpers.readText(video.storagePath) || helpers.readText(video.storage_path)
  if (!storagePath) throw new Error('Shot video artifact requires a storage path.')
  const mimeType = helpers.readText(video.mimeType) || helpers.readText(video.mime_type) || 'video/mp4'
  const artifact = await helpers.registerVideoArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    assetKey,
    storagePath,
    mimeType,
    name: `${helpers.titleFromRefLike(helpers.readText(config.shotId))} Video`,
    summary: 'Generated per-shot sequence animatic video.',
    metadata: {
      ...helpers.asRecord(video.metadata),
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: helpers.readText(video.provider),
      model: helpers.readText(video.model),
      providerRequestId: helpers.readText(video.providerRequestId),
      role: 'sequence_animatic_shot_video',
      graphSpecVersion: 'sequence_animatic_graph_v2',
      sequenceAnimaticRole: 'shot_production',
      screenplayAnimaticRole: 'shot_production',
      masterRequestId: helpers.readText(config.masterRequestId),
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
      shotId,
      coverageSetupId: helpers.readText(config.coverageSetupId),
      assetKey,
      storagePath,
      prompt,
      keyframe,
    },
  })
  await helpers.insertSequenceAnimaticEvent({
    client: context.client,
    projectId: context.run.projectId,
    draftId: context.run.draftId,
    requestId: helpers.readText(config.masterRequestId),
    workflowId: context.workflow.id,
    runId: context.run.id,
    eventType: 'shot_video_ready',
    payload: {
      shotId,
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
      coverageSetupId: helpers.readText(config.coverageSetupId),
      assetKey,
      artifactKey: artifact.key,
      status: 'ready',
    },
    metadata: { source: 'sequence_animatic_shot_production_workflow' },
    dedupe: { shotId, assetKey },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey,
    artifact,
    artifacts: [artifact],
    video: {
      ...video,
      assetKey,
      storagePath,
      mimeType,
      role: 'sequence_animatic_shot_video',
    },
    keyframe,
    prompt,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-shot-video-artifact-v1' })
}

async function sequenceAnimaticShotVideo(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return helpers.executeVideoGeneration(context)
}

async function sequenceAnimaticShotRevisionInput(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const rawShot = helpers.asRecord(config.shot)
  const shot = cinematicV2ShotSchema.parse({
    ...rawShot,
    editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(rawShot.editorialDurationSeconds ?? 0) || 3)),
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(Number(rawShot.editorialDurationSeconds ?? 0) || 3),
  })
  const panel = helpers.asRecord(config.panel)
  const basePanelAssetKey = helpers.readText(panel.assetKey)
  if (!basePanelAssetKey) {
    throw new Error('Sequence animatic shot revision requires a cropped panel asset. Generate/extract the storyboard panel before revising this shot.')
  }
  const assetPack = helpers.buildCinematicV3StoryboardGroupAssetPack({
    assetPack: helpers.asRecord(config.assetPack),
    shots: [shot as unknown as LooseRecord],
    maxEntityCount: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 6) || 6)),
    maxAssetKeysPerEntity: 1,
    includeSpeakerRefs: true,
    includePerformanceRefs: true,
    includeTextMentionedRefs: false,
  })
  const baseKeyframe = {
    ...panel,
    assetKey: basePanelAssetKey,
    role: 'sequence_animatic_shot_revision_base_keyframe',
    name: helpers.readText(panel.name) || `${shot.title || `Shot ${shot.index}`} base keyframe`,
    shotId: shot.id,
    shotIndex: shot.index,
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    usedAsVideoReference: true,
    metadata: {
      ...helpers.asRecord(panel.metadata),
      role: 'sequence_animatic_shot_revision_base_keyframe',
      shotId: shot.id,
      shotIndex: shot.index,
      storyboardBlockId: helpers.readText(config.storyboardBlockId),
    },
  }
  const revisionPrompt = helpers.readText(config.revisionPrompt)
  const outputs = {
    shot,
    baseShot: shot,
    base_shot: shot,
    baseKeyframe,
    base_keyframe: baseKeyframe,
    image: baseKeyframe,
    keyframe: baseKeyframe,
    panel,
    assetPack,
    asset_pack: assetPack,
    revisionPrompt,
    revision_prompt: revisionPrompt,
    revisionId: helpers.readText(config.revisionId),
    revision_id: helpers.readText(config.revisionId),
    screenplayAnimaticRole: 'shot_revision',
    sequenceAnimaticRole: 'shot_revision',
    text: JSON.stringify({ shot, baseKeyframe, revisionPrompt, assetPack }, null, 2),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-revision-input-v1' })
}

async function sequenceAnimaticShotRevisionPlan(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const shot = helpers.readFirstUpstreamRecord(context.upstream, ['shot', 'baseShot', 'base_shot'])
  const revisionPrompt = helpers.readFirstUpstreamText(context.upstream, ['revisionPrompt', 'revision_prompt']) || helpers.readText(config.revisionPrompt)
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const baseKeyframe = helpers.readFirstUpstreamRecord(context.upstream, ['baseKeyframe', 'base_keyframe', 'image', 'keyframe'])
  const priorStepMetadata = helpers.asRecord(context.priorStep?.metadata)
  const revision = await helpers.planSequenceAnimaticShotRevision({
    nodeKey: context.node.key,
    shot,
    revisionPrompt,
    assetPack,
    baseKeyframe,
    priorProviderRequestId: helpers.readText(context.priorStep?.providerRequestId) || helpers.readText(priorStepMetadata.providerRequestId),
    shouldCancel: context.shouldCancel,
    onProgress: async (progress) => {
      await context.onProgress?.({
        provider: 'openai',
        model: helpers.outputWorkflowTextModel(),
        providerRequestId: progress.providerRequestId,
        metadata: {
          providerMode: progress.providerMode,
          providerStatus: progress.providerStatus,
          lastProviderPollAt: progress.lastProviderPollAt,
          shotRevisionPlanner: true,
        },
      })
    },
  })
  const provider = helpers.readText(revision.provider) || 'graphcore'
  const model = helpers.readText(revision.model) || 'sequence-animatic-shot-revision-plan-v1'
  const providerRequestId = helpers.readText(revision.providerRequestId)
  const fallbackReason = helpers.readText(revision.fallbackReason)
  const outputs = {
    revisionPlan: revision,
    revision_plan: revision,
    revisedShot: revision.revisedShot,
    revised_shot: revision.revisedShot,
    baseShot: shot,
    base_shot: shot,
    revisionPrompt,
    revision_prompt: revisionPrompt,
    changeSummary: revision.changeSummary,
    change_summary: revision.changeSummary,
    keyframeIntent: revision.keyframeIntent,
    keyframe_intent: revision.keyframeIntent,
    diagnostics: [
      ...helpers.readStringArray(revision.diagnostics),
      ...(revision.fallbackUsed ? [`Fallback used: ${fallbackReason || 'structured revision unavailable'}`] : []),
    ],
    text: JSON.stringify(revision, null, 2),
    providerRequestId,
    plannerProvider: provider,
    plannerModel: model,
    deterministic: provider === 'graphcore',
  }
  return {
    inputHash: context.inputHash,
    outputHash: helpers.hashOutputWorkflowValue(outputs),
    outputs,
    provider,
    model,
    providerRequestId: providerRequestId || undefined,
  }
}

async function sequenceAnimaticShotKeyframePrompt(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const revisedShot = cinematicV2ShotSchema.parse(helpers.readFirstUpstreamRecord(context.upstream, ['revisedShot', 'revised_shot', 'shot']))
  const baseKeyframe = helpers.readFirstUpstreamRecord(context.upstream, ['baseKeyframe', 'base_keyframe', 'image', 'keyframe'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const referenceEntities = helpers.readArray(assetPack.entities).map(helpers.asRecord).map((entity) => {
    const name = helpers.readText(entity.name)
    const visual = helpers.readText(entity.visualDescription) || helpers.readText(entity.summary)
    return name && visual ? `${name}: ${visual}` : name || visual
  }).filter(Boolean).slice(0, 8).join('\n')
  const camera = helpers.asRecord(revisedShot.camera)
  const dialogue = revisedShot.dialogue.map((line) => {
    const text = helpers.readText(line.text)
    if (!text) return ''
    return `${helpers.readText(line.speakerName) || helpers.readText(line.speakerRefId) || 'Speaker'}: "${text}"`
  }).filter(Boolean).join(' ')
  const promptText = [
    'Generate one revised cinematic keyframe for this exact animatic shot. Use the base keyframe reference to preserve identity, location, wardrobe, props, aspect ratio, and continuity, while applying the revised shot direction.',
    'Do not create a storyboard grid, captions, UI, watermarks, labels, or multiple panels. Produce one finished frame only.',
    '',
    `Shot title: ${revisedShot.title}`,
    `Action: ${revisedShot.action || revisedShot.description || revisedShot.storyboardPanelPrompt}`,
    dialogue ? `Dialogue context: ${dialogue}` : '',
    `Camera: ${[helpers.readText(camera.framing), helpers.readText(camera.angle), helpers.readText(camera.lens), helpers.readText(camera.movement)].filter(Boolean).join('; ')}`,
    helpers.readText(revisedShot.lighting) ? `Lighting: ${helpers.readText(revisedShot.lighting)}` : '',
    helpers.readText(revisedShot.mood) ? `Mood: ${helpers.readText(revisedShot.mood)}` : '',
    helpers.readText(revisedShot.storyboardPanelPrompt) ? `Panel composition: ${helpers.readText(revisedShot.storyboardPanelPrompt)}` : '',
    '',
    referenceEntities ? `Relevant references:\n${referenceEntities}` : '',
    helpers.readText(config.revisionPrompt) ? `User revision: ${helpers.readText(config.revisionPrompt)}` : '',
    `Base keyframe asset: ${helpers.readText(baseKeyframe.assetKey)}`,
  ].filter(Boolean).join('\n')
  const outputs = {
    prompt: promptText,
    text: promptText,
    revisedShot,
    revised_shot: revisedShot,
    shot: revisedShot,
    baseKeyframe,
    base_keyframe: baseKeyframe,
    image: baseKeyframe,
    assetPack,
    asset_pack: assetPack,
    revisionId: helpers.readText(config.revisionId),
    revision_id: helpers.readText(config.revisionId),
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    shotId: helpers.readText(config.shotId),
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-sequence-animatic-shot-keyframe-prompt-v1' })
}

async function sequenceAnimaticShotKeyframeImage(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  return helpers.executeImageGeneration(context)
}

async function sequenceAnimaticShotRevisionArtifact(
  context: SequenceAnimaticNodeExecutionContext,
  helpers: SequenceAnimaticWorkflowNodePackHelpers,
) {
  const config = helpers.asRecord(context.node.config)
  const workflowMetadata = helpers.asRecord(context.workflow.metadata)
  const revisedShot = cinematicV2ShotSchema.parse(helpers.readFirstUpstreamRecord(context.upstream, ['revisedShot', 'revised_shot', 'shot']))
  const revisionPlan = helpers.readFirstUpstreamRecord(context.upstream, ['revisionPlan', 'revision_plan'])
  const keyframe = helpers.readFirstUpstreamRecord(context.upstream, ['keyframe', 'image'])
  const keyframeAssetKey = helpers.readText(keyframe.assetKey)
  const revisionId = helpers.readText(config.revisionId) || `shot_revision_${helpers.slugify(helpers.readText(config.shotId))}_${context.run.id.slice(0, 8)}`
  const revisionPrompt = helpers.readText(config.revisionPrompt) || helpers.readText(context.run.prompt)
  const sourceManifestHash = helpers.readText(config.manifestHash) || helpers.readText(workflowMetadata.manifestHash)
  const basePanelAssetKey = helpers.readText(config.basePanelAssetKey) || helpers.readText(workflowMetadata.basePanelAssetKey)
  const diagnostics = [
    ...helpers.readStringArray(revisionPlan.diagnostics),
    ...(keyframeAssetKey ? [] : ['Shot text was revised, but no replacement keyframe image was generated.']),
  ]
  const revision = {
    graphSpecVersion: 'sequence_animatic_graph_v1',
    screenplayAnimaticRole: 'shot_revision',
    sequenceAnimaticRole: 'shot_revision',
    masterRequestId: helpers.readText(config.masterRequestId) || helpers.readText(workflowMetadata.masterRequestId),
    parentRequestId: helpers.readText(config.parentRequestId) || helpers.readText(workflowMetadata.parentRequestId),
    storyboardBlockId: helpers.readText(config.storyboardBlockId),
    shotId: helpers.readText(config.shotId),
    revisionId,
    sourceManifestHash,
    manifestHash: sourceManifestHash,
    blockHash: helpers.readText(config.blockHash),
    shotHash: helpers.readText(config.shotHash),
    continuityPackHash: helpers.readText(config.continuityPackHash),
    masterManifestArtifactKey: helpers.readText(config.masterManifestArtifactKey),
    basePanelAssetKey,
    revisedShot,
    keyframeAssetKey,
    keyframe,
    prompt: revisionPrompt,
    changeSummary: helpers.readText(revisionPlan.changeSummary),
    keyframeIntent: helpers.readText(revisionPlan.keyframeIntent),
    diagnostics,
    revisionHash: helpers.hashOutputWorkflowValue({
      revisedShot,
      keyframeAssetKey,
      revisionPrompt,
      sourceManifestHash,
    }),
  }
  const artifactKey = `output.${helpers.slugify(context.workflow.name)}.${context.run.id.slice(0, 8)}.sequence-animatic-shot-revision`
  const artifact = await helpers.registerOtherOutputArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    key: artifactKey,
    name: `${context.node.label} Artifact`,
    summary: 'Sequence animatic output-local single-shot revision.',
    metadata: {
      generatedBy: 'output_workflow',
      workflowId: context.workflow.id,
      workflowKey: context.workflow.key,
      runId: context.run.id,
      nodeId: context.node.id,
      nodeKey: context.node.key,
      preset: context.run.preset,
      provider: 'graphcore',
      model: 'sequence-animatic-shot-revision-artifact-v1',
      role: 'sequence_animatic_shot_revision',
      graphSpecVersion: 'sequence_animatic_graph_v1',
      sequenceAnimaticRole: 'shot_revision',
      screenplayAnimaticRole: 'shot_revision',
      masterRequestId: revision.masterRequestId,
      parentRequestId: revision.parentRequestId,
      storyboardBlockId: revision.storyboardBlockId,
      shotId: revision.shotId,
      revisionId,
      sourceManifestHash,
      manifestHash: sourceManifestHash,
      blockHash: revision.blockHash,
      shotHash: revision.shotHash,
      basePanelAssetKey,
      keyframeAssetKey,
      prompt: revisionPrompt,
      revisedShot,
      keyframe,
      revision,
      diagnostics,
    },
  })
  const outputs = {
    artifactKey: artifact.key,
    assetKey: keyframeAssetKey,
    artifact,
    artifacts: [artifact],
    revision,
    shotRevision: revision,
    shot_revision: revision,
    revisedShot,
    revised_shot: revisedShot,
    keyframe,
    image: keyframe,
    keyframeAssetKey,
    keyframe_asset_key: keyframeAssetKey,
    authoringReady: true,
  }
  return result({ context, helpers, outputs, model: 'sequence-animatic-shot-revision-artifact-v1' })
}

const sequenceAnimaticHandlers = {
  sequence_animatic_shot_input: sequenceAnimaticShotInput,
  sequence_animatic_shared_asset_ref: sequenceAnimaticSharedAssetRef,
  sequence_animatic_shot_reference_pack: sequenceAnimaticShotReferencePack,
  sequence_animatic_block_input: sequenceAnimaticBlockInput,
  sequence_animatic_block_artifact: sequenceAnimaticBlockArtifact,
  sequence_animatic_scene_plan_fanout: sequenceAnimaticScenePlanFanout,
  sequence_animatic_scene_package: sequenceAnimaticScenePackage,
  sequence_animatic_scene_graph_assignment: sequenceAnimaticSceneGraphAssignment,
  sequence_animatic_scene_shot_plan: sequenceAnimaticSceneShotPlan,
  sequence_animatic_director_plan: sequenceAnimaticDirectorPlan,
  sequence_animatic_scene_input: sequenceAnimaticSceneInput,
  sequence_animatic_scene_register: sequenceAnimaticSceneRegister,
  sequence_animatic_orchestrator: sequenceAnimaticOrchestrator,
  sequence_animatic_scene_plan_merge: sequenceAnimaticScenePlanMerge,
  sequence_animatic_manifest: sequenceAnimaticManifest,
  sequence_animatic_manifest_artifact: sequenceAnimaticManifestArtifact,
  sequence_animatic_director_plan_artifact: sequenceAnimaticDirectorPlanArtifact,
  sequence_animatic_coverage_plan: sequenceAnimaticCoveragePlan,
  sequence_animatic_coverage_intent_input: sequenceAnimaticCoverageIntentInput,
  sequence_animatic_coverage_intent_plan: sequenceAnimaticCoverageIntentPlan,
  sequence_animatic_coverage_intent_artifact: sequenceAnimaticCoverageIntentArtifact,
  sequence_animatic_coverage_anchor_input: sequenceAnimaticCoverageAnchorInput,
  sequence_animatic_coverage_anchor_brief: sequenceAnimaticCoverageAnchorBrief,
  sequence_animatic_coverage_anchor_prompt: sequenceAnimaticCoverageAnchorPrompt,
  sequence_animatic_coverage_anchor_artifact: sequenceAnimaticCoverageAnchorArtifact,
  sequence_animatic_continuity_asset_input: sequenceAnimaticContinuityAssetInput,
  sequence_animatic_continuity_asset_artifact: sequenceAnimaticContinuityAssetArtifact,
  sequence_animatic_planned_keyframe_prompt: sequenceAnimaticPlannedKeyframePrompt,
  sequence_animatic_planned_keyframe_input: sequenceAnimaticPlannedKeyframeInput,
  sequence_animatic_planned_keyframe_image: sequenceAnimaticPlannedKeyframeImage,
  sequence_animatic_planned_keyframe_artifact: sequenceAnimaticPlannedKeyframeArtifact,
  sequence_animatic_shot_video_prompt: sequenceAnimaticShotVideoPrompt,
  sequence_animatic_shot_video: sequenceAnimaticShotVideo,
  sequence_animatic_shot_video_artifact: sequenceAnimaticShotVideoArtifact,
  sequence_animatic_shot_revision_input: sequenceAnimaticShotRevisionInput,
  sequence_animatic_shot_revision_plan: sequenceAnimaticShotRevisionPlan,
  sequence_animatic_shot_keyframe_prompt: sequenceAnimaticShotKeyframePrompt,
  sequence_animatic_shot_keyframe_image: sequenceAnimaticShotKeyframeImage,
  sequence_animatic_shot_revision_artifact: sequenceAnimaticShotRevisionArtifact,
}

export const sequenceAnimaticWorkflowNodePack = defineWorkflowNodePack<
  SequenceAnimaticNodeExecutionContext,
  SequenceAnimaticNodeExecutionResult,
  SequenceAnimaticWorkflowNodePackHelpers,
  typeof sequenceAnimaticHandlers
>({
  packKey: 'sequence_animatic',
  handlers: sequenceAnimaticHandlers,
})

export const sequenceAnimaticWorkflowNodeHandlerKeys = sequenceAnimaticWorkflowNodePack.handlerKeys

export function registerSequenceAnimaticWorkflowNodePack(input: {
  helpers: SequenceAnimaticWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>) => void
}) {
  sequenceAnimaticWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
