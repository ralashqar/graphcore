import '@supabase/functions-js/edge-runtime.d.ts'

import { requireUserClient } from '../_shared/auth.ts'
import { runTrackedOpenAiResponses } from '../_shared/ai-provider-gateway.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { normalizeStrictJsonSchema } from '../_shared/structured-output.ts'
import { mapVisualGenerationJobRow, visualJobSelect, type VisualGenerationJobRow } from '../_shared/visual-generation.ts'
import { notifyWorkerWakeBestEffort } from '../_shared/worker-wake.ts'
import { entityReferenceVariantCreateResponseSchema } from '../../../src/domain/visualGeneration.ts'

type AuthedClient = Awaited<ReturnType<typeof requireUserClient>>['client']

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((entry) => readString(entry)).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean)
  return []
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'variant'
}

function slugifyOptional(value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)
  return slug
}

function compact(value: unknown) {
  return readString(value).replace(/\s+/g, ' ').trim()
}

function normalizeProvider(value: unknown) {
  const provider = readString(value).toLowerCase()
  if (provider === 'openai' || provider === 'openai_direct' || provider === 'direct_openai') return 'openai'
  return 'fal'
}

function normalizeModel(provider: string, value: unknown) {
  const model = readString(value)
  if (provider === 'openai') {
    if (!model || model === 'openai/gpt-image-2' || model === 'openai/gpt-image-2/edit') return 'gpt-image-2'
    return model.startsWith('openai/') ? model.slice('openai/'.length) : model
  }
  if (!model || model === 'gpt-image-2') return 'openai/gpt-image-2'
  return model
}

function mapVariantRow(row: Record<string, unknown>) {
  return {
    id: readString(row.id),
    key: readString(row.key) || `${readString(row.entity_key)}:${readString(row.variant_key)}`,
    projectId: readString(row.project_id),
    draftId: readString(row.draft_id),
    entityKey: readString(row.entity_key),
    variantKey: readString(row.variant_key),
    label: readString(row.label),
    summary: readString(row.summary),
    variantType: readString(row.variant_type) || 'reference_variant',
    sourceVariantKey: readString(row.source_variant_key) || 'default',
    assetKey: readString(row.asset_key) || null,
    visualJobId: readString(row.visual_job_id) || null,
    guidance: readString(row.guidance),
    status: readString(row.status) || 'pending',
    metadata: asRecord(row.metadata),
    createdAt: readString(row.created_at),
    updatedAt: readString(row.updated_at),
  }
}

function isLocationEntity(nodeType: string) {
  return ['place', 'location_spot', 'travel_link', 'environment', 'screen', 'section'].includes(nodeType)
}

function assetLooksLikeEntityReferenceSheet(asset: Record<string, unknown>) {
  const metadata = asRecord(asset.metadata)
  const generation = asRecord(metadata.generation)
  const generatedBy = readString(metadata.generatedBy)
  const jobKind = readString(metadata.jobKind)
  const storagePath = readString(asset.storage_path)
  return generatedBy === 'entity_reference_sheet'
    || jobKind === 'entity_reference_sheet'
    || jobKind === 'character_sheet'
    || readString(generation.jobKind) === 'entity_reference_sheet'
    || storagePath.includes('/entity-reference-sheets/')
    || readString(asset.key).startsWith('entity_reference_sheet_')
}

async function resolveDefaultReferenceAssetKey(input: {
  client: AuthedClient
  projectId: string
  entity: Record<string, unknown>
  entityMetadata: Record<string, unknown>
}) {
  const metadataAssetKey = readString(input.entityMetadata.referenceSheetAssetKey)
  if (metadataAssetKey) return metadataAssetKey

  const candidateKeys = [
    readString(input.entity.thumbnail_asset_key),
    readString(input.entity.icon_asset_key),
  ].filter(Boolean)
  if (candidateKeys.length === 0) return ''

  const assetResponse = await input.client
    .from('project_assets')
    .select('key, kind, storage_path, metadata')
    .eq('project_id', input.projectId)
    .in('key', [...new Set(candidateKeys)])
  if (assetResponse.error) throw new Error(assetResponse.error.message)

  const assets = (assetResponse.data ?? []).map((asset) => asRecord(asset))
  const referenceAsset = assets.find((asset) => (
    readString(asset.kind) === 'image' && assetLooksLikeEntityReferenceSheet(asset)
  ))
  return readString(referenceAsset?.key)
}

async function allocateUniqueVariantKey(input: {
  client: AuthedClient
  draftId: string
  entityKey: string
  preferredKey: string
}) {
  const baseKey = slugify(input.preferredKey)
  if (!baseKey || baseKey === 'default') return ''
  const response = await input.client
    .from('world_entity_visual_variants')
    .select('variant_key')
    .eq('draft_id', input.draftId)
    .eq('entity_key', input.entityKey)
  if (response.error) throw new Error(response.error.message)
  const usedKeys = new Set((response.data ?? []).map((row) => readString(asRecord(row).variant_key)).filter(Boolean))
  if (!usedKeys.has(baseKey)) return baseKey
  for (let index = 2; index < 100; index += 1) {
    const suffix = `_${index}`
    const candidate = `${baseKey.slice(0, Math.max(1, 60 - suffix.length))}${suffix}`
    if (!usedKeys.has(candidate)) return candidate
  }
  return `${baseKey.slice(0, 48)}_${Date.now().toString(36).slice(-8)}`
}

async function inferVariant(input: {
  client: AuthedClient
  userId: string
  projectId: string
  draftId: string
  entity: Record<string, unknown>
  guidance: string
}) {
  const nodeType = readString(input.entity.node_type)
  const fallbackLabel = input.guidance.replace(/^make\s+/i, '').replace(/^in\s+/i, '').slice(0, 48).trim() || 'Variation'
  const fallback = {
    variantKey: slugify(fallbackLabel),
    label: fallbackLabel,
    summary: input.guidance.slice(0, 220),
    variantType: isLocationEntity(nodeType) ? 'shot_location_sheet' : 'reference_variant',
  }

  try {
    const schema = normalizeStrictJsonSchema({
      type: 'object',
      additionalProperties: false,
      required: ['variantKey', 'label', 'summary', 'variantType'],
      properties: {
        variantKey: { type: 'string', description: 'Stable lowercase snake_case key for this visual variant.' },
        label: { type: 'string', description: 'Short user-facing label, 2-5 words.' },
        summary: { type: 'string', description: 'One sentence describing the visual variation.' },
        variantType: { type: 'string', enum: ['reference_variant', 'wardrobe_variant', 'state_variant', 'shot_location_sheet'] },
      },
    })
    const response = await runTrackedOpenAiResponses({
      client: input.client,
      payload: {
        model: Deno.env.get('ENTITY_REFERENCE_VARIANT_ROUTER_MODEL') || 'gpt-5.4-mini',
        instructions: 'Infer concise metadata for a visual-only reference art variant. Do not change canon. Return strict JSON only.',
        input: [
          `Entity: ${readString(input.entity.name)}`,
          `Type: ${nodeType}`,
          `Summary: ${readString(input.entity.summary)}`,
          `User visual variant request: ${input.guidance}`,
          isLocationEntity(nodeType)
            ? 'For locations, prefer variantType shot_location_sheet when the request names a smaller shot location, room, interior, street, cafe, angle, set, or filming space.'
            : 'For characters and objects, classify wardrobe/look changes as wardrobe_variant or reference_variant.',
        ].join('\n'),
        text: {
          format: {
            type: 'json_schema',
            name: 'entity_reference_variant_metadata',
            schema,
            strict: true,
          },
        },
        maxOutputTokens: 500,
        metadata: {
          graphcore_task: 'entity_reference_variant_metadata',
          project_id: input.projectId,
          draft_id: input.draftId,
          entity_key: readString(input.entity.key),
        },
        timeoutMs: 35_000,
      },
      context: {
        userId: input.userId,
        projectId: input.projectId,
        draftId: input.draftId,
        surface: 'create-entity-reference-variant',
        idempotencyKey: `entity-reference-variant:${input.draftId}:${readString(input.entity.key)}:${Date.now()}`,
        metadata: { entityKey: readString(input.entity.key) },
      },
    })
    if (!response.response.ok) return fallback
    const parsed = JSON.parse(response.outputText) as Record<string, unknown>
    return {
      variantKey: slugify(readString(parsed.variantKey) || readString(parsed.label) || fallback.variantKey),
      label: compact(parsed.label).slice(0, 80) || fallback.label,
      summary: compact(parsed.summary).slice(0, 280) || fallback.summary,
      variantType: ['reference_variant', 'wardrobe_variant', 'state_variant', 'shot_location_sheet'].includes(readString(parsed.variantType))
        ? readString(parsed.variantType)
        : fallback.variantType,
    }
  } catch (error) {
    console.warn('[GraphCore] entity reference variant metadata inference failed; using fallback.', {
      entityKey: readString(input.entity.key),
      message: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'create-entity-reference-variant')
    const payload = asRecord(await request.json())
    const projectId = readString(payload.projectId)
    const draftId = readString(payload.draftId)
    const entityKey = readString(payload.entityKey)
    const guidance = compact(payload.guidance).slice(0, 1400)
    const requestedBaseVariantKey = 'default'
    const requestedVariantKey = slugifyOptional(readString(payload.variantKey))
    const regenerate = payload.regenerate === true

    if (!projectId || !draftId || !entityKey || !guidance) {
      throw new HttpError(400, 'projectId, draftId, entityKey, and guidance are required.')
    }

    const draftResponse = await client
      .from('project_drafts')
      .select('id, project_id, metadata')
      .eq('id', draftId)
      .eq('project_id', projectId)
      .single()
    if (draftResponse.error || !draftResponse.data) {
      throw new HttpError(404, draftResponse.error?.message ?? 'Draft was not found.')
    }

    const entityResponse = await client
      .from('world_entities')
      .select('*')
      .eq('draft_id', draftId)
      .eq('key', entityKey)
      .single()
    if (entityResponse.error || !entityResponse.data) {
      throw new HttpError(404, entityResponse.error?.message ?? 'World entity was not found.')
    }
    const entity = asRecord(entityResponse.data)
    const entityMetadata = asRecord(entity.metadata)

    let baseReferenceAssetKey = ''
    if (requestedBaseVariantKey === 'default') {
      baseReferenceAssetKey = await resolveDefaultReferenceAssetKey({ client, projectId, entity, entityMetadata })
    } else {
      const baseVariantResponse = await client
        .from('world_entity_visual_variants')
        .select('asset_key')
        .eq('draft_id', draftId)
        .eq('entity_key', entityKey)
        .eq('variant_key', requestedBaseVariantKey)
        .maybeSingle()
      if (baseVariantResponse.error) throw new Error(baseVariantResponse.error.message)
      baseReferenceAssetKey = readString(asRecord(baseVariantResponse.data).asset_key)
    }
    if (!baseReferenceAssetKey) {
      throw new HttpError(409, 'Generate the default reference sheet before creating a variation.')
    }

    const inferred = await inferVariant({ client, userId: user.id, projectId, draftId, entity, guidance })
    const variantKey = requestedVariantKey || await allocateUniqueVariantKey({
      client,
      draftId,
      entityKey,
      preferredKey: inferred.variantKey,
    })
    if (!variantKey || variantKey === 'default') throw new HttpError(400, 'Variant key must not be default.')

    const existingResponse = await client
      .from('world_entity_visual_variants')
      .select('*')
      .eq('draft_id', draftId)
      .eq('entity_key', entityKey)
      .eq('variant_key', variantKey)
      .maybeSingle()
    if (existingResponse.error) throw new Error(existingResponse.error.message)
    const existing = asRecord(existingResponse.data)
    const existingJobId = readString(existing.visual_job_id)
    const existingStatus = readString(existing.status)
    if (!regenerate && existingJobId && ['pending', 'queued', 'running'].includes(existingStatus)) {
      const jobResponse = await client
        .from('visual_generation_jobs')
        .select(visualJobSelect)
        .eq('id', existingJobId)
        .single()
      if (jobResponse.error || !jobResponse.data) throw new Error(jobResponse.error?.message ?? 'Existing visual job was not found.')
      return json(entityReferenceVariantCreateResponseSchema.parse({
        ok: true,
        variant: mapVariantRow(existing),
        job: mapVisualGenerationJobRow(jobResponse.data as VisualGenerationJobRow),
      }))
    }

    const now = new Date().toISOString()
    const variantUpsertResponse = await client
      .from('world_entity_visual_variants')
      .upsert({
        project_id: projectId,
        draft_id: draftId,
        entity_key: entityKey,
        variant_key: variantKey,
        label: inferred.label,
        summary: inferred.summary,
        variant_type: inferred.variantType,
        source_variant_key: requestedBaseVariantKey,
        guidance,
        status: 'queued',
        metadata: {
          ...asRecord(existing.metadata),
          requestedBy: user.id,
          requestedAt: now,
          baseReferenceAssetKey,
          lastGuidance: guidance,
          visualOnly: true,
        },
      }, { onConflict: 'draft_id,entity_key,variant_key' })
      .select('*')
      .single()
    if (variantUpsertResponse.error || !variantUpsertResponse.data) {
      throw new Error(variantUpsertResponse.error?.message ?? 'Failed to save entity reference variant.')
    }

    const provider = normalizeProvider(Deno.env.get('VISUAL_GENERATION_IMAGE_PROVIDER'))
    const model = normalizeModel(provider, Deno.env.get('VISUAL_GENERATION_ENTITY_REFERENCE_SHEET_MODEL'))
    const draftMetadata = asRecord(asRecord(draftResponse.data).metadata)
    const worldWiki = asRecord(draftMetadata.worldWiki)
    const artStyle = readString(worldWiki.artStyleDescription) || readString(worldWiki.artStyleName)
    const tone = [readString(worldWiki.genre), ...readStringArray(worldWiki.toneTags)].filter(Boolean).join(', ')
    const visual = asRecord(entityMetadata.visual)
    const visualTraits = readStringArray(visual.traits ?? entityMetadata.visualTraits)
    const assetKey = `entity_reference_variant_${slugify(entityKey)}_${variantKey}`

    const jobResponse = await client
      .from('visual_generation_jobs')
      .insert({
        project_id: projectId,
        draft_id: draftId,
        requested_by: user.id,
        status: 'queued',
        kind: 'entity_reference_sheet',
        provider,
        model,
        target_keys: {
          entityKey,
          entityName: readString(entity.name),
          entityNodeType: readString(entity.node_type),
          linkedDefinitionKey: readString(entity.linked_definition_key) || null,
          variantKey,
          variantType: inferred.variantType,
          baseVariantKey: requestedBaseVariantKey,
        },
        input: {
          entityKey,
          entityName: readString(entity.name),
          entityNodeType: readString(entity.node_type),
          linkedDefinitionKey: readString(entity.linked_definition_key) || null,
          assetKey,
          sheetKind: inferred.variantType === 'shot_location_sheet' ? 'location' : '',
          variantKey,
          variantLabel: inferred.label,
          variantSummary: inferred.summary,
          variantType: inferred.variantType,
          baseVariantKey: requestedBaseVariantKey,
          baseReferenceAssetKey,
          referenceImageAssetKeys: [baseReferenceAssetKey],
          regenerationGuidance: guidance,
          projectArtStyle: artStyle,
          projectTone: tone,
          summary: readString(entity.summary),
          context: readString(entity.context),
          visualDescription: readString(visual.description) || readString(entityMetadata.visualDescription),
          visualTraits,
        },
        metadata: {
          source: 'wiki_entity_reference_variant',
          requestedFrom: 'wiki_entity_reference_variant',
          entityKey,
          variantKey,
          variantLabel: inferred.label,
          variantType: inferred.variantType,
          baseVariantKey: requestedBaseVariantKey,
          baseReferenceAssetKey,
          regenerationGuidance: guidance,
          provider,
          model,
        },
      })
      .select(visualJobSelect)
      .single()
    if (jobResponse.error || !jobResponse.data) throw new Error(jobResponse.error?.message ?? 'Failed to queue variant visual generation.')

    const job = mapVisualGenerationJobRow(jobResponse.data as VisualGenerationJobRow)
    const variantUpdateResponse = await client
      .from('world_entity_visual_variants')
      .update({
        visual_job_id: job.id,
        status: 'queued',
        metadata: {
          ...asRecord(asRecord(variantUpsertResponse.data).metadata),
          visualJobId: job.id,
        },
      })
      .eq('draft_id', draftId)
      .eq('entity_key', entityKey)
      .eq('variant_key', variantKey)
      .select('*')
      .single()
    if (variantUpdateResponse.error || !variantUpdateResponse.data) {
      throw new Error(variantUpdateResponse.error?.message ?? 'Failed to attach variant visual job.')
    }

    await notifyWorkerWakeBestEffort({
      family: 'visual',
      source: 'create-entity-reference-variant',
      jobId: job.id,
      projectId,
      draftId,
    })
    return json(entityReferenceVariantCreateResponseSchema.parse({
      ok: true,
      variant: mapVariantRow(asRecord(variantUpdateResponse.data)),
      job,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to create entity reference variant.')
  }
})
