type LooseRecord = Record<string, unknown>

export const sequenceAnimaticSpatialPromptPolicyVersion = 'spatial_location_prompt_v7'

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniqueTexts(values: readonly unknown[]) {
  return [...new Set(values.map(readText).filter(Boolean))]
}

function cleanSpatialText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:/])/g, '$1')
    .replace(/([,.;:/]){2,}/g, '$1')
    .replace(/\s*[,;:]\s*(?=[,;:.]|$)/g, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+-\s*(?=[,.;:]|$)/g, ' ')
    .replace(/\b(?:a|an|the)\s+(?=\.)/gi, '')
    .trim()
}

export function sequenceAnimaticSpatialForbiddenNamesFromShots(shots: readonly unknown[]) {
  const names: string[] = []
  for (const shotValue of shots) {
    const shot = asRecord(shotValue)
    const refs = asRecord(shot.refs)
    names.push(
      ...readArray(shot.visibleCharacterNames ?? shot.visible_character_names).map(readText).filter(Boolean),
      ...readArray(shot.characterNames ?? shot.character_names).map(readText).filter(Boolean),
      ...readArray(refs.visibleCharacterNames ?? refs.visible_character_names).map(readText).filter(Boolean),
      ...readArray(refs.characterNames ?? refs.character_names).map(readText).filter(Boolean),
    )
    for (const lineValue of readArray(shot.dialogue)) {
      const line = asRecord(lineValue)
      names.push(...[line.speakerName, line.speaker_name, line.speaker, line.characterName, line.character_name].map(readText).filter(Boolean))
    }
    for (const beatValue of readArray(shot.performance ?? shot.performanceBeats ?? shot.performance_beats)) {
      const beat = asRecord(beatValue)
      names.push(...[beat.characterName, beat.character_name, beat.name].map(readText).filter(Boolean))
    }
  }
  return uniqueTexts(names)
}

export function sanitizeSequenceAnimaticSpatialPromptText(value: unknown, options: {
  forbiddenNames?: readonly string[]
  maxLength?: number
} = {}) {
  const removedTerms: string[] = []
  let text = readText(value)
  const original = text
  for (const name of uniqueTexts(options.forbiddenNames ?? []).sort((left, right) => right.length - left.length)) {
    const pattern = new RegExp(`\\b${escapeRegExp(name)}(?:'s)?\\b`, 'gi')
    if (pattern.test(text)) {
      removedTerms.push(name)
      text = text.replace(pattern, '')
    }
  }
  const replacements: Array<[RegExp, string, string]> = [
    [/\b(?:dialogue|speaker|speaks?|answers?|voices?|says?|confession|panic|trial|control|emotion|smile|gaze|lips|fingers?|hair|chest|face|body|gesture|reaction)\b/gi, '', 'character/action term'],
    [/\b(?:unconsciously|trembling|vanishes|listens?|hears?|looks?|watches?|sings?|steps?|moves?|walks?|enters?|exits?|approaches?|closes|tone|note|activation)\b/gi, '', 'performance/action term'],
    [/\b(?:people|characters?|persons?|bodies|silhouettes?|crowds?|extras?|figures?)\b/gi, 'empty space', 'people term'],
    [/\b(?:scene|shot|set|zone|spot|angle|viewpoint)_[a-z0-9_:-]+\b/gi, '', 'internal id'],
    [/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+\[(?:ref|id):[^\]]+\]/g, '', 'ref-tagged name'],
  ]
  for (const [pattern, replacement, label] of replacements) {
    if (pattern.test(text)) {
      removedTerms.push(label)
      text = text.replace(pattern, replacement)
    }
  }
  text = cleanSpatialText(text)
  const maxLength = Math.max(0, Math.floor(options.maxLength ?? 0))
  if (maxLength > 0 && text.length > maxLength) {
    text = cleanSpatialText(text.slice(0, maxLength))
  }
  return {
    text,
    changed: text !== cleanSpatialText(original),
    removedTerms: uniqueTexts(removedTerms),
  }
}

export function sequenceAnimaticSpatialNodeKindLabel(kind: unknown) {
  const value = readText(kind)
  if (value === 'location_set' || value === 'set') return 'set environment reference'
  if (value === 'location_zone' || value === 'zone') return 'zone environment reference'
  if (value === 'location_angle' || value === 'location_viewpoint' || value === 'viewpoint' || value === 'angle') return 'camera-facing spatial reference'
  if (value === 'location_spot' || value === 'spot') return 'physical staging position reference'
  return 'spatial continuity reference'
}

export function sanitizeSequenceAnimaticSpatialNodeFields(node: unknown, options: {
  forbiddenNames?: readonly string[]
} = {}) {
  const record = asRecord(node)
  const rawName = readText(record.name) || readText(record.title) || readText(record.label) || readText(record.id)
  const rawBrief = readText(record.visualBrief) || readText(record.visual_brief) || readText(record.summary)
  const nameResult = sanitizeSequenceAnimaticSpatialPromptText(rawName, { forbiddenNames: options.forbiddenNames, maxLength: 96 })
  let name = nameResult.text
    .replace(/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?=(?:opposite|close[-\s]?in|watch|kneeling|seated|standing|inner|side|primary|secondary)\b)/i, '')
    .replace(/\bclose[-\s]?in position\b/gi, 'inner approach point')
    .replace(/\bopposite position\b/gi, 'opposite staging position')
    .replace(/\bwatch position\b/gi, 'watch point')
    .replace(/\bposition\b/gi, 'staging position')
  name = cleanSpatialText(name)
  if (!name) name = 'Neutral spatial reference'
  const briefResult = sanitizeSequenceAnimaticSpatialPromptText(rawBrief, { forbiddenNames: options.forbiddenNames, maxLength: 220 })
  return {
    id: readText(record.id),
    name,
    brief: briefResult.text,
    kindLabel: sequenceAnimaticSpatialNodeKindLabel(record.assetKind ?? record.nodeKind ?? record.kind),
    diagnostics: uniqueTexts([...nameResult.removedTerms, ...briefResult.removedTerms]),
    changed: nameResult.changed || briefResult.changed || name !== rawName,
  }
}

export function buildSequenceAnimaticLocationEvidenceLines(shots: readonly unknown[], options: {
  forbiddenNames?: readonly string[]
  limit?: number
  maxLineLength?: number
} = {}) {
  const lines: string[] = []
  for (const shotValue of shots) {
    const shot = asRecord(shotValue)
    const camera = asRecord(shot.camera)
    const pieces = [
      shot.locationContinuity,
      shot.location_continuity,
      shot.lighting,
      camera.framing,
      camera.angle,
      camera.movement,
      shot.action,
      shot.description,
    ]
    const result = sanitizeSequenceAnimaticSpatialPromptText(pieces.filter(Boolean).join('; '), {
      forbiddenNames: options.forbiddenNames,
      maxLength: options.maxLineLength ?? 180,
    })
    if (result.text) lines.push(result.text)
    if (lines.length >= (options.limit ?? 5)) break
  }
  return lines
}
