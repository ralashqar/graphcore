// Normalised-clip cache and bounded parallelism for Director edit exports.
//
// Both take runtimes render an export by normalising every clip (trim, scale/pad, fps, audio) and then
// concatenating. Normalised clips are keyed by source media, trim range and frame size and stored under
// `generated/director-clips/<draftId>/<key>.mp4`; a re-export after one trim only re-encodes the changed clip.

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: { message: string } | null }>
      upload: (path: string, body: Uint8Array | Blob, options?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
    }
  }
}

const BUCKET = 'project-assets'

export async function directorClipCacheKey(input: { source: string; inSeconds: number; outSeconds: number; width: number; height: number }) {
  const text = `${input.source}|${input.inSeconds.toFixed(3)}|${input.outSeconds.toFixed(3)}|${input.width}x${input.height}|v1`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).slice(0, 20).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function directorClipCachePath(draftId: string, key: string) {
  return `generated/director-clips/${draftId}/${key}.mp4`
}

/** Returns the cached normalised clip bytes, or null on a miss. Never throws: a cache problem falls back to encoding. */
export async function readCachedDirectorClip(client: StorageClient, path: string): Promise<Uint8Array | null> {
  try {
    const result = await client.storage.from(BUCKET).download(path)
    if (result.error || !result.data) return null
    const bytes = new Uint8Array(await result.data.arrayBuffer())
    return bytes.byteLength > 0 ? bytes : null
  } catch {
    return null
  }
}

export async function writeCachedDirectorClip(client: StorageClient, path: string, bytes: Uint8Array) {
  try {
    const result = await client.storage.from(BUCKET).upload(path, bytes, { contentType: 'video/mp4', upsert: true })
    if (result.error) console.warn(JSON.stringify({ event: 'director_clip_cache_write_failed', path, error: result.error.message }))
  } catch (error) {
    console.warn(JSON.stringify({ event: 'director_clip_cache_write_failed', path, error: String(error) }))
  }
}

/** Runs `fn` over `items` with at most `limit` in flight, preserving result order; the first failure rejects. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

export const DIRECTOR_EXPORT_CLIP_CONCURRENCY = Math.max(1, Math.min(4, Number(Deno.env.get('DIRECTOR_EXPORT_CLIP_CONCURRENCY')) || 3))

/** FFmpeg arguments that normalise one trimmed clip to the export frame. */
export function directorClipNormalizeArgs(input: { source: string; output: string; hasAudio: boolean; inSeconds: number; outSeconds: number; width: number; height: number; maxBytes?: number }) {
  return [
    '-i', input.source,
    ...(!input.hasAudio ? ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] : []),
    '-ss', String(input.inSeconds),
    '-t', String(input.outSeconds - input.inSeconds),
    '-map', '0:v:0',
    '-map', input.hasAudio ? '0:a:0' : '1:a:0',
    '-vf', `scale=${input.width}:${input.height}:force_original_aspect_ratio=decrease,pad=${input.width}:${input.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '20',
    '-c:a', 'aac', '-ar', '48000', '-ac', '2',
    ...(input.maxBytes ? ['-fs', String(input.maxBytes)] : []),
    input.output,
  ]
}
