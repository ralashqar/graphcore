import { z } from 'npm:zod@4'

import { normalizeNode } from '../../../src/domain/nodeLibrary.ts'
import {
  actionBeatSchema,
  audioBeatSchema,
  cinematicBeatSchema,
  cinematicRelationshipSchema,
  cinematicSequenceSchema,
  dialogueBeatSchema,
  storyboardSpecSchema,
} from '../../../src/domain/cinematics.ts'
import {
  cinematicCompositeRefPlanSchema,
  cinematicGraphSettingsSchema,
  cinematicPlanSchema,
  cinematicShotPlanSchema,
  type CinematicEntityRef,
  type CinematicPlan,
} from '../../../src/domain/worldBuild.ts'
import { createGraphScaffold, type GraphScaffold } from './world-build-placeholders.ts'

type SnapshotDefinition = {
  key: string
  kind: string
  name: string
  summary?: string | null
}

export const cinematicIntentSchema = z.object({
  plannerMode: z.enum(['world_build', 'cinematic_build']),
  reason: z.string().default(''),
})

export const cinematicEntityExtractionSchema = z.object({
  requestSummary: z.string().default('Cinematic build plan'),
  entityRefs: z.array(z.object({
    id: z.string(),
    kind: z.enum(['character', 'environment', 'item']),
    role: z.string(),
    sourceName: z.string(),
    summary: z.string().default(''),
    resolution: z.enum(['existing', 'create']).default('create'),
    definitionKey: z.string().nullable().optional(),
    planItemId: z.string().nullable().optional(),
  })).default([]),
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
})

export const cinematicPlannerRawSchema = z.object({
  requestSummary: z.string().default('Cinematic build plan'),
  graphName: z.string(),
  graphSummary: z.string(),
  entityRefs: z.array(z.object({
    id: z.string(),
    kind: z.enum(['character', 'environment', 'item']),
    role: z.string(),
    sourceName: z.string(),
    summary: z.string().default(''),
    resolution: z.enum(['existing', 'create']).default('create'),
    definitionKey: z.string().nullable().optional(),
    planItemId: z.string().nullable().optional(),
  })).default([]),
  relationshipRefs: z.array(cinematicRelationshipSchema).default([]),
  compositeRefPlans: z.array(cinematicCompositeRefPlanSchema).default([]),
  storyboardPlan: storyboardSpecSchema.nullable().default(null),
  shots: z.array(cinematicShotPlanSchema).min(1),
  graphSettings: cinematicGraphSettingsSchema,
  diagnostics: z.array(z.string()).default([]),
  assistantNotes: z.string().optional(),
})

function slugSeed(value: string, fallback: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
}

function pickFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeEntityKind(value: unknown, fallback: 'character' | 'environment' | 'item' = 'item') {
  if (typeof value !== 'string') return fallback
  const normalized = normalizeMatchKey(value)
  if (normalized.includes('environment') || normalized.includes('location') || normalized.includes('setting') || normalized.includes('temple')) {
    return 'environment' as const
  }
  if (normalized.includes('character') || normalized.includes('fighter') || normalized.includes('person') || normalized.includes('hero') || normalized.includes('villain')) {
    return 'character' as const
  }
  if (normalized.includes('item') || normalized.includes('prop') || normalized.includes('weapon') || normalized.includes('sword')) {
    return 'item' as const
  }
  return fallback
}

function inferEntityKindFromRole(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = normalizeMatchKey(value)
  if (!normalized) return null
  if (
    normalized.includes('location')
    || normalized.includes('setting')
    || normalized.includes('place')
    || normalized.includes('scene')
    || normalized.includes('background')
    || normalized.includes('environment')
  ) {
    return 'environment' as const
  }
  if (
    normalized.includes('participant')
    || normalized.includes('speaker')
    || normalized.includes('actor')
    || normalized.includes('target')
    || normalized.includes('lead')
    || normalized.includes('hero')
    || normalized.includes('villain')
    || normalized.includes('opponent')
  ) {
    return 'character' as const
  }
  if (
    normalized.includes('prop')
    || normalized.includes('weapon')
    || normalized.includes('item')
    || normalized.includes('object')
    || normalized.includes('gear')
  ) {
    return 'item' as const
  }
  return null
}

function normalizeShotType(value: unknown) {
  if (typeof value !== 'string') return 'custom' as const
  const normalized = normalizeMatchKey(value)
  if (normalized.includes('establish')) return 'establishing' as const
  if (normalized.includes('dialog')) return 'dialogue' as const
  if (normalized.includes('reveal')) return 'reveal' as const
  if (normalized.includes('action') || normalized.includes('fight') || normalized.includes('combat')) return 'action' as const
  if (normalized.includes('insert') || normalized.includes('detail')) return 'insert' as const
  if (normalized.includes('transition')) return 'transition' as const
  return 'custom' as const
}

function normalizePromptTextForStoryboard(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

type EntityLookup = {
  byId: Map<string, string>
  byDefinitionKey: Map<string, string>
  byNormalizedName: Map<string, string>
  byNormalizedDefinitionKey: Map<string, string>
}

function createEntityLookup(entityRefs: Array<{
  id: string
  sourceName: string
  definitionKey?: string | null
}>) {
  const lookup: EntityLookup = {
    byId: new Map(),
    byDefinitionKey: new Map(),
    byNormalizedName: new Map(),
    byNormalizedDefinitionKey: new Map(),
  }

  for (const entityRef of entityRefs) {
    registerEntityLookupEntry(lookup, entityRef)
  }

  return lookup
}

function registerEntityLookupEntry(
  lookup: EntityLookup,
  entityRef: {
    id: string
    sourceName: string
    definitionKey?: string | null
  },
) {
  lookup.byId.set(entityRef.id, entityRef.id)
  const normalizedName = normalizeMatchKey(entityRef.sourceName)
  if (normalizedName) {
    lookup.byNormalizedName.set(normalizedName, entityRef.id)
  }
  if (typeof entityRef.definitionKey === 'string' && entityRef.definitionKey.trim()) {
    lookup.byDefinitionKey.set(entityRef.definitionKey, entityRef.id)
    const normalizedDefinitionKey = normalizeMatchKey(entityRef.definitionKey)
    if (normalizedDefinitionKey) {
      lookup.byNormalizedDefinitionKey.set(normalizedDefinitionKey, entityRef.id)
    }
  }
}

function resolveEntityRefId(value: unknown, lookup: EntityLookup) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (lookup.byId.has(trimmed)) return lookup.byId.get(trimmed) ?? null
  if (lookup.byDefinitionKey.has(trimmed)) return lookup.byDefinitionKey.get(trimmed) ?? null
  const normalized = normalizeMatchKey(trimmed)
  if (!normalized) return null
  return lookup.byNormalizedName.get(normalized)
    ?? lookup.byNormalizedDefinitionKey.get(normalized)
    ?? null
}

function collectNamedRefs(
  value: unknown,
  entityLookup: EntityLookup,
) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return resolveEntityRefId(entry, entityLookup)
      }
      const record = asRecord(entry)
      if (!record) return null
      const candidate = pickFirstString(record, ['id', 'refId', 'entityRefId', 'sourceRefId', 'definitionKey', 'sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
      if (!candidate) return null
      return resolveEntityRefId(candidate, entityLookup)
    })
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

function collectNamedLabels(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      const record = asRecord(entry)
      if (!record) return ''
      return pickFirstString(record, ['sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
    })
    .filter((entry) => entry.length > 0)
}

function coerceArrayWithSchema<TOutput>(value: unknown, schema: z.ZodType<TOutput>) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => schema.safeParse(entry))
    .filter((entry): entry is { success: true; data: TOutput } => entry.success)
    .map((entry) => entry.data)
}

function buildFallbackShot(input: {
  requestSummary: string
  graphSummary: string
  entityRefs: Array<{
    id: string
    kind: 'character' | 'environment' | 'item'
  }>
}) {
  const environmentRef = input.entityRefs.find((entry) => entry.kind === 'environment') ?? null
  const participantRefIds = input.entityRefs.filter((entry) => entry.kind === 'character').map((entry) => entry.id)
  const propRefIds = input.entityRefs.filter((entry) => entry.kind === 'item').map((entry) => entry.id)
  const beat = input.graphSummary.trim() || input.requestSummary.trim() || 'Play the key cinematic beat described by the prompt.'
  const shotType =
    participantRefIds.length >= 2
      ? 'action' as const
      : environmentRef
        ? 'establishing' as const
        : 'custom' as const

  return {
    id: 'shot_1',
    title: 'Primary beat',
    beat,
    participantRefIds,
    locationRefId: environmentRef?.id ?? null,
    propRefIds,
    shotType,
    framing: shotType === 'establishing' ? 'Wide establishing frame' : '',
    cameraAngle: '',
    cameraMovement: '',
    lensPreference: '',
    durationSeconds: null,
    visualPrompt: '',
    compositionGuide: [
      participantRefIds.length > 0 ? 'Keep the key participants clearly readable in the frame.' : null,
      environmentRef ? 'Anchor the shot in the planned environment.' : null,
      propRefIds.length > 0 ? 'Ensure the planned props are visibly present or actively used.' : null,
    ].filter(Boolean).join(' '),
    beats: [],
    dialogue: [],
    actions: participantRefIds.length > 0
      ? [{
          id: 'action_1',
          actorRefId: participantRefIds[0] ?? null,
          targetRefId: participantRefIds[1] ?? null,
          verb: shotType === 'action' ? 'engages in combat' : 'performs the key scene action',
          propRefId: propRefIds[0] ?? null,
          stagingNotes: '',
          startSeconds: null,
          endSeconds: null,
        }]
      : [],
    audio: [],
  }
}

export function coerceCinematicEntityExtractionRaw(input: unknown) {
  const record = asRecord(input) ?? {}
  const requestSummary = pickFirstString(record, ['requestSummary', 'summary', 'title']) || 'Cinematic build plan'

  const rawEntityRefs = Array.isArray(record.entityRefs)
    ? record.entityRefs
    : Array.isArray(record.entities)
      ? record.entities
      : []

  const sectionEntityRefs = [
    ...(Array.isArray(record.characters)
      ? record.characters.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'character' }))
      : []),
    ...(Array.isArray(record.environments)
      ? record.environments.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'environment' }))
      : []),
    ...(Array.isArray(record.items)
      ? record.items.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'item' }))
      : []),
  ]

  const entityRefs = [...rawEntityRefs, ...sectionEntityRefs]
    .map((entry, index) => {
      const entity = asRecord(entry)
      if (!entity) return null
      const sourceName = pickFirstString(entity, ['sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
      if (!sourceName) return null
      const inferredRoleKind = inferEntityKindFromRole(entity.role ?? entity.purpose ?? entity.usage ?? entity.relation)
      const kind = normalizeEntityKind(entity.kind ?? entity.type ?? entity.category, inferredRoleKind ?? 'character')
      const id = pickFirstString(entity, ['id', 'key']) || `${kind}_${slugSeed(sourceName, `entity_${index + 1}`)}`
      const role = pickFirstString(entity, ['role', 'purpose', 'usage', 'relation'])
        || (kind === 'environment' ? 'location' : kind === 'item' ? 'prop' : 'participant')
      const resolutionCandidate = pickFirstString(entity, ['resolution', 'matchType', 'source'])
      const resolution = resolutionCandidate === 'existing' || resolutionCandidate === 'create'
        ? resolutionCandidate
        : (pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) ? 'existing' : 'create')

      return {
        id,
        kind,
        role,
        sourceName,
        summary: pickFirstString(entity, ['summary', 'description', 'brief']),
        resolution,
        definitionKey: pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) || null,
        planItemId: pickFirstString(entity, ['planItemId']) || null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const diagnosticsValue = record.diagnostics
  const diagnostics = Array.isArray(diagnosticsValue)
    ? asStringArray(diagnosticsValue)
    : asRecord(diagnosticsValue)
      ? Object.entries(diagnosticsValue).map(([key, value]) => `${key}: ${String(value)}`)
      : []

  const assistantNotesValue = record.assistantNotes ?? record.notes
  const assistantNotes = typeof assistantNotesValue === 'string'
    ? assistantNotesValue
    : Array.isArray(assistantNotesValue)
      ? asStringArray(assistantNotesValue).join('\n')
      : asRecord(assistantNotesValue)
        ? JSON.stringify(assistantNotesValue)
        : undefined

  return cinematicEntityExtractionSchema.parse({
    requestSummary,
    entityRefs,
    diagnostics,
    assistantNotes,
  })
}

function sanitizeRelationshipRefs(
  relationships: Array<z.infer<typeof cinematicRelationshipSchema>>,
  entityLookup: EntityLookup,
) {
  return relationships
    .map((relationship) => {
      const sourceRefId = resolveEntityRefId(relationship.sourceRefId, entityLookup)
      const targetRefId = resolveEntityRefId(relationship.targetRefId, entityLookup)
      if (!sourceRefId || !targetRefId) return null
      return {
        ...relationship,
        sourceRefId,
        targetRefId,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

function sanitizeCompositeRefPlans(
  composites: Array<z.infer<typeof cinematicCompositeRefPlanSchema>>,
  entityLookup: EntityLookup,
) {
  return composites
    .map((composite) => {
      const sourceRefIds = Array.from(new Set(
        composite.sourceRefIds
          .map((entry) => resolveEntityRefId(entry, entityLookup))
          .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
      ))
      if (sourceRefIds.length < 2) return null
      return {
        ...composite,
        sourceRefIds,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

type CoerceCinematicPlannerOptions = {
  lockedEntityRefs?: Array<z.infer<typeof cinematicEntityExtractionSchema>['entityRefs'][number]>
  allowEntityCreation?: boolean
}

export function coerceCinematicPlannerRaw(input: unknown, options: CoerceCinematicPlannerOptions = {}) {
  const record = asRecord(input) ?? {}
  const requestSummary = pickFirstString(record, ['requestSummary', 'summary', 'title']) || 'Cinematic build plan'
  const graphName = pickFirstString(record, ['graphName', 'name', 'title']) || 'Prompt Cinematic'
  const graphSummary = pickFirstString(record, ['graphSummary', 'summary', 'description']) || requestSummary
  const lockedEntityRefs = options.lockedEntityRefs
    ? options.lockedEntityRefs.map((entry) => ({ ...entry }))
    : null
  const allowEntityCreation = options.allowEntityCreation ?? !lockedEntityRefs

  const rawEntityRefs = lockedEntityRefs
    ? []
    : (
      Array.isArray(record.entityRefs)
        ? record.entityRefs
        : Array.isArray(record.entities)
          ? record.entities
          : []
    )

  const sectionEntityRefs = lockedEntityRefs
    ? []
    : [
      ...(Array.isArray(record.characters)
        ? record.characters.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'character' }))
        : []),
      ...(Array.isArray(record.environments)
        ? record.environments.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'environment' }))
        : []),
      ...(Array.isArray(record.items)
        ? record.items.map((entry) => ({ ...(asRecord(entry) ?? { name: typeof entry === 'string' ? entry : '' }), kind: 'item' }))
        : []),
    ]

  const entityRefs = lockedEntityRefs ?? [...rawEntityRefs, ...sectionEntityRefs]
    .map((entry, index) => {
      if (lockedEntityRefs) return entry
      const entity = asRecord(entry)
      if (!entity) return null
      const sourceName = pickFirstString(entity, ['sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
      if (!sourceName) return null
      const inferredRoleKind = inferEntityKindFromRole(entity.role ?? entity.purpose ?? entity.usage ?? entity.relation)
      const kind = normalizeEntityKind(entity.kind ?? entity.type ?? entity.category, inferredRoleKind ?? 'character')
      const id = pickFirstString(entity, ['id', 'key']) || `${kind}_${slugSeed(sourceName, `entity_${index + 1}`)}`
      const role = pickFirstString(entity, ['role', 'purpose', 'usage', 'relation'])
        || (kind === 'environment' ? 'location' : kind === 'item' ? 'prop' : 'participant')
      const resolutionCandidate = pickFirstString(entity, ['resolution', 'matchType', 'source'])
      const resolution = resolutionCandidate === 'existing' || resolutionCandidate === 'create'
        ? resolutionCandidate
        : (pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) ? 'existing' : 'create')

      return {
        id,
        kind,
        role,
        sourceName,
        summary: pickFirstString(entity, ['summary', 'description', 'brief']),
        resolution,
        definitionKey: pickFirstString(entity, ['definitionKey', 'existingDefinitionKey']) || null,
        planItemId: pickFirstString(entity, ['planItemId']) || null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const rawShots = Array.isArray(record.shots)
    ? record.shots
    : Array.isArray(record.scenes)
      ? record.scenes
      : Array.isArray(record.beats)
        ? record.beats
        : Array.isArray(record.sequence)
          ? record.sequence
          : []

  const entityLookup = createEntityLookup(entityRefs)

  function ensureEntityRef(input: {
    sourceName: string
    kind: 'character' | 'environment' | 'item'
    role: string
  }) {
    const sourceName = input.sourceName.trim()
    if (!sourceName) return null
    const existingId = resolveEntityRefId(sourceName, entityLookup)
    if (existingId) return existingId
    if (!allowEntityCreation) return null

    const id = `${input.kind}_${slugSeed(sourceName, `${input.kind}_${entityRefs.length + 1}`)}`
    const nextEntityRef = {
      id,
      kind: input.kind,
      role: input.role,
      sourceName,
      summary: '',
      resolution: 'create',
      definitionKey: null,
      planItemId: null,
    }
    entityRefs.push(nextEntityRef)
    registerEntityLookupEntry(entityLookup, nextEntityRef)
    return id
  }

  const shots = rawShots
    .map((entry, index) => {
      const shot = asRecord(entry)
      if (!shot) return null
      const title = pickFirstString(shot, ['title', 'name', 'label']) || `Shot ${index + 1}`
      const beat = pickFirstString(shot, ['beat', 'description', 'summary', 'script', 'action', 'text'])
      if (!beat) return null

      const locationName = pickFirstString(shot, ['location', 'environment', 'setting'])
      const locationRefId = locationName
        ? (resolveEntityRefId(locationName, entityLookup) ?? ensureEntityRef({
          sourceName: locationName,
          kind: 'environment',
          role: 'location',
        }) ?? null)
        : null

      const participantNames = collectNamedLabels(shot.participantRefIds ?? shot.participants ?? shot.characters ?? shot.cast)
      for (const participantName of participantNames) {
        ensureEntityRef({
          sourceName: participantName,
          kind: 'character',
          role: 'participant',
        })
      }

      const propNames = collectNamedLabels(shot.propRefIds ?? shot.props ?? shot.items)
      for (const propName of propNames) {
        ensureEntityRef({
          sourceName: propName,
          kind: 'item',
          role: 'prop',
        })
      }

      return {
        id: pickFirstString(shot, ['id', 'key']) || `shot_${index + 1}`,
        title,
        beat,
        participantRefIds: Array.from(new Set(collectNamedRefs(shot.participantRefIds ?? shot.participants ?? shot.characters ?? shot.cast, entityLookup))),
        locationRefId,
        propRefIds: Array.from(new Set(collectNamedRefs(shot.propRefIds ?? shot.props ?? shot.items, entityLookup))),
        shotType: normalizeShotType(shot.shotType ?? shot.type),
        framing: pickFirstString(shot, ['framing', 'frame', 'composition']),
        cameraAngle: pickFirstString(shot, ['cameraAngle', 'angle']),
        cameraMovement: pickFirstString(shot, ['cameraMovement', 'movement']),
        lensPreference: pickFirstString(shot, ['lensPreference', 'lens']),
        durationSeconds: typeof shot.durationSeconds === 'number'
          ? shot.durationSeconds
          : typeof shot.duration === 'number'
            ? shot.duration
            : null,
        visualPrompt: pickFirstString(shot, ['visualPrompt', 'prompt', 'visualDescription']),
        compositionGuide: pickFirstString(shot, ['compositionGuide', 'blocking', 'sceneComposition', 'ingredientGuide', 'stagingNotes']),
        beats: coerceArrayWithSchema(shot.beats, cinematicBeatSchema),
        dialogue: coerceArrayWithSchema(shot.dialogue ?? shot.lines, dialogueBeatSchema).map((entry) => ({
          ...entry,
          speakerRefId: entry.speakerRefId ? resolveEntityRefId(entry.speakerRefId, entityLookup) : null,
        })),
        actions: coerceArrayWithSchema(shot.actions, actionBeatSchema).map((entry) => ({
          ...entry,
          actorRefId: entry.actorRefId ? resolveEntityRefId(entry.actorRefId, entityLookup) : null,
          targetRefId: entry.targetRefId ? resolveEntityRefId(entry.targetRefId, entityLookup) : null,
          propRefId: entry.propRefId ? resolveEntityRefId(entry.propRefId, entityLookup) : null,
        })),
        audio: coerceArrayWithSchema(shot.audio ?? shot.sound, audioBeatSchema).map((entry) => ({
          ...entry,
          sourceRefId: entry.sourceRefId ? resolveEntityRefId(entry.sourceRefId, entityLookup) : null,
        })),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const normalizedShots = shots.length > 0
    ? shots
    : [buildFallbackShot({
      requestSummary,
      graphSummary,
      entityRefs,
    })]
  const soleEnvironmentRefId =
    entityRefs.filter((entry) => entry.kind === 'environment').length === 1
      ? entityRefs.find((entry) => entry.kind === 'environment')?.id ?? null
      : null
  const normalizedShotsWithDefaultLocation = normalizedShots.map((shot) => (
    !shot.locationRefId && soleEnvironmentRefId
      ? {
          ...shot,
          locationRefId: soleEnvironmentRefId,
        }
      : shot
  ))

  const relationshipRefs = sanitizeRelationshipRefs(
    coerceArrayWithSchema(record.relationshipRefs ?? record.relationships, cinematicRelationshipSchema),
    entityLookup,
  )

  if (relationshipRefs.length === 0) {
    const firstLocation = entityRefs.find((entry) => entry.kind === 'environment') ?? null
    const characterRefs = entityRefs.filter((entry) => entry.kind === 'character')
    const propRefs = entityRefs.filter((entry) => entry.kind === 'item')

    for (const propRef of propRefs) {
      if (characterRefs[0]) {
        relationshipRefs.push({
          id: `rel_${characterRefs[0].id}_${propRef.id}`,
          type: 'equip',
          sourceRefId: characterRefs[0].id,
          targetRefId: propRef.id,
          notes: 'Defaulted from prompt participants and props.',
        })
      }
    }

    if (characterRefs.length >= 2) {
      relationshipRefs.push({
        id: `rel_${characterRefs[0].id}_${characterRefs[1].id}`,
        type: 'targets',
        sourceRefId: characterRefs[0].id,
        targetRefId: characterRefs[1].id,
        notes: 'Defaulted from multi-character cinematic prompt.',
      })
    }

    if (firstLocation && characterRefs[0]) {
      relationshipRefs.push({
        id: `rel_${characterRefs[0].id}_${firstLocation.id}`,
        type: 'located_in',
        sourceRefId: characterRefs[0].id,
        targetRefId: firstLocation.id,
        notes: 'Defaulted from cinematic location context.',
      })
    }
  }

  const compositeRefPlans = sanitizeCompositeRefPlans(
    coerceArrayWithSchema(record.compositeRefPlans ?? record.composites, cinematicCompositeRefPlanSchema),
    entityLookup,
  )

  if (compositeRefPlans.length === 0) {
    for (const relationship of relationshipRefs) {
      if (!['equip', 'wear', 'hold', 'mounted_on'].includes(relationship.type)) continue
      const sourceRef = entityRefs.find((entry) => entry.id === relationship.sourceRefId) ?? null
      const targetRef = entityRefs.find((entry) => entry.id === relationship.targetRefId) ?? null
      if (!sourceRef || !targetRef) continue
      compositeRefPlans.push({
        id: `composite_${sourceRef.id}_${targetRef.id}`,
        title: `${sourceRef.sourceName} with ${targetRef.sourceName}`,
        summary: `${sourceRef.sourceName} combined with ${targetRef.sourceName} for continuity.`,
        relationshipType: relationship.type,
        sourceRefIds: [sourceRef.id, targetRef.id],
        generationPrompt: `${sourceRef.sourceName} combined with ${targetRef.sourceName} in one clear, production-ready reference frame.`,
        outputAssetKey: null,
        stagingNotes: relationship.notes,
        priority: 80,
      })
    }
  }

  const storyboardPlanInput = record.storyboardPlan ?? record.storyboard
  const storyboardPlanParsed = storyboardSpecSchema.safeParse(storyboardPlanInput ?? {})
  const storyboardPlan = storyboardPlanParsed.success
    ? storyboardPlanParsed.data
    : {
        mode:
          normalizedShotsWithDefaultLocation.length > 1
            ? 'hybrid' as const
            : (normalizePromptTextForStoryboard(requestSummary).includes('storyboard') ? 'sequence_board' as const : 'none' as const),
        summary: normalizedShotsWithDefaultLocation.length > 1 ? 'Generate a storyboard sheet and shot panels for continuity.' : '',
        sequenceAssetKey: null,
        panels: normalizedShotsWithDefaultLocation.map((shot, index) => ({
          id: `panel_${shot.id}`,
          shotId: shot.id,
          title: shot.title,
          assetKey: null,
          notes: shot.compositionGuide,
          orderIndex: index,
        })),
      }

  const diagnosticsValue = record.diagnostics
  const diagnostics = Array.isArray(diagnosticsValue)
    ? asStringArray(diagnosticsValue)
    : asRecord(diagnosticsValue)
      ? Object.entries(diagnosticsValue).map(([key, value]) => `${key}: ${String(value)}`)
      : []

  const assistantNotesValue = record.assistantNotes ?? record.notes
  const assistantNotes = typeof assistantNotesValue === 'string'
    ? assistantNotesValue
    : Array.isArray(assistantNotesValue)
      ? asStringArray(assistantNotesValue).join('\n')
      : asRecord(assistantNotesValue)
        ? JSON.stringify(assistantNotesValue)
        : undefined

  return cinematicPlannerRawSchema.parse({
    requestSummary,
    graphName,
    graphSummary,
    entityRefs,
    relationshipRefs,
    compositeRefPlans,
    storyboardPlan,
    shots: normalizedShotsWithDefaultLocation,
    graphSettings: asRecord(record.graphSettings ?? record.settings) ?? {},
    diagnostics,
    assistantNotes,
  })
}

export const cinematicGraphAuthorSchema = z.object({
  graphName: z.string(),
  graphSummary: z.string(),
  graphSettings: cinematicGraphSettingsSchema,
  assetRefs: z.array(z.object({
    id: z.string(),
    nodeType: z.enum(['asset_ref', 'composite_ref', 'storyboard_ref']).default('asset_ref'),
    templateKey: z.string().default('asset_ref'),
    definitionKey: z.string().nullable().default(null),
    assetKey: z.string().nullable().default(null),
    assetRole: z.enum(['character', 'environment', 'item', 'audio', 'style', 'storyboard', 'composite']),
    title: z.string(),
    subtitle: z.string().nullable().default(null),
    stagingNotes: z.string().default(''),
    role: z.string().default('reference'),
    priority: z.number().int().min(0).max(100).default(50),
    sourceRefIds: z.array(z.string()).default([]),
    relationshipType: z.enum(['equip', 'wear', 'hold', 'mounted_on', 'located_in', 'targets', 'speaks_to', 'ally_of']).nullable().default(null),
  })).default([]),
  shots: z.array(z.object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().nullable().default(null),
    beat: z.string(),
    visualPrompt: z.string().default(''),
    compositionGuide: z.string().default(''),
    shotType: z.enum(['establishing', 'dialogue', 'reveal', 'action', 'insert', 'transition', 'custom']).default('custom'),
    framing: z.string().default(''),
    cameraAngle: z.string().default(''),
    cameraMovement: z.string().default(''),
    lensPreference: z.string().default(''),
    durationSeconds: z.number().int().positive().max(20).nullable().default(null),
    participantRefIds: z.array(z.string()).default([]),
    locationRefId: z.string().nullable().default(null),
    propRefIds: z.array(z.string()).default([]),
    sourceRefIds: z.array(z.string()).default([]),
    compositeRefIds: z.array(z.string()).default([]),
    storyboardRefIds: z.array(z.string()).default([]),
    beats: z.array(cinematicBeatSchema).default([]),
    dialogue: z.array(dialogueBeatSchema).default([]),
    actions: z.array(actionBeatSchema).default([]),
    audio: z.array(audioBeatSchema).default([]),
  })).min(1),
})

export function normalizeMatchKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildCinematicDefinitionCatalog(definitions: SnapshotDefinition[]) {
  return definitions
    .filter((definition) => definition.kind === 'character' || definition.kind === 'environment' || definition.kind === 'item')
    .map((definition) => ({
      definitionKey: definition.key,
      kind: definition.kind as 'character' | 'environment' | 'item',
      name: definition.name,
      summary: typeof definition.summary === 'string' ? definition.summary : '',
      normalizedName: normalizeMatchKey(definition.name),
      normalizedKey: normalizeMatchKey(definition.key),
    }))
}

export function buildPromptMatchedEntityRefs(
  prompt: string,
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
) {
  const normalizedPrompt = ` ${normalizeMatchKey(prompt)} `
  if (!normalizedPrompt.trim()) return []

  return catalog
    .map((entry) => {
      const candidates = [entry.normalizedName, entry.normalizedKey].filter((value) => value.length > 0)
      const matched = candidates.some((candidate) => normalizedPrompt.includes(` ${candidate} `))
      if (!matched) return null
      return {
        id: `${entry.kind}_${slugSeed(entry.name, entry.definitionKey)}`,
        kind: entry.kind,
        role: entry.kind === 'environment' ? 'location' : entry.kind === 'item' ? 'prop' : 'participant',
        sourceName: entry.name,
        summary: entry.summary,
        resolution: 'existing' as const,
        definitionKey: entry.definitionKey,
        planItemId: null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => right.sourceName.length - left.sourceName.length)
}

export function findStrongExistingDefinitionMatch(
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
  sourceName: string,
  kind: CinematicEntityRef['kind'],
) {
  const normalized = normalizeMatchKey(sourceName)
  if (!normalized) return null

  const candidates = catalog.filter((entry) => entry.kind === kind)
  const exact = candidates.find((entry) => entry.normalizedName === normalized || entry.normalizedKey === normalized)
  if (exact) return exact

  const fuzzy = candidates.find((entry) =>
    entry.normalizedName.includes(normalized)
    || normalized.includes(entry.normalizedName),
  )

  return fuzzy ?? null
}

function findStrongExistingDefinitionMatchAcrossKinds(
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
  sourceName: string,
) {
  const normalized = normalizeMatchKey(sourceName)
  if (!normalized) return null

  const exact = catalog.find((entry) => entry.normalizedName === normalized || entry.normalizedKey === normalized)
  if (exact) return exact

  const fuzzyMatches = catalog.filter((entry) =>
    entry.normalizedName.includes(normalized)
    || normalized.includes(entry.normalizedName),
  )

  if (fuzzyMatches.length === 1) return fuzzyMatches[0]
  return null
}

export function cinematicIntentSystemPrompt() {
  return [
    'You classify whether a GraphCore prompt should use the normal world-build planner or the cinematic planner.',
    'Return JSON only.',
    'Return exactly one object with keys: plannerMode, reason.',
    'Use plannerMode "cinematic_build" when the prompt is asking for a scene, sequence, shot plan, cinematic, trailer beat, cutscene, fight scene, dialogue scene, reveal scene, or other authored visual sequence.',
    'Use plannerMode "world_build" when the prompt is primarily asking for content creation without sequencing shots together.',
  ].join('\n')
}

export function cinematicEntityExtractionSystemPrompt() {
  return [
    'You extract the world entities a cinematic prompt depends on before graph authoring.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, entityRefs, diagnostics, assistantNotes.',
    'entityRefs must contain every important character, environment, and item mentioned or clearly required by the prompt.',
    'Each entityRef must contain: id, kind, role, sourceName, summary, resolution, definitionKey, planItemId.',
    'Use kind character for named people, speakers, fighters, targets, and participants unless the supplied catalog clearly contradicts that.',
    'Use kind environment for locations, rooms, taverns, streets, wilderness areas, and other settings.',
    'Use kind item for props, weapons, artifacts, tools, and carried objects.',
    'Set resolution to "existing" only when a supplied definitionKey is a confident match.',
    'Set resolution to "create" when the prompt needs a new entity that is not clearly in the supplied catalog.',
    'Prefer reusing supplied definitions instead of creating near-duplicates.',
    'Do not extract shots, storyboards, or graph structure here.',
  ].join('\n')
}

export function cinematicEntityResolutionSystemPrompt() {
  return [
    'You resolve extracted cinematic entities against the existing GraphCore definition catalog.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, entityRefs, diagnostics, assistantNotes.',
    'For each supplied entityRef, decide whether it should reuse an existing definition or be created new.',
    'Prefer existing definitions whenever the prompt meaning, spelling, aliases, or likely user intent indicate they are the same entity.',
    'Handle misspellings, shorthand, slug-like names, and key-like names such as char_kharzag when they clearly map to an existing definition.',
    'When reusing an existing definition, set resolution to "existing" and fill definitionKey with the exact supplied definitionKey.',
    'When no strong match exists, keep resolution as "create".',
    'Do not invent definitions that are not present in the supplied catalog.',
    'Preserve the intended role of each entity, but if the supplied catalog makes the kind obvious, prefer the catalog kind over a guessed kind.',
  ].join('\n')
}

export function cinematicPlannerSystemPrompt() {
  return [
    'You are the GraphCore cinematic planner.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, graphName, graphSummary, entityRefs, shots, graphSettings, diagnostics, assistantNotes.',
    'Plan a cinematic sequence, not patch operations.',
    'The prompt context includes a locked entity set that has already been resolved against the project.',
    'entityRefs must mirror that locked entity set only. Do not invent new entities, rename them, or change their ids.',
    'Every shot must name the participantRefIds, locationRefId, and propRefIds that are relevant for that beat whenever those ingredients exist in the request.',
    'Prompts like "Character A fights Character B in Environment C using Weapon D" must preserve both characters, the environment, and the weapon as explicit shot ingredients.',
    'Reuse supplied existing definitions when they are clearly the intended match.',
    'Set resolution to "existing" only when a supplied definitionKey is a confident match.',
    'Do not classify named speaking participants or scene actors as items.',
    'Named people in an argument, fight, dialogue, or reaction scene are characters unless the supplied catalog clearly says otherwise.',
    'Only reference ids from the locked entity set in shots, relationships, dialogue, action beats, audio beats, and composites.',
    'Set resolution to "create" when the entity should be created first.',
    'For create refs, include a short summary that can be used as a content-generation brief.',
    'Every shot must be concrete and implementation-facing with camera/framing intent.',
    'Include a short compositionGuide for each shot that explains how to combine the planned ingredients in frame.',
    'Prefer 1-5 shots for v1 unless the prompt explicitly asks for a longer sequence.',
    'Default to a linear sequence.',
    'Use environments as location anchors when possible.',
    'graphSettings should only include fields that matter for this cinematic.',
  ].join('\n')
}

export function cinematicGraphAuthorSystemPrompt() {
  return [
    'You convert a cinematic plan into a concrete GraphCore cinematic graph spec.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: graphName, graphSummary, graphSettings, assetRefs, shots.',
    'Do not invent entities beyond the supplied resolved entity refs.',
    'assetRefs should map resolved definitions into source nodes, and may also include storyboard_ref or composite_ref nodes when they improve continuity.',
    'shots should be authored in final execution order.',
    'Each shot must preserve the planned participantRefIds, locationRefId, and propRefIds whenever they were supplied.',
    'Each shot should reference sourceRefIds that will connect into asset_in edges.',
    'sourceRefIds are required structural inputs for still generation, not optional metadata.',
    'Do not remove planned source refs from a shot.',
    'Prefer storyboard_ref nodes for sequence board or shot panel references when they are available in the plan.',
    'Prefer composite_ref nodes for subject-plus-prop or subject-plus-wardrobe continuity when the plan contains those combinations.',
    'Include a compositionGuide for each shot that explains staging, blocking, ingredient priority, and how the scene should combine the supplied sources.',
    'Keep the graph linear unless the provided plan explicitly mentions variations.',
  ].join('\n')
}

export function finalizeCinematicEntityRefs(
  rawEntityRefs: z.infer<typeof cinematicPlannerRawSchema>['entityRefs'],
  catalog: ReturnType<typeof buildCinematicDefinitionCatalog>,
) {
  return rawEntityRefs.map((entityRef) => {
    const deterministicMatch = findStrongExistingDefinitionMatch(catalog, entityRef.sourceName, entityRef.kind)
    if (deterministicMatch) {
      return {
        ...entityRef,
        resolution: 'existing' as const,
        definitionKey: deterministicMatch.definitionKey,
        planItemId: null,
      }
    }

    const explicitCandidate = entityRef.definitionKey
      ? catalog.find((entry) => entry.definitionKey === entityRef.definitionKey && entry.kind === entityRef.kind) ?? null
      : null

    if (explicitCandidate) {
      return {
        ...entityRef,
        resolution: 'existing' as const,
        definitionKey: explicitCandidate.definitionKey,
        planItemId: null,
      }
    }

    const crossKindMatch = findStrongExistingDefinitionMatchAcrossKinds(catalog, entityRef.sourceName)
    if (crossKindMatch) {
      return {
        ...entityRef,
        kind: crossKindMatch.kind,
        resolution: 'existing' as const,
        definitionKey: crossKindMatch.definitionKey,
        planItemId: null,
      }
    }

    return {
      ...entityRef,
      resolution: 'create' as const,
      definitionKey: null,
      planItemId: entityRef.planItemId ?? `${entityRef.kind}_${entityRef.id}`,
    }
  })
}

export function materializeCinematicPlan(rawPlan: z.infer<typeof cinematicPlannerRawSchema>) {
  return cinematicPlanSchema.parse({
    graphName: rawPlan.graphName,
    graphSummary: rawPlan.graphSummary,
    entityRefs: rawPlan.entityRefs,
    relationshipRefs: rawPlan.relationshipRefs,
    compositeRefPlans: rawPlan.compositeRefPlans,
    storyboardPlan: rawPlan.storyboardPlan,
    shots: rawPlan.shots,
    graphSettings: rawPlan.graphSettings ?? {},
    autoRun: false,
  })
}

export function buildCinematicGraphFromAuthorPlan(input: {
  graphKey: string
  graphName: string
  graphSummary: string
  graphSettings: Record<string, unknown>
  cinematicPlan?: CinematicPlan | null
  authorPlan: z.infer<typeof cinematicGraphAuthorSchema>
}) {
  const graph = createGraphScaffold({
    key: input.graphKey,
    name: input.graphName,
    graphType: 'cinematic_flow',
    summary: input.graphSummary,
  })

  const startNode = graph.nodes[0]
  const endNode = graph.nodes[1]
  const nodes = [startNode]
  const edges: GraphScaffold['edges'] = []
  const assetNodeKeyByRefId = new Map<string, string>()

  for (const [index, ref] of input.authorPlan.assetRefs.entries()) {
    const key = `${graph.key}.${ref.nodeType}_${index + 1}`
    const templateKey =
      ref.templateKey
      || (ref.nodeType === 'composite_ref' ? 'equipped_character_ref' : ref.nodeType === 'storyboard_ref' ? 'shot_panel_ref' : 'asset_ref')
    const node = normalizeNode({
      id: `node-${ref.nodeType}-${Date.now()}-${index}`,
      key,
      type: ref.nodeType,
      title: ref.title,
      templateKey,
      subtitle: ref.subtitle ?? ref.assetRole,
      position: { x: 280, y: 120 + index * 130 },
      body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: true },
      metadata: {
        entityRefId: ref.nodeType === 'asset_ref' ? ref.id : null,
        definitionKey: ref.definitionKey,
        assetKey: ref.assetKey,
        refKind:
          ref.nodeType === 'storyboard_ref'
            ? 'storyboard'
            : ref.nodeType === 'composite_ref'
              ? 'composite'
              : ref.definitionKey
                ? 'definition'
                : 'asset',
        assetRole: ref.assetRole,
        role: ref.role,
        priority: ref.priority,
        stagingNotes: ref.stagingNotes,
        compositeRefId: ref.nodeType === 'composite_ref' ? ref.id : undefined,
        sourceRefIds: ref.sourceRefIds,
        relationshipType: ref.relationshipType,
        outputAssetKey: ref.nodeType === 'composite_ref' ? ref.assetKey : undefined,
        storyboardId: ref.nodeType === 'storyboard_ref' ? ref.id : undefined,
        panelId: ref.nodeType === 'storyboard_ref' && templateKey === 'shot_panel_ref' ? ref.id : undefined,
        storyboardKind: ref.nodeType === 'storyboard_ref' && templateKey === 'sequence_board_ref' ? 'sequence_board' : 'shot_panel',
        notes: ref.nodeType === 'storyboard_ref' ? ref.stagingNotes : undefined,
      },
    })
    nodes.push(node)
    assetNodeKeyByRefId.set(ref.id, key)
  }

  let previousFlowNodeKey = startNode.key
  for (const [index, shot] of input.authorPlan.shots.entries()) {
    const key = `${graph.key}.cinematic_shot_${index + 1}`
    const shotNode = normalizeNode({
      id: `node-cinematic-shot-${Date.now()}-${index}`,
      key,
      type: 'cinematic_shot',
      title: shot.title,
      templateKey: shot.shotType === 'custom' ? 'cinematic_shot' : `cinematic_${shot.shotType}`,
      subtitle: shot.subtitle ?? null,
      position: { x: 720 + index * 360, y: 240 },
      body: { text: shot.beat, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: false },
      metadata: {
        shotType: shot.shotType,
        framing: shot.framing,
        cameraAngle: shot.cameraAngle,
        cameraMovement: shot.cameraMovement,
        lensPreference: shot.lensPreference,
        durationSeconds: shot.durationSeconds,
        visualPrompt: shot.visualPrompt,
        compositionGuide: shot.compositionGuide,
        participantRefIds: shot.participantRefIds,
        locationRefId: shot.locationRefId,
        propRefIds: shot.propRefIds,
        requiredSourceRefIds: shot.sourceRefIds,
        compositeRefIds: shot.compositeRefIds,
        storyboardRefIds: shot.storyboardRefIds,
        beats: shot.beats,
        dialogue: shot.dialogue,
        actions: shot.actions,
        audio: shot.audio,
        sequenceShotId: shot.id,
        seedanceModePreference:
          shot.storyboardRefIds.length > 0 || shot.compositeRefIds.length > 0 || shot.sourceRefIds.length > 1
            ? 'reference-to-video'
            : 'auto',
      },
    })
    nodes.push(shotNode)
    edges.push({
      id: `edge-flow-${index}`,
      key: `edge.${previousFlowNodeKey.split('.').pop() ?? 'flow'}_${key.split('.').pop() ?? 'shot'}`,
      source: { nodeKey: previousFlowNodeKey, portId: 'out' },
      target: { nodeKey: key, portId: 'flow_in' },
      label: null,
      condition: null,
      metadata: {},
    })
    previousFlowNodeKey = key

    for (const sourceRefId of shot.sourceRefIds) {
      const sourceNodeKey = assetNodeKeyByRefId.get(sourceRefId)
      if (!sourceNodeKey) continue
      edges.push({
        id: `edge-asset-${index}-${sourceRefId}`,
        key: `edge.${sourceNodeKey.split('.').pop() ?? 'asset'}_${key.split('.').pop() ?? 'shot'}`,
        source: { nodeKey: sourceNodeKey, portId: 'asset_out' },
        target: { nodeKey: key, portId: 'asset_in' },
        label: null,
        condition: null,
        metadata: {},
      })
    }
  }

  edges.push({
    id: 'edge-flow-end',
    key: `edge.${previousFlowNodeKey.split('.').pop() ?? 'shot'}_${endNode.key.split('.').pop() ?? 'end'}`,
    source: { nodeKey: previousFlowNodeKey, portId: 'out' },
    target: { nodeKey: endNode.key, portId: 'in' },
    label: null,
    condition: null,
    metadata: {},
  })
  nodes.push(endNode)

  return {
    ...graph,
    name: input.authorPlan.graphName || input.graphName,
    summary: input.authorPlan.graphSummary || input.graphSummary,
    metadata: {
      ...graph.metadata,
      cinematics: input.graphSettings,
      cinematicSequence: cinematicSequenceSchema.parse({
        references: input.authorPlan.assetRefs
          .filter((ref) => ref.nodeType === 'asset_ref')
          .map((ref) => ({
            id: ref.id,
            refKind: ref.definitionKey ? 'definition' : ref.assetRole === 'audio' ? 'audio' : ref.assetRole === 'style' ? 'style' : 'asset',
            role: ref.role,
            label: ref.title,
            summary: ref.subtitle ?? '',
            definitionKey: ref.definitionKey,
            assetKey: ref.assetKey,
            assetRole: ref.assetRole,
            stagingNotes: ref.stagingNotes,
            priority: ref.priority,
            required: true,
          })),
        compositeRefs: input.authorPlan.assetRefs
          .filter((ref) => ref.nodeType === 'composite_ref')
          .map((ref) => ({
            id: ref.id,
            title: ref.title,
            summary: ref.subtitle ?? '',
            relationshipType: ref.relationshipType ?? 'equip',
            sourceRefIds: ref.sourceRefIds,
            outputAssetKey: ref.assetKey,
            generationPrompt: ref.stagingNotes,
            stagingNotes: ref.stagingNotes,
            priority: ref.priority,
          })),
        relationships: input.cinematicPlan?.relationshipRefs ?? [],
        storyboard:
          input.cinematicPlan?.storyboardPlan
          ?? {
            mode: input.authorPlan.assetRefs.some((ref) => ref.nodeType === 'storyboard_ref') ? 'hybrid' : 'none',
            summary: '',
            sequenceAssetKey: input.authorPlan.assetRefs.find((ref) => ref.templateKey === 'sequence_board_ref')?.assetKey ?? null,
            panels: input.authorPlan.assetRefs
              .filter((ref) => ref.nodeType === 'storyboard_ref' && ref.templateKey !== 'sequence_board_ref')
              .map((ref, index) => ({
                id: ref.id,
                shotId: null,
                title: ref.title,
                assetKey: ref.assetKey,
                notes: ref.stagingNotes,
                orderIndex: index,
              })),
          },
        shots: input.authorPlan.shots.map((shot) => ({
          id: shot.id,
          title: shot.title,
          subtitle: shot.subtitle,
          beat: shot.beat,
          shotType: shot.shotType,
          framing: shot.framing,
          cameraAngle: shot.cameraAngle,
          cameraMovement: shot.cameraMovement,
          lensPreference: shot.lensPreference,
          visualPrompt: shot.visualPrompt,
          compositionGuide: shot.compositionGuide,
          participantRefIds: shot.participantRefIds,
          locationRefId: shot.locationRefId,
          propRefIds: shot.propRefIds,
          requiredSourceRefIds: shot.sourceRefIds,
          compositeRefIds: shot.compositeRefIds,
          storyboardRefIds: shot.storyboardRefIds,
          durationSeconds: shot.durationSeconds,
          seedanceModePreference:
            shot.storyboardRefIds.length > 0 || shot.compositeRefIds.length > 0 || shot.sourceRefIds.length > 1
              ? 'reference-to-video'
              : 'auto',
          beats: shot.beats,
          dialogue: shot.dialogue,
          actions: shot.actions,
          audio: shot.audio,
        })),
      }),
      generation: graph.metadata.generation,
    },
    nodes,
    edges,
  }
}
