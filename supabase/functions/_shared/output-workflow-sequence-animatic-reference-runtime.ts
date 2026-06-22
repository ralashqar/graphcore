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
  if (fields.includes('spot_camera_grid') || fields.includes('camera_grid') || fields.includes('camera grid') || fields.includes('angle_coverage')) return 'camera_grid_reference'
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
  if (role === 'camera_grid_reference') return 'spot camera-angle coverage: choose angle vocabulary, screen direction, and framing options; do not reproduce grid cells'
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
      : role === 'camera_grid_reference' ? 19
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

function compactSequenceAnimaticText(value: unknown, maxLength = 900) {
  const text = readText(value).replace(/\s+/g, ' ')
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text
}

function selectedReferenceVariantAssetKeyForEntity(entity: LooseRecord) {
  const metadata = asRecord(entity.metadata)
  return readText(metadata.selectedReferenceVariantAssetKey)
    || readText(entity.selectedReferenceVariantAssetKey)
}

function sortReferenceValuesWithPrimary(values: string[], primary: string) {
  const unique = [...new Set(values.map(readText).filter(Boolean))]
  if (!primary) return unique
  return [primary, ...unique.filter((value) => value !== primary)]
}

function directReferenceEntityForAssetKey(assetKey: string, index: number, role = 'continuity_reference'): LooseRecord {
  return {
    key: `direct_ref_${index + 1}_${normalizeSequenceAnimaticReferenceKey(assetKey)}`,
    name: `Reference ${index + 1}`,
    type: 'continuity_asset',
    role,
    summary: 'Selected visual reference for this generated image.',
    visualDescription: 'Use the attached reference to preserve identity, spatial layout, materials, lighting, and style continuity.',
    assetKeys: [assetKey],
    primaryAssetKey: assetKey,
    selectedReferenceAssetKey: assetKey,
    selectedReferenceVariantKey: 'selected_reference',
    selectedReferenceVariantLabel: `Reference ${index + 1}`,
    selectedReferenceVariantType: 'continuity_asset',
    referenceSelectionReason: 'Selected by the sequence animatic visual reference plan.',
  }
}

function cloneSequenceAnimaticAssetPackEntity(entity: LooseRecord, maxAssetKeys = 2): LooseRecord {
  const selectedReferenceVariantAssetKey = selectedReferenceVariantAssetKeyForEntity(entity)
  const primaryAssetKey = readText(entity.primaryAssetKey) || selectedReferenceVariantAssetKey
  return {
    ...entity,
    primaryAssetKey: primaryAssetKey || readStringArray(entity.assetKeys)[0] || '',
    assetKeys: sortReferenceValuesWithPrimary(readStringArray(entity.assetKeys), primaryAssetKey || selectedReferenceVariantAssetKey)
      .slice(0, Math.max(1, maxAssetKeys)),
  }
}

export function scopeAssetPackToReferenceAssetKeys(input: {
  assetPack: LooseRecord
  referenceAssetKeys: string[]
  fallbackEntities?: LooseRecord[]
  referenceScope: string
  limit?: number
}) {
  const referenceAssetKeys = [...new Set(input.referenceAssetKeys.map(readText).filter(Boolean))].slice(0, Math.max(1, input.limit ?? 8))
  const fallbackEntities = (input.fallbackEntities ?? []).map(asRecord)
  if (referenceAssetKeys.length === 0) {
    const spatialOnly = input.referenceScope === 'sequence_animatic_spatial_continuity_only'
    return {
      ...input.assetPack,
      entities: fallbackEntities.length > 0 ? fallbackEntities : spatialOnly ? [] : readArray(input.assetPack.entities).map(asRecord),
      scopedReferenceAssetKeys: [],
      referenceScope: input.referenceScope,
      referenceDiagnostics: [
        ...readStringArray(input.assetPack.referenceDiagnostics),
        ...(spatialOnly ? ['Spatial continuity scope has no ready image references; full animatic asset pack was intentionally excluded.'] : []),
      ],
    }
  }
  const sourceEntities = [...readArray(input.assetPack.entities).map(asRecord), ...fallbackEntities]
  const entities: LooseRecord[] = referenceAssetKeys.map((assetKey, index) => {
    const source = sourceEntities.find((entity) => {
      const keys = [
        readText(entity.primaryAssetKey),
        readText(entity.selectedReferenceAssetKey),
        readText(entity.selectedReferenceVariantAssetKey),
        ...readStringArray(entity.assetKeys),
      ].filter(Boolean)
      return keys.includes(assetKey)
    })
    if (!source) return directReferenceEntityForAssetKey(assetKey, index)
    const cloned = cloneSequenceAnimaticAssetPackEntity(source, 1)
    return {
      ...cloned,
      primaryAssetKey: assetKey,
      selectedReferenceAssetKey: assetKey,
      assetKeys: [assetKey],
      referenceSelectionReason: readText(cloned.referenceSelectionReason) || 'Selected by the sequence animatic visual reference plan.',
    }
  })
  return {
    ...input.assetPack,
    entities,
    selectedEntityKeys: entities.map((entity) => readText(entity.key)).filter(Boolean),
    scopedReferenceAssetKeys: referenceAssetKeys,
    referenceScope: input.referenceScope,
    referenceDiagnostics: readStringArray(input.assetPack.referenceDiagnostics),
  }
}

function sequenceAnimaticEntityAssetKeys(entity: LooseRecord, assets: LooseRecord[]) {
  const metadata = asRecord(entity.metadata)
  const referenceVariants = Array.isArray(metadata.referenceVariants)
    ? metadata.referenceVariants.map(asRecord)
    : Array.isArray(entity.referenceVariants)
      ? entity.referenceVariants.map(asRecord)
      : []
  const selectedReferenceVariantAssetKey = selectedReferenceVariantAssetKeyForEntity(entity)
  const variantAssetKeys = referenceVariants
    .map((variant) => readText(variant.assetKey))
    .filter(Boolean)
  const keys = [
    selectedReferenceVariantAssetKey,
    readText(metadata.referenceSheetAssetKey),
    ...readStringArray(metadata.referenceSheetAssetKeys),
    ...variantAssetKeys,
    readText(metadata.referenceSheetUrl),
    readText(metadata.referenceSheetImageUrl),
    readText(metadata.referenceSheetStoragePath),
    readText(metadata.imageUrl),
    readText(metadata.image_url),
    readText(metadata.sourceUrl),
    readText(metadata.sourceAssetUrl),
    readText(entity.imageUrl),
    readText(entity.image_url),
    readText(entity.sourceUrl),
    readText(entity.source_url),
    readText(entity.thumbnailAssetKey),
    readText(entity.thumbnail_asset_key),
    readText(metadata.brandAtlasAssetKey),
    readText(metadata.assetKey),
    readText(metadata.storagePath),
  ].filter(Boolean)
  const matching = assets
    .filter((asset) => keys.includes(readText(asset.key)))
    .map((asset) => readText(asset.key))
  return [...new Set([...keys, ...matching])].filter(Boolean)
}

function compactSequenceAnimaticCamera(shot: LooseRecord) {
  const camera = asRecord(shot.camera)
  return {
    framing: compactSequenceAnimaticText(camera.framing ?? shot.framing, 220),
    angle: compactSequenceAnimaticText(camera.angle ?? shot.cameraAngle, 220),
    movement: compactSequenceAnimaticText(camera.movement ?? shot.cameraMovement, 260),
  }
}

function compactSequenceAnimaticReferenceEntry(entity: LooseRecord, assets: LooseRecord[], source: string) {
  const metadata = asRecord(entity.metadata)
  const key = readText(entity.key)
  const type = readText(entity.type) || readText(entity.role) || readText(entity.nodeType ?? entity.node_type)
  const selectedReferenceVariantAssetKey = selectedReferenceVariantAssetKeyForEntity(entity)
  const packedAssetKeys = [
    readText(entity.primaryAssetKey),
    selectedReferenceVariantAssetKey,
    ...readStringArray(entity.assetKeys),
  ].filter(Boolean)
  const worldAssetKeys = sequenceAnimaticEntityAssetKeys(entity, assets)
  return {
    key,
    name: sequenceAnimaticReferenceName(entity, key || 'Reference'),
    type,
    aliases: [...new Set([
      ...readStringArray(entity.aliases),
      ...readStringArray(metadata.aliases),
    ])].filter(Boolean),
    summary: compactSequenceAnimaticText(readText(entity.summary) || readText(entity.context), 700),
    visualSummary: compactSequenceAnimaticText(sequenceAnimaticReferenceVisual(entity, 60), 700),
    assetKeys: [...new Set([...packedAssetKeys, ...worldAssetKeys])].filter(Boolean).slice(0, 8),
    referenceRole: type || readText(entity.referenceRole) || 'entity',
    source,
  }
}

function mergeSequenceAnimaticReferenceCatalogEntries(entries: LooseRecord[]) {
  const byKey = new Map<string, LooseRecord>()
  for (const entry of entries) {
    const key = readText(entry.key)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, entry)
      continue
    }
    byKey.set(key, {
      ...existing,
      ...entry,
      name: readText(existing.name) || readText(entry.name),
      type: readText(existing.type) || readText(entry.type),
      summary: readText(existing.summary) || readText(entry.summary),
      visualSummary: readText(existing.visualSummary) || readText(entry.visualSummary),
      aliases: [...new Set([...readStringArray(existing.aliases), ...readStringArray(entry.aliases)])].filter(Boolean),
      assetKeys: [...new Set([...readStringArray(existing.assetKeys), ...readStringArray(entry.assetKeys)])].filter(Boolean).slice(0, 8),
      source: [...new Set([readText(existing.source), readText(entry.source)].filter(Boolean))].join('+'),
    })
  }
  return [...byKey.values()]
}

export function buildSequenceAnimaticReferenceCatalog(input: {
  context?: LooseRecord
  assetPack: LooseRecord
}) {
  const context = asRecord(input.context)
  const assets = readArray(context.assets).map(asRecord)
  const contextEntries = readArray(context.entities)
    .map(asRecord)
    .map((entity) => compactSequenceAnimaticReferenceEntry(entity, assets, 'world_context'))
  const assetPackEntries = readArray(input.assetPack.entities)
    .map(asRecord)
    .map((entity) => compactSequenceAnimaticReferenceEntry(entity, assets, 'selected_asset_pack'))
  return mergeSequenceAnimaticReferenceCatalogEntries([...contextEntries, ...assetPackEntries])
}

export function sequenceAnimaticReferenceCatalog(input: {
  animaticReferenceCatalog?: unknown
  assetPack: LooseRecord
}) {
  const catalog = readArray(input.animaticReferenceCatalog).map(asRecord)
  return catalog.length > 0
    ? catalog
    : buildSequenceAnimaticReferenceCatalog({ assetPack: input.assetPack })
}

function normalizeSequenceAnimaticReferenceKey(value: unknown) {
  return readText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

const sequenceAnimaticReferenceAliasStopwords = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
])

function sequenceAnimaticReferenceIsCharacterLike(entry: LooseRecord) {
  const type = normalizeSequenceAnimaticReferenceKey([
    readText(entry.type),
    readText(entry.referenceRole),
    readText(entry.nodeType),
  ].filter(Boolean).join(' '))
  return /\b(actor|character|cast|person|persona|protagonist|antagonist)\b/.test(type)
}

function sequenceAnimaticReferenceAliasCandidates(entry: LooseRecord) {
  const rawValues = [
    readText(entry.key),
    readText(entry.key).replace(/_/g, ' '),
    readText(entry.name),
    readText(entry.label),
    ...readStringArray(entry.aliases),
  ].filter(Boolean)
  const candidates = new Set<string>()
  for (const value of rawValues) {
    const normalized = normalizeSequenceAnimaticReferenceKey(value)
    if (normalized) candidates.add(normalized)
  }

  if (sequenceAnimaticReferenceIsCharacterLike(entry)) {
    for (const value of rawValues) {
      const parts = normalizeSequenceAnimaticReferenceKey(value)
        .split('_')
        .filter((part) => part.length >= 3 && !sequenceAnimaticReferenceAliasStopwords.has(part))
      if (parts.length >= 2) {
        candidates.add(parts[0])
        candidates.add(parts[parts.length - 1])
      }
    }
  }

  return [...candidates]
}

function buildSequenceAnimaticReferenceLookup(catalog: LooseRecord[]) {
  const byKey = new Map<string, LooseRecord>()
  const byAlias = new Map<string, LooseRecord>()
  for (const entry of catalog) {
    const key = readText(entry.key)
    if (key) byKey.set(key, entry)
    for (const normalized of sequenceAnimaticReferenceAliasCandidates(entry)) {
      if (normalized && !byAlias.has(normalized)) byAlias.set(normalized, entry)
    }
  }
  return { byKey, byAlias }
}

function compactResolvedSequenceAnimaticReference(entry: LooseRecord) {
  return {
    key: readText(entry.key),
    name: readText(entry.name) || readText(entry.key),
    type: readText(entry.type) || readText(entry.referenceRole),
    aliases: readStringArray(entry.aliases).slice(0, 8),
    summary: compactSequenceAnimaticText(readText(entry.summary), 360),
    visualSummary: compactSequenceAnimaticText(readText(entry.visualSummary), 420),
  }
}

function resolveSequenceAnimaticShotReference(
  refId: string,
  lookup: ReturnType<typeof buildSequenceAnimaticReferenceLookup>,
) {
  if (!refId) return null
  return lookup.byKey.get(refId)
    ?? lookup.byAlias.get(normalizeSequenceAnimaticReferenceKey(refId))
    ?? null
}

function sequenceAnimaticShotStringArray(shot: LooseRecord, fields: string[]) {
  return [...new Set(fields.flatMap((field) => readStringArray(shot[field])).filter(Boolean))]
}

function resolveSequenceAnimaticShotRefs(input: {
  shot: LooseRecord
  shotId: string
  lookup: ReturnType<typeof buildSequenceAnimaticReferenceLookup>
}) {
  const resolveMany = (role: string, values: string[]) => {
    const unresolved: LooseRecord[] = []
    const resolved = values.map((refId) => {
      const entry = resolveSequenceAnimaticShotReference(refId, input.lookup)
      if (!entry) {
        unresolved.push({ shotId: input.shotId, role, refId })
        return null
      }
      return compactResolvedSequenceAnimaticReference(entry)
    }).filter((entry): entry is ReturnType<typeof compactResolvedSequenceAnimaticReference> => Boolean(entry))
    return { resolved, unresolved }
  }
  const visibleCharacters = resolveMany('visible_character', sequenceAnimaticShotStringArray(input.shot, ['visibleCharacterRefIds', 'visible_character_ref_ids', 'characterRefIds', 'character_ref_ids']))
  const speakers = resolveMany('speaker', sequenceAnimaticShotStringArray(input.shot, ['speakerRefIds', 'speaker_ref_ids']))
  const props = resolveMany('prop', sequenceAnimaticShotStringArray(input.shot, ['propRefIds', 'prop_ref_ids']))
  const locationRefId = readText(input.shot.locationRefId) || readText(input.shot.location_ref_id)
  const location = resolveMany('location', locationRefId ? [locationRefId] : [])
  return {
    resolvedRefs: {
      visibleCharacters: visibleCharacters.resolved,
      speakers: speakers.resolved,
      props: props.resolved,
      location: location.resolved[0] ?? null,
    },
    unresolvedRefs: [
      ...visibleCharacters.unresolved,
      ...speakers.unresolved,
      ...props.unresolved,
      ...location.unresolved,
    ],
  }
}

function sequenceAnimaticContinuityPlannerSpatialRecord(shot: LooseRecord) {
  const spatial = { ...asRecord(shot.spatialContinuity ?? shot.spatial_continuity) }
  ;[
    'lighting',
    'lightSource',
    'light_source',
    'lightSourceDirection',
    'light_source_direction',
    'lightingDirection',
    'lighting_direction',
    'lightingQuality',
    'lighting_quality',
    'colorTemperature',
    'color_temperature',
  ].forEach((key) => {
    delete spatial[key]
  })
  return spatial
}

export function buildSequenceAnimaticContinuityPlannerContext(input: {
  screenplayDraft: LooseRecord
  shotPlan: LooseRecord
  shotBreakPlan: LooseRecord
  assetPack: LooseRecord
  animaticReferenceCatalog?: unknown
}) {
  const sourceShots = readArray(input.shotPlan.shots).map(asRecord)
  const sourceBlocks = readArray(input.shotBreakPlan.groups).map(asRecord)
  const existingWorldReferences = sequenceAnimaticReferenceCatalog({
    animaticReferenceCatalog: input.animaticReferenceCatalog,
    assetPack: input.assetPack,
  })
  const referenceLookup = buildSequenceAnimaticReferenceLookup(existingWorldReferences)
  const unresolvedShotRefs: LooseRecord[] = []
  return {
    screenplayBrief: {
      title: readText(input.screenplayDraft.title),
      logline: compactSequenceAnimaticText(input.screenplayDraft.logline ?? input.screenplayDraft.summary ?? input.screenplayDraft.synopsis, 700),
    },
    blocks: sourceBlocks.map((block, index) => ({
      id: readText(block.id) || `cinematic_v3_storyboard_group_${String(index + 1).padStart(3, '0')}`,
      title: readText(block.title) || readText(block.summary),
      shotBreakIds: readStringArray(block.shotBreakIds),
      sourceText: compactSequenceAnimaticText(block.sourceText, 1000),
    })),
    shots: sourceShots.map((shot, index) => ({
      ...(() => {
        const shotId = readText(shot.id) || `shot_${String(index + 1).padStart(3, '0')}`
        const refs = resolveSequenceAnimaticShotRefs({ shot, shotId, lookup: referenceLookup })
        unresolvedShotRefs.push(...refs.unresolvedRefs)
        const shotDescription = compactSequenceAnimaticText(shot.description ?? shot.action ?? shot.caption, 1200)
        return {
          id: shotId,
          title: readText(shot.title),
          description: shotDescription,
          action: shotDescription,
          actionLine: compactSequenceAnimaticText(shot.action ?? shot.caption ?? shot.description, 500),
          camera: compactSequenceAnimaticCamera(shot),
          locationRefId: readText(shot.locationRefId) || readText(shot.location_ref_id),
          worldLocationRefId: readText(shot.worldLocationRefId) || readText(shot.world_location_ref_id) || readText(shot.locationRefId) || readText(shot.location_ref_id),
          continuitySetId: readText(shot.continuitySetId) || readText(shot.continuity_set_id),
          continuityZoneId: readText(shot.continuityZoneId) || readText(shot.continuity_zone_id),
          continuitySpotIds: sequenceAnimaticShotStringArray(shot, ['continuitySpotIds', 'continuity_spot_ids']),
          continuityAngleId: readText(shot.continuityAngleId) || readText(shot.continuity_angle_id),
          spatialContinuity: sequenceAnimaticContinuityPlannerSpatialRecord(shot),
          propRefIds: sequenceAnimaticShotStringArray(shot, ['propRefIds', 'prop_ref_ids']),
          visibleCharacterRefIds: sequenceAnimaticShotStringArray(shot, ['visibleCharacterRefIds', 'visible_character_ref_ids', 'characterRefIds', 'character_ref_ids']),
          speakerRefIds: sequenceAnimaticShotStringArray(shot, ['speakerRefIds', 'speaker_ref_ids']),
          resolvedRefs: refs.resolvedRefs,
          unresolvedRefs: refs.unresolvedRefs,
          dialogue: readArray(shot.dialogue).map(asRecord).map((line) => ({
            speakerRefId: readText(line.speakerRefId) || readText(line.characterRefId),
            speakerName: readText(line.speakerName) || readText(line.speaker),
            text: compactSequenceAnimaticText(line.text, 500),
          })).filter((line) => line.speakerRefId || line.speakerName || line.text),
        }
      })(),
    })),
    existingWorldReferences,
    unresolvedShotRefs,
    diagnostics: unresolvedShotRefs.length > 0
      ? [`${unresolvedShotRefs.length} shot reference${unresolvedShotRefs.length === 1 ? '' : 's'} could not be resolved against the animatic reference catalog.`]
      : [],
  }
}
