import type { OutputArtifact } from '../../../src/domain/outputWorkflow.ts'
import type { WorkflowStreamingMetadata } from '../../../src/domain/outputWorkflowManifests.ts'
import type { SequenceAnimaticOrchestratorRuntimeHelpers } from './output-workflow-sequence-animatic-orchestrator-runtime.ts'
import type { SequenceAnimaticDirectorPlanRuntimeHelpers } from './output-workflow-sequence-animatic-planning-runtime.ts'
import type { z } from 'zod'

export type LooseRecord = Record<string, unknown>

export type SequenceAnimaticNodeExecutionContext = {
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
    startedAt?: string | null
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

export type SequenceAnimaticNodeExecutionResult = {
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
  sequenceAnimaticEmptyGraphV2: (context?: LooseRecord) => LooseRecord
  parseSequenceAnimaticGraphV2: (value: unknown) => LooseRecord
  sequenceAnimaticGlobalStoryboardBlock: (continuityPlannerContext: LooseRecord) => LooseRecord
  sequenceAnimaticBlockShots: (context: LooseRecord, block: LooseRecord) => LooseRecord[]
  emptySequenceAnimaticContinuityBlockDelta: (blockId: string, warning?: string) => LooseRecord
  sequenceAnimaticContinuityBlockDeltaSchema: z.ZodType<LooseRecord>
  parseSequenceAnimaticContinuityBlockDelta: (value: unknown) => LooseRecord
  repairSequenceAnimaticContinuityBlockDelta: (input: {
    delta: LooseRecord
    graph: LooseRecord
    continuityPlannerContext: LooseRecord
    storyboardBlock: LooseRecord
    allowDeterministicFallback?: boolean
  }) => LooseRecord
  mergeSequenceAnimaticContinuityGraphV2: (input: {
    graph: LooseRecord
    delta: LooseRecord
    continuityPlannerContext: LooseRecord
  }) => LooseRecord
  finalizeSequenceAnimaticContinuityGraphV2: (graphInput: unknown) => LooseRecord & {
    continuityGraphV2: LooseRecord
    sceneGraph: LooseRecord
    shotContinuityMap: LooseRecord
    shotBindings: LooseRecord
    assetAnchors: LooseRecord[]
    locationSpotAnchors: LooseRecord[]
    locationSets: LooseRecord[]
    locationAngles: LooseRecord[]
    rejectedCandidates: LooseRecord[]
    warnings: string[]
    diagnostics: string[]
  }
  sequenceAnimaticContinuityCoverage: (graphInput: unknown, continuityPlannerContext: LooseRecord, blockStates?: Record<string, unknown>) => LooseRecord
  continuityBlockNodeSuffix: (nodeKey: string) => string
  previousContinuityGraphNodeKeys: (blockSuffix: string) => string[]
  outputWorkflowContinuityBlockPlannerTimeoutMs: () => number
  sequenceAnimaticContinuityBlockStatesFromGraph: (graphInput: unknown, options?: {
    activeBlockId?: string
    activeDelta?: LooseRecord
    status?: 'not_started' | 'seeded' | 'deriving' | 'ready' | 'needs_review' | 'failed' | 'stale'
    error?: string
  }) => Record<string, unknown>
  sequenceAnimaticSeededBlockStatesFromCoverage: (
    graphInput: unknown,
    continuityPlannerContext: LooseRecord,
    previousBlockStates?: Record<string, unknown>,
  ) => Record<string, unknown>
  sequenceAnimaticContinuityGraphStatusFromBlockStates: (blockStates: Record<string, unknown>) => string
  withSequenceAnimaticContinuityAssetState: (pack: LooseRecord, graphInput: unknown) => LooseRecord
  persistSequenceAnimaticContinuityRequestState: (input: {
    client: unknown
    run: SequenceAnimaticNodeExecutionContext['run']
    workflow: SequenceAnimaticNodeExecutionContext['workflow']
    artifactKey: string
    continuityPack: LooseRecord
    blockStates: Record<string, unknown>
    pendingDeltas: Record<string, unknown>
  }) => Promise<void>
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
      streaming?: WorkflowStreamingMetadata
      streamingStatus?: WorkflowStreamingMetadata['status']
      streamingEventCount?: number
      streamingWarningCount?: number
      streamingPartialArtifactKeys?: string[]
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
  buildSequenceAnimaticContinuityAssetPrompt: (input: {
    targetNode: LooseRecord
    assetKind: string
    generationPolicy: string
    zoneMapPoiLines: string[]
    relevantShots: LooseRecord[]
    referenceAssetKeys: string[]
  }) => LooseRecord & {
    prompt: string
    sanitizedTargetNode?: unknown
    locationEvidenceLines?: unknown
    promptDiagnostics?: unknown
  }
  buildSequenceAnimaticContinuityBatchPrompt: (input: {
    batch: LooseRecord
    targetNodes: LooseRecord[]
    relevantShots: LooseRecord[]
    referenceAssetKeys: string[]
  }) => LooseRecord & {
    prompt: string
    sanitizedTargetNodes?: unknown
    locationEvidenceLines?: unknown
    promptDiagnostics?: unknown
  }
  planSequenceAnimaticContinuityAnchors: (input: {
    nodeKey: string
    prompt?: string | null
    screenplayDraft: LooseRecord
    shotPlan: LooseRecord
    shotBreakPlan: LooseRecord
    assetPack: LooseRecord
    continuityPlannerContext: LooseRecord
    continuityGraphV2: LooseRecord
    priorProviderRequestId?: string | null
    priorProviderStartedAt?: string | null
    shouldCancel?: () => Promise<boolean>
    onProgress?: (progress: {
      providerRequestId?: string | null
      providerMode?: string | null
      providerStatus?: string | null
      lastProviderPollAt?: string | null
      providerStartedAt?: string | null
      streaming?: WorkflowStreamingMetadata
      streamingStatus?: WorkflowStreamingMetadata['status']
      streamingEventCount?: number
      streamingWarningCount?: number
      streamingPartialArtifactKeys?: string[]
    }) => Promise<void>
  }) => Promise<LooseRecord & {
    characterAnchors?: unknown[]
    propAnchors?: unknown[]
    locationSpotAnchors?: unknown[]
    continuityAnchorIdsByShotId?: unknown
    shotContinuityMap?: unknown
    shotBindings?: unknown
    locationSets?: unknown
    locationAngles?: unknown
    sceneGraph?: unknown
    rejectedCandidates?: unknown
    continuityGraphV2?: unknown
    planningMode?: string
  }>
  sequenceAnimaticAtlasLayout: (count: number) => { rows: number; columns: number; panelCount: number }
  sequenceAnimaticAtlasImageSize: (layout: { rows: number; columns: number; panelCount: number }) => { width: number; height: number }
  buildSequenceAnimaticAnchorAtlasPrompt: (input: {
    anchorType: 'character' | 'prop' | 'location_spot'
    anchors: LooseRecord[]
    layout: { rows: number; columns: number; panelCount: number }
    assetPack: LooseRecord
  }) => string
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
  registerImageArtifact: (input: {
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
  downloadProjectAssetBytes: (client: unknown, storagePath: string) => Promise<Uint8Array>
  downloadRemoteBytes: (url: string) => Promise<Uint8Array>
  makeTempDir: (prefix: string) => Promise<string>
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>
  readFile: (path: string) => Promise<Uint8Array>
  removeDir: (path: string) => Promise<void>
  probeImageSize: (path: string) => Promise<{ width: number; height: number } | null>
  runFfmpeg: (args: string[]) => Promise<{ ok: boolean; stderr: string }>
  verifySequenceAnimaticAnchorCrop: (input: {
    outputPath: string
    anchorId: string
    expectedWidth: number
    expectedHeight: number
    row: number
    column: number
  }) => Promise<unknown>
  uploadBytes: (client: unknown, storagePath: string, bytes: Uint8Array, mimeType: string) => Promise<void>
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
    priorProviderRequestId?: string | null
    providerStartedAt?: string | null
    timeoutMs?: number
    shouldCancel?: () => Promise<boolean>
    onProgress?: (progress: {
      providerRequestId: string
      providerStatus: string
      providerMode: string
      providerStartedAt?: string
      lastProviderPollAt: string
      streaming?: WorkflowStreamingMetadata
      streamingStatus?: WorkflowStreamingMetadata['status']
      streamingEventCount?: number
      streamingWarningCount?: number
      streamingPartialArtifactKeys?: string[]
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
