import {
  buildCinematicV3StoryboardLayout,
  cinematicV2ScreenplayDraftSchema,
  cinematicV2ShotPlanSchema,
  cinematicV2ShotSchema,
  cinematicV2StoryboardGroupPlanSchema,
  deriveCinematicV2MaxShotCount,
  providerSafeCinematicV2DurationSeconds,
} from '../../../src/domain/cinematics.ts'
import {
  buildSequenceAnimaticContinuityPlannerContext,
  sequenceAnimaticReferenceCatalog,
} from './output-workflow-sequence-animatic-reference-runtime.ts'
import {
  sequenceAnimaticShotContinuityPlanV2Schema,
} from './output-workflow-sequence-animatic-shot-continuity-contracts.ts'
import {
  sequenceAnimaticUniqueTexts,
} from './output-workflow-sequence-animatic-shot-binding-runtime.ts'
import {
  normalizeSequenceAnimaticDirectorPlan,
  type SequenceAnimaticDirectorPlanRuntimeHelpers as SequenceAnimaticDirectorPlanNormalizationHelpers,
} from './output-workflow-sequence-animatic-director-plan-runtime.ts'
import {
  buildFallbackSequenceAnimaticSceneGraphAssignment,
  buildSequenceAnimaticScenePackageFromTaggedScreenplay,
  mergeSequenceAnimaticSceneGraphAssignment,
  sequenceAnimaticSceneGraphAssignmentSchema,
  sequenceAnimaticScenePackageOutputSchema,
  sequenceAnimaticTaggedScenePackageSchema,
} from './output-workflow-sequence-animatic-scene-package-runtime.ts'

type LooseRecord = Record<string, unknown>

type CinematicV3ShotBreak = {
  id: string
  index: number
  title: string
  approximateDurationSeconds: number
  startOffset: number
  endOffset: number
  text: string
}

type CinematicV3ShotBreakGroup = {
  id: string
  index: number
  shotBreakIds: string[]
  shotBreaks: CinematicV3ShotBreak[]
  title: string
  summary: string
  startOffset: number
  endOffset: number
  screenplayExcerpt: string
  approximateDurationSeconds: number
  rows: number
  columns: number
  panelCount: number
}

type SequenceAnimaticDynamicFanoutNodeInput = {
  key: string
  nodeType: string
  label: string
  x: number
  y: number
  config: LooseRecord
}

type SequenceAnimaticDynamicFanoutEdgeInput = {
  key: string
  sourceNodeKey: string
  sourcePort: string
  targetNodeKey: string
  targetPort: string
  metadata?: LooseRecord
}

export type SequenceAnimaticDynamicFanoutRowFactories<TNode extends LooseRecord = LooseRecord, TEdge extends LooseRecord = LooseRecord> = {
  node: (input: SequenceAnimaticDynamicFanoutNodeInput) => TNode
  edge: (input: SequenceAnimaticDynamicFanoutEdgeInput) => TEdge
}

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function mergeById<T extends { id?: unknown; shotIds?: unknown; storyboardBlockIds?: unknown }>(
  records: T[] = [],
) {
  const byId = new Map<string, T>()
  for (const entry of records) {
    const id = readText(entry.id)
    if (!id) continue
    const previous = byId.get(id)
    byId.set(id, previous
      ? {
        ...previous,
        ...entry,
        shotIds: [...new Set([...readStringArray(previous.shotIds), ...readStringArray(entry.shotIds)])],
        storyboardBlockIds: [...new Set([...readStringArray(previous.storyboardBlockIds), ...readStringArray(entry.storyboardBlockIds)])],
      }
      : entry)
  }
  return [...byId.values()]
}

export function buildSequenceAnimaticMasterDynamicFanoutRows<TNode extends LooseRecord = LooseRecord, TEdge extends LooseRecord = LooseRecord>(input: {
  factories: SequenceAnimaticDynamicFanoutRowFactories<TNode, TEdge>
  maxShotCount: number
  aspectRatio: string
  resolution: string
}) {
  const nodeRows = [
    input.factories.node({ key: 'sequence_animatic_director_plan', nodeType: 'utility_transform', label: 'Shot Continuity Plan', x: 1960, y: 120, config: { purpose: 'sequence_animatic_director_plan', role: 'sequence_animatic_director_plan', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', maxShotCount: input.maxShotCount, aspectRatio: input.aspectRatio, resolution: input.resolution, execution: { resourceClass: 'llm', groupKey: 'sequence_animatic_director_plan', maxConcurrency: 1 } } }),
    input.factories.node({ key: 'sequence_animatic_director_plan_artifact', nodeType: 'output_artifact', label: 'Register Shot Continuity Plan', x: 2240, y: 120, config: { purpose: 'sequence_animatic_director_plan_artifact', artifactKind: 'other', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', execution: { resourceClass: 'utility' } } }),
    input.factories.node({ key: 'sequence_animatic_manifest', nodeType: 'utility_transform', label: 'Build Animatic Manifest', x: 2520, y: 120, config: { purpose: 'sequence_animatic_manifest', role: 'sequence_animatic_manifest', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', aspectRatio: input.aspectRatio, resolution: input.resolution, execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_manifest', maxConcurrency: 1 } } }),
    input.factories.node({ key: 'artifact', nodeType: 'output_artifact', label: 'Register Animatic Manifest', x: 2800, y: 120, config: { purpose: 'sequence_animatic_manifest_artifact', artifactKind: 'other', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', execution: { resourceClass: 'utility' } } }),
    input.factories.node({ key: 'sequence_animatic_orchestrator', nodeType: 'utility_transform', label: 'Queue Animatic Blocks', x: 3080, y: 120, config: { purpose: 'sequence_animatic_orchestrator', role: 'sequence_animatic_orchestrator', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', blockConcurrency: 1, autoStartStoryboards: true, autoStartVideos: false, execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_orchestrator', maxConcurrency: 1 } } }),
  ]
  const edgeRows = [
    input.factories.edge({ key: 'context__sequence_director_plan', sourceNodeKey: 'world_context', sourcePort: 'context', targetNodeKey: 'sequence_animatic_director_plan', targetPort: 'context' }),
    input.factories.edge({ key: 'guidance__sequence_director_plan', sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: 'sequence_animatic_director_plan', targetPort: 'guidance' }),
    input.factories.edge({ key: 'references__sequence_director_plan', sourceNodeKey: 'cinematic_v3_reference_select', sourcePort: 'asset_pack', targetNodeKey: 'sequence_animatic_director_plan', targetPort: 'asset_pack' }),
    input.factories.edge({ key: 'screenplay__sequence_director_plan', sourceNodeKey: 'cinematic_v3_screenplay_author', sourcePort: 'text', targetNodeKey: 'sequence_animatic_director_plan', targetPort: 'screenplay' }),
    input.factories.edge({ key: 'director_plan__director_plan_artifact', sourceNodeKey: 'sequence_animatic_director_plan', sourcePort: 'director_plan', targetNodeKey: 'sequence_animatic_director_plan_artifact', targetPort: 'director_plan' }),
    input.factories.edge({ key: 'director_plan__sequence_manifest', sourceNodeKey: 'sequence_animatic_director_plan', sourcePort: 'director_plan', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'director_plan' }),
    input.factories.edge({ key: 'screenplay__sequence_manifest', sourceNodeKey: 'cinematic_v3_screenplay_author', sourcePort: 'text', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'screenplay' }),
    input.factories.edge({ key: 'references__sequence_manifest', sourceNodeKey: 'cinematic_v3_reference_select', sourcePort: 'asset_pack', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'asset_pack' }),
    input.factories.edge({ key: 'context__sequence_manifest', sourceNodeKey: 'world_context', sourcePort: 'context', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'context' }),
    input.factories.edge({ key: 'sequence_manifest__artifact', sourceNodeKey: 'sequence_animatic_manifest', sourcePort: 'manifest', targetNodeKey: 'artifact', targetPort: 'input' }),
    input.factories.edge({ key: 'director_plan__orchestrator', sourceNodeKey: 'sequence_animatic_director_plan_artifact', sourcePort: 'director_plan', targetNodeKey: 'sequence_animatic_orchestrator', targetPort: 'director_plan' }),
    input.factories.edge({ key: 'sequence_manifest__orchestrator', sourceNodeKey: 'artifact', sourcePort: 'manifest', targetNodeKey: 'sequence_animatic_orchestrator', targetPort: 'manifest' }),
  ]
  return { nodeRows, edgeRows }
}

function truncateStatusText(value: string, maxLength = 4000) {
  const normalized = readText(value).replace(/\s+/g, ' ')
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...` : normalized
}

function parseCinematicV3ShotMarker(line: string) {
  const anchor = line.match(/^\s*#shot\b\s*:?\s*([^|(\n]+?)(?:\s*(?:\||\()\s*~?\s*(\d+(?:\.\d+)?)\s*s?\)?)?\s*$/i)
  if (anchor) {
    return {
      index: 0,
      title: anchor[1]?.trim() || '',
      durationSeconds: Number(anchor[2] ?? 0) || null,
      deterministicIndex: true,
    }
  }
  const html = line.match(/<!--\s*SHOT\s+(\d{1,3})\s*:\s*([^|>-]+?)(?:\s*\|\s*~?\s*(\d+(?:\.\d+)?)\s*s?)?\s*-->/i)
  if (html) {
    return {
      index: Number(html[1]) || 0,
      title: html[2]?.trim() || '',
      durationSeconds: Number(html[3] ?? 0) || null,
      deterministicIndex: false,
    }
  }
  const markdown = line.match(/^\s*(?:#{2,4}\s*)?SHOT\s+(\d{1,3})\s*[:\-]\s*([^|(\n]+?)(?:\s*(?:\||\()\s*~?\s*(\d+(?:\.\d+)?)\s*s?\)?)?\s*$/i)
  if (markdown) {
    return {
      index: Number(markdown[1]) || 0,
      title: markdown[2]?.trim() || '',
      durationSeconds: Number(markdown[3] ?? 0) || null,
      deterministicIndex: false,
    }
  }
  return null
}

function estimateCinematicV3ShotDurationSeconds(text: string, fallback = 3) {
  const explicit = text.match(/\b(?:duration|~)\s*:?\s*(\d+(?:\.\d+)?)\s*(?:sec|secs|second|seconds|s)\b/i)
  const value = Number(explicit?.[1] ?? 0)
  if (Number.isFinite(value) && value > 0) return Math.max(1, Math.min(8, value))
  const dialogueLineCount = (text.match(/^[A-Z][A-Z\s.'-]{1,40}\s*$/gm) ?? []).length
  const paragraphCount = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean).length
  return Math.max(2, Math.min(6, fallback + Math.min(2, Math.floor(paragraphCount / 2)) + Math.min(2, dialogueLineCount)))
}

function buildCinematicV3FallbackShotBreaks(markdown: string, maxShotCount: number): CinematicV3ShotBreak[] {
  const body = markdown.replace(/^#{1,3}\s+.*$/gm, '').trim()
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter((part) => part && !/^##\s*(Performance Notes|Visual Motifs)/i.test(part))
  const chunks: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph
    if (current && next.length > 900) {
      chunks.push(current)
      current = paragraph
    } else {
      current = next
    }
    if (chunks.length >= maxShotCount - 1) break
  }
  if (current && chunks.length < maxShotCount) chunks.push(current)
  const fallbackChunks = chunks.length > 0 ? chunks : [markdown.slice(0, 1200)]
  let searchOffset = 0
  return fallbackChunks.map((text, index) => {
    const foundOffset = markdown.indexOf(text, searchOffset)
    const startOffset = foundOffset >= 0 ? foundOffset : searchOffset
    searchOffset = startOffset + text.length
    return {
      id: `shot_${String(index + 1).padStart(3, '0')}`,
      index: index + 1,
      title: truncateStatusText(text.split(/\r?\n/).find((line) => line.trim())?.trim() || `Shot ${index + 1}`, 80),
      approximateDurationSeconds: estimateCinematicV3ShotDurationSeconds(text, 3),
      startOffset,
      endOffset: startOffset + text.length,
      text,
    }
  })
}

function cinematicV2LocationRefId(assetPack: LooseRecord, context: LooseRecord) {
  const entities = [
    ...readArray(assetPack.entities).map(asRecord),
    ...readArray(context.entities).map(asRecord),
  ]
  const location = entities.find((entity) => {
    const type = readText(entity.type) || readText(entity.role) || readText(entity.nodeType ?? entity.node_type)
    return ['place', 'environment', 'location', 'location_spot'].includes(type)
  })
  return readText(location?.key) || readText(location?.id)
}

export function buildCinematicV3ShotBreakPlan(input: {
  screenplayDraft: LooseRecord
  maxShotCount?: number
  maxPanelsPerSheet?: number
  maxDurationPerGroupSeconds?: number
}) {
  const draft = cinematicV2ScreenplayDraftSchema.safeParse(input.screenplayDraft)
  const markdown = draft.success ? draft.data.screenplayMarkdown : readText(input.screenplayDraft.screenplayMarkdown)
  const maxShotCount = Math.max(1, Math.min(36, Math.floor(input.maxShotCount ?? 18) || 18))
  const maxPanels = Math.max(1, Math.min(9, Math.floor(input.maxPanelsPerSheet ?? 9) || 9))
  const maxDuration = Math.max(1, Math.min(15, Number(input.maxDurationPerGroupSeconds ?? 15) || 15))
  const markerMatches: Array<{ marker: NonNullable<ReturnType<typeof parseCinematicV3ShotMarker>>, offset: number, markerText: string }> = []
  const markerPattern = /<!--\s*SHOT\s+\d{1,3}\s*:[\s\S]*?-->|^\s*#shot\b.*$|^\s*(?:#{2,4}\s*)?SHOT\s+\d{1,3}\s*[:\-].*$/gim
  for (const match of markdown.matchAll(markerPattern)) {
    const markerText = match[0] ?? ''
    const marker = parseCinematicV3ShotMarker(markerText)
    if (marker) markerMatches.push({ marker, offset: match.index ?? 0, markerText })
    if (markerMatches.length >= maxShotCount) break
  }
  let shotBreaks: CinematicV3ShotBreak[] = markerMatches.map((match, index) => {
    const nextOffset = markerMatches[index + 1]?.offset ?? markdown.length
    const textStart = match.offset + match.markerText.length
    const text = markdown.slice(textStart, nextOffset).trim()
    const duration = match.marker.durationSeconds || estimateCinematicV3ShotDurationSeconds(text, 3)
    const markerIndex = index + 1
    return {
      id: `shot_${String(markerIndex).padStart(3, '0')}`,
      index: markerIndex,
      title: truncateStatusText(match.marker.title || `Shot ${markerIndex}`, 80),
      approximateDurationSeconds: Math.max(1, Math.min(8, duration)),
      startOffset: match.offset,
      endOffset: nextOffset,
      text,
    }
  }).filter((shot) => shot.text.trim())
  const diagnostics: string[] = []
  if (shotBreaks.length === 0) {
    shotBreaks = buildCinematicV3FallbackShotBreaks(markdown, maxShotCount)
    diagnostics.push('No screenplay shot markers found; derived fallback shot breaks from screenplay paragraphs.')
  }
  shotBreaks = shotBreaks
    .slice(0, maxShotCount)
    .map((shot, index) => ({
      ...shot,
      id: `shot_${String(index + 1).padStart(3, '0')}`,
      index: index + 1,
    }))
  const groups: CinematicV3ShotBreakGroup[] = []
  let current: CinematicV3ShotBreak[] = []
  const flush = () => {
    if (!current.length) return
    const groupIndex = groups.length + 1
    const layout = buildCinematicV3StoryboardLayout(current.length)
    const excerpt = markdown.slice(current[0].startOffset, current[current.length - 1].endOffset).trim()
    const duration = current.reduce((total, shot) => total + shot.approximateDurationSeconds, 0)
    groups.push({
      id: `cinematic_v3_storyboard_group_${String(groupIndex).padStart(3, '0')}`,
      index: groupIndex,
      shotBreakIds: current.map((shot) => shot.id),
      shotBreaks: current,
      title: `Storyboard ${groupIndex}`,
      summary: current.map((shot) => shot.title).filter(Boolean).join(' / '),
      startOffset: current[0].startOffset,
      endOffset: current[current.length - 1].endOffset,
      screenplayExcerpt: excerpt,
      approximateDurationSeconds: duration,
      rows: layout.rows,
      columns: layout.columns,
      panelCount: layout.panelCount,
    })
    current = []
  }
  for (const shotBreak of shotBreaks) {
    const currentDuration = current.reduce((total, shot) => total + shot.approximateDurationSeconds, 0)
    if (current.length > 0 && (current.length >= maxPanels || currentDuration + shotBreak.approximateDurationSeconds > maxDuration)) flush()
    current.push(shotBreak)
  }
  flush()
  if (groups.length > 1) diagnostics.push(`Split ${shotBreaks.length} screenplay shot markers into ${groups.length} parse/storyboard groups.`)
  return {
    shotBreaks,
    groups,
    maxPanelsPerSheet: maxPanels,
    maxDurationPerGroupSeconds: maxDuration,
    diagnostics,
  }
}

export function buildSequenceAnimaticScriptShotProjection(shotBreakPlan: LooseRecord) {
  const rawShots = readArray(shotBreakPlan.shotBreaks ?? shotBreakPlan.shot_breaks).map(asRecord)
  const scriptShots = rawShots.map((shot, index) => {
    const shotIndex = Number(shot.index ?? 0) || index + 1
    const id = readText(shot.id) || `shot_${String(shotIndex).padStart(3, '0')}`
    const approximateDurationSeconds = Math.max(1, Math.min(12, Number(shot.approximateDurationSeconds ?? shot.durationSeconds ?? 0) || 3))
    return {
      id,
      index: shotIndex,
      title: truncateStatusText(readText(shot.title) || `Shot ${shotIndex}`, 80),
      approximateDurationSeconds,
      screenplayText: readText(shot.screenplayText) || readText(shot.screenplay_text) || readText(shot.text),
      startOffset: Number.isFinite(Number(shot.startOffset)) ? Number(shot.startOffset) : undefined,
      endOffset: Number.isFinite(Number(shot.endOffset)) ? Number(shot.endOffset) : undefined,
    }
  })
  const shotById = new Map(scriptShots.map((shot) => [shot.id, shot] as const))
  const scriptBlocks = readArray(shotBreakPlan.groups).map(asRecord).map((group, index) => {
    const blockIndex = Number(group.index ?? 0) || index + 1
    const shotIds = readStringArray(group.shotBreakIds ?? group.shot_break_ids)
      .filter((shotId) => shotById.has(shotId))
    const approximateDurationSeconds = Number(group.approximateDurationSeconds ?? 0)
      || shotIds.reduce((total, shotId) => total + (shotById.get(shotId)?.approximateDurationSeconds ?? 0), 0)
    return {
      id: readText(group.id) || `script_block_${String(blockIndex).padStart(3, '0')}`,
      index: blockIndex,
      title: truncateStatusText(readText(group.title) || readText(group.summary) || `Screenplay block ${blockIndex}`, 96),
      shotIds,
      approximateDurationSeconds,
    }
  }).filter((block) => block.shotIds.length > 0)
  if (scriptShots.length > 0 && scriptBlocks.length === 0) {
    scriptBlocks.push({
      id: 'script_block_001',
      index: 1,
      title: 'Screenplay shots',
      shotIds: scriptShots.map((shot) => shot.id),
      approximateDurationSeconds: scriptShots.reduce((total, shot) => total + shot.approximateDurationSeconds, 0),
    })
  }
  return {
    scriptShotStatus: scriptShots.length > 0 ? 'ready' : 'missing',
    scriptShots,
    scriptBlocks,
  }
}

export function buildSequenceAnimaticShotPlanFromBreaks(input: {
  shotBreakPlan: LooseRecord
  assetPack: LooseRecord
  context?: LooseRecord
}) {
  const shotBreaks = Array.isArray(input.shotBreakPlan.shotBreaks)
    ? input.shotBreakPlan.shotBreaks.map(asRecord)
    : []
  const fallbackLocationRefId = cinematicV2LocationRefId(input.assetPack, input.context ?? {})
  const shots = shotBreaks.map((shotBreak, index) => {
    const shotId = readText(shotBreak.id) || `shot_${String(index + 1).padStart(3, '0')}`
    const duration = Math.max(1, Math.min(8, Number(shotBreak.approximateDurationSeconds ?? 0) || 3))
    const title = truncateStatusText(readText(shotBreak.title) || `Shot ${index + 1}`, 80)
    const action = readText(shotBreak.text) || title
    const purpose = index === 0
      ? 'establishing'
      : index === shotBreaks.length - 1 ? 'closing' : 'action'
    return cinematicV2ShotSchema.parse({
      id: shotId,
      sceneId: 'sequence_animatic_master',
      index: index + 1,
      title,
      purpose,
      editorialDurationSeconds: duration,
      providerDurationSeconds: providerSafeCinematicV2DurationSeconds(duration),
      description: action,
      action,
      caption: title,
      lighting: '',
      mood: '',
      storyboardPanelPrompt: `Storyboard ${shotId}: ${action}`,
      videoDirection: action,
      dialogue: [],
      speakerRefIds: [],
      visibleCharacterRefIds: [],
      performanceBeats: [],
      locationRefId: fallbackLocationRefId,
      worldLocationRefId: fallbackLocationRefId,
      propRefIds: [],
      continuityInputs: [],
      camera: {
        framing: index === 0 ? 'wide establishing frame' : 'readable cinematic frame',
        angle: 'eye level',
        lens: '',
        movement: index === 0 ? 'controlled establishing movement' : 'motivated shot movement',
        screenDirectionRule: '',
      },
      requiresLipSync: false,
      status: 'planned',
    })
  })
  return cinematicV2ShotPlanSchema.parse({
    sceneId: 'sequence_animatic_master',
    totalEditorialDurationSeconds: Math.max(1, shots.reduce((total, shot) => total + shot.editorialDurationSeconds, 0)),
    shots,
    performanceArc: [],
    audioPlan: { ambience: '', music: '', sfx: [], dialogueTrackCount: 0, placeholderOnly: true },
    diagnostics: ['Derived initial sequence animatic shot plan from screenplay shot breaks; shot continuity plan will assign final references and continuity graph bindings.'],
  })
}

export function buildCinematicV3StoryboardGroupFromShotBreakGroup(
  group: LooseRecord,
  index: number,
) {
  const groupIndex = Number(group.index ?? 0) || index + 1
  const shotIds = readStringArray(group.shotBreakIds).length > 0
    ? readStringArray(group.shotBreakIds)
    : (Array.isArray(group.shotBreaks) ? group.shotBreaks.map(asRecord).map((shot) => readText(shot.id)).filter(Boolean) : [])
  const panelCount = Math.max(1, Math.min(9, Number(group.panelCount ?? 0) || shotIds.length || 1))
  const layout = buildCinematicV3StoryboardLayout(panelCount)
  const duration = Math.max(1, Math.min(15, Number(group.approximateDurationSeconds ?? group.editorialDurationSeconds ?? 0) || panelCount * 3))
  const startSeconds = Math.max(0, Number(group.startSeconds ?? 0) || 0)
  return cinematicV2StoryboardGroupPlanSchema.shape.groups.element.parse({
    id: readText(group.id) || `cinematic_v3_storyboard_group_${String(groupIndex).padStart(3, '0')}`,
    index: groupIndex,
    shotIds: shotIds.length > 0 ? shotIds.slice(0, 9) : [`shot_${String(groupIndex).padStart(3, '0')}`],
    summary: readText(group.summary) || readText(group.title) || `Storyboard ${groupIndex}`,
    rows: layout.rows,
    columns: layout.columns,
    panelCount: layout.panelCount,
    startSeconds,
    endSeconds: startSeconds + duration,
    editorialDurationSeconds: duration,
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(duration),
    continuityNotes: [
      ...readStringArray(group.continuityNotes),
      `Storyboard block ${groupIndex} from screenplay shot markers.`,
    ],
  })
}

export function collectCinematicV3ShotPlansFromUpstream(upstream: Record<string, LooseRecord>) {
  return Object.values(upstream)
    .map((outputs) => cinematicV2ShotPlanSchema.safeParse(outputs.shotPlan ?? outputs.shot_plan))
    .filter((result): result is { success: true; data: ReturnType<typeof cinematicV2ShotPlanSchema.parse> } => result.success)
    .map((result) => result.data)
}

export function mergeCinematicV3ShotPlansForTimeline(
  plans: ReturnType<typeof cinematicV2ShotPlanSchema.parse>[],
) {
  if (plans.length === 0) throw new Error('No Cinematics V3 shot plans were available for timeline assembly.')
  if (plans.length === 1) return plans[0]
  const diagnostics = [
    ...plans.flatMap((plan) => plan.diagnostics),
    `Assembled timeline from ${plans.length} storyboard-block shot plan(s).`,
  ]
  const shotOrderNumber = (shot: ReturnType<typeof cinematicV2ShotSchema.parse>, fallback: number) => {
    const match = readText(shot.id).match(/(\d+)(?!.*\d)/)
    const parsed = Number(match?.[1] ?? 0)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
  }
  const shots = plans
    .flatMap((plan, planIndex) => plan.shots.map((shot, shotIndex) => ({
      shot,
      planIndex,
      shotIndex,
      orderNumber: shotOrderNumber(shot, (planIndex * 1000) + shotIndex + 1),
    })))
    .sort((left, right) => left.orderNumber - right.orderNumber || left.planIndex - right.planIndex || left.shotIndex - right.shotIndex)
    .map((entry) => entry.shot)
  const duplicateIds = shots
    .map((shot) => readText(shot.id))
    .filter((id, index, list) => id && list.indexOf(id) !== index)
  const finalShots = duplicateIds.length > 0
    ? shots.map((shot, index) => ({
      ...shot,
      id: `shot_${String(index + 1).padStart(3, '0')}`,
      index: index + 1,
    }))
    : shots.map((shot, index) => ({ ...shot, index: index + 1 }))
  if (duplicateIds.length > 0) diagnostics.push(`Renumbered duplicate shot IDs during timeline assembly: ${[...new Set(duplicateIds)].join(', ')}.`)
  const audioSource = plans.map((plan) => plan.audioPlan).find((plan) => plan && (plan.ambience || plan.music || plan.sfx.length > 0)) ?? plans[0].audioPlan
  return cinematicV2ShotPlanSchema.parse({
    sceneId: plans[0].sceneId || 'scene_1',
    totalEditorialDurationSeconds: finalShots.reduce((total, shot) => total + Math.max(0, Number(shot.editorialDurationSeconds) || 0), 0),
    shots: finalShots,
    performanceArc: plans.flatMap((plan) => plan.performanceArc),
    audioPlan: {
      ambience: audioSource.ambience,
      music: audioSource.music,
      sfx: [...new Set(plans.flatMap((plan) => plan.audioPlan.sfx))],
      dialogueTrackCount: finalShots.reduce((total, shot) => total + (shot.dialogue.length > 0 ? 1 : 0), 0),
      placeholderOnly: true,
    },
    diagnostics,
  })
}

type SequenceAnimaticDirectorPlanRuntimeContext = {
  client: unknown
  run: {
    id: string
    projectId: string
    draftId: string
    prompt?: string | null
    metadata?: LooseRecord | null
  }
  workflow: {
    id: string
    name: string
  }
  node: {
    id?: string
    key: string
    label?: string
    type?: string
    config: unknown
  }
  upstream: Record<string, Record<string, unknown>>
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<void>
}

type SequenceAnimaticShotContinuityStreamResult = {
  value: LooseRecord
  response: LooseRecord & {
    body?: unknown
  }
  provider: string
  model: string
  providerRequestId?: string | null
  acceptedRecordCount?: number
  warningCount?: number
}

export type SequenceAnimaticDirectorPlanRuntimeHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readArray: (value: unknown) => unknown[]
  readFirstUpstreamRecord: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => LooseRecord
  readPreferredUpstreamRecord: (upstream: Record<string, Record<string, unknown>>, preferredNodeKeys: string[], fields: string[]) => LooseRecord
  readStringArray: (value: unknown) => string[]
  slugify: (value: string) => string
  hashOutputWorkflowValue: (value: unknown) => string
  sequenceAnimaticShotRefs: SequenceAnimaticDirectorPlanNormalizationHelpers['sequenceAnimaticShotRefs']
  sequenceAnimaticShotBindingFromSceneBinding: SequenceAnimaticDirectorPlanNormalizationHelpers['sequenceAnimaticShotBindingFromSceneBinding']
  compactForPrompt: (value: unknown, maxLength?: number) => string
  outputWorkflowTextModel: () => string
  sequenceAnimaticShotContinuityPolicy: {
    maxShotCount: number
    maxDurationSeconds: number
    preferredDurationSeconds: number
    maxDialogueLines: number
    maxDialogueCharacters: number
  }
  runSequenceAnimaticSceneGraphAssignmentProvider: (input: {
    nodeKey: string
    instructions: string
    prompt: string
    fallback: LooseRecord
    maxOutputTokens: number
    shouldCancel?: SequenceAnimaticDirectorPlanRuntimeContext['shouldCancel']
    onProgress?: (progress: {
      providerRequestId?: string | null
      providerMode?: string | null
      providerStatus?: string | null
      lastProviderPollAt?: string | null
      providerStartedAt?: string | null
    }) => Promise<void>
  }) => Promise<{
    value: LooseRecord
    providerRequestId?: string | null
    fallbackUsed: boolean
    fallbackReason?: string | null
  }>
  insertSequenceAnimaticEvent: (input: {
    client: unknown
    projectId: string
    draftId: string
    requestId: string
    workflowId: string
    runId: string
    eventType: string
    payload: LooseRecord
    metadata?: LooseRecord
    dedupe?: LooseRecord
  }) => Promise<void>
  loadWorkflowNodes: (input: {
    client: unknown
    workflowId: string
  }) => Promise<LooseRecord[]>
  loadWorkflowRunSteps: (input: {
    client: unknown
    runId: string
    workflowId: string
  }) => Promise<LooseRecord[]>
  loadWorkflowEdges: (input: {
    client: unknown
    workflowId: string
  }) => Promise<LooseRecord[]>
  hasStoredOutputs: (value: unknown) => boolean
  isStaleDynamicCinematicNode: (node: LooseRecord | null | undefined) => boolean
  preserveExistingDynamicNodeOutput: (input: {
    nextRow: LooseRecord
    existingNode?: LooseRecord | null
    existingStep?: LooseRecord | null
    compileHash: string
    preserve: boolean
  }) => LooseRecord
  dynamicNodeRow: (input: {
    workflow: SequenceAnimaticDirectorPlanRuntimeContext['workflow']
    compileHash: string
    generatedByNodeKey: string
    key: string
    nodeType: string
    label: string
    x: number
    y: number
    config: LooseRecord
  }) => LooseRecord
  dynamicEdgeRow: (input: {
    workflow: SequenceAnimaticDirectorPlanRuntimeContext['workflow']
    compileHash: string
    generatedByNodeKey: string
    key: string
    sourceNodeKey: string
    sourcePort: string
    targetNodeKey: string
    targetPort: string
    metadata?: LooseRecord
  }) => LooseRecord
  persistDynamicWorkflowGraphRevision: (input: {
    client: unknown
    workflow: SequenceAnimaticDirectorPlanRuntimeContext['workflow']
    nodeRows: LooseRecord[]
    edgeRows: LooseRecord[]
    existingDynamicNodes: LooseRecord[]
    dynamicEdgeKeys: string[]
    compileHash: string
    staleReason: string
    workflowMetadataPatch: LooseRecord
  }) => Promise<void>
  runSequenceAnimaticShotContinuityPlanStreamWithRetry: (input: {
    client: unknown
    run: SequenceAnimaticDirectorPlanRuntimeContext['run']
    workflow: SequenceAnimaticDirectorPlanRuntimeContext['workflow']
    node: SequenceAnimaticDirectorPlanRuntimeContext['node']
    requestId: string
    taskClass?: string
    instructions: string
    prompt: string
    maxOutputTokens: number
    shouldCancel?: SequenceAnimaticDirectorPlanRuntimeContext['shouldCancel']
    onProgress?: (progress: {
      providerRequestId?: string | null
      providerMode?: string | null
      providerStatus?: string | null
      lastProviderPollAt?: string | null
      providerStartedAt?: string | null
    }) => Promise<void>
  }) => Promise<SequenceAnimaticShotContinuityStreamResult>
}

export async function materializeSequenceAnimaticScenePlanFanoutRuntime(input: {
  context: {
    client: unknown
    run: SequenceAnimaticDirectorPlanRuntimeContext['run']
    workflow: SequenceAnimaticDirectorPlanRuntimeContext['workflow']
  }
  compileOutputs: LooseRecord
  config: LooseRecord
  helpers: SequenceAnimaticDirectorPlanRuntimeHelpers
}): Promise<{
  expanded: boolean
  compileHash: string
  sceneCount: number
}> {
  const { context, compileOutputs, config, helpers } = input
  const scenePackageOutput = sequenceAnimaticScenePackageOutputSchema.parse(helpers.asRecord(compileOutputs.scenePackage))
  const scenePackages = scenePackageOutput.scenePackages
  if (scenePackages.length === 0) throw new Error('Scene plan fanout requires at least one parsed screenplay scene package.')
  const screenplayDraft = helpers.asRecord(compileOutputs.screenplayDraft)
  const referencePlan = helpers.asRecord(compileOutputs.cinematicReferencePlan)
  const compileHash = helpers.readText(compileOutputs.compileHash) || helpers.hashOutputWorkflowValue({
    scenePackageOutput,
    screenplayDraft,
    referencePlan,
  })
  const aspectRatio = helpers.readText(config.aspectRatio) || '16:9'
  const resolution = helpers.readText(config.resolution) || '720p'
  const maxShotCount = Number(config.maxShotCount ?? 0) || helpers.sequenceAnimaticShotContinuityPolicy.maxShotCount
  const generatedByNodeKey = 'sequence_animatic_scene_plan_fanout'
  let scenePackageSourceNodeKey = 'sequence_animatic_scene_graph_assignment'
  const scenePlannerConcurrency = Math.max(1, Math.min(8, Number(config.scenePlannerConcurrency ?? 4) || 4))
  const dynamicPersistenceVersion = 'sequence_animatic_scene_graph_assignment_parallel_1'

  const allWorkflowNodes = await helpers.loadWorkflowNodes({
    client: context.client,
    workflowId: context.workflow.id,
  })
  if (!allWorkflowNodes.some((row) => helpers.readText(row.key) === scenePackageSourceNodeKey) && allWorkflowNodes.some((row) => helpers.readText(row.key) === 'sequence_animatic_scene_package')) {
    scenePackageSourceNodeKey = 'sequence_animatic_scene_package'
  }
  const allExistingDynamicNodes = allWorkflowNodes
    .filter((row) => helpers.asRecord(row.metadata).dynamicCinematicGenerated === true)
    .filter((row) => helpers.readText(helpers.asRecord(row.metadata).generatedByNodeKey) === generatedByNodeKey)
  const existingDynamicNodes = allExistingDynamicNodes.filter((row) => !helpers.isStaleDynamicCinematicNode(row))
  const existingDynamicNodeByKey = new Map(existingDynamicNodes.map((row) => [helpers.readText(row.key), row] as const))
  const existingSteps = await helpers.loadWorkflowRunSteps({
    client: context.client,
    runId: context.run.id,
    workflowId: context.workflow.id,
  })
  const existingStepByNodeKey = new Map(existingSteps.map((row) => [helpers.readText(row.node_key), row] as const))
  const scenePlanKeys = scenePackages.map((scene) => `sequence_animatic_scene_shot_plan_${helpers.slugify(helpers.readText(scene.sceneId)).slice(0, 64)}`)
  const expectedDynamicKeys = [
    ...scenePlanKeys,
    'sequence_animatic_scene_plan_merge',
    'sequence_animatic_director_plan_artifact',
    'sequence_animatic_manifest',
    'artifact',
    'sequence_animatic_orchestrator',
  ]
  const hasRecoverableStepOutput = existingDynamicNodes.some((row) => {
    if (helpers.readText(row.output_hash) || helpers.hasStoredOutputs(row.outputs)) return false
    const step = existingStepByNodeKey.get(helpers.readText(row.key))
    return Boolean(step && (helpers.readText(step.output_hash) || helpers.hasStoredOutputs(step.outputs)))
  })
  const existingSameHash = existingDynamicNodes.length > 0
    && existingDynamicNodes.every((row) => helpers.readText(helpers.asRecord(row.metadata).dynamicCompileHash) === compileHash)
    && existingDynamicNodes.every((row) => helpers.readText(helpers.asRecord(row.metadata).dynamicV3ParsePersistenceVersion) === dynamicPersistenceVersion)
    && expectedDynamicKeys.every((key) => existingDynamicNodes.some((row) => helpers.readText(row.key) === key))
  if (existingSameHash && !hasRecoverableStepOutput) {
    return { expanded: false, compileHash, sceneCount: scenePackages.length }
  }

  const existingEdges = await helpers.loadWorkflowEdges({
    client: context.client,
    workflowId: context.workflow.id,
  })
  const dynamicEdgeKeys = existingEdges
    .filter((row) => helpers.readText(helpers.asRecord(row.metadata).generatedByNodeKey) === generatedByNodeKey)
    .map((row) => helpers.readText(row.key))

  const preserveNodeRow = (row: LooseRecord) => {
    const key = helpers.readText(row.key)
    const existingNode = existingDynamicNodeByKey.get(key)
    const existingMetadata = helpers.asRecord(existingNode?.metadata)
    const sameCompileHash = helpers.readText(existingMetadata.dynamicCompileHash) === compileHash
    return helpers.preserveExistingDynamicNodeOutput({
      nextRow: row,
      existingNode,
      existingStep: existingStepByNodeKey.get(key) ?? null,
      compileHash,
      preserve: Boolean(existingNode)
        && sameCompileHash
        && helpers.readText(existingNode?.node_type) === helpers.readText(row.node_type)
        && helpers.readText(helpers.asRecord(existingNode?.config).purpose) === helpers.readText(helpers.asRecord(row.config).purpose),
    })
  }
  const sceneNode = (args: {
    key: string
    nodeType: string
    label: string
    x: number
    y: number
    config: LooseRecord
  }) => {
    const row = helpers.dynamicNodeRow({
      workflow: context.workflow,
      compileHash,
      generatedByNodeKey,
      ...args,
    })
    return preserveNodeRow({
      ...row,
      metadata: {
        ...helpers.asRecord(row.metadata),
        dynamicV3ParsePersistenceVersion: dynamicPersistenceVersion,
      },
    })
  }
  const sceneEdge = (args: {
    key: string
    sourceNodeKey: string
    sourcePort: string
    targetNodeKey: string
    targetPort: string
    metadata?: LooseRecord
  }) => helpers.dynamicEdgeRow({
    workflow: context.workflow,
    compileHash,
    generatedByNodeKey,
    ...args,
  })

  const nodeRows: LooseRecord[] = []
  const edgeRows: LooseRecord[] = []
  scenePackages.forEach((scenePackage, index) => {
    const sceneKey = scenePlanKeys[index]
    const sceneId = helpers.readText(scenePackage.sceneId)
    const y = 80 + index * 150
    nodeRows.push(sceneNode({
      key: sceneKey,
      nodeType: 'utility_transform',
      label: `Scene ${scenePackage.index} Shot Plan`,
      x: 1960,
      y,
      config: {
        purpose: 'sequence_animatic_scene_shot_plan',
        role: 'sequence_animatic_scene_shot_plan',
        graphSpecVersion: 'sequence_animatic_graph_v2',
        cinematicPipelineVersion: 'v3_script_storyboards',
        sceneId,
        scenePackage,
        maxShotCount,
        aspectRatio,
        resolution,
        execution: { resourceClass: 'llm', groupKey: 'sequence_animatic_scene_shot_plan', maxConcurrency: scenePlannerConcurrency },
      },
    }))
    edgeRows.push(
      sceneEdge({ key: `scene_package__${sceneKey}`, sourceNodeKey: scenePackageSourceNodeKey, sourcePort: 'scene_package', targetNodeKey: sceneKey, targetPort: 'scene_package' }),
      sceneEdge({ key: `screenplay__${sceneKey}`, sourceNodeKey: 'cinematic_v3_screenplay_author', sourcePort: 'text', targetNodeKey: sceneKey, targetPort: 'screenplay' }),
      sceneEdge({ key: `context__${sceneKey}`, sourceNodeKey: 'world_context', sourcePort: 'context', targetNodeKey: sceneKey, targetPort: 'context' }),
      sceneEdge({ key: `guidance__${sceneKey}`, sourceNodeKey: 'skill_context', sourcePort: 'guidance', targetNodeKey: sceneKey, targetPort: 'guidance' }),
      sceneEdge({ key: `references__${sceneKey}`, sourceNodeKey: 'cinematic_v3_reference_select', sourcePort: 'asset_pack', targetNodeKey: sceneKey, targetPort: 'asset_pack' }),
      sceneEdge({ key: `${sceneKey}__scene_plan_merge`, sourceNodeKey: sceneKey, sourcePort: 'scene_plan', targetNodeKey: 'sequence_animatic_scene_plan_merge', targetPort: 'scene_plan', metadata: { sceneId, sceneIndex: scenePackage.index } }),
    )
  })
  nodeRows.push(
    sceneNode({ key: 'sequence_animatic_scene_plan_merge', nodeType: 'utility_transform', label: 'Merge Shot Continuity Plan', x: 2240, y: 120, config: { purpose: 'sequence_animatic_scene_plan_merge', role: 'sequence_animatic_director_plan', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', maxShotCount, aspectRatio, resolution, execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_scene_plan_merge', maxConcurrency: 1 } } }),
    sceneNode({ key: 'sequence_animatic_director_plan_artifact', nodeType: 'output_artifact', label: 'Register Shot Continuity Plan', x: 2520, y: 120, config: { purpose: 'sequence_animatic_director_plan_artifact', artifactKind: 'other', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', execution: { resourceClass: 'utility' } } }),
    sceneNode({ key: 'sequence_animatic_manifest', nodeType: 'utility_transform', label: 'Build Animatic Manifest', x: 2800, y: 120, config: { purpose: 'sequence_animatic_manifest', role: 'sequence_animatic_manifest', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', aspectRatio, resolution, execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_manifest', maxConcurrency: 1 } } }),
    sceneNode({ key: 'artifact', nodeType: 'output_artifact', label: 'Register Animatic Manifest', x: 3080, y: 120, config: { purpose: 'sequence_animatic_manifest_artifact', artifactKind: 'other', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', execution: { resourceClass: 'utility' } } }),
    sceneNode({ key: 'sequence_animatic_orchestrator', nodeType: 'utility_transform', label: 'Queue Animatic Blocks', x: 3360, y: 120, config: { purpose: 'sequence_animatic_orchestrator', role: 'sequence_animatic_orchestrator', graphSpecVersion: 'sequence_animatic_graph_v2', cinematicPipelineVersion: 'v3_script_storyboards', blockConcurrency: 1, autoStartStoryboards: true, autoStartVideos: false, execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_orchestrator', maxConcurrency: 1 } } }),
  )
  edgeRows.push(
    sceneEdge({ key: 'scene_package__scene_plan_merge', sourceNodeKey: scenePackageSourceNodeKey, sourcePort: 'scene_package', targetNodeKey: 'sequence_animatic_scene_plan_merge', targetPort: 'scene_package' }),
    sceneEdge({ key: 'screenplay__scene_plan_merge', sourceNodeKey: 'cinematic_v3_screenplay_author', sourcePort: 'text', targetNodeKey: 'sequence_animatic_scene_plan_merge', targetPort: 'screenplay' }),
    sceneEdge({ key: 'references__scene_plan_merge', sourceNodeKey: 'cinematic_v3_reference_select', sourcePort: 'asset_pack', targetNodeKey: 'sequence_animatic_scene_plan_merge', targetPort: 'asset_pack' }),
    sceneEdge({ key: 'context__scene_plan_merge', sourceNodeKey: 'world_context', sourcePort: 'context', targetNodeKey: 'sequence_animatic_scene_plan_merge', targetPort: 'context' }),
    sceneEdge({ key: 'scene_plan_merge__director_plan_artifact', sourceNodeKey: 'sequence_animatic_scene_plan_merge', sourcePort: 'director_plan', targetNodeKey: 'sequence_animatic_director_plan_artifact', targetPort: 'director_plan' }),
    sceneEdge({ key: 'scene_plan_merge__sequence_manifest', sourceNodeKey: 'sequence_animatic_scene_plan_merge', sourcePort: 'director_plan', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'director_plan' }),
    sceneEdge({ key: 'screenplay__sequence_manifest', sourceNodeKey: 'cinematic_v3_screenplay_author', sourcePort: 'text', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'screenplay' }),
    sceneEdge({ key: 'references__sequence_manifest', sourceNodeKey: 'cinematic_v3_reference_select', sourcePort: 'asset_pack', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'asset_pack' }),
    sceneEdge({ key: 'context__sequence_manifest', sourceNodeKey: 'world_context', sourcePort: 'context', targetNodeKey: 'sequence_animatic_manifest', targetPort: 'context' }),
    sceneEdge({ key: 'sequence_manifest__artifact', sourceNodeKey: 'sequence_animatic_manifest', sourcePort: 'manifest', targetNodeKey: 'artifact', targetPort: 'input' }),
    sceneEdge({ key: 'director_plan__orchestrator', sourceNodeKey: 'sequence_animatic_director_plan_artifact', sourcePort: 'director_plan', targetNodeKey: 'sequence_animatic_orchestrator', targetPort: 'director_plan' }),
    sceneEdge({ key: 'sequence_manifest__orchestrator', sourceNodeKey: 'artifact', sourcePort: 'manifest', targetNodeKey: 'sequence_animatic_orchestrator', targetPort: 'manifest' }),
  )

  await helpers.persistDynamicWorkflowGraphRevision({
    client: context.client,
    workflow: context.workflow,
    nodeRows,
    edgeRows,
    existingDynamicNodes,
    dynamicEdgeKeys,
    compileHash,
    staleReason: 'sequence_animatic_scene_plan_fanout_rematerialized',
    workflowMetadataPatch: {
      cinematicPipelineVersion: 'v3_script_storyboards',
      sceneGraphAssignmentPackage: scenePackageOutput,
      sceneGraphAssignmentSceneCount: scenePackages.length,
      dynamicGraphVersion: dynamicPersistenceVersion,
    },
  })
  return { expanded: true, compileHash, sceneCount: scenePackages.length }
}

export async function runSequenceAnimaticScenePackageAssignmentRuntime(input: {
  context: SequenceAnimaticDirectorPlanRuntimeContext
  helpers: SequenceAnimaticDirectorPlanRuntimeHelpers
  purpose: 'sequence_animatic_scene_package' | 'sequence_animatic_scene_graph_assignment'
}): Promise<{
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string | null
}> {
  const { context: executionContext, helpers, purpose } = input
  const isSceneGraphAssignment = purpose.endsWith('_scene_graph_assignment')
  const isScenePackage = purpose.endsWith('_scene_package')
  const assetPack = helpers.readFirstUpstreamRecord(executionContext.upstream, ['assetPack', 'asset_pack'])
  const screenplayDraft = helpers.readFirstUpstreamRecord(executionContext.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  const worldContext = helpers.readFirstUpstreamRecord(executionContext.upstream, ['context'])
  if (!Object.keys(screenplayDraft).length) throw new Error('Scene graph assignment requires the authored screenplay.')
  if (!Object.keys(assetPack).length) throw new Error('Scene package builder requires the visual reference asset pack.')
  if (!Object.keys(worldContext).length) throw new Error('Scene package builder requires world context.')

  const parsedScenePackage = buildSequenceAnimaticScenePackageFromTaggedScreenplay({
    screenplayDraft,
    assetPack,
    context: worldContext,
    contractVersion: isScenePackage ? 'scene_tagged_screenplay_v2' : 'scene_graph_assignment_v1',
  })
  let scenePackage = parsedScenePackage
  let assignmentFallbackUsed = false
  let assignmentFallbackReason = ''
  let providerRequestId: string | null | undefined

  if (isSceneGraphAssignment) {
    const fallbackAssignment = buildFallbackSequenceAnimaticSceneGraphAssignment(parsedScenePackage)
    let result: Awaited<ReturnType<SequenceAnimaticDirectorPlanRuntimeHelpers['runSequenceAnimaticSceneGraphAssignmentProvider']>>
    try {
      result = await helpers.runSequenceAnimaticSceneGraphAssignmentProvider({
        nodeKey: executionContext.node.key,
        instructions: [
          'You are a cinematic continuity designer and spatial scene graph planner.',
          'Return strict JSON only. Assign screenplay scenes to output-local scene graph structure before shot planning.',
        ].join('\n'),
        prompt: [
          'Assign each screenplay scene to a usable scene graph package for later parallel shot planning.',
          'The screenplay is creative only. Do not rewrite the script and do not create shots.',
          'For every scene, choose or create a worldLocationRefId, setId, zoneId, and useful spotIds where concrete physical points matter.',
          'Create new output-local scene graph additions only for visual, reusable places: set, zone, spot, or optional viewpoint.',
          'New graph additions must have stable IDs, valid parent links, human names, and isolated visual briefs that do not mention script beats, characters, shots, emotions, workflow nodes, model names, or providers.',
          'Prefer fewer reusable zones and spots over one-off action-derived nodes. A zone is a reusable spatial area; a spot is a reusable staging point inside that zone; a viewpoint is only a reusable camera/staging reference.',
          'Never name spatial nodes after character names, emotions, dialogue lines, shot titles, transient actions, or lighting/weather-only cues.',
          'When known, include concise entrance, adjacency, sightline, lighting direction, screen direction, and normalized POI/map hints for zones and spots.',
          'Parent rules: set parent is a canonical world location ref; zone parent is a set id; spot parent is a zone id; viewpoint parent may be a spot, zone, or set id.',
          'Prefer existing canonical world location refs from the supplied reference catalog and world context. Do not promote output-local sets/zones/spots into wiki entities.',
          'Keep assignments scene-level. The later scene shot planner will choose shot-level sceneBinding values from these assignments and may add only missing spots/viewpoints.',
          'Return sceneAssignments for every parsed scene id exactly once.',
          helpers.compactForPrompt({
            parsedScenes: parsedScenePackage.scenePackages.map((scene) => ({
              sceneId: scene.sceneId,
              index: scene.index,
              title: scene.title,
              sourceText: scene.sourceText,
              existingLocationRefId: scene.worldLocationRefId,
              dialogueRows: scene.dialogueRows,
            })),
            currentGraphDraft: parsedScenePackage.sceneGraphDraft,
            referenceCatalog: sequenceAnimaticReferenceCatalog({
              animaticReferenceCatalog: helpers.readFirstUpstreamRecord(executionContext.upstream, ['animaticReferenceCatalog', 'animatic_reference_catalog']),
              assetPack,
            }),
            world: helpers.asRecord(worldContext.wiki ?? worldContext.worldWiki),
            entities: Array.isArray(worldContext.entities) ? worldContext.entities.map(helpers.asRecord).slice(0, 80) : [],
          }, 22000),
        ].join('\n\n'),
        fallback: fallbackAssignment,
        maxOutputTokens: 12000,
        shouldCancel: executionContext.shouldCancel,
        onProgress: async (progress) => {
          await executionContext.onProgress?.({
            provider: 'openai',
            model: helpers.outputWorkflowTextModel(),
            providerRequestId: progress.providerRequestId,
            metadata: {
              providerMode: progress.providerMode,
              providerStatus: progress.providerStatus,
              lastProviderPollAt: progress.lastProviderPollAt,
              providerStartedAt: progress.providerStartedAt,
              sequenceAnimaticSceneGraphAssignment: true,
            },
          })
        },
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Scene graph assignment failed.'
      throw new Error(`Sequence animatic scene graph assignment failed: ${reason}`)
    }
    providerRequestId = result.providerRequestId
    assignmentFallbackUsed = result.fallbackUsed
    assignmentFallbackReason = helpers.readText(result.fallbackReason)
    const parsedAssignment = sequenceAnimaticSceneGraphAssignmentSchema.parse(result.value)
    scenePackage = mergeSequenceAnimaticSceneGraphAssignment({
      parsed: parsedScenePackage,
      assignment: parsedAssignment,
      assetPack,
      context: worldContext,
    })
  }

  const outputRequestId = helpers.readText(executionContext.run.metadata?.outputRequestId) || helpers.readText(executionContext.run.metadata?.masterRequestId)
  if (outputRequestId) {
    await helpers.insertSequenceAnimaticEvent({
      client: executionContext.client,
      projectId: executionContext.run.projectId,
      draftId: executionContext.run.draftId,
      requestId: outputRequestId,
      workflowId: executionContext.workflow.id,
      runId: executionContext.run.id,
      eventType: isSceneGraphAssignment ? 'scene_graph_assignment_ready' : 'scene_packages_ready',
      payload: {
        sceneCount: scenePackage.scenePackages.length,
        dialogueRowCount: scenePackage.dialogueRows.length,
        graphAdditionCount: scenePackage.sceneGraphDraft.additions.length,
        spotRelationCount: scenePackage.spotRelations.length,
        sourceHash: helpers.hashOutputWorkflowValue(scenePackage),
        status: 'ready',
        fallbackUsed: assignmentFallbackUsed,
        fallbackReason: assignmentFallbackReason,
      },
      metadata: { source: purpose, nodeKey: executionContext.node.key },
      dedupe: { sourceHash: helpers.hashOutputWorkflowValue(scenePackage) },
    })
  }

  const outputs = {
    scenePackage,
    scene_package: scenePackage,
    scenePackages: scenePackage.scenePackages,
    scene_packages: scenePackage.scenePackages,
    screenplayScenes: scenePackage.screenplayScenes,
    screenplay_scenes: scenePackage.screenplayScenes,
    dialogueRows: scenePackage.dialogueRows,
    dialogue_rows: scenePackage.dialogueRows,
    sceneGraphDraft: scenePackage.sceneGraphDraft,
    scene_graph_draft: scenePackage.sceneGraphDraft,
    spotRelations: scenePackage.spotRelations,
    spot_relations: scenePackage.spotRelations,
    text: JSON.stringify(scenePackage, null, 2),
    fallbackUsed: assignmentFallbackUsed,
    fallbackReason: assignmentFallbackReason,
    deterministic: true,
  }
  return {
    outputs,
    provider: isSceneGraphAssignment && !assignmentFallbackUsed ? 'openai' : 'graphcore',
    model: isSceneGraphAssignment && !assignmentFallbackUsed ? helpers.outputWorkflowTextModel() : 'deterministic-sequence-animatic-scene-package-v1',
    providerRequestId,
  }
}

export async function runSequenceAnimaticDirectorPlanRuntime(input: {
  context: SequenceAnimaticDirectorPlanRuntimeContext
  helpers: SequenceAnimaticDirectorPlanRuntimeHelpers
}): Promise<{
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string | null
}> {
  const { context: executionContext, helpers } = input
  const upstreamManifest = helpers.readFirstUpstreamRecord(executionContext.upstream, ['manifest', 'sequenceAnimaticManifest', 'sequence_animatic_manifest'])
  const worldContext = helpers.readFirstUpstreamRecord(executionContext.upstream, ['context'])
  const assetPack = Object.keys(helpers.asRecord(upstreamManifest.assetPack)).length > 0
    ? helpers.asRecord(upstreamManifest.assetPack)
    : helpers.readFirstUpstreamRecord(executionContext.upstream, ['assetPack', 'asset_pack'])
  const screenplayDraft = Object.keys(helpers.asRecord(upstreamManifest.screenplayDraft)).length > 0
    ? helpers.asRecord(upstreamManifest.screenplayDraft)
    : helpers.readFirstUpstreamRecord(executionContext.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  if (!Object.keys(screenplayDraft).length) throw new Error('Sequence animatic shot continuity plan requires the authored screenplay.')
  if (!Object.keys(assetPack).length) throw new Error('Sequence animatic shot continuity plan requires the visual reference asset pack.')

  const suggestedDurationSeconds = Number(helpers.asRecord(screenplayDraft).suggestedDurationSeconds ?? 0) || null
  const configuredMaxShotCount = Number(helpers.asRecord(executionContext.node.config).maxShotCount ?? 0) || 0
  const screenplayMetadata = helpers.asRecord(helpers.asRecord(screenplayDraft).metadata)
  const scriptContract = helpers.readText(screenplayMetadata.scriptContract)
  const creativeScreenplayContract = scriptContract === 'creative_screenplay_v1'
  const legacyMarkerContract = scriptContract === 'screenplay_with_shot_markers_v1'
  const upstreamShotBreakPlan = helpers.asRecord(upstreamManifest.shotBreakPlan)
  const shotBreakPlan = Object.keys(upstreamShotBreakPlan).length > 0
    ? upstreamShotBreakPlan
    : legacyMarkerContract
      ? buildCinematicV3ShotBreakPlan({
        screenplayDraft,
        maxShotCount: configuredMaxShotCount > 0 ? configuredMaxShotCount : deriveCinematicV2MaxShotCount(suggestedDurationSeconds),
        maxPanelsPerSheet: 9,
        maxDurationPerGroupSeconds: 15,
      })
      : {}
  const shotPlan = Object.keys(helpers.asRecord(upstreamManifest.shotPlan)).length > 0
    ? helpers.asRecord(upstreamManifest.shotPlan)
    : Object.keys(shotBreakPlan).length > 0
      ? buildSequenceAnimaticShotPlanFromBreaks({ shotBreakPlan, assetPack, context: worldContext })
      : {}
  const scriptShotProjection = Object.keys(shotBreakPlan).length > 0
    ? buildSequenceAnimaticScriptShotProjection(shotBreakPlan)
    : { scriptShotStatus: 'missing', scriptShots: [], scriptBlocks: [] }
  const roughBlocks = helpers.readArray(shotBreakPlan.groups).map(helpers.asRecord).map((group, index) => {
    const storyboardGroup = buildCinematicV3StoryboardGroupFromShotBreakGroup(group, index)
    return {
      id: storyboardGroup.id,
      index: storyboardGroup.index,
      title: helpers.readText(group.title) || helpers.readText(group.summary) || storyboardGroup.summary,
      summary: storyboardGroup.summary,
      shotIds: storyboardGroup.shotIds,
      storyboardGroup,
    }
  })
  const animaticReferenceCatalog = sequenceAnimaticReferenceCatalog({
    animaticReferenceCatalog: helpers.asRecord(upstreamManifest.animaticReferenceCatalog),
    assetPack,
  })
  const continuityPlannerContext = buildSequenceAnimaticContinuityPlannerContext({
    screenplayDraft,
    shotPlan,
    shotBreakPlan,
    assetPack,
    animaticReferenceCatalog,
  })
  const manifest = Object.keys(upstreamManifest).length > 0
    ? upstreamManifest
    : {
      role: 'sequence_animatic_director_source',
      requestId: executionContext.run.metadata?.outputRequestId ?? null,
      workflowId: executionContext.workflow.id,
      runId: executionContext.run.id,
      screenplayDraft,
      screenplayMarkdown: helpers.readText(screenplayDraft.screenplayMarkdown) || helpers.readText(screenplayDraft.markdown) || helpers.readText(screenplayDraft.text),
      shotBreakPlan,
      shotPlan,
      blocks: roughBlocks,
      assetPack,
      animaticReferenceCatalog,
    }
  const manifestHash = helpers.hashOutputWorkflowValue(manifest)
  const masterManifestArtifactKey = `output.${helpers.slugify(executionContext.workflow.name)}.${executionContext.run.id.slice(0, 8)}.sequence-animatic-manifest`
  const policy = helpers.sequenceAnimaticShotContinuityPolicy
  const shotContinuityPlannerMaxShotCount = Math.max(
    36,
    Math.min(
      policy.maxShotCount,
      configuredMaxShotCount > 0
        ? Math.max(configuredMaxShotCount, policy.maxShotCount)
        : Math.ceil((suggestedDurationSeconds && suggestedDurationSeconds > 0 ? suggestedDurationSeconds : 180) / 4),
    ),
  )
  const legacyAnchorPrompt = legacyMarkerContract || scriptShotProjection.scriptShots.length > 0
    ? [
      'Legacy screenplay shot anchors are included as optional source references. Preserve sourceScriptShotIds/sourceAnchorIds when useful, but do not let them override better final shot structure.',
      'For one-to-one legacy shots preserve the source script shot ID. For merges include multiple IDs. For splits reuse the same source ID on each split. For planner-added shots, return empty arrays.',
    ].join('\n')
    : 'This creative screenplay has no screenplay shot anchors. sourceScriptShotIds and sourceAnchorIds may be empty arrays; do not invent fake screenplay anchor IDs.'

  const outputRequestId = helpers.readText(executionContext.run.metadata?.outputRequestId) || helpers.readText(executionContext.run.metadata?.masterRequestId)
  if (!outputRequestId) throw new Error('Sequence animatic shot continuity stream requires an output request id.')

  let streamedPlan: SequenceAnimaticShotContinuityStreamResult
  try {
    streamedPlan = await helpers.runSequenceAnimaticShotContinuityPlanStreamWithRetry({
      client: executionContext.client,
      run: executionContext.run,
      workflow: executionContext.workflow,
      node: executionContext.node,
      requestId: outputRequestId,
      instructions: [
        'You are a senior animation shot planner and continuity supervisor.',
        'Return newline-delimited JSON only: one complete JSON object per record, no markdown, no array wrapper, no prose outside JSON records.',
        'Be token-frugal: omit optional descriptive fields whose value would be an empty string, empty array, or null. Structural keys are never optional: every shot record must include id, index, blockId, durationSeconds, action, camera, and sceneBinding; never drop id fields.',
        'Every shot must also include a concise lighting note (<=12 words: time of day, key light direction, mood) - lighting drives keyframe atmosphere and is not optional padding.',
        'Allowed record kinds: plan_start, block, shot, scene_graph_addition, spot_relation, local_reference, plan_done.',
        'Emit records in live-usable order: plan_start, then shot records in story order as soon as each shot is complete. Do not wait for a whole block to be finished before emitting shots.',
        'Block records are optional during streaming and may arrive before, between, or after related shots. If unsure, assign each shot a stable blockId and keep streaming shots.',
        'After all shots, emit remaining scene_graph_addition records, spot_relation records, local_reference records, optional block records, then plan_done.',
      ].join('\n'),
      prompt: [
        'Convert the creative screenplay into one compact streamed shot continuity plan for the entire animatic in a single coherent pass.',
        'The screenplay is the creative source. Your returned shots are the source of truth; do not spend tokens duplicating top-level shotBindings, assetRequirements, warnings, diagnostics, or compatibility fields.',
        'Create final shots from the script in story order. Preserve action, spoken dialogue, emotional beats, cause/effect, chapter outcome, and open loops, but choose shot boundaries that make the animatic filmable and continuous.',
        'The output must cover every final shot exactly once. Blocks are editorial grouping metadata; they must never delay shot records.',
        `Use as many shots as the screenplay needs, up to ${shotContinuityPlannerMaxShotCount}. Do not compress dialogue or multi-beat action to fit an old shot-count budget.`,
        `Hard shot boundary rules: durationSeconds must be <= ${policy.maxDurationSeconds}; preferred duration is 3-${policy.preferredDurationSeconds} seconds; each shot should contain one camera setup and one visible story beat.`,
        `Dialogue density rules: each shot may contain at most ${policy.maxDialogueLines} short dialogue rows, at most 140 characters per dialogue line, and at most ${policy.maxDialogueCharacters} total spoken characters. If a conversation exchange has more than that, split it into alternating dialogue/reaction/action shots.`,
        'Use reaction shots, inserts, movement beats, and silent performance shots to keep dialogue readable. Do not put a whole conversation paragraph into one shot.',
        'Coverage setup rules: do not emit coverage_setup records and do not set coverageSetupId. Capture only shot-local camera facts and optional coverageIntent text; a dedicated downstream coverage planner will assign reusable setups.',
        'Camera fields must be production-useful: framing includes subject scale/composition, movement includes motivation and endpoint, lens gives lens feel when knowable, screenDirectionRule preserves axis/orientation, and coverageIntent explains why this setup exists for keyframe/video continuity.',
        'Each shot action should include a readable end or settle state when motion, dialogue, or camera movement occurs.',
        'Keep action, camera, lighting, performance, visual briefs, summaries, and notes concise. Prefer one strong sentence per field unless the shot requires more.',
        'Record contracts:',
        'plan_start: {"kind":"plan_start","contractVersion":"shot_continuity_plan_v2","graphSpecVersion":"sequence_animatic_graph_v2","note":"short optional note"}',
        'block: {"kind":"block","id":"block_001","index":1,"title":"...","summary":"...","shotIds":["shot_001"]} // optional during streaming; can be emitted after its shots',
        'shot: {"kind":"shot","id":"shot_001","index":1,"blockId":"block_001","title":"...","durationSeconds":3,"continuityLink":{"mode":"same_setup|reverse_angle|blocking_change|match_action|new_setup|insert_cutaway|new_scene","fromShotId":"...","description":"..."},"coverageIntent":"optional concise camera/staging intent, not an id","action":"visible action with end/settle state","camera":{"framing":"subject scale and composition","angle":"...","lens":"lens feel when knowable","movement":"motivated move and endpoint","screenDirectionRule":"axis/orientation rule"},"lighting":"...","dialogue":[{"id":"dlg_001","speakerRefId":"canonical_or_local_ref","text":"one short spoken line, max 140 chars","emotion":"..."}],"performance":[{"id":"perf_001","characterRefId":"canonical_or_local_ref","emotion":"...","valence":0,"arousal":0.5,"bodyLanguage":"...","facialExpression":"...","gaze":"..."}],"refs":{"visibleCharacterRefIds":[],"speakerRefIds":[],"propRefIds":[],"locationRefIds":[],"localReferenceIds":[]},"sceneBinding":{"setId":"set_...","zoneId":"...","primarySpotId":"...","viewpointId":"..."}} - include performance beats only for featured or speaking characters; omit fields that would be empty.',
        'scene_graph_addition: {"kind":"scene_graph_addition","nodeKind":"set|zone|spot|viewpoint","id":"set_or_zone_or_spot_or_viewpoint_id","name":"...","visualBrief":"...","worldLocationRefId":"optional_world_ref","setId":"parent_set_for_zone_spot_viewpoint","zoneId":"parent_zone_for_spot_viewpoint","spotIds":[],"poiHints":[],"mapX":null,"mapY":null,"entrances":[],"sightlines":[],"adjacencyHints":[],"lightingDirection":"","screenDirectionRule":"","shotIds":[],"storyboardBlockIds":[]}',
        'spot_relation: {"kind":"spot_relation","sourceId":"spot_a","targetId":"spot_b","relationship":"adjacent_to|connected_to|visible_from|entrance_to|faces|opposes|above_below|left_of|right_of|near|occludes","evidence":"short reason","direction":"optional world-space direction","screenDirection":"optional screen-space direction"}',
        'local_reference: {"kind":"local_reference","id":"local_ref_id","type":"temp_character|prop|item|faction|crowd|vehicle|location_spot","name":"...","visualBrief":"...","usedShotIds":[],"blockIds":[],"required":false,"importance":"hero|supporting|incidental","parentNodeId":"","sourceReferenceIds":[]}',
        'plan_done: {"kind":"plan_done","shotCount":0,"blockCount":0,"orderedShotIds":[],"orderedBlockIds":[],"screenplaySummary":"...","notes":[]}',
        legacyAnchorPrompt,
        'For every shot, fill refs.visibleCharacterRefIds, refs.speakerRefIds, refs.propRefIds, and refs.locationRefIds when matching world refs exist.',
        'For every spoken line in the screenplay, put one dialogue row on the shot where it is spoken. Every dialogue row must have speakerRefId and non-empty text. Do not create speaker-only dialogue rows.',
        'Never merge multiple screenplay dialogue turns into one dialogue row. Split dense dialogue across multiple shots rather than summarizing or packing it.',
        'For visible/speaking characters, add concise performance rows with emotion, valence, arousal, confidence, dominance, body language, facial expression, gaze, gesture, and voice energy when meaningful.',
        'Do not invent duplicate canonical characters, locations, factions, or props. If a world ref matches, use its key.',
        'Create output-local scene graph additions only when needed for the animatic: physical sets, zones, spots, and optional reusable viewpoints/camera setups.',
        'Scene graph nodes must be filmable physical things. Never create nodes for themes, emotions, fog/rain/lighting-only cues, shot titles, action phrases, or character names used as places.',
        'Reuse zones/spots aggressively: one zone per meaningful spatial area and one spot per reusable physical staging point. Do not create a new zone or spot just because the action, emotion, line reading, or camera move changes.',
        'When adding zone or spot nodes, include entrance, adjacency, sightline, lighting direction, screen direction, and POI/map hints when they are knowable from the scene evidence.',
        'Spot-first rule: when a shot action is anchored to a concrete point of interest such as a bridge edge, door, custody table, crane hook, skiff prow, pier railing, checkpoint gate, shrine steps, or alley mouth, create or reuse a spot and set primarySpotId. Put the primary spot first in spotIds.',
        'Zone-only bindings are allowed only when the location is intentionally broad/non-descript and no reusable physical point matters.',
        'Use viewpointId only for reusable camera setups or important camera-reference continuity. Do not create a viewpoint for every shot just to satisfy structure.',
        'When two spots matter spatially, emit spot_relation records such as adjacent_to, connected_to, visible_from, entrance_to, faces, opposes, above_below, left_of, right_of, near, or occludes.',
        'Every shot must include sceneBinding with at least setId or worldLocationRefId. Prefer zoneId, use primarySpotId/spotIds whenever a concrete physical point matters, and use viewpointId only when useful. Reuse the same set/zone/spot/viewpoint IDs across shots.',
        'Define animatic-only temp characters, props/items, factions/crowds, vehicles, or other local refs in localReferences. Then attach their IDs to refs.localReferenceIds or sceneBinding.localReferenceIds on the shots that use them.',
        'For each shot, set blockId immediately even if the block record will be emitted later. Use stable block IDs such as block_001, block_002. Keep notes short and only for important ambiguity.',
        helpers.compactForPrompt({
          screenplay: screenplayDraft,
          scriptContract: creativeScreenplayContract ? 'creative_screenplay_v1' : scriptContract,
          legacyScreenplayShotAnchors: scriptShotProjection.scriptShots.length > 0 ? scriptShotProjection : undefined,
          legacyRoughShotCandidates: Object.keys(shotPlan).length > 0 ? shotPlan : undefined,
          legacyRoughBlockCandidates: roughBlocks.length > 0 ? roughBlocks : undefined,
          continuityPlannerContext,
          existingWorldReferences: animaticReferenceCatalog,
          assetPack,
        }, 26000),
      ].filter(Boolean).join('\n\n'),
      maxOutputTokens: 64000,
      shouldCancel: executionContext.shouldCancel,
      onProgress: async (progress) => {
        await executionContext.onProgress?.({
          provider: 'openai',
          model: helpers.outputWorkflowTextModel(),
          providerRequestId: progress.providerRequestId,
          metadata: {
            providerMode: progress.providerMode,
            providerStatus: progress.providerStatus,
            lastProviderPollAt: progress.lastProviderPollAt,
            providerStartedAt: progress.providerStartedAt,
            sequenceAnimaticDirectorPlan: true,
            sequenceAnimaticShotContinuityPlan: true,
            sequenceAnimaticShotContinuityStream: true,
          },
        })
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Shot continuity plan generation failed.'
    throw new Error(`Sequence animatic shot continuity plan failed: ${reason}`)
  }

  const directorPlan = normalizeSequenceAnimaticDirectorPlan({
    rawPlan: streamedPlan.value,
    manifest,
    manifestHash,
    masterManifestArtifactKey,
    continuityPlannerContext,
    helpers,
  })
  const totalEditorialDurationSeconds = directorPlan.shots.reduce((total, shot) => total + (Number(helpers.asRecord(shot).editorialDurationSeconds) || 0), 0)
  const outputShotPlan = {
    ...shotPlan,
    shots: directorPlan.shots,
    totalEditorialDurationSeconds,
  }
  const outputs = {
    directorPlan,
    director_plan: directorPlan,
    shotContinuityPlan: directorPlan,
    shot_continuity_plan: directorPlan,
    shotPlan: outputShotPlan,
    shot_plan: outputShotPlan,
    blocks: directorPlan.blocks,
    continuityGraphV2: directorPlan.continuityGraphV2,
    continuity_graph_v2: directorPlan.continuityGraphV2,
    shotBindings: directorPlan.shotBindings,
    shot_bindings: directorPlan.shotBindings,
    roughShotBreakPlan: shotBreakPlan,
    rough_shot_break_plan: shotBreakPlan,
    roughShotPlan: shotPlan,
    rough_shot_plan: shotPlan,
    text: JSON.stringify(directorPlan, null, 2),
    deterministic: false,
    providerRequestId: streamedPlan.providerRequestId,
    acceptedStreamRecordCount: streamedPlan.acceptedRecordCount,
    streamWarningCount: streamedPlan.warningCount,
    usage: helpers.asRecord(helpers.asRecord(streamedPlan.response).body).usage,
  }
  return {
    outputs,
    provider: streamedPlan.provider,
    model: streamedPlan.model,
    providerRequestId: streamedPlan.providerRequestId || undefined,
  }
}

export function runSequenceAnimaticScenePlanMergeRuntime(input: {
  context: SequenceAnimaticDirectorPlanRuntimeContext
  helpers: SequenceAnimaticDirectorPlanRuntimeHelpers
}): {
  outputs: LooseRecord
  model: string
} {
  const { context: executionContext, helpers } = input
  // Prefer the scene_input/master node's full scene-package output. Scene shot
  // plan nodes also emit scenePackage, but those are single tagged scenes.
  const scenePackageOutput = sequenceAnimaticScenePackageOutputSchema.parse(
    helpers.readPreferredUpstreamRecord(executionContext.upstream, ['scene_input'], ['scenePackage', 'scene_package']),
  )
  const screenplayDraft = helpers.readFirstUpstreamRecord(executionContext.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  const assetPack = helpers.readFirstUpstreamRecord(executionContext.upstream, ['assetPack', 'asset_pack'])
  const scenePlanEntries = Object.entries(executionContext.upstream)
    .map(([nodeKey, outputs]) => ({
      nodeKey,
      sourceSceneIndex: Number(outputs.sourceSceneIndex ?? outputs.source_scene_index ?? 0) || 0,
      sourceSceneId: helpers.readText(outputs.sceneId ?? outputs.scene_id),
      plan: helpers.asRecord(outputs.directorPlan ?? outputs.director_plan ?? outputs.shotContinuityPlan ?? outputs.shot_continuity_plan ?? outputs.sceneShotPlan ?? outputs.scene_shot_plan),
    }))
    .filter((entry) => Object.keys(entry.plan).length > 0 && helpers.readArray(entry.plan.shots).length > 0)
    .sort((left, right) => (left.sourceSceneIndex || 9999) - (right.sourceSceneIndex || 9999) || left.nodeKey.localeCompare(right.nodeKey))
  if (scenePlanEntries.length === 0) throw new Error('Scene shot plan merge requires completed scene shot plans.')

  const shots: LooseRecord[] = []
  const blocks: LooseRecord[] = []
  const shotIdMap = new Map<string, string>()
  const blockIdMap = new Map<string, string>()
  const scenePackageById = new Map(scenePackageOutput.scenePackages.map((scene) => [helpers.readText(scene.sceneId), scene] as const).filter(([sceneId]) => sceneId))
  const preserveSceneScopedIds = helpers.asRecord(executionContext.node.config).preserveSceneScopedIds === true
  let globalShotIndex = 1
  let globalBlockIndex = 1

  for (const entry of scenePlanEntries) {
    const sceneId = entry.sourceSceneId || helpers.readText(entry.plan.sourceSceneId) || `scene_${String(entry.sourceSceneIndex || globalBlockIndex).padStart(3, '0')}`
    const planBlocks = helpers.readArray(entry.plan.blocks).map(helpers.asRecord)
    const planShots = helpers.readArray(entry.plan.shots).map(helpers.asRecord)
    for (const block of planBlocks) {
      const oldBlockId = helpers.readText(block.id) || `${sceneId}_block_${String(globalBlockIndex).padStart(3, '0')}`
      const newBlockId = preserveSceneScopedIds ? oldBlockId : `block_${String(globalBlockIndex).padStart(3, '0')}`
      blockIdMap.set(`${sceneId}:${oldBlockId}`, newBlockId)
      globalBlockIndex += 1
    }
    for (const shot of planShots) {
      const oldShotId = helpers.readText(shot.id) || `${sceneId}_shot_${String(globalShotIndex).padStart(3, '0')}`
      const newShotId = preserveSceneScopedIds ? oldShotId : `shot_${String(globalShotIndex).padStart(3, '0')}`
      shotIdMap.set(`${sceneId}:${oldShotId}`, newShotId)
      globalShotIndex += 1
    }
  }

  globalShotIndex = 1
  globalBlockIndex = 1
  for (const entry of scenePlanEntries) {
    const sceneId = entry.sourceSceneId || helpers.readText(entry.plan.sourceSceneId) || `scene_${String(entry.sourceSceneIndex || globalBlockIndex).padStart(3, '0')}`
    const scenePackage = scenePackageById.get(sceneId) ?? scenePackageOutput.scenePackages.find((scene) => Number(scene.index ?? 0) === entry.sourceSceneIndex) ?? null
    const planBlocks = helpers.readArray(entry.plan.blocks).map(helpers.asRecord)
    const planShots = helpers.readArray(entry.plan.shots).map(helpers.asRecord)
    for (const block of planBlocks) {
      const oldBlockId = helpers.readText(block.id) || `${sceneId}_block_${String(globalBlockIndex).padStart(3, '0')}`
      const newBlockId = blockIdMap.get(`${sceneId}:${oldBlockId}`) || `block_${String(globalBlockIndex).padStart(3, '0')}`
      const mappedShotIds = helpers.readStringArray(block.shotIds ?? block.shot_ids)
        .map((shotId) => shotIdMap.get(`${sceneId}:${shotId}`))
        .filter((shotId): shotId is string => Boolean(shotId))
      blocks.push({
        ...block,
        id: newBlockId,
        index: globalBlockIndex,
        title: helpers.readText(block.title) || `Scene ${entry.sourceSceneIndex || globalBlockIndex}`,
        summary: helpers.readText(block.summary) || helpers.readText(block.title),
        shotIds: mappedShotIds,
        sourceSceneId: sceneId,
      })
      globalBlockIndex += 1
    }
    for (const shot of planShots) {
      const oldShotId = helpers.readText(shot.id) || `${sceneId}_shot_${String(globalShotIndex).padStart(3, '0')}`
      const oldBlockId = helpers.readText(shot.blockId) || helpers.readText(shot.storyboardBlockId)
      const planShotBindings = helpers.asRecord(entry.plan.shotBindings ?? entry.plan.shot_bindings)
      const shotBinding = helpers.asRecord(planShotBindings[oldShotId])
      const rawSceneBinding = helpers.asRecord(shot.sceneBinding ?? shot.scene_binding)
      const sceneBinding = {
        ...rawSceneBinding,
        worldLocationRefId: helpers.readText(rawSceneBinding.worldLocationRefId ?? rawSceneBinding.world_location_ref_id)
          || helpers.readText(shot.worldLocationRefId ?? shot.world_location_ref_id ?? shot.locationRefId ?? shot.location_ref_id)
          || helpers.readText(shotBinding.worldLocationRefId ?? shotBinding.world_location_ref_id)
          || helpers.readText(scenePackage?.worldLocationRefId)
          || helpers.readText(scenePackage?.locationRefId)
          || '',
        setId: helpers.readText(rawSceneBinding.setId ?? rawSceneBinding.set_id)
          || helpers.readText(shot.continuitySetId ?? shot.continuity_set_id)
          || helpers.readText(shotBinding.setId ?? shotBinding.set_id)
          || helpers.readText(scenePackage?.setId)
          || '',
        zoneId: helpers.readText(rawSceneBinding.zoneId ?? rawSceneBinding.zone_id)
          || helpers.readText(shot.continuityZoneId ?? shot.continuity_zone_id)
          || helpers.readText(shotBinding.zoneId ?? shotBinding.zone_id)
          || helpers.readText(scenePackage?.zoneId)
          || '',
        primarySpotId: helpers.readText(rawSceneBinding.primarySpotId ?? rawSceneBinding.primary_spot_id)
          || helpers.readText(shot.primarySpotId ?? shot.primary_spot_id)
          || helpers.readText(shotBinding.primarySpotId ?? shotBinding.primary_spot_id)
          || helpers.readText(helpers.readArray(scenePackage?.spotIds)[0])
          || '',
        spotIds: sequenceAnimaticUniqueTexts([
          rawSceneBinding.spotIds,
          rawSceneBinding.spot_ids,
          shot.continuitySpotIds,
          shot.continuity_spot_ids,
          shotBinding.spotIds,
          shotBinding.spot_ids,
          scenePackage?.spotIds ?? [],
        ]),
        viewpointId: helpers.readText(rawSceneBinding.viewpointId ?? rawSceneBinding.viewpoint_id)
          || helpers.readText(shot.viewpointId ?? shot.viewpoint_id ?? shot.continuityAngleId ?? shot.continuity_angle_id)
          || helpers.readText(shotBinding.viewpointId ?? shotBinding.viewpoint_id ?? shotBinding.angleId ?? shotBinding.angle_id),
        localReferenceIds: sequenceAnimaticUniqueTexts([
          rawSceneBinding.localReferenceIds,
          rawSceneBinding.local_reference_ids,
          shot.localReferenceIds,
          shot.local_reference_ids,
          shotBinding.localReferenceIds,
          shotBinding.local_reference_ids,
        ]),
      }
      if (!sceneBinding.primarySpotId && sceneBinding.spotIds.length > 0) {
        sceneBinding.primarySpotId = sceneBinding.spotIds[0]
      }
      const newShotId = shotIdMap.get(`${sceneId}:${oldShotId}`) || `shot_${String(globalShotIndex).padStart(3, '0')}`
      const newBlockId = blockIdMap.get(`${sceneId}:${oldBlockId}`)
        || blocks.find((block) => helpers.readStringArray(block.shotIds).includes(newShotId))?.id
        || `block_${String(Math.max(1, globalBlockIndex - 1)).padStart(3, '0')}`
      const continuityLink = helpers.asRecord(shot.continuityLink ?? shot.continuity_link)
      const continuityLinkFromShotId = helpers.readText(continuityLink.fromShotId ?? continuityLink.from_shot_id)
      const remappedContinuityLink = Object.keys(continuityLink).length > 0
        ? {
          ...continuityLink,
          fromShotId: continuityLinkFromShotId
            ? shotIdMap.get(`${sceneId}:${continuityLinkFromShotId}`) || continuityLinkFromShotId
            : '',
          from_shot_id: continuityLinkFromShotId
            ? shotIdMap.get(`${sceneId}:${continuityLinkFromShotId}`) || continuityLinkFromShotId
            : '',
        }
        : continuityLink
      shots.push({
        ...shot,
        id: newShotId,
        index: globalShotIndex,
        blockId: newBlockId,
        storyboardBlockId: newBlockId,
        coverageSetupId: '',
        coverage_setup_id: '',
        continuityLink: remappedContinuityLink,
        continuity_link: remappedContinuityLink,
        sceneBinding,
        scene_binding: sceneBinding,
        sourceSceneId: sceneId,
        sourceSceneShotId: oldShotId,
      })
      globalShotIndex += 1
    }
  }

  const mergeSceneGraphArray = (field: string) => mergeById(scenePlanEntries.flatMap((entry) => helpers.readArray(helpers.asRecord(entry.plan.sceneGraphAdditions)[field]).map(helpers.asRecord)))
  const localReferences = mergeById(scenePlanEntries.flatMap((entry) => helpers.readArray(entry.plan.localReferences ?? entry.plan.outputLocalReferences).map(helpers.asRecord)))
  const coverageSetups: LooseRecord[] = []
  const sceneGraphDraft = helpers.asRecord(scenePackageOutput.sceneGraphDraft)
  const sceneGraphAdditions = helpers.readArray(sceneGraphDraft.additions).map(helpers.asRecord)
  const mergedV2 = sequenceAnimaticShotContinuityPlanV2Schema.parse({
    role: 'sequence_animatic_director_plan',
    contractVersion: 'shot_continuity_plan_v2',
    graphSpecVersion: 'sequence_animatic_graph_v2',
    screenplayAnimaticRole: 'director_plan',
    sequenceAnimaticRole: 'director_plan',
    planningMode: 'single_director_pass',
    screenplaySummary: `Merged ${scenePlanEntries.length} scene-scoped shot plan${scenePlanEntries.length === 1 ? '' : 's'}.`,
    shots,
    blocks: blocks.filter((block) => helpers.readStringArray(block.shotIds).length > 0),
    sceneGraphAdditions: {
      sets: mergeById([
        ...sceneGraphAdditions.filter((addition) => addition.kind === 'set').map((addition) => ({ id: addition.id, worldLocationRefId: addition.worldLocationRefId || addition.parentId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('sets'),
      ]),
      zones: mergeById([
        ...sceneGraphAdditions.filter((addition) => addition.kind === 'zone').map((addition) => ({ id: addition.id, setId: addition.setId || addition.parentId, worldLocationRefId: addition.worldLocationRefId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('zones'),
      ]),
      spots: mergeById([
        ...sceneGraphAdditions.filter((addition) => addition.kind === 'spot').map((addition) => ({ id: addition.id, setId: addition.setId, zoneId: addition.zoneId || addition.parentId, worldLocationRefId: addition.worldLocationRefId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('spots'),
      ]),
      viewpoints: mergeById([
        ...sceneGraphAdditions.filter((addition) => addition.kind === 'viewpoint').map((addition) => ({ id: addition.id, setId: addition.setId, zoneId: addition.zoneId, spotIds: [addition.spotId].filter(Boolean), worldLocationRefId: addition.worldLocationRefId || null, name: addition.name, visualBrief: addition.visualBrief })),
        ...mergeSceneGraphArray('viewpoints'),
      ]),
      angles: mergeSceneGraphArray('angles'),
      edges: mergeSceneGraphArray('edges'),
    },
    coverageSetups,
    localReferences,
    notes: scenePlanEntries.flatMap((entry) => helpers.readStringArray(entry.plan.notes)),
  })
  const runMetadata = helpers.asRecord(executionContext.run.metadata)
  const manifest = {
    role: 'sequence_animatic_director_source',
    requestId: runMetadata.outputRequestId ?? runMetadata.masterRequestId ?? null,
    workflowId: executionContext.workflow.id,
    runId: executionContext.run.id,
    screenplayDraft,
    screenplayMarkdown: helpers.readText(screenplayDraft.screenplayMarkdown) || helpers.readText(screenplayDraft.markdown) || helpers.readText(screenplayDraft.text),
    scenePackageOutput,
    assetPack,
  }
  const animaticReferenceCatalog = sequenceAnimaticReferenceCatalog({
    animaticReferenceCatalog: helpers.readFirstUpstreamRecord(executionContext.upstream, ['animaticReferenceCatalog', 'animatic_reference_catalog']),
    assetPack,
  })
  const continuityPlannerContext = buildSequenceAnimaticContinuityPlannerContext({
    screenplayDraft,
    shotPlan: {},
    shotBreakPlan: {},
    assetPack,
    animaticReferenceCatalog,
  })
  const directorPlan = normalizeSequenceAnimaticDirectorPlan({
    rawPlan: mergedV2,
    manifest,
    manifestHash: helpers.hashOutputWorkflowValue(manifest),
    masterManifestArtifactKey: `output.${helpers.slugify(executionContext.workflow.name)}.${executionContext.run.id.slice(0, 8)}.sequence-animatic-merged-shot-plan`,
    continuityPlannerContext,
    helpers,
  })
  const shotPlan = {
    sceneId: 'sequence_animatic_master',
    shots: directorPlan.shots,
    totalEditorialDurationSeconds: directorPlan.shots.reduce((total, shot) => total + (Number(helpers.asRecord(shot).editorialDurationSeconds) || 0), 0),
  }
  return {
    outputs: {
      directorPlan,
      director_plan: directorPlan,
      shotContinuityPlan: directorPlan,
      shot_continuity_plan: directorPlan,
      shotPlan,
      shot_plan: shotPlan,
      blocks: directorPlan.blocks,
      continuityGraphV2: directorPlan.continuityGraphV2,
      continuity_graph_v2: directorPlan.continuityGraphV2,
      shotBindings: directorPlan.shotBindings,
      shot_bindings: directorPlan.shotBindings,
      scenePackage: scenePackageOutput,
      scene_package: scenePackageOutput,
      text: JSON.stringify(directorPlan, null, 2),
      deterministic: true,
    },
    model: 'deterministic-sequence-animatic-scene-plan-merge-v1',
  }
}

export async function runSequenceAnimaticSceneShotPlanRuntime(input: {
  context: SequenceAnimaticDirectorPlanRuntimeContext
  helpers: SequenceAnimaticDirectorPlanRuntimeHelpers
}): Promise<{
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string | null
}> {
  const { context: executionContext, helpers } = input
  const config = helpers.asRecord(executionContext.node.config)
  const scenePackageOutput = sequenceAnimaticScenePackageOutputSchema.parse(
    helpers.readFirstUpstreamRecord(executionContext.upstream, ['scenePackage', 'scene_package']),
  )
  const configuredScenePackageParse = sequenceAnimaticTaggedScenePackageSchema.safeParse(config.scenePackage)
  const configuredScenePackage = configuredScenePackageParse.success ? configuredScenePackageParse.data : null
  const sceneId = helpers.readText(config.sceneId) || helpers.readText(configuredScenePackage?.sceneId) || ''
  const scenePackages = scenePackageOutput.scenePackages.map(helpers.asRecord)
  const scenePackage = configuredScenePackage
    ?? scenePackages.find((scene) => helpers.readText(scene.sceneId) === sceneId)
    ?? scenePackages[0]
  if (!scenePackage) throw new Error('Scene shot planner requires a parsed scene package.')

  const screenplayDraft = helpers.readFirstUpstreamRecord(executionContext.upstream, ['screenplayDraft', 'screenplay_draft', 'screenplay'])
  const assetPack = helpers.readFirstUpstreamRecord(executionContext.upstream, ['assetPack', 'asset_pack'])
  if (!Object.keys(screenplayDraft).length) throw new Error('Scene shot planner requires the authored tagged screenplay.')
  if (!Object.keys(assetPack).length) throw new Error('Scene shot planner requires the visual reference asset pack.')

  const animaticReferenceCatalog = sequenceAnimaticReferenceCatalog({
    animaticReferenceCatalog: helpers.readFirstUpstreamRecord(executionContext.upstream, ['animaticReferenceCatalog', 'animatic_reference_catalog']),
    assetPack,
  })
  const continuityPlannerContext = buildSequenceAnimaticContinuityPlannerContext({
    screenplayDraft,
    shotPlan: {},
    shotBreakPlan: {},
    assetPack,
    animaticReferenceCatalog,
  })
  const scenePackageId = helpers.readText(scenePackage.sceneId)
  const manifest = {
    role: 'sequence_animatic_scene_director_source',
    requestId: executionContext.run.metadata?.outputRequestId ?? executionContext.run.metadata?.masterRequestId ?? null,
    workflowId: executionContext.workflow.id,
    runId: executionContext.run.id,
    screenplayDraft,
    screenplayMarkdown: helpers.readText(screenplayDraft.screenplayMarkdown) || helpers.readText(screenplayDraft.markdown) || helpers.readText(screenplayDraft.text),
    scenePackage,
    scenePackageOutput,
    assetPack,
    animaticReferenceCatalog,
  }
  const manifestHash = helpers.hashOutputWorkflowValue(manifest)
  const masterManifestArtifactKey = `output.${helpers.slugify(executionContext.workflow.name)}.${executionContext.run.id.slice(0, 8)}.${helpers.slugify(scenePackageId)}-scene-shot-plan`
  const outputRequestId = helpers.readText(executionContext.run.metadata?.masterRequestId) || helpers.readText(executionContext.run.metadata?.outputRequestId)
  if (!outputRequestId) throw new Error('Scene shot continuity stream requires an output request id.')

  const policy = helpers.sequenceAnimaticShotContinuityPolicy
  let streamedPlan: SequenceAnimaticShotContinuityStreamResult
  try {
    streamedPlan = await helpers.runSequenceAnimaticShotContinuityPlanStreamWithRetry({
      client: executionContext.client,
      run: executionContext.run,
      workflow: executionContext.workflow,
      node: executionContext.node,
      requestId: outputRequestId,
      taskClass: 'scene_shot_plan',
      instructions: [
        'You are a senior animation shot planner and continuity supervisor.',
        'Return newline-delimited JSON only: one complete JSON object per record, no markdown, no array wrapper, no prose outside JSON records.',
        'Be token-frugal: omit optional descriptive fields whose value would be an empty string, empty array, or null. Structural keys are never optional: every shot record must include id, index, blockId, durationSeconds, action, camera, and sceneBinding; never drop id fields.',
        'Every shot must also include a concise lighting note (<=12 words: time of day, key light direction, mood) - lighting drives keyframe atmosphere and is not optional padding.',
        'Allowed record kinds for this scene node: scene_plan_start, shot, scene_graph_addition, spot_relation, local_reference, scene_plan_done. block is also allowed if helpful.',
        'Emit shot records as soon as each shot is complete. Do not wait for the entire scene to be complete before streaming shots.',
      ].join('\n'),
      prompt: [
        `Convert only this screenplay scene into a scene-scoped shot continuity plan: ${scenePackageId} (${helpers.readText(scenePackage.title)}).`,
        'Do not plan shots for any other scene. Preserve story order inside this scene.',
        `Use scene-scoped IDs: shot IDs must start with "${scenePackageId}_shot_" and block IDs must start with "${scenePackageId}_block_".`,
        'Use the scene graph assignment package as first-choice sceneBinding IDs. Add missing spots or viewpoints only when the assigned package lacks a concrete point needed by the action.',
        'Reuse assigned zones and spots by default. Add only filmable physical nodes, never character/action/emotion-derived place names, and include entrance, sightline, screen-direction, lighting-direction, or POI/map hints when useful.',
        `Hard shot boundary rules: durationSeconds must be <= ${policy.maxDurationSeconds}; preferred duration is 3-${policy.preferredDurationSeconds} seconds; each shot should contain one camera setup and one visible story beat.`,
        `Dialogue density rules: each shot may contain at most ${policy.maxDialogueLines} short dialogue rows, at most 140 characters per dialogue line, and at most ${policy.maxDialogueCharacters} total spoken characters. Split dialogue exchanges across reaction/action shots.`,
        'Coverage setup rules: do not emit coverage_setup records and do not set coverageSetupId. Capture only shot-local camera facts and optional coverageIntent text; a dedicated downstream coverage planner will assign reusable setups.',
        'Camera fields must be production-useful: framing includes subject scale/composition, movement includes motivation and endpoint, lens gives lens feel when knowable, screenDirectionRule preserves axis/orientation, and coverageIntent explains why this setup exists for keyframe/video continuity.',
        'Each shot action should include a readable end or settle state when motion, dialogue, or camera movement occurs.',
        'For every dialogue line from the scene package, put a dialogue row on the shot where it is spoken. Preserve speakerRefId exactly.',
        'Every shot must include sceneBinding with at least setId or worldLocationRefId. Prefer zoneId and primarySpotId/spotIds when present in the scene package.',
        'The scene planner returns compact shot-first records only. Do not emit top-level shotBindings, continuityGraphV2, assetRequirements, warnings, diagnostics, image prompts, or video prompts.',
        'Record contracts:',
        'scene_plan_start: {"kind":"scene_plan_start","contractVersion":"shot_continuity_plan_v2","graphSpecVersion":"sequence_animatic_graph_v2","note":"short optional note"}',
        'shot: {"kind":"shot","id":"scene_001_shot_001","index":1,"blockId":"scene_001_block_001","title":"...","durationSeconds":3,"continuityLink":{"mode":"same_setup|reverse_angle|blocking_change|match_action|new_setup|insert_cutaway|new_scene","fromShotId":"...","description":"..."},"coverageIntent":"optional concise camera/staging intent, not an id","action":"visible action with end/settle state","camera":{"framing":"subject scale and composition","angle":"...","lens":"lens feel when knowable","movement":"motivated move and endpoint","screenDirectionRule":"axis/orientation rule"},"lighting":"...","dialogue":[{"id":"dlg_001","speakerRefId":"canonical_or_local_ref","text":"one short spoken line, max 140 chars","emotion":"..."}],"performance":[{"id":"perf_001","characterRefId":"canonical_or_local_ref","emotion":"...","valence":0,"arousal":0.5,"bodyLanguage":"...","facialExpression":"...","gaze":"..."}],"refs":{"visibleCharacterRefIds":[],"speakerRefIds":[],"propRefIds":[],"locationRefIds":[],"localReferenceIds":[]},"sceneBinding":{"setId":"set_...","zoneId":"...","primarySpotId":"...","viewpointId":"..."}} - include performance beats only for featured or speaking characters; omit fields that would be empty.',
        'scene_graph_addition: {"kind":"scene_graph_addition","nodeKind":"set|zone|spot|viewpoint","id":"...","name":"...","visualBrief":"...","worldLocationRefId":"optional_world_ref","setId":"parent_set","zoneId":"parent_zone","spotIds":[],"poiHints":[],"mapX":null,"mapY":null,"entrances":[],"sightlines":[],"adjacencyHints":[],"lightingDirection":"","screenDirectionRule":"","shotIds":[],"storyboardBlockIds":[]}',
        'local_reference: {"kind":"local_reference","id":"local_ref_id","type":"temp_character|prop|item|faction|crowd|vehicle|location_spot","name":"...","visualBrief":"...","usedShotIds":[],"blockIds":[],"required":false,"importance":"hero|supporting|incidental","parentNodeId":"","sourceReferenceIds":[]}',
        'scene_plan_done: {"kind":"scene_plan_done","shotCount":0,"blockCount":0,"orderedShotIds":[],"orderedBlockIds":[],"screenplaySummary":"...","notes":[]}',
        helpers.compactForPrompt({
          scenePackage,
          screenplaySceneText: scenePackage.sourceText,
          sceneGraphAssignment: {
            worldLocationRefId: scenePackage.worldLocationRefId,
            setId: scenePackage.setId,
            zoneId: scenePackage.zoneId,
            spotIds: scenePackage.spotIds,
            graphAdditions: scenePackage.graphAdditions,
            graphAdditionIds: scenePackage.graphAdditionIds,
          },
          sceneGraphDraft: scenePackageOutput.sceneGraphDraft,
          spotRelations: scenePackageOutput.spotRelations,
          dialogueRows: scenePackage.dialogueRows,
          existingWorldReferences: animaticReferenceCatalog,
          assetPack,
        }, 22000),
      ].filter(Boolean).join('\n\n'),
      maxOutputTokens: Math.max(16000, Math.min(40000, Math.ceil(policy.maxShotCount / Math.max(1, scenePackages.length)) * 1800)),
      shouldCancel: executionContext.shouldCancel,
      onProgress: async (progress) => {
        await executionContext.onProgress?.({
          provider: 'openai',
          model: helpers.outputWorkflowTextModel(),
          providerRequestId: progress.providerRequestId,
          metadata: {
            providerMode: progress.providerMode,
            providerStatus: progress.providerStatus,
            lastProviderPollAt: progress.lastProviderPollAt,
            providerStartedAt: progress.providerStartedAt,
            sequenceAnimaticSceneShotPlan: true,
            sourceSceneId: scenePackageId,
          },
        })
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Scene shot plan generation failed.'
    throw new Error(`Sequence animatic scene shot plan failed for ${scenePackageId}: ${reason}`)
  }

  const streamedValue = helpers.asRecord(streamedPlan.value)
  const directorPlan = normalizeSequenceAnimaticDirectorPlan({
    rawPlan: {
      ...streamedValue,
      planningMode: 'single_director_pass',
      notes: [
        ...helpers.readArray(streamedValue.notes),
        `Scene-scoped shot plan for ${scenePackageId}.`,
      ],
    },
    manifest,
    manifestHash,
    masterManifestArtifactKey,
    continuityPlannerContext,
    helpers,
  })
  const sourceSceneIndex = Number(scenePackage.index ?? 0) || 0
  const outputs = {
    sceneId: scenePackageId,
    scene_id: scenePackageId,
    sourceSceneIndex,
    source_scene_index: sourceSceneIndex,
    scenePackage,
    scene_package: scenePackage,
    scenePlan: directorPlan,
    scene_plan: directorPlan,
    sceneShotPlan: directorPlan,
    scene_shot_plan: directorPlan,
    directorPlan,
    director_plan: directorPlan,
    shotContinuityPlan: directorPlan,
    shot_continuity_plan: directorPlan,
    text: JSON.stringify(directorPlan, null, 2),
    deterministic: false,
    providerRequestId: streamedPlan.providerRequestId,
    acceptedStreamRecordCount: streamedPlan.acceptedRecordCount,
    streamWarningCount: streamedPlan.warningCount,
    usage: helpers.asRecord(helpers.asRecord(streamedPlan.response).body).usage,
  }
  return {
    outputs,
    provider: streamedPlan.provider,
    model: streamedPlan.model,
    providerRequestId: streamedPlan.providerRequestId || undefined,
  }
}
