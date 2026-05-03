import { z } from 'npm:zod@4'

import { requireUserClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import {
  iconGenerationStartResponseSchema,
  resolveIconGridSize,
  type IconGenerationCandidate,
} from '../_shared/entity-icon-generation.ts'
import {
  mapVisualJobRowToIconGenerationJob,
  readVisualIconCandidates,
  visualIconJobSelect,
} from '../_shared/visual-icon-compat.ts'

const requestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
})

type WorldEntityRow = {
  key: string
  name: string
  summary: string | null
  context: string | null
  node_type: string
  tags: string[] | null
  status: string
  thumbnail_asset_key: string | null
  linked_definition_key: string | null
  custom_properties: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
}

type DefinitionRow = {
  key: string
  icon_asset_key: string | null
}

const ENTITY_ICON_PRIORITY: Record<string, number> = {
  actor: 0,
  place: 1,
  group: 2,
  object: 3,
  concept: 4,
  sequence_unit: 5,
}

const DEFAULT_ICON_NODE_TYPES = new Set(Object.keys(ENTITY_ICON_PRIORITY))
const VISUAL_DESCRIPTION_MAX_LENGTH = 280

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeVisualPrompt(value: unknown) {
  return readString(value).replace(/\s+/g, ' ').slice(0, VISUAL_DESCRIPTION_MAX_LENGTH).trim()
}

function resolveVisualPrompt(entity: WorldEntityRow) {
  const metadata = asRecord(entity.metadata)
  const custom = asRecord(entity.custom_properties)
  const metadataVisual = asRecord(metadata.visual)
  const customVisual = asRecord(custom.visual)
  return normalizeVisualPrompt(
    readString(metadata.visualDescription)
    || readString(metadataVisual.description)
    || readString(metadataVisual.visualDescription)
    || readString(custom.visualDescription)
    || readString(customVisual.description)
    || readString(customVisual.visualDescription)
    || readString(custom.appearance)
    || readString(entity.summary)
    || readString(entity.context)
    || `${entity.name}, ${entity.node_type}`
  )
}

function readProjectContext(metadata: Record<string, unknown> | null) {
  const projectContext = asRecord(metadata?.projectContext)
  return {
    artStyleName: readString(projectContext.artStylePreset) || 'cohesive project art style',
    artStyleDescription: readString(projectContext.artStyleDescription) || 'cohesive, polished, high-quality worldbuilding icon art',
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'start-world-entity-icon-batch')
    const payload = requestSchema.parse(await request.json())

    const draftResponse = await client
      .from('project_drafts')
      .select('id, project_id, metadata')
      .eq('id', payload.draftId)
      .eq('project_id', payload.projectId)
      .single()

    if (draftResponse.error || !draftResponse.data) {
      throw new HttpError(404, 'Draft not found or not editable.')
    }

    const [entitiesResponse, definitionsResponse] = await Promise.all([
      client
        .from('world_entities')
        .select('key, name, summary, context, node_type, tags, status, thumbnail_asset_key, linked_definition_key, custom_properties, metadata')
        .eq('draft_id', payload.draftId),
      client
        .from('project_definitions')
        .select('key, icon_asset_key')
        .eq('draft_id', payload.draftId),
    ])

    if (entitiesResponse.error) throw new Error(entitiesResponse.error.message)
    if (definitionsResponse.error) throw new Error(definitionsResponse.error.message)

    const definitionByKey = new Map((definitionsResponse.data ?? []).map((definition) => [
      (definition as DefinitionRow).key,
      definition as DefinitionRow,
    ]))
    const allCandidates = ((entitiesResponse.data ?? []) as WorldEntityRow[])
      .filter((entity) => entity.status !== 'archived')
      .filter((entity) => DEFAULT_ICON_NODE_TYPES.has(entity.node_type))
      .filter((entity) => {
        const linkedDefinition = entity.linked_definition_key ? definitionByKey.get(entity.linked_definition_key) ?? null : null
        return !entity.thumbnail_asset_key && !linkedDefinition?.icon_asset_key
      })
      .sort((left, right) => {
        const leftPriority = ENTITY_ICON_PRIORITY[left.node_type] ?? 99
        const rightPriority = ENTITY_ICON_PRIORITY[right.node_type] ?? 99
        return leftPriority - rightPriority || left.name.localeCompare(right.name)
      })

    const candidates: IconGenerationCandidate[] = allCandidates.slice(0, 16).map((entity, index) => ({
      entityKey: entity.key,
      linkedDefinitionKey: entity.linked_definition_key,
      name: entity.name,
      nodeType: entity.node_type,
      summary: entity.summary ?? entity.context ?? '',
      visualPrompt: resolveVisualPrompt(entity),
      orderIndex: index,
    }))

    if (candidates.length === 0) {
      throw new HttpError(400, 'No world entities need icon images.')
    }

    const grid = resolveIconGridSize(candidates.length)
    const artStyle = readProjectContext(draftResponse.data.metadata as Record<string, unknown> | null)

    const activeJobResponse = await client
      .from('visual_generation_jobs')
      .select(visualIconJobSelect)
      .eq('draft_id', payload.draftId)
      .eq('kind', 'world_entity_icon_grid')
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (activeJobResponse.error) throw new Error(activeJobResponse.error.message)
    if (activeJobResponse.data) {
      const activeJob = mapVisualJobRowToIconGenerationJob(activeJobResponse.data)
      const activeCandidates = readVisualIconCandidates(asRecord(activeJobResponse.data.input))
      return json(iconGenerationStartResponseSchema.parse({
        ok: true,
        job: activeJob,
        candidates: activeCandidates.length > 0 ? activeCandidates : candidates,
        skippedCount: typeof activeJob.metadata.skippedCount === 'number' ? activeJob.metadata.skippedCount : Math.max(0, allCandidates.length - candidates.length),
      }))
    }

    const insertResponse = await client
      .from('visual_generation_jobs')
      .insert({
        project_id: payload.projectId,
        draft_id: payload.draftId,
        status: 'queued',
        kind: 'world_entity_icon_grid',
        provider: 'fal',
        model: 'openai/gpt-image-2',
        target_keys: {
          entityKeys: candidates.map((candidate) => candidate.entityKey),
        },
        input: {
          candidates,
          gridRows: grid.rows,
          gridCols: grid.cols,
          artStyle,
        },
        requested_by: user.id,
        metadata: {
          skippedCount: Math.max(0, allCandidates.length - candidates.length),
          gridRows: grid.rows,
          gridCols: grid.cols,
          runtime: 'fly',
          queuedBy: 'start-world-entity-icon-batch',
        },
      })
      .select(visualIconJobSelect)
      .single()

    if (insertResponse.error) throw new Error(insertResponse.error.message)

    return json(iconGenerationStartResponseSchema.parse({
      ok: true,
      job: mapVisualJobRowToIconGenerationJob(insertResponse.data),
      candidates,
      skippedCount: Math.max(0, allCandidates.length - candidates.length),
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to start world entity icon generation.')
  }
})
