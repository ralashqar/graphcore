import type { DirectorReference, DirectorSettings } from './directorWorkspace.ts'

export type VideoGenerationCapabilities = { minSeconds: number; maxSeconds: number; resolutions: readonly string[]; images: number; videos: number; audio: number; firstLast: boolean }
export const H3_CAPABILITIES: VideoGenerationCapabilities = { minSeconds: 5, maxSeconds: 15, resolutions: ['480p', '768p'], images: 9, videos: 3, audio: 3, firstLast: true }
export function h3Model(settings: DirectorSettings, references: DirectorReference[], hasBranch = false) {
  const suffix = hasBranch || settings.firstFrameAssetKey ? 'image-to-video' : references.length ? 'reference-to-video' : 'text-to-video'
  if (settings.speed === 'turbo' && suffix === 'reference-to-video') throw new Error('Turbo needs a starting frame. Use H3 Max for multiple world references.')
  if (settings.endFrameAssetKey && !settings.firstFrameAssetKey && !hasBranch) throw new Error('An ending frame requires a starting frame.')
  return `minimax/h3-max${settings.speed === 'turbo' ? '-turbo' : ''}/${suffix}`
}
export function validateH3References(refs: DirectorReference[]) {
  if (refs.length > 12) throw new Error('H3 accepts at most twelve reference files.')
  for (const [kind, limit] of [['image', 9], ['video', 3], ['audio', 3]] as const) {
    const subset = refs.filter(r => r.kind === kind)
    if (subset.length > limit) throw new Error(`H3 accepts at most ${limit} ${kind} references.`)
    if (kind !== 'image' && subset.some(r => !r.durationSeconds || r.durationSeconds < 2 || r.durationSeconds > 15)) throw new Error('Video/audio references must be 2–15 seconds.')
    if (kind !== 'image' && subset.reduce((n, r) => n + (r.durationSeconds ?? 0), 0) > 15) throw new Error(`Combined ${kind} references exceed fifteen seconds.`)
  }
  if (refs.length && refs.every(r => r.kind === 'audio')) throw new Error('Audio requires an image or video reference.')
}
export function buildH3VideoRequest(input: { model: string; prompt: string; settings: DirectorSettings; references: Array<DirectorReference & { url: string }>; firstFrameUrl?: string; endFrameUrl?: string }) {
  validateH3References(input.references)
  const { settings, model } = input
  if (!/^minimax\/h3-max(-turbo)?\/(text-to-video|image-to-video|reference-to-video)$/.test(model) || model.includes('turbo/reference')) throw new Error('Unsupported H3 endpoint.')
  const body: Record<string, unknown> = { prompt: input.prompt, duration: Math.max(5, Math.ceil(settings.durationSeconds)), resolution: settings.resolution.toUpperCase(), prompt_expansion_mode: 'balanced', enable_safety_checker: true, sync_mode: false }
  if (model.endsWith('/image-to-video')) {
    if (!input.firstFrameUrl) throw new Error('Image generation needs a first frame.')
    body.image_url = input.firstFrameUrl
    if (input.endFrameUrl) body.end_image_url = input.endFrameUrl
  } else {
    body.aspect_ratio = settings.aspectRatio
    if (model.endsWith('/reference-to-video')) {
      for (const kind of ['image', 'video', 'audio'] as const) body[`reference_${kind}_urls`] = input.references.filter(r => r.kind === kind).map(r => r.url)
    }
  }
  return body
}
/** Conservative list-rate estimate; promotions never determine credit authorization. */
export function estimateH3Cost(settings: DirectorSettings, references: DirectorReference[]) {
  const duration = Math.max(5, Math.ceil(settings.durationSeconds))
  const tokens = references.reduce((sum, ref) => sum + (ref.kind === 'image'
    ? (ref.width ?? 2048) * (ref.height ?? 2048) / 1024
    : (ref.durationSeconds ?? 15) * (ref.kind === 'audio' ? 80 : settings.resolution === '768p' ? 7459.2 : 2886)), 0)
  return Math.round((duration * (settings.resolution === '768p' ? 0.08 : 0.05) + Math.max(0, tokens - 4096) * 0.02 / 1000) * 10000) / 10000
}
