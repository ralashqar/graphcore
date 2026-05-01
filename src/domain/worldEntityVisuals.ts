import type { WorldEntity, WorldEntityCreateInput } from './worldGraph.ts'

export const WORLD_ENTITY_VISUAL_DESCRIPTION_MAX_LENGTH = 280

type VisualEntityLike = Pick<WorldEntity | WorldEntityCreateInput, 'summary' | 'context' | 'metadata' | 'customProperties'>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeWorldEntityVisualDescription(value: unknown) {
  const normalized = readString(value).replace(/\s+/g, ' ')
  if (!normalized) return ''
  return normalized.slice(0, WORLD_ENTITY_VISUAL_DESCRIPTION_MAX_LENGTH).trim()
}

export function readWorldEntityVisualDescription(entity: VisualEntityLike) {
  const metadata = asRecord(entity.metadata)
  const customProperties = asRecord(entity.customProperties)
  const metadataVisual = asRecord(metadata.visual)
  const customVisual = asRecord(customProperties.visual)
  return normalizeWorldEntityVisualDescription(
    readString(metadata.visualDescription)
    || readString(metadataVisual.description)
    || readString(metadataVisual.visualDescription)
    || readString(customProperties.visualDescription)
    || readString(customVisual.description)
    || readString(customVisual.visualDescription)
    || readString(customProperties.appearance)
    || readString(entity.summary)
    || readString(entity.context),
  )
}

export function mergeWorldEntityVisualDescriptionMetadata(
  metadata: Record<string, unknown> | undefined,
  visualDescription: unknown,
) {
  const normalized = normalizeWorldEntityVisualDescription(visualDescription)
  const nextMetadata = { ...(metadata ?? {}) }
  if (normalized) {
    nextMetadata.visualDescription = normalized
  } else if (typeof nextMetadata.visualDescription === 'string') {
    const existing = normalizeWorldEntityVisualDescription(nextMetadata.visualDescription)
    if (existing) nextMetadata.visualDescription = existing
  }
  return nextMetadata
}
