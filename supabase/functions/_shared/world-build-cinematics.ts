import { z } from 'npm:zod@4'

import {
  actionBeatSchema,
  audioBeatSchema,
  cinematicBeatSchema,
  cinematicRelationshipSchema,
  cinematicScriptDocSchema,
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
  scriptDoc: cinematicScriptDocSchema.nullable().default(null),
  relationshipRefs: z.array(cinematicRelationshipSchema).default([]),
  compositeRefPlans: z.array(cinematicCompositeRefPlanSchema).default([]),
  storyboardPlan: storyboardSpecSchema.nullable().default(null),
  shots: z.array(cinematicShotPlanSchema).default([]),
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

function splitPromptIntoTemporalSegments(value: string) {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []

  const segmented = cleaned
    .replace(/\b(?:and then|then)\b/gi, ' || ')
    .replace(/\b(?:finally|ultimately)\b/gi, ' || ')
    .replace(/\b(?:at the end|in the end|by the end)\b/gi, ' || ')
    .replace(/\b(?:ending with|ending on)\b/gi, ' || ')
    .replace(/\b(?:escalating until|building until|leading to)\b/gi, ' || ')
    .replace(/\buntil\b/gi, ' || ')

  return segmented
    .split('||')
    .map((entry) => entry.trim().replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, ''))
    .filter((entry) => entry.length > 0)
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1))
    .join(' ')
}

function deriveFallbackShotTitle(segment: string, index: number, total: number) {
  const normalized = normalizeMatchKey(segment)
  if (normalized.includes('slap')) return 'The Slap'
  if (normalized.includes('warning') || normalized.includes('threat')) return 'Cold Warning'
  if (normalized.includes('mock') || normalized.includes('retort')) return 'Mocking Reply'
  if (normalized.includes('circle') || normalized.includes('standoff') || normalized.includes('stand')) return 'Rising Standoff'
  if (normalized.includes('argument') || normalized.includes('argue') || normalized.includes('accuse')) {
    return normalized.includes('table') ? 'Table Accusation' : 'Heated Exchange'
  }
  if (normalized.includes('tavern') || normalized.includes('interior')) return 'Tavern Tension'

  const compact = segment
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
  if (compact) {
    const words = compact.split(/\s+/).slice(0, 4).join(' ')
    if (words) return titleCaseWords(words)
  }

  if (index === 0 && total > 1) return 'Opening Beat'
  if (index === total - 1 && total > 1) return 'Closing Beat'
  return `Beat ${index + 1}`
}

function inferShotTypeFromBeat(beat: string) {
  const normalized = normalizeMatchKey(beat)
  if (!normalized) return 'custom' as const
  if (
    normalized.includes('argument')
    || normalized.includes('argue')
    || normalized.includes('confront')
    || normalized.includes('exchange')
    || normalized.includes('retort')
    || normalized.includes('shout')
    || normalized.includes('yell')
    || normalized.includes('accuse')
  ) {
    return 'dialogue' as const
  }
  if (
    normalized.includes('slap')
    || normalized.includes('strike')
    || normalized.includes('hit')
    || normalized.includes('attack')
    || normalized.includes('fight')
    || normalized.includes('punch')
    || normalized.includes('grab')
  ) {
    return 'action' as const
  }
  if (
    normalized.includes('inside')
    || normalized.includes('tavern')
    || normalized.includes('establish')
    || normalized.includes('room')
    || normalized.includes('interior')
    || normalized.includes('outside')
    || normalized.includes('street')
  ) {
    return 'establishing' as const
  }
  return 'custom' as const
}

function inferActionVerb(beat: string) {
  const normalized = normalizeMatchKey(beat)
  if (normalized.includes('slap')) return 'slaps'
  if (normalized.includes('punch')) return 'punches'
  if (normalized.includes('hit')) return 'hits'
  if (normalized.includes('strike')) return 'strikes'
  if (normalized.includes('fight')) return 'fights'
  if (normalized.includes('grab')) return 'grabs'
  if (normalized.includes('shove')) return 'shoves'
  if (normalized.includes('draw')) return 'draws weapon'
  return normalized.includes('argu') || normalized.includes('confront') ? 'confronts' : 'acts'
}

function inferDialogueDelivery(beat: string) {
  const normalized = normalizeMatchKey(beat)
  if (normalized.includes('slap') || normalized.includes('fight') || normalized.includes('yell')) return 'sharp and explosive'
  if (normalized.includes('argument') || normalized.includes('argue') || normalized.includes('confront')) return 'heated and escalating'
  return 'tense and controlled'
}

function buildEntityNameAliases(sourceName: string) {
  const aliases = new Set<string>()
  const raw = sourceName.trim()
  if (!raw) return []
  aliases.add(raw)
  const beforeComma = raw.split(',')[0]?.trim()
  if (beforeComma) aliases.add(beforeComma)
  const words = raw.split(/\s+/).filter(Boolean)
  if (words[0]) aliases.add(words[0])
  return [...aliases]
    .map((entry) => normalizeMatchKey(entry))
    .filter((entry) => entry.length > 1)
}

function isIncidentalPropName(value: string) {
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
  ].includes(normalizeMatchKey(value))
}

function promptMakesPropHero(promptText: string, propName: string) {
  const normalizedPrompt = normalizeMatchKey(promptText)
  const normalizedProp = normalizeMatchKey(propName)
  if (!normalizedPrompt || !normalizedProp) return false
  return [
    `use ${normalizedProp}`,
    `uses ${normalizedProp}`,
    `using ${normalizedProp}`,
    `with ${normalizedProp}`,
    `grab ${normalizedProp}`,
    `grabs ${normalizedProp}`,
    `draw ${normalizedProp}`,
    `draws ${normalizedProp}`,
    `throw ${normalizedProp}`,
    `throws ${normalizedProp}`,
    `smash ${normalizedProp}`,
    `smashes ${normalizedProp}`,
    `${normalizedProp} in hand`,
  ].some((pattern) => normalizedPrompt.includes(pattern))
}

function normalizeVerbRoot(value: string) {
  const normalized = normalizeMatchKey(value)
  if (normalized.endsWith('es')) return normalized.slice(0, -2)
  if (normalized.endsWith('s')) return normalized.slice(0, -1)
  return normalized
}

export function inferPromptDirectedActionBinding(
  promptText: string,
  verb: string,
  participants: Array<{ id: string; sourceName: string }>,
) {
  const normalizedPrompt = normalizeMatchKey(promptText)
  const verbRoot = normalizeVerbRoot(verb)
  if (!normalizedPrompt || !verbRoot || participants.length < 2) return null

  const verbTokens = Array.from(new Set([verbRoot, `${verbRoot}s`, `${verbRoot}es`]))
  let bestMatch: { actorRefId: string; targetRefId: string; score: number } | null = null

  for (const actor of participants) {
    for (const target of participants) {
      if (actor.id === target.id) continue
      for (const actorAlias of buildEntityNameAliases(actor.sourceName)) {
        for (const targetAlias of buildEntityNameAliases(target.sourceName)) {
          const actorIndex = normalizedPrompt.indexOf(actorAlias)
          const targetIndex = normalizedPrompt.indexOf(targetAlias)
          if (actorIndex === -1 || targetIndex === -1 || actorIndex >= targetIndex) continue
          for (const verbToken of verbTokens) {
            const verbIndex = normalizedPrompt.indexOf(verbToken, actorIndex)
            if (verbIndex === -1 || verbIndex >= targetIndex) continue
            const score = (targetIndex - actorIndex) - Math.abs((verbIndex - actorIndex) - (targetIndex - verbIndex))
            if (!bestMatch || score < bestMatch.score) {
              bestMatch = { actorRefId: actor.id, targetRefId: target.id, score }
            }
          }
        }
      }
    }
  }

  return bestMatch
    ? { actorRefId: bestMatch.actorRefId, targetRefId: bestMatch.targetRefId }
    : null
}

function isGenericShotTitle(title: string) {
  const normalized = normalizeMatchKey(title)
  return [
    'shot 1',
    'shot 2',
    'shot 3',
    'beat 1',
    'beat 2',
    'beat 3',
    'primary beat',
    'opening beat',
    'closing beat',
    'opening exchange',
    'escalation',
    'final beat',
  ].includes(normalized)
}

function beatLooksLikePromptEcho(beat: string, promptText: string) {
  const normalizedBeat = normalizeMatchKey(beat)
  const normalizedPrompt = normalizeMatchKey(promptText)
  if (!normalizedBeat || !normalizedPrompt) return false
  if (normalizedBeat.length < 40) return false
  return normalizedPrompt.includes(normalizedBeat) || normalizedBeat.includes(normalizedPrompt.slice(0, Math.min(normalizedPrompt.length, 80)))
}

function dialogueLooksLikePlaceholder(line: string, speakerName: string) {
  const normalizedLine = normalizeMatchKey(line)
  const speakerAliases = buildEntityNameAliases(speakerName)
  if (!normalizedLine) return true
  if (speakerAliases.some((alias) => normalizedLine.startsWith(alias))) return true
  return [
    'delivers a cutting accusation',
    'fires back with a hard retort',
    'issues a warning',
    'mocking reply',
    'placeholder',
    'line of dialogue',
  ].some((pattern) => normalizedLine.includes(pattern))
}

function findParticipantByMention(
  beat: string,
  participants: Array<{ id: string; sourceName: string }>,
) {
  const normalizedBeat = normalizeMatchKey(beat)
  if (!normalizedBeat) return null
  return participants.find((participant) => normalizedBeat.includes(normalizeMatchKey(participant.sourceName))) ?? null
}

function inferActorTargetFromBeat(
  beat: string,
  participants: Array<{ id: string; sourceName: string }>,
) {
  if (participants.length === 0) return { actorRefId: null, targetRefId: null }
  if (participants.length === 1) return { actorRefId: participants[0].id, targetRefId: null }

  const promptDirectedBinding = inferPromptDirectedActionBinding(beat, inferActionVerb(beat), participants)
  if (promptDirectedBinding) {
    return promptDirectedBinding
  }

  const normalizedBeat = normalizeMatchKey(beat)
  const mentionedParticipants = participants.filter((participant) => normalizedBeat.includes(normalizeMatchKey(participant.sourceName)))
  if (mentionedParticipants.length >= 2) {
    return {
      actorRefId: mentionedParticipants[0].id,
      targetRefId: mentionedParticipants[1].id,
    }
  }
  if (mentionedParticipants.length === 1) {
    return {
      actorRefId: mentionedParticipants[0].id,
      targetRefId: participants.find((participant) => participant.id !== mentionedParticipants[0].id)?.id ?? null,
    }
  }
  return {
    actorRefId: participants[0].id,
    targetRefId: participants[1]?.id ?? null,
  }
}

export function shotImpliesDialogue(input: {
  promptText?: string
  title?: string
  beat?: string
  shotType?: string
}) {
  const normalized = normalizeMatchKey([input.promptText, input.title, input.beat, input.shotType].filter(Boolean).join(' '))
  if (!normalized) return false
  return [
    'dialogue',
    'argument',
    'argue',
    'verbal',
    'exchange',
    'retort',
    'mock',
    'warning',
    'warn',
    'accuse',
    'confront',
    'threat',
    'threaten',
    'taunt',
    'insult',
    'reply',
  ].some((token) => normalized.includes(token))
}

export function shotImpliesAction(input: {
  promptText?: string
  title?: string
  beat?: string
  shotType?: string
}) {
  const normalized = normalizeMatchKey([input.promptText, input.title, input.beat, input.shotType].filter(Boolean).join(' '))
  if (!normalized) return false
  return [
    'action',
    'fight',
    'combat',
    'slap',
    'strike',
    'hit',
    'punch',
    'attack',
    'grab',
    'shove',
    'circle',
    'circling',
    'rise',
    'rises',
    'stand',
    'standoff',
    'confront',
  ].some((token) => normalized.includes(token))
}

export function buildFallbackDialogueBeats(input: {
  shotId: string
  beat: string
  participants: Array<{ id: string; sourceName: string }>
}) {
  const normalized = normalizeMatchKey(input.beat)
  if (
    input.participants.length < 2
    || !shotImpliesDialogue({ beat: input.beat })
  ) {
    return []
  }

  const [firstParticipant, secondParticipant] = input.participants
  let firstLine = 'You keep talking like the room will save you.'
  let secondLine = 'No. The room just gives everyone a better view of your mistake.'

  if (normalized.includes('warning') || normalized.includes('threat')) {
    firstLine = 'Take one more step and you will regret it.'
    secondLine = 'That is not a warning. It is a promise.'
  } else if (normalized.includes('mock') || normalized.includes('retort') || normalized.includes('sneer')) {
    firstLine = 'That is your answer? I expected sharper steel from you.'
    secondLine = 'And I expected a better threat than borrowed noise.'
  } else if (normalized.includes('argument') || normalized.includes('argue') || normalized.includes('accuse') || normalized.includes('confront')) {
    firstLine = 'You always mistake noise for strength.'
    secondLine = 'And you always mistake silence for surrender.'
  } else if (normalized.includes('circle') || normalized.includes('standoff') || normalized.includes('stand')) {
    firstLine = 'Then stand up and say it where I can see your spine.'
    secondLine = 'Gladly. I was getting tired of hearing you sit down.'
  }

  return [
    {
      id: `${input.shotId}_dialogue_1`,
      speakerRefId: firstParticipant.id,
      line: firstLine,
      delivery: inferDialogueDelivery(input.beat),
      startSeconds: null,
      endSeconds: null,
      lipSync: true,
    },
    {
      id: `${input.shotId}_dialogue_2`,
      speakerRefId: secondParticipant.id,
      line: secondLine,
      delivery: inferDialogueDelivery(input.beat),
      startSeconds: null,
      endSeconds: null,
      lipSync: true,
    },
  ]
}

export function buildFallbackActionBeats(input: {
  shotId: string
  beat: string
  participants: Array<{ id: string; sourceName: string }>
  propRefIds: string[]
}) {
  const normalized = normalizeMatchKey(input.beat)
  if (
    input.participants.length === 0
    || !shotImpliesAction({ beat: input.beat })
  ) {
    return []
  }

  const actorTarget = inferActorTargetFromBeat(input.beat, input.participants)
  return [{
    id: `${input.shotId}_action_1`,
    actorRefId: actorTarget.actorRefId,
    targetRefId: actorTarget.targetRefId,
    verb: inferActionVerb(input.beat),
    propRefId: input.propRefIds[0] ?? null,
    stagingNotes: '',
    startSeconds: null,
    endSeconds: null,
  }]
}

export function buildFallbackAudioBeats(input: {
  shotId: string
  beat: string
  locationRefId: string | null
}) {
  const normalized = normalizeMatchKey(input.beat)
  const audio = []
  if (input.locationRefId) {
    audio.push({
      id: `${input.shotId}_audio_ambience`,
      kind: 'ambience' as const,
      cue: normalized.includes('tavern') ? 'Busy tavern room tone under the scene.' : 'Location ambience under the scene.',
      sourceRefId: input.locationRefId,
      startSeconds: null,
      endSeconds: null,
    })
  }
  if (normalized.includes('slap')) {
    audio.push({
      id: `${input.shotId}_audio_sfx`,
      kind: 'sfx' as const,
      cue: 'Sharp slap impact punctuates the beat.',
      sourceRefId: null,
      startSeconds: null,
      endSeconds: null,
    })
  }
  return audio
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
    sourceName?: string
  }>
}) {
  const environmentRef = input.entityRefs.find((entry) => entry.kind === 'environment') ?? null
  const participantRefs = input.entityRefs.filter((entry) => entry.kind === 'character').map((entry) => ({
    id: entry.id,
    sourceName: entry.sourceName ?? entry.id,
  }))
  const participantRefIds = participantRefs.map((entry) => entry.id)
  const propRefIds = input.entityRefs.filter((entry) => entry.kind === 'item').map((entry) => entry.id)
  const beat = input.graphSummary.trim() || input.requestSummary.trim() || 'Play the key cinematic beat described by the prompt.'
  const shotType = inferShotTypeFromBeat(beat)
  const dialogue = buildFallbackDialogueBeats({
    shotId: 'shot_1',
    beat,
    participants: participantRefs,
  })
  const actions = buildFallbackActionBeats({
    shotId: 'shot_1',
    beat,
    participants: participantRefs,
    propRefIds,
  })
  const audio = buildFallbackAudioBeats({
    shotId: 'shot_1',
    beat,
    locationRefId: environmentRef?.id ?? null,
  })

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
    dialogue,
    actions,
    audio,
  }
}

function expandTemporalShots(input: {
  shots: Array<{
    id: string
    title: string
    beat: string
    participantRefIds: string[]
    locationRefId: string | null
    propRefIds: string[]
    shotType: 'establishing' | 'dialogue' | 'reveal' | 'action' | 'insert' | 'transition' | 'custom'
    framing: string
    cameraAngle: string
    cameraMovement: string
    lensPreference: string
    durationSeconds: number | null
    visualPrompt: string
    compositionGuide: string
    beats: Array<z.infer<typeof cinematicBeatSchema>>
    dialogue: Array<z.infer<typeof dialogueBeatSchema>>
    actions: Array<z.infer<typeof actionBeatSchema>>
    audio: Array<z.infer<typeof audioBeatSchema>>
  }>
  promptText: string
  entityRefs: Array<{
    id: string
    kind: 'character' | 'environment' | 'item'
    sourceName: string
  }>
}) {
  const temporalSegments = splitPromptIntoTemporalSegments(input.promptText)
  const needsExpansion = input.shots.length === 1 && temporalSegments.length >= 2
  if (!needsExpansion) return input.shots

  const baseShot = input.shots[0]
  const participantRefs = input.entityRefs
    .filter((entry) => entry.kind === 'character' && baseShot.participantRefIds.includes(entry.id))
    .map((entry) => ({ id: entry.id, sourceName: entry.sourceName }))
  const expandedShots = temporalSegments.map((segment, index) => {
    const shotId = `shot_${index + 1}`
    const shotType = inferShotTypeFromBeat(segment)
    const dialogue = buildFallbackDialogueBeats({
      shotId,
      beat: segment,
      participants: participantRefs,
    })
    const actions = buildFallbackActionBeats({
      shotId,
      beat: segment,
      participants: participantRefs,
      propRefIds: baseShot.propRefIds,
    })
    const audio = buildFallbackAudioBeats({
      shotId,
      beat: segment,
      locationRefId: baseShot.locationRefId,
    })

    return {
      ...baseShot,
      id: shotId,
      title: deriveFallbackShotTitle(segment, index, temporalSegments.length),
      beat: segment,
      shotType,
      framing:
        shotType === 'establishing'
          ? 'Wide establishing frame'
          : shotType === 'dialogue'
            ? 'Medium two-shot'
            : shotType === 'action'
              ? 'Medium close action frame'
              : baseShot.framing,
      cameraMovement:
        shotType === 'action'
          ? 'Sharp push or snap movement into the action.'
          : shotType === 'dialogue'
            ? 'Controlled handheld drift between speakers.'
            : baseShot.cameraMovement,
      compositionGuide: segment,
      dialogue,
      actions,
      audio,
      beats: [
        ...dialogue.map((entry) => ({
          id: `${entry.id}_beat`,
          type: 'dialogue' as const,
          summary: entry.line,
          startSeconds: null,
          endSeconds: null,
        })),
        ...actions.map((entry) => ({
          id: `${entry.id}_beat`,
          type: 'action' as const,
          summary: entry.verb,
          startSeconds: null,
          endSeconds: null,
        })),
      ],
    }
  })

  return expandedShots
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
  promptText?: string
  enableFallbackShaping?: boolean
}

export function coerceCinematicPlannerRaw(input: unknown, options: CoerceCinematicPlannerOptions = {}) {
  const record = asRecord(input) ?? {}
  const requestSummary = pickFirstString(record, ['requestSummary', 'summary', 'title']) || 'Cinematic build plan'
  const graphName = pickFirstString(record, ['graphName', 'name', 'title']) || 'Prompt Cinematic'
  const graphSummary = pickFirstString(record, ['graphSummary', 'summary', 'description']) || requestSummary
  const scriptRecord = asRecord(record.scriptDoc) ?? record
  const lockedEntityRefs = options.lockedEntityRefs
    ? options.lockedEntityRefs.map((entry) => ({ ...entry }))
    : null
  const allowEntityCreation = options.allowEntityCreation ?? !lockedEntityRefs
  const enableFallbackShaping = options.enableFallbackShaping ?? true

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

  const rawShots = Array.isArray(scriptRecord.shots)
    ? scriptRecord.shots
    : Array.isArray(scriptRecord.beats)
      ? scriptRecord.beats
      : Array.isArray(scriptRecord.sequence)
        ? scriptRecord.sequence
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

  const fallbackDiagnostics: string[] = []
  const normalizedShots = shots.length > 0
    ? shots
    : enableFallbackShaping
      ? (() => {
        fallbackDiagnostics.push('Cinematic script planner returned no valid shots; generated a fallback primary beat.')
        return [buildFallbackShot({
          requestSummary,
          graphSummary,
          entityRefs,
        })]
      })()
      : []
  const expandedShots = enableFallbackShaping
    ? expandTemporalShots({
      shots: normalizedShots,
      promptText: options.promptText ?? requestSummary,
      entityRefs: entityRefs.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        sourceName: entry.sourceName,
      })),
    })
    : normalizedShots
  if (enableFallbackShaping && shots.length === 1 && expandedShots.length > 1) {
    fallbackDiagnostics.push(`Expanded a single authored shot into ${expandedShots.length} temporal shots using prompt phase heuristics.`)
  }
  const soleEnvironmentRefId =
    entityRefs.filter((entry) => entry.kind === 'environment').length === 1
      ? entityRefs.find((entry) => entry.kind === 'environment')?.id ?? null
      : null
  const normalizedShotsWithDefaultLocation = expandedShots.map((shot) => (
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

  if (enableFallbackShaping && relationshipRefs.length === 0) {
    const firstLocation = entityRefs.find((entry) => entry.kind === 'environment') ?? null
    const characterRefs = entityRefs.filter((entry) => entry.kind === 'character')
    const propRefs = entityRefs.filter((entry) => entry.kind === 'item')

    for (const propRef of propRefs.filter((entry) => !isIncidentalPropName(entry.sourceName))) {
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
    coerceArrayWithSchema(scriptRecord.compositeRefs ?? record.compositeRefPlans ?? scriptRecord.composites ?? record.composites, cinematicCompositeRefPlanSchema),
    entityLookup,
  )

  if (enableFallbackShaping && compositeRefPlans.length === 0) {
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

  const storyboardPlanInput = scriptRecord.storyboard ?? record.storyboardPlan ?? record.storyboard
  const storyboardPlanParsed = storyboardSpecSchema.safeParse(storyboardPlanInput ?? {})
  const storyboardPlan = storyboardPlanParsed.success
    ? storyboardPlanParsed.data
    : {
        mode: normalizePromptTextForStoryboard(requestSummary).includes('storyboard') ? 'sequence_board' as const : 'none' as const,
        summary: normalizePromptTextForStoryboard(requestSummary).includes('storyboard') ? 'Generate a storyboard sheet and shot panels for continuity.' : '',
        sequenceAssetKey: null,
        panels: normalizePromptTextForStoryboard(requestSummary).includes('storyboard')
          ? normalizedShotsWithDefaultLocation.map((shot, index) => ({
              id: `panel_${shot.id}`,
              shotId: shot.id,
              title: shot.title,
              assetKey: null,
              notes: shot.compositionGuide,
              orderIndex: index,
            }))
          : [],
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

  const rawScenes = Array.isArray(scriptRecord.scenes) ? scriptRecord.scenes : []
  const scenes = rawScenes
    .map((entry, index) => {
      const scene = asRecord(entry)
      if (!scene) return null
      const title = pickFirstString(scene, ['title', 'name', 'label']) || `Scene ${index + 1}`
      const shotIds = Array.from(new Set(collectNamedLabels(scene.shotIds ?? scene.shots)))
      return {
        id: pickFirstString(scene, ['id', 'key']) || `scene_${index + 1}`,
        title,
        summary: pickFirstString(scene, ['summary', 'description']),
        locationRefId: (() => {
          const locationName = pickFirstString(scene, ['locationRefId', 'location', 'environment', 'setting'])
          return locationName ? resolveEntityRefId(locationName, entityLookup) : null
        })(),
        shotIds,
        continuityNotes: pickFirstString(scene, ['continuityNotes', 'notes']),
        orderIndex: typeof scene.orderIndex === 'number' ? scene.orderIndex : index,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  const normalizedScenes = scenes.length > 0
    ? scenes.map((scene, index) => ({
        ...scene,
        shotIds: scene.shotIds.length > 0
          ? scene.shotIds.filter((shotId) => normalizedShotsWithDefaultLocation.some((shot) => shot.id === shotId))
          : normalizedShotsWithDefaultLocation.map((shot) => shot.id),
        orderIndex: index,
      }))
    : (normalizedShotsWithDefaultLocation.length > 0
      ? [{
          id: 'scene_1',
          title: pickFirstString(scriptRecord, ['sceneTitle']) || 'Scene 1',
          summary: graphSummary,
          locationRefId: normalizedShotsWithDefaultLocation[0]?.locationRefId ?? null,
          shotIds: normalizedShotsWithDefaultLocation.map((shot) => shot.id),
          continuityNotes: pickFirstString(scriptRecord, ['continuityNotes']) || '',
          orderIndex: 0,
        }]
      : [])
  const scriptDoc = cinematicScriptDocSchema.parse({
    title: pickFirstString(scriptRecord, ['title']) || graphName,
    logline: pickFirstString(scriptRecord, ['logline', 'summary']) || graphSummary,
    tone: pickFirstString(scriptRecord, ['tone']),
    continuityNotes: pickFirstString(scriptRecord, ['continuityNotes']),
    entityBindings: entityRefs.map((entityRef) => ({
      id: entityRef.id,
      kind: entityRef.kind,
      role: entityRef.role,
      label: entityRef.sourceName,
      sourceName: entityRef.sourceName,
      summary: entityRef.summary,
      definitionKey: entityRef.definitionKey ?? null,
      assetKey: null,
      stagingNotes: '',
      priority: entityRef.kind === 'environment' ? 60 : entityRef.kind === 'item' ? 55 : 70,
      required: true,
    })),
    scenes: normalizedScenes,
    shots: normalizedShotsWithDefaultLocation.map((shot, index) => ({
      id: shot.id,
      sceneId: normalizedScenes.find((scene) => scene.shotIds.includes(shot.id))?.id ?? normalizedScenes[0]?.id ?? null,
      orderIndex: index,
      title: shot.title,
      subtitle: null,
      beat: shot.beat,
      emotionalBeat: '',
      shotType: shot.shotType,
      framing: shot.framing,
      cameraAngle: shot.cameraAngle,
      cameraMovement: shot.cameraMovement,
      lensPreference: shot.lensPreference,
      visualPrompt: shot.visualPrompt,
      compositionGuide: shot.compositionGuide,
      continuityNotes: '',
      participantRefIds: shot.participantRefIds,
      locationRefId: shot.locationRefId,
      propRefIds: shot.propRefIds,
      requiredSourceRefIds: Array.from(new Set([
        ...(shot.storyboardRefIds ?? []),
        ...(shot.compositeRefIds ?? []),
        ...shot.participantRefIds,
        ...(shot.locationRefId ? [shot.locationRefId] : []),
        ...shot.propRefIds,
      ])),
      compositeRefIds: shot.compositeRefIds,
      storyboardRefIds: shot.storyboardRefIds,
      durationSeconds: shot.durationSeconds,
      beats: shot.beats,
      dialogue: shot.dialogue,
      actions: shot.actions,
      audio: shot.audio,
    })),
    relationships: relationshipRefs,
    compositeRefs: compositeRefPlans.map((composite) => ({
      ...composite,
      outputAssetKey: composite.outputAssetKey ?? null,
    })),
    storyboard: storyboardPlan,
  })

  return cinematicPlannerRawSchema.parse({
    requestSummary,
    graphName,
    graphSummary,
    entityRefs,
    scriptDoc,
    relationshipRefs,
    compositeRefPlans,
    storyboardPlan,
    shots: normalizedShotsWithDefaultLocation,
    graphSettings: asRecord(record.graphSettings ?? record.settings) ?? {},
    diagnostics: [...diagnostics, ...fallbackDiagnostics],
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
    'Do not extract incidental set dressing as standalone items unless the prompt makes them a reusable hero prop or the supplied catalog clearly contains them already.',
    'Examples of incidental set dressing that should usually stay inside shot staging rather than entityRefs: table, chair, stool, wall, floor, room dressing, crowd extras, generic mugs, generic bottles.',
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

export function cinematicScriptRepairSystemPrompt() {
  return [
    'You repair a weak GraphCore cinematic script draft into a stronger authored script.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, graphName, graphSummary, scriptDoc, graphSettings, diagnostics, assistantNotes.',
    'Preserve the same story intent, locked entity ids, and overall cinematic shape unless one of the reported quality failures requires adjustment.',
    'Do not invent new entities, rename existing entities, or change locked ids.',
    'Rewrite generic shot titles into specific dramatic titles.',
    'Rewrite beat text into authored cinematic prose instead of copying or paraphrasing the prompt directly.',
    'For dialogue scenes, write actual spoken dialogue lines in character voice. Do not use summary placeholders like "X delivers a cutting accusation."',
    'Fix actorRefId and targetRefId when the prompt clearly names who acts on whom.',
    'Remove or demote incidental staging props like tables, chairs, mugs, and bottles unless the prompt clearly makes them an important interactive prop.',
    'Keep shots concrete, readable, and screenplay-like.',
  ].join('\n')
}

export function evaluateCinematicScriptQuality(input: {
  promptText: string
  scriptDoc: z.infer<typeof cinematicScriptDocSchema>
}) {
  const failures: string[] = []
  const flags = {
    usedFallbackPrimaryShot: false,
    usedTemporalExpansionFallback: false,
    usedDialogueFallback: false,
    usedActionBindingRepair: false,
    promptEchoShots: false,
    genericShotTitles: false,
    incidentalPropRelationships: false,
  }

  for (const shot of input.scriptDoc.shots) {
    const impliesDialogue = shotImpliesDialogue({
      promptText: input.promptText,
      title: shot.title,
      beat: shot.beat,
      shotType: shot.shotType,
    })
    const impliesAction = shotImpliesAction({
      promptText: input.promptText,
      title: shot.title,
      beat: shot.beat,
      shotType: shot.shotType,
    })
    if (isGenericShotTitle(shot.title)) {
      flags.genericShotTitles = true
      failures.push(`Shot "${shot.id}" has a generic title.`)
    }
    if (beatLooksLikePromptEcho(shot.beat, input.promptText)) {
      flags.promptEchoShots = true
      failures.push(`Shot "${shot.id}" beat text echoes the prompt instead of authored prose.`)
    }
    if (impliesDialogue && shot.dialogue.length === 0) {
      flags.usedDialogueFallback = true
      failures.push(`Shot "${shot.id}" implies dialogue but provides no dialogue beats.`)
    }
    if (impliesAction && shot.actions.length === 0) {
      failures.push(`Shot "${shot.id}" implies action but provides no action beats.`)
    }
    if ((impliesDialogue || impliesAction) && shot.audio.length === 0) {
      failures.push(`Shot "${shot.id}" needs audio cues but provides none.`)
    }
    for (const dialogue of shot.dialogue) {
      const speakerName =
        input.scriptDoc.entityBindings.find((binding) => binding.id === dialogue.speakerRefId)?.sourceName
        ?? input.scriptDoc.entityBindings.find((binding) => binding.id === dialogue.speakerRefId)?.label
        ?? ''
      if (!dialogue.line.trim() || dialogueLooksLikePlaceholder(dialogue.line, speakerName)) {
        flags.usedDialogueFallback = true
        failures.push(`Shot "${shot.id}" contains placeholder or summary dialogue.`)
        break
      }
    }
  }

  for (const relationship of input.scriptDoc.relationships) {
    if (!['equip', 'hold', 'wear'].includes(relationship.type)) continue
    const targetBinding = input.scriptDoc.entityBindings.find((binding) => binding.id === relationship.targetRefId) ?? null
    if (targetBinding?.kind === 'item' && isIncidentalPropName(targetBinding.sourceName || targetBinding.label)) {
      flags.incidentalPropRelationships = true
      failures.push(`Relationship "${relationship.id}" over-emphasizes incidental prop "${targetBinding.label}".`)
    }
  }

  return {
    failures: Array.from(new Set(failures)),
    shouldRepair: failures.length > 0,
    flags,
  }
}

export function cinematicScriptPlannerSystemPrompt() {
  return [
    'You are the GraphCore cinematic script planner.',
    'Return JSON only.',
    'Return exactly one JSON object with top-level keys: requestSummary, graphName, graphSummary, scriptDoc, graphSettings, diagnostics, assistantNotes.',
    'scriptDoc must be an object with keys: title, logline, tone, continuityNotes, scenes, shots, relationships, compositeRefs, storyboard.',
    'Plan a cinematic script, not patch operations or graph nodes.',
    'The prompt context includes a locked entity set that has already been resolved against the project.',
    'Do not invent new entities, rename them, or change their ids.',
    'Every shot must name the participantRefIds, locationRefId, and propRefIds that are relevant for that beat whenever those ingredients exist in the request.',
    'Prompts like "Character A fights Character B in Environment C using Weapon D" must preserve both characters, the environment, and the weapon as explicit shot ingredients.',
    'Each scene should group one or more ordered shots and preserve continuity notes when useful.',
    'When the prompt names multiple dramatic phases in one sentence, break them into separate shots instead of compressing them into one.',
    'Named people in an argument, fight, dialogue, or reaction scene are characters unless the supplied catalog clearly says otherwise.',
    'Only reference ids from the locked entity set in shots, relationships, dialogue, action beats, audio beats, storyboards, and composites.',
    'Every shot must be concrete and implementation-facing with camera/framing intent.',
    'Give every shot a specific dramatic title. Avoid generic titles like "Shot 1", "Beat 1", "Escalation", or "Final beat" unless the prompt itself explicitly uses those labels.',
    'Write each shot beat as authored cinematic prose. Do not copy the user prompt into the beat field.',
    'Include a short compositionGuide for each shot that explains how to combine the planned ingredients in frame.',
    'If the prompt contains temporal cues like "then", "finally", "ending with", "at the end", or "until", split the sequence into multiple ordered shots rather than collapsing everything into one shot.',
    'Argument, confrontation, and dialogue scenes should usually produce at least two shots when escalation or a final physical beat is present.',
    'When a physical action is named, include at least one explicit action beat and populate actorRefId and targetRefId.',
    'When a verbal exchange or argument is named, include explicit dialogue beats with speakerRefId values and actual spoken lines.',
    'Dialogue line text must be what the character actually says, not a summary of what they say.',
    'Populate dialogue, actions, and audio arrays whenever the prompt implies them; do not leave them empty for argument, confrontation, or fight scenes.',
    'Use storyboard and compositeRefs only as authoring aids; do not reason about graph nodes or graph topology.',
    'Prefer 1-5 shots for v1 unless the prompt explicitly asks for a longer sequence.',
    'Default to a linear sequence.',
    'Use environments as location anchors when possible.',
    'graphSettings should only include fields that matter for this cinematic.',
  ].join('\n')
}

export const cinematicPlannerSystemPrompt = cinematicScriptPlannerSystemPrompt

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
    'Preserve and carry through dialogue, action, and audio beat structure from the planned shots.',
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
  const scriptDoc = rawPlan.scriptDoc
    ? cinematicScriptDocSchema.parse(rawPlan.scriptDoc)
    : cinematicScriptDocSchema.parse({
        title: rawPlan.graphName,
        logline: rawPlan.graphSummary,
        entityBindings: rawPlan.entityRefs.map((entityRef) => ({
          id: entityRef.id,
          kind: entityRef.kind,
          role: entityRef.role,
          label: entityRef.sourceName,
          sourceName: entityRef.sourceName,
          summary: entityRef.summary,
          definitionKey: entityRef.definitionKey ?? null,
          assetKey: null,
          stagingNotes: '',
          priority: entityRef.kind === 'environment' ? 60 : entityRef.kind === 'item' ? 55 : 70,
          required: true,
        })),
        scenes: rawPlan.shots.length > 0 ? [{
          id: 'scene_1',
          title: 'Scene 1',
          summary: rawPlan.graphSummary,
          locationRefId: rawPlan.shots[0]?.locationRefId ?? null,
          shotIds: rawPlan.shots.map((shot) => shot.id),
          continuityNotes: '',
          orderIndex: 0,
        }] : [],
        shots: rawPlan.shots.map((shot, index) => ({
          id: shot.id,
          sceneId: 'scene_1',
          orderIndex: index,
          title: shot.title,
          subtitle: null,
          beat: shot.beat,
          emotionalBeat: '',
          shotType: shot.shotType,
          framing: shot.framing,
          cameraAngle: shot.cameraAngle,
          cameraMovement: shot.cameraMovement,
          lensPreference: shot.lensPreference,
          visualPrompt: shot.visualPrompt,
          compositionGuide: shot.compositionGuide,
          continuityNotes: '',
          participantRefIds: shot.participantRefIds,
          locationRefId: shot.locationRefId,
          propRefIds: shot.propRefIds,
          requiredSourceRefIds: Array.from(new Set([
            ...shot.participantRefIds,
            ...(shot.locationRefId ? [shot.locationRefId] : []),
            ...shot.propRefIds,
          ])),
          compositeRefIds: [],
          storyboardRefIds: [],
          durationSeconds: shot.durationSeconds,
          beats: shot.beats,
          dialogue: shot.dialogue,
          actions: shot.actions,
          audio: shot.audio,
        })),
        relationships: rawPlan.relationshipRefs,
        compositeRefs: rawPlan.compositeRefPlans,
        storyboard: rawPlan.storyboardPlan,
      })
  const derivedShots = scriptDoc.shots.map((shot) => cinematicShotPlanSchema.parse({
    id: shot.id,
    title: shot.title,
    beat: shot.beat,
    participantRefIds: shot.participantRefIds,
    locationRefId: shot.locationRefId,
    propRefIds: shot.propRefIds,
    shotType: shot.shotType,
    framing: shot.framing,
    cameraAngle: shot.cameraAngle,
    cameraMovement: shot.cameraMovement,
    lensPreference: shot.lensPreference,
    durationSeconds: shot.durationSeconds,
    visualPrompt: shot.visualPrompt,
    compositionGuide: shot.compositionGuide,
    beats: shot.beats,
    dialogue: shot.dialogue,
    actions: shot.actions,
    audio: shot.audio,
  }))

  return cinematicPlanSchema.parse({
    graphName: rawPlan.graphName,
    graphSummary: rawPlan.graphSummary,
    entityRefs: rawPlan.entityRefs,
    scriptDoc,
    relationshipRefs: scriptDoc.relationships,
    compositeRefPlans: scriptDoc.compositeRefs,
    storyboardPlan: scriptDoc.storyboard,
    shots: derivedShots,
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
