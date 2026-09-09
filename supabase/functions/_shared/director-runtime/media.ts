import { compileDirectorPrompt } from '../../../../src/domain/directorWorkspace.ts'
import { h3Model } from '../../../../src/domain/h3Video.ts'
import { probeDirectorMedia, runDirectorFfmpeg } from '../director-media.ts'
import type { Asset, Client, FrozenReference, Job } from './types.ts'

const MAX_FILE = 256 * 1024 * 1024
const MAX_EXPORT_SECONDS = 600
export async function signedPath(client: Client, path: string) {
  const result = await client.storage.from('project-assets').createSignedUrl(path, 3600)
  if (result.error) throw result.error
  return result.data.signedUrl
}
/** Streaming, bounded transfer. Partial files are removed before a retry. */
export async function downloadFile(url: string, path: string, maxBytes = MAX_FILE) {
  for (let attempt = 0;; attempt++) {
    const abort = AbortSignal.timeout(90_000)
    try {
      const response = await fetch(url, { signal: abort })
      if (!response.ok || !response.body) throw new Error(`Media download failed (${response.status})`)
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body.cancel()
        throw new Error('Media exceeds file size limit')
      }
      let bytes = 0
      const file = await Deno.open(path, { create: true, truncate: true, write: true })
      await response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            bytes += chunk.byteLength
            if (bytes > maxBytes) throw new Error('Media exceeds file size limit')
            controller.enqueue(chunk)
          },
        }),
      ).pipeTo(file.writable, { signal: abort })
      return bytes
    } catch (error) {
      await Deno.remove(path).catch(() => {})
      if (attempt >= 2 || String(error).includes('size limit')) throw error
    }
  }
}
async function stagedFile(
  client: Client,
  job: Job,
  localPath: string,
  suffix: string,
  mimeType: string,
): Promise<Asset> {
  const size = (await Deno.stat(localPath)).size
  if (size <= 0 || size > MAX_FILE) throw new Error('Processed media exceeds file size limit')
  // Old lease uploads can never overwrite the object selected by a newer lease.
  const storagePath = `generated/director-v2/${job.id}/${job.lease_token}/${suffix}`
  const file = await Deno.open(localPath, { read: true })
  try {
    const upload = await client.storage.from('project-assets').upload(storagePath, file.readable, {
      contentType: mimeType,
      upsert: true,
      duplex: 'half',
    })
    if (upload.error) throw upload.error
  } finally {
    try {
      file.close()
    } catch { /* consumed stream closes the file */ }
  }
  return { assetKey: job.take_id ? `director.${job.take_id}` : `director.export.${job.run_id}`, storagePath, mimeType }
}
async function withTemp<T>(job: Job, fn: (dir: string) => Promise<T>) {
  const dir = await Deno.makeTempDir({ prefix: `director-v2-${job.id}-` })
  try {
    return await fn(dir)
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => {})
  }
}
export async function prepareTake(client: Client, job: Job): Promise<Job['checkpoint']> {
  const take = job.snapshot.take!
  const settings = { ...take.settings }
  let firstFramePath = job.snapshot.firstFramePath
  const references: FrozenReference[] = structuredClone(job.snapshot.references)
  if (take.parent_take_id) {
    const parent = job.snapshot.parent
    if (!parent?.storagePath) throw new Error('Frozen branch source is missing')
    await withTemp(job, async (dir) => {
      const source = `${dir}/source.mp4`
      await downloadFile(await signedPath(client, parent.storagePath), source)
      const motion = take.branch_mode === 'motion'
      const duration = Math.min(3, take.branch_seconds ?? 0)
      const local = `${dir}/${motion ? 'tail.mp4' : 'frame.png'}`
      if (motion) {
        await runDirectorFfmpeg([
          '-i',
          source,
          '-ss',
          String(Math.max(0, (take.branch_seconds ?? 0) - duration)),
          '-t',
          String(duration),
          '-c:v',
          'libx264',
          '-c:a',
          'aac',
          local,
        ])
      } else {await runDirectorFfmpeg([
          '-i',
          source,
          '-ss',
          String(Math.min(take.branch_seconds ?? 0, Math.max(0, parent.duration - 1 / 24))),
          '-frames:v',
          '1',
          local,
        ])}
      const asset = await stagedFile(
        client,
        job,
        local,
        motion ? 'tail.mp4' : 'frame.png',
        motion ? 'video/mp4' : 'image/png',
      )
      const ref: FrozenReference = {
        assetKey: `director.${take.id}.branch`,
        storagePath: asset.storagePath,
        label: motion ? 'Preceding motion. Continue after this moment; do not replay it.' : 'Exact opening frame',
        kind: motion ? 'video' : 'image',
        ...(motion ? { durationSeconds: duration } : {}),
      }
      if (motion) {
        settings.firstFrameAssetKey = ''
        settings.endFrameAssetKey = ''
        firstFramePath = undefined
        references.push(ref)
      } else {
        settings.firstFrameAssetKey = ref.assetKey
        firstFramePath = asset.storagePath
        references.splice(0, references.length, ref)
      }
    })
  }
  const context = { ...take.context, references }
  return {
    model: h3Model(settings, references),
    prompt: compileDirectorPrompt(context, job.snapshot.direction, settings),
    settings,
    references,
    firstFramePath,
    endFramePath: settings.endFrameAssetKey ? job.snapshot.endFramePath : undefined,
  }
}
export function ingestTake(client: Client, job: Job): Promise<Asset> {
  if (!job.checkpoint.videoUrl) throw new Error('No provider media to ingest')
  return withTemp(job, async (dir) => {
    const local = `${dir}/result.mp4`
    await downloadFile(job.checkpoint.videoUrl!, local)
    const probe = await probeDirectorMedia(local)
    if (!Number.isFinite(probe.duration) || probe.duration <= 0 || probe.duration > 16) {
      throw new Error('Generated take has an invalid duration')
    }
    return { ...await stagedFile(client, job, local, 'result.mp4', 'video/mp4'), durationSeconds: probe.duration }
  })
}
export function renderEdit(client: Client, job: Job): Promise<Asset> {
  const clips = job.snapshot.clips ?? []
  const duration = clips.reduce((sum, c) => sum + c.outSeconds - c.inSeconds, 0)
  if (!clips.length || duration > MAX_EXPORT_SECONDS || clips.length > 100) {
    throw new Error('Export limit is 100 clips / 10 minutes; split this edit')
  }
  const settings = job.snapshot.settings
  const [rw, rh] = settings.aspectRatio.split(':').map(Number)
  const height = settings.resolution === '768p' ? 768 : 480, width = Math.round(height * rw / rh / 2) * 2
  return withTemp(job, async (dir) => {
    let diskBytes = 0
    const started = Date.now()
    for (const [i, clip] of clips.entries()) {
      if (Date.now() - started > 600000) throw new Error('Export processing deadline exceeded; split this edit')
      const source = `${dir}/source.mp4`, output = `${dir}/clip-${i}.mp4`
      await downloadFile(await signedPath(client, clip.storagePath), source)
      const probe = await probeDirectorMedia(source)
      await runDirectorFfmpeg([
        '-i',
        source,
        ...(!probe.hasAudio ? ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] : []),
        '-ss',
        String(clip.inSeconds),
        '-t',
        String(clip.outSeconds - clip.inSeconds),
        '-map',
        '0:v:0',
        '-map',
        probe.hasAudio ? '0:a:0' : '1:a:0',
        '-vf',
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'fast',
        '-crf',
        '20',
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-fs',
        String(MAX_FILE),
        output,
      ])
      await Deno.remove(source)
      diskBytes += (await Deno.stat(output)).size
      if (diskBytes > MAX_FILE) throw new Error('Export exceeds disk budget; split this edit')
    }
    await Deno.writeTextFile(`${dir}/concat.txt`, clips.map((_, i) => `file 'clip-${i}.mp4'`).join('\n'))
    await runDirectorFfmpeg([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      `${dir}/concat.txt`,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      `${dir}/edit.mp4`,
    ])
    return { ...await stagedFile(client, job, `${dir}/edit.mp4`, 'edit.mp4', 'video/mp4'), durationSeconds: duration }
  })
}
