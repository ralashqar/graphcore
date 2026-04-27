import type { WorldEntity, WorldRelationship } from './worldGraph.ts'
import type { WorldPromptAtlasIndex, WorldPromptContextHit } from './worldPrompt.ts'

export function normalizeWorldPromptContextText(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')
}

export function diceCoefficient(left: string, right: string) {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.length < 2 || right.length < 2) return 0
  const leftPairs = new Map<string, number>()
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2)
    leftPairs.set(pair, (leftPairs.get(pair) ?? 0) + 1)
  }
  let intersection = 0
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2)
    const count = leftPairs.get(pair) ?? 0
    if (count > 0) {
      leftPairs.set(pair, count - 1)
      intersection += 1
    }
  }
  return (2 * intersection) / ((left.length - 1) + (right.length - 1))
}

function relationCountForEntityKeys(relationships: WorldRelationship[]) {
  const counts = new Map<string, number>()
  for (const relationship of relationships) {
    counts.set(relationship.sourceEntityKey, (counts.get(relationship.sourceEntityKey) ?? 0) + 1)
    counts.set(relationship.targetEntityKey, (counts.get(relationship.targetEntityKey) ?? 0) + 1)
  }
  return counts
}

export function buildWorldPromptAtlasIndex(input: {
  entities: WorldEntity[]
  relationships: WorldRelationship[]
  maxEntities?: number
}): WorldPromptAtlasIndex {
  const maxEntities = Math.max(1, input.maxEntities ?? 240)
  const relationCounts = relationCountForEntityKeys(input.relationships)
  const activeEntities = input.entities.filter((entity) => entity.status !== 'archived')
  const entityTypeCounts = activeEntities.reduce<Record<string, number>>((counts, entity) => {
    counts[entity.nodeType] = (counts[entity.nodeType] ?? 0) + 1
    return counts
  }, {})
  const sortedEntities = activeEntities.slice().sort((left, right) => {
    const relationDelta = (relationCounts.get(right.key) ?? 0) - (relationCounts.get(left.key) ?? 0)
    if (relationDelta !== 0) return relationDelta
    return left.name.localeCompare(right.name)
  })
  const entities = sortedEntities.slice(0, maxEntities).map((entity) => ({
    key: entity.key,
    name: entity.name,
    nodeType: entity.nodeType,
    aliases: entity.aliases.slice(0, 3),
    tags: entity.tags.slice(0, 2),
    status: entity.status,
    relationCount: relationCounts.get(entity.key) ?? 0,
  }))
  return {
    totalEntityCount: activeEntities.length,
    omittedEntityCount: Math.max(0, activeEntities.length - entities.length),
    capped: activeEntities.length > entities.length,
    entityTypeCounts,
    entities,
  }
}

function normalizedEntityVariants(entity: WorldPromptAtlasIndex['entities'][number]) {
  return [
    { value: entity.name, reason: 'atlas_match' as const },
    ...entity.aliases.map((alias) => ({ value: alias, reason: 'alias_match' as const })),
    ...entity.tags.map((tag) => ({ value: tag, reason: 'atlas_match' as const })),
  ]
    .map((entry) => ({
      ...entry,
      normalized: normalizeWorldPromptContextText(entry.value),
    }))
    .filter((entry) => entry.normalized.length > 0)
}

function promptWindows(normalizedPrompt: string, targetTokenCount: number) {
  const tokens = normalizedPrompt.split(' ').map((token) => token.trim()).filter(Boolean)
  const sizes = Array.from(new Set([
    Math.max(1, targetTokenCount - 1),
    Math.max(1, targetTokenCount),
    Math.max(1, targetTokenCount + 1),
  ]))
  const windows: string[] = []
  for (const size of sizes) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      windows.push(tokens.slice(index, index + size).join(' '))
    }
  }
  return windows
}

function bestFuzzyScore(normalizedPrompt: string, normalizedVariant: string) {
  const variantTokens = normalizedVariant.split(' ').filter(Boolean)
  const windows = promptWindows(normalizedPrompt, variantTokens.length)
  let best = 0
  let matchedText = ''
  for (const window of windows) {
    const score = diceCoefficient(window, normalizedVariant)
    if (score > best) {
      best = score
      matchedText = window
    }
  }
  return { score: best, matchedText }
}

export function findWorldPromptAtlasEntityHits(input: {
  prompt: string
  atlas: WorldPromptAtlasIndex
  maxHits?: number
}): WorldPromptContextHit[] {
  const normalizedPrompt = normalizeWorldPromptContextText(input.prompt)
  if (!normalizedPrompt) return []
  const hits: WorldPromptContextHit[] = []
  const maxHits = input.maxHits ?? 12

  for (const entity of input.atlas.entities) {
    let best: WorldPromptContextHit | null = null
    for (const variant of normalizedEntityVariants(entity)) {
      if (normalizedPrompt.includes(variant.normalized)) {
        const exactScore = variant.reason === 'alias_match' ? 9.2 : 8.8
        best = !best || exactScore > best.score
          ? {
              key: entity.key,
              kind: 'entity',
              reason: variant.reason,
              score: exactScore + Math.min(2, entity.relationCount * 0.05),
              label: entity.name,
              matchedText: variant.value,
            }
          : best
        continue
      }

      const { score, matchedText } = bestFuzzyScore(normalizedPrompt, variant.normalized)
      const threshold = variant.normalized.includes(' ') ? 0.72 : 0.84
      if (score >= threshold) {
        const fuzzyScore = 6.8 + score + Math.min(1.2, entity.relationCount * 0.04)
        best = !best || fuzzyScore > best.score
          ? {
              key: entity.key,
              kind: 'entity',
              reason: 'fuzzy_match',
              score: fuzzyScore,
              label: entity.name,
              matchedText: matchedText || variant.value,
            }
          : best
      }
    }
    if (best) hits.push(best)
  }

  return hits
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, maxHits)
}

export function ambiguityCandidatesFromHits(hits: WorldPromptContextHit[]) {
  if (hits.length < 2) return []
  const topScore = hits[0]?.score ?? 0
  return hits
    .filter((hit) => topScore - hit.score <= 0.8)
    .slice(0, 5)
    .map((hit) => ({
      key: hit.key,
      kind: hit.kind,
      label: hit.label,
      reason: hit.reason,
      score: hit.score,
    }))
}
