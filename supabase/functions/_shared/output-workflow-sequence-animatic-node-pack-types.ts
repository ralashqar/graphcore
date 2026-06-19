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
  sequenceAnimaticShotRefs: SequenceAnimaticDirectorPlanRuntimeHelpers['sequenceAnimaticShotRefs']
  sequenceAnimaticShotBindingFromSceneBinding: SequenceAnimaticDirectorPlanRuntimeHelpers['sequenceAnimaticShotBindingFromSceneBinding']
  coverageAnchorMode: string
  compactStoryboardSentence: (value: unknown, fallback?: string, maxWords?: number) => string
  compactForPrompt: (value: unknown, maxLength?: number) => string
  compactSequenceAnimaticText: (value: unknown, maxLength?: number) => string
  outputWorkflowTextModel: () => string
  outputWorkflowContinuityPlannerTimeoutMs: () => number
  loadWorkflowNodes: SequenceAnimaticDirectorPlanRuntimeHelpers['loadWorkflowNodes']
  loadWorkflowRunSteps: SequenceAnimaticDirectorPlanRuntimeHelpers['loadWorkflowRunSteps']
  loadWorkflowEdges: SequenceAnimaticDirectorPlanRuntimeHelpers['loadWorkflowEdges']
  hasStoredOutputs: SequenceAnimaticDirectorPlanRuntimeHelpers['hasStoredOutputs']
  isStaleDynamicCinematicNode: SequenceAnimaticDirectorPlanRuntimeHelpers['isStaleDynamicCinematicNode']
  preserveExistingDynamicNodeOutput: SequenceAnimaticDirectorPlanRuntimeHelpers['preserveExistingDynamicNodeOutput']
  dynamicNodeRow: SequenceAnimaticDirectorPlanRuntimeHelpers['dynamicNodeRow']
  dynamicEdgeRow: SequenceAnimaticDirectorPlanRuntimeHelpers['dynamicEdgeRow']
  persistDynamicWorkflowGraphRevision: SequenceAnimaticDirectorPlanRuntimeHelpers['persistDynamicWorkflowGraphRevision']
  runSequenceAnimaticSceneGraphAssignmentProvider: SequenceAnimaticDirectorPlanRuntimeHelpers['runSequenceAnimaticSceneGraphAssignmentProvider']
  runSequenceAnimaticShotContinuityPlanStreamWithRetry: SequenceAnimaticDirectorPlanRuntimeHelpers['runSequenceAnimaticShotContinuityPlanStreamWithRetry']
  sequenceAnimaticShotContinuityPolicy: SequenceAnimaticDirectorPlanRuntimeHelpers['sequenceAnimaticShotContinuityPolicy']
  readScreenplayAnimaticRoleFromMetadata: SequenceAnimaticOrchestratorRuntimeHelpers['readScreenplayAnimaticRoleFromMetadata']
  readScreenplayAnimaticSourceFromMetadata: SequenceAnimaticOrchestratorRuntimeHelpers['readScreenplayAnimaticSourceFromMetadata']
  loadMasterRequestForWorkflow: SequenceAnimaticOrchestratorRuntimeHelpers['loadMasterRequestForWorkflow']
  loadChildRequests: SequenceAnimaticOrchestratorRuntimeHelpers['loadChildRequests']
  buildSequenceAnimaticTemplateGraph: SequenceAnimaticOrchestratorRuntimeHelpers['buildSequenceAnimaticTemplateGraph']
  sequenceAnimaticContinuityBatchTemplateKey: SequenceAnimaticOrchestratorRuntimeHelpers['sequenceAnimaticContinuityBatchTemplateKey']
  sequenceAnimaticStoryboardBlocksTemplateKey: SequenceAnimaticOrchestratorRuntimeHelpers['sequenceAnimaticStoryboardBlocksTemplateKey']
  ensureMappedChildWorkflow: SequenceAnimaticOrchestratorRuntimeHelpers['ensureMappedChildWorkflow']
  startSequenceAnimaticChildRun: SequenceAnimaticOrchestratorRuntimeHelpers['startSequenceAnimaticChildRun']
  updateMasterRequestMetadata: SequenceAnimaticOrchestratorRuntimeHelpers['updateMasterRequestMetadata']
  refreshOutputRequestStatusProjection: SequenceAnimaticOrchestratorRuntimeHelpers['refreshOutputRequestStatusProjection']
  outputWorkflowContinuityBlockPlannerTimeoutMs: () => number
  persistSequenceAnimaticContinuityRequestState: (input: {
    client: unknown
    run: SequenceAnimaticNodeExecutionContext['run']
    workflow: SequenceAnimaticNodeExecutionContext['workflow']
    artifactKey: string
    continuityPack: LooseRecord
    blockStates: Record<string, unknown>
    pendingDeltas: Record<string, unknown>
  }) => Promise<void>
  executeImageGeneration: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>
  executeVideoGeneration: (context: SequenceAnimaticNodeExecutionContext) => Promise<SequenceAnimaticNodeExecutionResult>
  cinematicEntityByKey: (assetPack: LooseRecord) => Map<string, LooseRecord>
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
