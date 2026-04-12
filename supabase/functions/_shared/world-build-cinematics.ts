import { z } from 'npm:zod@4'

import { normalizeNode } from '../../../src/domain/nodeLibrary.ts'
import {
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

function collectNamedRefs(
  value: unknown,
  entityIdByName: Map<string, string>,
) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entityIdByName.get(normalizeMatchKey(entry)) ?? null
      }
      const record = asRecord(entry)
      if (!record) return null
      const candidateName = pickFirstString(record, ['sourceName', 'name', 'title', 'label', 'character', 'item', 'environment'])
      if (!candidateName) return null
      return entityIdByName.get(normalizeMatchKey(candidateName)) ?? null
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

export function coerceCinematicPlannerRaw(input: unknown) {
  const record = asRecord(input) ?? {}
  const requestSummary = pickFirstString(record, ['requestSummary', 'summary', 'title']) || 'Cinematic build plan'
  const graphName = pickFirstString(record, ['graphName', 'name', 'title']) || 'Prompt Cinematic'
  const graphSummary = pickFirstString(record, ['graphSummary', 'summary', 'description']) || requestSummary

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
      const kind = normalizeEntityKind(entity.kind ?? entity.type ?? entity.category, 'item')
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

  const entityIdByName = new Map(entityRefs.map((entry) => [normalizeMatchKey(entry.sourceName), entry.id]))

  function ensureEntityRef(input: {
    sourceName: string
    kind: 'character' | 'environment' | 'item'
    role: string
  }) {
    const sourceName = input.sourceName.trim()
    if (!sourceName) return null
    const normalizedName = normalizeMatchKey(sourceName)
    if (!normalizedName) return null

    const existingId = entityIdByName.get(normalizedName)
    if (existingId) return existingId

    const id = `${input.kind}_${slugSeed(sourceName, `${input.kind}_${entityRefs.length + 1}`)}`
    entityRefs.push({
      id,
      kind: input.kind,
      role: input.role,
      sourceName,
      summary: '',
      resolution: 'create',
      definitionKey: null,
      planItemId: null,
    })
    entityIdByName.set(normalizedName, id)
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
        ? (entityIdByName.get(normalizeMatchKey(locationName)) ?? ensureEntityRef({
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
        participantRefIds: collectNamedRefs(shot.participantRefIds ?? shot.participants ?? shot.characters ?? shot.cast, entityIdByName),
        locationRefId,
        propRefIds: collectNamedRefs(shot.propRefIds ?? shot.props ?? shot.items, entityIdByName),
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

  return cinematicPlannerRawSchema.parse({
    requestSummary,
    graphName,
    graphSummary,
    entityRefs,
    shots,
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
    definitionKey: z.string(),
    assetRole: z.enum(['character', 'environment', 'item']),
    title: z.string(),
    subtitle: z.string().nullable().default(null),
    stagingNotes: z.string().default(''),
  })).default([]),
  shots: z.array(z.object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().nullable().default(null),
    beat: z.string(),
    visualPrompt: z.string().default(''),
    shotType: z.enum(['establishing', 'dialogue', 'reveal', 'action', 'insert', 'transition', 'custom']).default('custom'),
    framing: z.string().default(''),
    cameraAngle: z.string().default(''),
    cameraMovement: z.string().default(''),
    lensPreference: z.string().default(''),
    durationSeconds: z.number().int().positive().max(20).nullable().default(null),
    sourceRefIds: z.array(z.string()).default([]),
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

export function cinematicIntentSystemPrompt() {
  return [
    'You classify whether a GraphCore prompt should use the normal world-build planner or the cinematic planner.',
    'Return JSON only.',
    'Return exactly one object with keys: plannerMode, reason.',
    'Use plannerMode "cinematic_build" when the prompt is asking for a scene, sequence, shot plan, cinematic, trailer beat, cutscene, fight scene, dialogue scene, reveal scene, or other authored visual sequence.',
    'Use plannerMode "world_build" when the prompt is primarily asking for content creation without sequencing shots together.',
  ].join('\n')
}

export function cinematicPlannerSystemPrompt() {
  return [
    'You are the GraphCore cinematic planner.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, graphName, graphSummary, entityRefs, shots, graphSettings, diagnostics, assistantNotes.',
    'Plan a cinematic sequence, not patch operations.',
    'entityRefs must contain every important character, item, and environment used in the cinematic.',
    'Reuse supplied existing definitions when they are clearly the intended match.',
    'Set resolution to "existing" only when a supplied definitionKey is a confident match.',
    'Set resolution to "create" when the entity should be created first.',
    'For create refs, include a short summary that can be used as a content-generation brief.',
    'Every shot must be concrete and implementation-facing with camera/framing intent.',
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
    'assetRefs should map resolved definitions into source asset nodes.',
    'shots should be authored in final execution order.',
    'Each shot should reference sourceRefIds that will connect into asset_in edges.',
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
    shots: rawPlan.shots,
    graphSettings: rawPlan.graphSettings ?? {},
    autoRun: true,
  })
}

export function buildCinematicGraphFromAuthorPlan(input: {
  graphKey: string
  graphName: string
  graphSummary: string
  graphSettings: Record<string, unknown>
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
    const key = `${graph.key}.asset_ref_${index + 1}`
    const node = normalizeNode({
      id: `node-asset-ref-${Date.now()}-${index}`,
      key,
      type: 'asset_ref',
      title: ref.title,
      templateKey: 'asset_ref',
      subtitle: ref.subtitle ?? ref.assetRole,
      position: { x: 280, y: 120 + index * 130 },
      body: { text: null, imageAssetKey: null, audioAssetKey: null, choices: [] },
      condition: null,
      effects: [],
      ports: [],
      display: { iconAssetKey: null, compactPreview: true },
      metadata: {
        definitionKey: ref.definitionKey,
        assetRole: ref.assetRole,
        stagingNotes: ref.stagingNotes,
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
      generation: graph.metadata.generation,
    },
    nodes,
    edges,
  }
}
