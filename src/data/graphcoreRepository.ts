import { compileBundle } from '../domain/compiler'
import { BASELINE_ARCHETYPES, hasMissingBaselineArchetypes } from '../domain/bootstrapSeeds'
import { demoProjectSnapshot } from '../domain/demo-data'
import { environmentBlueprintV1Schema } from '../domain/environmentBlueprint'
import { createGameSpecFromArchetype } from '../domain/gameArchetypes'
import {
  type AssemblyNodeDefinition,
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
  worldBuildPlanResponseSchema,
  worldBuildDeletePlaceholderResponseSchema,
  worldBuildStatusResponseSchema,
  type WorldBuildPlanRequest,
  type WorldBuildPlanResponse,
  type WorldBuildDeletePlaceholderRequest,
  type WorldBuildDeletePlaceholderResponse,
  type WorldBuildStartRequest,
  type WorldBuildStatusResponse,
} from '../domain/worldBuild'
import type { GameSummary } from '../shared/workspace'
import { supabase } from '../utils/supabase'
import type { FunctionsHttpError, Session } from '@supabase/supabase-js'

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isLiveSnapshot(snapshot: ProjectSnapshot) {
  return isUuidLike(snapshot.workspace.id) && isUuidLike(snapshot.project.id) && isUuidLike(snapshot.draft.id)
}

function hasLiveSnapshotIds(snapshot: { workspace: { id: string }; project: { id: string }; draft: { id: string } }) {
  return isUuidLike(snapshot.workspace.id) && isUuidLike(snapshot.project.id) && isUuidLike(snapshot.draft.id)
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
    console.error('[GraphCore] edge function error payload', payload)
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
      console.error('[GraphCore] edge function error text', text)
      return text || error.message
    } catch {
      return error.message
    }
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

type SnapshotLoadResult = {
  snapshot: ProjectSnapshot
  source: 'supabase' | 'demo'
  reason?: string
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

function localPatchDiagnostics(fallbackReason: string | null) {
  return [
    'Fallback patch generated locally because the prompt backend was unavailable.',
    fallbackReason ? `Reason: ${fallbackReason}` : 'Reason: unknown prompt backend failure.',
  ]
}

async function getPrimaryWorkspace(session: Session) {
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

  return {
    workspace,
    role: row.role,
  }
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
  }
}

async function invokeAuthedFunction<TResponse>(
  functionName: string,
  body: Record<string, unknown>,
  session: Session,
) {
  const functionsClient = supabase.functions
  functionsClient.setAuth(session.access_token)
  return functionsClient.invoke<TResponse>(functionName, { body })
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
  let response = await invokeAuthedFunction<TResponse>(functionName, body, session)

  if (response.error && isUnauthorizedFunctionsError(response.error)) {
    const refreshed = await supabase.auth.refreshSession()
    if (refreshed.error) {
      throw refreshed.error
    }

    if (!refreshed.data.session) {
      throw new Error('No authenticated Supabase session was available after refresh.')
    }

    response = await invokeAuthedFunction<TResponse>(functionName, body, refreshed.data.session)
  }

  if (!response.error) {
    return response
  }

  console.error(`[GraphCore] ${functionName} SDK invocation failed.`, {
    message: response.error.message,
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
  key: string
  name: string
  kind: AssetDefinition['kind']
  mime_type: string
  storage_path: string
  metadata: Record<string, unknown> | null
  llm_hints: Record<string, unknown> | null
}

type WorldBuildBatchRow = {
  id: string
  draft_id: string
  project_id: string
  prompt: string
  request_summary: string
  status: string
  diagnostics: string[] | null
  plan_json: unknown[] | null
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
  status: string
  provider_status: string | null
  provider_logs: unknown
  error_message: string | null
  storage_path: string | null
  created_at: string
  updated_at: string
}

type SignProjectAssetUrlsRequest = {
  projectId: string
  assetKeys: string[]
}

type SignProjectAssetUrlsResponse = {
  urls: Array<{
    assetKey: string
    signedUrl: string
  }>
}

const meshBlobUrlCache = new Map<string, { storagePath: string; url: string }>()

async function hydrateStorageMeshAssetUrls<TAsset extends AssetDefinition>(projectId: string, assets: TAsset[]) {
  const signedUrls = new Map<string, string>()
  const candidates = assets.filter((asset) => {
    if (asset.kind !== 'mesh') return false
    if (typeof asset.metadata.sourceUrl === 'string' && asset.metadata.sourceUrl.trim()) return false
    if (typeof asset.metadata.previewUrl === 'string' && asset.metadata.previewUrl.trim()) return false
    if (typeof asset.metadata.storageBucket !== 'string' || !asset.metadata.storageBucket.trim()) return false
    if (!asset.storagePath || asset.storagePath.startsWith('external/') || asset.storagePath.startsWith('local-upload/')) return false
    const generation = getResourceGenerationMetadata(asset)
    if (generation?.state === 'pending' || generation?.state === 'running') return false
    return true
  })

  if (candidates.length === 0) return assets

  try {
    const session = await getValidatedSession('Sign in and load a live GraphCore draft before loading generated meshes.')
    const response = await invokeAuthedFunctionWithSessionRecovery<SignProjectAssetUrlsResponse>(
      'sign-project-asset-urls',
      {
        projectId,
        assetKeys: candidates.map((asset) => asset.key),
      } satisfies SignProjectAssetUrlsRequest,
      session,
    )
    if (!response.error && response.data?.urls) {
      for (const entry of response.data.urls) {
        if (typeof entry.assetKey === 'string' && typeof entry.signedUrl === 'string' && entry.signedUrl.trim()) {
          signedUrls.set(entry.assetKey, entry.signedUrl)
        }
      }
    }
  } catch (error) {
    console.error('[GraphCore] mesh asset signing failed during hydration.', error)
  }

  const unresolvedCandidates = candidates.filter((asset) => !signedUrls.has(asset.key))
  await Promise.all(unresolvedCandidates.map(async (asset) => {
    const cached = meshBlobUrlCache.get(asset.key)
    if (cached && cached.storagePath === asset.storagePath) {
      signedUrls.set(asset.key, cached.url)
      return
    }

    const bucket = typeof asset.metadata.storageBucket === 'string' && asset.metadata.storageBucket.trim()
      ? asset.metadata.storageBucket.trim()
      : 'project-assets'
    const downloadResponse = await supabase.storage.from(bucket).download(asset.storagePath)
    if (downloadResponse.error || !downloadResponse.data) {
      console.error('[GraphCore] mesh asset download fallback failed.', {
        assetKey: asset.key,
        bucket,
        storagePath: asset.storagePath,
        message: downloadResponse.error?.message ?? 'unknown download error',
      })
      return
    }

    const nextUrl = URL.createObjectURL(downloadResponse.data)
    if (cached?.url) {
      URL.revokeObjectURL(cached.url)
    }
    meshBlobUrlCache.set(asset.key, { storagePath: asset.storagePath, url: nextUrl })
    signedUrls.set(asset.key, nextUrl)
  }))

  if (signedUrls.size === 0) return assets

  return assets.map((asset) => (
    signedUrls.has(asset.key)
      ? {
          ...asset,
          metadata: {
            ...asset.metadata,
            sourceUrl: signedUrls.get(asset.key),
          },
        }
      : asset
  ))
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
): Promise<SnapshotLoadResult> {
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

  const definitionIds = await getDefinitionIds(draft.id)
  const archetypeIds = await getArchetypeIds(draft.id)

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
    worldBuildBatchesResponse,
    meshGenerationJobsResponse,
    patchSetsResponse,
    releasesResponse,
  ] = await Promise.all([
    supabase
      .from('project_definitions')
      .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: true }),
    definitionIds.length > 0
      ? supabase
          .from('project_definition_components')
          .select('definition_id, component_type, config')
          .in('definition_id', definitionIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('project_archetypes')
      .select('id, key, name, summary, definition_kind, icon_asset_key, metadata, llm_hints')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: true }),
    archetypeIds.length > 0
      ? supabase
          .from('project_archetype_fields')
          .select('id, draft_id, archetype_id, definition_id, key, label, field_type, description, required, default_value, constraints, sort_order')
          .eq('draft_id', draft.id)
          .not('archetype_id', 'is', null)
          .in('archetype_id', archetypeIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    definitionIds.length > 0
      ? supabase
          .from('project_archetype_fields')
          .select('id, draft_id, archetype_id, definition_id, key, label, field_type, description, required, default_value, constraints, sort_order')
          .eq('draft_id', draft.id)
          .not('definition_id', 'is', null)
          .in('definition_id', definitionIds)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    definitionIds.length > 0
      ? supabase
          .from('project_definition_field_values')
          .select('definition_id, field_key, value')
          .in('definition_id', definitionIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('draft_graphs')
      .select('id, key, name, graph_type, summary, entry_node_key, metadata, llm_hints')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('draft_graph_nodes')
      .select('id, graph_id, key, node_type, title, template_key, subtitle, position_x, position_y, body, condition_expr, effect_ops, ports, display, metadata'),
    supabase
      .from('draft_graph_edges')
      .select('id, graph_id, key, source_node_key, source_port, target_node_key, target_port, label, condition_expr, metadata'),
    supabase
      .from('draft_assembly_graphs')
      .select('id, key, name, summary, bound_environment_key, metadata')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('draft_assembly_nodes')
      .select('id, assembly_graph_id, key, kind, title, subtitle, position_x, position_y, ports, params, metadata'),
    supabase
      .from('draft_assembly_edges')
      .select('id, assembly_graph_id, key, source_node_key, source_port, target_node_key, target_port, metadata'),
    supabase
      .from('draft_environment_blueprints')
      .select('id, key, environment_key, name, document')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('project_assets')
      .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('world_build_batches')
      .select('id, draft_id, project_id, prompt, request_summary, status, diagnostics, plan_json, created_at, updated_at')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('mesh_generation_jobs')
      .select('id, project_id, draft_id, definition_key, source_image_asset_key, target_mesh_asset_key, provider, model, provider_request_id, status, provider_status, provider_logs, error_message, storage_path, created_at, updated_at')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('patch_sets')
      .select('id, summary, prompt, status, operations, diagnostics')
      .eq('draft_id', draft.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('releases')
      .select('id, version, label, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false }),
  ])

  const assemblySchemaMissing =
    assemblyGraphsResponse.status === 404
    || assemblyNodesResponse.status === 404
    || assemblyEdgesResponse.status === 404
    || isMissingRelationError(assemblyGraphsResponse.error, 'draft_assembly_graphs')
    || isMissingRelationError(assemblyNodesResponse.error, 'draft_assembly_nodes')
    || isMissingRelationError(assemblyEdgesResponse.error, 'draft_assembly_edges')
  const blueprintSchemaMissing =
    environmentBlueprintsResponse.status === 404
    || isMissingRelationError(environmentBlueprintsResponse.error, 'draft_environment_blueprints')
  const worldBuildSchemaMissing =
    worldBuildBatchesResponse.status === 404
    || isMissingRelationError(worldBuildBatchesResponse.error, 'world_build_batches')
  const meshGenerationSchemaMissing =
    meshGenerationJobsResponse.status === 404
    || isMissingRelationError(meshGenerationJobsResponse.error, 'mesh_generation_jobs')

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
  const worldBuildBatches = worldBuildSchemaMissing ? [] : (worldBuildBatchesResponse.data as WorldBuildBatchRow[] | null) ?? []
  const meshGenerationJobs = meshGenerationSchemaMissing ? [] : (meshGenerationJobsResponse.data as MeshGenerationJobRow[] | null) ?? []
  const worldBuildJobs =
    worldBuildSchemaMissing || worldBuildBatches.length === 0
      ? []
      : (
          await supabase
            .from('world_build_jobs')
            .select('id, batch_id, plan_item_id, kind, status, depends_on_job_ids, target_keys, prompt, options, result_context, error_message, order_index, created_at, updated_at')
            .in('batch_id', worldBuildBatches.map((batch) => batch.id))
            .order('order_index', { ascending: true })
        ).data as WorldBuildJobRow[] | null ?? []

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
      key: asset.key,
      name: asset.name,
      kind: asset.kind,
      mimeType: asset.mime_type,
      storagePath: asset.storage_path,
      metadata: asset.metadata ?? {},
      llmHints: asset.llm_hints ?? {},
    })),
    worldBuildBatches: worldBuildBatches.map((batch) => ({
      id: batch.id,
      projectId: batch.project_id,
      draftId: batch.draft_id,
      prompt: batch.prompt,
      requestSummary: batch.request_summary,
      status: batch.status,
      diagnostics: batch.diagnostics ?? [],
      planItems: batch.plan_json ?? [],
      createdAt: batch.created_at,
      updatedAt: batch.updated_at,
      jobs: worldBuildJobs
        .filter((job) => job.batch_id === batch.id)
        .map((job) => ({
          id: job.id,
          batchId: job.batch_id,
          planItemId: job.plan_item_id,
          kind: job.kind,
          status: job.status,
          dependsOnJobIds: job.depends_on_job_ids ?? [],
          targetKeys: job.target_keys ?? {},
          prompt: job.prompt ?? '',
          options: job.options ?? {},
          resultContext: job.result_context ?? null,
          errorMessage: job.error_message ?? null,
          orderIndex: job.order_index,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
        })),
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
    patchSets: patchSetsResponse.data ?? [],
    releases: (releasesResponse.data ?? []).map((release) => ({
      id: release.id,
      version: release.version,
      label: release.label,
      createdAt: release.created_at,
    })),
  })

  snapshot = {
    ...snapshot,
    assets: await hydrateStorageMeshAssetUrls(snapshot.project.id, snapshot.assets),
  }

  return {
    snapshot,
    source: 'supabase',
  }
}

export async function ensureLiveProjectSnapshot(): Promise<SnapshotLoadResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const initial = await loadProjectSnapshot()

  if (!session || initial.source === 'supabase' || !shouldBootstrapLiveProject(initial.reason)) {
    if (session && initial.source === 'supabase' && hasMissingBaselineArchetypes(initial.snapshot.archetypes)) {
      await seedBaselineArchetypesDirect(initial.snapshot.draft.id, session.user.id)
      return loadProjectSnapshot()
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

  return loadProjectSnapshot()
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

  return { projectId, draftId }
}

export async function listGames(): Promise<GameSummary[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return []

  const workspaceMembership = await getPrimaryWorkspace(session)
  if (!workspaceMembership) return []

  const { projects, draftsByProjectId } = await listWorkspaceProjectsAndDrafts(workspaceMembership.workspace.id)

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

export async function setActiveGame(projectId: string, draftId: string): Promise<SnapshotLoadResult> {
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
  return loadProjectSnapshot({ projectId, draftId })
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
  return loadProjectSnapshot()
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

  return loadProjectSnapshot()
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
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session || !isLiveSnapshot(snapshot)) {
    return { source: 'local' as const }
  }

  const response = await supabase.functions.invoke('apply-patch', {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: {
      draftId: snapshot.draft.id,
      patchSetId,
      operations,
    },
  })

  if (response.error) {
    throw new Error(response.error.message)
  }

  return {
    source: 'supabase' as const,
    data: response.data,
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
    assets: await hydrateStorageMeshAssetUrls(request.snapshot.project.id, parsed.assets as AssetDefinition[]),
  }
}

export async function pollMeshGeneration(request: MeshGenerationPollRequest): Promise<MeshGenerationStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before polling mesh generation.')

  if (!hasLiveSnapshotIds(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before polling mesh generation.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery<MeshGenerationStatusResponse>('poll-mesh-generation', request, session)
  if (response.error || !response.data) {
    throw new Error(response.error ? await readFunctionsErrorMessage(response.error) : 'Polling mesh generation returned no data.')
  }

  const parsed = meshGenerationStatusResponseSchema.parse(response.data)
  return {
    ...parsed,
    assets: await hydrateStorageMeshAssetUrls(request.snapshot.project.id, parsed.assets as AssetDefinition[]),
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
    assets: await hydrateStorageMeshAssetUrls(request.snapshot.project.id, parsed.assets as AssetDefinition[]),
  }
}

export async function pollWorldBuild(request: { batchId: string; snapshot: ProjectSnapshot; model: string }): Promise<WorldBuildStatusResponse> {
  const session = await getValidatedSession('Sign in and load a live GraphCore draft before polling a world build.')

  if (!isLiveSnapshot(request.snapshot)) {
    throw new Error('Sign in and load a live GraphCore draft before polling a world build.')
  }

  const response = await invokeAuthedFunctionWithSessionRecovery<WorldBuildStatusResponse>('poll-world-build', request, session)
  if (response.error || !response.data) {
    throw new Error(response.error ? await readFunctionsErrorMessage(response.error) : 'Polling world build returned no data.')
  }

  return worldBuildStatusResponseSchema.parse(response.data)
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
