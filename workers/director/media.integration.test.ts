import { directorContextSchema, directorSettingsSchema } from '../../src/domain/directorWorkspace.ts'
import { probeDirectorMedia, runDirectorFfmpeg } from '../../supabase/functions/_shared/director-media.ts'
import {
  downloadFile,
  ingestTake,
  prepareTake,
  renderEdit,
} from '../../supabase/functions/_shared/director-runtime/media.ts'
import type { Client, Job } from '../../supabase/functions/_shared/director-runtime/types.ts'

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message)
}
Deno.test('real FFmpeg branch frames, motion tails, ingestion, and silent-audio edit export', async () => {
  const dir = await Deno.makeTempDir({ prefix: 'director-media-test-' }), originalFetch = globalThis.fetch
  try {
    const source = `${dir}/source.mp4`
    await runDirectorFfmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=640x360:r=24',
      '-t',
      '5',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      source,
    ])
    const bytes = await Deno.readFile(source), uploads = new Map<string, Uint8Array>()
    globalThis.fetch = (_url) => Promise.resolve(new Response(bytes))
    const client = {
      storage: {
        from: () => ({
          createSignedUrl: () =>
            Promise.resolve({ data: { signedUrl: 'https://fixture.invalid/source.mp4' }, error: null }),
          upload: async (path: string, body: ReadableStream<Uint8Array>) => {
            uploads.set(path, new Uint8Array(await new Response(body).arrayBuffer()))
            return { data: { path }, error: null }
          },
        }),
      },
    } as unknown as Client
    const settings = directorSettingsSchema.parse({ resolution: '480p' }), takeId = crypto.randomUUID()
    const job = {
      id: crypto.randomUUID(),
      take_id: takeId,
      lease_token: 2,
      run_id: crypto.randomUUID(),
      snapshot: {
        direction: 'Hold the frame',
        settings,
        references: [],
        parent: { storagePath: 'saved/source.mp4', duration: 5 },
        take: {
          id: takeId,
          settings,
          context: directorContextSchema.parse({ revision: '1' }),
          parent_take_id: crypto.randomUUID(),
          branch_seconds: 3,
          branch_mode: 'frame',
        },
      },
      checkpoint: {},
    } as unknown as Job
    const frame = await prepareTake(client, job)
    assert(frame.model === 'minimax/h3-max/image-to-video', 'frame branch chose wrong model')
    assert(frame.firstFramePath?.includes('/2/frame.png'), 'branch frame was not durably staged')
    const png = uploads.get(frame.firstFramePath!)!
    assert(png[0] === 137 && png[1] === 80 && png[2] === 78 && png[3] === 71, 'branch is not a real PNG frame')
    job.snapshot.take!.branch_mode = 'motion'
    const motion = await prepareTake(client, job)
    assert(motion.model === 'minimax/h3-max/reference-to-video', 'motion branch chose wrong model')
    const tail = motion.references!.find((r) => r.kind === 'video')!
    await Deno.writeFile(`${dir}/tail.mp4`, uploads.get(tail.storagePath)!)
    const tailProbe = await probeDirectorMedia(`${dir}/tail.mp4`)
    assert(Math.abs(tailProbe.duration - 3) < 0.1, 'motion tail duration is wrong')
    job.checkpoint = { videoUrl: 'https://fixture.invalid/source.mp4' }
    const ingested = await ingestTake(client, job)
    assert(Math.abs(ingested.durationSeconds! - 5) < 0.1, 'take ingestion duration is wrong')
    job.take_id = null
    job.snapshot.clips = [{ storagePath: 'source', inSeconds: 0, outSeconds: 2 }, {
      storagePath: 'source',
      inSeconds: 3,
      outSeconds: 5,
    }]
    const exported = await renderEdit(client, job)
    await Deno.writeFile(`${dir}/edit.mp4`, uploads.get(exported.storagePath)!)
    const result = await probeDirectorMedia(`${dir}/edit.mp4`)
    assert(Math.abs(result.duration - 4) < 0.2, 'export trim/concatenation duration is wrong')
    assert(result.hasAudio, 'export failed to normalize silent footage with an audio track')
  } finally {
    globalThis.fetch = originalFetch
    await Deno.remove(dir, { recursive: true })
  }
})
Deno.test('streaming download rejects oversized content and removes the partial file', async () => {
  const dir = await Deno.makeTempDir({ prefix: 'director-download-test-' }), originalFetch = globalThis.fetch
  try {
    globalThis.fetch = () => Promise.resolve(new Response(new Uint8Array(32)))
    let rejected = false
    try {
      await downloadFile('https://fixture.invalid/large', `${dir}/large.mp4`, 10)
    } catch (error) {
      rejected = String(error).includes('size limit')
    }
    assert(rejected, 'download size limit was not enforced')
    let exists = true
    try {
      await Deno.stat(`${dir}/large.mp4`)
    } catch {
      exists = false
    }
    assert(!exists, 'partial download was not removed')
  } finally {
    globalThis.fetch = originalFetch
    await Deno.remove(dir, { recursive: true })
  }
})
