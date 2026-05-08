type LooseRecord = Record<string, unknown>

export type WorldPromptRefinementField = 'summary' | 'context' | 'notes'
export type WorldPromptRefinementStrategy =
  | 'initialized'
  | 'unchanged'
  | 'expanded'
  | 'replaced'
  | 'preserved_existing'
  | 'merged_distinct'

export type WorldPromptRefinementHistoryEntry = {
  at: string
  field: WorldPromptRefinementField
  strategy: WorldPromptRefinementStrategy
  previousText: string
  incomingText: string
  resultText: string
}

const REFINEMENT_HISTORY_LIMIT = 24

function normalizeText(value: string | null | undefined) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

export function hasTruncationArtifact(value: string | null | undefined) {
  const normalized = normalizeText(value)
  return /(?:\.\.\.|…|â€¦)/.test(normalized)
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function trimHistoryText(value: string, maxLength = 280) {
  const normalized = normalizeText(value)
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`
}

function splitCanonicalUnits(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function dedupeCanonicalUnits(units: string[]) {
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const unit of units) {
    const key = normalizeKey(unit)
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(unit)
  }
  return deduped
}

export function mergeCanonicalText(input: {
  existing: string
  incoming?: string | null
  maxUnits?: number
}) {
  const current = normalizeText(input.existing)
  const next = normalizeText(input.incoming)
  if (!next) {
    return {
      text: input.existing,
      changed: false,
      strategy: 'unchanged' as const,
    }
  }
  if (!current) {
    return {
      text: next,
      changed: normalizeText(input.existing) !== next,
      strategy: 'initialized' as const,
    }
  }
  if (current === next) {
    return {
      text: current,
      changed: false,
      strategy: 'unchanged' as const,
    }
  }
  if (next.includes(current)) {
    return {
      text: next,
      changed: true,
      strategy: 'expanded' as const,
    }
  }
  if (current.includes(next)) {
    return {
      text: current,
      changed: false,
      strategy: 'preserved_existing' as const,
    }
  }

  const maxUnits = Math.max(2, input.maxUnits ?? 4)
  const mergedUnits = dedupeCanonicalUnits([
    ...splitCanonicalUnits(current),
    ...splitCanonicalUnits(next),
  ]).slice(0, maxUnits)
  const mergedText = mergedUnits.join(' ').trim() || current
  return {
    text: mergedText,
    changed: mergedText !== current,
    strategy: 'merged_distinct' as const,
  }
}

export function replaceCanonicalSummary(input: {
  existing: string
  incoming?: string | null
}) {
  const current = normalizeText(input.existing)
  const next = normalizeText(input.incoming)
  if (!next || hasTruncationArtifact(next)) {
    return {
      text: input.existing,
      changed: false,
      strategy: 'unchanged' as const,
    }
  }
  if (!current) {
    return {
      text: next,
      changed: normalizeText(input.existing) !== next,
      strategy: 'initialized' as const,
    }
  }
  if (current === next) {
    return {
      text: current,
      changed: false,
      strategy: 'unchanged' as const,
    }
  }
  return {
    text: next,
    changed: true,
    strategy: current && next.includes(current) ? 'expanded' as const : 'replaced' as const,
  }
}

type ContextSection = 'identity' | 'role' | 'tension' | 'history' | 'details'

const CONTEXT_SECTION_ORDER: ContextSection[] = ['identity', 'role', 'tension', 'history', 'details']

function inferContextSection(line: string): ContextSection {
  const lowered = line.toLowerCase()
  if (lowered.includes('role:') || lowered.includes('position:') || lowered.includes('duty:')) return 'role'
  if (lowered.includes('tension:') || lowered.includes('conflict:') || lowered.includes('secret:')) return 'tension'
  if (lowered.includes('history:') || lowered.includes('past:') || lowered.includes('origin:')) return 'history'
  if (lowered.includes('identity:') || lowered.includes('who:')) return 'identity'
  return 'details'
}

function parseContextSections(value: string) {
  const sections = new Map<ContextSection, string[]>(CONTEXT_SECTION_ORDER.map((section) => [section, []]))
  for (const rawLine of value.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const section = inferContextSection(line)
    sections.get(section)?.push(line)
  }
  return sections
}

function renderContextSections(sections: Map<ContextSection, string[]>) {
  return CONTEXT_SECTION_ORDER
    .flatMap((section) => dedupeCanonicalUnits(sections.get(section) ?? []))
    .join('\n')
    .trim()
}

export function mergeCanonicalContext(input: {
  existing: string
  incoming?: string | null
}) {
  const current = normalizeText(input.existing)
  const next = normalizeText(input.incoming)
  if (!next) {
    return {
      text: input.existing,
      changed: false,
      strategy: 'unchanged' as const,
    }
  }
  if (!current) {
    return {
      text: next,
      changed: normalizeText(input.existing) !== next,
      strategy: 'initialized' as const,
    }
  }
  if (current === next) {
    return {
      text: current,
      changed: false,
      strategy: 'unchanged' as const,
    }
  }
  if (next.includes(current)) {
    return {
      text: next,
      changed: true,
      strategy: 'expanded' as const,
    }
  }
  if (current.includes(next)) {
    return {
      text: current,
      changed: false,
      strategy: 'preserved_existing' as const,
    }
  }
  const merged = parseContextSections(current)
  const incomingSections = parseContextSections(next)
  for (const section of CONTEXT_SECTION_ORDER) {
    const target = merged.get(section) ?? []
    for (const line of incomingSections.get(section) ?? []) {
      if (!target.includes(line)) {
        target.push(line)
      }
    }
    merged.set(section, target)
  }
  const mergedText = renderContextSections(merged)
  return {
    text: mergedText,
    changed: mergedText !== current,
    strategy: 'merged_distinct' as const,
  }
}

export function appendRefinementHistory(input: {
  metadata?: LooseRecord | null
  field: WorldPromptRefinementField
  previousText: string
  incomingText?: string | null
  resultText: string
  strategy: WorldPromptRefinementStrategy
  changed: boolean
  at?: string
}) {
  const baseMetadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
  if (!input.changed) return { ...baseMetadata }

  const incomingText = normalizeText(input.incomingText)
  if (!incomingText) return { ...baseMetadata }

  const existingHistory = Array.isArray(baseMetadata.refinementHistory)
    ? baseMetadata.refinementHistory.filter((entry): entry is LooseRecord => Boolean(entry && typeof entry === 'object'))
    : []

  const nextEntry: WorldPromptRefinementHistoryEntry = {
    at: input.at ?? new Date().toISOString(),
    field: input.field,
    strategy: input.strategy,
    previousText: trimHistoryText(input.previousText),
    incomingText: trimHistoryText(incomingText),
    resultText: trimHistoryText(input.resultText),
  }

  const dedupeKey = `${nextEntry.field}:${nextEntry.previousText}:${nextEntry.incomingText}:${nextEntry.resultText}`
  const normalizedHistory = existingHistory.filter((entry) => {
    const entryKey = [
      typeof entry.field === 'string' ? entry.field : '',
      typeof entry.previousText === 'string' ? entry.previousText : '',
      typeof entry.incomingText === 'string' ? entry.incomingText : '',
      typeof entry.resultText === 'string' ? entry.resultText : '',
    ].join(':')
    return entryKey !== dedupeKey
  })

  return {
    ...baseMetadata,
    refinementHistory: [...normalizedHistory, nextEntry].slice(-REFINEMENT_HISTORY_LIMIT),
  }
}
