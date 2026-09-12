import type { AssetDefinition } from './graphcore.ts'
import type { DirectorReference, DirectorSettings } from './directorWorkspace.ts'
import type { VisualGenerationJob } from './visualGeneration.ts'
import type { WorldEntity } from './worldGraph.ts'

/**
 * Cast and frame helpers for the Vibe Director. Everything here is pure so the UI, the cost estimate
 * and the server (`director-context.ts`) agree on which asset represents an entity.
 */

export type DirectorCastKind = 'character' | 'location' | 'group' | 'prop'
export type DirectorCastStatus = 'ready' | 'generating' | 'failed' | 'missing'

export type DirectorCastMember = {
  key: string
  name: string
  nodeType: WorldEntity['nodeType']
  kind: DirectorCastKind
  /** Asset the server will attach as the H3 image reference (`referenceSheetAssetKey || thumbnailAssetKey`). */
  referenceAssetKey: string | null
  status: DirectorCastStatus
  statusLabel: string
  jobId: string | null
  errorMessage: string | null
  visual: string
  summary: string
}

type EntityLike = Pick<WorldEntity, 'key' | 'name' | 'nodeType' | 'summary' | 'thumbnailAssetKey' | 'metadata'>
type JobLike = Pick<VisualGenerationJob, 'id' | 'kind' | 'status' | 'targetKeys' | 'errorMessage' | 'createdAt'>

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

/** Node types that never become on-screen references (story containers, game mechanics, abstractions). */
const NON_CAST_NODE_TYPES = new Set<string>([
  'sequence_unit', 'concept', 'event', 'narrative_arc', 'narrative_scene', 'dialogue_node', 'choice', 'choice_condition',
  'choice_outcome', 'state_variable', 'game_rule', 'save_state', 'player_stat', 'player_initial_config', 'inventory',
  'quest', 'quest_step', 'travel_link', 'trade_offer', 'encounter',
])
const REFERENCE_SHEET_JOB_KINDS = new Set<string>(['entity_reference_sheet', 'character_sheet'])
const ACTIVE_JOB_STATUSES = new Set<string>(['pending', 'queued', 'running'])

export function isDirectorCastEntity(entity: Pick<WorldEntity, 'nodeType'>) {
  return !NON_CAST_NODE_TYPES.has(entity.nodeType)
}

/** Mirrors the worker's `resolveEntityReferenceSheetKind` so the UI labels match the sheet that gets generated. */
export function directorCastKind(nodeType: string): DirectorCastKind {
  if (nodeType === 'actor' || nodeType === 'persona' || nodeType === 'player_profile') return 'character'
  if (nodeType === 'place' || nodeType === 'location_spot' || nodeType === 'environment') return 'location'
  if (nodeType === 'group' || nodeType === 'faction') return 'group'
  return 'prop'
}

export const DIRECTOR_CAST_KIND_LABEL: Record<DirectorCastKind, string> = { character: 'Character', location: 'Location', group: 'Group', prop: 'Prop' }

/** New-entity form choices → world node types. */
export const DIRECTOR_NEW_ENTITY_KINDS: Array<{ kind: DirectorCastKind; nodeType: WorldEntity['nodeType']; label: string }> = [
  { kind: 'character', nodeType: 'actor', label: 'Character' },
  { kind: 'location', nodeType: 'place', label: 'Location' },
  { kind: 'prop', nodeType: 'object', label: 'Prop' },
  { kind: 'group', nodeType: 'group', label: 'Group' },
]

/** Same rule as `prepareDirectorGeneration` on the server. */
export function directorReferenceAssetKey(entity: Pick<EntityLike, 'thumbnailAssetKey' | 'metadata'>) {
  return text(record(entity.metadata).referenceSheetAssetKey) || text(entity.thumbnailAssetKey) || null
}

export function directorEntityVisual(entity: Pick<EntityLike, 'summary' | 'metadata'>) {
  const metadata = record(entity.metadata)
  return text(record(metadata.visual).description) || text(metadata.visualDescription) || text(entity.summary)
}

export function directorReferenceJobForEntity(jobs: JobLike[], entityKey: string) {
  const matching = jobs.filter((job) => REFERENCE_SHEET_JOB_KINDS.has(job.kind) && text(record(job.targetKeys).entityKey) === entityKey && !text(record(job.targetKeys).variantKey))
  matching.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return matching[0] ?? null
}

export function directorCastStatus(entity: EntityLike, jobs: JobLike[]): Pick<DirectorCastMember, 'status' | 'statusLabel' | 'jobId' | 'errorMessage'> {
  const job = directorReferenceJobForEntity(jobs, entity.key)
  if (job && ACTIVE_JOB_STATUSES.has(job.status)) return { status: 'generating', statusLabel: 'Generating sheet', jobId: job.id, errorMessage: null }
  if (directorReferenceAssetKey(entity)) return { status: 'ready', statusLabel: 'Reference ready', jobId: job?.id ?? null, errorMessage: null }
  if (job && job.status === 'failed') return { status: 'failed', statusLabel: 'Sheet failed', jobId: job.id, errorMessage: job.errorMessage ?? null }
  return { status: 'missing', statusLabel: 'No reference yet', jobId: null, errorMessage: null }
}

export function buildDirectorCast(entities: EntityLike[], keys: string[], jobs: JobLike[]): DirectorCastMember[] {
  const byKey = new Map(entities.map((entity) => [entity.key, entity] as const))
  return keys.flatMap((key) => {
    const entity = byKey.get(key)
    if (!entity) return []
    return [{
      key,
      name: entity.name,
      nodeType: entity.nodeType,
      kind: directorCastKind(entity.nodeType),
      referenceAssetKey: directorReferenceAssetKey(entity),
      ...directorCastStatus(entity, jobs),
      visual: directorEntityVisual(entity),
      summary: text(entity.summary),
    }]
  })
}

export function directorCastReadiness(cast: DirectorCastMember[]) {
  const ready = cast.filter((member) => member.status === 'ready').length
  return { ready, total: cast.length, missing: cast.filter((member) => member.status === 'missing' || member.status === 'failed') }
}

function assetDimensions(asset: AssetDefinition | undefined) {
  const metadata = record(asset?.metadata)
  const size = record(metadata.imageSize)
  const width = Number(metadata.width) || Number(size.width) || 2048
  const height = Number(metadata.height) || Number(size.height) || 2048
  return { width, height }
}

/**
 * References the server will price for the next take. Mirrors `prepareDirectorGeneration`: a starting frame
 * replaces the cast references; a frame branch carries no references; a motion branch adds a ≤3 s video.
 */
export function directorEstimateReferences(input: {
  settings: DirectorSettings
  cast: DirectorCastMember[]
  assets: AssetDefinition[]
  /** Shot ingredient references stored on the session source (continuity anchors, coverage keyframes). */
  shotReferences?: Array<{ assetKey: string; label?: string }>
  branch?: { mode: 'frame' | 'motion'; seconds: number } | null
}): DirectorReference[] {
  const byKey = new Map(input.assets.map((asset) => [asset.key, asset] as const))
  const image = (key: string, label: string): DirectorReference => ({ assetKey: key, label, kind: 'image', ...assetDimensions(byKey.get(key)) })
  if (input.branch?.mode === 'frame') return [image(`branch:${input.branch.seconds}`, 'Exact opening frame')]
  if (input.branch?.mode === 'motion') return [{ assetKey: 'branch-motion', label: 'Previous motion', kind: 'video', durationSeconds: Math.min(3, input.branch.seconds) }]
  if (input.settings.firstFrameAssetKey) return [image(input.settings.firstFrameAssetKey, 'Opening frame')]
  const castKeys = [...new Set(input.cast.map((member) => member.referenceAssetKey).filter((key): key is string => Boolean(key)))]
  const seen = new Set(castKeys)
  const shot = (input.shotReferences ?? []).filter((ref) => ref.assetKey && !seen.has(ref.assetKey) && seen.add(ref.assetKey))
  return [...castKeys.map((key) => image(key, byKey.get(key)?.name || key)), ...shot.map((ref) => image(ref.assetKey, ref.label || byKey.get(ref.assetKey)?.name || ref.assetKey))].slice(0, 9)
}

export type DirectorFrameGroupId = 'composed' | 'takes' | 'keyframes' | 'sheets' | 'images'
export type DirectorFrameGroup = { id: DirectorFrameGroupId; label: string; assets: AssetDefinition[] }

const KEYFRAME_ROLE_PATTERN = /keyframe|coverage_anchor|shot_still|storyboard/i

function assetTimestamp(asset: AssetDefinition) {
  const metadata = record(asset.metadata)
  const generation = record(metadata.generation)
  return Date.parse(text(generation.completedAt) || text(metadata.completedAt) || text(metadata.createdAt) || text(metadata.generatedAt)) || 0
}

/** Groups image assets for the frame picker; the most relevant group for the session comes first. */
export function groupDirectorFrameCandidates(assets: AssetDefinition[], input: { sessionId?: string | null; shotId?: string | null } = {}): DirectorFrameGroup[] {
  const groups: Record<DirectorFrameGroupId, AssetDefinition[]> = { composed: [], takes: [], keyframes: [], sheets: [], images: [] }
  for (const asset of assets) {
    if (asset.kind !== 'image') continue
    const metadata = record(asset.metadata)
    const role = text(metadata.role)
    const generatedBy = text(metadata.generatedBy)
    if (role === 'director_frame') groups.composed.push(asset)
    else if (asset.key.startsWith('director.') && asset.key.endsWith('.branch')) groups.takes.push(asset)
    else if (KEYFRAME_ROLE_PATTERN.test(role) || KEYFRAME_ROLE_PATTERN.test(text(metadata.sequenceAnimaticRole))) groups.keyframes.push(asset)
    else if (generatedBy === 'entity_reference_sheet' || asset.key.startsWith('entity_reference_sheet_') || role === 'entity_reference_sheet') groups.sheets.push(asset)
    else groups.images.push(asset)
  }
  const relevance = (asset: AssetDefinition) => {
    const metadata = record(asset.metadata)
    return (input.sessionId && text(metadata.sessionId) === input.sessionId ? 2 : 0) + (input.shotId && text(metadata.shotId) === input.shotId ? 1 : 0)
  }
  const order = (list: AssetDefinition[]) => list
    .map((asset, index) => ({ asset, index }))
    .sort((a, b) => relevance(b.asset) - relevance(a.asset) || assetTimestamp(b.asset) - assetTimestamp(a.asset) || b.index - a.index)
    .map((entry) => entry.asset)
  const labels: Record<DirectorFrameGroupId, string> = { composed: 'Composed frames', takes: 'Take frames', keyframes: 'Keyframes', sheets: 'Reference sheets', images: 'All images' }
  return (['composed', 'takes', 'keyframes', 'sheets', 'images'] as DirectorFrameGroupId[])
    .map((id) => ({ id, label: labels[id], assets: order(groups[id]) }))
    .filter((group) => group.assets.length > 0)
}
