import '@supabase/functions-js/edge-runtime.d.ts'

import { createAdminClient, requireUserClient } from '../_shared/auth.ts'
import { runTrackedOpenAiResponses } from '../_shared/ai-provider-gateway.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
import { normalizeStrictJsonSchema } from '../_shared/structured-output.ts'

const VISUAL_DESCRIPTION_MAX = 480
const VISUAL_TRAIT_MAX = 80

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function compact(value: unknown) {
  return readString(value).replace(/\s+/g, ' ').trim()
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((entry) => compact(entry)).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((entry) => compact(entry)).filter(Boolean)
  return []
}

function uniqueStrings(values: string[], limit = 18) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const clean = compact(value).slice(0, VISUAL_TRAIT_MAX).trim()
    const key = clean.toLowerCase()
    if (!clean || seen.has(key)) continue
    seen.add(key)
    result.push(clean)
    if (result.length >= limit) break
  }
  return result
}

function composeVisualDescription(description: string, traits: string[]) {
  const cleanDescription = compact(description).slice(0, VISUAL_DESCRIPTION_MAX).trim()
  if (!cleanDescription) return ''
  return traits.length > 0
    ? `${cleanDescription} Traits: ${traits.join(', ')}`.slice(0, VISUAL_DESCRIPTION_MAX).trim()
    : cleanDescription
}

function readVisualIdentity(entity: Record<string, unknown>) {
  const metadata = asRecord(entity.metadata)
  const customProperties = asRecord(entity.custom_properties)
  const visual = asRecord(metadata.visual)
  const customVisual = asRecord(customProperties.visual)
  const legacy = readString(metadata.visualDescription)
  const legacyMatch = legacy.match(/^(.*?)(?:\s+traits\s*:\s*)(.+)$/i)
  const legacyDescription = legacyMatch ? compact(legacyMatch[1]) : legacy
  const legacyTraits = legacyMatch ? readStringArray(legacyMatch[2]) : []
  const traitMap = {
    ...asRecord(customVisual.traitMap),
    ...asRecord(customProperties.visualTraitMap),
    ...asRecord(visual.traitMap),
    ...asRecord(metadata.visualTraitMap),
  }
  const traits = uniqueStrings([
    ...readStringArray(customProperties.visualTraits),
    ...readStringArray(customVisual.traits),
    ...readStringArray(metadata.visualTraits),
    ...readStringArray(visual.traits),
    ...Object.values(traitMap).map((entry) => compact(entry)),
    ...legacyTraits,
  ])
  const description = compact(
    visual.description
    ?? visual.visualDescription
    ?? legacyDescription
    ?? customVisual.description
    ?? customVisual.visualDescription
    ?? customProperties.visualDescription
    ?? entity.summary
    ?? entity.context,
  ).slice(0, VISUAL_DESCRIPTION_MAX).trim()
  return { description, traits, traitMap }
}

function mapWorldEntityRow(row: Record<string, unknown>) {
  return {
    id: readString(row.id),
    key: readString(row.key),
    name: readString(row.name),
    summary: readString(row.summary),
    context: readString(row.context),
    nodeType: readString(row.node_type),
    aliases: readStringArray(row.aliases),
    tags: readStringArray(row.tags),
    status: readString(row.status) || 'active',
    thumbnailAssetKey: typeof row.thumbnail_asset_key === 'string' ? row.thumbnail_asset_key : null,
    linkedDefinitionKey: typeof row.linked_definition_key === 'string' ? row.linked_definition_key : null,
    source: readString(row.source) || 'ai',
    customProperties: asRecord(row.custom_properties),
    metadata: asRecord(row.metadata),
  }
}

function parseJsonObject(value: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('OpenAI returned an empty visual profile response.')
  return JSON.parse(trimmed) as Record<string, unknown>
}

async function signReferenceAsset(client: ReturnType<typeof createAdminClient>, projectId: string, assetKey: string) {
  if (!assetKey) return null
  const response = await client
    .from('project_assets')
    .select('key, storage_path, mime_type, metadata')
    .eq('project_id', projectId)
    .eq('key', assetKey)
    .maybeSingle()
  if (response.error) throw new Error(response.error.message)
  const asset = asRecord(response.data)
  const storagePath = readString(asset.storage_path)
  if (!storagePath) return null
  const signed = await client.storage.from('project-assets').createSignedUrl(storagePath, 3600)
  if (signed.error) throw new Error(signed.error.message)
  return readString(signed.data?.signedUrl) || null
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'refine-entity-visual-profile')
    const admin = createAdminClient('refine-entity-visual-profile')
    const payload = asRecord(await request.json())
    const projectId = readString(payload.projectId)
    const draftId = readString(payload.draftId)
    const entityKey = readString(payload.entityKey)
    const guidance = compact(payload.guidance).slice(0, 1200)
    const referenceImageAssetKey = readString(payload.referenceImageAssetKey)

    if (!projectId || !draftId || !entityKey) {
      throw new HttpError(400, 'projectId, draftId, and entityKey are required.')
    }
    if (!guidance && !referenceImageAssetKey) {
      throw new HttpError(400, 'Provide guidance or a reference image to refine the visual profile.')
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

    const entityRow = asRecord(entityResponse.data)
    const metadata = asRecord(entityRow.metadata)
    const draftMetadata = asRecord(asRecord(draftResponse.data).metadata)
    const worldWiki = asRecord(draftMetadata.worldWiki)
    const visualIdentity = readVisualIdentity(entityRow)
    const referenceImageUrl = referenceImageAssetKey ? await signReferenceAsset(admin, projectId, referenceImageAssetKey) : null
    const schema = normalizeStrictJsonSchema({
      type: 'object',
      additionalProperties: false,
      required: ['visualDescription', 'visualTraits', 'visualTraitMap', 'changeSummary'],
      properties: {
        visualDescription: {
          type: 'string',
          description: 'Neutral durable visual identity, not a scene action. 1-3 compact sentences.',
        },
        visualTraits: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stable visible traits only.',
        },
        visualTraitMap: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Stable visual trait map such as hair, eyes, palette, materials, build, speciesOrType.',
        },
        changeSummary: {
          type: 'string',
          description: 'Short audit summary of what changed.',
        },
      },
    })
    const textPrompt = [
      `Entity: ${readString(entityRow.name) || entityKey}`,
      `Type: ${readString(entityRow.node_type) || 'entity'}`,
      `Summary: ${readString(entityRow.summary)}`,
      `Context: ${readString(entityRow.context)}`,
      `Project art style: ${readString(worldWiki.artStyleDescription) || readString(worldWiki.artStyleName) || 'current project art style'}`,
      `Project tone: ${[readString(worldWiki.genre), ...readStringArray(worldWiki.toneTags)].filter(Boolean).join(', ') || 'current project tone'}`,
      `Current visual description: ${visualIdentity.description}`,
      `Current visual traits: ${visualIdentity.traits.join(', ')}`,
      `Current visual trait map: ${JSON.stringify(visualIdentity.traitMap)}`,
      guidance ? `User regeneration guidance: ${guidance}` : '',
      referenceImageUrl ? 'A reference image is attached. Use it for visual identity cues only, while preserving the project art style.' : '',
      'Update only durable visual identity. Preserve canon, role, personality, relationships, story state, and non-visual facts. Do not add temporary pose, injury, scene lighting, event damage, or action-state details unless explicitly requested as permanent identity.',
    ].filter(Boolean).join('\n')

    const input = referenceImageUrl
      ? [{
          role: 'user',
          content: [
            { type: 'input_text', text: textPrompt },
            { type: 'input_image', image_url: referenceImageUrl },
          ],
        }]
      : textPrompt

    const response = await runTrackedOpenAiResponses({
      client: admin,
      payload: {
        model: Deno.env.get('ENTITY_VISUAL_PROFILE_REFINEMENT_MODEL') || 'gpt-5.4-mini',
        instructions: 'You refine durable world-entity visual identity for production reference sheets. Return only JSON matching the schema.',
        input,
        text: {
          format: {
            type: 'json_schema',
            name: 'entity_visual_profile_refinement',
            schema,
            strict: true,
          },
        },
        maxOutputTokens: 900,
        metadata: {
          graphcore_task: 'entity_visual_profile_refinement',
          project_id: projectId,
          draft_id: draftId,
          entity_key: entityKey,
        },
        timeoutMs: 60_000,
      },
      context: {
        userId: user.id,
        projectId,
        draftId,
        surface: 'refine-entity-visual-profile',
        idempotencyKey: `entity-visual-refine:${draftId}:${entityKey}:${Date.now()}`,
        metadata: { entityKey, referenceImageAssetKey: referenceImageAssetKey || null },
      },
    })

    if (!response.response.ok) {
      throw new HttpError(response.response.status, 'OpenAI could not refine the entity visual profile.')
    }

    const parsed = parseJsonObject(response.outputText)
    const refinedDescription = compact(parsed.visualDescription).slice(0, VISUAL_DESCRIPTION_MAX).trim()
    const refinedTraits = uniqueStrings(readStringArray(parsed.visualTraits), 16)
    const refinedTraitMap = asRecord(parsed.visualTraitMap)
    if (!refinedDescription) throw new Error('Visual profile refinement did not return a visual description.')

    const nextMetadata = {
      ...metadata,
      visual: {
        ...asRecord(metadata.visual),
        description: refinedDescription,
        traits: refinedTraits,
        traitMap: {
          ...visualIdentity.traitMap,
          ...Object.fromEntries(
            Object.entries(refinedTraitMap)
              .map(([key, value]) => [key, compact(value)] as const)
              .filter(([, value]) => value),
          ),
        },
        descriptionMode: 'neutral_identity',
        transientStateExcluded: true,
      },
      visualDescription: composeVisualDescription(refinedDescription, refinedTraits),
      visualDescriptionSource: 'wiki_entity_reference_sheet_regeneration',
      visualProfileRefinement: {
        refinedAt: new Date().toISOString(),
        refinedBy: user.id,
        guidance,
        referenceImageAssetKey: referenceImageAssetKey || null,
        changeSummary: compact(parsed.changeSummary),
        responseId: response.id,
      },
    }

    const updateResponse = await client
      .from('world_entities')
      .update({ metadata: nextMetadata })
      .eq('draft_id', draftId)
      .eq('key', entityKey)
      .select('*')
      .single()
    if (updateResponse.error || !updateResponse.data) {
      throw new Error(updateResponse.error?.message ?? 'Failed to update world entity visual metadata.')
    }

    return json({
      ok: true,
      entity: mapWorldEntityRow(asRecord(updateResponse.data)),
      visualDescription: nextMetadata.visualDescription,
      visualTraits: refinedTraits,
      referenceImageAssetKey: referenceImageAssetKey || null,
    })
  } catch (error) {
    return errorResponse(error, 'Failed to refine entity visual profile.')
  }
})
