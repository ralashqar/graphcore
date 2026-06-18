type LooseRecord = Record<string, unknown>

export type SequenceAnimaticReferenceRecord = {
  label?: unknown
  role?: unknown
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return readArray(value).map(readText).filter(Boolean)
}

function normalizeReferenceName(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function titleFromRefLike(value: string) {
  return normalizeReferenceName(value)
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function sentenceCase(value: string) {
  const clean = value.trim()
  return clean ? `${clean.slice(0, 1).toUpperCase()}${clean.slice(1)}` : ''
}

function compactReferenceSentence(value: unknown, maxWords = 22) {
  const source = readText(value)
    .replace(/\b(?:Dialogue cue|Audio cue|Opening state|Action escalation|Obstacle or contact|Consequence and transition|Visible action and blocking|Camera feel|Framing)\s*:/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!source) return ''
  const firstSentence = source.split(/(?<=[.!?])\s+/)[0] ?? source
  const words = firstSentence.replace(/[.!?]+$/g, '').split(/\s+/).filter(Boolean)
  const weakTailWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'with', 'into', 'onto', 'through', 'from', 'to', 'of', 'in', 'on', 'for', 'as', 'while', 'before', 'after', 'then', 'just', 'where'])
  while (words.length > 1 && weakTailWords.has(words[words.length - 1].toLowerCase())) words.pop()
  const compactWords = words.length > maxWords ? words.slice(0, maxWords) : words
  while (compactWords.length > 1 && weakTailWords.has(compactWords[compactWords.length - 1].toLowerCase())) compactWords.pop()
  return sentenceCase(compactWords.join(' ').replace(/[,;:]+$/g, ''))
}

export function sequenceAnimaticReferenceName(entity: LooseRecord, fallback = 'Reference') {
  const name = readText(entity.name) || readText(entity.title) || readText(entity.label)
  if (name) return name
  const variantLabel = readText(entity.selectedReferenceVariantLabel)
  if (variantLabel) return variantLabel
  const role = readText(entity.role) || readText(entity.type) || readText(entity.selectedReferenceVariantKey)
  return role ? titleFromRefLike(role) : fallback
}

export function sequenceAnimaticReferenceVisual(entity: LooseRecord, maxWords = 18) {
  const metadata = asRecord(entity.metadata)
  const visual = readText(entity.visualDescription)
    || readText(asRecord(entity.visual).description)
    || readText(metadata.visualDescription)
    || readText(asRecord(metadata.visual).description)
    || readText(entity.selectedReferenceVariantSummary)
    || readText(entity.summary)
    || readText(entity.context)
  const compact = compactReferenceSentence(visual, maxWords)
  return compact === 'The visual continuity stays clear.' ? '' : compact
}

export function sequenceAnimaticReferenceRole(entity: LooseRecord) {
  const fields = [
    entity.role,
    entity.type,
    entity.selectedReferenceVariantKey,
    entity.selectedReferenceVariantType,
    entity.key,
    entity.name,
  ].map(readText).join(' ').toLowerCase()
  if (fields.includes('coverage_anchor') && !fields.includes('coverage_anchor_dependency')) return 'coverage_anchor'
  if (fields.includes('previous_keyframe')) return 'previous_keyframe'
  if (fields.includes('storyboard_panel')) return 'storyboard_panel'
  if (fields.includes('viewpoint')) return 'viewpoint_reference'
  if (fields.includes('location_spot') || /\bspot\b/.test(fields)) return 'spot_reference'
  if (fields.includes('location_zone') || /\bzone\b/.test(fields)) return 'zone_reference'
  if (fields.includes('location_set') || /\bset\b/.test(fields)) return 'set_reference'
  if (fields.includes('temporary_character') || fields.includes('temp_character')) return 'temp_character_reference'
  if (fields.includes('prop') || fields.includes('item')) return 'prop_reference'
  if (fields.includes('character') || fields.includes('cast') || fields.includes('attendant')) return 'character_reference'
  if (fields.includes('coverage_anchor_dependency') || fields.includes('location') || fields.includes('environment') || fields.includes('continuity_asset')) return 'location_reference'
  return 'entity_reference'
}

export function sequenceAnimaticReferenceGuidance(role: string) {
  if (role === 'coverage_anchor') return 'composition lock: match camera, framing, screen direction, subject placement, horizon, and background massing; do not copy labels, arrows, placeholder figures, or blockout styling'
  if (role === 'previous_keyframe') return 'same-setup motion continuity and established state only'
  if (role === 'storyboard_panel') return 'loose composition only when it does not conflict with the coverage anchor'
  if (role === 'spot_reference' || role === 'zone_reference' || role === 'set_reference' || role === 'viewpoint_reference' || role === 'location_reference') {
    return 'location geometry, materials, weather, lighting logic, and geography'
  }
  if (role === 'prop_reference') return 'prop shape, scale, material, and visible condition'
  if (role === 'temp_character_reference') return 'temporary character/group silhouette, wardrobe, scale, and readable role'
  if (role === 'character_reference') return 'identity, face, wardrobe, silhouette, and scale'
  return 'visual identity and continuity'
}

function sequenceAnimaticReferencePriority(entity: LooseRecord, index: number) {
  const role = sequenceAnimaticReferenceRole(entity)
  const priority = role === 'coverage_anchor' ? 0
    : role === 'previous_keyframe' ? 10
      : role === 'spot_reference' || role === 'viewpoint_reference' ? 20
        : role === 'zone_reference' ? 21
          : role === 'set_reference' || role === 'location_reference' ? 22
            : role === 'character_reference' ? 30
              : role === 'temp_character_reference' ? 31
                : role === 'prop_reference' ? 40
                  : role === 'storyboard_panel' ? 90
                    : 50
  return priority * 1000 + index
}

export function orderSequenceAnimaticAssetPackReferences(assetPack: LooseRecord) {
  const entities = readArray(assetPack.entities).map(asRecord)
  const orderedEntities = entities
    .map((entity, index) => ({ entity, order: sequenceAnimaticReferencePriority(entity, index) }))
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.entity)
  return {
    ...assetPack,
    entities: orderedEntities,
    selectedEntityKeys: orderedEntities.map((entity) => readText(entity.key)).filter(Boolean),
  }
}

export function sequenceAnimaticReferenceManifestEntries(assetPack: LooseRecord) {
  return readArray(assetPack.entities).map(asRecord).map((entity, index) => {
    const role = sequenceAnimaticReferenceRole(entity)
    const visual = sequenceAnimaticReferenceVisual(entity)
    const assetKey = readText(entity.primaryAssetKey) || readText(entity.selectedReferenceAssetKey) || readStringArray(entity.assetKeys)[0] || ''
    const label = sequenceAnimaticReferenceName(entity, `Image ${index + 1}`)
    const guidance = sequenceAnimaticReferenceGuidance(role)
    const line = `@Image${index + 1} = ${label}: ${guidance}${visual ? ` (${visual.replace(/\.$/, '')})` : ''}.`
    return {
      index: index + 1,
      imageTag: `@Image${index + 1}`,
      label,
      role,
      guidance,
      visualDescription: visual,
      assetKey,
      line,
    }
  }).filter((entry) => entry.assetKey)
}

export function sequenceAnimaticReferenceManifestText(assetPack: LooseRecord) {
  return sequenceAnimaticReferenceManifestEntries(assetPack).map((entry) => entry.line).join('\n')
}

export function sequenceAnimaticReferenceManifestTextFromRecords(records: SequenceAnimaticReferenceRecord[]) {
  return records
    .map((record, index) => `@Image${index + 1} = ${readText(record.label) || titleFromRefLike(readText(record.role) || 'reference')}.`)
    .join('\n')
}

export function sequenceAnimaticAssetPackReferenceRecord(entity: LooseRecord) {
  const role = sequenceAnimaticReferenceRole(entity)
  const name = sequenceAnimaticReferenceName(entity)
  const visual = sequenceAnimaticReferenceVisual(entity, 14)
  return {
    label: `${name}: ${sequenceAnimaticReferenceGuidance(role)}${visual ? ` (${visual.replace(/\.$/, '')})` : ''}`,
    role,
  }
}
