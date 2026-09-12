import type { DirectorReference, DirectorSettings } from './directorWorkspace.ts'

export type VideoGenerationCapabilities = { minSeconds: number; maxSeconds: number; resolutions: readonly string[]; images: number; videos: number; audio: number; firstLast: boolean }
export const H3_CAPABILITIES: VideoGenerationCapabilities = { minSeconds: 5, maxSeconds: 15, resolutions: ['480p', '768p', '1080p'], images: 9, videos: 3, audio: 3, firstLast: true }
/** fal list rates (USD per generated second) as published on the H3 model pages; promotions never apply here. */
export const H3_USD_PER_SECOND: Record<DirectorSettings['resolution'], number> = { '480p': 0.05, '768p': 0.08, '1080p': 0.16 }
/** Reference video tokens per second. 480p/768p are published; 1080p is scaled by pixel count and is an estimate. */
export const H3_VIDEO_TOKENS_PER_SECOND: Record<DirectorSettings['resolution'], number> = { '480p': 2886, '768p': 7459.2, '1080p': 14918.4 }
export const H3_AUDIO_TOKENS_PER_SECOND = 80
export const H3_FREE_REFERENCE_TOKENS = 4096
export const H3_USD_PER_THOUSAND_REFERENCE_TOKENS = 0.02

export function h3Model(settings: DirectorSettings, references: DirectorReference[], hasBranch = false) {
  const suffix = hasBranch || settings.firstFrameAssetKey ? 'image-to-video' : references.length ? 'reference-to-video' : 'text-to-video'
  if (settings.speed === 'turbo' && suffix === 'reference-to-video') throw new Error('Turbo needs a starting frame. Use H3 Max for multiple world references.')
  if (settings.endFrameAssetKey && !settings.firstFrameAssetKey && !hasBranch) throw new Error('An ending frame requires a starting frame.')
  if (settings.aspectRatio === 'adaptive' && suffix === 'text-to-video') throw new Error('Adaptive aspect ratio needs world references or a starting frame. Choose a fixed ratio.')
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
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: Math.max(5, Math.ceil(settings.durationSeconds)),
    resolution: settings.resolution.toUpperCase(),
    prompt_expansion_mode: settings.promptExpansion ?? 'balanced',
    enable_safety_checker: true,
    sync_mode: false,
  }
  if (model.endsWith('/image-to-video')) {
    // Image-to-video inherits the first frame's aspect ratio; fal rejects an explicit one.
    if (!input.firstFrameUrl) throw new Error('Image generation needs a first frame.')
    body.image_url = input.firstFrameUrl
    if (input.endFrameUrl) body.end_image_url = input.endFrameUrl
  } else {
    if (settings.aspectRatio === 'adaptive' && model.endsWith('/text-to-video')) throw new Error('Text-to-video needs a fixed aspect ratio.')
    body.aspect_ratio = settings.aspectRatio
    if (model.endsWith('/reference-to-video')) {
      for (const kind of ['image', 'video', 'audio'] as const) body[`reference_${kind}_urls`] = input.references.filter(r => r.kind === kind).map(r => r.url)
    }
  }
  return body
}
export function isH3FalModel(model: string) {
  return /^minimax\/h3-max(-turbo)?\/(text-to-video|image-to-video|reference-to-video)$/.test(model.trim())
}
/**
 * H3 request body for the generic output-workflow video node (Seedance-shaped inputs → H3 contract).
 * Lets a shot video node run on H3 by setting `config.model` to an H3 endpoint; the node's reference
 * images/videos/audio map to H3 reference lists (or the first image becomes the image-to-video frame).
 */
export function buildH3WorkflowVideoBody(input: {
  model: string
  prompt: string
  durationSeconds: number
  aspectRatio?: string
  resolution?: string
  syncMode?: boolean
  promptExpansion?: 'balanced' | 'quality'
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
}) {
  const model = input.model.trim()
  if (!isH3FalModel(model)) throw new Error(`Not an H3 endpoint: ${model}`)
  const resolutionText = (input.resolution ?? '').toLowerCase()
  const resolution = /1080/.test(resolutionText) ? '1080P' : /480/.test(resolutionText) ? '480P' : '768P'
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    duration: Math.max(5, Math.min(15, Math.round(Number(input.durationSeconds) || 5))),
    resolution,
    prompt_expansion_mode: input.promptExpansion ?? 'balanced',
    enable_safety_checker: true,
    sync_mode: input.syncMode ?? false,
  }
  const images = (input.referenceImageUrls ?? []).filter(Boolean)
  const videos = (input.referenceVideoUrls ?? []).filter(Boolean)
  const audio = (input.referenceAudioUrls ?? []).filter(Boolean)
  if (model.endsWith('/image-to-video')) {
    if (!images[0]) throw new Error('H3 image-to-video needs a first-frame image reference.')
    body.image_url = images[0]
    return body
  }
  const ratio = input.aspectRatio?.trim() || '16:9'
  if (model.endsWith('/reference-to-video')) {
    body.aspect_ratio = ratio
    body.reference_image_urls = images.slice(0, 9)
    if (videos.length) body.reference_video_urls = videos.slice(0, 3)
    if (audio.length) body.reference_audio_urls = audio.slice(0, 3)
    return body
  }
  body.aspect_ratio = ratio === 'adaptive' ? '16:9' : ratio
  return body
}
/** Reference token count per fal's published formula (image = w×h/1024; video/audio per second). */
export function h3ReferenceTokens(settings: DirectorSettings, references: DirectorReference[]) {
  return references.reduce((sum, ref) => sum + (ref.kind === 'image'
    ? (ref.width ?? 2048) * (ref.height ?? 2048) / 1024
    : (ref.durationSeconds ?? 15) * (ref.kind === 'audio' ? H3_AUDIO_TOKENS_PER_SECOND : H3_VIDEO_TOKENS_PER_SECOND[settings.resolution])), 0)
}
/** Conservative list-rate estimate; promotions never determine credit authorization. */
export function estimateH3Cost(settings: DirectorSettings, references: DirectorReference[]) {
  const duration = Math.max(5, Math.ceil(settings.durationSeconds))
  const tokens = h3ReferenceTokens(settings, references)
  const usd = duration * H3_USD_PER_SECOND[settings.resolution] + Math.max(0, tokens - H3_FREE_REFERENCE_TOKENS) * H3_USD_PER_THOUSAND_REFERENCE_TOKENS / 1000
  return Math.round(usd * 10000) / 10000
}
