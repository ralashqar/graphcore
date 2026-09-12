import test from 'node:test'
import assert from 'node:assert/strict'
import { branchPrefix, compileDirectorPrompt, directorExportFrame, directorProgressSchema, directorSettingsSchema, directorTakeSchema, validateDirectorEdit } from './directorWorkspace.ts'
import { buildH3VideoRequest, buildH3WorkflowVideoBody, estimateH3Cost, h3Model, isH3FalModel, validateH3References } from './h3Video.ts'
const settings = directorSettingsSchema.parse({})
const id = '11111111-1111-4111-8111-111111111111'
test('H3 reference fields and reference labels match their actual modality order', () => {
  const refs = [{ assetKey: 'hero', label: 'Hero', kind: 'image' as const, url: 'https://example.com/hero.png' }, { assetKey: 'voice', label: 'Voice', kind: 'audio' as const, durationSeconds: 3, url: 'https://example.com/voice.wav' }]
  const context = { revision: '1', script: 'Hello.', artDirection: 'Live action', continuity: '', entities: [], references: refs }
  const prompt = compileDirectorPrompt(context, 'Hold the close-up.', settings)
  const body = buildH3VideoRequest({ model: h3Model(settings, refs), prompt, settings, references: refs })
  assert.deepEqual(body.reference_image_urls, [refs[0].url]); assert.deepEqual(body.reference_audio_urls, [refs[1].url])
  assert.equal(body.resolution, '768P'); assert.equal(body.prompt_expansion_mode, 'balanced')
  assert.equal('image_urls' in body, false); assert.match(prompt, /Image 1: Hero/); assert.match(prompt, /Audio 1: Voice/)
})
test('short editorial shots generate at least five seconds and first/last frames use their own contract', () => {
  const input = { ...settings, durationSeconds: 2, firstFrameAssetKey: 'start', endFrameAssetKey: 'end' }
  const body = buildH3VideoRequest({ model: h3Model(input, []), prompt: 'Move.', settings: input, references: [], firstFrameUrl: 'start', endFrameUrl: 'end' })
  assert.equal(body.duration, 5); assert.equal(body.image_url, 'start'); assert.equal(body.end_image_url, 'end'); assert.equal('reference_image_urls' in body, false)
})
test('unsupported Turbo references and invalid reference duration are rejected before charging', () => {
  assert.throws(() => h3Model({ ...settings, speed: 'turbo' }, [{ assetKey: 'hero', label: 'Hero', kind: 'image' }]), /starting frame/)
  assert.throws(() => validateH3References([{ assetKey: 'voice', label: 'Voice', kind: 'audio', durationSeconds: 3 }]), /requires an image/)
  assert.throws(() => validateH3References([{ assetKey: 'clip', label: 'Motion', kind: 'video', durationSeconds: 1 }]), /2–15/)
  assert.throws(() => validateH3References(Array.from({ length: 10 }, (_, i) => ({ assetKey: String(i), label: 'Image', kind: 'image' }))), /nine|9/)
})
test('reference cost includes video tokens and never assumes a promotional discount', () => {
  assert.equal(estimateH3Cost(settings, []), 0.4)
  const refs = [0, 1].map(i => ({ assetKey: String(i), label: 'Image', kind: 'image' as const, width: 1024, height: 1024 }))
  assert.equal(estimateH3Cost(settings, [...refs, { assetKey: 'clip', label: 'Motion', kind: 'video', durationSeconds: 5 }]), 1.105)
})
test('1080p, adaptive ratio and quality expansion follow the current fal H3 contract', () => {
  const hd = directorSettingsSchema.parse({ resolution: '1080p', promptExpansion: 'quality', aspectRatio: 'adaptive' })
  const refs = [{ assetKey: 'hero', label: 'Hero', kind: 'image' as const, url: 'https://example.com/hero.png' }]
  const body = buildH3VideoRequest({ model: h3Model(hd, refs), prompt: 'Hold.', settings: hd, references: refs })
  assert.equal(body.resolution, '1080P'); assert.equal(body.prompt_expansion_mode, 'quality'); assert.equal(body.aspect_ratio, 'adaptive')
  assert.equal(estimateH3Cost({ ...hd, aspectRatio: '16:9' }, []), 0.8)
  // Text-to-video has no reference to adapt to, so adaptive is rejected before any credit reservation.
  assert.throws(() => h3Model(hd, []), /fixed ratio/)
  // Image-to-video inherits the first frame's ratio; no aspect_ratio is sent even when adaptive is selected.
  const i2v = { ...hd, firstFrameAssetKey: 'start' }
  const framed = buildH3VideoRequest({ model: h3Model(i2v, []), prompt: 'Move.', settings: i2v, references: [], firstFrameUrl: 'start' })
  assert.equal('aspect_ratio' in framed, false); assert.equal(framed.image_url, 'start')
  assert.equal(directorSettingsSchema.parse({}).promptExpansion, 'balanced')
})
test('H3 workflow video body maps Seedance-shaped node inputs onto the H3 contract', () => {
  const refs = { prompt: 'Shot 3.', durationSeconds: 6.4, aspectRatio: '16:9', resolution: '720p', referenceImageUrls: ['a', 'b'], referenceVideoUrls: ['v'] }
  const r2v = buildH3WorkflowVideoBody({ ...refs, model: 'minimax/h3-max/reference-to-video' })
  assert.equal(r2v.resolution, '768P'); assert.equal(r2v.duration, 6); assert.deepEqual(r2v.reference_image_urls, ['a', 'b']); assert.deepEqual(r2v.reference_video_urls, ['v'])
  assert.equal('image_urls' in r2v, false); assert.equal('generate_audio' in r2v, false)
  const i2v = buildH3WorkflowVideoBody({ ...refs, model: 'minimax/h3-max-turbo/image-to-video', resolution: '1080p', durationSeconds: 3 })
  assert.equal(i2v.image_url, 'a'); assert.equal(i2v.resolution, '1080P'); assert.equal(i2v.duration, 5); assert.equal('aspect_ratio' in i2v, false)
  const t2v = buildH3WorkflowVideoBody({ ...refs, model: 'minimax/h3-max/text-to-video', aspectRatio: 'adaptive', referenceImageUrls: [] })
  assert.equal(t2v.aspect_ratio, '16:9')
  assert.equal(isH3FalModel('bytedance/seedance-2.0/reference-to-video'), false)
  assert.throws(() => buildH3WorkflowVideoBody({ ...refs, model: 'minimax/h3-max/image-to-video', referenceImageUrls: [] }), /first-frame/)
})
test('export frame size derives from resolution and normalises adaptive to 16:9', () => {
  assert.deepEqual(directorExportFrame(directorSettingsSchema.parse({ resolution: '1080p' })), { width: 1920, height: 1080 })
  assert.deepEqual(directorExportFrame(directorSettingsSchema.parse({ resolution: '480p', aspectRatio: '9:16' })), { width: 270, height: 480 })
  assert.deepEqual(directorExportFrame(directorSettingsSchema.parse({ aspectRatio: 'adaptive' })), { width: 1366, height: 768 })
})
test('progress payloads are validated and tolerate partial take rows', () => {
  const progress = directorProgressSchema.parse({ needsRefresh: false, takes: [{ id, status: 'completed' }], jobs: [], exports: [] })
  assert.equal(progress.takes?.[0].status, 'completed')
  assert.throws(() => directorProgressSchema.parse({ needsRefresh: false, takes: [{ status: 'completed' }] }))
})
test('branch preserves only the prefix at start, middle and end without mutating the old edit', () => {
  const clips = [{ id: 'a', takeId: id, inSeconds: 0, outSeconds: 5 }, { id: 'b', takeId: '22222222-2222-4222-8222-222222222222', inSeconds: 0, outSeconds: 5 }]
  assert.deepEqual(branchPrefix(clips, id, 0), [])
  assert.deepEqual(branchPrefix(clips, id, 3), [{ ...clips[0], outSeconds: 3 }])
  assert.deepEqual(branchPrefix(clips, id, 5), [clips[0]])
  assert.equal(clips.length, 2); assert.equal(clips[0].outSeconds, 5)
  assert.throws(() => branchPrefix(clips, id, 6), /not in the active edit/)
})
test('edits reject unsaved footage, duplicate clip IDs and ranges beyond media duration', () => {
  const take = directorTakeSchema.parse({ id, session_id: id, project_id: id, draft_id: id, status: 'completed', review: 'candidate', prompt: '', settings, context: { revision: '1' }, parent_take_id: null, branch_seconds: null, base_edit_id: null, asset_key: 'video', duration_seconds: 5, run_id: null, provider_request_id: null, error_message: null, created_at: '', updated_at: '' })
  const clip = { id: 'clip', takeId: id, inSeconds: 0, outSeconds: 4 }
  assert.equal(validateDirectorEdit([clip], [take]).length, 1)
  assert.throws(() => validateDirectorEdit([clip, clip], [take]), /unique/)
  assert.throws(() => validateDirectorEdit([{ ...clip, outSeconds: 6 }], [take]), /beyond/)
  assert.throws(() => validateDirectorEdit([clip], [{ ...take, status: 'saving' }]), /Only saved/)
})
