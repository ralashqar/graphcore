import '@supabase/functions-js/edge-runtime.d.ts'

import { z } from 'npm:zod@4'

import { normalizeProviderQueueHandle } from '../../../src/core/providerQueue.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'

const contentGenerationSchema = z.object({
  name: z.string(),
  summary: z.string(),
  tags: z.array(z.string()).default([]),
  characterProfile: z.object({
    subtype: z.string().trim().min(1).default('humanoid'),
    bodyClass: z.string().default('humanoid'),
    controlMode: z.enum(['player', 'ai', 'scripted', 'neutral']).default('ai'),
    scaleProfile: z.enum(['small', 'medium', 'large', 'huge']).default('medium'),
  }).optional(),
  render3dBinding: z.object({
    conceptPrompt: z.string().nullable().default(null),
    generationPrompt: z.string().nullable().default(null),
    generationStyle: z.string().nullable().default(null),
  }).optional(),
  physicalItemProfile: z.preprocess((value) => normalizeGeneratedPhysicalItemProfile(value), z.object({
    physicalSubtype: z.enum(['prop', 'equipment', 'weapon', 'pickup', 'world_object']).default('pickup'),
    worldPlacementRole: z.string().default(''),
    pickupContext: z.string().default(''),
  })).optional(),
  environmentProfile: z.preprocess((value) => normalizeGeneratedEnvironmentProfile(value), z.object({
    subtype: z.enum(['interior', 'exterior', 'dungeon', 'settlement', 'wilderness', 'structure', 'biome', 'poi']).default('exterior'),
    biome: z.string().default(''),
    traversalType: z.enum(['walk', 'climb', 'swim', 'fly', 'mixed']).default('walk'),
    isInterior: z.boolean().default(false),
    scaleTier: z.enum(['room', 'site', 'zone', 'region']).default('site'),
  })).optional(),
  environmentRenderBinding: z.object({
    lightingProfile: z.string().default(''),
    generationPrompt: z.string().nullable().default(null),
    generationStyle: z.string().nullable().default(null),
  }).optional(),
  environmentNavigation: z.object({
    entryAnchors: z.array(z.string()).default([]),
    regionMarkers: z.array(z.string()).default([]),
    navigationNotes: z.string().default(''),
  }).optional(),
  environmentSpawnRules: z.object({
    characterKeys: z.array(z.string()).default([]),
    itemKeys: z.array(z.string()).default([]),
    resourceNodeKeys: z.array(z.string()).default([]),
  }).optional(),
  resultContext: z.object({
    title: z.string(),
    summary: z.string(),
    graphHook: z.string().default(''),
    visualDirection: z.string().default(''),
  }),
})

const contentGenerationRawSchema = z.record(z.string(), z.unknown())

const CANONICAL_ENVIRONMENT_SUBTYPES = ['interior', 'exterior', 'dungeon', 'settlement', 'wilderness', 'structure', 'biome', 'poi'] as const
const CANONICAL_TRAVERSAL_TYPES = ['walk', 'climb', 'swim', 'fly', 'mixed'] as const
const CANONICAL_SCALE_TIERS = ['room', 'site', 'zone', 'region'] as const
const CANONICAL_PHYSICAL_SUBTYPES = ['prop', 'equipment', 'weapon', 'pickup', 'world_object'] as const
let worldBuildJobSchemaRuntime: z.ZodTypeAny | null = null
let getArtStylePresetLabelRuntime: ((presetId: string | null | undefined) => string) | null = null
let buildCharacterConceptPromptRuntime: ((input: {
  characterName: string
  subtype?: string | null
  archetypeLabel?: string | null
  conceptArtMode?: 'showcase' | 'continuity' | 'proof_surface' | null
  conceptVariant?: string | null
  captureProfile?: string | null
  artStylePresetLabel?: string | null
  artStyleDescription?: string | null
  projectContextDescription?: string | null
  visualDescription: string
}) => string) | null = null
let buildItemConceptPromptRuntime: ((input: {
  itemName: string
  physicalSubtype?: string | null
  archetypeLabel?: string | null
  worldPlacementRole?: string | null
  pickupContext?: string | null
  conceptArtMode?: 'showcase' | 'continuity' | 'proof_surface' | null
  conceptVariant?: string | null
  captureProfile?: string | null
  artStylePresetLabel?: string | null
  artStyleDescription?: string | null
  projectContextDescription?: string | null
  visualDescription: string
}) => string) | null = null
let buildEnvironmentConceptPromptRuntime: ((input: {
  environmentName: string
  subtype?: string | null
  archetypeLabel?: string | null
  lightingProfile?: string | null
  conceptArtMode?: 'showcase' | 'continuity' | 'proof_surface' | null
  conceptVariant?: string | null
  captureProfile?: string | null
  artStylePresetLabel?: string | null
  artStyleDescription?: string | null
  projectContextDescription?: string | null
  visualDescription: string
}) => string) | null = null

function normalizeGeneratedToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeGeneratedEnvironmentSubtype(value: unknown, fallback = 'exterior') {
  if (typeof value !== 'string') return fallback
  const normalized = normalizeGeneratedToken(value)
  if (CANONICAL_ENVIRONMENT_SUBTYPES.includes(normalized as typeof CANONICAL_ENVIRONMENT_SUBTYPES[number])) {
    return normalized
  }

  if ([
    'tavern',
    'inn',
    'pub',
    'bar',
    'shop',
    'store',
    'market_stall',
    'room',
    'hall',
    'chamber',
    'library',
    'kitchen',
    'forge',
    'workshop',
    'bedroom',
    'cellar',
    'basement',
    'temple_interior',
    'throne_room',
  ].includes(normalized)) {
    return 'interior'
  }

  if ([
    'city',
    'town',
    'village',
    'district',
    'harbor',
    'port',
    'plaza',
    'market',
    'encampment',
    'camp',
  ].includes(normalized)) {
    return 'settlement'
  }

  if ([
    'castle',
    'fort',
    'fortress',
    'tower',
    'bridge',
    'manor',
    'keep',
    'arena',
    'temple',
    'church',
    'shrine',
    'warehouse',
    'building',
    'house',
    'outpost',
    'gate',
  ].includes(normalized)) {
    return 'structure'
  }

  if ([
    'forest',
    'desert',
    'swamp',
    'jungle',
    'tundra',
    'mountain',
    'cave',
    'cavern',
    'canyon',
    'riverland',
  ].includes(normalized)) {
    return normalized === 'cave' || normalized === 'cavern' ? 'dungeon' : 'wilderness'
  }

  if ([
    'landmark',
    'tavern_exterior',
    'blacksmith',
    'graveyard',
    'ruins',
    'dock',
    'crossroads',
    'checkpoint',
  ].includes(normalized)) {
    return 'poi'
  }

  return fallback
}

function normalizeGeneratedTraversalType(value: unknown) {
  if (typeof value !== 'string') return 'walk'
  const normalized = normalizeGeneratedToken(value)
  if (CANONICAL_TRAVERSAL_TYPES.includes(normalized as typeof CANONICAL_TRAVERSAL_TYPES[number])) {
    return normalized
  }
  if (['ground', 'grounded', 'foot', 'on_foot'].includes(normalized)) return 'walk'
  if (['parkour', 'vertical', 'clamber'].includes(normalized)) return 'climb'
  if (['water', 'boating', 'sailing'].includes(normalized)) return 'swim'
  if (['air', 'aerial'].includes(normalized)) return 'fly'
  return 'walk'
}

function normalizeGeneratedScaleTier(value: unknown) {
  if (typeof value !== 'string') return 'site'
  const normalized = normalizeGeneratedToken(value)
  if (CANONICAL_SCALE_TIERS.includes(normalized as typeof CANONICAL_SCALE_TIERS[number])) {
    return normalized
  }
  if (['small', 'single_room', 'roomscale', 'intimate'].includes(normalized)) return 'room'
  if (['building', 'venue', 'compound', 'local'].includes(normalized)) return 'site'
  if (['district', 'area', 'large_area'].includes(normalized)) return 'zone'
  if (['world', 'continent', 'nation'].includes(normalized)) return 'region'
  return 'site'
}

function normalizeGeneratedPhysicalSubtype(value: unknown) {
  if (typeof value !== 'string') return 'pickup'
  const normalized = normalizeGeneratedToken(value)
  if (CANONICAL_PHYSICAL_SUBTYPES.includes(normalized as typeof CANONICAL_PHYSICAL_SUBTYPES[number])) {
    return normalized
  }
  if (['furniture', 'table', 'chair', 'stool', 'bench', 'crate', 'barrel', 'container', 'fixture'].includes(normalized)) {
    return 'world_object'
  }
  if (['gear', 'armor', 'armour', 'clothing', 'wardrobe'].includes(normalized)) {
    return 'equipment'
  }
  if (['sword', 'axe', 'bow', 'blade', 'gun', 'shield'].includes(normalized)) {
    return 'weapon'
  }
  if (['tool', 'device', 'trinket', 'artifact', 'object'].includes(normalized)) {
    return 'prop'
  }
  return 'pickup'
}

function normalizeGeneratedPhysicalItemProfile(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const source = value as Record<string, unknown>
  return {
    ...source,
    physicalSubtype: normalizeGeneratedPhysicalSubtype(source.physicalSubtype),
  }
}

function inferGeneratedEnvironmentInteriorFlag(subtype: string, rawSubtype: unknown, rawFlag: unknown) {
  if (typeof rawFlag === 'boolean') return rawFlag
  if (subtype === 'interior' || subtype === 'dungeon') return true
  if (subtype === 'exterior' || subtype === 'settlement' || subtype === 'wilderness' || subtype === 'biome') return false
  const normalizedRawSubtype = typeof rawSubtype === 'string' ? normalizeGeneratedToken(rawSubtype) : ''
  if ([
    'tavern',
    'inn',
    'pub',
    'bar',
    'shop',
    'store',
    'room',
    'hall',
    'chamber',
    'library',
    'cellar',
    'basement',
    'bedroom',
    'kitchen',
    'forge',
    'workshop',
  ].includes(normalizedRawSubtype)) {
    return true
  }
  return false
}

function normalizeGeneratedEnvironmentProfile(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const source = value as Record<string, unknown>
  const subtype = normalizeGeneratedEnvironmentSubtype(source.subtype, typeof source.isInterior === 'boolean' && source.isInterior ? 'interior' : 'exterior')
  return {
    ...source,
    subtype,
    traversalType: normalizeGeneratedTraversalType(source.traversalType),
    scaleTier: normalizeGeneratedScaleTier(source.scaleTier),
    isInterior: inferGeneratedEnvironmentInteriorFlag(subtype, source.subtype, source.isInterior),
  }
}

type BatchRow = {
  id: string
  draft_id: string
  project_id: string
  prompt: string
  request_summary: string
  planner_mode: string | null
  status: string
  diagnostics: string[] | null
  plan_json: unknown[]
  cinematic_plan: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type JobRow = {
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

type SnapshotComponent = {
  type: string
  config: Record<string, unknown>
}

type SnapshotDefinition = {
  key: string
  kind: string
  name: string
  summary: string
  archetypeKey?: string | null
  components: SnapshotComponent[]
}

type WorldBuildPollSnapshot = z.infer<typeof worldBuildPollRequestSchema>['snapshot'] & {
  definitions: SnapshotDefinition[]
  gameSpec?: {
    theme?: {
      artStylePreset?: string
      artStyleDescription?: string
    }
  } | Record<string, unknown> | null
}

function contentSystemPrompt(kind: string) {
  const profileHint =
    kind === 'character_definition'
      ? [
          'Return exactly one JSON object with keys: name, summary, tags, characterProfile, render3dBinding, resultContext.',
          'characterProfile must contain subtype, bodyClass, controlMode, scaleProfile.',
          'render3dBinding should contain conceptPrompt, generationPrompt, generationStyle.',
        ]
      : kind === 'item_definition'
        ? [
            'Return exactly one JSON object with keys: name, summary, tags, physicalItemProfile, render3dBinding, resultContext.',
            'physicalItemProfile must contain physicalSubtype, worldPlacementRole, pickupContext.',
            'render3dBinding should contain conceptPrompt, generationPrompt, generationStyle.',
          ]
        : [
            'Return exactly one JSON object with keys: name, summary, tags, environmentProfile, environmentRenderBinding, environmentNavigation, environmentSpawnRules, resultContext.',
            'environmentProfile must contain subtype, biome, traversalType, isInterior, scaleTier.',
            'Choose environmentProfile.subtype from: interior, exterior, dungeon, settlement, wilderness, structure, biome, poi.',
            'Use interior for venue-like spaces such as tavern, inn, room, shop, or hall; use settlement for city/town/village; use structure for castle/tower/bridge/fort.',
            'environmentRenderBinding should contain lightingProfile, generationPrompt, generationStyle.',
            'environmentNavigation should contain entryAnchors, regionMarkers, navigationNotes.',
            'environmentSpawnRules should contain characterKeys, itemKeys, resourceNodeKeys.',
          ]

  return [
    'You are generating structured data to complete a GraphCore placeholder definition.',
    'Return JSON only.',
    ...profileHint,
    'resultContext must always be present and must contain title, summary, graphHook, visualDirection.',
    'Do not create IDs or external references beyond the supplied context.',
    `The current placeholder kind is ${kind}.`,
    'Produce concise, implementation-facing content that can directly populate the placeholder.',
    'Favor grounded names, summaries, and generation prompts over lore dumps.',
    'Example resultContext: {"title":"Mage","summary":"A disciplined battle mage with arcane focus.","graphHook":"Can mentor the player in forbidden spells.","visualDirection":"Layered robes, rune-etched staff, cool arcane glow."}',
  ].join('\n')
}

function formatIssues(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join(' | ')
}

async function readInvokeErrorMessage(error: { message?: string; context?: unknown } | null | undefined) {
  if (!error) return 'Unknown Edge Function error.'
  const context = error.context
  if (!(context instanceof Response)) {
    return error.message ?? 'Unknown Edge Function error.'
  }

  try {
    const payload = await context.clone().json() as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
    if (payload.error !== undefined) {
      return JSON.stringify(payload.error)
    }
  } catch {
    // fall through to text body
  }

  try {
    const text = await context.clone().text()
    if (text.trim()) return text
  } catch {
    // ignore secondary parse failure
  }

  return error.message ?? `Edge Function failed with HTTP ${context.status}.`
}

function describeTopLevelKeys(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '<not-an-object>'
  const keys = Object.keys(value as Record<string, unknown>)
  return keys.length > 0 ? keys.join(', ') : '<no-keys>'
}

function normalizeScriptToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function isIncidentalScriptProp(value: string) {
  return [
    'table',
    'chair',
    'stool',
    'bench',
    'bar',
    'counter',
    'mug',
    'cup',
    'glass',
    'bottle',
    'plate',
    'bowl',
  ].includes(normalizeScriptToken(value))
}

function promptMakesPropHero(promptText: string, propName: string) {
  const normalizedPrompt = normalizeScriptToken(promptText)
  const normalizedProp = normalizeScriptToken(propName)
  if (!normalizedPrompt || !normalizedProp) return false
  return [
    `use ${normalizedProp}`,
    `uses ${normalizedProp}`,
    `using ${normalizedProp}`,
    `with ${normalizedProp}`,
    `grab ${normalizedProp}`,
    `grabs ${normalizedProp}`,
    `throw ${normalizedProp}`,
    `throws ${normalizedProp}`,
    `smash ${normalizedProp}`,
    `smashes ${normalizedProp}`,
  ].some((pattern) => normalizedPrompt.includes(pattern))
}

function conceptPromptFromDefinition(definition: SnapshotDefinition, job: JobRow, snapshot: WorldBuildPollSnapshot) {
  if (
    !getArtStylePresetLabelRuntime
    || !buildCharacterConceptPromptRuntime
    || !buildItemConceptPromptRuntime
    || !buildEnvironmentConceptPromptRuntime
  ) {
    throw new Error('Visual asset generation helpers are not initialized.')
  }

  const renderBinding = Array.isArray(definition.components)
    ? definition.components.find((component) => component.type === 'render_3d_binding')
    : null
  const characterProfile = Array.isArray(definition.components)
    ? definition.components.find((component) => component.type === 'character_profile')
    : null
  const physicalItemProfile = Array.isArray(definition.components)
    ? definition.components.find((component) => component.type === 'physical_item_profile')
    : null
  const environmentBinding = Array.isArray(definition.components)
    ? definition.components.find((component) => component.type === 'environment_render_binding')
    : null
  const artStylePreset = typeof snapshot.gameSpec?.theme?.artStylePreset === 'string' ? snapshot.gameSpec.theme.artStylePreset : null
  const artStyleDescription = typeof snapshot.gameSpec?.theme?.artStyleDescription === 'string' ? snapshot.gameSpec.theme.artStyleDescription : ''
  const visualDescription =
    typeof renderBinding?.config?.conceptPrompt === 'string'
      ? String(renderBinding.config.conceptPrompt)
      : typeof renderBinding?.config?.generationPrompt === 'string'
        ? String(renderBinding.config.generationPrompt)
        : typeof environmentBinding?.config?.generationPrompt === 'string'
          ? String(environmentBinding.config.generationPrompt)
          : typeof definition.summary === 'string'
            ? definition.summary
            : 'Complete the concept art for this placeholder.'
  const visualDirection =
    typeof (job.result_context as { visualDirection?: unknown } | null)?.visualDirection === 'string'
      ? String((job.result_context as { visualDirection: string }).visualDirection)
      : visualDescription
  const view = typeof job.target_keys?.view === 'string' ? job.target_keys.view.replace(/_/g, ' ') : null
  const conceptArtMode =
    typeof job.options?.conceptArtMode === 'string'
      ? job.options.conceptArtMode
      : null
  const conceptVariant =
    typeof job.options?.conceptVariant === 'string'
      ? job.options.conceptVariant
      : typeof job.target_keys?.variant === 'string'
        ? job.target_keys.variant
        : null
  const captureProfile =
    typeof job.options?.captureProfileOverride === 'string'
      ? job.options.captureProfileOverride
      : typeof (definition.metadata as { captureProfile?: unknown } | null)?.captureProfile === 'string'
        ? String((definition.metadata as { captureProfile: string }).captureProfile)
        : null

  if (job.kind === 'character_concept_image') {
    const subtype =
      typeof characterProfile?.config?.subtype === 'string'
        ? String(characterProfile.config.subtype)
        : null

    return buildCharacterConceptPrompt({
      characterName: definition.name,
      subtype,
      archetypeLabel: typeof definition.archetypeKey === 'string' ? definition.archetypeKey : null,
      conceptArtMode: conceptArtMode as 'showcase' | 'continuity' | 'proof_surface' | null,
      conceptVariant,
      captureProfile,
      artStylePresetLabel: getArtStylePresetLabelRuntime(artStylePreset),
      artStyleDescription,
      projectContextDescription: snapshot.project.summary,
      visualDescription,
    })
  }

  if (job.kind === 'item_concept_image') {
    const physicalSubtype =
      typeof physicalItemProfile?.config?.physicalSubtype === 'string'
        ? String(physicalItemProfile.config.physicalSubtype)
        : null
    const worldPlacementRole =
      typeof physicalItemProfile?.config?.worldPlacementRole === 'string'
        ? String(physicalItemProfile.config.worldPlacementRole)
        : null
    const pickupContext =
      typeof physicalItemProfile?.config?.pickupContext === 'string'
        ? String(physicalItemProfile.config.pickupContext)
        : null

    return buildItemConceptPromptRuntime({
      itemName: definition.name,
      physicalSubtype,
      archetypeLabel: typeof definition.archetypeKey === 'string' ? definition.archetypeKey : null,
      worldPlacementRole,
      pickupContext,
      conceptArtMode: conceptArtMode as 'showcase' | 'continuity' | 'proof_surface' | null,
      conceptVariant,
      captureProfile,
      artStylePresetLabel: getArtStylePresetLabelRuntime(artStylePreset),
      artStyleDescription,
      projectContextDescription: snapshot.project.summary,
      visualDescription,
    })
  }

  const environmentProfile = Array.isArray(definition.components)
    ? definition.components.find((component) => component.type === 'environment_profile')
    : null
  const subtype =
    typeof environmentProfile?.config?.subtype === 'string'
      ? String(environmentProfile.config.subtype)
      : null
  const lightingProfile =
    typeof environmentBinding?.config?.lightingProfile === 'string'
      ? String(environmentBinding.config.lightingProfile)
      : null
  const environmentVisualDescription = [
    visualDirection,
    view ? `Preferred environment view: ${view}.` : null,
  ].filter((entry): entry is string => Boolean(entry)).join(' ')

  return buildEnvironmentConceptPromptRuntime({
    environmentName: definition.name,
    subtype,
    archetypeLabel: typeof definition.archetypeKey === 'string' ? definition.archetypeKey : null,
    lightingProfile,
    conceptArtMode: conceptArtMode as 'showcase' | 'continuity' | 'proof_surface' | null,
    conceptVariant,
    captureProfile,
    artStylePresetLabel: getArtStylePresetLabelRuntime(artStylePreset),
    artStyleDescription,
    projectContextDescription: snapshot.project.summary,
    visualDescription: environmentVisualDescription || visualDescription,
  })
}

function compositePromptForPlan(plan: z.infer<typeof cinematicPlanSchema>, compositeRefId: string) {
  const composite = plan.compositeRefPlans.find((entry) => entry.id === compositeRefId)
  if (!composite) return 'Create a clean composite reference image for this cinematic relationship.'
  return [
    `Create a clean composite continuity reference for "${composite.title}".`,
    composite.summary ? `Summary: ${composite.summary}.` : null,
    composite.generationPrompt ? `Direction: ${composite.generationPrompt}.` : null,
    composite.stagingNotes ? `Staging notes: ${composite.stagingNotes}.` : null,
    'Keep the subjects clearly readable in one frame with stable costume, prop, and silhouette continuity.',
    'No text, labels, borders, or collage layout.',
  ].filter(Boolean).join(' ')
}

function storyboardPromptForPlan(plan: z.infer<typeof cinematicPlanSchema>, storyboardAssetId: string) {
  if (storyboardAssetId === 'storyboard_sequence') {
    const panelCount = Math.min(16, Math.max(4, plan.shots.length * 2))
    const gridLabel = panelCount <= 4 ? '2x2' : panelCount <= 9 ? '3x3' : '4x4'
    return [
      `Create a comic-ink storyboard board for "${plan.graphName}".`,
      plan.storyboardPlan?.summary ? `Brief: ${plan.storyboardPlan.summary}.` : null,
      `Cover these beats: ${plan.shots.map((shot) => shot.title).join(', ')}.`,
      `Lay out readable storyboard panels in a ${gridLabel} board with clean gutters.`,
      'Use monochrome or restrained grayscale wash, bold inked silhouettes, and clear blocking.',
      'For fast action, expand continuous choreography into multiple panels instead of inventing extra camera cuts.',
      'No lettering, captions, speech bubbles, or polished finished-frame treatment.',
    ].filter(Boolean).join(' ')
  }

  const panel = plan.storyboardPlan?.panels.find((entry) => entry.id === storyboardAssetId) ?? null
  const shot = panel?.shotId ? plan.shots.find((entry) => entry.id === panel.shotId) ?? null : null
  return [
    `Create a comic-ink storyboard panel for "${panel?.title ?? storyboardAssetId}".`,
    shot ? `Shot beat: ${shot.beat}.` : null,
    shot?.compositionGuide ? `Composition: ${shot.compositionGuide}.` : null,
    panel?.notes ? `Notes: ${panel.notes}.` : null,
    'Make the panel clear, high-contrast, inked, and suitable as a visual continuity reference.',
    'Use monochrome or restrained grayscale wash with strong silhouette readability.',
    'No captions, speech bubbles, or decorative borders.',
  ].filter(Boolean).join(' ')
}

function readWorldBuildQueueMetadata(
  resultContext: Record<string, unknown> | null | undefined,
  overrides?: {
    providerRequestId?: string | null
    statusUrl?: string | null
    responseUrl?: string | null
    cancelUrl?: string | null
  },
) {
  return normalizeProviderQueueHandle({
    resultContext,
    overrides,
  })
}

function readSubmittedAt(resultContext: Record<string, unknown> | null | undefined) {
  const context = resultContext && typeof resultContext === 'object'
    ? resultContext
    : {}
  return typeof context.submittedAt === 'string' ? context.submittedAt : null
}

function parseWorldBuildJob(row: JobRow) {
  if (!worldBuildJobSchemaRuntime) {
    throw new Error('worldBuildJobSchema is not initialized.')
  }
  const queueMetadata = readWorldBuildQueueMetadata(row.result_context, {
    providerRequestId: row.provider_request_id,
    statusUrl: row.status_url,
    responseUrl: row.response_url,
    cancelUrl: row.cancel_url,
  })
  return worldBuildJobSchemaRuntime.parse({
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

async function loadBatch(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  batchId: string,
) {
  const batchResponse = await client
    .from('world_build_batches')
    .select('id, draft_id, project_id, prompt, request_summary, planner_mode, status, diagnostics, plan_json, cinematic_plan, created_at, updated_at')
    .eq('id', batchId)
    .single()

  if (batchResponse.error || !batchResponse.data) {
    throw new Error(batchResponse.error?.message ?? `World build batch ${batchId} was not found.`)
  }

  const jobsResponse = await client
    .from('world_build_jobs')
    .select('id, batch_id, plan_item_id, kind, status, depends_on_job_ids, target_keys, prompt, options, provider_request_id, status_url, response_url, cancel_url, result_context, error_message, order_index, created_at, updated_at')
    .eq('batch_id', batchId)
    .order('order_index', { ascending: true })

  if (jobsResponse.error) {
    throw new Error(jobsResponse.error.message)
  }

  return {
    batch: batchResponse.data as BatchRow,
    jobs: (jobsResponse.data ?? []) as JobRow[],
  }
}

async function loadBatchResources(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  projectId: string,
  batchId: string,
) {
  const batchJobsResponse = await client
    .from('world_build_jobs')
    .select('kind, target_keys')
    .eq('batch_id', batchId)

  if (batchJobsResponse.error) {
    throw new Error(batchJobsResponse.error.message)
  }

  const existingDefinitionKeys = Array.from(new Set(
    ((batchJobsResponse.data ?? []) as Array<{ kind?: string | null; target_keys?: Record<string, unknown> | null }>)
      .flatMap((job) => {
        const definitionKey = typeof job.target_keys?.definitionKey === 'string' ? job.target_keys.definitionKey : null
        if (!definitionKey) return []
        if (job.kind === 'character_concept_image' || job.kind === 'item_concept_image' || job.kind === 'environment_concept_image') {
          return [definitionKey]
        }
        return []
      }),
  ))

  const [definitionsResponse, graphsResponse, graphNodesResponse, graphEdgesResponse, assetsResponse] = await Promise.all([
    client
      .from('project_definitions')
      .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
      .eq('draft_id', draftId)
      .contains('metadata', { generation: { batchId } }),
    client
      .from('draft_graphs')
      .select('id, key, name, graph_type, summary, entry_node_key, metadata, llm_hints')
      .eq('draft_id', draftId)
      .contains('metadata', { generation: { batchId } }),
    client
      .from('draft_graph_nodes')
      .select('id, graph_id, key, node_type, title, template_key, subtitle, position_x, position_y, body, condition_expr, effect_ops, ports, display, metadata'),
    client
      .from('draft_graph_edges')
      .select('id, graph_id, key, source_node_key, source_port, target_node_key, target_port, label, condition_expr, metadata'),
    client
      .from('project_assets')
      .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
      .eq('project_id', projectId)
      .contains('metadata', { generation: { batchId } }),
  ])

  if (definitionsResponse.error || graphsResponse.error || assetsResponse.error || graphNodesResponse.error || graphEdgesResponse.error) {
    throw new Error(
      definitionsResponse.error?.message
      ?? graphsResponse.error?.message
      ?? graphNodesResponse.error?.message
      ?? graphEdgesResponse.error?.message
      ?? assetsResponse.error?.message
      ?? 'Failed to load world build resources.',
    )
  }

  const directDefinitionsResponse = existingDefinitionKeys.length > 0
    ? await client
        .from('project_definitions')
        .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
        .eq('draft_id', draftId)
        .in('key', existingDefinitionKeys)
    : { data: [], error: null }

  if (directDefinitionsResponse.error) {
    throw new Error(directDefinitionsResponse.error.message)
  }

  const mergedDefinitionRows = Array.from(
    new Map(
      [...(definitionsResponse.data ?? []), ...(directDefinitionsResponse.data ?? [])].map((definition) => [definition.key, definition]),
    ).values(),
  )

  const definitions = await Promise.all(mergedDefinitionRows.map(async (definition) => {
    const componentsResponse = await client
      .from('project_definition_components')
      .select('component_type, config')
      .eq('definition_id', definition.id)

    if (componentsResponse.error) {
      throw new Error(componentsResponse.error.message)
    }

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
      fieldValues: [],
      customFields: [],
      components: (componentsResponse.data ?? []).map((component) => ({
        type: component.component_type,
        config: component.config ?? {},
      })),
    }
  }))

  const graphRows = graphsResponse.data ?? []
  const nodes = graphNodesResponse.data ?? []
  const edges = graphEdgesResponse.data ?? []

  const graphs = graphRows.map((graph) => ({
    id: graph.id,
    key: graph.key,
    name: graph.name,
    graphType: graph.graph_type,
    summary: graph.summary ?? '',
    entryNodeKey: graph.entry_node_key,
    metadata: graph.metadata ?? {},
    llmHints: graph.llm_hints ?? {},
    nodes: nodes
      .filter((node) => node.graph_id === graph.id)
      .map((node) => ({
        id: node.id,
        key: node.key,
        type: node.node_type,
        title: node.title,
        templateKey: node.template_key,
        subtitle: node.subtitle,
        position: { x: Number(node.position_x), y: Number(node.position_y) },
        body: node.body ?? {},
        condition: node.condition_expr,
        effects: node.effect_ops ?? [],
        ports: node.ports ?? [],
        display: node.display ?? {},
        metadata: node.metadata ?? {},
      })),
    edges: edges
      .filter((edge) => edge.graph_id === graph.id)
      .map((edge) => ({
        id: edge.id,
        key: edge.key,
        source: { nodeKey: edge.source_node_key, portId: edge.source_port },
        target: { nodeKey: edge.target_node_key, portId: edge.target_port },
        label: edge.label,
        condition: edge.condition_expr,
        metadata: edge.metadata ?? {},
      })),
  }))

  const assets = (assetsResponse.data ?? []).map((asset) => ({
    id: asset.id,
    key: asset.key,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mime_type,
    storagePath: asset.storage_path,
    metadata: asset.metadata ?? {},
    llmHints: asset.llm_hints ?? {},
  }))

  return { definitions, graphs, assets }
}

async function updateJob(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  jobId: string,
  changes: Record<string, unknown>,
) {
  const response = await client.from('world_build_jobs').update(changes).eq('id', jobId)
  if (response.error) throw new Error(response.error.message)
}

async function updateBatch(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  batchId: string,
  changes: Record<string, unknown>,
) {
  const response = await client.from('world_build_batches').update(changes).eq('id', batchId)
  if (response.error) throw new Error(response.error.message)
}

async function upsertDefinitionComponent(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
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

async function markDefinitionGenerationState(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  definitionKey: string,
  generation: Record<string, unknown>,
) {
  const definitionRow = await client.from('project_definitions').select('metadata').eq('draft_id', draftId).eq('key', definitionKey).maybeSingle()
  if (definitionRow.error || !definitionRow.data) return

  const currentMetadata =
    typeof definitionRow.data.metadata === 'object' && definitionRow.data.metadata !== null
      ? definitionRow.data.metadata as Record<string, unknown>
      : {}

  await client.from('project_definitions').update({
    metadata: {
      ...currentMetadata,
      generation,
    },
  }).eq('draft_id', draftId).eq('key', definitionKey)
}

async function markGraphGenerationState(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  graphKey: string,
  generation: Record<string, unknown>,
) {
  const graphRow = await client.from('draft_graphs').select('metadata').eq('draft_id', draftId).eq('key', graphKey).maybeSingle()
  if (graphRow.error || !graphRow.data) return

  const currentMetadata =
    typeof graphRow.data.metadata === 'object' && graphRow.data.metadata !== null
      ? graphRow.data.metadata as Record<string, unknown>
      : {}

  await client.from('draft_graphs').update({
    metadata: {
      ...currentMetadata,
      generation,
    },
  }).eq('draft_id', draftId).eq('key', graphKey)
}

function terminalStatusFromJobs(jobs: WorldBuildJob[]) {
  const failed = jobs.some((job) => job.status === 'failed')
  const queuedOrRunning = jobs.some((job) => job.status === 'queued' || job.status === 'running')

  if (queuedOrRunning) return 'running'
  if (failed && jobs.some((job) => job.status === 'succeeded')) return 'completed_with_errors'
  if (failed) return 'failed'
  return 'completed'
}

async function loadDefinitionRecordsByKeys(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  definitionKeys: string[],
) {
  if (definitionKeys.length === 0) return []

  const definitionsResponse = await client
    .from('project_definitions')
    .select('id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, llm_hints, asset_refs, definition_data')
    .eq('draft_id', draftId)
    .in('key', definitionKeys)

  if (definitionsResponse.error) {
    throw new Error(definitionsResponse.error.message)
  }

  return await Promise.all((definitionsResponse.data ?? []).map(async (definition) => {
    const componentsResponse = await client
      .from('project_definition_components')
      .select('component_type, config')
      .eq('definition_id', definition.id)

    if (componentsResponse.error) {
      throw new Error(componentsResponse.error.message)
    }

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
      fieldValues: [],
      customFields: [],
      components: (componentsResponse.data ?? []).map((component) => ({
        type: component.component_type,
        config: component.config ?? {},
      })),
    }
  }))
}

async function loadProjectAssetsByKeys(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  projectId: string,
  assetKeys: string[],
) {
  if (assetKeys.length === 0) return []

  const assetsResponse = await client
    .from('project_assets')
    .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
    .eq('project_id', projectId)
    .in('key', assetKeys)

  if (assetsResponse.error) {
    throw new Error(assetsResponse.error.message)
  }

  return (assetsResponse.data ?? []).map((asset) => ({
    id: asset.id,
    key: asset.key,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mime_type,
    storagePath: asset.storage_path,
    metadata: asset.metadata ?? {},
    llmHints: asset.llm_hints ?? {},
  }))
}

async function replaceGraphContents(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  draftId: string,
  graph: {
    key: string
    name: string
    graphType: string
    summary: string
    entryNodeKey: string
    metadata: Record<string, unknown>
    llmHints: Record<string, unknown>
    nodes: Array<{
      key: string
      type: string
      title: string
      templateKey: string
      subtitle: string | null
      position: { x: number; y: number }
      body: Record<string, unknown>
      condition: unknown
      effects: unknown[]
      ports: unknown[]
      display: Record<string, unknown>
      metadata: Record<string, unknown>
    }>
    edges: Array<{
      key: string
      source: { nodeKey: string; portId: string }
      target: { nodeKey: string; portId: string }
      label: string | null
      condition: unknown
      metadata: Record<string, unknown>
    }>
  },
) {
  const graphRow = await client
    .from('draft_graphs')
    .select('id')
    .eq('draft_id', draftId)
    .eq('key', graph.key)
    .single()

  if (graphRow.error || !graphRow.data) {
    throw new Error(graphRow.error?.message ?? `Graph ${graph.key} was not found.`)
  }

  const graphId = graphRow.data.id
  const deleteEdges = await client.from('draft_graph_edges').delete().eq('graph_id', graphId)
  if (deleteEdges.error) throw new Error(deleteEdges.error.message)
  const deleteNodes = await client.from('draft_graph_nodes').delete().eq('graph_id', graphId)
  if (deleteNodes.error) throw new Error(deleteNodes.error.message)

  const updateGraph = await client
    .from('draft_graphs')
    .update({
      name: graph.name,
      graph_type: graph.graphType,
      summary: graph.summary,
      entry_node_key: graph.entryNodeKey,
      metadata: graph.metadata,
      llm_hints: graph.llmHints,
    })
    .eq('draft_id', draftId)
    .eq('key', graph.key)

  if (updateGraph.error) throw new Error(updateGraph.error.message)

  if (graph.nodes.length > 0) {
    const nodeInsert = await client.from('draft_graph_nodes').insert(
      graph.nodes.map((node) => ({
        graph_id: graphId,
        key: node.key,
        node_type: node.type,
        title: node.title,
        template_key: node.templateKey,
        subtitle: node.subtitle,
        position_x: node.position.x,
        position_y: node.position.y,
        body: node.body,
        condition_expr: node.condition,
        effect_ops: node.effects,
        ports: node.ports,
        display: node.display,
        metadata: node.metadata,
      })),
    )

    if (nodeInsert.error) throw new Error(nodeInsert.error.message)
  }

  if (graph.edges.length > 0) {
    const edgeInsert = await client.from('draft_graph_edges').insert(
      graph.edges.map((edge) => ({
        graph_id: graphId,
        key: edge.key,
        source_node_key: edge.source.nodeKey,
        source_port: edge.source.portId,
        target_node_key: edge.target.nodeKey,
        target_port: edge.target.portId,
        label: edge.label,
        condition_expr: edge.condition,
        metadata: edge.metadata,
      })),
    )

    if (edgeInsert.error) throw new Error(edgeInsert.error.message)
  }
}

async function loadCinematicRunsForBatchJobs(
  client: Awaited<ReturnType<typeof requireUserClient>>['client'],
  jobs: JobRow[],
) {
  const runIds = jobs
    .map((job) => {
      const resultContext = job.result_context ?? {}
      return typeof resultContext.childCinematicRunId === 'string' ? resultContext.childCinematicRunId : null
    })
    .filter((value): value is string => Boolean(value))

  if (runIds.length === 0) return []

  const runsResponse = await client
    .from('cinematic_runs')
    .select('id, draft_id, project_id, graph_key, graph_name, mode, status, shot_node_key, diagnostics, created_at, updated_at')
    .in('id', runIds)

  if (runsResponse.error) {
    throw new Error(runsResponse.error.message)
  }

  const jobResponse = await client
    .from('cinematic_run_jobs')
    .select('id, run_id, graph_key, shot_node_key, kind, status, order_index, depends_on_job_ids, still_asset_key, video_asset_key, provider, model, provider_request_id, error_message, prompt, result_context, created_at, updated_at')
    .in('run_id', runIds)

  if (jobResponse.error) {
    throw new Error(jobResponse.error.message)
  }

  const cinematicJobs = (jobResponse.data ?? []).map((row) => toCinematicRunJob(row as Record<string, unknown>))
  return (runsResponse.data ?? []).map((row) => toCinematicRun({
    row: row as Record<string, unknown>,
    jobs: cinematicJobs.filter((job) => job.runId === row.id),
  }))
}

function buildFallbackAuthorPlan(input: {
  cinematicPlan: z.infer<typeof cinematicPlanSchema>
  resolvedDefinitions: Array<{ key: string; kind: string; name: string; summary?: string }>
  resolvedEntityRefs: Array<CinematicPlan['entityRefs'][number] & { definitionKey: string }>
  compositeAssetKeys?: Record<string, string>
  storyboardAssetKeys?: {
    sequenceAssetKey?: string | null
    panelAssetKeys?: Record<string, string>
  }
}) {
  const resolvedDefinitionByKey = new Map(input.resolvedDefinitions.map((definition) => [definition.key, definition]))

  return cinematicGraphAuthorSchema.parse({
    graphName: input.cinematicPlan.graphName,
    graphSummary: input.cinematicPlan.graphSummary,
    graphSettings: input.cinematicPlan.graphSettings ?? {},
    assetRefs: [
      ...input.resolvedEntityRefs.map((entityRef) => ({
        id: entityRef.id,
        nodeType: 'asset_ref' as const,
        templateKey:
          entityRef.kind === 'character'
            ? 'character_ref'
            : entityRef.kind === 'environment'
              ? 'location_ref'
              : 'prop_ref',
        definitionKey: entityRef.definitionKey,
        assetKey: null,
        assetRole: entityRef.kind,
        title: resolvedDefinitionByKey.get(entityRef.definitionKey)?.name ?? entityRef.sourceName,
        subtitle: resolvedDefinitionByKey.get(entityRef.definitionKey)?.kind ?? entityRef.kind,
        stagingNotes: entityRef.role,
        role: entityRef.role,
        priority: entityRef.kind === 'character' ? 70 : entityRef.kind === 'environment' ? 60 : 55,
        sourceRefIds: [],
        relationshipType: null,
      })),
      ...input.cinematicPlan.compositeRefPlans.map((composite) => ({
        id: composite.id,
        nodeType: 'composite_ref' as const,
        templateKey:
          composite.relationshipType === 'wear'
            ? 'wardrobe_ref'
            : composite.relationshipType === 'ally_of'
              ? 'paired_subject_ref'
              : 'equipped_character_ref',
        definitionKey: null,
        assetKey: input.compositeAssetKeys?.[composite.id] ?? composite.outputAssetKey ?? null,
        assetRole: 'composite' as const,
        title: composite.title,
        subtitle: composite.summary || 'Composite reference',
        stagingNotes: composite.stagingNotes,
        role: 'composite',
        priority: composite.priority,
        sourceRefIds: composite.sourceRefIds,
        relationshipType: composite.relationshipType,
      })),
      ...(input.cinematicPlan.storyboardPlan?.mode && input.cinematicPlan.storyboardPlan.mode !== 'none'
        ? [
            ...(input.cinematicPlan.storyboardPlan.sequenceAssetKey || input.storyboardAssetKeys?.sequenceAssetKey
              ? [{
                  id: 'storyboard_sequence',
                  nodeType: 'storyboard_ref' as const,
                  templateKey: 'sequence_board_ref',
                  definitionKey: null,
                  assetKey: input.storyboardAssetKeys?.sequenceAssetKey ?? input.cinematicPlan.storyboardPlan.sequenceAssetKey,
                  assetRole: 'storyboard' as const,
                  title: 'Sequence Board',
                  subtitle: input.cinematicPlan.storyboardPlan.summary || 'Storyboard sheet',
                  stagingNotes: input.cinematicPlan.storyboardPlan.summary,
                  role: 'storyboard',
                  priority: 95,
                  sourceRefIds: [],
                  relationshipType: null,
                }]
              : []),
            ...input.cinematicPlan.storyboardPlan.panels.map((panel) => ({
              id: panel.id,
              nodeType: 'storyboard_ref' as const,
              templateKey: 'shot_panel_ref',
              definitionKey: null,
              assetKey: input.storyboardAssetKeys?.panelAssetKeys?.[panel.id] ?? panel.assetKey ?? null,
              assetRole: 'storyboard' as const,
              title: panel.title || `Panel ${panel.orderIndex + 1}`,
              subtitle: 'Shot panel',
              stagingNotes: panel.notes,
              role: 'storyboard',
              priority: 92,
              sourceRefIds: [],
              relationshipType: null,
            })),
          ]
        : []),
    ],
    shots: input.cinematicPlan.shots.map((shot) => ({
      id: shot.id,
      title: shot.title,
      subtitle: null,
      beat: shot.beat,
      visualPrompt: shot.visualPrompt,
      compositionGuide: shot.compositionGuide,
      shotType: shot.shotType,
      framing: shot.framing,
      cameraAngle: shot.cameraAngle,
      cameraMovement: shot.cameraMovement,
      lensPreference: shot.lensPreference,
      durationSeconds: shot.durationSeconds,
      participantRefIds: shot.participantRefIds,
      locationRefId: shot.locationRefId,
      propRefIds: shot.propRefIds,
      sourceRefIds: Array.from(new Set([
        ...(input.cinematicPlan.storyboardPlan?.mode && input.cinematicPlan.storyboardPlan.mode !== 'none'
          ? ['storyboard_sequence', `panel_${shot.id}`].filter((refId) => (
            refId === 'storyboard_sequence'
              ? Boolean(input.storyboardAssetKeys?.sequenceAssetKey ?? input.cinematicPlan.storyboardPlan?.sequenceAssetKey)
              : input.cinematicPlan.storyboardPlan?.panels.some((panel) => panel.id === refId)
          ))
          : []),
        ...input.cinematicPlan.compositeRefPlans
          .filter((composite) => (
            composite.sourceRefIds.some((refId) => shot.participantRefIds.includes(refId) || shot.propRefIds.includes(refId))
          ))
          .map((composite) => composite.id),
        ...shot.participantRefIds,
        ...shot.propRefIds,
        ...(shot.locationRefId ? [shot.locationRefId] : []),
      ])),
      compositeRefIds: input.cinematicPlan.compositeRefPlans
        .filter((composite) => (
          composite.sourceRefIds.some((refId) => shot.participantRefIds.includes(refId) || shot.propRefIds.includes(refId))
        ))
        .map((composite) => composite.id),
      storyboardRefIds: [
        ...(input.storyboardAssetKeys?.sequenceAssetKey ? ['storyboard_sequence'] : []),
        ...(input.cinematicPlan.storyboardPlan?.panels.some((panel) => panel.id === `panel_${shot.id}`) ? [`panel_${shot.id}`] : []),
      ],
      beats: shot.beats,
      dialogue: shot.dialogue,
      actions: shot.actions,
      audio: shot.audio,
    })),
  })
}

function mergeAuthorPlanWithFallback(input: {
  fallbackPlan: z.infer<typeof cinematicGraphAuthorSchema>
  candidatePlan: z.infer<typeof cinematicGraphAuthorSchema>
}) {
  const fallbackAssetRefById = new Map(input.fallbackPlan.assetRefs.map((assetRef) => [assetRef.id, assetRef]))
  const fallbackAssetRefByDefinitionKey = new Map(
    input.fallbackPlan.assetRefs
      .filter((assetRef) => typeof assetRef.definitionKey === 'string' && assetRef.definitionKey.length > 0)
      .map((assetRef) => [assetRef.definitionKey, assetRef] as const),
  )
  const mergedAssetRefs = new Map<string, z.infer<typeof cinematicGraphAuthorSchema>['assetRefs'][number]>()

  for (const fallbackAssetRef of input.fallbackPlan.assetRefs) {
    mergedAssetRefs.set(fallbackAssetRef.id, fallbackAssetRef)
  }

  for (const candidateAssetRef of input.candidatePlan.assetRefs) {
    const fallbackAssetRef =
      fallbackAssetRefById.get(candidateAssetRef.id)
      ?? fallbackAssetRefByDefinitionKey.get(candidateAssetRef.definitionKey)
      ?? null
    if (!fallbackAssetRef) continue
    const mergedAssetRef = {
      ...fallbackAssetRef,
      ...candidateAssetRef,
      id: fallbackAssetRef.id,
      nodeType: fallbackAssetRef.nodeType,
      templateKey: fallbackAssetRef.templateKey,
      definitionKey: fallbackAssetRef.definitionKey,
      assetRole: fallbackAssetRef.assetRole,
    }
    mergedAssetRefs.set(mergedAssetRef.id, mergedAssetRef)
  }

  const availableSourceRefIds = new Set(Array.from(mergedAssetRefs.keys()))
  const fallbackShotById = new Map(input.fallbackPlan.shots.map((shot) => [shot.id, shot]))

  const mergedShots = input.fallbackPlan.shots.map((fallbackShot, index) => {
    const candidateShot =
      input.candidatePlan.shots.find((shot) => shot.id === fallbackShot.id)
      ?? input.candidatePlan.shots[index]
      ?? null

    if (!candidateShot) {
      return fallbackShot
    }

    const filteredCandidateSourceRefIds = candidateShot.sourceRefIds.filter((sourceRefId) => availableSourceRefIds.has(sourceRefId))
    const mergedShot = {
      ...fallbackShot,
      ...candidateShot,
      id: fallbackShot.id,
      participantRefIds: candidateShot.participantRefIds.length > 0 ? candidateShot.participantRefIds : fallbackShot.participantRefIds,
      locationRefId: candidateShot.locationRefId ?? fallbackShot.locationRefId,
      propRefIds: candidateShot.propRefIds.length > 0 ? candidateShot.propRefIds : fallbackShot.propRefIds,
      sourceRefIds: filteredCandidateSourceRefIds.length > 0 ? filteredCandidateSourceRefIds : fallbackShot.sourceRefIds,
      compositeRefIds: candidateShot.compositeRefIds.length > 0 ? candidateShot.compositeRefIds : fallbackShot.compositeRefIds,
      storyboardRefIds: candidateShot.storyboardRefIds.length > 0 ? candidateShot.storyboardRefIds : fallbackShot.storyboardRefIds,
      beats: candidateShot.beats.length > 0 ? candidateShot.beats : fallbackShot.beats,
      dialogue: candidateShot.dialogue.length > 0 ? candidateShot.dialogue : fallbackShot.dialogue,
      actions: candidateShot.actions.length > 0 ? candidateShot.actions : fallbackShot.actions,
      audio: candidateShot.audio.length > 0 ? candidateShot.audio : fallbackShot.audio,
    }

    return mergedShot
  })

  for (const candidateShot of input.candidatePlan.shots) {
    if (fallbackShotById.has(candidateShot.id)) continue
    mergedShots.push({
      ...candidateShot,
      sourceRefIds: candidateShot.sourceRefIds.filter((sourceRefId) => availableSourceRefIds.has(sourceRefId)),
    })
  }

  return cinematicGraphAuthorSchema.parse({
    ...input.fallbackPlan,
    ...input.candidatePlan,
    assetRefs: Array.from(mergedAssetRefs.values()),
    shots: mergedShots,
  })
}

function collectRequiredShotSourceRefIds(shot: {
  participantRefIds: string[]
  locationRefId: string | null
  propRefIds: string[]
  compositeRefIds?: string[]
  storyboardRefIds?: string[]
}) {
  return Array.from(new Set([
    ...(shot.storyboardRefIds ?? []),
    ...(shot.compositeRefIds ?? []),
    ...shot.participantRefIds,
    ...shot.propRefIds,
    ...(shot.locationRefId ? [shot.locationRefId] : []),
  ]))
}

function repairDialogueBeats(
  dialogue: z.infer<typeof cinematicGraphAuthorSchema>['shots'][number]['dialogue'],
  fallbackDialogue: z.infer<typeof cinematicGraphAuthorSchema>['shots'][number]['dialogue'],
  participantRefIds: string[],
) {
  if (dialogue.length === 0) return fallbackDialogue
  return dialogue.map((entry, index) => ({
    ...entry,
    speakerRefId:
      entry.speakerRefId
      ?? fallbackDialogue[index]?.speakerRefId
      ?? participantRefIds[index % Math.max(participantRefIds.length, 1)]
      ?? null,
  }))
}

function repairActionBeats(
  actions: z.infer<typeof cinematicGraphAuthorSchema>['shots'][number]['actions'],
  fallbackActions: z.infer<typeof cinematicGraphAuthorSchema>['shots'][number]['actions'],
  participantRefIds: string[],
  propRefIds: string[],
) {
  if (actions.length === 0) return fallbackActions
  return actions.map((entry, index) => ({
    ...entry,
    actorRefId:
      entry.actorRefId
      ?? fallbackActions[index]?.actorRefId
      ?? participantRefIds[0]
      ?? null,
    targetRefId:
      entry.targetRefId
      ?? fallbackActions[index]?.targetRefId
      ?? participantRefIds[1]
      ?? participantRefIds[0]
      ?? null,
    propRefId:
      entry.propRefId
      ?? fallbackActions[index]?.propRefId
      ?? propRefIds[0]
      ?? null,
  }))
}

function repairAudioBeats(
  audio: z.infer<typeof cinematicGraphAuthorSchema>['shots'][number]['audio'],
  fallbackAudio: z.infer<typeof cinematicGraphAuthorSchema>['shots'][number]['audio'],
  locationRefId: string | null,
) {
  if (audio.length === 0) return fallbackAudio
  return audio.map((entry, index) => ({
    ...entry,
    sourceRefId:
      entry.sourceRefId
      ?? fallbackAudio[index]?.sourceRefId
      ?? locationRefId
      ?? null,
  }))
}

function validateAndRepairCinematicAuthorPlan(input: {
  cinematicPlan: z.infer<typeof cinematicPlanSchema>
  fallbackPlan: z.infer<typeof cinematicGraphAuthorSchema>
  authorPlan: z.infer<typeof cinematicGraphAuthorSchema>
}) {
  const diagnostics: string[] = []
  const fallbackAssetById = new Map(input.fallbackPlan.assetRefs.map((assetRef) => [assetRef.id, assetRef]))
  const authorAssetById = new Map(input.authorPlan.assetRefs.map((assetRef) => [assetRef.id, assetRef]))
  const repairedAssetRefs = new Map(input.authorPlan.assetRefs.map((assetRef) => [assetRef.id, assetRef]))

  for (const shotPlan of input.cinematicPlan.shots) {
    const requiredSourceRefIds = collectRequiredShotSourceRefIds(shotPlan)
    for (const sourceRefId of requiredSourceRefIds) {
      if (repairedAssetRefs.has(sourceRefId)) continue
      const fallbackAsset = fallbackAssetById.get(sourceRefId)
      if (!fallbackAsset) continue
      repairedAssetRefs.set(sourceRefId, fallbackAsset)
      diagnostics.push(`Repaired missing asset_ref for planned source "${fallbackAsset.title}".`)
    }
  }

  const repairedShots = input.authorPlan.shots.map((shot) => ({ ...shot }))
  const repairedShotById = new Map(repairedShots.map((shot) => [shot.id, shot]))

  for (const shotPlan of input.cinematicPlan.shots) {
    const fallbackShot = input.fallbackPlan.shots.find((entry) => entry.id === shotPlan.id) ?? null
    const authorShot = repairedShotById.get(shotPlan.id) ?? null
    const requiredSourceRefIds = collectRequiredShotSourceRefIds(shotPlan)

    if (!fallbackShot) continue

    if (!authorShot) {
      repairedShots.push({ ...fallbackShot })
      diagnostics.push(`Inserted missing cinematic shot "${fallbackShot.title}" from fallback plan.`)
      continue
    }

    const nextSourceRefIds = Array.from(new Set([
      ...authorShot.sourceRefIds.filter((sourceRefId) => repairedAssetRefs.has(sourceRefId)),
      ...requiredSourceRefIds,
    ]))

    const missingRequiredSourceRefIds = requiredSourceRefIds.filter((sourceRefId) => !authorShot.sourceRefIds.includes(sourceRefId))
    if (missingRequiredSourceRefIds.length > 0) {
      diagnostics.push(`Repaired shot "${authorShot.title}" to reconnect ${missingRequiredSourceRefIds.length} planned source input${missingRequiredSourceRefIds.length === 1 ? '' : 's'}.`)
    }

    const participantMismatch =
      authorShot.participantRefIds.length !== shotPlan.participantRefIds.length
      || shotPlan.participantRefIds.some((sourceRefId) => !authorShot.participantRefIds.includes(sourceRefId))
    const propMismatch =
      authorShot.propRefIds.length !== shotPlan.propRefIds.length
      || shotPlan.propRefIds.some((sourceRefId) => !authorShot.propRefIds.includes(sourceRefId))
    const locationMismatch = (authorShot.locationRefId ?? null) !== (shotPlan.locationRefId ?? null)

    if (participantMismatch || propMismatch || locationMismatch) {
      diagnostics.push(`Repaired shot "${authorShot.title}" to preserve planned participants, location, or props.`)
    }

    repairedShotById.set(shotPlan.id, {
      ...authorShot,
      participantRefIds: [...shotPlan.participantRefIds],
      locationRefId: shotPlan.locationRefId,
      propRefIds: [...shotPlan.propRefIds],
      sourceRefIds: nextSourceRefIds,
      compositeRefIds: [...(authorShot.compositeRefIds.length > 0 ? authorShot.compositeRefIds : fallbackShot.compositeRefIds)],
      storyboardRefIds: [...(authorShot.storyboardRefIds.length > 0 ? authorShot.storyboardRefIds : fallbackShot.storyboardRefIds)],
      compositionGuide: authorShot.compositionGuide.trim() || fallbackShot.compositionGuide,
      beats: authorShot.beats.length > 0 ? authorShot.beats : fallbackShot.beats,
      dialogue: repairDialogueBeats(authorShot.dialogue, fallbackShot.dialogue, shotPlan.participantRefIds),
      actions: repairActionBeats(authorShot.actions, fallbackShot.actions, shotPlan.participantRefIds, shotPlan.propRefIds),
      audio: repairAudioBeats(authorShot.audio, fallbackShot.audio, shotPlan.locationRefId),
    })
  }

  const orderedShots = input.fallbackPlan.shots.map((fallbackShot) => repairedShotById.get(fallbackShot.id) ?? fallbackShot)
  const extraShots = repairedShots.filter((shot) => !input.fallbackPlan.shots.some((fallbackShot) => fallbackShot.id === shot.id))

  const repairedPlan = cinematicGraphAuthorSchema.parse({
    ...input.authorPlan,
    assetRefs: Array.from(repairedAssetRefs.values()),
    shots: [...orderedShots, ...extraShots],
  })

  return {
    repairedPlan,
    diagnostics: Array.from(new Set(diagnostics)),
    repairApplied: diagnostics.length > 0,
    sourceCoverage: input.cinematicPlan.shots.map((shotPlan) => {
      const repairedShot = repairedPlan.shots.find((entry) => entry.id === shotPlan.id) ?? null
      const requiredSourceRefIds = collectRequiredShotSourceRefIds(shotPlan)
      const connectedSourceRefIds = repairedShot?.sourceRefIds.filter((sourceRefId) => repairedAssetRefs.has(sourceRefId)) ?? []
      return {
        shotId: shotPlan.id,
        expectedSourceCount: requiredSourceRefIds.length,
        connectedSourceCount: connectedSourceRefIds.length,
        missingSourceRefIds: requiredSourceRefIds.filter((sourceRefId) => !connectedSourceRefIds.includes(sourceRefId)),
      }
    }),
    modelAssetRefCount: authorAssetById.size,
  }
}

Deno.serve(async (request) => {
  const preflight = maybeHandleOptions(request)
  if (preflight) return preflight

  try {
    const [
      cinematicsDomain,
      cinematicCompilerDomain,
      worldBuildDomain,
      artStylePresetsDomain,
      visualAssetGenerationDomain,
      authModule,
      sharedCinematicsModule,
      worldBuildPlaceholdersModule,
      falWebhooksModule,
      worldBuildModule,
      assetsDomain,
      worldBuildCinematicsModule,
    ] = await Promise.all([
      import('../../../src/domain/cinematics.ts'),
      import('../../../src/domain/cinematicScriptCompiler.ts'),
      import('../../../src/domain/worldBuild.ts'),
      import('../../../src/domain/artStylePresets.ts'),
      import('../../../src/domain/visualAssetGeneration.ts'),
      import('../_shared/auth.ts'),
      import('../_shared/cinematics.ts'),
      import('../_shared/world-build-placeholders.ts'),
      import('../_shared/fal-webhooks.ts'),
      import('../_shared/world-build.ts'),
      import('../../../src/domain/assets.ts'),
      import('../_shared/world-build-cinematics.ts'),
    ])
    const { cinematicRunStatusResponseSchema, cinematicScriptDocSchema, materializeCinematicGraphSettings } = cinematicsDomain
    const { compileCinematicGraphFromScriptDoc } = cinematicCompilerDomain
    const {
      cinematicPlanSchema,
      normalizeCinematicPlanForTransport,
      worldBuildBatchSchema,
      worldBuildJobSchema,
      worldBuildPollRequestSchema,
      worldBuildStatusResponseSchema,
    } = worldBuildDomain
    worldBuildJobSchemaRuntime = worldBuildJobSchema
    const { getArtStylePresetLabel } = artStylePresetsDomain
    const { buildCharacterConceptPrompt, buildEnvironmentConceptPrompt, buildItemConceptPrompt, extractFalImageUrls } = visualAssetGenerationDomain
    getArtStylePresetLabelRuntime = getArtStylePresetLabel
    buildCharacterConceptPromptRuntime = buildCharacterConceptPrompt
    buildItemConceptPromptRuntime = buildItemConceptPrompt
    buildEnvironmentConceptPromptRuntime = buildEnvironmentConceptPrompt
    const { requireUserClient } = authModule
    const {
      completeReservedGeneratedImageAsset,
      isTerminalCinematicRunStatus,
      markGeneratedImageAssetFailed,
      resolveDefinitionDisplayAssetKey,
      resolveAssetUrl,
      toCinematicRun,
      toCinematicRunJob,
    } = sharedCinematicsModule
    const { buildDefaultDefinitionComponents } = worldBuildPlaceholdersModule
    const { buildFalWebhookUrl } = falWebhooksModule
    const { runStructuredWorldBuildModel, isTerminalWorldBuildStatus } = worldBuildModule
    const { buildAssetSlug } = assetsDomain
    const {
      buildFallbackActionBeats,
      buildFallbackAudioBeats,
      buildFallbackDialogueBeats,
      cinematicScriptPlannerSystemPrompt,
      coerceCinematicPlannerRaw,
      evaluateCinematicScriptQuality,
      inferPromptDirectedActionBinding,
      materializeCinematicPlan,
      resolveTargetShotCount,
      shotImpliesAction,
      shotImpliesDialogue,
    } = worldBuildCinematicsModule
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed.')

    const { client, user } = await requireUserClient(request, 'poll-world-build')
    const payload = worldBuildPollRequestSchema.parse(await request.json())
    const snapshot = payload.snapshot as WorldBuildPollSnapshot
    const loaded = await loadBatch(client, payload.batchId)
    let batch = loaded.batch
    let jobs = loaded.jobs

    if (!isTerminalWorldBuildStatus(batch.status)) {
      const jobStatusById = new Map(jobs.map((job) => [job.id, job.status]))
      const skippedJobs = jobs.filter((job) =>
        job.status === 'queued'
        && (job.depends_on_job_ids ?? []).some((dependencyId) => jobStatusById.get(dependencyId) === 'failed' || jobStatusById.get(dependencyId) === 'skipped'),
      )

      for (const job of skippedJobs) {
        await updateJob(client, job.id, { status: 'skipped', error_message: 'Skipped because a dependency failed.' })
      }

      if (skippedJobs.length > 0) {
        const reloaded = await loadBatch(client, payload.batchId)
        batch = reloaded.batch
        jobs = reloaded.jobs
      }

      const readyJobsAll = jobs
        .filter((job) => job.status === 'queued')
        .filter((job) => (job.depends_on_job_ids ?? []).every((dependencyId) => {
          const dependencyStatus = jobs.find((candidate) => candidate.id === dependencyId)?.status
          return dependencyStatus === 'succeeded' || dependencyStatus === 'skipped'
        }))
      const hasHeavyReadyJob = readyJobsAll.some((job) => !job.kind.endsWith('_definition'))
      const readyJobs = (hasHeavyReadyJob ? readyJobsAll.slice(0, 1) : readyJobsAll.slice(0, 4))

      for (const job of readyJobs) {
        await updateJob(client, job.id, { status: 'running', error_message: null })

        try {
          if (job.kind.endsWith('_definition')) {
            const definitionKey = job.target_keys?.definitionKey
            const definition = snapshot.definitions.find((entry) => entry.key === definitionKey)
            if (!definitionKey || !definition) throw new Error(`Placeholder definition ${definitionKey ?? 'unknown'} was not found in the client snapshot.`)

            const generated = await runStructuredWorldBuildModel({
              model: payload.model,
              passLabel: `${job.kind} generation`,
              systemText: contentSystemPrompt(job.kind),
              promptContext: {
                worldPrompt: batch.prompt,
                requestSummary: batch.request_summary,
                placeholder: {
                  key: definition.key,
                  kind: definition.kind,
                  name: definition.name,
                  summary: definition.summary,
                  components: definition.components,
                },
                gameSpec: snapshot.gameSpec,
              },
              schema: contentGenerationRawSchema,
              maxOutputTokens: 5000,
            })

            const generatedCheck = contentGenerationSchema.safeParse(generated)
            if (!generatedCheck.success) {
              throw new Error(`${job.kind} generation validation failed. keys=${describeTopLevelKeys(generated)}. ${formatIssues(generatedCheck.error.issues)}`)
            }

            const definitionRow = await client.from('project_definitions').select('id, metadata').eq('draft_id', batch.draft_id).eq('key', definition.key).single()
            if (definitionRow.error || !definitionRow.data) throw new Error(definitionRow.error?.message ?? `Definition ${definition.key} was not found.`)

            const currentMetadata =
              typeof definitionRow.data.metadata === 'object' && definitionRow.data.metadata !== null
                ? definitionRow.data.metadata as Record<string, unknown>
                : {}

            const updateResponse = await client.from('project_definitions').update({
              name: generatedCheck.data.name,
              summary: generatedCheck.data.summary,
              tags: generatedCheck.data.tags,
              metadata: {
                ...currentMetadata,
                generation: {
                  batchId: batch.id,
                  jobId: job.id,
                  state: 'completed',
                  placeholder: false,
                  source: 'global_prompt',
                },
              },
              updated_by: user.id,
            }).eq('draft_id', batch.draft_id).eq('key', definition.key)

            if (updateResponse.error) throw new Error(updateResponse.error.message)

            if (generatedCheck.data.characterProfile) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'character_profile', generatedCheck.data.characterProfile)
            }
            if (generatedCheck.data.render3dBinding) {
              const existingRender3d = definition.components.find((component) => component.type === 'render_3d_binding')
              await upsertDefinitionComponent(client, definitionRow.data.id, 'render_3d_binding', {
                ...(existingRender3d?.config ?? buildDefaultDefinitionComponents('character').find((component) => component.type === 'render_3d_binding')?.config ?? {}),
                ...generatedCheck.data.render3dBinding,
              })
            }
            if (generatedCheck.data.physicalItemProfile) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'physical_item_profile', generatedCheck.data.physicalItemProfile)
            }
            if (generatedCheck.data.environmentProfile) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'environment_profile', {
                ...(definition.components.find((component) => component.type === 'environment_profile')?.config ?? {}),
                ...generatedCheck.data.environmentProfile,
              })
            }
            if (generatedCheck.data.environmentRenderBinding) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'environment_render_binding', {
                ...(definition.components.find((component) => component.type === 'environment_render_binding')?.config ?? {}),
                ...generatedCheck.data.environmentRenderBinding,
              })
            }
            if (generatedCheck.data.environmentNavigation) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'environment_navigation', generatedCheck.data.environmentNavigation)
            }
            if (generatedCheck.data.environmentSpawnRules) {
              await upsertDefinitionComponent(client, definitionRow.data.id, 'environment_spawn_rules', generatedCheck.data.environmentSpawnRules)
            }

            await updateJob(client, job.id, {
              status: 'succeeded',
              result_context: {
                definitionKey: definition.key,
                kind: definition.kind,
                ...generatedCheck.data.resultContext,
              },
              error_message: null,
            })
          } else if (job.kind === 'character_concept_image' || job.kind === 'item_concept_image' || job.kind === 'environment_concept_image') {
            const definitionKey = job.target_keys?.definitionKey
            const assetKey = job.target_keys?.assetKey
            const definition = snapshot.definitions.find((entry) => entry.key === definitionKey)
            if (!definition || !assetKey) throw new Error(`Placeholder resources for job ${job.id} were not found.`)
            const prompt = conceptPromptFromDefinition(definition, job, snapshot)
            const currentResultContext = job.result_context ?? {}
            const queueMetadata = readWorldBuildQueueMetadata(currentResultContext)

            if (job.status === 'queued') {
              const falResponse = await client.functions.invoke('ai-fal', {
                body: {
                  action: 'submit',
                  model: 'fal-ai/nano-banana-2',
                  webhookUrl: buildFalWebhookUrl(),
                  input: {
                    prompt,
                    num_images: 1,
                    aspect_ratio: job.kind === 'environment_concept_image' ? '16:9' : '1:1',
                    output_format: 'png',
                    resolution: '1K',
                  },
                  logs: true,
                },
              })

              if (falResponse.error) {
                throw new Error(falResponse.error.message)
              }

              const falResult = (falResponse.data as {
                requestId?: string | null
                model?: string | null
                statusUrl?: string | null
                responseUrl?: string | null
                cancelUrl?: string | null
                data?: unknown
              }) ?? {}
              const requestId = typeof falResult.requestId === 'string' ? falResult.requestId : null
              if (!requestId) {
                const message = 'The concept image provider did not return a request id.'
                await updateJob(client, job.id, {
                  status: 'failed',
                  error_message: message,
                  result_context: {
                    ...currentResultContext,
                    prompt,
                  },
                })
                await markGeneratedImageAssetFailed({
                  client,
                  projectId: batch.project_id,
                  assetKey,
                  errorMessage: message,
                  metadata: {
                    provider: 'fal',
                    model: falResult.model ?? 'fal-ai/nano-banana-2',
                    prompt,
                  },
                })
                break
              }

              console.info('[poll-world-build] world-build image submit result.', {
                batchId: batch.id,
                jobId: job.id,
                kind: job.kind,
                model: falResult.model ?? 'fal-ai/nano-banana-2',
                requestId,
                statusUrl: typeof falResult.statusUrl === 'string' ? falResult.statusUrl : null,
                responseUrl: typeof falResult.responseUrl === 'string' ? falResult.responseUrl : null,
                cancelUrl: typeof falResult.cancelUrl === 'string' ? falResult.cancelUrl : null,
                webhookUrl: buildFalWebhookUrl(),
                rawFalSubmitData: falResult.data ?? null,
              })

              await updateJob(client, job.id, {
                status: 'running',
                provider_request_id: requestId,
                status_url: typeof falResult.statusUrl === 'string' ? falResult.statusUrl : null,
                response_url: typeof falResult.responseUrl === 'string' ? falResult.responseUrl : null,
                cancel_url: typeof falResult.cancelUrl === 'string' ? falResult.cancelUrl : null,
                error_message: null,
                result_context: {
                  ...currentResultContext,
                  assetKey,
                  definitionKey,
                  prompt,
                  providerRequestId: requestId,
                  statusUrl: typeof falResult.statusUrl === 'string' ? falResult.statusUrl : null,
                  responseUrl: typeof falResult.responseUrl === 'string' ? falResult.responseUrl : null,
                  cancelUrl: typeof falResult.cancelUrl === 'string' ? falResult.cancelUrl : null,
                  submittedAt: new Date().toISOString(),
                },
              })
              break
            }

            if (!queueMetadata.providerRequestId) {
              const message = 'The concept image job is missing a provider request id.'
              await updateJob(client, job.id, {
                status: 'failed',
                error_message: message,
              })
              await markGeneratedImageAssetFailed({
                client,
                projectId: batch.project_id,
                assetKey,
                errorMessage: message,
                metadata: {
                  provider: 'fal',
                  model: 'fal-ai/nano-banana-2',
                  prompt,
                },
              })
              break
            }

            if (!queueMetadata.statusUrl && !queueMetadata.responseUrl) {
              console.warn('[poll-world-build] queued urls missing for running world-build job.', {
                batchId: batch.id,
                jobId: job.id,
                kind: job.kind,
                providerRequestId: queueMetadata.providerRequestId,
                submittedAt: readSubmittedAt(currentResultContext),
              })
              const submittedAt = readSubmittedAt(currentResultContext)
              const submittedAtMs = submittedAt ? Date.parse(submittedAt) : Number.NaN
              const missingQueueUrlsTooLong =
                Number.isFinite(submittedAtMs)
                && (Date.now() - submittedAtMs) >= 60_000

              if (missingQueueUrlsTooLong) {
                const message = 'The concept image provider request started, but no queue URLs were returned for polling or webhook recovery.'
                await updateJob(client, job.id, {
                  status: 'failed',
                  error_message: message,
                  provider_request_id: queueMetadata.providerRequestId,
                })
                await markGeneratedImageAssetFailed({
                  client,
                  projectId: batch.project_id,
                  assetKey,
                  errorMessage: message,
                  metadata: {
                    provider: 'fal',
                    model: 'fal-ai/nano-banana-2',
                    requestId: queueMetadata.providerRequestId,
                    prompt,
                  },
                })
                break
              }
            }

            const resultResponse = await client.functions.invoke('ai-fal', {
              body: {
                action: 'result',
                model: 'fal-ai/nano-banana-2',
                requestId: queueMetadata.providerRequestId,
                responseUrl: queueMetadata.responseUrl,
              },
            })

            if (resultResponse.error) {
              throw new Error(resultResponse.error.message)
            }

            const resultPayload = (resultResponse.data as {
              data?: unknown
              model?: string | null
              status?: string | null
              statusData?: unknown
            }) ?? {}
            let imageUrl = extractFalImageUrls(resultPayload.data)[0] ?? null
            let providerStatus = typeof resultPayload.status === 'string' ? resultPayload.status : null
            let statusData = resultPayload.statusData ?? null

            if (!imageUrl) {
              const statusResponse = await client.functions.invoke('ai-fal', {
                body: {
                  action: 'status',
                  model: 'fal-ai/nano-banana-2',
                  requestId: queueMetadata.providerRequestId,
                  statusUrl: queueMetadata.statusUrl,
                  logs: true,
                },
              })

              if (statusResponse.error) {
                throw new Error(statusResponse.error.message)
              }

              const statusPayload = (statusResponse.data as { data?: unknown } | null)?.data ?? {}
              console.info('[poll-world-build] world-build image provider status.', {
                batchId: batch.id,
                jobId: job.id,
                kind: job.kind,
                providerRequestId: queueMetadata.providerRequestId,
                statusUrl: queueMetadata.statusUrl,
                responseUrl: queueMetadata.responseUrl,
                rawStatusPayload: statusPayload,
              })
              providerStatus = typeof (statusPayload as { status?: unknown }).status === 'string'
                ? String((statusPayload as { status: string }).status)
                : providerStatus
              statusData = statusPayload
              imageUrl = extractFalImageUrls(statusPayload)[0] ?? null

              if (typeof (statusPayload as { error?: unknown }).error === 'string') {
                const message = String((statusPayload as { error: string }).error)
                await updateJob(client, job.id, {
                  status: 'failed',
                  error_message: message,
                })
                await markGeneratedImageAssetFailed({
                  client,
                  projectId: batch.project_id,
                  assetKey,
                  errorMessage: message,
                  metadata: {
                    provider: 'fal',
                    model: resultPayload.model ?? 'fal-ai/nano-banana-2',
                    requestId: queueMetadata.providerRequestId,
                    prompt,
                  },
                })
                break
              }

              if (!imageUrl && providerStatus !== 'COMPLETED') {
                await updateJob(client, job.id, {
                  status: 'running',
                  provider_request_id: queueMetadata.providerRequestId,
                  status_url: queueMetadata.statusUrl,
                  response_url: queueMetadata.responseUrl,
                  cancel_url: queueMetadata.cancelUrl,
                  error_message: null,
                  result_context: {
                    ...currentResultContext,
                    assetKey,
                    definitionKey,
                    prompt,
                    providerRequestId: queueMetadata.providerRequestId,
                    statusUrl: queueMetadata.statusUrl,
                    responseUrl: queueMetadata.responseUrl,
                    cancelUrl: queueMetadata.cancelUrl,
                    lastObservedProviderStatus: providerStatus,
                    lastStatusCheckAt: new Date().toISOString(),
                  },
                })
                break
              }
            }

            if (!imageUrl) {
              const message = 'The concept image provider reported completion without returning an image URL.'
              await updateJob(client, job.id, {
                status: 'failed',
                error_message: message,
              })
              await markGeneratedImageAssetFailed({
                client,
                projectId: batch.project_id,
                assetKey,
                errorMessage: message,
                metadata: {
                  provider: 'fal',
                  model: resultPayload.model ?? 'fal-ai/nano-banana-2',
                  requestId: queueMetadata.providerRequestId,
                  prompt,
                },
              })
              break
            }

            console.info('[poll-world-build] world-build image completed through polling.', {
              batchId: batch.id,
              jobId: job.id,
              kind: job.kind,
              providerRequestId: queueMetadata.providerRequestId,
              providerStatus,
              imageUrl,
            })

            await completeReservedGeneratedImageAsset({
              client,
              projectId: batch.project_id,
              assetKey,
              imageUrl,
              name: job.kind === 'character_concept_image'
                ? `${definition.name} Concept`
                : job.kind === 'item_concept_image'
                  ? `${definition.name} Concept`
                  : `${definition.name} ${String(job.target_keys?.view ?? 'concept').replace(/_/g, ' ')}`,
              metadata: {
                generatedBy: job.kind === 'character_concept_image'
                  ? 'character_concept'
                  : job.kind === 'item_concept_image'
                    ? 'item_concept'
                    : 'environment_concept',
                conceptArtMode: typeof job.options?.conceptArtMode === 'string' ? job.options.conceptArtMode : null,
                variant: typeof job.options?.conceptVariant === 'string' ? job.options.conceptVariant : (typeof job.target_keys?.variant === 'string' ? job.target_keys.variant : null),
                captureProfile: typeof job.options?.captureProfileOverride === 'string' ? job.options.captureProfileOverride : null,
                downstreamUse:
                  typeof job.options?.conceptArtMode === 'string'
                    ? (job.options.conceptArtMode === 'proof_surface' ? 'proof_surface' : job.options.conceptArtMode === 'continuity' ? 'continuity' : 'showcase')
                    : null,
                provider: 'fal',
                model: resultPayload.model ?? 'fal-ai/nano-banana-2',
                requestId: queueMetadata.providerRequestId,
                prompt,
                generation: {
                  batchId: batch.id,
                  jobId: job.id,
                  state: 'completed',
                  placeholder: false,
                  source: 'global_prompt',
                },
              },
            })

            const shouldBindDefinitionIcon =
              job.kind === 'character_concept_image'
              || job.kind === 'item_concept_image'
              || job.target_keys?.view === 'hero'

            if (shouldBindDefinitionIcon) {
              const definitionUpdate = await client
                .from('project_definitions')
                .update({
                  icon_asset_key: assetKey,
                  updated_by: user.id,
                })
                .eq('draft_id', batch.draft_id)
                .eq('key', definitionKey)

              if (definitionUpdate.error) {
                throw new Error(definitionUpdate.error.message)
              }
            }

            await updateJob(client, job.id, {
              status: 'succeeded',
              provider_request_id: queueMetadata.providerRequestId,
              status_url: queueMetadata.statusUrl,
              response_url: queueMetadata.responseUrl,
              cancel_url: queueMetadata.cancelUrl,
              result_context: {
                ...currentResultContext,
                assetKey,
                definitionKey,
                imageUrl,
                prompt,
                providerRequestId: queueMetadata.providerRequestId,
                statusUrl: queueMetadata.statusUrl,
                responseUrl: queueMetadata.responseUrl,
                cancelUrl: queueMetadata.cancelUrl,
                providerStatus,
                statusData,
              },
              error_message: null,
            })
          } else if (job.kind === 'cinematic_composite_image' || job.kind === 'cinematic_storyboard_image') {
            const assetKey = job.target_keys?.assetKey
            const cinematicPlan = cinematicPlanSchema.safeParse(batch.cinematic_plan)
            if (!assetKey || !cinematicPlan.success) {
              throw new Error(`Cinematic asset placeholder resources for job ${job.id} were not found.`)
            }

            const prompt =
              job.kind === 'cinematic_composite_image'
                ? compositePromptForPlan(cinematicPlan.data, String(job.target_keys?.compositeRefId ?? ''))
                : storyboardPromptForPlan(cinematicPlan.data, String(job.target_keys?.storyboardAssetId ?? ''))
            const currentResultContext = job.result_context ?? {}
            const queueMetadata = readWorldBuildQueueMetadata(currentResultContext)

            if (job.status === 'queued') {
              const falResponse = await client.functions.invoke('ai-fal', {
                body: {
                  action: 'submit',
                  model: 'fal-ai/nano-banana-2',
                  webhookUrl: buildFalWebhookUrl(),
                  input: {
                    prompt,
                    num_images: 1,
                    aspect_ratio: '16:9',
                    output_format: 'png',
                    resolution: '1K',
                  },
                  logs: true,
                },
              })

              if (falResponse.error) {
                throw new Error(falResponse.error.message)
              }

              const falResult = (falResponse.data as {
                requestId?: string | null
                model?: string | null
                statusUrl?: string | null
                responseUrl?: string | null
                cancelUrl?: string | null
              }) ?? {}
              const requestId = typeof falResult.requestId === 'string' ? falResult.requestId : null
              if (!requestId) {
                const message = 'The cinematic image provider did not return a request id.'
                await updateJob(client, job.id, {
                  status: 'failed',
                  error_message: message,
                })
                await markGeneratedImageAssetFailed({
                  client,
                  projectId: batch.project_id,
                  assetKey,
                  errorMessage: message,
                  metadata: {
                    provider: 'fal',
                    model: falResult.model ?? 'fal-ai/nano-banana-2',
                    prompt,
                  },
                })
                break
              }

              console.info('[poll-world-build] world-build cinematic image submit result.', {
                batchId: batch.id,
                jobId: job.id,
                kind: job.kind,
                model: falResult.model ?? 'fal-ai/nano-banana-2',
                requestId,
                statusUrl: typeof falResult.statusUrl === 'string' ? falResult.statusUrl : null,
                responseUrl: typeof falResult.responseUrl === 'string' ? falResult.responseUrl : null,
                cancelUrl: typeof falResult.cancelUrl === 'string' ? falResult.cancelUrl : null,
                webhookUrl: buildFalWebhookUrl(),
                rawFalSubmitData: falResult.data ?? null,
              })

              await updateJob(client, job.id, {
                status: 'running',
                provider_request_id: requestId,
                status_url: typeof falResult.statusUrl === 'string' ? falResult.statusUrl : null,
                response_url: typeof falResult.responseUrl === 'string' ? falResult.responseUrl : null,
                cancel_url: typeof falResult.cancelUrl === 'string' ? falResult.cancelUrl : null,
                error_message: null,
                result_context: {
                  ...currentResultContext,
                  assetKey,
                  prompt,
                  providerRequestId: requestId,
                  statusUrl: typeof falResult.statusUrl === 'string' ? falResult.statusUrl : null,
                  responseUrl: typeof falResult.responseUrl === 'string' ? falResult.responseUrl : null,
                  cancelUrl: typeof falResult.cancelUrl === 'string' ? falResult.cancelUrl : null,
                  submittedAt: new Date().toISOString(),
                  compositeRefId: job.target_keys?.compositeRefId ?? null,
                  storyboardAssetId: job.target_keys?.storyboardAssetId ?? null,
                },
              })
              break
            }

            if (!queueMetadata.providerRequestId) {
              const message = 'The cinematic image job is missing a provider request id.'
              await updateJob(client, job.id, {
                status: 'failed',
                error_message: message,
              })
              await markGeneratedImageAssetFailed({
                client,
                projectId: batch.project_id,
                assetKey,
                errorMessage: message,
                metadata: {
                  provider: 'fal',
                  model: 'fal-ai/nano-banana-2',
                  prompt,
                },
              })
              break
            }

            if (!queueMetadata.statusUrl && !queueMetadata.responseUrl) {
              console.warn('[poll-world-build] queued urls missing for running cinematic image job.', {
                batchId: batch.id,
                jobId: job.id,
                kind: job.kind,
                providerRequestId: queueMetadata.providerRequestId,
                submittedAt: readSubmittedAt(currentResultContext),
              })
            }

            const resultResponse = await client.functions.invoke('ai-fal', {
              body: {
                action: 'result',
                model: 'fal-ai/nano-banana-2',
                requestId: queueMetadata.providerRequestId,
                responseUrl: queueMetadata.responseUrl,
              },
            })

            if (resultResponse.error) {
              throw new Error(resultResponse.error.message)
            }

            const resultPayload = (resultResponse.data as {
              data?: unknown
              model?: string | null
              status?: string | null
              statusData?: unknown
            }) ?? {}
            let imageUrl = extractFalImageUrls(resultPayload.data)[0] ?? null
            let providerStatus = typeof resultPayload.status === 'string' ? resultPayload.status : null
            let statusData = resultPayload.statusData ?? null

            if (!imageUrl) {
              const statusResponse = await client.functions.invoke('ai-fal', {
                body: {
                  action: 'status',
                  model: 'fal-ai/nano-banana-2',
                  requestId: queueMetadata.providerRequestId,
                  statusUrl: queueMetadata.statusUrl,
                  logs: true,
                },
              })

              if (statusResponse.error) {
                throw new Error(statusResponse.error.message)
              }

              const statusPayload = (statusResponse.data as { data?: unknown } | null)?.data ?? {}
              console.info('[poll-world-build] world-build cinematic image provider status.', {
                batchId: batch.id,
                jobId: job.id,
                kind: job.kind,
                providerRequestId: queueMetadata.providerRequestId,
                statusUrl: queueMetadata.statusUrl,
                responseUrl: queueMetadata.responseUrl,
                rawStatusPayload: statusPayload,
              })
              providerStatus = typeof (statusPayload as { status?: unknown }).status === 'string'
                ? String((statusPayload as { status: string }).status)
                : providerStatus
              statusData = statusPayload
              imageUrl = extractFalImageUrls(statusPayload)[0] ?? null

              if (typeof (statusPayload as { error?: unknown }).error === 'string') {
                const message = String((statusPayload as { error: string }).error)
                await updateJob(client, job.id, {
                  status: 'failed',
                  error_message: message,
                })
                await markGeneratedImageAssetFailed({
                  client,
                  projectId: batch.project_id,
                  assetKey,
                  errorMessage: message,
                  metadata: {
                    provider: 'fal',
                    model: resultPayload.model ?? 'fal-ai/nano-banana-2',
                    requestId: queueMetadata.providerRequestId,
                    prompt,
                  },
                })
                break
              }

              if (!imageUrl && providerStatus !== 'COMPLETED') {
                await updateJob(client, job.id, {
                  status: 'running',
                  provider_request_id: queueMetadata.providerRequestId,
                  status_url: queueMetadata.statusUrl,
                  response_url: queueMetadata.responseUrl,
                  cancel_url: queueMetadata.cancelUrl,
                  error_message: null,
                  result_context: {
                    ...currentResultContext,
                    assetKey,
                    prompt,
                    providerRequestId: queueMetadata.providerRequestId,
                    statusUrl: queueMetadata.statusUrl,
                    responseUrl: queueMetadata.responseUrl,
                    cancelUrl: queueMetadata.cancelUrl,
                    lastObservedProviderStatus: providerStatus,
                    lastStatusCheckAt: new Date().toISOString(),
                    compositeRefId: job.target_keys?.compositeRefId ?? null,
                    storyboardAssetId: job.target_keys?.storyboardAssetId ?? null,
                  },
                })
                break
              }
            }

            if (!imageUrl) {
              const message = 'The cinematic image provider reported completion without returning an image URL.'
              await updateJob(client, job.id, {
                status: 'failed',
                error_message: message,
              })
              await markGeneratedImageAssetFailed({
                client,
                projectId: batch.project_id,
                assetKey,
                errorMessage: message,
                metadata: {
                  provider: 'fal',
                  model: resultPayload.model ?? 'fal-ai/nano-banana-2',
                  requestId: queueMetadata.providerRequestId,
                  prompt,
                },
              })
              break
            }

            console.info('[poll-world-build] world-build cinematic image completed through polling.', {
              batchId: batch.id,
              jobId: job.id,
              kind: job.kind,
              providerRequestId: queueMetadata.providerRequestId,
              providerStatus,
              imageUrl,
            })

            await completeReservedGeneratedImageAsset({
              client,
              projectId: batch.project_id,
              assetKey,
              imageUrl,
              metadata: {
                generatedBy: job.kind === 'cinematic_composite_image' ? 'cinematic_composite' : 'cinematic_storyboard',
                provider: 'fal',
                model: resultPayload.model ?? 'fal-ai/nano-banana-2',
                requestId: queueMetadata.providerRequestId,
                prompt,
                generation: {
                  batchId: batch.id,
                  jobId: job.id,
                  state: 'completed',
                  placeholder: false,
                  source: 'global_prompt',
                },
              },
            })

            await updateJob(client, job.id, {
              status: 'succeeded',
              provider_request_id: queueMetadata.providerRequestId,
              status_url: queueMetadata.statusUrl,
              response_url: queueMetadata.responseUrl,
              cancel_url: queueMetadata.cancelUrl,
              result_context: {
                ...currentResultContext,
                assetKey,
                imageUrl,
                prompt,
                providerRequestId: queueMetadata.providerRequestId,
                statusUrl: queueMetadata.statusUrl,
                responseUrl: queueMetadata.responseUrl,
                cancelUrl: queueMetadata.cancelUrl,
                providerStatus,
                statusData,
                compositeRefId: job.target_keys?.compositeRefId ?? null,
                storyboardAssetId: job.target_keys?.storyboardAssetId ?? null,
              },
              error_message: null,
            })
          } else if (job.kind === 'cinematic_graph') {
            const graphKey = job.target_keys?.graphKey
            if (!graphKey) throw new Error(`Placeholder graph key was missing for job ${job.id}.`)

            const cinematicPlan = cinematicPlanSchema.safeParse(batch.cinematic_plan)
            if (!cinematicPlan.success) {
              throw new Error(`Batch cinematic plan was invalid. ${formatIssues(cinematicPlan.error.issues)}`)
            }

            const resolvedEntityRefs = cinematicPlan.data.entityRefs.map((entityRef) => {
              if (entityRef.resolution === 'existing' && entityRef.definitionKey) {
                return {
                  ...entityRef,
                  definitionKey: entityRef.definitionKey,
                }
              }

              const definitionJob = jobs.find((candidate) =>
                candidate.plan_item_id === entityRef.planItemId
                && candidate.kind.endsWith('_definition'),
              )
              const definitionKey = definitionJob?.target_keys?.definitionKey
              if (!definitionKey) {
                throw new Error(`Cinematic entity "${entityRef.sourceName}" is still missing a resolved definition.`)
              }

              return {
                ...entityRef,
                definitionKey,
              }
            })

            {
              const persistedCinematicPlan = cinematicPlanSchema.parse({
                ...cinematicPlan.data,
                entityRefs: resolvedEntityRefs,
              })
              if (JSON.stringify(persistedCinematicPlan.entityRefs) !== JSON.stringify(cinematicPlan.data.entityRefs)) {
                await updateBatch(client, batch.id, {
                  cinematic_plan: persistedCinematicPlan,
                })
                batch = {
                  ...batch,
                  cinematic_plan: persistedCinematicPlan,
                }
              }

              const graphRow = await client
                .from('draft_graphs')
                .select('metadata')
                .eq('draft_id', batch.draft_id)
                .eq('key', graphKey)
                .maybeSingle()
              if (graphRow.error || !graphRow.data) {
                throw new Error(graphRow.error?.message ?? `Graph ${graphKey} was not found.`)
              }

              const graphMetadata =
                typeof graphRow.data.metadata === 'object' && graphRow.data.metadata !== null
                  ? graphRow.data.metadata as Record<string, unknown>
                  : {}
              const graphGeneration =
                typeof graphMetadata.generation === 'object' && graphMetadata.generation !== null
                  ? graphMetadata.generation as Record<string, unknown>
                  : {}
              const graphAuthoring =
                typeof graphMetadata.cinematicAuthoring === 'object' && graphMetadata.cinematicAuthoring !== null
                  ? graphMetadata.cinematicAuthoring as Record<string, unknown>
                  : {}
              const graphCompiled =
                graphGeneration.batchId === batch.id
                && graphGeneration.jobId === job.id
                && graphGeneration.placeholder === false
                && (graphGeneration.state === 'completed' || graphAuthoring.phase === 'completed')
              const currentResultContext =
                typeof job.result_context === 'object' && job.result_context !== null
                  ? job.result_context as Record<string, unknown>
                  : {}
              const currentPhase =
                typeof currentResultContext.phase === 'string'
                  ? currentResultContext.phase
                  : null
              const repairAttempts =
                typeof currentResultContext.repairAttempts === 'number' && Number.isFinite(currentResultContext.repairAttempts)
                  ? currentResultContext.repairAttempts
                  : 0
              const maxRepairAttempts =
                typeof currentResultContext.maxRepairAttempts === 'number' && Number.isFinite(currentResultContext.maxRepairAttempts)
                  ? Math.max(1, currentResultContext.maxRepairAttempts)
                  : 1
              const repairQueuedAt =
                typeof currentResultContext.repairQueuedAt === 'string'
                  ? Date.parse(currentResultContext.repairQueuedAt)
                  : Number.NaN
              const phaseUpdatedAt =
                typeof job.updated_at === 'string'
                  ? Date.parse(job.updated_at)
                  : Number.NaN
              const readyForAuthorshipTimedOut =
                currentPhase === 'ready_for_authorship'
                && Number.isFinite(phaseUpdatedAt)
                && (Date.now() - phaseUpdatedAt) >= 60000
              const authoringTimedOut =
                (currentPhase === 'authoring_script' || currentPhase === 'repairing_script')
                && Number.isFinite(phaseUpdatedAt)
                && (Date.now() - phaseUpdatedAt) >= 120000
              const repairTimedOut =
                currentPhase === 'needs_repair'
                && Number.isFinite(repairQueuedAt)
                && (Date.now() - repairQueuedAt) >= 30000
              const repairExhausted =
                currentPhase === 'needs_repair'
                && (repairAttempts >= maxRepairAttempts || repairTimedOut)
              const authorshipExhausted = readyForAuthorshipTimedOut || authoringTimedOut
              const inProgressPhase =
                currentPhase === 'authoring_script'
                || currentPhase === 'repairing_script'
              const terminalFailurePhase =
                authorshipExhausted
                || repairExhausted
                || (
                currentPhase === 'authorship_failed'
                || currentPhase === 'repair_failed'
                || currentPhase === 'failed'
                )
              const exhaustedFailurePhase = authorshipExhausted
                ? 'authorship_failed'
                : repairExhausted
                  ? 'repair_failed'
                  : null
              const nextPhase = graphCompiled
                ? 'graph_compiled'
                : exhaustedFailurePhase
                  ? exhaustedFailurePhase
                  : terminalFailurePhase
                    ? currentPhase
                    : inProgressPhase || currentPhase === 'needs_repair'
                      ? currentPhase
                      : persistedCinematicPlan.scriptDoc
                        ? 'authored'
                        : 'ready_for_authorship'
              const nextJobStatus = graphCompiled
                ? 'succeeded'
                : (job.status === 'failed' || terminalFailurePhase)
                  ? 'failed'
                  : 'running'

              await updateJob(client, job.id, {
                status: nextJobStatus,
                result_context: {
                  ...currentResultContext,
                  graphKey,
                  resolvedEntityRefs,
                  phase: nextPhase,
                },
                error_message: authorshipExhausted
                  ? (job.error_message ?? 'Cinematic authorship did not complete within the allowed time window.')
                  : repairExhausted
                    ? (job.error_message ?? 'Cinematic repair did not resolve hard failures within the retry budget.')
                    : null,
              })

              if (graphCompiled) {
                await markGraphGenerationState(client, batch.draft_id, graphKey, {
                  batchId: batch.id,
                  jobId: job.id,
                  state: 'completed',
                  placeholder: false,
                  source: 'global_prompt',
                })
              }
            }
            if (false) {

            let authoredCinematicPlan = cinematicPlan.data
            const plannerDiagnostics: string[] = []
            let authoringFlags = {
              usedFallbackPrimaryShot: false,
              usedTemporalExpansionFallback: false,
              usedDialogueFallback: false,
              usedActionBindingRepair: false,
              usedRepairPass: false,
            }
            if (!authoredCinematicPlan.scriptDoc) {
              const effectiveSettings = materializeCinematicGraphSettings(authoredCinematicPlan.graphSettings ?? {})
              const targetShotCount = resolveTargetShotCount(batch.prompt, effectiveSettings.formatSubtype)
              await updateJob(client, job.id, {
                result_context: {
                  ...(job.result_context ?? {}),
                  graphKey,
                  phase: 'writing_script',
                },
              })

              const cinematicDraftRaw = await runStructuredWorldBuildModel({
                model: payload.model,
                passLabel: 'Cinematic script planner',
                systemText: cinematicScriptPlannerSystemPrompt(
                  effectiveSettings.presetFamily,
                  effectiveSettings.formatSubtype,
                  targetShotCount,
                  effectiveSettings.storyScenePreset ?? null,
                  effectiveSettings.storyLanguagePreset ?? null,
                ),
                promptContext: {
                  prompt: batch.prompt,
                  project: snapshot.project,
                  draft: snapshot.draft,
                  gameSpec: snapshot.gameSpec ?? null,
                  requestSummary: batch.request_summary,
                  graphName: authoredCinematicPlan.graphName,
                  graphSummary: authoredCinematicPlan.graphSummary,
                  lockedEntityRefs: resolvedEntityRefs,
                  existingEntityRefs: resolvedEntityRefs.filter((entry) => entry.resolution === 'existing'),
                  createEntityRefs: [],
                },
                schema: z.record(z.string(), z.unknown()),
                maxOutputTokens: 10000,
              })
              let cinematicDraft = coerceCinematicPlannerRaw(cinematicDraftRaw, {
                lockedEntityRefs: resolvedEntityRefs,
                allowEntityCreation: false,
                promptText: batch.prompt,
                enableFallbackShaping: false,
              })
              plannerDiagnostics.push(...cinematicDraft.diagnostics)

              let draftPlan
              try {
                draftPlan = materializeCinematicPlan({
                  ...cinematicDraft,
                  requestSummary: cinematicDraft.requestSummary || batch.request_summary,
                  graphName: cinematicDraft.graphName || authoredCinematicPlan.graphName,
                  graphSummary: cinematicDraft.graphSummary || authoredCinematicPlan.graphSummary,
                  entityRefs: resolvedEntityRefs,
                  graphSettings: effectiveSettings.presetFamily === 'story_movie_tv'
                    ? {
                        ...(cinematicDraft.graphSettings ?? {}),
                        presetFamily: 'story_movie_tv' as const,
                        formatSubtype: null,
                        storyScenePreset: effectiveSettings.storyScenePreset ?? null,
                        storyLanguagePreset: effectiveSettings.storyLanguagePreset ?? null,
                        formulaFamily: effectiveSettings.formulaFamily,
                        dominantTrigger: effectiveSettings.dominantTrigger,
                        creativeTreatment: effectiveSettings.creativeTreatment,
                        hookFamily: effectiveSettings.hookFamily,
                        narrationMode: effectiveSettings.narrationMode,
                        backdropRole: effectiveSettings.backdropRole,
                        backdropStrategy: effectiveSettings.backdropStrategy,
                        contrastAxis: effectiveSettings.contrastAxis,
                        proofMoment: effectiveSettings.proofMoment,
                        ctaStyle: effectiveSettings.ctaStyle,
                      }
                    : cinematicDraft.graphSettings,
                })
              } catch (error) {
                console.error('[GraphCore] materializeCinematicPlan failed during writing_script.', {
                  batchId: batch.id,
                  worldBuildJobId: job.id,
                  graphKey,
                  authoredGraphSettings: authoredCinematicPlan.graphSettings ?? null,
                  draftGraphSettings: cinematicDraft.graphSettings ?? null,
                  error: error instanceof Error ? error.message : String(error),
                })
                throw error
              }
              let qualityReport = evaluateCinematicScriptQuality({
                promptText: batch.prompt,
                scriptDoc: cinematicScriptDocSchema.parse(draftPlan.scriptDoc),
                graphSettings: effectiveSettings,
              })
              plannerDiagnostics.push(...qualityReport.failures)
              if (qualityReport.hardFailures.length > 0 || qualityReport.softFailures.length > 0) {
                console.warn('[GraphCore] cinematic script draft has quality findings.', {
                  batchId: batch.id,
                  worldBuildJobId: job.id,
                  graphKey,
                  hardQualityFailures: qualityReport.hardFailures,
                  softQualityWarnings: qualityReport.softFailures,
                })
              }
              authoredCinematicPlan = draftPlan
              authoringFlags.usedDialogueFallback = qualityReport.flags.usedDialogueFallback
            }

            const cinematicDefinitions = await loadDefinitionRecordsByKeys(
              client,
              batch.draft_id,
              resolvedEntityRefs.map((entityRef) => entityRef.definitionKey),
            )
            const displayAssetKeys = Array.from(new Set(
              cinematicDefinitions
                .map((definition) => resolveDefinitionDisplayAssetKey(definition as {
                  key: string
                  kind: string
                  name: string
                  iconAssetKey?: string | null
                  components?: Array<{ type?: string; config?: Record<string, unknown> }>
                }))
                .filter((value): value is string => typeof value === 'string' && value.length > 0),
            ))
            const compositeAssetKeys = Object.fromEntries(
              jobs
                .filter((candidate) => (candidate.kind === 'cinematic_composite_image') && (job.depends_on_job_ids ?? []).includes(candidate.id))
                .map((candidate) => {
                  const compositeRefId = typeof candidate.target_keys?.compositeRefId === 'string' ? candidate.target_keys.compositeRefId : null
                  const assetKey = typeof candidate.target_keys?.assetKey === 'string' ? candidate.target_keys.assetKey : null
                  return compositeRefId && assetKey ? [compositeRefId, assetKey] : null
                })
                .filter((entry): entry is [string, string] => Array.isArray(entry)),
            )
            for (const composite of authoredCinematicPlan.compositeRefPlans) {
              if (composite.outputAssetKey && !compositeAssetKeys[composite.id]) {
                compositeAssetKeys[composite.id] = composite.outputAssetKey
              }
            }
            const storyboardSequenceAssetKey =
              jobs.find((candidate) =>
                candidate.kind === 'cinematic_storyboard_image'
                && typeof candidate.target_keys?.storyboardAssetId === 'string'
                && candidate.target_keys.storyboardAssetId === 'storyboard_sequence'
                && (job.depends_on_job_ids ?? []).includes(candidate.id),
              )?.target_keys?.assetKey
              ?? authoredCinematicPlan.storyboardPlan?.sequenceAssetKey
              ?? authoredCinematicPlan.scriptDoc?.storyboard?.sequenceAssetKey
              ?? null
            const storyboardPanelAssetKeys = Object.fromEntries(
              jobs
                .filter((candidate) => candidate.kind === 'cinematic_storyboard_image' && (job.depends_on_job_ids ?? []).includes(candidate.id))
                .map((candidate) => {
                  const storyboardAssetId = typeof candidate.target_keys?.storyboardAssetId === 'string' ? candidate.target_keys.storyboardAssetId : null
                  const assetKey = typeof candidate.target_keys?.assetKey === 'string' ? candidate.target_keys.assetKey : null
                  return storyboardAssetId && assetKey && storyboardAssetId !== 'storyboard_sequence'
                    ? [storyboardAssetId, assetKey]
                    : null
                })
                .filter((entry): entry is [string, string] => Array.isArray(entry)),
            )
            for (const panel of authoredCinematicPlan.storyboardPlan?.panels ?? []) {
              const assetKey = panel.assetKey
                ?? authoredCinematicPlan.scriptDoc?.storyboard?.panels.find((candidate) => candidate.id === panel.id)?.assetKey
                ?? null
              if (panel.id && assetKey && !storyboardPanelAssetKeys[panel.id]) {
                storyboardPanelAssetKeys[panel.id] = assetKey
              }
            }
            const additionalCinematicAssetKeys = Array.from(new Set([
              ...Object.values(compositeAssetKeys),
              ...(storyboardSequenceAssetKey ? [storyboardSequenceAssetKey] : []),
              ...Object.values(storyboardPanelAssetKeys),
            ]))
            const cinematicAssets = await loadProjectAssetsByKeys(client, batch.project_id, [...displayAssetKeys, ...additionalCinematicAssetKeys])
            const definitionByKey = new Map(cinematicDefinitions.map((definition) => [definition.key, definition]))
            const displayAssetKeyByDefinitionKey = new Map(
              cinematicDefinitions.map((definition) => [definition.key, resolveDefinitionDisplayAssetKey(definition as {
                key: string
                kind: string
                name: string
                iconAssetKey?: string | null
                components?: Array<{ type?: string; config?: Record<string, unknown> }>
              }) ?? null]),
            )
            const soleEnvironmentRefId =
              resolvedEntityRefs.filter((entityRef) => entityRef.kind === 'environment').length === 1
                ? resolvedEntityRefs.find((entityRef) => entityRef.kind === 'environment')?.id ?? null
                : null
            const scriptRepairDiagnostics: string[] = []
            const rawScriptDoc = authoredCinematicPlan.scriptDoc
              ? cinematicScriptDocSchema.parse(authoredCinematicPlan.scriptDoc)
              : cinematicScriptDocSchema.parse({
                  title: authoredCinematicPlan.graphName,
                  logline: authoredCinematicPlan.graphSummary,
                  entityBindings: [],
                  scenes: [],
                  shots: [],
                  relationships: authoredCinematicPlan.relationshipRefs,
                  compositeRefs: authoredCinematicPlan.compositeRefPlans,
                  storyboard: authoredCinematicPlan.storyboardPlan,
                })
            const incidentalScriptPropRefIds = new Set(
              rawScriptDoc.entityBindings
                .filter((binding) => (
                  binding.kind === 'item'
                  && isIncidentalScriptProp(binding.sourceName || binding.label)
                  && !promptMakesPropHero(batch.prompt, binding.sourceName || binding.label)
                ))
                .map((binding) => binding.id),
            )
            if (incidentalScriptPropRefIds.size > 0) {
              scriptRepairDiagnostics.push(`Removed incidental staging props from cinematic bindings: ${Array.from(incidentalScriptPropRefIds).join(', ')}.`)
            }
            const scriptDoc = cinematicScriptDocSchema.parse({
              ...rawScriptDoc,
              entityBindings: resolvedEntityRefs.map((entityRef) => {
                const existingBinding = rawScriptDoc.entityBindings.find((binding) => binding.id === entityRef.id) ?? null
                const definition = definitionByKey.get(entityRef.definitionKey)
                if (
                  entityRef.kind === 'item'
                  && incidentalScriptPropRefIds.has(entityRef.id)
                ) {
                  return null
                }
                return {
                  id: entityRef.id,
                  kind: entityRef.kind,
                  role: existingBinding?.role ?? entityRef.role,
                  label: existingBinding?.label || definition?.name || entityRef.sourceName,
                  sourceName: entityRef.sourceName,
                  summary: existingBinding?.summary || definition?.summary || entityRef.summary,
                  definitionKey: entityRef.definitionKey ?? null,
                  assetKey: existingBinding?.assetKey ?? (entityRef.definitionKey ? displayAssetKeyByDefinitionKey.get(entityRef.definitionKey) ?? null : null),
                  stagingNotes: existingBinding?.stagingNotes ?? '',
                  priority: existingBinding?.priority ?? (entityRef.kind === 'environment' ? 60 : entityRef.kind === 'item' ? 55 : 70),
                  required: existingBinding?.required ?? true,
                }
              }).filter((binding): binding is NonNullable<typeof binding> => binding !== null),
              relationships: rawScriptDoc.relationships.filter((relationship) => (
                !incidentalScriptPropRefIds.has(relationship.sourceRefId)
                && !incidentalScriptPropRefIds.has(relationship.targetRefId)
              )),
              compositeRefs: rawScriptDoc.compositeRefs
                .filter((composite) => composite.sourceRefIds.every((refId) => !incidentalScriptPropRefIds.has(refId)))
                .map((composite) => ({
                ...composite,
                outputAssetKey: compositeAssetKeys[composite.id] ?? composite.outputAssetKey ?? null,
                })),
              storyboard: rawScriptDoc.storyboard
                ? {
                    ...rawScriptDoc.storyboard,
                    sequenceAssetKey: storyboardSequenceAssetKey ?? rawScriptDoc.storyboard.sequenceAssetKey ?? null,
                    panels: rawScriptDoc.storyboard.panels.map((panel) => ({
                      ...panel,
                      assetKey: storyboardPanelAssetKeys[panel.id] ?? panel.assetKey ?? null,
                    })),
                  }
                : null,
              scenes: rawScriptDoc.scenes.map((scene, index) => ({
                ...scene,
                locationRefId: scene.locationRefId ?? soleEnvironmentRefId,
                orderIndex: index,
              })),
              shots: rawScriptDoc.shots.map((shot, index) => {
                const availableCompositeRefIds = new Set(
                  rawScriptDoc.compositeRefs
                    .filter((entry) => compositeAssetKeys[entry.id] ?? entry.outputAssetKey)
                    .map((entry) => entry.id),
                )
                const availableStoryboardRefIds = new Set<string>([
                  ...(storyboardSequenceAssetKey ? ['storyboard_sequence'] : []),
                  ...Object.entries(storyboardPanelAssetKeys)
                    .filter(([, assetKey]) => typeof assetKey === 'string' && assetKey.length > 0)
                    .map(([panelId]) => panelId),
                  ...((rawScriptDoc.storyboard?.panels ?? [])
                    .filter((panel) => panel.assetKey)
                    .map((panel) => panel.id)),
                ])
                const participantRefIds = [...shot.participantRefIds]
                const locationRefId = shot.locationRefId ?? soleEnvironmentRefId
                const filteredPropRefIds = shot.propRefIds.filter((refId) => !incidentalScriptPropRefIds.has(refId))
                const participantBindings = participantRefIds
                  .map((refId) => rawScriptDoc.entityBindings.find((binding) => binding.id === refId) ?? null)
                  .filter((binding): binding is NonNullable<typeof binding> => binding !== null)
                  .map((binding) => ({
                    id: binding.id,
                    sourceName: binding.sourceName || binding.label,
                  }))
                const dialogue = (shot.dialogue.length > 0 ? shot.dialogue : (
                  shotImpliesDialogue({
                    promptText: batch.prompt,
                    title: shot.title,
                    beat: shot.beat,
                    shotType: shot.shotType,
                  })
                    ? buildFallbackDialogueBeats({
                      shotId: shot.id,
                      beat: shot.beat,
                      participants: participantBindings,
                    })
                    : []
                )).map((entry, dialogueIndex) => {
                  if (entry.speakerRefId || participantRefIds.length === 0) return entry
                  scriptRepairDiagnostics.push(`Filled missing speakerRefId for shot "${shot.title}" dialogue beat ${dialogueIndex + 1}.`)
                  return {
                    ...entry,
                    speakerRefId: participantRefIds[Math.min(dialogueIndex, participantRefIds.length - 1)] ?? participantRefIds[0] ?? null,
                  }
                })
                if (shot.dialogue.length === 0 && dialogue.length > 0) {
                  authoringFlags.usedDialogueFallback = true
                  scriptRepairDiagnostics.push(`Synthesized dialogue beats for shot "${shot.title}" after script repair left them empty.`)
                }
                const actions = shot.actions.map((entry, actionIndex) => {
                  const nextEntry = { ...entry }
                  let repaired = false
                  const promptDirectedAction = inferPromptDirectedActionBinding(batch.prompt, nextEntry.verb, participantBindings)
                  if (promptDirectedAction && (
                    nextEntry.actorRefId !== promptDirectedAction.actorRefId
                    || nextEntry.targetRefId !== promptDirectedAction.targetRefId
                  )) {
                    nextEntry.actorRefId = promptDirectedAction.actorRefId
                    nextEntry.targetRefId = promptDirectedAction.targetRefId
                    repaired = true
                    authoringFlags.usedActionBindingRepair = true
                    scriptRepairDiagnostics.push(`Corrected named action binding for shot "${shot.title}" action beat ${actionIndex + 1}.`)
                  }
                  if (!nextEntry.actorRefId && participantRefIds[0]) {
                    nextEntry.actorRefId = participantRefIds[0]
                    repaired = true
                  }
                  if (!nextEntry.targetRefId && participantRefIds.length > 1) {
                    nextEntry.targetRefId = participantRefIds.find((refId) => refId !== nextEntry.actorRefId) ?? participantRefIds[1] ?? null
                    repaired = true
                  }
                  if (repaired) {
                    scriptRepairDiagnostics.push(`Filled missing action refs for shot "${shot.title}" action beat ${actionIndex + 1}.`)
                  }
                  return nextEntry
                })
                const audio = shot.audio.length > 0
                  ? shot.audio.map((entry, audioIndex) => {
                      if (entry.sourceRefId || entry.kind === 'silence') return entry
                      const sourceRefId =
                        entry.kind === 'dialogue'
                          ? (dialogue[0]?.speakerRefId ?? participantRefIds[0] ?? null)
                          : locationRefId
                      if (sourceRefId) {
                        scriptRepairDiagnostics.push(`Filled missing audio sourceRefId for shot "${shot.title}" audio cue ${audioIndex + 1}.`)
                      }
                      return {
                        ...entry,
                        sourceRefId,
                      }
                    })
                  : shot.audio
                const requiredSourceRefIds = Array.from(new Set(
                  shot.requiredSourceRefIds.length > 0
                    ? shot.requiredSourceRefIds.filter((refId) => (
                      !incidentalScriptPropRefIds.has(refId)
                      && (
                        resolvedEntityRefs.some((entityRef) => entityRef.id === refId)
                      || availableCompositeRefIds.has(refId)
                      || availableStoryboardRefIds.has(refId)
                      )
                    ))
                    : [
                        ...shot.storyboardRefIds.filter((refId) => availableStoryboardRefIds.has(refId)),
                        ...shot.compositeRefIds.filter((refId) => availableCompositeRefIds.has(refId)),
                        ...participantRefIds,
                        ...(locationRefId ? [locationRefId] : []),
                        ...filteredPropRefIds,
                      ],
                ))
                return {
                  ...shot,
                  orderIndex: index,
                  sceneId: shot.sceneId ?? rawScriptDoc.scenes[0]?.id ?? null,
                  locationRefId,
                  participantRefIds,
                  propRefIds: filteredPropRefIds,
                  dialogue,
                  actions,
                  audio,
                  requiredSourceRefIds,
                }
              }),
            })
            const persistedCinematicPlan = materializeCinematicPlan({
              requestSummary: batch.request_summary,
              graphName: authoredCinematicPlan.graphName,
              graphSummary: authoredCinematicPlan.graphSummary,
              entityRefs: resolvedEntityRefs,
              scriptDoc,
              relationshipRefs: scriptDoc.relationships,
              compositeRefPlans: scriptDoc.compositeRefs,
              storyboardPlan: scriptDoc.storyboard,
              shots: [],
              graphSettings: authoredCinematicPlan.graphSettings ?? {},
              diagnostics: [],
              assistantNotes: undefined,
            })
            const mergedBatchDiagnostics = Array.from(new Set([
              ...(Array.isArray(batch.diagnostics) ? batch.diagnostics : []),
              ...plannerDiagnostics,
            ]))
            await updateBatch(client, batch.id, {
              cinematic_plan: persistedCinematicPlan,
              diagnostics: mergedBatchDiagnostics,
            })
            batch = {
              ...batch,
              cinematic_plan: persistedCinematicPlan,
              diagnostics: mergedBatchDiagnostics,
            }
            const sourceNodeIds = new Set<string>([
              ...scriptDoc.entityBindings.map((binding) => binding.id),
              ...scriptDoc.compositeRefs.filter((composite) => composite.outputAssetKey).map((composite) => composite.id),
              ...(scriptDoc.storyboard?.sequenceAssetKey ? ['storyboard_sequence'] : []),
              ...(scriptDoc.storyboard?.panels ?? []).filter((panel) => panel.assetKey).map((panel) => panel.id),
            ])
            const sourceCoverage = scriptDoc.shots.map((shot) => {
              const requiredSourceRefIds = shot.requiredSourceRefIds.length > 0
                ? shot.requiredSourceRefIds
                : Array.from(new Set([
                    ...shot.storyboardRefIds.filter((refId) => sourceNodeIds.has(refId)),
                    ...shot.compositeRefIds.filter((refId) => sourceNodeIds.has(refId)),
                    ...shot.participantRefIds,
                    ...(shot.locationRefId ? [shot.locationRefId] : []),
                    ...shot.propRefIds,
                  ]))
              const missingSourceRefIds = requiredSourceRefIds.filter((refId) => !sourceNodeIds.has(refId))
              return {
                shotId: shot.id,
                expectedSourceCount: requiredSourceRefIds.length,
                connectedSourceCount: requiredSourceRefIds.length - missingSourceRefIds.length,
                missingSourceRefIds,
              }
            })

            await updateJob(client, job.id, {
              result_context: {
                ...(job.result_context ?? {}),
                graphKey,
                phase: 'compiling_graph',
              },
            })
            let authoredGraph = compileCinematicGraphFromScriptDoc({
              graphKey,
              graphName: persistedCinematicPlan.graphName,
              graphSummary: persistedCinematicPlan.graphSummary,
              graphSettings: persistedCinematicPlan.graphSettings ?? {},
              scriptDoc,
              existingMetadata: {
                generation: {
                  batchId: batch.id,
                  jobId: job.id,
                  state: 'completed',
                  placeholder: false,
                  source: 'global_prompt',
                },
              },
            })
            const shouldAutoRunCinematic = false
            const authoringDiagnostics = [...plannerDiagnostics, ...scriptRepairDiagnostics]
            const authorshipPipeline =
              typeof job.result_context?.authorshipPipeline === 'string'
                ? job.result_context.authorshipPipeline
                : typeof authoredCinematicPlan.graphSettings?.authorshipPipeline === 'string'
                  ? authoredCinematicPlan.graphSettings.authorshipPipeline
                  : null
            const authorshipPromptVersion =
              typeof job.result_context?.authorshipPromptVersion === 'string'
                ? job.result_context.authorshipPromptVersion
                : null
            authoredGraph = {
              ...authoredGraph,
              metadata: {
                ...authoredGraph.metadata,
                cinematicAuthoring: {
                  phase: 'completed',
                  authorshipPipeline,
                  authorshipPromptVersion,
                  repairApplied: authoringFlags.usedRepairPass || scriptRepairDiagnostics.length > 0,
                  usedRepairPass: authoringFlags.usedRepairPass,
                  usedFallbackPrimaryShot: authoringFlags.usedFallbackPrimaryShot,
                  usedTemporalExpansionFallback: authoringFlags.usedTemporalExpansionFallback,
                  usedDialogueFallback: authoringFlags.usedDialogueFallback,
                  usedActionBindingRepair: authoringFlags.usedActionBindingRepair,
                  rawScriptMarkdown: authoredCinematicPlan.rawScriptMarkdown ?? '',
                  parsedShotCount: scriptDoc.shots.length,
                  diagnostics: authoringDiagnostics,
                  sourceCoverage,
                },
                generation: {
                  batchId: batch.id,
                  jobId: job.id,
                  state: shouldAutoRunCinematic ? 'running' : 'completed',
                  placeholder: false,
                  source: 'global_prompt',
                },
              },
            }

            await replaceGraphContents(client, batch.draft_id, authoredGraph)

            if (scriptRepairDiagnostics.length > 0) {
              const nextDiagnostics = Array.from(new Set([
                ...(Array.isArray(batch.diagnostics) ? batch.diagnostics : []),
                ...scriptRepairDiagnostics,
              ]))
              await updateBatch(client, batch.id, {
                diagnostics: nextDiagnostics,
              })
              batch = {
                ...batch,
                diagnostics: nextDiagnostics,
              }
              console.warn('[GraphCore] cinematic graph authoring required repair.', {
                batchId: batch.id,
                worldBuildJobId: job.id,
                graphKey,
                diagnostics: scriptRepairDiagnostics,
                sourceCoverage,
              })
            }

            if (!shouldAutoRunCinematic) {
              await updateJob(client, job.id, {
                status: 'succeeded',
                result_context: {
                  graphKey,
                  phase: 'completed',
                  resolvedEntityRefs,
                  scriptRepairApplied: authoringFlags.usedRepairPass || scriptRepairDiagnostics.length > 0,
                  scriptRepairDiagnostics,
                  plannerDiagnostics,
                  authoringFlags,
                  sourceCoverage,
                },
                error_message: null,
              })
            } else {
              const cinematicStart = await client.functions.invoke('start-cinematic-run', {
                body: {
                  snapshot: {
                    project: snapshot.project,
                    draft: snapshot.draft,
                    definitions: cinematicDefinitions,
                    graphs: [authoredGraph],
                    assets: cinematicAssets,
                    gameSpec: snapshot.gameSpec ?? null,
                  },
                  graphKey,
                  mode: 'graph_run',
                },
              })

              if (cinematicStart.error || !cinematicStart.data) {
                const detailedMessage = await readInvokeErrorMessage(cinematicStart.error ?? null)
                console.error('[GraphCore] child cinematic run start failed during world-build polling.', {
                  batchId: batch.id,
                  worldBuildJobId: job.id,
                  graphKey,
                  message: cinematicStart.error?.message ?? null,
                  detailedMessage,
                })
                throw new Error(detailedMessage || cinematicStart.error?.message || 'Failed to start child cinematic run.')
              }

              const childRun = cinematicRunStatusResponseSchema.parse(cinematicStart.data)
              await updateJob(client, job.id, {
                status: 'running',
                result_context: {
                  graphKey,
                  resolvedEntityRefs,
                  childCinematicRunId: childRun.run.id,
                  scriptRepairApplied: scriptRepairDiagnostics.length > 0,
                  scriptRepairDiagnostics,
                  sourceCoverage,
                },
                error_message: null,
              })
            }
            }
          } else if (job.kind === 'narrative_graph') {
            const graphKey = job.target_keys?.graphKey
            if (!graphKey) throw new Error(`Placeholder graph key was missing for job ${job.id}.`)

            const dependencyContexts = jobs
              .filter((candidate) => (job.depends_on_job_ids ?? []).includes(candidate.id))
              .map((candidate) => candidate.result_context)
              .filter((value): value is Record<string, unknown> => Boolean(value))

            const graphPrompt = [
              `Update the existing placeholder graph "${graphKey}" only.`,
              'Do not create new characters, items, environments, assets, or other definitions.',
              `World prompt: ${batch.prompt}`,
              `Graph brief: ${(batch.plan_json.find((item) => item && typeof item === 'object' && (item as { id?: unknown }).id === job.plan_item_id) as { summary?: string } | undefined)?.summary ?? batch.request_summary}`,
              dependencyContexts.length > 0 ? `Dependencies: ${JSON.stringify(dependencyContexts)}` : null,
            ].filter(Boolean).join('\n')

            const promptPatch = await client.functions.invoke('prompt-patch', {
              body: {
                prompt: graphPrompt,
                snapshot,
                model: payload.model,
                mode: 'orchestrate',
                autoApply: false,
                intent: 'extend_graph',
                phase: 'graph_skeleton',
                targetMode: 'current_graph',
                graphType: 'narrative_flow',
                context: {
                  graphKey,
                  target: 'graph',
                },
                selectionContext: {
                  graphKey,
                  target: 'graph',
                },
              },
            })

            if (promptPatch.error) {
              throw new Error(promptPatch.error.message)
            }

            const proposal = promptPatch.data as { operations?: Array<Record<string, unknown>>; diagnostics?: string[] }
            const operations = Array.isArray(proposal.operations) ? proposal.operations : []
            if (operations.length === 0) {
              throw new Error((proposal.diagnostics ?? []).join(' ') || 'Prompt patch returned no graph operations.')
            }

            const applyResponse = await client.functions.invoke('apply-patch', {
              body: {
                draftId: batch.draft_id,
                operations,
              },
            })

            if (applyResponse.error) {
              throw new Error(applyResponse.error.message)
            }

            const graphRow = await client.from('draft_graphs').select('metadata').eq('draft_id', batch.draft_id).eq('key', graphKey).single()
            if (graphRow.error || !graphRow.data) throw new Error(graphRow.error?.message ?? `Graph ${graphKey} was not found.`)

            const currentGraphMetadata =
              typeof graphRow.data.metadata === 'object' && graphRow.data.metadata !== null
                ? graphRow.data.metadata as Record<string, unknown>
                : {}

            const graphUpdate = await client.from('draft_graphs').update({
              metadata: {
                ...currentGraphMetadata,
                generation: {
                  batchId: batch.id,
                  jobId: job.id,
                  state: 'completed',
                  placeholder: false,
                  source: 'global_prompt',
                },
              },
              updated_by: user.id,
            }).eq('draft_id', batch.draft_id).eq('key', graphKey)

            if (graphUpdate.error) throw new Error(graphUpdate.error.message)

            await updateJob(client, job.id, {
              status: 'succeeded',
              result_context: {
                graphKey,
                dependencyContexts,
              },
              error_message: null,
            })
          }
        } catch (jobError) {
          const errorMessage = jobError instanceof Error ? jobError.message : 'World build job failed.'
          await updateJob(client, job.id, {
            status: 'failed',
            error_message: errorMessage,
          })

          if (job.kind.endsWith('_definition') && job.target_keys?.definitionKey) {
            await markDefinitionGenerationState(client, batch.draft_id, job.target_keys.definitionKey, {
              batchId: batch.id,
              jobId: job.id,
              state: 'failed',
              placeholder: false,
              source: 'global_prompt',
            })
          }

          if ((job.kind === 'narrative_graph' || job.kind === 'cinematic_graph') && job.target_keys?.graphKey) {
            await markGraphGenerationState(client, batch.draft_id, job.target_keys.graphKey, {
              batchId: batch.id,
              jobId: job.id,
              state: 'failed',
              placeholder: false,
              source: 'global_prompt',
            })
          }

          if ((job.kind.includes('concept_image') || job.kind === 'cinematic_composite_image' || job.kind === 'cinematic_storyboard_image') && job.target_keys?.assetKey) {
            const assetRow = await client.from('project_assets').select('metadata').eq('project_id', batch.project_id).eq('key', job.target_keys.assetKey).maybeSingle()
            if (!assetRow.error && assetRow.data) {
              const currentMetadata =
                typeof assetRow.data.metadata === 'object' && assetRow.data.metadata !== null
                  ? assetRow.data.metadata as Record<string, unknown>
                  : {}

              await client.from('project_assets').update({
                metadata: {
                  ...currentMetadata,
                  generation: {
                    batchId: batch.id,
                    jobId: job.id,
                    state: 'failed',
                    placeholder: true,
                    source: 'global_prompt',
                  },
                },
              }).eq('project_id', batch.project_id).eq('key', job.target_keys.assetKey)
            }
          }
        }
      }

      const refreshed = await loadBatch(client, payload.batchId)
      let jobsToEvaluate = refreshed.jobs
      const runningCinematicJobs = jobsToEvaluate.filter((job) => job.kind === 'cinematic_graph' && job.status === 'running')

      if (runningCinematicJobs.length > 0) {
        const cinematicRuns = await loadCinematicRunsForBatchJobs(client, runningCinematicJobs)
        for (const cinematicJob of runningCinematicJobs) {
          const childRunId = typeof cinematicJob.result_context?.childCinematicRunId === 'string'
            ? cinematicJob.result_context.childCinematicRunId
            : null
          if (!childRunId) continue

          const childRun = cinematicRuns.find((run) => run.id === childRunId) ?? null
          if (!childRun) continue

          if (isTerminalCinematicRunStatus(childRun.status)) {
            const nextJobStatus = childRun.status === 'failed' ? 'failed' : 'succeeded'
            await updateJob(client, cinematicJob.id, {
              status: nextJobStatus,
              result_context: {
                ...(cinematicJob.result_context ?? {}),
                childCinematicRunId: childRunId,
                childCinematicStatus: childRun.status,
              },
              error_message: childRun.status === 'failed' ? 'Child cinematic run failed.' : null,
            })

            if (cinematicJob.target_keys?.graphKey) {
              await markGraphGenerationState(client, batch.draft_id, cinematicJob.target_keys.graphKey, {
                batchId: batch.id,
                jobId: cinematicJob.id,
                state: childRun.status === 'failed' ? 'failed' : 'completed',
                placeholder: false,
                source: 'global_prompt',
              })
            }
          }
        }

        const reloadedAfterCinematicSync = await loadBatch(client, payload.batchId)
        jobsToEvaluate = reloadedAfterCinematicSync.jobs
      }

      const parsedJobs = jobsToEvaluate.map(parseWorldBuildJob)

      const nextStatus = terminalStatusFromJobs(parsedJobs)
      if (nextStatus !== refreshed.batch.status) {
        await updateBatch(client, payload.batchId, { status: nextStatus })
      }
    }

    const finalLoaded = await loadBatch(client, payload.batchId)
    const finalJobs = finalLoaded.jobs.map(parseWorldBuildJob)
    const resources = await loadBatchResources(client, finalLoaded.batch.draft_id, finalLoaded.batch.project_id, payload.batchId)
    const cinematicRuns = await loadCinematicRunsForBatchJobs(client, finalLoaded.jobs)

    return json(worldBuildStatusResponseSchema.parse({
      batch: worldBuildBatchSchema.parse({
        id: finalLoaded.batch.id,
        projectId: finalLoaded.batch.project_id,
        draftId: finalLoaded.batch.draft_id,
        prompt: finalLoaded.batch.prompt,
        requestSummary: finalLoaded.batch.request_summary,
        plannerMode: finalLoaded.batch.planner_mode ?? 'world_build',
        status: finalLoaded.batch.status,
        diagnostics: finalLoaded.batch.diagnostics ?? [],
        planItems: finalLoaded.batch.plan_json ?? [],
        cinematicPlan: normalizeCinematicPlanForTransport(finalLoaded.batch.cinematic_plan ?? null),
        createdAt: finalLoaded.batch.created_at,
        updatedAt: finalLoaded.batch.updated_at,
        jobs: finalJobs,
      }),
      definitions: resources.definitions,
      graphs: resources.graphs,
      assets: resources.assets,
      cinematicRuns,
    }))
  } catch (error) {
    return errorResponse(error, 'Failed to poll world build.')
  }
})
