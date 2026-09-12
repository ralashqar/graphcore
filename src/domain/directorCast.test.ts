import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDirectorCast, directorCastKind, directorEstimateReferences, groupDirectorFrameCandidates, isDirectorCastEntity } from './directorCast.ts'
import { directorSettingsSchema } from './directorWorkspace.ts'
import type { AssetDefinition } from './graphcore.ts'

const entity = (key: string, overrides: Record<string, unknown> = {}) => ({
  key, name: key.toUpperCase(), nodeType: 'actor' as const, summary: `${key} summary`, thumbnailAssetKey: null, metadata: {}, ...overrides,
})
const job = (entityKey: string, status: 'queued' | 'running' | 'failed' | 'completed', overrides: Record<string, unknown> = {}) => ({
  id: `job-${entityKey}-${status}`, kind: 'entity_reference_sheet' as const, status, targetKeys: { entityKey }, errorMessage: null, createdAt: '2026-09-11T10:00:00Z', ...overrides,
})
const asset = (key: string, metadata: Record<string, unknown> = {}, kind = 'image'): AssetDefinition => ({
  id: key, key, name: key, kind: kind as AssetDefinition['kind'], mimeType: 'image/webp', storagePath: `generated/${key}.webp`, metadata, llmHints: {},
})

test('cast status follows the server reference rule and the newest sheet job', () => {
  const entities = [
    entity('hero', { metadata: { referenceSheetAssetKey: 'sheet_hero' } }),
    entity('thumb', { thumbnailAssetKey: 'thumb_asset' }),
    entity('pending'),
    entity('broken'),
    entity('bare'),
  ]
  const jobs = [
    job('pending', 'running'),
    job('broken', 'failed', { errorMessage: 'provider rejected', createdAt: '2026-09-11T11:00:00Z' }),
    job('broken', 'completed', { createdAt: '2026-09-10T11:00:00Z' }),
    job('hero', 'running', { targetKeys: { entityKey: 'hero', variantKey: 'shot_1' } }),
  ]
  const cast = buildDirectorCast(entities, ['hero', 'thumb', 'pending', 'broken', 'bare', 'missing-entity'], jobs)
  assert.deepEqual(cast.map((m) => [m.key, m.status, m.referenceAssetKey]), [
    ['hero', 'ready', 'sheet_hero'],
    ['thumb', 'ready', 'thumb_asset'],
    ['pending', 'generating', null],
    ['broken', 'failed', null],
    ['bare', 'missing', null],
  ])
  assert.equal(cast[3].errorMessage, 'provider rejected')
  assert.equal(directorCastKind('place'), 'location'); assert.equal(directorCastKind('object'), 'prop')
  assert.equal(isDirectorCastEntity({ nodeType: 'sequence_unit' }), false); assert.equal(isDirectorCastEntity({ nodeType: 'actor' }), true)
})

test('estimate references mirror server narrowing for frames and branches', () => {
  const settings = directorSettingsSchema.parse({})
  const cast = buildDirectorCast([entity('hero', { metadata: { referenceSheetAssetKey: 'sheet_hero' } }), entity('bare')], ['hero', 'bare'], [])
  const assets = [asset('sheet_hero', { width: 1024, height: 1536 }), asset('frame', { imageSize: { width: 1920, height: 1080 } })]
  assert.deepEqual(directorEstimateReferences({ settings, cast, assets }), [{ assetKey: 'sheet_hero', label: 'sheet_hero', kind: 'image', width: 1024, height: 1536 }])
  assert.deepEqual(directorEstimateReferences({ settings: { ...settings, firstFrameAssetKey: 'frame' }, cast, assets }), [{ assetKey: 'frame', label: 'Opening frame', kind: 'image', width: 1920, height: 1080 }])
  assert.equal(directorEstimateReferences({ settings, cast, assets, branch: { mode: 'frame', seconds: 3 } }).length, 1)
  assert.deepEqual(directorEstimateReferences({ settings, cast, assets, branch: { mode: 'motion', seconds: 4.5 } })[0], { assetKey: 'branch-motion', label: 'Previous motion', kind: 'video', durationSeconds: 3 })
})

test('frame candidates are grouped and the session’s own frames come first', () => {
  const groups = groupDirectorFrameCandidates([
    asset('random'),
    asset('entity_reference_sheet_hero', { generatedBy: 'entity_reference_sheet' }),
    asset('kf_1', { role: 'sequence_animatic_shot_keyframe', shotId: 'shot_2' }),
    asset('kf_2', { role: 'sequence_animatic_shot_keyframe', shotId: 'shot_1' }),
    asset('director.t1.branch'),
    asset('frame_other', { role: 'director_frame', sessionId: 'other' }),
    asset('frame_mine', { role: 'director_frame', sessionId: 'mine' }),
    asset('clip', {}, 'video'),
  ], { sessionId: 'mine', shotId: 'shot_1' })
  assert.deepEqual(groups.map((g) => [g.id, g.assets.map((a) => a.key)]), [
    ['composed', ['frame_mine', 'frame_other']],
    ['takes', ['director.t1.branch']],
    ['keyframes', ['kf_2', 'kf_1']],
    ['sheets', ['entity_reference_sheet_hero']],
    ['images', ['random']],
  ])
})
