import {
  buildOutputGuidanceBundleForNode,
  buildOutputWorkflowExecutionPlan,
  buildOutputWorkflowFingerprint,
  buildWorkflowStreamingMetadata,
  defaultOutputWorkflowConcurrency,
  getOutputWorkflowNodeGuidanceConfig,
  getOutputWorkflowNodeExecutionMetadata,
  hashOutputWorkflowValue,
  isTerminalOutputWorkflowRunStatus,
  outputArtifactSchema,
  outputArtifactResponseSchema,
  outputRequestSchema,
  outputRequestStatusProjectionSchema,
  outputWorkflowCancelResponseSchema,
  outputWorkflowEdgeSchema,
  outputWorkflowPlanRequestSchema,
  outputWorkflowPlanResponseSchema,
  outputWorkflowRunSchema,
  outputWorkflowRunStatusResponseSchema,
  outputWorkflowSchema,
  outputWorkflowStartResponseSchema,
  buildValidatedOutputWorkflowTemplateGraph,
  planOutputWorkflow,
  resolveOutputImageGenerationOutputFormat,
  resolveOutputImageGenerationQuality,
  runOutputWorkflowReadyQueue,
  selectOutputWorkflowRunSubgraph,
  topologicallySortOutputWorkflow,
  validateWorkflowNodeManifestOutput,
  validateOutputWorkflowGraph,
  type OutputArtifact,
  type OutputRequest,
  type OutputRequestStatusProjection,
  type OutputWorkflow,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  type OutputWorkflowRun,
  type OutputWorkflowRunStep,
} from '../../../src/domain/outputWorkflow.ts'
import {
  buildRecoveredOutputFromArtifact,
  outputArtifactNodeKey as sharedOutputArtifactNodeKey,
} from '../../../src/domain/outputWorkflowDurableResolver.ts'
import {
  getOutputWorkflowNodeContract,
  getWorkflowNodeManifest,
  outputWorkflowNodeManifests,
  outputWorkflowRunIntentDefaults,
} from '../../../src/domain/outputWorkflowNodeContracts.ts'
import {
  assertWorkflowNodeHandlerCoverage,
  createWorkflowNodeHandlerRegistry,
  getWorkflowNodeHandler,
  registerWorkflowNodeHandler,
  type WorkflowNodeHandler,
} from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import {
  sequenceAnimaticStableHash,
} from './sequence-animatic-workflow-factory.ts'
import {
  sequenceAnimaticCommandWorkflowTemplateRegistry,
  sequenceAnimaticContinuityBatchTemplateKey,
  sequenceAnimaticSceneShotPlansTemplateKey,
  sequenceAnimaticStoryboardBlocksTemplateKey,
} from './sequence-animatic-template-registry.ts'
import {
  isSequenceAnimaticSceneBoardWorkflowPurpose,
} from './sequence-animatic-scene-board.ts'
import {
  runSequenceAnimaticShotContinuityPlanStreamWithRetryRuntime,
} from './output-workflow-sequence-animatic-shot-continuity-stream.ts'
import {
  applySequenceAnimaticShotContinuityStreamRecord,
  createSequenceAnimaticShotContinuityStreamAccumulator,
  finalizeSequenceAnimaticShotContinuityStreamPlan,
  parseSequenceAnimaticStreamRecord,
} from './output-workflow-sequence-animatic-shot-continuity-plan-runtime.ts'
import {
  sequenceAnimaticShotBindingFromSceneBinding,
  sequenceAnimaticShotRefs,
  sequenceAnimaticUniqueTexts,
} from './output-workflow-sequence-animatic-shot-binding-runtime.ts'
import {
  sequenceAnimaticContinuityAssetStateSchema,
  sequenceAnimaticContinuityAssetTargetInputHash,
  sequenceAnimaticAssetGenerationStatus,
  sequenceAnimaticContinuityGraphStatusFromBlockStates,
} from './output-workflow-sequence-animatic-continuity-graph-runtime.ts'
import {
  sequenceAnimaticContinuityGraphV2Schema,
  sequenceAnimaticContinuityLocationSetSchema,
  sequenceAnimaticContinuityLocationAngleSchema,
  sequenceAnimaticContinuityPlannerAnchorSchema,
  sequenceAnimaticContinuityRejectedCandidateSchema,
  sequenceAnimaticContinuityRejectedReasonSchema,
  sequenceAnimaticContinuitySceneGraphSchema,
  sequenceAnimaticContinuityShotBindingSchema,
  sequenceAnimaticContinuityWorldLocationRefSchema,
  sequenceAnimaticShotContinuityBlockV2Schema,
  sequenceAnimaticShotContinuityLocalReferenceV2Schema,
  sequenceAnimaticShotContinuityMaxDialogueCharacters,
  sequenceAnimaticShotContinuityMaxDialogueLines,
  sequenceAnimaticShotContinuityMaxDurationSeconds,
  sequenceAnimaticShotContinuityMaxShotCount,
  sequenceAnimaticShotContinuityPerformanceBeatV2Schema,
  sequenceAnimaticShotContinuityPreferredDurationSeconds,
  sequenceAnimaticShotContinuityShotV2Schema,
  sequenceAnimaticShotPlanSchema,
} from './output-workflow-sequence-animatic-shot-continuity-contracts.ts'
import {
  registerSceneBoardWorkflowNodePack,
  sceneBoardWorkflowNodeHandlerKeys,
} from './output-workflow-scene-board-pack.ts'
import {
  registerSequenceAnimaticPlanningWorkflowNodePack,
  sequenceAnimaticPlanningWorkflowNodeHandlerKeys,
} from './output-workflow-sequence-animatic-planning-pack.ts'
import {
  registerSequenceAnimaticSceneLifecycleWorkflowNodePack,
  sequenceAnimaticSceneLifecycleWorkflowNodeHandlerKeys,
} from './output-workflow-sequence-animatic-scene-lifecycle-pack.ts'
import {
  registerSequenceAnimaticArtifactWorkflowNodePack,
  sequenceAnimaticArtifactWorkflowNodeHandlerKeys,
} from './output-workflow-sequence-animatic-artifact-pack.ts'
import {
  registerSequenceAnimaticCoverageWorkflowNodePack,
  sequenceAnimaticCoverageWorkflowNodeHandlerKeys,
} from './output-workflow-sequence-animatic-coverage-pack.ts'
import {
  registerSequenceAnimaticContinuityAnchorWorkflowNodePack,
  sequenceAnimaticContinuityAnchorWorkflowNodeHandlerKeys,
} from './output-workflow-sequence-animatic-continuity-anchor-pack.ts'
import {
  registerSequenceAnimaticContinuityAssetWorkflowNodePack,
  sequenceAnimaticContinuityAssetWorkflowNodeHandlerKeys,
} from './output-workflow-sequence-animatic-continuity-asset-pack.ts'
import {
  registerSequenceAnimaticContinuityGraphWorkflowNodePack,
  sequenceAnimaticContinuityGraphWorkflowNodeHandlerKeys,
} from './output-workflow-sequence-animatic-continuity-graph-pack.ts'
import {
  registerSequenceAnimaticShotReferenceWorkflowNodePack,
  sequenceAnimaticShotReferenceWorkflowNodeHandlerKeys,
} from './output-workflow-sequence-animatic-shot-reference-pack.ts'
import {
  registerSequenceAnimaticShotProductionWorkflowNodePack,
  sequenceAnimaticShotProductionWorkflowNodeHandlerKeys,
} from './output-workflow-sequence-animatic-shot-production-pack.ts'
import {
  registerSequenceAnimaticShotRevisionWorkflowNodePack,
  sequenceAnimaticShotRevisionWorkflowNodeHandlerKeys,
} from './output-workflow-sequence-animatic-shot-revision-pack.ts'
import type {
  SequenceAnimaticWorkflowNodePackHelpers,
} from './output-workflow-sequence-animatic-node-pack-types.ts'
import {
  startSequenceAnimaticChildRunRuntime,
} from './output-workflow-sequence-animatic-child-run-runtime.ts'
import {
  ensureSequenceAnimaticSceneShotPlanWorkflowsRuntime,
} from './output-workflow-sequence-animatic-scene-runner.ts'
import {
  sequenceAnimaticAssetPackReferenceRecord,
  sequenceAnimaticReferenceManifestEntries,
  sequenceAnimaticReferenceManifestText,
  sequenceAnimaticReferenceManifestTextFromRecords,
} from './output-workflow-sequence-animatic-reference-runtime.ts'
import {
  sequenceAnimaticSceneGraphAssignmentSchema,
} from './output-workflow-sequence-animatic-scene-package-runtime.ts'
import {
  buildSequenceAnimaticContinuityAssetPrompt,
  buildSequenceAnimaticContinuityBatchPrompt,
} from './output-workflow-sequence-animatic-continuity-asset-runtime.ts'
import {
  buildSequenceAnimaticShotPlanFromBreaks,
} from './output-workflow-sequence-animatic-planning-runtime.ts'
import {
  registerWorkflowMediaNodePack,
  workflowMediaNodeHandlerKeys,
} from './output-workflow-media-pack.ts'
import {
  imagePromptWorkflowNodeHandlerKeys,
  registerImagePromptWorkflowNodePack,
} from './output-workflow-image-prompt-pack.ts'
import {
  comicWorkflowNodeHandlerKeys,
  registerComicWorkflowNodePack,
} from './output-workflow-comic-pack.ts'
import {
  documentWorkflowNodeHandlerKeys,
  registerDocumentWorkflowNodePack,
} from './output-workflow-document-pack.ts'
import {
  cinematicTextWorkflowNodeHandlerKeys,
  registerCinematicTextWorkflowNodePack,
} from './output-workflow-cinematic-text-pack.ts'
import {
  cinematicAuthoringWorkflowNodeHandlerKeys,
  registerCinematicAuthoringWorkflowNodePack,
} from './output-workflow-cinematic-authoring-pack.ts'
import {
  cinematicPlanningWorkflowNodeHandlerKeys,
  registerCinematicPlanningWorkflowNodePack,
} from './output-workflow-cinematic-planning-pack.ts'
import {
  cinematicReferenceWorkflowNodeHandlerKeys,
  registerCinematicReferenceWorkflowNodePack,
} from './output-workflow-cinematic-reference-pack.ts'
import {
  cinematicParseWorkflowNodeHandlerKeys,
  registerCinematicParseWorkflowNodePack,
} from './output-workflow-cinematic-parse-pack.ts'
import {
  cinematicFanoutWorkflowNodeHandlerKeys,
  registerCinematicFanoutWorkflowNodePack,
} from './output-workflow-cinematic-fanout-pack.ts'
import {
  buildOutputWorkflowMuapiWebhookUrl,
  buildMuapiVideoPayload,
  compactSeedancePromptForProvider,
  createWorkflowMediaRuntime,
  extractMuapiVideoUrlFromResult,
  isFalReferencePolicyError,
  normalizeImageSize,
  outputWorkflowDefaultVideoModel,
  outputWorkflowImageModel,
  readFalWebhookImageResult,
  referenceLimitForImageNode,
  resolveMuapiVideoDurationSeconds,
  resolveMuapiVideoModel,
  resolveMuapiVideoQuality,
  resolveOutputVideoProvider,
  waitForOutputFalImage,
  waitForOutputFalVideo,
  waitForOutputMuapiVideo,
} from './output-workflow-media-runtime.ts'
import {
  buildSeedanceReferenceManifest,
  compactSeedanceControlText,
  formatSeedanceReferenceManifest,
  seedanceLabanMovementBlock,
  seedanceProductionBoardArtifactBan,
  seedanceStoryboardManifestInstruction,
} from './output-workflow-seedance-video-prompt-runtime.ts'
import {
  buildCinematicV3StoryboardGroupAssetPack,
  cinematicAssetPackEntityKeys,
  repairCinematicV2ShotPlanVisualReferences,
} from './output-workflow-cinematic-asset-pack-runtime.ts'
import {
  cinematicV3StoryboardGroupShots,
  materializeDynamicCinematicV3ShotParseFanoutRuntime,
  materializeDynamicCinematicV3StoryboardFanoutRuntime,
  parseAspectRatio,
} from './output-workflow-cinematic-v3-fanout-runtime.ts'
import {
  materializeDynamicCinematicV2ShotFanoutRuntime,
} from './output-workflow-cinematic-v2-fanout-runtime.ts'
import {
  dynamicWorkflowEdgeRow,
  dynamicWorkflowNodeRow,
  persistDynamicWorkflowGraphRevisionRuntime,
  preserveExistingDynamicWorkflowNodeOutput,
} from './output-workflow-dynamic-graph-runtime.ts'

export {
  buildOutputWorkflowMuapiWebhookUrl,
  buildMuapiVideoPayload,
  compactSeedancePromptForProvider,
  extractMuapiVideoUrlFromResult,
} from './output-workflow-media-runtime.ts'
export {
  buildSeedanceReferenceManifest,
  formatSeedanceReferenceManifest,
} from './output-workflow-seedance-video-prompt-runtime.ts'
import {
  registerWorkflowUtilityNodePack,
  workflowUtilityNodeHandlerKeys,
} from './output-workflow-utility-pack.ts'
import {
  legacyMonolithWorkflowNodeHandlerKeys,
} from './output-workflow-legacy-handlers.ts'
import {
  ensureMappedChildWorkflow,
} from './output-workflow-child-utils.ts'
import type {
  SeedanceReferenceManifestEntry,
  SeedanceReferenceRecord,
} from '../../../src/domain/seedanceReferenceManifest.ts'
import { buildEbookDocumentMetadata, buildEbookHtmlDocument } from '../../../src/domain/ebookDocument.ts'
import {
  buildCinematicSequenceFromScriptDoc,
  buildCinematicV2StoryboardLayout,
  deriveCinematicV2MaxShotCount,
  cinematicScriptDocSchema,
  cinematicV2ParsedScriptSchema,
  cinematicV2KeyframeQaSchema,
  cinematicV2ReferencePlanSchema,
  cinematicV2SceneLayoutPlanSchema,
  cinematicV2SceneStateSchema,
  cinematicV2ScreenplayDraftSchema,
  cinematicV2ShotSchema,
  cinematicV2ShotPlanSchema,
  cinematicV2StoryboardGroupPlanSchema,
  cinematicV2StoryboardLayoutSchema,
  cinematicV2TimelineSchema,
  providerSafeCinematicV2DurationSeconds,
  validateCinematicV2ShotPlanReferences,
} from '../../../src/domain/cinematics.ts'
import { buildFalMediaUsageLine, buildMuapiMediaUsageLine, buildOpenAiUsageLine, summarizeAiUsageLines, type AiUsageLine } from '../../../src/domain/aiUsage.ts'
import { hashOutputGuidanceBundle, outputGuidanceBundleSchema, type OutputGuidanceBundle } from '../../../src/domain/outputSkills.ts'
import {
  composeWorldEntityVoiceDescription,
  readWorldEntityVisualDescription,
  readWorldEntityVisualTraitMap,
  readWorldEntityVisualTraits,
  readWorldEntityVoiceDescription,
  readWorldEntityVoiceIdentity,
} from '../../../src/domain/worldEntityVisuals.ts'
import { recordAiUsageEvent } from './ai-provider-gateway.ts'
import { buildFalWebhookUrl } from './fal-webhooks.ts'
import {
  runOpenAiResponses,
  type OpenAiResponseResult,
} from './openai.ts'
import {
  isRetryableOpenAiError,
  openAiErrorMessage,
  retryDelayMs,
  waitForOpenAiBackgroundResponse,
} from './output-workflow-text-runtime.ts'
import { resolveOutputTextModelPolicy, reasoningPayloadFor } from './model-policy.ts'
import {
  sanitizeSequenceAnimaticSpatialPromptText,
  sequenceAnimaticSpatialForbiddenNamesFromShots,
} from '../../../src/domain/sequenceAnimaticSpatialPrompt.ts'
import { aiGenerationSettings } from '../../../src/config/aiGenerationSettings.ts'
import { normalizeStrictJsonSchema } from './structured-output.ts'
import { notifyWorkerWakeBestEffort } from './worker-wake.ts'
import { z } from 'npm:zod@4'

const OUTPUT_WORKFLOW_EXECUTOR_VERSION = 'output-text-gpt54-v6'
const DEFAULT_OUTPUT_WORKFLOW_TEXT_MODEL = 'gpt-5.4'
const CINEMATIC_MAX_TOTAL_DURATION_SECONDS = 60
const CINEMATIC_STORYBOARD_IMAGE_QUALITY = aiGenerationSettings.outputWorkflow.cinematicStoryboardImageQuality
const DEFAULT_CINEMATIC_STORYBOARD_STYLE_SAFE_MODE = aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStyleSafeModeDefault
const DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT = aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStylePrompt
const DEFAULT_CHAPTER_PROSE_TIMEOUT_MS = 3_600_000
const DEFAULT_SCREENPLAY_AUTHOR_TIMEOUT_MS = 900_000
const DEFAULT_CONTINUITY_PLANNER_TIMEOUT_MS = 240_000
const DEFAULT_CONTINUITY_BLOCK_PLANNER_TIMEOUT_MS = 90_000
const DEFAULT_CHAPTER_PROSE_ATTEMPTS = 2

export type OutputDocumentRenderer = (input: {
  markdown: string
  title: string
  subtitle: string
  provenance: string
  generatedAt: string
  fileName: string
  renderMode?: 'ebook' | 'comic' | 'reference' | 'designed_reference'
  pageSize?: 'trade_6x9' | 'letter' | 'a4'
  coverImage?: {
    bytes: Uint8Array
    mimeType: string
    assetKey?: string
    storagePath?: string
    width?: number | null
    height?: number | null
    prompt?: string
  } | null
  comicPages?: Array<{
    bytes: Uint8Array
    mimeType: string
    assetKey?: string
    storagePath?: string
    width?: number | null
    height?: number | null
    prompt?: string
    pageNumber: number
  }>
  comicScript?: Record<string, unknown> | null
  referenceImages?: Array<{
    bytes: Uint8Array
    mimeType: string
    key?: string
    entityKey?: string
    title: string
    caption?: string
    type?: string
    assetKey?: string
    storagePath?: string
  }>
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
}) => Promise<{
  bytes: Uint8Array
  metadata: Record<string, unknown>
}>

type DatabaseClient = {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Blob | Uint8Array | ArrayBuffer, options?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
      download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>
      createSignedUrl?: (path: string, expiresIn: number) => Promise<{ data: unknown; error: { message: string } | null }>
    }
  }
}

export const outputWorkflowSelect = 'id, project_id, draft_id, key, name, description, preset, status, created_by, metadata, created_at, updated_at'
export const outputWorkflowNodeSelect = 'id, workflow_id, key, node_type, label, position, config, inputs, outputs, dirty, input_hash, output_hash, metadata, created_at, updated_at'
export const outputWorkflowNodeStatusSelect = 'id, workflow_id, key, node_type, label, position, config, inputs, dirty, input_hash, output_hash, metadata, created_at, updated_at'
export const outputWorkflowEdgeSelect = 'id, workflow_id, key, source_node_key, source_port, target_node_key, target_port, metadata, created_at, updated_at'
export const outputWorkflowRunSelect = 'id, project_id, draft_id, workflow_id, requested_by, status, preset, prompt, target_format, world_snapshot_fingerprint, input, outputs, error_message, worker_id, heartbeat_at, attempt_count, metadata, started_at, completed_at, created_at, updated_at'
export const outputWorkflowRunStatusSelect = 'id, project_id, draft_id, workflow_id, requested_by, status, preset, prompt, target_format, world_snapshot_fingerprint, error_message, worker_id, heartbeat_at, attempt_count, metadata, started_at, completed_at, created_at, updated_at'
export const outputWorkflowRunStepSelect = 'id, run_id, workflow_id, node_id, node_key, node_type, status, order_index, label, input_hash, output_hash, outputs, provider, model, provider_request_id, error_message, metadata, started_at, completed_at, created_at, updated_at'
export const outputWorkflowRunStepStatusSelect = 'id, run_id, workflow_id, node_id, node_key, node_type, status, order_index, label, input_hash, output_hash, provider, model, provider_request_id, error_message, metadata, started_at, completed_at, created_at, updated_at'
export const outputArtifactSelect = 'id, project_id, draft_id, workflow_id, run_id, node_id, key, name, kind, asset_key, mime_type, summary, metadata, created_at, updated_at'
export const outputRequestSelect = 'id, project_id, draft_id, parent_request_id, workflow_id, latest_run_id, requested_by, source_surface, prompt, title, intent, output_kind, status, selected_entity_keys, selected_sequence_unit_keys, page_count, target_format, planner_notes, error_message, metadata, created_at, updated_at'
export const outputRequestStatusProjectionSelect = 'request_id, project_id, draft_id, workflow_id, latest_run_id, status, output_kind, title, progress, active_node_key, active_node_label, latest_error, artifact_keys, preview_asset_keys, graph_revision, timeline_revision, terminal, metadata, created_at, updated_at'

type OutputWorkflowRow = {
  id: string
  project_id: string
  draft_id: string
  key: string
  name: string
  description: string | null
  preset: string
  status: string
  created_by: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type OutputWorkflowNodeRow = {
  id: string
  workflow_id: string
  key: string
  node_type: string
  label: string
  position: Record<string, unknown> | null
  config: Record<string, unknown> | null
  inputs: Record<string, unknown> | null
  outputs: Record<string, unknown> | null
  dirty: boolean | null
  input_hash: string | null
  output_hash: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type OutputWorkflowEdgeRow = {
  id: string
  workflow_id: string
  key: string
  source_node_key: string
  source_port: string
  target_node_key: string
  target_port: string
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type OutputWorkflowRunRow = {
  id: string
  project_id: string
  draft_id: string
  workflow_id: string
  requested_by: string | null
  status: string
  preset: string
  prompt: string | null
  target_format: string | null
  world_snapshot_fingerprint: string | null
  input: Record<string, unknown> | null
  outputs: Record<string, unknown> | null
  error_message: string | null
  worker_id: string | null
  heartbeat_at: string | null
  attempt_count: number | null
  metadata: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

type OutputWorkflowRunStepRow = {
  id: string
  run_id: string
  workflow_id: string
  node_id: string | null
  node_key: string
  node_type: string
  status: string
  order_index: number | null
  label: string
  input_hash: string | null
  output_hash: string | null
  outputs: Record<string, unknown> | null
  provider: string | null
  model: string | null
  provider_request_id: string | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

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

type OutputRequestRow = {
  id: string
  project_id: string
  draft_id: string
  parent_request_id: string | null
  workflow_id: string | null
  latest_run_id: string | null
  requested_by: string | null
  source_surface: string | null
  prompt: string | null
  title: string | null
  intent: string | null
  output_kind: string | null
  status: string | null
  selected_entity_keys: string[] | null
  selected_sequence_unit_keys: string[] | null
  page_count: number | null
  target_format: string | null
  planner_notes: string | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type OutputRequestStatusProjectionRow = {
  request_id: string
  project_id: string
  draft_id: string
  workflow_id: string | null
  latest_run_id: string | null
  status: string
  output_kind: string
  title: string
  progress: Record<string, unknown> | null
  active_node_key: string | null
  active_node_label: string | null
  latest_error: string | null
  artifact_keys: string[] | null
  preview_asset_keys: string[] | null
  graph_revision: string | null
  timeline_revision: string | null
  terminal: boolean | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

const sequenceAnimaticCameraPlateForbiddenTermRules: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\btwo[-\s]?shot\b/gi, replacement: 'cross-axis location angle' },
  { pattern: /\bover[-\s]?the[-\s]?shoulder\b/gi, replacement: 'foreground-framed location angle' },
  { pattern: /\bover[-\s]?shoulder\b/gi, replacement: 'foreground-framed location angle' },
  { pattern: /\bpoint[-\s]?of[-\s]?view\b/gi, replacement: 'subjective camera angle' },
  { pattern: /\bcharacters?\b|\bpeople\b|\bpersons?\b|\bbodies\b|\bbody\b|\bsilhouettes?\b|\bcrowds?\b|\bextras?\b|\bfigures?\b/gi, replacement: 'empty space' },
  { pattern: /\bfaces?\b|\beyes?\b|\bhands?\b|\bshoulders?\b|\bportrait\b|\breaction\b/gi, replacement: '' },
  { pattern: /\bdialogue\b|\bspeech\b|\bline delivery\b|\bvoice\b|\bspoken\b/gi, replacement: '' },
  { pattern: /\baccuses?\b|\bargues?\b|\banswers?\b|\basks?\b|\breplies?\b|\bturns?\b|\breaches?\b|\bgrabs?\b|\bholds?\b|\bplaces?\b|\bpushes?\b|\bshoves?\b|\bwalks?\b|\bruns?\b|\benters?\b|\bleaves?\b/gi, replacement: '' },
  { pattern: /\bsacred\b|\britual\b|\bjudg(e)?ment\b|\bauthority\b|\bhonesty\b|\baccusation\b|\bsuspicion\b|\bsuspicious\b|\bdisgust(ed)?\b|\buneasy\b|\bomen[-\s]?still\b|\bomen\b|\btense\b|\bemotional\b|\bpsychological\b|\bmotive\b/gi, replacement: '' },
]

const sequenceAnimaticCameraPlateNonVisualTerms = [
  'accusation',
  'authority',
  'character',
  'characters',
  'crowd',
  'dialogue',
  'disgusted',
  'emotion',
  'honesty',
  'judgment',
  'motive',
  'omen',
  'people',
  'reaction',
  'ritual',
  'sacred',
  'silhouette',
  'suspicious',
  'tense',
]

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function cleanSequenceAnimaticCameraPlatePunctuation(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:/])/g, '$1')
    .replace(/([,.;:/]){2,}/g, '$1')
    .replace(/\s*[,;:]\s*(?=[,;:.]|$)/g, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+-\s+(?=[,.;:]|$)/g, ' ')
    .trim()
}

function sanitizeSequenceAnimaticCameraPlateText(value: unknown, maxLength = 360) {
  let text = readText(value)
  for (const rule of sequenceAnimaticCameraPlateForbiddenTermRules) {
    text = text.replace(rule.pattern, rule.replacement)
  }
  text = text.replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+\[(?:ref|id):[^\]]+\]/g, '')
  text = text.replace(/\b(?:Akane|Kaji|Rin|Miyo)\b/g, '')
  text = cleanSequenceAnimaticCameraPlatePunctuation(text)
  if (maxLength > 0 && text.length > maxLength) {
    text = cleanSequenceAnimaticCameraPlatePunctuation(text.slice(0, maxLength))
  }
  return text
}

function sequenceAnimaticVisualOnlyCameraFamily(cell: Record<string, unknown>) {
  return [
    readText(cell.spotId) || readText(cell.spotName) || 'zone',
    readText(cell.framing) || readText(cell.camera),
    readText(cell.cameraHeight),
    readText(cell.cameraAngle),
    readText(cell.lens),
  ].map((part) => slugify(part || 'any')).join(':')
}

function sequenceAnimaticZoneGridPromptDiagnostics(cells: Record<string, unknown>[]) {
  const joined = cells.map((cell) => [
    readText(cell.cameraPlateBrief),
    readText(cell.camera),
    readText(cell.locationFeatures),
    readText(cell.composition),
  ].join(' ')).join(' ').toLowerCase()
  const nonVisualTerms = sequenceAnimaticCameraPlateNonVisualTerms
    .filter((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(joined))
  const familyCounts = new Map<string, number>()
  for (const cell of cells) {
    const family = sequenceAnimaticVisualOnlyCameraFamily(cell)
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1)
  }
  const duplicateCameraFamilies = Array.from(familyCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([family, count]) => ({ family, count }))
  const messages = [
    nonVisualTerms.length > 0 ? `Sanitizer warning: remaining nonvisual terms: ${nonVisualTerms.join(', ')}` : '',
    duplicateCameraFamilies.length > 0 ? `Camera family reuse: ${duplicateCameraFamilies.map((entry) => `${entry.family} x${entry.count}`).join('; ')}` : '',
  ].filter(Boolean)
  return {
    nonVisualTerms,
    duplicateCameraFamilies,
    messages,
  }
}

function sequenceAnimaticCompactZoneGridCellLine(cell: Record<string, unknown>, index: number) {
  return [
    `${index + 1}. r${Number(cell.row ?? Math.floor(index / 3)) + 1}c${Number(cell.column ?? index % 3) + 1}`,
    readText(cell.spotName) ? `spot=${sanitizeSequenceAnimaticCameraPlateText(cell.spotName, 80)}` : '',
    readText(cell.camera) ? `camera=${sanitizeSequenceAnimaticCameraPlateText(cell.camera, 140)}` : '',
    readText(cell.cameraPlateBrief) ? `plate=${sanitizeSequenceAnimaticCameraPlateText(cell.cameraPlateBrief, 240)}` : '',
    readText(cell.landmarks) ? `landmarks=${sanitizeSequenceAnimaticCameraPlateText(cell.landmarks, 140)}` : '',
    readText(cell.lightDirection) || readText(cell.lightingWeather) ? `light=${sanitizeSequenceAnimaticCameraPlateText(readText(cell.lightDirection) || readText(cell.lightingWeather), 120)}` : '',
    readText(cell.screenDirection) ? `screen=${sanitizeSequenceAnimaticCameraPlateText(cell.screenDirection, 100)}` : '',
  ].filter(Boolean).join(' / ')
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'output'
}

export function mapOutputWorkflowRow(row: OutputWorkflowRow): OutputWorkflow {
  return outputWorkflowSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    key: row.key,
    name: row.name,
    description: row.description ?? '',
    preset: row.preset,
    status: row.status,
    createdBy: row.created_by,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function mapOutputWorkflowNodeRow(row: OutputWorkflowNodeRow): OutputWorkflowNode {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    key: row.key,
    nodeType: row.node_type as OutputWorkflowNode['nodeType'],
    label: row.label,
    position: {
      x: Number(asRecord(row.position).x ?? 0),
      y: Number(asRecord(row.position).y ?? 0),
    },
    config: row.config ?? {},
    inputs: row.inputs ?? {},
    outputs: row.outputs ?? {},
    dirty: row.dirty ?? true,
    inputHash: row.input_hash ?? '',
    outputHash: row.output_hash ?? '',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapOutputRequestRow(row: OutputRequestRow): OutputRequest {
  return outputRequestSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    parentRequestId: row.parent_request_id,
    workflowId: row.workflow_id,
    latestRunId: row.latest_run_id,
    requestedBy: row.requested_by,
    sourceSurface: row.source_surface ?? 'outputs',
    prompt: row.prompt ?? '',
    title: row.title ?? 'Untitled output',
    intent: row.intent ?? 'output_generation',
    outputKind: row.output_kind ?? 'unknown',
    status: row.status ?? 'queued',
    selectedEntityKeys: row.selected_entity_keys ?? [],
    selectedSequenceUnitKeys: row.selected_sequence_unit_keys ?? [],
    pageCount: row.page_count,
    targetFormat: row.target_format ?? 'pdf',
    plannerNotes: row.planner_notes ?? '',
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function mapOutputRequestStatusProjectionRow(row: OutputRequestStatusProjectionRow): OutputRequestStatusProjection {
  return outputRequestStatusProjectionSchema.parse({
    requestId: row.request_id,
    projectId: row.project_id,
    draftId: row.draft_id,
    workflowId: row.workflow_id,
    latestRunId: row.latest_run_id,
    status: row.status,
    outputKind: row.output_kind ?? 'unknown',
    title: row.title ?? 'Untitled output',
    progress: row.progress ?? {},
    activeNodeKey: row.active_node_key,
    activeNodeLabel: row.active_node_label,
    latestError: row.latest_error,
    artifactKeys: row.artifact_keys ?? [],
    previewAssetKeys: row.preview_asset_keys ?? [],
    graphRevision: row.graph_revision ?? '',
    timelineRevision: row.timeline_revision ?? '',
    terminal: row.terminal ?? false,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function mapOutputWorkflowEdgeRow(row: OutputWorkflowEdgeRow): OutputWorkflowEdge {
  return outputWorkflowEdgeSchema.parse({
    id: row.id,
    workflowId: row.workflow_id,
    key: row.key,
    sourceNodeKey: row.source_node_key,
    sourcePort: row.source_port,
    targetNodeKey: row.target_node_key,
    targetPort: row.target_port,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function mapOutputWorkflowRunStepRow(row: OutputWorkflowRunStepRow): OutputWorkflowRunStep {
  return {
    id: row.id,
    runId: row.run_id,
    workflowId: row.workflow_id,
    nodeId: row.node_id,
    nodeKey: row.node_key,
    nodeType: row.node_type as OutputWorkflowRunStep['nodeType'],
    status: row.status as OutputWorkflowRunStep['status'],
    orderIndex: row.order_index ?? 0,
    label: row.label,
    inputHash: row.input_hash ?? '',
    outputHash: row.output_hash ?? '',
    outputs: row.outputs ?? {},
    provider: row.provider,
    model: row.model,
    providerRequestId: row.provider_request_id,
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapOutputArtifactRow(row: OutputArtifactRow): OutputArtifact {
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

export async function hydrateOutputArtifactSignedUrls(client: DatabaseClient, artifacts: OutputArtifact[]) {
  const storagePathByAssetKey = new Map<string, string>()
  const missingAssetKeys = Array.from(new Set(artifacts
    .filter((artifact) => {
      const metadata = asRecord(artifact.metadata)
      const existingUrl = readText(metadata.sourceUrl) || readText(metadata.previewUrl)
      const storagePath = readText(metadata.storagePath) || readText(asRecord(metadata.render).storagePath)
      return Boolean(artifact.assetKey && !existingUrl && !storagePath)
    })
    .map((artifact) => artifact.assetKey)
    .filter((assetKey): assetKey is string => Boolean(assetKey))))

  if (missingAssetKeys.length > 0) {
    const assetResponse = await client
      .from('project_assets')
      .select('key, storage_path')
      .in('key', missingAssetKeys)
    if (!assetResponse.error) {
      for (const asset of assetResponse.data ?? []) {
        const key = typeof asset.key === 'string' ? asset.key : ''
        const storagePath = typeof asset.storage_path === 'string' ? asset.storage_path : ''
        if (key && storagePath) storagePathByAssetKey.set(key, storagePath)
      }
    }
  }

  return Promise.all(artifacts.map(async (artifact) => {
    const metadata = asRecord(artifact.metadata)
    const existingUrl = readText(metadata.sourceUrl) || readText(metadata.previewUrl)
    if (existingUrl) return artifact

    const storagePath = readText(metadata.storagePath)
      || readText(asRecord(metadata.render).storagePath)
      || (artifact.assetKey ? storagePathByAssetKey.get(artifact.assetKey) ?? '' : '')
    if (!storagePath) return artifact

    const bucket = client.storage.from('project-assets')
    if (typeof bucket.createSignedUrl !== 'function') return artifact

    const signed = await bucket.createSignedUrl(storagePath, 60 * 60)
    const data = asRecord(signed.data)
    const signedUrl = readText(data.signedUrl) || readText(data.signedURL)
    if (signed.error || !signedUrl) return artifact

    return {
      ...artifact,
      metadata: {
        ...metadata,
        previewUrl: signedUrl,
        sourceUrl: signedUrl,
      },
    }
  }))
}

export function mapOutputWorkflowRunRow(
  row: OutputWorkflowRunRow,
  steps: OutputWorkflowRunStep[] = [],
  artifacts: OutputArtifact[] = [],
): OutputWorkflowRun {
  return outputWorkflowRunSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    workflowId: row.workflow_id,
    requestedBy: row.requested_by,
    status: row.status,
    preset: row.preset,
    prompt: row.prompt ?? '',
    targetFormat: row.target_format ?? 'pdf',
    worldSnapshotFingerprint: row.world_snapshot_fingerprint ?? '',
    input: row.input ?? {},
    outputs: row.outputs ?? {},
    errorMessage: row.error_message,
    workerId: row.worker_id,
    heartbeatAt: row.heartbeat_at,
    attemptCount: row.attempt_count ?? 0,
    metadata: row.metadata ?? {},
    steps,
    artifacts,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function jsonByteLength(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length
  } catch {
    return 0
  }
}

function truncateStatusText(value: string, maxLength = 4000) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n[truncated ${value.length - maxLength} chars]` : value
}

function compactStatusPreview(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return truncateStatusText(value, depth === 0 ? 2400 : 1200)
  if (typeof value !== 'object') return value
  if (depth >= 3) return `[${Array.isArray(value) ? 'array' : 'object'} truncated]`
  if (Array.isArray(value)) {
    const items = value.slice(0, 12).map((entry) => compactStatusPreview(entry, depth + 1))
    return value.length > 12 ? { items, truncatedCount: value.length - 12 } : items
  }
  const record = asRecord(value)
  const entries = Object.entries(record)
  const compacted: Record<string, unknown> = {}
  for (const [key, entry] of entries.slice(0, 40)) {
    compacted[key] = compactStatusPreview(entry, depth + 1)
  }
  if (entries.length > 40) compacted.truncatedKeyCount = entries.length - 40
  return compacted
}

export function compactRecordForStatus(value: Record<string, unknown>, maxBytes = 180_000): Record<string, unknown> {
  const bytes = jsonByteLength(value)
  if (bytes <= maxBytes) return value
  return {
    _truncatedForStatus: true,
    _originalBytes: bytes,
    preview: compactStatusPreview(value),
  }
}

function collectOutputPreviewAssetKeys(value: unknown, assetKeys = new Set<string>(), depth = 0) {
  if (depth > 8 || value == null) return assetKeys
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 80)) collectOutputPreviewAssetKeys(entry, assetKeys, depth + 1)
    return assetKeys
  }
  if (typeof value !== 'object') return assetKeys
  const record = asRecord(value)
  const assetKey = readText(record.assetKey) || readText(record.asset_key)
  if (assetKey) assetKeys.add(assetKey)
  for (const entry of Object.values(record).slice(0, 80)) {
    if (entry && typeof entry === 'object') collectOutputPreviewAssetKeys(entry, assetKeys, depth + 1)
  }
  return assetKeys
}

function firstOutputPreviewText(outputs: Record<string, unknown>) {
  const storyboardGroup = asRecord(outputs.storyboardGroup)
  const storyboardSummary = readText(storyboardGroup.summary)
  const storyboardIndex = Number(storyboardGroup.index ?? 0) || 0
  if (storyboardSummary) {
    const prompt = readText(outputs.prompt) || readText(outputs.text) || readText(outputs.providerPrompt)
    return truncateStatusText([
      `Storyboard ${storyboardIndex || ''}: ${storyboardSummary}`.trim(),
      prompt,
    ].filter(Boolean).join('\n\n'), 2400)
  }
  for (const key of ['text', 'screenplayMarkdown', 'prompt', 'providerPrompt', 'markdown', 'summary']) {
    const value = readText(outputs[key])
    if (value) return truncateStatusText(value, 2400)
  }
  return truncateStatusText(JSON.stringify(compactStatusPreview(outputs)), 2400)
}

export function buildOutputWorkflowNodeOutputPreview(input: {
  node: Pick<OutputWorkflowNode, 'key' | 'nodeType' | 'outputHash'>
  outputs?: Record<string, unknown> | null
  provider?: string | null
  model?: string | null
  errorMessage?: string | null
}) {
  const outputs = asRecord(input.outputs)
  const bytes = jsonByteLength(outputs)
  const assetKeys = [...collectOutputPreviewAssetKeys(outputs)].slice(0, 24)
  const role = readText(outputs.role)
    || readText(asRecord(outputs.image).role)
    || readText(asRecord(outputs.video).role)
    || readText(asRecord(outputs.artifact).role)
    || readText(asRecord(asRecord(outputs.image).metadata).role)
    || readText(asRecord(asRecord(outputs.video).metadata).role)
  return {
    nodeKey: input.node.key,
    nodeType: input.node.nodeType,
    outputHash: input.node.outputHash,
    outputBytes: bytes,
    truncated: bytes > 64_000,
    text: input.errorMessage ? truncateStatusText(input.errorMessage, 2400) : firstOutputPreviewText(outputs),
    preview: compactRecordForStatus(outputs, 48_000),
    assetKeys,
    provider: input.provider ?? null,
    model: input.model ?? null,
    role: role || null,
    generatedAt: new Date().toISOString(),
  }
}

export function compactOutputWorkflowNodesForStatus(nodes: OutputWorkflowNode[]): OutputWorkflowNode[] {
  return nodes.map((node) => ({
    ...node,
    outputs: compactRecordForStatus(node.outputs),
  }))
}

export function compactOutputWorkflowRunForStatus(run: OutputWorkflowRun): OutputWorkflowRun {
  return {
    ...run,
    input: compactRecordForStatus(run.input),
    outputs: compactRecordForStatus(run.outputs),
    errorMessage: run.errorMessage ? truncateStatusText(run.errorMessage) : run.errorMessage,
    steps: run.steps.map((step) => ({
      ...step,
      outputs: compactRecordForStatus(step.outputs),
      errorMessage: step.errorMessage ? truncateStatusText(step.errorMessage) : step.errorMessage,
    })),
  }
}

function outputArtifactNodeKey(artifact: OutputArtifact) {
  return sharedOutputArtifactNodeKey(artifact)
}

function buildRecoveredNodeOutputsFromOutputArtifact(node: OutputWorkflowNode, artifact: OutputArtifact) {
  return buildRecoveredOutputFromArtifact(node, artifact)
}

async function recoverArtifactBackedWorkflowNodeOutputs(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  nodes: OutputWorkflowNode[]
}) {
  let recoveredCount = 0
  const artifactByNodeKey = new Map(input.run.artifacts
    .filter((artifact) => readText(artifact.assetKey))
    .map((artifact) => [outputArtifactNodeKey(artifact), artifact] as const)
    .filter(([nodeKey]) => Boolean(nodeKey)))
  const stepByNodeKey = new Map(input.run.steps.map((step) => [step.nodeKey, step] as const))
  for (const node of input.nodes) {
    if (readText(node.outputHash) || hasStoredOutputs(node.outputs)) continue
    const artifact = artifactByNodeKey.get(node.key)
    if (!artifact) continue
    const outputs = buildRecoveredNodeOutputsFromOutputArtifact(node, artifact)
    if (!outputs) continue
    const outputHash = hashOutputWorkflowValue(outputs)
    const metadata = asRecord(artifact.metadata)
    const preview = buildOutputWorkflowNodeOutputPreview({
      node: { ...node, outputHash },
      outputs,
      provider: readText(metadata.provider) || null,
      model: readText(metadata.model) || null,
    })
    const updateNode = await input.client
      .from('output_workflow_nodes')
      .update({
        outputs,
        dirty: false,
        input_hash: readText(stepByNodeKey.get(node.key)?.inputHash) || readText(node.inputHash),
        output_hash: outputHash,
        metadata: {
          ...node.metadata,
          outputPreview: preview,
          recoveredFromArtifact: true,
          recoveredFromArtifactAt: new Date().toISOString(),
        },
      })
      .eq('id', node.id)
    if (updateNode.error) throw new Error(updateNode.error.message)
    const step = stepByNodeKey.get(node.key)
    await setStepStatus(input.client, {
      runId: input.run.id,
      node: { ...node, outputs, outputHash, dirty: false },
      status: 'completed',
      draftId: input.run.draftId,
      orderIndex: step?.orderIndex ?? 0,
      inputHash: readText(step?.inputHash) || readText(node.inputHash),
      outputHash,
      outputs,
      provider: readText(metadata.provider) || readText(step?.provider) || null,
      model: readText(metadata.model) || readText(step?.model) || null,
      providerRequestId: readText(metadata.providerRequestId) || readText(metadata.falRequestId) || readText(step?.providerRequestId) || null,
      startedAt: step?.startedAt,
      metadata: {
        ...asRecord(step?.metadata),
        recoveredFromArtifact: true,
        recoveredFromArtifactAt: new Date().toISOString(),
        outputPreview: preview,
      },
    })
    recoveredCount += 1
  }
  return recoveredCount
}

async function loadRecoverableArtifactBackedNodeOutputs(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  node: OutputWorkflowNode
}) {
  const artifactResponse = await input.client
    .from('output_artifacts')
    .select(outputArtifactSelect)
    .eq('draft_id', input.run.draftId)
    .eq('run_id', input.run.id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (artifactResponse.error) throw new Error(artifactResponse.error.message)
  const artifact = ((artifactResponse.data ?? []) as OutputArtifactRow[])
    .map(mapOutputArtifactRow)
    .find((entry) => outputArtifactNodeKey(entry) === input.node.key)
  if (!artifact) return null
  const outputs = buildRecoveredNodeOutputsFromOutputArtifact(input.node, artifact)
  if (!outputs) return null
  return {
    outputs,
    provider: readText(asRecord(artifact.metadata).provider) || 'graphcore',
    model: readText(asRecord(artifact.metadata).model) || 'artifact-recovery',
    providerRequestId: readText(asRecord(artifact.metadata).providerRequestId) || readText(asRecord(artifact.metadata).falRequestId) || null,
  }
}

async function loadLatestWorkflowStepOutputsByNodeKey(input: {
  client: DatabaseClient
  workflowId: string
  nodeKeys: string[]
}) {
  const nodeKeys = [...new Set(input.nodeKeys.map((key) => key.trim()).filter(Boolean))]
  const result = new Map<string, OutputWorkflowRunStep>()
  if (nodeKeys.length === 0) return result
  const response = await input.client
    .from('output_workflow_run_steps')
    .select(outputWorkflowRunStepSelect)
    .eq('workflow_id', input.workflowId)
    .in('node_key', nodeKeys)
    .eq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(Math.min(500, Math.max(50, nodeKeys.length * 20)))
  if (response.error) throw new Error(response.error.message)
  for (const row of (response.data ?? []) as OutputWorkflowRunStepRow[]) {
    const step = mapOutputWorkflowRunStepRow(row)
    if (!nodeKeys.includes(step.nodeKey) || result.has(step.nodeKey) || !hasStoredOutputs(step.outputs)) continue
    result.set(step.nodeKey, step)
  }
  return result
}

async function loadRecoverableWorkflowArtifactOutputsByNodeKey(input: {
  client: DatabaseClient
  draftId: string
  workflowId: string
  nodesByKey: Map<string, OutputWorkflowNode>
  nodeKeys: string[]
}) {
  const nodeKeys = new Set(input.nodeKeys.map((key) => key.trim()).filter(Boolean))
  const result = new Map<string, Record<string, unknown>>()
  if (nodeKeys.size === 0) return result
  const response = await input.client
    .from('output_artifacts')
    .select(outputArtifactSelect)
    .eq('draft_id', input.draftId)
    .eq('workflow_id', input.workflowId)
    .order('created_at', { ascending: false })
    .limit(300)
  if (response.error) throw new Error(response.error.message)
  for (const row of (response.data ?? []) as OutputArtifactRow[]) {
    const artifact = mapOutputArtifactRow(row)
    const nodeKey = outputArtifactNodeKey(artifact)
    const artifactRole = readText(asRecord(artifact.metadata).role) || readText(artifact.kind)
    const matchedNodeKey = nodeKeys.has(nodeKey)
      ? nodeKey
      : [...nodeKeys].find((candidateKey) => {
        const candidateNode = input.nodesByKey.get(candidateKey)
        const contract = getOutputWorkflowNodeContract(candidateNode ?? null)
        return Boolean(contract?.artifactRoles.includes(artifactRole))
      }) ?? ''
    if (!matchedNodeKey || result.has(matchedNodeKey)) continue
    const node = input.nodesByKey.get(matchedNodeKey)
    if (!node) continue
    const outputs = buildRecoveredNodeOutputsFromOutputArtifact(node, artifact)
    if (!outputs || !hasStoredOutputs(outputs)) continue
    result.set(matchedNodeKey, outputs)
  }
  return result
}

export function planOutputWorkflowFromRequest(raw: unknown) {
  const request = outputWorkflowPlanRequestSchema.parse(raw)
  return outputWorkflowPlanResponseSchema.parse({
    ok: true,
    plan: planOutputWorkflow(request),
  })
}

export function buildOutputWorkflowInputFingerprint(raw: unknown) {
  const input = asRecord(raw)
  return buildOutputWorkflowFingerprint({
    worldEntities: Array.isArray(input.worldEntities) ? input.worldEntities : [],
    worldRelationships: Array.isArray(input.worldRelationships) ? input.worldRelationships : [],
    worldWiki: input.worldWiki ?? {},
  })
}

export async function loadOutputWorkflowRunBundle(
  client: DatabaseClient,
  runId: string,
  options: { includeNodeOutputs?: boolean; includeRunPayload?: boolean; includeStepOutputs?: boolean } = {},
) {
  const includeNodeOutputs = options.includeNodeOutputs !== false
  const includeRunPayload = options.includeRunPayload !== false
  const includeStepOutputs = options.includeStepOutputs !== false
  const runResponse = await client
    .from('output_workflow_runs')
    .select(includeRunPayload ? outputWorkflowRunSelect : outputWorkflowRunStatusSelect)
    .eq('id', runId)
    .single()
  if (runResponse.error || !runResponse.data) throw new Error(runResponse.error?.message ?? 'Output workflow run not found.')
  const runRow = runResponse.data as OutputWorkflowRunRow

  const [workflowResponse, nodeResponse, edgeResponse, stepResponse, artifactResponse] = await Promise.all([
    client
      .from('output_workflows')
      .select(outputWorkflowSelect)
      .eq('id', runRow.workflow_id)
      .single(),
    client
      .from('output_workflow_nodes')
      .select(includeNodeOutputs ? outputWorkflowNodeSelect : outputWorkflowNodeStatusSelect)
      .eq('workflow_id', runRow.workflow_id)
      .order('created_at', { ascending: true }),
    client
      .from('output_workflow_edges')
      .select(outputWorkflowEdgeSelect)
      .eq('workflow_id', runRow.workflow_id)
      .order('created_at', { ascending: true }),
    client
      .from('output_workflow_run_steps')
      .select(includeStepOutputs ? outputWorkflowRunStepSelect : outputWorkflowRunStepStatusSelect)
      .eq('run_id', runRow.id)
      .order('order_index', { ascending: true }),
    client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('run_id', runRow.id)
      .order('created_at', { ascending: true }),
  ])
  if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Output workflow not found.')
  if (nodeResponse.error) throw new Error(nodeResponse.error.message)
  if (edgeResponse.error) throw new Error(edgeResponse.error.message)
  if (stepResponse.error) throw new Error(stepResponse.error.message)
  if (artifactResponse.error) throw new Error(artifactResponse.error.message)

  const steps = ((stepResponse.data ?? []) as OutputWorkflowRunStepRow[]).map(mapOutputWorkflowRunStepRow)
  const artifacts = ((artifactResponse.data ?? []) as OutputArtifactRow[]).map(mapOutputArtifactRow)
  return {
    run: mapOutputWorkflowRunRow(runRow, steps, artifacts),
    workflow: mapOutputWorkflowRow(workflowResponse.data as OutputWorkflowRow),
    nodes: ((nodeResponse.data ?? []) as OutputWorkflowNodeRow[]).map(mapOutputWorkflowNodeRow),
    edges: ((edgeResponse.data ?? []) as OutputWorkflowEdgeRow[]).map(mapOutputWorkflowEdgeRow),
  }
}

export async function loadOutputWorkflowRunStatus(
  client: DatabaseClient,
  runId: string,
) {
  const runResponse = await client
    .from('output_workflow_runs')
    .select(outputWorkflowRunStatusSelect)
    .eq('id', runId)
    .single()
  if (runResponse.error || !runResponse.data) throw new Error(runResponse.error?.message ?? 'Output workflow run not found.')
  const runRow = runResponse.data as OutputWorkflowRunRow

  const [stepResponse, artifactResponse] = await Promise.all([
    client
      .from('output_workflow_run_steps')
      .select(outputWorkflowRunStepStatusSelect)
      .eq('run_id', runRow.id)
      .order('order_index', { ascending: true }),
    client
      .from('output_artifacts')
      .select(outputArtifactSelect)
      .eq('run_id', runRow.id)
      .order('created_at', { ascending: true }),
  ])
  if (stepResponse.error) throw new Error(stepResponse.error.message)
  if (artifactResponse.error) throw new Error(artifactResponse.error.message)

  return mapOutputWorkflowRunRow(
    runRow,
    ((stepResponse.data ?? []) as OutputWorkflowRunStepRow[]).map(mapOutputWorkflowRunStepRow),
    ((artifactResponse.data ?? []) as OutputArtifactRow[]).map(mapOutputArtifactRow),
  )
}

async function heartbeat(client: DatabaseClient, runId: string, workerId: string, metadataPatch: Record<string, unknown>) {
  const response = await client.rpc('heartbeat_output_workflow_run', {
    run_id: runId,
    worker_id: workerId,
    metadata_patch: metadataPatch,
  })
  if (response.error) throw new Error(response.error.message)
}

function mergeUniqueStrings(...values: unknown[]) {
  return [...new Set(values.flatMap((value) => {
    const direct = readText(value)
    return direct ? [direct] : readStringArray(value)
  }))]
}

function stepRuntimeMetadataFromOutputs(outputs: Record<string, unknown>) {
  const runtime = {
    ...asRecord(outputs.workflowRuntime),
    ...asRecord(outputs.workflow_runtime),
  }
  const streaming = {
    ...asRecord(outputs.streaming),
    ...asRecord(runtime.streaming),
  }
  const streamingPartialArtifactKeys = mergeUniqueStrings(
    runtime.streamingPartialArtifactKeys,
    runtime.streaming_partial_artifact_keys,
    streaming.partialArtifactKeys,
    streaming.partial_artifact_keys,
  )
  const streamingMetadata = buildWorkflowStreamingMetadata({
    status: runtime.streamingStatus ?? runtime.streaming_status ?? streaming.status,
    providerRequestId: runtime.providerRequestId ?? runtime.provider_request_id ?? streaming.providerRequestId ?? streaming.provider_request_id,
    providerStatus: runtime.providerStatus ?? runtime.provider_status ?? streaming.providerStatus ?? streaming.provider_status,
    eventCount: runtime.streamingEventCount ?? runtime.streaming_event_count ?? streaming.eventCount ?? streaming.event_count,
    warningCount: runtime.streamingWarningCount ?? runtime.streaming_warning_count ?? streaming.warningCount ?? streaming.warning_count,
    partialArtifactKeys: streamingPartialArtifactKeys,
    resumeToken: runtime.streamingResumeToken ?? runtime.streaming_resume_token ?? streaming.resumeToken ?? streaming.resume_token,
    lastEventAt: runtime.streamingLastEventAt ?? runtime.streaming_last_event_at ?? streaming.lastEventAt ?? streaming.last_event_at,
  })
  const activeChildRequestIds = mergeUniqueStrings(
    runtime.activeChildRequestIds,
    runtime.active_child_request_ids,
    outputs.activeChildRequestIds,
    outputs.active_child_request_ids,
    outputs.waiting === true ? outputs.childRequestId : [],
    outputs.waiting === true ? outputs.child_request_id : [],
    outputs.waiting === true ? outputs.childRequests : [],
    outputs.waiting === true ? outputs.child_requests : [],
  )
  const activeChildRunIds = mergeUniqueStrings(
    runtime.activeChildRunIds,
    runtime.active_child_run_ids,
    outputs.activeChildRunIds,
    outputs.active_child_run_ids,
    outputs.waiting === true ? outputs.childRunId : [],
    outputs.waiting === true ? outputs.child_run_id : [],
    outputs.waiting === true ? outputs.childRunIds : [],
    outputs.waiting === true ? outputs.child_run_ids : [],
  )
  const readyArtifactKeys = mergeUniqueStrings(
    runtime.readyArtifactKeys,
    runtime.ready_artifact_keys,
    runtime.scopedAssetKeys,
    runtime.scoped_asset_keys,
    outputs.readyArtifactKeys,
    outputs.ready_artifact_keys,
    outputs.artifactKeys,
    outputs.artifact_keys,
  )
  const readyArtifactRoles = mergeUniqueStrings(
    runtime.readyArtifactRoles,
    runtime.ready_artifact_roles,
    outputs.readyArtifactRoles,
    outputs.ready_artifact_roles,
  )
  const recoveryHints = mergeUniqueStrings(
    runtime.recoveryHints,
    runtime.recovery_hints,
    outputs.recoveryHints,
    outputs.recovery_hints,
    outputs.diagnostics,
  )
  return {
    activeChildRequestIds,
    activeChildRunIds,
    readyArtifactRoles,
    readyArtifactKeys,
    recoveryHints,
    readyArtifactCount: Number(runtime.readyArtifactCount ?? runtime.ready_artifact_count ?? readyArtifactKeys.length) || readyArtifactKeys.length,
    providerStatus: readText(runtime.providerStatus ?? runtime.provider_status) || undefined,
    providerRequestId: readText(runtime.providerRequestId ?? runtime.provider_request_id) || undefined,
    streaming: streamingMetadata.status !== 'idle' || Object.keys(streaming).length > 0 ? streamingMetadata : undefined,
    streamingStatus: streamingMetadata.status !== 'idle' ? streamingMetadata.status : undefined,
    streamingEventCount: streamingMetadata.eventCount || undefined,
    streamingWarningCount: streamingMetadata.warningCount || undefined,
    streamingPartialArtifactKeys: mergeUniqueStrings(streamingMetadata.partialArtifactKeys, streamingPartialArtifactKeys),
    streamingResumeToken: streamingMetadata.resumeToken || undefined,
    streamingLastEventAt: streamingMetadata.lastEventAt || undefined,
  }
}

async function setStepStatus(
  client: DatabaseClient,
  input: {
    runId: string
    node: OutputWorkflowNode
    status: OutputWorkflowRunStep['status']
    draftId: string
    orderIndex: number
    inputHash?: string
    outputHash?: string
    outputs?: Record<string, unknown>
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
    errorMessage?: string | null
    metadata?: Record<string, unknown>
    startedAt?: string | null
  },
) {
  const now = new Date().toISOString()
  const startedAt = readText(input.startedAt) || now
  const manifest = getWorkflowNodeManifest(input.node)
  const config = asRecord(input.node.config)
  const outputRuntimeMetadata = stepRuntimeMetadataFromOutputs(input.outputs ?? {})
  const inputMetadata = asRecord(input.metadata)
  const stepMetadata = {
    manifestPurpose: manifest?.purpose ?? (readText(config.purpose) || null),
    progressLabel: manifest?.progressLabel ?? input.node.label,
    ...outputRuntimeMetadata,
    ...inputMetadata,
    activeChildRequestIds: mergeUniqueStrings(outputRuntimeMetadata.activeChildRequestIds, inputMetadata.activeChildRequestIds),
    activeChildRunIds: mergeUniqueStrings(outputRuntimeMetadata.activeChildRunIds, inputMetadata.activeChildRunIds),
    readyArtifactRoles: mergeUniqueStrings(outputRuntimeMetadata.readyArtifactRoles, inputMetadata.readyArtifactRoles),
    readyArtifactKeys: mergeUniqueStrings(outputRuntimeMetadata.readyArtifactKeys, inputMetadata.readyArtifactKeys),
    recoveryHints: mergeUniqueStrings(outputRuntimeMetadata.recoveryHints, inputMetadata.recoveryHints),
  }
  const writeStep = async (nodeId: string | null) => client
    .from('output_workflow_run_steps')
    .upsert({
      run_id: input.runId,
      workflow_id: input.node.workflowId,
      node_id: nodeId,
      draft_id: input.draftId,
      node_key: input.node.key,
      node_type: input.node.nodeType,
      status: input.status,
      order_index: input.orderIndex,
      label: input.node.label,
      input_hash: input.inputHash ?? '',
      output_hash: input.outputHash ?? '',
      outputs: input.outputs ?? {},
      provider: input.provider ?? null,
      model: input.model ?? null,
      provider_request_id: input.providerRequestId ?? null,
      error_message: input.errorMessage ?? null,
      metadata: stepMetadata,
      started_at: input.status === 'queued' ? null : startedAt,
      completed_at: ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(input.status) ? now : null,
    }, { onConflict: 'run_id,node_key' })
  let response = await writeStep(input.node.id)
  if (response.error && response.error.code === '23503' && response.error.message.includes('output_workflow_run_steps_node_id_fkey')) {
    const currentNode = await client
      .from('output_workflow_nodes')
      .select('id')
      .eq('workflow_id', input.node.workflowId)
      .eq('key', input.node.key)
      .maybeSingle()
    if (currentNode.error) throw new Error(currentNode.error.message)
    response = await writeStep(typeof currentNode.data?.id === 'string' ? currentNode.data.id : null)
  }
  if (response.error) throw new Error(response.error.message)
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStatusToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
}

function buildOutputStepAiUsage(input: {
  run: OutputWorkflowRun
  node: OutputWorkflowNode
  result?: {
    outputs: Record<string, unknown>
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
  } | null
  skipped?: boolean
}): { line: AiUsageLine | null; summary: Record<string, unknown> | null } {
  if (!input.result || input.skipped) {
    return { line: null, summary: null }
  }
  const provider = readText(input.result.provider)
  const model = readText(input.result.model)
  const outputs = asRecord(input.result.outputs)
  if (provider === 'openai' && model && outputs.usage) {
    const line = buildOpenAiUsageLine({
      model,
      usage: outputs.usage,
      nodeKey: input.node.key,
      nodeLabel: input.node.label,
      nodeType: input.node.nodeType,
      requestId: input.result.providerRequestId ?? null,
      responseId: readText(outputs.providerResponseId) || readText(outputs.responseId) || null,
    })
    return { line, summary: summarizeAiUsageLines([line]) }
  }
  if (provider === 'fal' && model && input.node.nodeType === 'image_generation') {
    const image = asRecord(outputs.image)
    const width = Number(outputs.width ?? image.width ?? 0) || undefined
    const height = Number(outputs.height ?? image.height ?? 0) || undefined
    const line = buildFalMediaUsageLine({
      model,
      modality: 'image',
      operation: 'image_generation',
      nodeKey: input.node.key,
      nodeLabel: input.node.label,
      nodeType: input.node.nodeType,
      requestId: input.result.providerRequestId ?? readText(image.providerRequestId) ?? null,
      responseId: input.result.providerRequestId ?? readText(image.providerRequestId) ?? null,
      width,
      height,
      quality: readText(asRecord(input.node.config).quality) || undefined,
      size: readText(asRecord(input.node.config).imageSize) || undefined,
      metadata: {
        role: readText(outputs.role) || null,
        referenceImageCount: Number(image.referenceImageCount ?? 0) || 0,
      },
    })
    return { line, summary: summarizeAiUsageLines([line]) }
  }
  if (provider === 'fal' && model && input.node.nodeType === 'video_generation') {
    const line = buildFalMediaUsageLine({
      model,
      modality: 'video',
      operation: 'video_generation',
      nodeKey: input.node.key,
      nodeLabel: input.node.label,
      nodeType: input.node.nodeType,
      requestId: input.result.providerRequestId ?? null,
      responseId: input.result.providerRequestId ?? null,
      units: Number(outputs.durationSeconds ?? 0) || undefined,
      durationSeconds: Number(outputs.durationSeconds ?? 0) || undefined,
      metadata: {
        role: readText(asRecord(outputs.video).role) || null,
        blockNumber: Number(asRecord(outputs.video).blockNumber ?? 0) || null,
        referenceImageCount: Number(asRecord(outputs.video).referenceImageCount ?? 0) || 0,
        referenceVideoCount: Number(asRecord(outputs.video).referenceVideoCount ?? 0) || 0,
        referenceAudioCount: Number(asRecord(outputs.video).referenceAudioCount ?? 0) || 0,
      },
    })
    return { line, summary: summarizeAiUsageLines([line]) }
  }
  if (provider === 'muapi' && model && input.node.nodeType === 'video_generation') {
    const line = buildMuapiMediaUsageLine({
      model,
      modality: 'video',
      operation: 'video_generation',
      nodeKey: input.node.key,
      nodeLabel: input.node.label,
      nodeType: input.node.nodeType,
      requestId: input.result.providerRequestId ?? null,
      responseId: input.result.providerRequestId ?? null,
      units: Number(outputs.durationSeconds ?? 0) || undefined,
      durationSeconds: Number(outputs.durationSeconds ?? 0) || undefined,
      metadata: {
        workflowId: input.run.workflowId,
        runId: input.run.id,
        providerMode: readText(asRecord(outputs.video).providerMode),
        providerStatus: readText(asRecord(outputs.video).providerStatus) || 'COMPLETED',
      },
    })
    return { line, summary: summarizeAiUsageLines([line]) }
  }
  return { line: null, summary: null }
}

function terminalProviderStepMetadata(result?: {
  outputs: Record<string, unknown>
  provider?: string | null
  model?: string | null
  providerRequestId?: string | null
  skipped?: boolean
} | null) {
  if (!result || result.skipped) return {}
  const image = asRecord(result.outputs.image)
  const video = asRecord(result.outputs.video)
  const media = Object.keys(image).length > 0 ? image : video
  const metadata = asRecord(media.metadata)
  const provider = readText(result.provider) || readText(media.provider) || readText(metadata.provider)
  if (!provider) return {}
  const providerStatus = readText(media.providerStatus)
    || readText(metadata.providerStatus)
    || (provider === 'fal' || provider === 'openai' || provider === 'muapi' ? 'COMPLETED' : '')
  const providerMode = readText(media.providerMode)
    || readText(metadata.providerMode)
    || (provider === 'fal' ? 'fal_queue' : provider === 'muapi' ? 'muapi_polling' : provider === 'openai' ? 'background' : '')
  return {
    providerStatus: providerStatus || undefined,
    providerMode: providerMode || undefined,
    lastProviderPollAt: new Date().toISOString(),
    providerRequestId: readText(result.providerRequestId) || readText(media.providerRequestId) || readText(metadata.providerRequestId) || readText(metadata.falRequestId) || undefined,
    falRequestId: readText(metadata.falRequestId) || (provider === 'fal' ? readText(result.providerRequestId) : '') || undefined,
    falImageUrl: readText(metadata.falImageUrl) || undefined,
    falStatusUrl: readText(metadata.falStatusUrl) || undefined,
    falResponseUrl: readText(metadata.falResponseUrl) || undefined,
  }
}

function hasStoredOutputs(value: unknown) {
  return Object.keys(asRecord(value)).length > 0
}

function outputWorkflowImageOutputHasAssetRef(outputs: unknown) {
  const record = asRecord(outputs)
  if (!hasStoredOutputs(record)) return false
  if (
    record.skipImageGeneration === true
    || record.skip_image_generation === true
    || record.skipped === true
  ) {
    const skippedImage = asRecord(record.image)
    if (!readText(skippedImage.assetKey) && !readText(skippedImage.storagePath) && !readText(skippedImage.storage_path) && !readText(skippedImage.url)) {
      return false
    }
  }
  const hasImageRef = (value: unknown) => {
    const image = asRecord(value)
    return Boolean(
      readText(image.assetKey)
      || readText(image.asset_key)
      || readText(image.storagePath)
      || readText(image.storage_path)
      || readText(image.url)
      || readText(image.signedUrl)
      || readText(image.signed_url)
    )
  }
  if (hasImageRef(record) || hasImageRef(record.image) || hasImageRef(record.keyframe) || hasImageRef(record.primaryReferenceImage)) return true
  const images = Array.isArray(record.images) ? record.images : []
  if (images.some(hasImageRef)) return true
  return readUpstreamImages({ value: record }, ['image', 'images', 'keyframe', 'coverImage', 'primaryReferenceImage']).length > 0
}

function outputWorkflowNodeOutputsReusableForCache(
  node: Pick<OutputWorkflowNode, 'nodeType'> | Partial<Pick<OutputWorkflowNode, 'nodeType'>>,
  outputs: unknown,
) {
  if (!hasStoredOutputs(outputs)) return false
  if (node.nodeType === 'image_generation') return outputWorkflowImageOutputHasAssetRef(outputs)
  return true
}

function outputContainsEdgePortValue(outputs: unknown, edge: Pick<OutputWorkflowEdge, 'sourcePort'> | Partial<Pick<OutputWorkflowEdge, 'sourcePort'>>) {
  const record = asRecord(outputs)
  if (!hasStoredOutputs(record)) return false
  const sourcePort = readText(edge.sourcePort)
  if (!sourcePort) return true
  if (sourcePort === 'image' || sourcePort === 'coverImage' || sourcePort === 'primaryReferenceImage' || sourcePort === 'keyframe') {
    const direct = asRecord(record[sourcePort])
    if (readText(direct.assetKey) || readText(direct.storagePath) || readText(direct.storage_path) || readText(direct.url)) return true
    if (readText(record.assetKey) || readText(record.storagePath) || readText(record.storage_path) || readText(record.url)) return true
    return readUpstreamImages({ value: record }, [sourcePort, 'image', 'coverImage', 'primaryReferenceImage', 'keyframe']).length > 0
  }
  if (sourcePort === 'text' || sourcePort === 'prompt' || sourcePort === 'markdown') {
    return Boolean(readText(record[sourcePort]) || readText(record.providerPrompt) || readText(record.prompt) || readText(record.text) || readText(record.markdown))
  }
  if (sourcePort === 'asset_pack' || sourcePort === 'assetPack') {
    return Object.keys(asRecord(record.assetPack)).length > 0 || Object.keys(asRecord(record.asset_pack)).length > 0
  }
  const value = record[sourcePort]
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return Boolean(readText(value))
  if (value && typeof value === 'object') return Object.keys(asRecord(value)).length > 0
  return hasStoredOutputs(record)
}

function isOptionalOutputWorkflowEdge(
  edge: Pick<OutputWorkflowEdge, 'metadata'> | Partial<Pick<OutputWorkflowEdge, 'metadata' | 'sourceNodeKey' | 'targetNodeKey' | 'targetPort'>>,
) {
  const metadata = asRecord(edge.metadata)
  if (metadata.optional === true || metadata.optionalDependency === true) return true
  const sourceNodeKey = readText(edge.sourceNodeKey)
  const targetNodeKey = readText(edge.targetNodeKey)
  const targetPort = readText(edge.targetPort)
  if (
    sourceNodeKey.startsWith('cinematic_v3_storyboard_group_')
    && sourceNodeKey.endsWith('_video')
    && targetNodeKey === 'cinematic_v3_timeline_assemble'
    && targetPort === 'videos'
  ) {
    return true
  }
  return sourceNodeKey.startsWith('cinematic_v2_shot_')
    && sourceNodeKey.endsWith('_asset_pack')
    && targetNodeKey.startsWith('cinematic_v2_shot_')
    && targetNodeKey.endsWith('_video')
    && targetPort === 'references'
}

function cachedOutputRunId(node: OutputWorkflowNode) {
  return readText(asRecord(asRecord(node.metadata).execution).lastRunId)
}

const cachedUpstreamMediaFields = [
  'image',
  'coverImage',
  'primaryReferenceImage',
  'keyframe',
  'video',
  'videos',
  'videoReferences',
  'referenceVideos',
  'assetPack',
  'asset_pack',
  'prompt',
  'providerPrompt',
  'text',
  'markdown',
  'parsedScript',
  'sceneState',
  'layoutPlan',
  'shotPlan',
  'cinematicReferencePlan',
  'panels',
  'images',
]

function compactOutputWorkflowUpstreamForNodeCache(upstream: Record<string, Record<string, unknown>>) {
  const normalized = Object.fromEntries(
    Object.entries(upstream)
      .map(([key, outputs]) => [key, asRecord(outputs)] as const)
      .filter(([, outputs]) => hasStoredOutputs(outputs)),
  )
  if (jsonByteLength(normalized) <= 900_000) return normalized

  return Object.fromEntries(Object.entries(normalized).map(([key, outputs]) => {
    if (jsonByteLength(outputs) <= 120_000) return [key, outputs] as const
    const mediaSafe = Object.fromEntries(
      cachedUpstreamMediaFields
        .filter((field) => Object.prototype.hasOwnProperty.call(outputs, field))
        .map((field) => [field, outputs[field]] as const),
    )
    return [
      key,
      hasStoredOutputs(mediaSafe)
        ? mediaSafe
        : compactRecordForStatus(outputs, 40_000),
    ] as const
  }))
}

function readCachedInputUpstream(node: OutputWorkflowNode) {
  const execution = asRecord(asRecord(node.metadata).execution)
  const cached = asRecord(execution.cachedInputUpstream ?? execution.cachedUpstream)
  return Object.fromEntries(
    Object.entries(cached)
      .map(([key, outputs]) => [key, asRecord(outputs)] as const)
      .filter(([, outputs]) => hasStoredOutputs(outputs)),
  )
}

function collectCachedExternalUpstream(input: {
  node: OutputWorkflowNode
  nodesByKey: Map<string, OutputWorkflowNode>
  stepsByNodeKey?: Map<string, OutputWorkflowRunStep>
  recoveredOutputsByNodeKey?: Map<string, Record<string, unknown>>
  executionNodeKeys: Set<string>
  edges: OutputWorkflowEdge[]
}) {
  const outputs: Record<string, Record<string, unknown>> = {}
  const reusedNodeKeys: string[] = []
  const staleReusedNodeKeys: string[] = []
  const missingNodeKeys: string[] = []
  const sourceRunIds: string[] = []
  const cachedInputUpstream = readCachedInputUpstream(input.node)
  for (const edge of input.edges) {
    if (edge.targetNodeKey !== input.node.key || input.executionNodeKeys.has(edge.sourceNodeKey)) continue
    const sourceNode = input.nodesByKey.get(edge.sourceNodeKey)
    if (!sourceNode || !outputContainsEdgePortValue(sourceNode.outputs, edge)) {
      const cachedStepOutputs = asRecord(input.stepsByNodeKey?.get(edge.sourceNodeKey)?.outputs)
      if (outputContainsEdgePortValue(cachedStepOutputs, edge)) {
        outputs[edge.sourceNodeKey] = cachedStepOutputs
        reusedNodeKeys.push(edge.sourceNodeKey)
        staleReusedNodeKeys.push(edge.sourceNodeKey)
        const sourceRunId = readText(input.stepsByNodeKey?.get(edge.sourceNodeKey)?.runId)
        if (sourceRunId) sourceRunIds.push(sourceRunId)
        continue
      }
      const cachedSourceOutputs = asRecord(cachedInputUpstream[edge.sourceNodeKey])
      if (outputContainsEdgePortValue(cachedSourceOutputs, edge)) {
        outputs[edge.sourceNodeKey] = cachedSourceOutputs
        reusedNodeKeys.push(edge.sourceNodeKey)
        staleReusedNodeKeys.push(edge.sourceNodeKey)
        continue
      }
      const recoveredOutputs = asRecord(input.recoveredOutputsByNodeKey?.get(edge.sourceNodeKey))
      if (outputContainsEdgePortValue(recoveredOutputs, edge)) {
        outputs[edge.sourceNodeKey] = recoveredOutputs
        reusedNodeKeys.push(edge.sourceNodeKey)
        staleReusedNodeKeys.push(edge.sourceNodeKey)
        continue
      }
      if (!isOptionalOutputWorkflowEdge(edge)) missingNodeKeys.push(edge.sourceNodeKey)
      continue
    }
    outputs[edge.sourceNodeKey] = asRecord(sourceNode.outputs)
    reusedNodeKeys.push(edge.sourceNodeKey)
    if (sourceNode.dirty) staleReusedNodeKeys.push(edge.sourceNodeKey)
    const sourceRunId = cachedOutputRunId(sourceNode)
    if (sourceRunId) sourceRunIds.push(sourceRunId)
  }
  return {
    outputs,
    reusedNodeKeys: [...new Set(reusedNodeKeys)],
    staleReusedNodeKeys: [...new Set(staleReusedNodeKeys)],
    missingNodeKeys: [...new Set(missingNodeKeys)],
    sourceRunIds: [...new Set(sourceRunIds)],
  }
}

function outputWorkflowCacheStatus(input: {
  missingNodeKeys?: string[]
  staleReusedNodeKeys?: string[]
}) {
  const missingNodeKeys = [...new Set(input.missingNodeKeys ?? [])]
  const staleReusedNodeKeys = [...new Set(input.staleReusedNodeKeys ?? [])]
  if (missingNodeKeys.length > 0) return 'missing_upstream'
  if (staleReusedNodeKeys.length > 0) return 'stale_upstream'
  return 'ready'
}

function buildOutputWorkflowNodeExecutionCacheMetadata(input: {
  node: OutputWorkflowNode
  runId: string
  level: number
  resourceClass: string
  inputHash: string
  outputHash: string
  effectiveUpstream: Record<string, Record<string, unknown>>
  reusedNodeKeys?: string[]
  staleReusedNodeKeys?: string[]
  missingNodeKeys?: string[]
  sourceRunIds?: string[]
  recoveredFromRunStep?: boolean
  skippedReason?: string
}) {
  const staleUpstreamKeys = [...new Set(input.staleReusedNodeKeys ?? [])]
  const missingRequiredUpstreamKeys = [...new Set(input.missingNodeKeys ?? [])]
  return {
    ...asRecord(asRecord(input.node.metadata).execution),
    level: input.level,
    resourceClass: input.resourceClass,
    lastRunId: input.runId,
    inputHash: input.inputHash,
    outputHash: input.outputHash,
    recoveredFromRunStep: input.recoveredFromRunStep === true ? true : undefined,
    skippedReason: input.skippedReason || undefined,
    cachedInputUpstream: compactOutputWorkflowUpstreamForNodeCache(input.effectiveUpstream),
    cachedInputNodeKeys: Object.keys(input.effectiveUpstream),
    cachedInputAt: new Date().toISOString(),
    reusedNodeKeys: [...new Set(input.reusedNodeKeys ?? [])],
    staleReusedNodeKeys: staleUpstreamKeys,
    staleUpstreamKeys,
    missingRequiredUpstreamKeys,
    sourceRunIds: [...new Set(input.sourceRunIds ?? [])],
    cacheStatus: outputWorkflowCacheStatus({
      missingNodeKeys: missingRequiredUpstreamKeys,
      staleReusedNodeKeys: staleUpstreamKeys,
    }),
  }
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean) : []
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => readText(value)).filter(Boolean))]
}

function worldEntityVisualSource(entity: Record<string, unknown>) {
  return {
    summary: readText(entity.summary),
    context: readText(entity.context),
    metadata: asRecord(entity.metadata),
    customProperties: asRecord(entity.customProperties ?? entity.custom_properties),
  }
}

function readOutputEntityVisualDescription(entity: Record<string, unknown>) {
  const composed = readWorldEntityVisualDescription(worldEntityVisualSource(entity))
  return composed || readText(entity.visualDescription)
}

function readOutputEntityVisualTraits(entity: Record<string, unknown>) {
  return readWorldEntityVisualTraits(worldEntityVisualSource(entity))
}

function readOutputEntityVisualTraitMap(entity: Record<string, unknown>) {
  return readWorldEntityVisualTraitMap(worldEntityVisualSource(entity))
}

function readOutputEntityVoiceIdentity(entity: Record<string, unknown>) {
  return readWorldEntityVoiceIdentity(worldEntityVisualSource(entity))
}

function readOutputEntityVoiceDescription(entity: Record<string, unknown>) {
  return readWorldEntityVoiceDescription(worldEntityVisualSource(entity))
}

function readEntitySequence(entity: Record<string, unknown>) {
  const customProperties = asRecord(entity.customProperties ?? entity.custom_properties)
  return asRecord(customProperties.sequence)
}

function buildSelectedSequenceUnitScreenplayBrief(context: Record<string, unknown>) {
  const sequenceUnits = Array.isArray(context.sequenceUnits) ? context.sequenceUnits.map(asRecord) : []
  if (sequenceUnits.length === 0) return null
  const sourceSequenceUnitKeys = readStringArray(context.sourceSequenceUnitKeys)
  const sequenceUnit = sourceSequenceUnitKeys.length > 0
    ? sequenceUnits.find((entry) => sourceSequenceUnitKeys.includes(readText(entry.key))) ?? sequenceUnits[0]
    : sequenceUnits[0]
  if (!sequenceUnit) return null
  const sequence = readEntitySequence(sequenceUnit)
  const metadata = asRecord(sequenceUnit.metadata)
  const visual = asRecord(metadata.visual)
  return {
    key: readText(sequenceUnit.key),
    name: readText(sequenceUnit.name),
    summary: readText(sequenceUnit.summary),
    context: readText(sequenceUnit.context),
    visualDescription: readText(metadata.visualDescription) || readText(visual.description),
    sequence: {
      unitKind: readText(sequence.unitKind),
      actLabel: readText(sequence.actLabel),
      ordinal: Number(sequence.ordinal ?? 0) || null,
      sequenceKey: readText(sequence.sequenceKey),
      storyFunction: readText(sequence.storyFunction),
      povCharacterKey: readText(sequence.povCharacterKey),
      povCharacterName: readText(sequence.povCharacterName),
      povNotes: readText(sequence.povNotes),
      synopsis: readText(sequence.synopsis),
      dramaticQuestion: readText(sequence.dramaticQuestion),
      outcome: readText(sequence.outcome),
      openLoops: readStringArray(sequence.openLoops),
      resolvedLoops: readStringArray(sequence.resolvedLoops),
      characterArcDeltas: Array.isArray(sequence.characterArcDeltas) ? sequence.characterArcDeltas.map(asRecord) : [],
      consequences: Array.isArray(sequence.consequences) ? sequence.consequences.map(asRecord) : [],
    },
  }
}

function normalizeComicReferenceText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function collectSequenceReferenceStrings(value: unknown, output = new Set<string>()) {
  if (typeof value === 'string') {
    const normalized = normalizeComicReferenceText(value)
    if (normalized) output.add(normalized)
    return output
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectSequenceReferenceStrings(entry, output)
    return output
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectSequenceReferenceStrings(entry, output)
    }
  }
  return output
}

function sequenceSearchTextForReferences(sequenceUnit: Record<string, unknown>) {
  const sequence = readEntitySequence(sequenceUnit)
  return normalizeComicReferenceText([
    readText(sequenceUnit.name),
    readText(sequenceUnit.summary),
    readText(sequenceUnit.context),
    readText(asRecord(sequenceUnit.metadata).visualDescription),
    readText(sequence.synopsis),
    readText(sequence.dramaticQuestion),
    readText(sequence.outcome),
    JSON.stringify(sequence),
  ].filter(Boolean).join(' '))
}

function entityMentionedBySequence(entity: Record<string, unknown>, sequenceText: string, referenceStrings: Set<string>) {
  const key = normalizeComicReferenceText(readText(entity.key))
  if (key && referenceStrings.has(key)) return true
  const name = normalizeComicReferenceText(readText(entity.name))
  if (name && sequenceText.includes(name)) return true
  for (const alias of readStringArray(entity.aliases)) {
    const normalizedAlias = normalizeComicReferenceText(alias)
    if (normalizedAlias && (sequenceText.includes(normalizedAlias) || referenceStrings.has(normalizedAlias))) return true
  }
  const nodeType = readText(entity.nodeType ?? entity.node_type)
  const nameParts = name.split('_').filter((part) => part.length > 2)
  return nodeType === 'actor' && nameParts.some((part) => sequenceText.includes(part))
}

function chooseComicContextEntityKeys(input: {
  existingSourceEntityKeys: string[]
  sourceSequenceUnitKeys: string[]
  entities: Record<string, unknown>[]
  relationships: Record<string, unknown>[]
}) {
  const keys = new Set(input.existingSourceEntityKeys.filter(Boolean))
  const entityByKey = new Map(input.entities.map((entity) => [readText(entity.key), entity]).filter(([key]) => key))
  for (const sequenceKey of input.sourceSequenceUnitKeys) {
    const sequenceUnit = entityByKey.get(sequenceKey)
    if (!sequenceUnit) continue
    const sequenceText = sequenceSearchTextForReferences(sequenceUnit)
    const referenceStrings = collectSequenceReferenceStrings(sequenceUnit.customProperties ?? sequenceUnit.custom_properties)
    for (const entity of input.entities) {
      const nodeType = readText(entity.nodeType ?? entity.node_type)
      if (nodeType === 'sequence_unit') continue
      if (entityMentionedBySequence(entity, sequenceText, referenceStrings)) keys.add(readText(entity.key))
    }
    for (const relationship of input.relationships) {
      const sourceKey = readText(relationship.sourceEntityKey ?? relationship.source_entity_key)
      const targetKey = readText(relationship.targetEntityKey ?? relationship.target_entity_key)
      const relatedKey = sourceKey === sequenceKey ? targetKey : targetKey === sequenceKey ? sourceKey : ''
      if (!relatedKey) continue
      const related = entityByKey.get(relatedKey)
      if (related && readText(related.nodeType ?? related.node_type) !== 'sequence_unit') keys.add(relatedKey)
    }
  }
  return [...keys].slice(0, 24)
}

function shouldInferContextEntitiesFromSequence(preset: string) {
  return preset === 'comic_issue_from_sequence'
    || preset === 'cinematic_episode_from_sequence'
    || preset === 'cinematic_trailer'
}

function extractWorldContext(run: OutputWorkflowRun, node: OutputWorkflowNode) {
  const input = asRecord(run.input)
  const entities = Array.isArray(input.worldEntities) ? input.worldEntities.map(asRecord) : []
  const relationships = Array.isArray(input.worldRelationships) ? input.worldRelationships.map(asRecord) : []
  const assets = Array.isArray(input.assets) ? input.assets.map(asRecord) : []
  const wiki = asRecord(input.worldWiki)
  const config = asRecord(node.config)
  const configuredSourceEntityKeys = Array.isArray(config.sourceEntityKeys) ? config.sourceEntityKeys.filter((entry): entry is string => typeof entry === 'string') : []
  const sourceSequenceUnitKeys = Array.isArray(config.sourceSequenceUnitKeys) ? config.sourceSequenceUnitKeys.filter((entry): entry is string => typeof entry === 'string') : []
  const strictSourceEntityFilter = config.strictSourceEntityFilter === true
  const sourceEntityKeys = shouldInferContextEntitiesFromSequence(run.preset)
    ? chooseComicContextEntityKeys({
      existingSourceEntityKeys: configuredSourceEntityKeys,
      sourceSequenceUnitKeys,
      entities,
      relationships,
    })
    : configuredSourceEntityKeys
  const sequenceUnits = entities
    .filter((entity) => entity.nodeType === 'sequence_unit' || entity.node_type === 'sequence_unit')
    .filter((entity) => sourceSequenceUnitKeys.length === 0 || sourceSequenceUnitKeys.includes(String(entity.key)))
    .sort((left, right) => Number(readEntitySequence(left).ordinal ?? 0) - Number(readEntitySequence(right).ordinal ?? 0))
  const worldEntities = entities
    .filter((entity) => entity.nodeType !== 'sequence_unit' && entity.node_type !== 'sequence_unit')
    .filter((entity) => strictSourceEntityFilter
      ? sourceEntityKeys.includes(String(entity.key))
      : sourceEntityKeys.length === 0 || sourceEntityKeys.includes(String(entity.key)))
  return {
    wiki,
    entities: worldEntities,
    sequenceUnits,
    relationships,
    assets,
    sourceEntityKeys,
    sourceSequenceUnitKeys,
  }
}

function worldContextFromRunInput(run: OutputWorkflowRun) {
  const input = asRecord(run.input)
  const entities = Array.isArray(input.worldEntities) ? input.worldEntities.map(asRecord) : []
  return {
    wiki: asRecord(input.worldWiki),
    entities: entities.filter((entity) => entity.nodeType !== 'sequence_unit' && entity.node_type !== 'sequence_unit'),
    sequenceUnits: entities.filter((entity) => entity.nodeType === 'sequence_unit' || entity.node_type === 'sequence_unit'),
    relationships: Array.isArray(input.worldRelationships) ? input.worldRelationships.map(asRecord) : [],
    assets: Array.isArray(input.assets) ? input.assets.map(asRecord) : [],
    sourceEntityKeys: Array.isArray(input.sourceEntityKeys) ? input.sourceEntityKeys : [],
    sourceSequenceUnitKeys: Array.isArray(input.sourceSequenceUnitKeys) ? input.sourceSequenceUnitKeys : [],
  }
}

function titleFromContext(context: Record<string, unknown>) {
  const wiki = asRecord(context.wiki)
  return readText(wiki.title) || 'Generated Ebook'
}

function outlineFromContext(context: Record<string, unknown>) {
  const sequenceUnits = Array.isArray(context.sequenceUnits) ? context.sequenceUnits.map(asRecord) : []
  const fallbackChapters = Array.isArray(context.entities) ? context.entities.map(asRecord).slice(0, 6) : []
  const chapters = sequenceUnits.length > 0 ? sequenceUnits : fallbackChapters
  return chapters.map((entry, index) => {
    const sequence = readEntitySequence(entry)
    return {
      number: index + 1,
      title: readText(entry.name) || `Chapter ${index + 1}`,
      synopsis: readText(sequence.synopsis) || readText(entry.summary) || readText(entry.context),
      outcome: readText(sequence.outcome),
    }
  })
}

function readFirstUpstreamText(upstream: Record<string, Record<string, unknown>>, fields = ['markdown', 'text']) {
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = readText(outputs[field])
      if (value) return value
    }
  }
  return ''
}

function readVideoPromptFromUpstream(upstream: Record<string, Record<string, unknown>>) {
  const preferredKeys = Object.keys(upstream).filter((key) => key === 'video_prompt' || key.endsWith('_video_prompt') || key.includes('video_prompt'))
  for (const key of preferredKeys) {
    const outputs = upstream[key]
    for (const field of ['providerPrompt', 'prompt', 'text']) {
      const value = readText(outputs?.[field])
      if (value) return value
    }
  }
  return readFirstUpstreamText(upstream, ['providerPrompt', 'prompt', 'text'])
}

function readVideoPromptRecordFromUpstream(upstream: Record<string, Record<string, unknown>>) {
  const preferredKeys = Object.keys(upstream).filter((key) => key === 'video_prompt' || key.endsWith('_video_prompt') || key.includes('video_prompt'))
  for (const key of preferredKeys) {
    const outputs = asRecord(upstream[key])
    if (readText(outputs.providerPrompt) || readText(outputs.prompt) || readText(outputs.text)) return outputs
  }
  for (const outputs of Object.values(upstream)) {
    const record = asRecord(outputs)
    if (readText(record.providerPrompt) || readText(record.prompt) || readText(record.text)) return record
  }
  return {}
}

function readFirstUpstreamArray(upstream: Record<string, Record<string, unknown>>, fields: string[]) {
  for (const outputs of Object.values(upstream)) {
    if (Array.isArray(outputs)) return outputs.map(asRecord)
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) return value.map(asRecord)
    }
  }
  return []
}

function readFirstUpstreamStringArray(upstream: Record<string, Record<string, unknown>>, fields: string[]) {
  for (const outputs of Object.values(upstream)) {
    if (Array.isArray(outputs)) return readStringArray(outputs)
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) return readStringArray(value)
    }
  }
  return []
}

function readFirstUpstreamImage(upstream: Record<string, Record<string, unknown>>, fields = ['coverImage', 'image']) {
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      const record = asRecord(value)
      if (readText(record.assetKey) || readText(record.storagePath) || readText(record.url)) return record
    }
  }
  return null
}

function readPreferredUpstreamImage(input: {
  upstream: Record<string, Record<string, unknown>>
  preferredNodeKeys: string[]
  fields?: string[]
  role?: string
}) {
  const fields = input.fields ?? ['image', 'keyframe', 'primaryReferenceImage', 'coverImage']
  const readFromOutputs = (outputs: unknown) => {
    const record = asRecord(outputs)
    for (const field of fields) {
      const value = record[field]
      const image = asRecord(value)
      if (readText(image.assetKey) || readText(image.storagePath) || readText(image.url)) return image
    }
    if (readText(record.assetKey) || readText(record.storagePath) || readText(record.url)) return record
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
      if (readText(image.role) === input.role || readText(asRecord(outputs).role) === input.role) return image
    }
  }
  return readFirstUpstreamImage(input.upstream, fields)
}

function readUpstreamImages(upstream: Record<string, Record<string, unknown>>, fields = ['image', 'coverImage']) {
  const images: Record<string, unknown>[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = asRecord(entry)
          if (readText(record.assetKey) || readText(record.storagePath) || readText(record.url)) images.push(record)
        }
        continue
      }
      const record = asRecord(value)
      if (readText(record.assetKey) || readText(record.storagePath) || readText(record.url)) images.push(record)
    }
    if (
      (readText(outputs.assetKey) || readText(outputs.storagePath) || readText(outputs.storage_path) || readText(outputs.url))
      && !images.some((image) => readText(image.assetKey) === readText(outputs.assetKey) && readText(image.storagePath || image.storage_path) === readText(outputs.storagePath || outputs.storage_path))
    ) {
      images.push(outputs)
    }
  }
  return images
}

function imageIsPlanningOnly(image: Record<string, unknown>) {
  const metadata = asRecord(image.metadata)
  return image.planningOnly === true
    || image.planning_only === true
    || metadata.planningOnly === true
    || metadata.planning_only === true
}

function normalizeCinematicReferenceMode(value: unknown) {
  const mode = readText(value)
  return mode === 'keyframes' || mode === 'keyframes_and_storyboard' || mode === 'storyboard_sheet' || mode === 'shot_reference_sheet'
    ? mode
    : 'shot_reference_sheet'
}

function cinematicImageReferencePriority(image: Record<string, unknown>, cinematicReferenceMode: string) {
  const role = readText(image.role) || readText(asRecord(image.metadata).role)
  if (role === 'cinematic_beat_sheet' || role === 'cinematic_direction_sheet') {
    return cinematicReferenceMode === 'keyframes' ? 99 : 0
  }
  if (role === 'cinematic_keyframe' || role === 'cinematic_v2_shot_keyframe') {
    const keyframeIndex = Number(image.keyframeIndex ?? asRecord(image.metadata).keyframeIndex ?? 0) || 0
    return cinematicReferenceMode === 'keyframes' ? keyframeIndex : keyframeIndex + 1
  }
  if (role === 'cinematic_atlas') return 10
  return 20
}

function orderCinematicVideoReferenceImages(images: Record<string, unknown>[], cinematicReferenceMode: string) {
  const mode = normalizeCinematicReferenceMode(cinematicReferenceMode)
  return images
    .filter((image) => {
      if (!imageIsPlanningOnly(image)) return true
      const role = readText(image.role) || readText(asRecord(image.metadata).role)
      const usedAsVideoReference = image.usedAsVideoReference === true
        || image.used_as_video_reference === true
        || asRecord(image.metadata).usedAsVideoReference === true
        || asRecord(image.metadata).used_as_video_reference === true
      return (
        role === 'cinematic_v3_storyboard_sheet'
        || role === 'cinematic_beat_sheet'
        || role === 'cinematic_direction_sheet'
        || usedAsVideoReference
      ) && mode !== 'keyframes'
    })
    .sort((left, right) => cinematicImageReferencePriority(left, mode) - cinematicImageReferencePriority(right, mode))
}

function debugForceVideoGenerationEnabled(run: OutputWorkflowRun, node?: OutputWorkflowNode | null) {
  const runMetadata = asRecord(run.metadata)
  if (runMetadata.debugForceVideoGeneration !== true) return false
  if (!node || node.nodeType !== 'video_generation') return false
  if (isCinematicV2ProductionNode(asRecord(node.config), node) && !cinematicVideoApprovedEnabled(run)) return false
  const runMode = readText(runMetadata.runMode)
  if (!runMode.startsWith('targeted_node')) return false
  const targetNodeKeys = new Set(readStringArray(runMetadata.targetNodeKeys))
  const forceNodeKeys = new Set(readStringArray(runMetadata.forceNodeKeys))
  return targetNodeKeys.has(node.key) && forceNodeKeys.has(node.key)
}

function cinematicVideoApprovedEnabled(run: OutputWorkflowRun) {
  const runInput = asRecord(run.input)
  const runMetadata = asRecord(run.metadata)
  return runInput.cinematicVideoApproved === true || runMetadata.cinematicVideoApproved === true
}

function isCinematicV2ProductionNode(config: Record<string, unknown>, node?: OutputWorkflowNode | null) {
  const purpose = readText(config.purpose)
  const role = readText(config.role)
  const pipelineVersion = readText(config.cinematicPipelineVersion)
  return (pipelineVersion === 'v2_shot_orchestration' || pipelineVersion === 'v3_script_storyboards')
    && (
      purpose === 'cinematic_v2_shot_video'
      || role === 'cinematic_v2_shot_video'
      || purpose === 'cinematic_v2_timeline_assemble'
      || role === 'cinematic_v2_final_timeline'
      || node?.key === 'cinematic_v2_timeline_assemble'
      || purpose === 'cinematic_v3_storyboard_group_video'
      || role === 'cinematic_v3_storyboard_group_video'
      || purpose === 'sequence_animatic_shot_video'
      || role === 'sequence_animatic_shot_video'
      || purpose === 'cinematic_v3_timeline_assemble'
      || role === 'cinematic_v3_final_timeline'
      || node?.key === 'cinematic_v3_timeline_assemble'
    )
}

function debugSkipVideoGenerationEnabled(config: Record<string, unknown>, run: OutputWorkflowRun, node?: OutputWorkflowNode | null) {
  if (isCinematicV2ProductionNode(config, node)) return !cinematicVideoApprovedEnabled(run)
  if (debugForceVideoGenerationEnabled(run, node)) return false
  const runInput = asRecord(run.input)
  const runMetadata = asRecord(run.metadata)
  if (typeof config.debugSkipVideoGeneration === 'boolean') return config.debugSkipVideoGeneration
  if (typeof runInput.debugSkipVideoGeneration === 'boolean') return runInput.debugSkipVideoGeneration
  if (typeof runMetadata.debugSkipVideoGeneration === 'boolean') return runMetadata.debugSkipVideoGeneration
  return true
}

function isManualOnlyOutputWorkflowNode(node: OutputWorkflowNode) {
  const config = asRecord(node.config)
  const execution = asRecord(config.execution)
  return config.manualOnly === true
    || config.manual_only === true
    || execution.manualOnly === true
    || execution.manual_only === true
}

function upstreamHasDebugSkippedVideo(upstream: Record<string, Record<string, unknown>>) {
  for (const outputs of Object.values(upstream)) {
    const video = asRecord(outputs.video)
    if (video.debugSkipVideoGeneration === true || video.skippedReason === 'debug_skip_video_generation') return true
    if (outputs.debugSkipVideoGeneration === true || outputs.skippedReason === 'debug_skip_video_generation') return true
  }
  return false
}

function readUpstreamVideos(upstream: Record<string, Record<string, unknown>>, fields = ['video', 'videos']) {
  const videos: Record<string, unknown>[] = []
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      if (Array.isArray(value)) {
        for (const entry of value) {
          const record = asRecord(entry)
          if (readText(record.assetKey) || readText(record.storagePath) || readText(record.url)) videos.push(record)
        }
        continue
      }
      const record = asRecord(value)
      if (readText(record.assetKey) || readText(record.storagePath) || readText(record.url)) videos.push(record)
    }
  }
  return videos
}

function readCinematicStoryboardStyleSafeMode(config: Record<string, unknown>, run?: OutputWorkflowRun | null) {
  if (typeof config.debugCinematicStoryboardStyleSafeMode === 'boolean') return config.debugCinematicStoryboardStyleSafeMode
  const runInput = asRecord(run?.input)
  const runMetadata = asRecord(run?.metadata)
  const cinematicOptions = asRecord(runMetadata.cinematicOptions)
  if (typeof runInput.debugCinematicStoryboardStyleSafeMode === 'boolean') return runInput.debugCinematicStoryboardStyleSafeMode
  if (typeof runMetadata.debugCinematicStoryboardStyleSafeMode === 'boolean') return runMetadata.debugCinematicStoryboardStyleSafeMode
  if (typeof cinematicOptions.debugCinematicStoryboardStyleSafeMode === 'boolean') return cinematicOptions.debugCinematicStoryboardStyleSafeMode
  return DEFAULT_CINEMATIC_STORYBOARD_STYLE_SAFE_MODE
}

function readCinematicStoryboardStyleOverride(config: Record<string, unknown>, run?: OutputWorkflowRun | null) {
  const runInput = asRecord(run?.input)
  const runMetadata = asRecord(run?.metadata)
  const cinematicOptions = asRecord(runMetadata.cinematicOptions)
  return readText(config.cinematicStoryboardStyleOverride)
    || readText(runInput.cinematicStoryboardStyleOverride)
    || readText(runMetadata.cinematicStoryboardStyleOverride)
    || readText(cinematicOptions.cinematicStoryboardStyleOverride)
    || DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT
}

function resolveCinematicStoryboardStylePolicy(config: Record<string, unknown>, run?: OutputWorkflowRun | null) {
  const safeMode = readCinematicStoryboardStyleSafeMode(config, run)
  const stylePrompt = safeMode ? readCinematicStoryboardStyleOverride(config, run) : ''
  return {
    safeMode,
    stylePrompt,
    label: safeMode ? 'painterly comic-book' : 'normal project/user style',
  }
}

function inferCinematicTargetVideoStyle(input: {
  prompt: string
  truthSourceMode: string
  blockScript: Record<string, unknown>
}) {
  const explicitStyle = readText(input.blockScript.targetVideoStyle)
    || readText(input.blockScript.visualStyle)
    || readText(input.blockScript.style)
  if (explicitStyle) return explicitStyle
  const prompt = String(input.prompt || '').toLowerCase()
  const truth = input.truthSourceMode.toLowerCase()
  if (truth.includes('ugc') || /\b(phone|selfie|tiktok|reel|creator|ugc)\b/.test(prompt)) {
    return 'raw UGC phone footage with natural handheld motion and platform-native realism'
  }
  if (truth.includes('broadcast') || /\b(broadcast|live tv|news|sports)\b/.test(prompt)) {
    return 'authentic live broadcast video with practical camera coverage and natural signal texture'
  }
  if (truth.includes('animation') || /\b(anime|animated|animation|2d)\b/.test(prompt)) {
    return 'coherent stylized animation matching the user brief and project art direction'
  }
  if (/\b(comic|graphic novel|illustrated|painterly)\b/.test(prompt)) {
    return 'stylized cinematic graphic-novel animation matching the user brief'
  }
  return 'grounded live-action cinematic video with realistic faces, practical lighting, natural lens behavior, and physical motion'
}

function readFirstUpstreamRecord(upstream: Record<string, Record<string, unknown>>, fields: string[]) {
  for (const outputs of Object.values(upstream)) {
    for (const field of fields) {
      const value = outputs[field]
      const record = asRecord(value)
      if (Object.keys(record).length > 0) return record
    }
  }
  return {}
}

function readPreferredUpstreamRecord(upstream: Record<string, Record<string, unknown>>, preferredNodeKeys: string[], fields: string[]) {
  for (const nodeKey of preferredNodeKeys) {
    const outputs = upstream[nodeKey]
    if (!outputs) continue
    for (const field of fields) {
      const record = asRecord(outputs[field])
      if (Object.keys(record).length > 0) return record
    }
  }
  return readFirstUpstreamRecord(upstream, fields)
}

function readUpstreamGuidanceBundle(upstream: Record<string, Record<string, unknown>>) {
  for (const outputs of Object.values(upstream)) {
    const candidate = outputs.guidance ?? outputs.guidanceBundle
    const parsed = outputGuidanceBundleSchema.safeParse(candidate)
    if (parsed.success) return parsed.data
  }
  return null
}

function mergeGuidanceBundles(primary: OutputGuidanceBundle | null, secondary: OutputGuidanceBundle | null) {
  if (!primary && !secondary) return outputGuidanceBundleSchema.parse({})
  if (!primary) return secondary!
  if (!secondary) return primary
  const skillKeys = [...new Set([...primary.skillKeys, ...secondary.skillKeys])]
  const guidance = [...new Set([...primary.guidance, ...secondary.guidance])]
  const avoid = [...new Set([...primary.avoid, ...secondary.avoid])]
  const skillsByKey = new Map([...primary.skills, ...secondary.skills].map((skill) => [skill.key, skill]))
  const bundleWithoutHash = {
    skillKeys,
    skillVersions: { ...primary.skillVersions, ...secondary.skillVersions },
    guidanceMode: secondary.guidanceMode === 'strict' ? 'strict' : primary.guidanceMode,
    guidance,
    avoid,
    structuredDirectives: { ...primary.structuredDirectives, ...secondary.structuredDirectives },
    resolvedGuidancePreview: [
      ...guidance.slice(0, 5),
      ...avoid.slice(0, 3).map((entry) => `Avoid: ${entry}`),
    ].join(' '),
    skills: [...skillsByKey.values()],
    diagnostics: [...primary.diagnostics, ...secondary.diagnostics],
  }
  return outputGuidanceBundleSchema.parse({
    ...bundleWithoutHash,
    guidanceHash: hashOutputGuidanceBundle(bundleWithoutHash),
  })
}

function resolveGuidanceForExecution(input: {
  run: OutputWorkflowRun
  node: OutputWorkflowNode
  upstream: Record<string, Record<string, unknown>>
}) {
  const upstreamBundle = readUpstreamGuidanceBundle(input.upstream)
  const nodeBundle = buildOutputGuidanceBundleForNode({
    node: input.node,
    worldWiki: asRecord(input.run.input).worldWiki,
  })
  return mergeGuidanceBundles(upstreamBundle, nodeBundle)
}

function guidanceMarkdown(bundle: OutputGuidanceBundle) {
  if (bundle.skillKeys.length === 0 && bundle.guidance.length === 0 && bundle.avoid.length === 0) return ''
  return [
    bundle.skillKeys.length > 0 ? `Guidance skills: ${bundle.skillKeys.join(', ')}.` : '',
    bundle.guidance.length > 0 ? `Guidance:\n${bundle.guidance.map((entry) => `- ${entry}`).join('\n')}` : '',
    bundle.avoid.length > 0 ? `Avoid:\n${bundle.avoid.map((entry) => `- ${entry}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

function guidanceStepMetadata(value: unknown) {
  const parsed = outputGuidanceBundleSchema.safeParse(value)
  if (!parsed.success) return {}
  return {
    skillKeys: parsed.data.skillKeys,
    skillVersions: parsed.data.skillVersions,
    guidanceHash: parsed.data.guidanceHash,
    guidanceMode: parsed.data.guidanceMode,
    resolvedGuidancePreview: parsed.data.resolvedGuidancePreview,
  }
}

function outputWorkflowTextModel() {
  return Deno.env.get('OUTPUT_WORKFLOW_TEXT_MODEL')?.trim() || DEFAULT_OUTPUT_WORKFLOW_TEXT_MODEL
}

function outputWorkflowComicTextModel() {
  return Deno.env.get('OUTPUT_WORKFLOW_COMIC_TEXT_MODEL')?.trim() || outputWorkflowTextModel()
}

function outputWorkflowChapterTimeoutMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_CHAPTER_TIMEOUT_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(60_000, Math.floor(parsed))
    : DEFAULT_CHAPTER_PROSE_TIMEOUT_MS
}

function outputWorkflowScreenplayAuthorTimeoutMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_SCREENPLAY_AUTHOR_TIMEOUT_MS')
  const parsed = raw ? Number(raw) : NaN
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(60_000, Math.floor(parsed))
  const chapterRaw = Deno.env.get('OUTPUT_WORKFLOW_CHAPTER_TIMEOUT_MS')
  const chapterParsed = chapterRaw ? Number(chapterRaw) : NaN
  return Number.isFinite(chapterParsed) && chapterParsed > 0
    ? Math.max(60_000, Math.floor(chapterParsed))
    : DEFAULT_SCREENPLAY_AUTHOR_TIMEOUT_MS
}

function outputWorkflowContinuityPlannerTimeoutMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_CONTINUITY_PLANNER_TIMEOUT_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(60_000, Math.floor(parsed))
    : DEFAULT_CONTINUITY_PLANNER_TIMEOUT_MS
}

function outputWorkflowContinuityBlockPlannerTimeoutMs() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_CONTINUITY_BLOCK_PLANNER_TIMEOUT_MS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(30_000, Math.floor(parsed))
    : DEFAULT_CONTINUITY_BLOCK_PLANNER_TIMEOUT_MS
}

function outputWorkflowChapterAttempts() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_CHAPTER_ATTEMPTS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(4, Math.max(1, Math.floor(parsed)))
    : DEFAULT_CHAPTER_PROSE_ATTEMPTS
}

function outputWorkflowShotContinuityStreamAttempts() {
  const raw = Deno.env.get('OUTPUT_WORKFLOW_SHOT_CONTINUITY_STREAM_ATTEMPTS')
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(4, Math.max(1, Math.floor(parsed)))
    : 3
}

function isRetryableOpenAiStreamError(error: unknown) {
  if (error instanceof WorkflowCancelledError) return false
  if (isRetryableOpenAiError(error)) return true
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('error reading a body from connection')
    || lower.includes('body from connection')
    || lower.includes('bodystreambuffer')
    || lower.includes('body stream')
    || lower.includes('stream aborted')
    || lower.includes('aborted')
    || lower.includes('fetch failed')
    || lower.includes('connection reset')
    || lower.includes('connection closed')
    || lower.includes('network error')
    || lower.includes('terminated')
    || lower.includes('econnreset')
    || lower.includes('etimedout')
    || lower.includes('und_err')
}

function isTransientWorkerDbError(error: unknown) {
  const message = (error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error)).toLowerCase()
  return message.includes('statement timeout')
    || message.includes('canceling statement')
    || message.includes('timeout')
    || message.includes('timed out')
    || message.includes('fetch failed')
    || message.includes('connection')
    || message.includes('econnreset')
    || message.includes('520')
    || message.includes('521')
    || message.includes('522')
    || message.includes('523')
    || message.includes('524')
    || message.includes('service unavailable')
    || message.includes('bad gateway')
    || message.includes('gateway timeout')
}

function isOpenAiTruncationError(error: unknown) {
  if (error instanceof WorkflowCancelledError) return false
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  return lower.includes('max_output_tokens') || lower.includes('status incomplete')
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveFalWebhookUrl() {
  try {
    return buildFalWebhookUrl()
  } catch (error) {
    console.warn('[output-workflow] Fal webhook URL is not configured.', {
      error: error instanceof Error ? error.message : String(error),
    })
    return ''
  }
}

class WorkflowCancelledError extends Error {
  workflowCancelled = true

  constructor(message = 'Output workflow run was cancelled.') {
    super(message)
    this.name = 'WorkflowCancelledError'
  }
}

function compactForPrompt(value: unknown, maxLength = 12_000) {
  const serialized = JSON.stringify(value, null, 2)
  return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}\n[truncated]` : serialized
}

function buildChapterPlan(context: Record<string, unknown>, outline: Array<Record<string, unknown>>) {
  const sequenceUnits = Array.isArray(context.sequenceUnits) ? context.sequenceUnits.map(asRecord) : []
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  return outline.map((chapter, index) => {
    const sequenceUnit = sequenceUnits[index] ?? {}
    const sequence = readEntitySequence(sequenceUnit)
    const povCharacterKey = readText(sequence.povCharacterKey ?? sequence.povActorKey ?? sequence.focalCharacterKey)
    return {
      number: Number(chapter.number ?? index + 1),
      title: readText(chapter.title) || readText(sequenceUnit.name) || `Chapter ${index + 1}`,
      narrationPov: readText(asRecord(context.wiki).narrationPov),
      povCharacterKey,
      povCharacterName: readText(sequence.povCharacterName)
        || readText(entities.find((entity) => readText(entity.key) === povCharacterKey)?.name),
      povNotes: readText(sequence.povNotes),
      synopsis: readText(chapter.synopsis) || readText(sequence.synopsis) || readText(sequenceUnit.summary),
      dramaticQuestion: readText(sequence.dramaticQuestion),
      outcome: readText(chapter.outcome) || readText(sequence.outcome),
      sequenceUnitKey: readText(sequenceUnit.key),
    }
  })
}

function buildChapterSectionPlan(input: {
  context: Record<string, unknown>
  chapterPlan: Array<Record<string, unknown>>
  chapterNumber: number
  sequenceUnitKey: string
  sequenceUnitName: string
  sectionCount: number
}) {
  const chapter = input.chapterPlan.find((entry) => readText(entry.sequenceUnitKey) === input.sequenceUnitKey)
    ?? input.chapterPlan.find((entry) => Number(entry.number) === input.chapterNumber)
    ?? input.chapterPlan[input.chapterNumber - 1]
    ?? {}
  const chapterTitle = readText(chapter.title) || input.sequenceUnitName || `Chapter ${input.chapterNumber}`
  const synopsis = readText(chapter.synopsis)
  const dramaticQuestion = readText(chapter.dramaticQuestion)
  const outcome = readText(chapter.outcome)
  const movements = [
    'Opening pressure and orientation',
    'Complication and active pursuit',
    'Reversal, reveal, or emotional turn',
    'Outcome, consequence, and transition',
  ]
  const openingStrategies = [
    'Open on a character doing something concrete under pressure, not on weather, skyline, light, mood, or abstract atmosphere.',
    'Open on a direct obstacle, interruption, or consequence from the previous beat, not on weather or city description.',
    'Open on discovery, dialogue, or a tactical choice, not on a metaphor or sensory panorama.',
    'Open on the cost of the chapter choice or the next necessary action, not on atmospheric scene-setting.',
  ]
  return Array.from({ length: input.sectionCount }, (_, index) => ({
    chapterNumber: input.chapterNumber,
    sectionNumber: index + 1,
    sectionCount: input.sectionCount,
    chapterTitle,
    title: movements[index] ?? `Section ${index + 1}`,
    openingStrategy: openingStrategies[index % openingStrategies.length],
    synopsis,
    dramaticQuestion,
    outcome,
    sequenceUnitKey: input.sequenceUnitKey,
    sequenceUnitName: input.sequenceUnitName,
  }))
}

function buildEbookCoverPromptInstruction(input: {
  context: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const wiki = asRecord(input.context.wiki)
  const title = titleFromContext(input.context)
  const logline = readText(wiki.logline)
  const synopsis = readText(wiki.synopsis)
  const genre = readText(wiki.genre)
  const coreConflict = readText(wiki.coreConflict)
  const artStyleDescription = readText(wiki.artStyleDescription)
  const toneTags = Array.isArray(wiki.toneTags) ? wiki.toneTags.filter((entry): entry is string => typeof entry === 'string') : []
  const visualMotifs = Array.isArray(wiki.visualMotifs) ? wiki.visualMotifs.filter((entry): entry is string => typeof entry === 'string') : []
  const entities = Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 14) : []
  const sequenceUnits = Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord).slice(0, 8) : []
  const entityVisuals = entities.map((entity) => ({
    name: readText(entity.name),
    type: readText(entity.nodeType ?? entity.node_type),
    summary: readText(entity.summary),
    visualDescription: readOutputEntityVisualDescription(entity),
    visualTraits: readOutputEntityVisualTraits(entity),
    visualTraitMap: readOutputEntityVisualTraitMap(entity),
    voice: readOutputEntityVoiceIdentity(entity),
    voiceDescription: readOutputEntityVoiceDescription(entity),
  })).filter((entry) => entry.name || entry.summary || entry.visualDescription)

  return [
    'Create one production-ready GPT Image 2 prompt for a finished ebook front cover.',
    `Exact title text to render on the cover: "${title}"`,
    'The generated image should be a complete front cover design with title typography included in the image.',
    'Use a 2:3 vertical book-cover composition suitable for a 6x9 ebook PDF.',
    logline ? `Logline: ${logline}` : '',
    genre ? `Genre: ${genre}` : '',
    toneTags.length > 0 ? `Tone tags: ${toneTags.join(', ')}` : '',
    coreConflict ? `Core conflict: ${coreConflict}` : '',
    artStyleDescription ? `Art direction: ${artStyleDescription}` : '',
    visualMotifs.length > 0 ? `Visual motifs: ${visualMotifs.join(', ')}` : '',
    synopsis ? `Synopsis context, for cover direction only: ${synopsis}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'World context to translate into visible cover design. Do not mention internal keys in the final image prompt:',
    compactForPrompt({
      entities: entityVisuals,
      sequenceUnits: sequenceUnits.map((unit) => ({
        name: readText(unit.name),
        summary: readText(unit.summary),
        sequence: readEntitySequence(unit),
      })),
    }, 8000),
    '',
    'Output requirements:',
    '- Return only the final image-generation prompt, no notes or markdown.',
    '- Include the exact title text and ask for clean, legible typography.',
    '- Describe cover composition, subject, setting, typography placement, color palette, lighting, material finish, and genre cues.',
    '- Avoid GraphCore wording, workflow/node terminology, schema labels, hidden lore, IDs, or non-visual explanation.',
    '- Avoid overstuffing the cover. Prefer one strong readable cover idea over a collage of every story element.',
  ].filter(Boolean).join('\n')
}

function parseJsonObject(text: string) {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const candidate = fenced || trimmed
  try {
    return asRecord(JSON.parse(candidate))
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return asRecord(JSON.parse(candidate.slice(start, end + 1)))
      } catch {
        return {}
      }
    }
  }
  return {}
}

function configuredBibleSections(nodeConfig: Record<string, unknown>) {
  const sections = Array.isArray(nodeConfig.sections)
    ? nodeConfig.sections.map(asRecord)
    : []
  return sections
    .map((section, index) => ({
      key: readText(section.key) || `section_${index + 1}`,
      title: readText(section.title) || `Section ${index + 1}`,
      description: readText(section.description),
      order: Number(section.order ?? index + 1) || index + 1,
    }))
    .filter((section) => section.key && section.title)
}

function buildBibleSectionPlan(config: Record<string, unknown>, context: Record<string, unknown>) {
  const sections = configuredBibleSections(config)
  const fallbackSections = sections.length > 0 ? sections : [
    { key: 'core_premise', title: 'Core Premise', description: 'Project premise and core conflict.', order: 1 },
    { key: 'world_overview', title: 'World Overview', description: 'Main world context and status quo.', order: 2 },
    { key: 'main_characters', title: 'Main Characters', description: 'Primary character dossiers.', order: 3 },
  ]
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  const sequenceUnits = Array.isArray(context.sequenceUnits) ? context.sequenceUnits.map(asRecord) : []
  return fallbackSections.map((section) => ({
    ...section,
    entityCount: entities.length,
    sequenceUnitCount: sequenceUnits.length,
    canonPolicy: 'Use only current world graph canon. If information is missing, state "Not yet defined in canon."',
  }))
}

function buildBibleSectionInstruction(input: {
  context: Record<string, unknown>
  sectionPlan: Array<Record<string, unknown>>
  sectionKey: string
  sectionTitle: string
  sectionDescription: string
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const sectionBrief = input.sectionPlan.find((section) => readText(section.key) === input.sectionKey) ?? {}
  const entities = Array.isArray(input.context.entities) ? input.context.entities.map(asRecord) : []
  const sequenceUnits = Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord) : []
  const relationships = Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord) : []
  const threads = Array.isArray(input.context.threads) ? input.context.threads.map(asRecord) : []
  const assets = Array.isArray(input.context.assets) ? input.context.assets.map(asRecord) : []
  const normalizedSection = `${input.sectionKey} ${input.sectionTitle}`.toLowerCase()
  const entityMatchesSection = (entity: Record<string, unknown>) => {
    const type = readText(entity.nodeType ?? entity.node_type).toLowerCase()
    if (normalizedSection.includes('character') || normalizedSection.includes('cast')) return ['actor', 'character', 'persona'].includes(type)
    if (normalizedSection.includes('location') || normalizedSection.includes('place') || normalizedSection.includes('environment')) return ['place', 'location', 'environment'].includes(type)
    if (normalizedSection.includes('faction') || normalizedSection.includes('group') || normalizedSection.includes('organization') || normalizedSection.includes('brand')) return ['group', 'faction', 'organization', 'brand'].includes(type)
    if (normalizedSection.includes('object') || normalizedSection.includes('item') || normalizedSection.includes('technology') || normalizedSection.includes('concept') || normalizedSection.includes('rule') || normalizedSection.includes('lore')) return ['object', 'item', 'prop', 'concept', 'technology', 'system'].includes(type)
    if (normalizedSection.includes('visual') || normalizedSection.includes('tone') || normalizedSection.includes('style')) return true
    return false
  }
  const sectionEntities = entities.filter(entityMatchesSection)
  const entityContext = (sectionEntities.length > 0 ? sectionEntities : entities)
    .slice(0, sectionEntities.length > 0 ? 32 : 18)
  const includeSequenceContext = normalizedSection.includes('sequence')
    || normalizedSection.includes('chapter')
    || normalizedSection.includes('timeline')
    || normalizedSection.includes('arc')
    || normalizedSection.includes('chronology')
    || normalizedSection.includes('overview')
  const includeRelationshipContext = normalizedSection.includes('relationship')
    || normalizedSection.includes('faction')
    || normalizedSection.includes('group')
    || normalizedSection.includes('timeline')
    || normalizedSection.includes('continuity')
    || normalizedSection.includes('rule')
  return [
    `Write the "${input.sectionTitle}" section for a designed canon reference document.`,
    input.sectionDescription ? `Section purpose: ${input.sectionDescription}` : '',
    Object.keys(sectionBrief).length > 0 ? `Planner section brief: ${compactForPrompt(sectionBrief, 1800)}` : '',
    input.prompt ? `User request: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'Output requirements:',
    '- Return Markdown for this section only.',
    `- Start with exactly this heading: ## ${input.sectionTitle}`,
    '- Write a curated production-bible section, not a raw world-context dump.',
    '- Select the highest-signal canon for this section and arrange it into a readable editorial layout.',
    '- Prefer compact paragraphs, short labeled bullets, and useful subheadings over exhaustive lists.',
    '- Do not repeat the same synopsis, premise, or entity descriptions across sections unless needed for clarity.',
    '- Write reference material, not fiction prose, chapter prose, screenplay, marketing copy, or a schema explanation.',
    '- When entities have imageAssetKeys, write copy that can sit beside visual reference cards, but do not paste URLs or internal asset keys into prose.',
    '- Use only current world graph canon. Do not invent missing names, backstory, rules, or chronology.',
    '- If a subsection lacks canon, write "Not yet defined in canon" and identify what would be useful to define next.',
    '- Include continuity notes, constraints, and unresolved questions when relevant.',
    '',
    'Current world context:',
    compactForPrompt({
      wiki,
      entities: entityContext.map((entity) => ({
        key: readText(entity.key),
        name: readText(entity.name),
        type: readText(entity.nodeType ?? entity.node_type),
        summary: readText(entity.summary),
        context: readText(entity.context),
        visualDescription: readOutputEntityVisualDescription(entity),
        visualTraits: readOutputEntityVisualTraits(entity),
        visualTraitMap: readOutputEntityVisualTraitMap(entity),
        voice: readOutputEntityVoiceIdentity(entity),
        voiceDescription: readOutputEntityVoiceDescription(entity),
        imageAssetKeys: entityAssetKeys(entity, assets),
        customProperties: entity.customProperties,
      })),
      sequenceUnits: includeSequenceContext ? sequenceUnits.map((unit) => ({
        key: readText(unit.key),
        name: readText(unit.name),
        summary: readText(unit.summary),
        sequence: readEntitySequence(unit),
      })).slice(0, 36) : [],
      relationships: includeRelationshipContext ? relationships.slice(0, 70) : relationships.slice(0, 18),
      threads: threads.slice(0, 18),
    }, 12000),
  ].filter(Boolean).join('\n\n')
}

function assembleBibleMarkdown(input: {
  context: Record<string, unknown>
  upstream: Record<string, unknown>
  configuredSections: Array<{ key: string; title: string; description: string; order: number }>
  outputKind?: string
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const title = titleFromContext(input.context)
  const subtitle = readText(wiki.logline) || readText(wiki.synopsis)
  const documentLabel = input.outputKind === 'lore_guide'
    ? 'Lore Guide'
    : input.outputKind === 'character_dossier_pack'
      ? 'Character Dossier Pack'
      : input.outputKind === 'world_reference_document'
        ? 'Reference Guide'
        : 'Story Bible'
  const sectionRecords = Object.values(input.upstream)
    .map(asRecord)
    .filter((output) => readText(output.sectionKey) || readText(output.markdown) || readText(output.text))
    .map((output) => ({
      sectionKey: readText(output.sectionKey),
      sectionTitle: readText(output.sectionTitle),
      sectionOrder: Number(output.sectionOrder ?? 9999) || 9999,
      markdown: readText(output.markdown) || readText(output.text),
    }))
    .filter((section) => section.markdown)
  const configuredOrder = new Map(input.configuredSections.map((section) => [section.key, section.order]))
  sectionRecords.sort((left, right) => {
    const leftOrder = configuredOrder.get(left.sectionKey) ?? left.sectionOrder
    const rightOrder = configuredOrder.get(right.sectionKey) ?? right.sectionOrder
    return leftOrder - rightOrder || left.sectionTitle.localeCompare(right.sectionTitle)
  })
  return [
    `# ${title} ${documentLabel}`,
    subtitle ? `> ${subtitle}` : '',
    '',
    '## About This Reference',
    'This document summarizes the current GraphCore world canon for writing, art direction, comics, video, and continuity work. Sections marked "Not yet defined in canon" are gaps in the source graph rather than new canon.',
    '',
    ...sectionRecords.map((section) => section.markdown),
  ].filter(Boolean).join('\n\n')
}

const comicSceneScriptJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'premise', 'sequenceOutcome', 'canonConstraints', 'characters', 'dramaticBeats', 'visualMoments', 'dialogueBeats', 'emotionalTurns'],
  properties: {
    title: { type: 'string' },
    premise: { type: 'string' },
    sequenceOutcome: { type: 'string' },
    canonConstraints: { type: 'array', items: { type: 'string' } },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'name', 'want', 'pressure', 'visualContinuity'],
        properties: {
          key: { type: 'string' },
          name: { type: 'string' },
          want: { type: 'string' },
          pressure: { type: 'string' },
          visualContinuity: { type: 'string' },
        },
      },
    },
    dramaticBeats: {
      type: 'array',
      minItems: 5,
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['beatNumber', 'function', 'action', 'conflict', 'turn', 'consequence', 'requiredEntityKeys'],
        properties: {
          beatNumber: { type: 'integer', minimum: 1, maximum: 24 },
          function: { type: 'string' },
          action: { type: 'string' },
          conflict: { type: 'string' },
          turn: { type: 'string' },
          consequence: { type: 'string' },
          requiredEntityKeys: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    visualMoments: { type: 'array', items: { type: 'string' } },
    dialogueBeats: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['speaker', 'intent', 'sampleLine'],
        properties: {
          speaker: { type: 'string' },
          intent: { type: 'string' },
          sampleLine: { type: 'string' },
        },
      },
    },
    emotionalTurns: { type: 'array', items: { type: 'string' } },
  },
}

const comicPagePlanJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'pageCount', 'pages'],
  properties: {
    title: { type: 'string' },
    pageCount: { type: 'integer', minimum: 1, maximum: 12 },
    pages: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pageNumber', 'storyFunction', 'includedBeats', 'omittedOrMergedBeats', 'pageTurn', 'setting', 'requiredEntityKeys', 'panelBudget', 'dialogueCaptionIntent'],
        properties: {
          pageNumber: { type: 'integer', minimum: 1, maximum: 12 },
          storyFunction: { type: 'string' },
          includedBeats: { type: 'array', items: { type: 'string' } },
          omittedOrMergedBeats: { type: 'array', items: { type: 'string' } },
          pageTurn: { type: 'string' },
          setting: { type: 'string' },
          requiredEntityKeys: { type: 'array', items: { type: 'string' } },
          panelBudget: { type: 'integer', minimum: 3, maximum: 6 },
          dialogueCaptionIntent: { type: 'string' },
        },
      },
    },
  },
}

const comicScriptJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'logline', 'pageCount', 'pages'],
  properties: {
    title: { type: 'string' },
    logline: { type: 'string' },
    pageCount: { type: 'integer', minimum: 1, maximum: 12 },
    pages: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pageNumber', 'panelLayout', 'setting', 'mood', 'requiredEntityKeys', 'continuityNotes', 'panels'],
        properties: {
          pageNumber: { type: 'integer', minimum: 1, maximum: 12 },
          panelLayout: { type: 'string' },
          setting: { type: 'string' },
          mood: { type: 'string' },
          requiredEntityKeys: { type: 'array', items: { type: 'string' } },
          continuityNotes: { type: 'string' },
          panels: {
            type: 'array',
            minItems: 3,
            maxItems: 6,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['panelNumber', 'shot', 'action', 'dialogue', 'caption', 'characters'],
              properties: {
                panelNumber: { type: 'integer', minimum: 1, maximum: 6 },
                shot: { type: 'string' },
                action: { type: 'string' },
                dialogue: { type: 'string' },
                caption: { type: 'string' },
                characters: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
}

function isDirectReferenceUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value)
}

function isProjectAssetStoragePath(value: string) {
  return /^generated\//i.test(value) || /^uploads\//i.test(value) || /^project-assets\//i.test(value)
}

function mimeTypeForStoragePath(storagePath: string) {
  const lower = storagePath.toLowerCase()
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.mp4')) return 'video/mp4'
  return 'image/png'
}

function referenceValuePriority(value: string) {
  const lower = value.toLowerCase()
  if (lower.includes('entity-reference-sheet') || lower.includes('entity_reference_sheet')) return 0
  if (lower.includes('reference-sheet') || lower.includes('reference_sheet')) return 1
  if (lower.includes('world_icon') || lower.includes('world-icons')) return 8
  if (lower.includes('icon')) return 7
  return 3
}

function sortReferenceValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => {
      const priorityDelta = referenceValuePriority(left) - referenceValuePriority(right)
      if (priorityDelta !== 0) return priorityDelta
      return left.localeCompare(right)
    })
}

function selectedReferenceVariantAssetKeyForEntity(entity: Record<string, unknown>) {
  const metadata = asRecord(entity.metadata)
  return readText(metadata.selectedReferenceVariantAssetKey)
    || readText(entity.selectedReferenceVariantAssetKey)
}

function sortReferenceValuesWithPrimary(values: string[], primaryAssetKey = '') {
  const primary = primaryAssetKey.trim()
  const sorted = sortReferenceValues(values)
  if (!primary) return sorted
  return [primary, ...sorted.filter((value) => value !== primary)]
}

function entityAssetKeys(entity: Record<string, unknown>, assets: Record<string, unknown>[]) {
  const metadata = asRecord(entity.metadata)
  const referenceVariants = Array.isArray(metadata.referenceVariants)
    ? metadata.referenceVariants.map(asRecord)
    : Array.isArray(entity.referenceVariants)
      ? entity.referenceVariants.map(asRecord)
      : []
  const selectedReferenceVariantAssetKey = selectedReferenceVariantAssetKeyForEntity(entity)
  const variantAssetKeys = referenceVariants
    .map((variant) => readText(variant.assetKey))
    .filter(Boolean)
  const keys = [
    selectedReferenceVariantAssetKey,
    readText(metadata.referenceSheetAssetKey),
    ...readStringArray(metadata.referenceSheetAssetKeys),
    ...variantAssetKeys,
    readText(metadata.referenceSheetUrl),
    readText(metadata.referenceSheetImageUrl),
    readText(metadata.referenceSheetStoragePath),
    readText(metadata.imageUrl),
    readText(metadata.image_url),
    readText(metadata.sourceUrl),
    readText(metadata.sourceAssetUrl),
    readText(entity.imageUrl),
    readText(entity.image_url),
    readText(entity.sourceUrl),
    readText(entity.source_url),
    readText(entity.thumbnailAssetKey),
    readText(entity.thumbnail_asset_key),
    readText(metadata.brandAtlasAssetKey),
    readText(metadata.assetKey),
    readText(metadata.storagePath),
  ].filter(Boolean)
  const matching = assets
    .filter((asset) => keys.includes(readText(asset.key)))
    .map((asset) => readText(asset.key))
  return sortReferenceValuesWithPrimary([...keys, ...matching], selectedReferenceVariantAssetKey)
}

const referenceVariantStopWords = new Set([
  'about',
  'after',
  'again',
  'asset',
  'character',
  'default',
  'entity',
  'from',
  'generate',
  'guidance',
  'image',
  'inside',
  'into',
  'look',
  'make',
  'reference',
  'sheet',
  'shot',
  'that',
  'their',
  'them',
  'this',
  'variant',
  'visual',
  'with',
])

const referenceVariantCueWords = new Set([
  'armor',
  'armour',
  'blue',
  'cafe',
  'cape',
  'chamber',
  'costume',
  'dress',
  'gear',
  'gold',
  'green',
  'hall',
  'hat',
  'inside',
  'interior',
  'market',
  'military',
  'outfit',
  'pact',
  'red',
  'robe',
  'room',
  'samurai',
  'silver',
  'suit',
  'temple',
  'uniform',
  'wearing',
  'wears',
  'within',
])

function normalizeReferenceVariantText(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function referenceVariantAssetKey(variant: Record<string, unknown>) {
  return readText(variant.assetKey) || readText(variant.asset_key)
}

function referenceVariantStatus(variant: Record<string, unknown>) {
  return readText(variant.status).toLowerCase()
}

function referenceVariantHasUsableAsset(variant: Record<string, unknown>) {
  if (!referenceVariantAssetKey(variant)) return false
  const status = referenceVariantStatus(variant)
  return !['failed', 'cancelled', 'deleted', 'queued', 'pending', 'running'].includes(status)
}

function referenceVariantCandidatePhrases(variant: Record<string, unknown>) {
  return [
    readText(variant.variantKey),
    readText(variant.variant_key),
    readText(variant.label),
    readText(variant.summary),
    readText(variant.guidance),
    readText(variant.variantType),
    readText(variant.variant_type),
  ]
    .map(normalizeReferenceVariantText)
    .filter((value) => value.length >= 3)
}

function referenceVariantWords(variant: Record<string, unknown>) {
  return [...new Set(referenceVariantCandidatePhrases(variant)
    .flatMap((phrase) => phrase.split(' '))
    .filter((word) => word.length >= 3 && !referenceVariantStopWords.has(word)))]
}

function referenceVariantMatchScore(variant: Record<string, unknown>, prompt: string) {
  const haystack = normalizeReferenceVariantText(prompt)
  if (!haystack) return 0
  let score = 0
  for (const phrase of referenceVariantCandidatePhrases(variant)) {
    if (phrase.length >= 4 && haystack.includes(phrase)) score += phrase.split(' ').length > 1 ? 80 : 40
  }
  for (const word of referenceVariantWords(variant)) {
    if (haystack.split(' ').includes(word) || haystack.includes(word)) score += word.length <= 3 ? 8 : 12
  }
  return score
}

function referenceVariantMatchesPrompt(variant: Record<string, unknown>, prompt: string) {
  return referenceVariantMatchScore(variant, prompt) > 0
}

function promptHasReferenceVariantCue(prompt: string) {
  const words = normalizeReferenceVariantText(prompt).split(' ').filter(Boolean)
  return words.some((word) => referenceVariantCueWords.has(word))
}

function selectReferenceVariantForPromptDetailed(variants: Record<string, unknown>[], prompt: string, entityKey = '') {
  const scored = variants
    .map((variant) => ({
      variant,
      score: referenceVariantMatchScore(variant, prompt),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return readText(left.variant.label).localeCompare(readText(right.variant.label))
    })

  const diagnostics: string[] = []
  const completed = scored.find((entry) => referenceVariantHasUsableAsset(entry.variant))
  if (completed) {
    return {
      selectedVariant: completed.variant,
      reason: 'variant_match',
      diagnostics,
    }
  }

  const matchedUnavailable = scored[0]?.variant
  if (matchedUnavailable) {
    const key = readText(matchedUnavailable.variantKey) || readText(matchedUnavailable.variant_key)
    const status = referenceVariantStatus(matchedUnavailable)
    diagnostics.push(`${status === 'queued' || status === 'running' || status === 'pending' ? 'variant_pending' : 'variant_unavailable'}:${entityKey}:${key || 'unknown'}`)
  } else if (variants.length > 0 && promptHasReferenceVariantCue(prompt)) {
    diagnostics.push(`variant_not_found:${entityKey}`)
  }

  return {
    selectedVariant: null,
    reason: 'default',
    diagnostics,
  }
}

function selectReferenceVariantForPrompt(variants: Record<string, unknown>[], prompt: string) {
  return selectReferenceVariantForPromptDetailed(variants, prompt).selectedVariant
}

function defaultReferenceAssetKeyForEntity(entity: Record<string, unknown>, assets: Record<string, unknown>[]) {
  const metadata = asRecord(entity.metadata)
  const keys = [
    readText(metadata.referenceSheetAssetKey),
    ...readStringArray(metadata.referenceSheetAssetKeys),
    readText(metadata.referenceSheetUrl),
    readText(metadata.referenceSheetImageUrl),
    readText(metadata.referenceSheetStoragePath),
    readText(metadata.imageUrl),
    readText(metadata.image_url),
    readText(metadata.sourceUrl),
    readText(metadata.sourceAssetUrl),
    readText(entity.imageUrl),
    readText(entity.image_url),
    readText(entity.sourceUrl),
    readText(entity.source_url),
    readText(entity.thumbnailAssetKey),
    readText(entity.thumbnail_asset_key),
    readText(metadata.assetKey),
    readText(metadata.storagePath),
  ].filter(Boolean)
  const matching = assets
    .filter((asset) => keys.includes(readText(asset.key)))
    .map((asset) => readText(asset.key))
  return sortReferenceValues([...keys, ...matching])[0] ?? ''
}

function resolveImageOutputReferenceSelection(entity: Record<string, unknown>, assets: Record<string, unknown>[], prompt: string) {
  const metadata = asRecord(entity.metadata)
  const entityKey = readText(entity.key)
  const referenceVariants = Array.isArray(metadata.referenceVariants)
    ? metadata.referenceVariants.map(asRecord)
    : Array.isArray(entity.referenceVariants)
      ? entity.referenceVariants.map(asRecord)
      : []
  const selected = selectReferenceVariantForPromptDetailed(referenceVariants, prompt, entityKey)
  const selectedVariant = selected.selectedVariant
  const selectedVariantAssetKey = selectedVariant ? referenceVariantAssetKey(selectedVariant) : ''
  const defaultAssetKey = defaultReferenceAssetKeyForEntity(entity, assets)
  const primaryAssetKey = selectedVariantAssetKey || defaultAssetKey
  const selectedReferenceVariantKey = selectedVariant
    ? readText(selectedVariant.variantKey) || readText(selectedVariant.variant_key)
    : 'default'
  return {
    primaryAssetKey,
    selectedReferenceVariantKey,
    selectedReferenceVariantAssetKey: selectedVariantAssetKey,
    selectedReferenceVariantLabel: selectedVariant ? readText(selectedVariant.label) || selectedReferenceVariantKey : 'Default',
    selectedReferenceVariantSummary: selectedVariant ? readText(selectedVariant.summary) : '',
    selectedReferenceVariantType: selectedVariant ? readText(selectedVariant.variantType) || readText(selectedVariant.variant_type) : 'default',
    referenceSelectionReason: selected.reason,
    referenceDiagnostics: primaryAssetKey ? selected.diagnostics : [...selected.diagnostics, `missing_reference:${entityKey}`],
    referenceVariants,
  }
}

function buildDeterministicComicAssetPack(context: Record<string, unknown>) {
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  const assets = Array.isArray(context.assets) ? context.assets.map(asRecord) : []
  const packedEntities = entities.slice(0, 16).map((entity) => {
    const metadata = asRecord(entity.metadata)
    const referenceVariants = Array.isArray(metadata.referenceVariants)
      ? metadata.referenceVariants.map(asRecord)
      : Array.isArray(entity.referenceVariants)
        ? entity.referenceVariants.map(asRecord)
        : []
    const selectedReferenceVariantKey = readText(metadata.selectedReferenceVariantKey) || readText(entity.selectedReferenceVariantKey) || 'default'
    const selectedVariant = selectedReferenceVariantKey && selectedReferenceVariantKey !== 'default'
      ? referenceVariants.find((variant) => {
        const key = readText(variant.variantKey) || readText(variant.variant_key)
        return key === selectedReferenceVariantKey
      }) ?? null
      : null
    const selectedReferenceVariantAssetKey = selectedVariant
      ? referenceVariantAssetKey(selectedVariant) || selectedReferenceVariantAssetKeyForEntity(entity)
      : ''
    const assetKeys = entityAssetKeys(entity, assets)
    const primaryAssetKey = selectedReferenceVariantAssetKey || assetKeys[0] || ''
    return {
      key: readText(entity.key),
      name: readText(entity.name),
      type: readText(entity.nodeType ?? entity.node_type),
      role: readText(entity.nodeType ?? entity.node_type),
      summary: readText(entity.summary),
      visualDescription: readOutputEntityVisualDescription(entity),
      visualTraits: readOutputEntityVisualTraits(entity),
      visualTraitMap: readOutputEntityVisualTraitMap(entity),
      voice: readOutputEntityVoiceIdentity(entity),
      voiceDescription: readOutputEntityVoiceDescription(entity),
      referenceVariants,
      selectedReferenceVariantKey,
      selectedReferenceVariantLabel: selectedVariant ? readText(selectedVariant.label) || selectedReferenceVariantKey : 'Default',
      selectedReferenceVariantSummary: selectedVariant ? readText(selectedVariant.summary) : '',
      selectedReferenceVariantType: selectedVariant ? readText(selectedVariant.variantType) || readText(selectedVariant.variant_type) : 'default',
      selectedReferenceVariantAssetKey,
      primaryAssetKey,
      assetKeys: sortReferenceValuesWithPrimary(assetKeys, primaryAssetKey),
    }
  }).filter((entity) => entity.key || entity.name)
  return {
    entities: packedEntities,
    selectedReferenceVariants: packedEntities
      .filter((entity) => readText(entity.selectedReferenceVariantKey) && readText(entity.selectedReferenceVariantKey) !== 'default')
      .map((entity) => ({
        entityKey: entity.key,
        entityName: entity.name,
        variantKey: entity.selectedReferenceVariantKey,
        label: entity.selectedReferenceVariantLabel,
        summary: entity.selectedReferenceVariantSummary,
        variantType: entity.selectedReferenceVariantType,
        assetKey: entity.selectedReferenceVariantAssetKey,
      })),
    missingReferenceEntityKeys: packedEntities.filter((entity) => entity.assetKeys.length === 0).map((entity) => entity.key),
  }
}

async function refreshWorldContextVisualReferences(client: DatabaseClient, run: OutputWorkflowRun, context: Record<string, unknown>) {
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  if (entities.length === 0) return context
  const entityKeys = [...new Set(entities.map((entity) => readText(entity.key)).filter(Boolean))]
  if (entityKeys.length === 0) return context

  const latestResponse = await client
    .from('world_entities')
    .select('key, thumbnail_asset_key, metadata, updated_at')
    .eq('draft_id', run.draftId)
    .in('key', entityKeys)
  const latestRows = latestResponse.error ? [] : (latestResponse.data ?? []).map(asRecord)
  const latestByKey = new Map(latestRows.map((row) => [readText(row.key), row]).filter(([key]) => key))
  const variantResponse = await client
    .from('world_entity_visual_variants')
    .select('entity_key, variant_key, label, summary, variant_type, asset_key, guidance, status, metadata')
    .eq('draft_id', run.draftId)
    .in('entity_key', entityKeys)
  const variantsByEntityKey = new Map<string, Record<string, unknown>[]>()
  if (!variantResponse.error) {
    for (const row of variantResponse.data ?? []) {
      const record = asRecord(row)
      const entityKey = readText(record.entity_key)
      if (!entityKey) continue
      const entry = {
        variantKey: readText(record.variant_key),
        label: readText(record.label),
        summary: readText(record.summary),
        variantType: readText(record.variant_type),
        assetKey: readText(record.asset_key),
        guidance: readText(record.guidance),
        status: readText(record.status),
        metadata: asRecord(record.metadata),
      }
      variantsByEntityKey.set(entityKey, [...(variantsByEntityKey.get(entityKey) ?? []), entry])
    }
  }
  const refreshedEntities = entities.map((entity) => {
    const key = readText(entity.key)
    const latest = latestByKey.get(key)
    const variants = variantsByEntityKey.get(key) ?? []
    const selectedVariant = selectReferenceVariantForPrompt(variants, run.prompt)
    if (!latest && variants.length === 0) return entity
    const entityMetadata = asRecord(entity.metadata)
    const latestMetadata = asRecord(latest?.metadata)
    const latestThumbnail = readText(latest?.thumbnail_asset_key)
    return {
      ...entity,
      thumbnailAssetKey: latestThumbnail || readText(entity.thumbnailAssetKey),
      thumbnail_asset_key: latestThumbnail || readText(entity.thumbnail_asset_key),
      metadata: {
        ...entityMetadata,
        ...latestMetadata,
        referenceVariants: variants,
        selectedReferenceVariantKey: selectedVariant ? readText(selectedVariant.variantKey) : 'default',
        selectedReferenceVariantAssetKey: selectedVariant ? readText(selectedVariant.assetKey) : '',
      },
      referenceVariants: variants,
      selectedReferenceVariantKey: selectedVariant ? readText(selectedVariant.variantKey) : 'default',
      selectedReferenceVariantAssetKey: selectedVariant ? readText(selectedVariant.assetKey) : '',
      updatedAt: readText(latest?.updated_at) || readText(entity.updatedAt),
      updated_at: readText(latest?.updated_at) || readText(entity.updated_at),
    }
  })

  const existingAssets = Array.isArray(context.assets) ? context.assets.map(asRecord) : []
  const existingAssetKeys = new Set(existingAssets.map((asset) => readText(asset.key)).filter(Boolean))
  const referencedAssetKeys = refreshedEntities
    .flatMap((entity) => entityAssetKeys(entity, existingAssets))
    .filter((value) => value && !isDirectReferenceUrl(value) && !isProjectAssetStoragePath(value) && !existingAssetKeys.has(value))
  const missingAssetKeys = [...new Set(referencedAssetKeys)]
  let hydratedAssets: Record<string, unknown>[] = []
  if (missingAssetKeys.length > 0) {
    const assetResponse = await client
      .from('project_assets')
      .select('key, name, kind, mime_type, storage_path, metadata')
      .eq('project_id', run.projectId)
      .in('key', missingAssetKeys)
    hydratedAssets = assetResponse.error
      ? []
      : (assetResponse.data ?? []).map((asset) => ({
        key: readText(asRecord(asset).key),
        name: readText(asRecord(asset).name),
        kind: readText(asRecord(asset).kind),
        mimeType: readText(asRecord(asset).mime_type),
        mime_type: readText(asRecord(asset).mime_type),
        storagePath: readText(asRecord(asset).storage_path),
        storage_path: readText(asRecord(asset).storage_path),
        metadata: asRecord(asRecord(asset).metadata),
      }))
  }

  return {
    ...context,
    entities: refreshedEntities,
    assets: [...existingAssets, ...hydratedAssets],
    refreshedVisualReferences: true,
    refreshedVisualReferenceAssetKeys: hydratedAssets.map((asset) => readText(asset.key)).filter(Boolean),
  }
}

function buildOutputReferenceSelectionSnapshot(outputs: unknown) {
  const record = asRecord(outputs)
  const assetPackCandidate = asRecord(record.assetPack)
  const assetPack = Object.keys(assetPackCandidate).length > 0 ? assetPackCandidate : asRecord(record.asset_pack)
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  if (entities.length === 0) return null
  const selectedReferenceVariants = entities
    .filter((entity) => {
      const selectedKey = readText(entity.selectedReferenceVariantKey)
      return selectedKey && selectedKey !== 'default'
    })
    .map((entity) => ({
      entityKey: readText(entity.key),
      entityName: readText(entity.name),
      variantKey: readText(entity.selectedReferenceVariantKey),
      label: readText(entity.selectedReferenceVariantLabel) || readText(entity.selectedReferenceVariantKey),
      summary: readText(entity.selectedReferenceVariantSummary),
      variantType: readText(entity.selectedReferenceVariantType),
      assetKey: readText(entity.selectedReferenceVariantAssetKey) || readText(entity.primaryAssetKey) || readStringArray(entity.assetKeys)[0] || '',
    }))
    .filter((entry) => entry.entityKey && entry.variantKey)
  return {
    source: 'workflow_reference_selection',
    updatedAt: new Date().toISOString(),
    selectedEntityKeys: entities.map((entity) => readText(entity.key)).filter(Boolean),
    selectedReferenceVariants,
    entities: entities.map((entity) => ({
      key: readText(entity.key),
      name: readText(entity.name),
      type: readText(entity.type) || readText(entity.role),
      summary: readText(entity.summary),
      primaryAssetKey: readText(entity.primaryAssetKey) || readStringArray(entity.assetKeys)[0] || '',
      assetKeys: readStringArray(entity.assetKeys).slice(0, 4),
      selectedReferenceVariantKey: readText(entity.selectedReferenceVariantKey) || 'default',
      selectedReferenceVariantLabel: readText(entity.selectedReferenceVariantLabel) || (readText(entity.selectedReferenceVariantKey) === 'default' ? 'Default' : readText(entity.selectedReferenceVariantKey)),
      selectedReferenceVariantSummary: readText(entity.selectedReferenceVariantSummary),
      selectedReferenceVariantType: readText(entity.selectedReferenceVariantType),
      selectedReferenceVariantAssetKey: readText(entity.selectedReferenceVariantAssetKey),
    })),
  }
}

async function persistOutputRequestReferenceSelection(client: DatabaseClient, run: OutputWorkflowRun, outputs: unknown) {
  const snapshot = buildOutputReferenceSelectionSnapshot(outputs)
  if (!snapshot) return
  const requestResponse = await client
    .from('output_requests')
    .select('id, metadata')
    .eq('draft_id', run.draftId)
    .eq('workflow_id', run.workflowId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (requestResponse.error || !requestResponse.data) return
  const requestRow = asRecord(requestResponse.data)
  const requestId = readText(requestRow.id)
  if (!requestId) return
  const metadata = asRecord(requestRow.metadata)
  const updateResponse = await client
    .from('output_requests')
    .update({
      metadata: {
        ...metadata,
        outputReferenceSelection: snapshot,
      },
    })
    .eq('id', requestId)
  if (updateResponse.error) throw new Error(updateResponse.error.message)
  await client.rpc('refresh_output_request_status_projection', { p_request_id: requestId })
}

async function persistSequenceAnimaticContinuityRequestState(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  artifactKey: string
  continuityPack: Record<string, unknown>
  blockStates: Record<string, unknown>
  pendingDeltas: Record<string, unknown>
}) {
  const requestResponse = await input.client
    .from('output_requests')
    .select('id, metadata')
    .eq('draft_id', input.run.draftId)
    .eq('workflow_id', input.workflow.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (requestResponse.error) throw new Error(requestResponse.error.message)
  if (!requestResponse.data) return

  const requestRow = asRecord(requestResponse.data)
  const requestId = readText(requestRow.id)
  if (!requestId) return

  const metadata = asRecord(requestRow.metadata)
  const mergedBlockStates = {
    ...asRecord(metadata.blockStates),
    ...input.blockStates,
  }
  const continuityGraphStatus = readText(input.continuityPack.continuityGraphStatus ?? input.continuityPack.continuity_graph_status)
  const assetGenerationStatus = readText(input.continuityPack.assetGenerationStatus ?? input.continuityPack.asset_generation_status)
  const globalStructureState = asRecord(input.continuityPack.globalStructureState ?? input.continuityPack.global_structure_state)
  const coverage = asRecord(input.continuityPack.coverage)
  const updateResponse = await input.client
    .from('output_requests')
    .update({
      metadata: {
        ...metadata,
        screenplayAnimaticRole: readText(metadata.screenplayAnimaticRole) || 'continuity_pack',
        sequenceAnimaticRole: readText(metadata.sequenceAnimaticRole) || 'continuity_pack',
        blockStates: mergedBlockStates,
        pendingDeltas: input.pendingDeltas,
        globalStructureState: Object.keys(globalStructureState).length > 0 ? globalStructureState : asRecord(metadata.globalStructureState),
        continuityCoverage: Object.keys(coverage).length > 0 ? coverage : asRecord(metadata.continuityCoverage),
        continuityGraphStatus: continuityGraphStatus || sequenceAnimaticContinuityGraphStatusFromBlockStates(mergedBlockStates),
        continuityPackHash: readText(input.continuityPack.continuityPackHash),
        assetGenerationStatus: assetGenerationStatus || readText(metadata.assetGenerationStatus) || 'none',
        lastContinuityStructureArtifactKey: input.artifactKey,
        continuityStructureUpdatedAt: new Date().toISOString(),
      },
    })
    .eq('id', requestId)
  if (updateResponse.error) throw new Error(updateResponse.error.message)
  await input.client.rpc('refresh_output_request_status_projection', { p_request_id: requestId })
}

async function persistSequenceAnimaticDirectorPlanRequestState(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  artifactKey: string
  directorPlan: Record<string, unknown>
}) {
  const requestResponse = await input.client
    .from('output_requests')
    .select('id, project_id, draft_id, metadata')
    .eq('draft_id', input.run.draftId)
    .eq('workflow_id', input.workflow.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (requestResponse.error) throw new Error(requestResponse.error.message)
  if (!requestResponse.data) return

  const requestRow = asRecord(requestResponse.data)
  const requestId = readText(requestRow.id)
  if (!requestId) return

  const metadata = asRecord(requestRow.metadata)
  const updateResponse = await input.client
    .from('output_requests')
    .update({
      metadata: {
        ...metadata,
        screenplayAnimaticRole: readText(metadata.screenplayAnimaticRole) || 'master',
        sequenceAnimaticRole: readText(metadata.sequenceAnimaticRole) || 'master',
        graphSpecVersion: 'sequence_animatic_graph_v2',
        directorPlanStatus: 'ready',
        shotContinuityPlanStatus: 'ready',
        directorPlanHash: readText(input.directorPlan.shotPlanHash) || hashOutputWorkflowValue(input.directorPlan),
        shotContinuityPlanHash: readText(input.directorPlan.shotPlanHash) || hashOutputWorkflowValue(input.directorPlan),
        directorPlanArtifactKey: input.artifactKey,
        shotContinuityPlanArtifactKey: input.artifactKey,
        directorPlanUpdatedAt: new Date().toISOString(),
        shotContinuityPlanUpdatedAt: new Date().toISOString(),
      },
    })
    .eq('id', requestId)
  if (updateResponse.error) throw new Error(updateResponse.error.message)

  const events: Record<string, unknown>[] = []
  let sequence = 1
  events.push({
    project_id: input.run.projectId,
    draft_id: input.run.draftId,
    request_id: requestId,
    workflow_id: input.workflow.id,
    run_id: input.run.id,
    sequence: sequence++,
      event_type: 'director_plan_ready',
      payload: {
        shotCount: readArray(input.directorPlan.shots).length,
        blockCount: readArray(input.directorPlan.blocks).length,
        assetRequirementCount: readArray(input.directorPlan.assetRequirements).length,
        shotPlanHash: readText(input.directorPlan.shotPlanHash),
        shotContinuityPlanHash: readText(input.directorPlan.shotPlanHash),
      },
    metadata: { source: 'sequence_animatic_director_plan' },
  })
  for (const block of readArray(input.directorPlan.blocks).map(asRecord)) {
    events.push({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      request_id: requestId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      sequence: sequence++,
      event_type: 'block_planned',
      payload: {
        blockId: readText(block.id),
        index: Number(block.index ?? 0) || null,
        title: readText(block.title),
        summary: readText(block.summary),
        shotIds: readStringArray(block.shotIds),
        status: readText(block.status) || 'planned',
      },
      metadata: { source: 'sequence_animatic_director_plan' },
    })
  }
  for (const shot of readArray(input.directorPlan.shots).map(asRecord)) {
    const shotId = readText(shot.id)
    events.push({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      request_id: requestId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      sequence: sequence++,
      event_type: 'shot_registered',
      payload: {
        shotId,
        index: Number(shot.index ?? 0) || null,
        storyboardBlockId: readText(shot.storyboardBlockId),
        title: readText(shot.title),
        action: compactSequenceAnimaticText(shot.action ?? shot.description, 600),
        visibleCharacterRefIds: readStringArray(shot.visibleCharacterRefIds ?? shot.visible_character_ref_ids),
        speakerRefIds: readStringArray(shot.speakerRefIds ?? shot.speaker_ref_ids),
        propRefIds: readStringArray(shot.propRefIds ?? shot.prop_ref_ids),
        locationRefIds: readStringArray(shot.locationRefIds ?? shot.location_ref_ids),
        sceneGraphBinding: asRecord(shot.sceneGraphBinding ?? shot.scene_graph_binding),
        assetRequirements: readArray(shot.assetRequirements ?? shot.asset_requirements).map(asRecord),
      },
      metadata: { source: 'sequence_animatic_director_plan' },
    })
  }
  const graph = asRecord(input.directorPlan.continuityGraphV2 ?? input.directorPlan.continuity_graph_v2)
  const graphNodes = [
    ...readArray(graph.locationSets).map(asRecord).map((entry) => ({ ...entry, graphNodeKind: 'location_set' })),
    ...readArray(graph.zones).map(asRecord).map((entry) => ({ ...entry, graphNodeKind: 'zone' })),
    ...readArray(graph.spots).map(asRecord).map((entry) => ({ ...entry, graphNodeKind: 'spot' })),
    ...readArray(graph.angles).map(asRecord).map((entry) => ({ ...entry, graphNodeKind: 'angle' })),
    ...readArray(graph.assetAnchors).map(asRecord).map((entry) => ({ ...entry, graphNodeKind: readText(entry.type) || 'asset_anchor' })),
  ]
  for (const node of graphNodes.slice(0, 200)) {
    events.push({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      request_id: requestId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      sequence: sequence++,
      event_type: 'scene_graph_node_registered',
      payload: {
        nodeId: readText(node.id),
        nodeKind: readText(node.graphNodeKind),
        name: readText(node.name),
        visualBrief: readText(node.visualBrief),
        shotIds: readStringArray(node.shotIds),
        storyboardBlockIds: readStringArray(node.storyboardBlockIds),
      },
      metadata: { source: 'sequence_animatic_director_plan' },
    })
  }
  const eventTypes = ['director_plan_ready', 'block_planned', 'shot_registered', 'scene_graph_node_registered']
  const deleteEvents = await input.client
    .from('output_request_events')
    .delete()
    .eq('request_id', requestId)
    .in('event_type', eventTypes)
  if (deleteEvents.error) throw new Error(deleteEvents.error.message)
  if (events.length > 0) {
    const sequenceResponse = await input.client
      .from('output_request_events')
      .select('sequence')
      .eq('request_id', requestId)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (sequenceResponse.error) throw new Error(sequenceResponse.error.message)
    const sequenceOffset = Number(asRecord(sequenceResponse.data).sequence ?? 0) || 0
    const sequencedEvents = events.map((event, index) => ({
      ...event,
      sequence: sequenceOffset + index + 1,
    }))
    const insertEvents = await input.client
      .from('output_request_events')
      .insert(sequencedEvents)
    if (insertEvents.error) throw new Error(insertEvents.error.message)
  }
  await input.client.rpc('refresh_output_request_status_projection', { p_request_id: requestId })
}

async function insertSequenceAnimaticEvent(input: {
  client: DatabaseClient
  projectId: string
  draftId: string
  requestId: string
  workflowId?: string | null
  runId?: string | null
  eventType: string
  payload?: Record<string, unknown>
  metadata?: Record<string, unknown>
  dedupe?: Record<string, string>
}) {
  if (!input.requestId || !input.eventType) return
  if (input.dedupe && Object.keys(input.dedupe).length > 0) {
    let query = input.client
      .from('output_request_events')
      .delete()
      .eq('request_id', input.requestId)
      .eq('event_type', input.eventType)
    for (const [key, value] of Object.entries(input.dedupe)) {
      if (!value) continue
      query = query.eq(`payload->>${key}`, value)
    }
    const deleteResponse = await query
    if (deleteResponse.error) throw new Error(deleteResponse.error.message)
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latestResponse = await input.client
      .from('output_request_events')
      .select('sequence')
      .eq('request_id', input.requestId)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestResponse.error) throw new Error(latestResponse.error.message)
    const sequence = (Number(asRecord(latestResponse.data).sequence ?? 0) || 0) + 1
    const insertResponse = await input.client
      .from('output_request_events')
      .insert({
        project_id: input.projectId,
        draft_id: input.draftId,
        request_id: input.requestId,
        workflow_id: input.workflowId ?? null,
        run_id: input.runId ?? null,
        sequence,
        event_type: input.eventType,
        payload: input.payload ?? {},
        metadata: input.metadata ?? {},
      })
    if (!insertResponse.error) return
    if (!String(insertResponse.error.message ?? '').includes('output_request_events_request_id_sequence_key') && !String(insertResponse.error.message ?? '').includes('duplicate key')) {
      throw new Error(insertResponse.error.message)
    }
  }
}

async function persistSequenceAnimaticNodeProgressEvent(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  status: 'running' | 'completed' | 'failed'
  outputs?: Record<string, unknown>
  errorMessage?: string | null
}) {
  const config = asRecord(input.node.config)
  const runMetadata = asRecord(input.run.metadata)
  const role = readText(runMetadata.screenplayAnimaticRole) || readText(runMetadata.sequenceAnimaticRole) || readText(config.screenplayAnimaticRole) || readText(config.sequenceAnimaticRole)
  const masterRequestId = readText(runMetadata.masterRequestId) || readText(config.masterRequestId) || readText(runMetadata.parentRequestId) || readText(config.parentRequestId)
  const outputRequestId = readText(runMetadata.outputRequestId) || readText(config.outputRequestId)
  const purpose = readText(config.purpose)
  if (role === 'master' && input.status === 'completed' && (input.node.key === 'cinematic_v3_screenplay_author' || purpose === 'cinematic_v3_screenplay_author')) {
    const requestId = outputRequestId || masterRequestId
    if (!requestId) return
    const outputs = asRecord(input.outputs)
    const screenplayDraft = asRecord(outputs.screenplayDraft ?? outputs.screenplay_draft)
    const scriptContract = readText(asRecord(screenplayDraft.metadata).scriptContract) || readText(outputs.scriptContract ?? outputs.script_contract)
    const scriptShots = readArray(outputs.scriptShots ?? outputs.script_shots)
    const scriptBlocks = readArray(outputs.scriptBlocks ?? outputs.script_blocks)
    if (scriptContract === 'creative_screenplay_v1' || scriptContract === 'scene_tagged_screenplay_v2' || scriptContract === 'creative_scene_screenplay_v3') {
      const screenplayText = readText(outputs.text) || readText(screenplayDraft.screenplayMarkdown)
      const scriptHash = hashOutputWorkflowValue({
        screenplay: screenplayText,
        scriptContract,
      })
      await insertSequenceAnimaticEvent({
        client: input.client,
        projectId: input.run.projectId,
        draftId: input.run.draftId,
        requestId,
        workflowId: input.workflow.id,
        runId: input.run.id,
        eventType: 'screenplay_ready',
        payload: {
          scriptHash,
          scriptContract,
          screenplayLength: screenplayText.length,
          nodeKey: input.node.key,
          status: input.status,
        },
        metadata: { source: 'cinematic_v3_screenplay_author' },
        dedupe: { scriptHash },
      })
      return
    }
    if (scriptShots.length === 0) return
    const scriptHash = hashOutputWorkflowValue({
      screenplay: readText(outputs.text) || readText(screenplayDraft.screenplayMarkdown),
      scriptShots,
      scriptBlocks,
    })
    await insertSequenceAnimaticEvent({
      client: input.client,
      projectId: input.run.projectId,
      draftId: input.run.draftId,
      requestId,
      workflowId: input.workflow.id,
      runId: input.run.id,
      eventType: 'screenplay_shots_ready',
      payload: {
        shotCount: scriptShots.length,
        blockCount: scriptBlocks.length,
        scriptHash,
        nodeKey: input.node.key,
        status: input.status,
      },
      metadata: { source: 'cinematic_v3_screenplay_author' },
      dedupe: { scriptHash },
    })
    return
  }
  if (role === 'continuity_asset_batch') {
    const batchId = readText(runMetadata.continuityBatchId) || readText(config.continuityBatchId)
    if (!masterRequestId || !batchId) return
    const eventType = input.status === 'completed' && (input.node.key === 'continuity_batch_artifact' || purpose === 'sequence_animatic_continuity_batch_artifact')
      ? 'reference_asset_ready'
      : input.status === 'failed'
        ? 'reference_asset_failed'
        : ''
    if (!eventType) return
    const outputs = asRecord(input.outputs)
    const batch = asRecord(outputs.batch ?? config.batch)
    await insertSequenceAnimaticEvent({
      client: input.client,
      projectId: input.run.projectId,
      draftId: input.run.draftId,
      requestId: masterRequestId,
      workflowId: input.workflow.id,
      runId: input.run.id,
      eventType,
      payload: {
        batchRequestId: readText(runMetadata.outputRequestId),
        batchId,
        batchKind: readText(batch.batchKind) || readText(runMetadata.continuityBatchKind),
        targetNodeIds: readStringArray(batch.targetNodeIds),
        required: runMetadata.continuityBatchRequired === true || batch.required === true,
        readyCount: Object.keys(asRecord(outputs.assetStateByNodeId ?? outputs.asset_state_by_node_id)).length,
        nodeKey: input.node.key,
        status: input.status,
        error: input.errorMessage ?? null,
      },
      metadata: { source: 'sequence_animatic_continuity_batch_workflow' },
      dedupe: { batchId, nodeKey: input.node.key, status: input.status },
    })
    return
  }
  if (role !== 'storyboard_block') return
  const storyboardBlockId = readText(runMetadata.storyboardBlockId) || readText(config.storyboardBlockId)
  if (!masterRequestId || !storyboardBlockId) return
  const eventType = input.status === 'running' && input.node.key === 'block_input'
    ? 'block_started'
    : input.status === 'completed' && (input.node.key === 'storyboard_prompt' || purpose === 'cinematic_v3_storyboard_prompt')
      ? 'storyboard_prompt_ready'
      : input.status === 'completed' && (input.node.key === 'storyboard_sheet' || purpose === 'cinematic_v3_storyboard_sheet')
        ? 'storyboard_sheet_ready'
        : input.status === 'completed' && (input.node.key === 'panel_extract' || purpose === 'cinematic_v3_panel_extract')
          ? 'panels_extracted'
          : input.status === 'completed' && (input.node.key === 'artifact' || purpose === 'sequence_animatic_block_artifact')
            ? 'block_ready'
            : input.status === 'failed'
              ? 'block_failed'
              : ''
  if (!eventType) return
  const outputs = asRecord(input.outputs)
  await insertSequenceAnimaticEvent({
    client: input.client,
    projectId: input.run.projectId,
    draftId: input.run.draftId,
    requestId: masterRequestId,
    workflowId: input.workflow.id,
    runId: input.run.id,
    eventType,
    payload: {
      blockRequestId: readText(runMetadata.outputRequestId),
      storyboardBlockId,
      nodeKey: input.node.key,
      nodeLabel: input.node.label,
      status: input.status,
      panelCount: readArray(outputs.panels).length || readArray(outputs.artifacts).length || null,
      artifactKey: readText(asRecord(outputs.artifact).key) || readText(outputs.artifactKey),
      error: input.errorMessage ?? null,
    },
    metadata: { source: 'sequence_animatic_block_workflow' },
    dedupe: { storyboardBlockId, nodeKey: input.node.key, status: input.status },
  })
}

function readScreenplayAnimaticRoleFromMetadata(metadata: Record<string, unknown>) {
  return readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
}

function readScreenplayAnimaticSourceFromMetadata(metadata: Record<string, unknown>, fallback: 'wiki_sequence_unit' | 'prompt_cinematic' = 'wiki_sequence_unit') {
  const source = readText(metadata.screenplayAnimaticSource)
  return source === 'prompt_cinematic' || source === 'wiki_sequence_unit' ? source : fallback
}

async function startSequenceAnimaticChildRun(input: {
  client: DatabaseClient
  request: OutputRequest
  workflowId: string
  runIntent: 'prepare_storyboard_block' | 'generate_continuity_asset' | 'generate_scene_shot_plan' | 'generate_keyframes'
  targetNodeKeys: string[]
}) {
  return startSequenceAnimaticChildRunRuntime({
    request: input.request,
    workflowId: input.workflowId,
    runIntent: input.runIntent,
    targetNodeKeys: input.targetNodeKeys,
    helpers: {
      asRecord,
      readText,
      readArray,
      readStringArray,
      slugify,
      titleFromRefLike,
      readScreenplayAnimaticRoleFromMetadata,
      buildOutputWorkflowInputFingerprint,
      loadLatestRunStatus: async ({ runId }) => {
        const response = await input.client
          .from('output_workflow_runs')
          .select('id,status')
          .eq('id', runId)
          .maybeSingle()
        if (response.error) throw new Error(response.error.message)
        return readText(asRecord(response.data).status)
      },
      loadContinuityAssetMetadata: async ({ projectId, draftId }) => {
        const response = await input.client
          .from('output_artifacts')
          .select(outputArtifactSelect)
          .eq('project_id', projectId)
          .eq('draft_id', draftId)
          .order('created_at', { ascending: false })
          .limit(500)
        if (response.error) throw new Error(response.error.message)
        return (response.data ?? []).map((row) => asRecord(asRecord(row).metadata))
      },
      loadWorkflowNodeByKey: async ({ workflowId, nodeKey }) => {
        const response = await input.client
          .from('output_workflow_nodes')
          .select(outputWorkflowNodeSelect)
          .eq('workflow_id', workflowId)
          .eq('key', nodeKey)
          .maybeSingle()
        if (response.error) throw new Error(response.error.message)
        return response.data ? mapOutputWorkflowNodeRow(response.data as OutputWorkflowNodeRow) : null
      },
      updateWorkflowNodeConfig: async ({ nodeId, config }) => {
        const response = await input.client
          .from('output_workflow_nodes')
          .update({ config })
          .eq('id', nodeId)
        if (response.error) throw new Error(response.error.message)
      },
      loadWorkflowBundle: async ({ workflowId }) => {
        const [workflowResponse, nodeResponse, edgeResponse] = await Promise.all([
          input.client
            .from('output_workflows')
            .select(outputWorkflowSelect)
            .eq('id', workflowId)
            .single(),
          input.client
            .from('output_workflow_nodes')
            .select(outputWorkflowNodeSelect)
            .eq('workflow_id', workflowId)
            .order('created_at', { ascending: true }),
          input.client
            .from('output_workflow_edges')
            .select(outputWorkflowEdgeSelect)
            .eq('workflow_id', workflowId)
            .order('created_at', { ascending: true }),
        ])
        if (workflowResponse.error || !workflowResponse.data) throw new Error(workflowResponse.error?.message ?? 'Child workflow not found.')
        if (nodeResponse.error) throw new Error(nodeResponse.error.message)
        if (edgeResponse.error) throw new Error(edgeResponse.error.message)
        return {
          workflow: mapOutputWorkflowRow(workflowResponse.data as OutputWorkflowRow),
          nodes: (nodeResponse.data ?? []).map((row) => mapOutputWorkflowNodeRow(row as OutputWorkflowNodeRow)),
          edges: (edgeResponse.data ?? []).map((row) => mapOutputWorkflowEdgeRow(row as OutputWorkflowEdgeRow)),
        }
      },
      insertOutputWorkflowRun: async (runInput) => {
        const response = await input.client
          .from('output_workflow_runs')
          .insert({
            project_id: runInput.projectId,
            draft_id: runInput.draftId,
            workflow_id: runInput.workflowId,
            requested_by: runInput.requestedBy ?? null,
            status: runInput.status,
            preset: runInput.preset,
            prompt: runInput.prompt,
            target_format: runInput.targetFormat ?? null,
            world_snapshot_fingerprint: runInput.worldSnapshotFingerprint,
            input: runInput.runInput,
            metadata: runInput.metadata,
            heartbeat_at: runInput.heartbeatAt,
          })
          .select(outputWorkflowRunSelect)
          .single()
        if (response.error || !response.data) throw new Error(response.error?.message ?? 'Failed to queue child output workflow run.')
        return { id: readText(asRecord(response.data).id) }
      },
      insertOutputWorkflowRunSteps: async ({ steps }) => {
        const response = await input.client
          .from('output_workflow_run_steps')
          .insert(steps.map((step) => ({
            run_id: step.runId,
            workflow_id: step.workflowId,
            node_id: step.nodeId,
            draft_id: step.draftId,
            node_key: step.nodeKey,
            node_type: step.nodeType,
            status: step.status,
            order_index: step.orderIndex,
            label: step.label,
            metadata: step.metadata,
          })))
          .select(outputWorkflowRunStepSelect)
        if (response.error) throw new Error(response.error.message)
      },
      updateOutputRequestForStartedRun: async ({ requestId, runId, metadata }) => {
        const response = await input.client
          .from('output_requests')
          .update({
            latest_run_id: runId,
            status: 'running',
            error_message: null,
            metadata,
          })
          .eq('id', requestId)
        if (response.error) throw new Error(response.error.message)
      },
      refreshOutputRequestStatusProjection: async ({ requestId }) => {
        const response = await input.client.rpc('refresh_output_request_status_projection', { p_request_id: requestId })
        if (response.error) throw new Error(response.error.message)
      },
      notifyWorkerWakeBestEffort: async ({ runId, projectId, draftId }) => {
        await notifyWorkerWakeBestEffort({
          family: 'output_workflow',
          source: 'sequence-animatic-orchestrator',
          runId,
          projectId,
          draftId,
        })
      },
    },
  })
}

/**
 * Ensure one scene shot-plan child workflow per registered scene. Each scene is a
 * self-contained mini animatic (own shot plan, director plan, and manifest); no
 * cross-scene merge exists by design. Shared by the worker auto-start hook and
 * the ensure-sequence-animatic-scene-workflows edge function.
 */
export async function ensureSequenceAnimaticSceneShotPlanWorkflows(input: {
  client: DatabaseClient
  masterRequest: OutputRequest
  scenePackageOutput: Record<string, unknown>
  screenplayText: string
  assetPack: Record<string, unknown>
  context: Record<string, unknown>
  guidance: Record<string, unknown>
  maxShotCount: number
  aspectRatio: string
  resolution: string
  sceneIds?: string[]
}): Promise<OutputRequest[]> {
  return ensureSequenceAnimaticSceneShotPlanWorkflowsRuntime({
    masterRequest: input.masterRequest,
    scenePackageOutput: input.scenePackageOutput,
    screenplayText: input.screenplayText,
    assetPack: input.assetPack,
    context: input.context,
    guidance: input.guidance,
    maxShotCount: input.maxShotCount,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    sceneIds: input.sceneIds,
    helpers: {
      asRecord,
      readText,
      slugify,
      sequenceAnimaticStableHash,
      readScreenplayAnimaticRoleFromMetadata,
      loadChildRequests: async ({ projectId, draftId, parentRequestId }) => {
        const response = await input.client
          .from('output_requests')
          .select(outputRequestSelect)
          .eq('project_id', projectId)
          .eq('draft_id', draftId)
          .eq('parent_request_id', parentRequestId)
          .order('created_at', { ascending: true })
        if (response.error) throw new Error(response.error.message)
        return (response.data ?? []).map((row) => mapOutputRequestRow(row as OutputRequestRow))
      },
      buildSceneShotPlanTemplateGraph: (graphInput) => buildValidatedOutputWorkflowTemplateGraph({
        registry: sequenceAnimaticCommandWorkflowTemplateRegistry,
        templateKey: sequenceAnimaticSceneShotPlansTemplateKey,
        rawInput: graphInput,
      }) as never,
      sceneShotPlansTemplateKey: sequenceAnimaticSceneShotPlansTemplateKey,
      ensureMappedChildWorkflow: async (ensureInput) => {
        const ensured = await ensureMappedChildWorkflow({
          client: input.client,
          projectId: ensureInput.projectId,
          draftId: ensureInput.draftId,
          parentRequestId: ensureInput.parentRequestId,
          role: ensureInput.role,
          identityKey: ensureInput.identityKey,
          identityValue: ensureInput.identityValue,
          workflow: ensureInput.workflow,
          nodes: ensureInput.nodes,
          edges: ensureInput.edges,
          request: ensureInput.request,
        })
        return {
          request: ensured.request,
          created: ensured.created,
          reused: ensured.reused,
        }
      },
    },
  })
}

/**
 * Resolve the manifest + director plan for a sequence-animatic master.
 *
 * Old-style runs registered both on the master workflow. In the per-scene
 * architecture each completed scene child owns its manifest/plan instead, so
 * when the master has none this combines the ready scenes' artifacts at read
 * time (ordered by scene index, ids are scene-scoped and collision-free).
 * Downstream stages (continuity assets, keyframes, storyboards) therefore work
 * over whatever scenes are ready — partial chapters included — without any
 * stored merge step.
 */
export async function resolveSequenceAnimaticCombinedManifest(input: {
  client: DatabaseClient
  masterRequest: OutputRequest
}): Promise<{ manifest: Record<string, unknown>; directorPlan: Record<string, unknown>; manifestArtifactKey: string; readySceneIds: string[] } | null> {
  const childrenResponse = await input.client
    .from('output_requests')
    .select(outputRequestSelect)
    .eq('project_id', input.masterRequest.projectId)
    .eq('draft_id', input.masterRequest.draftId)
    .eq('parent_request_id', input.masterRequest.id)
    .order('created_at', { ascending: true })
  if (childrenResponse.error) throw new Error(childrenResponse.error.message)
  const sceneChildren = (childrenResponse.data ?? []).map(mapOutputRequestRow)
    .filter((child) => readScreenplayAnimaticRoleFromMetadata(asRecord(child.metadata)) === 'scene_shot_plan')
    .filter((child) => child.status === 'completed' && child.workflowId)
    .sort((left, right) => (Number(asRecord(left.metadata).sceneIndex ?? 0) || 9999) - (Number(asRecord(right.metadata).sceneIndex ?? 0) || 9999))
  if (sceneChildren.length === 0) return null
  const workflowIds = sceneChildren.map((child) => child.workflowId).filter((id): id is string => Boolean(id))
  const artifactsResponse = await input.client
    .from('output_artifacts')
    .select(outputArtifactSelect)
    .in('workflow_id', workflowIds)
    .order('created_at', { ascending: false })
  if (artifactsResponse.error) throw new Error(artifactsResponse.error.message)
  const artifactRows = (artifactsResponse.data ?? []).map(asRecord)
  const latestByWorkflowAndRole = new Map<string, Record<string, unknown>>()
  for (const row of artifactRows) {
    const role = readText(asRecord(row.metadata).role)
    const key = `${readText(row.workflow_id)}:${role}`
    if (!latestByWorkflowAndRole.has(key)) latestByWorkflowAndRole.set(key, row)
  }
  const mergeRecordsById = (entries: Record<string, unknown>[]) => {
    const byId = new Map<string, Record<string, unknown>>()
    for (const entry of entries) {
      const id = readText(entry.id)
      if (!id) continue
      byId.set(id, { ...byId.get(id), ...entry })
    }
    return [...byId.values()]
  }
  const blocks: Record<string, unknown>[] = []
  const shots: Record<string, unknown>[] = []
  const planShots: Record<string, unknown>[] = []
  const planBlocks: Record<string, unknown>[] = []
  const coverageSetups: Record<string, unknown>[] = []
  const localReferences: Record<string, unknown>[] = []
  const shotBindings: Record<string, unknown> = {}
  const graphArrays: Record<string, Record<string, unknown>[]> = { sets: [], zones: [], spots: [], viewpoints: [], angles: [], edges: [] }
  const readySceneIds: string[] = []
  const manifestKeys: string[] = []
  let assetPack: Record<string, unknown> = {}
  let blockIndex = 1
  let shotIndex = 1
  for (const child of sceneChildren) {
    const manifestRow = latestByWorkflowAndRole.get(`${child.workflowId}:sequence_animatic_manifest`)
    const planRow = latestByWorkflowAndRole.get(`${child.workflowId}:sequence_animatic_director_plan`)
    const sceneManifest = asRecord(asRecord(manifestRow?.metadata).manifest)
    const scenePlan = asRecord(asRecord(planRow?.metadata).shotContinuityPlan ?? asRecord(planRow?.metadata).directorPlan)
    if (Object.keys(sceneManifest).length === 0) continue
    readySceneIds.push(readText(asRecord(child.metadata).sceneId))
    if (manifestRow) manifestKeys.push(readText(manifestRow.key))
    if (Object.keys(assetPack).length === 0) assetPack = asRecord(sceneManifest.assetPack)
    for (const block of readArray(sceneManifest.blocks).map(asRecord)) {
      blocks.push({ ...block, index: blockIndex })
      blockIndex += 1
    }
    for (const shot of readArray(asRecord(sceneManifest.shotPlan).shots).map(asRecord)) {
      shots.push({ ...shot, index: shotIndex })
      shotIndex += 1
    }
    const planSource = Object.keys(scenePlan).length > 0 ? scenePlan : asRecord(sceneManifest.directorPlan)
    for (const shot of readArray(planSource.shots).map(asRecord)) planShots.push(shot)
    for (const block of readArray(planSource.blocks).map(asRecord)) planBlocks.push(block)
    for (const setup of readArray(planSource.coverageSetups ?? planSource.coverage_setups).map(asRecord)) coverageSetups.push(setup)
    for (const reference of readArray(planSource.localReferences ?? planSource.outputLocalReferences).map(asRecord)) localReferences.push(reference)
    Object.assign(shotBindings, asRecord(planSource.shotBindings ?? planSource.shot_bindings))
    const graph = asRecord(planSource.continuityGraphV2 ?? planSource.continuity_graph_v2 ?? sceneManifest.continuityGraphV2)
    const sceneGraphAdditions = asRecord(planSource.sceneGraphAdditions ?? planSource.scene_graph_additions ?? sceneManifest.sceneGraphAdditions ?? sceneManifest.scene_graph_additions)
    for (const field of Object.keys(graphArrays)) {
      for (const node of readArray(graph[field]).map(asRecord)) graphArrays[field].push(node)
      for (const node of readArray(sceneGraphAdditions[field]).map(asRecord)) graphArrays[field].push(node)
    }
  }
  if (blocks.length === 0 || planShots.length === 0) return null
  const continuityGraphV2 = Object.fromEntries(Object.entries(graphArrays).map(([field, entries]) => [field, mergeRecordsById(entries)]))
  continuityGraphV2.locationSets = mergeRecordsById([
    ...readArray(continuityGraphV2.locationSets).map(asRecord),
    ...readArray(continuityGraphV2.location_sets).map(asRecord),
    ...readArray(continuityGraphV2.sets).map(asRecord),
  ])
  continuityGraphV2.location_sets = continuityGraphV2.locationSets
  const directorPlan = {
    role: 'sequence_animatic_director_plan',
    contractVersion: 'shot_continuity_plan_v2',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'director_plan',
    sequenceAnimaticRole: 'director_plan',
    planningMode: 'per_scene_combined',
    combinedFromSceneIds: readySceneIds,
    shots: planShots.map((shot, index) => ({ ...shot, index: index + 1 })),
    blocks: planBlocks.map((block, index) => ({ ...block, index: index + 1 })),
    coverageSetups: mergeRecordsById(coverageSetups),
    localReferences: mergeRecordsById(localReferences),
    shotBindings,
    shot_bindings: shotBindings,
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
  }
  const manifest = {
    role: 'sequence_animatic_manifest',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    sequenceAnimaticRole: 'master',
    screenplayAnimaticRole: 'master',
    requestId: input.masterRequest.id,
    combinedFromSceneIds: readySceneIds,
    provisionalSceneCoverage: true,
    assetPack,
    selectedReferences: assetPack,
    blocks,
    shotPlan: {
      sceneId: 'sequence_animatic_master',
      shots,
      totalEditorialDurationSeconds: shots.reduce((total, shot) => total + (Number(asRecord(shot).editorialDurationSeconds) || 0), 0),
    },
    directorPlan,
    shotContinuityPlan: directorPlan,
    continuityGraphV2,
    continuity_graph_v2: continuityGraphV2,
    shotBindings,
    shot_bindings: shotBindings,
    diagnostics: [`Combined ${readySceneIds.length} ready scene manifest${readySceneIds.length === 1 ? '' : 's'} at read time (per-scene architecture).`],
  }
  return {
    manifest,
    directorPlan,
    manifestArtifactKey: manifestKeys.join('+') || `combined.${input.masterRequest.id.slice(0, 8)}.scene-manifests`,
    readySceneIds,
  }
}

/**
 * After a sequence-animatic master run completes (scenes registered), ensure the
 * per-scene child workflows exist and auto-start only the first scene; the rest
 * are generated on demand from the UI.
 */
async function maybeStartFirstSequenceAnimaticScene(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  outputsByNodeKey: Record<string, Record<string, unknown>>
}) {
  const registerOutputs = asRecord(input.outputsByNodeKey.sequence_animatic_scene_register)
  if (Object.keys(registerOutputs).length === 0) return null
  const runMetadata = asRecord(input.run.metadata)
  const masterRequestId = readText(runMetadata.outputRequestId) || readText(runMetadata.masterRequestId)
  if (!masterRequestId) return null
  const masterResponse = await input.client
    .from('output_requests')
    .select(outputRequestSelect)
    .eq('id', masterRequestId)
    .single()
  if (masterResponse.error || !masterResponse.data) return null
  const masterRequest = mapOutputRequestRow(masterResponse.data)
  const planningDefaults = asRecord(registerOutputs.planningDefaults)
  const screenplayText = readText(asRecord(input.outputsByNodeKey.cinematic_v3_screenplay_author).text)
  const scenePackageOutput = asRecord(registerOutputs.scenePackage ?? registerOutputs.scene_package)
  const assetPack = asRecord(asRecord(input.outputsByNodeKey.cinematic_v3_reference_select).assetPack
    ?? asRecord(input.outputsByNodeKey.cinematic_v3_reference_select).asset_pack)
  const context = asRecord(asRecord(input.outputsByNodeKey.world_context).context)
  const guidance = asRecord(asRecord(input.outputsByNodeKey.skill_context).guidance)
  if (!screenplayText || Object.keys(scenePackageOutput).length === 0) return null
  const children = await ensureSequenceAnimaticSceneShotPlanWorkflows({
    client: input.client,
    masterRequest,
    scenePackageOutput,
    screenplayText,
    assetPack,
    context,
    guidance,
    maxShotCount: Number(planningDefaults.maxShotCount ?? 0) || 150,
    aspectRatio: readText(planningDefaults.aspectRatio) || '16:9',
    resolution: readText(planningDefaults.resolution) || '720p',
  })
  if (planningDefaults.autoStartFirstScene !== true) return children
  const firstScene = children[0] ?? null
  if (!firstScene?.workflowId) return children
  if (firstScene.status === 'running' || firstScene.status === 'queued' || firstScene.status === 'planning' || firstScene.status === 'completed') return children
  const started = await startSequenceAnimaticChildRun({
    client: input.client,
    request: firstScene,
    workflowId: firstScene.workflowId,
    runIntent: 'generate_scene_shot_plan',
    // Both terminal artifacts: the director-plan artifact is a sibling branch of
    // the manifest artifact and would be excluded by an upstream-only selection.
    targetNodeKeys: ['sequence_animatic_director_plan_artifact', 'artifact'],
  })
  await insertSequenceAnimaticEvent({
    client: input.client,
    projectId: input.run.projectId,
    draftId: input.run.draftId,
    requestId: masterRequest.id,
    workflowId: firstScene.workflowId,
    runId: readText(asRecord(started).runId) || null,
    eventType: 'scene_started',
    payload: {
      sceneId: readText(asRecord(firstScene.metadata).sceneId),
      sceneIndex: Number(asRecord(firstScene.metadata).sceneIndex ?? 0) || 1,
      requestId: firstScene.id,
      autoStarted: true,
    },
    metadata: { source: 'sequence_animatic_scene_auto_start' },
    dedupe: { sceneId: readText(asRecord(firstScene.metadata).sceneId) },
  }).catch(() => null)
  return children
}

async function maybeStartNextSequenceAnimaticStoryboardBlock(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
}) {
  const metadata = asRecord(input.run.metadata)
  const runRole = readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
  if (runRole !== 'storyboard_block' && runRole !== 'continuity_asset_batch') return null
  const masterRequestId = readText(metadata.masterRequestId) || readText(metadata.parentRequestId)
  if (!masterRequestId) return null
  const childrenResponse = await input.client
    .from('output_requests')
    .select(outputRequestSelect)
    .eq('project_id', input.run.projectId)
    .eq('draft_id', input.run.draftId)
    .eq('parent_request_id', masterRequestId)
    .order('created_at', { ascending: true })
  if (childrenResponse.error) throw new Error(childrenResponse.error.message)
  const allChildren = (childrenResponse.data ?? []).map(mapOutputRequestRow)
    .filter((child) => asRecord(child.metadata).sequenceAnimaticStale !== true)
  const activeRequiredBatches = allChildren.filter((child) => {
    const childMetadata = asRecord(child.metadata)
    return readScreenplayAnimaticRoleFromMetadata(childMetadata) === 'continuity_asset_batch'
      && childMetadata.continuityBatchRequired === true
      && (child.status === 'running' || child.status === 'queued' || child.status === 'planning')
  })
  if (activeRequiredBatches.length > 0) return null
  const children = allChildren
    .filter((child) => readScreenplayAnimaticRoleFromMetadata(asRecord(child.metadata)) === 'storyboard_block')
  const activeChildren = children.filter((child) => child.status === 'running' || child.status === 'queued' || child.status === 'planning')
  if (activeChildren.length > 0) return null
  const nextChild = children
    .filter((child) => child.workflowId)
    .filter((child) => child.status !== 'completed')
    .sort((left, right) => (Number(asRecord(left.metadata).storyboardBlockIndex ?? 0) || 999) - (Number(asRecord(right.metadata).storyboardBlockIndex ?? 0) || 999))[0] ?? null
  if (!nextChild?.workflowId) {
    const masterResponse = await input.client
      .from('output_requests')
      .select('id,metadata')
      .eq('id', masterRequestId)
      .maybeSingle()
    if (masterResponse.error) throw new Error(masterResponse.error.message)
    const masterMetadata = asRecord(asRecord(masterResponse.data).metadata)
    const updateMaster = await input.client
      .from('output_requests')
      .update({
        metadata: {
          ...masterMetadata,
          orchestrationStatus: 'ready',
          orchestrationCompletedAt: new Date().toISOString(),
        },
      })
      .eq('id', masterRequestId)
    if (updateMaster.error) throw new Error(updateMaster.error.message)
    await input.client.rpc('refresh_output_request_status_projection', { p_request_id: masterRequestId })
    return null
  }
  const startResult = await startSequenceAnimaticChildRun({
    client: input.client,
    request: nextChild,
    workflowId: nextChild.workflowId,
    runIntent: 'prepare_storyboard_block',
    targetNodeKeys: ['artifact'],
  })
  if (startResult.started) {
    await insertSequenceAnimaticEvent({
      client: input.client,
      projectId: input.run.projectId,
      draftId: input.run.draftId,
      requestId: masterRequestId,
      workflowId: nextChild.workflowId,
      runId: startResult.runId,
      eventType: 'block_started',
      payload: {
        blockRequestId: nextChild.id,
        workflowId: nextChild.workflowId,
        storyboardBlockId: readText(asRecord(nextChild.metadata).storyboardBlockId),
        runId: startResult.runId,
        status: startResult.status,
      },
      metadata: { source: 'sequence_animatic_orchestrator_continuation' },
      dedupe: { storyboardBlockId: readText(asRecord(nextChild.metadata).storyboardBlockId), runId: startResult.runId },
    })
  }
  return startResult
}

function mergeComicSelectedEntitiesWithFallback(selectedEntities: Array<Record<string, unknown>>, fallbackPack: Record<string, unknown>) {
  const fallbackEntities = Array.isArray(fallbackPack.entities) ? fallbackPack.entities.map(asRecord) : []
  const fallbackByKey = new Map(fallbackEntities.map((entity) => [readText(entity.key), entity]).filter(([key]) => key))
  const merged = selectedEntities.length > 0 ? selectedEntities : fallbackEntities
  return merged.map((entity) => {
    const key = readText(entity.key)
    const fallback = fallbackByKey.get(key) ?? {}
    const assetKeys = [
      ...readStringArray(fallback.assetKeys),
      ...readStringArray(entity.assetKeys),
    ]
    const fallbackVisualDescription = readText(fallback.visualDescription)
    const visualTraits = [
      ...readStringArray(fallback.visualTraits),
      ...readStringArray(entity.visualTraits),
    ]
    const fallbackTraitMap = asRecord(fallback.visualTraitMap)
    const entityTraitMap = asRecord(entity.visualTraitMap)
    return {
      key,
      name: readText(entity.name) || readText(fallback.name),
      type: readText(entity.type) || readText(fallback.type),
      role: readText(entity.role) || readText(fallback.role) || readText(entity.type) || readText(fallback.type),
      summary: readText(entity.summary) || readText(fallback.summary),
      visualDescription: fallbackVisualDescription || readText(entity.visualDescription),
      visualTraits: [...new Set(visualTraits)].filter(Boolean),
      visualTraitMap: { ...fallbackTraitMap, ...entityTraitMap },
      assetKeys: [...new Set(assetKeys)].filter(Boolean),
    }
  }).filter((entity) => entity.key || entity.name).slice(0, 16)
}

export function buildDeterministicCinematicAssetPack(context: Record<string, unknown>) {
  return buildDeterministicComicAssetPack(context)
}

function cinematicAssetPackEntities(assetPack: Record<string, unknown>) {
  return Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
}

function referencePlanKeys(plan: Record<string, unknown>) {
  return [...new Set([
    ...readStringArray(plan.primaryCastRefIds),
    ...readStringArray(plan.supportingCastRefIds),
    ...readStringArray(plan.locationRefIds),
    ...readStringArray(plan.propRefIds),
    ...readStringArray(plan.conceptRefIds),
    ...readStringArray(plan.continuityAnchorRefIds),
  ].filter(Boolean))]
}

function cloneCinematicAssetPackEntity(entity: Record<string, unknown>, maxAssetKeys = 2) {
  const selectedReferenceVariantAssetKey = selectedReferenceVariantAssetKeyForEntity(entity)
  const primaryAssetKey = readText(entity.primaryAssetKey) || selectedReferenceVariantAssetKey
  return {
    ...entity,
    primaryAssetKey: primaryAssetKey || readStringArray(entity.assetKeys)[0] || '',
    assetKeys: sortReferenceValuesWithPrimary(readStringArray(entity.assetKeys), primaryAssetKey || selectedReferenceVariantAssetKey)
      .slice(0, Math.max(1, maxAssetKeys)),
  }
}

function cinematicEntityTypeBucket(entity: Record<string, unknown>) {
  const type = readText(entity.type) || readText(entity.role)
  if (['actor', 'character'].includes(type)) return 'primaryCastRefIds'
  if (['group', 'faction'].includes(type)) return 'supportingCastRefIds'
  if (['place', 'environment', 'location', 'location_spot'].includes(type)) return 'locationRefIds'
  if (['object', 'item', 'inventory_item', 'prop'].includes(type)) return 'propRefIds'
  if (['concept'].includes(type)) return 'conceptRefIds'
  return 'continuityAnchorRefIds'
}

function selectedReferenceVariantForPackedEntity(entity: Record<string, unknown>) {
  const selectedVariantKey = readText(entity.selectedReferenceVariantKey)
    || readText(asRecord(entity.metadata).selectedReferenceVariantKey)
  if (!selectedVariantKey || selectedVariantKey === 'default') return null
  const variants = Array.isArray(entity.referenceVariants)
    ? entity.referenceVariants.map(asRecord)
    : Array.isArray(asRecord(entity.metadata).referenceVariants)
      ? asRecord(entity.metadata).referenceVariants.map(asRecord)
      : []
  return variants.find((variant) => {
    const key = readText(variant.variantKey) || readText(variant.variant_key)
    return key === selectedVariantKey
  }) ?? null
}

function cinematicVariantMatchedPlanEntries(assetPack: Record<string, unknown>, prompt: string) {
  return cinematicAssetPackEntities(assetPack)
    .map((entity) => {
      const variant = selectedReferenceVariantForPackedEntity(entity)
      const score = variant ? referenceVariantMatchScore(variant, prompt) : 0
      return { entity, variant, score }
    })
    .filter((entry) => entry.variant && entry.score > 0)
    .sort((left, right) => right.score - left.score)
}

function strengthenCinematicReferencePlanWithVariantMatches(plan: Record<string, unknown>, assetPack: Record<string, unknown>, prompt: string, maxReferenceCount = 16) {
  const raw = cinematicV2ReferencePlanSchema.parse(plan)
  const allowed = new Set(cinematicAssetPackEntityKeys(assetPack))
  const selected = new Set(referencePlanKeys(raw))
  const matchedEntries = cinematicVariantMatchedPlanEntries(assetPack, prompt)
    .filter((entry) => allowed.has(readText(entry.entity.key)))
  const strengthened = {
    ...raw,
    primaryCastRefIds: [...raw.primaryCastRefIds],
    supportingCastRefIds: [...raw.supportingCastRefIds],
    locationRefIds: [...raw.locationRefIds],
    propRefIds: [...raw.propRefIds],
    conceptRefIds: [...raw.conceptRefIds],
    continuityAnchorRefIds: [...raw.continuityAnchorRefIds],
    rejectedRefs: [...raw.rejectedRefs],
  }

  for (const entry of matchedEntries) {
    if (selected.size >= Math.max(1, maxReferenceCount)) break
    const key = readText(entry.entity.key)
    if (!key || selected.has(key)) continue
    const bucket = cinematicEntityTypeBucket(entry.entity) as keyof Pick<typeof strengthened, 'primaryCastRefIds' | 'supportingCastRefIds' | 'locationRefIds' | 'propRefIds' | 'conceptRefIds' | 'continuityAnchorRefIds'>
    strengthened[bucket] = [...strengthened[bucket], key]
    selected.add(key)
  }

  const variantMatchedKeys = matchedEntries.map((entry) => readText(entry.entity.key)).filter(Boolean)
  const variantMatchedLocations = matchedEntries
    .filter((entry) => readText(entry.variant?.variantType) === 'shot_location_sheet' || readText(entry.variant?.variant_type) === 'shot_location_sheet')
    .map((entry) => readText(entry.entity.key))
    .filter(Boolean)

  return cinematicV2ReferencePlanSchema.parse({
    ...strengthened,
    rationale: [
      raw.rationale,
      variantMatchedKeys.length > 0
        ? `Variant-aware strengthening kept parent references for matched visual variants: ${variantMatchedKeys.join(', ')}.`
        : '',
      variantMatchedLocations.length > 0
        ? `Matched shot-location variants should be treated as sub-location/set references of their parent location: ${variantMatchedLocations.join(', ')}.`
        : '',
    ].filter(Boolean).join(' '),
  })
}

function filterCinematicAssetPack(assetPack: Record<string, unknown>, keys: string[], limit = 16, maxAssetKeysPerEntity = 2) {
  const keySet = new Set(keys.filter(Boolean))
  const entities = cinematicAssetPackEntities(assetPack)
    .filter((entity) => keySet.has(readText(entity.key)))
    .slice(0, Math.max(1, limit))
    .map((entity) => cloneCinematicAssetPackEntity(entity, maxAssetKeysPerEntity))
  const selectedKeys = new Set(entities.map((entity) => readText(entity.key)).filter(Boolean))
  return {
    ...assetPack,
    entities,
    selectedEntityKeys: [...selectedKeys],
    missingReferenceEntityKeys: readStringArray(assetPack.missingReferenceEntityKeys)
      .filter((key) => selectedKeys.has(key)),
  }
}

function buildFallbackCinematicV2ReferencePlan(assetPack: Record<string, unknown>, maxReferenceCount = 16) {
  const entities = cinematicAssetPackEntities(assetPack)
  const byType = (types: string[]) => entities
    .filter((entity) => types.includes(readText(entity.type) || readText(entity.role)))
    .map((entity) => readText(entity.key))
    .filter(Boolean)
  const primaryCastRefIds = byType(['actor', 'character', 'group']).slice(0, 5)
  const locationRefIds = byType(['place', 'environment', 'location', 'location_spot']).slice(0, 3)
  const propRefIds = byType(['object', 'item', 'inventory_item', 'prop']).slice(0, 4)
  const conceptRefIds = byType(['concept']).slice(0, 3)
  const selected = [...new Set([...primaryCastRefIds, ...locationRefIds, ...propRefIds, ...conceptRefIds])]
    .slice(0, Math.max(1, maxReferenceCount))
  return cinematicV2ReferencePlanSchema.parse({
    primaryCastRefIds: selected.filter((key) => primaryCastRefIds.includes(key)),
    supportingCastRefIds: [],
    locationRefIds: selected.filter((key) => locationRefIds.includes(key)),
    propRefIds: selected.filter((key) => propRefIds.includes(key)),
    conceptRefIds: selected.filter((key) => conceptRefIds.includes(key)),
    continuityAnchorRefIds: selected.filter((key) => !primaryCastRefIds.includes(key) && !locationRefIds.includes(key) && !propRefIds.includes(key) && !conceptRefIds.includes(key)),
    rejectedRefs: cinematicAssetPackEntityKeys(assetPack)
      .filter((key) => !selected.includes(key))
      .map((refId) => ({ refId, reason: 'Not selected by deterministic cinematic reference fallback.' })),
    rationale: 'Deterministic fallback selected the most likely cast, location, prop, and concept references from the sequence-scoped asset pack.',
    confidence: selected.length > 0 ? 0.55 : 0.2,
  })
}

function sanitizeCinematicV2ReferencePlan(plan: Record<string, unknown>, assetPack: Record<string, unknown>, maxReferenceCount = 16) {
  const allowed = new Set(cinematicAssetPackEntityKeys(assetPack))
  const takeValid = (values: string[]) => values.filter((key, index) => key && allowed.has(key) && values.indexOf(key) === index)
  const raw = cinematicV2ReferencePlanSchema.parse(plan)
  const ordered = [
    ...takeValid(raw.primaryCastRefIds),
    ...takeValid(raw.supportingCastRefIds),
    ...takeValid(raw.locationRefIds),
    ...takeValid(raw.propRefIds),
    ...takeValid(raw.conceptRefIds),
    ...takeValid(raw.continuityAnchorRefIds),
  ]
  const capped = new Set([...new Set(ordered)].slice(0, Math.max(1, maxReferenceCount)))
  const invalidRejected = referencePlanKeys(raw)
    .filter((key) => !allowed.has(key))
    .map((refId) => ({ refId, reason: 'Rejected because it is not in the sequence-scoped cinematic asset pack.' }))
  const unselectedRejected = cinematicAssetPackEntityKeys(assetPack)
    .filter((key) => !capped.has(key))
    .map((refId) => ({ refId, reason: 'Not needed for this cinematic-level reference plan.' }))
  const sanitized = cinematicV2ReferencePlanSchema.parse({
    ...raw,
    primaryCastRefIds: takeValid(raw.primaryCastRefIds).filter((key) => capped.has(key)),
    supportingCastRefIds: takeValid(raw.supportingCastRefIds).filter((key) => capped.has(key)),
    locationRefIds: takeValid(raw.locationRefIds).filter((key) => capped.has(key)),
    propRefIds: takeValid(raw.propRefIds).filter((key) => capped.has(key)),
    conceptRefIds: takeValid(raw.conceptRefIds).filter((key) => capped.has(key)),
    continuityAnchorRefIds: takeValid(raw.continuityAnchorRefIds).filter((key) => capped.has(key)),
    rejectedRefs: [...raw.rejectedRefs, ...invalidRejected, ...unselectedRejected]
      .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.refId === entry.refId) === index),
  })
  if (referencePlanKeys(sanitized).length > 0) return sanitized
  return buildFallbackCinematicV2ReferencePlan(assetPack, maxReferenceCount)
}

function normalizeAnchorName(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function verifySequenceAnimaticAnchorCrop(input: {
  outputPath: string
  anchorId: string
  expectedWidth: number
  expectedHeight: number
  row: number
  column: number
}) {
  const [fileStat, size] = await Promise.all([
    Deno.stat(input.outputPath),
    probeImageSize(input.outputPath),
  ])
  if (!size || size.width <= 0 || size.height <= 0) {
    throw new Error(`Sequence animatic continuity crop verification failed for ${input.anchorId}: output is not a readable image.`)
  }
  if (size.width < 32 || size.height < 32) {
    throw new Error(`Sequence animatic continuity crop verification failed for ${input.anchorId}: crop is too small (${size.width}x${size.height}).`)
  }
  if (Math.abs(size.width - input.expectedWidth) > 2 || Math.abs(size.height - input.expectedHeight) > 2) {
    throw new Error(`Sequence animatic continuity crop verification failed for ${input.anchorId}: expected ${input.expectedWidth}x${input.expectedHeight}, got ${size.width}x${size.height}.`)
  }
  if (fileStat.size < 512) {
    throw new Error(`Sequence animatic continuity crop verification failed for ${input.anchorId}: output byte size is suspiciously small (${fileStat.size} bytes).`)
  }
  const signal = await runFfmpeg(['-v', 'info', '-i', input.outputPath, '-vf', 'signalstats,metadata=print', '-frames:v', '1', '-f', 'null', '-'])
  const yMin = Number(signal.stderr.match(/lavfi\.signalstats\.YMIN=([0-9.]+)/)?.[1] ?? NaN)
  const yMax = Number(signal.stderr.match(/lavfi\.signalstats\.YMAX=([0-9.]+)/)?.[1] ?? NaN)
  if (Number.isFinite(yMin) && Number.isFinite(yMax) && Math.abs(yMax - yMin) <= 1) {
    throw new Error(`Sequence animatic continuity crop verification failed for ${input.anchorId}: crop appears visually blank at row ${input.row + 1}, column ${input.column + 1}.`)
  }
  return {
    width: size.width,
    height: size.height,
    byteSize: fileStat.size,
    lumaRange: Number.isFinite(yMin) && Number.isFinite(yMax) ? Math.round((yMax - yMin) * 100) / 100 : null,
  }
}

function titleFromRefLike(value: string) {
  return normalizeAnchorName(value)
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function compactSequenceAnimaticText(value: unknown, maxLength = 900) {
  const text = readText(value).replace(/\s+/g, ' ')
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text
}

function compactSchemaDiagnostics(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .slice(0, 6)
}

function sequenceAnimaticPersistentLightingCue(value: unknown) {
  const text = compactSequenceAnimaticText(value, 360)
  if (!text) return ''
  return /\b(lantern|torch|fire|candle|window|sun|moon|neon|monitor|screen|emergency|practical|lamp|spotlight|backlight|silhouette|strobe|flicker|glow from|shafts? of light)\b/i.test(text)
    ? text
    : ''
}

function sequenceAnimaticManifestBlockIdByShotId(manifest: Record<string, unknown>) {
  const map = new Map<string, string>()
  readArray(manifest.blocks).map(asRecord).forEach((block) => {
    const blockId = readText(block.id)
    readStringArray(block.shotIds).forEach((shotId) => {
      if (shotId && blockId) map.set(shotId, blockId)
    })
    readArray(block.shots).map(asRecord).forEach((shot) => {
      const shotId = readText(shot.id)
      if (shotId && blockId) map.set(shotId, blockId)
    })
  })
  return map
}

function sequenceAnimaticSpatialRecord(shot: Record<string, unknown>) {
  return asRecord(shot.spatialContinuity ?? shot.spatial_continuity)
}

function readNumericAlias(record: Record<string, unknown>, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = record[key]
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim().length === 0) continue
    const parsed = typeof value === 'number' ? value : Number(readText(value))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function readShotStartSeconds(shot: Record<string, unknown>) {
  return readNumericAlias(shot, ['startTimeSeconds', 'startSeconds', 'startSecond', 'start', 'from'], 0)
}

function readShotEndSeconds(shot: Record<string, unknown>) {
  return readNumericAlias(shot, ['endTimeSeconds', 'endSeconds', 'endSecond', 'end', 'to'], readShotStartSeconds(shot))
}

function formatShotSeconds(value: unknown, fallback: number) {
  const numeric = typeof value === 'number' ? value : Number(readText(value))
  const seconds = Number.isFinite(numeric) ? numeric : fallback
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function compactCinematicEntityAnchors(assetPack: Record<string, unknown>, limit = 8) {
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  const byKey = new Map<string, {
    key: string
    name: string
    type: string
    summary: string
    visualDescription: string
    visualTraits: string[]
    voiceDescription: string
    selectedReferenceVariantLabel: string
    selectedReferenceVariantSummary: string
  }>()
  const seenNames = new Set<string>()
  for (const entity of entities) {
    const name = readText(entity.name)
    const type = readText(entity.type) || readText(entity.role)
    const summary = readText(entity.summary)
    const visualDescription = readText(entity.visualDescription)
    const visualTraits = readStringArray(entity.visualTraits)
    const voiceDescription = readText(entity.voiceDescription)
      || composeWorldEntityVoiceDescription(asRecord(entity.voice))
    const selectedVariantKey = readText(entity.selectedReferenceVariantKey)
    const selectedReferenceVariantLabel = selectedVariantKey && selectedVariantKey !== 'default'
      ? readText(entity.selectedReferenceVariantLabel) || selectedVariantKey
      : ''
    const selectedReferenceVariantSummary = selectedReferenceVariantLabel
      ? readText(entity.selectedReferenceVariantSummary)
      : ''
    if (!name && !summary && !visualDescription && visualTraits.length === 0 && !voiceDescription) continue
    if (!summary && !visualDescription && visualTraits.length === 0 && !voiceDescription) continue
    const key = slugify(readText(entity.key) || readText(entity.id) || readText(entity.assetKey) || name)
    const nameKey = slugify(name)
    if (!key || byKey.has(key) || (nameKey && seenNames.has(nameKey))) continue
    if (nameKey) seenNames.add(nameKey)
    byKey.set(key, { key, name, type, summary, visualDescription, visualTraits, voiceDescription, selectedReferenceVariantLabel, selectedReferenceVariantSummary })
    if (byKey.size >= limit) break
  }
  return [...byKey.values()]
}

function cinematicEntityByKey(assetPack: Record<string, unknown>) {
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  const byKey = new Map<string, Record<string, unknown>>()
  for (const entity of entities) {
    const key = readText(entity.key)
    if (key && !byKey.has(key)) byKey.set(key, entity)
  }
  return byKey
}

function cinematicEntityLabelByKey(assetPack: Record<string, unknown>) {
  const labels = new Map<string, string>()
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  for (const entity of entities) {
    const key = readText(entity.key)
    if (!key) continue
    labels.set(key, readText(entity.name) || key)
  }
  return labels
}

function formatCinematicEntityAnchorLines(entities: ReturnType<typeof compactCinematicEntityAnchors>) {
  return entities.map((entity) => {
    const parts = [
      entity.selectedReferenceVariantLabel
        ? `Selected variant: ${entity.selectedReferenceVariantLabel}${entity.selectedReferenceVariantSummary ? ` (${compactBeatCaptionSentence(entity.selectedReferenceVariantSummary, '', 24).replace(/\.$/, '')})` : ''}`
        : '',
      entity.visualDescription ? `Visual: ${compactBeatCaptionSentence(entity.visualDescription, '', 24).replace(/\.$/, '')}` : '',
      entity.visualTraits.length > 0 ? `Traits: ${entity.visualTraits.slice(0, 10).join(', ')}` : '',
    ].filter(Boolean)
    return `${entity.name || 'Visual anchor'}: ${parts.join('. ')}.`
  }).join('\n')
}

function formatTimecode(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function distributeBeatDurations(totalSeconds: number, panelCount: number) {
  const count = Math.max(1, panelCount)
  const total = Math.max(count, Math.round(totalSeconds))
  const base = Math.max(1, Math.floor(total / count))
  let remainder = Math.max(0, total - base * count)
  return Array.from({ length: count }, (_, index) => {
    const addExtra = index >= count - remainder ? 1 : 0
    return base + addExtra
  })
}

type CinematicVisualDensity = 'slow' | 'standard' | 'active' | 'action'
type CinematicShotStripMode = 'sparse' | 'balanced' | 'dense'

function shotDurationSeconds(shot: Record<string, unknown>) {
  const explicit = Number(shot.durationSeconds)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  return Math.max(0, readShotEndSeconds(shot) - readShotStartSeconds(shot))
}

function collectShotDensityText(shot: Record<string, unknown>) {
  const actions = Array.isArray(shot.actions) ? shot.actions.map(asRecord) : []
  return [
    readText(shot.title),
    readText(shot.beat),
    readText(shot.emotionalBeat),
    readText(shot.visualAction),
    readText(shot.action),
    readText(shot.composition),
    readText(shot.framing),
    readText(shot.cameraMovement),
    ...actions.flatMap((action) => [
      readText(action.verb),
      readText(action.action),
      readText(action.target),
      readText(action.prop),
      readText(action.stagingNotes),
      readText(action.description),
    ]),
  ].filter(Boolean).join(' ').toLowerCase()
}

function countRegexMatches(value: string, pattern: RegExp) {
  return (value.match(pattern) ?? []).length
}

function estimateDialogueSeconds(shot: Record<string, unknown>) {
  const records = readShotDialogueRecords(shot).filter((entry) => readText(entry.line))
  if (records.length === 0) return 0
  return records.reduce((total, entry) => {
    const start = Number(entry.startSeconds)
    const end = Number(entry.endSeconds)
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) return total + Math.min(5, end - start)
    const wordCount = readText(entry.line).split(/\s+/).filter(Boolean).length
    return total + Math.max(1.2, Math.min(4, wordCount / 3.2))
  }, 0)
}

function classifyCinematicVisualDensity(input: {
  durationSeconds: number
  shots: Record<string, unknown>[]
}) {
  const duration = Math.max(4, Math.min(15, Math.round(input.durationSeconds) || 4))
  const shots = input.shots
  const shotCount = shots.length
  const allText = shots.map(collectShotDensityText).join(' ')
  const dialogueSeconds = shots.reduce((total, shot) => total + estimateDialogueSeconds(shot), 0)
  const dialogueCount = shots.reduce((total, shot) => total + readShotDialogueRecords(shot).filter((entry) => readText(entry.line)).length, 0)
  const dialogueRatio = duration > 0 ? dialogueSeconds / duration : 0
  const actionKeywordCount = countRegexMatches(
    allText,
    /\b(chase|pursu|fight|battle|attack|punch|kick|strike|shoot|fire|stun|slam|crash|burst|sprint|run|flee|vault|leap|dive|fall|collapse|explode|explosion|impact|hit|smash|throw|spin|transform|montage)\b/g,
  )
  const movementKeywordCount = countRegexMatches(
    allText,
    /\b(walk|move|cross|enter|exit|approach|turn|circle|track|follow|search|inspect|examine|lean|reach|grab|lift|open|close|pull|push)\b/g,
  )
  const stillKeywordCount = countRegexMatches(
    allText,
    /\b(sit|sits|still|motionless|quiet|stares|holds gaze|waits|listens|watches|smile|smirks|glances|breath|close-up|closeup|two-shot|table|cafe)\b/g,
  )
  const contactKeywordCount = countRegexMatches(
    allText,
    /\b(contact|impact|collide|hits|strikes|slams|crashes|sparks|grabs|yanks|vaults|lands|pins|blocks|cuts off|closes in)\b/g,
  )
  const forceBreakCount = shots.filter((shot) => shot.forceTakeBreak === true).length
  const locationKeys = new Set(shots.map((shot) => slugify(readText(shot.location) || readText(shot.locationRefId))).filter(Boolean))
  const cameraKeys = new Set(shots.map((shot) => slugify([readText(shot.framing), readText(shot.cameraMovement)].filter(Boolean).join(' '))).filter(Boolean))
  const cameraChangeCount = Math.max(0, cameraKeys.size - 1)
  const locationChangeCount = Math.max(0, locationKeys.size - 1)
  const longShotCount = shots.filter((shot) => shotDurationSeconds(shot) >= 5).length
  const actionScore = actionKeywordCount + contactKeywordCount * 1.5 + forceBreakCount * 2 + locationChangeCount + Math.max(0, cameraChangeCount - 1) * 0.5
  const movementScore = movementKeywordCount + cameraChangeCount + locationChangeCount
  let visualDensity: CinematicVisualDensity = 'standard'
  const reasons: string[] = []

  if (/\b(chase|fight|battle|montage|transformation|pursuit)\b/.test(allText) || actionScore >= 7 || shotCount >= 7) {
    visualDensity = 'action'
    reasons.push('action/contact or montage-style signals')
  } else if (actionScore >= 3 || movementScore >= 8 || shotCount >= 5 || locationChangeCount > 0) {
    visualDensity = 'active'
    reasons.push('movement, camera, or spatial transition signals')
  } else if (
    shotCount <= 4
    && actionScore < 3
    && (dialogueRatio >= 0.35 || dialogueCount >= 2 || stillKeywordCount >= Math.max(2, actionKeywordCount + contactKeywordCount))
  ) {
    visualDensity = 'slow'
    reasons.push('dialogue/stillness outweighs action')
  } else {
    reasons.push('balanced dramatic coverage')
  }

  if (longShotCount >= Math.max(1, shotCount - 1) && visualDensity === 'standard' && actionScore < 2 && dialogueCount > 0) {
    visualDensity = 'slow'
    reasons.length = 0
    reasons.push('long dialogue-oriented shots')
  }

  const shotStripMode: CinematicShotStripMode = visualDensity === 'slow'
    ? 'sparse'
    : visualDensity === 'action'
      ? 'dense'
      : 'balanced'

  return {
    visualDensity,
    shotStripMode,
    densityReason: [
      reasons.join(', '),
      `shots=${shotCount || 0}`,
      `dialogueRatio=${dialogueRatio.toFixed(2)}`,
      `actionScore=${actionScore.toFixed(1)}`,
      `cameraChanges=${cameraChangeCount}`,
      `locationChanges=${locationChangeCount}`,
    ].filter(Boolean).join('; '),
  }
}

function adaptiveBeatSheetPanelCount(input: {
  durationSeconds: number
  shotCount: number
  visualDensity: CinematicVisualDensity
}) {
  const duration = Math.max(4, Math.min(15, Math.round(input.durationSeconds) || 4))
  const shotCount = Math.max(1, input.shotCount || 1)
  if (input.visualDensity === 'slow') {
    const maxSlowPanels = duration <= 11 ? 4 : 5
    return Math.max(3, Math.min(maxSlowPanels, shotCount + 2))
  }
  if (input.visualDensity === 'standard') {
    return Math.max(5, Math.min(7, shotCount + 2, Math.ceil(duration * 0.45)))
  }
  if (input.visualDensity === 'active') {
    return Math.max(6, Math.min(8, shotCount + 3, Math.ceil(duration * 0.6)))
  }
  return Math.max(8, Math.min(12, shotCount + 5, Math.ceil(duration * 0.7)))
}

function findShotForBeatMidpoint(shots: Record<string, unknown>[], midpointSeconds: number) {
  return shots.find((shot) => midpointSeconds >= readShotStartSeconds(shot) && midpointSeconds < readShotEndSeconds(shot))
    ?? shots.find((shot) => midpointSeconds <= readShotEndSeconds(shot))
    ?? shots[shots.length - 1]
    ?? {}
}

function cleanBeatCaptionText(value: unknown) {
  return readText(value)
    .replace(/@\s*(Image|Video|Audio)\s*\d+/gi, '')
    .replace(/[{}[\]"]/g, ' ')
    .replace(/\b(Caption line|Subject|Action|Camera|Composition|Audio|References)\s*\d*\s*:/gi, ' ')
    .replace(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z0-9-]+){0,3})\s+\1\b/g, '$1')
    .replace(/([A-Za-z0-9])_([A-Za-z0-9])/g, '$1 $2')
    .replace(/\.{3}|\u2026/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sentenceCaseBeatCaption(value: string) {
  const clean = value.trim()
  if (!clean) return clean
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}${/[.!?]$/.test(clean) ? '' : '.'}`
}

function compactBeatCaptionSentence(value: unknown, fallback: string, maxWords = 13) {
  const clean = cleanBeatCaptionText(value) || cleanBeatCaptionText(fallback)
  if (!clean) return 'The visual continuity stays clear.'
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] ?? clean
  const firstClause = firstSentence.split(/\s+(?:while|as|before|after|then)\s+/i)[0]
  const weakTailWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'with', 'into', 'onto', 'through', 'from', 'to', 'of', 'in', 'on', 'for', 'as', 'while', 'before', 'after', 'then', 'just'])
  const words = firstClause.replace(/[.!?]+$/g, '').split(/\s+/).filter(Boolean)
  while (words.length > 1 && weakTailWords.has(words[words.length - 1].toLowerCase())) words.pop()
  const compactWords = words.length > maxWords ? words.slice(0, maxWords) : words
  while (compactWords.length > 1 && weakTailWords.has(compactWords[compactWords.length - 1].toLowerCase())) compactWords.pop()
  const compact = compactWords.join(' ').replace(/[,;:]+$/g, '')
  return sentenceCaseBeatCaption(compact)
}

function compactStoryboardSentence(value: unknown, fallback = '', maxWords = 22) {
  const clean = cleanBeatCaptionText(value)
    .replace(/\b(?:Dialogue cue|Audio cue|Opening state|Action escalation|Obstacle or contact|Consequence and transition|Visible action and blocking|Camera feel|Framing)\s*:/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const source = clean || cleanBeatCaptionText(fallback)
  if (!source) return ''
  const firstSentence = source.split(/(?<=[.!?])\s+/)[0] ?? source
  const words = firstSentence.replace(/[.!?]+$/g, '').split(/\s+/).filter(Boolean)
  const weakTailWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'with', 'into', 'onto', 'through', 'from', 'to', 'of', 'in', 'on', 'for', 'as', 'while', 'before', 'after', 'then', 'just', 'where'])
  while (words.length > 1 && weakTailWords.has(words[words.length - 1].toLowerCase())) words.pop()
  const compactWords = words.length > maxWords ? words.slice(0, maxWords) : words
  while (compactWords.length > 1 && weakTailWords.has(compactWords[compactWords.length - 1].toLowerCase())) compactWords.pop()
  const compact = compactWords.join(' ').replace(/[,;:]+$/g, '')
  return sentenceCaseBeatCaption(compact)
}

function splitStoryboardVisualClauses(value: unknown) {
  const clean = cleanBeatCaptionText(value)
  if (!clean) return []
  return clean
    .split(/(?:[.;]|\s+\bthen\b\s+|\s+\bwhile\b\s+|\s+\bas\b\s+)/i)
    .map((entry) => compactStoryboardSentence(entry, '', 18))
    .filter((entry) => {
      const words = entry.replace(/[.!?]+$/g, '').split(/\s+/).filter(Boolean)
      if (words.length < 3) return false
      return entry !== 'The visual continuity stays clear.'
    })
}

function naturalizeCinematicActorName(value: unknown) {
  const text = cleanBeatCaptionText(value)
  if (!text) return ''
  return text
    .split(/[.:/]/)[0]
    .replace(/\b(world|entity|actor|character|place|group|object)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function naturalizeCinematicTarget(value: unknown) {
  const text = cleanBeatCaptionText(value)
  if (!text) return ''
  return text
    .replace(/\b(world|entity|actor|character|place|group|object)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cinematicActionPhrase(input: {
  actor: string
  verb: string
  target: string
  prop: string
}) {
  const actor = input.actor || 'The subject'
  const verb = cleanBeatCaptionText(input.verb).toLowerCase()
  const articleObject = (value: string) => {
    if (!value) return ''
    if (/^(?:the|a|an|this|that|his|her|their|its)\s/i.test(value)) return value
    if (/^[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*)*$/.test(value)) return value
    if (/^(?:table|cup|window|street|door|wall|floor|worktable|face|hand|hands|room|corner|barrier|hatch|fence|panel|glass|dome)$/i.test(value)) {
      return `the ${value}`
    }
    return value
  }
  const target = articleObject(input.target)
  const prop = articleObject(input.prop)
  const propPhrase = prop ? `, ${prop} visible in the frame` : ''
  if (!verb) return ''
  if (/\bleans?\b/.test(verb)) return `${actor} leans over ${target || 'the table'}${prop ? ` near ${prop}` : ''}.`
  if (/\btilts?\b/.test(verb)) return `${actor} tilts their head toward ${target || 'the other character'}${propPhrase}.`
  if (/\bholds?\b/.test(verb)) return `${actor} holds ${target ? `${target}'s gaze` : 'a perfectly still gaze'}${propPhrase}.`
  if (/\bstudies?\b/.test(verb)) return `${actor} studies ${target || 'the other character'} with still, precise attention${propPhrase}.`
  if (/\bstares?\b/.test(verb)) return `${actor} stares at ${target || 'the other character'} with a fixed expression${propPhrase}.`
  if (/\blies?\s*still\b|\brests?\b/.test(verb)) return `${actor} lies motionless ${target ? `on ${target}` : 'in the frame'}${propPhrase}.`
  if (/\bstirs?\b/.test(verb)) return `${actor} stirs ${target || prop || 'the cup'} with restless, contained movement.`
  if (/\bsmirks?\b/.test(verb)) return `${actor} almost smiles toward ${target || 'the other character'}, then checks the reaction.`
  if (/\bglances?\b/.test(verb)) return `${actor} glances toward ${target || 'the edge of the room'}, alert to danger.`
  if (/\bfreezes?\b/.test(verb)) return `${actor} freezes around ${target || prop || 'the table'}, tension visible in the posture.`
  if (/\bwaits?\b/.test(verb)) return `${actor} waits in stillness, watching ${target || 'the other character'} for a reaction.`
  if (/\bapproaches?\b/.test(verb)) return `${actor} approaches ${target || 'the focal point'} with careful, contained body language.`
  if (/\bexamines?\b/.test(verb)) return `${actor} examines ${target || 'the focal detail'} with focused attention.`
  const normalizedVerb = verb.replace(/\s+/g, ' ')
  return `${actor} ${normalizedVerb}${target ? ` ${target}` : ''}${prop ? ` with ${prop}` : ''}.`
}

function readShotStoryboardActionClauses(shot: Record<string, unknown>) {
  const actionRecords = Array.isArray(shot.actions) ? shot.actions.map(asRecord) : []
  return actionRecords.flatMap((action) => {
    const actor = naturalizeCinematicActorName(action.actor) || naturalizeCinematicActorName(action.actorRefId) || naturalizeCinematicActorName(action.subject)
    const verb = cleanBeatCaptionText(action.verb ?? action.action)
    const target = naturalizeCinematicTarget(action.target) || naturalizeCinematicTarget(action.targetRefId)
    const prop = naturalizeCinematicTarget(action.prop) || naturalizeCinematicTarget(action.propRefId)
    const staging = readText(action.stagingNotes) || readText(action.description)
    const actionPhrase = cinematicActionPhrase({ actor, verb, target, prop })
    return [
      actionPhrase,
      staging,
    ].filter(Boolean)
  })
}

function readShotDialogueRecords(shot: Record<string, unknown>) {
  return Array.isArray(shot.dialogue) ? shot.dialogue.map(asRecord) : []
}

function readShotDialogueClauses(shot: Record<string, unknown>) {
  const dialogueRecords = Array.isArray(shot.dialogue) ? shot.dialogue.map(asRecord) : []
  return dialogueRecords.flatMap((entry) => {
    const speaker = readText(entry.speaker) || readText(entry.speakerName) || readText(entry.speakerRefId)
    const line = readText(entry.line)
    const delivery = readText(entry.delivery)
    return [
      line ? `${speaker ? `${speaker} says` : 'A voice says'} "${line}"` : '',
      delivery ? `${speaker || 'The speaker'} delivers the line ${delivery}` : '',
    ]
  })
}

function readShotAudioCueClauses(shot: Record<string, unknown>) {
  const cueRecords = Array.isArray(shot.audioCues) ? shot.audioCues.map((cue) => ({ cue })) : []
  const audioRecords = Array.isArray(shot.audio) ? shot.audio.map(asRecord) : []
  return [
    ...cueRecords.map((entry) => readText(entry.cue)),
    ...audioRecords.map((entry) => [readText(entry.kind), readText(entry.cue)].filter(Boolean).join(': ')),
  ].filter(Boolean)
}

function visibleStoryboardClausesForShot(shot: Record<string, unknown>) {
  const rawClauses = [
    ...splitStoryboardVisualClauses(shot.visualAction),
    ...splitStoryboardVisualClauses(shot.action),
    ...readShotStoryboardActionClauses(shot).flatMap(splitStoryboardVisualClauses),
    ...splitStoryboardVisualClauses(shot.composition),
    ...splitStoryboardVisualClauses(shot.beat),
  ]
  const seen = new Set<string>()
  const unique: string[] = []
  for (const clause of rawClauses) {
    const key = slugify(clause)
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(clause)
  }
  return unique
}

function stripCaptionLeadingNames(value: string) {
  return value
    .replace(/^(?:[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,3},\s*){2,}[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,3}\s+/, '')
    .trim()
}

function phaseFallbackBeatCaption(shot: Record<string, unknown>, phaseIndex: number) {
  const title = cleanBeatCaptionText(shot.title)
  const fallbacks = [
    title ? `${title} begins as a clear visual moment.` : 'The take opens on urgent movement.',
    'The action intensifies across the frame.',
    'The obstacle becomes visible in the environment.',
    'The beat transitions toward the next shot.',
  ]
  return compactBeatCaptionSentence(fallbacks[phaseIndex % fallbacks.length], '', 13)
}

function makeBeatCaptionSentences(shot: Record<string, unknown>, occurrenceIndex: number, occurrenceCount: number) {
  const clauses = visibleStoryboardClausesForShot(shot)
  const phaseCount = Math.max(1, occurrenceCount)
  const phaseIndex = Math.min(3, Math.floor((occurrenceIndex / phaseCount) * 4))
  const lineOne = clauses[(occurrenceIndex * 2) % Math.max(1, clauses.length)] ?? phaseFallbackBeatCaption(shot, phaseIndex)
  const lineTwo = clauses[(occurrenceIndex * 2 + 1) % Math.max(1, clauses.length)]
    ?? phaseFallbackBeatCaption(shot, phaseIndex + 1)
  const first = stripCaptionLeadingNames(compactBeatCaptionSentence(lineOne, phaseFallbackBeatCaption(shot, phaseIndex), 13))
  const second = stripCaptionLeadingNames(compactBeatCaptionSentence(lineTwo, phaseFallbackBeatCaption(shot, phaseIndex + 1), 13))
  return [
    storyboardCaptionLooksComplete(first) ? first : phaseFallbackBeatCaption(shot, phaseIndex),
    storyboardCaptionLooksComplete(second) ? second : phaseFallbackBeatCaption(shot, phaseIndex + 1),
  ]
}

function storyboardCaptionLooksComplete(value: string) {
  const words = value.replace(/[.!?]+$/g, '').split(/\s+/).filter(Boolean)
  if (words.length < 3) return false
  const weakTailWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'with', 'into', 'onto', 'through', 'from', 'to', 'of', 'in', 'on', 'for', 'as', 'while', 'before', 'after', 'then', 'just', 'where'])
  return !weakTailWords.has(words[words.length - 1].toLowerCase())
}

function readShotStoryboardDirectionClauses(shot: Record<string, unknown>) {
  const clauses = [
    compactStoryboardSentence(shot.visualAction, '', 28),
    compactStoryboardSentence(shot.action, '', 28),
    ...readShotStoryboardActionClauses(shot).map((entry) => compactStoryboardSentence(entry, '', 22)),
    compactStoryboardSentence(shot.composition, '', 24),
    compactStoryboardSentence(shot.beat, '', 22),
  ].filter((entry) => storyboardCaptionLooksComplete(entry))
  const seen = new Set<string>()
  return clauses.filter((clause) => {
    const key = slugify(clause)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function storyboardSpeechVisualCue(shot: Record<string, unknown>, occurrenceIndex: number, occurrenceCount: number) {
  const dialogue = readShotDialogueRecords(shot).filter((entry) => readText(entry.line))
  if (dialogue.length === 0) return ''
  const targetIndex = Math.max(0, Math.min(occurrenceCount - 1, Math.floor(occurrenceCount / 2)))
  if (occurrenceIndex !== targetIndex) return ''
  const entry = dialogue[0]
  const speaker = naturalizeCinematicActorName(entry.speaker) || naturalizeCinematicActorName(entry.speakerName) || naturalizeCinematicActorName(entry.speakerRefId) || 'The speaker'
  const delivery = cleanBeatCaptionText(entry.delivery).toLowerCase()
  if (/\b(deadpan|even|flat|controlled|cold)\b/.test(delivery)) {
    return `${speaker}'s lips are barely parted, expression flat and precise.`
  }
  if (/\b(stunned|surprised|disbeliev|regret|skeptical|testing)\b/.test(delivery)) {
    return `${speaker}'s mouth is slightly open, guarded emotion visible in the face.`
  }
  if (/\b(quiet|sincere|intimate|soft|low|whisper)\b/.test(delivery)) {
    return `${speaker}'s mouth is barely open, the expression still and close-held.`
  }
  if (/\b(teasing|light|dry)\b/.test(delivery)) {
    return `${speaker}'s mouth is slightly open, a restrained half-smile held back.`
  }
  return `${speaker}'s mouth is slightly open while their expression carries the beat.`
}

function naturalStoryboardCameraPhrase(shot: Record<string, unknown>) {
  const framing = cleanBeatCaptionText(shot.framing)
  const cameraMovement = cleanBeatCaptionText(shot.cameraMovement)
  if (framing && cameraMovement) return `${framing}, composed for ${cameraMovement.toLowerCase()}.`
  if (framing) return `${framing}.`
  if (cameraMovement) return `The frame is composed for ${cameraMovement.toLowerCase()}.`
  return ''
}

function makeBeatPanelVisualDirection(shot: Record<string, unknown>, occurrenceIndex: number, occurrenceCount: number) {
  const clauses = readShotStoryboardDirectionClauses(shot)
  const primary = clauses[occurrenceIndex % Math.max(1, clauses.length)]
    || compactStoryboardSentence(shot.visualAction, readText(shot.beat), 28)
    || phaseFallbackBeatCaption(shot, occurrenceIndex)
  const secondary = clauses[(occurrenceIndex + 1) % Math.max(1, clauses.length)]
    || compactStoryboardSentence(shot.composition, 'Preserve the same character identity, wardrobe, lighting direction, and location logic.', 24)
  const speechCue = storyboardSpeechVisualCue(shot, occurrenceIndex, Math.max(1, occurrenceCount))
  const cameraPhrase = naturalStoryboardCameraPhrase(shot)
  const firstSentence = compactStoryboardSentence(primary, '', 30)
  const secondSentence = compactStoryboardSentence(speechCue || secondary, '', 30)
  const cameraSentence = compactStoryboardSentence(cameraPhrase, '', 24)
  const sentences = [firstSentence, secondSentence, cameraSentence].filter((entry, index, list) => {
    if (!entry) return false
    const key = slugify(entry)
    return key && list.findIndex((candidate) => slugify(candidate) === key) === index
  })
  return sentences.join(' ')
}

function buildCinematicBeatSheetPlan(blockScript: Record<string, unknown>) {
  const shots = Array.isArray(blockScript.shots) ? blockScript.shots.map(asRecord) : []
  const durationSeconds = Math.max(4, Math.min(15, Number(blockScript.durationSeconds ?? 8) || 8))
  const density = classifyCinematicVisualDensity({ durationSeconds, shots })
  const panelCount = adaptiveBeatSheetPanelCount({
    durationSeconds,
    shotCount: shots.length,
    visualDensity: density.visualDensity,
  })
  const durations = distributeBeatDurations(durationSeconds, panelCount)
  let cursor = 0
  const pendingBeats = durations.map((duration, index) => {
    const startSeconds = cursor
    const endSeconds = Math.min(durationSeconds, cursor + duration)
    cursor = endSeconds
    const shot = findShotForBeatMidpoint(shots, startSeconds + Math.max(0.1, (endSeconds - startSeconds) / 2))
    return {
      beatNumber: index + 1,
      startSeconds,
      endSeconds,
      timecode: `${formatTimecode(startSeconds)}-${formatTimecode(endSeconds)}`,
      shotId: readText(shot.shotId) || readText(shot.id),
      shot,
    }
  })
  const shotPanelCounts = new Map<string, number>()
  for (const beat of pendingBeats) {
    const key = beat.shotId || `beat_${beat.beatNumber}`
    shotPanelCounts.set(key, (shotPanelCounts.get(key) ?? 0) + 1)
  }
  const shotPanelIndexes = new Map<string, number>()
  const beats = pendingBeats.map((beat, index) => {
    const key = beat.shotId || `beat_${beat.beatNumber}`
    const occurrenceIndex = shotPanelIndexes.get(key) ?? 0
    shotPanelIndexes.set(key, occurrenceIndex + 1)
    const captions = makeBeatCaptionSentences(beat.shot, occurrenceIndex, shotPanelCounts.get(key) ?? 1)
    const panelVisual = makeBeatPanelVisualDirection(beat.shot, occurrenceIndex, shotPanelCounts.get(key) ?? 1)
    return {
      beatNumber: beat.beatNumber,
      startSeconds: beat.startSeconds,
      endSeconds: beat.endSeconds,
      timecode: beat.timecode,
      shotId: beat.shotId,
      title: readText(beat.shot.title) || `Beat ${index + 1}`,
      panelVisual,
      captionLines: captions,
      visual: [
        readText(beat.shot.visualAction),
        readText(beat.shot.action),
        readText(beat.shot.composition),
      ].filter(Boolean).join(' '),
    }
  })
  const layout = panelCount > 9
    ? { columns: 3, rows: 4, panelCount }
    : panelCount > 6
      ? { columns: 3, rows: 3, panelCount }
      : panelCount > 4
        ? { columns: 3, rows: 2, panelCount }
        : panelCount === 4
          ? { columns: 2, rows: 2, panelCount }
          : { columns: panelCount, rows: 1, panelCount }
  return {
    planningOnly: true,
    durationSeconds,
    panelCount,
    visualDensity: density.visualDensity,
    densityReason: density.densityReason,
    shotStripMode: density.shotStripMode,
    layout,
    beats,
  }
}

function keyframeImageSizeForAspectRatio(aspectRatio: string) {
  const parsed = parseAspectRatio(aspectRatio)
  const ratio = parsed.width / parsed.height
  if (ratio >= 2) return { width: 2048, height: 960 }
  if (ratio > 1.2) return { width: 1792, height: 1024 }
  if (ratio < 0.55) return { width: 1024, height: 1792 }
  if (ratio < 0.9) return { width: 1280, height: 1792 }
  return { width: 1536, height: 1536 }
}

function directionSheetImageSizeForAspectRatio(aspectRatio: string) {
  const parsed = parseAspectRatio(aspectRatio)
  const ratio = parsed.width / parsed.height
  if (ratio < 0.75) return { width: 1536, height: 2304 }
  if (ratio > 1.35) return { width: 2304, height: 1536 }
  return { width: 2048, height: 2048 }
}

function directionSheetShotLine(shot: Record<string, unknown>, index: number) {
  const start = formatTimecode(readShotStartSeconds(shot))
  const end = formatTimecode(readShotEndSeconds(shot))
  const title = readText(shot.title) || `Shot ${index + 1}`
  const visual = compactStoryboardSentence(
    readText(shot.visualAction) || readText(shot.action) || readText(shot.beat),
    'Clear visible action with readable subject blocking.',
    32,
  )
  const composition = compactStoryboardSentence(
    readText(shot.composition) || readText(shot.framing),
    'Maintain coherent spatial layout and continuity.',
    24,
  )
  const camera = compactStoryboardSentence(
    [readText(shot.framing), readText(shot.cameraMovement)].filter(Boolean).join(' '),
    'Camera placement should be readable from the scene layout.',
    18,
  )
  return `${index + 1}. ${start}-${end} ${title}: ${visual} Composition: ${composition} Camera: ${camera}`
}

function directionSheetLocations(blockScript: Record<string, unknown>) {
  const shots = Array.isArray(blockScript.shots) ? blockScript.shots.map(asRecord) : []
  const names = [
    readText(blockScript.location),
    ...shots.map((shot) => readText(shot.location)),
  ].filter(Boolean)
  const seen = new Set<string>()
  return names.filter((name) => {
    const key = slugify(name)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 3)
}

export function buildCinematicDirectionSheetPrompt(input: {
  blockScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  aspectRatio: string
  prompt: string
  guidance: OutputGuidanceBundle | null
  debugCinematicStoryboardStyleSafeMode?: boolean
  cinematicStoryboardStyleOverride?: string
}) {
  const beatSheetPlan = buildCinematicBeatSheetPlan(input.blockScript)
  const shots = Array.isArray(input.blockScript.shots) ? input.blockScript.shots.map(asRecord) : []
  const entities = compactCinematicEntityAnchors(input.assetPack, 10)
  const entityAnchorLines = formatCinematicEntityAnchorLines(entities)
  const safeMode = input.debugCinematicStoryboardStyleSafeMode === true
  const sheetStyle = safeMode
    ? (readText(input.cinematicStoryboardStyleOverride) || DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT)
    : 'project/user visual style from the brief and world context'
  const styleInstruction = safeMode
    ? `Visual style: ${sheetStyle}. This is a stylized production-board translation, not photorealistic likeness. Apply the style to the cinematic panels and hero frame while preserving reference image identity anchors, silhouette, wardrobe, palette, props, material cues, and environment geometry.`
    : 'Visual style: follow the project/user visual style from the brief and world context; maintain palette, wardrobe, environment logic, lighting direction, and character identity across the sheet.'
  const imageSize = directionSheetImageSizeForAspectRatio(input.aspectRatio)
  const shotLines = shots.length > 0
    ? shots.slice(0, 12).map(directionSheetShotLine).join('\n')
    : beatSheetPlan.beats.map((beat) => `${beat.beatNumber}. ${beat.timecode}: ${beat.panelVisual}`).join('\n')
  const timedPanelLines = beatSheetPlan.beats.map((beat) => [
    `Panel ${String(beat.beatNumber).padStart(2, '0')} [${beat.timecode}]`,
    `Visual: ${beat.panelVisual}`,
    `Small label only: ${beat.captionLines[0]}`,
  ].join('\n')).join('\n\n')
  const locations = directionSheetLocations(input.blockScript)
  return {
    beatSheetPlan,
    directionSheetPlan: {
      planningOnly: true,
      sheetKind: 'shot_reference_sheet',
      durationSeconds: beatSheetPlan.durationSeconds,
      aspectRatio: input.aspectRatio,
      imageSize,
      panelCount: beatSheetPlan.panelCount,
      visualDensity: beatSheetPlan.visualDensity,
      densityReason: beatSheetPlan.densityReason,
      shotStripMode: beatSheetPlan.shotStripMode,
      locationNames: locations,
    },
    imageSize,
    prompt: [
      'Create one CINEMATIC DIRECTION SHEET reference image for a single video take.',
      `Canvas: large production-board layout, approximately ${imageSize.width}x${imageSize.height}, clean dark neutral background, sparse readable labels, no decorative poster treatment.`,
      `The final video aspect ratio is ${input.aspectRatio}. Any cinematic shot panels and hero frame must use an internal ${input.aspectRatio} crop.`,
      'This is a visual reference sheet, not a screenplay page and not a text table.',
      '',
      'Required sheet sections:',
      '1. HERO FRAME: one large cinematic composition showing the dominant visual read of the take, with subject identity, wardrobe, props, lighting, and environment locked.',
      `2. TIMED SHOT STRIP: ${beatSheetPlan.panelCount} ${beatSheetPlan.shotStripMode} cinematic panels in sequence, left-to-right, each showing a meaningful visible action/cut beat from the take.`,
      '3. LOCATION FLOOR MAP: simplified top-down map of the scene space with subject positions, movement arrows, camera positions, and camera direction cones.',
      '4. CAMERA LAYOUT: compact visual callouts for each shot camera placement, framing, lens feel, and motion path.',
      '5. LIGHTING / MOOD / STYLE: key light direction, practical lights, palette swatches, atmosphere, weather, haze, reflections, and contrast level.',
      '6. CONTINUITY ANCHORS: compact visual callouts for wardrobe, silhouettes, props, character marks, and environment features.',
      beatSheetPlan.visualDensity === 'slow'
        ? 'Density direction: sparse slow-scene coverage. Make the hero frame, actor blocking, gaze/reaction positions, table/room geography, and lighting mood larger and clearer than the shot strip. Do not invent second-by-second panels.'
        : beatSheetPlan.visualDensity === 'action'
          ? 'Density direction: dense action coverage. Emphasize obstacle/contact beats, movement arrows, spatial transitions, and readable impact geometry across the shot strip.'
          : 'Density direction: balanced coverage. Use panels only for meaningful cut/action changes, while the map, camera plan, and lighting notes carry continuity.',
      '',
      'Visual-only boundaries:',
      '- Do not include spoken words, foley, music, audio notes, technical service names, runtime instructions, JSON, or workflow metadata.',
      '- If a shot contains speech, show only visible performance cues such as lips parted, gaze, posture, or reaction.',
      '- Labels may identify planning marks such as CAM A, KEY LIGHT, MOVE, EXIT, or SHOT 01, but keep labels sparse and readable.',
      '- Do not create dense paragraphs, UI panels, screenplay columns, captions as story text, watermarks, logos, or poster titles.',
      '',
      `Take title: ${readText(input.blockScript.title) || 'Compiled cinematic take'}`,
      `Take duration: ${beatSheetPlan.durationSeconds} seconds exactly.`,
      `Shot density: ${beatSheetPlan.visualDensity}; shot-strip mode: ${beatSheetPlan.shotStripMode}; panel count: ${beatSheetPlan.panelCount}.`,
      `Density reason: ${beatSheetPlan.densityReason}.`,
      locations.length > 0 ? `Location basis: ${locations.join(', ')}` : '',
      '',
      'Timed shot cuts:',
      shotLines,
      '',
      'Shot-strip panel visuals:',
      timedPanelLines,
      '',
      'Floor map requirements:',
      'Show a schematic overhead plan of the location with walls, doors, table/vehicle/terrain/thresholds where relevant, subject start/end positions, movement arrows, camera cones, and practical light sources. Keep it simple enough to read at a glance.',
      '',
      'Camera and lighting requirements:',
      'Show camera positions and movement arrows that match the shot strip. Show key light direction, fill/shadow side, practical source colors, atmosphere, reflections, and mood palette.',
      entities.length > 0 ? 'Canonical visual identity anchors from appearance only:' : '',
      entityAnchorLines,
      input.prompt ? `User brief: ${input.prompt}` : '',
      styleInstruction,
      safeMode ? 'Reference fidelity: use uploaded/entity reference images as strict identity, costume, prop, palette, and spatial-continuity anchors, but render the sheet in the safe painterly comic-book production style rather than realistic likeness.' : '',
      `Storyboard style safe mode: ${safeMode ? 'painterly comic-book' : 'disabled'}.`,
      'The final image should read like a professional director/DP previsualization board: shot progression, spatial logic, camera plan, lighting plan, and continuity in one sheet.',
    ].filter(Boolean).join('\n\n'),
  }
}

export function buildCinematicBeatSheetPrompt(input: {
  blockScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  aspectRatio: string
  prompt: string
  guidance: OutputGuidanceBundle | null
  debugCinematicStoryboardStyleSafeMode?: boolean
  cinematicStoryboardStyleOverride?: string
}) {
  const beatSheetPlan = buildCinematicBeatSheetPlan(input.blockScript)
  const entities = compactCinematicEntityAnchors(input.assetPack, 10)
  const entityAnchorLines = formatCinematicEntityAnchorLines(entities)
  const safeMode = input.debugCinematicStoryboardStyleSafeMode === true
  const storyboardStyle = safeMode
    ? (readText(input.cinematicStoryboardStyleOverride) || DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT)
    : 'project/user visual style from the brief and world context'
  const styleInstruction = safeMode
    ? `Visual style: ${storyboardStyle}. This is a stylized production-board translation, not photorealistic likeness. Apply the style to every panel while preserving each reference image's identity anchors, silhouette, wardrobe, palette, props, material cues, and environment geometry.`
    : 'Visual style: follow the project/user visual style from the brief and world context; maintain palette, wardrobe, environment logic, lighting direction, and character identity across all panels.'
  const imageSize = beatSheetPlan.panelCount > 9
    ? { width: 1536, height: 2304 }
    : beatSheetPlan.panelCount > 6
      ? { width: 1536, height: 1536 }
      : { width: 1536, height: 1024 }
  const beatLines = beatSheetPlan.beats.map((beat) => [
    `BEAT ${String(beat.beatNumber).padStart(2, '0')} [${beat.timecode}]`,
    `Panel visual: ${beat.panelVisual}`,
    `Caption line 1: ${beat.captionLines[0]}`,
    `Caption line 2: ${beat.captionLines[1]}`,
  ].join('\n')).join('\n\n')
  return {
    beatSheetPlan,
    imageSize,
    prompt: [
      'Create a CINEMATIC BEAT SHEET planning image for video pre-production.',
      `Canvas: pure black (#000000), ${beatSheetPlan.layout.rows} rows x ${beatSheetPlan.layout.columns} columns, ${beatSheetPlan.panelCount} timed panels, approximately ${imageSize.width}x${imageSize.height}.`,
      `Every panel is a complete cinematic composition with an internal ${input.aspectRatio} video crop. Use thin black gutters only.`,
      'For each beat, draw the Panel visual as the actual storyboard frame. Caption lines are only the small readable text below that panel.',
      'Below each panel, include a narrow black caption band with panel number, timecode, and exactly two short caption sentences in clean white sans-serif.',
      'No title banner. No footer. No colored gridlines. No table columns. No director notes. No SFX/BGM columns. No UI-like layout. No watermark.',
      'Caption rules: describe only what the viewer sees. Do not place entity lists, JSON, truncated words, ellipses, camera notes, spoken dialogue, or repeated captions in caption bands.',
      'Storyboard rules: every Panel visual must be action-based and visually directed, with clear subject blocking, obstacle/contact, environment geometry, and continuity from the previous panel.',
      'Image prompt boundary: this board is visual-only. Do not render or describe spoken dialogue, foley, music, or audio cues; those belong to the video prompt, not the storyboard image.',
      `Take title: ${readText(input.blockScript.title) || 'Compiled cinematic take'}`,
      `Take duration: ${beatSheetPlan.durationSeconds} seconds exactly.`,
      'Story beats:',
      beatLines,
      `Shot density: ${beatSheetPlan.visualDensity}; shot-strip mode: ${beatSheetPlan.shotStripMode}; panel count: ${beatSheetPlan.panelCount}.`,
      `Density reason: ${beatSheetPlan.densityReason}.`,
      'Panel-count rule: these panels represent meaningful visual cuts or action phases, not every second of runtime. Do not invent extra panels for slow micro-continuity.',
      entities.length > 0 ? 'Canonical visual identity anchors from appearance only:' : '',
      entityAnchorLines,
      input.prompt ? `User brief: ${input.prompt}` : '',
      styleInstruction,
      safeMode ? 'Reference fidelity: use uploaded/entity reference images as strict identity, costume, prop, palette, and spatial-continuity anchors, but render the board in the safe painterly comic-book production style rather than a realistic likeness.' : '',
      `Storyboard style safe mode: ${safeMode ? 'painterly comic-book' : 'disabled'}.`,
      'This image is both a planning artifact and the primary Seedance visual reference. It must look like a clean production beat sheet, not a finished poster.',
    ].filter(Boolean).join('\n\n'),
  }
}

function buildCinematicKeyframePromptPack(input: {
  blockScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  aspectRatio: string
  prompt: string
  debugCinematicStoryboardStyleSafeMode?: boolean
  cinematicStoryboardStyleOverride?: string
}) {
  const shots = Array.isArray(input.blockScript.shots) ? input.blockScript.shots.map(asRecord) : []
  const durationSeconds = Math.max(4, Math.min(15, Number(input.blockScript.durationSeconds ?? 8) || 8))
  const entities = compactCinematicEntityAnchors(input.assetPack, 8)
  const safeMode = input.debugCinematicStoryboardStyleSafeMode === true
  const storyboardStyle = safeMode
    ? (readText(input.cinematicStoryboardStyleOverride) || DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT)
    : ''
  const picks = [
    { keyframeIndex: 0, label: 'opening', timeSeconds: 0, ref: '@Image1' },
    { keyframeIndex: 1, label: 'midpoint', timeSeconds: durationSeconds / 2, ref: '@Image2' },
    { keyframeIndex: 2, label: 'ending', timeSeconds: Math.max(0, durationSeconds - 0.5), ref: '@Image3' },
  ]
  const keyframePrompts = picks.map((pick) => {
    const shot = findShotForBeatMidpoint(shots, pick.timeSeconds)
    const visual = [
      readText(shot.subject),
      readText(shot.action),
      readText(shot.composition),
    ].filter(Boolean).join(' ') || readText(input.blockScript.summary) || input.prompt
    return {
      keyframeIndex: pick.keyframeIndex,
      label: pick.label,
      referenceName: pick.ref,
      timeSeconds: Number(pick.timeSeconds.toFixed(2)),
      shotId: readText(shot.shotId) || readText(shot.id),
      prompt: [
        `Create one clean standalone GPT Image 2 cinematic keyframe for the ${pick.label} of a ${durationSeconds}-second video take.`,
        `Frame aspect ratio: ${input.aspectRatio}. This keyframe will be used as ${pick.ref} for Seedance reference-to-video.`,
        `Visible moment: ${visual}`,
        `Framing and lens: ${readText(shot.camera) || 'cinematic lens, readable subject silhouette, coherent spatial blocking'}.`,
        'Lighting and palette: preserve the world palette, lighting direction, wardrobe, environment logic, and mood from the references.',
        safeMode ? `Render style: ${storyboardStyle}. This keyframe is a stylized production reference, not photorealistic likeness; preserve reference identity anchors, silhouette, wardrobe, props, palette, and environment geometry tightly.` : '',
        entities.length > 0 ? `Identity/world locks: ${compactForPrompt({ entities }, 2200)}` : '',
        input.prompt ? `User brief: ${input.prompt}` : '',
        'No text, no captions, no UI, no collage, no panels, no watermark. Do not render a storyboard sheet. Make it a single cinematic still image.',
      ].filter(Boolean).join('\n'),
    }
  })
  return {
    keyframePlan: {
      durationSeconds,
      aspectRatio: input.aspectRatio,
      keyframes: keyframePrompts.map((entry) => ({
        keyframeIndex: entry.keyframeIndex,
        label: entry.label,
        referenceName: entry.referenceName,
        timeSeconds: entry.timeSeconds,
        shotId: entry.shotId,
      })),
    },
    keyframePrompts,
  }
}

function formatSeedanceDialogueForShot(shot: Record<string, unknown>) {
  const dialogueRecords = readShotDialogueRecords(shot).filter((entry) => readText(entry.line))
  if (dialogueRecords.length === 0) return ''
  return dialogueRecords.map((entry) => {
    const speaker = readText(entry.speaker) || readText(entry.speakerName) || readText(entry.speakerRefId) || 'Voice'
    const line = readText(entry.line).replace(/^["']|["']$/g, '')
    const delivery = readText(entry.delivery)
    return `${speaker}: "${line}"${delivery ? ` (${delivery})` : ''}`
  }).join(' ')
}

function formatSeedanceAudioForShot(shot: Record<string, unknown>, generateAudio: boolean) {
  if (!generateAudio) return 'minimal or none'
  const cueRecords = Array.isArray(shot.audioCues) ? shot.audioCues.map((cue) => ({ cue })) : []
  const audioRecords = Array.isArray(shot.audio) ? shot.audio.map(asRecord) : []
  const cues = [
    ...cueRecords.map((entry) => readText(entry.cue)),
    ...audioRecords.map((entry) => [readText(entry.kind), readText(entry.cue)].filter(Boolean).join(': ')),
  ].filter(Boolean)
  if (cues.length > 0) return cues.join('; ')
  return readText(shot.audio) || 'natural scene sound'
}

function formatSeedanceActionForShot(shot: Record<string, unknown>) {
  return cleanBeatCaptionText(shot.action)
    || cleanBeatCaptionText(shot.visualAction)
    || cleanBeatCaptionText(shot.composition)
    || cleanBeatCaptionText(shot.beat)
    || 'one coherent visible action'
}

export function rewriteSeedanceReferenceLegend(prompt: string, manifest: SeedanceReferenceManifestEntry[], referencePolicy = '') {
  const legend = [
    '[REFERENCE LEGEND]',
    formatSeedanceReferenceManifest(manifest),
    referencePolicy ? `Reference fallback mode: ${referencePolicy}.` : '',
  ].filter(Boolean).join('\n')
  if (/\[REFERENCE LEGEND\][\s\S]*?(?=\n\n\[[A-Z][^\]]+\]|\s*$)/.test(prompt)) {
    return prompt.replace(/\[REFERENCE LEGEND\][\s\S]*?(?=\n\n\[[A-Z][^\]]+\]|\s*$)/, legend)
  }
  if (/\[IMAGE REFERENCES \/ LEGEND\][\s\S]*?(?=\n\n\[[A-Z][^\]]+\]|\s*$)/.test(prompt)) {
    return prompt.replace(/\[IMAGE REFERENCES \/ LEGEND\][\s\S]*?(?=\n\n\[[A-Z][^\]]+\]|\s*$)/, legend)
  }
  return [prompt, '', legend].join('\n')
}

export function buildCinematicVideoPrompt(input: {
  blockScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle | null
  durationSeconds: number
  aspectRatio: string
  resolution: string
  generateAudio: boolean
  referenceImageCount: number
  seedanceReferenceManifest?: SeedanceReferenceManifestEntry[]
  cinematicReferenceMode?: string
  debugCinematicStoryboardStyleSafeMode?: boolean
  cinematicStoryboardStyleOverride?: string
}) {
  const shots = Array.isArray(input.blockScript.shots) ? input.blockScript.shots.map(asRecord) : []
  const entities = compactCinematicEntityAnchors(input.assetPack, 8)
  const cinematicReferenceMode = normalizeCinematicReferenceMode(input.cinematicReferenceMode)
  const keyframeCount = cinematicReferenceMode === 'keyframes'
    ? Math.min(3, Math.max(0, input.referenceImageCount))
    : 0
  const truthSourceMode = readText(input.blockScript.truthSourceMode)
    || (String(input.prompt).toLowerCase().match(/\b(ugc|phone|selfie|tiktok|reel|creator)\b/) ? 'UGC / PHONE'
      : String(input.prompt).toLowerCase().match(/\b(broadcast|sports|live tv|news)\b/) ? 'BROADCAST SETUP'
        : String(input.prompt).toLowerCase().match(/\b(anime|animation|animated|2d)\b/) ? '2D / ANIMATION STYLE'
          : 'CINEMATIC SETUP')
  const targetVideoStyle = inferCinematicTargetVideoStyle({
    prompt: input.prompt,
    truthSourceMode,
    blockScript: input.blockScript,
  })
  const storyboardStyleSafeMode = input.debugCinematicStoryboardStyleSafeMode === true
  const storyboardStyle = storyboardStyleSafeMode
    ? (readText(input.cinematicStoryboardStyleOverride) || DEFAULT_CINEMATIC_STORYBOARD_STYLE_PROMPT)
    : ''
  const fallbackImageReferences = Array.from({ length: Math.max(0, input.referenceImageCount) }, (_, index) => ({
    label: cinematicReferenceMode === 'keyframes'
      ? index === 0 ? 'opening keyframe' : index === 1 ? 'midpoint keyframe' : index === 2 ? 'ending keyframe' : `supporting reference image ${index + 1}`
      : index === 0 ? (cinematicReferenceMode === 'shot_reference_sheet' ? 'cinematic direction sheet' : 'storyboard sheet') : `supporting reference image ${index + 1}`,
    role: index === 0 && cinematicReferenceMode !== 'keyframes'
      ? cinematicReferenceMode === 'shot_reference_sheet' ? 'direction_sheet' : 'storyboard_sheet'
      : cinematicReferenceMode === 'keyframes' && index < keyframeCount ? 'keyframe' : 'image_reference',
  }))
  const referenceManifest = input.seedanceReferenceManifest && input.seedanceReferenceManifest.length > 0
    ? input.seedanceReferenceManifest
    : buildSeedanceReferenceManifest({ imageReferences: fallbackImageReferences, cinematicReferenceMode })
  const timeline = shots.length > 0
    ? shots.map((shot) => {
      const start = formatTimecode(readShotStartSeconds(shot))
      const end = formatTimecode(readShotEndSeconds(shot))
      const dialogue = formatSeedanceDialogueForShot(shot)
      return [
        `[${start}-${end}] Shot: ${readText(shot.subject) || readText(shot.title)}`,
        `Camera: ${readText(shot.camera) || 'clear cinematic framing'}`,
        `Action: ${formatSeedanceActionForShot(shot)}`,
        'Physics: natural body/object motion and coherent spatial layout',
        dialogue ? `Dialogue: ${dialogue}` : '',
        `Audio: ${formatSeedanceAudioForShot(shot, input.generateAudio)}`,
      ].filter(Boolean).join(' | ')
    }).join('\n')
    : `[00:00-${formatTimecode(input.durationSeconds)}] Shot: ${readText(input.blockScript.summary) || input.prompt} | Camera: clear cinematic framing | Action: one coherent visible action | Physics: natural motion | Audio: ${input.generateAudio ? 'natural scene sound' : 'minimal or none'}`
  const continuityLock = [
    'Maintain the same subject identity, face/body shape, wardrobe/product details, color palette, environment logic, and lighting style across the full clip.',
    entities.length > 0 ? compactForPrompt({ entities }, 2200) : '',
  ].filter(Boolean).join('\n')
  const storyboardInstruction = seedanceStoryboardManifestInstruction(referenceManifest)
  const artifactBan = seedanceProductionBoardArtifactBan(referenceManifest)
  const labanBlock = seedanceLabanMovementBlock(shots, input.prompt)
  return [
    `[${truthSourceMode}]`,
    `Generate one ${input.durationSeconds}-second Seedance 2 reference-to-video clip at ${input.aspectRatio}, ${input.resolution}.`,
    `Target video style: ${targetVideoStyle}.`,
    input.generateAudio ? 'Audio: native audio may include restrained music, natural foley, and any authored dialogue/audio cue on the exact timeline.' : 'Audio: keep generated audio minimal or absent.',
    '',
    '[REFERENCE LEGEND]',
    formatSeedanceReferenceManifest(referenceManifest),
    storyboardInstruction,
    cinematicReferenceMode === 'keyframes'
      ? 'Use keyframes as visual anchors for the opening, midpoint, and ending states when they are attached.'
      : cinematicReferenceMode === 'shot_reference_sheet'
        ? storyboardStyleSafeMode
          ? `If a cinematic direction sheet is attached, follow its timed shot strip, blocking, camera layout, spatial logic, lighting direction, hero frame, identity anchors, and continuity, but render the final clip in the target video style: ${targetVideoStyle}. The sheet may be stylized as ${storyboardStyle}; do not copy that style unless it matches the target video style.`
          : 'If a cinematic direction sheet is attached, follow its timed shot progression, blocking, camera layout, spatial logic, lighting direction, hero frame, identity anchors, and continuity.'
      : storyboardStyleSafeMode
        ? `If a storyboard sheet is attached, use it for panel order, blocking, composition, identity anchors, and continuity, but render the final clip in the target video style: ${targetVideoStyle}. The storyboard may be stylized as ${storyboardStyle}; do not copy that style unless it matches the target video style.`
        : '',
    '',
    '[TIMESTAMPED SHOT CALL SHEET]',
    timeline,
    '',
    '[CONSISTENCY LOCK]',
    continuityLock,
    labanBlock ? `\n[MOVEMENT LOGIC]\n${labanBlock}` : '',
    '',
    '[POSITIVE CONSTRAINTS]',
    '- stable face and body proportions',
    '- clean readable silhouette',
    '- natural physical motion',
    '- continuous lighting direction',
    '- coherent spatial layout',
    `- ${artifactBan}`,
    input.prompt ? `\nUser brief: ${input.prompt}` : '',
  ].filter(Boolean).join('\n\n')
}

function cinematicV2ReferenceIds(assetPack: Record<string, unknown>, context: Record<string, unknown>) {
  const entityRefs = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  const assetRefIds = entityRefs.map((entity) => readText(entity.key)).filter(Boolean)
  const contextRefs = Array.isArray(context.entities)
    ? context.entities.map(asRecord).map((entity) => readText(entity.key)).filter(Boolean)
    : []
  return [...new Set([...assetRefIds, ...contextRefs])]
}

function cinematicV2LocationRefId(assetPack: Record<string, unknown>, context: Record<string, unknown>) {
  const entities = [
    ...(Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []),
    ...(Array.isArray(context.entities) ? context.entities.map(asRecord) : []),
  ]
  const location = entities.find((entity) => ['place', 'environment', 'location', 'location_spot'].includes(readText(entity.type) || readText(entity.nodeType ?? entity.node_type)))
  return readText(location?.key) || null
}

function cinematicV2CharacterRefIds(assetPack: Record<string, unknown>, context: Record<string, unknown>) {
  const entities = [
    ...(Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []),
    ...(Array.isArray(context.entities) ? context.entities.map(asRecord) : []),
  ]
  const characters = entities
    .filter((entity) => ['actor', 'character', 'group'].includes(readText(entity.type) || readText(entity.nodeType ?? entity.node_type)))
    .map((entity) => readText(entity.key))
    .filter(Boolean)
  return [...new Set(characters)].slice(0, 4)
}

function buildFallbackCinematicV2ScreenplayDraft(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const sequenceUnits = Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord) : []
  const primarySequence = sequenceUnits[0] ?? null
  const primarySequenceMetadata = asRecord(primarySequence?.metadata)
  const primarySequenceCustom = asRecord(primarySequence?.customProperties)
  const primarySequenceData = asRecord(primarySequenceCustom.sequence)
  const sequenceTitle = readText(primarySequence?.name)
  const worldTitle = readText(wiki.title)
  const title = sequenceTitle
    ? `${worldTitle ? `${worldTitle} - ` : ''}${sequenceTitle}`
    : worldTitle
      ? `${worldTitle} Cinematic Scene`
      : 'Cinematic Scene'
  const characterRefIds = cinematicV2CharacterRefIds(input.assetPack, input.context)
  const locationRefId = cinematicV2LocationRefId(input.assetPack, input.context)
  const sequenceStoryLines = [
    readText(primarySequence?.summary),
    readText(primarySequence?.context),
    readText(primarySequenceData.synopsis),
    readText(primarySequenceData.dramaticQuestion),
    readText(primarySequenceData.outcome),
  ].filter(Boolean)
  const rawLines = input.prompt
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const storyLines = sequenceStoryLines.length > 0
    ? sequenceStoryLines.slice(0, 10)
    : rawLines.length > 0
      ? rawLines.slice(0, 10)
      : [readText(wiki.logline) || 'A tense cinematic moment unfolds from the selected world context.']
  const sequenceRefIds = [
    ...readStringArray(primarySequenceData.actorKeys),
    ...readStringArray(primarySequenceData.affectedEntityKeys),
    ...readStringArray(primarySequenceData.sourceRefIds),
    ...readStringArray(primarySequenceData.entityKeys),
    ...readStringArray(primarySequenceData.locationKeys),
    ...readStringArray(primarySequenceData.propKeys),
  ]
  const consequenceRefs = Array.isArray(primarySequenceData.consequences)
    ? primarySequenceData.consequences.flatMap((entry) => readStringArray(asRecord(entry).affectedEntityKeys))
    : []
  const sourceRefIds = [...new Set([
    ...characterRefIds,
    ...(locationRefId ? [locationRefId] : []),
    ...sequenceRefIds,
    ...consequenceRefs,
  ].filter(Boolean))]
  const visualMotifs = [
    ...readStringArray(wiki.visualMotifs),
    readText(primarySequenceMetadata.visualDescription),
  ].filter(Boolean).slice(0, 8)
  const screenplayMarkdown = [
    `# ${title}`,
    '',
    '## Scene Treatment',
    storyLines.map((line) => `- ${line}`).join('\n'),
    '',
    '## Shot-Readable Screenplay',
    storyLines.map((line, index) => {
      if (/["“”]/.test(line)) return `SHOT ${index + 1} - DIALOGUE COVERAGE\n${line}`
      return `SHOT ${index + 1} - VISIBLE ACTION\n${line}`
    }).join('\n\n'),
  ].join('\n')
    .replace(/^SHOT\s+\d+\s+-\s+DIALOGUE COVERAGE$/gim, '#shot dialogue coverage | ~3s')
    .replace(/^SHOT\s+\d+\s+-\s+VISIBLE ACTION$/gim, '#shot visible action | ~3s')
  const fallbackShots = storyLines.slice(0, 12).map((line, index) => {
    const visible = characterRefIds.map((refId) => nameForCinematicRef(input.assetPack, refId) || refId).join(', ') || 'selected character refs'
    const location = locationRefId ? nameForCinematicRef(input.assetPack, locationRefId) || locationRefId : 'selected story location'
    const shotNumber = String(index + 1).padStart(3, '0')
    const dialogueMatch = line.match(/([^:]{2,40}):\s*["“]?(.+?)["”]?$/)
    return [
      `### SHOT ${shotNumber}: ${index === 0 ? 'Opening visual beat' : index === storyLines.length - 1 ? 'Final visual beat' : 'Escalating visual beat'}`,
      `Duration: ${index === 0 ? 4 : 3}s`,
      `Visible: ${visible}`,
      `Location: ${location}`,
      'Props: ',
      `Visual Action: ${line}`,
      `Camera: ${index === 0 ? 'wide establishing frame with a controlled push-in' : /["“”]/.test(line) ? 'medium close coverage with subtle breathing motion' : 'readable cinematic action frame with grounded movement'}`,
      `Lighting: ${visualMotifs[0] || readStringArray(wiki.toneTags).join(', ') || 'motivated cinematic light from the world palette'}`,
      `Performance: ${index === 0 ? 'clear setup pressure' : index === storyLines.length - 1 ? 'visible consequence and changed intent' : 'controlled escalation through body language and gaze'}`,
      dialogueMatch ? `Dialogue: ${dialogueMatch[1].trim()}: "${dialogueMatch[2].trim()}"` : 'Dialogue: ',
      `Transition: ${index === storyLines.length - 1 ? 'cut to black or clean scene exit' : 'match action into the next beat'}`,
    ].join('\n')
  })
  const visualShotScriptMarkdown = [
    `# ${title}`,
    '',
    'Contract: visual_shot_script_v1',
    '',
    '## Visual Premise',
    storyLines[0] ?? 'A cinematic moment unfolds through visible action and motivated camera coverage.',
    '',
    fallbackShots.join('\n\n'),
  ].join('\n')
  return cinematicV2ScreenplayDraftSchema.parse({
    title,
    screenplayMarkdown,
    sceneObjective: storyLines[0] ?? 'Stage the requested cinematic moment clearly.',
    emotionalArc: storyLines.length > 1 ? 'setup -> pressure -> consequence' : 'focused dramatic pressure',
    suggestedDurationSeconds: primarySequence
      ? Math.min(180, Math.max(45, storyLines.length * 12))
      : Math.min(180, Math.max(12, storyLines.length * 5)),
    sourceRefIds,
    visualMotifs,
    diagnostics: ['Fallback screenplay draft generated deterministically.'],
    metadata: { scriptContract: 'screenplay_with_shot_markers_v1', deterministicFallback: true },
  })
}

function normalizeCinematicV2ScreenplayMarkdown(value: string) {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i)
  const unfenced = (fenced?.[1] ?? trimmed).trim()
  if (!unfenced.startsWith('{')) return unfenced
  try {
    const parsed = parseJsonObject(unfenced)
    return readText(asRecord(parsed).screenplayMarkdown) || readText(asRecord(parsed).text) || unfenced
  } catch {
    return unfenced
  }
}

function inferCinematicV2ScreenplayTitle(markdown: string, fallbackTitle: string) {
  const heading = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line))
  return heading ? heading.replace(/^#{1,3}\s+/, '').trim().slice(0, 120) || fallbackTitle : fallbackTitle
}

function normalizeVisualScriptLookupTerm(value: string) {
  return value
    .toLowerCase()
    .replace(/[`"'()[\]{}]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function splitVisualScriptList(value: string) {
  const clean = value
    .replace(/\band\b/gi, ',')
    .split(/[,;|/]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry && !/^none|n\/a|unknown|selected\b/i.test(entry))
  return [...new Set(clean)]
}

function parseVisualScriptDurationSeconds(value: string, fallback = 3) {
  const range = value.match(/(\d+(?:\.\d+)?)\s*(?:-|to|–|—)\s*(\d+(?:\.\d+)?)/i)
  if (range) {
    const left = Number(range[1])
    const right = Number(range[2])
    if (Number.isFinite(left) && Number.isFinite(right)) return Math.max(0.5, Math.min(8, (left + right) / 2))
  }
  const match = value.match(/(\d+(?:\.\d+)?)/)
  const parsed = match ? Number(match[1]) : fallback
  return Number.isFinite(parsed) ? Math.max(0.5, Math.min(8, parsed)) : fallback
}

function visualScriptEntityCatalog(assetPack: Record<string, unknown>, context: Record<string, unknown>) {
  const entities = [
    ...(Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []),
    ...(Array.isArray(context.entities) ? context.entities.map(asRecord) : []),
  ]
  const byAlias = new Map<string, Record<string, unknown>>()
  for (const entity of entities) {
    const key = readText(entity.key) || readText(entity.id)
    if (!key) continue
    const aliases = [
      key,
      readText(entity.name),
      readText(entity.label),
      readText(entity.title),
    ].filter(Boolean)
    for (const alias of aliases) {
      const normalized = normalizeVisualScriptLookupTerm(alias)
      if (normalized && !byAlias.has(normalized)) byAlias.set(normalized, entity)
    }
  }
  return byAlias
}

function visualScriptEntityKind(entity: Record<string, unknown>) {
  return readText(entity.type) || readText(entity.role) || readText(entity.nodeType ?? entity.node_type)
}

function resolveVisualScriptRefs(input: {
  raw: string
  catalog: Map<string, Record<string, unknown>>
  allowedKinds?: string[]
}) {
  const refIds: string[] = []
  const unknownNames: string[] = []
  for (const name of splitVisualScriptList(input.raw)) {
    const normalized = normalizeVisualScriptLookupTerm(name)
    const entity = input.catalog.get(normalized)
    if (!entity) {
      unknownNames.push(name)
      continue
    }
    const key = readText(entity.key) || readText(entity.id)
    const kind = visualScriptEntityKind(entity)
    if (input.allowedKinds && input.allowedKinds.length > 0 && !input.allowedKinds.includes(kind)) {
      unknownNames.push(name)
      continue
    }
    if (key) refIds.push(key)
  }
  return { refIds: [...new Set(refIds)], unknownNames }
}

function parseVisualShotScriptBlocks(markdown: string) {
  const lines = markdown.split(/\r?\n/)
  const blocks: Array<{ index: number; title: string; fields: Record<string, string> }> = []
  let current: { index: number; title: string; fields: Record<string, string> } | null = null
  let lastField = ''
  const fieldNameByLabel: Record<string, string> = {
    duration: 'duration',
    visible: 'visible',
    characters: 'visible',
    character: 'visible',
    location: 'location',
    props: 'props',
    prop: 'props',
    action: 'visualAction',
    visual_action: 'visualAction',
    visual: 'visualAction',
    camera: 'camera',
    lighting: 'lighting',
    mood: 'mood',
    performance: 'performance',
    dialogue: 'dialogue',
    speaker: 'dialogue',
    transition: 'transition',
    caption: 'caption',
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const shotMatch = trimmed.match(/^#{0,4}\s*SHOT\s+(\d{1,3})(?:\s*[-:]\s*(.+))?$/i)
    if (shotMatch) {
      current = {
        index: Number(shotMatch[1]) || blocks.length + 1,
        title: readText(shotMatch[2]) || `Shot ${Number(shotMatch[1]) || blocks.length + 1}`,
        fields: {},
      }
      blocks.push(current)
      lastField = ''
      continue
    }
    if (!current || !trimmed) continue
    const fieldMatch = trimmed.match(/^(?:[-*]\s*)?([A-Za-z][A-Za-z _-]{1,32})\s*:\s*(.*)$/)
    if (fieldMatch) {
      const rawLabel = fieldMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      const fieldName = fieldNameByLabel[rawLabel]
      if (fieldName) {
        current.fields[fieldName] = [current.fields[fieldName], fieldMatch[2].trim()].filter(Boolean).join(' ')
        lastField = fieldName
      }
      continue
    }
    if (lastField) {
      current.fields[lastField] = [current.fields[lastField], trimmed.replace(/^[-*]\s*/, '')].filter(Boolean).join(' ')
    }
  }

  return blocks.filter((block) => readText(block.fields.visualAction) || readText(block.fields.action) || readText(block.fields.dialogue))
}

function buildCinematicV3ShotPlanFromVisualScript(input: {
  screenplayDraft: Record<string, unknown>
  assetPack: Record<string, unknown>
  context: Record<string, unknown>
  prompt: string
  maxShotCount: number
}) {
  const draft = cinematicV2ScreenplayDraftSchema.safeParse(input.screenplayDraft)
  const markdown = draft.success ? draft.data.screenplayMarkdown : readText(input.screenplayDraft.screenplayMarkdown)
  if (!/visual_shot_script_v1/i.test(markdown)) return null
  const blocks = parseVisualShotScriptBlocks(markdown).slice(0, Math.max(1, Math.min(36, input.maxShotCount || 18)))
  if (blocks.length === 0) return null

  const catalog = visualScriptEntityCatalog(input.assetPack, input.context)
  const characterKinds = ['actor', 'character', 'group']
  const locationKinds = ['place', 'environment', 'location', 'location_spot']
  const propKinds = ['object', 'item', 'inventory_item', 'prop']
  const fallbackCharacterRefIds = cinematicV2CharacterRefIds(input.assetPack, input.context)
  const fallbackLocationRefId = cinematicV2LocationRefId(input.assetPack, input.context)
  const unknownRefNames = new Set<string>()
  let cursor = 0

  const shots = blocks.map((block, index) => {
    const duration = parseVisualScriptDurationSeconds(readText(block.fields.duration), index === 0 ? 4 : 3)
    const visible = resolveVisualScriptRefs({ raw: readText(block.fields.visible), catalog, allowedKinds: characterKinds })
    const location = resolveVisualScriptRefs({ raw: readText(block.fields.location), catalog, allowedKinds: locationKinds })
    const props = resolveVisualScriptRefs({ raw: readText(block.fields.props), catalog, allowedKinds: propKinds })
    for (const name of [...visible.unknownNames, ...location.unknownNames, ...props.unknownNames]) unknownRefNames.add(name)
    const dialogue = readText(block.fields.dialogue)
    const dialogueMatch = dialogue.match(/^([^:]{2,60}):\s*["“]?(.+?)["”]?$/)
    const speakerName = dialogueMatch ? dialogueMatch[1].trim() : ''
    const speaker = dialogueMatch
      ? resolveVisualScriptRefs({ raw: dialogueMatch[1], catalog, allowedKinds: characterKinds }).refIds[0] || visible.refIds[0] || fallbackCharacterRefIds[0] || 'speaker'
      : ''
    const dialogueText = dialogueMatch ? dialogueMatch[2].trim() : dialogue
    const visibleCharacterRefIds = visible.refIds.length > 0 ? visible.refIds : fallbackCharacterRefIds
    const locationRefId = location.refIds[0] || fallbackLocationRefId
    const action = readText(block.fields.visualAction) || dialogueText || block.title
    const cameraText = readText(block.fields.camera)
    const purpose = index === 0
      ? 'establishing'
      : dialogueText
        ? 'dialogue'
        : index === blocks.length - 1
          ? 'impact'
          : 'action'
    const startSeconds = cursor
    cursor += duration
    return {
      id: `shot_${String(index + 1).padStart(3, '0')}`,
      sceneId: 'scene_1',
      index: index + 1,
      title: block.title || `Shot ${index + 1}`,
      purpose,
      editorialDurationSeconds: duration,
      providerDurationSeconds: providerSafeCinematicV2DurationSeconds(duration),
      description: action,
      action,
      caption: readText(block.fields.caption) || action.slice(0, 100),
      lighting: readText(block.fields.lighting),
      mood: readText(block.fields.mood) || readText(block.fields.performance),
      storyboardPanelPrompt: [
        action,
        cameraText ? `Camera: ${cameraText}` : '',
        readText(block.fields.lighting) ? `Lighting: ${readText(block.fields.lighting)}` : '',
        readText(block.fields.performance) ? `Performance: ${readText(block.fields.performance)}` : '',
      ].filter(Boolean).join(' '),
      videoDirection: [
        action,
        readText(block.fields.transition) ? `Transition: ${readText(block.fields.transition)}` : '',
      ].filter(Boolean).join(' '),
      dialogue: dialogueText ? [{
        id: `dialogue_${String(index + 1).padStart(3, '0')}`,
        speakerRefId: speaker,
        speakerName,
        text: dialogueText,
        emotion: readText(block.fields.performance) || 'visible performance',
        startSeconds,
        endSeconds: startSeconds + duration,
      }] : [],
      speakerRefIds: dialogueText ? [speaker] : [],
      visibleCharacterRefIds,
      performanceBeats: visibleCharacterRefIds.map((characterRefId, characterIndex) => ({
        characterRefId,
        valence: purpose === 'impact' ? 0.2 : purpose === 'dialogue' ? 0 : -0.05,
        arousal: purpose === 'impact' || purpose === 'action' ? 0.7 : 0.5,
        confidence: purpose === 'impact' ? 0.6 : 0.45,
        dominance: characterIndex === 0 ? 0.52 : 0.45,
        bodyLanguage: readText(block.fields.performance) || 'readable physical intention',
        facialExpression: readText(block.fields.performance) || 'focused cinematic expression',
        gaze: 'motivated by the shot eyeline and scene geography',
        gesture: action,
        voiceEnergy: dialogueText ? readText(block.fields.performance) || 'scene-appropriate delivery' : undefined,
      })),
      locationRefId,
      propRefIds: props.refIds,
      continuityInputs: [readText(block.fields.transition), readText(block.fields.lighting)].filter(Boolean),
      camera: {
        framing: cameraText || (purpose === 'establishing' ? 'wide establishing frame' : purpose === 'dialogue' ? 'medium closeup' : 'readable cinematic action frame'),
        angle: cameraText,
        lens: '',
        movement: cameraText,
        screenDirectionRule: 'Preserve consistent geography and eyelines across the visual shot script.',
      },
      requiresLipSync: Boolean(dialogueText),
      status: 'planned',
    }
  })

  const totalEditorialDurationSeconds = shots.reduce((total, shot) => total + shot.editorialDurationSeconds, 0)
  const shotPlan = cinematicV2ShotPlanSchema.parse({
    sceneId: 'scene_1',
    totalEditorialDurationSeconds,
    shots,
    performanceArc: [...new Set(shots.flatMap((shot) => shot.visibleCharacterRefIds))].map((characterRefId) => ({
      characterRefId,
      startState: 'introduced through the visual shot script',
      endState: 'changed by the final visual beat',
      arc: 'Preserve the visual script performance progression without adding unplanned story beats.',
    })),
    audioPlan: {
      ambience: 'continuous scene ambience placeholder',
      music: 'subtle continuous score placeholder',
      sfx: shots.filter((shot) => shot.purpose === 'action' || shot.purpose === 'impact').map((shot) => `${shot.title} foley/impact placeholder`),
      dialogueTrackCount: shots.reduce((total, shot) => total + shot.dialogue.length, 0),
      placeholderOnly: true,
    },
    diagnostics: [
      'deterministic_visual_script_parse',
      ...(unknownRefNames.size > 0 ? [`unknown_ref_names: ${[...unknownRefNames].join(', ')}`] : []),
      ...(shots.some((shot) => shot.providerDurationSeconds !== Math.round(shot.editorialDurationSeconds)) ? ['duration_normalized'] : []),
    ],
  })
  return {
    shotPlan,
    shotBlocks: blocks,
    unknownRefNames: [...unknownRefNames],
  }
}

async function runCinematicV2ScreenplayAuthor(input: {
  nodeKey: string
  instructions: string
  prompt: string
  fallback: z.infer<typeof cinematicV2ScreenplayDraftSchema>
  maxOutputTokens?: number
}) {
  const screenplayPolicy = resolveOutputTextModelPolicy('screenplay_author')
  const model = screenplayPolicy.model
  const response = await runOpenAiResponses({
    model,
    reasoning: reasoningPayloadFor(screenplayPolicy),
    instructions: input.instructions,
    input: input.prompt,
    maxOutputTokens: input.maxOutputTokens ?? 4200,
    metadata: {
      graphcore_task: 'output_workflow_cinematic_v2_screenplay_author_markdown',
      graphcore_node_key: input.nodeKey,
    },
    timeoutMs: outputWorkflowScreenplayAuthorTimeoutMs(),
  })
  if (!response.response.ok) {
    const fallbackReason = `Provider request failed: ${response.response.status ?? 'unknown'} ${response.response.statusText ?? ''}`.trim()
    return { value: input.fallback, response, provider: 'graphcore', model: 'deterministic-output_workflow_cinematic_v2_screenplay_author_markdown-fallback-v1', fallbackUsed: true, fallbackReason }
  }
  const screenplayMarkdown = normalizeCinematicV2ScreenplayMarkdown(response.outputText)
  if (!screenplayMarkdown) {
    return { value: input.fallback, response, provider: 'graphcore', model: 'deterministic-output_workflow_cinematic_v2_screenplay_author_markdown-fallback-v1', fallbackUsed: true, fallbackReason: 'Screenplay author returned empty text.' }
  }
  const value = cinematicV2ScreenplayDraftSchema.parse({
    ...input.fallback,
    title: inferCinematicV2ScreenplayTitle(screenplayMarkdown, input.fallback.title),
    screenplayMarkdown,
    diagnostics: [],
  })
  return { value, response, provider: 'openai', model, fallbackUsed: false, fallbackReason: '' }
}

async function runCinematicSimpleTextPrompt(input: {
  nodeKey: string
  task: string
  instructions: string
  prompt: string
  maxOutputTokens?: number
  timeoutMs?: number
  failureMessage: string
}) {
  const model = outputWorkflowTextModel()
  const response = await runOpenAiResponses({
    model,
    instructions: input.instructions,
    input: input.prompt,
    maxOutputTokens: input.maxOutputTokens ?? 1200,
    metadata: {
      graphcore_task: input.task,
      graphcore_node_key: input.nodeKey,
    },
    timeoutMs: input.timeoutMs ?? 120_000,
  })
  if (!response.response.ok) {
    throw new Error(openAiErrorMessage(response, `${input.failureMessage} with status ${response.response.status}.`))
  }
  return {
    text: response.outputText,
    usage: response.body?.usage,
    model,
    providerRequestId: readText(response.body?.id) || response.response.headers.get('x-request-id') || null,
  }
}

function buildFallbackCinematicV2ParsedScript(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  screenplayDraft?: Record<string, unknown> | null
}) {
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  const draft = cinematicV2ScreenplayDraftSchema.safeParse(input.screenplayDraft ?? {})
  const characterRefIds = cinematicV2CharacterRefIds(input.assetPack, input.context)
  const locationRefId = cinematicV2LocationRefId(input.assetPack, input.context)
  const sourceText = draft.success ? draft.data.screenplayMarkdown : input.prompt
  const rawLines = sourceText
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s/.test(line) && !/^SHOT\s+\d+/i.test(line))
  const lines = rawLines.length > 0
    ? rawLines.slice(0, 16)
    : [readText(wiki.logline) || 'A cinematic confrontation unfolds in the world.']
  return cinematicV2ParsedScriptSchema.parse({
    title: draft.success ? draft.data.title : readText(wiki.title) ? `${readText(wiki.title)} Scene` : 'Cinematic Scene',
    summary: lines.join(' '),
    sourceInputType: draft.success || sourceText.includes('\n') ? 'script' : 'prompt',
    characterRefIds,
    locationRefId,
    propRefIds: [],
    targetDurationSeconds: draft.success && draft.data.suggestedDurationSeconds
      ? Math.min(180, Math.max(8, draft.data.suggestedDurationSeconds))
      : Math.min(120, Math.max(8, lines.length * 4)),
    beats: lines.map((line, index) => ({
      id: `beat_${index + 1}`,
      type: /["“”]/.test(line) ? 'dialogue' : 'action',
      text: line,
      speakerRefId: null,
      characterRefIds,
      propRefIds: [],
      emotionalIntent: index === 0 ? 'setup tension' : index === lines.length - 1 ? 'payoff' : 'escalation',
      estimatedDurationSeconds: Math.max(1.5, Math.min(4, 2 + line.length / 110)),
    })),
    diagnostics: ['Fallback parsed script generated deterministically.'],
  })
}

function buildFallbackCinematicV2SceneState(input: {
  parsedScript: Record<string, unknown>
  context: Record<string, unknown>
}) {
  const parsed = cinematicV2ParsedScriptSchema.parse(input.parsedScript)
  const wiki = asRecord(input.context.wiki ?? input.context.worldWiki)
  return cinematicV2SceneStateSchema.parse({
    sceneId: 'scene_1',
    title: parsed.title || 'Scene 1',
    summary: parsed.summary,
    locationRefId: parsed.locationRefId,
    characterRefIds: parsed.characterRefIds,
    propRefIds: parsed.propRefIds,
    timeOfDay: 'cinematic late day or motivated scene lighting',
    weather: 'story-appropriate atmosphere',
    atmosphere: readStringArray(wiki.toneTags).join(', ') || 'tense cinematic atmosphere',
    lighting: {
      direction: 'single motivated key direction preserved across shots',
      quality: 'dramatic but readable',
      colorTemperature: 'world palette with controlled contrast',
      contrast: 'medium-high',
    },
    mood: readText(wiki.genre) || readText(wiki.logline) || 'cinematic tension',
    visualContinuity: {
      palette: readStringArray(wiki.toneTags).slice(0, 5),
      lensLanguage: 'establishing wides, motivated closeups, clean reaction coverage',
      cameraMovementStyle: 'controlled push-ins and grounded physical motion',
      grainOrTexture: 'subtle production texture',
    },
    characterStates: parsed.characterRefIds.map((characterRefId, index) => ({
      characterRefId,
      startingPosition: index === 0 ? 'screen-left / active side' : 'screen-right / counter side',
      emotionalState: index === 0 ? 'intent and pressure' : 'controlled response',
      physicalState: 'canon-consistent',
      outfitState: 'preserve canonical outfit and silhouette',
      injuries: [],
      carriedPropRefIds: [],
      continuityNotes: ['Do not redesign identity, costume, face, props, or silhouette.'],
    })),
    locationState: {
      description: parsed.locationRefId ? 'Use the canonical location as the stage for this scene.' : 'Use the strongest canonical environment implied by the prompt.',
      continuityNotes: ['Keep geography, lighting direction, and screen direction stable.'],
    },
  })
}

function buildFallbackCinematicV2LayoutPlan(input: {
  parsedScript: Record<string, unknown>
  sceneState: Record<string, unknown>
}) {
  const parsed = cinematicV2ParsedScriptSchema.parse(input.parsedScript)
  const sceneState = cinematicV2SceneStateSchema.parse(input.sceneState)
  return cinematicV2SceneLayoutPlanSchema.parse({
    sceneId: sceneState.sceneId,
    summary: 'A readable cinematic blocking plan preserving screen direction and motivated lighting.',
    spatialMapDescription: 'Primary characters occupy opposing screen sides with clear action flow through the central stage. Camera coverage preserves eyelines and screen direction.',
    characterPositions: parsed.characterRefIds.map((characterRefId, index) => ({
      characterRefId,
      zone: index === 0 ? 'screen-left foreground or west side' : 'screen-right midground or east side',
      facing: index === 0 ? 'toward screen-right' : 'toward screen-left',
      movementDirection: index === 0 ? 'left-to-right' : 'right-to-left',
    })),
    landmarks: [{
      id: 'stage_center',
      name: 'Primary action line',
      position: 'center of scene geography',
      continuityRole: 'Keeps action and eyelines readable.',
    }],
    cameraPlan: [
      { id: 'cam_establish', purpose: 'establishing', position: 'wide master angle', lens: '28mm', movement: 'slow push-in', screenDirectionRule: 'Keep primary subject screen-left when possible.' },
      { id: 'cam_dialogue_a', purpose: 'dialogue', position: 'medium close coverage A', lens: '50mm', movement: 'subtle breathing motion', screenDirectionRule: 'Subject A looks screen-right.' },
      { id: 'cam_reaction_b', purpose: 'reaction', position: 'medium close coverage B', lens: '50mm', movement: 'still or slight push', screenDirectionRule: 'Subject B looks screen-left.' },
      { id: 'cam_action', purpose: 'action', position: 'grounded action angle', lens: '35mm', movement: 'short lateral track', screenDirectionRule: 'Preserve the established movement direction.' },
    ],
  })
}

function buildFallbackCinematicV2ShotPlan(input: {
  parsedScript: Record<string, unknown>
  sceneState: Record<string, unknown>
  maxShotCount: number
}) {
  const parsed = cinematicV2ParsedScriptSchema.parse(input.parsedScript)
  const sceneState = cinematicV2SceneStateSchema.parse(input.sceneState)
  const maxShotCount = Math.max(1, Math.min(36, input.maxShotCount || deriveCinematicV2MaxShotCount(parsed.targetDurationSeconds)))
  const beats = parsed.beats.slice(0, maxShotCount)
  const shots = beats.map((beat, index) => {
    const dialogue = beat.type === 'dialogue'
      ? [{
        id: `dialogue_${index + 1}`,
        speakerRefId: beat.speakerRefId || parsed.characterRefIds[0] || 'speaker',
        speakerName: beat.speakerRefId || '',
        text: beat.text.replace(/^["“]|["”]$/g, ''),
        emotion: beat.emotionalIntent || 'controlled',
      }]
      : []
    const editorialDurationSeconds = Math.max(1.2, Math.min(4, beat.estimatedDurationSeconds ?? (beat.type === 'dialogue' ? 3 : 2)))
    const purpose = index === 0
      ? 'establishing'
      : beat.type === 'dialogue'
        ? 'dialogue'
        : index === beats.length - 1
          ? 'impact'
          : 'action'
    return {
      id: `shot_${index + 1}`,
      sceneId: sceneState.sceneId,
      index: index + 1,
      title: purpose === 'dialogue' ? `Dialogue ${index + 1}` : index === 0 ? 'Establishing Beat' : `Shot ${index + 1}`,
      purpose,
      editorialDurationSeconds,
      providerDurationSeconds: providerSafeCinematicV2DurationSeconds(editorialDurationSeconds),
      description: beat.text,
      action: beat.type === 'dialogue' ? 'stable visible speaking coverage with minimal head movement' : beat.text,
      dialogue,
      speakerRefIds: dialogue.map((line) => line.speakerRefId),
      visibleCharacterRefIds: beat.characterRefIds.length > 0 ? beat.characterRefIds : parsed.characterRefIds,
      performanceBeats: (beat.characterRefIds.length > 0 ? beat.characterRefIds : parsed.characterRefIds).map((characterRefId, characterIndex) => ({
        characterRefId,
        valence: index === beats.length - 1 ? 0.25 : index === 0 ? -0.2 : 0,
        arousal: purpose === 'impact' || purpose === 'action' ? 0.75 : purpose === 'dialogue' ? 0.55 : 0.45,
        confidence: index === beats.length - 1 ? 0.62 : 0.42,
        dominance: characterIndex === 0 ? 0.52 : 0.46,
        bodyLanguage: purpose === 'dialogue' ? 'controlled visible speaking posture' : 'clear readable physical intention',
        facialExpression: beat.emotionalIntent || 'focused cinematic expression',
        gaze: 'motivated by the shot eyeline and scene geography',
        gesture: purpose === 'dialogue' ? 'small speech-accompanying gesture' : 'single readable action gesture',
        voiceEnergy: dialogue.length > 0 ? beat.emotionalIntent || 'controlled delivery' : undefined,
      })),
      locationRefId: parsed.locationRefId,
      propRefIds: beat.propRefIds,
      continuityInputs: [sceneState.visualContinuity.lensLanguage, sceneState.lighting.direction].filter(Boolean),
      camera: {
        framing: purpose === 'establishing' ? 'wide establishing frame' : purpose === 'dialogue' ? 'medium closeup' : 'readable cinematic action frame',
        angle: purpose === 'impact' ? 'close low impact angle' : 'motivated eye-level or low cinematic angle',
        lens: purpose === 'establishing' ? '28mm' : '50mm',
        movement: purpose === 'dialogue' ? 'subtle push-in' : 'grounded controlled move',
        screenDirectionRule: 'Preserve the scene layout screen direction.',
      },
      requiresLipSync: dialogue.length > 0,
      status: 'planned',
    }
  })
  const totalEditorialDurationSeconds = shots.reduce((total, shot) => total + shot.editorialDurationSeconds, 0)
  return cinematicV2ShotPlanSchema.parse({
    sceneId: sceneState.sceneId,
    totalEditorialDurationSeconds,
    shots,
    performanceArc: parsed.characterRefIds.map((characterRefId) => ({
      characterRefId,
      startState: 'entering the scene with controlled uncertainty',
      endState: 'changed by the scene payoff',
      arc: 'track valence, arousal, confidence, and dominance across the shots without resetting performance continuity',
    })),
    audioPlan: {
      ambience: 'continuous scene ambience placeholder',
      music: 'subtle continuous score placeholder',
      sfx: shots.filter((shot) => shot.purpose === 'action' || shot.purpose === 'impact').map((shot) => `${shot.title} foley/impact placeholder`),
      dialogueTrackCount: shots.reduce((total, shot) => total + shot.dialogue.length, 0),
      placeholderOnly: true,
    },
    diagnostics: ['Fallback shot plan generated deterministically.'],
  })
}

async function runCinematicV2StructuredNode<TValue>(input: {
  nodeKey: string
  schemaName: string
  schema: z.ZodType<TValue>
  instructions: string
  prompt: string
  fallback: TValue
  maxOutputTokens?: number
}) {
  const model = outputWorkflowTextModel()
  const response = await runOpenAiResponses({
    model,
    instructions: input.instructions,
    input: input.prompt,
    text: {
      format: {
        type: 'json_schema',
        name: input.schemaName,
        schema: normalizeStrictJsonSchema(z.toJSONSchema(input.schema)),
        strict: true,
      },
    },
    maxOutputTokens: input.maxOutputTokens ?? 3200,
    metadata: {
      graphcore_task: input.schemaName,
      graphcore_node_key: input.nodeKey,
    },
    timeoutMs: 120_000,
  })
  if (!response.response.ok) {
    const fallbackReason = `Provider request failed: ${response.response.status ?? 'unknown'} ${response.response.statusText ?? ''}`.trim()
    return { value: input.fallback, response, provider: 'graphcore', model: `deterministic-${input.schemaName}-fallback-v1`, fallbackUsed: true, fallbackReason }
  }
  try {
    return { value: input.schema.parse(parseJsonObject(response.outputText)), response, provider: 'openai', model, fallbackUsed: false, fallbackReason: '' }
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : 'Structured output parse failed.'
    return { value: input.fallback, response, provider: 'graphcore', model: `deterministic-${input.schemaName}-fallback-v1`, fallbackUsed: true, fallbackReason }
  }
}

async function runCinematicV2VisionStructuredNode<TValue>(input: {
  nodeKey: string
  schemaName: string
  schema: z.ZodType<TValue>
  instructions: string
  input: Array<Record<string, unknown>>
  fallback: TValue
  maxOutputTokens?: number
}) {
  const model = outputWorkflowTextModel()
  const response = await runOpenAiResponses({
    model,
    instructions: input.instructions,
    input: input.input,
    text: {
      format: {
        type: 'json_schema',
        name: input.schemaName,
        schema: normalizeStrictJsonSchema(z.toJSONSchema(input.schema)),
        strict: true,
      },
    },
    maxOutputTokens: input.maxOutputTokens ?? 2200,
    metadata: {
      graphcore_task: input.schemaName,
      graphcore_node_key: input.nodeKey,
    },
    timeoutMs: 120_000,
  })
  if (!response.response.ok) {
    const fallbackReason = `Provider request failed: ${response.response.status ?? 'unknown'} ${response.response.statusText ?? ''}`.trim()
    return { value: input.fallback, response, provider: 'graphcore', model: `deterministic-${input.schemaName}-fallback-v1`, providerRequestId: response.id, fallbackUsed: true, fallbackReason }
  }
  try {
    return { value: input.schema.parse(parseJsonObject(response.outputText)), response, provider: 'openai', model, providerRequestId: response.id, fallbackUsed: false, fallbackReason: '' }
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : 'Structured vision output parse failed.'
    return { value: input.fallback, response, provider: 'graphcore', model: `deterministic-${input.schemaName}-fallback-v1`, providerRequestId: response.id, fallbackUsed: true, fallbackReason }
  }
}

type CinematicV2StructuredNodeBackgroundInput<TValue> = {
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
    lastProviderPollAt: string
    providerStartedAt: string
  }) => Promise<void>
}

async function runCinematicV2StructuredNodeBackground<TValue>(input: CinematicV2StructuredNodeBackgroundInput<TValue>) {
  const attempts = 3
  let maxOutputTokens = input.maxOutputTokens ?? 3200
  let priorProviderRequestId = input.priorProviderRequestId
  let lastError: unknown = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await runCinematicV2StructuredNodeBackgroundOnce({ ...input, maxOutputTokens, priorProviderRequestId })
    } catch (error) {
      lastError = error
      // Escalate only on output-token truncation; a fresh submit is required because
      // the prior background response is terminal at this point.
      if (!isOpenAiTruncationError(error) || attempt >= attempts) throw error
      maxOutputTokens = Math.min(24_000, maxOutputTokens * 2)
      priorProviderRequestId = null
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Background structured response failed.'))
}

async function runCinematicV2StructuredNodeBackgroundOnce<TValue>(input: CinematicV2StructuredNodeBackgroundInput<TValue>) {
  const model = outputWorkflowTextModel()
  const timeoutMs = input.timeoutMs ?? outputWorkflowChapterTimeoutMs()
  const backgroundResult = await waitForOpenAiBackgroundResponse({
    request: {
      model,
      instructions: input.instructions,
      input: input.prompt,
      text: {
        format: {
          type: 'json_schema',
          name: input.schemaName,
          schema: normalizeStrictJsonSchema(z.toJSONSchema(input.schema)),
          strict: true,
        },
      },
      maxOutputTokens: input.maxOutputTokens ?? 3200,
      metadata: {
        graphcore_task: input.schemaName,
        graphcore_node_key: input.nodeKey,
        graphcore_provider_mode: 'background',
      },
      timeoutMs: 45_000,
    },
    priorProviderRequestId: input.priorProviderRequestId,
    providerStartedAt: input.providerStartedAt,
    timeoutMs,
    shouldCancel: input.shouldCancel,
    createCancelledError: () => new WorkflowCancelledError(),
    onProgress: input.onProgress,
    createFailureMessage: (status) => `OpenAI background structured response failed with status ${status}.`,
    pollFailureMessage: (status) => `OpenAI background structured response poll failed with status ${status}.`,
    terminalFailureMessage: (providerStatus) => `OpenAI background structured response ended with status ${providerStatus}.`,
    missingResponseIdMessage: 'OpenAI background structured response did not return a response id.',
  })
  const result = backgroundResult.response
  const providerRequestId = backgroundResult.providerRequestId

  try {
    return {
      value: input.schema.parse(parseJsonObject(result.outputText)),
      response: result,
      provider: 'openai',
      model,
      providerRequestId,
      fallbackUsed: false,
      fallbackReason: '',
    }
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : 'Background structured output parse failed.'
    return {
      value: input.fallback,
      response: result,
      provider: 'graphcore',
      model: `deterministic-${input.schemaName}-fallback-v1`,
      providerRequestId,
      fallbackUsed: true,
      fallbackReason,
    }
  }
}

function buildCinematicV2StoryboardPrompt(input: {
  shotPlan: Record<string, unknown>
  sceneState: Record<string, unknown>
  layoutPlan: Record<string, unknown>
  assetPack: Record<string, unknown>
  storyboardGroup?: Record<string, unknown> | null
  aspectRatio: string
  prompt: string
}) {
  const fullShotPlan = cinematicV2ShotPlanSchema.parse(input.shotPlan)
  const storyboardGroup = cinematicV2StoryboardGroupPlanSchema.shape.groups.element.safeParse(input.storyboardGroup ?? {}).success
    ? cinematicV2StoryboardGroupPlanSchema.shape.groups.element.parse(input.storyboardGroup)
    : null
  const groupShotIds = new Set(storyboardGroup?.shotIds ?? [])
  const matchedGroupShots = storyboardGroup
    ? fullShotPlan.shots.filter((shot) => groupShotIds.has(shot.id))
    : fullShotPlan.shots
  const fallbackGroupShots = storyboardGroup && matchedGroupShots.length === 0
    ? fullShotPlan.shots.slice(
      Math.max(0, (storyboardGroup.index - 1) * 9),
      Math.max(0, (storyboardGroup.index - 1) * 9) + storyboardGroup.panelCount,
    )
    : []
  const shotPlan = {
    ...fullShotPlan,
    shots: matchedGroupShots.length > 0 ? matchedGroupShots : fallbackGroupShots.length > 0 ? fallbackGroupShots : fullShotPlan.shots,
  }
  const sceneState = cinematicV2SceneStateSchema.parse(input.sceneState)
  const layout = storyboardGroup
    ? { rows: storyboardGroup.rows, columns: storyboardGroup.columns, panelCount: storyboardGroup.panelCount }
    : buildCinematicV2StoryboardLayout(shotPlan.shots.length)
  const gridCellCount = layout.rows * layout.columns
  const blankCellCount = Math.max(0, gridCellCount - layout.panelCount)
  const entities = compactCinematicEntityAnchors(input.assetPack, 10)
  const labelByKey = cinematicEntityLabelByKey(input.assetPack)
  const shotLines = shotPlan.shots.slice(0, layout.panelCount).map((shot, index) => [
    `Panel ${index + 1}: ${shot.title}.`,
    `Purpose: ${shot.purpose}.`,
    `Required subjects (${shot.visibleCharacterRefIds.length}): ${shot.visibleCharacterRefIds.map((key) => labelByKey.get(key) || key).join(', ') || 'no named character subject'}.`,
    shot.locationRefId ? `Required location: ${labelByKey.get(shot.locationRefId) || shot.locationRefId}.` : '',
    shot.propRefIds.length > 0 ? `Required props: ${shot.propRefIds.map((key) => labelByKey.get(key) || key).join(', ')}.` : '',
    formatCinematicV2PerformanceDirection(shot) ? `Required acting/performance: ${formatCinematicV2PerformanceDirection(shot)}.` : '',
    'Do not add unlisted principal characters, background lookalikes, duplicate versions of the same character, swapped identities, captions, labels, or panel text.',
    `Visual: ${shot.description || shot.action}.`,
    `Camera: ${shot.camera.framing}; ${shot.camera.angle}; ${shot.camera.movement}.`,
  ].filter(Boolean).join(' ')).join('\n')
  const blankCellInstruction = blankCellCount > 0
    ? `Cells ${layout.panelCount + 1}-${gridCellCount} are intentional empty placeholders: keep them as plain dark/neutral blank cells with no characters, no props, no scene action, and no text.`
    : ''
  return [
    `Create a cinematic storyboard sheet as a fixed ${layout.rows}x${layout.columns} rectangular grid with exactly ${gridCellCount} equal-size cells.`,
    `Fill cells 1-${layout.panelCount} with the storyboard panels below, ordered left-to-right then top-to-bottom. Do not change the row count, column count, cell sizes, or panel positions.`,
    blankCellInstruction,
    storyboardGroup ? `This is storyboard sheet ${storyboardGroup.index}: ${storyboardGroup.summary}.` : '',
    storyboardGroup?.continuityNotes.length ? `Group continuity notes: ${storyboardGroup.continuityNotes.join(' ')}` : '',
    `Every panel must have an internal ${input.aspectRatio} crop and feel like frames from the same continuous scene.`,
    'Use straight, evenly spaced gutters that divide the sheet into identical rectangular cells so automated cropping can split the image by rows and columns.',
    'Do not create a masonry layout, irregular comic layout, unequal panel sizes, merged panels, staggered rows, inset panels, diagonal dividers, floating panels, or extra panels.',
    'Treat each panel as a rough composition/blocking anchor only; final identity accuracy will be repaired later from entity reference sheets.',
    'No captions, no labels, no speech bubbles, no UI, no watermark, no text inside the image.',
    `Scene: ${sceneState.title}. ${sceneState.summary}`,
    `Lighting: ${sceneState.lighting.direction}; ${sceneState.lighting.quality}; ${sceneState.lighting.colorTemperature}.`,
    `Spatial layout: ${readText(input.layoutPlan.summary)} ${readText(input.layoutPlan.spatialMapDescription)}`,
    'Shot panels:',
    shotLines,
    entities.length > 0 ? `Canonical visual identity anchors:\n${compactForPrompt({ entities }, 3200)}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    'Preserve character identity, costumes, props, location architecture, lighting direction, color grade, screen direction, and proportions across panels.',
  ].filter(Boolean).join('\n\n')
}

function compileCinematicScriptDocForOutput(input: {
  scriptDoc: Record<string, unknown>
  directorScriptDoc?: Record<string, unknown> | null
  maxDynamicTakes: number
  maxTotalDurationSeconds?: number | null
}) {
  const cinematicScriptDoc = cinematicScriptDocSchema.parse(input.scriptDoc)
  const compiledCinematicSequence = buildCinematicSequenceFromScriptDoc(cinematicScriptDoc)
  const allTakes = compiledCinematicSequence.takes
  if (allTakes.length === 0) throw new Error('Cinematic script compile produced zero video takes.')
  const maxDynamicTakes = Math.max(1, Math.min(6, input.maxDynamicTakes || 6))
  const maxTotalDurationSeconds = Math.max(4, Math.min(60, Number(input.maxTotalDurationSeconds ?? CINEMATIC_MAX_TOTAL_DURATION_SECONDS) || CINEMATIC_MAX_TOTAL_DURATION_SECONDS))
  const generatedTakes: typeof allTakes = []
  let generatedDurationSeconds = 0
  for (const take of allTakes) {
    if (generatedTakes.length >= maxDynamicTakes) break
    const durationSeconds = Math.max(4, Math.min(15, Number(take.durationSeconds ?? 4) || 4))
    if (generatedTakes.length > 0 && generatedDurationSeconds + durationSeconds > maxTotalDurationSeconds) break
    generatedTakes.push(take)
    generatedDurationSeconds += durationSeconds
    if (generatedDurationSeconds >= maxTotalDurationSeconds) break
  }
  if (generatedTakes.length === 0) generatedTakes.push(allTakes[0])
  const takePlan = generatedTakes.map((take, index) => ({
    takeId: take.id,
    takeIndex: index,
    title: take.title || `Take ${index + 1}`,
    shotIds: take.shotIds,
    durationSeconds: Math.max(4, Math.min(15, Number(take.durationSeconds ?? 4) || 4)),
    startSeconds: Number(take.startSeconds ?? 0) || 0,
    endSeconds: Number(take.endSeconds ?? 0) || 0,
    breakReason: readText(take.breakReason),
    continuityRefIds: readStringArray(take.continuityRefIds),
    requiredSourceRefIds: readStringArray(take.requiredSourceRefIds),
    storyboardPanelPlan: take.storyboardPanelPlan ?? null,
    storyboardPanelScriptText: readText(take.storyboardPanelScriptText),
    representativeStillPrompt: readText(take.representativeStillPrompt),
    truthSourceMode: readText(take.truthSourceMode),
    beatSheetPlan: take.beatSheetPlan ?? null,
    keyframePlan: take.keyframePlan ?? null,
    referenceLegend: Array.isArray(take.referenceLegend) ? take.referenceLegend : [],
    timelineCells: Array.isArray(take.timelineCells) ? take.timelineCells : [],
    continuityLock: readText(take.continuityLock),
    positiveConstraints: readStringArray(take.positiveConstraints),
    planningOnlyArtifactKeys: readStringArray(take.planningOnlyArtifactKeys),
    seedanceEndpoint: readText(take.seedanceEndpoint) || 'reference-to-video',
  }))
  const totalDurationSeconds = takePlan.reduce((total, take) => total + take.durationSeconds, 0)
  const compileHash = hashOutputWorkflowValue({ scriptDoc: cinematicScriptDoc, takePlan })
  return {
    directorScriptDoc: input.directorScriptDoc && Object.keys(input.directorScriptDoc).length > 0 ? input.directorScriptDoc : null,
    cinematicScriptDoc,
    compiledCinematicSequence,
    takePlan,
    totalDurationSeconds,
    maxTotalDurationSeconds,
    dynamicTakeCount: takePlan.length,
    cappedTakeCount: allTakes.length > generatedTakes.length ? allTakes.length : null,
    scriptDurationSource: 'authored_script',
    compileHash,
    diagnostics: [
      ...(allTakes.length > generatedTakes.length
        ? [`Cinematic dynamic fanout is capped at ${maxDynamicTakes} takes and ${maxTotalDurationSeconds} seconds in V1; generated the first ${generatedTakes.length} of ${allTakes.length} compiled takes.`]
        : []),
      ...(totalDurationSeconds >= maxTotalDurationSeconds
        ? [`Generated cinematic duration reached the ${maxTotalDurationSeconds}-second maximum.`]
        : []),
    ],
  }
}

function nameForCinematicRef(assetPack: Record<string, unknown>, refId: string | null | undefined) {
  const id = readText(refId)
  if (!id) return ''
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  const match = entities.find((entity) => readText(entity.key) === id || readText(entity.id) === id)
  return readText(match?.name) || id
}

function actionTextForCompiledShot(shot: Record<string, unknown>, assetPack: Record<string, unknown>) {
  const actions = Array.isArray(shot.actions) ? shot.actions.map(asRecord) : []
  if (actions.length === 0) return readText(shot.visualPrompt) || readText(shot.beat) || readText(shot.title)
  return actions.map((action) => [
    nameForCinematicRef(assetPack, action.actorRefId),
    readText(action.verb),
    nameForCinematicRef(assetPack, action.targetRefId),
    readText(action.stagingNotes),
  ].filter(Boolean).join(' ')).filter(Boolean).join(' Then ')
}

function directorActionsForCompiledShot(shot: Record<string, unknown>, assetPack: Record<string, unknown>, durationSeconds: number) {
  const actions = Array.isArray(shot.actions) ? shot.actions.map(asRecord) : []
  return actions.map((action, index) => ({
    actor: nameForCinematicRef(assetPack, action.actorRefId) || readText(action.actorRefId),
    verb: readText(action.verb),
    target: nameForCinematicRef(assetPack, action.targetRefId) || readText(action.targetRefId),
    prop: nameForCinematicRef(assetPack, action.propRefId) || readText(action.propRefId),
    stagingNotes: readText(action.stagingNotes),
    startSeconds: Math.max(0, Number(action.startSeconds ?? 0) || 0),
    endSeconds: Math.max(0, Math.min(durationSeconds, Number(action.endSeconds ?? durationSeconds) || durationSeconds)),
    orderIndex: index,
  })).filter((entry) => entry.verb || entry.stagingNotes)
}

function directorDialogueForCompiledShot(shot: Record<string, unknown>, assetPack: Record<string, unknown>) {
  const dialogue = Array.isArray(shot.dialogue) ? shot.dialogue.map(asRecord) : []
  return dialogue.map((entry, index) => ({
    speaker: nameForCinematicRef(assetPack, entry.speakerRefId) || readText(entry.speakerName) || readText(entry.speakerRefId),
    line: readText(entry.line),
    delivery: readText(entry.delivery),
    startSeconds: Number(entry.startSeconds ?? 0) || 0,
    endSeconds: Number(entry.endSeconds ?? 0) || 0,
    orderIndex: index,
  })).filter((entry) => entry.line)
}

function directorAudioCuesForCompiledShot(shot: Record<string, unknown>, assetPack: Record<string, unknown>) {
  const audio = Array.isArray(shot.audio) ? shot.audio.map(asRecord) : []
  return audio.map((entry, index) => ({
    kind: readText(entry.kind),
    cue: readText(entry.cue),
    source: nameForCinematicRef(assetPack, entry.sourceRefId) || readText(entry.sourceRefId),
    startSeconds: Number(entry.startSeconds ?? 0) || 0,
    endSeconds: Number(entry.endSeconds ?? 0) || 0,
    orderIndex: index,
  })).filter((entry) => entry.cue)
}

function audioTextForCompiledShot(shot: Record<string, unknown>) {
  const dialogue = Array.isArray(shot.dialogue) ? shot.dialogue.map(asRecord) : []
  const audio = Array.isArray(shot.audio) ? shot.audio.map(asRecord) : []
  const dialogueText = dialogue.map((entry) => [
    readText(entry.speakerName) || readText(entry.speakerRefId),
    readText(entry.line),
    readText(entry.delivery),
  ].filter(Boolean).join(': ')).filter(Boolean).join(' ')
  const audioText = audio.map((entry) => [
    readText(entry.kind),
    readText(entry.cue),
  ].filter(Boolean).join(': ')).filter(Boolean).join(' ')
  return [dialogueText, audioText].filter(Boolean).join(' ')
}

function buildTakeBlockScriptFromCompiledSequence(input: {
  compiledCinematicSequence: Record<string, unknown>
  takePlan: Record<string, unknown>[]
  takeId?: string
  takeIndex?: number
  assetPack: Record<string, unknown>
}) {
  const take = input.takeId
    ? input.takePlan.find((candidate) => readText(candidate.takeId) === input.takeId)
    : input.takePlan[input.takeIndex ?? 0]
  if (!take) throw new Error('Compiled cinematic take was not found for this dynamic node.')
  const sequenceShots = Array.isArray(input.compiledCinematicSequence.shots)
    ? input.compiledCinematicSequence.shots.map(asRecord)
    : []
  const shotIds = new Set(readStringArray(take.shotIds))
  const takeStart = Number(take.startSeconds ?? 0) || 0
  const durationSeconds = Math.max(4, Math.min(15, Number(take.durationSeconds ?? 4) || 4))
  const shots = sequenceShots
    .filter((shot) => shotIds.has(readText(shot.id)))
    .map((shot, index) => {
      const start = Math.max(0, Number(shot.startSeconds ?? 0) - takeStart)
      const end = Math.max(start + 0.25, Math.min(durationSeconds, Number(shot.endSeconds ?? start + Number(shot.durationSeconds ?? 1)) - takeStart))
      const subject = [
        ...readStringArray(shot.participantRefIds).map((refId) => nameForCinematicRef(input.assetPack, refId)),
        nameForCinematicRef(input.assetPack, readText(shot.locationRefId)),
      ].filter(Boolean).join(', ') || readText(shot.title) || `Shot ${index + 1}`
      const relativeDuration = Math.max(0.25, end - start)
      const actions = directorActionsForCompiledShot(shot, input.assetPack, relativeDuration)
      const dialogue = directorDialogueForCompiledShot(shot, input.assetPack)
      const audioCues = directorAudioCuesForCompiledShot(shot, input.assetPack)
      return {
        shotNumber: index + 1,
        shotId: readText(shot.id),
        startTimeSeconds: Number(start.toFixed(2)),
        endTimeSeconds: Number(end.toFixed(2)),
        absoluteStartSeconds: Number(Number(shot.startSeconds ?? 0).toFixed(2)),
        absoluteEndSeconds: Number(Number(shot.endSeconds ?? 0).toFixed(2)),
        subject,
        title: readText(shot.title),
        beat: readText(shot.beat),
        emotionalBeat: readText(shot.emotionalBeat),
        visualAction: readText(shot.visualPrompt) || readText(shot.beat),
        framing: readText(shot.framing),
        cameraMovement: readText(shot.cameraMovement),
        participants: readStringArray(shot.participantRefIds).map((refId) => nameForCinematicRef(input.assetPack, refId) || refId),
        location: nameForCinematicRef(input.assetPack, readText(shot.locationRefId)) || readText(shot.locationRefId),
        props: readStringArray(shot.propRefIds).map((refId) => nameForCinematicRef(input.assetPack, refId) || refId),
        actions,
        dialogue,
        audioCues,
        action: actionTextForCompiledShot(shot, input.assetPack),
        camera: [readText(shot.cameraMovement), readText(shot.cameraAngle), readText(shot.framing), readText(shot.lensPreference)].filter(Boolean).join(', '),
        composition: readText(shot.compositionGuide) || readText(shot.visualPrompt),
        audio: audioTextForCompiledShot(shot),
        referenceNotes: 'Storyboard-grid reference mode uses the beat sheet first, followed by individual entity/environment/prop reference sheets.',
      }
    })
  const storyboardPanelPlan = asRecord(take.storyboardPanelPlan)
  const storyboardPanels = Array.isArray(storyboardPanelPlan.panels) ? storyboardPanelPlan.panels.map(asRecord) : []
  return {
    blockNumber: Number(take.takeIndex ?? 0) + 1,
    blockCount: input.takePlan.length,
    takeId: readText(take.takeId),
    takeIndex: Number(take.takeIndex ?? 0) || 0,
    durationSeconds,
    title: readText(take.title) || `Take ${(Number(take.takeIndex ?? 0) || 0) + 1}`,
    storyFunction: readText(take.breakReason) || 'compiled cinematic take',
    hook: shots[0]?.action ?? '',
    summary: readText(take.representativeStillPrompt) || shots.map((shot) => shot.action).join(' '),
    continuityNotes: readStringArray(take.continuityRefIds),
    truthSourceMode: readText(take.truthSourceMode),
    referenceLegend: Array.isArray(take.referenceLegend) ? take.referenceLegend : [],
    timelineCells: Array.isArray(take.timelineCells) ? take.timelineCells : [],
    continuityLock: readText(take.continuityLock),
    positiveConstraints: readStringArray(take.positiveConstraints),
    beatSheetPlan: take.beatSheetPlan ?? null,
    keyframePlan: take.keyframePlan ?? null,
    planningOnlyArtifactKeys: readStringArray(take.planningOnlyArtifactKeys),
    storyboardPanels,
    shots,
  }
}

function dynamicNodeRow(input: {
  workflow: OutputWorkflow
  key: string
  nodeType: OutputWorkflowNode['nodeType']
  label: string
  x: number
  y: number
  config: Record<string, unknown>
  compileHash: string
  generatedByNodeKey?: string
}) {
  return dynamicWorkflowNodeRow(input)
}

function preserveExistingDynamicNodeOutput(input: {
  nextRow: Record<string, unknown>
  existingNode: OutputWorkflowNodeRow | null | undefined
  existingStep?: OutputWorkflowRunStepRow | null
  preserve: boolean
  compileHash: string
}) {
  return preserveExistingDynamicWorkflowNodeOutput({
    ...input,
    helpers: {
      asRecord,
      readText,
      hashValue: hashOutputWorkflowValue,
      hasStoredOutputs,
      buildOutputPreview: (previewInput) => buildOutputWorkflowNodeOutputPreview({
        node: {
          key: previewInput.node.key,
          nodeType: previewInput.node.nodeType as OutputWorkflowNode['nodeType'],
          outputHash: previewInput.node.outputHash,
        },
        outputs: previewInput.outputs,
        provider: previewInput.provider,
        model: previewInput.model,
      }),
    },
  })
}

function isStaleDynamicCinematicNode(node: { metadata?: unknown } | null | undefined) {
  const metadata = asRecord(node?.metadata)
  return metadata.dynamicCinematicGenerated === true && metadata.dynamicCinematicStale === true
}

function isDynamicCinematicFanoutNodeKey(key: string) {
  return key === 'sequence_animatic_scene_plan_fanout' || key === 'cinematic_v3_dynamic_shot_parse_fanout' || key === 'cinematic_v3_dynamic_storyboard_fanout' || key === 'cinematic_v2_dynamic_shot_fanout' || key === 'cinematic_dynamic_take_fanout'
}

function dynamicEdgeRow(input: {
  workflow: OutputWorkflow
  key: string
  sourceNodeKey: string
  sourcePort: string
  targetNodeKey: string
  targetPort: string
  compileHash: string
  metadata?: Record<string, unknown>
  generatedByNodeKey?: string
}) {
  return dynamicWorkflowEdgeRow(input)
}

async function persistDynamicWorkflowGraphRevision(input: {
  client: DatabaseClient
  workflow: OutputWorkflow
  nodeRows: Record<string, unknown>[]
  edgeRows: Record<string, unknown>[]
  existingDynamicNodes: OutputWorkflowNodeRow[]
  dynamicEdgeKeys: string[]
  compileHash: string
  staleReason: string
  workflowMetadataPatch: Record<string, unknown>
}) {
  return persistDynamicWorkflowGraphRevisionRuntime({
    ...input,
    client: input.client as never,
    helpers: { asRecord, readText },
  })
}

async function materializeDynamicCinematicTakeFanout(input: {
  client: DatabaseClient
  workflow: OutputWorkflow
  compileOutputs: Record<string, unknown>
  config: Record<string, unknown>
}) {
  const takePlan = Array.isArray(input.compileOutputs.takePlan) ? input.compileOutputs.takePlan.map(asRecord) : []
  const compileHash = readText(input.compileOutputs.compileHash) || hashOutputWorkflowValue(input.compileOutputs)
  if (takePlan.length === 0) throw new Error('Cannot materialize cinematic takes because the compile output has no takePlan.')

  const aspectRatio = readText(input.config.aspectRatio) || '16:9'
  const resolution = readText(input.config.resolution) || '720p'
  const generateAudio = input.config.generateAudio !== false
  const debugSkipVideoGeneration = input.config.debugSkipVideoGeneration === true
  const videoProvider = resolveOutputVideoProvider(input.config)
  const videoModel = readText(input.config.videoModel)
    || readText(input.config.model)
    || outputWorkflowDefaultVideoModel(videoProvider, resolution)
  const presetFamily = readText(input.config.presetFamily) || 'story_movie_tv'
  const cinematicReferenceMode = normalizeCinematicReferenceMode(input.config.cinematicReferenceMode)
  const storyboardStylePolicy = resolveCinematicStoryboardStylePolicy(input.config)
  const useKeyframes = cinematicReferenceMode === 'keyframes' || cinematicReferenceMode === 'keyframes_and_storyboard'
  const useStoryboardReference = cinematicReferenceMode !== 'keyframes'
  const useDirectionSheet = cinematicReferenceMode === 'shot_reference_sheet'
  const keyframeImageSize = keyframeImageSizeForAspectRatio(aspectRatio)

  const existingNodeResponse = await input.client
    .from('output_workflow_nodes')
    .select(outputWorkflowNodeSelect)
    .eq('workflow_id', input.workflow.id)
  if (existingNodeResponse.error) throw new Error(existingNodeResponse.error.message)
  const existingDynamicNodes = ((existingNodeResponse.data ?? []) as OutputWorkflowNodeRow[])
    .filter((row) => asRecord(row.metadata).dynamicCinematicGenerated === true)
  const existingReferenceModes = existingDynamicNodes
    .map((row) => readText(asRecord(row.config).cinematicReferenceMode))
    .filter(Boolean)
  const existingStoryboardStyleModes = existingDynamicNodes
    .map((row) => asRecord(row.config))
    .filter((config) => readText(config.purpose) === 'cinematic_beat_sheet_prompt' || readText(config.purpose) === 'cinematic_beat_sheet')
    .map((config) => `${config.debugCinematicStoryboardStyleSafeMode === true}:${readText(config.cinematicStoryboardStyleOverride)}`)
    .filter(Boolean)
  const existingModeMatches = existingReferenceModes.length === 0
    || existingReferenceModes.every((mode) => mode === cinematicReferenceMode)
  const styleModeKey = `${storyboardStylePolicy.safeMode === true}:${storyboardStylePolicy.stylePrompt}`
  const existingStyleModeMatches = existingStoryboardStyleModes.length === 0
    || existingStoryboardStyleModes.every((mode) => mode === styleModeKey)
  const existingSameHash = existingDynamicNodes.length > 0
    && existingDynamicNodes.every((row) => readText(asRecord(row.metadata).dynamicCompileHash) === compileHash)
    && existingModeMatches
    && existingStyleModeMatches
    && existingDynamicNodes.some((row) => row.key === 'video_stitch')
    && existingDynamicNodes.some((row) => row.key.endsWith('_beat_sheet'))
    && (!useKeyframes || existingDynamicNodes.some((row) => row.key.endsWith('_keyframe_001')))
  if (existingSameHash) return { expanded: false, compileHash, takeCount: takePlan.length }

  const existingEdgeResponse = await input.client
    .from('output_workflow_edges')
    .select(outputWorkflowEdgeSelect)
    .eq('workflow_id', input.workflow.id)
  if (existingEdgeResponse.error) throw new Error(existingEdgeResponse.error.message)
  const dynamicEdgeKeys = ((existingEdgeResponse.data ?? []) as OutputWorkflowEdgeRow[])
    .filter((row) => asRecord(row.metadata).dynamicCinematicGenerated === true)
    .map((row) => row.key)
  const nodeRows: Record<string, unknown>[] = []
  const edgeRows: Record<string, unknown>[] = []
  takePlan.forEach((take, index) => {
    const takeNumber = index + 1
    const suffix = String(takeNumber).padStart(3, '0')
    const takeId = readText(take.takeId) || `take_${takeNumber}`
    const durationSeconds = Math.max(4, Math.min(15, Number(take.durationSeconds ?? 4) || 4))
    const y = 40 + index * 220
    const beatSheetPromptKey = `take_${suffix}_beat_sheet_prompt`
    const beatSheetKey = `take_${suffix}_beat_sheet`
    const keyframePromptPackKey = `take_${suffix}_keyframe_prompt_pack`
    const keyframeKeys = [1, 2, 3].map((keyframeNumber) => `take_${suffix}_keyframe_${String(keyframeNumber).padStart(3, '0')}`)
    const videoPromptKey = `take_${suffix}_video_prompt`
    const videoKey = `take_${suffix}_video`
    nodeRows.push(
      dynamicNodeRow({ workflow: input.workflow, key: beatSheetPromptKey, nodeType: 'utility_transform', label: `Take ${takeNumber} ${useDirectionSheet ? 'Direction Sheet' : 'Beat Sheet'} Prompt`, x: 1760, y, compileHash, config: { purpose: 'cinematic_beat_sheet_prompt', takeId, takeIndex: index, aspectRatio, presetFamily, planningOnly: true, cinematicReferenceMode, referenceSheetKind: useDirectionSheet ? 'shot_reference_sheet' : 'storyboard_sheet', debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode, cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt, execution: { resourceClass: 'utility', groupKey: 'cinematic_beat_sheet_prompts', maxConcurrency: 6 } } }),
      dynamicNodeRow({ workflow: input.workflow, key: beatSheetKey, nodeType: 'image_generation', label: `Take ${takeNumber} ${useDirectionSheet ? 'Direction Sheet' : 'Beat Sheet'}`, x: 2040, y, compileHash, config: { purpose: 'cinematic_beat_sheet', role: useDirectionSheet ? 'cinematic_direction_sheet' : 'cinematic_beat_sheet', takeId, takeIndex: index, planningOnly: true, planning_only: true, usedAsVideoReference: useStoryboardReference, model: 'openai/gpt-image-2', referenceModel: 'openai/gpt-image-2/edit', quality: CINEMATIC_STORYBOARD_IMAGE_QUALITY, outputFormat: 'webp', maxReferenceImages: 16, imageSizePolicy: useDirectionSheet ? 'from_direction_sheet_layout' : 'from_beat_sheet_prompt_layout', panelAspectRatio: aspectRatio, cinematicReferenceMode, referenceSheetKind: useDirectionSheet ? 'shot_reference_sheet' : 'storyboard_sheet', debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode, cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt, skillKeys: [useDirectionSheet ? 'cinematic_direction_sheet_planning' : 'cinematic_beat_sheet_planning', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'], autoSkillTags: useDirectionSheet ? ['direction_sheet', 'shot_reference_sheet', 'camera_layout', 'floor_map', 'planning_only', 'video_reference', 'image_prompt', 'entity_reference', 'reference_continuity'] : ['beat_sheet', 'storyboard', 'planning_only', 'video_reference', 'image_prompt', 'entity_reference', 'reference_continuity'], guidanceMode: 'strict', execution: { resourceClass: 'image', groupKey: 'cinematic_beat_sheets', maxConcurrency: 8 } } }),
      ...(useKeyframes ? [
        dynamicNodeRow({ workflow: input.workflow, key: keyframePromptPackKey, nodeType: 'utility_transform', label: `Take ${takeNumber} Keyframe Prompts`, x: 2320, y, compileHash, config: { purpose: 'cinematic_keyframe_prompt_pack', takeId, takeIndex: index, aspectRatio, presetFamily, debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode, cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt, execution: { resourceClass: 'utility', groupKey: 'cinematic_keyframe_prompt_packs', maxConcurrency: 6 } } }),
        ...keyframeKeys.map((keyframeKey, keyframeIndex) => dynamicNodeRow({ workflow: input.workflow, key: keyframeKey, nodeType: 'image_generation', label: `Take ${takeNumber} Keyframe ${keyframeIndex + 1}`, x: 2600 + keyframeIndex * 40, y: y + keyframeIndex * 44, compileHash, config: { purpose: 'cinematic_keyframe', role: 'cinematic_keyframe', takeId, takeIndex: index, keyframeIndex, model: 'openai/gpt-image-2', referenceModel: 'openai/gpt-image-2/edit', quality: 'low', outputFormat: 'webp', maxReferenceImages: 16, imageSize: keyframeImageSize, aspectRatio, skillKeys: ['cinematic_keyframe_prompting', 'image_prompt_visual_only', 'entity_reference_fidelity', 'character_reference_continuity', 'provider_prompt_hygiene'], autoSkillTags: ['keyframe', 'image_prompt', 'visual_only', 'entity_reference', 'reference_continuity'], guidanceMode: 'strict', execution: { resourceClass: 'image', groupKey: 'cinematic_keyframes', maxConcurrency: 8 } } })),
      ] : []),
      dynamicNodeRow({ workflow: input.workflow, key: videoPromptKey, nodeType: 'utility_transform', label: `Take ${takeNumber} Video Prompt`, x: 2880, y, compileHash, config: { purpose: 'cinematic_video_prompt', takeId, takeIndex: index, durationSeconds, aspectRatio, resolution, generateAudio, presetFamily, cinematicReferenceMode, debugCinematicStoryboardStyleSafeMode: storyboardStylePolicy.safeMode, cinematicStoryboardStyleOverride: storyboardStylePolicy.stylePrompt, debugSkipVideoGeneration, execution: { resourceClass: 'utility', groupKey: 'cinematic_video_prompts', maxConcurrency: 6 } } }),
      dynamicNodeRow({ workflow: input.workflow, key: videoKey, nodeType: 'video_generation', label: `Take ${takeNumber} Video`, x: 3160, y, compileHash, config: { purpose: 'cinematic_block_video', role: 'cinematic_block', takeId, takeIndex: index, provider: videoProvider, videoProvider, model: videoModel, durationSeconds, aspectRatio, resolution, generateAudio, cinematicReferenceMode, debugSkipVideoGeneration, syncMode: false, skillKeys: ['seedance_reference_video_prompting', 'seedance_truth_source_modes', 'seedance_reference_legend_contract', 'seedance_timeline_call_sheet', 'cinematic_shot_direction', 'shortform_hook_retention', 'brand_ugc_proof_structure', 'provider_prompt_hygiene'], autoSkillTags: ['video_prompt', 'seedance', 'cinematic', 'ugc', 'provider_hygiene'], guidanceMode: 'strict', execution: { resourceClass: 'video', groupKey: 'cinematic_videos', maxConcurrency: Math.min(takePlan.length, 8) } } }),
    )
    const takeMeta = { takeId, takeIndex: index }
    edgeRows.push(
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_sequence_compile__${beatSheetPromptKey}`, sourceNodeKey: 'cinematic_sequence_compile', sourcePort: 'takePlan', targetNodeKey: beatSheetPromptKey, targetPort: 'script', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${beatSheetPromptKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: beatSheetPromptKey, targetPort: 'asset_pack', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${beatSheetPromptKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: beatSheetPromptKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `${beatSheetPromptKey}__${beatSheetKey}`, sourceNodeKey: beatSheetPromptKey, sourcePort: 'text', targetNodeKey: beatSheetKey, targetPort: 'prompt', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${beatSheetKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: beatSheetKey, targetPort: 'references', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${beatSheetKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: beatSheetKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
      ...(useKeyframes ? [
        dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_sequence_compile__${keyframePromptPackKey}`, sourceNodeKey: 'cinematic_sequence_compile', sourcePort: 'takePlan', targetNodeKey: keyframePromptPackKey, targetPort: 'script', compileHash, metadata: takeMeta }),
        dynamicEdgeRow({ workflow: input.workflow, key: `${beatSheetPromptKey}__${keyframePromptPackKey}`, sourceNodeKey: beatSheetPromptKey, sourcePort: 'beatSheetPlan', targetNodeKey: keyframePromptPackKey, targetPort: 'beat_sheet_plan', compileHash, metadata: takeMeta }),
        dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${keyframePromptPackKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: keyframePromptPackKey, targetPort: 'asset_pack', compileHash, metadata: takeMeta }),
        dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${keyframePromptPackKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: keyframePromptPackKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
        ...keyframeKeys.flatMap((keyframeKey) => [
        dynamicEdgeRow({ workflow: input.workflow, key: `${keyframePromptPackKey}__${keyframeKey}`, sourceNodeKey: keyframePromptPackKey, sourcePort: 'keyframePrompts', targetNodeKey: keyframeKey, targetPort: 'prompt', compileHash, metadata: takeMeta }),
        dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${keyframeKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: keyframeKey, targetPort: 'references', compileHash, metadata: takeMeta }),
        dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${keyframeKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: keyframeKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
        ]),
      ] : []),
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_sequence_compile__${videoPromptKey}`, sourceNodeKey: 'cinematic_sequence_compile', sourcePort: 'takePlan', targetNodeKey: videoPromptKey, targetPort: 'script', compileHash, metadata: takeMeta }),
      ...(useStoryboardReference ? [dynamicEdgeRow({ workflow: input.workflow, key: `${beatSheetKey}__${videoPromptKey}`, sourceNodeKey: beatSheetKey, sourcePort: 'image', targetNodeKey: videoPromptKey, targetPort: 'references', compileHash, metadata: takeMeta })] : []),
      ...(useKeyframes ? [
        dynamicEdgeRow({ workflow: input.workflow, key: `${keyframePromptPackKey}__${videoPromptKey}`, sourceNodeKey: keyframePromptPackKey, sourcePort: 'keyframePlan', targetNodeKey: videoPromptKey, targetPort: 'keyframes', compileHash, metadata: takeMeta }),
        ...keyframeKeys.map((keyframeKey) => dynamicEdgeRow({ workflow: input.workflow, key: `${keyframeKey}__${videoPromptKey}`, sourceNodeKey: keyframeKey, sourcePort: 'image', targetNodeKey: videoPromptKey, targetPort: 'references', compileHash, metadata: takeMeta })),
      ] : []),
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${videoPromptKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: videoPromptKey, targetPort: 'asset_pack', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${videoPromptKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: videoPromptKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `${videoPromptKey}__${videoKey}`, sourceNodeKey: videoPromptKey, sourcePort: 'text', targetNodeKey: videoKey, targetPort: 'prompt', compileHash, metadata: takeMeta }),
      ...(useKeyframes ? keyframeKeys.map((keyframeKey) => dynamicEdgeRow({ workflow: input.workflow, key: `${keyframeKey}__${videoKey}`, sourceNodeKey: keyframeKey, sourcePort: 'image', targetNodeKey: videoKey, targetPort: 'references', compileHash, metadata: takeMeta })) : []),
      dynamicEdgeRow({ workflow: input.workflow, key: `cinematic_entities__${videoKey}`, sourceNodeKey: 'cinematic_entities', sourcePort: 'asset_pack', targetNodeKey: videoKey, targetPort: 'references', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `skill_context__${videoKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: videoKey, targetPort: 'guidance', compileHash, metadata: takeMeta }),
      dynamicEdgeRow({ workflow: input.workflow, key: `${videoKey}__video_stitch`, sourceNodeKey: videoKey, sourcePort: 'video', targetNodeKey: 'video_stitch', targetPort: 'videos', compileHash, metadata: takeMeta }),
    )
    if (useStoryboardReference) {
      edgeRows.push(dynamicEdgeRow({ workflow: input.workflow, key: `${beatSheetKey}__${videoKey}`, sourceNodeKey: beatSheetKey, sourcePort: 'image', targetNodeKey: videoKey, targetPort: 'references', compileHash, metadata: takeMeta }))
    }
  })
  nodeRows.push(
    dynamicNodeRow({ workflow: input.workflow, key: 'video_stitch', nodeType: 'utility_transform', label: 'Stitch Video', x: 3440, y: 120, compileHash, config: { purpose: 'video_stitch', role: 'cinematic_sequence_final', dynamicTakeCount: takePlan.length, aspectRatio, resolution, debugSkipVideoGeneration, execution: { resourceClass: 'video', groupKey: 'video_stitch', maxConcurrency: 1 } } }),
    dynamicNodeRow({ workflow: input.workflow, key: 'artifact', nodeType: 'output_artifact', label: 'Register Video', x: 3720, y: 120, compileHash, config: { purpose: 'cinematic_video_artifact', artifactKind: 'video', execution: { resourceClass: 'utility' } } }),
  )
  edgeRows.push(dynamicEdgeRow({ workflow: input.workflow, key: 'video_stitch__artifact', sourceNodeKey: 'video_stitch', sourcePort: 'video', targetNodeKey: 'artifact', targetPort: 'input', compileHash }))

  await persistDynamicWorkflowGraphRevision({
    client: input.client,
    workflow: input.workflow,
    nodeRows,
    edgeRows,
    existingDynamicNodes,
    dynamicEdgeKeys,
    compileHash,
    staleReason: 'dynamic_fanout_rematerialized',
    workflowMetadataPatch: {
      directorScriptDoc: input.compileOutputs.directorScriptDoc ?? null,
      cinematicScriptDoc: input.compileOutputs.cinematicScriptDoc ?? null,
      compiledCinematicSequence: input.compileOutputs.compiledCinematicSequence ?? null,
      dynamicTakeCount: takePlan.length,
      totalDurationSeconds: Number(input.compileOutputs.totalDurationSeconds ?? 0) || null,
      scriptDurationSource: readText(input.compileOutputs.scriptDurationSource) || 'authored_script',
      cinematicReferenceMode,
      videoProvider,
      videoModel,
      debugSkipVideoGeneration,
      cinematicV2AnimaticMode,
      dynamicCinematicCompileHash: compileHash,
      dynamicGraphVersion: `${compileHash}:${nodeRows.length}:${edgeRows.length}`,
    },
  })
  return { expanded: true, compileHash, takeCount: takePlan.length }
}

function createCinematicDynamicFanoutMaterializerHelpers() {
  return {
    asRecord,
    readText,
    readStringArray,
    hashOutputWorkflowValue,
    hasStoredOutputs,
    isStaleDynamicCinematicNode: (node: unknown) => isStaleDynamicCinematicNode(node as never),
    loadWorkflowNodes: async (input: { client: unknown; workflowId: string }) => {
      const response = await (input.client as DatabaseClient)
        .from('output_workflow_nodes')
        .select(outputWorkflowNodeSelect)
        .eq('workflow_id', input.workflowId)
      if (response.error) throw new Error(response.error.message)
      return (response.data ?? []) as Record<string, unknown>[]
    },
    loadWorkflowRunSteps: async (input: { client: unknown; workflowId: string; runId: string }) => {
      const response = await (input.client as DatabaseClient)
        .from('output_workflow_run_steps')
        .select(outputWorkflowRunStepSelect)
        .eq('run_id', input.runId)
        .eq('workflow_id', input.workflowId)
      if (response.error) throw new Error(response.error.message)
      return (response.data ?? []) as Record<string, unknown>[]
    },
    loadWorkflowEdges: async (input: { client: unknown; workflowId: string }) => {
      const response = await (input.client as DatabaseClient)
        .from('output_workflow_edges')
        .select(outputWorkflowEdgeSelect)
        .eq('workflow_id', input.workflowId)
      if (response.error) throw new Error(response.error.message)
      return (response.data ?? []) as Record<string, unknown>[]
    },
    dynamicNodeRow: (input: Record<string, unknown>) => dynamicNodeRow(input as never) as Record<string, unknown>,
    dynamicEdgeRow: (input: Record<string, unknown>) => dynamicEdgeRow(input as never) as Record<string, unknown>,
    preserveExistingDynamicNodeOutput: (input: {
      nextRow: Record<string, unknown>
      existingNode?: Record<string, unknown> | null
      existingStep?: Record<string, unknown> | null
      compileHash: string
      preserve: boolean
    }) => preserveExistingDynamicNodeOutput(input as never) as Record<string, unknown>,
    persistDynamicWorkflowGraphRevision: (input: {
      client: unknown
      workflow: unknown
      nodeRows: Record<string, unknown>[]
      edgeRows: Record<string, unknown>[]
      existingDynamicNodes: Record<string, unknown>[]
      dynamicEdgeKeys: string[]
      compileHash: string
      staleReason: string
      workflowMetadataPatch: Record<string, unknown>
    }) => persistDynamicWorkflowGraphRevision(input as never),
  }
}

async function materializeDynamicCinematicV3StoryboardFanout(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  compileOutputs: Record<string, unknown>
  config: Record<string, unknown>
}) {
  return materializeDynamicCinematicV3StoryboardFanoutRuntime(input, createCinematicDynamicFanoutMaterializerHelpers())
}

async function materializeDynamicCinematicV3ShotParseFanout(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  compileOutputs: Record<string, unknown>
  config: Record<string, unknown>
}) {
  return materializeDynamicCinematicV3ShotParseFanoutRuntime(input, createCinematicDynamicFanoutMaterializerHelpers())
}
async function materializeDynamicCinematicV2ShotFanout(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  compileOutputs: Record<string, unknown>
  config: Record<string, unknown>
}) {
  return materializeDynamicCinematicV2ShotFanoutRuntime(input, createCinematicDynamicFanoutMaterializerHelpers())
}

function buildComicEntitySelectorInstruction(input: {
  context: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    'Select the entities that must visually appear in this comic issue.',
    'Return only JSON with shape: {"entities":[{"key":"","name":"","type":"","role":"","visualDescription":"","visualTraits":[],"visualTraitMap":{},"assetKeys":[]}],"missingReferenceEntityKeys":[]}.',
    'Use the supplied entity keys exactly. Do not invent new keys.',
    'Preserve neutral visual identity traits as continuity anchors. Do not replace identity with momentary action, injuries, lighting, camera angle, or scene state.',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({
      sequenceUnit,
      entities: Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 24) : [],
      relationships: Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord).slice(0, 40) : [],
      assets: Array.isArray(input.context.assets) ? input.context.assets.map(asRecord).slice(0, 40) : [],
      wiki: asRecord(input.context.wiki),
    }),
  ].filter(Boolean).join('\n\n')
}

function buildComicSceneScriptInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
  pageCount: number
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    `Adapt the selected sequence unit into a rich dramatic scene script for a ${input.pageCount}-page comic issue.`,
    'Return only JSON matching the requested schema. Do not write final comic panels yet.',
    'The scene script must give the later page planner enough dramatic material: goal, obstacle, escalation, reversal, consequence, visual moments, dialogue beats, and emotional turns.',
    'Write visually and specifically. Every dramatic beat should be stageable as comic action, not prose summary.',
    'Preserve the sequence unit outcome and canon facts. Do not invent new world canon to improve pacing.',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({
      wiki: asRecord(input.context.wiki),
      sequenceUnit,
      assetPack: input.assetPack,
      relationships: Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord).slice(0, 40) : [],
    }),
  ].filter(Boolean).join('\n\n')
}

function comicSceneScriptMarkdown(sceneScript: Record<string, unknown>) {
  const characters = Array.isArray(sceneScript.characters) ? sceneScript.characters.map(asRecord) : []
  const dramaticBeats = Array.isArray(sceneScript.dramaticBeats) ? sceneScript.dramaticBeats.map(asRecord) : []
  const dialogueBeats = Array.isArray(sceneScript.dialogueBeats) ? sceneScript.dialogueBeats.map(asRecord) : []
  return [
    `# ${readText(sceneScript.title) || 'Comic Scene Script'}`,
    readText(sceneScript.premise) ? `Premise: ${readText(sceneScript.premise)}` : '',
    readText(sceneScript.sequenceOutcome) ? `Outcome: ${readText(sceneScript.sequenceOutcome)}` : '',
    readStringArray(sceneScript.canonConstraints).length > 0 ? `Canon constraints:\n${readStringArray(sceneScript.canonConstraints).map((entry) => `- ${entry}`).join('\n')}` : '',
    characters.length > 0 ? `## Characters\n${characters.map((character) => [
      `- ${readText(character.name) || readText(character.key)}`,
      readText(character.want) ? `want: ${readText(character.want)}` : '',
      readText(character.pressure) ? `pressure: ${readText(character.pressure)}` : '',
      readText(character.visualContinuity) ? `visual: ${readText(character.visualContinuity)}` : '',
    ].filter(Boolean).join('; ')).join('\n')}` : '',
    dramaticBeats.length > 0 ? `## Dramatic Beats\n${dramaticBeats.map((beat, index) => [
      `${Number(beat.beatNumber ?? index + 1)}. ${readText(beat.function)}`,
      readText(beat.action),
      readText(beat.conflict) ? `Conflict: ${readText(beat.conflict)}` : '',
      readText(beat.turn) ? `Turn: ${readText(beat.turn)}` : '',
      readText(beat.consequence) ? `Consequence: ${readText(beat.consequence)}` : '',
    ].filter(Boolean).join(' ')).join('\n\n')}` : '',
    readStringArray(sceneScript.visualMoments).length > 0 ? `## Visual Moments\n${readStringArray(sceneScript.visualMoments).map((entry) => `- ${entry}`).join('\n')}` : '',
    dialogueBeats.length > 0 ? `## Dialogue Beats\n${dialogueBeats.map((beat) => `- ${readText(beat.speaker)}: ${readText(beat.intent)}${readText(beat.sampleLine) ? ` | "${readText(beat.sampleLine)}"` : ''}`).join('\n')}` : '',
    readStringArray(sceneScript.emotionalTurns).length > 0 ? `## Emotional Turns\n${readStringArray(sceneScript.emotionalTurns).map((entry) => `- ${entry}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

function buildComicPagePlanInstruction(input: {
  context: Record<string, unknown>
  sceneScript: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
  pageCount: number
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    `Compress the scene script into exactly ${input.pageCount} comic pages.`,
    'Return only JSON matching the requested schema.',
    'Each page must have a unique story function, concrete included beats, explicit omitted/merged beats when compression is needed, a page turn, setting, entity keys, panel budget from 3 to 6, and dialogue/caption intent.',
    'Use page turns to escalate the sequence instead of repeating the same premise. Preserve the final sequence outcome.',
    'Do not write final panel script yet; this node only plans page rhythm and compression.',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({
      sceneScript: input.sceneScript,
      sequenceUnit,
      assetPack: input.assetPack,
      wiki: asRecord(input.context.wiki),
    }),
  ].filter(Boolean).join('\n\n')
}

function comicPagePlanMarkdown(pagePlan: Record<string, unknown>) {
  const pages = Array.isArray(pagePlan.pages) ? pagePlan.pages.map(asRecord) : []
  return [
    `# ${readText(pagePlan.title) || 'Comic Page Plan'}`,
    `Page count: ${Number(pagePlan.pageCount ?? pages.length) || pages.length}`,
    ...pages.map((page, index) => [
      `## Page ${Number(page.pageNumber ?? index + 1)}`,
      readText(page.storyFunction) ? `Function: ${readText(page.storyFunction)}` : '',
      readStringArray(page.includedBeats).length > 0 ? `Included: ${readStringArray(page.includedBeats).join('; ')}` : '',
      readStringArray(page.omittedOrMergedBeats).length > 0 ? `Omitted/Merged: ${readStringArray(page.omittedOrMergedBeats).join('; ')}` : '',
      readText(page.pageTurn) ? `Page turn: ${readText(page.pageTurn)}` : '',
      readText(page.setting) ? `Setting: ${readText(page.setting)}` : '',
      `Panel budget: ${Number(page.panelBudget ?? 0) || 4}`,
      readText(page.dialogueCaptionIntent) ? `Text intent: ${readText(page.dialogueCaptionIntent)}` : '',
    ].filter(Boolean).join('\n')),
  ].filter(Boolean).join('\n\n')
}

function validateComicPagePlan(pagePlan: Record<string, unknown>, input: { pageCount: number }) {
  const diagnostics: string[] = []
  const pages = Array.isArray(pagePlan.pages) ? pagePlan.pages.map(asRecord) : []
  if (pages.length !== input.pageCount) diagnostics.push(`Expected ${input.pageCount} planned comic pages, got ${pages.length}.`)
  for (let index = 0; index < input.pageCount; index += 1) {
    const pageNumber = index + 1
    const page = pages.find((entry) => Number(entry.pageNumber ?? 0) === pageNumber) ?? pages[index] ?? {}
    const panelBudget = Number(page.panelBudget ?? 0)
    if (!readText(page.storyFunction)) diagnostics.push(`Page plan ${pageNumber} is missing a story function.`)
    if (!readText(page.pageTurn)) diagnostics.push(`Page plan ${pageNumber} is missing a page turn.`)
    if (!readText(page.setting)) diagnostics.push(`Page plan ${pageNumber} is missing a setting.`)
    if (!Number.isFinite(panelBudget) || panelBudget < 3 || panelBudget > 6) diagnostics.push(`Page plan ${pageNumber} has invalid panel budget.`)
    if (readStringArray(page.includedBeats).length === 0) diagnostics.push(`Page plan ${pageNumber} has no included beats.`)
  }
  return diagnostics
}

function normalizeComicScript(raw: Record<string, unknown>, input: {
  context: Record<string, unknown>
  pageCount: number
  prompt: string
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  const sequence = asRecord(sequenceUnit.customProperties).sequence && typeof asRecord(sequenceUnit.customProperties).sequence === 'object'
    ? asRecord(asRecord(sequenceUnit.customProperties).sequence)
    : {}
  const sequenceOutcome = readText(sequence.outcome) || readText(sequenceUnit.summary)
  const rawPages = Array.isArray(raw.pages) ? raw.pages.map(asRecord) : []
  const pages = Array.from({ length: input.pageCount }, (_, index) => {
    const pageNumber = index + 1
    const rawPage = rawPages.find((page) => Number(page.pageNumber ?? page.page ?? 0) === pageNumber) ?? rawPages[index] ?? {}
    const rawPanels = rawPage.panels ?? rawPage.Panels ?? rawPage.panelScript ?? rawPage.panelDescriptions
    const panels = Array.isArray(rawPanels) ? rawPanels.map(asRecord) : []
    const continuityNotes = readText(rawPage.continuityNotes)
      || (sequenceOutcome ? `Maintain continuity with selected sequence outcome: ${sequenceOutcome}` : '')
    return {
      pageNumber,
      panelLayout: readText(rawPage.panelLayout) || (pageNumber === 1 ? '4 cinematic panels with a strong establishing panel' : '5 balanced comic panels'),
      setting: readText(rawPage.setting) || readText(rawPage.location),
      mood: readText(rawPage.mood) || readText(rawPage.tone),
      continuityNotes,
      requiredEntityKeys: readStringArray(rawPage.requiredEntityKeys),
      panels: panels.length > 0 ? panels.map((panel, panelIndex) => ({
        panelNumber: Number(panel.panelNumber ?? panelIndex + 1),
        shot: readText(panel.shot),
        action: readText(panel.action),
        dialogue: readText(panel.dialogue),
        caption: readText(panel.caption),
        characters: readStringArray(panel.characters),
      })) : [],
    }
  })
  return {
    title: readText(raw.title) || readText(sequenceUnit.name) || 'Generated Comic',
    pageCount: input.pageCount,
    logline: readText(raw.logline),
    pages,
  }
}

function normalizeComicScriptText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function validateComicScript(script: Record<string, unknown>, input: { pageCount: number }) {
  const diagnostics: string[] = []
  const pages = Array.isArray(script.pages) ? script.pages.map(asRecord) : []
  if (pages.length !== input.pageCount) {
    diagnostics.push(`Expected ${input.pageCount} comic pages, got ${pages.length}.`)
  }

  const panelSignatures = new Map<string, number>()
  let totalPanels = 0
  let textBearingPanels = 0

  for (let index = 0; index < input.pageCount; index += 1) {
    const pageNumber = index + 1
    const page = pages.find((entry) => Number(entry.pageNumber ?? 0) === pageNumber) ?? pages[index] ?? {}
    const panels = Array.isArray(page.panels) ? page.panels.map(asRecord) : []
    totalPanels += panels.length
    if (panels.length < 3) diagnostics.push(`Page ${pageNumber} has ${panels.length} panels; expected at least 3 complete panels.`)
    if (panels.length > 6) diagnostics.push(`Page ${pageNumber} has ${panels.length} panels; expected at most 6 panels.`)
    if (!readText(page.setting)) diagnostics.push(`Page ${pageNumber} is missing a setting.`)

    for (let panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
      const panelNumber = panelIndex + 1
      const panel = panels[panelIndex]
      const shot = readText(panel.shot)
      const action = readText(panel.action)
      const dialogue = readText(panel.dialogue)
      const caption = readText(panel.caption)
      if (shot.length < 8) diagnostics.push(`Page ${pageNumber}, panel ${panelNumber} has no usable shot description.`)
      if (action.length < 24) diagnostics.push(`Page ${pageNumber}, panel ${panelNumber} has no usable action description.`)
      if (dialogue || caption) textBearingPanels += 1
      const signature = normalizeComicScriptText([shot, action, dialogue, caption].join(' '))
      if (signature) panelSignatures.set(signature, (panelSignatures.get(signature) ?? 0) + 1)
    }
  }

  const repeatedPanels = [...panelSignatures.entries()].filter(([, count]) => count > 1)
  if (repeatedPanels.length > 0) {
    diagnostics.push(`Comic script repeats ${repeatedPanels.length} panel(s) verbatim across pages.`)
  }
  if (totalPanels < input.pageCount * 3) {
    diagnostics.push(`Comic script has ${totalPanels} total panels; expected at least ${input.pageCount * 3}.`)
  }
  if (textBearingPanels < Math.max(1, Math.ceil(input.pageCount / 2))) {
    diagnostics.push('Comic script has too little dialogue/caption text for a readable issue.')
  }

  return diagnostics
}

function buildComicScriptInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  sceneScript: Record<string, unknown>
  pagePlan: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
  pageCount: number
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    `Convert the upstream scene script and page plan into a final ${input.pageCount}-page comic production script.`,
    'Return only JSON with shape: {"title":"","logline":"","pageCount":8,"pages":[{"pageNumber":1,"panelLayout":"","setting":"","mood":"","requiredEntityKeys":[],"continuityNotes":"","panels":[{"panelNumber":1,"shot":"","action":"","dialogue":"","caption":"","characters":[]}]}]}.',
    `The pages array must contain exactly ${input.pageCount} pages, numbered 1 through ${input.pageCount}.`,
    'Treat the scene script and page plan as source of truth. Do not re-outline from scratch.',
    'For each page, follow that page plan story function, included beats, page turn, setting, entity keys, panel budget, and dialogue/caption intent.',
    'Every page must be a real comic-script page, not an outline placeholder: 3-6 concrete panels with distinct shot, action, dialogue/caption, and continuity details.',
    'Do not repeat the same page beat, action sentence, or panel description across pages. Each page must advance the sequence unit through a new story moment.',
    'Panel action should describe what is visible in the panel. Include blocking, character expression, setting detail, and the story change in that panel.',
    'Dialogue and captions must be brief enough for generated comic lettering, but at least half the pages should include some balloon or caption text.',
    'Use a clear page progression: establish the location and problem, escalate pressure, force a choice, show consequences, and land the sequence outcome.',
    'Preserve canon facts and the selected sequence unit outcome.',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({
      wiki: asRecord(input.context.wiki),
      sequenceUnit,
      sceneScript: input.sceneScript,
      pagePlan: input.pagePlan,
      assetPack: input.assetPack,
      relationships: Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord).slice(0, 40) : [],
    }),
  ].filter(Boolean).join('\n\n')
}

function buildComicScriptRepairInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  sceneScript: Record<string, unknown>
  pagePlan: Record<string, unknown>
  invalidScript: Record<string, unknown>
  diagnostics: string[]
  prompt: string
  guidance: OutputGuidanceBundle
  pageCount: number
}) {
  const sequenceUnit = Array.isArray(input.context.sequenceUnits) ? asRecord(input.context.sequenceUnits[0]) : {}
  return [
    `Repair the invalid comic production script into a complete ${input.pageCount}-page page/panel JSON script.`,
    'Return the full replacement JSON object only. Do not return a patch, explanation, markdown, or omitted pages.',
    'The pages array must contain every page from 1 through the requested page count.',
    'Every page must include setting, mood, continuityNotes, requiredEntityKeys, and 3-6 complete panels.',
    'Every panel must include panelNumber, shot, action, dialogue, caption, and characters. Empty dialogue/caption is allowed only when the panel should be silent.',
    'Use the approved page plan for page function, setting, page turn, panel budget, and included beats. Use the scene script for dramatization and dialogue/subtext.',
    'Do not preserve empty panel arrays from the invalid script. Rewrite any page with missing panels from scratch.',
    `Validation errors to fix: ${input.diagnostics.join(' ')}`,
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({
      wiki: asRecord(input.context.wiki),
      sequenceUnit,
      sceneScript: input.sceneScript,
      pagePlan: input.pagePlan,
      assetPack: input.assetPack,
      invalidScript: input.invalidScript,
    }),
  ].filter(Boolean).join('\n\n')
}

function comicScriptMarkdown(script: Record<string, unknown>) {
  const pages = Array.isArray(script.pages) ? script.pages.map(asRecord) : []
  return [
    `# ${readText(script.title) || 'Generated Comic'}`,
    readText(script.logline) ? `> ${readText(script.logline)}` : '',
    ...pages.flatMap((page) => [
      `## Page ${Number(page.pageNumber ?? 0) || ''}`,
      readText(page.panelLayout) ? `Layout: ${readText(page.panelLayout)}` : '',
      readText(page.setting) ? `Setting: ${readText(page.setting)}` : '',
      ...(Array.isArray(page.panels) ? page.panels.map((panel, index) => {
        const record = asRecord(panel)
        return [
          `Panel ${Number(record.panelNumber ?? index + 1)}: ${readText(record.shot)}`,
          readText(record.action),
          readText(record.dialogue) ? `Dialogue: ${readText(record.dialogue)}` : '',
          readText(record.caption) ? `Caption: ${readText(record.caption)}` : '',
        ].filter(Boolean).join(' ')
      }) : []),
    ]),
  ].filter(Boolean).join('\n\n')
}

function buildComicAtlasPromptInstruction(input: {
  context: Record<string, unknown>
  assetPack: Record<string, unknown>
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const wiki = asRecord(input.context.wiki)
  return [
    'Create one GPT Image 2 prompt for a square comic-style reference atlas.',
    'The atlas should show the selected characters, places, objects, symbols, palette swatches, and style notes as labeled visual reference panels.',
    'Use a cohesive comic art direction suitable for later full-page comic generation.',
    'Ask for readable labels only for entity names; avoid internal keys in visible text.',
    readText(wiki.artStyleDescription) ? `Project art direction: ${readText(wiki.artStyleDescription)}` : '',
    Array.isArray(wiki.toneTags) ? `Tone tags: ${wiki.toneTags.join(', ')}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    compactForPrompt({ assetPack: input.assetPack, wiki }),
  ].filter(Boolean).join('\n\n')
}

function comicScriptPage(script: Record<string, unknown>, pageNumber: number) {
  const pages = Array.isArray(script.pages) ? script.pages.map(asRecord) : []
  return pages.find((entry) => Number(entry.pageNumber ?? 0) === pageNumber) ?? pages[pageNumber - 1] ?? {}
}

function normalizeComicEntityToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function comicEntityTokens(entity: Record<string, unknown>) {
  return new Set([
    readText(entity.key),
    readText(entity.id),
    readText(entity.name),
    readText(entity.label),
  ].map(normalizeComicEntityToken).filter(Boolean))
}

function collectComicPageReferenceTokens(page: Record<string, unknown>) {
  const tokens = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value === 'string') {
      const token = normalizeComicEntityToken(value)
      if (token) tokens.add(token)
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) add(entry)
    }
  }
  add(page.requiredEntityKeys)
  add(page.characters)
  add(page.locations)
  add(page.props)
  const panels = Array.isArray(page.panels) ? page.panels.map(asRecord) : []
  for (const panel of panels) {
    add(panel.requiredEntityKeys)
    add(panel.characters)
    add(panel.location)
    add(panel.locations)
    add(panel.props)
    add(panel.items)
    add(panel.factions)
  }
  return tokens
}

function filterComicAssetPackForPage(assetPack: Record<string, unknown>, page: Record<string, unknown>, limit = 6) {
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  const tokens = collectComicPageReferenceTokens(page)
  const matched = tokens.size > 0
    ? entities.filter((entity) => {
      const entityTokens = comicEntityTokens(entity)
      return [...tokens].some((token) => [...entityTokens].some((entityToken) => (
        entityToken === token || entityToken.includes(token) || token.includes(entityToken)
      )))
    })
    : entities
  const pageEntities = (matched.length > 0 ? matched : entities).slice(0, limit)
  return {
    ...assetPack,
    entities: pageEntities,
    pageReferenceEntityKeys: pageEntities.map((entity) => readText(entity.key)).filter(Boolean),
    missingReferenceEntityKeys: pageEntities
      .filter((entity) => readStringArray(entity.assetKeys).length === 0)
      .map((entity) => readText(entity.key))
      .filter(Boolean),
  }
}

function compactComicPanelForPrompt(panel: Record<string, unknown>, fallbackPanelNumber: number) {
  const panelNumber = Number(panel.panelNumber ?? fallbackPanelNumber)
  return [
    `Panel ${Number.isFinite(panelNumber) ? panelNumber : fallbackPanelNumber}`,
    readText(panel.shot) ? `Shot: ${readText(panel.shot)}` : '',
    readText(panel.action) ? `Action: ${readText(panel.action)}` : '',
    readText(panel.dialogue) ? `Dialogue: ${readText(panel.dialogue)}` : '',
    readText(panel.caption) ? `Caption: ${readText(panel.caption)}` : '',
    readStringArray(panel.characters).length > 0 ? `Characters: ${readStringArray(panel.characters).join(', ')}` : '',
  ].filter(Boolean).join('\n')
}

function buildDeterministicComicPageImagePrompt(input: {
  script: Record<string, unknown>
  assetPack: Record<string, unknown>
  pageNumber: number
  pageCount: number
  prompt: string
  guidance: OutputGuidanceBundle
}) {
  const page = comicScriptPage(input.script, input.pageNumber)
  const panels = Array.isArray(page.panels) ? page.panels.map(asRecord) : []
  if (panels.length < 3) {
    throw new Error(`Comic page ${input.pageNumber} prompt cannot be built because the script page has ${panels.length} panel(s). Rerun the Comic Script node first.`)
  }
  const packedEntities = Array.isArray(input.assetPack.entities) ? input.assetPack.entities.map(asRecord) : []
  const pageAssetPack = filterComicAssetPackForPage(input.assetPack, page, 6)
  const relevantEntities = Array.isArray(pageAssetPack.entities) ? pageAssetPack.entities.map(asRecord) : packedEntities
  return [
    `Create a finished full-page portrait comic image for page ${input.pageNumber} of ${input.pageCount}.`,
    'Use the attached entity/environment reference sheets directly as continuity sources for identity, wardrobe, silhouettes, palette, props, materials, and environment features.',
    'The image must contain the complete page: panel borders, gutters, speech balloons, captions, sound effects where scripted, and readable lettering.',
    'Follow this script exactly. Do not invent a different beat, skip panels, merge pages, or repeat another page.',
    readText(input.script.title) ? `Issue title: ${readText(input.script.title)}` : '',
    readText(input.script.logline) ? `Issue logline: ${readText(input.script.logline)}` : '',
    `Page layout: ${readText(page.panelLayout) || `${panels.length} panels`}`,
    readText(page.setting) ? `Page setting: ${readText(page.setting)}` : '',
    readText(page.mood) ? `Page mood: ${readText(page.mood)}` : '',
    readText(page.continuityNotes) ? `Continuity notes: ${readText(page.continuityNotes)}` : '',
    'Panel script:',
    panels.map((panel, index) => compactComicPanelForPrompt(panel, index + 1)).join('\n\n'),
    relevantEntities.length > 0 ? 'Required visual continuity references:' : '',
    relevantEntities.length > 0 ? compactForPrompt({ entities: relevantEntities.slice(0, 6) }) : '',
    input.prompt ? `User style brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    'Visible text rules: include only the scripted dialogue/caption/SFX text; keep text short, legible, and placed inside clear balloons or caption boxes.',
    'Do not include workflow terms, JSON keys, entity IDs, prompt labels, watermarks, signatures, or production notes in the image.',
  ].filter(Boolean).join('\n\n')
}

function openingStrategyForSection(section: Record<string, unknown>, sectionNumber: number) {
  const explicit = readText(section.openingStrategy)
  if (explicit) return explicit
  const strategies = [
    'Open on a character doing something concrete under pressure, not on weather, skyline, light, mood, or abstract atmosphere.',
    'Open on a direct obstacle, interruption, or consequence from the previous beat, not on weather or city description.',
    'Open on discovery, dialogue, or a tactical choice, not on a metaphor or sensory panorama.',
    'Open on the cost of the chapter choice or the next necessary action, not on atmospheric scene-setting.',
  ]
  return strategies[(Math.max(1, sectionNumber) - 1) % strategies.length]
}

function repeatedOpeningAvoidanceRules() {
  return [
    'Do not open with rain, weather, skyline, neon, glass, towers, shadows, silence, a city description, or a broad mood image.',
    'Do not use rain as a transition or default atmosphere unless the current sequence unit explicitly requires rain as a plot fact.',
    'Do not start with a metaphor or simile. The first paragraph should establish a person, action, pressure, and immediate situation.',
    'Do not reuse stock cyberpunk/noir openings such as rain hitting glass, neon blurring, towers clawing, concrete spines, muted thrums, or shadows whispering.',
  ]
}

function findEntityByKey(context: Record<string, unknown>, key: string) {
  if (!key) return null
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  return entities.find((entity) => readText(entity.key) === key) ?? null
}

function readSequencePovBrief(input: {
  context: Record<string, unknown>
  chapter: Record<string, unknown>
  sequenceUnit: Record<string, unknown> | null
}) {
  const wiki = asRecord(input.context.wiki)
  const sequence = input.sequenceUnit ? readEntitySequence(input.sequenceUnit) : {}
  const narrationPov = readText(input.chapter.narrationPov)
    || readText(wiki.narrationPov)
    || 'close third person limited unless the world canon specifies otherwise'
  const povCharacterKey = readText(input.chapter.povCharacterKey)
    || readText(sequence.povCharacterKey ?? sequence.povActorKey ?? sequence.focalCharacterKey)
  const povCharacter = findEntityByKey(input.context, povCharacterKey)
  const povCharacterName = readText(input.chapter.povCharacterName)
    || readText(sequence.povCharacterName)
    || readText(povCharacter?.name)
  const povNotes = readText(input.chapter.povNotes) || readText(sequence.povNotes)
  return {
    narrationPov,
    povCharacterKey,
    povCharacterName,
    povNotes,
    povCharacterSummary: readText(povCharacter?.summary),
    povCharacterContext: readText(povCharacter?.context),
  }
}

function sectionFromPlan(input: {
  sectionPlan: Array<Record<string, unknown>>
  chapterNumber: number
  sectionNumber: number
}) {
  return input.sectionPlan.find((entry) => Number(entry.sectionNumber) === input.sectionNumber && Number(entry.chapterNumber) === input.chapterNumber)
    ?? input.sectionPlan.find((entry) => Number(entry.sectionNumber) === input.sectionNumber)
    ?? input.sectionPlan[input.sectionNumber - 1]
    ?? {}
}

function buildChapterProsePrompt(input: {
  context: Record<string, unknown>
  prompt: string
  chapterPlan: Array<Record<string, unknown>>
  chapterNumber: number
  sequenceUnitKey: string
  sequenceUnitName: string
  guidance: OutputGuidanceBundle
}) {
  const chapter = input.chapterPlan.find((entry) => readText(entry.sequenceUnitKey) === input.sequenceUnitKey)
    ?? input.chapterPlan.find((entry) => Number(entry.number) === input.chapterNumber)
    ?? input.chapterPlan[input.chapterNumber - 1]
    ?? {}
  const entities = Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 8) : []
  const entityNotes = entities.map((entity) => `${readText(entity.name)} (${readText(entity.summary)})`).filter(Boolean).join('; ')
  const chapterTitle = readText(chapter.title) || input.sequenceUnitName || `Chapter ${input.chapterNumber}`
  const synopsis = readText(chapter.synopsis)
  const dramaticQuestion = readText(chapter.dramaticQuestion)
  const outcome = readText(chapter.outcome)
  const currentSequenceUnit = input.sequenceUnitKey
    ? (Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord).find((entry) => readText(entry.key) === input.sequenceUnitKey) ?? null : null)
    : null
  const pov = readSequencePovBrief({ context: input.context, chapter, sequenceUnit: currentSequenceUnit })
  return [
    `Write Chapter ${input.chapterNumber} as polished longform prose in Markdown.`,
    `Chapter title: ${chapterTitle}`,
    `Project narration POV: ${pov.narrationPov}`,
    pov.povCharacterName || pov.povCharacterKey ? `Chapter POV character: ${pov.povCharacterName || pov.povCharacterKey}${pov.povCharacterKey ? ` (${pov.povCharacterKey})` : ''}` : '',
    pov.povNotes ? `POV notes: ${pov.povNotes}` : '',
    pov.povCharacterSummary ? `POV character anchor: ${pov.povCharacterSummary}` : '',
    synopsis ? `Chapter synopsis: ${synopsis}` : '',
    dramaticQuestion ? `Dramatic question: ${dramaticQuestion}` : '',
    outcome ? `Required outcome: ${outcome}` : '',
    entityNotes ? `Canon anchors: ${entityNotes}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'Opening constraints:',
    '- Open with a named character in motion, a concrete decision, a line of dialogue, or an immediate obstacle.',
    ...repeatedOpeningAvoidanceRules().map((rule) => `- ${rule}`),
    '',
    'POV and scene texture constraints:',
    '- Maintain the project narration POV consistently for the whole chapter.',
    '- Stay inside the chapter POV character perspective; do not reveal thoughts, motives, facts, or off-screen information the POV character cannot know.',
    '- Balance concrete action, dialogue/subtext, and selective internal reflection. Every major action beat should produce a POV reaction or choice; every reflection should be attached to present pressure; every dialogue exchange should include behavior or subtext.',
    '- Use interiority to show desire, fear, misreadings, tactical reasoning, and emotional cost, not to explain the theme.',
    '',
    'Use this world context as canon. Do not contradict it:',
    compactForPrompt({
      wiki: input.context.wiki,
      pov,
      currentSequenceUnit,
      chapterPlan: input.chapterPlan,
      entities: Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 24) : [],
      relationships: Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord).slice(0, 80) : [],
    }),
    '',
    'Output requirements:',
    `- Start exactly with: ## ${input.chapterNumber}. ${chapterTitle}`,
    '- Then write scene-level prose, not an outline, not a brief, not analysis.',
    '- Target 1200-2200 words for this V1 draft unless the chapter canon is very small.',
    '- Keep markdown simple: chapter heading plus prose paragraphs only.',
    '- Do not include labels such as "Dramatic question", "Outcome", "Canon anchors", "Writing brief", or "Generated from".',
    '- Do not mention AI, prompts, world graphs, guidance, or workflow internals.',
  ].filter(Boolean).join('\n')
}

function buildChapterSectionProsePrompt(input: {
  context: Record<string, unknown>
  prompt: string
  chapterPlan: Array<Record<string, unknown>>
  sectionPlan: Array<Record<string, unknown>>
  chapterNumber: number
  sectionNumber: number
  sectionCount: number
  sequenceUnitKey: string
  sequenceUnitName: string
  guidance: OutputGuidanceBundle
}) {
  const chapter = input.chapterPlan.find((entry) => readText(entry.sequenceUnitKey) === input.sequenceUnitKey)
    ?? input.chapterPlan.find((entry) => Number(entry.number) === input.chapterNumber)
    ?? input.chapterPlan[input.chapterNumber - 1]
    ?? {}
  const section = sectionFromPlan({
    sectionPlan: input.sectionPlan,
    chapterNumber: input.chapterNumber,
    sectionNumber: input.sectionNumber,
  })
  const chapterTitle = readText(chapter.title) || readText(section.chapterTitle) || input.sequenceUnitName || `Chapter ${input.chapterNumber}`
  const sectionTitle = readText(section.title) || `Section ${input.sectionNumber}`
  const openingStrategy = openingStrategyForSection(section, input.sectionNumber)
  const entities = Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 10) : []
  const entityNotes = entities.map((entity) => `${readText(entity.name)} (${readText(entity.summary)})`).filter(Boolean).join('; ')
  const currentSequenceUnit = input.sequenceUnitKey
    ? (Array.isArray(input.context.sequenceUnits) ? input.context.sequenceUnits.map(asRecord).find((entry) => readText(entry.key) === input.sequenceUnitKey) ?? null : null)
    : null
  const pov = readSequencePovBrief({ context: input.context, chapter, sequenceUnit: currentSequenceUnit })
  return [
    `Write section ${input.sectionNumber} of ${input.sectionCount} for Chapter ${input.chapterNumber} as polished longform prose in Markdown.`,
    `Chapter title: ${chapterTitle}`,
    `Section role: ${sectionTitle}`,
    `Project narration POV: ${pov.narrationPov}`,
    pov.povCharacterName || pov.povCharacterKey ? `Chapter POV character: ${pov.povCharacterName || pov.povCharacterKey}${pov.povCharacterKey ? ` (${pov.povCharacterKey})` : ''}` : '',
    pov.povNotes ? `POV notes: ${pov.povNotes}` : '',
    readText(section.synopsis) ? `Chapter synopsis: ${readText(section.synopsis)}` : '',
    readText(section.dramaticQuestion) ? `Dramatic question: ${readText(section.dramaticQuestion)}` : '',
    readText(section.outcome) ? `Required chapter outcome: ${readText(section.outcome)}` : '',
    entityNotes ? `Canon anchors: ${entityNotes}` : '',
    input.prompt ? `User brief: ${input.prompt}` : '',
    guidanceMarkdown(input.guidance),
    '',
    'Opening strategy for this section:',
    `- ${openingStrategy}`,
    ...repeatedOpeningAvoidanceRules().map((rule) => `- ${rule}`),
    '',
    'POV and scene texture constraints:',
    '- Maintain the project narration POV consistently.',
    '- Stay inside the chapter POV character perspective; do not head-hop.',
    '- Balance concrete action, dialogue/subtext, and selective internal reflection.',
    '',
    'Use this world context as canon. Do not contradict it:',
    compactForPrompt({
      wiki: input.context.wiki,
      pov,
      currentSequenceUnit,
      chapterPlan: input.chapterPlan,
      sectionPlan: input.sectionPlan,
      entities: Array.isArray(input.context.entities) ? input.context.entities.map(asRecord).slice(0, 24) : [],
      relationships: Array.isArray(input.context.relationships) ? input.context.relationships.map(asRecord).slice(0, 80) : [],
    }),
    '',
    'Output requirements:',
    `- Start exactly with: ### ${input.chapterNumber}.${input.sectionNumber} ${sectionTitle}`,
    '- Write prose scenes and narrative summary only where needed; do not output an outline or brief.',
    '- Target 900-1200 words.',
    '- Keep markdown simple: section heading plus prose paragraphs only.',
    '- Make the section stand alone, but do not repeat exposition already likely covered by earlier sections.',
    '- Do not include labels such as "Dramatic question", "Outcome", "Canon anchors", "Writing brief", or "Generated from".',
    '- Do not mention AI, prompts, world graphs, guidance, or workflow internals.',
  ].filter(Boolean).join('\n')
}

async function generateChapterMarkdown(input: {
  context: Record<string, unknown>
  prompt: string
  chapterPlan: Array<Record<string, unknown>>
  chapterNumber: number
  sequenceUnitKey: string
  sequenceUnitName: string
  guidance: OutputGuidanceBundle
}) {
  const model = outputWorkflowTextModel()
  const prompt = buildChapterProsePrompt(input)
  const attempts = outputWorkflowChapterAttempts()
  const timeoutMs = outputWorkflowChapterTimeoutMs()
  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await runOpenAiResponses({
        model,
        instructions: [
          'You are a professional longform book writer.',
          'Write restrained, specific, publishable prose from the supplied canon.',
          'Open scenes through character action, choice, dialogue, or immediate pressure rather than weather, skyline, mood, or decorative metaphor.',
          'Follow the requested style guidance, but never reveal the guidance or workflow.',
          'Return only the requested Markdown manuscript content.',
        ].join(' '),
        input: prompt,
        maxOutputTokens: 4200,
        metadata: {
          graphcore_task: 'output_workflow_chapter_prose',
          graphcore_attempt: String(attempt),
        },
        timeoutMs,
      })

      if (!response.response.ok) {
        const errorMessage = typeof response.body.error === 'object' && response.body.error !== null
          ? readText((response.body.error as Record<string, unknown>).message)
          : readText(response.body.error)
        throw new Error(errorMessage || `OpenAI chapter generation failed with status ${response.response.status}.`)
      }

      const markdown = response.outputText.trim()
      if (!markdown) throw new Error('OpenAI returned an empty chapter draft.')
      return {
        markdown,
        model,
        providerRequestId: readText(response.body.id) || response.response.headers.get('x-request-id') || null,
        usage: asRecord(response.body.usage),
        attempts: attempt,
        timeoutMs,
      }
    } catch (error) {
      lastError = error
      if (attempt >= attempts || !isRetryableOpenAiError(error)) break
      await sleep(retryDelayMs(attempt))
    }
  }

  const finalMessage = lastError instanceof Error ? lastError.message : String(lastError ?? 'OpenAI chapter generation failed.')
  throw new Error(attempts > 1 ? `${finalMessage} Retried ${attempts} times.` : finalMessage)
}

async function generateBackgroundMarkdown(input: {
  prompt: string
  instructions: string
  metadata: Record<string, string>
  maxOutputTokens: number
  priorProviderRequestId?: string | null
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    providerRequestId: string
    providerStatus: string
    providerMode: string
    lastProviderPollAt: string
  }) => Promise<void>
}) {
  const model = outputWorkflowTextModel()
  const timeoutMs = outputWorkflowChapterTimeoutMs()
  const backgroundResult = await waitForOpenAiBackgroundResponse({
    request: {
      model,
      instructions: input.instructions,
      input: input.prompt,
      maxOutputTokens: input.maxOutputTokens,
      metadata: input.metadata,
      timeoutMs: 45_000,
    },
    priorProviderRequestId: input.priorProviderRequestId,
    timeoutMs,
    shouldCancel: input.shouldCancel,
    createCancelledError: () => new WorkflowCancelledError(),
    onProgress: async (progress) => {
      await input.onProgress?.({
        providerRequestId: progress.providerRequestId,
        providerStatus: progress.providerStatus,
        providerMode: progress.providerMode,
        lastProviderPollAt: progress.lastProviderPollAt,
      })
    },
    createFailureMessage: (status) => `OpenAI background response failed with status ${status}.`,
    pollFailureMessage: (status) => `OpenAI background response poll failed with status ${status}.`,
    terminalFailureMessage: (providerStatus) => `OpenAI background response ended with status ${providerStatus}.`,
    missingResponseIdMessage: 'OpenAI background response did not return a response id.',
  })
  const result = backgroundResult.response

  const markdown = result.outputText.trim()
  if (!markdown) throw new Error('OpenAI returned an empty background response.')
  return {
    markdown,
    model,
    providerRequestId: backgroundResult.providerRequestId,
    providerStatus: backgroundResult.providerStatus,
    usage: asRecord(result.body.usage),
    timeoutMs,
  }
}

function assembleChapterMarkdown(upstream: Record<string, Record<string, unknown>>) {
  const chapters = Object.entries(upstream)
    .map(([nodeKey, outputs]) => ({
      nodeKey,
      chapterNumber: Number(outputs.chapterNumber ?? 9999),
      sectionNumber: Number(outputs.sectionNumber ?? 9999),
      markdown: readText(outputs.markdown) || readText(outputs.text),
    }))
    .filter((entry) => entry.markdown)
    .sort((left, right) => left.chapterNumber - right.chapterNumber || left.sectionNumber - right.sectionNumber || left.nodeKey.localeCompare(right.nodeKey))
  return chapters.map((entry) => entry.markdown).join('\n\n')
}

function addFrontBackMatter(context: Record<string, unknown>, markdown: string) {
  const wiki = asRecord(context.wiki)
  const title = titleFromContext(context)
  const logline = readText(wiki.logline)
  const synopsis = readText(wiki.synopsis)
  const toneTags = Array.isArray(wiki.toneTags) ? wiki.toneTags.filter((entry): entry is string => typeof entry === 'string') : []
  return [
    `# ${title}`,
    '',
    logline ? `> ${logline}` : '',
    '',
    synopsis ? `## Synopsis\n\n${synopsis}` : '',
    '',
    toneTags.length > 0 ? `\nTone: ${toneTags.join(', ')}` : '',
    '',
    markdown,
    '',
    '## Back Matter',
    '',
    'Generated from the GraphCore world graph. Canon entities, relationships, sequence units, and wiki metadata remain the source of truth.',
  ].filter(Boolean).join('\n')
}

function editMarkdown(source: string) {
  return source
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +\n/g, '\n')
    .trim()
}

async function uploadBytes(client: DatabaseClient, path: string, bytes: Uint8Array, contentType: string) {
  const response = await client.storage.from('project-assets').upload(path, new Blob([bytes], { type: contentType }), {
    cacheControl: '31536000',
    contentType,
    upsert: true,
  })
  if (response.error) throw new Error(response.error.message)
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }
  return `data:${mimeType || 'image/png'};base64,${btoa(binary)}`
}

async function downloadRemoteBytes(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Generated Fal image could not be downloaded (${response.status}).`)
  return new Uint8Array(await response.arrayBuffer())
}

async function imageReferenceToFalUrl(client: DatabaseClient, image: Record<string, unknown>, run?: OutputWorkflowRun) {
  const url = readText(image.url)
  if (url) return url
  const storagePath = readText(image.storagePath) || readText(image.storage_path)
  if (storagePath) return projectAssetReferenceUrl(client, storagePath, readText(image.mimeType) || readText(image.mime_type) || 'image/png')
  const assetKey = readText(image.assetKey) || readText(image.asset_key) || readText(image.key)
  if (!assetKey || !run) return ''
  const asset = await resolveProjectAssetByKey(client, run, assetKey)
  if (!asset) return ''
  const assetStoragePath = readText(asset.storagePath) || readText(asset.storage_path)
  if (!assetStoragePath) return ''
  return projectAssetReferenceUrl(client, assetStoragePath, readText(asset.mimeType) || readText(asset.mime_type) || 'image/png')
}

function resolveAssetByKey(run: OutputWorkflowRun, assetKey: string) {
  const assets = Array.isArray(asRecord(run.input).assets) ? asRecord(run.input).assets as unknown[] : []
  return assets.map(asRecord).find((asset) => readText(asset.key) === assetKey) ?? null
}

async function resolveProjectAssetByKey(client: DatabaseClient, run: OutputWorkflowRun, assetKey: string) {
  const localAsset = resolveAssetByKey(run, assetKey)
  if (localAsset) return localAsset
  if (!assetKey || isDirectReferenceUrl(assetKey) || isProjectAssetStoragePath(assetKey)) return null
  const response = await client
    .from('project_assets')
    .select('key, name, kind, mime_type, storage_path, metadata')
    .eq('project_id', run.projectId)
    .eq('key', assetKey)
    .maybeSingle()
  if (response.error || !response.data) return null
  const row = asRecord(response.data)
  return {
    key: readText(row.key),
    name: readText(row.name),
    kind: readText(row.kind),
    mimeType: readText(row.mime_type),
    mime_type: readText(row.mime_type),
    storagePath: readText(row.storage_path),
    storage_path: readText(row.storage_path),
    metadata: asRecord(row.metadata),
  }
}

async function collectAssetPackReferenceUrls(client: DatabaseClient, run: OutputWorkflowRun, assetPack: Record<string, unknown>, limit = 3) {
  return (await collectAssetPackReferenceRecords(client, run, assetPack, limit)).map((entry) => entry.url).filter(Boolean)
}

const SEQUENCE_ANIMATIC_COVERAGE_ANCHOR_MODE = 'labeled_blockout_v1'

async function collectAssetPackReferenceRecords(client: DatabaseClient, run: OutputWorkflowRun, assetPack: Record<string, unknown>, limit = 3): Promise<SeedanceReferenceRecord[]> {
  const references: SeedanceReferenceRecord[] = []
  const entities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
  for (const entity of entities) {
    const primaryAssetKey = readText(entity.primaryAssetKey)
    const entityReferenceAssetKeys = primaryAssetKey ? [primaryAssetKey] : sortReferenceValues(readStringArray(entity.assetKeys))
    const referenceRecord = sequenceAnimaticAssetPackReferenceRecord(entity)
    for (const assetKey of entityReferenceAssetKeys) {
      if (isDirectReferenceUrl(assetKey)) {
        references.push({ url: assetKey, label: referenceRecord.label, role: referenceRecord.role, modality: 'image' })
        if (references.length >= limit) return references
        continue
      }
      if (isProjectAssetStoragePath(assetKey)) {
        references.push({ url: await projectAssetReferenceUrl(client, assetKey.replace(/^project-assets\//i, ''), mimeTypeForStoragePath(assetKey)), label: referenceRecord.label, role: referenceRecord.role, modality: 'image' })
        if (references.length >= limit) return references
        continue
      }
      const asset = await resolveProjectAssetByKey(client, run, assetKey)
      const storagePath = readText(asset?.storagePath) || readText(asset?.storage_path)
      if (!storagePath) continue
      references.push({ url: await projectAssetReferenceUrl(client, storagePath, readText(asset?.mimeType) || readText(asset?.mime_type) || 'image/png'), label: referenceRecord.label, role: referenceRecord.role, modality: 'image' })
      if (references.length >= limit) return references
    }
  }
  return references
}

async function collectReferenceAssetKeyRecords(
  client: DatabaseClient,
  run: OutputWorkflowRun,
  assetKeys: readonly string[],
  limit = 3,
  label = 'Continuity reference',
  role = 'continuity_reference',
): Promise<SeedanceReferenceRecord[]> {
  const uniqueAssetKeys = [...new Set(assetKeys.map(readText).filter(Boolean))].slice(0, Math.max(0, limit))
  if (uniqueAssetKeys.length === 0) return []
  return collectAssetPackReferenceRecords(client, run, {
    entities: uniqueAssetKeys.map((assetKey, index) => ({
      key: `direct_reference_${index + 1}_${slugify(assetKey)}`,
      name: label,
      role,
      primaryAssetKey: assetKey,
      assetKeys: [assetKey],
      selectedReferenceAssetKey: assetKey,
      selectedReferenceVariantKey: role,
      selectedReferenceVariantLabel: label,
      selectedReferenceVariantType: role,
      referenceSelectionReason: 'Direct workflow reference asset key.',
    })),
  }, limit)
}

function parentZoneIdForSpotContinuityTarget(targetNode: Record<string, unknown>) {
  return readText(targetNode.zoneId ?? targetNode.zone_id)
    || readText(targetNode.parentZoneId ?? targetNode.parent_zone_id)
    || readText(targetNode.parentId ?? targetNode.parent_id)
}

function mergeContinuityAssetStateFromArtifactMetadata(
  stateByNodeId: Record<string, Record<string, unknown>>,
  metadata: Record<string, unknown>,
) {
  const role = readText(metadata.role)
  if (role === 'sequence_animatic_continuity_pack') {
    const pack = asRecord(metadata.continuityPack ?? metadata.continuity_pack)
    Object.entries(asRecord(pack.assetStateByNodeId ?? pack.asset_state_by_node_id)).forEach(([nodeId, state]) => {
      const cleanNodeId = readText(nodeId)
      const record = asRecord(state)
      if (cleanNodeId && Object.keys(record).length > 0) stateByNodeId[cleanNodeId] = record
    })
  } else if (role === 'sequence_animatic_continuity_asset') {
    const state = asRecord(metadata.assetState ?? metadata.asset_state)
    const nodeId = readText(state.sourceNodeId) || readText(metadata.targetNodeId)
    if (nodeId && Object.keys(state).length > 0) stateByNodeId[nodeId] = state
  } else if (role === 'sequence_animatic_continuity_asset_batch') {
    Object.entries(asRecord(metadata.assetStateByNodeId ?? metadata.asset_state_by_node_id)).forEach(([nodeId, state]) => {
      const cleanNodeId = readText(nodeId)
      const record = asRecord(state)
      if (cleanNodeId && Object.keys(record).length > 0) stateByNodeId[cleanNodeId] = record
    })
  }
}

async function latestParentZoneAssetKeyForSpotContinuityImage(
  client: DatabaseClient,
  run: OutputWorkflowRun,
  config: Record<string, unknown>,
) {
  const targetNode = asRecord(config.targetNode ?? config.target_node)
  const parentZoneId = parentZoneIdForSpotContinuityTarget(targetNode)
  if (!parentZoneId) return ''

  const stateByNodeId: Record<string, Record<string, unknown>> = {}
  const continuityPack = asRecord(config.continuityPack ?? config.continuity_pack)
  Object.entries(asRecord(continuityPack.assetStateByNodeId ?? continuityPack.asset_state_by_node_id)).forEach(([nodeId, state]) => {
    const cleanNodeId = readText(nodeId)
    const record = asRecord(state)
    if (cleanNodeId && Object.keys(record).length > 0) stateByNodeId[cleanNodeId] = record
  })

  const draftId = readText((run as unknown as Record<string, unknown>).draftId ?? (run as unknown as Record<string, unknown>).draft_id)
  const parentRequestIds = [...new Set([
    readText(config.continuityRequestId ?? config.continuity_request_id),
    readText(config.masterRequestId ?? config.master_request_id),
  ].filter(Boolean))]
  const workflowIds = new Set<string>()
  const continuityWorkflowId = readText(config.continuityWorkflowId ?? config.continuity_workflow_id)
  if (continuityWorkflowId) workflowIds.add(continuityWorkflowId)

  try {
    if (draftId && parentRequestIds.length > 0) {
      const childResponse = await client
        .from('output_requests')
        .select('id, workflow_id, metadata, created_at')
        .eq('draft_id', draftId)
        .in('parent_request_id', parentRequestIds)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!childResponse.error) {
        ;(childResponse.data ?? []).forEach((row: unknown) => {
          const record = asRecord(row)
          const metadata = asRecord(record.metadata)
          const role = readText(metadata.screenplayAnimaticRole) || readText(metadata.sequenceAnimaticRole)
          const workflowId = readText(record.workflow_id)
          if ((role === 'continuity_asset' || role === 'continuity_asset_batch') && workflowId) workflowIds.add(workflowId)
        })
      }
    }

    if (draftId && workflowIds.size > 0) {
      const artifactResponse = await client
        .from('output_artifacts')
        .select('id, workflow_id, metadata, updated_at')
        .eq('draft_id', draftId)
        .in('workflow_id', [...workflowIds])
        .order('updated_at', { ascending: false })
        .limit(150)
      if (!artifactResponse.error) {
        ;[...(artifactResponse.data ?? [])].reverse().forEach((row: unknown) => {
          mergeContinuityAssetStateFromArtifactMetadata(stateByNodeId, asRecord(asRecord(row).metadata))
        })
      }
    }
  } catch {
    // Fall through to the state already embedded in the workflow config.
  }

  return readText(asRecord(stateByNodeId[parentZoneId]).assetKey)
}

async function projectAssetReferenceUrl(client: DatabaseClient, storagePath: string, mimeType: string) {
  const bucket = client.storage.from('project-assets')
  if (typeof bucket.createSignedUrl === 'function') {
    const signed = await bucket.createSignedUrl(storagePath, 60 * 60)
    const data = asRecord(signed.data)
    const signedUrl = readText(data.signedUrl) || readText(data.signedURL)
    if (!signed.error && signedUrl) return signedUrl
  }
  const bytes = await downloadProjectAssetBytes(client, storagePath)
  return bytesToDataUrl(bytes, mimeType)
}

async function downloadProjectAssetBytes(client: DatabaseClient, storagePath: string) {
  const response = await client.storage.from('project-assets').download(storagePath)
  if (response.error || !response.data) throw new Error(response.error?.message ?? `Project asset ${storagePath} could not be downloaded.`)
  return new Uint8Array(await response.data.arrayBuffer())
}

async function buildDocumentReferenceImages(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  limit?: number
}) {
  const context = worldContextFromRunInput(input.run)
  const entities = Array.isArray(context.entities) ? context.entities.map(asRecord) : []
  const assets = Array.isArray(context.assets) ? context.assets.map(asRecord) : []
  const sourceEntityKeys = readStringArray(context.sourceEntityKeys)
  const sourceKeySet = new Set(sourceEntityKeys)
  const scopedEntities = sourceKeySet.size > 0
    ? entities.filter((entity) => sourceKeySet.has(readText(entity.key)))
    : entities
  const images: Array<{
    bytes: Uint8Array
    mimeType: string
    key?: string
    entityKey?: string
    title: string
    caption?: string
    type?: string
    assetKey?: string
    storagePath?: string
  }> = []
  const limit = Math.max(0, input.limit ?? 24)

  for (const entity of scopedEntities) {
    if (images.length >= limit) break
    const assetKeys = entityAssetKeys(entity, assets)
    for (const assetKey of assetKeys) {
      if (images.length >= limit) break
      const asset = resolveAssetByKey(input.run, assetKey)
      const storagePath = readText(asset?.storagePath) || readText(asset?.storage_path)
      if (!storagePath) continue
      const mimeType = readText(asset?.mimeType) || readText(asset?.mime_type) || 'image/png'
      if (mimeType && !mimeType.toLowerCase().startsWith('image/')) continue
      try {
        images.push({
          bytes: await downloadProjectAssetBytes(input.client, storagePath),
          mimeType,
          key: assetKey,
          assetKey,
          storagePath,
          entityKey: readText(entity.key),
          title: readText(entity.name) || readText(entity.key) || assetKey,
          caption: readOutputEntityVisualDescription(entity),
          type: readText(entity.nodeType ?? entity.node_type),
        })
      } catch {
        // Missing or stale asset rows should not block rendering the reference document.
      }
    }
  }
  return images
}

async function registerImageArtifact(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  assetKey: string
  storagePath: string
  name: string
  summary: string
  mimeType: string
  metadata: Record<string, unknown>
}) {
  const assetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: input.assetKey,
      name: input.name,
      kind: 'image',
      mime_type: input.mimeType,
      storage_path: input.storagePath,
      metadata: input.metadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (assetResponse.error || !assetResponse.data) throw new Error(assetResponse.error?.message ?? 'Failed to register output image asset.')

  const artifactKey = `${input.assetKey}.artifact`
  const artifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: artifactKey,
      name: input.name,
      kind: 'image',
      asset_key: input.assetKey,
      mime_type: input.mimeType,
      summary: input.summary,
      metadata: input.metadata,
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (artifactResponse.error || !artifactResponse.data) throw new Error(artifactResponse.error?.message ?? 'Failed to register output image artifact.')
  return mapOutputArtifactRow(artifactResponse.data as OutputArtifactRow)
}

async function registerVideoArtifact(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  assetKey: string
  storagePath: string
  name: string
  summary: string
  mimeType: string
  metadata: Record<string, unknown>
}) {
  const assetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: input.assetKey,
      name: input.name,
      kind: 'video',
      mime_type: input.mimeType,
      storage_path: input.storagePath,
      metadata: input.metadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (assetResponse.error || !assetResponse.data) throw new Error(assetResponse.error?.message ?? 'Failed to register output video asset.')

  const artifactKey = `${input.assetKey}.artifact`
  const artifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: artifactKey,
      name: input.name,
      kind: 'video',
      asset_key: input.assetKey,
      mime_type: input.mimeType,
      summary: input.summary,
      metadata: input.metadata,
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (artifactResponse.error || !artifactResponse.data) throw new Error(artifactResponse.error?.message ?? 'Failed to register output video artifact.')
  return mapOutputArtifactRow(artifactResponse.data as OutputArtifactRow)
}

async function registerOtherOutputArtifact(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  key: string
  name: string
  summary: string
  metadata: Record<string, unknown>
}) {
  const artifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: input.key,
      name: input.name,
      kind: 'other',
      asset_key: null,
      mime_type: 'application/json',
      summary: input.summary,
      metadata: input.metadata,
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (artifactResponse.error || !artifactResponse.data) throw new Error(artifactResponse.error?.message ?? 'Failed to register output authoring artifact.')
  return mapOutputArtifactRow(artifactResponse.data as OutputArtifactRow)
}

function collectCinematicBlockVideos(upstream: Record<string, Record<string, unknown>>) {
  const seen = new Set<string>()
  return readUpstreamVideos(upstream, ['video', 'videos'])
    .map((video, index) => ({
      ...video,
      blockNumber: Number(video.blockNumber ?? index + 1) || index + 1,
    }))
    .filter((video) => {
      const identity = [
        readText(video.assetKey),
        readText(video.storagePath),
        readText(video.url),
        `block:${Number(video.blockNumber ?? 0) || 0}`,
      ].filter(Boolean).join('|')
      if (!identity) return true
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
    .sort((left, right) => Number(left.blockNumber) - Number(right.blockNumber))
}

function collectCinematicV2ShotVideos(upstream: Record<string, Record<string, unknown>>) {
  const seen = new Set<string>()
  return readUpstreamVideos(upstream, ['video', 'videos'])
    .map((video, index) => ({
      ...video,
      shotIndex: Number(video.shotIndex ?? video.shot_index ?? index + 1) || index + 1,
      shotId: readText(video.shotId) || readText(video.shot_id),
    }))
    .filter((video) => {
      const identity = [
        readText(video.assetKey),
        readText(video.storagePath),
        readText(video.url),
        readText(video.shotId),
        `shot:${Number(video.shotIndex ?? 0) || 0}`,
      ].filter(Boolean).join('|')
      if (!identity) return true
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
    .sort((left, right) => Number(left.shotIndex) - Number(right.shotIndex))
}

function ffmpegConcatLine(path: string) {
  return `file '${path.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`
}

async function runFfmpeg(args: string[]) {
  const command = new Deno.Command('ffmpeg', {
    args,
    stdout: 'piped',
    stderr: 'piped',
  })
  const output = await command.output()
  const stderr = new TextDecoder().decode(output.stderr)
  return { ok: output.success, code: output.code, stderr }
}

async function probeImageSize(path: string) {
  try {
    const command = new Deno.Command('ffprobe', {
      args: ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path],
      stdout: 'piped',
      stderr: 'piped',
    })
    const output = await command.output()
    if (!output.success) return null
    const payload = JSON.parse(new TextDecoder().decode(output.stdout)) as { streams?: Array<{ width?: number; height?: number }> }
    const stream = payload.streams?.[0]
    const width = Number(stream?.width ?? 0)
    const height = Number(stream?.height ?? 0)
    return width > 0 && height > 0 ? { width, height } : null
  } catch {
    return null
  }
}

async function stitchVideoBytes(input: {
  client: DatabaseClient
  videos: Record<string, unknown>[]
}) {
  if (input.videos.length === 0) throw new Error('Video stitch requires at least one generated video clip.')
  const tempDir = await Deno.makeTempDir({ prefix: 'graphcore-video-stitch-' })
  try {
    const clipPaths: string[] = []
    for (const [index, video] of input.videos.entries()) {
      const mimeType = readText(video.mimeType) || readText(video.mime_type) || 'video/mp4'
      const extension = mimeType.includes('webm') ? 'webm' : 'mp4'
      const clipPath = `${tempDir}/clip-${String(index + 1).padStart(3, '0')}.${extension}`
      const url = readText(video.url)
      const storagePath = readText(video.storagePath) || readText(video.storage_path)
      const bytes = url
        ? await downloadRemoteBytes(url)
        : storagePath
          ? await downloadProjectAssetBytes(input.client, storagePath)
          : null
      if (!bytes) throw new Error(`Video clip ${index + 1} has no downloadable URL or storage path.`)
      await Deno.writeFile(clipPath, bytes)
      clipPaths.push(clipPath)
    }
    const concatPath = `${tempDir}/concat.txt`
    await Deno.writeTextFile(concatPath, clipPaths.map(ffmpegConcatLine).join('\n'))
    const copyOutputPath = `${tempDir}/stitched-copy.mp4`
    const copy = await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-c', 'copy', copyOutputPath])
    if (copy.ok) {
      return { bytes: await Deno.readFile(copyOutputPath), mimeType: 'video/mp4', mode: 'concat_copy', diagnostics: copy.stderr }
    }
    const reencodeOutputPath = `${tempDir}/stitched-reencode.mp4`
    const reencode = await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatPath,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      reencodeOutputPath,
    ])
    if (!reencode.ok) {
      throw new Error(`ffmpeg video stitch failed. Copy: ${copy.stderr.slice(0, 1000)} Re-encode: ${reencode.stderr.slice(0, 1000)}`)
    }
    return { bytes: await Deno.readFile(reencodeOutputPath), mimeType: 'video/mp4', mode: 'reencode', diagnostics: reencode.stderr }
  } finally {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {})
  }
}

function collectComicPageImages(upstream: Record<string, Record<string, unknown>>) {
  const seen = new Set<string>()
  return readUpstreamImages(upstream, ['comicPages', 'pageImages', 'pages', 'image'])
    .filter((image) => readText(image.role) === 'comic_page' || Number(image.pageNumber ?? 0) > 0)
    .map((image, index) => {
      const pageNumber = Number(image.pageNumber ?? index + 1) || index + 1
      return { ...image, pageNumber }
    })
    .filter((image) => {
      const pageNumber = Number(image.pageNumber ?? 0) || 0
      const identity = [
        readText(image.assetKey),
        readText(image.storagePath),
        readText(image.url),
        pageNumber > 0 ? `page:${pageNumber}` : '',
      ].filter(Boolean).join('|')
      if (!identity) return true
      if (seen.has(identity)) return false
      seen.add(identity)
      return true
    })
    .sort((left, right) => Number(left.pageNumber) - Number(right.pageNumber))
}

async function registerComicArtifact(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  comicPages: Record<string, unknown>[]
  scriptMarkdown: string
  script: Record<string, unknown> | null
  documentRenderer?: OutputDocumentRenderer | null
}) {
  if (!input.documentRenderer) throw new Error('Comic PDF rendering requires a worker document renderer.')
  const slug = slugify(input.workflow.name)
  const artifactKey = `output.${slug}.${input.run.id.slice(0, 8)}`
  const assetKey = `${artifactKey}.comic_pdf`
  const scriptArtifactKey = `${artifactKey}.comic_script`
  const scriptAssetKey = `${artifactKey}.comic_script.md`
  const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.pdf`
  const scriptStoragePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.comic-script.md`
  const context = worldContextFromRunInput(input.run)
  const wiki = asRecord(context.wiki)
  const title = readText(input.script?.title) || titleFromContext(context)
  const generatedAt = new Date().toISOString()
  const comicPageInputs = await Promise.all(input.comicPages.map(async (page, index) => ({
    bytes: await downloadProjectAssetBytes(input.client, readText(page.storagePath)),
    mimeType: readText(page.mimeType) || 'image/png',
    assetKey: readText(page.assetKey),
    storagePath: readText(page.storagePath),
    width: Number(page.width ?? 0) || null,
    height: Number(page.height ?? 0) || null,
    prompt: readText(page.prompt),
    pageNumber: Number(page.pageNumber ?? index + 1) || index + 1,
  })))
  const renderResult = await input.documentRenderer({
    markdown: input.scriptMarkdown,
    title,
    subtitle: readText(wiki.logline) || readText(wiki.subtitle),
    provenance: 'Generated from the GraphCore world graph',
    generatedAt,
    fileName: `${slug}.pdf`,
    renderMode: 'comic',
    comicPages: comicPageInputs,
    comicScript: input.script ?? null,
    coverImage: null,
    run: input.run,
    workflow: input.workflow,
    node: input.node,
  })
  await uploadBytes(input.client, storagePath, renderResult.bytes, 'application/pdf')
  const scriptBytes = new TextEncoder().encode(input.scriptMarkdown)
  await uploadBytes(input.client, scriptStoragePath, scriptBytes, 'text/markdown; charset=utf-8')
  const renderMetadata = {
    ...renderResult.metadata,
    sequenceUnitKey: readStringArray(input.run.input.sourceSequenceUnitKeys)[0] ?? '',
  }
  const assetMetadata = {
    generatedBy: 'output_workflow',
    workflowId: input.workflow.id,
    workflowKey: input.workflow.key,
    runId: input.run.id,
    nodeId: input.node.id,
    nodeKey: input.node.key,
    preset: input.run.preset,
    provider: 'graphcore',
    model: 'deterministic-comic-pdf-v1',
    storageBucket: 'project-assets',
    storagePath,
    sourceEntityKeys: input.run.input.sourceEntityKeys ?? [],
    sourceSequenceUnitKeys: input.run.input.sourceSequenceUnitKeys ?? [],
    pageAssetKeys: comicPageInputs.map((page) => page.assetKey),
    pageStoragePaths: comicPageInputs.map((page) => page.storagePath),
    render: renderMetadata,
  }
  const assetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: assetKey,
      name: `${input.workflow.name}.pdf`,
      kind: 'document',
      mime_type: 'application/pdf',
      storage_path: storagePath,
      metadata: assetMetadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (assetResponse.error || !assetResponse.data) throw new Error(assetResponse.error?.message ?? 'Failed to register comic PDF asset.')

  const scriptAssetMetadata = {
    ...assetMetadata,
    storagePath: scriptStoragePath,
    companionForAssetKey: assetKey,
    render: {
      ...renderMetadata,
      byteSize: scriptBytes.byteLength,
      mimeType: 'text/markdown',
    },
  }
  const scriptAssetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: scriptAssetKey,
      name: `${input.workflow.name} Script.md`,
      kind: 'document',
      mime_type: 'text/markdown',
      storage_path: scriptStoragePath,
      metadata: scriptAssetMetadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (scriptAssetResponse.error || !scriptAssetResponse.data) throw new Error(scriptAssetResponse.error?.message ?? 'Failed to register comic script asset.')

  const artifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: artifactKey,
      name: input.workflow.name,
      kind: 'comic_pdf',
      asset_key: assetKey,
      mime_type: 'application/pdf',
      summary: 'Comic issue PDF generated from the selected sequence unit.',
      metadata: {
        ...assetMetadata,
        companionScriptAssetKey: scriptAssetKey,
        companionScriptArtifactKey: scriptArtifactKey,
        scriptPreview: input.scriptMarkdown.slice(0, 4000),
        scriptPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (artifactResponse.error || !artifactResponse.data) throw new Error(artifactResponse.error?.message ?? 'Failed to register comic PDF artifact.')

  const scriptArtifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: scriptArtifactKey,
      name: `${input.workflow.name} Script`,
      kind: 'manuscript',
      asset_key: scriptAssetKey,
      mime_type: 'text/markdown',
      summary: 'Comic script used to generate the page images.',
      metadata: {
        ...scriptAssetMetadata,
        primaryComicPdfAssetKey: assetKey,
        scriptPreview: input.scriptMarkdown.slice(0, 4000),
        scriptPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (scriptArtifactResponse.error || !scriptArtifactResponse.data) throw new Error(scriptArtifactResponse.error?.message ?? 'Failed to register comic script artifact.')

  return {
    pdfArtifact: mapOutputArtifactRow(artifactResponse.data as OutputArtifactRow),
    scriptArtifact: mapOutputArtifactRow(scriptArtifactResponse.data as OutputArtifactRow),
    renderMetadata,
  }
}

async function registerDocumentArtifact(input: {
  client: DatabaseClient
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  markdown: string
  guidance?: OutputGuidanceBundle | null
  coverImage?: Record<string, unknown> | null
  documentMode?: 'ebook' | 'reference' | 'designed_reference'
  documentRenderer?: OutputDocumentRenderer | null
}) {
  const slug = slugify(input.workflow.name)
  const artifactKey = `output.${slug}.${input.run.id.slice(0, 8)}`
  const assetKey = `${artifactKey}.pdf`
  const htmlArtifactKey = `${artifactKey}.html`
  const htmlAssetKey = `${artifactKey}.html`
  const markdownArtifactKey = `${artifactKey}.manuscript`
  const markdownAssetKey = `${artifactKey}.md`
  const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.pdf`
  const htmlStoragePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.html`
  const markdownStoragePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slug}.md`
  const context = worldContextFromRunInput(input.run)
  const wiki = asRecord(context.wiki)
  const title = titleFromContext(context)
  const subtitle = readText(wiki.logline) || readText(wiki.subtitle)
  const generatedAt = new Date().toISOString()
  const provenance = 'Generated from the GraphCore world graph'
  const documentMode = input.documentMode ?? (input.run.preset === 'story_bible_from_world' ? 'reference' : 'ebook')
  const runPageSize = readText(asRecord(input.run.input).pageSize)
  const pageSize = documentMode === 'designed_reference'
    ? (runPageSize === 'letter' || runPageSize === 'trade_6x9' || runPageSize === 'a4' ? runPageSize : 'a4')
    : documentMode === 'reference'
      ? (runPageSize === 'a4' ? 'a4' : 'letter')
      : 'trade_6x9'
  const referenceImages = documentMode === 'designed_reference'
    ? await buildDocumentReferenceImages({ client: input.client, run: input.run, limit: 30 })
    : []
  const baseRenderMetadata = buildEbookDocumentMetadata(input.markdown, {
    title,
    subtitle,
    provenance,
    generatedAt,
    documentMode,
    pageSize,
  })
  if (!input.documentRenderer) {
    throw new Error('PDF rendering requires a worker document renderer. The truncated fallback renderer has been removed.')
  }
  const renderResult = await input.documentRenderer({
    markdown: input.markdown,
    title,
    subtitle,
    provenance,
    generatedAt,
    fileName: `${slug}.pdf`,
    renderMode: documentMode,
    pageSize,
    referenceImages,
    coverImage: input.coverImage && readText(input.coverImage.storagePath)
      ? {
        bytes: await downloadProjectAssetBytes(input.client, readText(input.coverImage.storagePath)),
        mimeType: readText(input.coverImage.mimeType) || 'image/png',
        assetKey: readText(input.coverImage.assetKey),
        storagePath: readText(input.coverImage.storagePath),
        width: Number(input.coverImage.width ?? 0) || null,
        height: Number(input.coverImage.height ?? 0) || null,
        prompt: readText(input.coverImage.prompt),
      }
      : null,
    run: input.run,
    workflow: input.workflow,
    node: input.node,
  })
  const renderMetadata = {
    ...baseRenderMetadata,
    ...renderResult.metadata,
    manuscriptCharacterCount: input.markdown.length,
  }
  await uploadBytes(input.client, storagePath, renderResult.bytes, 'application/pdf')
  const coverImageBytes = input.coverImage && readText(input.coverImage.storagePath)
    ? await downloadProjectAssetBytes(input.client, readText(input.coverImage.storagePath))
    : null
  const { html } = buildEbookHtmlDocument(input.markdown, {
    title,
    subtitle,
    provenance,
    generatedAt,
    documentMode,
    pageSize,
    coverImageSrc: coverImageBytes
      ? bytesToDataUrl(coverImageBytes, readText(input.coverImage?.mimeType) || 'image/png')
      : undefined,
    referenceImages: referenceImages.map((image) => ({
      key: image.key ?? image.assetKey ?? '',
      entityKey: image.entityKey ?? '',
      title: image.title,
      caption: image.caption ?? '',
      type: image.type ?? '',
      src: bytesToDataUrl(image.bytes, image.mimeType || 'image/png'),
    })),
  })
  const htmlBytes = new TextEncoder().encode(html)
  await uploadBytes(input.client, htmlStoragePath, htmlBytes, 'text/html; charset=utf-8')
  const markdownBytes = new TextEncoder().encode(input.markdown)
  await uploadBytes(input.client, markdownStoragePath, markdownBytes, 'text/markdown; charset=utf-8')
  const assetMetadata = {
    generatedBy: 'output_workflow',
    workflowId: input.workflow.id,
    workflowKey: input.workflow.key,
    runId: input.run.id,
    nodeId: input.node.id,
    nodeKey: input.node.key,
    preset: input.run.preset,
    provider: 'graphcore',
    model: documentMode === 'designed_reference'
      ? 'deterministic-designed-reference-document-v1'
      : documentMode === 'reference'
        ? 'deterministic-reference-document-v1'
        : 'deterministic-ebook-v1',
    documentMode,
    pageSize,
    companionHtmlAssetKey: htmlAssetKey,
    companionHtmlArtifactKey: htmlArtifactKey,
    storageBucket: 'project-assets',
    storagePath,
    sourceEntityKeys: input.run.input.sourceEntityKeys ?? [],
    sourceSequenceUnitKeys: input.run.input.sourceSequenceUnitKeys ?? [],
    skillKeys: input.guidance?.skillKeys ?? [],
    skillVersions: input.guidance?.skillVersions ?? {},
    guidanceHash: input.guidance?.guidanceHash ?? '',
    resolvedGuidancePreview: input.guidance?.resolvedGuidancePreview ?? '',
    cover: input.coverImage ? {
      assetKey: readText(input.coverImage.assetKey),
      storagePath: readText(input.coverImage.storagePath),
      mimeType: readText(input.coverImage.mimeType),
      width: Number(input.coverImage.width ?? 0) || null,
      height: Number(input.coverImage.height ?? 0) || null,
      prompt: readText(input.coverImage.prompt),
    } : null,
    referenceImages: referenceImages.map((image) => ({
      key: image.key ?? '',
      assetKey: image.assetKey ?? '',
      entityKey: image.entityKey ?? '',
      title: image.title,
      type: image.type ?? '',
      storagePath: image.storagePath ?? '',
      mimeType: image.mimeType,
    })),
    render: renderMetadata,
  }
  const assetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: assetKey,
      name: `${input.workflow.name}.pdf`,
      kind: 'document',
      mime_type: 'application/pdf',
      storage_path: storagePath,
      metadata: assetMetadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (assetResponse.error || !assetResponse.data) throw new Error(assetResponse.error?.message ?? 'Failed to register output asset.')

  const htmlAssetMetadata = {
    ...assetMetadata,
    storagePath: htmlStoragePath,
    companionForAssetKey: assetKey,
    render: {
      ...renderMetadata,
      byteSize: htmlBytes.byteLength,
      mimeType: 'text/html',
      renderer: 'graphcore-safe-html-document-v1',
    },
  }
  const htmlAssetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: htmlAssetKey,
      name: `${input.workflow.name}.html`,
      kind: 'document',
      mime_type: 'text/html',
      storage_path: htmlStoragePath,
      metadata: htmlAssetMetadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (htmlAssetResponse.error || !htmlAssetResponse.data) throw new Error(htmlAssetResponse.error?.message ?? 'Failed to register HTML page asset.')

  const markdownAssetMetadata = {
    ...assetMetadata,
    storagePath: markdownStoragePath,
    companionForAssetKey: assetKey,
    render: {
      ...renderMetadata,
      byteSize: markdownBytes.byteLength,
      mimeType: 'text/markdown',
    },
  }
  const markdownAssetResponse = await input.client
    .from('project_assets')
    .upsert({
      project_id: input.run.projectId,
      key: markdownAssetKey,
      name: `${input.workflow.name}.md`,
      kind: 'document',
      mime_type: 'text/markdown',
      storage_path: markdownStoragePath,
      metadata: markdownAssetMetadata,
      llm_hints: {},
    }, { onConflict: 'project_id,key' })
    .select('id, key')
    .single()
  if (markdownAssetResponse.error || !markdownAssetResponse.data) throw new Error(markdownAssetResponse.error?.message ?? 'Failed to register manuscript markdown asset.')

  const artifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: artifactKey,
      name: input.workflow.name,
      kind: 'pdf',
      asset_key: assetKey,
      mime_type: 'application/pdf',
      summary: documentMode === 'reference'
        ? 'Story bible reference PDF generated from the world graph.'
        : 'Written ebook PDF generated from the world graph.',
      metadata: {
        ...assetMetadata,
        companionHtmlAssetKey: htmlAssetKey,
        companionHtmlArtifactKey: htmlArtifactKey,
        companionMarkdownAssetKey: markdownAssetKey,
        companionMarkdownArtifactKey: markdownArtifactKey,
        markdownPreview: input.markdown.slice(0, 4000),
        markdownPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (artifactResponse.error || !artifactResponse.data) throw new Error(artifactResponse.error?.message ?? 'Failed to register output artifact.')

  const htmlArtifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: htmlArtifactKey,
      name: `${input.workflow.name} HTML`,
      kind: 'html',
      asset_key: htmlAssetKey,
      mime_type: 'text/html',
      summary: documentMode === 'reference' || documentMode === 'designed_reference'
        ? 'Openable designed HTML reference page generated from the world graph.'
        : 'Openable HTML ebook page generated from the world graph.',
      metadata: {
        ...htmlAssetMetadata,
        primaryPdfAssetKey: assetKey,
        htmlPreview: html.slice(0, 4000),
        htmlPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (htmlArtifactResponse.error || !htmlArtifactResponse.data) throw new Error(htmlArtifactResponse.error?.message ?? 'Failed to register HTML page artifact.')

  const markdownArtifactResponse = await input.client
    .from('output_artifacts')
    .upsert({
      project_id: input.run.projectId,
      draft_id: input.run.draftId,
      workflow_id: input.workflow.id,
      run_id: input.run.id,
      node_id: input.node.id,
      key: markdownArtifactKey,
      name: documentMode === 'reference' ? `${input.workflow.name} Markdown` : `${input.workflow.name} Manuscript`,
      kind: 'manuscript',
      asset_key: markdownAssetKey,
      mime_type: 'text/markdown',
      summary: documentMode === 'reference'
        ? 'Full story bible reference Markdown generated from the world graph.'
        : 'Full manuscript Markdown generated from the world graph.',
      metadata: {
        ...markdownAssetMetadata,
        primaryPdfAssetKey: assetKey,
        companionHtmlAssetKey: htmlAssetKey,
        companionHtmlArtifactKey: htmlArtifactKey,
        markdownPreview: input.markdown.slice(0, 4000),
        markdownPreviewOnly: true,
      },
    }, { onConflict: 'draft_id,key' })
    .select(outputArtifactSelect)
    .single()
  if (markdownArtifactResponse.error || !markdownArtifactResponse.data) throw new Error(markdownArtifactResponse.error?.message ?? 'Failed to register manuscript artifact.')
  return {
    pdfArtifact: mapOutputArtifactRow(artifactResponse.data as OutputArtifactRow),
    htmlArtifact: mapOutputArtifactRow(htmlArtifactResponse.data as OutputArtifactRow),
    markdownArtifact: mapOutputArtifactRow(markdownArtifactResponse.data as OutputArtifactRow),
    renderMetadata,
  }
}

function computeNodeInputHash(input: {
  run: OutputWorkflowRun
  node: OutputWorkflowNode
  upstream: Record<string, Record<string, unknown>>
}) {
  const upstreamPayload = Object.fromEntries(
    Object.entries(input.upstream).map(([nodeKey, outputs]) => [nodeKey, outputs]),
  )
  return hashOutputWorkflowValue({
    executorVersion: OUTPUT_WORKFLOW_EXECUTOR_VERSION,
    runInput: input.run.input,
    nodeConfig: input.node.config,
    nodeInputs: input.node.inputs,
    upstream: upstreamPayload,
  })
}

type OutputWorkflowNodeExecutionContext = {
  run: OutputWorkflowRun
  workflow: OutputWorkflow
  node: OutputWorkflowNode
  priorStep?: OutputWorkflowRunStep | null
  upstream: Record<string, Record<string, unknown>>
  inputHash: string
  client: DatabaseClient
  documentRenderer?: OutputDocumentRenderer | null
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<void>
}

type OutputWorkflowNodeExecutionResult = {
  status?: string
  inputHash: string
  outputHash: string
  outputs: Record<string, unknown>
  provider?: string | null
  model?: string | null
  providerRequestId?: string | null
}

async function executeNode(input: OutputWorkflowNodeExecutionContext): Promise<OutputWorkflowNodeExecutionResult> {
  switch (input.node.nodeType) {
    case 'world_context_query': {
      const context = await refreshWorldContextVisualReferences(input.client, input.run, extractWorldContext(input.run, input.node))
      return {
        inputHash: input.inputHash,
        outputHash: hashOutputWorkflowValue(context),
        outputs: { context },
      }
    }
    case 'skill_context_query': {
      const guidance = buildOutputGuidanceBundleForNode({
        node: input.node,
        worldWiki: asRecord(input.run.input).worldWiki,
      })
      const outputs = { guidance, guidanceHash: guidance.guidanceHash, skillKeys: guidance.skillKeys }
      return {
        inputHash: input.inputHash,
        outputHash: hashOutputWorkflowValue(outputs),
        outputs,
        provider: 'graphcore',
        model: 'output-skills-v1',
      }
    }
    case 'text_llm': {
      const purpose = readText(asRecord(input.node.config).purpose)
      const prompt = readText(input.node.inputs.prompt) || input.run.prompt
      const context = asRecord(asRecord(input.upstream.world_context).context)
      const guidance = resolveGuidanceForExecution({ run: input.run, node: input.node, upstream: input.upstream })
      if (purpose === 'comic_atlas_prompt') {
        const assetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
        const model = outputWorkflowTextModel()
        const response = await runOpenAiResponses({
          model,
          instructions: 'You are a comic art director writing GPT Image 2 prompts. Return one prompt only.',
          input: buildComicAtlasPromptInstruction({ context, assetPack, prompt, guidance }),
          maxOutputTokens: 1200,
          metadata: {
            graphcore_task: 'output_workflow_comic_atlas_prompt',
            graphcore_node_key: input.node.key,
          },
          timeoutMs: 120_000,
        })
        if (!response.response.ok) {
          throw new Error(openAiErrorMessage(response, `OpenAI comic atlas prompt failed with status ${response.response.status}.`))
        }
        const atlasPrompt = response.outputText.trim()
        const outputs = { prompt: atlasPrompt, text: atlasPrompt, assetPack, guidance, usage: asRecord(response.body.usage) }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'openai',
          model,
          providerRequestId: readText(response.body.id) || response.response.headers.get('x-request-id') || null,
        }
      }
      if (purpose === 'chapter_section_plan') {
        const config = asRecord(input.node.config)
        const chapterNumber = Number(config.chapterNumber ?? 1)
        const sectionCount = Math.max(1, Number(config.sectionCount ?? 4))
        const sequenceUnitKey = readText(config.sequenceUnitKey)
        const sequenceUnitName = readText(config.sequenceUnitName)
        const chapterPlan = readFirstUpstreamArray(input.upstream, ['chapterPlan', 'plan'])
        const sections = buildChapterSectionPlan({
          context,
          chapterPlan: chapterPlan.length > 0 ? chapterPlan : buildChapterPlan(context, outlineFromContext(context)),
          chapterNumber,
          sequenceUnitKey,
          sequenceUnitName,
          sectionCount,
        })
        const text = sections.map((section) => `${section.chapterNumber}.${section.sectionNumber} ${section.title}`).join('\n')
        const outputs = { sections, sectionPlan: sections, text, chapterNumber, sequenceUnitKey, guidance }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-chapter-section-plan-v1' }
      }
      if (purpose === 'chapter_section_prose') {
        const config = asRecord(input.node.config)
        const chapterNumber = Number(config.chapterNumber ?? 1)
        const sectionNumber = Number(config.sectionNumber ?? 1)
        const sectionCount = Math.max(1, Number(config.sectionCount ?? 4))
        const sequenceUnitKey = readText(config.sequenceUnitKey)
        const sequenceUnitName = readText(config.sequenceUnitName)
        const chapterPlan = readFirstUpstreamArray(input.upstream, ['chapterPlan', 'plan'])
        const sectionPlan = readFirstUpstreamArray(input.upstream, ['sections', 'sectionPlan'])
        const prose = await generateBackgroundMarkdown({
          instructions: [
            'You are a professional longform book writer.',
            'Write restrained, specific, publishable prose from the supplied canon.',
            'Open scenes through character action, choice, dialogue, or immediate pressure rather than weather, skyline, mood, or decorative metaphor.',
            'Follow the requested style guidance, but never reveal the guidance or workflow.',
            'Return only the requested Markdown manuscript content.',
          ].join(' '),
          prompt: buildChapterSectionProsePrompt({
            context,
            prompt,
            chapterPlan: chapterPlan.length > 0 ? chapterPlan : buildChapterPlan(context, outlineFromContext(context)),
            sectionPlan: sectionPlan.length > 0 ? sectionPlan : buildChapterSectionPlan({
              context,
              chapterPlan: chapterPlan.length > 0 ? chapterPlan : buildChapterPlan(context, outlineFromContext(context)),
              chapterNumber,
              sequenceUnitKey,
              sequenceUnitName,
              sectionCount,
            }),
            chapterNumber,
            sectionNumber,
            sectionCount,
            sequenceUnitKey,
            sequenceUnitName,
            guidance,
          }),
          maxOutputTokens: 2400,
          metadata: {
            graphcore_task: 'output_workflow_chapter_section_prose',
            graphcore_node_key: input.node.key,
          },
          priorProviderRequestId: input.priorStep?.providerRequestId,
          shouldCancel: input.shouldCancel,
          onProgress: async (progress) => {
            await input.onProgress?.({
              provider: 'openai',
              model: outputWorkflowTextModel(),
              providerRequestId: progress.providerRequestId,
              metadata: {
                providerMode: progress.providerMode,
                providerStatus: progress.providerStatus,
                lastProviderPollAt: progress.lastProviderPollAt,
              },
            })
          },
        })
        const outputs = {
          markdown: prose.markdown,
          text: prose.markdown,
          chapterNumber,
          sectionNumber,
          sectionCount,
          sequenceUnitKey,
          sourceSequenceUnitKeys: sequenceUnitKey ? [sequenceUnitKey] : [],
          guidance,
          usage: prose.usage,
          timeoutMs: prose.timeoutMs,
          providerStatus: prose.providerStatus,
        }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'openai',
          model: prose.model,
          providerRequestId: prose.providerRequestId,
        }
      }
      const source = readFirstUpstreamText(input.upstream)
      const markdown = editMarkdown(source)
      const outputs = { markdown, text: markdown, guidance }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-editor-v1' }
    }
    case 'image_generation': {
      return executeOutputWorkflowImageGeneration(input)
    }
    case 'video_generation': {
      return executeOutputWorkflowVideoGeneration(input)
    }
    case 'utility_transform': {
      const purpose = readText(asRecord(input.node.config).purpose)
      if (purpose === 'video_stitch') {
        const config = asRecord(input.node.config)
        const videos = collectCinematicBlockVideos(input.upstream)
        if (videos.length === 0 && (debugSkipVideoGenerationEnabled(config, input.run) || upstreamHasDebugSkippedVideo(input.upstream))) {
          const video = {
            skipped: true,
            debugSkipVideoGeneration: true,
            skippedReason: 'debug_skip_video_generation',
            provider: 'graphcore',
            model: 'debug-skip-video-stitch-v1',
            role: 'cinematic_sequence_final',
            sourceVideoCount: 0,
          }
          const outputs = {
            video,
            videos: [],
            debugSkipVideoGeneration: true,
            skippedReason: 'debug_skip_video_generation',
          }
          return {
            status: 'skipped',
            inputHash: input.inputHash,
            outputHash: hashOutputWorkflowValue(outputs),
            outputs,
            provider: 'graphcore',
            model: 'debug-skip-video-stitch-v1',
          }
        }
        const stitchResult = await stitchVideoBytes({ client: input.client, videos })
        const assetKey = `output.${slugify(input.workflow.name)}.${input.run.id.slice(0, 8)}.${slugify(input.node.key)}`
        const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slugify(input.node.key)}.mp4`
        await uploadBytes(input.client, storagePath, stitchResult.bytes, stitchResult.mimeType)
        const metadata = {
          generatedBy: 'output_workflow',
          workflowId: input.workflow.id,
          workflowKey: input.workflow.key,
          runId: input.run.id,
          nodeId: input.node.id,
          nodeKey: input.node.key,
          preset: input.run.preset,
          provider: 'graphcore',
          model: 'ffmpeg-video-stitch-v1',
          stitchMode: stitchResult.mode,
          sourceVideoAssetKeys: videos.map((video) => readText(video.assetKey)).filter(Boolean),
          sourceVideoStoragePaths: videos.map((video) => readText(video.storagePath) || readText(video.storage_path)).filter(Boolean),
          byteSize: stitchResult.bytes.byteLength,
          storageBucket: 'project-assets',
          storagePath,
        }
        const artifact = await registerVideoArtifact({
          client: input.client,
          run: input.run,
          workflow: input.workflow,
          node: input.node,
          assetKey,
          storagePath,
          name: input.node.label,
          summary: 'Final stitched cinematic sequence video.',
          mimeType: stitchResult.mimeType,
          metadata,
        })
        const video = {
          assetKey,
          storagePath,
          mimeType: stitchResult.mimeType,
          provider: 'graphcore',
          model: 'ffmpeg-video-stitch-v1',
          role: 'cinematic_sequence_final',
          sourceVideoCount: videos.length,
          stitchMode: stitchResult.mode,
        }
        const outputs = { video, videos, artifact, assetKey, storagePath, mimeType: stitchResult.mimeType }
        return {
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'ffmpeg-video-stitch-v1',
        }
      }
      if (purpose === 'single_chapter_assembly') {
        const config = asRecord(input.node.config)
        const chapterNumber = Number(config.chapterNumber ?? 9999)
        const markdown = assembleChapterMarkdown(input.upstream)
        const guidance = readUpstreamGuidanceBundle(input.upstream)
        const outputs = { markdown, text: markdown, chapterNumber, guidance }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-single-chapter-assembly-v1' }
      }
      const outputs = { output: input.upstream }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-utility-v1' }
    }
    case 'document_render': {
      const markdown = readFirstUpstreamText(input.upstream)
      const config = asRecord(input.node.config)
      const guidance = readUpstreamGuidanceBundle(input.upstream)
      const coverImage = readFirstUpstreamImage(input.upstream, ['image', 'coverImage'])
      const context = worldContextFromRunInput(input.run)
      const wiki = asRecord(context.wiki)
      const title = titleFromContext(context)
      const subtitle = readText(wiki.logline) || readText(wiki.subtitle)
      const configuredDocumentMode = readText(config.documentMode)
      const documentMode = configuredDocumentMode === 'designed_reference'
        ? 'designed_reference'
        : configuredDocumentMode === 'reference' || input.run.preset === 'story_bible_from_world'
          ? 'reference'
          : 'ebook'
      const pageSize = readText(config.pageSize) || readText(asRecord(input.run.input).pageSize)
      const renderMetadata = buildEbookDocumentMetadata(markdown, {
        title,
        subtitle,
        provenance: 'Generated from the GraphCore world graph',
        generatedAt: new Date().toISOString(),
        documentMode,
        pageSize: pageSize === 'a4' || pageSize === 'letter' || pageSize === 'trade_6x9' ? pageSize : undefined,
      })
      const outputs = {
        markdown,
        mimeType: 'application/pdf',
        fileName: `${slugify(input.workflow.name)}.pdf`,
        renderMetadata,
        coverImage,
        documentMode,
        pageSize,
        guidance,
      }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-document-render-v1' }
    }
    case 'output_artifact': {
      const purpose = readText(asRecord(input.node.config).purpose)
      const markdown = readFirstUpstreamText(input.upstream)
      const guidance = readUpstreamGuidanceBundle(input.upstream)
      const coverImage = readFirstUpstreamImage(input.upstream, ['coverImage', 'image'])
      const artifact = await registerDocumentArtifact({
        client: input.client,
        run: input.run,
        workflow: input.workflow,
        node: input.node,
        markdown,
        guidance,
        coverImage,
        documentMode: readText(asRecord(input.node.config).documentMode) === 'designed_reference'
          ? 'designed_reference'
          : input.run.preset === 'story_bible_from_world'
            ? 'reference'
            : 'ebook',
        documentRenderer: input.documentRenderer,
      })
      const outputs = {
        artifactKey: artifact.pdfArtifact.key,
        assetKey: artifact.pdfArtifact.assetKey,
        htmlArtifactKey: artifact.htmlArtifact.key,
        htmlAssetKey: artifact.htmlArtifact.assetKey,
        markdownArtifactKey: artifact.markdownArtifact.key,
        markdownAssetKey: artifact.markdownArtifact.assetKey,
        artifact: artifact.pdfArtifact,
        artifacts: [artifact.pdfArtifact, artifact.htmlArtifact, artifact.markdownArtifact],
        renderMetadata: artifact.renderMetadata,
        guidance,
      }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-artifact-v1' }
    }
    default: {
      const outputs = { skipped: true, reason: `${input.node.nodeType} is registered but not executed by the v1 ebook worker.` }
      return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'unsupported-node-v1' }
    }
  }
}

async function executeOutputWorkflowImageGeneration(input: OutputWorkflowNodeExecutionContext): Promise<OutputWorkflowNodeExecutionResult> {
      const config = asRecord(input.node.config)
      const purpose = readText(config.purpose) || 'image_prompt'
      const role = readText(config.role) || purpose
      const guidance = resolveGuidanceForExecution({ run: input.run, node: input.node, upstream: input.upstream })
      const keyframePrompts = readFirstUpstreamArray(input.upstream, ['keyframePrompts', 'keyframe_prompts'])
      const keyframeIndex = Math.max(0, Math.min(2, Number(config.keyframeIndex ?? 0) || 0))
      const requiresContinuityPrompt = purpose === 'sequence_animatic_continuity_batch_image'
        || role === 'sequence_animatic_continuity_batch_image'
        || purpose === 'sequence_animatic_continuity_asset_image'
        || role === 'sequence_animatic_continuity_asset_image'
      const continuityFallbackPrompt = (() => {
        if (purpose === 'sequence_animatic_continuity_batch_image' || role === 'sequence_animatic_continuity_batch_image') {
          const batch = asRecord(config.batch)
          const targetNodes = readArray(config.targetNodes).map(asRecord)
          if (!Object.keys(batch).length || targetNodes.length === 0) return ''
          return buildSequenceAnimaticContinuityBatchPrompt({
            batch,
            targetNodes,
            relevantShots: readArray(config.relevantShots).map(asRecord),
            referenceAssetKeys: readStringArray(config.referenceAssetKeys ?? config.reference_asset_keys),
          }).prompt
        }
        if (purpose === 'sequence_animatic_continuity_asset_image' || role === 'sequence_animatic_continuity_asset_image') {
          const targetNode = asRecord(config.targetNode ?? config.target_node)
          if (!Object.keys(targetNode).length) return ''
          return buildSequenceAnimaticContinuityAssetPrompt({
            targetNode,
            assetKind: readText(config.assetKind) || readText(targetNode.assetKind) || readText(targetNode.nodeKind) || 'continuity_asset',
            generationPolicy: readText(config.generationPolicy),
            zoneMapPoiLines: readStringArray(config.zoneMapPoiLines ?? config.zone_map_poi_lines),
            relevantShots: readArray(config.relevantShots).map(asRecord),
            referenceAssetKeys: readStringArray(config.referenceAssetKeys ?? config.reference_asset_keys),
          }).prompt
        }
        return ''
      })()
      const prompt = (purpose === 'cinematic_keyframe' || role === 'cinematic_keyframe'
        ? readText(keyframePrompts[keyframeIndex]?.prompt)
        : '')
        || readFirstUpstreamText(input.upstream, ['prompt'])
        || readFirstUpstreamText(input.upstream, ['text'])
        || readText(input.node.inputs.prompt)
        || continuityFallbackPrompt
        || (requiresContinuityPrompt ? '' : input.run.prompt)
      const skipImageGeneration = config.skipImageGeneration === true
        || config.skip_image_generation === true
        || input.node.inputs.skipImageGeneration === true
        || input.node.inputs.skip_image_generation === true
      if (skipImageGeneration) {
        const outputs = {
          skipped: true,
          skipImageGeneration: true,
          skip_image_generation: true,
          reason: readFirstUpstreamText(input.upstream, ['skipReason', 'skip_reason']) || 'No image generation needed for this node.',
          role,
          purpose,
          image: null,
          images: [],
          text: readFirstUpstreamText(input.upstream, ['text']) || '',
          deterministic: true,
        }
        return { inputHash: input.inputHash, outputHash: hashOutputWorkflowValue(outputs), outputs, provider: 'graphcore', model: 'deterministic-image-generation-skip-v1' }
      }
      if (!prompt) throw new Error('Image generation node is missing a prompt.')
      const priorStepOutputs = asRecord(input.priorStep?.outputs)
      const priorImageOutput = asRecord(priorStepOutputs.image)
      const priorIsCinematicV2PanelPassthrough = role === 'cinematic_v2_shot_keyframe' && (
        readText(input.priorStep?.provider) === 'graphcore'
        || readText(priorImageOutput.generatedBy) === 'deterministic_panel_passthrough'
        || readText(priorImageOutput.keyframeMode) === 'storyboard_panel_crop'
      )
      if (
        !priorIsCinematicV2PanelPassthrough
        && outputWorkflowNodeOutputsReusableForCache(input.node, priorStepOutputs)
        && input.priorStep?.outputHash
        && hasStoredOutputs(priorImageOutput)
      ) {
        return {
          inputHash: input.priorStep.inputHash || input.inputHash,
          outputHash: input.priorStep.outputHash,
          outputs: priorStepOutputs,
          provider: input.priorStep.provider,
          model: input.priorStep.model,
          providerRequestId: input.priorStep.providerRequestId,
        }
      }
      const recoverableArtifact = await loadRecoverableArtifactBackedNodeOutputs({
        client: input.client,
        run: input.run,
        node: input.node,
      })
      if (recoverableArtifact) {
        const outputHash = hashOutputWorkflowValue(recoverableArtifact.outputs)
        return {
          inputHash: input.priorStep?.inputHash || input.inputHash,
          outputHash,
          outputs: recoverableArtifact.outputs,
          provider: recoverableArtifact.provider,
          model: recoverableArtifact.model,
          providerRequestId: recoverableArtifact.providerRequestId,
        }
      }
      const forceNodeKeys = new Set(readStringArray(asRecord(input.run.metadata).forceNodeKeys))
      const existingArtifactRole = readText(config.existingArtifactRole)
      const globalAssetIdentityKey = readText(config.globalAssetIdentityKey)
      const globalAssetIdentityValue = readText(config.globalAssetIdentityValue)
      const expectedAssetKey = readText(config.expectedAssetKey) || (globalAssetIdentityKey === 'assetKey' ? globalAssetIdentityValue : '')
      if (existingArtifactRole && !forceNodeKeys.has(input.node.key)) {
        let query = input.client
          .from('output_artifacts')
          .select(outputArtifactSelect)
          .eq('project_id', input.run.projectId)
          .eq('draft_id', input.run.draftId)
          .contains('metadata', { role: existingArtifactRole })
          .order('updated_at', { ascending: false })
          .limit(200)
        const masterRequestId = readText(config.masterRequestId)
        if (masterRequestId) query = query.contains('metadata', { masterRequestId })
        if (globalAssetIdentityKey && globalAssetIdentityValue && globalAssetIdentityKey !== 'assetKey') {
          query = query.contains('metadata', { [globalAssetIdentityKey]: globalAssetIdentityValue })
        }
        if (expectedAssetKey) query = query.eq('asset_key', expectedAssetKey)
        const response = await query
        if (response.error) throw new Error(response.error.message)
        const reusableArtifact = ((response.data ?? []) as OutputArtifactRow[])
          .map(mapOutputArtifactRow)
          .find((artifact) => {
            const metadata = asRecord(artifact.metadata)
            if (readText(metadata.role) !== existingArtifactRole) return false
            if (masterRequestId && readText(metadata.masterRequestId) !== masterRequestId) return false
            if (globalAssetIdentityKey && globalAssetIdentityValue && globalAssetIdentityKey !== 'assetKey' && readText(metadata[globalAssetIdentityKey]) !== globalAssetIdentityValue) return false
            if (expectedAssetKey && readText(artifact.assetKey) !== expectedAssetKey) return false
            return true
          }) ?? null
        if (reusableArtifact) {
          const metadata = asRecord(reusableArtifact.metadata)
          const artifactImage = asRecord(metadata.image)
          const assetKey = readText(metadata.assetKey) || readText(reusableArtifact.assetKey) || readText(artifactImage.assetKey)
          if (assetKey) {
            const storagePath = readText(artifactImage.storagePath) || readText(artifactImage.storage_path) || readText(metadata.storagePath) || readText(metadata.storage_path)
            const mimeType = readText(artifactImage.mimeType) || readText(artifactImage.mime_type) || readText(reusableArtifact.mimeType)
            const image = {
              ...artifactImage,
              assetKey,
              storagePath,
              storage_path: storagePath,
              mimeType,
              mime_type: mimeType,
              artifactKey: reusableArtifact.key,
              role,
              sourceArtifactRole: existingArtifactRole,
              globalAssetStatus: 'ready_existing',
              global_asset_status: 'ready_existing',
              globalAssetIdentityKey,
              globalAssetIdentityValue,
              metadata,
            }
            const outputs = {
              image,
              keyframe: image,
              primaryReferenceImage: image,
              assetKey,
              storagePath,
              mimeType,
              prompt,
              providerPrompt: prompt,
              role,
              purpose,
              artifact: reusableArtifact,
              globalAssetStatus: 'ready_existing',
              global_asset_status: 'ready_existing',
              skipImageGeneration: true,
              skip_image_generation: true,
              reference: {
                status: 'ready',
                assetKey,
                artifactKey: reusableArtifact.key,
                role: readText(config.globalAssetRole) || readText(metadata.sequenceAnimaticRole) || readText(metadata.screenplayAnimaticRole) || role,
                sourceArtifactRole: existingArtifactRole,
                identityKey: globalAssetIdentityKey,
                identityValue: globalAssetIdentityValue,
              },
              text: JSON.stringify({ status: 'ready_existing', assetKey, existingArtifactRole, globalAssetIdentityKey, globalAssetIdentityValue }, null, 2),
              deterministic: true,
              guidance,
            }
            return {
              status: 'skipped',
              inputHash: input.inputHash,
              outputHash: hashOutputWorkflowValue(outputs),
              outputs,
              provider: 'graphcore',
              model: 'sequence-animatic-global-asset-reuse-v1',
            }
          }
        }
      }
      const falApiKey = Deno.env.get('FAL_KEY')
      if (!falApiKey) throw new Error('FAL_KEY is not configured for the Fly output workflow worker.')
      const upstreamImages = readUpstreamImages(input.upstream)
      const upstreamReferenceAssetKeys = readFirstUpstreamStringArray(input.upstream, ['referenceAssetKeys', 'reference_asset_keys'])
      const configuredReferenceAssetKeys = readStringArray(config.referenceAssetKeys ?? config.reference_asset_keys)
      const upstreamAssetPack = readFirstUpstreamRecord(input.upstream, ['pageAssetPack', 'page_asset_pack', 'assetPack', 'asset_pack'])
      const rawAssetPack = Object.keys(upstreamAssetPack).length > 0
        ? upstreamAssetPack
        : asRecord(config.pageAssetPack ?? config.page_asset_pack ?? config.assetPack ?? config.asset_pack)
      const assetPackReferenceAssetKeys = readStringArray(rawAssetPack.scopedReferenceAssetKeys ?? rawAssetPack.scoped_reference_asset_keys)
      const directReferenceAssetKeys = upstreamReferenceAssetKeys.length > 0
        ? upstreamReferenceAssetKeys
        : configuredReferenceAssetKeys.length > 0
          ? configuredReferenceAssetKeys
          : assetPackReferenceAssetKeys
      const continuityAssetKind = readText(config.assetKind) || readText(config.asset_kind) || readText(asRecord(config.targetNode ?? config.target_node).assetKind) || readText(asRecord(config.targetNode ?? config.target_node).nodeKind)
      const isSpotContinuityAssetImage = (purpose === 'sequence_animatic_continuity_asset_image' || role === 'sequence_animatic_continuity_asset_image') && continuityAssetKind === 'location_spot'
      const referenceLimit = isSpotContinuityAssetImage ? 1 : referenceLimitForImageNode(config, role)
      const latestSpotParentZoneAssetKey = isSpotContinuityAssetImage
        ? await latestParentZoneAssetKeyForSpotContinuityImage(input.client, input.run, config)
        : ''
      const effectiveDirectReferenceAssetKeys = isSpotContinuityAssetImage
        ? [latestSpotParentZoneAssetKey].map(readText).filter(Boolean).slice(0, 1)
        : directReferenceAssetKeys
      const isSequenceAnimaticPlannedKeyframeImage = purpose === 'sequence_animatic_planned_keyframe_image' || role === 'sequence_animatic_shot_keyframe'
      const shotGraphPolicyVersion = readText(config.shotGraphPolicyVersion ?? config.shot_graph_policy_version)
      const uiIngredientOverrideMode = shotGraphPolicyVersion === 'primary_chain_v13_ui_ingredient_override' || shotGraphPolicyVersion === 'primary_chain_v14_reference_fix'
      const keyframeIngredientReferenceMode = shotGraphPolicyVersion === 'primary_chain_v12_canonical_shot_refs' || uiIngredientOverrideMode
        || readText(config.dependencyMode ?? config.dependency_mode) === 'ingredient_refs'
      const shotReferencePackAssetKeys = upstreamReferenceAssetKeys.length > 0 ? upstreamReferenceAssetKeys : assetPackReferenceAssetKeys
      const canonicalKeyframeReferenceAssetKeys = readStringArray(config.requiredReferenceAssetKeys ?? config.required_reference_asset_keys)
      if (isSequenceAnimaticPlannedKeyframeImage && keyframeIngredientReferenceMode && (canonicalKeyframeReferenceAssetKeys.length > 0 || shotReferencePackAssetKeys.length > 0)) {
        const expected = (uiIngredientOverrideMode && shotReferencePackAssetKeys.length > 0
          ? shotReferencePackAssetKeys
          : canonicalKeyframeReferenceAssetKeys.length > 0
            ? canonicalKeyframeReferenceAssetKeys
            : shotReferencePackAssetKeys).map(readText).filter(Boolean)
        const actual = effectiveDirectReferenceAssetKeys.map(readText).filter(Boolean)
        if (actual.length === 0) {
          throw new Error(`Shot keyframe image is missing explicit reference_asset_keys from shot_reference_pack. Expected: ${expected.join(', ')}.`)
        }
        if (expected.length !== actual.length || expected.some((assetKey, index) => actual[index] !== assetKey)) {
          throw new Error(`Shot keyframe reference mismatch before provider submission. shot_reference_pack=${expected.join(', ')} planned_keyframe_image=${actual.join(', ')}.`)
        }
        if (uiIngredientOverrideMode) {
          const selectedReferenceByAssetKey = new Map(readArray(config.selectedReferences).map(asRecord)
            .map((entry) => [readText(entry.assetKey ?? entry.asset_key), entry] as const)
            .filter(([assetKey]) => Boolean(assetKey)))
          const disallowed = expected
            .map((assetKey) => ({ assetKey, reference: selectedReferenceByAssetKey.get(assetKey) ?? {} }))
            .filter(({ reference }) => {
              const kind = readText(reference.kind ?? reference.type ?? reference.nodeKind ?? reference.node_kind).toLowerCase()
              const role = readText(reference.role).toLowerCase()
              return ['spot', 'location_spot', 'set', 'location_set', 'coverage_anchor', 'spot_camera_grid'].includes(kind)
                || role === 'coverage_anchor'
                || role.includes('spot_camera_grid')
            })
          if (disallowed.length > 0) {
            throw new Error(`Rejected stale spot/set/coverage reference before provider submission: ${disallowed.map((entry) => entry.assetKey).join(', ')}. Shot keyframes require the focused UI ingredient override; location references must be zone_location only.`)
          }
        }
      }
      const useExactSequenceAnimaticKeyframeReferences = isSequenceAnimaticPlannedKeyframeImage && effectiveDirectReferenceAssetKeys.length > 0
      const isCinematicV3StoryboardSheet = purpose === 'cinematic_v3_storyboard_sheet' || role === 'cinematic_v3_storyboard_sheet'
      const storyboardSheetShotPlan = isCinematicV3StoryboardSheet ? readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan']) : {}
      const storyboardSheetGroupShots = isCinematicV3StoryboardSheet
        ? cinematicV3StoryboardGroupShots({ shotPlan: storyboardSheetShotPlan, storyboardGroup: asRecord(config.storyboardGroup) })
        : []
      const assetPack = isCinematicV3StoryboardSheet && storyboardSheetGroupShots.length > 0
        ? buildCinematicV3StoryboardGroupAssetPack({
          assetPack: rawAssetPack,
          shots: storyboardSheetGroupShots,
          storyboardGroup: asRecord(config.storyboardGroup),
          maxEntityCount: referenceLimitForImageNode(config, role),
          maxAssetKeysPerEntity: 1,
          includeContinuityAnchorRefs: false,
          includeSpeakerRefs: false,
          includePerformanceRefs: false,
          includeTextMentionedRefs: false,
          spatialReferencePolicy: 'zone_only',
        })
        : rawAssetPack
      const directImageRecords = isSpotContinuityAssetImage || useExactSequenceAnimaticKeyframeReferences ? [] : (await Promise.all(upstreamImages.map(async (image, index) => {
        const url = await imageReferenceToFalUrl(input.client, image, input.run)
        if (!url) return null
        const imageMetadata = asRecord(image.metadata)
        return {
          url,
          label: readText(image.name) || readText(image.title) || readText(image.label) || titleFromRefLike(readText(image.role) || readText(imageMetadata.role) || `upstream reference ${index + 1}`),
          role: readText(image.role) || readText(imageMetadata.role) || 'image_reference',
          modality: 'image' as const,
        }
      }))).filter((entry): entry is SeedanceReferenceRecord => Boolean(entry?.url))
      const directReferenceAssetKeyRecords = await collectReferenceAssetKeyRecords(
        input.client,
        input.run,
        effectiveDirectReferenceAssetKeys,
        referenceLimit,
        purpose === 'sequence_animatic_continuity_asset_image' || role === 'sequence_animatic_continuity_asset_image'
          ? 'Scene graph continuity dependency'
          : 'Workflow image reference',
        purpose === 'sequence_animatic_continuity_asset_image' || role === 'sequence_animatic_continuity_asset_image'
          ? 'continuity_dependency'
          : 'image_reference',
      )
      const assetPackImageRecords = isSpotContinuityAssetImage
        ? []
        : useExactSequenceAnimaticKeyframeReferences
          ? []
        : await collectAssetPackReferenceRecords(input.client, input.run, assetPack, referenceLimit)
      const seenReferenceImageKeys = new Set<string>()
      const referenceImageRecords = [...directImageRecords, ...directReferenceAssetKeyRecords, ...assetPackImageRecords]
        .filter((entry) => {
          const url = readText(entry.url)
          if (!url || seenReferenceImageKeys.has(url)) return false
          seenReferenceImageKeys.add(url)
          return true
        })
        .slice(0, referenceLimit)
      const referenceImageUrls = referenceImageRecords.map((entry) => readText(entry.url)).filter(Boolean)
      if (isSpotContinuityAssetImage && referenceImageUrls.length !== 1) {
        throw new Error('Spot continuity asset generation requires a ready parent zone image reference. Generate or regenerate the parent zone first; provider image request was not submitted.')
      }
      const sequenceAnimaticProviderReferenceManifest = isSequenceAnimaticPlannedKeyframeImage && !uiIngredientOverrideMode
        ? sequenceAnimaticReferenceManifestTextFromRecords(referenceImageRecords)
        : ''
      const baseModel = outputWorkflowImageModel(config.model)
      const referenceModel = readText(config.referenceModel) || (baseModel.endsWith('/edit') ? baseModel : `${baseModel}/edit`)
      const model = referenceImageUrls.length > 0
        ? referenceModel
        : baseModel
      const quality = readText(config.quality)
        || Deno.env.get('OUTPUT_WORKFLOW_IMAGE_QUALITY')?.trim()
        || resolveOutputImageGenerationQuality({ role, purpose, prompt })
      const outputFormat = readText(config.outputFormat)
        || Deno.env.get('OUTPUT_WORKFLOW_IMAGE_OUTPUT_FORMAT')?.trim()
        || resolveOutputImageGenerationOutputFormat()
      const upstreamImageSize = readFirstUpstreamRecord(input.upstream, ['imageSize'])
      const imageSize = (purpose === 'cinematic_storyboard' || role === 'cinematic_storyboard' || purpose === 'cinematic_beat_sheet' || role === 'cinematic_beat_sheet') && Object.keys(upstreamImageSize).length > 0
        ? upstreamImageSize
        : config.imageSize ?? { width: 1792, height: 2688 }
      const includeProviderGuidance = purpose !== 'cinematic_storyboard'
        && role !== 'cinematic_storyboard'
        && purpose !== 'cinematic_beat_sheet'
        && role !== 'cinematic_beat_sheet'
        && purpose !== 'cinematic_keyframe'
        && role !== 'cinematic_keyframe'
      const providerPrompt = [
        prompt,
        sequenceAnimaticProviderReferenceManifest ? '' : '',
        sequenceAnimaticProviderReferenceManifest ? `Attached image reference order:\n${sequenceAnimaticProviderReferenceManifest}` : '',
        includeProviderGuidance ? '' : '',
        includeProviderGuidance ? guidanceMarkdown(guidance) : '',
        '',
        'Provider requirements:',
        '- Generate one finished image only.',
        '- No visible text, captions, UI, or watermarks unless explicitly requested.',
      ].filter(Boolean).join('\n')

      const falResult = await waitForOutputFalImage({
        priorStep: input.priorStep,
        apiKey: falApiKey,
        model,
        prompt: providerPrompt,
        imageSize,
        quality,
        outputFormat,
        referenceImageUrls,
        webhookUrl: resolveFalWebhookUrl(),
        shouldCancel: input.shouldCancel,
        createCancelledError: () => new WorkflowCancelledError(),
        onProgress: async (progress) => {
          await input.onProgress?.({
            provider: 'fal',
            model,
            providerRequestId: progress.providerRequestId,
            metadata: {
              providerMode: progress.providerMode,
              providerStatus: progress.providerStatus,
              lastProviderPollAt: progress.lastProviderPollAt,
              webhookConfigured: progress.webhookConfigured === true,
              providerSubmittedAt: progress.providerSubmittedAt ?? null,
              providerElapsedMs: progress.providerElapsedMs ?? null,
              staleRequestRestarted: progress.staleRequestRestarted === true,
              falRequestId: progress.providerRequestId,
              falStatusUrl: progress.statusUrl ?? null,
              falResponseUrl: progress.responseUrl ?? null,
              imageSize: normalizeImageSize(imageSize),
              quality,
              outputFormat,
              referenceImageCount: referenceImageUrls.length,
            },
          })
        },
        getWebhookResult: async (requestId) => {
          const stepResponse = await input.client
            .from('output_workflow_run_steps')
            .select('id, status, provider_request_id, metadata')
            .eq('run_id', input.run.id)
            .eq('node_key', input.node.key)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (stepResponse.error) throw new Error(stepResponse.error.message)
          const step = asRecord(stepResponse.data)
          if (!Object.keys(step).length) return null
          const stepMetadata = asRecord(step.metadata)
          const currentRequestId = readText(step.provider_request_id) || readText(stepMetadata.falRequestId)
          if (currentRequestId && currentRequestId !== requestId) return null
          return readFalWebhookImageResult(stepMetadata, requestId)
        },
      })
      const imageBytes = await downloadRemoteBytes(falResult.imageUrl)
      const assetKey = `output.${slugify(input.workflow.name)}.${input.run.id.slice(0, 8)}.${slugify(input.node.key)}`
      const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slugify(input.node.key)}.${outputFormat}`
      const mimeType = falResult.mimeType || `image/${outputFormat}`
      await uploadBytes(input.client, storagePath, imageBytes, mimeType)
      const planningOnly = config.planningOnly === true || config.planning_only === true
      const usedAsVideoReference = config.usedAsVideoReference === true || config.used_as_video_reference === true
      const packedReferenceEntities = Array.isArray(assetPack.entities) ? assetPack.entities.map(asRecord) : []
      const selectedReferenceVariants = packedReferenceEntities
        .map((entity) => ({
          entityKey: readText(entity.key),
          entityName: readText(entity.name),
          variantKey: readText(entity.selectedReferenceVariantKey) || 'default',
          label: readText(entity.selectedReferenceVariantLabel) || (readText(entity.selectedReferenceVariantKey) === 'default' ? 'Default' : readText(entity.selectedReferenceVariantKey)),
          summary: readText(entity.selectedReferenceVariantSummary),
          variantType: readText(entity.selectedReferenceVariantType),
          assetKey: readText(entity.primaryAssetKey) || readStringArray(entity.assetKeys)[0] || '',
          selectionReason: readText(entity.referenceSelectionReason),
        }))
        .filter((entry) => entry.entityKey || entry.entityName)
      const selectedReferenceVariantKeys = Object.fromEntries(selectedReferenceVariants
        .filter((entry) => entry.entityKey)
        .map((entry) => [entry.entityKey, entry.variantKey]))
      const selectedReferenceAssetKeys = selectedReferenceVariants.map((entry) => entry.assetKey).filter(Boolean)
      const referenceDiagnostics = [
        ...readStringArray(assetPack.referenceDiagnostics),
        ...packedReferenceEntities.flatMap((entity) => readStringArray(entity.referenceDiagnostics)),
      ].filter(Boolean)
      const imageOutput = {
        assetKey,
        storagePath,
        mimeType,
        width: falResult.width,
        height: falResult.height,
        prompt,
        providerPrompt,
        role,
        planningOnly,
        planning_only: planningOnly,
        usedAsVideoReference,
        used_as_video_reference: usedAsVideoReference,
        takeId: readText(config.takeId) || null,
        takeIndex: Number(config.takeIndex ?? -1) >= 0 ? Number(config.takeIndex) : null,
        storyboardGroupId: readText(config.storyboardGroupId) || readText(asRecord(config.storyboardGroup).id) || null,
        shotId: readText(config.shotId) || null,
        shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
        keyframeIndex: role === 'cinematic_keyframe' ? keyframeIndex : null,
        provider: 'fal',
        model,
        providerRequestId: falResult.requestId,
        providerMode: 'fal_queue',
        providerStatus: 'COMPLETED',
        falRequestId: falResult.requestId,
        falImageUrl: falResult.imageUrl,
        falStatusUrl: falResult.statusUrl,
        falResponseUrl: falResult.responseUrl,
        referenceImageCount: referenceImageUrls.length,
        referenceImageRecords,
        reference_image_records: referenceImageRecords,
        referenceManifest: sequenceAnimaticProviderReferenceManifest,
        reference_manifest: sequenceAnimaticProviderReferenceManifest,
        selectedReferenceVariants,
        selectedReferenceVariantKeys,
        selectedReferenceAssetKeys,
        referenceDiagnostics,
        sourceEntityKeys: input.run.input.sourceEntityKeys ?? [],
        sourceSequenceUnitKeys: input.run.input.sourceSequenceUnitKeys ?? [],
      }
      const metadata = {
        generatedBy: 'output_workflow',
        workflowId: input.workflow.id,
        workflowKey: input.workflow.key,
        runId: input.run.id,
        nodeId: input.node.id,
        nodeKey: input.node.key,
        preset: input.run.preset,
        provider: 'fal',
        model,
        baseModel,
        referenceModel,
        providerRequestId: falResult.requestId,
        providerMode: 'fal_queue',
        providerStatus: 'COMPLETED',
        falRequestId: falResult.requestId,
        falStatusUrl: falResult.statusUrl,
        falResponseUrl: falResult.responseUrl,
        falImageUrl: falResult.imageUrl,
        prompt,
        providerPrompt,
        role,
        purpose,
        planningOnly,
        planning_only: planningOnly,
        usedAsVideoReference,
        used_as_video_reference: usedAsVideoReference,
        takeId: readText(config.takeId) || null,
        takeIndex: Number(config.takeIndex ?? -1) >= 0 ? Number(config.takeIndex) : null,
        storyboardGroupId: readText(config.storyboardGroupId) || readText(asRecord(config.storyboardGroup).id) || null,
        shotId: readText(config.shotId) || null,
        shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
        keyframeIndex: role === 'cinematic_keyframe' ? keyframeIndex : null,
        pageNumber: Number(config.pageNumber ?? 0) || null,
        referenceImageCount: referenceImageUrls.length,
        referenceImageRecords,
        reference_image_records: referenceImageRecords,
        referenceManifest: sequenceAnimaticProviderReferenceManifest,
        reference_manifest: sequenceAnimaticProviderReferenceManifest,
        selectedReferenceVariants,
        selectedReferenceVariantKeys,
        selectedReferenceAssetKeys,
        referenceDiagnostics,
        imageSize: normalizeImageSize(imageSize),
        quality,
        outputFormat,
        byteSize: imageBytes.byteLength,
        width: falResult.width,
        height: falResult.height,
        storageBucket: 'project-assets',
        storagePath,
        sourceEntityKeys: input.run.input.sourceEntityKeys ?? [],
        sourceSequenceUnitKeys: input.run.input.sourceSequenceUnitKeys ?? [],
        skillKeys: guidance.skillKeys,
        skillVersions: guidance.skillVersions,
        guidanceHash: guidance.guidanceHash,
        resolvedGuidancePreview: guidance.resolvedGuidancePreview,
      }
      const artifact = await registerImageArtifact({
        client: input.client,
        run: input.run,
        workflow: input.workflow,
        node: input.node,
        assetKey,
        storagePath,
        name: role === 'ebook_cover' ? `${titleFromContext(worldContextFromRunInput(input.run))} Cover` : input.node.label,
        summary: role === 'ebook_cover'
          ? 'Ebook cover image generated with GPT Image 2 from the world graph.'
          : role === 'comic_atlas' || role === 'cinematic_atlas'
            ? 'Reference atlas generated from selected world entities.'
            : role === 'cinematic_direction_sheet'
              ? 'Primary cinematic direction-sheet reference generated from the compiled take timeline, camera layout, floor map, lighting/mood, and continuity anchors.'
            : role === 'cinematic_beat_sheet'
              ? (usedAsVideoReference
                ? 'Primary cinematic storyboard-grid reference generated from the compiled take timeline.'
                : 'Planning-only cinematic beat sheet generated from the compiled take timeline.')
              : role === 'cinematic_keyframe'
                ? 'Clean cinematic keyframe generated as a Seedance visual reference.'
              : role === 'cinematic_v2_shot_keyframe'
                ? 'Enhanced Cinematics V2 shot keyframe generated from the cropped storyboard panel and shot-scoped references.'
              : purpose === 'sequence_animatic_shot_keyframe_image' || role === 'sequence_animatic_shot_keyframe'
                ? 'Revised sequence-animatic shot keyframe generated from the prior panel and shot-scoped references.'
            : role === 'comic_page'
              ? 'Comic page image generated from comic script and direct entity reference sheets.'
              : 'Generated image output from the workflow.',
        mimeType,
        metadata,
      })
      const outputs = {
        image: imageOutput,
        assetKey,
        storagePath,
        mimeType,
        width: falResult.width,
        height: falResult.height,
        prompt,
        providerPrompt,
        pageNumber: Number(config.pageNumber ?? 0) || null,
        role,
        planningOnly,
        planning_only: planningOnly,
        usedAsVideoReference,
        used_as_video_reference: usedAsVideoReference,
        takeId: readText(config.takeId) || null,
        takeIndex: Number(config.takeIndex ?? -1) >= 0 ? Number(config.takeIndex) : null,
        storyboardGroupId: readText(config.storyboardGroupId) || readText(asRecord(config.storyboardGroup).id) || null,
        shotId: readText(config.shotId) || null,
        shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
        keyframeIndex: role === 'cinematic_keyframe' ? keyframeIndex : null,
        selectedReferenceVariants,
        selectedReferenceVariantKeys,
        selectedReferenceAssetKeys,
        referenceDiagnostics,
        referenceImageRecords,
        reference_image_records: referenceImageRecords,
        referenceManifest: sequenceAnimaticProviderReferenceManifest,
        reference_manifest: sequenceAnimaticProviderReferenceManifest,
        artifact,
        guidance,
      }
      return {
        inputHash: input.inputHash,
        outputHash: hashOutputWorkflowValue(outputs),
        outputs,
        provider: 'fal',
        model,
        providerRequestId: falResult.requestId,
      }
    }

async function executeOutputWorkflowVideoGeneration(input: OutputWorkflowNodeExecutionContext): Promise<OutputWorkflowNodeExecutionResult> {
      const config = asRecord(input.node.config)
      const guidance = resolveGuidanceForExecution({ run: input.run, node: input.node, upstream: input.upstream })
      const upstreamVideoPromptRecord = readVideoPromptRecordFromUpstream(input.upstream)
      const upstreamVideoPrompt = readVideoPromptFromUpstream(input.upstream)
      const prompt = upstreamVideoPrompt
        || readText(input.node.inputs.prompt)
        || input.run.prompt
      if (!prompt) throw new Error('Video generation node is missing a prompt.')
      const priorStepOutputs = asRecord(input.priorStep?.outputs)
      const priorVideoOutput = asRecord(priorStepOutputs.video)
      const cinematicV2ApprovalMissing = isCinematicV2ProductionNode(config, input.node) && !cinematicVideoApprovedEnabled(input.run)
      const priorVideoWasSkipped = priorVideoOutput.skipped === true
        || priorStepOutputs.approvalRequired === true
        || priorStepOutputs.debugSkipVideoGeneration === true
        || readText(priorStepOutputs.skippedReason).length > 0
        || readText(priorVideoOutput.skippedReason).length > 0
      if (!cinematicV2ApprovalMissing && !priorVideoWasSkipped && hasStoredOutputs(priorStepOutputs) && input.priorStep?.outputHash && hasStoredOutputs(priorVideoOutput)) {
        return {
          inputHash: input.priorStep.inputHash || input.inputHash,
          outputHash: input.priorStep.outputHash,
          outputs: priorStepOutputs,
          provider: input.priorStep.provider,
          model: input.priorStep.model,
          providerRequestId: input.priorStep.providerRequestId,
        }
      }
      const resolution = readText(config.resolution) || '720p'
      const provider = resolveOutputVideoProvider(config)
      const configuredModel = readText(config.model)
        || (provider === 'muapi'
          ? Deno.env.get('OUTPUT_WORKFLOW_MUAPI_VIDEO_MODEL')?.trim()
          : Deno.env.get('OUTPUT_WORKFLOW_FAL_VIDEO_MODEL')?.trim())
        || Deno.env.get('OUTPUT_WORKFLOW_VIDEO_MODEL')?.trim()
        || outputWorkflowDefaultVideoModel(provider, resolution)
      const model = provider === 'muapi' ? resolveMuapiVideoModel(configuredModel) : configuredModel
      const upstreamDurationSeconds = Number(upstreamVideoPromptRecord.durationSeconds ?? upstreamVideoPromptRecord.providerDurationSeconds ?? 0)
      const configuredDurationSeconds = Number(config.durationSeconds ?? 8) || 8
      const rawRequestedDurationSeconds = Number(upstreamDurationSeconds || configuredDurationSeconds) || 8
      const requestedDurationSeconds = Math.max(4, Math.min(15, rawRequestedDurationSeconds))
      const durationSeconds = provider === 'muapi'
        ? resolveMuapiVideoDurationSeconds(requestedDurationSeconds)
        : requestedDurationSeconds
      const aspectRatio = readText(config.aspectRatio) || '16:9'
      const quality = provider === 'muapi'
        ? resolveMuapiVideoQuality(readText(config.quality) || Deno.env.get('OUTPUT_WORKFLOW_MUAPI_VIDEO_QUALITY'))
        : readText(config.quality)
      const generateAudio = config.generateAudio !== false
      const syncMode = config.syncMode === true
      if ((readText(config.purpose) === 'cinematic_v3_storyboard_group_video' || readText(config.role) === 'cinematic_v3_storyboard_group_video') && !upstreamVideoPrompt) {
        throw new Error('Cinematics V3 storyboard video generation requires a completed Video Prompt node. Run the block storyboard prep first, then generate video.')
      }
      if (isCinematicV2ProductionNode(config, input.node) && !cinematicVideoApprovedEnabled(input.run)) {
        const outputs = {
          video: {
            skipped: true,
            approvalRequired: true,
            skippedReason: 'cinematic_video_approval_required',
            prompt,
            providerPrompt: prompt,
            provider: 'graphcore',
            model: 'cinematic-v2-video-approval-gate-v1',
            targetProvider: provider,
            targetModel: model,
            durationSeconds,
            aspectRatio,
            resolution,
            generateAudio,
            referenceImageCount: 0,
            referenceVideoCount: 0,
            referenceAudioCount: 0,
            referencePolicy: 'cinematic_video_approval_required',
            role: readText(config.role) || readText(config.purpose) || 'cinematic_v2_shot_video',
            shotId: readText(config.shotId) || null,
            shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
          },
          prompt,
          providerPrompt: prompt,
          durationSeconds,
          approvalRequired: true,
          skippedReason: 'cinematic_video_approval_required',
          guidance,
        }
        return {
          status: 'skipped',
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'cinematic-v2-video-approval-gate-v1',
        }
      }
      const debugSkipVideoGeneration = debugSkipVideoGenerationEnabled(config, input.run, input.node)
      if (debugSkipVideoGeneration) {
        const outputs = {
          video: {
            skipped: true,
            debugSkipVideoGeneration: true,
            skippedReason: 'debug_skip_video_generation',
            prompt,
            providerPrompt: prompt,
            provider: 'graphcore',
            model: 'debug-skip-video-generation-v1',
            targetProvider: provider,
            targetModel: model,
            durationSeconds,
            aspectRatio,
            resolution,
            generateAudio,
            referenceImageCount: 0,
            referenceVideoCount: 0,
            referenceAudioCount: 0,
            referencePolicy: 'debug_skip_video_generation',
            role: readText(config.role) || readText(config.purpose) || 'video',
            blockNumber: Number(config.blockNumber ?? 0) || null,
            shotId: readText(config.shotId) || null,
            shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
          },
          prompt,
          providerPrompt: prompt,
          durationSeconds,
          debugSkipVideoGeneration: true,
          skippedReason: 'debug_skip_video_generation',
          guidance,
        }
        return {
          status: 'skipped',
          inputHash: input.inputHash,
          outputHash: hashOutputWorkflowValue(outputs),
          outputs,
          provider: 'graphcore',
          model: 'debug-skip-video-generation-v1',
        }
      }
      const rawAssetPack = readFirstUpstreamRecord(input.upstream, ['assetPack', 'asset_pack'])
      const isCinematicV3StoryboardGroupVideo = readText(config.purpose) === 'cinematic_v3_storyboard_group_video' || readText(config.role) === 'cinematic_v3_storyboard_group_video'
      const isSequenceAnimaticShotVideo = readText(config.purpose) === 'sequence_animatic_shot_video' || readText(config.role) === 'sequence_animatic_shot_video'
      const upstreamShotPlanForVideo = readFirstUpstreamRecord(input.upstream, ['shotPlan', 'shot_plan'])
      const cinematicV3VideoGroupShots = isCinematicV3StoryboardGroupVideo
        ? cinematicV3StoryboardGroupShots({ shotPlan: upstreamShotPlanForVideo, storyboardGroup: asRecord(config.storyboardGroup) })
        : []
      const upstreamVideoShotPlanShots = asRecord(upstreamShotPlanForVideo).shots
      const sequenceAnimaticShotForVideo = isSequenceAnimaticShotVideo
        ? asRecord(readFirstUpstreamRecord(input.upstream, ['shot']) || (Array.isArray(upstreamVideoShotPlanShots) ? upstreamVideoShotPlanShots.map(asRecord)[0] : null))
        : {}
      const assetPack = isCinematicV3StoryboardGroupVideo && cinematicV3VideoGroupShots.length > 0
        ? buildCinematicV3StoryboardGroupAssetPack({
          assetPack: rawAssetPack,
          shots: cinematicV3VideoGroupShots,
          maxEntityCount: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 4) || 4)),
          maxAssetKeysPerEntity: 1,
        })
        : isSequenceAnimaticShotVideo && Object.keys(sequenceAnimaticShotForVideo).length > 0
          ? buildCinematicV3StoryboardGroupAssetPack({
            assetPack: rawAssetPack,
            shots: [sequenceAnimaticShotForVideo],
            maxEntityCount: Math.max(0, Math.min(8, Number(config.assetPackReferenceLimit ?? 6) || 6)),
            maxAssetKeysPerEntity: 1,
          })
        : rawAssetPack
      const cinematicReferenceMode = normalizeCinematicReferenceMode(config.cinematicReferenceMode)
      const upstreamImages = orderCinematicVideoReferenceImages(
        readUpstreamImages(input.upstream, ['image', 'coverImage', 'primaryReferenceImage', 'keyframe']),
        cinematicReferenceMode,
      )
      const directImageRecords = (await Promise.all(upstreamImages.map(async (image, index) => {
        const url = await imageReferenceToFalUrl(input.client, image, input.run)
        if (!url) return null
        return {
          url,
          label: seedanceImageReferenceLabel(image, cinematicReferenceMode, index + 1),
          role: (() => {
            const role = readText(image.role) || readText(asRecord(image.metadata).role)
            if (role === 'cinematic_v3_storyboard_sheet' || role === 'cinematic_beat_sheet') return 'storyboard_sheet'
            if (role === 'cinematic_direction_sheet') return 'direction_sheet'
            if (role === 'cinematic_keyframe' || role === 'cinematic_v2_shot_keyframe') return 'keyframe'
            return 'image_reference'
          })(),
          modality: 'image' as const,
        }
      }))).filter((entry): entry is SeedanceReferenceRecord => Boolean(entry?.url))
      const assetPackReferenceLimit = Math.max(1, Math.min(9, Number(config.assetPackReferenceLimit ?? 9) || 9))
      const totalReferenceImageLimit = Math.max(1, Math.min(9, directImageRecords.length + assetPackReferenceLimit))
      const assetPackImageRecords = await collectAssetPackReferenceRecords(input.client, input.run, assetPack, assetPackReferenceLimit)
      const seenReferenceImageUrls = new Set<string>()
      const referenceImageRecords = [...directImageRecords, ...assetPackImageRecords]
        .filter((entry) => {
          const url = readText(entry.url)
          if (!url || seenReferenceImageUrls.has(url)) return false
          seenReferenceImageUrls.add(url)
          return true
        })
        .slice(0, totalReferenceImageLimit)
      const referenceImageUrls = referenceImageRecords.map((entry) => readText(entry.url)).filter(Boolean)
      if (isCinematicV3StoryboardGroupVideo && cinematicReferenceMode === 'storyboard_sheet' && directImageRecords.length === 0) {
        throw new Error('Cinematics V3 storyboard video generation requires the storyboard sheet reference. Generate the storyboard sheet before generating video.')
      }
      if (isSequenceAnimaticShotVideo && cinematicReferenceMode === 'keyframes' && directImageRecords.length === 0) {
        throw new Error('Sequence animatic shot video generation requires the cropped shot panel as @Image1. Generate/extract the storyboard panel before generating shot video.')
      }
      if (isCinematicV2ProductionNode(config, input.node) && cinematicReferenceMode === 'keyframes' && directImageRecords.length === 0) {
        throw new Error('Cinematics V2 video generation requires a shot keyframe image as @Image1. Run the shot keyframe node first, then rerun this video node.')
      }
      const upstreamVideos = readUpstreamVideos(input.upstream, ['videoReferences', 'referenceVideos'])
      const referenceVideoRecords = (await Promise.all(upstreamVideos.map(async (video, index) => {
        const url = await imageReferenceToFalUrl(input.client, video, input.run)
        if (!url) return null
        return {
          url,
          label: readText(video.name) || readText(video.title) || readText(video.label) || `reference video ${index + 1}`,
          role: 'video_reference',
          modality: 'video' as const,
        }
      }))).filter((entry): entry is SeedanceReferenceRecord => Boolean(entry?.url)).slice(0, 3)
      const referenceVideoUrls = referenceVideoRecords.map((entry) => readText(entry.url)).filter(Boolean)
      const referenceAudioUrls: string[] = []
      const totalReferences = referenceImageUrls.length + referenceVideoUrls.length + referenceAudioUrls.length
      if (totalReferences > 12) {
        throw new Error('Seedance 2 Omni Reference supports at most 12 total reference files.')
      }
      const buildProviderPrompt = (imageRecords: SeedanceReferenceRecord[], referencePolicy: string) => {
        const manifest = buildSeedanceReferenceManifest({
          imageReferences: imageRecords,
          videoReferences: referenceVideoRecords,
          audioReferences: [],
          cinematicReferenceMode,
        })
        const promptWithLegend = rewriteSeedanceReferenceLegend(prompt, manifest, (isCinematicV3StoryboardGroupVideo || isSequenceAnimaticShotVideo) ? '' : referencePolicy)
        const artifactBan = seedanceProductionBoardArtifactBan(manifest)
        if (isCinematicV3StoryboardGroupVideo || isSequenceAnimaticShotVideo) {
          const directPrompt = promptWithLegend.includes('Do not render production-board artifacts') || promptWithLegend.includes('Do not render captions, subtitles')
            ? promptWithLegend
            : [promptWithLegend, '', artifactBan].filter(Boolean).join('\n')
          return compactSeedancePromptForProvider(directPrompt)
        }
        return compactSeedancePromptForProvider([
          promptWithLegend,
          '',
          `[PROVIDER TARGET]\nOne continuous ${durationSeconds}-second clip, ${aspectRatio}, ${resolution}.`,
          imageRecords.length > 0 ? 'Preserve identity, wardrobe, environment, prop continuity, and selected variants from the attached references.' : 'Preserve identity, wardrobe, environment, and prop continuity from written descriptions.',
          promptWithLegend.includes('Do not render production-board artifacts') || promptWithLegend.includes('Do not render captions, subtitles')
            ? ''
            : artifactBan,
        ].filter(Boolean).join('\n'))
      }
      const primaryReferenceOnlyRecords = directImageRecords.slice(0, 1)
      const referenceAttempts = [
        { policy: cinematicReferenceMode === 'keyframes' ? 'keyframes_and_asset_refs' : 'storyboard_and_asset_refs', imageRecords: referenceImageRecords },
        { policy: cinematicReferenceMode === 'keyframes' ? 'keyframes_only' : 'storyboard_only', imageRecords: primaryReferenceOnlyRecords },
        { policy: 'text_only_no_image_refs', imageRecords: [] },
      ].filter((attempt, index, attempts) => (
        index === attempts.findIndex((candidate) => candidate.policy === attempt.policy
          && candidate.imageRecords.map((entry) => readText(entry.url)).join('\n') === attempt.imageRecords.map((entry) => readText(entry.url)).join('\n'))
      ))
      const priorFailedReferencePolicy = isFalReferencePolicyError(input.priorStep?.errorMessage)
      const startAttemptIndex = priorFailedReferencePolicy && referenceAttempts.length > 1 ? 1 : 0
      let providerResult: {
        requestId: string
        videoUrl: string
        mimeType: string
        fileName?: string
        fileSize: number | null
        resultBody: Record<string, unknown>
        statusUrl?: string | null
        responseUrl?: string | null
        resultUrl?: string | null
      } | null = null
      let providerPrompt = ''
      let usedReferenceImageUrls = referenceImageUrls
      let usedSeedanceReferenceManifest: SeedanceReferenceManifestEntry[] = []
      let referencePolicy = cinematicReferenceMode === 'keyframes' ? 'keyframes_and_asset_refs' : 'storyboard_and_asset_refs'
      for (let attemptIndex = startAttemptIndex; attemptIndex < referenceAttempts.length; attemptIndex += 1) {
        const attempt = referenceAttempts[attemptIndex]
        providerPrompt = buildProviderPrompt(attempt.imageRecords, attempt.policy)
        usedReferenceImageUrls = attempt.imageRecords.map((entry) => readText(entry.url)).filter(Boolean)
        usedSeedanceReferenceManifest = buildSeedanceReferenceManifest({
          imageReferences: attempt.imageRecords,
          videoReferences: referenceVideoRecords,
          audioReferences: [],
          cinematicReferenceMode,
        })
        referencePolicy = attempt.policy
        try {
          if (provider === 'muapi') {
            const muapiApiKey = Deno.env.get('MUAPI_KEY')
            if (!muapiApiKey) throw new Error('MUAPI_KEY is not configured for the output workflow worker.')
            providerResult = await waitForOutputMuapiVideo({
              priorStep: attemptIndex === 0 && !priorFailedReferencePolicy ? input.priorStep : null,
              apiKey: muapiApiKey,
              model,
              prompt: providerPrompt,
              durationSeconds,
              aspectRatio,
              quality,
              referenceImageUrls: usedReferenceImageUrls,
              referenceVideoUrls,
              referenceAudioUrls,
              shouldCancel: input.shouldCancel,
              createCancelledError: () => new WorkflowCancelledError(),
              onProgress: async (progress) => {
                await input.onProgress?.({
                  provider: 'muapi',
                  model,
                  providerRequestId: progress.providerRequestId,
                  metadata: {
                    providerMode: progress.providerMode,
                    providerStatus: progress.providerStatus,
                    lastProviderPollAt: progress.lastProviderPollAt,
                    muapiRequestId: progress.providerRequestId,
                    muapiResultUrl: progress.resultUrl,
                    muapiWebhookConfigured: progress.webhookConfigured ?? false,
                    durationSeconds,
                    requestedDurationSeconds,
                    aspectRatio,
                    quality,
                    resolution,
                    generateAudio,
                    referenceImageCount: usedReferenceImageUrls.length,
                    referenceVideoCount: referenceVideoUrls.length,
                    referenceAudioCount: referenceAudioUrls.length,
                    referencePolicy: attempt.policy,
                    cinematicReferenceMode,
                    seedanceReferenceManifest: usedSeedanceReferenceManifest,
                    providerPayload: buildMuapiVideoPayload({
                      prompt: providerPrompt,
                      durationSeconds,
                      aspectRatio,
                      quality,
                      referenceImageUrls: usedReferenceImageUrls,
                      referenceVideoUrls,
                      referenceAudioUrls,
                    }),
                  },
                })
              },
            })
          } else {
            const falApiKey = Deno.env.get('FAL_KEY')
            if (!falApiKey) throw new Error('FAL_KEY is not configured for the output workflow worker.')
            providerResult = await waitForOutputFalVideo({
              priorStep: attemptIndex === 0 && !priorFailedReferencePolicy ? input.priorStep : null,
              apiKey: falApiKey,
              model,
              prompt: providerPrompt,
              durationSeconds,
              aspectRatio,
              resolution,
              generateAudio,
              syncMode,
              referenceImageUrls: usedReferenceImageUrls,
              referenceVideoUrls,
              referenceAudioUrls,
              shouldCancel: input.shouldCancel,
              createCancelledError: () => new WorkflowCancelledError(),
              onProgress: async (progress) => {
                await input.onProgress?.({
                  provider: 'fal',
                  model,
                  providerRequestId: progress.providerRequestId,
                  metadata: {
                    providerMode: progress.providerMode,
                    providerStatus: progress.providerStatus,
                    lastProviderPollAt: progress.lastProviderPollAt,
                    falRequestId: progress.providerRequestId,
                    falStatusUrl: progress.statusUrl ?? null,
                    falResponseUrl: progress.responseUrl ?? null,
                    durationSeconds,
                    aspectRatio,
                    resolution,
                    generateAudio,
                    referenceImageCount: usedReferenceImageUrls.length,
                    referenceVideoCount: referenceVideoUrls.length,
                    referenceAudioCount: referenceAudioUrls.length,
                    referencePolicy: attempt.policy,
                    cinematicReferenceMode,
                    seedanceReferenceManifest: usedSeedanceReferenceManifest,
                  },
                })
              },
            })
          }
          break
        } catch (error) {
          if (isFalReferencePolicyError(error) && attemptIndex < referenceAttempts.length - 1) {
            continue
          }
          throw error
        }
      }
      if (!providerResult) throw new Error(`${provider === 'muapi' ? 'MUAPI' : 'Fal'} video generation did not return a result.`)
      const muapiWebhookConfigured = provider === 'muapi' ? Boolean(buildOutputWorkflowMuapiWebhookUrl()) : false
      const muapiProviderMode = muapiWebhookConfigured ? 'muapi_webhook_polling' : 'muapi_polling'
      const videoBytes = await downloadRemoteBytes(providerResult.videoUrl)
      const extension = providerResult.mimeType.includes('webm') ? 'webm' : 'mp4'
      const assetKey = `output.${slugify(input.workflow.name)}.${input.run.id.slice(0, 8)}.${slugify(input.node.key)}`
      const storagePath = `generated/output-workflows/${input.run.projectId}/${input.run.id}/${slugify(input.node.key)}.${extension}`
      await uploadBytes(input.client, storagePath, videoBytes, providerResult.mimeType)
      const metadata = {
        generatedBy: 'output_workflow',
        workflowId: input.workflow.id,
        workflowKey: input.workflow.key,
        runId: input.run.id,
        nodeId: input.node.id,
        nodeKey: input.node.key,
        preset: input.run.preset,
        provider,
        model,
        providerRequestId: providerResult.requestId,
        providerMode: provider === 'muapi' ? muapiProviderMode : 'fal_queue',
        providerStatus: 'COMPLETED',
        falRequestId: provider === 'fal' ? providerResult.requestId : null,
        falStatusUrl: provider === 'fal' ? providerResult.statusUrl ?? null : null,
        falResponseUrl: provider === 'fal' ? providerResult.responseUrl ?? null : null,
        falVideoUrl: provider === 'fal' ? providerResult.videoUrl : null,
        muapiRequestId: provider === 'muapi' ? providerResult.requestId : null,
        muapiResultUrl: provider === 'muapi' ? providerResult.resultUrl ?? null : null,
        muapiVideoUrl: provider === 'muapi' ? providerResult.videoUrl : null,
        muapiWebhookConfigured,
        prompt,
        providerPrompt,
        durationSeconds,
        requestedDurationSeconds,
        aspectRatio,
        quality: provider === 'muapi' ? quality : null,
        resolution,
        generateAudio,
        referenceImageCount: usedReferenceImageUrls.length,
        referenceVideoCount: referenceVideoUrls.length,
        referenceAudioCount: referenceAudioUrls.length,
        referencePolicy,
        cinematicReferenceMode,
        seedanceReferenceManifest: usedSeedanceReferenceManifest,
        shotId: readText(config.shotId) || null,
        shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
        storyboardBlockId: readText(config.storyboardBlockId) || null,
        parentRequestId: readText(config.parentRequestId) || null,
        masterRequestId: readText(config.masterRequestId) || null,
        sequenceAnimaticRole: readText(config.sequenceAnimaticRole) || null,
        providerPayload: provider === 'muapi' ? buildMuapiVideoPayload({
          prompt: providerPrompt,
          durationSeconds,
          aspectRatio,
          quality,
          referenceImageUrls: usedReferenceImageUrls,
          referenceVideoUrls,
          referenceAudioUrls,
        }) : null,
        byteSize: videoBytes.byteLength,
        storageBucket: 'project-assets',
        storagePath,
        skillKeys: guidance.skillKeys,
        skillVersions: guidance.skillVersions,
        guidanceHash: guidance.guidanceHash,
      }
      const artifact = await registerVideoArtifact({
        client: input.client,
        run: input.run,
        workflow: input.workflow,
        node: input.node,
        assetKey,
        storagePath,
        name: input.node.label,
        summary: 'Generated video output from the workflow.',
        mimeType: providerResult.mimeType,
        metadata,
      })
      const outputs = {
        video: {
          assetKey,
          storagePath,
          mimeType: providerResult.mimeType,
          prompt,
          providerPrompt,
          provider,
          model,
          providerRequestId: providerResult.requestId,
          providerMode: provider === 'muapi' ? muapiProviderMode : 'fal_queue',
          durationSeconds,
          requestedDurationSeconds,
          aspectRatio,
          quality: provider === 'muapi' ? quality : null,
          resolution,
          generateAudio,
          referenceImageCount: usedReferenceImageUrls.length,
          referenceVideoCount: referenceVideoUrls.length,
          referenceAudioCount: referenceAudioUrls.length,
          referencePolicy,
          cinematicReferenceMode,
          seedanceReferenceManifest: usedSeedanceReferenceManifest,
          muapiRequestId: provider === 'muapi' ? providerResult.requestId : null,
          muapiResultUrl: provider === 'muapi' ? providerResult.resultUrl ?? null : null,
          muapiWebhookConfigured,
          role: readText(config.role) || readText(config.purpose) || 'video',
          blockNumber: Number(config.blockNumber ?? 0) || null,
          shotId: readText(config.shotId) || null,
          shotIndex: Number(config.shotIndex ?? -1) >= 0 ? Number(config.shotIndex) : null,
          storyboardBlockId: readText(config.storyboardBlockId) || null,
          parentRequestId: readText(config.parentRequestId) || null,
          masterRequestId: readText(config.masterRequestId) || null,
          sequenceAnimaticRole: readText(config.sequenceAnimaticRole) || null,
        },
        assetKey,
        storagePath,
        mimeType: providerResult.mimeType,
        prompt,
        providerPrompt,
        durationSeconds,
        requestedDurationSeconds,
        seedanceReferenceManifest: usedSeedanceReferenceManifest,
        artifact,
        guidance,
      }
      return {
        inputHash: input.inputHash,
        outputHash: hashOutputWorkflowValue(outputs),
        outputs,
        provider,
        model,
        providerRequestId: providerResult.requestId,
      }
    }

const outputWorkflowNodeHandlerRegistry = createWorkflowNodeHandlerRegistry<OutputWorkflowNodeExecutionContext, OutputWorkflowNodeExecutionResult>()
let defaultOutputWorkflowNodeHandlersRegistered = false

function assertNoImplicitMonolithWorkflowNodeHandlers() {
  const explicitlyRegisteredHandlerKeys = new Set([
    ...legacyMonolithWorkflowNodeHandlerKeys,
    ...cinematicTextWorkflowNodeHandlerKeys,
    ...cinematicAuthoringWorkflowNodeHandlerKeys,
    ...cinematicPlanningWorkflowNodeHandlerKeys,
    ...cinematicReferenceWorkflowNodeHandlerKeys,
    ...cinematicParseWorkflowNodeHandlerKeys,
    ...cinematicFanoutWorkflowNodeHandlerKeys,
    ...workflowMediaNodeHandlerKeys,
    ...imagePromptWorkflowNodeHandlerKeys,
    ...comicWorkflowNodeHandlerKeys,
    ...documentWorkflowNodeHandlerKeys,
    ...workflowUtilityNodeHandlerKeys,
    ...sceneBoardWorkflowNodeHandlerKeys,
    ...sequenceAnimaticPlanningWorkflowNodeHandlerKeys,
    ...sequenceAnimaticSceneLifecycleWorkflowNodeHandlerKeys,
    ...sequenceAnimaticArtifactWorkflowNodeHandlerKeys,
    ...sequenceAnimaticCoverageWorkflowNodeHandlerKeys,
    ...sequenceAnimaticContinuityAnchorWorkflowNodeHandlerKeys,
    ...sequenceAnimaticContinuityAssetWorkflowNodeHandlerKeys,
    ...sequenceAnimaticContinuityGraphWorkflowNodeHandlerKeys,
    ...sequenceAnimaticShotReferenceWorkflowNodeHandlerKeys,
    ...sequenceAnimaticShotProductionWorkflowNodeHandlerKeys,
    ...sequenceAnimaticShotRevisionWorkflowNodeHandlerKeys,
  ])
  const implicit = outputWorkflowNodeManifests
    .filter((manifest) => manifest.executable)
    .filter((manifest) => !explicitlyRegisteredHandlerKeys.has(manifest.handlerKey))
    .map((manifest) => `${manifest.purpose} -> ${manifest.handlerKey}`)
    .sort()
  if (implicit.length > 0) {
    throw new Error(`Workflow node manifest(s) need an explicit node pack handler or legacy monolith registration: ${implicit.join(', ')}`)
  }
}

function ensureDefaultOutputWorkflowNodeHandlersRegistered() {
  if (defaultOutputWorkflowNodeHandlersRegistered) return
  assertNoImplicitMonolithWorkflowNodeHandlers()
  const mediaRuntime = createWorkflowMediaRuntime({
    executeImageGeneration: (context) => executeOutputWorkflowImageGeneration(context as never) as never,
    executeVideoGeneration: (context) => executeOutputWorkflowVideoGeneration(context as never) as never,
  })
  for (const handlerKey of legacyMonolithWorkflowNodeHandlerKeys) {
    registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, executeNode, { replace: true })
  }
  registerWorkflowUtilityNodePack({
    helpers: {
      asRecord,
      readText,
      readStringArray,
      hashOutputWorkflowValue,
    },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerCinematicTextWorkflowNodePack({
    helpers: {
      asRecord,
      readText,
      readStringArray,
      readFirstUpstreamRecord,
      readFirstUpstreamArray,
      readUpstreamImages,
      readUpstreamGuidanceBundle,
      worldContextFromRunInput: (run) => worldContextFromRunInput(run as never),
      resolveGuidanceForExecution: (context) => resolveGuidanceForExecution(context as never) as never,
      guidanceMarkdown: (bundle) => guidanceMarkdown(bundle as never),
      compactForPrompt,
      slugify,
      titleFromRefLike,
      hashOutputWorkflowValue,
      buildTakeBlockScriptFromCompiledSequence: (input) => buildTakeBlockScriptFromCompiledSequence(input as never) as never,
      normalizeCinematicReferenceMode,
      resolveCinematicStoryboardStylePolicy: (config, run) => resolveCinematicStoryboardStylePolicy(config as never, run as never),
      buildCinematicBeatSheetPrompt: (input) => buildCinematicBeatSheetPrompt(input as never),
      buildCinematicDirectionSheetPrompt: (input) => buildCinematicDirectionSheetPrompt(input as never),
      buildCinematicKeyframePromptPack: (input) => buildCinematicKeyframePromptPack(input as never) as never,
      keyframeImageSizeForAspectRatio,
      orderCinematicVideoReferenceImages: (images, cinematicReferenceMode) => orderCinematicVideoReferenceImages(images as never, cinematicReferenceMode),
      buildCinematicVideoPrompt: (input) => buildCinematicVideoPrompt(input as never),
      inferCinematicTargetVideoStyle: (input) => inferCinematicTargetVideoStyle(input as never),
      buildFallbackCinematicV2ScreenplayDraft: (input) => buildFallbackCinematicV2ScreenplayDraft(input as never) as never,
      buildSelectedSequenceUnitScreenplayBrief: (context) => buildSelectedSequenceUnitScreenplayBrief(context as never),
      runCinematicV2ScreenplayAuthor: (input) => runCinematicV2ScreenplayAuthor(input as never) as never,
      runCinematicSimpleTextPrompt: (input) => runCinematicSimpleTextPrompt(input as never),
      runCinematicStructuredJson: async (nodeInput) => {
        const policy = resolveOutputTextModelPolicy(nodeInput.taskClass as never)
        const response = await runOpenAiResponses({
          model: policy.model,
          reasoning: reasoningPayloadFor(policy),
          instructions: nodeInput.instructions,
          input: nodeInput.prompt,
          text: {
            format: {
              type: 'json_schema',
              name: nodeInput.schemaName,
              schema: nodeInput.schema,
              strict: true,
            },
          },
          maxOutputTokens: nodeInput.maxOutputTokens,
          metadata: {
            graphcore_task: nodeInput.task,
            graphcore_node_key: nodeInput.nodeKey,
          },
          timeoutMs: nodeInput.timeoutMs,
        })
        return {
          responseOk: response.response.ok,
          outputText: response.outputText,
          body: response.body,
          status: String(response.response.status ?? ''),
          model: policy.model,
          providerRequestId: readText(asRecord(response.body).id) || response.response.headers.get('x-request-id') || null,
        }
      },
      parseJsonObject: (text) => parseJsonObject(text) as never,
    },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerCinematicAuthoringWorkflowNodePack({
    helpers: {
      asRecord,
      readText,
      readFirstUpstreamRecord: (upstream, fields) => readFirstUpstreamRecord(upstream as never, fields) as never,
      readFirstUpstreamArray: (upstream, fields) => readFirstUpstreamArray(upstream as never, fields) as never,
      readFirstUpstreamImage: (upstream, fields) => readFirstUpstreamImage(upstream as never, fields) as never,
      slugify,
      hashOutputWorkflowValue,
      downloadProjectAssetBytes: (client, storagePath) => downloadProjectAssetBytes(client as never, storagePath),
      downloadRemoteBytes,
      uploadBytes: (client, storagePath, bytes, mimeType) => uploadBytes(client as never, storagePath, bytes, mimeType),
      runFfmpeg,
      probeImageSize,
      stitchVideoBytes: (input) => stitchVideoBytes(input as never) as never,
      registerImageArtifact: (input) => registerImageArtifact(input as never),
      registerVideoArtifact: (input) => registerVideoArtifact(input as never),
      registerOtherArtifact: (input) => registerOtherOutputArtifact(input as never),
    },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerCinematicPlanningWorkflowNodePack({
    helpers: {
      asRecord,
      readText,
      readStringArray,
      readFirstUpstreamRecord: (upstream, fields) => readFirstUpstreamRecord(upstream as never, fields),
      guidanceMarkdown: (bundle) => guidanceMarkdown(bundle as never),
      compactForPrompt,
      hashOutputWorkflowValue,
      buildFallbackCinematicV2SceneState: (input) => buildFallbackCinematicV2SceneState(input as never) as never,
      buildFallbackCinematicV2LayoutPlan: (input) => buildFallbackCinematicV2LayoutPlan(input as never) as never,
      buildFallbackCinematicV2ShotPlan: (input) => buildFallbackCinematicV2ShotPlan(input as never) as never,
      runStructuredNode: (input) => runCinematicV2StructuredNode({
        nodeKey: input.nodeKey,
        schemaName: input.schemaName,
        schema: input.schema as never,
        instructions: input.instructions,
        prompt: input.prompt,
        fallback: input.fallback,
        maxOutputTokens: input.maxOutputTokens,
      }) as never,
      providerSafeCinematicV2DurationSeconds,
      validateCinematicV2ShotPlanReferences: (input) => validateCinematicV2ShotPlanReferences(input as never),
      cinematicV2ReferenceIds: (assetPack, context) => cinematicV2ReferenceIds(assetPack as never, context as never),
    },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerSceneBoardWorkflowNodePack({
    helpers: {
      asRecord,
      readText,
      readArray,
      readStringArray,
      readFirstUpstreamRecord,
      readPreferredUpstreamRecord,
      readFirstUpstreamArray,
      readFirstUpstreamText,
      readFirstUpstreamImage,
      slugify,
      titleFromRefLike,
      hashOutputWorkflowValue,
      sanitizeSequenceAnimaticCameraPlateText,
      sanitizeSequenceAnimaticSpatialPromptText,
      sequenceAnimaticSpatialForbiddenNamesFromShots,
      sequenceAnimaticCompactZoneGridCellLine,
      sequenceAnimaticZoneGridPromptDiagnostics,
      sequenceAnimaticReferenceManifestEntries,
      sequenceAnimaticReferenceManifestText,
      registerOtherOutputArtifact: registerOtherOutputArtifact as never,
      registerImageArtifact: registerImageArtifact as never,
      insertSequenceAnimaticEvent: insertSequenceAnimaticEvent as never,
      downloadProjectAssetBytes: downloadProjectAssetBytes as never,
      makeTempDir: (prefix: string) => Deno.makeTempDir({ prefix }),
      writeFile: (path: string, bytes: Uint8Array) => Deno.writeFile(path, bytes),
      readFile: (path: string) => Deno.readFile(path),
      removeDir: (path: string) => Deno.remove(path, { recursive: true }).catch(() => {}),
      probeImageSize,
      runFfmpeg,
      verifySequenceAnimaticAnchorCrop,
      uploadBytes: uploadBytes as never,
      runStructuredNode: runCinematicV2StructuredNode,
    },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerCinematicReferenceWorkflowNodePack({
    helpers: {
      asRecord,
      readText,
      readFirstUpstreamRecord: (upstream, fields) => readFirstUpstreamRecord(upstream as never, fields),
      resolveGuidanceForExecution: (context) => resolveGuidanceForExecution(context as never) as never,
      guidanceMarkdown: (bundle) => guidanceMarkdown(bundle as never),
      compactForPrompt,
      hashOutputWorkflowValue,
      buildDeterministicCinematicAssetPack: (context) => buildDeterministicCinematicAssetPack(context as never) as never,
      buildFallbackCinematicV2ReferencePlan: (assetPack, maxReferenceCount) => buildFallbackCinematicV2ReferencePlan(assetPack as never, maxReferenceCount),
      runCinematicV2ReferenceSelector: (input) => runCinematicV2StructuredNode({
        nodeKey: input.nodeKey,
        schemaName: input.schemaName,
        schema: cinematicV2ReferencePlanSchema,
        instructions: input.instructions,
        prompt: input.prompt,
        fallback: input.fallback,
        maxOutputTokens: input.maxOutputTokens,
      }) as never,
      sanitizeCinematicV2ReferencePlan: (plan, assetPack, maxReferenceCount) => sanitizeCinematicV2ReferencePlan(plan, assetPack as never, maxReferenceCount) as never,
      strengthenCinematicReferencePlanWithVariantMatches: (plan, assetPack, prompt, maxReferenceCount) => strengthenCinematicReferencePlanWithVariantMatches(plan, assetPack as never, prompt, maxReferenceCount) as never,
      referencePlanKeys,
      filterCinematicAssetPack: (assetPack, selectedKeys, maxEntityCount, maxAssetKeysPerEntity) => filterCinematicAssetPack(assetPack as never, selectedKeys, maxEntityCount, maxAssetKeysPerEntity) as never,
      cinematicAssetPackEntityKeys: (assetPack) => cinematicAssetPackEntityKeys(assetPack as never),
    },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerCinematicParseWorkflowNodePack({
    helpers: {
      asRecord,
      readText,
      readFirstUpstreamRecord: (upstream, fields) => readFirstUpstreamRecord(upstream as never, fields),
      guidanceMarkdown: (bundle) => guidanceMarkdown(bundle as never),
      compactForPrompt,
      hashOutputWorkflowValue,
      buildFallbackCinematicV2ParsedScript: (input) => buildFallbackCinematicV2ParsedScript(input as never) as never,
      buildFallbackCinematicV2SceneState: (input) => buildFallbackCinematicV2SceneState(input as never) as never,
      buildFallbackCinematicV2ShotPlan: (input) => buildFallbackCinematicV2ShotPlan(input as never) as never,
      buildCinematicV3ShotPlanFromVisualScript: (input) => buildCinematicV3ShotPlanFromVisualScript(input as never) as never,
      deriveCinematicV2MaxShotCount,
      runCinematicV2ScriptParse: (input) => runCinematicV2StructuredNode({
        nodeKey: input.nodeKey,
        schemaName: input.schemaName,
        schema: cinematicV2ParsedScriptSchema,
        instructions: input.instructions,
        prompt: input.prompt,
        fallback: input.fallback,
        maxOutputTokens: input.maxOutputTokens,
      }) as never,
      runCinematicV3ShotParseGroup: (input) => runCinematicV2StructuredNodeBackground({
        nodeKey: input.nodeKey,
        schemaName: input.schemaName,
        schema: cinematicV2ShotPlanSchema,
        instructions: input.instructions,
        prompt: input.prompt,
        fallback: input.fallback,
        maxOutputTokens: input.maxOutputTokens,
        priorProviderRequestId: input.priorProviderRequestId,
        shouldCancel: input.shouldCancel,
        onProgress: input.onProgress,
      }) as never,
      providerSafeCinematicV2DurationSeconds,
      repairCinematicV2ShotPlanVisualReferences: (input) => repairCinematicV2ShotPlanVisualReferences(input as never) as never,
      validateCinematicV2ShotPlanReferences: (input) => validateCinematicV2ShotPlanReferences(input as never),
      cinematicV2ReferenceIds: (assetPack, context) => cinematicV2ReferenceIds(assetPack as never, context as never),
    },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerCinematicFanoutWorkflowNodePack({
    helpers: {
      asRecord,
      readText,
      readFirstUpstreamRecord: (upstream, fields) => readFirstUpstreamRecord(upstream as never, fields),
      readUpstreamGuidanceBundle: (upstream) => readUpstreamGuidanceBundle(upstream as never),
      hashOutputWorkflowValue,
      compileCinematicScriptDocForOutput: (input) => compileCinematicScriptDocForOutput(input as never) as never,
      materializeDynamicCinematicV2ShotFanout: (input) => materializeDynamicCinematicV2ShotFanout(input as never) as never,
      materializeDynamicCinematicTakeFanout: (input) => materializeDynamicCinematicTakeFanout(input as never) as never,
      materializeDynamicCinematicV3StoryboardFanout: (input) => materializeDynamicCinematicV3StoryboardFanout(input as never) as never,
      materializeDynamicCinematicV3ShotParseFanout: (input) => materializeDynamicCinematicV3ShotParseFanout(input as never) as never,
    },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerWorkflowMediaNodePack({
    runtime: mediaRuntime,
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerImagePromptWorkflowNodePack({
    helpers: {
      asRecord,
      readText,
      readStringArray,
      readFirstUpstreamRecord: (upstream, fields) => readFirstUpstreamRecord(upstream as never, fields),
      titleFromContext: (context) => titleFromContext(context as never),
      resolveGuidanceForExecution: (context) => resolveGuidanceForExecution(context as never),
      hashOutputWorkflowValue,
    },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerDocumentWorkflowNodePack({
    helpers: {
      asRecord,
      readText,
      readFirstUpstreamArray: (upstream, fields) => readFirstUpstreamArray(upstream as never, fields),
      readFirstUpstreamText: (upstream, fields) => readFirstUpstreamText(upstream as never, fields),
      readFirstUpstreamImage: (upstream, fields) => readFirstUpstreamImage(upstream as never, fields),
      readUpstreamGuidanceBundle: (upstream) => readUpstreamGuidanceBundle(upstream as never),
      resolveGuidanceForExecution: (context) => resolveGuidanceForExecution(context as never) as never,
      worldContextFromRunInput: (run) => worldContextFromRunInput(run as never),
      titleFromContext: (context) => titleFromContext(context as never),
      outlineFromContext: (context) => outlineFromContext(context as never) as never,
      buildChapterPlan: (context, outline) => buildChapterPlan(context as never, outline as never) as never,
      buildBibleSectionPlan: (config, context) => buildBibleSectionPlan(config as never, context as never) as never,
      buildBibleSectionInstruction: (input) => buildBibleSectionInstruction(input as never),
      configuredBibleSections: (config) => configuredBibleSections(config as never),
      assembleBibleMarkdown: (input) => assembleBibleMarkdown(input as never),
      buildChapterProsePrompt: (input) => buildChapterProsePrompt(input as never),
      buildEbookCoverPromptInstruction: (input) => buildEbookCoverPromptInstruction(input as never),
      addFrontBackMatter: (context, markdown) => addFrontBackMatter(context as never, markdown),
      editMarkdown,
      assembleChapterMarkdown: (upstream) => assembleChapterMarkdown(upstream as never),
      generateBackgroundMarkdown: (input) => generateBackgroundMarkdown(input as never) as never,
      runOpenAiResponses: (input) => runOpenAiResponses(input as never) as never,
      outputWorkflowTextModel,
      openAiErrorMessage: (response, fallback) => openAiErrorMessage(response as never, fallback),
      registerDocumentArtifact: (input) => registerDocumentArtifact(input as never) as never,
      slugify,
      hashOutputWorkflowValue,
    },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerComicWorkflowNodePack({
    helpers: {
      asRecord,
      readText,
      readStringArray,
      readFirstUpstreamRecord: (upstream, fields) => readFirstUpstreamRecord(upstream as never, fields),
      readFirstUpstreamText: (upstream, fields) => readFirstUpstreamText(upstream as never, fields),
      readUpstreamGuidanceBundle: (upstream) => readUpstreamGuidanceBundle(upstream as never),
      resolveGuidanceForExecution: (context) => resolveGuidanceForExecution(context as never) as never,
      worldContextFromRunInput: (run) => worldContextFromRunInput(run as never),
      titleFromContext: (context) => titleFromContext(context as never),
      buildDeterministicComicAssetPack: (context) => buildDeterministicComicAssetPack(context as never) as never,
      mergeComicSelectedEntitiesWithFallback: (selected, fallbackPack) => mergeComicSelectedEntitiesWithFallback(selected as never, fallbackPack as never) as never,
      buildComicEntitySelectorInstruction: (input) => buildComicEntitySelectorInstruction(input as never),
      buildComicSceneScriptInstruction: (input) => buildComicSceneScriptInstruction(input as never),
      buildComicPagePlanInstruction: (input) => buildComicPagePlanInstruction(input as never),
      buildComicScriptInstruction: (input) => buildComicScriptInstruction(input as never),
      buildComicScriptRepairInstruction: (input) => buildComicScriptRepairInstruction(input as never),
      runOpenAiResponses: (input) => runOpenAiResponses(input as never) as never,
      outputWorkflowTextModel,
      outputWorkflowComicTextModel,
      openAiErrorMessage: (response, fallback) => openAiErrorMessage(response as never, fallback),
      parseJsonObject: (text) => parseJsonObject(text) as never,
      comicSceneScriptJsonSchema: comicSceneScriptJsonSchema as never,
      comicPagePlanJsonSchema: comicPagePlanJsonSchema as never,
      comicScriptJsonSchema: comicScriptJsonSchema as never,
      comicSceneScriptMarkdown: (sceneScript) => comicSceneScriptMarkdown(sceneScript as never),
      comicPagePlanMarkdown: (pagePlan) => comicPagePlanMarkdown(pagePlan as never),
      validateComicPagePlan: (pagePlan, input) => validateComicPagePlan(pagePlan as never, input),
      normalizeComicScript: (raw, input) => normalizeComicScript(raw as never, input as never) as never,
      validateComicScript: (script, input) => validateComicScript(script as never, input),
      comicScriptMarkdown: (script) => comicScriptMarkdown(script as never),
      comicScriptPage: (script, pageNumber) => comicScriptPage(script as never, pageNumber) as never,
      buildDeterministicComicPageImagePrompt: (input) => buildDeterministicComicPageImagePrompt(input as never),
      filterComicAssetPackForPage: (assetPack, page, limit) => filterComicAssetPackForPage(assetPack as never, page as never, limit) as never,
      collectComicPageImages: (upstream) => collectComicPageImages(upstream as never) as never,
      registerComicArtifact: (input) => registerComicArtifact(input as never) as never,
      slugify,
      hashOutputWorkflowValue,
    },
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  const sequenceAnimaticNodePackHelpers: SequenceAnimaticWorkflowNodePackHelpers = {
      asRecord,
      readText,
      readArray,
      readStringArray,
      readFirstUpstreamRecord,
      readPreferredUpstreamRecord,
      readFirstUpstreamArray,
      readFirstUpstreamText,
      readFirstUpstreamImage,
      slugify,
      titleFromRefLike,
      hashOutputWorkflowValue,
      sequenceAnimaticShotRefs,
      sequenceAnimaticShotBindingFromSceneBinding,
      coverageAnchorMode: SEQUENCE_ANIMATIC_COVERAGE_ANCHOR_MODE,
      compactStoryboardSentence,
      compactForPrompt,
      compactSequenceAnimaticText,
      outputWorkflowTextModel,
      outputWorkflowContinuityPlannerTimeoutMs,
      loadWorkflowNodes: async (input) => {
        const response = await input.client
          .from('output_workflow_nodes')
          .select(outputWorkflowNodeSelect)
          .eq('workflow_id', input.workflowId)
        if (response.error) throw new Error(response.error.message)
        return (response.data ?? []) as never
      },
      loadWorkflowRunSteps: async (input) => {
        const response = await input.client
          .from('output_workflow_run_steps')
          .select(outputWorkflowRunStepSelect)
          .eq('run_id', input.runId)
          .eq('workflow_id', input.workflowId)
        if (response.error) throw new Error(response.error.message)
        return (response.data ?? []) as never
      },
      loadWorkflowEdges: async (input) => {
        const response = await input.client
          .from('output_workflow_edges')
          .select(outputWorkflowEdgeSelect)
          .eq('workflow_id', input.workflowId)
        if (response.error) throw new Error(response.error.message)
        return (response.data ?? []) as never
      },
      hasStoredOutputs,
      isStaleDynamicCinematicNode: isStaleDynamicCinematicNode as never,
      preserveExistingDynamicNodeOutput: (input) => preserveExistingDynamicNodeOutput(input as never) as never,
      dynamicNodeRow: (input) => dynamicNodeRow(input as never) as never,
      dynamicEdgeRow: (input) => dynamicEdgeRow(input as never) as never,
      persistDynamicWorkflowGraphRevision: persistDynamicWorkflowGraphRevision as never,
      runSequenceAnimaticSceneGraphAssignmentProvider: async (input) => {
        const result = await runCinematicV2StructuredNodeBackground({
          nodeKey: input.nodeKey,
          schemaName: 'sequence_animatic_scene_graph_assignment',
          schema: sequenceAnimaticSceneGraphAssignmentSchema,
          instructions: input.instructions,
          prompt: input.prompt,
          fallback: input.fallback,
          maxOutputTokens: input.maxOutputTokens,
          shouldCancel: input.shouldCancel,
          onProgress: input.onProgress,
        })
        return {
          value: result.value as never,
          providerRequestId: result.providerRequestId,
          fallbackUsed: result.fallbackUsed,
          fallbackReason: result.fallbackReason,
        }
      },
      insertSequenceAnimaticEvent: insertSequenceAnimaticEvent as never,
      runSequenceAnimaticShotContinuityPlanStreamWithRetry: (input) => runSequenceAnimaticShotContinuityPlanStreamWithRetryRuntime(input as never, {
        asRecord,
        readText,
        compactSequenceAnimaticText,
        compactSchemaDiagnostics,
        sequenceAnimaticUniqueTexts,
        outputWorkflowTextModel,
        outputWorkflowChapterTimeoutMs,
        outputWorkflowShotContinuityStreamAttempts,
        resolveOutputTextModelPolicy: (taskClass) => resolveOutputTextModelPolicy(taskClass as never),
        reasoningPayloadFor,
        openAiErrorMessage: (response, fallback) => openAiErrorMessage(response as never, fallback),
        parseSequenceAnimaticStreamRecord: (recordText) => parseSequenceAnimaticStreamRecord(recordText) as never,
        createSequenceAnimaticShotContinuityStreamAccumulator,
        applySequenceAnimaticShotContinuityStreamRecord: (accumulator, record) => applySequenceAnimaticShotContinuityStreamRecord(accumulator as never, record as never),
        finalizeSequenceAnimaticShotContinuityStreamPlan: (accumulator) => finalizeSequenceAnimaticShotContinuityStreamPlan(accumulator as never) as never,
        isOpenAiTruncationError,
        isRetryableOpenAiStreamError,
        retryDelayMs,
        sleep,
        createCancelledError: () => new WorkflowCancelledError(),
        insertSequenceAnimaticEvent: insertSequenceAnimaticEvent as never,
      }) as never,
      sequenceAnimaticShotContinuityPolicy: {
        maxShotCount: sequenceAnimaticShotContinuityMaxShotCount,
        maxDurationSeconds: sequenceAnimaticShotContinuityMaxDurationSeconds,
        preferredDurationSeconds: sequenceAnimaticShotContinuityPreferredDurationSeconds,
        maxDialogueLines: sequenceAnimaticShotContinuityMaxDialogueLines,
        maxDialogueCharacters: sequenceAnimaticShotContinuityMaxDialogueCharacters,
      },
      readScreenplayAnimaticRoleFromMetadata,
      readScreenplayAnimaticSourceFromMetadata,
      loadMasterRequestForWorkflow: async (input) => {
        const client = input.client as DatabaseClient
        const response = await client
          .from('output_requests')
          .select(outputRequestSelect)
          .eq('draft_id', input.draftId)
          .eq('workflow_id', input.workflowId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (response.error) throw new Error(response.error.message)
        return response.data ? mapOutputRequestRow(response.data as OutputRequestRow) as never : null
      },
      loadChildRequests: async (input) => {
        const client = input.client as DatabaseClient
        const response = await client
          .from('output_requests')
          .select(outputRequestSelect)
          .eq('project_id', input.projectId)
          .eq('draft_id', input.draftId)
          .eq('parent_request_id', input.parentRequestId)
          .order('created_at', { ascending: true })
        if (response.error) throw new Error(response.error.message)
        return (response.data ?? []).map((row) => mapOutputRequestRow(row as OutputRequestRow)) as never
      },
      buildSequenceAnimaticTemplateGraph: (input) => buildValidatedOutputWorkflowTemplateGraph({
        registry: sequenceAnimaticCommandWorkflowTemplateRegistry,
        templateKey: input.templateKey,
        rawInput: input.rawInput,
      }) as never,
      sequenceAnimaticContinuityBatchTemplateKey,
      sequenceAnimaticStoryboardBlocksTemplateKey,
      ensureMappedChildWorkflow: ensureMappedChildWorkflow as never,
      startSequenceAnimaticChildRun: startSequenceAnimaticChildRun as never,
      updateMasterRequestMetadata: async (input) => {
        const client = input.client as DatabaseClient
        const response = await client
          .from('output_requests')
          .update({ metadata: input.metadata })
          .eq('id', input.requestId)
        if (response.error) throw new Error(response.error.message)
      },
      refreshOutputRequestStatusProjection: async (input) => {
        const client = input.client as DatabaseClient
        const response = await client.rpc('refresh_output_request_status_projection', { p_request_id: input.requestId })
        if (response.error) throw new Error(response.error.message)
      },
      outputWorkflowContinuityBlockPlannerTimeoutMs,
      persistSequenceAnimaticContinuityRequestState: persistSequenceAnimaticContinuityRequestState as never,
      executeImageGeneration: (context) => mediaRuntime.executeImageGeneration(context as never) as never,
      executeVideoGeneration: (context) => mediaRuntime.executeVideoGeneration(context as never) as never,
      cinematicEntityByKey: (assetPack) => cinematicEntityByKey(assetPack),
      readUpstreamGuidanceBundle,
      sequenceAnimaticContinuityAssetStateParse: (value) => sequenceAnimaticContinuityAssetStateSchema.parse(value),
      sequenceAnimaticContinuityAssetTargetInputHash,
      sequenceAnimaticAssetGenerationStatus,
      outputArtifactSelect,
      registerOtherOutputArtifact: registerOtherOutputArtifact as never,
      registerImageArtifact: registerImageArtifact as never,
      downloadProjectAssetBytes: downloadProjectAssetBytes as never,
      downloadRemoteBytes,
      makeTempDir: (prefix: string) => Deno.makeTempDir({ prefix }),
      writeFile: (path: string, bytes: Uint8Array) => Deno.writeFile(path, bytes),
      readFile: (path: string) => Deno.readFile(path),
      removeDir: (path: string) => Deno.remove(path, { recursive: true }).catch(() => {}),
      probeImageSize,
      runFfmpeg,
      verifySequenceAnimaticAnchorCrop,
      uploadBytes: uploadBytes as never,
      persistSequenceAnimaticDirectorPlanRequestState: persistSequenceAnimaticDirectorPlanRequestState as never,
      registerVideoArtifact: registerVideoArtifact as never,
      runStructuredNode: runCinematicV2StructuredNode,
      runVisionStructuredNode: runCinematicV2VisionStructuredNode,
      runBackgroundStructuredNode: runCinematicV2StructuredNodeBackground,
  }
  registerSequenceAnimaticPlanningWorkflowNodePack({
    helpers: sequenceAnimaticNodePackHelpers,
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerSequenceAnimaticSceneLifecycleWorkflowNodePack({
    helpers: sequenceAnimaticNodePackHelpers,
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerSequenceAnimaticArtifactWorkflowNodePack({
    helpers: sequenceAnimaticNodePackHelpers,
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerSequenceAnimaticCoverageWorkflowNodePack({
    helpers: sequenceAnimaticNodePackHelpers,
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerSequenceAnimaticContinuityAnchorWorkflowNodePack({
    helpers: sequenceAnimaticNodePackHelpers,
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerSequenceAnimaticContinuityAssetWorkflowNodePack({
    helpers: sequenceAnimaticNodePackHelpers,
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerSequenceAnimaticContinuityGraphWorkflowNodePack({
    helpers: sequenceAnimaticNodePackHelpers,
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerSequenceAnimaticShotReferenceWorkflowNodePack({
    helpers: sequenceAnimaticNodePackHelpers,
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerSequenceAnimaticShotProductionWorkflowNodePack({
    helpers: sequenceAnimaticNodePackHelpers,
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  registerSequenceAnimaticShotRevisionWorkflowNodePack({
    helpers: sequenceAnimaticNodePackHelpers,
    register: (handlerKey, handler) => {
      registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler as never, { replace: true })
    },
  })
  assertWorkflowNodeHandlerCoverage(outputWorkflowNodeManifests, outputWorkflowNodeHandlerRegistry)
  defaultOutputWorkflowNodeHandlersRegistered = true
}

export function registerOutputWorkflowNodeHandler(
  handlerKey: string,
  handler: WorkflowNodeHandler<OutputWorkflowNodeExecutionContext, OutputWorkflowNodeExecutionResult>,
  options: { replace?: boolean } = {},
) {
  ensureDefaultOutputWorkflowNodeHandlersRegistered()
  return registerWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, handlerKey, handler, options)
}

export async function executeWorkflowNodeByManifest(input: OutputWorkflowNodeExecutionContext) {
  ensureDefaultOutputWorkflowNodeHandlersRegistered()
  const config = asRecord(input.node.config)
  const purpose = readText(config.purpose)
  const manifest = purpose ? getWorkflowNodeManifest({ purpose }) : null
  if (purpose && !manifest) {
    throw new Error(`Workflow node purpose "${purpose}" is not registered in the node manifest registry.`)
  }
  const handler = manifest ? getWorkflowNodeHandler(outputWorkflowNodeHandlerRegistry, manifest.handlerKey) : executeNode
  if (!handler) {
    throw new Error(`Workflow node manifest "${manifest?.purpose ?? purpose}" has no registered handler "${manifest?.handlerKey ?? ''}".`)
  }
  const result = await handler(input)
  if (!manifest) return result
  const validation = validateWorkflowNodeManifestOutput(manifest, result.outputs)
  if (!validation.ok) {
    throw new Error(`Workflow node "${input.node.key}" produced invalid output for manifest "${manifest.purpose}": ${validation.diagnostics.join('; ')}`)
  }
  return {
    ...result,
    outputs: validation.outputs,
  }
}

export async function processFlyOutputWorkflowRuns(input: {
  client: DatabaseClient
  workerId: string
  workerCodeVersion?: string | null
  workerBuildVersion?: string | null
  documentRenderer?: OutputDocumentRenderer | null
}): Promise<{ processed: boolean; run?: Pick<OutputWorkflowRun, 'id' | 'status' | 'preset'> | null }> {
  const claimResponse = await input.client.rpc('claim_output_workflow_run', {
    worker_id: input.workerId,
  })
  if (claimResponse.error) throw new Error(claimResponse.error.message)
  const runId = typeof claimResponse.data === 'string' ? claimResponse.data : ''
  if (!runId) return { processed: false, run: null }

  let bundle = await loadOutputWorkflowRunBundle(input.client, runId, { includeStepOutputs: false })
  const workerCodeVersion = readText(input.workerCodeVersion) || 'unknown'
  const workerBuildVersion = readText(input.workerBuildVersion) || workerCodeVersion

  try {
    for (let dynamicPass = 0; dynamicPass < 4; dynamicPass += 1) {
    const activeWorkflowNodes = bundle.nodes.filter((node) => !isStaleDynamicCinematicNode(node))
    const activeWorkflowNodeKeys = new Set(activeWorkflowNodes.map((node) => node.key))
    const activeWorkflowEdges = bundle.edges.filter((edge) => (
      activeWorkflowNodeKeys.has(edge.sourceNodeKey)
      && activeWorkflowNodeKeys.has(edge.targetNodeKey)
    ))
    const recoveredArtifactNodeCount = await recoverArtifactBackedWorkflowNodeOutputs({
      client: input.client,
      run: bundle.run,
      nodes: activeWorkflowNodes,
    })
    if (recoveredArtifactNodeCount > 0) {
      bundle = await loadOutputWorkflowRunBundle(input.client, runId, { includeStepOutputs: false })
      continue
    }
    const validation = validateOutputWorkflowGraph({ nodes: activeWorkflowNodes, edges: activeWorkflowEdges })
    if (!validation.ok) {
      throw new Error(validation.diagnostics.join(' '))
    }

    await heartbeat(input.client, runId, input.workerId, {
      stage: 'running',
      preset: bundle.run.preset,
      workerCodeVersion,
      workerBuildVersion,
    })

    const runMetadata = asRecord(bundle.run.metadata)
    const targetNodeKeys = readStringArray(runMetadata.targetNodeKeys)
    const forceNodeKeys = new Set(readStringArray(runMetadata.forceNodeKeys))
    const reuseExistingUpstreamOutputs = runMetadata.reuseExistingUpstreamOutputs === true
    const runIntentDefaults = outputWorkflowRunIntentDefaults(readText(runMetadata.runIntent))
    const allowStaleUpstreamOutputs = runMetadata.allowStaleUpstreamOutputs === true || (runMetadata.allowStaleUpstreamOutputs === undefined && runIntentDefaults?.allowStaleUpstreamOutputs === true)
    const runScope = readText(runMetadata.runScope) || runIntentDefaults?.runScope || (targetNodeKeys.length > 0 ? 'upstream_to_node' : 'full_workflow')
    const targetsDynamicFanoutNode = targetNodeKeys.some(isDynamicCinematicFanoutNodeKey)
    const targetsSequenceAnimaticScenePlanFanout = targetNodeKeys.includes('sequence_animatic_scene_plan_fanout')
    const hasMaterializedDynamicFanoutDependents = targetsDynamicFanoutNode
      && activeWorkflowNodes.some((node) => {
        const metadata = asRecord(node.metadata)
        return metadata.dynamicCinematicGenerated === true
          && targetNodeKeys.includes(readText(metadata.generatedByNodeKey))
      })
    const continueDynamicFanoutDependents = runScope !== 'node_only'
      && hasMaterializedDynamicFanoutDependents
      && (runScope === 'node_and_downstream' || targetsSequenceAnimaticScenePlanFanout)
    const selectedSubgraph = selectOutputWorkflowRunSubgraph({
      nodes: activeWorkflowNodes,
      edges: activeWorkflowEdges,
      targetNodeKeys: continueDynamicFanoutDependents ? ['artifact'] : targetNodeKeys,
      runScope: continueDynamicFanoutDependents
        ? 'upstream_to_node'
        : runScope === 'node_only' || runScope === 'node_and_downstream' || runScope === 'artifact_rebake'
        ? runScope
        : 'upstream_to_node',
    })
    if (selectedSubgraph.diagnostics.length > 0) throw new Error(selectedSubgraph.diagnostics.join(' '))
    const fanoutGateNode = selectedSubgraph.nodes.find((node) => (
      node.key === 'sequence_animatic_scene_plan_fanout'
      || node.key === 'cinematic_v3_dynamic_shot_parse_fanout'
      || node.key === 'cinematic_v3_dynamic_storyboard_fanout'
      || node.key === 'cinematic_v2_dynamic_shot_fanout'
      || node.key === 'cinematic_dynamic_take_fanout'
    )) ?? null
    const fanoutGateActive = Boolean(fanoutGateNode) && (
      fanoutGateNode?.dirty === true
      || forceNodeKeys.has(fanoutGateNode?.key ?? '')
      || !hasStoredOutputs(fanoutGateNode?.outputs)
    )
    let executionNodes = fanoutGateActive
      ? selectedSubgraph.nodes.filter((node) => node.key === fanoutGateNode?.key || asRecord(node.metadata).dynamicCinematicGenerated !== true)
      : selectedSubgraph.nodes
    const manualNodeAllowed = (node: OutputWorkflowNode) => (
      !isManualOnlyOutputWorkflowNode(node)
      || cinematicVideoApprovedEnabled(bundle.run)
      || targetNodeKeys.includes(node.key)
      || forceNodeKeys.has(node.key)
    )
    executionNodes = executionNodes.filter(manualNodeAllowed)
    const executionNodeKeySetForGate = new Set(executionNodes.map((node) => node.key))
    const executionEdges = selectedSubgraph.edges.filter((edge) => executionNodeKeySetForGate.has(edge.sourceNodeKey) && executionNodeKeySetForGate.has(edge.targetNodeKey))
    const executionPlan = buildOutputWorkflowExecutionPlan(executionNodes, executionEdges)
    const nodeByKey = new Map(executionNodes.map((node) => [node.key, node]))
    const workflowNodeByKey = new Map(activeWorkflowNodes.map((node) => [node.key, node]))
    const stepByNodeKey = new Map(bundle.run.steps.map((step) => [step.nodeKey, step]))
    const executionNodeKeys = new Set(executionNodes.map((node) => node.key))
    const externalUpstreamNodeKeys = [...new Set(activeWorkflowEdges
      .filter((edge) => executionNodeKeys.has(edge.targetNodeKey) && !executionNodeKeys.has(edge.sourceNodeKey))
      .filter((edge) => !isOptionalOutputWorkflowEdge(edge))
      .map((edge) => edge.sourceNodeKey)
      .filter(Boolean))]
    const sourceRunIdForCache = readText(runMetadata.sourceRunId)
    if (sourceRunIdForCache && sourceRunIdForCache !== runId) {
      const sourceStepResponse = await input.client
        .from('output_workflow_run_steps')
        .select(outputWorkflowRunStepSelect)
        .eq('run_id', sourceRunIdForCache)
        .eq('workflow_id', bundle.workflow.id)
        .order('order_index', { ascending: true })
      if (sourceStepResponse.error) throw new Error(sourceStepResponse.error.message)
      for (const row of (sourceStepResponse.data ?? []) as OutputWorkflowRunStepRow[]) {
        const sourceStep = mapOutputWorkflowRunStepRow(row)
        if (forceNodeKeys.has(sourceStep.nodeKey)) continue
        const existingStep = stepByNodeKey.get(sourceStep.nodeKey)
        if (!existingStep || !hasStoredOutputs(existingStep.outputs)) stepByNodeKey.set(sourceStep.nodeKey, sourceStep)
      }
    }
    const latestWorkflowStepByNodeKey = await loadLatestWorkflowStepOutputsByNodeKey({
      client: input.client,
      workflowId: bundle.workflow.id,
      nodeKeys: externalUpstreamNodeKeys,
    })
    for (const [nodeKey, step] of latestWorkflowStepByNodeKey) {
      const existingStep = stepByNodeKey.get(nodeKey)
      if (!existingStep || !hasStoredOutputs(existingStep.outputs)) stepByNodeKey.set(nodeKey, step)
    }
    const recoveredArtifactOutputsByNodeKey = await loadRecoverableWorkflowArtifactOutputsByNodeKey({
      client: input.client,
      draftId: bundle.run.draftId,
      workflowId: bundle.workflow.id,
      nodesByKey: workflowNodeByKey,
      nodeKeys: externalUpstreamNodeKeys,
    })
    for (const [nodeKey, outputs] of recoveredArtifactOutputsByNodeKey) {
      const sourceNode = workflowNodeByKey.get(nodeKey)
      if (!sourceNode || hasStoredOutputs(sourceNode.outputs)) continue
      const outputHash = hashOutputWorkflowValue(outputs)
      const updateNodeResponse = await input.client
        .from('output_workflow_nodes')
        .update({
          outputs,
          dirty: false,
          output_hash: outputHash,
          metadata: {
            ...sourceNode.metadata,
            recoveredForTargetedExecution: true,
            recoveredForTargetedExecutionAt: new Date().toISOString(),
            outputPreview: buildOutputWorkflowNodeOutputPreview({
              node: { ...sourceNode, outputHash },
              outputs,
              provider: 'graphcore',
              model: 'artifact-recovery',
            }),
          },
        })
        .eq('id', sourceNode.id)
      if (updateNodeResponse.error) throw new Error(updateNodeResponse.error.message)
      workflowNodeByKey.set(nodeKey, { ...sourceNode, outputs, dirty: false, outputHash })
    }
    const cachedExternalUpstreamByNodeKey = new Map(executionNodes.map((node) => [node.key, collectCachedExternalUpstream({
      node,
      nodesByKey: workflowNodeByKey,
      stepsByNodeKey: stepByNodeKey,
      recoveredOutputsByNodeKey: recoveredArtifactOutputsByNodeKey,
      executionNodeKeys,
      edges: activeWorkflowEdges,
    })] as const))
    const missingCachedInputs = [...cachedExternalUpstreamByNodeKey.entries()]
      .flatMap(([nodeKey, cached]) => cached.missingNodeKeys.map((sourceKey) => `${nodeKey} <- ${sourceKey}`))
    if (missingCachedInputs.length > 0) {
      const missingLabels = missingCachedInputs.map((entry) => {
        if (entry === 'video <- storyboard_sheet') return 'video <- storyboard_sheet image'
        if (entry === 'video <- video_prompt') return 'video <- video_prompt text'
        return entry
      })
      throw new Error(`Required upstream cached output is missing: ${missingLabels.join(', ')}. The worker could not recover the saved graph outputs from node cache, run steps, or durable artifacts; run storyboard prep once to repair this block.`)
    }
    const executionLevelByNodeKey = new Map(executionPlan.levels.flatMap((level, index) => level.map((key) => [key, index] as const)))
    const nodeResults = new Map<string, {
      inputHash: string
      outputHash: string
      outputs: Record<string, unknown>
      provider?: string | null
      model?: string | null
      providerRequestId?: string | null
      skipped?: boolean
      skippedReason?: string
      reusedNodeKeys?: string[]
      staleReusedNodeKeys?: string[]
      sourceRunIds?: string[]
    }>()
    const claimedAttemptCount = bundle.run.attemptCount ?? 0
    const shouldCancelRun = async () => {
      const cancellationResponse = await input.client
        .from('output_workflow_runs')
        .select('status, worker_id, attempt_count')
        .eq('id', runId)
        .single()
      if (cancellationResponse.error) throw new Error(cancellationResponse.error.message)
      const row = cancellationResponse.data as { status?: string; worker_id?: string | null; attempt_count?: number | null } | null
      if (!row) return true
      if (row.status === 'cancelled') return true
      // Lease check: if the run was terminally failed elsewhere (attempt cap, orphan
      // sweep) or reclaimed by another worker/attempt after a stale heartbeat, this
      // executor must stop so two attempts never write the same steps.
      if (row.status !== 'running') return true
      if ((row.worker_id ?? null) !== input.workerId) return true
      if ((row.attempt_count ?? 0) !== claimedAttemptCount) return true
      return false
    }

    let lastProviderProgressHeartbeatAt = 0
    const schedulerResult = await runOutputWorkflowReadyQueue({
      nodes: executionNodes,
      edges: executionEdges,
      globalMaxConcurrency: defaultOutputWorkflowConcurrency.global,
      resourceClassMaxConcurrency: defaultOutputWorkflowConcurrency.resourceClasses,
      shouldCancel: shouldCancelRun,
      executeNode: async ({ node, upstream }) => {
        const cachedExternalUpstream = cachedExternalUpstreamByNodeKey.get(node.key) ?? {
          outputs: {},
          reusedNodeKeys: [],
          staleReusedNodeKeys: [],
          sourceRunIds: [],
          missingNodeKeys: [],
        }
        const effectiveUpstream = {
          ...cachedExternalUpstream.outputs,
          ...upstream,
        }
        const inputHash = computeNodeInputHash({ run: bundle.run, node, upstream: effectiveUpstream })
        const forceNode = forceNodeKeys.has(node.key)
        const priorStep = stepByNodeKey.get(node.key) ?? null
        const hasExistingOutputs = outputWorkflowNodeOutputsReusableForCache(node, node.outputs)
        const priorStepWaiting = asRecord(priorStep?.metadata).waiting === true
        const hasRecoverableStepOutputs = !forceNode
          && !priorStepWaiting
          && !hasExistingOutputs
          && outputWorkflowNodeOutputsReusableForCache(node, priorStep?.outputs)
          && Boolean(priorStep?.outputHash)
          && ['running', 'completed'].includes(priorStep?.status ?? '')
        const canHashSkip = !forceNode && !node.dirty && node.inputHash === inputHash && hasExistingOutputs
        const canReuseExistingOutput = !forceNode
          && reuseExistingUpstreamOutputs
          && runScope !== 'upstream_to_node'
          && hasExistingOutputs
        if (hasRecoverableStepOutputs && priorStep) {
          const recoveredInputHash = priorStep.inputHash || inputHash
          const recoveredOutputs = asRecord(priorStep.outputs)
          const updateNodeResponse = await input.client
            .from('output_workflow_nodes')
            .update({
              outputs: recoveredOutputs,
              dirty: false,
              input_hash: recoveredInputHash,
              output_hash: priorStep.outputHash,
              metadata: {
                ...node.metadata,
                execution: buildOutputWorkflowNodeExecutionCacheMetadata({
                  node,
                  runId,
                  level: executionLevelByNodeKey.get(node.key) ?? 0,
                  resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
                  inputHash: recoveredInputHash,
                  outputHash: priorStep.outputHash,
                  effectiveUpstream,
                  reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
                  staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
                  sourceRunIds: cachedExternalUpstream.sourceRunIds,
                  recoveredFromRunStep: true,
                }),
                outputPreview: buildOutputWorkflowNodeOutputPreview({
                  node: { ...node, outputHash: priorStep.outputHash },
                  outputs: recoveredOutputs,
                  provider: priorStep.provider,
                  model: priorStep.model,
                }),
              },
          })
            .eq('id', node.id)
          if (updateNodeResponse.error) throw new Error(updateNodeResponse.error.message)
          nodeResults.set(node.key, {
            inputHash: recoveredInputHash,
            outputHash: priorStep.outputHash,
            outputs: recoveredOutputs,
            provider: priorStep.provider,
            model: priorStep.model,
            providerRequestId: priorStep.providerRequestId,
            skipped: true,
            skippedReason: 'existing_run_step_output_recovered',
            reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
            staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
            sourceRunIds: cachedExternalUpstream.sourceRunIds,
          })
          return { status: 'skipped', outputs: recoveredOutputs }
        }
        if (canHashSkip || canReuseExistingOutput) {
          const skippedInputHash = canHashSkip ? inputHash : node.inputHash || inputHash
          const skippedReason = canHashSkip ? 'input_hash_unchanged' : 'existing_output_reused_for_targeted_rebake'
          const updateNodeResponse = await input.client
            .from('output_workflow_nodes')
            .update({
              outputs: node.outputs,
              dirty: false,
              input_hash: skippedInputHash,
              output_hash: node.outputHash,
              metadata: {
                ...node.metadata,
                execution: buildOutputWorkflowNodeExecutionCacheMetadata({
                  node,
                  runId,
                  level: executionLevelByNodeKey.get(node.key) ?? 0,
                  resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
                  inputHash: skippedInputHash,
                  outputHash: node.outputHash,
                  effectiveUpstream,
                  reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
                  staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
                  sourceRunIds: cachedExternalUpstream.sourceRunIds,
                  skippedReason,
                }),
                outputPreview: buildOutputWorkflowNodeOutputPreview({
                  node,
                  outputs: node.outputs,
                  provider: 'graphcore',
                  model: 'cached-node-output',
                }),
              },
            })
            .eq('id', node.id)
          if (updateNodeResponse.error) throw new Error(updateNodeResponse.error.message)
          nodeResults.set(node.key, {
            inputHash: skippedInputHash,
            outputHash: node.outputHash,
            outputs: node.outputs,
            provider: 'graphcore',
            model: 'cached-node-output',
            skipped: true,
            skippedReason,
            reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
            staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
            sourceRunIds: cachedExternalUpstream.sourceRunIds,
          })
          return { status: 'skipped', outputs: node.outputs }
        }
        const result = await executeWorkflowNodeByManifest({
          run: bundle.run,
          workflow: bundle.workflow,
          node,
          priorStep,
          upstream: effectiveUpstream,
          inputHash,
          client: input.client,
          documentRenderer: input.documentRenderer,
          shouldCancel: shouldCancelRun,
          onProgress: async (progress) => {
            const priorStep = stepByNodeKey.get(node.key)
            const progressMetadata = asRecord(progress.metadata)
            await setStepStatus(input.client, {
              runId,
              node,
              status: 'running',
              draftId: bundle.run.draftId,
              orderIndex: executionPlan.orderedNodeKeys.indexOf(node.key),
              inputHash,
              outputHash: priorStep?.outputHash ?? '',
              outputs: priorStep?.outputs ?? {},
              provider: progress.provider ?? priorStep?.provider ?? null,
              model: progress.model ?? priorStep?.model ?? null,
              providerRequestId: progress.providerRequestId ?? priorStep?.providerRequestId ?? null,
              startedAt: priorStep?.startedAt,
              metadata: {
                ...asRecord(priorStep?.metadata),
                stage: node.nodeType,
                runScope,
                executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
                resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
                groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
                ...progressMetadata,
                reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
                staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
                sourceRunIds: cachedExternalUpstream.sourceRunIds,
                staleInputAllowed: allowStaleUpstreamOutputs,
              },
            })
            const nowMs = Date.now()
            if (nowMs - lastProviderProgressHeartbeatAt > 15_000) {
              lastProviderProgressHeartbeatAt = nowMs
              await heartbeat(input.client, runId, input.workerId, {
                runtime: 'fly_output_workflow_worker',
                stage: 'provider_progress',
                activeNodeKey: node.key,
                provider: progress.provider ?? priorStep?.provider ?? null,
                providerRequestId: progress.providerRequestId ?? priorStep?.providerRequestId ?? null,
                providerStatus: readText(asRecord(progress.metadata).providerStatus) || null,
              })
            }
            if (priorStep) {
              priorStep.provider = progress.provider ?? priorStep.provider
              priorStep.model = progress.model ?? priorStep.model
              priorStep.providerRequestId = progress.providerRequestId ?? priorStep.providerRequestId
              priorStep.metadata = {
                ...asRecord(priorStep.metadata),
                ...progress.metadata,
              }
            }
          },
        })
        const resultOutputs = asRecord(result.outputs)
        const resultWaiting = resultOutputs.waiting === true && resultOutputs.resumable !== false
        nodeResults.set(node.key, {
          inputHash: result.inputHash,
          outputHash: result.outputHash,
          outputs: result.outputs,
          provider: result.provider,
          model: result.model,
          providerRequestId: result.providerRequestId,
          skipped: result.status === 'skipped',
          skippedReason: result.status === 'skipped' ? readText(asRecord(result.outputs).skippedReason) || 'node_reported_skipped' : undefined,
          reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
          staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
          sourceRunIds: cachedExternalUpstream.sourceRunIds,
        })
        if (resultWaiting) {
          return {
            status: 'waiting',
            outputs: result.outputs,
            resumeAfterMs: Math.max(0, Math.floor(Number(resultOutputs.resumeAfterMs ?? resultOutputs.resume_after_ms) || 15_000)),
          }
        }
        const guidanceMetadata = guidanceStepMetadata(result.outputs.guidance)
        const updateNodeResponse = await input.client
          .from('output_workflow_nodes')
          .update({
            outputs: result.outputs,
            dirty: false,
            input_hash: result.inputHash,
            output_hash: result.outputHash,
            metadata: {
              ...node.metadata,
              execution: buildOutputWorkflowNodeExecutionCacheMetadata({
                node,
                runId,
                level: executionLevelByNodeKey.get(node.key) ?? 0,
                resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
                inputHash: result.inputHash,
                outputHash: result.outputHash,
                effectiveUpstream,
                reusedNodeKeys: cachedExternalUpstream.reusedNodeKeys,
                staleReusedNodeKeys: cachedExternalUpstream.staleReusedNodeKeys,
                sourceRunIds: cachedExternalUpstream.sourceRunIds,
              }),
              guidance: guidanceMetadata,
              outputPreview: buildOutputWorkflowNodeOutputPreview({
                node: { ...node, outputHash: result.outputHash },
                outputs: result.outputs,
                provider: result.provider,
                model: result.model,
              }),
            },
          })
          .eq('id', node.id)
        if (updateNodeResponse.error) throw new Error(updateNodeResponse.error.message)
        return { status: 'completed', outputs: result.outputs }
      },
      onNodeStart: async ({ node, orderIndex, resourceClass }) => {
        const priorStep = stepByNodeKey.get(node.key)
        // Dynamic-expansion replay passes re-enter every node before the cache-reuse
        // decision is made. Re-marking an already-completed step as running makes the
        // UI progress jump back (e.g. "Author screenplay") during ~a minute of cache
        // replay, and doubles the replay's DB writes. Skip the running mark for
        // completed steps unless this node is explicitly forced to re-run — genuine
        // re-executions still surface via onProgress and onNodeComplete.
        if (priorStep?.status === 'completed' && !forceNodeKeys.has(node.key)) return
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'running',
          draftId: bundle.run.draftId,
          orderIndex,
          inputHash: priorStep?.inputHash ?? '',
          outputHash: priorStep?.outputHash ?? '',
          outputs: priorStep?.outputs ?? {},
          provider: priorStep?.provider ?? null,
          model: priorStep?.model ?? null,
          providerRequestId: priorStep?.providerRequestId ?? null,
          startedAt: priorStep?.startedAt,
          metadata: {
            ...asRecord(priorStep?.metadata),
            stage: node.nodeType,
            runScope,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass,
            groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
          },
        })
        await persistSequenceAnimaticNodeProgressEvent({
          client: input.client,
          run: bundle.run,
          workflow: bundle.workflow,
          node,
          status: 'running',
        })
      },
      onNodeComplete: async ({ node, orderIndex, skipped }) => {
        const result = nodeResults.get(node.key)
        const priorStep = stepByNodeKey.get(node.key)
        const guidanceMetadata = guidanceStepMetadata(result?.outputs.guidance)
        const aiUsage = buildOutputStepAiUsage({ run: bundle.run, node, result, skipped })
        const providerStepMetadata = terminalProviderStepMetadata(result ? { ...result, skipped } : null)
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'completed',
          draftId: bundle.run.draftId,
          orderIndex,
          inputHash: result?.inputHash ?? '',
          outputHash: result?.outputHash ?? '',
          outputs: result?.outputs ?? {},
          provider: result?.provider ?? null,
          model: result?.model ?? null,
          providerRequestId: result?.providerRequestId ?? null,
          startedAt: priorStep?.startedAt,
          metadata: {
            stage: node.nodeType,
            runScope,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
            groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
            ...guidanceMetadata,
            ...providerStepMetadata,
            skipped,
            reason: skipped ? result?.skippedReason ?? 'input_hash_unchanged' : undefined,
            reusedNodeKeys: result?.reusedNodeKeys ?? [],
            staleReusedNodeKeys: result?.staleReusedNodeKeys ?? [],
            sourceRunIds: result?.sourceRunIds ?? [],
            staleInputAllowed: allowStaleUpstreamOutputs,
            aiUsage: aiUsage.summary,
            aiUsageLine: aiUsage.line,
          },
        })
        try {
          await persistOutputRequestReferenceSelection(input.client, bundle.run, result?.outputs ?? {})
        } catch (error) {
          console.warn('[GraphCore][output-worker] failed to persist compact output reference selection.', error)
        }
        await persistSequenceAnimaticNodeProgressEvent({
          client: input.client,
          run: bundle.run,
          workflow: bundle.workflow,
          node,
          status: 'completed',
          outputs: result?.outputs ?? {},
        })
        if (aiUsage.line) {
          await recordAiUsageEvent(input.client, {
            line: aiUsage.line,
            context: {
              userId: bundle.run.requestedBy,
              projectId: bundle.run.projectId,
              draftId: bundle.run.draftId,
              surface: 'output_workflow',
              outputWorkflowId: bundle.workflow.id,
              outputWorkflowRunId: bundle.run.id,
              idempotencyKey: `${bundle.run.id}:${node.key}:${result?.providerRequestId ?? result?.outputHash ?? result?.inputHash}`,
            },
          })
        }
      },
      onNodeWaiting: async ({ node, orderIndex, outputs, resumeAfterMs }) => {
        const result = nodeResults.get(node.key)
        const priorStep = stepByNodeKey.get(node.key)
        const recoveryHints = readStringArray(asRecord(outputs.workflowRuntime).recoveryHints)
          .concat(readStringArray(outputs.diagnostics))
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'running',
          draftId: bundle.run.draftId,
          orderIndex,
          inputHash: result?.inputHash ?? '',
          outputHash: result?.outputHash ?? '',
          outputs,
          provider: result?.provider ?? null,
          model: result?.model ?? null,
          providerRequestId: result?.providerRequestId ?? null,
          startedAt: priorStep?.startedAt,
          metadata: {
            ...asRecord(priorStep?.metadata),
            stage: node.nodeType,
            runScope,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
            groupKey: getOutputWorkflowNodeExecutionMetadata(node).groupKey ?? null,
            waiting: true,
            resumable: true,
            resumeAfterMs,
            recoveryHints,
            reusedNodeKeys: result?.reusedNodeKeys ?? [],
            staleReusedNodeKeys: result?.staleReusedNodeKeys ?? [],
            sourceRunIds: result?.sourceRunIds ?? [],
            staleInputAllowed: allowStaleUpstreamOutputs,
          },
        })
        await heartbeat(input.client, runId, input.workerId, {
          runtime: 'fly_output_workflow_worker',
          stage: 'waiting_for_child_workflow',
          activeNodeKey: node.key,
          activeManifestPurpose: getWorkflowNodeManifest(node)?.purpose ?? (readText(asRecord(node.config).purpose) || null),
          activeProgressLabel: getWorkflowNodeManifest(node)?.progressLabel ?? node.label,
          resumeAfterMs,
          recoveryHints,
        })
      },
      onNodeFailed: async ({ node, orderIndex, error, blockedDependents }) => {
        const message = error instanceof Error ? error.message : String(error)
        const priorStep = stepByNodeKey.get(node.key)
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'failed',
          draftId: bundle.run.draftId,
          orderIndex,
          provider: priorStep?.provider ?? null,
          model: priorStep?.model ?? null,
          providerRequestId: priorStep?.providerRequestId ?? null,
          startedAt: priorStep?.startedAt,
          errorMessage: message,
          metadata: {
            ...asRecord(priorStep?.metadata),
            stage: node.nodeType,
            runScope,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
            blockedDependents,
          },
        })
        const updateNodeFailurePreview = await input.client
          .from('output_workflow_nodes')
          .update({
            metadata: {
              ...node.metadata,
              outputPreview: buildOutputWorkflowNodeOutputPreview({
                node,
                outputs: {},
                provider: priorStep?.provider ?? null,
                model: priorStep?.model ?? null,
                errorMessage: message,
              }),
            },
          })
          .eq('id', node.id)
        if (updateNodeFailurePreview.error) throw new Error(updateNodeFailurePreview.error.message)
        await persistSequenceAnimaticNodeProgressEvent({
          client: input.client,
          run: bundle.run,
          workflow: bundle.workflow,
          node,
          status: 'failed',
          errorMessage: message,
        })
      },
      onNodeCancelled: async ({ node, orderIndex, reason, blockedBy }) => {
        const priorStep = stepByNodeKey.get(node.key)
        await setStepStatus(input.client, {
          runId,
          node,
          status: 'cancelled',
          draftId: bundle.run.draftId,
          orderIndex,
          provider: priorStep?.provider ?? null,
          model: priorStep?.model ?? null,
          providerRequestId: priorStep?.providerRequestId ?? null,
          startedAt: priorStep?.startedAt,
          errorMessage: reason === 'blocked_by_failed_dependency' ? `Blocked by ${blockedBy}.` : null,
          metadata: {
            ...asRecord(priorStep?.metadata),
            stage: node.nodeType,
            runScope,
            executionLevel: executionLevelByNodeKey.get(node.key) ?? 0,
            resourceClass: getOutputWorkflowNodeExecutionMetadata(node).resourceClass,
            blocked: reason === 'blocked_by_failed_dependency',
            blockedBy: blockedBy ?? null,
            reason,
          },
        })
      },
      onHeartbeat: async ({ pending, running, completed, failed, cancelled, skipped }) => {
        await heartbeat(input.client, runId, input.workerId, {
          runtime: 'fly_output_workflow_worker',
          stage: running.length > 0 ? 'running_parallel_nodes' : 'scheduling',
          runMode: targetNodeKeys.length > 0 ? 'targeted_node_run' : 'full_workflow_run',
          runScope,
          targetNodeKeys,
          forceNodeKeys: [...forceNodeKeys],
          reuseExistingUpstreamOutputs,
          allowStaleUpstreamOutputs,
          pendingNodeKeys: pending,
          runningNodeKeys: running,
          completedNodeKeys: completed,
          failedNodeKeys: failed,
          cancelledNodeKeys: cancelled,
          skippedNodeKeys: skipped,
          executionLevels: executionPlan.levels,
          concurrency: defaultOutputWorkflowConcurrency,
        })
      },
    })

    if (schedulerResult.status === 'waiting') {
      const waitingNodeKey = readText((schedulerResult as { waitingNodeKey?: unknown }).waitingNodeKey)
      const resumeAfterMs = Math.max(0, Math.min(30_000, Math.floor(Number((schedulerResult as { resumeAfterMs?: unknown }).resumeAfterMs) || 15_000)))
      await heartbeat(input.client, runId, input.workerId, {
        runtime: 'fly_output_workflow_worker',
        stage: 'waiting_resumable',
        runMode: targetNodeKeys.length > 0 ? 'targeted_node_run' : 'full_workflow_run',
        runScope,
        targetNodeKeys,
        waitingNodeKey,
        resumeAfterMs,
        completedNodeKeys: schedulerResult.completed,
        failedNodeKeys: schedulerResult.failed,
        cancelledNodeKeys: schedulerResult.cancelled,
        skippedNodeKeys: schedulerResult.skipped,
        executionLevels: executionPlan.levels,
      })
      if (resumeAfterMs > 0) await sleep(resumeAfterMs)
      const requeueResponse = await input.client
        .from('output_workflow_runs')
        .update({
          status: 'queued',
          worker_id: null,
          heartbeat_at: null,
          metadata: {
            ...asRecord(bundle.run.metadata),
            runtime: 'fly_output_workflow_worker',
            stage: 'waiting_resumable',
            waitingNodeKey,
            resumeAfterMs,
            waitingSince: new Date().toISOString(),
          },
        })
        .eq('id', runId)
        .eq('status', 'running')
        .eq('worker_id', input.workerId)
      if (requeueResponse.error) throw new Error(requeueResponse.error.message)
      return { processed: true, run: { id: bundle.run.id, status: 'queued', preset: bundle.run.preset } }
    }

    if (schedulerResult.status === 'cancelled') {
      const liveRunResponse = await input.client
        .from('output_workflow_runs')
        .select('status, worker_id, attempt_count')
        .eq('id', runId)
        .single()
      const liveRun = liveRunResponse.error
        ? null
        : (liveRunResponse.data as { status?: string; worker_id?: string | null; attempt_count?: number | null } | null)
      const lostLease = liveRun
        ? liveRun.status !== 'cancelled'
          && (liveRun.status !== 'running' || (liveRun.worker_id ?? null) !== input.workerId || (liveRun.attempt_count ?? 0) !== claimedAttemptCount)
        : false
      if (lostLease) {
        // Execution stopped because another attempt/worker owns the run (or it was
        // terminally failed elsewhere). Leave run/request state to the new owner.
        return { processed: true, run: { id: bundle.run.id, status: liveRun?.status ?? 'failed', preset: bundle.run.preset } }
      }
      const cancelRequestResponse = await input.client
        .from('output_requests')
        .update({
          status: 'cancelled',
          error_message: null,
        })
        .eq('latest_run_id', runId)
      if (cancelRequestResponse.error) throw new Error(cancelRequestResponse.error.message)
      return { processed: true, run: { id: bundle.run.id, status: 'cancelled', preset: bundle.run.preset } }
    }
    if (schedulerResult.status === 'failed') {
      throw new Error('Output workflow failed while executing required nodes.')
    }
    const fanoutOutputs = asRecord(
      schedulerResult.outputsByNodeKey.cinematic_dynamic_take_fanout
      ?? schedulerResult.outputsByNodeKey.sequence_animatic_scene_plan_fanout
      ?? schedulerResult.outputsByNodeKey.cinematic_v3_dynamic_shot_parse_fanout
      ?? schedulerResult.outputsByNodeKey.cinematic_v3_dynamic_storyboard_fanout
      ?? schedulerResult.outputsByNodeKey.cinematic_v2_dynamic_shot_fanout,
    )
    const dynamicGraphExpanded = fanoutOutputs.dynamicGraphExpanded === true || fanoutOutputs.graphExpanded === true
    const dynamicFanoutNodeKey = schedulerResult.outputsByNodeKey.sequence_animatic_scene_plan_fanout
      ? 'sequence_animatic_scene_plan_fanout'
      : schedulerResult.outputsByNodeKey.cinematic_v3_dynamic_shot_parse_fanout
      ? 'cinematic_v3_dynamic_shot_parse_fanout'
      : schedulerResult.outputsByNodeKey.cinematic_v3_dynamic_storyboard_fanout
      ? 'cinematic_v3_dynamic_storyboard_fanout'
      : schedulerResult.outputsByNodeKey.cinematic_v2_dynamic_shot_fanout
        ? 'cinematic_v2_dynamic_shot_fanout'
        : schedulerResult.outputsByNodeKey.cinematic_dynamic_take_fanout
          ? 'cinematic_dynamic_take_fanout'
          : ''
    const dynamicFanoutWasCacheSkipped = dynamicFanoutNodeKey
      ? schedulerResult.skipped.includes(dynamicFanoutNodeKey)
      : false
    if (dynamicGraphExpanded && dynamicFanoutNodeKey && !dynamicFanoutWasCacheSkipped) {
      await heartbeat(input.client, runId, input.workerId, {
        runtime: 'fly_output_workflow_worker',
        stage: dynamicFanoutNodeKey === 'sequence_animatic_scene_plan_fanout'
          ? 'sequence_animatic_scene_plan_fanout_materialized'
          : dynamicFanoutNodeKey === 'cinematic_v3_dynamic_shot_parse_fanout'
          ? 'dynamic_cinematic_v3_shot_parse_fanout_materialized'
          : dynamicFanoutNodeKey === 'cinematic_v3_dynamic_storyboard_fanout'
          ? 'dynamic_cinematic_v3_storyboard_fanout_materialized'
          : dynamicFanoutNodeKey === 'cinematic_v2_dynamic_shot_fanout'
            ? 'dynamic_cinematic_v2_shot_fanout_materialized'
            : 'dynamic_cinematic_take_fanout_materialized',
        dynamicTakeCount: Number(fanoutOutputs.dynamicTakeCount ?? 0) || null,
        dynamicShotCount: Number(fanoutOutputs.dynamicShotCount ?? 0) || null,
        compileHash: readText(fanoutOutputs.compileHash) || null,
      })
      bundle = await loadOutputWorkflowRunBundle(input.client, runId, { includeStepOutputs: false })
      continue
    }

    // Reconcile plan vs DB before completing: incremental dynamic-node persistence
    // can land a node (e.g. the last scene of a fanout) after this pass's bundle
    // snapshot was taken, leaving it with valid edges but invisible to the
    // scheduler — the run would otherwise complete silently missing that node.
    if (targetNodeKeys.length === 0 && dynamicPass < 3) {
      // Non-fatal: a transient DB/gateway error here must not fail a run whose
      // nodes all completed — skip reconciliation and proceed to finalization.
      try {
        const reconcileBundle = await loadOutputWorkflowRunBundle(input.client, runId, { includeStepOutputs: false })
        const strandedDynamicNodes = reconcileBundle.nodes.filter((node) => {
          if (isStaleDynamicCinematicNode(node)) return false
          const metadata = asRecord(node.metadata)
          if (metadata.dynamicCinematicGenerated !== true) return false
          return !activeWorkflowNodeKeys.has(node.key)
        })
        if (strandedDynamicNodes.length > 0) {
          console.warn('[GraphCore][output-worker] dynamic nodes were materialized after the pass snapshot; running another pass.', {
            runId,
            strandedNodeKeys: strandedDynamicNodes.map((node) => node.key),
            dynamicPass,
          })
          await heartbeat(input.client, runId, input.workerId, {
            runtime: 'fly_output_workflow_worker',
            stage: 'dynamic_nodes_reconciled',
            strandedNodeKeys: strandedDynamicNodes.map((node) => node.key),
          })
          bundle = reconcileBundle
          continue
        }
      } catch (error) {
        if (!isTransientWorkerDbError(error)) throw error
        console.warn('[GraphCore][output-worker] skipping dynamic-node reconciliation after transient error.', {
          runId,
          error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
        })
      }
    }

    const finalOutputs = {
      nodes: schedulerResult.outputsByNodeKey,
      artifact: schedulerResult.outputsByNodeKey.artifact ?? null,
    }
    const finalArtifactOutputs = asRecord(schedulerResult.outputsByNodeKey.artifact)
    const finalArtifact = asRecord(finalArtifactOutputs.artifact)
    const finalArtifactMetadata = asRecord(finalArtifact.metadata)
    const v3AuthoringReady = finalArtifactOutputs.authoringReady === true
      || readText(finalArtifactMetadata.role) === 'cinematic_v3_authoring_timeline'
      || asRecord(finalArtifactOutputs.video).authoringOnly === true
    const effectiveRunStatus = schedulerResult.status === 'completed_with_errors' && v3AuthoringReady
      ? 'completed'
      : schedulerResult.status
    // Finalization runs after every required node already succeeded. A transient
    // DB hiccup here (statement timeout, Cloudflare 5xx) must NOT throw into the
    // outer catch and fail an otherwise-complete run, so retry it a few times.
    let completeResponse = await input.client.rpc('complete_output_workflow_run', {
      run_id: runId,
      worker_id: input.workerId,
      outputs: finalOutputs,
      metadata_patch: {
        runtime: 'fly_output_workflow_worker',
        stage: effectiveRunStatus,
          runMode: targetNodeKeys.length > 0 ? 'targeted_node_run' : 'full_workflow_run',
          runScope,
          targetNodeKeys,
          forceNodeKeys: [...forceNodeKeys],
          reuseExistingUpstreamOutputs,
          allowStaleUpstreamOutputs,
          status: effectiveRunStatus === 'completed_with_errors' ? 'completed_with_errors' : undefined,
          nonCriticalCompletedWithErrors: schedulerResult.status === 'completed_with_errors' && effectiveRunStatus === 'completed',
        completedNodeKeys: schedulerResult.completed,
        failedNodeKeys: schedulerResult.failed,
        cancelledNodeKeys: schedulerResult.cancelled,
        skippedNodeKeys: schedulerResult.skipped,
        executionLevels: executionPlan.levels,
      },
    })
    for (let finalizeAttempt = 1; completeResponse.error && finalizeAttempt <= 4 && isTransientWorkerDbError(completeResponse.error); finalizeAttempt += 1) {
      console.warn('[GraphCore][output-worker] transient error finalizing completed run; retrying.', { runId, attempt: finalizeAttempt, error: completeResponse.error.message })
      await sleep(Math.min(8_000, 1_000 * finalizeAttempt))
      completeResponse = await input.client.rpc('complete_output_workflow_run', {
        run_id: runId,
        worker_id: input.workerId,
        outputs: finalOutputs,
        metadata_patch: { runtime: 'fly_output_workflow_worker', stage: effectiveRunStatus, completedNodeKeys: schedulerResult.completed, failedNodeKeys: schedulerResult.failed, cancelledNodeKeys: schedulerResult.cancelled, skippedNodeKeys: schedulerResult.skipped, executionLevels: executionPlan.levels },
      })
    }
    if (completeResponse.error) throw new Error(completeResponse.error.message)
    if (completeResponse.data === true) {
      let completeRequestResponse = await input.client
        .from('output_requests')
        .update({ status: effectiveRunStatus, error_message: null })
        .eq('latest_run_id', runId)
      for (let reqAttempt = 1; completeRequestResponse.error && reqAttempt <= 4 && isTransientWorkerDbError(completeRequestResponse.error); reqAttempt += 1) {
        await sleep(Math.min(8_000, 1_000 * reqAttempt))
        completeRequestResponse = await input.client
          .from('output_requests')
          .update({ status: effectiveRunStatus, error_message: null })
          .eq('latest_run_id', runId)
      }
      if (completeRequestResponse.error) throw new Error(completeRequestResponse.error.message)
    }
    if (effectiveRunStatus === 'completed') {
      try {
        await maybeStartFirstSequenceAnimaticScene({
          client: input.client,
          run: bundle.run,
          outputsByNodeKey: schedulerResult.outputsByNodeKey,
        })
      } catch (error) {
        console.warn('[GraphCore][output-worker] failed to ensure/auto-start sequence animatic scenes.', error)
      }
      try {
        await maybeStartNextSequenceAnimaticStoryboardBlock({
          client: input.client,
          run: bundle.run,
        })
      } catch (error) {
        console.warn('[GraphCore][output-worker] failed to start next sequence animatic storyboard block.', error)
      }
    }
    return { processed: true, run: { id: bundle.run.id, status: effectiveRunStatus, preset: bundle.run.preset } }
    }
    throw new Error('Cinematic dynamic workflow expansion did not settle after 4 scheduler passes.')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isTransientWorkerDbError(error) && (bundle.run.attemptCount ?? 0) < 5) {
      // Infra blip (DB statement timeout, gateway 5xx): completed node work is
      // cached, so requeue for a cheap resume instead of terminally failing.
      // Attempt cap prevents a persistent error from looping forever.
      const requeueResponse = await input.client
        .from('output_workflow_runs')
        .update({ status: 'queued', worker_id: null, heartbeat_at: null })
        .eq('id', runId)
        .eq('status', 'running')
        .eq('worker_id', input.workerId)
      if (!requeueResponse.error) {
        console.warn('[GraphCore][output-worker] requeued run after transient infrastructure error.', {
          runId,
          error: message.slice(0, 200),
        })
        return { processed: true, run: { id: bundle.run.id, status: 'queued', preset: bundle.run.preset } }
      }
      console.warn('[GraphCore][output-worker] failed to requeue run after transient error; falling through to fail.', {
        runId,
        requeueError: requeueResponse.error.message,
      })
    }
    const failResponse = await input.client.rpc('fail_output_workflow_run', {
      run_id: runId,
      worker_id: input.workerId,
      error_message: message,
      metadata_patch: {
        runtime: 'fly_output_workflow_worker',
        stage: 'failed',
      },
    })
    if (failResponse.error) {
      console.warn('[GraphCore][output-worker] failed to mark output workflow run failed.', {
        runId,
        error: failResponse.error.message,
      })
    }
    // The fail RPC is lease-guarded (status='running' and matching worker_id) and
    // returns false when another attempt/worker owns the run now — in that case the
    // request status belongs to the new owner and must not be stomped to failed here.
    if (failResponse.error || failResponse.data === true) {
      const failRequestResponse = await input.client
        .from('output_requests')
        .update({
          status: 'failed',
          error_message: message,
        })
        .eq('latest_run_id', runId)
      if (failRequestResponse.error) {
        console.warn('[GraphCore][output-worker] failed to mark output request failed.', {
          runId,
          error: failRequestResponse.error.message,
        })
      }
    }
    return { processed: true, run: { id: bundle.run.id, status: 'failed', preset: bundle.run.preset } }
  }
}

export {
  buildOutputWorkflowExecutionPlan,
  isTerminalOutputWorkflowRunStatus,
  startSequenceAnimaticChildRun,
  outputArtifactResponseSchema,
  outputWorkflowCancelResponseSchema,
  outputWorkflowPlanResponseSchema,
  outputWorkflowRunStatusResponseSchema,
  outputWorkflowStartResponseSchema,
  getOutputWorkflowNodeExecutionMetadata,
  getOutputWorkflowNodeGuidanceConfig,
  selectOutputWorkflowRunSubgraph,
  topologicallySortOutputWorkflow,
  validateOutputWorkflowGraph,
}
