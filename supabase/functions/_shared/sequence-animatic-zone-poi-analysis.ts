import { z } from 'zod'

export type ZonePoiAnalysisRunner = <TValue>(input: {
  nodeKey: string
  schemaName: string
  schema: z.ZodType<TValue>
  instructions: string
  input: Array<Record<string, unknown>>
  fallback: TValue
  maxOutputTokens?: number
}) => Promise<{
  value: TValue
  provider: string
  model: string
  providerRequestId?: string | null
  fallbackUsed?: boolean
  fallbackReason?: string
}>

type SupabaseStorageClient = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl?: (path: string, expiresIn: number) => Promise<{ data: unknown; error: { message: string } | null }>
      download: (path: string) => Promise<{ data: { arrayBuffer: () => Promise<ArrayBuffer> } | null; error: { message: string } | null }>
    }
  }
}

export const sequenceAnimaticZonePoiAnchorSchema = z.object({
  spotId: z.string().min(1),
  label: z.string().default(''),
  matchedText: z.string().default(''),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  normalizedX: z.number().min(0).max(1),
  normalizedY: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidence: z.string().default(''),
  source: z.literal('zone_image_text_vision').default('zone_image_text_vision'),
})

export const sequenceAnimaticZonePoiAnalysisSchema = z.object({
  status: z.enum(['ready', 'partial', 'missing', 'failed']).default('missing'),
  analyzedAt: z.string().default(''),
  provider: z.string().default(''),
  model: z.string().default(''),
  providerRequestId: z.string().nullable().default(null),
  sourceAssetKey: z.string().nullable().default(null),
  sourceStoragePath: z.string().nullable().default(null),
  targetNodeId: z.string().default(''),
  candidateCount: z.number().int().nonnegative().default(0),
  foundCount: z.number().int().nonnegative().default(0),
  anchors: z.array(sequenceAnimaticZonePoiAnchorSchema).default([]),
  unmatchedSpotIds: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

const zonePoiVisionResponseSchema = z.object({
  spots: z.array(z.object({
    spotId: z.string().default(''),
    matchedText: z.string().default(''),
    labelVisible: z.boolean().default(false),
    confidence: z.number().default(0),
    x: z.number().default(0.5),
    y: z.number().default(0.5),
    evidence: z.string().default(''),
  })).default([]),
  unmatchedSpotIds: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
})

export type SequenceAnimaticZonePoiAnalysis = z.infer<typeof sequenceAnimaticZonePoiAnalysisSchema>

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function normalizeLooseLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(label|marker|poi|point|spot|viewpoint|angle)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeCoordinate(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0.5
  if (numeric > 1 && numeric <= 100) return Math.max(0, Math.min(1, numeric / 100))
  return Math.max(0, Math.min(1, numeric))
}

function normalizeConfidence(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  if (numeric > 1 && numeric <= 100) return Math.max(0, Math.min(1, numeric / 100))
  return Math.max(0, Math.min(1, numeric))
}

function compactLine(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return normalized.slice(0, maxLength).replace(/\s+\S*$/, '').trim()
}

function continuityNodeParentId(node: Record<string, unknown>) {
  return readText(node.parentId)
    || readText(node.parent_id)
    || readText(node.zoneId)
    || readText(node.zone_id)
    || readText(node.setId)
    || readText(node.set_id)
    || readText(node.worldLocationRefId)
    || readText(node.world_location_ref_id)
}

function continuityNodeKind(node: Record<string, unknown>) {
  return readText(node.assetKind ?? node.asset_kind ?? node.nodeKind ?? node.node_kind ?? node.kind ?? node.type)
}

function collectRecords(value: unknown, keys: readonly string[]) {
  const root = asRecord(value)
  return keys.flatMap((key) => readArray(root[key]).map(asRecord))
}

export function collectSequenceAnimaticZonePoiCandidates(input: {
  zoneNodeId: string
  continuityPack?: unknown
  graphNodes?: readonly Record<string, unknown>[]
}) {
  const zoneId = readText(input.zoneNodeId)
  if (!zoneId) return []
  const pack = asRecord(input.continuityPack)
  const continuityGraph = asRecord(pack.continuityGraphV2 ?? pack.continuity_graph_v2)
  const sceneGraph = asRecord(pack.sceneGraph ?? pack.scene_graph)
  const graphNodes = [
    ...(input.graphNodes ?? []),
    ...collectRecords(continuityGraph, ['spots', 'viewpoints', 'angles']),
    ...collectRecords(sceneGraph, ['spots', 'viewpoints', 'angles']),
    ...collectRecords(pack, ['locationSets', 'location_sets', 'locationAngles', 'location_angles']),
  ]
  const seen = new Set<string>()
  return graphNodes
    .filter((node) => continuityNodeParentId(node) === zoneId)
    .filter((node) => {
      const kind = continuityNodeKind(node)
      return !kind || ['spot', 'location_spot', 'viewpoint', 'location_viewpoint', 'angle', 'location_angle'].includes(kind)
    })
    .map((node) => {
      const id = readText(node.id)
      const label = readText(node.name) || readText(node.title) || id
      const visualBrief = readText(node.visualBrief ?? node.visual_brief ?? node.summary ?? node.description)
      return { id, label, visualBrief }
    })
    .filter((candidate) => {
      if (!candidate.id || !candidate.label || seen.has(candidate.id)) return false
      seen.add(candidate.id)
      return true
    })
    .slice(0, 16)
}

function candidateTextMatches(candidate: { id: string; label: string }, text: string) {
  const normalized = normalizeLooseLabel(text)
  if (!normalized) return false
  const candidateKeys = [
    normalizeLooseLabel(candidate.id),
    normalizeLooseLabel(candidate.label),
  ].filter(Boolean)
  return candidateKeys.some((key) => (
    normalized === key
    || (key.length >= 4 && normalized.includes(key))
    || (normalized.length >= 4 && key.includes(normalized))
  ))
}

function resolvePoiCandidate(input: {
  candidates: readonly { id: string; label: string }[]
  spotId: string
  matchedText: string
}) {
  const direct = input.candidates.find((candidate) => candidate.id === input.spotId)
  if (direct) return { candidate: direct, matchedByText: false }

  const numericIndex = Number(input.spotId)
  if (Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= input.candidates.length) {
    return { candidate: input.candidates[numericIndex - 1], matchedByText: false }
  }

  const candidateMatches = input.candidates.filter((candidate) => (
    candidateTextMatches(candidate, input.spotId)
    || candidateTextMatches(candidate, input.matchedText)
  ))
  return candidateMatches.length === 1
    ? { candidate: candidateMatches[0], matchedByText: true }
    : { candidate: null, matchedByText: false }
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }
  return `data:${mimeType || 'image/webp'};base64,${btoa(binary)}`
}

export async function projectAssetReferenceUrlForPoiAnalysis(input: {
  client: SupabaseStorageClient
  storagePath: string
  mimeType?: string
}) {
  const storagePath = readText(input.storagePath)
  if (!storagePath) throw new Error('Zone POI analysis requires a storage path.')
  const bucket = input.client.storage.from('project-assets')
  if (typeof bucket.createSignedUrl === 'function') {
    const signed = await bucket.createSignedUrl(storagePath, 60 * 60)
    const data = asRecord(signed.data)
    const signedUrl = readText(data.signedUrl) || readText(data.signedURL)
    if (!signed.error && signedUrl) return signedUrl
  }
  const downloaded = await bucket.download(storagePath)
  if (downloaded.error || !downloaded.data) throw new Error(downloaded.error?.message ?? `Project asset ${storagePath} could not be downloaded.`)
  return bytesToDataUrl(new Uint8Array(await downloaded.data.arrayBuffer()), input.mimeType || 'image/webp')
}

export function failedSequenceAnimaticZonePoiAnalysis(input: {
  targetNodeId: string
  sourceAssetKey?: string | null
  sourceStoragePath?: string | null
  error: unknown
}): SequenceAnimaticZonePoiAnalysis {
  const message = input.error instanceof Error ? input.error.message : String(input.error || 'Zone label analysis failed.')
  return sequenceAnimaticZonePoiAnalysisSchema.parse({
    status: 'failed',
    analyzedAt: new Date().toISOString(),
    provider: 'graphcore',
    model: 'zone-poi-analysis-failure-v1',
    sourceAssetKey: input.sourceAssetKey ?? null,
    sourceStoragePath: input.sourceStoragePath ?? null,
    targetNodeId: input.targetNodeId,
    candidateCount: 0,
    foundCount: 0,
    anchors: [],
    unmatchedSpotIds: [],
    diagnostics: [message],
  })
}

export async function analyzeSequenceAnimaticZonePoiLabels(input: {
  client: SupabaseStorageClient
  runVisionStructuredNode: ZonePoiAnalysisRunner
  targetNodeId: string
  targetNode?: Record<string, unknown>
  continuityPack?: unknown
  graphNodes?: readonly Record<string, unknown>[]
  image: {
    assetKey?: string | null
    storagePath: string
    mimeType?: string | null
  }
}) {
  const targetNodeId = readText(input.targetNodeId)
  const sourceStoragePath = readText(input.image.storagePath)
  const sourceAssetKey = readText(input.image.assetKey)
  const candidates = collectSequenceAnimaticZonePoiCandidates({
    zoneNodeId: targetNodeId,
    continuityPack: input.continuityPack,
    graphNodes: input.graphNodes,
  })
  if (!targetNodeId || !sourceStoragePath) {
    return failedSequenceAnimaticZonePoiAnalysis({
      targetNodeId,
      sourceAssetKey,
      sourceStoragePath,
      error: 'Zone POI analysis requires a target node id and image storage path.',
    })
  }
  if (candidates.length === 0) {
    return sequenceAnimaticZonePoiAnalysisSchema.parse({
      status: 'missing',
      analyzedAt: new Date().toISOString(),
      provider: 'graphcore',
      model: 'zone-poi-no-candidates-v1',
      sourceAssetKey: sourceAssetKey || null,
      sourceStoragePath,
      targetNodeId,
      candidateCount: 0,
      foundCount: 0,
      anchors: [],
      unmatchedSpotIds: [],
      diagnostics: ['No child spots/viewpoints were available for OCR label matching.'],
    })
  }

  const imageUrl = await projectAssetReferenceUrlForPoiAnalysis({
    client: input.client,
    storagePath: sourceStoragePath,
    mimeType: readText(input.image.mimeType) || 'image/webp',
  })
  const candidateLines = candidates.map((candidate, index) => (
    `${index + 1}. spotId=${candidate.id}; label="${candidate.label}"; visual brief="${compactLine(candidate.visualBrief)}"`
  ))
  const zoneName = readText(input.targetNode?.name) || readText(input.targetNode?.title) || targetNodeId
  const instructions = [
    'You analyze production map images for readable baked-in spot labels.',
    'Return coordinates only when visible text in the image can be read and confidently mapped to a supplied candidate spotId.',
    'For every match, copy the exact internal spotId from the candidate list. Do not invent a new spotId from the visible text.',
    'Use the coordinate at the center of the visible text label or its attached marker/callout.',
    'Do not infer a spot from geometry, path layout, room shape, approximate expected location, or the candidate description.',
    'If a label is unreadable, ambiguous, missing, or not clearly one of the candidates, omit that spot and put its spotId in unmatchedSpotIds.',
    'Coordinates must be normalized image coordinates from 0 to 1, where x=0 is left and y=0 is top.',
    'If you return coordinates as 0-100 percentages by mistake, keep the same numeric values and the system will normalize them.',
  ].join('\n')
  const prompt = [
    `Zone: ${zoneName}`,
    'Candidate spot labels:',
    ...candidateLines,
    '',
    'Find only baked text labels in the supplied image. Match exact names first, then obvious abbreviations only when unambiguous.',
  ].join('\n')
  const response = await input.runVisionStructuredNode({
    nodeKey: 'sequence_animatic_zone_poi_label_analysis',
    schemaName: 'sequence_animatic_zone_poi_label_analysis',
    schema: zonePoiVisionResponseSchema,
    instructions,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: prompt },
        { type: 'input_image', image_url: imageUrl },
      ],
    }],
    fallback: { spots: [], unmatchedSpotIds: candidates.map((candidate) => candidate.id), notes: ['Provider fallback returned no OCR anchors.'] },
    maxOutputTokens: 2200,
  })
  const used = new Set<string>()
  const anchors = response.value.spots
    .map((entry) => {
      const matchedText = readText(entry.matchedText)
      const resolved = resolvePoiCandidate({
        candidates,
        spotId: readText(entry.spotId),
        matchedText,
      })
      const confidence = normalizeConfidence(entry.confidence)
      const visibleTextMatchesCandidate = Boolean(resolved.candidate && matchedText && candidateTextMatches(resolved.candidate, matchedText))
      const labelVisible = entry.labelVisible || Boolean(matchedText)
      if (
        !resolved.candidate
        || used.has(resolved.candidate.id)
        || !labelVisible
        || (confidence < 0.55 && !(confidence >= 0.35 && visibleTextMatchesCandidate))
      ) {
        return null
      }
      used.add(resolved.candidate.id)
      const normalizedX = normalizeCoordinate(entry.x)
      const normalizedY = normalizeCoordinate(entry.y)
      return sequenceAnimaticZonePoiAnchorSchema.parse({
        spotId: resolved.candidate.id,
        label: resolved.candidate.label,
        matchedText,
        x: Math.round(normalizedX * 1000) / 10,
        y: Math.round(normalizedY * 1000) / 10,
        normalizedX,
        normalizedY,
        confidence,
        evidence: entry.evidence,
        source: 'zone_image_text_vision',
      })
    })
    .filter((anchor): anchor is z.infer<typeof sequenceAnimaticZonePoiAnchorSchema> => Boolean(anchor))
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate] as const))
  const unmatchedSpotIds = [...new Set([
    ...candidates.map((candidate) => candidate.id).filter((id) => !used.has(id)),
    ...response.value.unmatchedSpotIds.filter((id) => candidateById.has(id) && !used.has(id)),
  ])]
  return sequenceAnimaticZonePoiAnalysisSchema.parse({
    status: anchors.length === 0 ? 'missing' : anchors.length >= candidates.length ? 'ready' : 'partial',
    analyzedAt: new Date().toISOString(),
    provider: response.provider,
    model: response.model,
    providerRequestId: response.providerRequestId ?? null,
    sourceAssetKey: sourceAssetKey || null,
    sourceStoragePath,
    targetNodeId,
    candidateCount: candidates.length,
    foundCount: anchors.length,
    anchors,
    unmatchedSpotIds,
    diagnostics: [
      `Vision returned ${response.value.spots.length} raw label candidate${response.value.spots.length === 1 ? '' : 's'}; accepted ${anchors.length}.`,
      ...response.value.notes,
      ...(response.fallbackUsed ? [response.fallbackReason || 'Vision analysis used fallback.'] : []),
    ].map(readText).filter(Boolean),
  })
}

export function readZonePoiAnchorsFromState(state: unknown) {
  const record = asRecord(state)
  return readArray(record.zoneImagePoiAnchors ?? record.zone_image_poi_anchors)
    .map((entry) => sequenceAnimaticZonePoiAnchorSchema.safeParse(entry))
    .filter((entry): entry is z.ZodSafeParseSuccess<z.infer<typeof sequenceAnimaticZonePoiAnchorSchema>> => entry.success)
    .map((entry) => entry.data)
}

export function mergeZonePoiAnalysisIntoAssetState(input: {
  assetState: Record<string, unknown>
  analysis: SequenceAnimaticZonePoiAnalysis
}) {
  return {
    ...input.assetState,
    zoneImagePoiAnalysis: input.analysis,
    zone_image_poi_analysis: input.analysis,
    zoneImagePoiAnchors: input.analysis.anchors,
    zone_image_poi_anchors: input.analysis.anchors,
  }
}

export function collectGraphNodesFromContinuityPack(pack: unknown) {
  const record = asRecord(pack)
  const continuityGraph = asRecord(record.continuityGraphV2 ?? record.continuity_graph_v2)
  const sceneGraph = asRecord(record.sceneGraph ?? record.scene_graph)
  return [
    ...collectRecords(continuityGraph, ['sets', 'zones', 'spots', 'viewpoints', 'angles']),
    ...collectRecords(sceneGraph, ['sets', 'zones', 'spots', 'viewpoints', 'angles']),
    ...collectRecords(record, ['locationSets', 'location_sets', 'locationAngles', 'location_angles']),
  ]
}

export function zonePoiLinesFromAnalysis(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  if (!parsed.success) return []
  return parsed.data.anchors.map((anchor) => `${anchor.label}: image text "${anchor.matchedText}" at ${anchor.x}%, ${anchor.y}% (${Math.round(anchor.confidence * 100)}%)`)
}

export function readZonePoiDiagnostics(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? parsed.data.diagnostics : []
}

export function readZonePoiStatus(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? parsed.data.status : ''
}

export function readZonePoiUnmatchedSpotIds(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? parsed.data.unmatchedSpotIds : []
}

export function zonePoiCandidateIdsForPack(input: { zoneNodeId: string; continuityPack?: unknown }) {
  return collectSequenceAnimaticZonePoiCandidates(input).map((candidate) => candidate.id)
}

export function readZonePoiAnalysisSourceAssetKey(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? parsed.data.sourceAssetKey : ''
}

export function readZonePoiAnalysisSourceStoragePath(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? parsed.data.sourceStoragePath : ''
}

export function zonePoiAnalysisCandidateSummary(input: { zoneNodeId: string; continuityPack?: unknown }) {
  return collectSequenceAnimaticZonePoiCandidates(input)
    .map((candidate) => `${candidate.label} (${candidate.id})`)
    .join(', ')
}

export function readZonePoiAnchorSpotIds(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? parsed.data.anchors.map((anchor) => anchor.spotId) : []
}

export function readZonePoiAnalysisFoundCount(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? parsed.data.foundCount : 0
}

export function readZonePoiAnalysisCandidateCount(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? parsed.data.candidateCount : 0
}

export function readZonePoiAnalysisAnalyzedAt(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? parsed.data.analyzedAt : ''
}

export function isZonePoiAnalysisReadyOrPartial(analysis: unknown) {
  const status = readZonePoiStatus(analysis)
  return status === 'ready' || status === 'partial'
}

export function readZonePoiAnalysisProviderRequestId(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? parsed.data.providerRequestId : null
}

export function readZonePoiAnalysisProviderModel(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? `${parsed.data.provider}:${parsed.data.model}` : ''
}

export function readZonePoiAnalysisMatchedLabels(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  return parsed.success ? parsed.data.anchors.map((anchor) => anchor.matchedText).filter(Boolean) : []
}

export function readZonePoiAnalysisLabelSummary(analysis: unknown) {
  const parsed = sequenceAnimaticZonePoiAnalysisSchema.safeParse(analysis)
  if (!parsed.success) return ''
  return `${parsed.data.foundCount}/${parsed.data.candidateCount} labels matched`
}
