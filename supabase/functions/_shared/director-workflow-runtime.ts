import { directorTakeSchema, directorSettingsSchema, directorClipSchema, compileDirectorPrompt, type DirectorReference } from '../../../src/domain/directorWorkspace.ts'
import { buildH3VideoRequest, h3Model } from '../../../src/domain/h3Video.ts'
import { aiUsageLineSchema } from '../../../src/domain/aiUsage.ts'
import { recordAiUsageEvent } from './ai-provider-gateway.ts'
import type { createAdminClient } from './auth.ts'
import { directorAssetUrl, downloadDirectorMedia, runDirectorFfmpeg, probeDirectorMedia, saveDirectorAsset } from './director-media.ts'

type Client = ReturnType<typeof createAdminClient>
type Input = {
  client: Client; inputHash: string;
  run: { id: string; projectId: string; draftId: string; requestedBy?: string | null; input: Record<string, unknown>; workflowId: string };
  node: { config: Record<string, unknown> };
}
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
async function checkedJson(url: string, key: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30_000) })
  const body = await response.json()
  if (!response.ok) throw new Error(`Fal ${response.status}: ${JSON.stringify(body).slice(0, 700)}`)
  return body
}
async function assertRunning(input: Input, takeId?: string) {
  const run = await input.client.from('output_workflow_runs').select('status').eq('id', input.run.id).single()
  if (run.error || run.data.status === 'cancelled') throw new Error('Director generation cancelled.')
  if (takeId) {
    const take = await input.client.from('director_takes').select('status').eq('id', takeId).single()
    if (take.error || take.data.status === 'cancelled') throw new Error('Director generation cancelled.')
  }
}
async function updateTake(input: Input, id: string, changes: Record<string, unknown>) {
  const result = await input.client.from('director_takes').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).neq('status', 'cancelled').select('id')
  if (result.error) throw result.error
  if (!result.data.length) throw new Error('Director generation cancelled.')
}
async function settleCredits(input: Input, takeId: string, charge: number) {
  const settled = await input.client.rpc('director_settle_credits', { p_take: takeId, p_charge: charge })
  if (settled.error) throw settled.error
  return Number(settled.data)
}
async function runTake(input: Input) {
  const result = await input.client.from('director_takes').select('*').eq('id', input.run.input.takeId).eq('run_id', input.run.id).eq('project_id', input.run.projectId).single()
  if (result.error) throw result.error
  const take = directorTakeSchema.parse(result.data)
  if (take.status === 'completed' && take.asset_key) return { assetKey: take.asset_key, takeId: take.id }
  await assertRunning(input, take.id)
  const temp = await Deno.makeTempDir({ prefix: 'director-take-' })
  let requestId = take.provider_request_id
  let model = ''
  try {
    await updateTake(input, take.id, { status: 'preparing' })
    const context = structuredClone(take.context)
    const settings = { ...take.settings }
    let firstFrameUrl = settings.firstFrameAssetKey ? await directorAssetUrl(input.client, input.run.projectId, settings.firstFrameAssetKey) : undefined
    const endFrameUrl = settings.endFrameAssetKey ? await directorAssetUrl(input.client, input.run.projectId, settings.endFrameAssetKey) : undefined
    const references: Array<DirectorReference & { url: string }> = await Promise.all(context.references.map(async ref => ({ ...ref, url: await directorAssetUrl(input.client, input.run.projectId, ref.assetKey) })))
    if (take.parent_take_id) {
      const parentResult = await input.client.from('director_takes').select('asset_key,duration_seconds').eq('id', take.parent_take_id).eq('session_id', take.session_id).single()
      if (parentResult.error || !parentResult.data.asset_key) throw new Error('Branch source media is missing.')
      const source = `${temp}/source.mp4`
      await Deno.writeFile(source, await downloadDirectorMedia(await directorAssetUrl(input.client, input.run.projectId, parentResult.data.asset_key)))
      const time = Math.min(take.branch_seconds ?? 0, Math.max(0, parentResult.data.duration_seconds - 1 / 24))
      const motion = take.branch_mode === 'motion'
      const path = `${temp}/${motion ? 'tail.mp4' : 'frame.png'}`
      const duration = Math.min(3, take.branch_seconds ?? 0)
      if (motion) await runDirectorFfmpeg(['-i', source, '-ss', String(Math.max(0, (take.branch_seconds ?? 0) - duration)), '-t', String(duration), '-c:v', 'libx264', '-c:a', 'aac', path])
      else await runDirectorFfmpeg(['-i', source, '-ss', String(time), '-frames:v', '1', path])
      await assertRunning(input, take.id)
      const asset = await saveDirectorAsset(input.client, { projectId: input.run.projectId, draftId: input.run.draftId, runId: input.run.id, key: `director.${take.id}.branch`, name: 'Branch reference', bytes: await Deno.readFile(path), mimeType: motion ? 'video/mp4' : 'image/png' })
      const url = await directorAssetUrl(input.client, input.run.projectId, asset.assetKey)
      if (motion) {
        settings.firstFrameAssetKey = ''; settings.endFrameAssetKey = ''
        references.push({ assetKey: asset.assetKey, label: 'Preceding motion. Continue after this moment; do not replay it.', kind: 'video', durationSeconds: duration, url })
      } else {
        firstFrameUrl = url; settings.firstFrameAssetKey = asset.assetKey
        references.splice(0, references.length, { assetKey: asset.assetKey, label: 'Exact opening frame', kind: 'image', url })
      }
    }
    context.references = references.map(({ url: _url, ...ref }) => ref)
    model = h3Model(settings, references)
    const prompt = compileDirectorPrompt(context, take.prompt.split('Direction: ').at(-1)?.split('\nNative audio:')[0] ?? take.prompt, settings)
    const body = buildH3VideoRequest({ model, prompt, settings, references, firstFrameUrl, endFrameUrl })
    const apiKey = Deno.env.get('FAL_KEY')
    if (!apiKey) throw new Error('FAL_KEY is not configured on the video worker.')
    const base = `https://queue.fal.run/${model.split('/').slice(0, 2).join('/')}`
    if (!requestId) {
      // A crash after provider acceptance must not silently submit another paid job.
      const claim = await input.client.from('director_takes').update({ submission_started: true }).eq('id', take.id).eq('submission_started', false).neq('status', 'cancelled').select('id')
      if (claim.error || !claim.data?.length) throw new Error('The previous provider submission has an uncertain outcome. Check provider history before starting another take.')
      const submitted = await checkedJson(`https://queue.fal.run/${model}`, apiKey, { method: 'POST', body: JSON.stringify(body) })
      requestId = submitted.request_id
      if (!requestId) throw new Error('Fal returned no request identifier.')
      await updateTake(input, take.id, { provider_request_id: requestId, status: 'generating' })
    }
    const started = Date.now()
    let videoUrl = ''
    while (Date.now() - started < 600_000) {
      await assertRunning(input, take.id)
      let status
      try { status = await checkedJson(`${base}/requests/${requestId}/status`, apiKey) }
      catch (error) { if (!/Fal (408|429|5\d\d):|fetch|network|timeout/i.test(String(error))) throw error; await delay(1500); continue }
      if (status.status === 'COMPLETED') {
        const output = await checkedJson(`${base}/requests/${requestId}`, apiKey)
        videoUrl = output.video?.url ?? output.data?.video?.url ?? ''
        if (!videoUrl) throw new Error('Fal completed without a video file.')
        break
      }
      if (['FAILED','CANCELLED'].includes(status.status)) throw new Error(status.error ?? 'Fal generation failed.')
      await delay(750)
    }
    if (!videoUrl) throw new Error('Video generation timed out; the provider request is preserved.')
    await updateTake(input, take.id, { status: 'saving' })
    const bytes = await downloadDirectorMedia(videoUrl)
    await Deno.writeFile(`${temp}/result.mp4`, bytes)
    const probe = await probeDirectorMedia(`${temp}/result.mp4`)
    if (!Number.isFinite(probe.duration) || probe.duration <= 0) throw new Error('Generated media has no usable duration.')
    await assertRunning(input, take.id)
    const asset = await saveDirectorAsset(input.client, { projectId: input.run.projectId, draftId: input.run.draftId, runId: input.run.id, key: `director.${take.id}`, name: 'Director take', bytes, mimeType: 'video/mp4', metadata: { takeId: take.id, model, providerRequestId: requestId, prompt, durationSeconds: probe.duration } })
    await settleCredits(input, take.id, take.credits_reserved)
    await recordAiUsageEvent(input.client as never, { idempotencyKey: `director:${take.id}`, creditsCharged: take.credits_reserved, context: { projectId: input.run.projectId, draftId: input.run.draftId, outputWorkflowRunId: input.run.id, userId: input.run.requestedBy ?? undefined }, line: aiUsageLineSchema.parse({ provider: 'fal', model, modality: 'video', operation: 'video_generation', status: 'succeeded', requestId, media: { durationSeconds: probe.duration }, cost: { estimatedCostUsd: take.estimated_cost_usd, estimatedCredits: Math.ceil(take.estimated_cost_usd * 100), pricingSource: 'h3_list_rate_estimate' } }) })
    await updateTake(input, take.id, { status: 'completed', asset_key: asset.assetKey, duration_seconds: probe.duration, error_message: null })
    return { ...asset, takeId: take.id, durationSeconds: probe.duration }
  } catch (error) {
    const cancelled = await input.client.from('director_takes').select('status,submission_started').eq('id', take.id).single()
    if (!cancelled.data?.submission_started || (!requestId && /Fal (400|401|403|404|422|429):/.test(String(error)))) await settleCredits(input, take.id, 0)
    if (cancelled.data?.status === 'cancelled' && requestId && model) {
      await checkedJson(`https://queue.fal.run/${model.split('/').slice(0, 2).join('/')}/requests/${requestId}/cancel`, Deno.env.get('FAL_KEY') ?? '', { method: 'PUT' }).catch(() => {})
    }
    await input.client.from('director_takes').update({ status: 'failed', error_message: String(error), updated_at: new Date().toISOString() }).eq('id', take.id).neq('status', 'cancelled')
    throw error
  } finally { await Deno.remove(temp, { recursive: true }) }
}

async function runExport(input: Input) {
  const edit = await input.client.from('director_edits').select('*').eq('id', input.run.input.editId).eq('session_id', input.run.input.sessionId).single()
  if (edit.error) throw edit.error
  const clips = directorClipSchema.array().parse(edit.data.clips)
  if (!clips.length) throw new Error('The selected edit is empty.')
  const settings = directorSettingsSchema.parse(input.run.input.settings)
  const [rw, rh] = settings.aspectRatio.split(':').map(Number)
  const height = settings.resolution === '768p' ? 768 : 480
  const width = Math.round(height * rw / rh / 2) * 2
  const temp = await Deno.makeTempDir({ prefix: 'director-export-' })
  try {
    for (const [i, clip] of clips.entries()) {
      await assertRunning(input)
      const take = await input.client.from('director_takes').select('asset_key').eq('id', clip.takeId).eq('session_id', edit.data.session_id).eq('status', 'completed').single()
      if (take.error || !take.data.asset_key) throw new Error('An edit references unavailable footage.')
      const path = `${temp}/source-${i}.mp4`
      await Deno.writeFile(path, await downloadDirectorMedia(await directorAssetUrl(input.client, input.run.projectId, take.data.asset_key)))
      const probe = await probeDirectorMedia(path)
      await runDirectorFfmpeg(['-i', path, ...(!probe.hasAudio ? ['-f','lavfi','-i','anullsrc=r=48000:cl=stereo'] : []), '-ss', String(clip.inSeconds), '-t', String(clip.outSeconds - clip.inSeconds), '-map', '0:v:0', '-map', probe.hasAudio ? '0:a:0' : '1:a:0', '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24`, '-c:v','libx264','-pix_fmt','yuv420p','-preset','fast','-crf','20','-c:a','aac','-ar','48000','-ac','2', `${temp}/clip-${i}.mp4`])
    }
    await Deno.writeTextFile(`${temp}/concat.txt`, clips.map((_, i) => `file 'clip-${i}.mp4'`).join('\n'))
    await runDirectorFfmpeg(['-f','concat','-safe','0','-i',`${temp}/concat.txt`,'-c','copy','-movflags','+faststart',`${temp}/edit.mp4`])
    await assertRunning(input)
    const asset = await saveDirectorAsset(input.client, { projectId: input.run.projectId, draftId: input.run.draftId, runId: input.run.id, key: `director.export.${input.run.id}`, name: 'Director edit', bytes: await Deno.readFile(`${temp}/edit.mp4`), mimeType: 'video/mp4', metadata: { editId: edit.data.id, sessionId: edit.data.session_id } })
    const artifact = await input.client.from('output_artifacts').upsert({ project_id: input.run.projectId, draft_id: input.run.draftId, workflow_id: input.run.workflowId, run_id: input.run.id, key: asset.assetKey, asset_key: asset.assetKey, name: 'Director edit', kind: 'video', mime_type: 'video/mp4', metadata: { role: 'director_edit', editId: edit.data.id, ...asset } }, { onConflict: 'draft_id,key' })
    if (artifact.error) throw artifact.error
    return asset
  } finally { await Deno.remove(temp, { recursive: true }) }
}
async function runLiveFinalize(input: Input) {
  const found = await input.client.from('director_takes').select('*').eq('id', input.run.input.takeId).eq('run_id', input.run.id).eq('project_id', input.run.projectId).single()
  if (found.error) throw found.error
  const take = directorTakeSchema.parse(found.data)
  if (take.status === 'completed' && take.asset_key) return { assetKey: take.asset_key, takeId: take.id }
  const live = await input.client.from('director_live_sessions').select('*').eq('take_id', take.id).single()
  if (live.error || !live.data.chunk_count) throw new Error('Live recording was not finalized.')
  const chunks = await input.client.from('director_live_chunks').select('*').eq('take_id', take.id).lt('chunk_index', live.data.chunk_count).order('chunk_index')
  if (chunks.error || chunks.data.length !== live.data.chunk_count) throw new Error('Recording chunks are missing.')
  const temp = await Deno.makeTempDir({ prefix: 'director-live-' })
  try {
    const file = await Deno.open(`${temp}/capture.webm`, { create: true, write: true })
    try {
      for (const chunk of chunks.data) {
        await assertRunning(input, take.id)
        const signed = await input.client.storage.from('project-assets').createSignedUrl(chunk.storage_path, 600)
        if (signed.error) throw signed.error
        const bytes = await downloadDirectorMedia(signed.data.signedUrl)
        let offset = 0
        while (offset < bytes.length) offset += await file.write(bytes.subarray(offset))
      }
    } finally { file.close() }
    await runDirectorFfmpeg(['-i',`${temp}/capture.webm`,'-t','120','-c:v','libx264','-pix_fmt','yuv420p','-preset','fast','-crf','20','-c:a','aac','-ar','48000','-movflags','+faststart',`${temp}/capture.mp4`])
    const probe = await probeDirectorMedia(`${temp}/capture.mp4`)
    if (!Number.isFinite(probe.duration) || probe.duration <= 0) throw new Error('No playable footage was recorded.')
    await assertRunning(input, take.id)
    const asset = await saveDirectorAsset(input.client, { projectId: input.run.projectId, draftId: input.run.draftId, runId: input.run.id, key: `director.${take.id}`, name: 'Live Director take', bytes: await Deno.readFile(`${temp}/capture.mp4`), mimeType: 'video/mp4', metadata: { takeId: take.id, providerSessionId: live.data.provider_session_id, durationSeconds: probe.duration, recordingSource: 'browser_webrtc' } })
    const billedSeconds = Math.min(120, Math.max(60, Math.ceil((Date.parse(live.data.stopped_at ?? live.data.expires_at) - Date.parse(live.data.created_at)) / 1000)))
    const charged = await settleCredits(input, take.id, Math.min(take.credits_reserved, Math.ceil(take.credits_reserved * billedSeconds / 120)))
    await recordAiUsageEvent(input.client as never, { idempotencyKey: `director:${take.id}`, creditsCharged: charged, context: { projectId: input.run.projectId, draftId: input.run.draftId, outputWorkflowRunId: input.run.id, userId: input.run.requestedBy ?? undefined }, line: aiUsageLineSchema.parse({ provider: 'fal', model: 'minimax/h3-max/director', modality: 'video', operation: 'live_video_capture', status: 'succeeded', requestId: live.data.provider_session_id, cost: { estimatedCostUsd: take.estimated_cost_usd, pricingSource: 'h3_live_beta_session_cap_estimate' } }) })
    await updateTake(input, take.id, { status: 'completed', asset_key: asset.assetKey, duration_seconds: probe.duration, error_message: null })
    return { ...asset, takeId: take.id, durationSeconds: probe.duration, creditsCharged: charged }
  } catch (error) {
    await updateTake(input, take.id, { status: 'failed', error_message: String(error) }).catch(() => {})
    throw error
  } finally { await Deno.remove(temp, { recursive: true }) }
}
export async function executeDirectorWorkflow(input: Input) {
  const operation = input.node.config.operation
  if (!['take','export','live_finalize'].includes(String(operation))) throw new Error('Unknown Director workflow operation.')
  const director = operation === 'take' ? await runTake(input) : operation === 'live_finalize' ? await runLiveFinalize(input) : await runExport(input)
  return { inputHash: input.inputHash, outputHash: JSON.stringify(director), outputs: { director, video: director }, provider: 'graphcore', model: 'director-workspace-v1' }
}
