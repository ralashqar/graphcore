import type { createAdminClient } from './auth.ts'
type Client = ReturnType<typeof createAdminClient>

export async function directorAsset(client: Client, projectId: string, key: string) {
  const result = await client.from('project_assets').select('*').eq('project_id', projectId).eq('key', key).single()
  if (result.error) throw new Error(`Asset ${key} is unavailable in this project.`)
  return result.data
}
export async function directorAssetUrl(client: Client, projectId: string, key: string) {
  const asset = await directorAsset(client, projectId, key)
  const signed = await client.storage.from('project-assets').createSignedUrl(asset.storage_path, 3600)
  if (signed.error) throw signed.error
  return signed.data.signedUrl
}
export async function downloadDirectorMedia(url: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90_000) })
      if (!response.ok) throw new Error(`Media download failed (${response.status}).`)
      return new Uint8Array(await response.arrayBuffer())
    } catch (error) { lastError = error }
  }
  throw lastError
}
export async function runDirectorFfmpeg(args: string[]) {
  const process = new Deno.Command('ffmpeg', { args: ['-hide_banner', '-loglevel', 'error', '-y', ...args], stdout: 'null', stderr: 'piped' }).spawn()
  const timer = setTimeout(() => { try { process.kill('SIGKILL') } catch { /* already exited */ } }, 180_000)
  try {
    const result = await process.output()
    if (!result.success) throw new Error(`Video processing failed: ${new TextDecoder().decode(result.stderr).slice(0, 1000)}`)
  } finally { clearTimeout(timer) }
}
export async function probeDirectorMedia(path: string) {
  const process = new Deno.Command('ffprobe', { args: ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], stdout: 'piped', stderr: 'piped' }).spawn()
  const timer = setTimeout(() => { try { process.kill('SIGKILL') } catch { /* exited */ } }, 15000)
  const result = await process.output().finally(() => clearTimeout(timer))
  if (!result.success) throw new Error('Could not inspect recorded video.')
  const info = JSON.parse(new TextDecoder().decode(result.stdout))
  return { duration: Number(info.format?.duration), hasAudio: info.streams?.some((s: { codec_type: string }) => s.codec_type === 'audio') === true }
}
export async function saveDirectorAsset(client: Client, input: { projectId: string; draftId: string; runId: string; key: string; name: string; bytes: Uint8Array; mimeType: string; metadata?: Record<string, unknown> }) {
  const extension = input.mimeType === 'image/png' ? 'png' : 'mp4'
  const path = `generated/director/${input.draftId}/${input.runId}/${input.key.replace(/[^a-zA-Z0-9_.-]/g, '_')}.${extension}`
  const upload = await client.storage.from('project-assets').upload(path, input.bytes, { contentType: input.mimeType, upsert: true })
  if (upload.error) throw upload.error
  const asset = await client.from('project_assets').upsert({ project_id: input.projectId, key: input.key, name: input.name, kind: extension === 'png' ? 'image' : 'video', mime_type: input.mimeType, storage_path: path, metadata: { ...input.metadata, generatedBy: 'vibe_director', runId: input.runId, storageBucket: 'project-assets', storagePath: path } }, { onConflict: 'project_id,key' })
  if (asset.error) throw asset.error
  return { assetKey: input.key, storagePath: path, mimeType: input.mimeType }
}
