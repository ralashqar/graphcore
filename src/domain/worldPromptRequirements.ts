import type { WorldEntity } from './worldGraph.ts'

export type WorldPromptEntityRequirements = {
  counts: Partial<Record<WorldEntity['nodeType'], number>>
  minimumEntityOps: number
  hasExplicitCount: boolean
  hasSeedWorldShape: boolean
  summary: string
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

function parseCount(value: string | undefined) {
  if (!value) return 0
  const normalized = value.toLowerCase()
  if (/^\d+$/.test(normalized)) return Number(normalized)
  return NUMBER_WORDS[normalized] ?? 0
}

function maxCount(current: number | undefined, incoming: number) {
  return Math.max(current ?? 0, incoming)
}

export function analyzeWorldPromptEntityRequirements(prompt: string): WorldPromptEntityRequirements {
  const counts: Partial<Record<WorldEntity['nodeType'], number>> = {}
  const normalized = prompt.toLowerCase()
  let hasExplicitCount = false

  const countPatterns: Array<{
    nodeType: WorldEntity['nodeType']
    pattern: RegExp
  }> = [
    { nodeType: 'actor', pattern: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:major\s+|main\s+|key\s+|important\s+)?(?:characters?|people|figures?|actors?)\b/gi },
    { nodeType: 'group', pattern: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:rival\s+|major\s+|main\s+|key\s+)?(?:factions?|groups?|houses?|guilds?|orders?|clans?)\b/gi },
    { nodeType: 'place', pattern: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:major\s+|main\s+|key\s+)?(?:places?|locations?|cities|capitals?|regions?|districts?|sites?)\b/gi },
    { nodeType: 'object', pattern: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:forbidden\s+|major\s+|main\s+|key\s+)?(?:artifacts?|relics?|objects?|items?|weapons?)\b/gi },
    { nodeType: 'concept', pattern: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:major\s+|main\s+|key\s+)?(?:concepts?|laws?|secrets?|prophecies?|curses?|rituals?)\b/gi },
    { nodeType: 'event', pattern: /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:major\s+|main\s+|key\s+)?(?:events?|crises|conflicts?|incidents?)\b/gi },
  ]

  for (const entry of countPatterns) {
    for (const match of normalized.matchAll(entry.pattern)) {
      const count = parseCount(match[1])
      if (count > 0) {
        counts[entry.nodeType] = maxCount(counts[entry.nodeType], count)
        hasExplicitCount = true
      }
    }
  }

  if (/\bcapital\s+city\b|\bthe\s+capital\b/.test(normalized)) {
    counts.place = maxCount(counts.place, 1)
  }
  if (/\bforbidden\s+(?:artifact|relic|object|item)\b/.test(normalized)) {
    counts.object = maxCount(counts.object, 1)
  }
  if (/\bhouse\s+[A-Z][A-Za-z0-9'-]*\b/i.test(prompt)) {
    counts.group = maxCount(counts.group, (counts.group ?? 0) + 1)
  }

  const minimumEntityOps = Object.values(counts).reduce((sum, value) => sum + (value ?? 0), 0)
  const hasSeedWorldShape = /\b(create|add|make|start|seed)\b/i.test(prompt)
    && /\b(world|kingdom|realm|setting|capital|faction|character|artifact|thread)\b/i.test(prompt)

  const summary = Object.entries(counts)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([nodeType, count]) => `${count} ${nodeType}`)
    .join(', ')

  return {
    counts,
    minimumEntityOps,
    hasExplicitCount,
    hasSeedWorldShape,
    summary,
  }
}
