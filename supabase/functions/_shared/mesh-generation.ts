import { z } from 'npm:zod@4'

import { requireUserClient } from './auth.ts'

type DatabaseClient = Awaited<ReturnType<typeof requireUserClient>>['client']

const activeMeshJobStatuses = ['queued', 'submitting', 'running'] as const
const defaultRender3dBindingConfig = {
  primaryMeshAssetKey: null,
  previewImageAssetKey: null,
  conceptPrompt: null,
  generationPrompt: null,
  generationStyle: null,
}

export const meshGenerationJobStatusSchema = z.enum([
  'queued',
  'submitting',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])

export const meshGenerationJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  definitionKey: z.string(),
  sourceImageAssetKey: z.string(),
  targetMeshAssetKey: z.string(),
  provider: z.string(),
  model: z.string(),
  providerRequestId: z.string().nullable().default(null),
  statusUrl: z.string().nullable().default(null),
  responseUrl: z.string().nullable().default(null),
  cancelUrl: z.string().nullable().default(null),
  status: meshGenerationJobStatusSchema,
  providerStatus: z.string().nullable().default(null),
  providerLogs: z.array(z.string()).default([]),
  errorMessage: z.string().nullable().default(null),
  storagePath: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const meshGenerationStatusResponseSchema = z.object({
  jobs: z.array(meshGenerationJobSchema).default([]),
  definitions: z.array(z.record(z.string(), z.unknown())).default([]),
  assets: z.array(z.record(z.string(), z.unknown())).default([]),
  deletedAssetKeys: z.array(z.string()).default([]),
})

export type MeshGenerationJob = z.infer<typeof meshGenerationJobSchema>

export type LoadedAsset = {
  id: string
  key: string
  name: string
  kind: string
  mimeType: string
  storagePath: string
  metadata: Record<string, unknown>
  llmHints: Record<string, unknown>
}

export type LoadedCharacterDefinition = {
  id: string
  key: string
  kind: string
  name: string
  summary: string
  status: string
  iconAssetKey: string | null
  archetypeKey: string | null
  tags: string[]
  schemaVersion: number
  metadata: Record<string, unknown>
  llmHints: Record<string, unknown>
  assetRefs: Array<Record<string, unknown>>
  definitionData: Record<string, unknown>
  fieldValues: Array<{ fieldKey: string; value: unknown }>
  customFields: Array<{
    id: string
    key: string
    label: string
    fieldType: string
    description: string
    required: boolean
    defaultValue: unknown
    constraints: Record<string, unknown>
    sortOrder: number
  }>
  components: Array<{ type: string; config: Record<string, unknown> }>
}

type MeshJobRow = {
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

type DefinitionRow = {
  id: string
  key: string
  kind: string
  name: string
  summary: string | null
  status: string
  icon_asset_key: string | null
  archetype_key: string | null
  tags: string[] | null
  schema_version: number | null
  metadata: Record<string, unknown> | null
  llm_hints: Record<string, unknown> | null
  asset_refs: Array<Record<string, unknown>> | null
  definition_data: Record<string, unknown> | null
}

type ComponentRow = {
  component_type: string
  config: Record<string, unknown>
}

type FieldRow = {
  id: string
  key: string
  label: string
  field_type: string
  description: string | null
  required: boolean
  default_value: unknown
  constraints: Record<string, unknown> | null
  sort_order: number | null
}

type FieldValueRow = {
  field_key: string
  value: unknown
}

type AssetRow = {
  id: string
  key: string
  name: string
  kind: string
  mime_type: string
  storage_path: string
  metadata: Record<string, unknown> | null
  llm_hints: Record<string, unknown> | null
}

export function isActiveMeshGenerationJobStatus(status: string) {
  return activeMeshJobStatuses.includes(status as (typeof activeMeshJobStatuses)[number])
}

export function mapMeshJobRow(row: MeshJobRow): MeshGenerationJob {
  const providerLogs = Array.isArray(row.provider_logs)
    ? row.provider_logs
        .map((entry) => {
          if (typeof entry === 'string') return entry
          if (entry && typeof entry === 'object' && typeof (entry as { message?: unknown }).message === 'string') {
            return String((entry as { message: string }).message)
          }
          return null
        })
        .filter((entry): entry is string => Boolean(entry))
    : []

  return {
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
    providerLogs,
    errorMessage: row.error_message,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function loadMeshJobById(client: DatabaseClient, jobId: string) {
  const response = await client
    .from('mesh_generation_jobs')
    .select('id, project_id, draft_id, definition_key, source_image_asset_key, target_mesh_asset_key, provider, model, provider_request_id, status_url, response_url, cancel_url, status, provider_status, provider_logs, error_message, storage_path, created_at, updated_at')
    .eq('id', jobId)
    .maybeSingle()

  if (response.error) throw new Error(response.error.message)
  return response.data ? mapMeshJobRow(response.data as MeshJobRow) : null
}

export async function loadMeshJobsForDraft(client: DatabaseClient, draftId: string) {
  const response = await client
    .from('mesh_generation_jobs')
    .select('id, project_id, draft_id, definition_key, source_image_asset_key, target_mesh_asset_key, provider, model, provider_request_id, status_url, response_url, cancel_url, status, provider_status, provider_logs, error_message, storage_path, created_at, updated_at')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: false })

  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as MeshJobRow[]).map(mapMeshJobRow)
}

export async function loadActiveMeshJobsForDefinition(client: DatabaseClient, draftId: string, definitionKey: string) {
  const response = await client
    .from('mesh_generation_jobs')
    .select('id, project_id, draft_id, definition_key, source_image_asset_key, target_mesh_asset_key, provider, model, provider_request_id, status_url, response_url, cancel_url, status, provider_status, provider_logs, error_message, storage_path, created_at, updated_at')
    .eq('draft_id', draftId)
    .eq('definition_key', definitionKey)
    .in('status', [...activeMeshJobStatuses])
    .order('created_at', { ascending: false })

  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as MeshJobRow[]).map(mapMeshJobRow)
}

export async function loadLatestMeshJobForDefinition(client: DatabaseClient, draftId: string, definitionKey: string) {
  const response = await client
    .from('mesh_generation_jobs')
    .select('id, project_id, draft_id, definition_key, source_image_asset_key, target_mesh_asset_key, provider, model, provider_request_id, status_url, response_url, cancel_url, status, provider_status, provider_logs, error_message, storage_path, created_at, updated_at')
    .eq('draft_id', draftId)
    .eq('definition_key', definitionKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (response.error) throw new Error(response.error.message)
  return response.data ? mapMeshJobRow(response.data as MeshJobRow) : null
}

export async function updateMeshJob(
  client: DatabaseClient,
  jobId: string,
  changes: Record<string, unknown>,
) {
  const response = await client.from('mesh_generation_jobs').update(changes).eq('id', jobId)
  if (response.error) throw new Error(response.error.message)
}

export async function deleteProjectAssetRow(client: DatabaseClient, projectId: string, assetKey: string) {
  const response = await client.from('project_assets').delete().eq('project_id', projectId).eq('key', assetKey)
  if (response.error) throw new Error(response.error.message)
}

export async function loadProjectAsset(client: DatabaseClient, projectId: string, assetKey: string) {
  const response = await client
    .from('project_assets')
    .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
    .eq('project_id', projectId)
    .eq('key', assetKey)
    .maybeSingle()

  if (response.error) throw new Error(response.error.message)
  if (!response.data) return null

  return {
    id: response.data.id,
    key: response.data.key,
    name: response.data.name,
    kind: response.data.kind,
    mimeType: response.data.mime_type,
    storagePath: response.data.storage_path,
    metadata: response.data.metadata ?? {},
    llmHints: response.data.llm_hints ?? {},
  } satisfies LoadedAsset
}

export async function loadCharacterDefinition(client: DatabaseClient, draftId: string, definitionKey: string) {
  const definitionResponse = await client
    .from('project_definitions')
    .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
    .eq('draft_id', draftId)
    .eq('key', definitionKey)
    .maybeSingle()

  if (definitionResponse.error) throw new Error(definitionResponse.error.message)
  if (!definitionResponse.data) return null

  const definition = definitionResponse.data as DefinitionRow
  const [componentsResponse, customFieldsResponse, fieldValuesResponse] = await Promise.all([
    client
      .from('project_definition_components')
      .select('component_type, config')
      .eq('definition_id', definition.id)
      .order('component_type', { ascending: true }),
    client
      .from('project_archetype_fields')
      .select('id, key, label, field_type, description, required, default_value, constraints, sort_order')
      .eq('draft_id', draftId)
      .eq('definition_id', definition.id)
      .order('sort_order', { ascending: true }),
    client
      .from('project_definition_field_values')
      .select('field_key, value')
      .eq('definition_id', definition.id),
  ])

  if (componentsResponse.error) throw new Error(componentsResponse.error.message)
  if (customFieldsResponse.error) throw new Error(customFieldsResponse.error.message)
  if (fieldValuesResponse.error) throw new Error(fieldValuesResponse.error.message)

  return {
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
    fieldValues: ((fieldValuesResponse.data ?? []) as FieldValueRow[]).map((fieldValue) => ({
      fieldKey: fieldValue.field_key,
      value: fieldValue.value ?? null,
    })),
    customFields: ((customFieldsResponse.data ?? []) as FieldRow[]).map((field) => ({
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
    components: ((componentsResponse.data ?? []) as ComponentRow[]).map((component) => ({
      type: component.component_type,
      config: component.config ?? {},
    })),
  } satisfies LoadedCharacterDefinition
}

export async function upsertDefinitionComponent(
  client: DatabaseClient,
  definitionId: string,
  componentType: string,
  config: Record<string, unknown>,
) {
  const existing = await client
    .from('project_definition_components')
    .select('id')
    .eq('definition_id', definitionId)
    .eq('component_type', componentType)
    .maybeSingle()

  if (existing.error) throw new Error(existing.error.message)

  if (existing.data) {
    const update = await client
      .from('project_definition_components')
      .update({ config })
      .eq('definition_id', definitionId)
      .eq('component_type', componentType)

    if (update.error) throw new Error(update.error.message)
    return
  }

  const insert = await client
    .from('project_definition_components')
    .insert({ definition_id: definitionId, component_type: componentType, config })

  if (insert.error) throw new Error(insert.error.message)
}

export async function bindCharacterMeshAsset(
  client: DatabaseClient,
  draftId: string,
  definitionKey: string,
  meshAssetKey: string | null,
) {
  const definitionResponse = await client
    .from('project_definitions')
    .select('id')
    .eq('draft_id', draftId)
    .eq('key', definitionKey)
    .maybeSingle()

  if (definitionResponse.error) throw new Error(definitionResponse.error.message)
  if (!definitionResponse.data) throw new Error(`Definition ${definitionKey} was not found.`)

  const componentResponse = await client
    .from('project_definition_components')
    .select('config')
    .eq('definition_id', definitionResponse.data.id)
    .eq('component_type', 'render_3d_binding')
    .maybeSingle()

  if (componentResponse.error) throw new Error(componentResponse.error.message)

  const currentConfig =
    componentResponse.data?.config && typeof componentResponse.data.config === 'object'
      ? componentResponse.data.config as Record<string, unknown>
      : { ...defaultRender3dBindingConfig }

  await upsertDefinitionComponent(client, definitionResponse.data.id, 'render_3d_binding', {
    ...defaultRender3dBindingConfig,
    ...currentConfig,
    primaryMeshAssetKey: meshAssetKey,
  })
}

export function isTrellisGeneratedAsset(value: { metadata?: unknown } | null | undefined) {
  if (!value || typeof value !== 'object') return false
  const metadata = (value as { metadata?: unknown }).metadata
  return Boolean(metadata && typeof metadata === 'object' && (metadata as { generatedBy?: unknown }).generatedBy === 'trellis_mesh')
}

export function uniqueMeshAssetKey(existingKeys: string[], definitionKey: string) {
  const suffix = definitionKey.replace(/^[^.]+\./, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'mesh'
  const base = `mesh.${suffix}_mesh`
  if (!existingKeys.includes(base)) return base

  let index = 2
  while (existingKeys.includes(`${base}_${index}`)) {
    index += 1
  }
  return `${base}_${index}`
}

export function formatFalLogMessages(statusData: unknown) {
  if (!statusData || typeof statusData !== 'object') return []
  const logs = (statusData as { logs?: unknown }).logs
  if (!Array.isArray(logs)) return []
  return logs
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (entry && typeof entry === 'object' && typeof (entry as { message?: unknown }).message === 'string') {
        return String((entry as { message: string }).message)
      }
      return null
    })
    .filter((entry): entry is string => Boolean(entry))
}

export const trellisGlbResultSchema = z.object({
  model_glb: z.object({
    url: z.string().url(),
  }),
})
