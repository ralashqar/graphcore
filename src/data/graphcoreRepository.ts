import { compileBundle } from '../domain/compiler'
import { aiGenerationSettings } from '../config/aiGenerationSettings'
import { cacheSignedAssetResponse, getCachedAssetObjectUrl, getCachedSignedAssetUrl, setCachedSignedAssetUrl } from '../domain/assetUrlCache'
import { BASELINE_ARCHETYPES, hasMissingBaselineArchetypes } from '../domain/bootstrapSeeds'
import { demoProjectSnapshot } from '../domain/demo-data'
import { environmentBlueprintV1Schema } from '../domain/environmentBlueprint'
import { normalizeCinematicGraphProjection } from '../domain/cinematicGraphProjection'
import { createGameSpecFromArchetype } from '../domain/gameArchetypes'
import {
  type AssemblyNodeDefinition,
  assetDefinitionSchema,
  buildDefaultDefinitionComponents,
  projectSnapshotSchema,
  type ArchetypeDefinition,
  type AssetDefinition,
  type ComponentEnvelope,
  type DefinitionBase,
  type EnvironmentBlueprintV1,
  type FieldDefinition,
  type GraphDefinition,
  type PatchOperation,
  type ProjectSnapshot,
} from '../domain/graphcore'
import {
  worldEntityCreateInputSchema,
  worldEntityUpdateInputSchema,
  worldDerivedCompositionCreateInputSchema,
  worldDerivedCompositionUpdateInputSchema,
  worldGraphExpansionRequestSchema,
  worldGraphSnapshotSchema,
  resetProjectWorldRequestSchema,
  resetProjectWorldResponseSchema,
  worldGraphSeedRequestSchema,
  worldRelationshipCreateInputSchema,
  worldRelationshipUpdateInputSchema,
  worldViewSchema,
  worldViewCreateInputSchema,
  worldViewUpdateInputSchema,
  type WorldDerivedCompositionCreateInput,
  type WorldDerivedCompositionUpdateInput,
  type WorldEntity,
  type WorldEntityCreateInput,
  type WorldEntityUpdateInput,
  type WorldGraphConnection,
  type WorldGraphExpansionRequest,
  type WorldGraphSeedRequest,
  type ResetProjectWorldResponse,
  type WorldOperator,
  type WorldRelationship,
  type WorldRelationshipCreateInput,
  type WorldRelationshipUpdateInput,
  type WorldResult,
  type WorldView,
  type WorldViewCreateInput,
  type WorldViewUpdateInput,
} from '../domain/worldGraph'
import {
  worldPromptApplyPreviewResponseSchema,
  worldPromptCancelTurnResponseSchema,
  worldPromptCancelGenerationJobRequestSchema,
  worldPromptCancelGenerationJobResponseSchema,
  worldPromptCreateSessionResponseSchema,
  worldPromptDismissSuggestionResponseSchema,
  worldPromptGenerationJobSchema,
  worldPromptGenerationJobStepSchema,
  worldPromptGenerationStatusRequestSchema,
  worldPromptGenerationStatusResponseSchema,
  worldPromptRefreshSuggestionsResponseSchema,
  worldPromptResolveOpResponseSchema,
  worldPromptSeedGenerationRequestSchema,
  worldPromptSeedGenerationResponseSchema,
  worldPromptSeedInferenceRequestSchema,
  worldPromptSeedInferenceResponseSchema,
  worldPromptSessionSchema,
  worldPromptSuggestionRecordSchema,
  worldPromptStartTurnRequestSchema,
  worldPromptStartTurnResponseSchema,
  worldPromptTurnSchema,
  type WorldPromptEvent,
  type WorldPromptGenerationJob,
  type WorldPromptGenerationJobStep,
  type WorldPromptGenerationStatusRequest,
  type WorldPromptGenerationStatusResponse,
  type WorldPromptMessage,
  type WorldPromptApplyPreviewRequest,
  type WorldPromptCancelTurnRequest,
  type WorldPromptCancelGenerationJobRequest,
  type WorldPromptCreateSessionRequest,
  type WorldPromptDismissSuggestionRequest,
  type WorldPromptRefreshSuggestionsRequest,
  type WorldPromptResolveOpRequest,
  type WorldPromptSeedGenerationRequest,
  type WorldPromptSeedInferenceRequest,
  type WorldPromptSession,
  type WorldPromptSuggestionRecord,
  type WorldPromptRefreshSuggestionsResponse,
  type WorldPromptStartTurnRequest,
  type WorldPromptSourceContext,
  type WorldPromptTurn,
} from '../domain/worldPrompt'
import {
  worldEntityIconGenerationStartResponseSchema,
  worldEntityIconGenerationStatusResponseSchema,
  type WorldEntityIconGenerationStartResponse,
  type WorldEntityIconGenerationStatusResponse,
} from '../domain/worldEntityIconGeneration'
import {
  worldBrandAtlasImageResponseSchema,
  type WorldBrandAtlasImageResponse,
} from '../domain/worldBrandAtlasImage'
import {
  visualGenerationCancelResponseSchema,
  visualGenerationJobSchema,
  visualGenerationStartRequestSchema,
  visualGenerationStartResponseSchema,
  visualGenerationStatusRequestSchema,
  visualGenerationStatusResponseSchema,
  type VisualGenerationCancelResponse,
  type VisualGenerationKind,
  type VisualGenerationJob,
  type VisualGenerationStartRequest,
  type VisualGenerationStartResponse,
  type VisualGenerationStatusResponse,
} from '../domain/visualGeneration'
import {
  appGenerationCancelResponseSchema,
  appGenerationStartRequestSchema,
  appGenerationStartResponseSchema,
  appGenerationStatusRequestSchema,
  appGenerationStatusResponseSchema,
  appPreviewSessionResponseSchema,
  type AppGenerationCancelResponse,
  type AppGenerationStartResponse,
  type AppGenerationStatusResponse,
  type AppPreviewSessionResponse,
} from '../domain/appPreviewPipeline'
import {
  outputArtifactResponseSchema,
  outputArtifactSchema,
  outputFeedResponseSchema,
  outputRequestDeleteResponseSchema,
  outputRequestSchema,
  outputRequestStartRequestSchema,
  outputRequestStatusRequestSchema,
  outputRequestStatusResponseSchema,
  outputWorkflowCancelResponseSchema,
  outputWorkflowEdgeSchema,
  outputWorkflowGraphRequestSchema,
  outputWorkflowGraphResponseSchema,
  outputWorkflowNodeSchema,
  outputWorkflowNodeUpdateRequestSchema,
  outputWorkflowNodeUpdateResponseSchema,
  outputWorkflowPlanRequestSchema,
  outputWorkflowPlanResponseSchema,
  outputWorkflowRepairRequestSchema,
  outputWorkflowRepairResponseSchema,
  outputWorkflowRunStepSchema,
  outputWorkflowRunStartRequestSchema,
  outputWorkflowRunStatusRequestSchema,
  outputWorkflowRunStatusResponseSchema,
  outputWorkflowRunSchema,
  outputWorkflowSchema,
  outputWorkflowStartRequestSchema,
  outputWorkflowStartResponseSchema,
  outputWorkflowUpgradeRequestSchema,
  outputWorkflowUpgradeResponseSchema,
  type OutputArtifact,
  type OutputFeedResponse,
  type OutputRequest,
  type OutputRequestDeleteResponse,
  type OutputRequestStatusResponse,
  type OutputWorkflow,
  type OutputWorkflowCancelResponse,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  type OutputWorkflowNodeUpdateResponse,
  type OutputWorkflowPlanRequest,
  type OutputWorkflowPlanResponse,
  type OutputWorkflowRepairRequest,
  type OutputWorkflowRepairResponse,
  type OutputWorkflowRun,
  type OutputWorkflowRunStep,
  type OutputWorkflowRunStatusResponse,
  type OutputWorkflowStartResponse,
  type OutputWorkflowUpgradeResponse,
} from '../domain/outputWorkflow'
import { buildUrlSourceContextFromExtractionResponse } from '../domain/onboardingSource'
import {
  worldThreadSchema,
  worldThreadUpdateInputSchema,
  type WorldThread,
  type WorldThreadUpdateInput,
} from '../domain/worldThread'
import {
  buildPreviewAssetKeyForComposition,
  buildWorldDerivedCompositionTitle,
  deriveMissingWorldEntities,
  deriveMissingWorldViews,
  isAutoDerivedWorldEntity,
  isAutoDerivedWorldView,
  isAutoManagedWorldView,
  reconcileAutoManagedWorldViews,
  resultTypeForOperatorType,
} from '../domain/worldGraphHelpers'
import {
  cinematicRunSchema,
  cinematicRunJobSchema,
  cinematicRunStatusResponseSchema,
  type CinematicRunCancelRequest,
  type CinematicRunStatusResponse,
  type CinematicRunStartRequest,
} from '../domain/cinematics'
import {
  cinematicDirectorNotePreviewRequestSchema,
  cinematicDirectorNotePreviewResponseSchema,
  cinematicDirectorPatchApplyRequestSchema,
  cinematicDirectorPatchApplyResponseSchema,
  type CinematicDirectorNotePreviewRequest,
  type CinematicDirectorNotePreviewResponse,
  type CinematicDirectorPatchApplyRequest,
  type CinematicDirectorPatchApplyResponse,
} from '../domain/cinematicDirectorNotes'
import { gameSpecSchema } from '../domain/gameSpec'
import { projectContextSchema, type ProjectContext } from '../domain/projectContext'
import {
  buildProjectContext,
  getCinematicFormatSubtypeForProjectSubtype,
  getCinematicPresetFamilyForProjectSubtype,
  getGameArchetypeIdForProjectSubtype,
} from '../domain/projectContextProfiles'
import { buildBootstrapPatch, createDefaultGameSpec } from '../domain/presetCatalog'
import type { PromptPatchRequest, PromptPatchResponse } from '../domain/prompting'
import {
  type DeleteGeneratedMeshRequest,
  type MeshGenerationPollRequest,
  type MeshGenerationStartRequest,
  meshGenerationStatusResponseSchema,
  type MeshGenerationStatusResponse,
  meshGenerationJobSchema,
} from '../domain/meshGeneration'
import {
  getResourceGenerationMetadata,
  worldBuildAuthorCinematicRequestSchema,
  worldBuildJobSchema,
  worldBuildPlanResponseSchema,
  worldBuildDeletePlaceholderResponseSchema,
  worldBuildRepairCinematicRequestSchema,
  worldBuildStatusResponseSchema,
  type WorldBuildAuthorCinematicRequest,
  type WorldBuildPlanRequest,
  type WorldBuildPlanResponse,
  type WorldBuildDeletePlaceholderRequest,
  type WorldBuildDeletePlaceholderResponse,
  type WorldBuildRepairCinematicRequest,
  type WorldBuildStartRequest,
  type WorldBuildStatusResponse,
} from '../domain/worldBuild'
import type { GameSummary } from '../shared/workspace'
import { supabase } from '../utils/supabase'
import { supabasePublishableKey, supabaseUrl } from '../config/supabaseConfig'
import type { FunctionsHttpError, Session } from '@supabase/supabase-js'

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isLiveSnapshot(snapshot: ProjectSnapshot) {
  return isUuidLike(snapshot.workspace.id) && isUuidLike(snapshot.project.id) && isUuidLike(snapshot.draft.id)
}

function hasLiveSnapshotIds(snapshot: { workspace?: { id: string } | null; project: { id: string }; draft: { id: string } }) {
  return (!snapshot.workspace || isUuidLike(snapshot.workspace.id)) && isUuidLike(snapshot.project.id) && isUuidLike(snapshot.draft.id)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function titleCase(value: string) {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function isMissingAbilityEnumError(message: string | undefined) {
  return typeof message === 'string' && message.includes('invalid input value for enum definition_kind: "ability"')
}

function isMissingDefinitionKindEnumError(message: string | undefined, kind: string) {
  return typeof message === 'string' && message.includes(`invalid input value for enum definition_kind: "${kind}"`)
}

function isMissingRelationError(
  error: { message?: string | null; details?: string | null; hint?: string | null; code?: string | null } | string | null | undefined,
  relation: string,
) {
  if (!error) return false
  if (typeof error !== 'string' && error.code === 'PGRST205') return true
  const candidates = typeof error === 'string'
    ? [error]
    : [error.message, error.details, error.hint].filter((value): value is string => typeof value === 'string')
  if (candidates.length === 0) return false
  return (
    candidates.some((message) => message.includes(`Could not find the table 'public.${relation}' in the schema cache`)) ||
    candidates.some((message) => message.includes(`relation "public.${relation}" does not exist`)) ||
    candidates.some((message) => message.includes(`relation "${relation}" does not exist`))
  )
}

function filterSupportedArchetypeSeedsForEnumError<TSeed extends { appliesToKind: string }>(
  seeds: TSeed[],
  message: string | undefined,
) {
  return seeds.filter((seed) => {
    if (isMissingAbilityEnumError(message) && seed.appliesToKind === 'ability') return false
    if (isMissingDefinitionKindEnumError(message, 'group') && seed.appliesToKind === 'group') return false
    if (isMissingDefinitionKindEnumError(message, 'concept') && seed.appliesToKind === 'concept') return false
    if (isMissingDefinitionKindEnumError(message, 'event') && seed.appliesToKind === 'event') return false
    if (isMissingDefinitionKindEnumError(message, 'environment') && seed.appliesToKind === 'environment') return false
    if (isMissingDefinitionKindEnumError(message, 'world_model') && seed.appliesToKind === 'world_model') return false
    return true
  })
}

function bootstrapSeedFromSession(session: Session) {
  const emailSeed = session.user.email?.split('@')[0] ?? 'graphcore'
  const cleanedSeed = slugify(emailSeed) || 'graphcore'
  return {
    cleanedSeed,
    workspaceName: `${titleCase(cleanedSeed)} Workspace`,
    projectName: `${titleCase(cleanedSeed)} Project`,
  }
}

function shouldBootstrapLiveProject(reason?: string) {
  return [
    'No GraphCore workspace was visible through RLS.',
    'No project data was found yet.',
    'Project exists, but it has no draft yet.',
  ].some((fragment) => reason?.includes(fragment))
}

async function readFunctionsErrorMessage(error: FunctionsHttpError | Error) {
  if (!('context' in error)) {
    return error.message
  }

  const context = (error as FunctionsHttpError & { context?: unknown }).context
  if (!(context instanceof Response)) {
    return error.message
  }

  try {
    const payload = await context.clone().json() as { error?: unknown }
    console.error('[GraphCore] edge function error payload', {
      status: context.status,
      statusText: context.statusText,
      payload,
    })
    if (typeof payload.error === 'string') {
      return payload.error
    }
    if (payload.error !== undefined) {
      return JSON.stringify(payload.error, null, 2)
    }
    return error.message
  } catch {
    try {
      const text = await context.clone().text()
      console.error('[GraphCore] edge function error text', {
        status: context.status,
        statusText: context.statusText,
        text,
      })
      return text || error.message
    } catch {
      return error.message
    }
  }
}

function summarizeFunctionBody(body: Record<string, unknown>) {
  const snapshot = body.snapshot && typeof body.snapshot === 'object'
    ? body.snapshot as {
        workspace?: { id?: string }
        project?: { id?: string; name?: string }
        draft?: { id?: string; name?: string }
        definitions?: unknown[]
        graphs?: unknown[]
        assets?: unknown[]
      }
    : null

  return {
    prompt: typeof body.prompt === 'string' ? body.prompt.slice(0, 180) : undefined,
    requestSummary: typeof body.requestSummary === 'string' ? body.requestSummary : undefined,
    plannerMode: typeof body.plannerMode === 'string' ? body.plannerMode : undefined,
    graphKey: typeof body.graphKey === 'string' ? body.graphKey : undefined,
    batchId: typeof body.batchId === 'string' ? body.batchId : undefined,
    mode: typeof body.mode === 'string' ? body.mode : undefined,
    model: typeof body.model === 'string' ? body.model : undefined,
    planItems:
      Array.isArray(body.planItems)
        ? body.planItems.map((item) => {
          const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
          return {
            id: typeof record.id === 'string' ? record.id : undefined,
            kind: typeof record.kind === 'string' ? record.kind : undefined,
            enabled: typeof record.enabled === 'boolean' ? record.enabled : undefined,
          }
        })
        : undefined,
    snapshot: snapshot
      ? {
          workspaceId: snapshot.workspace?.id,
          projectId: snapshot.project?.id,
          projectName: snapshot.project?.name,
          draftId: snapshot.draft?.id,
          draftName: snapshot.draft?.name,
          definitionCount: Array.isArray(snapshot.definitions) ? snapshot.definitions.length : undefined,
          graphCount: Array.isArray(snapshot.graphs) ? snapshot.graphs.length : undefined,
          assetCount: Array.isArray(snapshot.assets) ? snapshot.assets.length : undefined,
        }
      : undefined,
  }
}

function readGenerationQueueMetadata(resultContext: unknown) {
  const context = resultContext && typeof resultContext === 'object'
    ? resultContext as Record<string, unknown>
    : {}

  return {
    providerRequestId: typeof context.providerRequestId === 'string'
      ? context.providerRequestId
      : typeof context.requestId === 'string'
        ? context.requestId
        : null,
    statusUrl: typeof context.statusUrl === 'string' ? context.statusUrl : null,
    responseUrl: typeof context.responseUrl === 'string' ? context.responseUrl : null,
    cancelUrl: typeof context.cancelUrl === 'string' ? context.cancelUrl : null,
  }
}

async function getValidatedSession(signInMessage: string) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  if (!session) {
    throw new Error(signInMessage)
  }

  const initialUserCheck = await supabase.auth.getUser(session.access_token)
  if (!initialUserCheck.error && initialUserCheck.data.user) {
    return session
  }

  console.error('[GraphCore] Supabase session validation failed before edge invoke.', {
    message: initialUserCheck.error?.message ?? 'Unknown auth validation error.',
  })

  const refreshed = await supabase.auth.refreshSession()
  if (refreshed.error) {
    throw refreshed.error
  }

  if (!refreshed.data.session) {
    throw new Error(signInMessage)
  }

  const refreshedUserCheck = await supabase.auth.getUser(refreshed.data.session.access_token)
  if (refreshedUserCheck.error || !refreshedUserCheck.data.user) {
    throw new Error('Your Supabase session is invalid. Sign out and sign in again.')
  }

  return refreshed.data.session
}

async function readFunctionsErrorPayload<TPayload>(error: FunctionsHttpError | Error) {
  if (!('context' in error)) {
    return null
  }

  const context = (error as FunctionsHttpError & { context?: unknown }).context
  if (!(context instanceof Response)) {
    return null
  }

  try {
    return await context.clone().json() as TPayload
  } catch {
    return null
  }
}

export type SnapshotLoadResult = {
  snapshot: ProjectSnapshot
  source: 'supabase' | 'demo'
  reason?: string
  profile?: SnapshotLoadProfile
  games?: GameSummary[]
}

export type SnapshotLoadProfile = 'shell' | 'world' | 'content' | 'jobs' | 'full'

export type SnapshotLoadOptions = {
  profile?: SnapshotLoadProfile
  promptHistoryLimit?: number
  skipCache?: boolean
  hydrateAssetUrls?: boolean
}

export type DraftRevision = number
export const GRAPHCORE_CACHE_SCHEMA_VERSION = 'world-cache-v6' as const
export type GraphCoreCacheSchemaVersion = typeof GRAPHCORE_CACHE_SCHEMA_VERSION

export type DraftDeltaResponse = {
  currentRevision: DraftRevision
  requiresSnapshot: boolean
  changedKeysByTable: Record<string, string[]>
  deletedKeysByTable: Record<string, string[]>
  compactRows: Record<string, unknown[]>
}

export type GraphCoreClientCacheSnapshot = {
  projectId: string
  draftId: string
  cacheSchemaVersion: GraphCoreCacheSchemaVersion
  profile?: 'world'
  lastRevision: DraftRevision
  cachedAt: string
  rowCounts?: Record<string, number>
  snapshot: ProjectSnapshot
}

export type OutputInboxSlice = {
  requests: OutputRequest[]
  workflows: OutputWorkflow[]
  runs: OutputWorkflowRun[]
  artifacts: OutputArtifact[]
  assets: AssetDefinition[]
  page: {
    limit: number
    hasMore: boolean
    nextCursor: string | null
  }
}

export type GraphCoreClientOutputInboxCache = {
  projectId: string
  draftId: string
  cacheSchemaVersion: GraphCoreCacheSchemaVersion
  profile: 'outputs'
  cachedAt: string
  rowCounts?: Record<string, number>
  inbox: OutputInboxSlice
}

const DEFAULT_SNAPSHOT_LOAD_PROFILE: SnapshotLoadProfile = 'world'
const DEFAULT_PROMPT_HISTORY_LIMIT = 30
const POSTGREST_EGRESS_WARNING_BYTES = 250_000
const WORLD_BUILD_ACTIVE_STATUSES = ['planned', 'running'] as const
const MESH_GENERATION_ACTIVE_STATUSES = ['queued', 'submitting', 'running'] as const
const CINEMATIC_RUN_ACTIVE_STATUSES = ['queued', 'running'] as const
const GRAPHCORE_CACHE_DB_NAME = 'graphcore-client-cache'
const GRAPHCORE_CACHE_DB_VERSION = 1
const GRAPHCORE_CACHE_STORE = 'snapshots'
const SESSION_LIST_GAMES_TTL_MS = 60_000
const SESSION_DRAFT_METADATA_TTL_MS = 30_000
const SESSION_OUTPUT_FEED_ACTIVE_TTL_MS = 10_000
const SESSION_OUTPUT_FEED_INACTIVE_TTL_MS = 60_000
const SESSION_GRAPH_REVISION_TTL_MS = 10_000

const listGamesSessionCache = new Map<string, { expiresAt: number; games: GameSummary[] }>()
const draftMetadataSessionCache = new Map<string, { expiresAt: number; metadata: Record<string, unknown> }>()
const outputFeedSessionCache = new Map<string, { expiresAt: number; revision: string; result: OutputInboxLoadResult }>()
const outputGraphRevisionSessionCache = new Map<string, { expiresAt: number; revision: string }>()
const selectedGraphNodeOutputSessionCache = new Map<string, { expiresAt: number; result: OutputWorkflowGraphLoadResult }>()
const activeWorkspaceStateSessionCache = new Map<string, { projectId: string; draftId: string }>()
type PrimaryWorkspaceMembership = {
  workspace: { id: string; name: string; slug: string }
  role: ProjectSnapshot['workspace']['role']
}

const primaryWorkspaceSessionCache = new Map<string, { expiresAt: number; membership: PrimaryWorkspaceMembership }>()

function isEgressDebugEnabled() {
  return typeof import.meta !== 'undefined'
    && typeof import.meta.env?.VITE_GRAPHCORE_EGRESS_DEBUG === 'string'
    && import.meta.env.VITE_GRAPHCORE_EGRESS_DEBUG.toLowerCase() === 'true'
}

function estimateJsonBytes(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length
  } catch {
    return 0
  }
}

function logPostgrestEgress(input: {
  table: string
  profile: SnapshotLoadProfile
  caller: string
  data: unknown
}) {
  const bytes = estimateJsonBytes(input.data)
  if (!isEgressDebugEnabled() && bytes < POSTGREST_EGRESS_WARNING_BYTES) return
  const rows = Array.isArray(input.data) ? input.data.length : input.data ? 1 : 0
  const level = bytes >= POSTGREST_EGRESS_WARNING_BYTES ? 'warn' : 'info'
  console[level]('[GraphCore] PostgREST payload', {
    caller: input.caller,
    profile: input.profile,
    table: input.table,
    rows,
    bytes,
  })
}

function emptyPostgrestResponse() {
  return { data: [], error: null, status: 200, statusText: 'OK', count: null }
}

function postgrestStatus(response: { status?: number }) {
  return response.status ?? 200
}

function cacheKeyForProjectDraft(projectId: string, draftId: string) {
  return `graphcore:project:${projectId}:draft:${draftId}:cache:v1`
}

function cacheKeyForOutputInbox(projectId: string, draftId: string) {
  return `graphcore:project:${projectId}:draft:${draftId}:outputs:v1`
}

function openGraphCoreCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(GRAPHCORE_CACHE_DB_NAME, GRAPHCORE_CACHE_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(GRAPHCORE_CACHE_STORE)) {
        db.createObjectStore(GRAPHCORE_CACHE_STORE, { keyPath: 'cacheKey' })
      }
    }
    request.onerror = () => resolve(null)
    request.onsuccess = () => resolve(request.result)
  })
}

async function withCacheStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openGraphCoreCacheDb()
  if (!db) return null
  return new Promise((resolve) => {
    const transaction = db.transaction(GRAPHCORE_CACHE_STORE, mode)
    const store = transaction.objectStore(GRAPHCORE_CACHE_STORE)
    const request = action(store)
    request.onerror = () => resolve(null)
    request.onsuccess = () => resolve(request.result ?? null)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => {
      db.close()
      resolve(null)
    }
  })
}

type WorkspaceMembershipRow = {
  role: ProjectSnapshot['workspace']['role']
  workspace: { id: string; name: string; slug: string } | Array<{ id: string; name: string; slug: string }>
}

type ActiveWorkspaceStateRow = {
  workspace_id: string
  active_project_id: string | null
  active_draft_id: string | null
}

type LocalActiveGameSelection = Record<string, { projectId: string; draftId: string }>

type ProjectSummaryRow = {
  id: string
  name: string
  slug: string
  summary: string
  visibility: ProjectSnapshot['project']['visibility']
  updated_at?: string
  created_at?: string
}

export type GlobalProjectContextUpdate = {
  projectName: string
  projectDescription: string
  artStylePreset: string
  artStyleDescription: string
}

export type ProjectOnboardingContextUpdate = {
  projectName?: string
  projectContext: ProjectContext
}

type DraftSummaryRow = {
  id: string
  project_id: string
  name: string
  version: number
  is_primary: boolean
  updated_at: string
  metadata: Record<string, unknown> | null
}

function sanitizePromptPatchResponse(response: PromptPatchResponse, request: PromptPatchRequest) {
  if (typeof response.debugRawOutput === 'string' && response.debugRawOutput.trim()) {
    console.error('[GraphCore] prompt-patch raw model output', {
      prompt: request.prompt,
      context: request.context,
      model: request.model,
      rawOutput: response.debugRawOutput,
    })
  }

  const { debugRawOutput: _debugRawOutput, ...visibleResponse } = response
  return visibleResponse
}

function prettyNameFromKey(key: string) {
  return key
    .replace(/^[^.]+\./, '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function defaultComponentsForKind(kind: DefinitionBase['kind']) {
  return buildDefaultDefinitionComponents(kind)
}

function definitionKindForWorldNodeType(nodeType: WorldEntity['nodeType']): DefinitionBase['kind'] | null {
  switch (nodeType) {
    case 'actor':
      return 'character'
    case 'group':
      return 'group'
    case 'place':
      return 'environment'
    case 'object':
      return 'item'
    case 'concept':
      return 'concept'
    case 'event':
      return 'event'
    default:
      return null
  }
}

function worldEntityRequiresLinkedDefinition(nodeType: WorldEntity['nodeType']) {
  return nodeType === 'actor' || nodeType === 'place' || nodeType === 'object'
}

function buildWorldEntityKey(existingKeys: string[], nodeType: WorldEntity['nodeType'], seed: string) {
  const slug = slugify(seed) || nodeType
  let candidate = `world.${nodeType}.${slug}`
  let index = 2
  while (existingKeys.includes(candidate)) {
    candidate = `world.${nodeType}.${slug}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldRelationshipKey(existingKeys: string[], sourceEntityKey: string, verb: string, targetEntityKey: string) {
  const sourceSeed = sourceEntityKey.split('.').slice(-1)[0] ?? 'source'
  const targetSeed = targetEntityKey.split('.').slice(-1)[0] ?? 'target'
  const base = `world.relationship.${slugify(`${sourceSeed}-${verb}-${targetSeed}`) || 'link'}`
  let candidate = base
  let index = 2
  while (existingKeys.includes(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldViewKey(existingKeys: string[], seed: string) {
  const base = `world.view.${slugify(seed) || 'view'}`
  let candidate = base
  let index = 2
  while (existingKeys.includes(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldOperatorKey(existingKeys: string[], sourceEntityKey: string, operatorType: WorldOperator['operatorType'], targetEntityKey: string) {
  const sourceSeed = sourceEntityKey.split('.').slice(-1)[0] ?? 'source'
  const targetSeed = targetEntityKey.split('.').slice(-1)[0] ?? 'target'
  const base = `world.operator.${slugify(`${sourceSeed}-${operatorType}-${targetSeed}`) || 'operator'}`
  let candidate = base
  let index = 2
  while (existingKeys.includes(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldResultKey(existingKeys: string[], seed: string) {
  const base = `world.result.${slugify(seed) || 'result'}`
  let candidate = base
  let index = 2
  while (existingKeys.includes(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldGraphConnectionKey(existingKeys: string[], seed: string) {
  const base = `world.connection.${slugify(seed) || 'connection'}`
  let candidate = base
  let index = 2
  while (existingKeys.includes(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

async function resolvePersistedWorldEntityId(
  snapshot: ProjectSnapshot,
  entity: Pick<WorldEntity, 'id' | 'key'>,
) {
  if (isUuidLike(entity.id)) {
    return entity.id
  }

  const entityResponse = await supabase
    .from('world_entities')
    .select('id')
    .eq('draft_id', snapshot.draft.id)
    .eq('key', entity.key)
    .maybeSingle()

  if (entityResponse.error) {
    throw new Error(entityResponse.error.message)
  }
  if (!entityResponse.data?.id) {
    throw new Error(`World entity "${entity.key}" was not found in Supabase.`)
  }

  return entityResponse.data.id
}

async function reloadLiveSnapshot(snapshot: ProjectSnapshot) {
  const reloaded = await loadProjectSnapshot({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
  }, { profile: 'world' })

  if (reloaded.source !== 'supabase') {
    throw new Error(reloaded.reason ?? 'World graph reload fell back to the demo snapshot unexpectedly.')
  }

  return reloaded.snapshot
}

async function createLinkedDefinitionForWorldEntity(
  snapshot: ProjectSnapshot,
  input: WorldEntityCreateInput,
): Promise<{ linkedDefinitionKey: string | null; linkedDefinition: ProjectSnapshot['definitions'][number] | null }> {
  const definitionKind = definitionKindForWorldNodeType(input.nodeType)
  if (!definitionKind) return { linkedDefinitionKey: null, linkedDefinition: null }
  if (input.linkedDefinitionKey) return { linkedDefinitionKey: input.linkedDefinitionKey, linkedDefinition: null }
  if (!input.ensureLinkedDefinition && !worldEntityRequiresLinkedDefinition(input.nodeType)) return { linkedDefinitionKey: null, linkedDefinition: null }

  const existingDefinitionKeys = snapshot.definitions
    .filter((definition) => definition.kind === definitionKind)
    .map((definition) => definition.key)
  const definitionKey = `${definitionKind}.${slugify(input.name) || definitionKind}`
  let nextDefinitionKey = definitionKey
  let index = 2
  while (existingDefinitionKeys.includes(nextDefinitionKey)) {
    nextDefinitionKey = `${definitionKey}_${index}`
    index += 1
  }

  const definitionInsert = await supabase
    .from('project_definitions')
    .insert({
      draft_id: snapshot.draft.id,
      key: nextDefinitionKey,
      kind: definitionKind,
      name: input.name,
      summary: input.summary,
      status: 'draft',
      icon_asset_key: input.thumbnailAssetKey,
      tags: input.tags,
      schema_version: 1,
      metadata: {},
      llm_hints: {},
      asset_refs: [],
      definition_data: {},
    })
    .select('id, key')
    .single()

  if (definitionInsert.error) {
    throw new Error(definitionInsert.error.message)
  }

  const componentRows = defaultComponentsForKind(definitionKind).map((component) => ({
    definition_id: definitionInsert.data.id,
    component_type: component.type,
    config: component.config,
  }))

  if (componentRows.length > 0) {
    const componentInsert = await supabase.from('project_definition_components').insert(componentRows)
    if (componentInsert.error) {
      throw new Error(componentInsert.error.message)
    }
  }

  return {
    linkedDefinitionKey: definitionInsert.data.key,
    linkedDefinition: {
      id: definitionInsert.data.id,
      key: definitionInsert.data.key,
      kind: definitionKind,
      name: input.name,
      summary: input.summary,
      status: 'draft' as const,
      iconAssetKey: input.thumbnailAssetKey,
      archetypeKey: null,
      tags: input.tags,
      schemaVersion: 1,
      metadata: {},
      llmHints: {},
      assetRefs: [],
      definitionData: {},
      fieldValues: [],
      customFields: [],
      components: defaultComponentsForKind(definitionKind),
    },
  }
}

async function syncLinkedDefinitionFromWorldEntity(
  snapshot: ProjectSnapshot,
  entity: Pick<WorldEntity, 'nodeType' | 'name' | 'summary' | 'thumbnailAssetKey' | 'linkedDefinitionKey' | 'tags'>,
) {
  const linkedDefinitionKey = entity.linkedDefinitionKey ?? null
  if (!linkedDefinitionKey) {
    return { definitions: snapshot.definitions, linkedDefinition: null }
  }
  const existingDefinition = snapshot.definitions.find((definition) => definition.key === linkedDefinitionKey) ?? null
  const expectedKind = definitionKindForWorldNodeType(entity.nodeType)
  if (!existingDefinition || !expectedKind || existingDefinition.kind !== expectedKind) {
    return { definitions: snapshot.definitions, linkedDefinition: null }
  }

  const nextDefinition: ProjectSnapshot['definitions'][number] = {
    ...existingDefinition,
    name: entity.name,
    summary: entity.summary,
    iconAssetKey: entity.thumbnailAssetKey ?? null,
    tags: entity.tags ?? [],
  }

  const updateResponse = await supabase
    .from('project_definitions')
    .update({
      name: nextDefinition.name,
      summary: nextDefinition.summary,
      icon_asset_key: nextDefinition.iconAssetKey,
      tags: nextDefinition.tags,
    })
    .eq('draft_id', snapshot.draft.id)
    .eq('key', linkedDefinitionKey)

  if (updateResponse.error) {
    throw new Error(updateResponse.error.message)
  }

  return {
    definitions: upsertEntryByKey(snapshot.definitions, nextDefinition),
    linkedDefinition: nextDefinition,
  }
}

function localPatchDiagnostics(fallbackReason: string | null) {
  return [
    'Fallback patch generated locally because the prompt backend was unavailable.',
    fallbackReason ? `Reason: ${fallbackReason}` : 'Reason: unknown prompt backend failure.',
  ]
}

async function getPrimaryWorkspace(session: Session): Promise<PrimaryWorkspaceMembership | null> {
  const cached = primaryWorkspaceSessionCache.get(session.user.id)
  if (cached && cached.expiresAt > Date.now()) return cached.membership

  const workspaceResponse = await supabase
    .from('workspace_memberships')
    .select('role, workspace:workspaces!inner(id, name, slug)')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (workspaceResponse.error || !workspaceResponse.data?.workspace) {
    return null
  }

  const row = workspaceResponse.data as WorkspaceMembershipRow
  const workspace = Array.isArray(row.workspace) ? row.workspace[0] : row.workspace
  if (!workspace) return null

  const membership = {
    workspace,
    role: row.role,
  }
  primaryWorkspaceSessionCache.set(session.user.id, {
    membership,
    expiresAt: Date.now() + SESSION_LIST_GAMES_TTL_MS,
  })
  return membership
}

function isMissingUserWorkspaceStateTableError(message: string | undefined) {
  if (typeof message !== 'string') return false
  return (
    message.includes(`Could not find the table 'public.user_workspace_state' in the schema cache`) ||
    message.includes('relation "public.user_workspace_state" does not exist') ||
    message.includes('relation "user_workspace_state" does not exist')
  )
}

function readLocalActiveGameSelection() {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem('graphcore.active-game-selection.v1')
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LocalActiveGameSelection
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalActiveGameSelection(nextSelection: LocalActiveGameSelection) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem('graphcore.active-game-selection.v1', JSON.stringify(nextSelection))
  } catch {
    // Ignore local persistence failures and keep the session usable.
  }
}

function getLocalActiveGameSelection(workspaceId: string) {
  return readLocalActiveGameSelection()[workspaceId] ?? null
}

function setLocalActiveGameSelection(workspaceId: string, projectId: string, draftId: string) {
  const current = readLocalActiveGameSelection()
  current[workspaceId] = { projectId, draftId }
  writeLocalActiveGameSelection(current)
}

async function setActiveWorkspaceGameState(workspaceId: string, projectId: string, draftId: string) {
  const cachedActive = activeWorkspaceStateSessionCache.get(workspaceId)
  if (cachedActive?.projectId === projectId && cachedActive.draftId === draftId) {
    setLocalActiveGameSelection(workspaceId, projectId, draftId)
    return
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Sign in before selecting an active game.')
  }

  const response = await supabase
    .from('user_workspace_state')
    .upsert(
      {
        user_id: session.user.id,
        workspace_id: workspaceId,
        active_project_id: projectId,
        active_draft_id: draftId,
      },
      { onConflict: 'user_id,workspace_id' },
    )

  if (response.error) {
    if (isMissingUserWorkspaceStateTableError(response.error.message)) {
      setLocalActiveGameSelection(workspaceId, projectId, draftId)
      return
    }
    throw new Error(response.error.message)
  }

  setLocalActiveGameSelection(workspaceId, projectId, draftId)
  activeWorkspaceStateSessionCache.set(workspaceId, { projectId, draftId })
}

function extractBootstrapStatus(metadata: Record<string, unknown> | null | undefined) {
  const status = metadata?.bootstrapStatus
  return status === 'complete' ? 'complete' : 'pending'
}

function draftHasGameSpec(metadata: Record<string, unknown> | null | undefined) {
  return Boolean(metadata && typeof metadata === 'object' && metadata.gameSpec)
}

async function listWorkspaceProjectsAndDrafts(workspaceId: string) {
  const projectResponse = await supabase
    .from('projects')
    .select('id, name, slug, summary, visibility, updated_at, created_at')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })

  if (projectResponse.error) {
    throw new Error(projectResponse.error.message)
  }

  const projects = (projectResponse.data as ProjectSummaryRow[] | null) ?? []
  if (projects.length === 0) {
    return { projects, draftsByProjectId: new Map<string, DraftSummaryRow[]>() }
  }

  const projectIds = projects.map((project) => project.id)
  const draftResponse = await supabase
    .from('project_drafts')
    .select('id, project_id, name, version, is_primary, updated_at, metadata')
    .in('project_id', projectIds)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })

  if (draftResponse.error) {
    throw new Error(draftResponse.error.message)
  }

  const drafts = (draftResponse.data as DraftSummaryRow[] | null) ?? []
  const draftsByProjectId = drafts.reduce<Map<string, DraftSummaryRow[]>>((acc, draft) => {
    const current = acc.get(draft.project_id) ?? []
    current.push(draft)
    acc.set(draft.project_id, current)
    return acc
  }, new Map())

  return { projects, draftsByProjectId }
}

function pickPreferredDraft(drafts: DraftSummaryRow[]) {
  return [...drafts].sort((left, right) => {
    if (left.is_primary !== right.is_primary) return left.is_primary ? -1 : 1
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  })[0] ?? null
}

function buildGameSummaries(projects: ProjectSummaryRow[], draftsByProjectId: Map<string, DraftSummaryRow[]>): GameSummary[] {
  return projects
    .map((project) => {
      const draft = pickPreferredDraft(draftsByProjectId.get(project.id) ?? [])
      if (!draft) return null
      return {
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        draftId: draft.id,
        draftName: draft.name,
        updatedAt: draft.updated_at,
        bootstrapStatus: extractBootstrapStatus(draft.metadata),
        hasGameSpec: draftHasGameSpec(draft.metadata),
      } satisfies GameSummary
    })
    .filter((entry): entry is GameSummary => entry !== null)
}

async function resolveActiveGameSelection(session: Session, workspaceId: string) {
  const [{ projects, draftsByProjectId }, activeStateResponse] = await Promise.all([
    listWorkspaceProjectsAndDrafts(workspaceId),
    supabase
      .from('user_workspace_state')
      .select('workspace_id, active_project_id, active_draft_id')
      .eq('user_id', session.user.id)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
  ])

  const activeState = activeStateResponse.error
    ? (
        isMissingUserWorkspaceStateTableError(activeStateResponse.error.message)
          ? null
          : (() => {
              throw new Error(activeStateResponse.error.message)
            })()
      )
    : (activeStateResponse.data as ActiveWorkspaceStateRow | null)
  const localActiveState = getLocalActiveGameSelection(workspaceId)
  if (activeState?.active_project_id && activeState.active_draft_id) {
    activeWorkspaceStateSessionCache.set(workspaceId, {
      projectId: activeState.active_project_id,
      draftId: activeState.active_draft_id,
    })
  }

  const activeProjectId = activeState?.active_project_id ?? localActiveState?.projectId ?? null
  const activeDraftId = activeState?.active_draft_id ?? localActiveState?.draftId ?? null
  const activeProject = activeProjectId
    ? projects.find((project) => project.id === activeProjectId) ?? null
    : null
  const activeDraft = activeProject
    ? (draftsByProjectId.get(activeProject.id) ?? []).find((draft) => draft.id === activeDraftId) ?? null
    : null

  if (activeProject && activeDraft) {
    return {
      project: activeProject,
      draft: activeDraft,
      projects,
      draftsByProjectId,
      games: buildGameSummaries(projects, draftsByProjectId),
    }
  }

  const fallbackProject = projects[0] ?? null
  const fallbackDraft = fallbackProject ? pickPreferredDraft(draftsByProjectId.get(fallbackProject.id) ?? []) : null

  if (fallbackProject && fallbackDraft) {
    await setActiveWorkspaceGameState(workspaceId, fallbackProject.id, fallbackDraft.id)
  }

  return {
    project: fallbackProject,
    draft: fallbackDraft,
    projects,
    draftsByProjectId,
    games: buildGameSummaries(projects, draftsByProjectId),
  }
}

async function invokeAuthedFunction<TResponse>(
  functionName: string,
  body: Record<string, unknown>,
  session: Session,
) {
  const functionsClient = supabase.functions
  functionsClient.setAuth(session.access_token)
  return functionsClient.invoke<TResponse>(functionName, {
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body,
  })
}

async function invokeAuthedFunctionDirect(
  functionName: string,
  body: Record<string, unknown>,
  session: Session,
) {
  const publishableKey = supabasePublishableKey

  async function invokeDirect(accessToken: string) {
    return fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  }

  let response = await invokeDirect(session.access_token)

  if (response.status === 401) {
    const refreshed = await supabase.auth.refreshSession()
    if (refreshed.error) {
      throw refreshed.error
    }
    if (!refreshed.data.session) {
      throw new Error('No authenticated Supabase session was available after refresh.')
    }
    response = await invokeDirect(refreshed.data.session.access_token)
  }

  if (!response.ok) {
    const payload = await response.clone().json().catch(() => null) as { error?: unknown } | null
    console.error(`[GraphCore] ${functionName} direct invocation failed.`, {
      status: response.status,
      statusText: response.statusText,
      request: summarizeFunctionBody(body),
      errorPayload: payload,
    })
    if (typeof payload?.error === 'string') {
      throw new Error(payload.error)
    }
    throw new Error(`${functionName} failed with HTTP ${response.status}.`)
  }

  return response.json()
}

function isUnauthorizedFunctionsError(error: FunctionsHttpError | Error) {
  if (!('context' in error)) {
    return false
  }

  const context = (error as FunctionsHttpError & { context?: unknown }).context
  return context instanceof Response && context.status === 401
}

async function invokeAuthedFunctionWithSessionRecovery<TResponse>(
  functionName: string,
  body: Record<string, unknown>,
  session: Session,
) {
  let activeSession = session
  let response = await invokeAuthedFunction<TResponse>(functionName, body, session)

  if (response.error && isUnauthorizedFunctionsError(response.error)) {
    const refreshed = await supabase.auth.refreshSession()
    if (refreshed.error) {
      throw refreshed.error
    }

    if (!refreshed.data.session) {
      throw new Error('No authenticated Supabase session was available after refresh.')
    }

    activeSession = refreshed.data.session
    response = await invokeAuthedFunction<TResponse>(functionName, body, activeSession)
  }

  if (response.error && isUnauthorizedFunctionsError(response.error)) {
    try {
      const directData = await invokeAuthedFunctionDirect(functionName, body, activeSession) as TResponse
      return {
        data: directData,
        error: null,
      }
    } catch (directError) {
      console.error(`[GraphCore] ${functionName} direct fallback after SDK 401 failed.`, directError)
    }
  }

  if (!response.error) {
    return response
  }

  const isTransientNetworkFailure =
    response.error.message === 'Failed to send a request to the Edge Function'
    || ('context' in response.error && (response.error as FunctionsHttpError & { context?: unknown }).context instanceof Response
      && ((response.error as FunctionsHttpError & { context?: Response }).context?.status ?? 0) >= 500)

  if (isTransientNetworkFailure && functionName === 'poll-world-build') {
    await new Promise((resolve) => window.setTimeout(resolve, 1200))
    response = await invokeAuthedFunction<TResponse>(functionName, body, session)
    if (!response.error) {
      return response
    }
  }

  const context = 'context' in response.error ? (response.error as FunctionsHttpError & { context?: unknown }).context : null
  const responseInfo = context instanceof Response
    ? {
        status: context.status,
        statusText: context.statusText,
      }
    : null
  const errorPayload = await readFunctionsErrorPayload<Record<string, unknown> | string>(response.error)

  console.error(`[GraphCore] ${functionName} SDK invocation failed.`, {
    message: response.error.message,
    response: responseInfo,
    request: summarizeFunctionBody(body),
    errorPayload,
  })
  return response
}

async function seedBaselineArchetypesDirect(draftId: string, userId: string) {
  const existingArchetypesResponse = await supabase
    .from('project_archetypes')
    .select('id, key')
    .eq('draft_id', draftId)

  if (existingArchetypesResponse.error) {
    throw new Error(existingArchetypesResponse.error.message)
  }

  const existingArchetypes = existingArchetypesResponse.data ?? []
  const existingByKey = new Map(existingArchetypes.map((row) => [row.key, row.id]))
  const missingSeeds = BASELINE_ARCHETYPES.filter((seed) => !existingByKey.has(seed.key))

  if (missingSeeds.length > 0) {
    const seedRows = (seeds: typeof missingSeeds) =>
      seeds.map((seed) => ({
        draft_id: draftId,
        key: seed.key,
        name: seed.name,
        summary: seed.summary,
        definition_kind: seed.appliesToKind,
        icon_asset_key: seed.iconAssetKey,
        metadata: seed.metadata,
        llm_hints: seed.llmHints,
        created_by: userId,
      }))

    const insertResponse = await supabase
      .from('project_archetypes')
      .insert(seedRows(missingSeeds))
      .select('id, key')

    const recoveredSeeds = insertResponse.error
      ? filterSupportedArchetypeSeedsForEnumError(missingSeeds, insertResponse.error.message)
      : missingSeeds

    const recoveredResponse = insertResponse.error && recoveredSeeds.length !== missingSeeds.length
      ? await supabase
          .from('project_archetypes')
          .insert(seedRows(recoveredSeeds))
          .select('id, key')
      : insertResponse

    if (recoveredResponse.error) {
      throw new Error(recoveredResponse.error.message)
    }

    for (const row of recoveredResponse.data ?? []) {
      existingByKey.set(row.key, row.id)
    }
  }

  const archetypeIds = [...existingByKey.values()]
  if (archetypeIds.length === 0) {
    return false
  }

  const existingFieldsResponse = await supabase
    .from('project_archetype_fields')
    .select('archetype_id, key')
    .eq('draft_id', draftId)
    .not('archetype_id', 'is', null)
    .in('archetype_id', archetypeIds)

  if (existingFieldsResponse.error) {
    throw new Error(existingFieldsResponse.error.message)
  }

  const existingFieldKeys = new Set(
    (existingFieldsResponse.data ?? []).map((row) => `${row.archetype_id}:${row.key}`),
  )

  const fieldRows = BASELINE_ARCHETYPES.flatMap((seed) => {
    const archetypeId = existingByKey.get(seed.key)
    if (!archetypeId) {
      return []
    }

    return seed.fields
      .filter((field) => !existingFieldKeys.has(`${archetypeId}:${field.key}`))
      .map((field) => ({
        draft_id: draftId,
        archetype_id: archetypeId,
        key: field.key,
        label: field.label,
        field_type: field.fieldType,
        description: field.description,
        required: field.required,
        default_value: field.defaultValue,
        constraints: field.constraints,
        sort_order: field.sortOrder,
      }))
  })

  if (fieldRows.length > 0) {
    const insertFieldsResponse = await supabase
      .from('project_archetype_fields')
      .insert(fieldRows)

    if (insertFieldsResponse.error) {
      throw new Error(insertFieldsResponse.error.message)
    }
  }

  return missingSeeds.length > 0 || fieldRows.length > 0
}

type DefinitionRow = {
  id: string
  key: string
  kind: DefinitionBase['kind']
  name: string
  summary: string
  status: DefinitionBase['status']
  icon_asset_key: string | null
  archetype_key: string | null
  tags: string[] | null
  schema_version: number
  metadata: Record<string, unknown> | null
  llm_hints: Record<string, unknown> | null
  asset_refs: unknown[] | null
  definition_data: Record<string, unknown> | null
}

type ComponentRow = {
  definition_id: string
  component_type: ComponentEnvelope['type']
  config: Record<string, unknown>
}

type ArchetypeRow = {
  id: string
  key: string
  name: string
  summary: string
  definition_kind: ArchetypeDefinition['appliesToKind']
  icon_asset_key: string | null
  metadata: Record<string, unknown> | null
  llm_hints: Record<string, unknown> | null
}

type FieldRow = {
  id: string
  draft_id: string
  archetype_id: string | null
  definition_id: string | null
  key: string
  label: string
  field_type: FieldDefinition['fieldType']
  description: string | null
  required: boolean
  default_value: string | number | boolean | null
  constraints: Record<string, unknown> | null
  sort_order: number
}

type DefinitionFieldValueRow = {
  definition_id: string
  field_key: string
  value: string | number | boolean | null
}

type GraphRow = {
  id: string
  key: string
  name: string
  graph_type: GraphDefinition['graphType']
  summary: string
  entry_node_key: string | null
  metadata: Record<string, unknown> | null
  llm_hints: Record<string, unknown> | null
}

type NodeRow = {
  id: string
  graph_id: string
  key: string
  node_type: GraphDefinition['nodes'][number]['type']
  title: string
  template_key: string | null
  subtitle: string | null
  position_x: number
  position_y: number
  body: Record<string, unknown> | null
  condition_expr: Record<string, unknown> | null
  effect_ops: Record<string, unknown>[] | null
  ports: Record<string, unknown>[] | null
  display: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

type EdgeRow = {
  id: string
  graph_id: string
  key: string
  source_node_key: string
  source_port: string | null
  target_node_key: string
  target_port: string | null
  label: string | null
  condition_expr: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

type AssemblyGraphRow = {
  id: string
  key: string
  name: string
  summary: string
  bound_environment_key: string | null
  metadata: Record<string, unknown> | null
}

type AssemblyNodeRow = {
  id: string
  assembly_graph_id: string
  key: string
  kind: AssemblyNodeDefinition['kind']
  title: string
  subtitle: string | null
  position_x: number
  position_y: number
  ports: Record<string, unknown>[] | null
  params: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

type AssemblyEdgeRow = {
  id: string
  assembly_graph_id: string
  key: string
  source_node_key: string
  source_port: string
  target_node_key: string
  target_port: string
  metadata: Record<string, unknown> | null
}

type EnvironmentBlueprintRow = {
  id: string
  key: string
  environment_key: string
  name: string
  document: unknown
}

type AssetRow = {
  id: string
  project_id: string
  key: string
  name: string
  kind: AssetDefinition['kind']
  mime_type: string
  storage_path: string
  metadata: Record<string, unknown> | null
  llm_hints: Record<string, unknown> | null
}

type WorldEntityRow = {
  id: string
  key: string
  name: string
  summary: string | null
  context: string | null
  node_type: WorldEntity['nodeType']
  aliases: string[] | null
  tags: string[] | null
  status: WorldEntity['status']
  thumbnail_asset_key: string | null
  linked_definition_key: string | null
  source: WorldEntity['source']
  custom_properties: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldRelationshipRow = {
  id: string
  key: string
  source_entity_id: string
  target_entity_id: string
  verb: string
  direction: WorldRelationship['direction']
  strength: number | null
  confidence: number | null
  source: WorldRelationship['source']
  notes: string | null
  state: WorldRelationship['state']
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldViewRow = {
  id: string
  key: string
  name: string
  mode: WorldView['mode']
  filters: Record<string, unknown> | null
  search: string | null
  root_entity_key: string | null
  camera: Record<string, unknown> | null
  focus_depth: number | null
  show_suggestions: boolean | null
  show_labels: boolean | null
  show_derived_layer: boolean | null
  node_positions: Record<string, unknown> | null
  collapsed_state: Record<string, unknown> | null
  sort_mode: WorldView['sortMode'] | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldOperatorRow = {
  id: string
  key: string
  operator_type: WorldOperator['operatorType']
  input_entity_keys: string[] | null
  label: string | null
  status: WorldOperator['status']
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldResultRow = {
  id: string
  key: string
  result_type: WorldResult['resultType']
  source_operator_key: string
  title: string
  summary: string | null
  preview_asset_key: string | null
  status: WorldResult['status']
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldGraphConnectionRow = {
  id: string
  key: string
  source_node_key: string
  source_node_kind: WorldGraphConnection['sourceNodeKind']
  target_node_key: string
  target_node_kind: WorldGraphConnection['targetNodeKind']
  role: WorldGraphConnection['role']
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type OutputWorkflowRow = {
  id: string
  project_id: string
  draft_id: string
  key: string
  name: string
  description: string | null
  preset: OutputWorkflow['preset']
  status: OutputWorkflow['status']
  created_by: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type OutputWorkflowNodeRow = {
  id: string
  workflow_id: string
  key: string
  node_type: OutputWorkflowNode['nodeType']
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
  status: OutputWorkflowRun['status']
  preset: OutputWorkflowRun['preset']
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
  node_type: OutputWorkflowNode['nodeType']
  status: OutputWorkflowRun['status']
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
  kind: OutputArtifact['kind']
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
  workflow_id: string | null
  latest_run_id: string | null
  requested_by: string | null
  source_surface: string | null
  prompt: string | null
  title: string | null
  intent: OutputRequest['intent']
  output_kind: OutputRequest['outputKind']
  status: OutputRequest['status']
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

type WorldPromptSessionRow = {
  id: string
  draft_id: string
  key: string
  title: string
  status: WorldPromptSession['status']
  is_active: boolean
  summary_memory: string | null
  last_context: Record<string, unknown> | null
  selected_root_entity_key: string | null
  selected_view_key: string | null
  model: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldPromptTurnRow = {
  id: string
  session_id: string
  draft_id: string
  prompt: string
  status: WorldPromptTurn['status']
  model: string | null
  resolved_context: Record<string, unknown> | null
  approval_state: WorldPromptTurn['approvalState']
  assistant_summary: string | null
  error_message: string | null
  response_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldPromptMessageRow = {
  id: string
  session_id: string
  turn_id: string | null
  draft_id: string
  role: WorldPromptMessage['role']
  content: string
  metadata: Record<string, unknown> | null
  created_at: string
}

type WorldPromptEventRow = {
  id: string
  session_id: string
  turn_id: string
  draft_id: string
  sequence: number
  event_type: WorldPromptEvent['eventType']
  op_id: string | null
  payload: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type WorldPromptGenerationJobRow = {
  id: string
  draft_id: string
  session_id: string
  turn_id: string
  kind: WorldPromptGenerationJob['kind']
  status: WorldPromptGenerationJob['status']
  attempt_count: number | null
  heartbeat_at: string | null
  started_at: string | null
  completed_at: string | null
  token_usage: Record<string, unknown> | null
  counts: Record<string, unknown> | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  latest_applied_op_cursor: string | null
  created_at: string
  updated_at: string
}

type WorldPromptGenerationJobStepRow = {
  id: string
  job_id: string
  draft_id: string
  session_id: string
  turn_id: string
  step_key: string
  phase: WorldPromptGenerationJobStep['phase']
  status: WorldPromptGenerationJobStep['status']
  attempt_count: number | null
  order_index: number | null
  heartbeat_at: string | null
  started_at: string | null
  completed_at: string | null
  token_usage: Record<string, unknown> | null
  counts: Record<string, unknown> | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  latest_applied_op_cursor: string | null
  created_at: string
  updated_at: string
}

type WorldPromptSuggestionRow = {
  id: string
  draft_id: string
  session_id: string
  turn_id: string | null
  thread_key: string | null
  label: string
  prompt: string
  kind: WorldPromptSuggestionRecord['kind']
  style: WorldPromptSuggestionRecord['style']
  source: WorldPromptSuggestionRecord['source']
  summary: string | null
  estimated_node_count: number | null
  estimated_edge_count: number | null
  will_queue_images: boolean | null
  will_queue_cinematics: boolean | null
  state: WorldPromptSuggestionRecord['state']
  rank: number | null
  used_turn_id: string | null
  dismissed_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldThreadRow = {
  id: string
  draft_id: string
  key: string
  title: string
  summary: string | null
  status: WorldThread['status']
  priority: WorldThread['priority']
  linked_entity_keys: string[] | null
  source_turn_id: string | null
  last_turn_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const WORLD_ENTITY_SELECT =
  'id, key, name, summary, context, node_type, aliases, tags, status, thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata, created_at, updated_at'
const WORLD_RELATIONSHIP_SELECT =
  'id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata, created_at, updated_at'
const WORLD_VIEW_SELECT =
  'id, key, name, mode, filters, search, root_entity_key, camera, focus_depth, show_suggestions, show_labels, show_derived_layer, node_positions, collapsed_state, sort_mode, metadata, created_at, updated_at'
const WORLD_OPERATOR_SELECT =
  'id, key, operator_type, input_entity_keys, label, status, metadata, created_at, updated_at'
const WORLD_RESULT_SELECT =
  'id, key, result_type, source_operator_key, title, summary, preview_asset_key, status, metadata, created_at, updated_at'
const WORLD_CONNECTION_SELECT =
  'id, key, source_node_key, source_node_kind, target_node_key, target_node_kind, role, metadata, created_at, updated_at'
const OUTPUT_WORKFLOW_SELECT =
  'id, project_id, draft_id, key, name, description, preset, status, created_by, metadata, created_at, updated_at'
const OUTPUT_WORKFLOW_NODE_SELECT =
  'id, workflow_id, key, node_type, label, position, config, inputs, dirty, input_hash, output_hash, metadata, created_at, updated_at'
const OUTPUT_WORKFLOW_EDGE_SELECT =
  'id, workflow_id, key, source_node_key, source_port, target_node_key, target_port, metadata, created_at, updated_at'
const OUTPUT_WORKFLOW_RUN_SELECT =
  'id, project_id, draft_id, workflow_id, requested_by, status, preset, prompt, target_format, world_snapshot_fingerprint, error_message, worker_id, heartbeat_at, attempt_count, metadata, started_at, completed_at, created_at, updated_at'
const OUTPUT_WORKFLOW_RUN_STEP_STATUS_SELECT =
  'id, run_id, workflow_id, node_id, node_key, node_type, status, order_index, label, input_hash, output_hash, provider, model, provider_request_id, error_message, metadata, started_at, completed_at, created_at, updated_at'
const OUTPUT_ARTIFACT_SELECT =
  'id, project_id, draft_id, workflow_id, run_id, node_id, key, name, kind, asset_key, mime_type, summary, metadata, created_at, updated_at'
const OUTPUT_REQUEST_SELECT =
  'id, project_id, draft_id, workflow_id, latest_run_id, requested_by, source_surface, prompt, title, intent, output_kind, status, selected_entity_keys, selected_sequence_unit_keys, page_count, target_format, planner_notes, error_message, metadata, created_at, updated_at'
const WORLD_PROMPT_SESSION_SELECT =
  'id, draft_id, key, title, status, is_active, summary_memory, last_context, selected_root_entity_key, selected_view_key, model, metadata, created_at, updated_at'
const WORLD_PROMPT_TURN_SELECT =
  'id, session_id, draft_id, prompt, status, model, resolved_context, approval_state, assistant_summary, error_message, response_id, metadata, created_at, updated_at'
const WORLD_PROMPT_MESSAGE_SELECT =
  'id, session_id, turn_id, draft_id, role, content, metadata, created_at'
const WORLD_PROMPT_EVENT_SELECT =
  'id, session_id, turn_id, draft_id, sequence, event_type, op_id, payload, metadata, created_at'
const WORLD_PROMPT_GENERATION_JOB_SELECT =
  'id, draft_id, session_id, turn_id, kind, status, attempt_count, heartbeat_at, started_at, completed_at, token_usage, counts, error_message, metadata, latest_applied_op_cursor, created_at, updated_at'
const WORLD_PROMPT_GENERATION_JOB_STEP_SELECT =
  'id, job_id, draft_id, session_id, turn_id, step_key, phase, status, attempt_count, order_index, heartbeat_at, started_at, completed_at, token_usage, counts, error_message, metadata, latest_applied_op_cursor, created_at, updated_at'

function shouldHydrateOutputRunSteps(status: string) {
  return status === 'queued' || status === 'running'
}

function selectOutputRunIdsForStepHydration(runRows: OutputWorkflowRunRow[], maxCompletedRuns = 4) {
  return [...new Set([
    ...runRows.filter((run) => shouldHydrateOutputRunSteps(run.status)).map((run) => run.id),
    ...runRows.filter((run) => !shouldHydrateOutputRunSteps(run.status)).slice(0, maxCompletedRuns).map((run) => run.id),
  ])]
}
const WORLD_PROMPT_SUGGESTION_SELECT =
  'id, draft_id, session_id, turn_id, thread_key, label, prompt, kind, style, source, summary, estimated_node_count, estimated_edge_count, will_queue_images, will_queue_cinematics, state, rank, used_turn_id, dismissed_at, metadata, created_at, updated_at'
const WORLD_THREAD_SELECT =
  'id, draft_id, key, title, summary, status, priority, linked_entity_keys, source_turn_id, last_turn_id, metadata, created_at, updated_at'

function upsertEntryByKey<T extends { key: string }>(entries: T[], nextEntry: T) {
  const existingIndex = entries.findIndex((entry) => entry.key === nextEntry.key)
  if (existingIndex === -1) {
    return [...entries, nextEntry]
  }

  return entries.map((entry, index) => (index === existingIndex ? nextEntry : entry))
}

function mapWorldEntityRow(entity: WorldEntityRow): WorldEntity {
  return {
    id: entity.id,
    key: entity.key,
    name: entity.name,
    summary: entity.summary ?? '',
    context: entity.context ?? '',
    nodeType: entity.node_type,
    aliases: entity.aliases ?? [],
    tags: entity.tags ?? [],
    status: entity.status,
    thumbnailAssetKey: entity.thumbnail_asset_key,
    linkedDefinitionKey: entity.linked_definition_key,
    source: entity.source,
    customProperties: entity.custom_properties ?? {},
    metadata: entity.metadata ?? {},
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  }
}

function mapWorldRelationshipRow(
  relationship: WorldRelationshipRow,
  worldEntities: Array<Pick<WorldEntity, 'id' | 'key'>>,
): WorldRelationship {
  const sourceEntity = worldEntities.find((entity) => entity.id === relationship.source_entity_id) ?? null
  const targetEntity = worldEntities.find((entity) => entity.id === relationship.target_entity_id) ?? null
  return {
    id: relationship.id,
    key: relationship.key,
    sourceEntityKey: sourceEntity?.key ?? relationship.source_entity_id,
    targetEntityKey: targetEntity?.key ?? relationship.target_entity_id,
    verb: relationship.verb,
    direction: relationship.direction,
    strength: relationship.strength,
    confidence: relationship.confidence,
    source: relationship.source,
    notes: relationship.notes ?? '',
    state: relationship.state,
    metadata: relationship.metadata ?? {},
    createdAt: relationship.created_at,
    updatedAt: relationship.updated_at,
  }
}

function mapWorldViewRow(view: WorldViewRow): WorldView {
  return worldViewSchema.parse({
    id: view.id,
    key: view.key,
    name: view.name,
    mode: view.mode,
    filters: view.filters ?? {},
    search: view.search ?? '',
    rootEntityKey: view.root_entity_key,
    camera: view.camera ?? {},
    focusDepth: view.focus_depth ?? 1,
    showSuggestions: view.show_suggestions ?? true,
    showLabels: view.show_labels ?? true,
    showDerivedLayer: view.show_derived_layer ?? true,
    nodePositions: view.node_positions ?? {},
    collapsedState: view.collapsed_state ?? {},
    sortMode: view.sort_mode ?? 'manual',
    metadata: view.metadata ?? {},
    createdAt: view.created_at,
    updatedAt: view.updated_at,
  })
}

function serializeWorldViewRow(draftId: string, view: WorldView) {
  return {
    draft_id: draftId,
    key: view.key,
    name: view.name,
    mode: view.mode,
    filters: view.filters,
    search: view.search,
    root_entity_key: view.rootEntityKey,
    camera: view.camera,
    focus_depth: view.focusDepth,
    show_suggestions: view.showSuggestions,
    show_labels: view.showLabels,
    show_derived_layer: view.showDerivedLayer,
    node_positions: view.nodePositions,
    collapsed_state: view.collapsedState,
    sort_mode: view.sortMode,
    metadata: view.metadata,
  }
}

async function reconcilePersistedAutoManagedWorldViews(
  snapshot: ProjectSnapshot,
  options?: {
    recentEntityKeys?: string[]
    recentRelationshipKeys?: string[]
    preferredRootEntityKey?: string | null
    preferredThreadKey?: string | null
  },
) {
  const reconciled = reconcileAutoManagedWorldViews(snapshot, options)
  const desiredAutoViews = reconciled.worldViews.filter((view) => isAutoManagedWorldView(view))
  const currentAutoViews = snapshot.worldViews.filter((view) => isAutoManagedWorldView(view))
  const removedKeys = currentAutoViews
    .map((view) => view.key)
    .filter((key) => !desiredAutoViews.some((view) => view.key === key))

  if (desiredAutoViews.length > 0) {
    const upsertResponse = await supabase
      .from('world_views')
      .upsert(desiredAutoViews.map((view) => serializeWorldViewRow(snapshot.draft.id, view)), {
        onConflict: 'draft_id,key',
      })
    if (upsertResponse.error) {
      throw new Error(upsertResponse.error.message)
    }
  }

  if (removedKeys.length > 0) {
    const deleteResponse = await supabase
      .from('world_views')
      .delete()
      .eq('draft_id', snapshot.draft.id)
      .in('key', removedKeys)
    if (deleteResponse.error) {
      throw new Error(deleteResponse.error.message)
    }
  }

  return {
    ...snapshot,
    worldViews: reconciled.worldViews,
  }
}

function mapWorldOperatorRow(entry: WorldOperatorRow): WorldOperator {
  return {
    id: entry.id,
    key: entry.key,
    operatorType: entry.operator_type,
    inputEntityKeys: entry.input_entity_keys ?? [],
    label: entry.label ?? '',
    status: entry.status,
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  }
}

function mapWorldResultRow(entry: WorldResultRow): WorldResult {
  return {
    id: entry.id,
    key: entry.key,
    resultType: entry.result_type,
    sourceOperatorKey: entry.source_operator_key,
    title: entry.title,
    summary: entry.summary ?? '',
    previewAssetKey: entry.preview_asset_key,
    status: entry.status,
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  }
}

function mapWorldGraphConnectionRow(entry: WorldGraphConnectionRow): WorldGraphConnection {
  return {
    id: entry.id,
    key: entry.key,
    sourceNodeKey: entry.source_node_key,
    sourceNodeKind: entry.source_node_kind,
    targetNodeKey: entry.target_node_key,
    targetNodeKind: entry.target_node_kind,
    role: entry.role,
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  }
}

function mapOutputWorkflowRow(entry: OutputWorkflowRow): OutputWorkflow {
  return outputWorkflowSchema.parse({
    id: entry.id,
    projectId: entry.project_id,
    draftId: entry.draft_id,
    key: entry.key,
    name: entry.name,
    description: entry.description ?? '',
    preset: entry.preset,
    status: entry.status,
    createdBy: entry.created_by,
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function mapOutputWorkflowNodeRow(entry: OutputWorkflowNodeRow): OutputWorkflowNode {
  const position = entry.position && typeof entry.position === 'object'
    ? {
        x: typeof entry.position.x === 'number' ? entry.position.x : 0,
        y: typeof entry.position.y === 'number' ? entry.position.y : 0,
      }
    : { x: 0, y: 0 }

  return outputWorkflowNodeSchema.parse({
    id: entry.id,
    workflowId: entry.workflow_id,
    key: entry.key,
    nodeType: entry.node_type,
    label: entry.label,
    position,
    config: entry.config ?? {},
    inputs: entry.inputs ?? {},
    outputs: entry.outputs ?? {},
    dirty: entry.dirty ?? true,
    inputHash: entry.input_hash ?? '',
    outputHash: entry.output_hash ?? '',
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function mapOutputWorkflowEdgeRow(entry: OutputWorkflowEdgeRow): OutputWorkflowEdge {
  return outputWorkflowEdgeSchema.parse({
    id: entry.id,
    workflowId: entry.workflow_id,
    key: entry.key,
    sourceNodeKey: entry.source_node_key,
    sourcePort: entry.source_port,
    targetNodeKey: entry.target_node_key,
    targetPort: entry.target_port,
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function mapOutputWorkflowRunStepRow(entry: OutputWorkflowRunStepRow): OutputWorkflowRunStep {
  return outputWorkflowRunStepSchema.parse({
    id: entry.id,
    runId: entry.run_id,
    workflowId: entry.workflow_id,
    nodeId: entry.node_id,
    nodeKey: entry.node_key,
    nodeType: entry.node_type,
    status: entry.status,
    orderIndex: entry.order_index ?? 0,
    label: entry.label,
    inputHash: entry.input_hash ?? '',
    outputHash: entry.output_hash ?? '',
    outputs: entry.outputs ?? {},
    provider: entry.provider,
    model: entry.model,
    providerRequestId: entry.provider_request_id,
    errorMessage: entry.error_message,
    metadata: entry.metadata ?? {},
    startedAt: entry.started_at,
    completedAt: entry.completed_at,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function mapOutputArtifactRow(entry: OutputArtifactRow): OutputArtifact {
  return outputArtifactSchema.parse({
    id: entry.id,
    projectId: entry.project_id,
    draftId: entry.draft_id,
    workflowId: entry.workflow_id,
    runId: entry.run_id,
    nodeId: entry.node_id,
    key: entry.key,
    name: entry.name,
    kind: entry.kind,
    assetKey: entry.asset_key,
    mimeType: entry.mime_type ?? '',
    summary: entry.summary ?? '',
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function mapAssetRow(asset: AssetRow): AssetDefinition {
  return {
    id: asset.id,
    projectId: asset.project_id,
    key: asset.key,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mime_type,
    storagePath: asset.storage_path,
    metadata: asset.metadata ?? {},
    llmHints: asset.llm_hints ?? {},
  }
}

function mapOutputRequestRow(entry: OutputRequestRow): OutputRequest {
  return outputRequestSchema.parse({
    id: entry.id,
    projectId: entry.project_id,
    draftId: entry.draft_id,
    workflowId: entry.workflow_id,
    latestRunId: entry.latest_run_id,
    requestedBy: entry.requested_by,
    sourceSurface: entry.source_surface ?? 'outputs',
    prompt: entry.prompt ?? '',
    title: entry.title ?? 'Untitled output',
    intent: entry.intent,
    outputKind: entry.output_kind,
    status: entry.status,
    selectedEntityKeys: entry.selected_entity_keys ?? [],
    selectedSequenceUnitKeys: entry.selected_sequence_unit_keys ?? [],
    pageCount: entry.page_count,
    targetFormat: entry.target_format ?? 'pdf',
    plannerNotes: entry.planner_notes ?? '',
    errorMessage: entry.error_message,
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function mapOutputWorkflowRunRow(
  entry: OutputWorkflowRunRow,
  steps: OutputWorkflowRunStep[],
  artifacts: OutputArtifact[],
): OutputWorkflowRun {
  return outputWorkflowRunSchema.parse({
    id: entry.id,
    projectId: entry.project_id,
    draftId: entry.draft_id,
    workflowId: entry.workflow_id,
    requestedBy: entry.requested_by,
    status: entry.status,
    preset: entry.preset,
    prompt: entry.prompt ?? '',
    targetFormat: entry.target_format ?? 'pdf',
    worldSnapshotFingerprint: entry.world_snapshot_fingerprint ?? '',
    input: entry.input ?? {},
    outputs: entry.outputs ?? {},
    errorMessage: entry.error_message,
    workerId: entry.worker_id,
    heartbeatAt: entry.heartbeat_at,
    attemptCount: entry.attempt_count ?? 0,
    metadata: entry.metadata ?? {},
    steps: steps.filter((step) => step.runId === entry.id),
    artifacts: artifacts.filter((artifact) => artifact.runId === entry.id),
    startedAt: entry.started_at,
    completedAt: entry.completed_at,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function mapWorldPromptSessionRow(entry: WorldPromptSessionRow): WorldPromptSession {
  return worldPromptSessionSchema.parse({
    id: entry.id,
    key: entry.key,
    draftId: entry.draft_id,
    title: entry.title,
    status: entry.status,
    isActive: entry.is_active,
    summaryMemory: entry.summary_memory ?? '',
    lastContext: entry.last_context ?? {},
    selectedRootEntityKey: entry.selected_root_entity_key,
    selectedViewKey: entry.selected_view_key,
    model: entry.model ?? 'gpt-5.4',
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function mapWorldPromptTurnRow(entry: WorldPromptTurnRow): WorldPromptTurn {
  return worldPromptTurnSchema.parse({
    id: entry.id,
    sessionId: entry.session_id,
    draftId: entry.draft_id,
    prompt: entry.prompt,
    status: entry.status,
    model: entry.model ?? 'gpt-5.4',
    resolvedContext: entry.resolved_context ?? {},
    approvalState: entry.approval_state,
    assistantSummary: entry.assistant_summary ?? '',
    errorMessage: entry.error_message,
    responseId: entry.response_id,
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function mapWorldPromptMessageRow(entry: WorldPromptMessageRow): WorldPromptMessage {
  return {
    id: entry.id,
    sessionId: entry.session_id,
    turnId: entry.turn_id,
    draftId: entry.draft_id,
    role: entry.role,
    content: entry.content,
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
  }
}

function mapWorldPromptEventRow(entry: WorldPromptEventRow): WorldPromptEvent {
  return {
    id: entry.id,
    sessionId: entry.session_id,
    turnId: entry.turn_id,
    draftId: entry.draft_id,
    sequence: entry.sequence,
    eventType: entry.event_type,
    opId: entry.op_id,
    payload: entry.payload ?? {},
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
  }
}

function mapWorldPromptGenerationJobRow(entry: WorldPromptGenerationJobRow): WorldPromptGenerationJob {
  return worldPromptGenerationJobSchema.parse({
    id: entry.id,
    draftId: entry.draft_id,
    sessionId: entry.session_id,
    turnId: entry.turn_id,
    kind: entry.kind,
    status: entry.status,
    attemptCount: entry.attempt_count ?? 0,
    heartbeatAt: entry.heartbeat_at,
    startedAt: entry.started_at,
    completedAt: entry.completed_at,
    tokenUsage: entry.token_usage ?? {},
    counts: entry.counts ?? {},
    errorMessage: entry.error_message,
    metadata: entry.metadata ?? {},
    latestAppliedOpCursor: entry.latest_applied_op_cursor,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function mapWorldPromptGenerationJobStepRow(entry: WorldPromptGenerationJobStepRow): WorldPromptGenerationJobStep {
  return worldPromptGenerationJobStepSchema.parse({
    id: entry.id,
    jobId: entry.job_id,
    draftId: entry.draft_id,
    sessionId: entry.session_id,
    turnId: entry.turn_id,
    stepKey: entry.step_key,
    phase: entry.phase,
    status: entry.status,
    attemptCount: entry.attempt_count ?? 0,
    orderIndex: entry.order_index ?? 0,
    heartbeatAt: entry.heartbeat_at,
    startedAt: entry.started_at,
    completedAt: entry.completed_at,
    tokenUsage: entry.token_usage ?? {},
    counts: entry.counts ?? {},
    errorMessage: entry.error_message,
    metadata: entry.metadata ?? {},
    latestAppliedOpCursor: entry.latest_applied_op_cursor,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function sanitizeWorldPromptSuggestionText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/^Hosted prompt planning was unavailable, so GraphCore used a local fallback seed\.\s*/i, '')
    .replace(/\s*Immediate JSON[^\n]*?(?:\.\s*|$)/i, '')
    .replace(/^oneOf is not permitted in operations\.?\s*/i, '')
    .replace(/\s*World prompt planner returned JSON that did not match the expected schema\.[\s\S]*$/i, '')
    .replace(/\s*Planner (?:output|response) validation failed\.[\s\S]*$/i, '')
    .replace(/\s*Cinematic planner response validation failed\.[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function mapWorldPromptSuggestionRow(entry: WorldPromptSuggestionRow): WorldPromptSuggestionRecord | null {
  const label = sanitizeWorldPromptSuggestionText(entry.label)
  const prompt = sanitizeWorldPromptSuggestionText(entry.prompt)
  const summary = sanitizeWorldPromptSuggestionText(entry.summary ?? '')
  const resolvedLabel = label || summary
  const resolvedPrompt = prompt || ''

  if (!resolvedLabel || !resolvedPrompt) {
    return null
  }

  return worldPromptSuggestionRecordSchema.parse({
    id: entry.id,
    draftId: entry.draft_id,
    sessionId: entry.session_id,
    turnId: entry.turn_id,
    threadKey: entry.thread_key,
    label: resolvedLabel,
    prompt: resolvedPrompt,
    kind: entry.kind,
    style: entry.style,
    source: entry.source,
    summary,
    estimatedNodeCount: entry.estimated_node_count,
    estimatedEdgeCount: entry.estimated_edge_count,
    willQueueImages: entry.will_queue_images,
    willQueueCinematics: entry.will_queue_cinematics,
    uiKind: typeof entry.metadata?.uiKind === 'string' ? entry.metadata.uiKind : undefined,
    executionMode: typeof entry.metadata?.executionMode === 'string' ? entry.metadata.executionMode : undefined,
    actionMode: typeof entry.metadata?.actionMode === 'string' ? entry.metadata.actionMode : undefined,
    applyPolicy: typeof entry.metadata?.applyPolicy === 'string' ? entry.metadata.applyPolicy : undefined,
    targetEntityKeys: Array.isArray(entry.metadata?.targetEntityKeys)
      ? entry.metadata.targetEntityKeys.filter((value): value is string => typeof value === 'string')
      : [],
    targetThreadKeys: Array.isArray(entry.metadata?.targetThreadKeys)
      ? entry.metadata.targetThreadKeys.filter((value): value is string => typeof value === 'string')
      : [],
    focusLayer: typeof entry.metadata?.focusLayer === 'string' ? entry.metadata.focusLayer : undefined,
    retrievalHint: typeof entry.metadata?.retrievalHint === 'string' ? entry.metadata.retrievalHint : '',
    generatedReason: typeof entry.metadata?.generatedReason === 'string' ? entry.metadata.generatedReason : undefined,
    generatedFromTurnId: typeof entry.metadata?.generatedFromTurnId === 'string' ? entry.metadata.generatedFromTurnId : entry.turn_id,
    state: entry.state,
    rank: entry.rank,
    usedTurnId: entry.used_turn_id,
    dismissedAt: entry.dismissed_at,
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

function mapWorldThreadRow(entry: WorldThreadRow): WorldThread {
  return worldThreadSchema.parse({
    id: entry.id,
    draftId: entry.draft_id,
    key: entry.key,
    title: entry.title,
    summary: entry.summary ?? '',
    status: entry.status,
    priority: entry.priority,
    linkedEntityKeys: entry.linked_entity_keys ?? [],
    sourceTurnId: entry.source_turn_id,
    lastTurnId: entry.last_turn_id,
    metadata: entry.metadata ?? {},
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  })
}

type WorldBuildBatchRow = {
  id: string
  draft_id: string
  project_id: string
  prompt: string
  request_summary: string
  planner_mode: string | null
  status: string
  diagnostics: string[] | null
  plan_json: unknown[] | null
  cinematic_plan: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldBuildJobRow = {
  id: string
  batch_id: string
  plan_item_id: string
  kind: string
  status: string
  depends_on_job_ids: string[] | null
  target_keys: Record<string, string> | null
  prompt: string
  options: Record<string, unknown> | null
  provider_request_id: string | null
  status_url: string | null
  response_url: string | null
  cancel_url: string | null
  result_context: Record<string, unknown> | null
  error_message: string | null
  order_index: number
  created_at: string
  updated_at: string
}

type MeshGenerationJobRow = {
  id: string
  project_id: string
  draft_id: string
  definition_key: string
  source_image_asset_key: string
  target_mesh_asset_key: string
  provider: string
  model: string
  provider_request_id: string | null
  status_url: string | null
  response_url: string | null
  cancel_url: string | null
  status: string
  provider_status: string | null
  provider_logs: unknown
  error_message: string | null
  storage_path: string | null
  created_at: string
  updated_at: string
}

type CinematicRunRow = {
  id: string
  draft_id: string
  project_id: string
  graph_key: string
  graph_name: string
  mode: string
  status: string
  shot_node_key: string | null
  diagnostics: string[] | null
  created_at: string
  updated_at: string
}

type CinematicRunJobRow = {
  id: string
  run_id: string
  graph_key: string
  shot_node_key: string
  kind: string
  status: string
  order_index: number
  depends_on_job_ids: string[] | null
  still_asset_key: string | null
  video_asset_key: string | null
  provider: string | null
  model: string | null
  provider_request_id: string | null
  error_message: string | null
  prompt: string | null
  result_context: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type SignProjectAssetUrlsRequest = {
  projectId?: string
  assetKeys: string[]
}

type SignProjectAssetUrlsResponse = {
  urls: Array<{
    assetKey: string
    signedUrl: string
  }>
}

export type SignedProjectAssetUrlEntry = SignProjectAssetUrlsResponse['urls'][number]

const PROJECT_ASSET_SIGNING_BATCH_SIZE = 100

const storageAssetUrlCache = new Map<string, { storagePath: string; url: string; expiresAt: number | null }>()

function isPrivateStorageBackedAsset(asset: AssetDefinition) {
  const storagePath = asset.storagePath?.trim() ?? ''
  if (!storagePath || storagePath.startsWith('external/') || storagePath.startsWith('local-upload/')) return false
  const storageBucket = typeof asset.metadata.storageBucket === 'string' ? asset.metadata.storageBucket.trim() : ''
  return Boolean(storageBucket) || storagePath.startsWith('generated/')
}

function stripTransientAssetUrlsForCache(snapshot: ProjectSnapshot): ProjectSnapshot {
  const stripArtifactUrls = (artifact: OutputArtifact): OutputArtifact => {
    // Legacy output artifacts may only carry a URL in metadata. Keep that as a
    // last-resort pointer when there is no durable project asset to rehydrate.
    if (!artifact.assetKey) return artifact
    const metadata = { ...artifact.metadata }
    delete metadata.sourceUrl
    delete metadata.previewUrl
    return {
      ...artifact,
      metadata,
    }
  }

  return {
    ...snapshot,
    assets: snapshot.assets.map((asset) => {
      if (!isPrivateStorageBackedAsset(asset)) return asset
      const metadata = { ...asset.metadata }
      delete metadata.sourceUrl
      delete metadata.previewUrl
      return {
        ...asset,
        metadata,
      }
    }),
    outputArtifacts: snapshot.outputArtifacts.map(stripArtifactUrls),
    outputWorkflowRuns: snapshot.outputWorkflowRuns.map((run) => ({
      ...run,
      artifacts: run.artifacts.map(stripArtifactUrls),
    })),
  }
}

function isBrowserObjectUrl(value: unknown) {
  return typeof value === 'string' && value.trim().startsWith('blob:')
}

function stripTransientOutputArtifactUrlsForCache(artifact: OutputArtifact): OutputArtifact {
  const metadata = { ...artifact.metadata }
  let changed = false

  // Artifacts linked to durable project assets should be rehydrated from the
  // asset key. Persisting signed URLs or browser object URLs makes the Outputs
  // cache stale after refresh.
  if (artifact.assetKey) {
    if ('sourceUrl' in metadata) {
      delete metadata.sourceUrl
      changed = true
    }
    if ('previewUrl' in metadata) {
      delete metadata.previewUrl
      changed = true
    }
  } else {
    if (isBrowserObjectUrl(metadata.sourceUrl)) {
      delete metadata.sourceUrl
      changed = true
    }
    if (isBrowserObjectUrl(metadata.previewUrl)) {
      delete metadata.previewUrl
      changed = true
    }
  }

  return changed ? { ...artifact, metadata } : artifact
}

function stripTransientOutputAssetUrlsForCache(asset: AssetDefinition): AssetDefinition {
  const metadata = { ...asset.metadata }
  let changed = false
  const stripAllHydratedUrls = isPrivateStorageBackedAsset(asset)

  if (stripAllHydratedUrls || isBrowserObjectUrl(metadata.sourceUrl)) {
    if ('sourceUrl' in metadata) {
      delete metadata.sourceUrl
      changed = true
    }
  }
  if (stripAllHydratedUrls || isBrowserObjectUrl(metadata.previewUrl)) {
    if ('previewUrl' in metadata) {
      delete metadata.previewUrl
      changed = true
    }
  }

  return changed ? { ...asset, metadata } : asset
}

function stripTransientOutputInboxUrlsForCache(inbox: OutputInboxSlice): OutputInboxSlice {
  return {
    ...inbox,
    artifacts: inbox.artifacts.map(stripTransientOutputArtifactUrlsForCache),
    assets: inbox.assets.map(stripTransientOutputAssetUrlsForCache),
    runs: inbox.runs.map((run) => ({
      ...run,
      artifacts: run.artifacts.map(stripTransientOutputArtifactUrlsForCache),
    })),
  }
}

function readRepositoryRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readRepositoryString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function addMissingAssetKey(candidate: unknown, knownAssetKeys: Set<string>, missing: Set<string>) {
  const assetKey = readRepositoryString(candidate)
  if (assetKey && !knownAssetKeys.has(assetKey)) missing.add(assetKey)
}

function collectOutputAssetReferences(value: unknown, knownAssetKeys: Set<string>, missing: Set<string>, depth = 0) {
  if (!value || depth > 8) return
  if (Array.isArray(value)) {
    for (const entry of value) collectOutputAssetReferences(entry, knownAssetKeys, missing, depth + 1)
    return
  }
  if (typeof value !== 'object') return

  const record = value as Record<string, unknown>
  addMissingAssetKey(record.assetKey, knownAssetKeys, missing)
  addMissingAssetKey(record.asset_key, knownAssetKeys, missing)

  for (const entry of Object.values(record)) {
    if (entry && typeof entry === 'object') {
      collectOutputAssetReferences(entry, knownAssetKeys, missing, depth + 1)
    }
  }
}

function findMissingAssetReferences(snapshot: ProjectSnapshot) {
  const assetKeys = new Set(snapshot.assets.map((asset) => asset.key))
  const missing = new Set<string>()

  const draftMetadata = readRepositoryRecord(snapshot.draft.metadata)
  const worldWiki = readRepositoryRecord(draftMetadata.worldWiki)
  addMissingAssetKey(worldWiki.worldConceptAssetKey, assetKeys, missing)
  addMissingAssetKey(worldWiki.brandAtlasAssetKey, assetKeys, missing)

  for (const definition of snapshot.definitions) {
    if (definition.iconAssetKey && !assetKeys.has(definition.iconAssetKey)) {
      missing.add(definition.iconAssetKey)
    }
    for (const assetRef of definition.assetRefs ?? []) {
      if (assetRef.assetKey && !assetKeys.has(assetRef.assetKey)) {
        missing.add(assetRef.assetKey)
      }
    }
  }

  for (const archetype of snapshot.archetypes) {
    if (archetype.iconAssetKey && !assetKeys.has(archetype.iconAssetKey)) {
      missing.add(archetype.iconAssetKey)
    }
  }

  for (const entity of snapshot.worldEntities) {
    if (entity.thumbnailAssetKey && !assetKeys.has(entity.thumbnailAssetKey)) {
      missing.add(entity.thumbnailAssetKey)
    }
  }

  for (const result of snapshot.worldResults) {
    if (result.previewAssetKey && !assetKeys.has(result.previewAssetKey)) {
      missing.add(result.previewAssetKey)
    }
  }

  for (const artifact of snapshot.outputArtifacts) {
    if (artifact.assetKey && !assetKeys.has(artifact.assetKey)) {
      missing.add(artifact.assetKey)
    }
  }

  for (const node of snapshot.outputWorkflowNodes) {
    collectOutputAssetReferences(node.outputs, assetKeys, missing)
  }

  for (const run of snapshot.outputWorkflowRuns) {
    collectOutputAssetReferences(run.outputs, assetKeys, missing)
    for (const step of run.steps) collectOutputAssetReferences(step.outputs, assetKeys, missing)
    for (const artifact of run.artifacts) {
      if (artifact.assetKey && !assetKeys.has(artifact.assetKey)) {
        missing.add(artifact.assetKey)
      }
    }
  }

  return Array.from(missing)
}

function resolveHydratedAssetUrl(asset: AssetDefinition | null | undefined) {
  if (!asset) return ''
  const metadata = readRepositoryRecord(asset.metadata)
  return readRepositoryString(metadata.sourceUrl) || readRepositoryString(metadata.previewUrl)
}

function hydrateOutputArtifactsFromAssets(artifacts: OutputArtifact[], assets: AssetDefinition[]) {
  const assetUrlByKey = new Map<string, string>()
  for (const asset of assets) {
    const url = resolveHydratedAssetUrl(asset)
    if (url) assetUrlByKey.set(asset.key, url)
  }
  if (assetUrlByKey.size === 0) return artifacts

  return artifacts.map((artifact) => {
    const assetKey = readRepositoryString(artifact.assetKey)
    if (!assetKey) return artifact
    const assetUrl = assetUrlByKey.get(assetKey)
    if (!assetUrl) return artifact

    const metadata = readRepositoryRecord(artifact.metadata)
    const sourceUrl = readRepositoryString(metadata.sourceUrl)
    const previewUrl = readRepositoryString(metadata.previewUrl)
    if (sourceUrl && previewUrl) return artifact

    return {
      ...artifact,
      metadata: {
        ...metadata,
        previewUrl: previewUrl || assetUrl,
        sourceUrl: sourceUrl || assetUrl,
      },
    }
  })
}

function hydrateSnapshotOutputArtifactUrls(snapshot: ProjectSnapshot): ProjectSnapshot {
  return {
    ...snapshot,
    outputArtifacts: hydrateOutputArtifactsFromAssets(snapshot.outputArtifacts, snapshot.assets),
    outputWorkflowRuns: snapshot.outputWorkflowRuns.map((run) => ({
      ...run,
      artifacts: hydrateOutputArtifactsFromAssets(run.artifacts, snapshot.assets),
    })),
  }
}

async function hydrateStorageAssetUrls<TAsset extends AssetDefinition>(projectId: string, assets: TAsset[]) {
  const signedUrls = new Map<string, string>()
  const normalizedAssets = assets.map((asset) => (
    asset.projectId ? asset : { ...asset, projectId }
  ))
  const candidates = normalizedAssets.filter((asset) => {
    if (asset.kind !== 'mesh' && asset.kind !== 'video' && asset.kind !== 'image' && asset.kind !== 'document') return false
    if (!isPrivateStorageBackedAsset(asset)) return false
    const generation = getResourceGenerationMetadata(asset)
    if (generation?.state === 'pending' || generation?.state === 'running') return false
    return true
  })

  if (candidates.length === 0) return normalizedAssets

  const uncachedCandidates: typeof candidates = []
  for (const asset of candidates) {
    const cachedObjectUrl = await getCachedAssetObjectUrl(asset)
    if (cachedObjectUrl) {
      signedUrls.set(asset.key, cachedObjectUrl)
      storageAssetUrlCache.set(asset.key, { storagePath: asset.storagePath, url: cachedObjectUrl, expiresAt: null })
      continue
    }

    const cachedSignedUrl = getCachedSignedAssetUrl(asset)
    if (cachedSignedUrl) {
      const resolvedUrl = await cacheSignedAssetResponse(asset, cachedSignedUrl)
      signedUrls.set(asset.key, resolvedUrl)
      storageAssetUrlCache.set(asset.key, { storagePath: asset.storagePath, url: resolvedUrl, expiresAt: null })
      continue
    }

    uncachedCandidates.push(asset)
  }

  if (uncachedCandidates.length > 0) {
    try {
      const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading generated meshes.')
      for (let index = 0; index < uncachedCandidates.length; index += PROJECT_ASSET_SIGNING_BATCH_SIZE) {
        const batch = uncachedCandidates.slice(index, index + PROJECT_ASSET_SIGNING_BATCH_SIZE)
        const response = await invokeAuthedFunctionWithSessionRecovery<SignProjectAssetUrlsResponse>(
          'sign-project-asset-urls',
          {
            projectId,
            assetKeys: batch.map((asset) => asset.key),
          } satisfies SignProjectAssetUrlsRequest,
          session,
        )
        if (!response.error && response.data?.urls) {
          for (const entry of response.data.urls) {
            if (typeof entry.assetKey === 'string' && typeof entry.signedUrl === 'string' && entry.signedUrl.trim()) {
              const asset = batch.find((candidate) => candidate.key === entry.assetKey)
                ?? uncachedCandidates.find((candidate) => candidate.key === entry.assetKey)
                ?? null
              if (asset) setCachedSignedAssetUrl(asset, entry.signedUrl)
              signedUrls.set(entry.assetKey, asset ? await cacheSignedAssetResponse(asset, entry.signedUrl) : entry.signedUrl)
            }
          }
          continue
        }

        console.warn('[GraphCore] project asset signing batch failed during hydration.', {
          projectId,
          batchSize: batch.length,
          batchStart: index,
          error: response.error ? await readFunctionsErrorMessage(response.error) : 'No signed URLs returned.',
        })
        for (const asset of batch) {
          const cached = getCachedSignedAssetUrl(asset)
          if (!cached) continue
          const resolvedUrl = await cacheSignedAssetResponse(asset, cached)
          signedUrls.set(asset.key, resolvedUrl)
        }
      }
    } catch (error) {
      console.error('[GraphCore] project asset signing failed during hydration.', error)
    }
  }

  const unresolvedCandidates = candidates.filter((asset) => !signedUrls.has(asset.key))
  for (const asset of unresolvedCandidates) {
    const cached = storageAssetUrlCache.get(asset.key)
    if (cached && cached.storagePath === asset.storagePath && (cached.expiresAt === null || cached.expiresAt > Date.now())) {
      signedUrls.set(asset.key, cached.url)
      continue
    }

    console.warn('[GraphCore] storage-backed asset was not signed during hydration.', {
      assetKey: asset.key,
      projectId,
      storagePath: asset.storagePath,
    })
  }

  if (signedUrls.size === 0) return normalizedAssets

  return normalizedAssets.map((asset) => (
    signedUrls.has(asset.key)
      ? {
          ...asset,
          metadata: {
            ...asset.metadata,
            previewUrl: signedUrls.get(asset.key),
            sourceUrl: signedUrls.get(asset.key),
          },
        }
      : asset
  ))
}

export async function signProjectAssetUrls(projectId: string, assetKeys: string[]) {
  const cleanKeys = Array.from(new Set(assetKeys.map((key) => key.trim()).filter(Boolean)))
  if (cleanKeys.length === 0) return []

  const response = await supabase
    .from('project_assets')
    .select('id, project_id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
    .eq('project_id', projectId)
    .in('key', cleanKeys)
  if (response.error) throw new Error(response.error.message)

  const assets = ((response.data ?? []) as AssetRow[]).map(mapAssetRow)
  return hydrateStorageAssetUrls(projectId, assets)
}

export async function signProjectAssetUrlEntries(input: SignProjectAssetUrlsRequest) {
  const cleanKeys = Array.from(new Set(input.assetKeys.map((key) => key.trim()).filter(Boolean)))
  if (cleanKeys.length === 0) return []

  const response = await supabase.functions.invoke<SignProjectAssetUrlsResponse>('sign-project-asset-urls', {
    body: {
      ...(input.projectId ? { projectId: input.projectId } : {}),
      assetKeys: cleanKeys,
    },
  })

  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }

  return response.data?.urls ?? []
}

export async function loadProjectDraftMetadata(draftId: string) {
  if (!isUuidLike(draftId)) {
    if (import.meta.env.DEV) {
      console.info('[GraphCore] skipped live draft metadata reload for non-live draft id.', { draftId })
    }
    return {}
  }

  const cached = draftMetadataSessionCache.get(draftId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.metadata
  }

  const draftResponse = await supabase
    .from('project_drafts')
    .select('metadata')
    .eq('id', draftId)
    .maybeSingle()

  if (draftResponse.error) {
    throw new Error(draftResponse.error.message)
  }

  const metadata = readRepositoryRecord(draftResponse.data?.metadata)
  draftMetadataSessionCache.set(draftId, {
    metadata,
    expiresAt: Date.now() + SESSION_DRAFT_METADATA_TTL_MS,
  })
  return metadata
}

function prettifyChoiceKey(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (segment) => segment.toUpperCase())
}

function deriveChoiceBody(
  node: NodeRow,
  graphEdges: EdgeRow[],
) {
  const body = typeof node.body === 'object' && node.body !== null ? { ...node.body } : {}
  const existingChoices = Array.isArray(body.choices) ? body.choices : []

  if (node.node_type !== 'choice' || existingChoices.length > 0) {
    return body
  }

  const ports = Array.isArray(node.ports) ? node.ports : []
  const derivedChoicesFromPorts = ports
    .filter((port) => port && port.direction === 'output' && typeof port.id === 'string' && port.id !== 'out')
    .map((port) => ({
      id: String(port.id),
      label: typeof port.label === 'string' && port.label.trim().length > 0 ? port.label : prettifyChoiceKey(String(port.id)),
    }))

  const derivedChoicesFromEdges = graphEdges
    .filter((edge) => edge.source_node_key === node.key && edge.source_port && edge.source_port !== 'out')
    .map((edge) => ({
      id: String(edge.source_port),
      label: typeof edge.label === 'string' && edge.label.trim().length > 0 ? edge.label : prettifyChoiceKey(String(edge.source_port)),
    }))

  const mergedChoices = new Map<string, { id: string; label: string }>()

  for (const choice of [...derivedChoicesFromPorts, ...derivedChoicesFromEdges]) {
    if (!mergedChoices.has(choice.id)) {
      mergedChoices.set(choice.id, choice)
    }
  }

  return {
    ...body,
    choices: [...mergedChoices.values()],
  }
}

export async function loadProjectSnapshot(
  selection?: { projectId?: string | null; draftId?: string | null },
  options?: SnapshotLoadOptions,
): Promise<SnapshotLoadResult> {
  const profile = options?.profile ?? DEFAULT_SNAPSHOT_LOAD_PROFILE
  const promptHistoryLimit = Math.max(1, options?.promptHistoryLimit ?? DEFAULT_PROMPT_HISTORY_LIMIT)
  const shouldHydrateAssetUrls = options?.hydrateAssetUrls ?? (profile === 'full' || profile === 'content' || profile === 'world')
  const includeFull = profile === 'full'
  const includeContent = profile === 'full' || profile === 'content' || profile === 'world'
  const includeJobs = profile === 'full' || profile === 'jobs' || profile === 'world'
  const includeWorld = profile !== 'shell'
  const includeGraphDraft = profile === 'full' || profile === 'content'
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return {
      snapshot: demoProjectSnapshot,
      source: 'demo',
      reason: 'No authenticated Supabase session found. Showing the bundled design reference project.',
    }
  }

  const workspaceMembership = await getPrimaryWorkspace(session)

  if (!workspaceMembership) {
    return {
      snapshot: demoProjectSnapshot,
      source: 'demo',
      reason: 'No GraphCore workspace was visible through RLS. Showing the bundled design reference project.',
    }
  }

  const workspace = workspaceMembership.workspace

  const resolvedSelection = await resolveActiveGameSelection(session, workspace.id)
  listGamesSessionCache.set(session.user.id, {
    games: resolvedSelection.games,
    expiresAt: Date.now() + SESSION_LIST_GAMES_TTL_MS,
  })
  const project =
    selection?.projectId
      ? resolvedSelection.projects.find((entry) => entry.id === selection.projectId) ?? null
      : resolvedSelection.project
  const draft =
    project && selection?.draftId
      ? (resolvedSelection.draftsByProjectId.get(project.id) ?? []).find((entry) => entry.id === selection.draftId) ?? null
      : project
        ? (
            selection?.projectId && !selection?.draftId
              ? pickPreferredDraft(resolvedSelection.draftsByProjectId.get(project.id) ?? [])
              : resolvedSelection.draft
          )
        : null

  if (!project) {
    return {
      snapshot: demoProjectSnapshot,
      source: 'demo',
      reason: 'No project data was found yet. Seed or create a project to switch the editor to live data.',
    }
  }

  if (!draft) {
    return {
      snapshot: demoProjectSnapshot,
      source: 'demo',
      reason: 'Project exists, but it has no draft yet. Showing the bundled design reference project.',
    }
  }

  if (selection?.projectId && selection?.draftId) {
    await setActiveWorkspaceGameState(workspace.id, project.id, draft.id)
  }

  if (profile === 'world' && !options?.skipCache) {
    const cached = await loadCachedProjectSnapshot(project.id, draft.id)
    if (cached) {
      try {
        const delta = await loadDraftDelta(draft.id, cached.lastRevision)
        const draftMetadataChanged = (delta.changedKeysByTable.project_drafts ?? []).length > 0
        if (draftMetadataChanged) {
          await clearProjectCache(project.id, draft.id)
          console.info('[GraphCore] draft metadata changed; refreshing full snapshot instead of replaying compact world delta.')
        } else if (!delta.requiresSnapshot) {
          const nextSnapshot = applyDraftDeltaToSnapshot(cached.snapshot, delta)
          if (nextSnapshot.project.id !== project.id || nextSnapshot.draft.id !== draft.id) {
            await clearProjectCache(project.id, draft.id)
            console.warn('[GraphCore] discarded cached delta result with mismatched snapshot identity.', {
              expectedProjectId: project.id,
              expectedDraftId: draft.id,
              cachedProjectId: nextSnapshot.project.id,
              cachedDraftId: nextSnapshot.draft.id,
            })
            throw new Error('Cached snapshot identity mismatch.')
          }
          const hydratedSnapshot = hydrateSnapshotOutputArtifactUrls({
            ...nextSnapshot,
            assets: shouldHydrateAssetUrls
              ? await hydrateStorageAssetUrls(nextSnapshot.project.id, nextSnapshot.assets)
              : nextSnapshot.assets,
          })
          const missingAssetRefs = findMissingAssetReferences(hydratedSnapshot)
          if (missingAssetRefs.length > 0) {
            await clearProjectCache(project.id, draft.id)
            console.info('[GraphCore] cached world snapshot was missing referenced assets; refreshing full snapshot.', {
              missingAssetRefs: missingAssetRefs.slice(0, 12),
              missingCount: missingAssetRefs.length,
            })
            throw new Error('Cached snapshot missing referenced assets.')
          }
          await saveCachedProjectSnapshot(hydratedSnapshot, delta.currentRevision)
          return {
            snapshot: hydratedSnapshot,
            source: 'supabase',
            profile,
            games: resolvedSelection.games,
          }
        }
      } catch (cacheError) {
        console.warn('[GraphCore] cached snapshot delta failed; falling back to compact snapshot.', cacheError)
      }
    }
  }

  const definitionIds = includeContent ? await getDefinitionIds(draft.id) : []
  const archetypeIds = includeContent ? await getArchetypeIds(draft.id) : []
  const definitionSelect = includeFull
    ? 'id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data'
    : 'id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, asset_refs'
  const archetypeSelect = includeFull
    ? 'id, key, name, summary, definition_kind, icon_asset_key, metadata, llm_hints'
    : 'id, key, name, summary, definition_kind, icon_asset_key, metadata'
  const assetSelect = includeFull
    ? 'id, project_id, key, name, kind, mime_type, storage_path, metadata, llm_hints'
    : 'id, project_id, key, name, kind, mime_type, storage_path, metadata'
  const worldViewSelect = includeFull
    ? WORLD_VIEW_SELECT
    : 'id, key, name, mode, filters, search, root_entity_key, camera, focus_depth, show_suggestions, show_labels, show_derived_layer, collapsed_state, sort_mode, metadata, created_at, updated_at'
  const worldPromptEventSelect = includeFull
    ? WORLD_PROMPT_EVENT_SELECT
    : 'id, session_id, turn_id, draft_id, sequence, event_type, op_id, payload, metadata, created_at'
  const worldBuildBatchSelect = includeFull
    ? 'id, draft_id, project_id, prompt, request_summary, planner_mode, status, diagnostics, plan_json, cinematic_plan, created_at, updated_at'
    : 'id, draft_id, project_id, prompt, request_summary, planner_mode, status, diagnostics, created_at, updated_at'
  const worldBuildJobSelect = includeFull
    ? 'id, batch_id, plan_item_id, kind, status, depends_on_job_ids, target_keys, prompt, options, provider_request_id, status_url, response_url, cancel_url, result_context, error_message, order_index, created_at, updated_at'
    : 'id, batch_id, plan_item_id, kind, status, depends_on_job_ids, target_keys, provider_request_id, status_url, response_url, cancel_url, error_message, order_index, created_at, updated_at'
  const meshGenerationJobSelect = includeFull
    ? 'id, project_id, draft_id, definition_key, source_image_asset_key, target_mesh_asset_key, provider, model, provider_request_id, status_url, response_url, cancel_url, status, provider_status, provider_logs, error_message, storage_path, created_at, updated_at'
    : 'id, project_id, draft_id, definition_key, source_image_asset_key, target_mesh_asset_key, provider, model, provider_request_id, status_url, response_url, cancel_url, status, provider_status, error_message, storage_path, created_at, updated_at'
  const cinematicRunJobSelect = includeFull
    ? 'id, run_id, graph_key, shot_node_key, kind, status, order_index, depends_on_job_ids, still_asset_key, video_asset_key, provider, model, provider_request_id, error_message, prompt, result_context, created_at, updated_at'
    : 'id, run_id, graph_key, shot_node_key, kind, status, order_index, depends_on_job_ids, still_asset_key, video_asset_key, provider, model, provider_request_id, error_message, created_at, updated_at'

  const [
    definitionsResponse,
    componentsResponse,
    archetypesResponse,
    archetypeFieldsResponse,
    customFieldsResponse,
    fieldValuesResponse,
    graphsResponse,
    nodesResponse,
    edgesResponse,
    assemblyGraphsResponse,
    assemblyNodesResponse,
    assemblyEdgesResponse,
    environmentBlueprintsResponse,
    assetsResponse,
    worldEntitiesResponse,
    worldRelationshipsResponse,
    worldViewsResponse,
    worldOperatorsResponse,
    worldResultsResponse,
    worldGraphConnectionsResponse,
    worldPromptSessionsResponse,
    worldPromptTurnsResponse,
    worldPromptMessagesResponse,
    worldPromptEventsResponse,
    worldPromptGenerationJobsResponse,
    worldPromptGenerationJobStepsResponse,
    worldPromptSuggestionsResponse,
    worldThreadsResponse,
    worldBuildBatchesResponse,
    meshGenerationJobsResponse,
    cinematicRunsResponse,
    outputWorkflowsResponse,
    outputWorkflowNodesResponse,
    outputWorkflowEdgesResponse,
    outputWorkflowRunsResponse,
    outputArtifactsResponse,
    outputRequestsResponse,
    patchSetsResponse,
    releasesResponse,
  ] = await Promise.all([
    includeContent
      ? supabase
          .from('project_definitions')
          .select(definitionSelect)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    definitionIds.length > 0
      ? supabase
          .from('project_definition_components')
          .select('definition_id, component_type, config')
          .in('definition_id', definitionIds)
      : Promise.resolve(emptyPostgrestResponse()),
    includeContent
      ? supabase
          .from('project_archetypes')
          .select(archetypeSelect)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    archetypeIds.length > 0
      ? supabase
          .from('project_archetype_fields')
          .select('id, draft_id, archetype_id, definition_id, key, label, field_type, description, required, default_value, constraints, sort_order')
          .eq('draft_id', draft.id)
          .not('archetype_id', 'is', null)
          .in('archetype_id', archetypeIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    definitionIds.length > 0
      ? supabase
          .from('project_archetype_fields')
          .select('id, draft_id, archetype_id, definition_id, key, label, field_type, description, required, default_value, constraints, sort_order')
          .eq('draft_id', draft.id)
          .not('definition_id', 'is', null)
          .in('definition_id', definitionIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    definitionIds.length > 0
      ? supabase
          .from('project_definition_field_values')
          .select('definition_id, field_key, value')
          .in('definition_id', definitionIds)
      : Promise.resolve(emptyPostgrestResponse()),
    includeGraphDraft
      ? supabase
          .from('draft_graphs')
          .select('id, key, name, graph_type, summary, entry_node_key, metadata, llm_hints')
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    includeGraphDraft
      ? supabase
          .from('draft_graph_nodes')
          .select('id, graph_id, key, node_type, title, template_key, subtitle, position_x, position_y, body, condition_expr, effect_ops, ports, display, metadata')
      : Promise.resolve(emptyPostgrestResponse()),
    includeGraphDraft
      ? supabase
          .from('draft_graph_edges')
          .select('id, graph_id, key, source_node_key, source_port, target_node_key, target_port, label, condition_expr, metadata')
      : Promise.resolve(emptyPostgrestResponse()),
    includeGraphDraft
      ? supabase
          .from('draft_assembly_graphs')
          .select('id, key, name, summary, bound_environment_key, metadata')
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    includeGraphDraft
      ? supabase
          .from('draft_assembly_nodes')
          .select('id, assembly_graph_id, key, kind, title, subtitle, position_x, position_y, ports, params, metadata')
      : Promise.resolve(emptyPostgrestResponse()),
    includeGraphDraft
      ? supabase
          .from('draft_assembly_edges')
          .select('id, assembly_graph_id, key, source_node_key, source_port, target_node_key, target_port, metadata')
      : Promise.resolve(emptyPostgrestResponse()),
    includeFull
      ? supabase
          .from('draft_environment_blueprints')
          .select('id, key, environment_key, name, document')
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    (includeFull || profile === 'content' || profile === 'world')
      ? supabase
          .from('project_assets')
          .select(assetSelect)
          .eq('project_id', project.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_entities')
          .select(WORLD_ENTITY_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_relationships')
          .select(WORLD_RELATIONSHIP_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_views')
          .select(worldViewSelect)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_operators')
          .select(WORLD_OPERATOR_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_results')
          .select(WORLD_RESULT_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_graph_connections')
          .select(WORLD_CONNECTION_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_prompt_sessions')
          .select(WORLD_PROMPT_SESSION_SELECT)
          .eq('draft_id', draft.id)
          .order('updated_at', { ascending: false })
          .limit(promptHistoryLimit)
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_prompt_turns')
          .select(WORLD_PROMPT_TURN_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: false })
          .limit(promptHistoryLimit)
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_prompt_messages')
          .select(WORLD_PROMPT_MESSAGE_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: false })
          .limit(promptHistoryLimit * 3)
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_prompt_events')
          .select(worldPromptEventSelect)
          .eq('draft_id', draft.id)
          .in('event_type', includeFull
            ? ['turn_started', 'message_created', 'planner_status', 'work_item_started', 'work_item_completed', 'work_item_failed', 'assistant_note', 'op_applied', 'op_needs_approval', 'op_approved', 'op_rejected', 'queue_started', 'turn_cancel_requested', 'turn_completed', 'turn_failed']
            : ['op_applied'])
          .order('created_at', { ascending: false })
          .limit(includeFull ? 1000 : promptHistoryLimit * 8)
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_prompt_generation_jobs')
          .select(WORLD_PROMPT_GENERATION_JOB_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: false })
          .limit(includeFull ? 100 : 20)
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_prompt_generation_job_steps')
          .select(WORLD_PROMPT_GENERATION_JOB_STEP_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: false })
          .limit(includeFull ? 500 : 100)
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_prompt_suggestions')
          .select(WORLD_PROMPT_SUGGESTION_SELECT)
          .eq('draft_id', draft.id)
          .order('rank', { ascending: true })
          .order('created_at', { ascending: false })
          .limit(promptHistoryLimit * 2)
      : Promise.resolve(emptyPostgrestResponse()),
    includeWorld
      ? supabase
          .from('world_threads')
          .select(WORLD_THREAD_SELECT)
          .eq('draft_id', draft.id)
          .order('updated_at', { ascending: false })
      : Promise.resolve(emptyPostgrestResponse()),
    includeJobs
      ? supabase
          .from('world_build_batches')
          .select(worldBuildBatchSelect)
          .eq('draft_id', draft.id)
          .in('status', includeFull ? ['planned', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'] : [...WORLD_BUILD_ACTIVE_STATUSES])
          .order('created_at', { ascending: false })
          .limit(includeFull ? 100 : 20)
      : Promise.resolve(emptyPostgrestResponse()),
    includeJobs
      ? supabase
          .from('mesh_generation_jobs')
          .select(meshGenerationJobSelect)
          .eq('draft_id', draft.id)
          .in('status', includeFull ? ['queued', 'submitting', 'running', 'succeeded', 'failed', 'cancelled'] : [...MESH_GENERATION_ACTIVE_STATUSES])
          .order('created_at', { ascending: false })
          .limit(includeFull ? 100 : 20)
      : Promise.resolve(emptyPostgrestResponse()),
    includeJobs
      ? supabase
          .from('cinematic_runs')
          .select('id, draft_id, project_id, graph_key, graph_name, mode, status, shot_node_key, diagnostics, created_at, updated_at')
          .eq('draft_id', draft.id)
          .in('status', includeFull ? ['queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'] : [...CINEMATIC_RUN_ACTIVE_STATUSES])
          .order('created_at', { ascending: false })
          .limit(includeFull ? 100 : 20)
      : Promise.resolve(emptyPostgrestResponse()),
    includeFull
      ? supabase
          .from('output_workflows')
          .select(OUTPUT_WORKFLOW_SELECT)
          .eq('draft_id', draft.id)
          .order('updated_at', { ascending: false })
          .limit(includeFull ? 100 : 20)
      : Promise.resolve(emptyPostgrestResponse()),
    includeFull
      ? supabase
          .from('output_workflow_nodes')
          .select(OUTPUT_WORKFLOW_NODE_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    includeFull
      ? supabase
          .from('output_workflow_edges')
          .select(OUTPUT_WORKFLOW_EDGE_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyPostgrestResponse()),
    includeFull
      ? supabase
          .from('output_workflow_runs')
          .select(OUTPUT_WORKFLOW_RUN_SELECT)
          .eq('draft_id', draft.id)
          .in('status', includeFull ? ['queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'] : ['queued', 'running'])
          .order('created_at', { ascending: false })
          .limit(includeFull ? 100 : 20)
      : Promise.resolve(emptyPostgrestResponse()),
    includeFull
      ? supabase
          .from('output_artifacts')
          .select(OUTPUT_ARTIFACT_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: false })
          .limit(includeFull ? 200 : 50)
      : Promise.resolve(emptyPostgrestResponse()),
    includeFull
      ? supabase
          .from('output_requests')
          .select(OUTPUT_REQUEST_SELECT)
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: false })
          .limit(includeFull ? 100 : 30)
      : Promise.resolve(emptyPostgrestResponse()),
    includeFull
      ? supabase
          .from('patch_sets')
          .select('id, summary, prompt, status, operations, diagnostics')
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: false })
      : Promise.resolve(emptyPostgrestResponse()),
    includeFull
      ? supabase
          .from('releases')
          .select('id, version, label, created_at')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false })
      : Promise.resolve(emptyPostgrestResponse()),
  ])

  const responseLogEntries = [
    ['project_definitions', definitionsResponse],
    ['project_definition_components', componentsResponse],
    ['project_archetypes', archetypesResponse],
    ['project_archetype_fields', archetypeFieldsResponse],
    ['project_archetype_fields.custom', customFieldsResponse],
    ['project_definition_field_values', fieldValuesResponse],
    ['draft_graphs', graphsResponse],
    ['draft_graph_nodes', nodesResponse],
    ['draft_graph_edges', edgesResponse],
    ['draft_assembly_graphs', assemblyGraphsResponse],
    ['draft_assembly_nodes', assemblyNodesResponse],
    ['draft_assembly_edges', assemblyEdgesResponse],
    ['draft_environment_blueprints', environmentBlueprintsResponse],
    ['project_assets', assetsResponse],
    ['world_entities', worldEntitiesResponse],
    ['world_relationships', worldRelationshipsResponse],
    ['world_views', worldViewsResponse],
    ['world_operators', worldOperatorsResponse],
    ['world_results', worldResultsResponse],
    ['world_graph_connections', worldGraphConnectionsResponse],
    ['world_prompt_sessions', worldPromptSessionsResponse],
    ['world_prompt_turns', worldPromptTurnsResponse],
    ['world_prompt_messages', worldPromptMessagesResponse],
    ['world_prompt_events', worldPromptEventsResponse],
    ['world_prompt_generation_jobs', worldPromptGenerationJobsResponse],
    ['world_prompt_generation_job_steps', worldPromptGenerationJobStepsResponse],
    ['world_prompt_suggestions', worldPromptSuggestionsResponse],
    ['world_threads', worldThreadsResponse],
    ['world_build_batches', worldBuildBatchesResponse],
    ['mesh_generation_jobs', meshGenerationJobsResponse],
    ['cinematic_runs', cinematicRunsResponse],
    ['output_workflows', outputWorkflowsResponse],
    ['output_workflow_nodes', outputWorkflowNodesResponse],
    ['output_workflow_edges', outputWorkflowEdgesResponse],
    ['output_workflow_runs', outputWorkflowRunsResponse],
    ['output_artifacts', outputArtifactsResponse],
    ['output_requests', outputRequestsResponse],
    ['patch_sets', patchSetsResponse],
    ['releases', releasesResponse],
  ] as const
  for (const [table, response] of responseLogEntries) {
    logPostgrestEgress({
      table,
      profile,
      caller: 'loadProjectSnapshot',
      data: 'data' in response ? response.data : null,
    })
  }

  const assemblySchemaMissing =
    postgrestStatus(assemblyGraphsResponse) === 404
    || postgrestStatus(assemblyNodesResponse) === 404
    || postgrestStatus(assemblyEdgesResponse) === 404
    || isMissingRelationError(assemblyGraphsResponse.error, 'draft_assembly_graphs')
    || isMissingRelationError(assemblyNodesResponse.error, 'draft_assembly_nodes')
    || isMissingRelationError(assemblyEdgesResponse.error, 'draft_assembly_edges')
  const blueprintSchemaMissing =
    postgrestStatus(environmentBlueprintsResponse) === 404
    || isMissingRelationError(environmentBlueprintsResponse.error, 'draft_environment_blueprints')
  const worldBuildSchemaMissing =
    postgrestStatus(worldBuildBatchesResponse) === 404
    || isMissingRelationError(worldBuildBatchesResponse.error, 'world_build_batches')
  const worldGraphSchemaMissing =
    postgrestStatus(worldEntitiesResponse) === 404
    || postgrestStatus(worldRelationshipsResponse) === 404
    || postgrestStatus(worldViewsResponse) === 404
    || postgrestStatus(worldOperatorsResponse) === 404
    || postgrestStatus(worldResultsResponse) === 404
    || postgrestStatus(worldGraphConnectionsResponse) === 404
    || isMissingRelationError(worldEntitiesResponse.error, 'world_entities')
    || isMissingRelationError(worldRelationshipsResponse.error, 'world_relationships')
    || isMissingRelationError(worldViewsResponse.error, 'world_views')
    || isMissingRelationError(worldOperatorsResponse.error, 'world_operators')
    || isMissingRelationError(worldResultsResponse.error, 'world_results')
    || isMissingRelationError(worldGraphConnectionsResponse.error, 'world_graph_connections')
  const worldPromptSchemaMissing =
    postgrestStatus(worldPromptSessionsResponse) === 404
    || postgrestStatus(worldPromptTurnsResponse) === 404
    || postgrestStatus(worldPromptMessagesResponse) === 404
    || postgrestStatus(worldPromptEventsResponse) === 404
    || postgrestStatus(worldPromptGenerationJobsResponse) === 404
    || postgrestStatus(worldPromptGenerationJobStepsResponse) === 404
    || postgrestStatus(worldPromptSuggestionsResponse) === 404
    || isMissingRelationError(worldPromptSessionsResponse.error, 'world_prompt_sessions')
    || isMissingRelationError(worldPromptTurnsResponse.error, 'world_prompt_turns')
    || isMissingRelationError(worldPromptMessagesResponse.error, 'world_prompt_messages')
    || isMissingRelationError(worldPromptEventsResponse.error, 'world_prompt_events')
    || isMissingRelationError(worldPromptGenerationJobsResponse.error, 'world_prompt_generation_jobs')
    || isMissingRelationError(worldPromptGenerationJobStepsResponse.error, 'world_prompt_generation_job_steps')
    || isMissingRelationError(worldPromptSuggestionsResponse.error, 'world_prompt_suggestions')
  const worldThreadSchemaMissing =
    postgrestStatus(worldThreadsResponse) === 404
    || isMissingRelationError(worldThreadsResponse.error, 'world_threads')
  const meshGenerationSchemaMissing =
    postgrestStatus(meshGenerationJobsResponse) === 404
    || isMissingRelationError(meshGenerationJobsResponse.error, 'mesh_generation_jobs')
  const cinematicRunSchemaMissing =
    postgrestStatus(cinematicRunsResponse) === 404
    || isMissingRelationError(cinematicRunsResponse.error, 'cinematic_runs')
  const outputWorkflowSchemaMissing =
    postgrestStatus(outputWorkflowsResponse) === 404
    || postgrestStatus(outputWorkflowNodesResponse) === 404
    || postgrestStatus(outputWorkflowEdgesResponse) === 404
    || postgrestStatus(outputWorkflowRunsResponse) === 404
    || postgrestStatus(outputArtifactsResponse) === 404
    || isMissingRelationError(outputWorkflowsResponse.error, 'output_workflows')
    || isMissingRelationError(outputWorkflowNodesResponse.error, 'output_workflow_nodes')
    || isMissingRelationError(outputWorkflowEdgesResponse.error, 'output_workflow_edges')
    || isMissingRelationError(outputWorkflowRunsResponse.error, 'output_workflow_runs')
    || isMissingRelationError(outputArtifactsResponse.error, 'output_artifacts')
  const outputRequestSchemaMissing =
    postgrestStatus(outputRequestsResponse) === 404
    || isMissingRelationError(outputRequestsResponse.error, 'output_requests')

  if (definitionsResponse.error || archetypesResponse.error) {
    return {
      snapshot: demoProjectSnapshot,
      source: 'demo',
      reason: 'The connected project is missing the latest items/archetypes schema. Showing the bundled reference project.',
    }
  }

  const definitions = (definitionsResponse.data as DefinitionRow[] | null) ?? []
  const components = (componentsResponse.data as ComponentRow[] | null) ?? []
  const archetypes = (archetypesResponse.data as ArchetypeRow[] | null) ?? []
  const archetypeFields = (archetypeFieldsResponse.data as FieldRow[] | null) ?? []
  const customFields = (customFieldsResponse.data as FieldRow[] | null) ?? []
  const fieldValues = (fieldValuesResponse.data as DefinitionFieldValueRow[] | null) ?? []
  const graphs = (graphsResponse.data as GraphRow[] | null) ?? []
  const nodes = (nodesResponse.data as NodeRow[] | null) ?? []
  const edges = (edgesResponse.data as EdgeRow[] | null) ?? []
  const assemblyGraphs = assemblySchemaMissing ? [] : (assemblyGraphsResponse.data as AssemblyGraphRow[] | null) ?? []
  const assemblyNodes = assemblySchemaMissing ? [] : (assemblyNodesResponse.data as AssemblyNodeRow[] | null) ?? []
  const assemblyEdges = assemblySchemaMissing ? [] : (assemblyEdgesResponse.data as AssemblyEdgeRow[] | null) ?? []
  const environmentBlueprints = blueprintSchemaMissing ? [] : (environmentBlueprintsResponse.data as EnvironmentBlueprintRow[] | null) ?? []
  const assets = (assetsResponse.data as AssetRow[] | null) ?? []
  const worldEntities = worldGraphSchemaMissing ? [] : (worldEntitiesResponse.data as WorldEntityRow[] | null) ?? []
  const worldRelationships = worldGraphSchemaMissing ? [] : (worldRelationshipsResponse.data as WorldRelationshipRow[] | null) ?? []
  const worldViews = worldGraphSchemaMissing ? [] : (worldViewsResponse.data as WorldViewRow[] | null) ?? []
  const worldOperators = worldGraphSchemaMissing ? [] : (worldOperatorsResponse.data as WorldOperatorRow[] | null) ?? []
  const worldResults = worldGraphSchemaMissing ? [] : (worldResultsResponse.data as WorldResultRow[] | null) ?? []
  const worldGraphConnections = worldGraphSchemaMissing ? [] : (worldGraphConnectionsResponse.data as WorldGraphConnectionRow[] | null) ?? []
  const worldPromptSessions = worldPromptSchemaMissing ? [] : (worldPromptSessionsResponse.data as WorldPromptSessionRow[] | null) ?? []
  const worldPromptTurns = (worldPromptSchemaMissing ? [] : (worldPromptTurnsResponse.data as WorldPromptTurnRow[] | null) ?? [])
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
  const worldPromptMessages = (worldPromptSchemaMissing ? [] : (worldPromptMessagesResponse.data as WorldPromptMessageRow[] | null) ?? [])
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
  const worldPromptEvents = (worldPromptSchemaMissing ? [] : (worldPromptEventsResponse.data as WorldPromptEventRow[] | null) ?? [])
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime() || left.sequence - right.sequence)
  const worldPromptGenerationJobs = worldPromptSchemaMissing ? [] : (worldPromptGenerationJobsResponse.data as WorldPromptGenerationJobRow[] | null) ?? []
  const worldPromptGenerationJobSteps = worldPromptSchemaMissing ? [] : (worldPromptGenerationJobStepsResponse.data as WorldPromptGenerationJobStepRow[] | null) ?? []
  const worldPromptSuggestions = worldPromptSchemaMissing ? [] : (worldPromptSuggestionsResponse.data as WorldPromptSuggestionRow[] | null) ?? []
  const worldThreads = worldThreadSchemaMissing ? [] : (worldThreadsResponse.data as WorldThreadRow[] | null) ?? []
  const worldBuildBatches = worldBuildSchemaMissing ? [] : (worldBuildBatchesResponse.data as WorldBuildBatchRow[] | null) ?? []
  const meshGenerationJobs = meshGenerationSchemaMissing ? [] : (meshGenerationJobsResponse.data as MeshGenerationJobRow[] | null) ?? []
  const cinematicRuns = cinematicRunSchemaMissing ? [] : (cinematicRunsResponse.data as CinematicRunRow[] | null) ?? []
  const outputWorkflows = outputWorkflowSchemaMissing ? [] : (outputWorkflowsResponse.data as OutputWorkflowRow[] | null) ?? []
  const outputWorkflowNodes = outputWorkflowSchemaMissing ? [] : (outputWorkflowNodesResponse.data as OutputWorkflowNodeRow[] | null) ?? []
  const outputWorkflowEdges = outputWorkflowSchemaMissing ? [] : (outputWorkflowEdgesResponse.data as OutputWorkflowEdgeRow[] | null) ?? []
  const outputWorkflowRuns = outputWorkflowSchemaMissing ? [] : (outputWorkflowRunsResponse.data as OutputWorkflowRunRow[] | null) ?? []
  const outputArtifacts = outputWorkflowSchemaMissing ? [] : (outputArtifactsResponse.data as OutputArtifactRow[] | null) ?? []
  const outputRequests = outputRequestSchemaMissing ? [] : (outputRequestsResponse.data as OutputRequestRow[] | null) ?? []
  const worldBuildJobs =
    worldBuildSchemaMissing || worldBuildBatches.length === 0
      ? []
      : (
          await supabase
            .from('world_build_jobs')
            .select(worldBuildJobSelect)
            .in('batch_id', worldBuildBatches.map((batch) => batch.id))
            .in('status', includeFull ? ['queued', 'running', 'succeeded', 'failed', 'skipped'] : ['queued', 'running'])
            .order('order_index', { ascending: true })
        ).data as WorldBuildJobRow[] | null ?? []
  const cinematicRunJobs =
    cinematicRunSchemaMissing || cinematicRuns.length === 0
      ? []
      : (
          await supabase
            .from('cinematic_run_jobs')
            .select(cinematicRunJobSelect)
            .in('run_id', cinematicRuns.map((run) => run.id))
            .in('status', includeFull ? ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped'] : ['queued', 'running'])
            .order('order_index', { ascending: true })
        ).data as CinematicRunJobRow[] | null ?? []
  const outputWorkflowStepRunIds = outputWorkflowSchemaMissing
    ? []
    : selectOutputRunIdsForStepHydration(outputWorkflowRuns, 6)
  const outputWorkflowRunSteps =
    outputWorkflowSchemaMissing || outputWorkflowStepRunIds.length === 0
      ? []
      : (
          await supabase
            .from('output_workflow_run_steps')
            .select(OUTPUT_WORKFLOW_RUN_STEP_STATUS_SELECT)
            .in('run_id', outputWorkflowStepRunIds)
            .order('order_index', { ascending: true })
        ).data as OutputWorkflowRunStepRow[] | null ?? []

  let snapshot = projectSnapshotSchema.parse({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: workspaceMembership.role,
    },
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      summary: project.summary ?? '',
      visibility: project.visibility,
    },
    draft: {
      id: draft.id,
      name: draft.name,
      version: draft.version,
      isPrimary: draft.is_primary,
      updatedAt: draft.updated_at,
      metadata: draft.metadata ?? {},
    },
    gameSpec:
      draft.metadata && typeof draft.metadata === 'object' && draft.metadata !== null && 'gameSpec' in draft.metadata
        ? (draft.metadata as { gameSpec?: unknown }).gameSpec
        : null,
    projectContext:
      draft.metadata && typeof draft.metadata === 'object' && draft.metadata !== null && 'projectContext' in draft.metadata
        ? (draft.metadata as { projectContext?: unknown }).projectContext
        : null,
    archetypes: archetypes.map((archetype) => ({
      id: archetype.id,
      key: archetype.key,
      name: archetype.name,
      summary: archetype.summary ?? '',
      appliesToKind: archetype.definition_kind,
      iconAssetKey: archetype.icon_asset_key,
      metadata: archetype.metadata ?? {},
      llmHints: archetype.llm_hints ?? {},
      fields: archetypeFields
        .filter((field) => field.archetype_id === archetype.id)
        .map((field) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          fieldType: field.field_type,
          description: field.description ?? '',
          required: field.required,
          defaultValue: field.default_value ?? null,
          constraints: field.constraints ?? {},
          sortOrder: field.sort_order ?? 0,
        })),
    })),
    definitions: definitions.map((definition) => ({
      id: definition.id,
      key: definition.key,
      kind: definition.kind,
      name: definition.name,
      summary: definition.summary ?? '',
      status: definition.status,
      iconAssetKey: definition.icon_asset_key,
      archetypeKey: definition.archetype_key,
      tags: definition.tags ?? [],
      schemaVersion: definition.schema_version ?? 1,
      metadata: definition.metadata ?? {},
      llmHints: definition.llm_hints ?? {},
      assetRefs: definition.asset_refs ?? [],
      definitionData: definition.definition_data ?? {},
      fieldValues: fieldValues
        .filter((fieldValue) => fieldValue.definition_id === definition.id)
        .map((fieldValue) => ({
          fieldKey: fieldValue.field_key,
          value: fieldValue.value ?? null,
        })),
      customFields: customFields
        .filter((field) => field.definition_id === definition.id)
        .map((field) => ({
          id: field.id,
          key: field.key,
          label: field.label,
          fieldType: field.field_type,
          description: field.description ?? '',
          required: field.required,
          defaultValue: field.default_value ?? null,
          constraints: field.constraints ?? {},
          sortOrder: field.sort_order ?? 0,
        })),
      components: components
        .filter((component) => component.definition_id === definition.id)
        .map((component) => ({
          type: component.component_type,
          config: component.config,
        })),
    })),
    graphs: graphs.map((graph) => ({
      id: graph.id,
      key: graph.key,
      name: graph.name,
      graphType: graph.graph_type,
      summary: graph.summary ?? '',
      entryNodeKey: graph.entry_node_key,
      metadata: graph.metadata ?? {},
      llmHints: graph.llm_hints ?? {},
      nodes: (() => {
        const graphNodes = nodes.filter((node) => node.graph_id === graph.id)
        const graphEdges = edges.filter((edge) => edge.graph_id === graph.id)

        return graphNodes
        .map((node) => ({
          id: node.id,
          key: node.key,
          type: node.node_type,
          title: node.title,
          templateKey: node.template_key ?? (typeof node.metadata?.templateKey === 'string' ? node.metadata.templateKey : null),
          subtitle: node.subtitle ?? (typeof node.metadata?.subtitle === 'string' ? node.metadata.subtitle : null),
          position: {
            x: Number(node.position_x),
            y: Number(node.position_y),
          },
          body: deriveChoiceBody(node, graphEdges),
          condition: node.condition_expr,
          effects: node.effect_ops ?? [],
          ports: node.ports ?? [],
          display:
            node.display && typeof node.display === 'object'
              ? node.display
              : node.metadata?.display && typeof node.metadata.display === 'object'
              ? node.metadata.display
              : {},
          metadata: node.metadata ?? {},
        }))
      })(),
      edges: edges
        .filter((edge) => edge.graph_id === graph.id)
        .map((edge) => ({
          id: edge.id,
          key: edge.key,
          source: {
            nodeKey: edge.source_node_key,
            portId: edge.source_port,
          },
          target: {
            nodeKey: edge.target_node_key,
            portId: edge.target_port,
          },
          label: edge.label,
          condition: edge.condition_expr,
          metadata: edge.metadata ?? {},
        })),
    })),
    assemblyGraphs: assemblyGraphs.map((graph) => ({
      id: graph.id,
      key: graph.key,
      name: graph.name,
      summary: graph.summary ?? '',
      boundEnvironmentKey: graph.bound_environment_key,
      metadata: graph.metadata ?? {},
      nodes: assemblyNodes
        .filter((node) => node.assembly_graph_id === graph.id)
        .map((node) => ({
          id: node.id,
          key: node.key,
          kind: node.kind,
          title: node.title,
          subtitle: node.subtitle ?? null,
          position: {
            x: Number(node.position_x),
            y: Number(node.position_y),
          },
          ports: (node.ports ?? []) as AssemblyNodeDefinition['ports'],
          params: node.params ?? {},
          metadata: node.metadata ?? {},
        })),
      edges: assemblyEdges
        .filter((edge) => edge.assembly_graph_id === graph.id)
        .map((edge) => ({
          id: edge.id,
          key: edge.key,
          source: {
            nodeKey: edge.source_node_key,
            portId: edge.source_port,
          },
          target: {
            nodeKey: edge.target_node_key,
            portId: edge.target_port,
          },
          metadata: edge.metadata ?? {},
        })),
    })),
    environmentBlueprints: environmentBlueprints
      .map((blueprint) => {
        const parsed = environmentBlueprintV1Schema.safeParse(blueprint.document)
        if (!parsed.success) return null
        return {
          ...parsed.data,
          id: parsed.data.id || blueprint.key,
          environmentKey: parsed.data.environmentKey || blueprint.environment_key,
          name: parsed.data.name || blueprint.name,
        }
      })
      .filter((blueprint): blueprint is EnvironmentBlueprintV1 => blueprint !== null),
    assets: assets.map((asset) => ({
      id: asset.id,
      projectId: asset.project_id,
      key: asset.key,
      name: asset.name,
      kind: asset.kind,
      mimeType: asset.mime_type,
      storagePath: asset.storage_path,
      metadata: asset.metadata ?? {},
      llmHints: asset.llm_hints ?? {},
    })),
    worldEntities: worldEntities.map((entity) => ({
      id: entity.id,
      key: entity.key,
      name: entity.name,
      summary: entity.summary ?? '',
      context: entity.context ?? '',
      nodeType: entity.node_type,
      aliases: entity.aliases ?? [],
      tags: entity.tags ?? [],
      status: entity.status,
      thumbnailAssetKey: entity.thumbnail_asset_key,
      linkedDefinitionKey: entity.linked_definition_key,
      source: entity.source,
      customProperties: entity.custom_properties ?? {},
      metadata: entity.metadata ?? {},
      createdAt: entity.created_at,
      updatedAt: entity.updated_at,
    })),
    worldRelationships: worldRelationships.map((relationship) => {
      const sourceEntity = worldEntities.find((entity) => entity.id === relationship.source_entity_id) ?? null
      const targetEntity = worldEntities.find((entity) => entity.id === relationship.target_entity_id) ?? null
      return {
        id: relationship.id,
        key: relationship.key,
        sourceEntityKey: sourceEntity?.key ?? relationship.source_entity_id,
        targetEntityKey: targetEntity?.key ?? relationship.target_entity_id,
        verb: relationship.verb,
        direction: relationship.direction,
        strength: relationship.strength,
        confidence: relationship.confidence,
        source: relationship.source,
        notes: relationship.notes ?? '',
        state: relationship.state,
        metadata: relationship.metadata ?? {},
        createdAt: relationship.created_at,
        updatedAt: relationship.updated_at,
      }
    }),
    worldViews: worldViews.map((view) => ({
      id: view.id,
      key: view.key,
      name: view.name,
      mode: view.mode,
      filters: view.filters ?? {},
      search: view.search ?? '',
      rootEntityKey: view.root_entity_key,
      camera: view.camera ?? {},
      focusDepth: view.focus_depth ?? 1,
      showSuggestions: view.show_suggestions ?? true,
      showLabels: view.show_labels ?? true,
      showDerivedLayer: view.show_derived_layer ?? true,
      nodePositions: view.node_positions ?? {},
      collapsedState: view.collapsed_state ?? {},
      sortMode: view.sort_mode ?? 'manual',
      metadata: view.metadata ?? {},
      createdAt: view.created_at,
      updatedAt: view.updated_at,
    })),
    worldOperators: worldOperators.map((entry) => ({
      id: entry.id,
      key: entry.key,
      operatorType: entry.operator_type,
      inputEntityKeys: entry.input_entity_keys ?? [],
      label: entry.label ?? '',
      status: entry.status,
      metadata: entry.metadata ?? {},
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    })),
    worldResults: worldResults.map((entry) => ({
      id: entry.id,
      key: entry.key,
      resultType: entry.result_type,
      sourceOperatorKey: entry.source_operator_key,
      title: entry.title,
      summary: entry.summary ?? '',
      previewAssetKey: entry.preview_asset_key,
      status: entry.status,
      metadata: entry.metadata ?? {},
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    })),
    worldGraphConnections: worldGraphConnections.map((entry) => ({
      id: entry.id,
      key: entry.key,
      sourceNodeKey: entry.source_node_key,
      sourceNodeKind: entry.source_node_kind,
      targetNodeKey: entry.target_node_key,
      targetNodeKind: entry.target_node_kind,
      role: entry.role,
      metadata: entry.metadata ?? {},
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    })),
    worldPromptSessions: worldPromptSessions.map((entry) => mapWorldPromptSessionRow(entry)),
    worldPromptTurns: worldPromptTurns.map((entry) => mapWorldPromptTurnRow(entry)),
    worldPromptMessages: worldPromptMessages.map((entry) => mapWorldPromptMessageRow(entry)),
    worldPromptEvents: worldPromptEvents.map((entry) => mapWorldPromptEventRow(entry)),
    worldPromptGenerationJobs: worldPromptGenerationJobs.map((entry) => mapWorldPromptGenerationJobRow(entry)),
    worldPromptGenerationJobSteps: worldPromptGenerationJobSteps.map((entry) => mapWorldPromptGenerationJobStepRow(entry)),
    worldPromptSuggestions: worldPromptSuggestions
      .map((entry) => mapWorldPromptSuggestionRow(entry))
      .filter((entry): entry is WorldPromptSuggestionRecord => Boolean(entry)),
    worldThreads: worldThreads.map((entry) => mapWorldThreadRow(entry)),
    worldBuildBatches: worldBuildBatches.map((batch) => ({
      id: batch.id,
      projectId: batch.project_id,
      draftId: batch.draft_id,
      prompt: batch.prompt,
      requestSummary: batch.request_summary,
      plannerMode: batch.planner_mode ?? 'world_build',
      status: batch.status,
      diagnostics: batch.diagnostics ?? [],
      planItems: batch.plan_json ?? [],
      cinematicPlan: batch.cinematic_plan ?? null,
      createdAt: batch.created_at,
      updatedAt: batch.updated_at,
      jobs: worldBuildJobs
        .filter((job) => job.batch_id === batch.id)
        .map((job) => {
          const queueMetadata = readGenerationQueueMetadata({
            ...(job.result_context ?? {}),
            providerRequestId: job.provider_request_id ?? undefined,
            statusUrl: job.status_url ?? undefined,
            responseUrl: job.response_url ?? undefined,
            cancelUrl: job.cancel_url ?? undefined,
          })
          return {
            id: job.id,
            batchId: job.batch_id,
            planItemId: job.plan_item_id,
            kind: job.kind,
            status: job.status,
            dependsOnJobIds: job.depends_on_job_ids ?? [],
            targetKeys: job.target_keys ?? {},
            prompt: job.prompt ?? '',
            options: job.options ?? {},
            providerRequestId: queueMetadata.providerRequestId,
            statusUrl: queueMetadata.statusUrl,
            responseUrl: queueMetadata.responseUrl,
            cancelUrl: queueMetadata.cancelUrl,
            resultContext: job.result_context ?? null,
            errorMessage: job.error_message ?? null,
            orderIndex: job.order_index,
            createdAt: job.created_at,
            updatedAt: job.updated_at,
          }
        }),
    })),
    meshGenerationJobs: meshGenerationJobs.map((job) => meshGenerationJobSchema.parse({
      id: job.id,
      projectId: job.project_id,
      draftId: job.draft_id,
      definitionKey: job.definition_key,
      sourceImageAssetKey: job.source_image_asset_key,
      targetMeshAssetKey: job.target_mesh_asset_key,
      provider: job.provider,
      model: job.model,
      providerRequestId: job.provider_request_id,
      statusUrl: job.status_url,
      responseUrl: job.response_url,
      cancelUrl: job.cancel_url,
      status: job.status,
      providerStatus: job.provider_status,
      providerLogs: Array.isArray(job.provider_logs)
        ? job.provider_logs
            .map((entry) => {
              if (typeof entry === 'string') return entry
              if (entry && typeof entry === 'object' && typeof (entry as { message?: unknown }).message === 'string') {
                return String((entry as { message: string }).message)
              }
              return null
            })
            .filter((entry): entry is string => Boolean(entry))
        : [],
      errorMessage: job.error_message,
      storagePath: job.storage_path,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    })),
    cinematicRuns: cinematicRuns.map((run) => cinematicRunSchema.parse({
      id: run.id,
      draftId: run.draft_id,
      projectId: run.project_id,
      graphKey: run.graph_key,
      graphName: run.graph_name,
      mode: run.mode,
      status: run.status,
      shotNodeKey: run.shot_node_key,
      diagnostics: run.diagnostics ?? [],
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      jobs: cinematicRunJobs
        .filter((job) => job.run_id === run.id)
        .map((job) => ({
          id: job.id,
          runId: job.run_id,
          graphKey: job.graph_key,
          shotNodeKey: job.shot_node_key,
          shotId: typeof job.result_context?.shotId === 'string' ? job.result_context.shotId : null,
          kind: job.kind,
          status: job.status,
          orderIndex: job.order_index,
          dependsOnJobIds: job.depends_on_job_ids ?? [],
          stillAssetKey: job.still_asset_key,
          videoAssetKey: job.video_asset_key,
          provider: job.provider,
          model: job.model,
          providerRequestId: job.provider_request_id,
          errorMessage: job.error_message,
          prompt: job.prompt ?? '',
          resultContext: job.result_context ?? null,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
        })),
    })),
    outputWorkflows: outputWorkflows.map((workflow) => mapOutputWorkflowRow(workflow)),
    outputWorkflowNodes: outputWorkflowNodes.map((node) => mapOutputWorkflowNodeRow(node)),
    outputWorkflowEdges: outputWorkflowEdges.map((edge) => mapOutputWorkflowEdgeRow(edge)),
    outputWorkflowRuns: (() => {
      const mappedSteps = outputWorkflowRunSteps.map((step) => mapOutputWorkflowRunStepRow(step))
      const mappedArtifacts = outputArtifacts.map((artifact) => mapOutputArtifactRow(artifact))
      return outputWorkflowRuns.map((run) => mapOutputWorkflowRunRow(run, mappedSteps, mappedArtifacts))
    })(),
    outputArtifacts: outputArtifacts.map((artifact) => mapOutputArtifactRow(artifact)),
    outputRequests: outputRequests.map((request) => mapOutputRequestRow(request)),
    patchSets: patchSetsResponse.data ?? [],
    releases: (releasesResponse.data ?? []).map((release) => ({
      id: release.id,
      version: release.version,
      label: release.label,
      createdAt: release.created_at,
    })),
  })

  snapshot = hydrateSnapshotOutputArtifactUrls({
    ...snapshot,
    assets: shouldHydrateAssetUrls
      ? await hydrateStorageAssetUrls(snapshot.project.id, snapshot.assets)
      : snapshot.assets,
  })

  if (profile === 'world' && !options?.skipCache) {
    try {
      const delta = await loadDraftDelta(snapshot.draft.id, null)
      await saveCachedProjectSnapshot(snapshot, delta.currentRevision)
    } catch (cacheError) {
      console.warn('[GraphCore] failed to refresh local snapshot cache.', cacheError)
    }
  }

  return {
    snapshot,
    source: 'supabase',
    profile,
    games: resolvedSelection.games,
  }
}

export async function ensureLiveProjectSnapshot(): Promise<SnapshotLoadResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const initial = await loadProjectSnapshot(undefined, { profile: 'shell', hydrateAssetUrls: false })

  if (!session || initial.source === 'supabase' || !shouldBootstrapLiveProject(initial.reason)) {
    if (session && initial.source === 'supabase' && initial.profile !== 'shell' && hasMissingBaselineArchetypes(initial.snapshot.archetypes)) {
      await seedBaselineArchetypesDirect(initial.snapshot.draft.id, session.user.id)
      return loadProjectSnapshot(undefined, { profile: 'shell', hydrateAssetUrls: false })
    }

    return initial
  }

  try {
    await bootstrapLiveWorkspace(session)
  } catch (bootstrapError) {
    console.error('[GraphCore] live workspace bootstrap failed during snapshot load.', bootstrapError)
    const message = bootstrapError instanceof Error ? bootstrapError.message : 'Live workspace bootstrap failed.'
    return {
      ...initial,
      reason: `${initial.reason ?? 'Live bootstrap failed.'} ${message}`,
    }
  }

  return loadProjectSnapshot(undefined, { profile: 'shell', hydrateAssetUrls: false })
}

async function ensureWorkspaceShellDirect(session: Session) {
  const seed = bootstrapSeedFromSession(session)
  const timestampSeed = Date.now().toString(36)

  const existingMembership = await getPrimaryWorkspace(session)
  if (existingMembership) {
    return existingMembership.workspace.id
  }

  const workspaceId = crypto.randomUUID()
  const createdWorkspace = await supabase
    .from('workspaces')
    .insert({
      id: workspaceId,
      name: seed.workspaceName,
      slug: `${seed.cleanedSeed}-${timestampSeed}`,
      summary: 'Live GraphCore workspace bootstrapped from the editor.',
      created_by: session.user.id,
      metadata: {
        bootstrapSource: 'web_app',
        bootstrapVersion: 5,
      },
    })

  if (createdWorkspace.error) {
    throw new Error(createdWorkspace.error?.message ?? 'Workspace creation failed.')
  }

  const membershipInsert = await supabase
    .from('workspace_memberships')
    .insert({
      workspace_id: workspaceId,
      user_id: session.user.id,
      role: 'owner',
    })

  if (membershipInsert.error) {
    throw new Error(membershipInsert.error.message)
  }

  return workspaceId
}

async function createGameDirect(session: Session, workspaceId: string, options?: { projectName?: string; draftName?: string }) {
  const { projects } = await listWorkspaceProjectsAndDrafts(workspaceId)
  const timestampSeed = Date.now().toString(36)
  const sequence = projects.length + 1
  const projectName = options?.projectName?.trim() || `Untitled Game ${sequence}`
  const draftName = options?.draftName?.trim() || 'Main Draft'
  const projectId = crypto.randomUUID()
  const draftId = crypto.randomUUID()

  const createdProject = await supabase
    .from('projects')
    .insert({
      id: projectId,
      workspace_id: workspaceId,
      name: projectName,
      slug: `${slugify(projectName) || 'game'}-${timestampSeed}`,
      summary: 'GraphCore game project created from the editor.',
      visibility: 'private',
      created_by: session.user.id,
      metadata: {
        bootstrapSource: 'web_app',
        bootstrapVersion: 5,
      },
    })

  if (createdProject.error) {
    throw new Error(createdProject.error?.message ?? 'Project creation failed.')
  }

  const createdDraft = await supabase
    .from('project_drafts')
    .insert({
      id: draftId,
      project_id: projectId,
      name: draftName,
      version: 1,
      is_primary: true,
      created_by: session.user.id,
      metadata: {
        bootstrapSource: 'web_app',
        bootstrapVersion: 5,
        bootstrapStatus: 'pending',
      },
    })

  if (createdDraft.error) {
    throw new Error(createdDraft.error?.message ?? 'Draft creation failed.')
  }

  await seedBaselineArchetypesDirect(draftId, session.user.id)
  await setActiveWorkspaceGameState(workspaceId, projectId, draftId)
  listGamesSessionCache.delete(session.user.id)

  return { projectId, draftId }
}

export async function listGames(): Promise<GameSummary[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return []

  const cacheKey = session.user.id
  const cached = listGamesSessionCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.games
  }

  const workspaceMembership = await getPrimaryWorkspace(session)
  if (!workspaceMembership) return []

  const { projects, draftsByProjectId } = await listWorkspaceProjectsAndDrafts(workspaceMembership.workspace.id)

  const games = buildGameSummaries(projects, draftsByProjectId)
  listGamesSessionCache.set(cacheKey, { games, expiresAt: Date.now() + SESSION_LIST_GAMES_TTL_MS })
  return games
}

export async function setActiveGame(projectId: string, draftId: string, options?: SnapshotLoadOptions): Promise<SnapshotLoadResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new Error('Sign in before switching games.')
  }

  const workspaceMembership = await getPrimaryWorkspace(session)
  if (!workspaceMembership) {
    throw new Error('No live workspace is available for this account.')
  }

  await setActiveWorkspaceGameState(workspaceMembership.workspace.id, projectId, draftId)
  return loadProjectSnapshot({ projectId, draftId }, {
    ...options,
    profile: options?.profile ?? 'shell',
    hydrateAssetUrls: options?.hydrateAssetUrls ?? false,
  })
}

export async function loadCachedProjectSnapshot(projectId: string, draftId: string): Promise<GraphCoreClientCacheSnapshot | null> {
  const cacheKey = cacheKeyForProjectDraft(projectId, draftId)
  const cached = await withCacheStore<GraphCoreClientCacheSnapshot & { cacheKey: string }>('readonly', (store) => store.get(cacheKey))
  if (!cached) return null
  if (
    cached.projectId !== projectId
    || cached.draftId !== draftId
    || cached.cacheSchemaVersion !== GRAPHCORE_CACHE_SCHEMA_VERSION
    || !cached.snapshot
  ) {
    return null
  }
  const parsed = projectSnapshotSchema.safeParse(cached.snapshot)
  if (!parsed.success) return null
  if (parsed.data.project.id !== projectId || parsed.data.draft.id !== draftId) {
    await clearProjectCache(projectId, draftId)
    console.warn('[GraphCore] discarded project cache with mismatched embedded snapshot identity.', {
      expectedProjectId: projectId,
      expectedDraftId: draftId,
      cachedProjectId: parsed.data.project.id,
      cachedDraftId: parsed.data.draft.id,
    })
    return null
  }
  return {
    projectId,
    draftId,
    cacheSchemaVersion: GRAPHCORE_CACHE_SCHEMA_VERSION,
    lastRevision: Number.isFinite(cached.lastRevision) ? cached.lastRevision : 0,
    cachedAt: cached.cachedAt,
    snapshot: parsed.data,
  }
}

export async function saveCachedProjectSnapshot(snapshot: ProjectSnapshot, revision: DraftRevision) {
  const cacheSnapshot = stripTransientAssetUrlsForCache(snapshot)
  const cacheKey = cacheKeyForProjectDraft(snapshot.project.id, snapshot.draft.id)
  const entry: GraphCoreClientCacheSnapshot & { cacheKey: string } = {
    cacheKey,
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
    cacheSchemaVersion: GRAPHCORE_CACHE_SCHEMA_VERSION,
    profile: 'world',
    lastRevision: revision,
    cachedAt: new Date().toISOString(),
    rowCounts: {
      assets: cacheSnapshot.assets.length,
      worldEntities: cacheSnapshot.worldEntities.length,
      worldRelationships: cacheSnapshot.worldRelationships.length,
      outputRequests: cacheSnapshot.outputRequests.length,
      outputArtifacts: cacheSnapshot.outputArtifacts.length,
    },
    snapshot: cacheSnapshot,
  }
  await withCacheStore<IDBValidKey>('readwrite', (store) => store.put(entry))
}

export async function clearProjectCache(projectId: string, draftId: string) {
  const cacheKey = cacheKeyForProjectDraft(projectId, draftId)
  await withCacheStore<undefined>('readwrite', (store) => store.delete(cacheKey))
  draftMetadataSessionCache.delete(draftId)
}

export async function loadCachedOutputInbox(projectId: string, draftId: string): Promise<GraphCoreClientOutputInboxCache | null> {
  const cacheKey = cacheKeyForOutputInbox(projectId, draftId)
  const cached = await withCacheStore<GraphCoreClientOutputInboxCache & { cacheKey: string }>('readonly', (store) => store.get(cacheKey))
  if (!cached) return null
  if (
    cached.projectId !== projectId
    || cached.draftId !== draftId
    || cached.cacheSchemaVersion !== GRAPHCORE_CACHE_SCHEMA_VERSION
    || cached.profile !== 'outputs'
    || !cached.inbox
  ) {
    return null
  }
  return {
    projectId,
    draftId,
    cacheSchemaVersion: GRAPHCORE_CACHE_SCHEMA_VERSION,
    profile: 'outputs',
    cachedAt: cached.cachedAt,
    rowCounts: cached.rowCounts,
    inbox: stripTransientOutputInboxUrlsForCache(cached.inbox),
  }
}

export async function saveCachedOutputInbox(projectId: string, draftId: string, inbox: OutputInboxSlice) {
  const cacheKey = cacheKeyForOutputInbox(projectId, draftId)
  const cacheInbox = stripTransientOutputInboxUrlsForCache(inbox)
  const entry: GraphCoreClientOutputInboxCache & { cacheKey: string } = {
    cacheKey,
    projectId,
    draftId,
    cacheSchemaVersion: GRAPHCORE_CACHE_SCHEMA_VERSION,
    profile: 'outputs',
    cachedAt: new Date().toISOString(),
    rowCounts: {
      requests: cacheInbox.requests.length,
      workflows: cacheInbox.workflows.length,
      runs: cacheInbox.runs.length,
      artifacts: cacheInbox.artifacts.length,
      assets: cacheInbox.assets.length,
    },
    inbox: cacheInbox,
  }
  await withCacheStore<IDBValidKey>('readwrite', (store) => store.put(entry))
}

export async function clearOutputInboxCache(projectId: string, draftId: string) {
  const cacheKey = cacheKeyForOutputInbox(projectId, draftId)
  await withCacheStore<undefined>('readwrite', (store) => store.delete(cacheKey))
  const prefix = `${projectId}:${draftId}:`
  for (const key of outputFeedSessionCache.keys()) {
    if (key.startsWith(prefix)) outputFeedSessionCache.delete(key)
  }
  for (const key of outputGraphRevisionSessionCache.keys()) {
    if (key.startsWith(prefix)) outputGraphRevisionSessionCache.delete(key)
  }
  for (const key of selectedGraphNodeOutputSessionCache.keys()) {
    if (key.startsWith(prefix)) selectedGraphNodeOutputSessionCache.delete(key)
  }
}

function parseStringArrayMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {}
  const result: Record<string, string[]> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = Array.isArray(entry) ? entry.filter((item): item is string => typeof item === 'string') : []
  }
  return result
}

export async function loadDraftDelta(draftId: string, sinceRevision: DraftRevision | null): Promise<DraftDeltaResponse> {
  await getValidatedSession('Sign in and load a live GraphCore draft before loading draft changes.')
  const response = await supabase.rpc('get_draft_delta', {
    target_draft_id: draftId,
    since_revision: sinceRevision,
    cache_schema_version: GRAPHCORE_CACHE_SCHEMA_VERSION,
  })
  if (response.error) {
    throw new Error(response.error.message)
  }
  const raw = response.data && typeof response.data === 'object'
    ? response.data as Record<string, unknown>
    : {}
  const compactRows = raw.compactRows && typeof raw.compactRows === 'object'
    ? raw.compactRows as Record<string, unknown[]>
    : {}
  return {
    currentRevision: typeof raw.currentRevision === 'number' ? raw.currentRevision : Number(raw.currentRevision ?? 0),
    requiresSnapshot: raw.requiresSnapshot === true,
    changedKeysByTable: parseStringArrayMap(raw.changedKeysByTable),
    deletedKeysByTable: parseStringArrayMap(raw.deletedKeysByTable),
    compactRows,
  }
}

function upsertEntriesByKey<T extends { key: string }>(current: T[], incoming: T[]) {
  let next = current
  for (const entry of incoming) {
    next = upsertEntryByKey(next, entry)
  }
  return next
}

function upsertEntriesById<T extends { id: string }>(current: T[], incoming: T[]) {
  if (incoming.length === 0) return current
  const incomingMap = new Map(incoming.map((entry) => [entry.id, entry]))
  const merged = current.map((entry) => incomingMap.get(entry.id) ?? entry)
  const seen = new Set(current.map((entry) => entry.id))
  for (const entry of incoming) {
    if (!seen.has(entry.id)) merged.push(entry)
  }
  return merged
}

function removeByKeys<T extends { key: string }>(entries: T[], keys: string[] | undefined) {
  if (!keys || keys.length === 0) return entries
  const keySet = new Set(keys)
  return entries.filter((entry) => !keySet.has(entry.key))
}

function removeByIds<T extends { id: string }>(entries: T[], ids: string[] | undefined) {
  if (!ids || ids.length === 0) return entries
  const idSet = new Set(ids)
  return entries.filter((entry) => !idSet.has(entry.id))
}

function mapDefinitionDeltaRow(row: DefinitionRow, existing: DefinitionBase | null): DefinitionBase {
  return {
    id: row.id,
    key: row.key,
    kind: row.kind,
    name: row.name,
    summary: row.summary ?? '',
    status: row.status,
    iconAssetKey: row.icon_asset_key,
    archetypeKey: row.archetype_key,
    tags: row.tags ?? [],
    schemaVersion: row.schema_version ?? 1,
    metadata: row.metadata ?? {},
    llmHints: existing?.llmHints ?? row.llm_hints ?? {},
    assetRefs: existing?.assetRefs ?? (Array.isArray(row.asset_refs) ? row.asset_refs as DefinitionBase['assetRefs'] : []),
    definitionData: existing?.definitionData ?? row.definition_data ?? {},
    fieldValues: existing?.fieldValues ?? [],
    customFields: existing?.customFields ?? [],
    components: existing?.components ?? [],
  }
}

function mapAssetDeltaRow(row: AssetRow): AssetDefinition {
  return {
    id: row.id,
    projectId: row.project_id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    metadata: row.metadata ?? {},
    llmHints: row.llm_hints ?? {},
  }
}

function mapWorldBuildBatchDeltaRow(row: WorldBuildBatchRow, existing: ProjectSnapshot['worldBuildBatches'][number] | null): ProjectSnapshot['worldBuildBatches'][number] {
  return worldBuildStatusResponseSchema.shape.batch.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    prompt: row.prompt,
    requestSummary: row.request_summary,
    plannerMode: row.planner_mode ?? 'world_build',
    status: row.status,
    diagnostics: row.diagnostics ?? [],
    planItems: existing?.planItems ?? [],
    cinematicPlan: existing?.cinematicPlan ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobs: existing?.jobs ?? [],
  })
}

function mapWorldBuildJobDeltaRow(row: WorldBuildJobRow): ProjectSnapshot['worldBuildBatches'][number]['jobs'][number] {
  const queueMetadata = readGenerationQueueMetadata({
    ...(row.result_context ?? {}),
    providerRequestId: row.provider_request_id ?? undefined,
    statusUrl: row.status_url ?? undefined,
    responseUrl: row.response_url ?? undefined,
    cancelUrl: row.cancel_url ?? undefined,
  })
  return worldBuildJobSchema.parse({
    id: row.id,
    batchId: row.batch_id,
    planItemId: row.plan_item_id,
    kind: row.kind,
    status: row.status,
    dependsOnJobIds: row.depends_on_job_ids ?? [],
    targetKeys: row.target_keys ?? {},
    prompt: row.prompt ?? '',
    options: row.options ?? {},
    providerRequestId: queueMetadata.providerRequestId,
    statusUrl: queueMetadata.statusUrl,
    responseUrl: queueMetadata.responseUrl,
    cancelUrl: queueMetadata.cancelUrl,
    resultContext: row.result_context ?? null,
    errorMessage: row.error_message ?? null,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapMeshGenerationDeltaRow(row: MeshGenerationJobRow) {
  return meshGenerationJobSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    definitionKey: row.definition_key,
    sourceImageAssetKey: row.source_image_asset_key,
    targetMeshAssetKey: row.target_mesh_asset_key,
    provider: row.provider,
    model: row.model,
    providerRequestId: row.provider_request_id,
    statusUrl: row.status_url,
    responseUrl: row.response_url,
    cancelUrl: row.cancel_url,
    status: row.status,
    providerStatus: row.provider_status,
    providerLogs: Array.isArray(row.provider_logs) ? row.provider_logs.filter((entry): entry is string => typeof entry === 'string') : [],
    errorMessage: row.error_message,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapCinematicRunDeltaRow(row: CinematicRunRow, existing: ProjectSnapshot['cinematicRuns'][number] | null): ProjectSnapshot['cinematicRuns'][number] {
  return cinematicRunSchema.parse({
    id: row.id,
    draftId: row.draft_id,
    projectId: row.project_id,
    graphKey: row.graph_key,
    graphName: row.graph_name,
    mode: row.mode,
    status: row.status,
    shotNodeKey: row.shot_node_key,
    diagnostics: row.diagnostics ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobs: existing?.jobs ?? [],
  })
}

function mapCinematicRunJobDeltaRow(row: CinematicRunJobRow): ProjectSnapshot['cinematicRuns'][number]['jobs'][number] {
  return cinematicRunJobSchema.parse({
    id: row.id,
    runId: row.run_id,
    graphKey: row.graph_key,
    shotNodeKey: row.shot_node_key,
    shotId: typeof row.result_context?.shotId === 'string' ? row.result_context.shotId : null,
    kind: row.kind,
    status: row.status,
    orderIndex: row.order_index,
    dependsOnJobIds: row.depends_on_job_ids ?? [],
    stillAssetKey: row.still_asset_key,
    videoAssetKey: row.video_asset_key,
    provider: row.provider,
    model: row.model,
    providerRequestId: row.provider_request_id,
    errorMessage: row.error_message,
    prompt: row.prompt ?? '',
    resultContext: row.result_context ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function applyDraftDeltaToSnapshot(snapshot: ProjectSnapshot, delta: DraftDeltaResponse) {
  if (delta.requiresSnapshot) return snapshot
  const rows = delta.compactRows ?? {}
  const deleted = delta.deletedKeysByTable ?? {}

  let nextDefinitions = removeByKeys(snapshot.definitions, deleted.project_definitions)
  const definitionRows = (rows.project_definitions ?? []) as DefinitionRow[]
  nextDefinitions = upsertEntriesByKey(nextDefinitions, definitionRows.map((row) => (
    mapDefinitionDeltaRow(row, nextDefinitions.find((entry) => entry.key === row.key) ?? null)
  )))

  let nextAssets = removeByKeys(snapshot.assets, deleted.project_assets)
  nextAssets = upsertEntriesByKey(nextAssets, ((rows.project_assets ?? []) as AssetRow[]).map((row) => mapAssetDeltaRow(row)))

  let nextWorldEntities = removeByKeys(snapshot.worldEntities, deleted.world_entities)
  nextWorldEntities = upsertEntriesByKey(nextWorldEntities, ((rows.world_entities ?? []) as WorldEntityRow[]).map((row) => mapWorldEntityRow(row)))

  let nextWorldRelationships = removeByKeys(snapshot.worldRelationships, deleted.world_relationships)
  nextWorldRelationships = upsertEntriesByKey(nextWorldRelationships, ((rows.world_relationships ?? []) as WorldRelationshipRow[]).map((row) => (
    mapWorldRelationshipRow(row, nextWorldEntities)
  )))

  let nextWorldViews = removeByKeys(snapshot.worldViews, deleted.world_views)
  nextWorldViews = upsertEntriesByKey(nextWorldViews, ((rows.world_views ?? []) as WorldViewRow[]).map((row) => mapWorldViewRow(row)))

  let nextWorldOperators = removeByKeys(snapshot.worldOperators, deleted.world_operators)
  nextWorldOperators = upsertEntriesByKey(nextWorldOperators, ((rows.world_operators ?? []) as WorldOperatorRow[]).map((row) => ({
    id: row.id,
    key: row.key,
    operatorType: row.operator_type,
    inputEntityKeys: row.input_entity_keys ?? [],
    label: row.label ?? '',
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })))

  let nextWorldResults = removeByKeys(snapshot.worldResults, deleted.world_results)
  nextWorldResults = upsertEntriesByKey(nextWorldResults, ((rows.world_results ?? []) as WorldResultRow[]).map((row) => ({
    id: row.id,
    key: row.key,
    resultType: row.result_type,
    sourceOperatorKey: row.source_operator_key,
    title: row.title,
    summary: row.summary ?? '',
    previewAssetKey: row.preview_asset_key,
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })))

  let nextWorldGraphConnections = removeByKeys(snapshot.worldGraphConnections, deleted.world_graph_connections)
  nextWorldGraphConnections = upsertEntriesByKey(nextWorldGraphConnections, ((rows.world_graph_connections ?? []) as WorldGraphConnectionRow[]).map((row) => ({
    id: row.id,
    key: row.key,
    sourceNodeKey: row.source_node_key,
    sourceNodeKind: row.source_node_kind,
    targetNodeKey: row.target_node_key,
    targetNodeKind: row.target_node_kind,
    role: row.role,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })))

  let nextWorldThreads = removeByKeys(snapshot.worldThreads, deleted.world_threads)
  nextWorldThreads = upsertEntriesByKey(nextWorldThreads, ((rows.world_threads ?? []) as WorldThreadRow[]).map((row) => mapWorldThreadRow(row)))

  let nextPromptSessions = removeByKeys(snapshot.worldPromptSessions, deleted.world_prompt_sessions)
  nextPromptSessions = upsertEntriesByKey(nextPromptSessions, ((rows.world_prompt_sessions ?? []) as WorldPromptSessionRow[]).map((row) => mapWorldPromptSessionRow(row)))

  let nextPromptTurns = removeByIds(snapshot.worldPromptTurns, deleted.world_prompt_turns)
  nextPromptTurns = upsertEntriesById(nextPromptTurns, ((rows.world_prompt_turns ?? []) as WorldPromptTurnRow[]).map((row) => mapWorldPromptTurnRow(row)))

  let nextPromptMessages = removeByIds(snapshot.worldPromptMessages, deleted.world_prompt_messages)
  nextPromptMessages = upsertEntriesById(nextPromptMessages, ((rows.world_prompt_messages ?? []) as WorldPromptMessageRow[]).map((row) => mapWorldPromptMessageRow(row)))

  let nextPromptEvents = removeByIds(snapshot.worldPromptEvents, deleted.world_prompt_events)
  nextPromptEvents = upsertEntriesById(nextPromptEvents, ((rows.world_prompt_events ?? []) as WorldPromptEventRow[]).map((row) => mapWorldPromptEventRow(row)))

  let nextPromptSuggestions = removeByIds(snapshot.worldPromptSuggestions, deleted.world_prompt_suggestions)
  nextPromptSuggestions = upsertEntriesById(nextPromptSuggestions, ((rows.world_prompt_suggestions ?? []) as WorldPromptSuggestionRow[]).map((row) => mapWorldPromptSuggestionRow(row)).filter((entry): entry is WorldPromptSuggestionRecord => Boolean(entry)))

  let nextWorldBuildBatches = removeByIds(snapshot.worldBuildBatches, deleted.world_build_batches)
  nextWorldBuildBatches = upsertEntriesById(nextWorldBuildBatches, ((rows.world_build_batches ?? []) as WorldBuildBatchRow[]).map((row) => (
    mapWorldBuildBatchDeltaRow(row, nextWorldBuildBatches.find((entry) => entry.id === row.id) ?? null)
  )))
  const changedWorldBuildJobs = (rows.world_build_jobs ?? []) as WorldBuildJobRow[]
  if (changedWorldBuildJobs.length > 0 || (deleted.world_build_jobs?.length ?? 0) > 0) {
    nextWorldBuildBatches = nextWorldBuildBatches.map((batch) => {
      const incomingJobs = changedWorldBuildJobs
        .filter((job) => job.batch_id === batch.id)
        .map((job) => mapWorldBuildJobDeltaRow(job))
      const jobs = upsertEntriesById(
        removeByIds(batch.jobs, deleted.world_build_jobs),
        incomingJobs,
      ).sort((left, right) => left.orderIndex - right.orderIndex)
      return { ...batch, jobs }
    })
  }

  let nextMeshGenerationJobs = removeByIds(snapshot.meshGenerationJobs, deleted.mesh_generation_jobs)
  nextMeshGenerationJobs = upsertEntriesById(nextMeshGenerationJobs, ((rows.mesh_generation_jobs ?? []) as MeshGenerationJobRow[]).map((row) => mapMeshGenerationDeltaRow(row)))

  let nextCinematicRuns = removeByIds(snapshot.cinematicRuns, deleted.cinematic_runs)
  nextCinematicRuns = upsertEntriesById(nextCinematicRuns, ((rows.cinematic_runs ?? []) as CinematicRunRow[]).map((row) => (
    mapCinematicRunDeltaRow(row, nextCinematicRuns.find((entry) => entry.id === row.id) ?? null)
  )))
  const changedCinematicJobs = (rows.cinematic_run_jobs ?? []) as CinematicRunJobRow[]
  if (changedCinematicJobs.length > 0 || (deleted.cinematic_run_jobs?.length ?? 0) > 0) {
    nextCinematicRuns = nextCinematicRuns.map((run) => {
      const incomingJobs = changedCinematicJobs
        .filter((job) => job.run_id === run.id)
        .map((job) => mapCinematicRunJobDeltaRow(job))
      const jobs = upsertEntriesById(
        removeByIds(run.jobs, deleted.cinematic_run_jobs),
        incomingJobs,
      ).sort((left, right) => left.orderIndex - right.orderIndex)
      return { ...run, jobs }
    })
  }

  return projectSnapshotSchema.parse({
    ...snapshot,
    definitions: nextDefinitions,
    assets: nextAssets,
    worldEntities: nextWorldEntities,
    worldRelationships: nextWorldRelationships,
    worldViews: nextWorldViews,
    worldOperators: nextWorldOperators,
    worldResults: nextWorldResults,
    worldGraphConnections: nextWorldGraphConnections,
    worldThreads: nextWorldThreads.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    worldPromptSessions: nextPromptSessions.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    worldPromptTurns: nextPromptTurns.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    worldPromptMessages: nextPromptMessages.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    worldPromptEvents: nextPromptEvents.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    worldPromptSuggestions: nextPromptSuggestions,
    worldBuildBatches: nextWorldBuildBatches,
    meshGenerationJobs: nextMeshGenerationJobs,
    cinematicRuns: nextCinematicRuns,
  })
}

export async function loadWorldPromptTurnLenses(draftId: string) {
  await getValidatedSession('Sign in and load a live GraphCore draft before loading world prompt turn lenses.')
  const [turnsResponse, eventsResponse] = await Promise.all([
    supabase
      .from('world_prompt_turns')
      .select('id, session_id, draft_id, prompt, status, created_at, updated_at')
      .eq('draft_id', draftId)
      .order('created_at', { ascending: false })
      .limit(DEFAULT_PROMPT_HISTORY_LIMIT),
    supabase
      .from('world_prompt_events')
      .select('id, session_id, turn_id, draft_id, sequence, event_type, op_id, payload, metadata, created_at')
      .eq('draft_id', draftId)
      .eq('event_type', 'op_applied')
      .order('created_at', { ascending: false })
      .limit(DEFAULT_PROMPT_HISTORY_LIMIT * 8),
  ])
  if (turnsResponse.error) throw new Error(turnsResponse.error.message)
  if (eventsResponse.error) throw new Error(eventsResponse.error.message)
  logPostgrestEgress({ table: 'world_prompt_turns.lenses', profile: 'world', caller: 'loadWorldPromptTurnLenses', data: turnsResponse.data })
  logPostgrestEgress({ table: 'world_prompt_events.lenses', profile: 'world', caller: 'loadWorldPromptTurnLenses', data: eventsResponse.data })
  return {
    turns: ((turnsResponse.data ?? []) as Partial<WorldPromptTurnRow>[]).map((row) => ({
      id: row.id,
      prompt: row.prompt,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    events: ((eventsResponse.data ?? []) as WorldPromptEventRow[])
      .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime() || left.sequence - right.sequence)
      .map((row) => mapWorldPromptEventRow(row)),
  }
}

export async function loadWorldPromptTurnDetails(draftId: string, turnId: string) {
  await getValidatedSession('Sign in and load a live GraphCore draft before loading world prompt turn details.')
  const [messagesResponse, eventsResponse] = await Promise.all([
    supabase
      .from('world_prompt_messages')
      .select(WORLD_PROMPT_MESSAGE_SELECT)
      .eq('draft_id', draftId)
      .eq('turn_id', turnId)
      .order('created_at', { ascending: true }),
    supabase
      .from('world_prompt_events')
      .select(WORLD_PROMPT_EVENT_SELECT)
      .eq('draft_id', draftId)
      .eq('turn_id', turnId)
      .order('sequence', { ascending: true }),
  ])
  if (messagesResponse.error) throw new Error(messagesResponse.error.message)
  if (eventsResponse.error) throw new Error(eventsResponse.error.message)
  return {
    messages: ((messagesResponse.data ?? []) as WorldPromptMessageRow[]).map((row) => mapWorldPromptMessageRow(row)),
    events: ((eventsResponse.data ?? []) as WorldPromptEventRow[]).map((row) => mapWorldPromptEventRow(row)),
  }
}

export async function loadDefinitionDetails(draftId: string, definitionKey: string) {
  await getValidatedSession('Sign in and load a live GraphCore draft before loading definition details.')
  const response = await supabase
    .from('project_definitions')
    .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
    .eq('draft_id', draftId)
    .eq('key', definitionKey)
    .maybeSingle()
  if (response.error) throw new Error(response.error.message)
  logPostgrestEgress({ table: 'project_definitions.detail', profile: 'content', caller: 'loadDefinitionDetails', data: response.data })
  return response.data
}

export async function loadEnvironmentBlueprintDetails(draftId: string, environmentKey: string) {
  await getValidatedSession('Sign in and load a live GraphCore draft before loading environment blueprint details.')
  const response = await supabase
    .from('draft_environment_blueprints')
    .select('id, key, environment_key, name, document')
    .eq('draft_id', draftId)
    .eq('environment_key', environmentKey)
    .maybeSingle()
  if (response.error) throw new Error(response.error.message)
  logPostgrestEgress({ table: 'draft_environment_blueprints.detail', profile: 'content', caller: 'loadEnvironmentBlueprintDetails', data: response.data })
  return response.data
}

export async function loadGenerationJobDetails(draftId: string, jobId: string) {
  await getValidatedSession('Sign in and load a live GraphCore draft before loading generation job details.')
  const [worldBuildJob, meshJob, cinematicJob] = await Promise.all([
    supabase
      .from('world_build_jobs')
      .select('id, batch_id, plan_item_id, kind, status, depends_on_job_ids, target_keys, prompt, options, provider_request_id, status_url, response_url, cancel_url, result_context, error_message, order_index, created_at, updated_at')
      .eq('id', jobId)
      .maybeSingle(),
    supabase
      .from('mesh_generation_jobs')
      .select('id, project_id, draft_id, definition_key, source_image_asset_key, target_mesh_asset_key, provider, model, provider_request_id, status_url, response_url, cancel_url, status, provider_status, provider_logs, error_message, storage_path, created_at, updated_at')
      .eq('draft_id', draftId)
      .eq('id', jobId)
      .maybeSingle(),
    supabase
      .from('cinematic_run_jobs')
      .select('id, run_id, graph_key, shot_node_key, kind, status, order_index, depends_on_job_ids, still_asset_key, video_asset_key, provider, model, provider_request_id, error_message, prompt, result_context, created_at, updated_at')
      .eq('id', jobId)
      .maybeSingle(),
  ])
  if (worldBuildJob.error) throw new Error(worldBuildJob.error.message)
  if (meshJob.error) throw new Error(meshJob.error.message)
  if (cinematicJob.error) throw new Error(cinematicJob.error.message)
  return worldBuildJob.data ?? meshJob.data ?? cinematicJob.data ?? null
}

export async function createGame(existingSession?: Session): Promise<SnapshotLoadResult> {
  const session =
    existingSession ??
    (
      await supabase.auth.getSession()
    ).data.session

  if (!session) {
    throw new Error('Sign in before creating a new game.')
  }

  const workspaceId = await ensureWorkspaceShellDirect(session)
  await createGameDirect(session, workspaceId)
  return loadProjectSnapshot(undefined, { profile: 'world' })
}

export async function bootstrapLiveWorkspace(existingSession?: Session): Promise<SnapshotLoadResult> {
  const session =
    existingSession ??
    (
      await supabase.auth.getSession()
    ).data.session

  if (!session) {
    throw new Error('Sign in before creating a live GraphCore workspace.')
  }

  try {
    const workspaceId = await ensureWorkspaceShellDirect(session)
    const { projects, draftsByProjectId } = await listWorkspaceProjectsAndDrafts(workspaceId)
    if (projects.length === 0 || !pickPreferredDraft(draftsByProjectId.get(projects[0].id) ?? [])) {
      await createGameDirect(session, workspaceId, {
        projectName: `${bootstrapSeedFromSession(session).projectName}`,
      })
    }
  } catch (directBootstrapError) {
    console.error('[GraphCore] direct client bootstrap failed, trying hosted bootstrap fallback.', directBootstrapError)

    const seed = bootstrapSeedFromSession(session)
    const response = await invokeAuthedFunction('bootstrap-workspace', {
      workspaceName: seed.workspaceName,
      projectName: seed.projectName,
    }, session)

    if (response.error) {
      const functionErrorMessage = await readFunctionsErrorMessage(response.error)
      const directMessage = directBootstrapError instanceof Error ? directBootstrapError.message : 'Direct bootstrap failed.'
      throw new Error(`${directMessage} Hosted bootstrap fallback also failed: ${functionErrorMessage}`)
    }
  }

  return loadProjectSnapshot(undefined, { profile: 'world' })
}

export async function proposePatch(request: PromptPatchRequest): Promise<PromptPatchResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  let fallbackReason: string | null = null
  const liveSnapshot = isLiveSnapshot(request.snapshot)

  if (session && liveSnapshot) {
    const response = await invokeAuthedFunction<PromptPatchResponse>('prompt-patch', request, session)

    if (!response.error && response.data) {
      return sanitizePromptPatchResponse(response.data as PromptPatchResponse, request)
    }

    if (response.error) {
      const errorPayload = await readFunctionsErrorPayload<Partial<PromptPatchResponse> & { diagnostics?: string[] }>(response.error)
      if (errorPayload && Array.isArray(errorPayload.diagnostics)) {
        return sanitizePromptPatchResponse({
          summary: typeof errorPayload.summary === 'string' ? errorPayload.summary : 'Prompt proposal failed.',
          operations: Array.isArray(errorPayload.operations) ? (errorPayload.operations as PatchOperation[]) : [],
          diagnostics: errorPayload.diagnostics,
          assistantNotes: typeof errorPayload.assistantNotes === 'string' ? errorPayload.assistantNotes : undefined,
          debugRawOutput: typeof errorPayload.debugRawOutput === 'string' ? errorPayload.debugRawOutput : undefined,
        }, request)
      }
    }

    fallbackReason = response.error ? await readFunctionsErrorMessage(response.error) : 'The hosted prompt orchestrator returned no data.'
    console.error('[GraphCore] prompt-patch invocation failed, using local fallback.', {
      reason: fallbackReason,
      request,
      response,
    })
  } else {
    fallbackReason = session
      ? 'The current editor snapshot is the bundled demo project, not a live Supabase draft.'
      : 'No authenticated Supabase session was available.'
    console.error('[GraphCore] prompt-patch skipped, using local fallback.', {
      reason: fallbackReason,
      request,
    })
  }

  const prompt = request.prompt
  const snapshot = request.snapshot
  const context = request.context
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'generated'

  if (request.intent === 'bootstrap_game' || request.phase === 'spec' || request.gameSpec) {
    const bootstrapSpec =
      request.gameSpec
      ?? snapshot.gameSpec
      ?? (request.gameArchetypeId
        ? createGameSpecFromArchetype(request.gameArchetypeId, request.gameConceptPrompt ?? request.prompt)
        : createDefaultGameSpec(
            request.selectedPresetIds?.filter((presetId) => presetId.startsWith('pack.')) ?? ['pack.rpg_core'],
          ))

    return {
      requestSummary: bootstrapSpec.title?.trim()
        ? `Bootstrap ${bootstrapSpec.title}`
        : 'Bootstrap game data layer',
      executionPlan: {
        classification: 'bootstrap',
        requiresDependencies: true,
        dependencyKinds: ['archetype', 'item', 'character', 'ability', 'location', 'environment', 'world_model', 'market'],
        graphJobCount: 0,
        graphJobs: [],
      },
      activityEntries: [
        {
          phase: 'fallback',
          status: 'completed',
          title: 'Local bootstrap fallback built a starter game spec.',
          detail: request.gameArchetypeId ? `Used ${request.gameArchetypeId} as the top-level game archetype.` : 'Used the default preset pack fallback.',
        },
      ],
      summary: bootstrapSpec.title?.trim()
        ? `Bootstrap ${bootstrapSpec.title}`
        : 'Bootstrap game data layer',
      operations: buildBootstrapPatch(bootstrapSpec),
      diagnostics: localPatchDiagnostics(fallbackReason),
      assistantNotes: fallbackReason
        ? `Hosted prompt orchestration was unavailable. Generated a deterministic bootstrap patch from the current game spec. ${fallbackReason}`
        : 'Hosted prompt orchestration was unavailable. Generated a deterministic bootstrap patch from the current game spec.',
    }
  }

  const normalizedPrompt = prompt.toLowerCase()

  if (/\b(fire mage|enemy caster|caster enemy|mage enemy)\b/.test(normalizedPrompt)) {
    const enemyKey = `character.${slug}`
    return {
      summary: 'Add caster enemy',
      operations: [
        { op: 'instantiate_archetype_preset', presetId: 'character.enemy_caster' },
        { op: 'instantiate_definition_preset', presetId: 'ability.fireball' },
        {
          op: 'create_definition',
          kind: 'character',
          key: enemyKey,
          payload: {
            name: prettyNameFromKey(enemyKey),
            summary: 'Preset-backed enemy caster with a starter fire spell.',
            archetypeKey: 'character.enemy_caster',
            metadata: { controlledBy: 'ai' },
            components: [
              ...defaultComponentsForKind('character'),
              {
                type: 'ability_loadout',
                config: {
                  entries: [
                    {
                      abilityKey: 'ability.fireball',
                      slotKey: 'primary',
                      inputBinding: null,
                      cooldownGroup: 'offense',
                      unlockTokenKey: null,
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
      diagnostics: localPatchDiagnostics(fallbackReason),
      assistantNotes: 'Local fallback preferred existing presets for the enemy archetype and fire ability.',
    }
  }

  if (/\bmarket\b|\bvendor\b|\bshop\b/.test(normalizedPrompt)) {
    const marketKey = `market.${slug}`
    return {
      summary: 'Add market',
      operations: [
        { op: 'instantiate_archetype_preset', presetId: 'market.vendor_basic' },
        { op: 'instantiate_definition_preset', presetId: 'currency.gold' },
        {
          op: 'create_definition',
          kind: 'market',
          key: marketKey,
          payload: {
            name: prettyNameFromKey(marketKey),
            summary: 'Starter market built from the vendor preset.',
            archetypeKey: 'market.vendor_basic',
            components: [
              {
                type: 'market_inventory',
                config: {
                  trades: [],
                },
              },
            ],
          },
        },
      ],
      diagnostics: localPatchDiagnostics(fallbackReason),
      assistantNotes: 'Local fallback created a preset-backed market and ensured a starter currency exists.',
    }
  }

  if (/\blocation\b|\bhub\b|\bsafehouse\b|\bdungeon\b/.test(normalizedPrompt)) {
    const locationPresetId = /\bhub\b/.test(normalizedPrompt)
      ? 'location.hub'
      : /\bsafehouse\b/.test(normalizedPrompt)
        ? 'location.safehouse'
        : 'location.dungeon'
    const environmentPresetId = /\bhub\b/.test(normalizedPrompt)
      ? 'environment.settlement'
      : /\bdungeon\b/.test(normalizedPrompt)
        ? 'environment.dungeon'
        : 'environment.wilderness'
    const locationKey = `location.${slug}`
    const environmentKey = `environment.${slug}`
    const worldModelKey = `world_model.${slug}_world`
    const wantsVendor = /\bvendor\b|\bmarket\b|\bshop\b/.test(normalizedPrompt)
    return {
      summary: 'Add location',
      operations: [
        { op: 'instantiate_archetype_preset', presetId: locationPresetId },
        { op: 'instantiate_archetype_preset', presetId: environmentPresetId },
        { op: 'instantiate_archetype_preset', presetId: 'world_model.region_set' },
        ...(wantsVendor ? [{ op: 'instantiate_archetype_preset', presetId: 'market.vendor_basic' } as PatchOperation] : []),
        ...(wantsVendor ? [{ op: 'instantiate_definition_preset', presetId: 'currency.gold' } as PatchOperation] : []),
        {
          op: 'create_definition',
          kind: 'world_model',
          key: worldModelKey,
          payload: {
            name: prettyNameFromKey(worldModelKey),
            summary: 'Starter world model generated for the new location cluster.',
            archetypeKey: 'world_model.region_set',
            components: defaultComponentsForKind('world_model').map((component) =>
              component.type === 'world_environment_index'
                ? {
                    ...component,
                    config: {
                      ...component.config,
                      environmentKeys: [environmentKey],
                      primaryEnvironmentKey: environmentKey,
                    },
                  }
                : component,
            ),
          },
        },
        {
          op: 'create_definition',
          kind: 'environment',
          key: environmentKey,
          payload: {
            name: prettyNameFromKey(environmentKey),
            summary: 'Scene-facing environment linked to the generated location.',
            archetypeKey: environmentPresetId,
            components: defaultComponentsForKind('environment').map((component) =>
              component.type === 'environment_profile'
                ? {
                    ...component,
                    config: {
                      ...component.config,
                      worldModelKey,
                      linkedLocationKeys: [locationKey],
                    },
                  }
                : component,
            ),
          },
        },
        {
          op: 'create_definition',
          kind: 'location',
          key: locationKey,
          payload: {
            name: prettyNameFromKey(locationKey),
            summary: 'Starter location created from the preset library.',
            archetypeKey: locationPresetId,
            components: [
              {
                type: 'location_state',
                config: {
                  region: 'frontier',
                  isUnlockedByDefault: true,
                  linkedGraphKeys: [],
                  linkedMarketKeys: wantsVendor ? [`market.${slug}_vendor`] : [],
                  environmentKey,
                  unlockTokenKey: null,
                },
              },
            ],
          },
        },
        ...(wantsVendor
          ? [{
              op: 'create_definition',
              kind: 'market',
              key: `market.${slug}_vendor`,
              payload: {
                name: `${prettyNameFromKey(locationKey)} Vendor`,
                summary: 'Vendor attached to the generated location.',
                archetypeKey: 'market.vendor_basic',
                components: defaultComponentsForKind('market'),
              },
            } satisfies PatchOperation]
          : []),
      ],
      diagnostics: localPatchDiagnostics(fallbackReason),
      assistantNotes: 'Local fallback used location and market presets before inventing new schema.',
    }
  }

  if (/\benvironment\b|\bworld\b|\bregion set\b/.test(normalizedPrompt)) {
    const worldModelKey = `world_model.${slug}`
    const environmentKey = `environment.${slug}`
    return {
      summary: 'Add world and environment',
      operations: [
        { op: 'instantiate_archetype_preset', presetId: 'world_model.region_set' },
        { op: 'instantiate_archetype_preset', presetId: 'environment.wilderness' },
        {
          op: 'create_definition',
          kind: 'world_model',
          key: worldModelKey,
          payload: {
            name: prettyNameFromKey(worldModelKey),
            summary: 'Starter world model created from the prompt.',
            archetypeKey: 'world_model.region_set',
            components: defaultComponentsForKind('world_model').map((component) =>
              component.type === 'world_environment_index'
                ? {
                    ...component,
                    config: {
                      ...component.config,
                      environmentKeys: [environmentKey],
                      primaryEnvironmentKey: environmentKey,
                    },
                  }
                : component,
            ),
          },
        },
        {
          op: 'create_definition',
          kind: 'environment',
          key: environmentKey,
          payload: {
            name: prettyNameFromKey(environmentKey),
            summary: 'Starter environment created from the prompt.',
            archetypeKey: 'environment.wilderness',
            components: defaultComponentsForKind('environment').map((component) =>
              component.type === 'environment_profile'
                ? {
                    ...component,
                    config: {
                      ...component.config,
                      worldModelKey,
                    },
                  }
                : component,
            ),
          },
        },
      ],
      diagnostics: localPatchDiagnostics(fallbackReason),
      assistantNotes: 'Local fallback created a world model first, then linked an environment onto it.',
    }
  }

  if (normalizedPrompt.includes('archetype')) {
    return {
      summary: `Draft archetype patch generated from prompt: ${prompt.slice(0, 80)}`,
      operations: [
        {
          op: 'create_archetype',
          key: `item.${slug}`,
          payload: {
            name: slug
              .split('_')
              .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
              .join(' '),
            summary: 'Review and refine this generated archetype before applying it.',
            appliesToKind: 'item',
          },
        },
        {
          op: 'add_archetype_field',
          key: `item.${slug}`,
          field: {
            id: `field-${slug}-value`,
            key: 'value',
            label: 'Value',
            fieldType: 'number',
            description: 'Primary numeric value for this generated archetype.',
            required: false,
            defaultValue: 0,
            constraints: {},
            sortOrder: 1,
          },
        },
      ] as PatchOperation[],
      diagnostics: [
        ...localPatchDiagnostics(fallbackReason),
      ],
      assistantNotes: fallbackReason
        ? `Hosted prompt orchestrator was unavailable. Local fallback was used instead. ${fallbackReason}`
        : 'Hosted prompt orchestrator was unavailable. Local fallback was used instead.',
    }
  }

  if (request.targetMode === 'new_graph') {
    const graphKey = `graph.${slug}`
    return {
      summary: `Draft graph patch generated from prompt: ${prompt.slice(0, 80)}`,
      operations: [
        {
          op: 'create_graph',
          key: graphKey,
          payload: {
            name: slug
              .split('_')
              .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
              .join(' '),
            graphType: request.graphType ?? 'narrative_flow',
            summary: prompt,
          },
        },
        {
          op: 'create_node',
          graphKey,
          node: {
            id: `node-generated-${Date.now()}`,
            key: `${graphKey}.story_text_${slug}`,
            type: 'text',
            title: 'Generated Story Beat',
            templateKey: 'story_text',
            subtitle: null,
            position: { x: 360, y: 220 },
            body: {
              text: 'Review and refine this generated graph node before applying it.',
              imageAssetKey: null,
              audioAssetKey: null,
              choices: [],
            },
            condition: null,
            effects: [],
            ports: [{ id: 'in', label: 'In', direction: 'input' }, { id: 'out', label: 'Out', direction: 'output' }],
            display: { iconAssetKey: null, compactPreview: false },
            metadata: {},
          },
        },
      ] as PatchOperation[],
      diagnostics: [
        ...localPatchDiagnostics(fallbackReason),
      ],
      assistantNotes: fallbackReason
        ? `Hosted prompt orchestrator was unavailable. Local graph fallback was used instead. ${fallbackReason}`
        : 'Hosted prompt orchestrator was unavailable. Local graph fallback was used instead.',
    }
  }

  if (context?.target === 'graph' || context?.target === 'node' || context?.graphKey) {
    const graphKey = context.graphKey ?? snapshot.graphs[0]?.key ?? 'graph.generated'
    return {
      summary: `Draft graph patch generated from prompt: ${prompt.slice(0, 80)}`,
      operations: [
        {
          op: 'create_node',
          graphKey,
          node: {
            id: `node-generated-${Date.now()}`,
            key: `${graphKey}.story_text_${slug}`,
            type: 'text',
            title: slug
              .split('_')
              .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
              .join(' '),
            templateKey: 'story_text',
            subtitle: null,
            position: { x: 360, y: 220 },
            body: {
              text: 'Review and refine this generated graph node before applying it.',
              imageAssetKey: null,
              audioAssetKey: null,
              choices: [],
            },
            condition: null,
            effects: [],
            ports: [{ id: 'in', label: 'In', direction: 'input' }, { id: 'out', label: 'Out', direction: 'output' }],
            display: { iconAssetKey: null, compactPreview: false },
            metadata: {},
          },
        },
      ] as PatchOperation[],
      diagnostics: localPatchDiagnostics(fallbackReason),
      assistantNotes: 'The hosted prompt orchestrator was unavailable, so GraphCore generated a minimal local patch preview.',
    }
  }

  return {
    summary: `Draft patch generated from prompt: ${prompt.slice(0, 80)}`,
    operations: [
      {
        op: 'create_definition',
        kind: 'item',
        key: `item.${slug}`,
        payload: {
          name: slug
            .split('_')
            .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
            .join(' '),
          summary: 'Review and refine this generated definition before applying it.',
          components: defaultComponentsForKind('item'),
        },
      },
      {
        op: 'set_archetype',
        key: `item.${slug}`,
        archetypeKey: normalizedPrompt.includes('potion') ? 'item.consumable' : 'item.utility',
      },
    ] as PatchOperation[],
    diagnostics: localPatchDiagnostics(fallbackReason),
    assistantNotes: fallbackReason
      ? `Hosted prompt orchestrator was unavailable. Local fallback was used instead. ${fallbackReason}`
      : 'Hosted prompt orchestrator was unavailable. Local fallback was used instead.',
  }
}

export async function applyPatchProposal(snapshot: ProjectSnapshot, operations: PatchOperation[], patchSetId?: string) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before applying a patch.')

  if (!isLiveSnapshot(snapshot)) {
    return { source: 'local' as const }
  }

  const response = await invokeAuthedFunctionDirect('apply-patch', {
    draftId: snapshot.draft.id,
    patchSetId,
    operations,
  }, session)

  return {
    source: 'supabase' as const,
    data: response,
  }
}

export async function planWorldBuild(request: WorldBuildPlanRequest): Promise<WorldBuildPlanResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before planning a world build.')

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before planning a world build.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery<WorldBuildPlanResponse>('plan-world-build', request, session)
  if (response.error || !response.data) {
    throw new Error(response.error ? await readFunctionsErrorMessage(response.error) : 'World build planning returned no data.')
  }

  return worldBuildPlanResponseSchema.parse(response.data)
}

export async function startWorldBuild(request: WorldBuildStartRequest): Promise<WorldBuildStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before starting a world build.')

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before starting a world build.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery<WorldBuildStatusResponse>('start-world-build', request, session)
  if (response.error || !response.data) {
    throw new Error(response.error ? await readFunctionsErrorMessage(response.error) : 'Starting world build returned no data.')
  }

  return worldBuildStatusResponseSchema.parse(response.data)
}

export async function authorCinematicScript(request: WorldBuildAuthorCinematicRequest): Promise<WorldBuildStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before authoring a cinematic script.')

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before authoring a cinematic script.')
  }

  const payload = worldBuildAuthorCinematicRequestSchema.parse(request)
  const response = await invokeAuthedFunctionDirect('author-cinematic-script', payload, session)
  return worldBuildStatusResponseSchema.parse(response)
}

export async function repairCinematicScript(request: WorldBuildRepairCinematicRequest): Promise<WorldBuildStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before repairing a cinematic script.')

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before repairing a cinematic script.')
  }

  const payload = worldBuildRepairCinematicRequestSchema.parse(request)
  const response = await invokeAuthedFunctionDirect('repair-cinematic-script', payload, session)
  return worldBuildStatusResponseSchema.parse(response)
}

export async function startCinematicRun(request: CinematicRunStartRequest): Promise<CinematicRunStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before starting a cinematic run.')

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before starting a cinematic run.')
  }

  const sanitizedRequest: CinematicRunStartRequest = {
    ...request,
    snapshot: {
      ...request.snapshot,
      graphs: request.snapshot.graphs.map((graph) => {
        if (!graph || typeof graph !== 'object') return graph
        const typedGraph = graph as GraphDefinition
        return typedGraph.graphType === 'cinematic_flow'
          ? normalizeCinematicGraphProjection(typedGraph)
          : typedGraph
      }),
    },
  }

  const response = await invokeAuthedFunctionWithSessionRecovery<CinematicRunStatusResponse>('start-cinematic-run', sanitizedRequest, session)
  if (response.error || !response.data) {
    throw new Error(response.error ? await readFunctionsErrorMessage(response.error) : 'Starting cinematic run returned no data.')
  }

  const parsed = cinematicRunStatusResponseSchema.parse(response.data)
  return {
    ...parsed,
    assets: await hydrateStorageAssetUrls(sanitizedRequest.snapshot.project.id, parsed.assets as AssetDefinition[]),
  }
}

export async function startMeshGeneration(request: MeshGenerationStartRequest): Promise<MeshGenerationStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before generating a 3D mesh.')

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before generating a 3D mesh.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery<MeshGenerationStatusResponse>('start-mesh-generation', request, session)
  if (response.error || !response.data) {
    throw new Error(response.error ? await readFunctionsErrorMessage(response.error) : 'Starting mesh generation returned no data.')
  }

  const parsed = meshGenerationStatusResponseSchema.parse(response.data)
  return {
    ...parsed,
    assets: await hydrateStorageAssetUrls(request.snapshot.project.id, parsed.assets as AssetDefinition[]),
  }
}

export async function persistDefinitionPreviewImageBinding(
  snapshot: ProjectSnapshot,
  definitionKey: string,
  assetKey: string | null,
): Promise<void> {
  await getValidatedSession('Sign in and load a live GraphCore draft before updating a concept image binding.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before updating a concept image binding.')
  }

  const definition = snapshot.definitions.find((entry) => entry.key === definitionKey) ?? null
  if (!definition) {
    throw new Error(`Definition ${definitionKey} was not found in the current snapshot.`)
  }

  const componentType = definition.kind === 'environment' ? 'environment_render_binding' : 'render_3d_binding'
  const renderBindingComponent = definition.components.find((component) => component.type === componentType)
  const currentRenderBinding =
    renderBindingComponent && typeof renderBindingComponent.config === 'object' && renderBindingComponent.config !== null
      ? renderBindingComponent.config as Record<string, unknown>
      : definition.kind === 'environment'
        ? {
            primaryMeshAssetKey: null,
            previewImageAssetKey: null,
            lightingProfile: '',
            generationPrompt: null,
            generationStyle: null,
          }
        : {
            primaryMeshAssetKey: null,
            previewImageAssetKey: null,
            conceptPrompt: null,
            generationPrompt: null,
            generationStyle: null,
          }

  const definitionResponse = await supabase
    .from('project_definitions')
    .select('id')
    .eq('draft_id', snapshot.draft.id)
    .eq('key', definitionKey)
    .maybeSingle()

  if (definitionResponse.error) throw new Error(definitionResponse.error.message)
  if (!definitionResponse.data) throw new Error(`Definition ${definitionKey} was not found in Supabase.`)

  const componentResponse = await supabase
    .from('project_definition_components')
    .select('id')
    .eq('definition_id', definitionResponse.data.id)
    .eq('component_type', componentType)
    .maybeSingle()

  if (componentResponse.error) throw new Error(componentResponse.error.message)

  const nextRenderBinding = {
    ...currentRenderBinding,
    previewImageAssetKey: assetKey,
  }

  if (componentResponse.data) {
    const updateResponse = await supabase
      .from('project_definition_components')
      .update({ config: nextRenderBinding })
      .eq('definition_id', definitionResponse.data.id)
      .eq('component_type', componentType)

    if (updateResponse.error) throw new Error(updateResponse.error.message)
  } else {
    const insertResponse = await supabase
      .from('project_definition_components')
      .insert({
        definition_id: definitionResponse.data.id,
        component_type: componentType,
        config: nextRenderBinding,
      })

    if (insertResponse.error) throw new Error(insertResponse.error.message)
  }

  if (definition.kind === 'item' || definition.kind === 'environment') {
    const updateDefinitionResponse = await supabase
      .from('project_definitions')
      .update({ icon_asset_key: assetKey })
      .eq('id', definitionResponse.data.id)

    if (updateDefinitionResponse.error) throw new Error(updateDefinitionResponse.error.message)
  }
}

export async function persistGlobalProjectContext(
  snapshot: ProjectSnapshot,
  updates: GlobalProjectContextUpdate,
): Promise<{
  project: ProjectSnapshot['project']
  draft: ProjectSnapshot['draft']
  gameSpec: ProjectSnapshot['gameSpec']
  projectContext: ProjectSnapshot['projectContext']
}> {
  await getValidatedSession('Sign in and load a live GraphCore draft before updating global project context.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before updating global project context.')
  }

  const nextProjectName = updates.projectName.trim()
  const nextProjectDescription = updates.projectDescription.trim()
  const nextArtStylePreset = updates.artStylePreset.trim()
  const nextArtStyleDescription = updates.artStyleDescription.trim()

  if (!nextProjectName) {
    throw new Error('Project name cannot be empty.')
  }

  const projectResponse = await supabase
    .from('projects')
    .update({
      name: nextProjectName,
      summary: nextProjectDescription,
    })
    .eq('id', snapshot.project.id)
    .select('id, name, slug, summary, visibility')
    .single()

  if (projectResponse.error) throw new Error(projectResponse.error.message)

  const nextGameSpec = gameSpecSchema.parse({
    ...(snapshot.gameSpec ?? {}),
    theme: {
      ...(snapshot.gameSpec?.theme ?? {}),
      artStylePreset: nextArtStylePreset,
      artStyleDescription: nextArtStyleDescription,
    },
  })

  const nextProjectContext = snapshot.projectContext
    ? projectContextSchema.parse({
        ...snapshot.projectContext,
        artStylePreset: nextArtStylePreset,
        artStyleDescription: nextArtStyleDescription,
      })
    : snapshot.projectContext

  const nextDraftMetadata = {
    ...(snapshot.draft.metadata ?? {}),
    gameSpec: nextGameSpec,
    projectContext: nextProjectContext,
  }

  const draftResponse = await supabase
    .from('project_drafts')
    .update({
      metadata: nextDraftMetadata,
    })
    .eq('id', snapshot.draft.id)
    .select('id, name, version, is_primary, updated_at, metadata')
    .single()

  if (draftResponse.error) throw new Error(draftResponse.error.message)

  return {
    project: {
      id: projectResponse.data.id,
      name: projectResponse.data.name,
      slug: projectResponse.data.slug,
      summary: projectResponse.data.summary ?? '',
      visibility: projectResponse.data.visibility,
    },
    draft: {
      id: draftResponse.data.id,
      name: draftResponse.data.name,
      version: draftResponse.data.version,
      isPrimary: draftResponse.data.is_primary,
      updatedAt: draftResponse.data.updated_at,
      metadata: draftResponse.data.metadata ?? {},
    },
    gameSpec: nextGameSpec,
    projectContext: nextProjectContext,
  }
}

export async function persistProjectOnboardingContext(
  snapshot: ProjectSnapshot,
  updates: ProjectOnboardingContextUpdate,
): Promise<{
  project: ProjectSnapshot['project']
  draft: ProjectSnapshot['draft']
  gameSpec: ProjectSnapshot['gameSpec']
  projectContext: ProjectSnapshot['projectContext']
}> {
  await getValidatedSession('Sign in and load a live GraphCore draft before saving project onboarding.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before saving project onboarding.')
  }

  const nextProjectName = typeof updates.projectName === 'string' ? updates.projectName.trim() : snapshot.project.name
  if (!nextProjectName) {
    throw new Error('Project name cannot be empty.')
  }

  const projectResponse = await supabase
    .from('projects')
    .update({
      name: nextProjectName,
    })
    .eq('id', snapshot.project.id)
    .select('id, name, slug, summary, visibility')
    .single()

  if (projectResponse.error) throw new Error(projectResponse.error.message)

  const nextProjectContext = projectContextSchema.parse(updates.projectContext)
  const nextGameArchetypeId = getGameArchetypeIdForProjectSubtype(nextProjectContext.projectSubtype)
  const nextGameSpec = nextGameArchetypeId
    ? gameSpecSchema.parse({
        ...createGameSpecFromArchetype(nextGameArchetypeId),
        ...(snapshot.gameSpec ?? {}),
        theme: {
          ...(snapshot.gameSpec?.theme ?? {}),
          artStylePreset: nextProjectContext.artStylePreset,
          artStyleDescription: nextProjectContext.artStyleDescription,
        },
        cinematics: {
          ...(snapshot.gameSpec?.cinematics ?? {}),
          ...(getCinematicPresetFamilyForProjectSubtype(nextProjectContext.projectSubtype)
            ? {
                presetFamily: getCinematicPresetFamilyForProjectSubtype(nextProjectContext.projectSubtype),
                formatSubtype: getCinematicFormatSubtypeForProjectSubtype(nextProjectContext.projectSubtype) ?? undefined,
                presetSource: 'manual_override',
              }
            : {}),
        },
      })
    : snapshot.gameSpec
      ? gameSpecSchema.parse({
          ...snapshot.gameSpec,
          theme: {
            ...(snapshot.gameSpec?.theme ?? {}),
            artStylePreset: nextProjectContext.artStylePreset,
            artStyleDescription: nextProjectContext.artStyleDescription,
          },
          cinematics: {
            ...(snapshot.gameSpec?.cinematics ?? {}),
            ...(getCinematicPresetFamilyForProjectSubtype(nextProjectContext.projectSubtype)
              ? {
                  presetFamily: getCinematicPresetFamilyForProjectSubtype(nextProjectContext.projectSubtype),
                  formatSubtype: getCinematicFormatSubtypeForProjectSubtype(nextProjectContext.projectSubtype) ?? undefined,
                  presetSource: 'manual_override',
                }
              : {}),
          },
        })
      : null

  const nextDraftMetadata = {
    ...(snapshot.draft.metadata ?? {}),
    ...(nextGameSpec ? { gameSpec: nextGameSpec } : {}),
    projectContext: nextProjectContext,
  }

  const draftResponse = await supabase
    .from('project_drafts')
    .update({
      metadata: nextDraftMetadata,
    })
    .eq('id', snapshot.draft.id)
    .select('id, name, version, is_primary, updated_at, metadata')
    .single()

  if (draftResponse.error) throw new Error(draftResponse.error.message)

  return {
    project: {
      id: projectResponse.data.id,
      name: projectResponse.data.name,
      slug: projectResponse.data.slug,
      summary: projectResponse.data.summary ?? '',
      visibility: projectResponse.data.visibility,
    },
    draft: {
      id: draftResponse.data.id,
      name: draftResponse.data.name,
      version: draftResponse.data.version,
      isPrimary: draftResponse.data.is_primary,
      updatedAt: draftResponse.data.updated_at,
      metadata: draftResponse.data.metadata ?? {},
    },
    gameSpec: nextGameSpec,
    projectContext: nextProjectContext,
  }
}

export async function pollMeshGeneration(request: MeshGenerationPollRequest): Promise<MeshGenerationStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before polling mesh generation.')

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before polling mesh generation.')
  }

  const response = await invokeAuthedFunctionDirect('poll-mesh-generation', request, session)
  const parsed = meshGenerationStatusResponseSchema.parse(response)
  return {
    ...parsed,
    assets: await hydrateStorageAssetUrls(request.snapshot.project.id, parsed.assets as AssetDefinition[]),
  }
}

export async function pollCinematicRun(request: CinematicRunStartRequest & { runId: string }): Promise<CinematicRunStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before polling a cinematic run.')

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before polling a cinematic run.')
  }

  const response = await invokeAuthedFunctionDirect('poll-cinematic-run', request, session)
  const parsed = cinematicRunStatusResponseSchema.parse(response)
  return {
    ...parsed,
    assets: await hydrateStorageAssetUrls(request.snapshot.project.id, parsed.assets as AssetDefinition[]),
  }
}

export async function cancelCinematicRun(request: CinematicRunCancelRequest): Promise<CinematicRunStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before cancelling a cinematic run.')
  const publishableKey = supabasePublishableKey

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before cancelling a cinematic run.')
  }

  async function invokeDirect(accessToken: string) {
    return fetch(`${supabaseUrl}/functions/v1/cancel-cinematic-run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })
  }

  let response = await invokeDirect(session.access_token)
  if (response.status === 401) {
    const refreshed = await supabase.auth.refreshSession()
    if (refreshed.error) {
      throw refreshed.error
    }
    if (!refreshed.data.session) {
      throw new Error('No authenticated Supabase session was available after refresh.')
    }
    response = await invokeDirect(refreshed.data.session.access_token)
  }

  if (!response.ok) {
    const payload = await response.clone().json().catch(() => null) as { error?: unknown } | null
    console.error('[GraphCore] cancel-cinematic-run direct invocation failed.', {
      status: response.status,
      statusText: response.statusText,
      request: summarizeFunctionBody(request),
      errorPayload: payload,
    })
    if (typeof payload?.error === 'string') {
      throw new Error(payload.error)
    }
    throw new Error(`Cancelling cinematic run failed with HTTP ${response.status}.`)
  }

  const data = await response.json() as CinematicRunStatusResponse
  const parsed = cinematicRunStatusResponseSchema.parse(data)
  return {
    ...parsed,
    assets: await hydrateStorageAssetUrls(request.snapshot.project.id, parsed.assets as AssetDefinition[]),
  }
}

export async function deleteGeneratedMesh(request: DeleteGeneratedMeshRequest): Promise<MeshGenerationStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before deleting a generated mesh.')

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before deleting a generated mesh.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery<MeshGenerationStatusResponse>('delete-generated-mesh', request, session)
  if (response.error || !response.data) {
    throw new Error(response.error ? await readFunctionsErrorMessage(response.error) : 'Deleting generated mesh returned no data.')
  }

  const parsed = meshGenerationStatusResponseSchema.parse(response.data)
  return {
    ...parsed,
    assets: await hydrateStorageAssetUrls(request.snapshot.project.id, parsed.assets as AssetDefinition[]),
  }
}

export async function pollWorldBuild(request: { batchId: string; snapshot: ProjectSnapshot; model: string }): Promise<WorldBuildStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before polling a world build.')

  if (!isLiveSnapshot(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before polling a world build.')
  }

  const response = await invokeAuthedFunctionDirect('poll-world-build', request, session)
  return worldBuildStatusResponseSchema.parse(response)
}

export async function deleteWorldBuildPlaceholder(request: WorldBuildDeletePlaceholderRequest): Promise<WorldBuildDeletePlaceholderResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before deleting a world-build placeholder.')

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before deleting a world-build placeholder.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery<WorldBuildDeletePlaceholderResponse>('delete-world-build-placeholder', request, session)
  if (response.error || !response.data) {
    throw new Error(response.error ? await readFunctionsErrorMessage(response.error) : 'Deleting world-build placeholder returned no data.')
  }

  return worldBuildDeletePlaceholderResponseSchema.parse(response.data)
}

export async function loadWorldGraph(snapshot: ProjectSnapshot) {
  if (!isLiveSnapshot(snapshot)) {
    return worldGraphSnapshotSchema.parse({
      worldEntities: snapshot.worldEntities,
      worldRelationships: snapshot.worldRelationships,
      worldViews: snapshot.worldViews,
      worldOperators: snapshot.worldOperators,
      worldResults: snapshot.worldResults,
      worldGraphConnections: snapshot.worldGraphConnections,
    })
  }

  const refreshed = await reloadLiveSnapshot(snapshot)
  return worldGraphSnapshotSchema.parse({
    worldEntities: refreshed.worldEntities,
    worldRelationships: refreshed.worldRelationships,
    worldViews: refreshed.worldViews,
    worldOperators: refreshed.worldOperators,
    worldResults: refreshed.worldResults,
    worldGraphConnections: refreshed.worldGraphConnections,
  })
}

export async function syncWorldGraphFromDefinitions(snapshot: ProjectSnapshot) {
  await getValidatedSession('Sign in and load a live GraphCore draft before syncing the world graph.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before syncing the world graph.')
  }

  const pendingAutoDerivedEntities = snapshot.worldEntities
    .filter((entity) => isAutoDerivedWorldEntity(entity))
    .map((entity) => ({
      ...entity,
      metadata: {
        ...(entity.metadata ?? {}),
        autoDerived: undefined,
      },
    }))
    .map((entity) => ({
      ...entity,
      metadata: Object.fromEntries(Object.entries(entity.metadata ?? {}).filter(([, value]) => value !== undefined)),
    }))
  const pendingAutoDerivedViews = snapshot.worldViews
    .filter((view) => isAutoDerivedWorldView(view))
    .map((view) => ({
      ...view,
      metadata: {
        ...(view.metadata ?? {}),
        autoDerived: undefined,
      },
    }))
    .map((view) => ({
      ...view,
      metadata: Object.fromEntries(Object.entries(view.metadata ?? {}).filter(([, value]) => value !== undefined)),
    }))

  const derivedEntities = pendingAutoDerivedEntities.length > 0
    ? pendingAutoDerivedEntities
    : deriveMissingWorldEntities(snapshot, { autoDerived: false })
  const derivedViews = pendingAutoDerivedViews.length > 0
    ? pendingAutoDerivedViews
    : deriveMissingWorldViews({
        worldEntities: [...snapshot.worldEntities, ...derivedEntities],
        worldViews: snapshot.worldViews,
      }, { autoDerived: false })
  const entitiesMissingLinkedDefinitions = snapshot.worldEntities.filter((entity) => (
    worldEntityRequiresLinkedDefinition(entity.nodeType)
    && !entity.linkedDefinitionKey
    && entity.status !== 'archived'
  ))

  if (derivedEntities.length === 0 && derivedViews.length === 0 && entitiesMissingLinkedDefinitions.length === 0) {
    return snapshot
  }

  if (derivedEntities.length > 0) {
    const entityInsert = await supabase
      .from('world_entities')
      .upsert(derivedEntities.map((entity) => ({
        draft_id: snapshot.draft.id,
        key: entity.key,
        name: entity.name,
        summary: entity.summary,
        context: entity.context,
        node_type: entity.nodeType,
        aliases: entity.aliases,
        tags: entity.tags,
        status: entity.status,
        thumbnail_asset_key: entity.thumbnailAssetKey,
        linked_definition_key: entity.linkedDefinitionKey,
        source: entity.source,
        custom_properties: entity.customProperties,
        metadata: entity.metadata,
      })), {
        onConflict: 'draft_id,key',
      })

    if (entityInsert.error) {
      throw new Error(entityInsert.error.message)
    }
  }

  if (derivedViews.length > 0) {
    const viewInsert = await supabase
      .from('world_views')
      .upsert(derivedViews.map((view) => ({
        draft_id: snapshot.draft.id,
        key: view.key,
        name: view.name,
        mode: view.mode,
        filters: view.filters,
        search: view.search,
        root_entity_key: view.rootEntityKey,
        camera: view.camera,
        focus_depth: view.focusDepth,
        show_suggestions: view.showSuggestions,
        show_labels: view.showLabels,
        show_derived_layer: view.showDerivedLayer,
        node_positions: view.nodePositions,
        collapsed_state: view.collapsedState,
        sort_mode: view.sortMode,
        metadata: view.metadata,
      })), {
        onConflict: 'draft_id,key',
      })

    if (viewInsert.error) {
      throw new Error(viewInsert.error.message)
    }
  }

  if (entitiesMissingLinkedDefinitions.length > 0) {
    let workingSnapshot = snapshot
    for (const entity of entitiesMissingLinkedDefinitions) {
      const linkedDefinition = await createLinkedDefinitionForWorldEntity(workingSnapshot, {
        name: entity.name,
        summary: entity.summary,
        context: entity.context,
        nodeType: entity.nodeType,
        aliases: entity.aliases,
        tags: entity.tags,
        status: entity.status,
        thumbnailAssetKey: entity.thumbnailAssetKey,
        linkedDefinitionKey: null,
        source: entity.source,
        customProperties: entity.customProperties,
        metadata: entity.metadata,
        ensureLinkedDefinition: true,
      })
      if (!linkedDefinition.linkedDefinitionKey) continue
      const linkResponse = await supabase
        .from('world_entities')
        .update({ linked_definition_key: linkedDefinition.linkedDefinitionKey })
        .eq('draft_id', snapshot.draft.id)
        .eq('key', entity.key)
      if (linkResponse.error) {
        throw new Error(linkResponse.error.message)
      }
      workingSnapshot = {
        ...workingSnapshot,
        definitions: linkedDefinition.linkedDefinition
          ? upsertEntryByKey(workingSnapshot.definitions, linkedDefinition.linkedDefinition)
          : workingSnapshot.definitions,
        worldEntities: upsertEntryByKey(workingSnapshot.worldEntities, {
          ...entity,
          linkedDefinitionKey: linkedDefinition.linkedDefinitionKey,
        }),
      }
      await syncLinkedDefinitionFromWorldEntity(workingSnapshot, {
        ...entity,
        linkedDefinitionKey: linkedDefinition.linkedDefinitionKey,
      })
    }
  }

  return reloadLiveSnapshot(snapshot)
}

export async function createWorldEntity(snapshot: ProjectSnapshot, input: WorldEntityCreateInput) {
  await getValidatedSession('Sign in and load a live GraphCore draft before creating a world entity.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before creating a world entity.')
  }

  const payload = worldEntityCreateInputSchema.parse(input)
  const { linkedDefinitionKey, linkedDefinition } = await createLinkedDefinitionForWorldEntity(snapshot, payload)
  const key = buildWorldEntityKey(snapshot.worldEntities.map((entity) => entity.key), payload.nodeType, payload.name)

  const insertResponse = await supabase
    .from('world_entities')
    .insert({
      draft_id: snapshot.draft.id,
      key,
      name: payload.name,
      summary: payload.summary,
      context: payload.context,
      node_type: payload.nodeType,
      aliases: payload.aliases,
      tags: payload.tags,
      status: payload.status,
      thumbnail_asset_key: payload.thumbnailAssetKey,
      linked_definition_key: linkedDefinitionKey,
      source: payload.source,
      custom_properties: payload.customProperties,
      metadata: payload.metadata,
    })
    .select(WORLD_ENTITY_SELECT)
    .single()

  if (insertResponse.error) {
    throw new Error(insertResponse.error.message)
  }

  const nextEntity = mapWorldEntityRow(insertResponse.data as WorldEntityRow)
  const syncedDefinition = await syncLinkedDefinitionFromWorldEntity(snapshot, nextEntity)
  const nextSnapshot = {
    ...snapshot,
    definitions: linkedDefinition
      ? upsertEntryByKey(syncedDefinition.definitions, linkedDefinition)
      : syncedDefinition.definitions,
    worldEntities: upsertEntryByKey(snapshot.worldEntities, nextEntity),
  }
  return reconcilePersistedAutoManagedWorldViews(nextSnapshot, {
    recentEntityKeys: [nextEntity.key],
    preferredRootEntityKey: nextEntity.key,
  })
}

export async function updateWorldEntity(snapshot: ProjectSnapshot, entityKey: string, changes: WorldEntityUpdateInput) {
  await getValidatedSession('Sign in and load a live GraphCore draft before updating a world entity.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before updating a world entity.')
  }

  const payload = worldEntityUpdateInputSchema.parse(changes)
  const updatePayload: Record<string, unknown> = {}

  if (payload.name !== undefined) updatePayload.name = payload.name
  if (payload.summary !== undefined) updatePayload.summary = payload.summary
  if (payload.context !== undefined) updatePayload.context = payload.context
  if (payload.nodeType !== undefined) updatePayload.node_type = payload.nodeType
  if (payload.aliases !== undefined) updatePayload.aliases = payload.aliases
  if (payload.tags !== undefined) updatePayload.tags = payload.tags
  if (payload.status !== undefined) updatePayload.status = payload.status
  if (payload.thumbnailAssetKey !== undefined) updatePayload.thumbnail_asset_key = payload.thumbnailAssetKey
  if (payload.linkedDefinitionKey !== undefined) updatePayload.linked_definition_key = payload.linkedDefinitionKey
  if (payload.source !== undefined) updatePayload.source = payload.source
  if (payload.customProperties !== undefined) updatePayload.custom_properties = payload.customProperties
  if (payload.metadata !== undefined) updatePayload.metadata = payload.metadata

  const updateResponse = await supabase
    .from('world_entities')
    .update(updatePayload)
    .eq('draft_id', snapshot.draft.id)
    .eq('key', entityKey)
    .select(WORLD_ENTITY_SELECT)
    .single()

  if (updateResponse.error) {
    throw new Error(updateResponse.error.message)
  }

  let nextEntity = mapWorldEntityRow(updateResponse.data as WorldEntityRow)
  let workingSnapshot = snapshot
  if (!nextEntity.linkedDefinitionKey && worldEntityRequiresLinkedDefinition(nextEntity.nodeType)) {
    const linkedDefinition = await createLinkedDefinitionForWorldEntity(snapshot, {
      name: nextEntity.name,
      summary: nextEntity.summary,
      context: nextEntity.context,
      nodeType: nextEntity.nodeType,
      aliases: nextEntity.aliases,
      tags: nextEntity.tags,
      status: nextEntity.status,
      thumbnailAssetKey: nextEntity.thumbnailAssetKey,
      linkedDefinitionKey: null,
      source: nextEntity.source,
      customProperties: nextEntity.customProperties,
      metadata: nextEntity.metadata,
      ensureLinkedDefinition: true,
    })
    if (linkedDefinition.linkedDefinitionKey) {
      const linkResponse = await supabase
        .from('world_entities')
        .update({ linked_definition_key: linkedDefinition.linkedDefinitionKey })
        .eq('draft_id', snapshot.draft.id)
        .eq('key', nextEntity.key)
        .select(WORLD_ENTITY_SELECT)
        .single()
      if (linkResponse.error) throw new Error(linkResponse.error.message)
      nextEntity = mapWorldEntityRow(linkResponse.data as WorldEntityRow)
      workingSnapshot = {
        ...snapshot,
        definitions: linkedDefinition.linkedDefinition
          ? upsertEntryByKey(snapshot.definitions, linkedDefinition.linkedDefinition)
          : snapshot.definitions,
      }
    }
  }
  const syncedDefinition = await syncLinkedDefinitionFromWorldEntity(workingSnapshot, nextEntity)
  const nextSnapshot = {
    ...workingSnapshot,
    definitions: syncedDefinition.definitions,
    worldEntities: upsertEntryByKey(workingSnapshot.worldEntities, nextEntity),
  }
  return reconcilePersistedAutoManagedWorldViews(nextSnapshot, {
    recentEntityKeys: [nextEntity.key],
    preferredRootEntityKey: nextEntity.key,
  })
}

export async function setWorldEntityCanonLock(snapshot: ProjectSnapshot, entityKey: string, input: {
  locked: boolean
  reason?: string
  lockedByTurnId?: string | null
}) {
  const entity = snapshot.worldEntities.find((entry) => entry.key === entityKey) ?? null
  if (!entity) {
    throw new Error(`World entity "${entityKey}" was not found.`)
  }
  const canonMetadata = input.locked
    ? {
      locked: true,
      reason: input.reason ?? '',
      lockedAt: new Date().toISOString(),
      lockedByTurnId: input.lockedByTurnId ?? null,
    }
    : {
      locked: false,
      reason: '',
      lockedAt: null,
      lockedByTurnId: null,
    }
  return updateWorldEntity(snapshot, entityKey, {
    metadata: {
      ...(entity.metadata ?? {}),
      canon: canonMetadata,
    },
  })
}

export async function deleteWorldEntity(snapshot: ProjectSnapshot, entityKey: string) {
  await getValidatedSession('Sign in and load a live GraphCore draft before deleting a world entity.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before deleting a world entity.')
  }

  const entity = snapshot.worldEntities.find((entry) => entry.key === entityKey) ?? null
  const linkedDefinitionKey = entity?.linkedDefinitionKey ?? null
  const linkedDefinition = linkedDefinitionKey
    ? snapshot.definitions.find((entry) => entry.key === linkedDefinitionKey) ?? null
    : null
  const expectedLinkedDefinitionKind = entity ? definitionKindForWorldNodeType(entity.nodeType) : null

  const dependentOperators = snapshot.worldOperators
    .filter((entry) => entry.inputEntityKeys.includes(entityKey))
    .map((entry) => entry.key)
  for (const operatorKey of dependentOperators) {
    await deleteWorldDerivedComposition(snapshot, operatorKey)
  }

  const connectionDelete = await supabase
    .from('world_graph_connections')
    .delete()
    .eq('draft_id', snapshot.draft.id)
    .or(`source_node_key.eq.${entityKey},target_node_key.eq.${entityKey}`)
  if (connectionDelete.error) {
    throw new Error(connectionDelete.error.message)
  }

  const deleteResponse = await supabase
    .from('world_entities')
    .delete()
    .eq('draft_id', snapshot.draft.id)
    .eq('key', entityKey)

  if (deleteResponse.error) {
    throw new Error(deleteResponse.error.message)
  }

  if (
    linkedDefinitionKey
    && linkedDefinition
    && expectedLinkedDefinitionKind
    && linkedDefinition.kind === expectedLinkedDefinitionKind
  ) {
    const definitionDelete = await supabase
      .from('project_definitions')
      .delete()
      .eq('draft_id', snapshot.draft.id)
      .eq('key', linkedDefinitionKey)

    if (definitionDelete.error) {
      throw new Error(definitionDelete.error.message)
    }
  }

  const reloaded = await reloadLiveSnapshot(snapshot)
  return reconcilePersistedAutoManagedWorldViews(reloaded)
}

export async function resetProjectWorld(snapshot: ProjectSnapshot) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before resetting the project world.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before resetting the project world.')
  }

  const request = resetProjectWorldRequestSchema.parse({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
  })

  const response = await invokeAuthedFunctionWithSessionRecovery<ResetProjectWorldResponse>(
    'reset-project-world',
    request,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }

  resetProjectWorldResponseSchema.parse(response.data)

  if (snapshot.projectContext) {
    const nextProjectContext = buildProjectContext({
      projectType: snapshot.projectContext.projectType,
      projectSubtype: snapshot.projectContext.projectSubtype,
      artStylePreset: snapshot.projectContext.artStylePreset,
      artStyleDescription: snapshot.projectContext.artStyleDescription,
      source: snapshot.projectContext.source,
      completed: false,
    })
    const draftMetadata = {
      ...(snapshot.draft.metadata ?? {}),
      projectContext: nextProjectContext,
    }
    const metadataUpdate = await supabase
      .from('project_drafts')
      .update({ metadata: draftMetadata })
      .eq('id', snapshot.draft.id)
    if (metadataUpdate.error) {
      throw new Error(metadataUpdate.error.message)
    }
  }

  return reloadLiveSnapshot(snapshot)
}

export async function createWorldRelationship(snapshot: ProjectSnapshot, input: WorldRelationshipCreateInput) {
  await getValidatedSession('Sign in and load a live GraphCore draft before creating a world relationship.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before creating a world relationship.')
  }

  const payload = worldRelationshipCreateInputSchema.parse(input)
  const sourceEntity = snapshot.worldEntities.find((entity) => entity.key === payload.sourceEntityKey) ?? null
  const targetEntity = snapshot.worldEntities.find((entity) => entity.key === payload.targetEntityKey) ?? null
  if (!sourceEntity || !targetEntity) {
    throw new Error('Both world entities must exist before creating a relationship.')
  }
  const sourceEntityId = await resolvePersistedWorldEntityId(snapshot, sourceEntity)
  const targetEntityId = await resolvePersistedWorldEntityId(snapshot, targetEntity)

  const key = buildWorldRelationshipKey(
    snapshot.worldRelationships.map((relationship) => relationship.key),
    payload.sourceEntityKey,
    payload.verb,
    payload.targetEntityKey,
  )

  const insertResponse = await supabase
    .from('world_relationships')
    .insert({
      draft_id: snapshot.draft.id,
      key,
      source_entity_id: sourceEntityId,
      target_entity_id: targetEntityId,
      verb: payload.verb,
      direction: payload.direction,
      strength: payload.strength,
      confidence: payload.confidence,
      source: payload.source,
      notes: payload.notes,
      state: payload.state,
      metadata: payload.metadata,
    })
    .select(WORLD_RELATIONSHIP_SELECT)
    .single()

  if (insertResponse.error) {
    throw new Error(insertResponse.error.message)
  }

  const nextRelationship = mapWorldRelationshipRow(insertResponse.data as WorldRelationshipRow, snapshot.worldEntities)
  const nextSnapshot = {
    ...snapshot,
    worldRelationships: upsertEntryByKey(snapshot.worldRelationships, nextRelationship),
  }
  return reconcilePersistedAutoManagedWorldViews(nextSnapshot, {
    recentEntityKeys: [nextRelationship.sourceEntityKey, nextRelationship.targetEntityKey],
    recentRelationshipKeys: [nextRelationship.key],
    preferredRootEntityKey: nextRelationship.sourceEntityKey,
  })
}

export async function updateWorldRelationship(snapshot: ProjectSnapshot, relationshipKey: string, changes: WorldRelationshipUpdateInput) {
  await getValidatedSession('Sign in and load a live GraphCore draft before updating a world relationship.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before updating a world relationship.')
  }

  const payload = worldRelationshipUpdateInputSchema.parse(changes)
  const updatePayload: Record<string, unknown> = {}
  if (payload.sourceEntityKey) {
    const sourceEntity = snapshot.worldEntities.find((entity) => entity.key === payload.sourceEntityKey) ?? null
    if (!sourceEntity) throw new Error('The updated source entity was not found.')
    updatePayload.source_entity_id = await resolvePersistedWorldEntityId(snapshot, sourceEntity)
  }
  if (payload.targetEntityKey) {
    const targetEntity = snapshot.worldEntities.find((entity) => entity.key === payload.targetEntityKey) ?? null
    if (!targetEntity) throw new Error('The updated target entity was not found.')
    updatePayload.target_entity_id = await resolvePersistedWorldEntityId(snapshot, targetEntity)
  }
  if (payload.verb !== undefined) updatePayload.verb = payload.verb
  if (payload.direction !== undefined) updatePayload.direction = payload.direction
  if (payload.strength !== undefined) updatePayload.strength = payload.strength
  if (payload.confidence !== undefined) updatePayload.confidence = payload.confidence
  if (payload.source !== undefined) updatePayload.source = payload.source
  if (payload.notes !== undefined) updatePayload.notes = payload.notes
  if (payload.state !== undefined) updatePayload.state = payload.state
  if (payload.metadata !== undefined) updatePayload.metadata = payload.metadata

  const updateResponse = await supabase
    .from('world_relationships')
    .update(updatePayload)
    .eq('draft_id', snapshot.draft.id)
    .eq('key', relationshipKey)
    .select(WORLD_RELATIONSHIP_SELECT)
    .single()

  if (updateResponse.error) {
    throw new Error(updateResponse.error.message)
  }

  const nextSnapshot = {
    ...snapshot,
    worldRelationships: upsertEntryByKey(
      snapshot.worldRelationships,
      mapWorldRelationshipRow(updateResponse.data as WorldRelationshipRow, snapshot.worldEntities),
    ),
  }
  const resolvedRelationship = nextSnapshot.worldRelationships.find((entry) => entry.key === relationshipKey) ?? null
  return reconcilePersistedAutoManagedWorldViews(nextSnapshot, {
    recentEntityKeys: resolvedRelationship ? [resolvedRelationship.sourceEntityKey, resolvedRelationship.targetEntityKey] : [],
    recentRelationshipKeys: [relationshipKey],
    preferredRootEntityKey: resolvedRelationship?.sourceEntityKey ?? null,
  })
}

export async function setWorldRelationshipCanonLock(snapshot: ProjectSnapshot, relationshipKey: string, input: {
  locked: boolean
  reason?: string
  lockedByTurnId?: string | null
}) {
  const relationship = snapshot.worldRelationships.find((entry) => entry.key === relationshipKey) ?? null
  if (!relationship) {
    throw new Error(`World relationship "${relationshipKey}" was not found.`)
  }
  const canonMetadata = input.locked
    ? {
      locked: true,
      reason: input.reason ?? '',
      lockedAt: new Date().toISOString(),
      lockedByTurnId: input.lockedByTurnId ?? null,
    }
    : {
      locked: false,
      reason: '',
      lockedAt: null,
      lockedByTurnId: null,
    }
  return updateWorldRelationship(snapshot, relationshipKey, {
    metadata: {
      ...(relationship.metadata ?? {}),
      canon: canonMetadata,
    },
  })
}

export async function deleteWorldRelationship(snapshot: ProjectSnapshot, relationshipKey: string) {
  await getValidatedSession('Sign in and load a live GraphCore draft before deleting a world relationship.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before deleting a world relationship.')
  }

  const deleteResponse = await supabase
    .from('world_relationships')
    .delete()
    .eq('draft_id', snapshot.draft.id)
    .eq('key', relationshipKey)

  if (deleteResponse.error) {
    throw new Error(deleteResponse.error.message)
  }

  const nextSnapshot = {
    ...snapshot,
    worldRelationships: snapshot.worldRelationships.filter((relationship) => relationship.key !== relationshipKey),
  }
  return reconcilePersistedAutoManagedWorldViews(nextSnapshot)
}

export async function createWorldView(snapshot: ProjectSnapshot, input: WorldViewCreateInput) {
  await getValidatedSession('Sign in and load a live GraphCore draft before saving a world view.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before saving a world view.')
  }

  const payload = worldViewCreateInputSchema.parse(input)
  const key = buildWorldViewKey(snapshot.worldViews.map((view) => view.key), payload.name)

  const insertResponse = await supabase
    .from('world_views')
    .insert({
      draft_id: snapshot.draft.id,
      key,
      name: payload.name,
      mode: payload.mode,
      filters: payload.filters,
      search: payload.search,
      root_entity_key: payload.rootEntityKey,
      camera: payload.camera,
      focus_depth: payload.focusDepth,
      show_suggestions: payload.showSuggestions,
      show_labels: payload.showLabels,
      show_derived_layer: payload.showDerivedLayer,
      node_positions: payload.nodePositions,
      collapsed_state: payload.collapsedState,
      sort_mode: payload.sortMode,
      metadata: payload.metadata,
    })
    .select(WORLD_VIEW_SELECT)
    .single()

  if (insertResponse.error) {
    throw new Error(insertResponse.error.message)
  }

  return {
    ...snapshot,
    worldViews: upsertEntryByKey(snapshot.worldViews, mapWorldViewRow(insertResponse.data as WorldViewRow)),
  }
}

export async function updateWorldView(snapshot: ProjectSnapshot, viewKey: string, changes: WorldViewUpdateInput) {
  await getValidatedSession('Sign in and load a live GraphCore draft before updating a world view.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before updating a world view.')
  }

  const payload = worldViewUpdateInputSchema.parse(changes)
  const updatePayload: Record<string, unknown> = {}
  if (payload.name !== undefined) updatePayload.name = payload.name
  if (payload.mode !== undefined) updatePayload.mode = payload.mode
  if (payload.filters !== undefined) updatePayload.filters = payload.filters
  if (payload.search !== undefined) updatePayload.search = payload.search
  if (payload.rootEntityKey !== undefined) updatePayload.root_entity_key = payload.rootEntityKey
  if (payload.camera !== undefined) updatePayload.camera = payload.camera
  if (payload.focusDepth !== undefined) updatePayload.focus_depth = payload.focusDepth
  if (payload.showSuggestions !== undefined) updatePayload.show_suggestions = payload.showSuggestions
  if (payload.showLabels !== undefined) updatePayload.show_labels = payload.showLabels
  if (payload.showDerivedLayer !== undefined) updatePayload.show_derived_layer = payload.showDerivedLayer
  if (payload.nodePositions !== undefined) updatePayload.node_positions = payload.nodePositions
  if (payload.collapsedState !== undefined) updatePayload.collapsed_state = payload.collapsedState
  if (payload.sortMode !== undefined) updatePayload.sort_mode = payload.sortMode
  if (payload.metadata !== undefined) updatePayload.metadata = payload.metadata

  const updateResponse = await supabase
    .from('world_views')
    .update(updatePayload)
    .eq('draft_id', snapshot.draft.id)
    .eq('key', viewKey)
    .select(WORLD_VIEW_SELECT)
    .single()

  if (updateResponse.error) {
    throw new Error(updateResponse.error.message)
  }

  return {
    ...snapshot,
    worldViews: upsertEntryByKey(snapshot.worldViews, mapWorldViewRow(updateResponse.data as WorldViewRow)),
  }
}

export async function deleteWorldView(snapshot: ProjectSnapshot, viewKey: string) {
  await getValidatedSession('Sign in and load a live GraphCore draft before deleting a world view.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before deleting a world view.')
  }

  const deleteResponse = await supabase
    .from('world_views')
    .delete()
    .eq('draft_id', snapshot.draft.id)
    .eq('key', viewKey)

  if (deleteResponse.error) {
    throw new Error(deleteResponse.error.message)
  }

  return {
    ...snapshot,
    worldViews: snapshot.worldViews.filter((view) => view.key !== viewKey),
  }
}

export async function createWorldRelationshipFromGraphGesture(snapshot: ProjectSnapshot, input: WorldRelationshipCreateInput) {
  return createWorldRelationship(snapshot, input)
}

export async function createWorldDerivedComposition(snapshot: ProjectSnapshot, input: WorldDerivedCompositionCreateInput) {
  await getValidatedSession('Sign in and load a live GraphCore draft before creating a derived world composition.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before creating a derived world composition.')
  }

  const payload = worldDerivedCompositionCreateInputSchema.parse(input)
  const sourceEntity = snapshot.worldEntities.find((entity) => entity.key === payload.sourceEntityKey) ?? null
  const targetEntity = snapshot.worldEntities.find((entity) => entity.key === payload.targetEntityKey) ?? null
  if (!sourceEntity || !targetEntity) {
    throw new Error('Both world entities must exist before creating a derived composition.')
  }

  const operatorKey = buildWorldOperatorKey(
    snapshot.worldOperators.map((entry) => entry.key),
    sourceEntity.key,
    payload.operatorType,
    targetEntity.key,
  )
  const title = payload.title?.trim() || buildWorldDerivedCompositionTitle(sourceEntity, targetEntity, payload.operatorType)
  const resultKey = buildWorldResultKey(snapshot.worldResults.map((entry) => entry.key), title)
  const previewAssetKey = payload.previewAssetKey ?? buildPreviewAssetKeyForComposition(snapshot, [sourceEntity, targetEntity])

  const operatorInsert = await supabase
    .from('world_operators')
    .insert({
      draft_id: snapshot.draft.id,
      key: operatorKey,
      operator_type: payload.operatorType,
      input_entity_keys: [sourceEntity.key, targetEntity.key],
      label: '',
      status: 'active',
      metadata: payload.metadata,
    })
    .select(WORLD_OPERATOR_SELECT)
    .single()

  if (operatorInsert.error) {
    throw new Error(operatorInsert.error.message)
  }

  const resultInsert = await supabase
    .from('world_results')
    .insert({
      draft_id: snapshot.draft.id,
      key: resultKey,
      result_type: resultTypeForOperatorType(payload.operatorType),
      source_operator_key: operatorKey,
      title,
      summary: payload.summary,
      preview_asset_key: previewAssetKey,
      status: 'ready',
      metadata: {
        inputEntityKeys: [sourceEntity.key, targetEntity.key],
        ...payload.metadata,
      },
    })
    .select(WORLD_RESULT_SELECT)
    .single()

  if (resultInsert.error) {
    throw new Error(resultInsert.error.message)
  }

  const existingConnectionKeys = snapshot.worldGraphConnections.map((entry) => entry.key)
  const connectionInsert = await supabase
    .from('world_graph_connections')
    .insert([
      {
        draft_id: snapshot.draft.id,
        key: buildWorldGraphConnectionKey(existingConnectionKeys, `${sourceEntity.key}-input-${operatorKey}`),
        source_node_key: sourceEntity.key,
        source_node_kind: 'entity',
        target_node_key: operatorKey,
        target_node_kind: 'operator',
        role: 'input',
        metadata: {},
      },
      {
        draft_id: snapshot.draft.id,
        key: buildWorldGraphConnectionKey([...existingConnectionKeys, 'reserved-1'], `${targetEntity.key}-input-${operatorKey}`),
        source_node_key: targetEntity.key,
        source_node_kind: 'entity',
        target_node_key: operatorKey,
        target_node_kind: 'operator',
        role: 'input',
        metadata: {},
      },
      {
        draft_id: snapshot.draft.id,
        key: buildWorldGraphConnectionKey([...existingConnectionKeys, 'reserved-1', 'reserved-2'], `${operatorKey}-output-${resultKey}`),
        source_node_key: operatorKey,
        source_node_kind: 'operator',
        target_node_key: resultKey,
        target_node_kind: 'result',
        role: 'output',
        metadata: {},
      },
    ])
    .select(WORLD_CONNECTION_SELECT)

  if (connectionInsert.error) {
    throw new Error(connectionInsert.error.message)
  }

  const nextOperator = mapWorldOperatorRow(operatorInsert.data as WorldOperatorRow)
  const nextResult = mapWorldResultRow(resultInsert.data as WorldResultRow)
  const nextConnections = ((connectionInsert.data as WorldGraphConnectionRow[] | null) ?? []).map(mapWorldGraphConnectionRow)

  return {
    ...snapshot,
    worldOperators: upsertEntryByKey(snapshot.worldOperators, nextOperator),
    worldResults: upsertEntryByKey(snapshot.worldResults, nextResult),
    worldGraphConnections: [
      ...snapshot.worldGraphConnections.filter((entry) => !nextConnections.some((connection) => connection.key === entry.key)),
      ...nextConnections,
    ],
  }
}

export async function updateWorldDerivedComposition(snapshot: ProjectSnapshot, operatorKey: string, changes: WorldDerivedCompositionUpdateInput) {
  await getValidatedSession('Sign in and load a live GraphCore draft before updating a derived world composition.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before updating a derived world composition.')
  }

  const payload = worldDerivedCompositionUpdateInputSchema.parse(changes)
  const operator = snapshot.worldOperators.find((entry) => entry.key === operatorKey) ?? null
  const result = snapshot.worldResults.find((entry) => entry.sourceOperatorKey === operatorKey) ?? null
  if (!operator || !result) {
    throw new Error(`Derived world composition "${operatorKey}" was not found.`)
  }

  if (payload.operatorChanges.inputEntityKeys && payload.operatorChanges.inputEntityKeys.length < 2) {
    throw new Error('Derived compositions require at least two input entities.')
  }

  const nextOperatorType = payload.operatorChanges.operatorType ?? operator.operatorType
  const nextInputEntityKeys = payload.operatorChanges.inputEntityKeys ?? operator.inputEntityKeys
  const inputEntities = nextInputEntityKeys
    .map((entityKey) => snapshot.worldEntities.find((entity) => entity.key === entityKey) ?? null)
    .filter((entity): entity is WorldEntity => Boolean(entity))

  const operatorUpdatePayload: Record<string, unknown> = {}
  if (payload.operatorChanges.operatorType !== undefined) operatorUpdatePayload.operator_type = payload.operatorChanges.operatorType
  if (payload.operatorChanges.inputEntityKeys !== undefined) operatorUpdatePayload.input_entity_keys = payload.operatorChanges.inputEntityKeys
  if (payload.operatorChanges.label !== undefined) operatorUpdatePayload.label = payload.operatorChanges.label
  if (payload.operatorChanges.status !== undefined) operatorUpdatePayload.status = payload.operatorChanges.status
  if (payload.operatorChanges.metadata !== undefined) operatorUpdatePayload.metadata = payload.operatorChanges.metadata

  if (Object.keys(operatorUpdatePayload).length > 0) {
    const operatorUpdate = await supabase
      .from('world_operators')
      .update(operatorUpdatePayload)
      .eq('draft_id', snapshot.draft.id)
      .eq('key', operatorKey)
    if (operatorUpdate.error) {
      throw new Error(operatorUpdate.error.message)
    }
  }

  const resultUpdatePayload: Record<string, unknown> = {}
  if (payload.resultChanges.resultType !== undefined) resultUpdatePayload.result_type = payload.resultChanges.resultType
  else if (payload.operatorChanges.operatorType !== undefined) resultUpdatePayload.result_type = resultTypeForOperatorType(nextOperatorType)
  if (payload.resultChanges.title !== undefined) resultUpdatePayload.title = payload.resultChanges.title
  if (payload.resultChanges.summary !== undefined) resultUpdatePayload.summary = payload.resultChanges.summary
  if (payload.resultChanges.previewAssetKey !== undefined) resultUpdatePayload.preview_asset_key = payload.resultChanges.previewAssetKey
  else if (payload.operatorChanges.inputEntityKeys !== undefined && inputEntities.length > 0 && !result.previewAssetKey) {
    resultUpdatePayload.preview_asset_key = buildPreviewAssetKeyForComposition(snapshot, inputEntities)
  }
  if (payload.resultChanges.status !== undefined) resultUpdatePayload.status = payload.resultChanges.status
  if (payload.resultChanges.metadata !== undefined || payload.operatorChanges.inputEntityKeys !== undefined) {
    resultUpdatePayload.metadata = {
      ...(result.metadata ?? {}),
      ...(payload.resultChanges.metadata ?? {}),
      inputEntityKeys: nextInputEntityKeys,
    }
  }

  if (Object.keys(resultUpdatePayload).length > 0) {
    const resultUpdate = await supabase
      .from('world_results')
      .update(resultUpdatePayload)
      .eq('draft_id', snapshot.draft.id)
      .eq('key', result.key)
    if (resultUpdate.error) {
      throw new Error(resultUpdate.error.message)
    }
  }

  const nextOperator: WorldOperator = {
    ...operator,
    ...(payload.operatorChanges ?? {}),
  }
  const nextResult: WorldResult = {
    ...result,
    ...(payload.resultChanges ?? {}),
    resultType: payload.resultChanges.resultType ?? (payload.operatorChanges.operatorType ? resultTypeForOperatorType(nextOperatorType) : result.resultType),
    previewAssetKey:
      payload.resultChanges.previewAssetKey !== undefined
        ? payload.resultChanges.previewAssetKey
        : payload.operatorChanges.inputEntityKeys !== undefined && inputEntities.length > 0 && !result.previewAssetKey
          ? buildPreviewAssetKeyForComposition(snapshot, inputEntities)
          : result.previewAssetKey,
    metadata:
      payload.resultChanges.metadata !== undefined || payload.operatorChanges.inputEntityKeys !== undefined
        ? {
            ...(result.metadata ?? {}),
            ...(payload.resultChanges.metadata ?? {}),
            inputEntityKeys: nextInputEntityKeys,
          }
        : result.metadata,
  }

  return {
    ...snapshot,
    worldOperators: upsertEntryByKey(snapshot.worldOperators, nextOperator),
    worldResults: upsertEntryByKey(snapshot.worldResults, nextResult),
  }
}

export async function deleteWorldDerivedComposition(snapshot: ProjectSnapshot, operatorKey: string) {
  await getValidatedSession('Sign in and load a live GraphCore draft before deleting a derived world composition.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before deleting a derived world composition.')
  }

  const resultKeys = snapshot.worldResults
    .filter((entry) => entry.sourceOperatorKey === operatorKey)
    .map((entry) => entry.key)
  const deleteOperatorConnections = await supabase
    .from('world_graph_connections')
    .delete()
    .eq('draft_id', snapshot.draft.id)
    .or(`source_node_key.eq.${operatorKey},target_node_key.eq.${operatorKey}`)
  if (deleteOperatorConnections.error) {
    throw new Error(deleteOperatorConnections.error.message)
  }

  if (resultKeys.length > 0) {
    const deleteResultConnections = await supabase
      .from('world_graph_connections')
      .delete()
      .eq('draft_id', snapshot.draft.id)
      .in('target_node_key', resultKeys)
    if (deleteResultConnections.error) {
      throw new Error(deleteResultConnections.error.message)
    }
  }

  const deleteResults = await supabase
    .from('world_results')
    .delete()
    .eq('draft_id', snapshot.draft.id)
    .eq('source_operator_key', operatorKey)
  if (deleteResults.error) {
    throw new Error(deleteResults.error.message)
  }

  const deleteOperator = await supabase
    .from('world_operators')
    .delete()
    .eq('draft_id', snapshot.draft.id)
    .eq('key', operatorKey)
  if (deleteOperator.error) {
    throw new Error(deleteOperator.error.message)
  }

  return reloadLiveSnapshot(snapshot)
}

export async function generateWorldResultPreview(snapshot: ProjectSnapshot, resultKey: string) {
  await getValidatedSession('Sign in and load a live GraphCore draft before generating a world result preview.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before generating a world result preview.')
  }

  const result = snapshot.worldResults.find((entry) => entry.key === resultKey) ?? null
  if (!result) {
    throw new Error(`World result "${resultKey}" was not found.`)
  }

  const operator = snapshot.worldOperators.find((entry) => entry.key === result.sourceOperatorKey) ?? null
  if (!operator) {
    throw new Error(`World operator "${result.sourceOperatorKey}" was not found.`)
  }

  const inputEntities = operator.inputEntityKeys
    .map((entityKey) => snapshot.worldEntities.find((entity) => entity.key === entityKey) ?? null)
    .filter((entity): entity is WorldEntity => Boolean(entity))
  const previewAssetKey = buildPreviewAssetKeyForComposition(snapshot, inputEntities)

  const updateResponse = await supabase
    .from('world_results')
    .update({
      preview_asset_key: previewAssetKey,
      status: 'ready',
      metadata: {
        ...(result.metadata ?? {}),
        lastPreviewGeneratedAt: new Date().toISOString(),
      },
    })
    .eq('draft_id', snapshot.draft.id)
    .eq('key', resultKey)
    .select(WORLD_RESULT_SELECT)
    .single()

  if (updateResponse.error) {
    throw new Error(updateResponse.error.message)
  }

  return {
    ...snapshot,
    worldResults: upsertEntryByKey(snapshot.worldResults, mapWorldResultRow(updateResponse.data as WorldResultRow)),
  }
}

export async function generateStarterWorld(request: WorldGraphSeedRequest) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before generating a starter world.')
  const payload = worldGraphSeedRequestSchema.parse(request)

  if (!hasLiveSnapshotIds(payload.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before generating a starter world.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery<{ ok?: boolean; assistantNote?: string }>(
    'generate-world-graph-seed',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }

  const refreshed = await loadProjectSnapshot({
    projectId: payload.snapshot.project.id,
    draftId: payload.snapshot.draft.id,
  })
  if (refreshed.source !== 'supabase') {
    throw new Error(refreshed.reason ?? 'World graph generation completed but the live snapshot could not be reloaded.')
  }
  return refreshed.snapshot
}

export async function generateWorldExpansion(request: WorldGraphExpansionRequest) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before generating a world expansion.')
  const payload = worldGraphExpansionRequestSchema.parse(request)

  if (!hasLiveSnapshotIds(payload.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before generating a world expansion.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery<{ ok?: boolean; assistantNote?: string }>(
    'generate-world-graph-expansion',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }

  const refreshed = await loadProjectSnapshot({
    projectId: payload.snapshot.project.id,
    draftId: payload.snapshot.draft.id,
  })
  if (refreshed.source !== 'supabase') {
    throw new Error(refreshed.reason ?? 'World graph expansion completed but the live snapshot could not be reloaded.')
  }
  return refreshed.snapshot
}

function buildWorldPromptSnapshot(snapshot: ProjectSnapshot): WorldPromptStartTurnRequest['snapshot'] {
  return {
    workspace: {
      id: snapshot.workspace.id,
      name: snapshot.workspace.name,
      slug: snapshot.workspace.slug,
      role: snapshot.workspace.role,
    },
    project: {
      id: snapshot.project.id,
      name: snapshot.project.name,
      slug: snapshot.project.slug,
      summary: snapshot.project.summary,
      visibility: snapshot.project.visibility,
    },
    draft: {
      id: snapshot.draft.id,
      name: snapshot.draft.name,
      version: snapshot.draft.version,
      isPrimary: snapshot.draft.isPrimary,
      updatedAt: snapshot.draft.updatedAt,
      metadata: snapshot.draft.metadata ?? {},
    },
    definitions: snapshot.definitions.map((definition) => ({
      key: definition.key,
      kind: definition.kind,
      name: definition.name,
      summary: definition.summary,
    })),
    graphs: snapshot.graphs.map((graph) => ({
      key: graph.key,
      name: graph.name,
      summary: graph.summary,
      graphType: graph.graphType,
    })),
    assets: snapshot.assets.map((asset) => ({
      key: asset.key,
      name: asset.name,
      kind: asset.kind,
    })),
    worldEntities: snapshot.worldEntities,
    worldRelationships: snapshot.worldRelationships,
    worldViews: snapshot.worldViews,
    worldOperators: snapshot.worldOperators,
    worldResults: snapshot.worldResults,
    worldGraphConnections: snapshot.worldGraphConnections,
    worldThreads: snapshot.worldThreads,
    gameSpec: snapshot.gameSpec as Record<string, unknown> | null,
    projectContext: snapshot.projectContext,
  }
}

export function listWorldThreads(snapshot: ProjectSnapshot) {
  return [...snapshot.worldThreads].sort((left, right) => (
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  ))
}

export async function updateWorldThread(snapshot: ProjectSnapshot, threadKey: string, changes: WorldThreadUpdateInput) {
  await getValidatedSession('Sign in and load a live GraphCore draft before updating a world thread.')

  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before updating a world thread.')
  }

  const payload = worldThreadUpdateInputSchema.parse(changes)
  const updatePayload: Record<string, unknown> = {}
  if (payload.title !== undefined) updatePayload.title = payload.title
  if (payload.summary !== undefined) updatePayload.summary = payload.summary
  if (payload.status !== undefined) updatePayload.status = payload.status
  if (payload.priority !== undefined) updatePayload.priority = payload.priority
  if (payload.linkedEntityKeys !== undefined) updatePayload.linked_entity_keys = payload.linkedEntityKeys
  if (payload.sourceTurnId !== undefined) updatePayload.source_turn_id = payload.sourceTurnId
  if (payload.lastTurnId !== undefined) updatePayload.last_turn_id = payload.lastTurnId
  if (payload.metadata !== undefined) updatePayload.metadata = payload.metadata

  const response = await supabase
    .from('world_threads')
    .update(updatePayload)
    .eq('draft_id', snapshot.draft.id)
    .eq('key', threadKey)
    .select(WORLD_THREAD_SELECT)
    .single()

  if (response.error) {
    throw new Error(response.error.message)
  }

  const nextThread = mapWorldThreadRow(response.data as WorldThreadRow)
  const nextSnapshot = {
    ...snapshot,
    worldThreads: upsertEntryByKey(snapshot.worldThreads, nextThread),
  }
  return reconcilePersistedAutoManagedWorldViews(nextSnapshot, {
    recentEntityKeys: nextThread.linkedEntityKeys,
    preferredThreadKey: nextThread.key,
  })
}

export async function resolveWorldThread(snapshot: ProjectSnapshot, threadKey: string) {
  return updateWorldThread(snapshot, threadKey, { status: 'resolved' })
}

export async function parkWorldThread(snapshot: ProjectSnapshot, threadKey: string) {
  return updateWorldThread(snapshot, threadKey, { status: 'parked' })
}

function buildLockedEntityRefsFromThread(snapshot: ProjectSnapshot, thread: WorldThread) {
  return thread.linkedEntityKeys
    .map((entityKey) => snapshot.worldEntities.find((entity) => entity.key === entityKey) ?? null)
    .filter((entity): entity is WorldEntity => Boolean(entity))
    .map((entity) => {
      const definition = entity.linkedDefinitionKey
        ? snapshot.definitions.find((entry) => entry.key === entity.linkedDefinitionKey) ?? null
        : null
      const kind =
        entity.nodeType === 'actor'
          ? 'character'
          : entity.nodeType === 'place'
            ? 'environment'
            : entity.nodeType === 'object'
              ? 'item'
              : null
      if (!kind) return null
      return {
        id: entity.key,
        kind: kind as 'character' | 'environment' | 'item',
        role: (kind === 'environment' ? 'location' : kind === 'item' ? 'prop' : 'participant') as 'location' | 'prop' | 'participant',
        sourceName: entity.name,
        summary: entity.summary,
        resolution: 'existing' as const,
        definitionKey: definition?.key ?? entity.linkedDefinitionKey ?? null,
        planItemId: null,
        referenceRole: null,
        downstreamUse: null,
        captureProfile: null,
        conceptArtMode: null,
        conceptVariantSet: [],
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

export async function extractWorldThreadToCinematicPreview(snapshot: ProjectSnapshot, input: {
  threadKey: string
  mode?: 'teaser' | 'scene'
  model: string
}) {
  const thread = snapshot.worldThreads.find((entry) => entry.key === input.threadKey) ?? null
  if (!thread) {
    throw new Error(`World thread "${input.threadKey}" was not found.`)
  }
  const lockedEntityRefs = buildLockedEntityRefsFromThread(snapshot, thread)
  if (lockedEntityRefs.length === 0) {
    throw new Error('This thread does not have enough linked visual entities to plan a cinematic preview.')
  }
  const mode = input.mode ?? 'teaser'
  const prompt =
    mode === 'scene'
      ? `Plan a cinematic scene from the world thread "${thread.title}". Preserve the locked continuity refs and focus on ${thread.summary || thread.title}.`
      : `Plan a cinematic teaser from the world thread "${thread.title}". Preserve the locked continuity refs and focus on ${thread.summary || thread.title}.`
  return planWorldBuild({
    prompt,
    plannerModeHint: 'cinematic_build',
    lockedEntityRefs,
    snapshot,
    model: input.model,
  })
}

export function listWorldPromptSessions(snapshot: ProjectSnapshot) {
  return [...snapshot.worldPromptSessions].sort((left, right) => (
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  ))
}

export function loadWorldPromptSession(snapshot: ProjectSnapshot, sessionId: string | null) {
  const session = sessionId
    ? snapshot.worldPromptSessions.find((entry) => entry.id === sessionId || entry.key === sessionId) ?? null
    : snapshot.worldPromptSessions.find((entry) => entry.isActive) ?? snapshot.worldPromptSessions[0] ?? null
  if (!session) {
    return {
      session: null,
      turns: [],
      messages: [],
      events: [],
      suggestions: [],
    }
  }
  return {
    session,
    turns: snapshot.worldPromptTurns
      .filter((turn) => turn.sessionId === session.id)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    messages: snapshot.worldPromptMessages
      .filter((message) => message.sessionId === session.id)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    events: snapshot.worldPromptEvents
      .filter((event) => event.sessionId === session.id)
      .sort((left, right) => (
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        || left.sequence - right.sequence
      )),
    suggestions: snapshot.worldPromptSuggestions
      .filter((suggestion) => suggestion.sessionId === session.id)
      .sort((left, right) => (
        left.rank - right.rank
        || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      )),
  }
}

export async function startWorldPromptTurn(snapshot: ProjectSnapshot, request: Omit<WorldPromptStartTurnRequest, 'snapshot'>) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before starting a world prompt turn.')
  const payload = worldPromptStartTurnRequestSchema.parse({
    ...request,
    snapshot: buildWorldPromptSnapshot(snapshot),
  })

  if (!hasLiveSnapshotIds(payload.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before starting a world prompt turn.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery(
    'start-world-prompt-turn',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptStartTurnResponseSchema.parse(response.data)
}

export async function startWorldSeedInference(snapshot: ProjectSnapshot, request: Omit<WorldPromptSeedInferenceRequest, 'snapshot'>) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before starting initial world seed inference.')
  const payload = worldPromptSeedInferenceRequestSchema.parse({
    ...request,
    snapshot: buildWorldPromptSnapshot(snapshot),
  })

  if (!hasLiveSnapshotIds(payload.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before starting initial world seed inference.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery(
    'start-world-seed-inference',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptSeedInferenceResponseSchema.parse(response.data)
}

export async function continueWorldSeedGeneration(snapshot: ProjectSnapshot, request: Omit<WorldPromptSeedGenerationRequest, 'snapshot'>) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before continuing initial world seed generation.')
  const payload = worldPromptSeedGenerationRequestSchema.parse({
    ...request,
    snapshot: buildWorldPromptSnapshot(snapshot),
  })

  if (!hasLiveSnapshotIds(payload.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before continuing initial world seed generation.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery(
    'continue-world-seed-generation',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptSeedGenerationResponseSchema.parse(response.data)
}

export async function getWorldGenerationStatus(snapshot: ProjectSnapshot, request: Omit<WorldPromptGenerationStatusRequest, 'snapshot'>): Promise<WorldPromptGenerationStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading world generation status.')
  const payload = worldPromptGenerationStatusRequestSchema.parse({
    ...request,
    snapshot: buildWorldPromptSnapshot(snapshot),
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'get-world-generation-status',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptGenerationStatusResponseSchema.parse(response.data)
}

export async function cancelWorldGenerationJob(snapshot: ProjectSnapshot, request: Omit<WorldPromptCancelGenerationJobRequest, 'snapshot'>) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before cancelling world generation.')
  const payload = worldPromptCancelGenerationJobRequestSchema.parse({
    ...request,
    snapshot: buildWorldPromptSnapshot(snapshot),
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'cancel-world-generation-job',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptCancelGenerationJobResponseSchema.parse(response.data)
}

export async function startWorldEntityIconBatch(snapshot: ProjectSnapshot): Promise<WorldEntityIconGenerationStartResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before generating world entity icons.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before generating world entity icons.')
  }
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'start-world-entity-icon-batch',
    {
      projectId: snapshot.project.id,
      draftId: snapshot.draft.id,
    },
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldEntityIconGenerationStartResponseSchema.parse(response.data)
}

export async function generateWorldBrandAtlasImage(snapshot: ProjectSnapshot, prompt?: string): Promise<WorldBrandAtlasImageResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before generating a brand atlas image.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before generating a brand atlas image.')
  }
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'start-world-brand-atlas-image',
    {
      projectId: snapshot.project.id,
      draftId: snapshot.draft.id,
      prompt,
    },
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldBrandAtlasImageResponseSchema.parse(response.data)
}

export async function getWorldEntityIconBatchStatus(jobId: string): Promise<WorldEntityIconGenerationStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading world entity icon generation status.')
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'get-world-entity-icon-batch-status',
    { jobId },
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldEntityIconGenerationStatusResponseSchema.parse(response.data)
}

export async function startVisualGenerationJob(snapshot: ProjectSnapshot, request: Omit<Partial<VisualGenerationStartRequest>, 'projectId' | 'draftId'> & Pick<VisualGenerationStartRequest, 'kind'>): Promise<VisualGenerationStartResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before starting visual generation.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before starting visual generation.')
  }
  const payload = visualGenerationStartRequestSchema.parse({
    ...request,
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'start-visual-generation-job',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return visualGenerationStartResponseSchema.parse(response.data)
}

function mapVisualGenerationJobRow(row: Record<string, unknown>) {
  return visualGenerationJobSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    requestedBy: row.requested_by,
    status: row.status,
    kind: row.kind,
    provider: row.provider,
    model: row.model,
    targetKeys: row.target_keys ?? {},
    input: row.input ?? {},
    outputs: row.outputs ?? {},
    errorMessage: row.error_message,
    workerId: row.worker_id,
    heartbeatAt: row.heartbeat_at,
    attemptCount: row.attempt_count ?? 0,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export async function listActiveVisualGenerationJobs(
  snapshot: ProjectSnapshot,
  kinds: VisualGenerationKind[] = ['wiki_visual', 'entity_reference_sheet', 'character_sheet'],
): Promise<VisualGenerationJob[]> {
  await getValidatedSession('Sign in and load a live GraphCore draft before loading visual generation jobs.')
  if (!hasLiveSnapshotIds(snapshot)) return []

  const response = await supabase
    .from('visual_generation_jobs')
    .select('id, project_id, draft_id, requested_by, status, kind, provider, model, target_keys, input, outputs, error_message, worker_id, heartbeat_at, attempt_count, metadata, created_at, updated_at')
    .eq('project_id', snapshot.project.id)
    .eq('draft_id', snapshot.draft.id)
    .in('kind', kinds)
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: false })

  if (response.error) throw new Error(response.error.message)
  return (response.data ?? []).map((row) => mapVisualGenerationJobRow(row as Record<string, unknown>))
}

export async function getVisualGenerationStatus(jobId: string): Promise<VisualGenerationStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading visual generation status.')
  const payload = visualGenerationStatusRequestSchema.parse({ jobId })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'get-visual-generation-status',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return visualGenerationStatusResponseSchema.parse(response.data)
}

export async function cancelVisualGenerationJob(jobId: string): Promise<VisualGenerationCancelResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before cancelling visual generation.')
  const payload = visualGenerationStatusRequestSchema.parse({ jobId })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'cancel-visual-generation-job',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return visualGenerationCancelResponseSchema.parse(response.data)
}

export async function startAppCodeGeneration(snapshot: ProjectSnapshot): Promise<AppGenerationStartResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before building an app preview.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before building an app preview.')
  }
  const payload = appGenerationStartRequestSchema.parse({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
    kind: 'code_generation',
    targetGate: 'code_generated',
    input: {
      projectContext: snapshot.projectContext ?? null,
      requestedFrom: 'app_wiki',
    },
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'start-app-code-generation',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return appGenerationStartResponseSchema.parse(response.data)
}

export async function getAppGenerationStatus(jobId: string): Promise<AppGenerationStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading app generation status.')
  const payload = appGenerationStatusRequestSchema.parse({ jobId })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'get-app-generation-status',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return appGenerationStatusResponseSchema.parse(response.data)
}

export async function cancelAppGenerationJob(jobId: string): Promise<AppGenerationCancelResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before cancelling app generation.')
  const payload = appGenerationStatusRequestSchema.parse({ jobId })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'cancel-app-generation-job',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return appGenerationCancelResponseSchema.parse(response.data)
}

export async function getAppPreviewSession(jobId: string): Promise<AppPreviewSessionResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading an app preview.')
  const payload = appGenerationStatusRequestSchema.parse({ jobId })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'get-app-preview-session',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return appPreviewSessionResponseSchema.parse(response.data)
}

function readOutputWorkflowWorldWiki(snapshot: ProjectSnapshot) {
  const metadata = snapshot.draft.metadata && typeof snapshot.draft.metadata === 'object'
    ? snapshot.draft.metadata as Record<string, unknown>
    : {}
  const worldWiki = metadata.worldWiki && typeof metadata.worldWiki === 'object'
    ? metadata.worldWiki as Record<string, unknown>
    : {}
  return worldWiki
}

function buildOutputWorkflowSnapshot(snapshot: ProjectSnapshot): OutputWorkflowPlanRequest['snapshot'] {
  return outputWorkflowPlanRequestSchema.shape.snapshot.parse({
    project: {
      id: snapshot.project.id,
      name: snapshot.project.name,
      summary: snapshot.project.summary,
    },
    draft: {
      id: snapshot.draft.id,
      name: snapshot.draft.name,
      metadata: snapshot.draft.metadata ?? {},
    },
    projectContext: snapshot.projectContext ?? null,
    worldEntities: snapshot.worldEntities,
    worldRelationships: snapshot.worldRelationships,
    worldThreads: snapshot.worldThreads,
    worldWiki: readOutputWorkflowWorldWiki(snapshot),
  })
}

function buildOutputWorkflowRunInput(snapshot: ProjectSnapshot, request?: {
  selectedEntityKeys?: string[]
  selectedSequenceUnitKeys?: string[]
  pageCount?: number
  videoBlockCount?: number
  durationPerBlockSeconds?: number
  aspectRatio?: string
  videoResolution?: string
  generateAudio?: boolean
  cinematicPresetFamily?: string
  cinematicReferenceMode?: 'keyframes' | 'storyboard_sheet' | 'keyframes_and_storyboard' | 'shot_reference_sheet'
  cinematicPipelineVersion?: 'v1_take_blocks' | 'v2_shot_orchestration'
  cinematicV2AnimaticMode?: 'fast_panels' | 'quality_keyframes'
  debugCinematicStoryboardStyleSafeMode?: boolean
  cinematicStoryboardStyleOverride?: string
  debugSkipVideoGeneration?: boolean
  cinematicVideoApproved?: boolean
  cinematicVideoProductionEstimate?: Record<string, unknown> | null
}) {
  const selectedEntityKeys = request?.selectedEntityKeys ?? []
  const selectedSequenceUnitKeys = request?.selectedSequenceUnitKeys ?? []
  const debugCinematicStoryboardStyleSafeMode = request?.debugCinematicStoryboardStyleSafeMode ?? aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStyleSafeModeDefault
  const cinematicStoryboardStyleOverride = debugCinematicStoryboardStyleSafeMode
    ? request?.cinematicStoryboardStyleOverride ?? aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStylePrompt
    : ''
  return {
    projectContext: snapshot.projectContext ?? null,
    worldEntities: snapshot.worldEntities,
    worldRelationships: snapshot.worldRelationships,
    worldThreads: snapshot.worldThreads,
    worldWiki: readOutputWorkflowWorldWiki(snapshot),
    assets: snapshot.assets.map((asset) => ({
      key: asset.key,
      name: asset.name,
      kind: asset.kind,
      mimeType: asset.mimeType,
      storagePath: asset.storagePath,
      metadata: asset.metadata,
    })),
    sourceEntityKeys: selectedEntityKeys,
    sourceSequenceUnitKeys: selectedSequenceUnitKeys,
    pageCount: request?.pageCount,
    videoBlockCount: request?.videoBlockCount,
    durationPerBlockSeconds: request?.durationPerBlockSeconds,
    aspectRatio: request?.aspectRatio,
    videoResolution: request?.videoResolution,
    generateAudio: request?.generateAudio,
    cinematicPresetFamily: request?.cinematicPresetFamily,
    cinematicReferenceMode: request?.cinematicReferenceMode ?? aiGenerationSettings.outputWorkflow.cinematicReferenceModeDefault,
    cinematicPipelineVersion: request?.cinematicPipelineVersion,
    cinematicV2AnimaticMode: request?.cinematicV2AnimaticMode ?? 'fast_panels',
    debugCinematicStoryboardStyleSafeMode,
    cinematicStoryboardStyleOverride,
    debugSkipVideoGeneration: request?.debugSkipVideoGeneration ?? aiGenerationSettings.outputWorkflow.debugSkipVideoGenerationDefault,
    cinematicVideoApproved: request?.cinematicVideoApproved === true,
    cinematicVideoProductionEstimate: request?.cinematicVideoProductionEstimate ?? null,
  }
}

export async function planOutputWorkflow(
  snapshot: ProjectSnapshot,
  request?: Omit<Partial<OutputWorkflowPlanRequest>, 'projectId' | 'draftId' | 'snapshot'>,
): Promise<OutputWorkflowPlanResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before planning an output workflow.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Output workflow planning requires a live Supabase-backed draft.')
  }
  const payload = outputWorkflowPlanRequestSchema.parse({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
    prompt: request?.prompt ?? '',
    preset: request?.preset,
    selectedEntityKeys: request?.selectedEntityKeys ?? [],
    selectedSequenceUnitKeys: request?.selectedSequenceUnitKeys ?? [],
    pageCount: request?.pageCount,
    targetFormat: request?.targetFormat ?? 'pdf',
    imageQuality: request?.imageQuality,
    imageOutputFormat: request?.imageOutputFormat,
    videoBlockCount: request?.videoBlockCount,
    durationPerBlockSeconds: request?.durationPerBlockSeconds,
    aspectRatio: request?.aspectRatio,
    videoResolution: request?.videoResolution,
    generateAudio: request?.generateAudio,
    cinematicPresetFamily: request?.cinematicPresetFamily,
    cinematicReferenceMode: request?.cinematicReferenceMode,
    cinematicPipelineVersion: request?.cinematicPipelineVersion,
    cinematicV2AnimaticMode: request?.cinematicV2AnimaticMode,
    debugCinematicStoryboardStyleSafeMode: request?.debugCinematicStoryboardStyleSafeMode,
    cinematicStoryboardStyleOverride: request?.cinematicStoryboardStyleOverride,
    debugSkipVideoGeneration: request?.debugSkipVideoGeneration,
    snapshot: buildOutputWorkflowSnapshot(snapshot),
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'plan-output-workflow',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return outputWorkflowPlanResponseSchema.parse(response.data)
}

export async function startOutputWorkflow(
  snapshot: ProjectSnapshot,
  plan: OutputWorkflowPlanResponse['plan'],
): Promise<OutputWorkflowStartResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before creating an output workflow.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Output workflow creation requires a live Supabase-backed draft.')
  }
  const payload = outputWorkflowStartRequestSchema.parse({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
    plan,
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'start-output-workflow',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputWorkflowStartResponseSchema.parse(response.data)
  await clearProjectCache(snapshot.project.id, snapshot.draft.id)
  return parsed
}

export async function startOutputWorkflowRun(
  snapshot: ProjectSnapshot,
  request: {
    workflowId: string
    prompt?: string
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    pageCount?: number
    input?: Record<string, unknown>
    metadata?: Record<string, unknown>
    cinematicVideoApproved?: boolean
    cinematicVideoProductionEstimate?: Record<string, unknown> | null
  },
): Promise<OutputWorkflowRunStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before running an output workflow.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Output workflow runs require a live Supabase-backed draft.')
  }
  const input = {
    ...buildOutputWorkflowRunInput(snapshot, request),
    ...(request.input ?? {}),
  }
  const payload = outputWorkflowRunStartRequestSchema.parse({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
    workflowId: request.workflowId,
    prompt: request.prompt ?? '',
    targetFormat: request.targetFormat ?? 'pdf',
    input,
    metadata: request.metadata ?? {},
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'start-output-workflow-run',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputWorkflowRunStatusResponseSchema.parse(response.data)
  await clearProjectCache(snapshot.project.id, snapshot.draft.id)
  return parsed
}

export async function previewOutputCinematicDirectorNote(
  snapshot: ProjectSnapshot,
  request: Omit<CinematicDirectorNotePreviewRequest, 'projectId' | 'draftId'>,
): Promise<CinematicDirectorNotePreviewResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before directing a cinematic timeline.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Cinematic director notes require a live Supabase-backed draft.')
  }
  const requestRecord = request as Record<string, unknown>
  const runId = typeof requestRecord.runId === 'string' ? requestRecord.runId : null
  const workflowId = typeof requestRecord.workflowId === 'string' && requestRecord.workflowId.trim()
    ? requestRecord.workflowId.trim()
    : runId
      ? snapshot.outputWorkflowRuns.find((run) => run.id === runId)?.workflowId
      : undefined
  const payload = cinematicDirectorNotePreviewRequestSchema.parse({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
    ...request,
    workflowId,
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'preview-output-cinematic-director-note',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return cinematicDirectorNotePreviewResponseSchema.parse(response.data)
}

export async function applyOutputCinematicDirectorPatch(
  snapshot: ProjectSnapshot,
  request: Omit<CinematicDirectorPatchApplyRequest, 'projectId' | 'draftId'>,
): Promise<CinematicDirectorPatchApplyResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before applying cinematic director notes.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Cinematic director notes require a live Supabase-backed draft.')
  }
  const requestRecord = request as Record<string, unknown>
  if (!requestRecord.preview || typeof requestRecord.preview !== 'object') {
    throw new Error('Preview the director note before applying it.')
  }
  const runId = typeof requestRecord.runId === 'string' ? requestRecord.runId : null
  const workflowId = typeof requestRecord.workflowId === 'string' && requestRecord.workflowId.trim()
    ? requestRecord.workflowId.trim()
    : runId
      ? snapshot.outputWorkflowRuns.find((run) => run.id === runId)?.workflowId
      : undefined
  const payload = cinematicDirectorPatchApplyRequestSchema.parse({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
    ...request,
    workflowId,
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'apply-output-cinematic-director-patch',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = cinematicDirectorPatchApplyResponseSchema.parse(response.data)
  await clearProjectCache(snapshot.project.id, snapshot.draft.id)
  return parsed
}

export async function getOutputWorkflowStatus(runId: string): Promise<OutputWorkflowRunStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading an output workflow.')
  const payload = outputWorkflowRunStatusRequestSchema.parse({ runId })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'get-output-workflow-status',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputWorkflowRunStatusResponseSchema.parse(response.data)
  if (parsed.terminal) {
    await clearProjectCache(parsed.run.projectId, parsed.run.draftId)
  }
  return parsed
}

export type OutputInboxLoadResult = {
  unchanged?: boolean
  feedRevision: string
  requests: OutputRequest[]
  workflows: OutputWorkflow[]
  runs: OutputWorkflowRun[]
  artifacts: OutputArtifact[]
  assets: AssetDefinition[]
  projections?: OutputFeedResponse['projections']
  page: {
    limit: number
    hasMore: boolean
    nextCursor: string | null
  }
}

export type OutputWorkflowGraphLoadResult = {
  unchanged?: boolean
  workflow: OutputWorkflow | null
  nodes: OutputWorkflowNode[]
  edges: OutputWorkflowEdge[]
  run: OutputWorkflowRun | null
  artifacts: OutputArtifact[]
  assets: AssetDefinition[]
  graphRevision: string
}

export async function loadOutputInbox(input: {
  projectId: string
  draftId: string
  limit?: number
  cursor?: string | null
  force?: boolean
  knownAssetKeys?: string[]
}): Promise<OutputInboxLoadResult> {
  const limit = Math.max(1, Math.min(100, input.limit ?? 30))
  const cacheKey = `${input.projectId}:${input.draftId}:${input.cursor ?? 'first'}:${limit}`
  const cached = outputFeedSessionCache.get(cacheKey)
  const now = Date.now()
  if (!input.force && cached && cached.expiresAt > now) {
    return cached.result
  }
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading output requests.')
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'get-output-feed',
    {
      projectId: input.projectId,
      draftId: input.draftId,
      limit,
      cursor: input.cursor ?? null,
      knownFeedRevision: cached?.revision ?? null,
      knownAssetKeys: cached ? input.knownAssetKeys ?? [] : [],
    },
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputFeedResponseSchema.parse(response.data)
  const ttl = typeof document !== 'undefined' && document.hidden ? SESSION_OUTPUT_FEED_INACTIVE_TTL_MS : SESSION_OUTPUT_FEED_ACTIVE_TTL_MS
  if (parsed.unchanged && cached) {
    const result = {
      ...cached.result,
      unchanged: true,
      feedRevision: parsed.feedRevision || cached.revision,
    }
    outputFeedSessionCache.set(cacheKey, {
      revision: result.feedRevision,
      result,
      expiresAt: Date.now() + ttl,
    })
    return result
  }
  const freshAssets = parsed.assets.flatMap((asset) => {
    const parsedAsset = assetDefinitionSchema.safeParse(asset)
    if (parsedAsset.success) return [parsedAsset.data]
    console.warn('[GraphCore] ignored invalid output feed asset payload.', parsedAsset.error.flatten())
    return []
  })
  const freshAssetKeys = new Set(freshAssets.map((asset) => asset.key))
  const reusableCachedAssets = cached?.result.assets.filter((asset) => !freshAssetKeys.has(asset.key)) ?? []
  const assets = [...freshAssets, ...reusableCachedAssets]
  const artifacts = hydrateOutputArtifactsFromAssets(parsed.artifacts, assets)
  const artifactsByRunId = new Map<string, OutputArtifact[]>()
  for (const artifact of artifacts) {
    if (!artifact.runId) continue
    artifactsByRunId.set(artifact.runId, [...(artifactsByRunId.get(artifact.runId) ?? []), artifact])
  }
  const runs = parsed.runs.map((run) => ({
    ...run,
    artifacts: hydrateOutputArtifactsFromAssets(artifactsByRunId.get(run.id) ?? run.artifacts, assets),
  }))
  const result: OutputInboxLoadResult = {
    unchanged: parsed.unchanged,
    feedRevision: parsed.feedRevision,
    requests: parsed.requests,
    workflows: parsed.workflows,
    runs,
    artifacts,
    assets,
    projections: parsed.projections,
    page: parsed.page,
  }
  outputFeedSessionCache.set(cacheKey, {
    revision: result.feedRevision,
    result,
    expiresAt: Date.now() + ttl,
  })
  return result
}

export async function loadOutputWorkflowGraph(input: {
  projectId: string
  draftId: string
  workflowId: string
  runId?: string | null
  selectedNodeKey?: string | null
  includeSelectedNodeOutput?: boolean
  knownGraphRevision?: string | null
}): Promise<OutputWorkflowGraphLoadResult> {
  const graphCacheKey = `${input.projectId}:${input.draftId}:${input.workflowId}:${input.runId ?? 'latest'}`
  const cachedRevision = outputGraphRevisionSessionCache.get(graphCacheKey)
  const selectedNodeRequested = Boolean(input.selectedNodeKey && input.includeSelectedNodeOutput === true)
  const selectedCacheKey = selectedNodeRequested
    ? `${graphCacheKey}:${input.selectedNodeKey}:${cachedRevision?.revision ?? input.knownGraphRevision ?? 'unknown'}`
    : null
  const cachedSelectedOutput = selectedCacheKey ? selectedGraphNodeOutputSessionCache.get(selectedCacheKey) : null
  if (cachedSelectedOutput && cachedSelectedOutput.expiresAt > Date.now()) {
    return cachedSelectedOutput.result
  }
  if (!selectedNodeRequested && cachedRevision && cachedRevision.expiresAt > Date.now()) {
    return {
      unchanged: true,
      workflow: null,
      nodes: [],
      edges: [],
      run: null,
      artifacts: [],
      assets: [],
      graphRevision: cachedRevision.revision,
    }
  }
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading an output workflow graph.')
  const payload = outputWorkflowGraphRequestSchema.parse({
    projectId: input.projectId,
    draftId: input.draftId,
    workflowId: input.workflowId,
    runId: input.runId ?? null,
    selectedNodeKey: input.selectedNodeKey ?? null,
    includeSelectedNodeOutput: input.includeSelectedNodeOutput === true,
    knownGraphRevision: input.knownGraphRevision ?? cachedRevision?.revision ?? null,
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'get-output-workflow-graph',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputWorkflowGraphResponseSchema.parse(response.data)
  if (parsed.unchanged) {
    outputGraphRevisionSessionCache.set(graphCacheKey, {
      revision: parsed.graphRevision,
      expiresAt: Date.now() + SESSION_GRAPH_REVISION_TTL_MS,
    })
    return {
      unchanged: true,
      workflow: null,
      nodes: [],
      edges: [],
      run: null,
      artifacts: [],
      assets: [],
      graphRevision: parsed.graphRevision,
    }
  }
  const selectedNodeOutput = parsed.selectedNodeOutput
  const nodes = selectedNodeOutput
    ? parsed.nodes.map((node) => node.key === selectedNodeOutput.nodeKey
      ? { ...node, outputs: selectedNodeOutput.outputs }
      : node)
    : parsed.nodes
  const assets = parsed.assets.flatMap((asset) => {
    const parsedAsset = assetDefinitionSchema.safeParse(asset)
    if (parsedAsset.success) return [parsedAsset.data]
    console.warn('[GraphCore] ignored invalid output workflow graph asset payload.', parsedAsset.error.flatten())
    return []
  })

  const result = {
    unchanged: parsed.unchanged,
    workflow: parsed.workflow,
    nodes,
    edges: parsed.edges,
    run: parsed.run,
    artifacts: parsed.artifacts,
    assets,
    graphRevision: parsed.graphRevision,
  }
  outputGraphRevisionSessionCache.set(graphCacheKey, {
    revision: result.graphRevision,
    expiresAt: Date.now() + SESSION_GRAPH_REVISION_TTL_MS,
  })
  if (selectedCacheKey && input.selectedNodeKey) {
    selectedGraphNodeOutputSessionCache.set(`${graphCacheKey}:${input.selectedNodeKey}:${result.graphRevision}`, {
      result,
      expiresAt: Date.now() + SESSION_GRAPH_REVISION_TTL_MS,
    })
  }
  return result
}

export async function cancelOutputWorkflowRun(runId: string): Promise<OutputWorkflowCancelResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before cancelling an output workflow.')
  const payload = outputWorkflowRunStatusRequestSchema.parse({ runId })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'cancel-output-workflow-run',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputWorkflowCancelResponseSchema.parse(response.data)
  if (parsed.run) {
    await clearProjectCache(parsed.run.projectId, parsed.run.draftId)
  }
  return parsed
}

export async function startOutputRequest(
  snapshot: ProjectSnapshot,
  request: {
    prompt: string
    sourceSurface?: string
    selectedEntityKeys?: string[]
    selectedSequenceUnitKeys?: string[]
    targetFormat?: 'pdf' | 'epub' | 'docx' | 'markdown' | 'image' | 'video'
    imageQuality?: 'low' | 'medium' | 'high'
    imageOutputFormat?: 'png' | 'jpeg' | 'webp'
    pageCount?: number
    videoBlockCount?: number
    durationPerBlockSeconds?: number
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9'
    videoResolution?: '480p' | '720p' | '1080p'
    generateAudio?: boolean
    cinematicPresetFamily?: 'story_movie_tv' | 'ugc_creator' | 'ugc_direct_response_ad' | 'ugc_faceless_format'
    cinematicReferenceMode?: 'keyframes' | 'storyboard_sheet' | 'keyframes_and_storyboard' | 'shot_reference_sheet'
    cinematicPipelineVersion?: 'v1_take_blocks' | 'v2_shot_orchestration'
    cinematicV2AnimaticMode?: 'fast_panels' | 'quality_keyframes'
    debugCinematicStoryboardStyleSafeMode?: boolean
    cinematicStoryboardStyleOverride?: string
    debugSkipVideoGeneration?: boolean
  },
): Promise<OutputRequestStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before creating an output request.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Output requests require a live Supabase-backed draft.')
  }
  const payload = outputRequestStartRequestSchema.parse({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
    prompt: request.prompt,
    sourceSurface: request.sourceSurface ?? 'outputs',
    selectedEntityKeys: request.selectedEntityKeys ?? [],
    selectedSequenceUnitKeys: request.selectedSequenceUnitKeys ?? [],
    targetFormat: request.targetFormat ?? 'pdf',
    imageQuality: request.imageQuality,
    imageOutputFormat: request.imageOutputFormat,
    pageCount: request.pageCount,
    videoBlockCount: request.videoBlockCount,
    durationPerBlockSeconds: request.durationPerBlockSeconds,
    aspectRatio: request.aspectRatio,
    videoResolution: request.videoResolution,
    generateAudio: request.generateAudio,
    cinematicPresetFamily: request.cinematicPresetFamily,
    cinematicReferenceMode: request.cinematicReferenceMode ?? aiGenerationSettings.outputWorkflow.cinematicReferenceModeDefault,
    cinematicPipelineVersion: request.cinematicPipelineVersion,
    cinematicV2AnimaticMode: request.cinematicV2AnimaticMode ?? 'fast_panels',
    debugCinematicStoryboardStyleSafeMode: request.debugCinematicStoryboardStyleSafeMode ?? aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStyleSafeModeDefault,
    cinematicStoryboardStyleOverride: request.cinematicStoryboardStyleOverride ?? aiGenerationSettings.outputWorkflow.debugCinematicStoryboardStylePrompt,
    debugSkipVideoGeneration: request.debugSkipVideoGeneration ?? aiGenerationSettings.outputWorkflow.debugSkipVideoGenerationDefault,
    snapshot: buildOutputWorkflowSnapshot(snapshot),
    runInput: buildOutputWorkflowRunInput(snapshot, request),
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'start-output-request',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputRequestStatusResponseSchema.parse(response.data)
  await clearProjectCache(snapshot.project.id, snapshot.draft.id)
  return parsed
}

export async function getOutputRequestStatus(requestId: string): Promise<OutputRequestStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading an output request.')
  const payload = outputRequestStatusRequestSchema.parse({ requestId })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'get-output-request-status',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputRequestStatusResponseSchema.parse(response.data)
  if (parsed.terminal) {
    await clearProjectCache(parsed.request.projectId, parsed.request.draftId)
  }
  return parsed
}

export async function cancelOutputRequest(requestId: string): Promise<OutputRequestStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before cancelling an output request.')
  const payload = outputRequestStatusRequestSchema.parse({ requestId })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'cancel-output-request',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputRequestStatusResponseSchema.parse(response.data)
  await clearProjectCache(parsed.request.projectId, parsed.request.draftId)
  return parsed
}

export async function deleteOutputRequest(requestId: string): Promise<OutputRequestDeleteResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before deleting an output request.')
  const payload = outputRequestStatusRequestSchema.parse({ requestId })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'delete-output-request',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputRequestDeleteResponseSchema.parse(response.data)
  await clearProjectCache(parsed.projectId, parsed.draftId)
  return parsed
}

export async function repairOutputWorkflowState(
  snapshot: ProjectSnapshot,
  request: Omit<OutputWorkflowRepairRequest, 'projectId' | 'draftId'>,
): Promise<OutputWorkflowRepairResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before repairing output workflow state.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Output workflow repair requires a live Supabase-backed draft.')
  }
  const payload = outputWorkflowRepairRequestSchema.parse({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
    ...request,
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'repair-output-workflow-state',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputWorkflowRepairResponseSchema.parse(response.data)
  if (parsed.applied) {
    await clearProjectCache(parsed.projectId, parsed.draftId)
  }
  return parsed
}

export async function updateOutputWorkflowNode(
  snapshot: ProjectSnapshot,
  request: {
    workflowId: string
    nodeKey: string
    position?: { x: number; y: number }
    inputs?: { prompt?: string }
    metadata?: { displayLabel?: string; note?: string }
  },
): Promise<OutputWorkflowNodeUpdateResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before editing an output workflow.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Output workflow editing requires a live Supabase-backed draft.')
  }
  const payload = outputWorkflowNodeUpdateRequestSchema.parse({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
    ...request,
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'update-output-workflow-node',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputWorkflowNodeUpdateResponseSchema.parse(response.data)
  await clearProjectCache(snapshot.project.id, snapshot.draft.id)
  return parsed
}

export async function upgradeOutputWorkflowPreset(
  snapshot: ProjectSnapshot,
  request: {
    workflowId: string
    preset?: 'ebook_from_world'
  },
): Promise<OutputWorkflowUpgradeResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before upgrading an output workflow.')
  if (!hasLiveSnapshotIds(snapshot)) {
    throw new Error('Output workflow upgrades require a live Supabase-backed draft.')
  }
  const payload = outputWorkflowUpgradeRequestSchema.parse({
    projectId: snapshot.project.id,
    draftId: snapshot.draft.id,
    workflowId: request.workflowId,
    preset: request.preset ?? 'ebook_from_world',
  })
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'upgrade-output-workflow-preset',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  const parsed = outputWorkflowUpgradeResponseSchema.parse(response.data)
  await clearProjectCache(snapshot.project.id, snapshot.draft.id)
  return parsed
}

export async function getOutputArtifact(request: { artifactId?: string; artifactKey?: string }) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading an output artifact.')
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'get-output-artifact',
    request,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return outputArtifactResponseSchema.parse(response.data)
}

export async function extractSourceUrlForWorldPrompt(url: string): Promise<WorldPromptSourceContext> {
  const session = await getValidatedSession('Sign in before importing a URL for world generation.')
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'extract-source-url',
    { url },
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return buildUrlSourceContextFromExtractionResponse(response.data as Record<string, unknown>, url)
}

export async function createWorldPromptSession(snapshot: ProjectSnapshot, request: Omit<WorldPromptCreateSessionRequest, 'snapshot'>) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before creating a world prompt session.')
  const payload = {
    ...request,
    snapshot: buildWorldPromptSnapshot(snapshot),
  }
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'create-world-prompt-session',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptCreateSessionResponseSchema.parse(response.data)
}

export async function dismissWorldPromptSuggestion(request: WorldPromptDismissSuggestionRequest) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before dismissing a world prompt suggestion.')
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'dismiss-world-prompt-suggestion',
    request,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptDismissSuggestionResponseSchema.parse(response.data)
}

export async function refreshWorldPromptSuggestions(snapshot: ProjectSnapshot, request: Omit<WorldPromptRefreshSuggestionsRequest, 'snapshot'>) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before refreshing world prompt suggestions.')
  const payload = {
    ...request,
    snapshot: buildWorldPromptSnapshot(snapshot),
  }
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'refresh-world-prompt-suggestions',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptRefreshSuggestionsResponseSchema.parse(response.data) as WorldPromptRefreshSuggestionsResponse
}

export async function approveWorldPromptOp(snapshot: ProjectSnapshot, request: Omit<WorldPromptResolveOpRequest, 'snapshot'>) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before approving a world prompt op.')
  const payload = {
    ...request,
    snapshot: buildWorldPromptSnapshot(snapshot),
  }
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'approve-world-prompt-op',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptResolveOpResponseSchema.parse(response.data)
}

export async function rejectWorldPromptOp(snapshot: ProjectSnapshot, request: Omit<WorldPromptResolveOpRequest, 'snapshot'>) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before rejecting a world prompt op.')
  const payload = {
    ...request,
    snapshot: buildWorldPromptSnapshot(snapshot),
  }
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'reject-world-prompt-op',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptResolveOpResponseSchema.parse(response.data)
}

export async function applyWorldPromptPreview(snapshot: ProjectSnapshot, request: Omit<WorldPromptApplyPreviewRequest, 'snapshot'>) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before applying a world prompt preview.')
  const payload = {
    ...request,
    snapshot: buildWorldPromptSnapshot(snapshot),
  }
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'apply-world-prompt-preview',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptApplyPreviewResponseSchema.parse(response.data)
}

export async function cancelWorldPromptTurn(snapshot: ProjectSnapshot, request: Omit<WorldPromptCancelTurnRequest, 'snapshot'>) {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before cancelling a world prompt turn.')
  const payload = {
    ...request,
    snapshot: buildWorldPromptSnapshot(snapshot),
  }
  const response = await invokeAuthedFunctionWithSessionRecovery(
    'cancel-world-prompt-turn',
    payload,
    session,
  )
  if (response.error) {
    throw new Error(await readFunctionsErrorMessage(response.error))
  }
  return worldPromptCancelTurnResponseSchema.parse(response.data)
}

export function subscribeWorldPromptEvents(input: {
  draftId: string
  onSession?: (session: WorldPromptSession) => void
  onTurn?: (turn: WorldPromptTurn) => void
  onMessage?: (message: WorldPromptMessage) => void
  onEvent?: (event: WorldPromptEvent) => void
  onGenerationJob?: (job: WorldPromptGenerationJob) => void
  onGenerationJobStep?: (step: WorldPromptGenerationJobStep) => void
  onSuggestion?: (suggestion: WorldPromptSuggestionRecord) => void
  onThread?: (thread: WorldThread) => void
  onVisualGenerationJob?: (job: VisualGenerationJob) => void
}) {
  const channel = supabase
    .channel(`graphcore-world-prompt-${input.draftId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'world_prompt_sessions',
      filter: `draft_id=eq.${input.draftId}`,
    }, (payload) => {
      if (!payload.new || typeof payload.new !== 'object') return
      input.onSession?.(mapWorldPromptSessionRow(payload.new as WorldPromptSessionRow))
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'world_prompt_turns',
      filter: `draft_id=eq.${input.draftId}`,
    }, (payload) => {
      if (!payload.new || typeof payload.new !== 'object') return
      input.onTurn?.(mapWorldPromptTurnRow(payload.new as WorldPromptTurnRow))
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'world_prompt_messages',
      filter: `draft_id=eq.${input.draftId}`,
    }, (payload) => {
      if (!payload.new || typeof payload.new !== 'object') return
      input.onMessage?.(mapWorldPromptMessageRow(payload.new as WorldPromptMessageRow))
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'world_prompt_events',
      filter: `draft_id=eq.${input.draftId}`,
    }, (payload) => {
      if (!payload.new || typeof payload.new !== 'object') return
      input.onEvent?.(mapWorldPromptEventRow(payload.new as WorldPromptEventRow))
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'world_prompt_generation_jobs',
      filter: `draft_id=eq.${input.draftId}`,
    }, (payload) => {
      if (!payload.new || typeof payload.new !== 'object') return
      input.onGenerationJob?.(mapWorldPromptGenerationJobRow(payload.new as WorldPromptGenerationJobRow))
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'world_prompt_generation_job_steps',
      filter: `draft_id=eq.${input.draftId}`,
    }, (payload) => {
      if (!payload.new || typeof payload.new !== 'object') return
      input.onGenerationJobStep?.(mapWorldPromptGenerationJobStepRow(payload.new as WorldPromptGenerationJobStepRow))
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'world_prompt_suggestions',
      filter: `draft_id=eq.${input.draftId}`,
    }, (payload) => {
      if (!payload.new || typeof payload.new !== 'object') return
      const nextSuggestion = mapWorldPromptSuggestionRow(payload.new as WorldPromptSuggestionRow)
      if (nextSuggestion) {
        input.onSuggestion?.(nextSuggestion)
      }
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'world_threads',
      filter: `draft_id=eq.${input.draftId}`,
    }, (payload) => {
      if (!payload.new || typeof payload.new !== 'object') return
      input.onThread?.(mapWorldThreadRow(payload.new as WorldThreadRow))
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'visual_generation_jobs',
      filter: `draft_id=eq.${input.draftId}`,
    }, (payload) => {
      if (!payload.new || typeof payload.new !== 'object') return
      input.onVisualGenerationJob?.(mapVisualGenerationJobRow(payload.new as Record<string, unknown>))
    })

  void channel.subscribe()
  return {
    unsubscribe: () => supabase.removeChannel(channel),
  }
}

export function subscribeCinematicRunSignals(input: {
  runIds: string[]
  onSignal: (runId: string) => void
}) {
  const channels = Array.from(new Set(input.runIds.map((runId) => runId.trim()).filter(Boolean))).flatMap((runId) => {
    const runChannel = supabase
      .channel(`graphcore-cinematic-run-${runId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cinematic_runs',
        filter: `id=eq.${runId}`,
      }, () => {
        input.onSignal(runId)
      })
      .subscribe()

    const jobChannel = supabase
      .channel(`graphcore-cinematic-run-jobs-${runId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cinematic_run_jobs',
        filter: `run_id=eq.${runId}`,
      }, () => {
        input.onSignal(runId)
      })
      .subscribe()

    return [runChannel, jobChannel]
  })

  return {
    unsubscribe: async () => {
      await Promise.all(channels.map((channel) => supabase.removeChannel(channel)))
    },
  }
}

export function subscribeOutputSignals(input: {
  draftId: string
  onSignal: () => void
}) {
  const channel = supabase
    .channel(`graphcore-output-inbox-${input.draftId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'output_requests',
      filter: `draft_id=eq.${input.draftId}`,
    }, () => input.onSignal())
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'output_request_status_projections',
      filter: `draft_id=eq.${input.draftId}`,
    }, () => input.onSignal())

  void channel.subscribe()
  return {
    unsubscribe: () => supabase.removeChannel(channel),
  }
}

export function subscribeOutputWorkflowGraphSignals(input: {
  draftId: string
  workflowId: string
  runId?: string | null
  onSignal: () => void
}) {
  const channel = supabase
    .channel(`graphcore-output-graph-${input.workflowId}-${input.runId ?? 'latest'}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'output_workflow_nodes',
      filter: `workflow_id=eq.${input.workflowId}`,
    }, () => input.onSignal())
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'output_workflow_edges',
      filter: `workflow_id=eq.${input.workflowId}`,
    }, () => input.onSignal())
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'output_artifacts',
      filter: `workflow_id=eq.${input.workflowId}`,
    }, () => input.onSignal())

  if (input.runId) {
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'output_workflow_run_steps',
      filter: `run_id=eq.${input.runId}`,
    }, () => input.onSignal())
  } else {
    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'output_workflow_runs',
      filter: `draft_id=eq.${input.draftId}`,
    }, () => input.onSignal())
  }

  void channel.subscribe()
  return {
    unsubscribe: () => supabase.removeChannel(channel),
  }
}

export async function compileSnapshot(snapshot: ProjectSnapshot) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session && isLiveSnapshot(snapshot)) {
    const releaseVersion = `draft-${snapshot.draft.version}-${Date.now()}`
    const response = await supabase.functions.invoke('publish-release', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        snapshot,
        label: `${snapshot.project.name} draft preview`,
        version: releaseVersion,
      },
    })

    if (!response.error && response.data?.bundle) {
      return response.data.bundle
    }
  }

  return compileBundle(snapshot)
}

async function getDefinitionIds(draftId: string): Promise<string[]> {
  const response = await supabase
    .from('project_definitions')
    .select('id')
    .eq('draft_id', draftId)

  return (response.data ?? []).map((row) => row.id)
}

async function getArchetypeIds(draftId: string): Promise<string[]> {
  const response = await supabase
    .from('project_archetypes')
    .select('id')
    .eq('draft_id', draftId)

  return (response.data ?? []).map((row) => row.id)
}
