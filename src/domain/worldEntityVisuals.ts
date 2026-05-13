import type { WorldEntity, WorldEntityCreateInput } from './worldGraph.ts'

export const WORLD_ENTITY_VISUAL_DESCRIPTION_MAX_LENGTH = 480
export const WORLD_ENTITY_VOICE_DESCRIPTION_MAX_LENGTH = 420

const VISUAL_TRAIT_MAP_KEYS = [
  'age',
  'height',
  'build',
  'genderPresentation',
  'hair',
  'eyes',
  'complexion',
  'clothingSilhouette',
  'distinguishingMarks',
  'palette',
  'materials',
  'speciesOrType',
] as const

export type WorldEntityVisualTraitMap = Partial<Record<typeof VISUAL_TRAIT_MAP_KEYS[number], string>>

export type WorldEntityVisualIdentity = {
  description: string
  traits: string[]
  traitMap: WorldEntityVisualTraitMap
  descriptionMode: 'neutral_identity'
  transientStateExcluded: true
}

export type WorldEntityVoiceIdentity = {
  description: string
  accent: string
  qualities: string[]
  register: string
  pace: string
  pitch: string
  consistencyNotes: string
}

type VisualEntityLike = Pick<WorldEntity | WorldEntityCreateInput, 'summary' | 'context' | 'metadata' | 'customProperties'>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function compact(value: unknown) {
  return readString(value).replace(/\s+/g, ' ').trim()
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = compact(value)
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function readStringList(value: unknown) {
  if (Array.isArray(value)) return uniqueStrings(value.map((entry) => compact(entry)))
  if (typeof value === 'string') {
    return uniqueStrings(value.split(',').map((entry) => compact(entry)))
  }
  return []
}

function readTraitMap(value: unknown): WorldEntityVisualTraitMap {
  const record = asRecord(value)
  const traitMap: WorldEntityVisualTraitMap = {}
  for (const key of VISUAL_TRAIT_MAP_KEYS) {
    const normalized = compact(record[key])
    if (normalized) traitMap[key] = normalized
  }
  return traitMap
}

function traitMapToTraits(traitMap: WorldEntityVisualTraitMap) {
  return VISUAL_TRAIT_MAP_KEYS
    .map((key) => traitMap[key])
    .filter((value): value is string => Boolean(value && value.trim()))
}

function parseComposedVisualDescription(value: unknown) {
  const normalized = compact(value)
  if (!normalized) return { description: '', traits: [] as string[] }
  const match = normalized.match(/^(.*?)(?:\s+traits\s*:\s*)(.+)$/i)
  if (!match) return { description: normalized, traits: [] as string[] }
  return {
    description: compact(match[1]),
    traits: readStringList(match[2]),
  }
}

export function normalizeWorldEntityVisualDescription(value: unknown) {
  const normalized = compact(value)
  if (!normalized) return ''
  return normalized.slice(0, WORLD_ENTITY_VISUAL_DESCRIPTION_MAX_LENGTH).trim()
}

export function normalizeWorldEntityVoiceDescription(value: unknown) {
  const normalized = compact(value)
  if (!normalized) return ''
  return normalized.slice(0, WORLD_ENTITY_VOICE_DESCRIPTION_MAX_LENGTH).trim()
}

export function composeWorldEntityVisualDescription(description: unknown, traits: unknown = []) {
  const parsed = parseComposedVisualDescription(description)
  const cleanDescription = normalizeWorldEntityVisualDescription(parsed.description)
  const cleanTraits = uniqueStrings([
    ...parsed.traits,
    ...readStringList(traits),
  ])
  if (!cleanDescription) return ''
  const composed = cleanTraits.length > 0
    ? `${cleanDescription} Traits: ${cleanTraits.join(', ')}`
    : cleanDescription
  return normalizeWorldEntityVisualDescription(composed)
}

function readVoiceIdentityValue(value: unknown): WorldEntityVoiceIdentity {
  const record = asRecord(value)
  if (!Object.keys(record).length && typeof value === 'string') {
    return {
      description: normalizeWorldEntityVoiceDescription(value),
      accent: '',
      qualities: [],
      register: '',
      pace: '',
      pitch: '',
      consistencyNotes: '',
    }
  }
  return {
    description: normalizeWorldEntityVoiceDescription(
      record.description
      ?? record.voiceDescription
      ?? record.timbre
      ?? record.sound,
    ),
    accent: compact(record.accent ?? record.dialect),
    qualities: uniqueStrings([
      ...readStringList(record.qualities),
      ...readStringList(record.traits),
      ...readStringList(record.voiceTraits),
    ]),
    register: compact(record.register ?? record.delivery),
    pace: compact(record.pace ?? record.rhythm),
    pitch: compact(record.pitch),
    consistencyNotes: compact(record.consistencyNotes ?? record.notes),
  }
}

export function composeWorldEntityVoiceDescription(voice: Partial<WorldEntityVoiceIdentity> | unknown) {
  const identity = readVoiceIdentityValue(voice)
  const parts = [
    identity.description,
    identity.accent ? `Accent: ${identity.accent}.` : '',
    identity.qualities.length > 0 ? `Qualities: ${identity.qualities.join(', ')}.` : '',
    identity.register ? `Register: ${identity.register}.` : '',
    identity.pace ? `Pace: ${identity.pace}.` : '',
    identity.pitch ? `Pitch: ${identity.pitch}.` : '',
    identity.consistencyNotes ? `Consistency: ${identity.consistencyNotes}.` : '',
  ].filter(Boolean)
  return normalizeWorldEntityVoiceDescription(parts.join(' '))
}

export function readWorldEntityVisualTraitMap(entity: VisualEntityLike) {
  const metadata = asRecord(entity.metadata)
  const customProperties = asRecord(entity.customProperties)
  const metadataVisual = asRecord(metadata.visual)
  const customVisual = asRecord(customProperties.visual)
  return {
    ...readTraitMap(customVisual.traitMap),
    ...readTraitMap(customProperties.visualTraitMap),
    ...readTraitMap(metadataVisual.traitMap),
    ...readTraitMap(metadata.visualTraitMap),
  }
}

export function readWorldEntityVisualTraits(entity: VisualEntityLike) {
  const metadata = asRecord(entity.metadata)
  const customProperties = asRecord(entity.customProperties)
  const metadataVisual = asRecord(metadata.visual)
  const customVisual = asRecord(customProperties.visual)
  const traitMap = readWorldEntityVisualTraitMap(entity)
  const legacy = parseComposedVisualDescription(readString(metadata.visualDescription))
  return uniqueStrings([
    ...readStringList(customProperties.traits),
    ...readStringList(customProperties.visualTraits),
    ...readStringList(customProperties.appearanceTraits),
    ...readStringList(customVisual.traits),
    ...readStringList(metadata.traits),
    ...readStringList(metadata.visualTraits),
    ...readStringList(metadata.appearanceTraits),
    ...readStringList(metadataVisual.traits),
    ...traitMapToTraits(traitMap),
    ...legacy.traits,
  ])
}

export function readWorldEntityVisualIdentity(entity: VisualEntityLike): WorldEntityVisualIdentity {
  const metadata = asRecord(entity.metadata)
  const customProperties = asRecord(entity.customProperties)
  const metadataVisual = asRecord(metadata.visual)
  const customVisual = asRecord(customProperties.visual)
  const traitMap = readWorldEntityVisualTraitMap(entity)
  const legacy = parseComposedVisualDescription(readString(metadata.visualDescription))
  const description = normalizeWorldEntityVisualDescription(
    readString(metadataVisual.description)
    || readString(metadataVisual.visualDescription)
    || legacy.description
    || readString(customVisual.description)
    || readString(customVisual.visualDescription)
    || readString(customProperties.visualDescription)
    || readString(customProperties.appearance)
    || readString(entity.summary)
    || readString(entity.context),
  )
  return {
    description,
    traits: readWorldEntityVisualTraits(entity),
    traitMap,
    descriptionMode: 'neutral_identity',
    transientStateExcluded: true,
  }
}

export function readWorldEntityVisualDescription(entity: VisualEntityLike) {
  const identity = readWorldEntityVisualIdentity(entity)
  return composeWorldEntityVisualDescription(identity.description, identity.traits)
}

export function readWorldEntityVoiceIdentity(entity: VisualEntityLike): WorldEntityVoiceIdentity {
  const metadata = asRecord(entity.metadata)
  const customProperties = asRecord(entity.customProperties)
  const metadataVoice = asRecord(metadata.voice)
  const customVoice = asRecord(customProperties.voice)
  const legacyDescription = normalizeWorldEntityVoiceDescription(
    metadata.voiceDescription
    ?? customProperties.voiceDescription
    ?? customProperties.voice,
  )
  const candidate = readVoiceIdentityValue({
    ...customVoice,
    ...metadataVoice,
    description: metadataVoice.description
      ?? metadataVoice.voiceDescription
      ?? legacyDescription
      ?? customVoice.description
      ?? customVoice.voiceDescription,
    qualities: uniqueStrings([
      ...readStringList(customVoice.qualities),
      ...readStringList(customVoice.traits),
      ...readStringList(customVoice.voiceTraits),
      ...readStringList(customProperties.voiceTraits),
      ...readStringList(metadataVoice.qualities),
      ...readStringList(metadataVoice.traits),
      ...readStringList(metadataVoice.voiceTraits),
      ...readStringList(metadata.voiceTraits),
    ]),
  })
  return candidate
}

export function readWorldEntityVoiceDescription(entity: VisualEntityLike) {
  return composeWorldEntityVoiceDescription(readWorldEntityVoiceIdentity(entity))
}

export function mergeWorldEntityVisualDescriptionMetadata(
  metadata: Record<string, unknown> | undefined,
  visualDescription: unknown,
  options: {
    traits?: unknown
    traitMap?: unknown
    replaceTraits?: boolean
    source?: string
  } = {},
) {
  const nextMetadata = { ...(metadata ?? {}) }
  const existingEntity = {
    summary: '',
    context: '',
    metadata: nextMetadata,
    customProperties: {},
  } satisfies VisualEntityLike
  const existingIdentity = readWorldEntityVisualIdentity(existingEntity)
  const parsedIncoming = parseComposedVisualDescription(visualDescription)
  const description = normalizeWorldEntityVisualDescription(parsedIncoming.description || existingIdentity.description)
  const explicitTraits = uniqueStrings([
    ...parsedIncoming.traits,
    ...readStringList(options.traits),
  ])
  const traits = options.replaceTraits
    ? explicitTraits
    : uniqueStrings([...existingIdentity.traits, ...explicitTraits])
  const traitMap = {
    ...existingIdentity.traitMap,
    ...readTraitMap(options.traitMap),
  }
  if (description) {
    nextMetadata.visual = {
      ...asRecord(nextMetadata.visual),
      description,
      traits,
      traitMap,
      descriptionMode: 'neutral_identity',
      transientStateExcluded: true,
    }
    nextMetadata.visualDescription = composeWorldEntityVisualDescription(description, traits)
    if (options.source) nextMetadata.visualDescriptionSource = options.source
  } else if (typeof nextMetadata.visualDescription === 'string') {
    const existing = normalizeWorldEntityVisualDescription(nextMetadata.visualDescription)
    if (existing) nextMetadata.visualDescription = existing
  }
  return nextMetadata
}

export function mergeWorldEntityVoiceMetadata(
  metadata: Record<string, unknown> | undefined,
  voice: unknown,
  options: {
    source?: string
  } = {},
) {
  const nextMetadata = { ...(metadata ?? {}) }
  const existingEntity = {
    summary: '',
    context: '',
    metadata: nextMetadata,
    customProperties: {},
  } satisfies VisualEntityLike
  const existingVoice = readWorldEntityVoiceIdentity(existingEntity)
  const incomingVoice = readVoiceIdentityValue(voice)
  const voiceIdentity: WorldEntityVoiceIdentity = {
    description: incomingVoice.description || existingVoice.description,
    accent: incomingVoice.accent || existingVoice.accent,
    qualities: uniqueStrings([...existingVoice.qualities, ...incomingVoice.qualities]),
    register: incomingVoice.register || existingVoice.register,
    pace: incomingVoice.pace || existingVoice.pace,
    pitch: incomingVoice.pitch || existingVoice.pitch,
    consistencyNotes: incomingVoice.consistencyNotes || existingVoice.consistencyNotes,
  }
  const voiceDescription = composeWorldEntityVoiceDescription(voiceIdentity)
  if (!voiceDescription) return nextMetadata
  nextMetadata.voice = voiceIdentity
  nextMetadata.voiceDescription = voiceDescription
  if (options.source) nextMetadata.voiceSource = options.source
  return nextMetadata
}
