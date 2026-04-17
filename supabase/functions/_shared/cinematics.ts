import { createClient } from 'npm:@supabase/supabase-js@2'

import {
  deriveCinematicScriptFromSequence,
  getCinematicCreativeTreatmentLabel,
  getCinematicFormulaFamilyLabel,
  getCinematicFormatSubtypeLabel,
  getCinematicHookFamilyLabel,
  getCinematicNarrationModeLabel,
  getCinematicPresetLabel,
  getCinematicStoryLanguagePresetLabel,
  getCinematicStoryScenePresetLabel,
  cinematicRunJobSchema,
  cinematicRunSchema,
  getAssetRefNodeConfig,
  getCinematicSequence,
  getCompositeRefNodeConfig,
  getCinematicTakeNodeConfig,
  getCinematicSettings,
  getCinematicShotNodeConfig,
  getStoryboardRefNodeConfig,
  parseTakeStoryboardPanelScriptText,
  updateNodeMetadataWithStoryboardRef,
  updateNodeMetadataWithTake,
  updateNodeMetadataWithShot,
  type SeedanceExecutionPlan,
  type CinematicRun,
  type CinematicRunJob,
} from '../../../src/domain/cinematics.ts'
import { buildAssetSlug } from '../../../src/domain/assets.ts'
import {
  getArtStylePresetPromptDirectives,
  getArtStylePresetLabel,
  resolveArtStylePresetForCinematic,
} from '../../../src/domain/artStylePresets.ts'
import { gameSpecSchema } from '../../../src/domain/gameSpec.ts'
import { resolveStoryRuntimeContract } from '../../../src/domain/storyPresetProfiles.ts'

type SnapshotRecord = Record<string, unknown>
type SnapshotGraph = SnapshotRecord & {
  key: string
  name: string
  entryNodeKey?: string | null
  nodes: SnapshotRecord[]
  edges: SnapshotRecord[]
}

type SnapshotNode = SnapshotRecord & {
  key: string
  type: string
  title: string
  body?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

type SnapshotAsset = SnapshotRecord & {
  key: string
  name: string
  kind: string
  mimeType?: string
  storagePath?: string
  metadata?: Record<string, unknown>
}

type SnapshotDefinition = SnapshotRecord & {
  key: string
  kind: string
  name: string
  iconAssetKey?: string | null
  components?: Array<{ type?: string; config?: Record<string, unknown> }>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

const UGC_REFERENCE_PRIORITY_ORDER = ['proof_surface_lock', 'board_lock', 'composite_lock', 'subject_lock', 'prop_lock', 'environment_lock', 'style_lock'] as const
const STORY_REFERENCE_PRIORITY_ORDER = ['board_lock', 'composite_lock', 'subject_lock', 'environment_lock', 'prop_lock', 'style_lock', 'proof_surface_lock'] as const

function normalizeReferenceRole(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getReferenceRolePriority(presetFamily: ReturnType<typeof getCinematicSettings>['presetFamily'], referenceRole: string | null, basePriority: number) {
  const order = presetFamily === 'story_movie_tv' ? STORY_REFERENCE_PRIORITY_ORDER : UGC_REFERENCE_PRIORITY_ORDER
  const index = referenceRole ? order.indexOf(referenceRole as typeof order[number]) : -1
  return (index >= 0 ? 1000 - index * 100 : 200) + basePriority
}

function formatPromptSection(label: string, values: Array<string | null | undefined>) {
  const joined = values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0)
    .join(' ')
  return joined ? `${label}: ${joined}.` : null
}

function describePresetPromptStyle(presetFamily: ReturnType<typeof getCinematicSettings>['presetFamily']) {
  switch (presetFamily) {
    case 'story_movie_tv':
      return 'Use film or TV keyframe language with continuity, staging, and storyboard-level clarity.'
    case 'ugc_creator':
      return 'Use believable creator-shot language for a handheld, native short-form UGC frame. Keep the wording literal and visually direct.'
    case 'ugc_direct_response_ad':
      return 'Use direct-response ad language with a strong hook frame, visible product, and immediate proof. Show the product causing the better outcome.'
    case 'ugc_faceless_format':
      return 'Use faceless short-form language centered on objects, process, screens, or demo action. Keep the frame visually legible without relying on facial acting.'
  }
}

function describeSubtypePromptStyle(formatSubtype: ReturnType<typeof getCinematicSettings>['formatSubtype']) {
  switch (formatSubtype) {
    case 'creator_problem_solution':
      return 'Bias toward creator-native problem, use case, soft proof, and soft CTA. Avoid polished ad-slogan phrasing.'
    case 'creator_reframe':
      return 'Bias toward naming the viewer behavior, reframing it, and landing an emotional payoff through believable creator delivery.'
    case 'creator_validation':
      return 'Bias toward emotional recognition, reassurance, and low-pressure delivery instead of hard selling.'
    case 'creator_serialized_drama':
      return 'Bias toward creator-native storytime or gossip pacing with a strong conflict hook, a delayed reveal, and a soft redemption-led close.'
    case 'ad_problem_solution':
      return 'Bias toward pain, product, proof, and direct response clarity with concrete visible evidence.'
    case 'ad_mechanism_proof':
      return 'Bias toward mechanism visibility, explicit demonstration, and readable proof. Make the function obvious on screen.'
    case 'ad_before_after':
      return 'Bias toward transformation framing with before, intervention, and after contrast that reads clearly on mute.'
    case 'ad_comparison':
      return 'Bias toward side-by-side or option-versus-option clarity with a clear winner and visible proof.'
    case 'ad_trojan_horse_drama':
      return 'Bias toward story-led social tension where the product arrives as the reveal or rescue, then clearly resolves the problem before the CTA.'
    case 'faceless_demo':
      return 'Bias toward object, product, or workflow readability without relying on a face.'
    case 'faceless_explainer':
      return 'Bias toward wrong-belief hooks, explanation, mechanism, and clean visual reasoning.'
    case 'faceless_process':
      return 'Bias toward process progression, reveal, and satisfying payoff through visibly different stages.'
    case 'faceless_serialized_drama':
      return 'Bias toward absurd visual packaging, personified conflict, and a visual reveal/redemption sequence that still reads clearly on mute.'
    case 'contrast_narrative':
      return 'Bias toward escalating two-pole contrast, status or transformation payoff, and loopable visual storytelling. Keep both poles readable and widen the gap each beat.'
    default:
      return null
  }
}

function subtypeLooksLikeAd(formatSubtype: ReturnType<typeof getCinematicSettings>['formatSubtype']) {
  return typeof formatSubtype === 'string' && (formatSubtype.startsWith('ad_') || formatSubtype === 'contrast_narrative')
}

function isSerializedDramaSubtype(formatSubtype: ReturnType<typeof getCinematicSettings>['formatSubtype']) {
  return (
    formatSubtype === 'creator_serialized_drama'
    || formatSubtype === 'ad_trojan_horse_drama'
    || formatSubtype === 'faceless_serialized_drama'
  )
}

function formatOverlayCues(audio: ReturnType<typeof getCinematicShotNodeConfig>['audio']) {
  return audio
    .filter((cue) => cue.kind === 'offscreen' && cue.cue.trim())
    .map((cue) => `Narrator overlay: ${cue.cue.trim()}.`)
}

function getProjectArtDirection(gameSpec: unknown | null | undefined, graphMetadata?: unknown | null, nodeMetadata?: unknown | null) {
  const rawGameSpec = asRecord(gameSpec)
  const rawTheme = asRecord(rawGameSpec.theme)
  const rawGraphMetadata = asRecord(graphMetadata)
  const rawGraphCinematics = asRecord(rawGraphMetadata.cinematics)
  const rawNodeMetadata = asRecord(nodeMetadata)
  const rawArtStylePreset = asString(rawTheme.artStylePreset)?.trim() ?? ''
  const rawArtStyleDescription = asString(rawTheme.artStyleDescription)?.trim() ?? ''
  const parsed = gameSpecSchema.safeParse(gameSpec ?? null)
  const parsedArtStylePreset = parsed.success ? parsed.data.theme.artStylePreset.trim() : ''
  const parsedArtStyleDescription = parsed.success ? parsed.data.theme.artStyleDescription.trim() : ''
  const cinematicSettings = getCinematicSettings(gameSpec ?? null, graphMetadata ?? null)
  const nodeFormatSubtype = asString(rawNodeMetadata.formatSubtype)?.trim() ?? null
  const nodePresetFamily = asString(rawNodeMetadata.presetFamily)?.trim() ?? null
  const resolvedArtStyle = resolveArtStylePresetForCinematic({
    nodeArtStylePreset: asString(rawNodeMetadata.artStylePreset)?.trim() ?? null,
    graphArtStylePreset: asString(rawGraphCinematics.artStylePreset)?.trim() ?? null,
    inferredGraphArtStylePreset: cinematicSettings.inferredArtStylePreset,
    projectArtStylePreset: rawArtStylePreset || parsedArtStylePreset || null,
    presetFamily: nodePresetFamily || cinematicSettings.presetFamily,
    formatSubtype: nodeFormatSubtype || cinematicSettings.formatSubtype,
    useInferredArtStyle: cinematicSettings.useInferredArtStyle,
  })

  return {
    artStylePreset: resolvedArtStyle.presetId,
    projectArtStylePreset: rawArtStylePreset || parsedArtStylePreset,
    artStyleDescription: rawArtStyleDescription || parsedArtStyleDescription,
    artStyleSource: resolvedArtStyle.source,
    artStyleReason: resolvedArtStyle.reason,
    recommendedArtStylePreset: resolvedArtStyle.recommendedPresetId,
  }
}

function formatProjectArtDirection(gameSpec: unknown | null | undefined, graphMetadata?: unknown | null, nodeMetadata?: unknown | null) {
  const direction = getProjectArtDirection(gameSpec, graphMetadata, nodeMetadata)
  const presetIdOrLabel = direction.artStylePreset || null
  const presetLabel = getArtStylePresetLabel(presetIdOrLabel)
  return [
    `Art style: ${presetLabel}.`,
    direction.artStyleSource === 'recommended' || direction.artStyleSource === 'inferred' ? `Cinematic capture override: ${presetLabel}. ${direction.artStyleReason}` : null,
    ...getArtStylePresetPromptDirectives(presetIdOrLabel),
    direction.artStyleDescription ? `Custom art direction override: ${direction.artStyleDescription}.` : null,
    'Treat this art direction as a strong style anchor and keep the final rendering language consistent throughout the image.',
  ].filter((entry): entry is string => Boolean(entry))
}

function buildStoryboardStyleAnchor(gameSpec: unknown | null | undefined, graphMetadata: unknown | null | undefined, sourceInputs: Array<{ imageUrl?: string | null }>) {
  const direction = getProjectArtDirection(gameSpec, graphMetadata, null)
  const presetIdOrLabel = direction.artStylePreset || null
  const hasImageReferences = sourceInputs.some((entry) => typeof entry.imageUrl === 'string' && entry.imageUrl.trim().length > 0)
  if (hasImageReferences) {
    return [
      'Use the provided reference images as the canonical source for character identity, environment design, props, materials, and rendering style.',
      'Keep characters, environments, and hero objects on-model and in the same visual family as the reference images.',
    ]
  }

  return [
    `Use the project art style: ${getArtStylePresetLabel(presetIdOrLabel)}.`,
    ...getArtStylePresetPromptDirectives(presetIdOrLabel).slice(0, 2),
    direction.artStyleDescription ? `Art direction override: ${direction.artStyleDescription}.` : null,
  ].filter((entry): entry is string => Boolean(entry))
}

function buildStoryboardReferenceStyleInstruction(sourceInputs: Array<{ imageUrl?: string | null }>) {
  const hasImageReferences = sourceInputs.some((entry) => typeof entry.imageUrl === 'string' && entry.imageUrl.trim().length > 0)
  if (!hasImageReferences) return null
  return [
    'Treat the provided reference images as the canonical source for character identity, wardrobe, props, environment details, materials, lighting response, and final rendering style.',
    'Keep the output in the same visual family, rendering language, surface treatment, lighting quality, and overall finish as the reference images.',
    'Do not reinterpret the references into a different art direction or rendering style.',
  ].join(' ')
}

function buildStoryboardPanelDirection(shot: {
  title: string
  beat: string
  framing: string
  cameraAngle: string
  cameraMovement?: string
}, index: number) {
  const parts = [
    `PANEL ${index + 1}: ${shot.title}.`,
    shot.beat.trim() ? shot.beat.trim().replace(/\.$/, '') + '.' : null,
    shot.framing.trim() ? `Use ${shot.framing.trim()} framing.` : null,
    shot.cameraAngle.trim() ? `Use a ${shot.cameraAngle.trim()} camera angle.` : null,
    shot.cameraMovement?.trim() ? `Camera motion: ${shot.cameraMovement.trim()}.` : null,
  ]
  return parts.filter((entry): entry is string => Boolean(entry)).join(' ')
}

type StoryboardPanelBeat = {
  title: string
  beat: string
  framing: string
  cameraAngle: string
  cameraMovement?: string
}

function normalizeStoryboardBeatText(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function isStoryboardActionScenePreset(scenePreset: string | null | undefined) {
  return [
    'duel_showdown',
    'chase_escape_fragmented',
    'ambush_counterambush',
    'battlefield_push_and_collapse',
    'heroic_arrival_reversal',
    'siege_last_stand',
  ].includes(scenePreset ?? '')
}

function buildDerivedStoryboardPanelBeats(shots: Array<{
  title: string
  beat: string
  framing: string
  cameraAngle: string
  actions?: Array<{ verb?: string; stagingNotes?: string }>
  storyScenePreset?: string | null
  storyLanguagePreset?: string | null
}>) {
  const derivedPanels: StoryboardPanelBeat[] = []
  for (const shot of shots) {
    const actionCount = Array.isArray(shot.actions) ? shot.actions.length : 0
    const storyContract =
      shot.storyScenePreset || shot.storyLanguagePreset
        ? resolveStoryRuntimeContract({
            storyScenePreset: shot.storyScenePreset ?? null,
            storyLanguagePreset: shot.storyLanguagePreset ?? null,
          })
        : null
    const isActionPreset = isStoryboardActionScenePreset(shot.storyScenePreset)
    const densityBias = storyContract?.storyboardPanelDensityBias ?? 'low'
    const normalizedBeat = normalizeStoryboardBeatText(shot.beat)
    const actionPressure =
      actionCount
      + (/\b(clash|parry|counter|sword|strike|feint|disarm|fight|duel|battle|breach|collapse|chase|escape|vault|sprint|pursuit)\b/.test(normalizedBeat) ? 1 : 0)
    let panelCount = 1
    if (isActionPreset) {
      if (densityBias === 'high') {
        panelCount = actionPressure >= 5 ? 4 : actionPressure >= 3 ? 3 : 2
      } else if (densityBias === 'medium') {
        panelCount = actionPressure >= 4 ? 3 : actionPressure >= 2 ? 2 : 1
      } else {
        panelCount = actionPressure >= 3 ? 2 : 1
      }
    }

    const microBeatLabels = panelCount >= 4
      ? ['opening commitment', 'pressure change', 'reversal', 'payoff image']
      : panelCount === 3
        ? ['opening commitment', 'pressure change', 'turn / payoff']
        : panelCount === 2
          ? ['opening commitment', 'pressure change']
          : ['held beat']

    for (let index = 0; index < panelCount; index += 1) {
      const label = microBeatLabels[index] ?? `beat ${index + 1}`
      const panelBeat =
        panelCount === 1
          ? shot.beat
          : `Show the ${label} of the same continuous action: ${shot.beat.replace(/\.$/, '')}. Keep this panel visually distinct from the previous one while preserving choreography and screen geography.`
      derivedPanels.push({
        title: panelCount === 1 ? shot.title : `${shot.title} - ${label}`,
        beat: panelBeat,
        framing: shot.framing,
        cameraAngle: shot.cameraAngle,
      })
    }
  }

  return derivedPanels.slice(0, 16)
}

function buildStoryboardSourceDescriptions(
  sourceInputs: Array<{ role?: string | null; definition?: { name?: string | null } | null; node: { title: string }; imageUrl?: string | null }>,
) {
  return sourceInputs.map((entry) => {
    const label = entry.definition?.name ?? entry.node.title
    const role = entry.role ?? 'reference'
    return `${role}: ${label}.`
  })
}

function isUsableAssetUrl(asset: SnapshotAsset | null | undefined, url: string | null) {
  if (!url || !/^https?:\/\//i.test(url)) return false
  const metadata = asRecord(asset?.metadata)
  if (metadata.placeholder === true) return false
  return true
}

function describeStoryboardGrid(panelCount: number, aspectRatio: string) {
  if (panelCount <= 1) {
    return `Use a single full-frame panel matching a ${aspectRatio} composition.`
  }
  if (panelCount === 2) return `Arrange exactly 2 panels in a clean 1x2 horizontal storyboard strip of ${aspectRatio} panels with clear gutters. Do not turn this into a 2x2 board.`
  if (panelCount === 3) return `Arrange exactly 3 panels in a clean 1x3 horizontal storyboard strip of ${aspectRatio} panels with clear gutters. Do not collapse or expand the board.`
  if (panelCount === 4) return `Arrange exactly 4 panels in a clean 2x2 grid of ${aspectRatio} panels with clear gutters.`
  if (panelCount <= 6) return `Arrange exactly ${panelCount} panels in a clean 2x3 storyboard grid of ${aspectRatio} panels with clear gutters, leaving no more space than needed.`
  if (panelCount <= 8) return `Arrange exactly ${panelCount} panels in a clean 2x4 storyboard grid of ${aspectRatio} panels with clear gutters, preserving reading order left-to-right then top-to-bottom.`
  if (panelCount === 9) return `Arrange exactly 9 panels in a clean 3x3 grid of ${aspectRatio} panels with clear gutters. Do not collapse the board to a 2x2 or any smaller layout.`
  if (panelCount <= 12) return `Arrange exactly ${panelCount} panels in a clean 3x4 storyboard grid of ${aspectRatio} panels with clear gutters, preserving reading order left-to-right then top-to-bottom.`
  return `Arrange exactly ${panelCount} panels in a clean 4x4 storyboard grid of ${aspectRatio} panels with clear gutters, using all required panels and not collapsing the board to a smaller layout.`
}

function countTakeStoryboardPanels(take: { storyboardPanelPlan?: { panels?: Array<unknown> | null } | null } | null | undefined) {
  const planCount = Array.isArray(take?.storyboardPanelPlan?.panels) ? take.storyboardPanelPlan?.panels.length ?? 0 : 0
  if (planCount > 0) return planCount
  return typeof (take as { storyboardPanelScriptText?: unknown } | null | undefined)?.storyboardPanelScriptText === 'string'
    ? parseTakeStoryboardPanelScriptText((take as { storyboardPanelScriptText?: string }).storyboardPanelScriptText).length
    : 0
}

function resolveTakeStoryboardPromptSource(input: {
  nodeTake: ReturnType<typeof getCinematicTakeNodeConfig>
  compiledTake: ReturnType<typeof getCinematicSequence>['takes'][number] | null
}) {
  const nodePanelCount = countTakeStoryboardPanels(input.nodeTake)
  const compiledPanelCount = countTakeStoryboardPanels(input.compiledTake)

  if (nodePanelCount > compiledPanelCount) return input.nodeTake
  if (compiledPanelCount > 0) return input.compiledTake
  return input.compiledTake ?? input.nodeTake
}

function describeStoryboardPanelStyling(aspectRatio: string) {
  return [
    `Each panel should read as a ${aspectRatio} frame.`,
    'Render the board as a comic-ink storyboard, not as finished cinematic frames or a polished contact sheet.',
    'Use monochrome or restrained grayscale wash with bold inked silhouettes, readable action lines, and clean gutters.',
    'Do not add speech bubbles, handwritten notes, or decorative border treatment.',
  ].join(' ')
}

export function extractFalVideoUrl(data: unknown) {
  const record = asRecord(data)
  const video = asRecord(record.video)
  const output = asRecord(record.output)
  const nestedVideo = asRecord(output.video)

  return asString(video.url)
    ?? asString(nestedVideo.url)
    ?? asString(record.video_url)
    ?? asString(record.url)
}

export function findGraph(snapshot: { graphs?: unknown[] }, graphKey: string) {
  const graphs = Array.isArray(snapshot.graphs) ? snapshot.graphs.map((graph) => asRecord(graph)) : []
  const graph = graphs.find((entry) => entry.key === graphKey)
  if (!graph) return null

  return {
    ...graph,
    key: String(graph.key),
    name: typeof graph.name === 'string' ? graph.name : String(graph.key),
    entryNodeKey: asString(graph.entryNodeKey),
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map((node) => asRecord(node)) : [],
    edges: Array.isArray(graph.edges) ? graph.edges.map((edge) => asRecord(edge)) : [],
  } as SnapshotGraph
}

export function findNode(graph: SnapshotGraph, nodeKey: string) {
  const node = graph.nodes.find((entry) => entry.key === nodeKey)
  if (!node) return null
  return {
    ...node,
    key: String(node.key),
    type: typeof node.type === 'string' ? node.type : 'text',
    title: typeof node.title === 'string' ? node.title : String(node.key),
    body: asRecord(node.body),
    metadata: asRecord(node.metadata),
  } as SnapshotNode
}

function findSequenceShot(graph: SnapshotGraph, shotId: string) {
  return getCinematicSequence(graph.metadata).shots.find((shot) => shot.id === shotId) ?? null
}

export function buildVirtualShotNode(graph: SnapshotGraph, shotId: string, takeNodeKey?: string | null) {
  const shot = findSequenceShot(graph, shotId)
  if (!shot) return null

  return {
    key: takeNodeKey?.trim() || `sequence-shot-${shot.id}`,
    type: 'cinematic_shot',
    title: shot.title,
    body: {
      text: shot.beat,
      imageAssetKey: shot.stillAssetKey ?? null,
      audioAssetKey: null,
      choices: [],
    },
    metadata: updateNodeMetadataWithShot({}, {
      ...shot,
      sequenceShotId: shot.id,
    }),
  } as SnapshotNode
}

function updateSequenceShotBindingsInGraph(
  graph: SnapshotGraph,
  shotId: string,
  changes: {
    metadata: Partial<ReturnType<typeof getCinematicShotNodeConfig>>
  },
) {
  const sequence = getCinematicSequence(graph.metadata)
  const existingShot = sequence.shots.find((shot) => shot.id === shotId) ?? null
  if (!existingShot) return graph

  const nextSequence = {
    ...sequence,
    shots: sequence.shots.map((shot) => (
      shot.id === shotId
        ? {
            ...shot,
            ...changes.metadata,
          }
        : shot
    )),
  }

  return {
    ...graph,
    metadata: {
      ...asRecord(graph.metadata),
      cinematicSequence: nextSequence,
      cinematicScript: deriveCinematicScriptFromSequence(nextSequence),
    },
  }
}

function updateSequenceTakeBindingsInGraph(
  graph: SnapshotGraph,
  identifiers: {
    takeId?: string | null
    takeIndex?: number | null
  },
  changes: {
    metadata: Partial<ReturnType<typeof getCinematicTakeNodeConfig>>
  },
) {
  const sequence = getCinematicSequence(graph.metadata)
  const indexedTake = typeof identifiers.takeIndex === 'number' && identifiers.takeIndex >= 0
    ? sequence.takes[identifiers.takeIndex] ?? null
    : null
  const existingTake = indexedTake ?? (
    identifiers.takeId
      ? sequence.takes.find((take) => take.id === identifiers.takeId) ?? null
      : null
  )
  if (!existingTake) return graph
  const resolvedTakeIndex = indexedTake
    ? identifiers.takeIndex ?? sequence.takes.findIndex((take) => take.id === existingTake.id)
    : sequence.takes.findIndex((take) => take.id === existingTake.id)

  const nextSequence = {
    ...sequence,
    takes: sequence.takes.map((take, index) => (
      index === resolvedTakeIndex
        ? {
            ...take,
            takeIndex: index,
            ...changes.metadata,
          }
        : take
    )),
  }

  return {
    ...graph,
    metadata: {
      ...asRecord(graph.metadata),
      cinematicSequence: nextSequence,
      cinematicScript: deriveCinematicScriptFromSequence(nextSequence),
    },
  }
}

function isAssetDependencyEdge(graph: SnapshotGraph, edge: SnapshotRecord) {
  const sourcePort = asString(asRecord(edge.source).portId)
  const targetPort = asString(asRecord(edge.target).portId)
  const sourceNode = findNode(graph, String(asRecord(edge.source).nodeKey ?? ''))
  return sourcePort === 'asset_out' || targetPort === 'asset_in' || sourceNode?.type === 'asset_ref'
}

export function collectReachableShotNodeKeys(graph: SnapshotGraph) {
  const adjacency = new Map<string, string[]>()

  for (const edge of graph.edges) {
    if (isAssetDependencyEdge(graph, edge)) continue
    const sourceNodeKey = asString(asRecord(edge.source).nodeKey)
    const targetNodeKey = asString(asRecord(edge.target).nodeKey)
    if (!sourceNodeKey || !targetNodeKey) continue
    adjacency.set(sourceNodeKey, [...(adjacency.get(sourceNodeKey) ?? []), targetNodeKey])
  }

  const queue = graph.entryNodeKey ? [graph.entryNodeKey] : []
  const visited = new Set<string>()
  const shotNodeKeys: string[] = []

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || visited.has(current)) continue
    visited.add(current)
    const node = findNode(graph, current)
    if (node?.type === 'cinematic_shot') {
      shotNodeKeys.push(node.key)
    }
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        queue.push(next)
      }
    }
  }

  return shotNodeKeys
}

export function resolveDefinitionDisplayAssetKey(definition: SnapshotDefinition | null) {
  if (!definition) return null
  const components = Array.isArray(definition.components) ? definition.components : []

  for (const component of components) {
    if (!component || typeof component !== 'object') continue
    const type = asString((component as { type?: unknown }).type)
    const config = asRecord((component as { config?: unknown }).config)
    if ((type === 'render_3d_binding' || type === 'environment_render_binding' || type === 'world_render_binding') && asString(config.previewImageAssetKey)) {
      return asString(config.previewImageAssetKey)
    }
  }

  return asString(definition.iconAssetKey)
}

export function resolveAssetUrl(asset: SnapshotAsset | null | undefined) {
  if (!asset) return null
  const metadata = asRecord(asset.metadata)
  return asString(metadata.sourceUrl) ?? asString(metadata.previewUrl)
}

function resolveNodeAssetSnapshot(input: {
  sourceNode: SnapshotNode
  definitions: SnapshotDefinition[]
  assets: SnapshotAsset[]
}) {
  if (input.sourceNode.type === 'asset_ref') {
    const sourceConfig = getAssetRefNodeConfig(input.sourceNode)
    const definition = sourceConfig.definitionKey
      ? input.definitions.find((entry) => entry.key === sourceConfig.definitionKey) ?? null
      : null
    const previewAssetKey = sourceConfig.assetKey ?? resolveDefinitionDisplayAssetKey(definition)
    const asset = previewAssetKey ? input.assets.find((entry) => entry.key === previewAssetKey) ?? null : null
    return {
      definition,
      asset,
      config: sourceConfig,
      refId: sourceConfig.entityRefId,
      role: sourceConfig.assetRole ?? sourceConfig.role,
      referenceRole: normalizeReferenceRole(sourceConfig.referenceRole),
      downstreamUse: asString(sourceConfig.downstreamUse),
      captureProfile: asString(sourceConfig.captureProfile),
      priority: sourceConfig.priority,
      label: definition?.name ?? sourceConfig.definitionKey ?? sourceConfig.assetKey ?? input.sourceNode.title,
    }
  }

  if (input.sourceNode.type === 'composite_ref') {
    const sourceConfig = getCompositeRefNodeConfig(input.sourceNode)
    const asset = sourceConfig.outputAssetKey
      ? input.assets.find((entry) => entry.key === sourceConfig.outputAssetKey) ?? null
      : null
    return {
      definition: null,
      asset,
      config: sourceConfig,
      refId: sourceConfig.compositeRefId,
      role: 'composite',
      referenceRole: normalizeReferenceRole(sourceConfig.referenceRole) ?? 'composite_lock',
      downstreamUse: asString(sourceConfig.downstreamUse),
      captureProfile: asString(sourceConfig.captureProfile),
      priority: sourceConfig.priority,
      label: sourceConfig.title || input.sourceNode.title,
    }
  }

  if (input.sourceNode.type === 'storyboard_ref') {
    const sourceConfig = getStoryboardRefNodeConfig(input.sourceNode)
    const asset = sourceConfig.assetKey
      ? input.assets.find((entry) => entry.key === sourceConfig.assetKey) ?? null
      : null
    return {
      definition: null,
      asset,
      config: sourceConfig,
      refId: sourceConfig.panelId ?? sourceConfig.storyboardId,
      role: 'storyboard',
      referenceRole: normalizeReferenceRole(sourceConfig.referenceRole) ?? 'board_lock',
      downstreamUse: asString(sourceConfig.downstreamUse),
      captureProfile: asString(sourceConfig.captureProfile),
      priority: sourceConfig.priority,
      label: input.sourceNode.title,
    }
  }

  return null
}

function resolveRefIdForNode(node: SnapshotNode) {
  if (node.type === 'asset_ref') return getAssetRefNodeConfig(node).entityRefId
  if (node.type === 'composite_ref') return getCompositeRefNodeConfig(node).compositeRefId
  if (node.type === 'storyboard_ref') {
    const config = getStoryboardRefNodeConfig(node)
    return config.panelId ?? config.storyboardId
  }
  return null
}

function buildResolvedSourceEntries(input: {
  snapshot: { definitions?: unknown[]; assets?: unknown[] }
  graph: SnapshotGraph
  refIds: string[]
}) {
  const definitions = Array.isArray(input.snapshot.definitions) ? input.snapshot.definitions.map((entry) => asRecord(entry) as SnapshotDefinition) : []
  const assets = Array.isArray(input.snapshot.assets) ? input.snapshot.assets.map((entry) => asRecord(entry) as SnapshotAsset) : []
  const sourceNodeByRefId = new Map<string, SnapshotNode>()
  for (const rawNode of input.graph.nodes) {
    const node = findNode(input.graph, String(rawNode.key ?? ''))
    if (!node || !['asset_ref', 'composite_ref', 'storyboard_ref'].includes(node.type)) continue
    const refId = resolveRefIdForNode(node)
    if (!refId) continue
    sourceNodeByRefId.set(refId, node)
  }

  return input.refIds
    .map((refId) => {
      const sourceNode = sourceNodeByRefId.get(refId) ?? null
      if (!sourceNode) return null
      const resolved = resolveNodeAssetSnapshot({ sourceNode, definitions, assets })
      if (!resolved) return null
      const rawAssetUrl = resolveAssetUrl(resolved.asset)
      const assetUrl = isUsableAssetUrl(resolved.asset, rawAssetUrl) ? rawAssetUrl : null
      const modality =
        resolved.asset?.kind === 'video'
          ? 'video'
          : resolved.asset?.kind === 'audio'
            ? 'audio'
            : 'image'
      return {
        node: sourceNode,
        definition: resolved.definition,
        asset: resolved.asset,
        imageUrl: modality === 'image' ? assetUrl : null,
        assetUrl,
        modality,
        config: resolved.config,
        refId: resolved.refId,
        role: resolved.role,
        priority: resolved.priority,
        referenceRole: resolved.referenceRole,
        downstreamUse: resolved.downstreamUse,
        captureProfile: resolved.captureProfile,
        label: resolved.label,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

export function resolveShotSources(
  snapshot: { definitions?: unknown[]; assets?: unknown[] },
  graph: SnapshotGraph,
  shotNodeKey: string,
  shotId?: string | null,
) {
  const edgeSources = graph.edges
    .filter((edge) => asString(asRecord(edge.target).nodeKey) === shotNodeKey)
    .filter((edge) => isAssetDependencyEdge(graph, edge))
    .map((edge) => {
      const definitions = Array.isArray(snapshot.definitions) ? snapshot.definitions.map((entry) => asRecord(entry) as SnapshotDefinition) : []
      const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map((entry) => asRecord(entry) as SnapshotAsset) : []
      const sourceNode = findNode(graph, String(asRecord(edge.source).nodeKey ?? ''))
      if (!sourceNode || !['asset_ref', 'composite_ref', 'storyboard_ref'].includes(sourceNode.type)) return null
      const resolved = resolveNodeAssetSnapshot({
        sourceNode,
        definitions,
        assets,
      })
      if (!resolved) return null
      const rawAssetUrl = resolveAssetUrl(resolved.asset)
      const assetUrl = isUsableAssetUrl(resolved.asset, rawAssetUrl) ? rawAssetUrl : null
      const modality =
        resolved.asset?.kind === 'video'
          ? 'video'
          : resolved.asset?.kind === 'audio'
            ? 'audio'
            : 'image'
      return {
        node: sourceNode,
        definition: resolved.definition,
        asset: resolved.asset,
        imageUrl: modality === 'image' ? assetUrl : null,
        assetUrl,
        modality,
        config: resolved.config,
        refId: resolved.refId,
        role: resolved.role,
        priority: resolved.priority,
        referenceRole: resolved.referenceRole,
        downstreamUse: resolved.downstreamUse,
        captureProfile: resolved.captureProfile,
        label: resolved.label,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  if (edgeSources.length > 0) return edgeSources

  const shotNode = shotId
    ? buildVirtualShotNode(graph, shotId, shotNodeKey)
    : findNode(graph, shotNodeKey)
  if (!shotNode || shotNode.type !== 'cinematic_shot') return []
  const shot = getCinematicShotNodeConfig(shotNode)
  const refIds = Array.from(new Set(
    shot.requiredSourceRefIds.length > 0
      ? shot.requiredSourceRefIds
      : [
          ...shot.storyboardRefIds,
          ...shot.compositeRefIds,
          ...shot.participantRefIds,
          shot.locationRefId,
          ...shot.propRefIds,
        ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
  ))
  return buildResolvedSourceEntries({ snapshot, graph, refIds })
}

export function resolveTakeSources(snapshot: { definitions?: unknown[]; assets?: unknown[] }, graph: SnapshotGraph, takeNodeKey: string) {
  const takeNode = findNode(graph, takeNodeKey)
  if (!takeNode) return []
  const take = getCinematicTakeNodeConfig(takeNode)
  const sequence = getCinematicSequence(graph.metadata)
  const takeShots = take.shotIds
    .map((shotId) => sequence.shots.find((shot) => shot.id === shotId) ?? null)
    .filter((shot): shot is typeof sequence.shots[number] => Boolean(shot))
  const inferredRefIds = Array.from(new Set(
    takeShots.flatMap((shot) => (
      shot.requiredSourceRefIds.length > 0
        ? shot.requiredSourceRefIds
        : [
            ...shot.storyboardRefIds,
            ...shot.compositeRefIds,
            ...shot.participantRefIds,
            ...(shot.locationRefId ? [shot.locationRefId] : []),
            ...shot.propRefIds,
          ]
    )),
  ))
  return buildResolvedSourceEntries({
    snapshot,
    graph,
    refIds: take.requiredSourceRefIds.length > 0 ? take.requiredSourceRefIds : inferredRefIds,
  })
}

function resolveStoryboardTargetShots(graph: SnapshotGraph, storyboardNodeKey: string) {
  const storyboardNode = findNode(graph, storyboardNodeKey)
  if (!storyboardNode) return []
  const config = getStoryboardRefNodeConfig(storyboardNode)
  const sequence = getCinematicSequence(graph.metadata)
  const takeShotIds = config.takeId
    ? sequence.takes.find((take) => take.id === config.takeId)?.shotIds ?? []
    : []
  const directPanelShotId =
    config.panelId
      ? sequence.storyboard?.panels.find((panel) => panel.id === config.panelId)?.shotId ?? null
      : null
  const referencedShotIds = sequence.shots
    .filter((shot) => {
      const targetRefId = config.panelId ?? config.storyboardId
      if (!targetRefId) return false
      return shot.storyboardRefIds.includes(targetRefId)
    })
    .map((shot) => shot.id)
  const shotIds = Array.from(new Set(
    config.storyboardKind === 'sequence_board'
      ? (takeShotIds.length > 0 ? takeShotIds : sequence.shots.slice(0, 6).map((shot) => shot.id))
      : [
          ...takeShotIds,
          ...(config.shotId ? [config.shotId] : []),
          ...(directPanelShotId ? [directPanelShotId] : []),
          ...referencedShotIds,
        ],
  ))

  return shotIds
    .map((shotId) => sequence.shots.find((shot) => shot.id === shotId) ?? null)
    .filter((shot): shot is typeof sequence.shots[number] => Boolean(shot))
}

export function resolveStoryboardSources(snapshot: { definitions?: unknown[]; assets?: unknown[] }, graph: SnapshotGraph, storyboardNodeKey: string) {
  const storyboardNode = findNode(graph, storyboardNodeKey)
  if (!storyboardNode) return []
  const config = getStoryboardRefNodeConfig(storyboardNode)
  const directEdgeSources = graph.edges
    .filter((edge) => asString(asRecord(edge.target).nodeKey) === storyboardNodeKey)
    .filter((edge) => isAssetDependencyEdge(graph, edge))
    .map((edge) => {
      const definitions = Array.isArray(snapshot.definitions) ? snapshot.definitions.map((entry) => asRecord(entry) as SnapshotDefinition) : []
      const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map((entry) => asRecord(entry) as SnapshotAsset) : []
      const sourceNode = findNode(graph, String(asRecord(edge.source).nodeKey ?? ''))
      if (!sourceNode || !['asset_ref', 'composite_ref', 'storyboard_ref'].includes(sourceNode.type)) return null
      const resolved = resolveNodeAssetSnapshot({
        sourceNode,
        definitions,
        assets,
      })
      if (!resolved) return null
      const assetUrl = resolveAssetUrl(resolved.asset)
      const modality =
        resolved.asset?.kind === 'video'
          ? 'video'
          : resolved.asset?.kind === 'audio'
            ? 'audio'
            : 'image'
      return {
        node: sourceNode,
        definition: resolved.definition,
        asset: resolved.asset,
        imageUrl: modality === 'image' ? assetUrl : null,
        assetUrl,
        modality,
        config: resolved.config,
        refId: resolved.refId,
        role: resolved.role,
        priority: resolved.priority,
        referenceRole: resolved.referenceRole,
        downstreamUse: resolved.downstreamUse,
        captureProfile: resolved.captureProfile,
        label: resolved.label,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  const shots = resolveStoryboardTargetShots(graph, storyboardNodeKey)
  const targetStoryboardRefId = config.panelId ?? config.storyboardId
  const refIds = Array.from(new Set(
    shots.flatMap((shot) => (
      shot.requiredSourceRefIds.length > 0
        ? shot.requiredSourceRefIds
        : [
            ...shot.participantRefIds,
            ...(shot.locationRefId ? [shot.locationRefId] : []),
            ...shot.propRefIds,
            ...shot.compositeRefIds,
          ]
    )),
  )).filter((refId) => refId !== targetStoryboardRefId)

  const resolvedEntries = buildResolvedSourceEntries({
    snapshot,
    graph,
    refIds,
  })
  const merged = [...directEdgeSources]
  for (const entry of resolvedEntries) {
    if (merged.some((candidate) => (candidate.refId ?? candidate.node.key) === (entry.refId ?? entry.node.key))) continue
    merged.push(entry)
  }
  return merged
}

export function resolveTakeStillReferenceImageUrls(
  snapshot: { assets?: unknown[] },
  graph: SnapshotGraph,
  takeNodeKey: string,
  sourceInputs: ReturnType<typeof resolveTakeSources>,
) {
  const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map((entry) => asRecord(entry) as SnapshotAsset) : []
  const takeNode = findNode(graph, takeNodeKey)
  if (!takeNode) return sourceInputs.map((entry) => entry.imageUrl).filter((entry): entry is string => Boolean(entry))
  const take = getCinematicTakeNodeConfig(takeNode)
  const sequence = getCinematicSequence(graph.metadata)
  const firstShot = take.shotIds
    .map((shotId) => sequence.shots.find((entry) => entry.id === shotId) ?? null)
    .find((entry) => Boolean(entry)) ?? null
  const firstShotStillAsset = firstShot?.stillAssetKey
    ? assets.find((asset) => asset.key === firstShot.stillAssetKey) ?? null
    : null
  const firstShotStillUrl = firstShotStillAsset ? resolveAssetUrl(firstShotStillAsset) : null

  return Array.from(new Set([
    ...sourceInputs.map((entry) => entry.imageUrl).filter((entry): entry is string => Boolean(entry)),
    ...(isUsableAssetUrl(firstShotStillAsset, firstShotStillUrl) ? [firstShotStillUrl as string] : []),
  ]))
}

export function resolveStoryboardStillReferenceImageUrls(
  snapshot: { assets?: unknown[] },
  graph: SnapshotGraph,
  storyboardNodeKey: string,
  sourceInputs: ReturnType<typeof resolveStoryboardSources>,
) {
  const assets = Array.isArray(snapshot.assets) ? snapshot.assets.map((entry) => asRecord(entry) as SnapshotAsset) : []
  const shotStillUrls = resolveStoryboardTargetShots(graph, storyboardNodeKey)
    .map((shot) => {
      const stillAsset = shot.stillAssetKey ? assets.find((asset) => asset.key === shot.stillAssetKey) ?? null : null
      const url = stillAsset ? resolveAssetUrl(stillAsset) : null
      return isUsableAssetUrl(stillAsset, url) ? url : null
    })
    .filter((entry): entry is string => Boolean(entry))

  return Array.from(new Set([
    ...sourceInputs.map((entry) => entry.imageUrl).filter((entry): entry is string => Boolean(entry)),
    ...shotStillUrls,
  ]))
}

export function buildSeedanceExecutionPlan(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  shotNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveShotSources>
}): SeedanceExecutionPlan {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const shot = getCinematicShotNodeConfig(input.shotNode)
  const artDirection = getProjectArtDirection(input.snapshot.gameSpec ?? null, input.graph.metadata, input.shotNode.metadata ?? null)
  const sortedInputs = [...input.sourceInputs]
    .filter((entry) => Boolean(entry.assetUrl))
    .sort((left, right) =>
      getReferenceRolePriority(settings.presetFamily, right.referenceRole ?? null, right.priority)
      - getReferenceRolePriority(settings.presetFamily, left.referenceRole ?? null, left.priority))

  const endpoint =
    shot.seedanceModePreference === 'image-to-video'
      ? 'image-to-video'
      : shot.seedanceModePreference === 'reference-to-video'
        ? 'reference-to-video'
        : sortedInputs.length <= 1 && sortedInputs.every((entry) => entry.modality === 'image')
          ? 'image-to-video'
          : 'reference-to-video'

  const referenceInputs = sortedInputs.map((entry, index) => ({
    id: `${entry.refId ?? entry.node.key}_${index}`,
    sourceRefId: entry.refId ?? null,
    nodeKey: entry.node.key,
    label: entry.label,
    modality: entry.modality,
    url: entry.assetUrl ?? '',
    priority: getReferenceRolePriority(settings.presetFamily, entry.referenceRole ?? null, entry.priority),
    truncated: index >= 12,
  }))

  const keptReferenceInputs = referenceInputs.filter((entry, index) => !entry.truncated && index < 12)
  const droppedRefIds = referenceInputs.filter((entry) => entry.truncated).map((entry) => entry.sourceRefId ?? entry.id)

  const promptLines = [
    `Shot: ${input.shotNode.title}.`,
    formatPromptSection('Subject', [
      shot.directingPackage.subjectAnchor,
      shot.framing,
    ]),
    formatPromptSection('Action', [
      shot.directingPackage.dominantAction,
      input.shotNode.body?.text ? String(input.shotNode.body.text).trim() : null,
    ]),
    formatPromptSection('Camera', [
      shot.directingPackage.primaryCameraMove,
      shot.cameraAngle,
      shot.lensPreference,
    ]),
    formatPromptSection('Style', [
      `Art style ${getArtStylePresetLabel(artDirection.artStylePreset)}`,
      ...getArtStylePresetPromptDirectives(artDirection.artStylePreset),
      ...shot.directingPackage.styleDirectives,
    ]),
    formatPromptSection('Constraints', [
      shot.directingPackage.proofSurfaceRole ? `keep ${shot.directingPackage.proofSurfaceRole} readable` : null,
      ...shot.directingPackage.continuityConstraints,
      shot.compositionGuide,
    ]),
    ...shot.dialogue.map((entry) => `Dialogue: ${entry.line}${entry.delivery ? ` (${entry.delivery})` : ''}.`),
    ...formatOverlayCues(shot.audio),
  ].filter((entry): entry is string => Boolean(entry))

  const referenceDirectives = keptReferenceInputs.map((entry, index) => {
    const tag = entry.modality === 'image' ? `@Image${index + 1}` : entry.modality === 'video' ? `@Video${index + 1}` : `@Audio${index + 1}`
    const matchingSource = input.sourceInputs.find((candidate) => (candidate.refId ?? candidate.node.key) === (entry.sourceRefId ?? entry.nodeKey))
    const roleText = matchingSource?.referenceRole ? ` (${matchingSource.referenceRole})` : ''
    return `${tag} is ${entry.label}${roleText}.`
  })

  const prompt = [
    `Shot 1: ${promptLines.join(' ')}`,
    ...referenceDirectives,
    'Keep one primary action and one primary camera move. Preserve subject continuity, prop continuity, and readable proof surfaces across all references.',
  ].join(' ')

  const imageInputs = keptReferenceInputs.filter((entry) => entry.modality === 'image')
  const videoInputs = keptReferenceInputs.filter((entry) => entry.modality === 'video')
  const audioInputs = keptReferenceInputs.filter((entry) => entry.modality === 'audio')

  return {
    endpoint,
    modeReason:
      endpoint === 'image-to-video'
        ? 'Single strong image reference or explicit image-to-video preference.'
        : 'Multiple references, storyboard references, or non-image modalities require reference-to-video.',
    prompt,
    resolution: settings.videoResolution === '480p' ? '480p' : '720p',
    duration: `${Math.min(15, Math.max(4, shot.durationSeconds ?? settings.defaultClipSeconds))}` as SeedanceExecutionPlan['duration'],
    aspectRatio: settings.stillAspectRatio,
    generateAudio: shot.audio.length > 0 || shot.dialogue.length > 0,
    seed: null,
    imageUrl: endpoint === 'image-to-video' ? (imageInputs[0]?.url ?? null) : null,
    endImageUrl: endpoint === 'image-to-video' && imageInputs.length > 1 ? imageInputs[1]?.url ?? null : null,
    imageUrls: imageInputs.map((entry) => entry.url),
    videoUrls: videoInputs.map((entry) => entry.url),
    audioUrls: audioInputs.map((entry) => entry.url),
    referenceInputs: keptReferenceInputs,
    droppedRefIds,
  }
}

export function buildTakeSeedanceExecutionPlan(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  takeNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveTakeSources>
}) {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const take = getCinematicTakeNodeConfig(input.takeNode)
  const artDirection = getProjectArtDirection(input.snapshot.gameSpec ?? null, input.graph.metadata, input.takeNode.metadata ?? null)
  const sequence = getCinematicSequence(input.graph.metadata)
  const shots = take.shotIds
    .map((shotId) => sequence.shots.find((entry) => entry.id === shotId) ?? null)
    .filter((entry): entry is typeof sequence.shots[number] => Boolean(entry))
  const sortedInputs = [...input.sourceInputs]
    .filter((entry) => Boolean(entry.assetUrl))
    .sort((left, right) =>
      getReferenceRolePriority(settings.presetFamily, right.referenceRole ?? null, right.priority)
      - getReferenceRolePriority(settings.presetFamily, left.referenceRole ?? null, left.priority))
  const endpoint =
    take.seedanceEndpoint === 'image-to-video'
      ? 'image-to-video'
      : sortedInputs.length <= 1 && sortedInputs.every((entry) => entry.modality === 'image')
        ? 'image-to-video'
        : 'reference-to-video'
  const referenceInputs = sortedInputs.map((entry, index) => ({
    id: `${entry.refId ?? entry.node.key}_${index}`,
    sourceRefId: entry.refId ?? null,
    nodeKey: entry.node.key,
    label: entry.label,
    modality: entry.modality,
    url: entry.assetUrl ?? '',
    priority: getReferenceRolePriority(settings.presetFamily, entry.referenceRole ?? null, entry.priority),
    truncated: index >= 12,
  }))
  const keptReferenceInputs = referenceInputs.filter((entry, index) => !entry.truncated && index < 12)
  const droppedRefIds = referenceInputs.filter((entry) => entry.truncated).map((entry) => entry.sourceRefId ?? entry.id)
  const prompt = buildSeedanceTakePrompt({
    projectSummary: input.snapshot.project.summary,
    artStylePreset: artDirection.artStylePreset,
    take,
    takeTitle: input.takeNode.title,
    presetFamily: settings.presetFamily,
    shots,
    keptReferenceInputs,
  })
  const imageInputs = keptReferenceInputs.filter((entry) => entry.modality === 'image')
  const videoInputs = keptReferenceInputs.filter((entry) => entry.modality === 'video')
  const audioInputs = keptReferenceInputs.filter((entry) => entry.modality === 'audio')

  return {
    endpoint,
    modeReason:
      endpoint === 'image-to-video'
        ? 'Single take can be driven from a single primary image reference.'
        : 'Multi-shot continuity or multiple refs require reference-to-video.',
    prompt,
    resolution: settings.videoResolution === '480p' ? '480p' : '720p',
    duration: `${Math.min(15, Math.max(4, take.durationSeconds))}` as SeedanceExecutionPlan['duration'],
    aspectRatio: settings.stillAspectRatio,
    generateAudio: shots.some((shot) => shot.audio.length > 0 || shot.dialogue.length > 0),
    seed: null,
    imageUrl: endpoint === 'image-to-video' ? (imageInputs[0]?.url ?? null) : null,
    endImageUrl: endpoint === 'image-to-video' && imageInputs.length > 1 ? imageInputs[1]?.url ?? null : null,
    imageUrls: imageInputs.map((entry) => entry.url),
    videoUrls: videoInputs.map((entry) => entry.url),
    audioUrls: audioInputs.map((entry) => entry.url),
    referenceInputs: keptReferenceInputs,
    droppedRefIds,
  } satisfies SeedanceExecutionPlan
}

function buildSeedanceTakePrompt(input: {
  projectSummary: string
  artStylePreset: string
  take: ReturnType<typeof getCinematicTakeNodeConfig>
  takeTitle: string
  presetFamily: ReturnType<typeof getCinematicSettings>['presetFamily']
  shots: ReturnType<typeof getCinematicSequence>['shots']
  keptReferenceInputs: Array<{
    label: string
    modality: 'image' | 'video' | 'audio'
    sourceRefId: string | null
  }>
}) {
  const continuityAnchors = input.keptReferenceInputs.slice(0, 5).map((entry) => entry.label)
  const subjectSection = formatPromptSection('Subject', [
    input.take.directingPackage.subjectAnchor,
    continuityAnchors.length > 0 ? `continuity anchors ${continuityAnchors.join(', ')}` : null,
  ])
  const actionSection = formatPromptSection('Action', [
    input.take.directingPackage.dominantAction,
  ])
  const cameraSection = formatPromptSection('Camera', [
    input.take.directingPackage.primaryCameraMove,
  ])
  const styleSection = formatPromptSection('Style', [
    `Art style ${getArtStylePresetLabel(input.artStylePreset)}`,
    ...getArtStylePresetPromptDirectives(input.artStylePreset),
    ...input.take.directingPackage.styleDirectives,
  ])
  const constraintSection = formatPromptSection('Constraints', [
    input.take.directingPackage.proofSurfaceRole ? `keep ${input.take.directingPackage.proofSurfaceRole} readable` : null,
    ...input.take.directingPackage.continuityConstraints,
  ])
  const arcSummary =
    input.shots.length === 0
      ? null
      : input.shots.length === 1
        ? input.shots[0].beat.trim() || input.shots[0].title
        : `${input.shots[0].title} builds through ${input.shots.slice(1, -1).map((shot) => shot.title).join(', ') || 'the middle beats'} and lands on ${input.shots[input.shots.length - 1].title}.`
  const beatLines = input.shots.map((shot, index) => [
    `Beat ${index + 1}: ${shot.title}.`,
    `Segment duration: ${shot.durationSeconds}s.`,
    shot.hookRole ? `Role: ${shot.hookRole}.` : null,
    shot.targetEmotion.trim() ? `Target emotion: ${shot.targetEmotion.trim()}.` : null,
    shot.personaStyle.trim() ? `Persona or delivery: ${shot.personaStyle.trim()}.` : null,
    shot.beat.trim() ? `On-screen action: ${shot.beat.trim()}.` : null,
    shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
    shot.cameraMovement.trim() ? `Primary camera move: ${shot.cameraMovement.trim()}.` : null,
    shot.proofType.trim() ? `Proof cue: ${shot.proofType.trim()}.` : null,
    shot.ctaType.trim() ? `CTA style: ${shot.ctaType.trim()}.` : null,
    ...shot.dialogue.map((entry) => `Dialogue: ${entry.line}${entry.delivery ? ` (${entry.delivery})` : ''}.`),
    ...formatOverlayCues(shot.audio),
  ].filter((entry): entry is string => Boolean(entry)).join(' '))
  const presetDirectives =
    input.presetFamily === 'story_movie_tv'
      ? [
          'Treat this as one continuous cinematic take for film or TV.',
          'Prioritize continuity, motivated camera movement, and readable spatial progression.',
        ]
      : input.presetFamily === 'ugc_direct_response_ad'
        ? [
            'Treat this as a short-form direct-response ad take.',
            'Surface product, proof, and emotional payoff early while keeping the motion native and believable.',
          ]
        : input.presetFamily === 'ugc_faceless_format'
          ? [
              'Treat this as a faceless short-form take focused on process, object, or screen-led storytelling.',
              'Keep readability high for a mobile viewer and avoid dependence on facial acting.',
            ]
          : [
              'Treat this as a creator-native UGC take.',
              'Keep the framing and pacing believable for a handheld or creator-shot short-form video.',
            ]
  const subtypeLabel = input.take.formatSubtype ? getCinematicFormatSubtypeLabel(input.take.formatSubtype) : null
  const formulaLabel = input.take.formulaFamily ? getCinematicFormulaFamilyLabel(input.take.formulaFamily) : null
  const storySceneLabel =
    input.presetFamily === 'story_movie_tv'
      ? getCinematicStoryScenePresetLabel(input.take.storyScenePreset ?? null)
      : null
  const storyLanguageLabel =
    input.presetFamily === 'story_movie_tv'
      ? getCinematicStoryLanguagePresetLabel(input.take.storyLanguagePreset ?? null)
      : null
  const subtypeStyle = describeSubtypePromptStyle(input.take.formatSubtype ?? null)
  const referenceDirectives = input.keptReferenceInputs.map((entry, index) => {
    const tag = entry.modality === 'image' ? `@Image${index + 1}` : entry.modality === 'video' ? `@Video${index + 1}` : `@Audio${index + 1}`
    return `${tag} is ${entry.label}.`
  })

  return [
    `Create one continuous ${input.take.durationSeconds}-second video take titled "${input.takeTitle}".`,
    subjectSection,
    actionSection,
    cameraSection,
    styleSection,
    constraintSection,
    `Preset family: ${getCinematicPresetLabel(input.presetFamily)}.`,
    storySceneLabel ? `Story scene preset: ${storySceneLabel}.` : null,
    storyLanguageLabel ? `Story language preset: ${storyLanguageLabel}.` : null,
    subtypeLabel ? `Format subtype: ${subtypeLabel}.` : null,
    formulaLabel ? `Planned script formula: ${formulaLabel}.` : null,
    input.take.creativeTreatment ? `Creative treatment: ${getCinematicCreativeTreatmentLabel(input.take.creativeTreatment)}.` : null,
    input.take.hookFamily ? `Hook family: ${getCinematicHookFamilyLabel(input.take.hookFamily)}.` : null,
    input.take.narrationMode ? `Narration mode: ${getCinematicNarrationModeLabel(input.take.narrationMode)}.` : null,
    input.take.backdropRole ? `Backdrop role: ${input.take.backdropRole.replace(/_/g, ' ')}.` : null,
    input.take.backdropStrategy.trim() ? `Backdrop strategy: ${input.take.backdropStrategy.trim()}.` : null,
    input.take.variationLabel.trim() ? `Variation angle: ${input.take.variationLabel.trim()}.` : null,
    input.take.dominantTrigger ? `Dominant trigger: ${input.take.dominantTrigger.replace(/_/g, ' ')}.` : null,
    input.take.contrastAxis.trim() ? `Contrast axis: ${input.take.contrastAxis.trim()}.` : null,
    input.take.proofMoment.trim() ? `Proof moment: ${input.take.proofMoment.trim()}.` : null,
    input.take.ctaStyle.trim() ? `CTA style: ${input.take.ctaStyle.trim()}.` : null,
    ...presetDirectives,
    subtypeStyle,
    arcSummary ? `Overall arc: ${arcSummary}` : null,
    'Write motion and staging literally in Subject -> Action -> Camera -> Style -> Constraints order.',
    'Make each beat readable on mute from the visuals alone.',
    ...beatLines,
    ...referenceDirectives,
    'Use one dominant action arc and one primary camera path across the take.',
    input.take.narrationMode === 'spoken_over_footage'
      ? 'Let the backdrop or footage do real visual work while narration stays concise and punchy. Do not default to a talking head unless the references require it.'
      : null,
    input.take.narrationMode === 'sparse_overlay'
      ? 'Keep spoken language minimal and let the visuals or sparse overlays carry the structure.'
      : null,
    input.take.creativeTreatment === 'aesthetic_mismatch'
      ? 'Exploit the mismatch between calm or pleasing visuals and sharper narration before interrupting with concrete proof.'
      : null,
    input.take.creativeTreatment === 'comedic_absurd_container'
      ? 'Use absurd or funny packaging as the stop-scroll device, but keep the product payoff sincere and legible.'
      : null,
    input.take.formatSubtype === 'contrast_narrative'
      ? 'Keep both poles visible and readable whenever possible, and make the last beat the strongest winner or payoff image.'
      : null,
    isSerializedDramaSubtype(input.take.formatSubtype ?? null)
      ? 'Keep the conflict, reveal, and redemption visually distinct. Let the product or app arrive as the twist or rescue, not as an early interruption.'
      : null,
    subtypeLooksLikeAd(input.take.formatSubtype ?? null)
      ? 'Show the product or mechanism doing its job on screen and make proof legible early.'
      : null,
    'Preserve identity, wardrobe, product, and environment continuity across all beats and references.',
    'Do not introduce extra characters, props, cuts, captions, logos, or unrelated action.',
  ].filter((entry): entry is string => Boolean(entry)).join(' ')
}

export function buildStillPrompt(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  shotNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveShotSources>
}) {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const shot = getCinematicShotNodeConfig(input.shotNode)
  const sourceDescriptions = input.sourceInputs.map((entry) => {
    const role = entry.config.assetRole ?? entry.definition?.kind ?? 'source'
    const definitionName = entry.definition?.name ?? entry.config.definitionKey ?? entry.node.title
    const staging = entry.config.stagingNotes.trim()
    return staging
      ? `${role}: ${definitionName}. Staging notes: ${staging}.`
      : `${role}: ${definitionName}.`
  })

  return [
    'Create one cinematic keyframe still.',
    ...buildStoryboardStyleAnchor(input.snapshot.gameSpec ?? null, input.graph.metadata, input.sourceInputs),
    settings.presetFamily === 'story_movie_tv' ? `Scene bias: ${getCinematicStoryScenePresetLabel(shot.storyScenePreset ?? settings.storyScenePreset ?? null)}.` : null,
    settings.presetFamily === 'story_movie_tv' ? `Camera bias: ${getCinematicStoryLanguagePresetLabel(shot.storyLanguagePreset ?? settings.storyLanguagePreset ?? null)}.` : null,
    shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
    shot.cameraAngle.trim() ? `Camera angle: ${shot.cameraAngle.trim()}.` : null,
    shot.cameraMovement.trim() ? `Implied camera movement: ${shot.cameraMovement.trim()}.` : null,
    shot.lensPreference.trim() ? `Lens preference: ${shot.lensPreference.trim()}.` : null,
    input.shotNode.body?.text ? `Show this moment: ${String(input.shotNode.body.text).trim()}.` : null,
    shot.visualPrompt.trim() ? `Visual detail: ${shot.visualPrompt.trim()}.` : null,
    shot.compositionGuide.trim() ? `Composition: ${shot.compositionGuide.trim()}.` : null,
    ...sourceDescriptions,
    'Move the referenced characters, props, and environments into one coherent frame.',
    'Describe only what should be visible on screen.',
    'Use direct visual language. No ad copy, metaphor, or production-note filler.',
    subtypeLooksLikeAd(shot.formatSubtype ?? settings.formatSubtype ?? null)
      ? 'If the product is present, show it doing its job with visible proof instead of acting like a passive prop.'
      : null,
    shot.formatSubtype === 'contrast_narrative'
      ? 'Keep both poles readable in the frame and make the stronger winner state immediately obvious.'
      : null,
    isSerializedDramaSubtype(shot.formatSubtype ?? settings.formatSubtype ?? null)
      ? 'If this is a serialized-drama frame, make the emotional conflict or reveal legible in a single glance instead of relying on explanation.'
      : null,
    'Compose all supplied sources into one coherent scene with consistent scale, lighting, staging, and continuity.',
    'Do not render written words, letters, signage, brand marks, captions, subtitles, logos, watermarks, borders, split panels, or collage layout unless a supplied visual reference explicitly requires a specific real-world marking to remain consistent.',
  ].filter(Boolean).join(' ')
}

export function buildTakeStillPrompt(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  takeNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveTakeSources>
}) {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const take = getCinematicTakeNodeConfig(input.takeNode)
  const sequence = getCinematicSequence(input.graph.metadata)
  const takeShots = take.shotIds
    .map((shotId) => sequence.shots.find((entry) => entry.id === shotId) ?? null)
    .filter((entry): entry is typeof sequence.shots[number] => Boolean(entry))

  return [
    'Create one representative still frame from this cinematic take.',
    ...buildStoryboardStyleAnchor(input.snapshot.gameSpec ?? null, input.graph.metadata, input.sourceInputs),
    settings.presetFamily === 'story_movie_tv' ? `Scene bias: ${getCinematicStoryScenePresetLabel(take.storyScenePreset ?? settings.storyScenePreset ?? null)}.` : null,
    settings.presetFamily === 'story_movie_tv' ? `Camera bias: ${getCinematicStoryLanguagePresetLabel(take.storyLanguagePreset ?? settings.storyLanguagePreset ?? null)}.` : null,
    ...takeShots.map((shot, index) => [
      shot.beat.trim() ? `Beat ${index + 1}: ${shot.beat.trim()}.` : null,
      shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
      shot.cameraMovement.trim() ? `Movement: ${shot.cameraMovement.trim()}.` : null,
      shot.visualPrompt.trim() ? `Visual detail: ${shot.visualPrompt.trim()}.` : null,
    ].filter(Boolean).join(' ')),
    ...input.sourceInputs.map((entry) => `${entry.role ?? 'source'}: ${entry.definition?.name ?? entry.node.title}.`),
    'Choose one frame that best represents the take.',
    'Move the referenced characters, props, and environments into one coherent frame.',
    'Use direct visual language. No ad copy, metaphor, or production-note filler.',
    settings.presetFamily === 'story_movie_tv'
      ? 'Choose the strongest storyboard-like keyframe that communicates the take with clear cinematic continuity.'
      : settings.presetFamily === 'ugc_direct_response_ad'
        ? 'Choose the strongest hook or proof frame with readable product visibility, clear mechanism, and immediate clarity.'
        : settings.presetFamily === 'ugc_faceless_format'
          ? 'Choose the cleanest object, demo, or process frame with strong readability for short-form viewing.'
          : 'Choose a believable creator-native frame that feels captured inside a short-form UGC video.',
    take.formatSubtype === 'contrast_narrative'
      ? 'Keep both poles legible and choose the frame where the gap or winner state is most obvious.'
      : null,
    isSerializedDramaSubtype(take.formatSubtype ?? settings.formatSubtype ?? null)
      ? 'Choose the most legible conflict, reveal, or redemption frame so the serialized story reads even as a single still.'
      : null,
    'Do not render written words, letters, signage, brand marks, captions, subtitles, logos, watermarks, borders, split panels, or collage layout unless a supplied visual reference explicitly requires a specific real-world marking to remain consistent.',
  ].filter(Boolean).join(' ')
}

export function buildStoryboardStillPrompt(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  storyboardNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveStoryboardSources>
}) {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const config = getStoryboardRefNodeConfig(input.storyboardNode)
  const shots = resolveStoryboardTargetShots(input.graph, input.storyboardNode.key)
  const sourceDescriptions = buildStoryboardSourceDescriptions(input.sourceInputs)
  const styleAnchor = buildStoryboardStyleAnchor(input.snapshot.gameSpec ?? null, input.graph.metadata, input.sourceInputs)
  const derivedPanels = buildDerivedStoryboardPanelBeats(shots)

  if (config.storyboardKind === 'sequence_board') {
    const panelCount = Math.max(1, derivedPanels.length)
    return [
      'Create one multi-panel comic-ink storyboard board.',
      ...styleAnchor,
      describeStoryboardGrid(panelCount, settings.stillAspectRatio),
      'Use monochrome or restrained grayscale wash with bold silhouettes, clear action, and clean gutters.',
      `You must render exactly ${panelCount} distinct panels, matching PANEL 1 through PANEL ${panelCount} below in reading order.`,
      'Do not merge panels together, omit panels, duplicate panels, or invent extra panels beyond the numbered list.',
      'Place the referenced characters, props, and environments into each panel and preserve continuity across the board.',
      ...derivedPanels.map((panel, index) => buildStoryboardPanelDirection(panel, index)),
      config.notes.trim() ? `Scene note: ${config.notes.trim()}.` : null,
      config.generationPrompt.trim() ? `Visual note: ${config.generationPrompt.trim()}.` : null,
      ...sourceDescriptions,
      'Keep character likeness, costume continuity, and hero props faithful to the references.',
      'No captions, speech bubbles, handwritten notes, watermarks, or decorative mockup chrome.',
    ].filter(Boolean).join(' ')
  }

  const primaryShot = shots[0] ?? null
  return [
    'Create one comic-ink storyboard panel.',
    ...styleAnchor,
    'Use monochrome or restrained grayscale wash with bold silhouettes and readable action.',
    'Place the referenced subjects into the described scene with clear blocking and readable composition.',
    primaryShot ? buildStoryboardPanelDirection(primaryShot, 0) : null,
    config.notes.trim() ? `Scene note: ${config.notes.trim()}.` : null,
    config.generationPrompt.trim() ? `Visual note: ${config.generationPrompt.trim()}.` : null,
    ...sourceDescriptions,
    'Keep character likeness, costume continuity, and hero props faithful to the references.',
    'No captions, text labels, handwritten notes, sketch marks, multi-panel layout, watermarks, or decorative borders.',
  ].filter(Boolean).join(' ')
}

export function buildTakeStoryboardStillPrompt(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  takeNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveTakeSources>
}) {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const take = getCinematicTakeNodeConfig(input.takeNode)
  const sequence = getCinematicSequence(input.graph.metadata)
  const compiledTake = sequence.takes.find((entry) => entry.id === take.id) ?? null
  const storyboardTake = resolveTakeStoryboardPromptSource({ nodeTake: take, compiledTake })
  const shots = storyboardTake.shotIds
    .map((shotId) => sequence.shots.find((shot) => shot.id === shotId) ?? null)
    .filter((shot): shot is typeof sequence.shots[number] => Boolean(shot))
  const sourceDescriptions = buildStoryboardSourceDescriptions(input.sourceInputs)
  const styleAnchor = buildStoryboardStyleAnchor(input.snapshot.gameSpec ?? null, input.graph.metadata, input.sourceInputs)
  const scriptedPanelSource = (storyboardTake.storyboardPanelPlan?.panels?.length ?? 0) > 0
    ? storyboardTake.storyboardPanelPlan?.panels ?? []
    : parseTakeStoryboardPanelScriptText(storyboardTake.storyboardPanelScriptText)
  const scriptedPanels = scriptedPanelSource.map((panel) => ({
    title: panel.title || `Panel ${panel.id}`,
    beat: panel.description,
    framing: '',
    cameraAngle: panel.cameraAngle,
    cameraMovement: panel.cameraMotion,
  }))
  const derivedPanels = scriptedPanels.length > 0 ? scriptedPanels : buildDerivedStoryboardPanelBeats(shots)
  const panelCount = Math.max(1, derivedPanels.length)

  return [
    'Create one multi-panel comic-ink storyboard board.',
    ...styleAnchor,
    describeStoryboardGrid(panelCount, settings.stillAspectRatio),
    'Use monochrome or restrained grayscale wash with bold silhouettes, clear action, and clean gutters.',
    `You must render exactly ${panelCount} distinct panels, matching PANEL 1 through PANEL ${panelCount} below in reading order.`,
    'Do not merge panels together, omit panels, duplicate panels, or invent extra panels beyond the numbered list.',
    'Keep the panels consistent in size, silhouette clarity, and overall continuity.',
    scriptedPanels.length > 0
      ? 'Follow the supplied panel script closely. Treat each panel as a storyboard beat inside the same take, not as a separate editorial cut unless the panel description itself implies one.'
      : 'Split continuous action into extra panels only when the choreography needs it.',
    'Place the referenced characters, props, and environments into each panel and preserve continuity across the board.',
    ...derivedPanels.map((panel, index) => buildStoryboardPanelDirection(panel, index)),
    storyboardTake.proofMoment.trim() ? `Show this proof visually: ${storyboardTake.proofMoment.trim()}.` : null,
    storyboardTake.contrastAxis.trim() ? `Show this contrast visually: ${storyboardTake.contrastAxis.trim()}.` : null,
    ...sourceDescriptions,
    'Use referenced characters, environments, and hero objects when valid image refs are available; otherwise infer only missing details from the sequence beats.',
    'Keep character likeness, costume continuity, and hero props faithful to the references.',
    'No captions, panel numbers, text labels, handwritten notes, speech bubbles, watermarks, or decorative mockup chrome.',
  ].filter(Boolean).join(' ')
}

export function buildVideoPrompt(input: {
  snapshot: { project: { name: string; summary: string }; gameSpec?: unknown | null }
  graph: SnapshotGraph
  shotNode: SnapshotNode
  sourceInputs: ReturnType<typeof resolveShotSources>
}) {
  const settings = getCinematicSettings(input.snapshot.gameSpec ?? null, input.graph.metadata)
  const shot = getCinematicShotNodeConfig(input.shotNode)
  const movementLabel = shot.cameraMovement.trim() ? `[${shot.cameraMovement.trim()}]` : '[Static shot]'

  return [
    movementLabel,
    `Create a ${shot.durationSeconds ?? settings.defaultClipSeconds}-second cinematic clip for "${input.shotNode.title}".`,
    `Preset family: ${getCinematicPresetLabel(settings.presetFamily)}.`,
    settings.presetFamily === 'story_movie_tv' ? `Story scene preset: ${getCinematicStoryScenePresetLabel(shot.storyScenePreset ?? settings.storyScenePreset ?? null)}.` : null,
    settings.presetFamily === 'story_movie_tv' ? `Story language preset: ${getCinematicStoryLanguagePresetLabel(shot.storyLanguagePreset ?? settings.storyLanguagePreset ?? null)}.` : null,
    shot.formatSubtype ? `Format subtype: ${getCinematicFormatSubtypeLabel(shot.formatSubtype)}.` : null,
    shot.formulaFamily ? `Planned script formula: ${getCinematicFormulaFamilyLabel(shot.formulaFamily)}.` : null,
    shot.creativeTreatment ? `Creative treatment: ${getCinematicCreativeTreatmentLabel(shot.creativeTreatment)}.` : null,
    shot.hookFamily ? `Hook family: ${getCinematicHookFamilyLabel(shot.hookFamily)}.` : null,
    shot.narrationMode ? `Narration mode: ${getCinematicNarrationModeLabel(shot.narrationMode)}.` : null,
    shot.backdropStrategy.trim() ? `Backdrop strategy: ${shot.backdropStrategy.trim()}.` : null,
    shot.dominantTrigger ? `Dominant trigger: ${shot.dominantTrigger.replace(/_/g, ' ')}.` : null,
    input.shotNode.body?.text ? `Script beat: ${String(input.shotNode.body.text).trim()}.` : null,
    shot.visualPrompt.trim() ? `Additional visual direction: ${shot.visualPrompt.trim()}.` : null,
    shot.compositionGuide.trim() ? `Composition guide: ${shot.compositionGuide.trim()}.` : null,
    shot.framing.trim() ? `Framing: ${shot.framing.trim()}.` : null,
    shot.cameraAngle.trim() ? `Camera angle: ${shot.cameraAngle.trim()}.` : null,
    shot.lensPreference.trim() ? `Lens preference: ${shot.lensPreference.trim()}.` : null,
    ...formatOverlayCues(shot.audio),
    input.sourceInputs.map((entry) => `${entry.config.assetRole ?? entry.definition?.kind ?? 'source'}: ${entry.definition?.name ?? entry.node.title}.`).join(' '),
    describePresetPromptStyle(settings.presetFamily),
    describeSubtypePromptStyle(shot.formatSubtype ?? settings.formatSubtype ?? null),
    'Use literal visual phrasing and readable on-screen action rather than polished advertising copy.',
    shot.narrationMode === 'spoken_over_footage'
      ? 'Let the backdrop or footage carry the visual engagement while narration stays concise and product-relevant.'
      : null,
    shot.creativeTreatment === 'contrast_split'
      ? 'Keep the contrast immediately legible and avoid collapsing into a generic single-subject frame.'
      : null,
    subtypeLooksLikeAd(shot.formatSubtype ?? settings.formatSubtype ?? null)
      ? 'Show the product or mechanism doing its job and make proof readable in frame.'
      : null,
    shot.formatSubtype === 'contrast_narrative'
      ? 'Keep both poles readable and make the gap visibly wider than the previous beat.'
      : null,
  ].filter(Boolean).join(' ')
}

function inferStorageFileExtension(kind: 'image' | 'video', sourceUrl: string | null, contentType: string | null) {
  if (kind === 'video') return '.mp4'
  if (contentType?.includes('webp') || sourceUrl?.toLowerCase().includes('.webp')) return '.webp'
  return '.png'
}

function normalizeStorageSlug(value: string, maxLength = 48) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLength)
}

function hashStorageIdentity(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function buildDeterministicScopedIdentity(value: string) {
  const primary = hashStorageIdentity(value)
  const secondary = hashStorageIdentity(`v2|${value}|take_asset`)
  return `${primary}${secondary}`
}

function isProjectAssetStoragePathConflict(message: string | null | undefined) {
  return typeof message === 'string'
    && message.includes('project_assets_project_id_storage_path_key')
}

function toAssetDefinition(row: {
  id: string
  key: string
  name: string
  kind: string
  mime_type: string
  storage_path: string
  metadata: unknown
  llm_hints: unknown
}) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {},
    llmHints: row.llm_hints && typeof row.llm_hints === 'object' ? row.llm_hints as Record<string, unknown> : {},
  }
}

function buildExternalGeneratedImageStoragePath(
  assetKey: string,
  sourceUrl: string | null,
  requestId: string | null,
  variant?: string | null,
) {
  const extension = inferStorageFileExtension('image', sourceUrl, null)
  const assetSlug = normalizeStorageSlug(assetKey, 48) || 'generated_asset'
  const requestSlug = normalizeStorageSlug(requestId ?? 'generated', 20) || 'generated'
  const identity = hashStorageIdentity([
    assetKey,
    requestId ?? 'generated',
    sourceUrl ?? '',
    variant ?? '',
  ].join('|'))
  return `external/generated/${assetSlug}_${requestSlug}_${identity}${extension}`
}

async function loadProjectAssetByKey(
  client: ReturnType<typeof createClient>,
  projectId: string,
  assetKey: string,
) {
  const assetRow = await client
    .from('project_assets')
    .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
    .eq('project_id', projectId)
    .eq('key', assetKey)
    .maybeSingle()

  if (assetRow.error) {
    throw new Error(assetRow.error.message)
  }

  return assetRow.data
}

export async function reserveGeneratedImageAsset(input: {
  client: ReturnType<typeof createClient>
  projectId: string
  userId: string
  name: string
  metadata: Record<string, unknown>
  assetKey?: string | null
}) {
  const assetKey = input.assetKey?.trim() || `image.${buildAssetSlug(input.name) || crypto.randomUUID()}`
  const existingAsset = await loadProjectAssetByKey(input.client, input.projectId, assetKey)
  const currentMetadata = existingAsset?.metadata && typeof existingAsset.metadata === 'object'
    ? existingAsset.metadata as Record<string, unknown>
    : {}
  const desiredMetadata = {
    ...currentMetadata,
    ...input.metadata,
    placeholder: true,
    generationStatus: 'queued',
    generationError: null,
  }

  const persistReservedAsset = async (variant?: string | null) => {
    const storagePath = buildExternalGeneratedImageStoragePath(assetKey, null, null, variant)
    return existingAsset
      ? await input.client
          .from('project_assets')
          .update({
            name: input.name,
            kind: 'image',
            mime_type: 'image/png',
            storage_path: storagePath,
            metadata: desiredMetadata,
          })
          .eq('id', existingAsset.id)
          .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
          .single()
      : await input.client
          .from('project_assets')
          .insert({
            project_id: input.projectId,
            key: assetKey,
            name: input.name,
            kind: 'image',
            mime_type: 'image/png',
            storage_path: storagePath,
            metadata: desiredMetadata,
            llm_hints: {},
            created_by: input.userId,
          })
          .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
          .single()
  }

  let persistedAsset = await persistReservedAsset()
  if (persistedAsset.error && isProjectAssetStoragePathConflict(persistedAsset.error.message)) {
    persistedAsset = await persistReservedAsset(crypto.randomUUID())
  }

  if (persistedAsset.error || !persistedAsset.data) {
    throw new Error(persistedAsset.error?.message ?? 'Failed to reserve generated image asset.')
  }

  return toAssetDefinition(persistedAsset.data)
}

export function buildGraphScopedTakeAssetKey(input: {
  graphKey: string
  takeNodeKey: string
  kind: 'storyboard' | 'still' | 'video'
  uniqueScope?: string | null
}) {
  const graphHint = normalizeStorageSlug(input.graphKey.split('.').pop() ?? input.graphKey, 16) || 'graph'
  const takeHint = normalizeStorageSlug(input.takeNodeKey.split('.').pop() ?? input.takeNodeKey, 16) || 'take'
  const identity = buildDeterministicScopedIdentity([
    'cinematic_take_asset',
    'v3',
    input.kind,
    input.graphKey,
    input.takeNodeKey,
    input.uniqueScope ?? '',
  ].join('|'))
  const suffix = input.kind === 'storyboard'
    ? 'storyboard'
    : input.kind === 'still'
      ? 'still'
      : 'video'
  const assetKind = input.kind === 'video' ? 'video' : 'image'
  return `${assetKind}.cinematic_take_v3_${graphHint}_${takeHint}_${identity}_${suffix}`
}

export async function completeReservedGeneratedImageAsset(input: {
  client: ReturnType<typeof createClient>
  projectId: string
  assetKey: string
  imageUrl: string
  metadata: Record<string, unknown>
  name?: string | null
}) {
  const existingAsset = await loadProjectAssetByKey(input.client, input.projectId, input.assetKey)
  if (!existingAsset) {
    throw new Error(`Generated image asset "${input.assetKey}" was not found.`)
  }

  const currentMetadata = existingAsset.metadata && typeof existingAsset.metadata === 'object'
    ? existingAsset.metadata as Record<string, unknown>
    : {}
  const requestId = typeof input.metadata.requestId === 'string' ? input.metadata.requestId : null
  const persistCompletedAsset = async (variant?: string | null) => {
    const storagePath = buildExternalGeneratedImageStoragePath(input.assetKey, input.imageUrl, requestId, variant)
    return input.client
      .from('project_assets')
      .update({
        name: input.name?.trim() || existingAsset.name,
        kind: 'image',
        mime_type: inferStorageFileExtension('image', input.imageUrl, null) === '.webp' ? 'image/webp' : 'image/png',
        storage_path: storagePath,
        metadata: {
          ...currentMetadata,
          ...input.metadata,
          placeholder: false,
          generationStatus: 'completed',
          generationError: null,
          sourceUrl: input.imageUrl,
          previewUrl: input.imageUrl,
          generatedAt: new Date().toISOString(),
        },
      })
      .eq('id', existingAsset.id)
      .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
      .single()
  }

  let persistedAsset = await persistCompletedAsset()
  if (persistedAsset.error && isProjectAssetStoragePathConflict(persistedAsset.error.message)) {
    persistedAsset = await persistCompletedAsset(crypto.randomUUID())
  }

  if (persistedAsset.error || !persistedAsset.data) {
    throw new Error(persistedAsset.error?.message ?? `Failed to complete generated image asset "${input.assetKey}".`)
  }

  return toAssetDefinition(persistedAsset.data)
}

export async function markGeneratedImageAssetFailed(input: {
  client: ReturnType<typeof createClient>
  projectId: string
  assetKey: string
  errorMessage: string
  metadata?: Record<string, unknown>
}) {
  const existingAsset = await loadProjectAssetByKey(input.client, input.projectId, input.assetKey)
  if (!existingAsset) {
    return null
  }

  const currentMetadata = existingAsset.metadata && typeof existingAsset.metadata === 'object'
    ? existingAsset.metadata as Record<string, unknown>
    : {}
  const persistedAsset = await input.client
    .from('project_assets')
    .update({
      metadata: {
        ...currentMetadata,
        ...(input.metadata ?? {}),
        placeholder: false,
        generationStatus: 'failed',
        generationError: input.errorMessage,
        failedAt: new Date().toISOString(),
      },
    })
    .eq('id', existingAsset.id)
    .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
    .single()

  if (persistedAsset.error || !persistedAsset.data) {
    throw new Error(persistedAsset.error?.message ?? `Failed to mark generated image asset "${input.assetKey}" as failed.`)
  }

  return toAssetDefinition(persistedAsset.data)
}

export async function createStoredGeneratedAsset(input: {
  admin: ReturnType<typeof createClient>
  client: ReturnType<typeof createClient>
  projectId: string
  userId: string
  sourceUrl: string
  graphKey: string
  runId: string
  name: string
  kind: 'image' | 'video'
  metadata: Record<string, unknown>
  existingAssetKey?: string | null
}) {
  const assetKey = input.existingAssetKey?.trim() || `${input.kind}.${buildAssetSlug(`${input.name}_${input.runId}`) || crypto.randomUUID()}`
  let mimeType = input.kind === 'video' ? 'video/mp4' : 'image/png'
  let storagePath = ''
  let resolvedSourceUrl = input.sourceUrl

  if (input.kind === 'image') {
    const extension = inferStorageFileExtension(input.kind, input.sourceUrl, null)
    mimeType = extension === '.webp' ? 'image/webp' : 'image/png'
    storagePath = buildExternalGeneratedImageStoragePath(assetKey, input.sourceUrl, input.runId)
  } else {
    const uploadSource = await fetch(input.sourceUrl)
    if (!uploadSource.ok) {
      throw new Error(`Failed to download generated ${input.kind} from provider output.`)
    }

    mimeType = uploadSource.headers.get('content-type') ?? 'video/mp4'
    const extension = inferStorageFileExtension(input.kind, input.sourceUrl, mimeType)
    storagePath = `generated/cinematics/${buildAssetSlug(input.graphKey) || 'graph'}/${input.runId}/${assetKey}${extension}`
    const blob = await uploadSource.blob()

    const uploadResponse = await input.admin.storage.from('project-assets').upload(storagePath, blob, {
      contentType: mimeType,
      upsert: true,
    })

    if (uploadResponse.error) {
      throw new Error(uploadResponse.error.message)
    }

    const signedResponse = await input.admin.storage.from('project-assets').createSignedUrl(storagePath, 60 * 60)
    resolvedSourceUrl = !signedResponse.error && signedResponse.data?.signedUrl ? signedResponse.data.signedUrl : input.sourceUrl
  }

  const desiredMetadata = {
    ...input.metadata,
    ...(input.kind === 'video' ? { storageBucket: 'project-assets' } : {}),
    placeholder: false,
    generationStatus: 'completed',
    sourceUrl: resolvedSourceUrl,
    previewUrl: input.kind === 'image' ? resolvedSourceUrl : input.metadata.previewUrl ?? resolvedSourceUrl,
  }

  const existingAsset =
    input.existingAssetKey?.trim()
      ? await input.client
          .from('project_assets')
          .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
          .eq('project_id', input.projectId)
          .eq('key', assetKey)
          .maybeSingle()
      : null

  if (existingAsset?.error) {
    throw new Error(existingAsset.error.message)
  }

  const persistStoredAsset = async (variant?: string | null) => {
    const effectiveStoragePath =
      input.kind === 'image'
        ? buildExternalGeneratedImageStoragePath(assetKey, input.sourceUrl, input.runId, variant)
        : storagePath

    return existingAsset?.data
      ? await input.client
          .from('project_assets')
          .update({
            name: input.name,
            kind: input.kind,
            mime_type: mimeType,
            storage_path: effectiveStoragePath,
            metadata: {
              ...((existingAsset.data.metadata ?? {}) as Record<string, unknown>),
              ...desiredMetadata,
            },
          })
          .eq('id', existingAsset.data.id)
          .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
          .single()
      : await input.client
          .from('project_assets')
          .insert({
            project_id: input.projectId,
            key: assetKey,
            name: input.name,
            kind: input.kind,
            mime_type: mimeType,
            storage_path: effectiveStoragePath,
            metadata: desiredMetadata,
            llm_hints: {},
            created_by: input.userId,
          })
          .select('id, key, name, kind, mime_type, storage_path, metadata, llm_hints')
          .single()
  }

  let persistedAsset = await persistStoredAsset()
  if (
    input.kind === 'image'
    && persistedAsset.error
    && isProjectAssetStoragePathConflict(persistedAsset.error.message)
  ) {
    persistedAsset = await persistStoredAsset(crypto.randomUUID())
  }

  if (persistedAsset.error || !persistedAsset.data) {
    throw new Error(persistedAsset.error?.message ?? `Failed to store generated ${input.kind} asset.`)
  }

  return {
    id: persistedAsset.data.id,
    key: persistedAsset.data.key,
    name: persistedAsset.data.name,
    kind: persistedAsset.data.kind,
    mimeType: persistedAsset.data.mime_type,
    storagePath: persistedAsset.data.storage_path,
    metadata: persistedAsset.data.metadata ?? {},
    llmHints: persistedAsset.data.llm_hints ?? {},
  }
}

export async function persistShotBindingsIfPresent(
  client: ReturnType<typeof createClient>,
  draftId: string,
  graphKey: string,
  shotNodeKey: string,
  shotId: string | null,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getCinematicShotNodeConfig>>
  },
) {
  const graphRow = await client.from('draft_graphs').select('id, metadata').eq('draft_id', draftId).eq('key', graphKey).maybeSingle()
  if (graphRow.error || !graphRow.data) return

  if (shotId) {
    const nextMetadata = updateSequenceShotBindingsInGraph({
      key: graphKey,
      name: graphKey,
      nodes: [],
      edges: [],
      metadata: asRecord(graphRow.data.metadata),
    } as SnapshotGraph, shotId, { metadata: changes.metadata }).metadata

    await client
      .from('draft_graphs')
      .update({ metadata: nextMetadata })
      .eq('id', graphRow.data.id)
  }

  const nodeRow = await client
    .from('draft_graph_nodes')
    .select('body, metadata, display')
    .eq('graph_id', graphRow.data.id)
    .eq('key', shotNodeKey)
    .maybeSingle()

  if (nodeRow.error || !nodeRow.data) return

  const currentBody = asRecord(nodeRow.data.body)
  const currentMetadata = asRecord(nodeRow.data.metadata)
  const currentDisplay = asRecord(nodeRow.data.display)

  await client
    .from('draft_graph_nodes')
    .update({
      body: changes.bodyImageAssetKey === undefined
        ? currentBody
        : {
            ...currentBody,
            imageAssetKey: changes.bodyImageAssetKey,
          },
      display: changes.bodyImageAssetKey === undefined
        ? currentDisplay
        : {
            ...currentDisplay,
            iconAssetKey: changes.bodyImageAssetKey,
          },
      metadata: updateNodeMetadataWithShot(currentMetadata, changes.metadata),
    })
    .eq('graph_id', graphRow.data.id)
    .eq('key', shotNodeKey)
}

export async function persistTakeBindingsIfPresent(
  client: ReturnType<typeof createClient>,
  draftId: string,
  graphKey: string,
  takeNodeKey: string,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getCinematicTakeNodeConfig>>
  },
) {
  const graphRow = await client.from('draft_graphs').select('id, metadata').eq('draft_id', draftId).eq('key', graphKey).maybeSingle()
  if (graphRow.error || !graphRow.data) return

  const nodeRow = await client
    .from('draft_graph_nodes')
    .select('body, metadata, display')
    .eq('graph_id', graphRow.data.id)
    .eq('key', takeNodeKey)
    .maybeSingle()

  if (nodeRow.error || !nodeRow.data) return

  const currentBody = asRecord(nodeRow.data.body)
  const currentMetadata = asRecord(nodeRow.data.metadata)
  const currentDisplay = asRecord(nodeRow.data.display)
  const currentTakeConfig = getCinematicTakeNodeConfig({ metadata: currentMetadata })
  const resolvedTakeId = changes.metadata.takeId ?? currentTakeConfig.id
  const resolvedTakeIndex =
    typeof changes.metadata.takeIndex === 'number'
      ? changes.metadata.takeIndex
      : typeof currentTakeConfig.takeIndex === 'number'
        ? currentTakeConfig.takeIndex
        : null

  if (resolvedTakeId || resolvedTakeIndex !== null) {
    const nextMetadata = updateSequenceTakeBindingsInGraph({
      key: graphKey,
      name: graphKey,
      nodes: [],
      edges: [],
      metadata: asRecord(graphRow.data.metadata),
    } as SnapshotGraph, {
      takeId: resolvedTakeId,
      takeIndex: resolvedTakeIndex,
    }, {
      metadata: {
        ...changes.metadata,
        takeId: resolvedTakeId,
        takeIndex: resolvedTakeIndex,
      },
    }).metadata

    await client
      .from('draft_graphs')
      .update({ metadata: nextMetadata })
      .eq('id', graphRow.data.id)
  }

  await client
    .from('draft_graph_nodes')
    .update({
      body: changes.bodyImageAssetKey === undefined
        ? currentBody
        : {
            ...currentBody,
            imageAssetKey: changes.bodyImageAssetKey,
          },
      display: changes.bodyImageAssetKey === undefined
        ? currentDisplay
        : {
            ...currentDisplay,
            iconAssetKey: changes.bodyImageAssetKey,
          },
      metadata: updateNodeMetadataWithTake(currentMetadata, changes.metadata),
    })
    .eq('graph_id', graphRow.data.id)
    .eq('key', takeNodeKey)
}

export async function persistStoryboardBindingsIfPresent(
  client: ReturnType<typeof createClient>,
  draftId: string,
  graphKey: string,
  storyboardNodeKey: string,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getStoryboardRefNodeConfig>>
  },
) {
  const graphRow = await client.from('draft_graphs').select('id').eq('draft_id', draftId).eq('key', graphKey).maybeSingle()
  if (graphRow.error || !graphRow.data) return

  const nodeRow = await client
    .from('draft_graph_nodes')
    .select('body, metadata, display')
    .eq('graph_id', graphRow.data.id)
    .eq('key', storyboardNodeKey)
    .maybeSingle()

  if (nodeRow.error || !nodeRow.data) return

  const currentBody = asRecord(nodeRow.data.body)
  const currentMetadata = asRecord(nodeRow.data.metadata)
  const currentDisplay = asRecord(nodeRow.data.display)

  await client
    .from('draft_graph_nodes')
    .update({
      body: changes.bodyImageAssetKey === undefined
        ? currentBody
        : {
            ...currentBody,
            imageAssetKey: changes.bodyImageAssetKey,
          },
      display: changes.bodyImageAssetKey === undefined
        ? currentDisplay
        : {
            ...currentDisplay,
            iconAssetKey: changes.bodyImageAssetKey,
          },
      metadata: updateNodeMetadataWithStoryboardRef(currentMetadata, changes.metadata),
    })
    .eq('graph_id', graphRow.data.id)
    .eq('key', storyboardNodeKey)
}

export function applyShotBindingToGraph(
  graph: SnapshotGraph,
  shotNodeKey: string,
  shotId: string | null,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getCinematicShotNodeConfig>>
  },
) {
  const nextGraph = shotId ? updateSequenceShotBindingsInGraph(graph, shotId, { metadata: changes.metadata }) : graph
  return {
    ...nextGraph,
    nodes: nextGraph.nodes.map((node) => {
      if (node.key !== shotNodeKey) return node
      const currentBody = asRecord(node.body)
      return {
        ...node,
        body: changes.bodyImageAssetKey === undefined
          ? currentBody
          : {
              ...currentBody,
              imageAssetKey: changes.bodyImageAssetKey,
            },
        display: changes.bodyImageAssetKey === undefined
          ? asRecord(node.display)
          : {
              ...asRecord(node.display),
              iconAssetKey: changes.bodyImageAssetKey,
            },
        metadata: updateNodeMetadataWithShot(asRecord(node.metadata), changes.metadata),
      }
    }),
  }
}

export function applyTakeBindingToGraph(
  graph: SnapshotGraph,
  takeNodeKey: string,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getCinematicTakeNodeConfig>>
  },
) {
  const currentTakeNode = graph.nodes.find((node) => node.key === takeNodeKey) ?? null
  const currentTakeConfig = currentTakeNode ? getCinematicTakeNodeConfig(currentTakeNode) : null
  const takeId = changes.metadata.takeId
    ?? currentTakeConfig?.id
    ?? null
  const takeIndex =
    typeof changes.metadata.takeIndex === 'number'
      ? changes.metadata.takeIndex
      : typeof currentTakeConfig?.takeIndex === 'number'
        ? currentTakeConfig.takeIndex
        : null
  const nextGraph = (takeId || takeIndex !== null)
    ? updateSequenceTakeBindingsInGraph(graph, { takeId, takeIndex }, { metadata: { ...changes.metadata, takeId, takeIndex } })
    : graph

  return {
    ...nextGraph,
    nodes: nextGraph.nodes.map((node) => {
      if (node.key !== takeNodeKey) return node
      const currentBody = asRecord(node.body)
      return {
        ...node,
        body: changes.bodyImageAssetKey === undefined
          ? currentBody
          : {
              ...currentBody,
              imageAssetKey: changes.bodyImageAssetKey,
            },
        display: changes.bodyImageAssetKey === undefined
          ? asRecord(node.display)
          : {
              ...asRecord(node.display),
              iconAssetKey: changes.bodyImageAssetKey,
            },
        metadata: updateNodeMetadataWithTake(asRecord(node.metadata), changes.metadata),
      }
    }),
  }
}

export function applyStoryboardBindingToGraph(
  graph: SnapshotGraph,
  storyboardNodeKey: string,
  changes: {
    bodyImageAssetKey?: string | null
    metadata: Partial<ReturnType<typeof getStoryboardRefNodeConfig>>
  },
) {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.key !== storyboardNodeKey) return node
      const currentBody = asRecord(node.body)
      return {
        ...node,
        body: changes.bodyImageAssetKey === undefined
          ? currentBody
          : {
              ...currentBody,
              imageAssetKey: changes.bodyImageAssetKey,
            },
        display: changes.bodyImageAssetKey === undefined
          ? asRecord(node.display)
          : {
              ...asRecord(node.display),
              iconAssetKey: changes.bodyImageAssetKey,
            },
        metadata: updateNodeMetadataWithStoryboardRef(asRecord(node.metadata), changes.metadata),
      }
    }),
  }
}

export function toCinematicRun(input: {
  row: Record<string, unknown>
  jobs: CinematicRunJob[]
}) {
  return cinematicRunSchema.parse({
    id: input.row.id,
    draftId: input.row.draft_id,
    projectId: input.row.project_id,
    graphKey: input.row.graph_key,
    graphName: input.row.graph_name,
    mode: input.row.mode,
    status: input.row.status,
    shotNodeKey: input.row.shot_node_key ?? null,
    diagnostics: Array.isArray(input.row.diagnostics) ? input.row.diagnostics : [],
    createdAt: input.row.created_at,
    updatedAt: input.row.updated_at,
    jobs: input.jobs,
  })
}

export function toCinematicRunJob(row: Record<string, unknown>) {
  const resultContext = row.result_context ? asRecord(row.result_context) : null
  return cinematicRunJobSchema.parse({
    id: row.id,
    runId: row.run_id,
    graphKey: row.graph_key,
    shotNodeKey: row.shot_node_key,
    shotId: typeof resultContext?.shotId === 'string' ? resultContext.shotId : null,
    kind: row.kind,
    status: row.status,
    orderIndex: row.order_index ?? 0,
    dependsOnJobIds: asStringArray(row.depends_on_job_ids),
    stillAssetKey: row.still_asset_key ?? null,
    videoAssetKey: row.video_asset_key ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    providerRequestId: row.provider_request_id ?? null,
    errorMessage: row.error_message ?? null,
    prompt: typeof row.prompt === 'string' ? row.prompt : '',
    resultContext,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function isTerminalCinematicRunStatus(status: string) {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status)
}

export function isTerminalCinematicJobStatus(status: string) {
  return ['succeeded', 'failed', 'cancelled', 'skipped'].includes(status)
}

