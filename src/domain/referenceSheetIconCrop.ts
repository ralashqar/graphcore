import type { AssetDefinition } from './graphcore.ts'

const REFERENCE_SHEET_ICON_CACHE_NAME = 'graphcore:reference-sheet-icon-crops:v3'
const REFERENCE_SHEET_ICON_OUTPUT_SIZE = 512
const REFERENCE_SHEET_ICON_SAFE_INSET_RATIO = 0.1
const REFERENCE_SHEET_ICON_CROP_VERSION = 'safe-inset-10-edge-trim-2'
const REFERENCE_SHEET_ICON_EDGE_TRIM_MIN_PX = 16
const REFERENCE_SHEET_ICON_EDGE_TRIM_PADDING_PX = 20
const REFERENCE_SHEET_ICON_EDGE_TRIM_MAX_RATIO = 0.35
const REFERENCE_SHEET_ICON_EDGE_TRIM_MIN_SIDE_RATIO = 0.62
const REFERENCE_SHEET_ICON_EDGE_TRIM_BACKGROUND_DISTANCE = 44
const REFERENCE_SHEET_ICON_EDGE_TRIM_MIN_FOREGROUND_RATIO = 0.025
const REFERENCE_SHEET_ICON_EDGE_TRIM_BALANCED_MARGIN_PX = 24

type ReferenceSheetIconCacheKeyInput = {
  projectId?: string | null
  entityKey: string
  referenceSheetAssetKey: string
  storagePath?: string | null
  visualJobId?: string | null
}

export type ReferenceSheetIconCropRect = {
  sx: number
  sy: number
  sw: number
  sh: number
  outputWidth: number
  outputHeight: number
}

export type ReferenceSheetIconTrimRect = {
  sx: number
  sy: number
  sw: number
  sh: number
}

export function buildReferenceSheetIconCacheKey(input: ReferenceSheetIconCacheKeyInput) {
  return [
    REFERENCE_SHEET_ICON_CROP_VERSION,
    input.projectId?.trim() ?? '',
    input.entityKey.trim(),
    input.referenceSheetAssetKey.trim(),
    input.storagePath?.trim() ?? '',
    input.visualJobId?.trim() ?? '',
  ].join('\u001f')
}

export function resolveTopRightReferenceSheetIconCropRect(input: {
  naturalWidth: number
  naturalHeight: number
  preferredCropSize?: number
}): ReferenceSheetIconCropRect {
  const naturalWidth = Math.max(1, Math.floor(input.naturalWidth))
  const naturalHeight = Math.max(1, Math.floor(input.naturalHeight))
  const preferredCropSize = Math.max(1, Math.floor(input.preferredCropSize ?? REFERENCE_SHEET_ICON_OUTPUT_SIZE))
  const cropSize = Math.min(preferredCropSize, naturalWidth, naturalHeight)
  const desiredInset = Math.max(0, Math.round(cropSize * REFERENCE_SHEET_ICON_SAFE_INSET_RATIO))
  const insetX = Math.min(desiredInset, Math.max(0, naturalWidth - cropSize))
  const insetY = Math.min(desiredInset, Math.max(0, naturalHeight - cropSize))
  return {
    sx: naturalWidth - cropSize - insetX,
    sy: insetY,
    sw: cropSize,
    sh: cropSize,
    outputWidth: REFERENCE_SHEET_ICON_OUTPUT_SIZE,
    outputHeight: REFERENCE_SHEET_ICON_OUTPUT_SIZE,
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function colorDistance(a: readonly [number, number, number], b: readonly [number, number, number]) {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db))
}

function pixelAt(data: ArrayLike<number>, width: number, x: number, y: number): [number, number, number] {
  const index = ((y * width) + x) * 4
  return [data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0]
}

function estimateDominantEdgeColor(input: {
  data: ArrayLike<number>
  width: number
  height: number
}): readonly [number, number, number] | null {
  const { data, width, height } = input
  const patchSize = Math.max(2, Math.min(16, Math.floor(width / 8), Math.floor(height / 8)))
  const origins = [
    [0, 0],
    [Math.max(0, width - patchSize), 0],
    [0, Math.max(0, height - patchSize)],
    [Math.max(0, width - patchSize), Math.max(0, height - patchSize)],
  ] as const
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()
  let sampleCount = 0

  for (const [originX, originY] of origins) {
    for (let y = originY; y < originY + patchSize; y += 1) {
      for (let x = originX; x < originX + patchSize; x += 1) {
        const [r, g, b] = pixelAt(data, width, x, y)
        const key = `${r >> 4}:${g >> 4}:${b >> 4}`
        const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
        bucket.count += 1
        bucket.r += r
        bucket.g += g
        bucket.b += b
        buckets.set(key, bucket)
        sampleCount += 1
      }
    }
  }

  let best: { count: number; r: number; g: number; b: number } | null = null
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket
  }

  if (!best || best.count < Math.max(12, sampleCount * 0.22)) return null
  return [
    Math.round(best.r / best.count),
    Math.round(best.g / best.count),
    Math.round(best.b / best.count),
  ]
}

function countForegroundPixels(input: {
  data: ArrayLike<number>
  width: number
  height: number
  background: readonly [number, number, number]
  threshold: number
}) {
  const step = Math.max(1, Math.floor(Math.min(input.width, input.height) / 128))
  let sampled = 0
  let foreground = 0
  for (let y = 0; y < input.height; y += step) {
    for (let x = 0; x < input.width; x += step) {
      const pixel = pixelAt(input.data, input.width, x, y)
      if (colorDistance(pixel, input.background) > input.threshold) foreground += 1
      sampled += 1
    }
  }
  return sampled > 0 ? foreground / sampled : 0
}

function squareInsideRect(rect: ReferenceSheetIconTrimRect): ReferenceSheetIconTrimRect {
  const side = Math.max(1, Math.min(rect.sw, rect.sh))
  return {
    sx: Math.round(rect.sx + ((rect.sw - side) / 2)),
    sy: Math.round(rect.sy + ((rect.sh - side) / 2)),
    sw: Math.round(side),
    sh: Math.round(side),
  }
}

function resolveForegroundBounds(input: {
  data: ArrayLike<number>
  width: number
  height: number
  background: readonly [number, number, number]
  threshold: number
}) {
  let minX = input.width
  let minY = input.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const pixel = pixelAt(input.data, input.width, x, y)
      if (colorDistance(pixel, input.background) <= input.threshold) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (maxX < minX || maxY < minY) return null
  return { minX, minY, maxX, maxY }
}

function marginsLookBalanced(left: number, right: number, top: number, bottom: number, minTrimPx: number) {
  const horizontalBalanced = left >= minTrimPx
    && right >= minTrimPx
    && Math.abs(left - right) <= REFERENCE_SHEET_ICON_EDGE_TRIM_BALANCED_MARGIN_PX
  const verticalBalanced = top >= minTrimPx
    && bottom >= minTrimPx
    && Math.abs(top - bottom) <= REFERENCE_SHEET_ICON_EDGE_TRIM_BALANCED_MARGIN_PX
  return horizontalBalanced && verticalBalanced
}

export function resolveReferenceSheetIconTrimRectFromPixels(input: {
  data: ArrayLike<number>
  width: number
  height: number
  minTrimPx?: number
  paddingPx?: number
  maxTrimRatio?: number
  minSideRatio?: number
  backgroundDistance?: number
}): ReferenceSheetIconTrimRect {
  const width = Math.max(1, Math.floor(input.width))
  const height = Math.max(1, Math.floor(input.height))
  const fullRect = { sx: 0, sy: 0, sw: width, sh: height }
  if (input.data.length < width * height * 4) return fullRect

  const background = estimateDominantEdgeColor({ data: input.data, width, height })
  if (!background) return fullRect

  const threshold = Math.max(1, input.backgroundDistance ?? REFERENCE_SHEET_ICON_EDGE_TRIM_BACKGROUND_DISTANCE)
  if (countForegroundPixels({ data: input.data, width, height, background, threshold }) < REFERENCE_SHEET_ICON_EDGE_TRIM_MIN_FOREGROUND_RATIO) {
    return fullRect
  }

  const minTrimPx = Math.max(1, Math.floor(input.minTrimPx ?? REFERENCE_SHEET_ICON_EDGE_TRIM_MIN_PX))
  const maxTrimRatio = clampNumber(input.maxTrimRatio ?? REFERENCE_SHEET_ICON_EDGE_TRIM_MAX_RATIO, 0, 0.49)
  const minSideRatio = clampNumber(input.minSideRatio ?? REFERENCE_SHEET_ICON_EDGE_TRIM_MIN_SIDE_RATIO, 0.1, 1)
  const maxHorizontalTrim = Math.floor(width * maxTrimRatio)
  const maxVerticalTrim = Math.floor(height * maxTrimRatio)
  const foregroundBounds = resolveForegroundBounds({
    data: input.data,
    width,
    height,
    background,
    threshold,
  })
  if (!foregroundBounds) return fullRect

  let left = foregroundBounds.minX >= minTrimPx ? foregroundBounds.minX : 0
  let right = width - 1 - foregroundBounds.maxX >= minTrimPx ? width - 1 - foregroundBounds.maxX : 0
  let top = foregroundBounds.minY >= minTrimPx ? foregroundBounds.minY : 0
  let bottom = height - 1 - foregroundBounds.maxY >= minTrimPx ? height - 1 - foregroundBounds.maxY : 0

  if (!left && !right && !top && !bottom) return fullRect
  if (marginsLookBalanced(left, right, top, bottom, minTrimPx)) return fullRect
  if (left > maxHorizontalTrim || right > maxHorizontalTrim || top > maxVerticalTrim || bottom > maxVerticalTrim) return fullRect
  if (width - left - right < width * minSideRatio || height - top - bottom < height * minSideRatio) return fullRect

  const paddingPx = Math.max(0, Math.floor(input.paddingPx ?? REFERENCE_SHEET_ICON_EDGE_TRIM_PADDING_PX))
  left = left > 0 ? Math.max(0, left - paddingPx) : 0
  right = right > 0 ? Math.max(0, right - paddingPx) : 0
  top = top > 0 ? Math.max(0, top - paddingPx) : 0
  bottom = bottom > 0 ? Math.max(0, bottom - paddingPx) : 0

  const paddedRect = {
    sx: left,
    sy: top,
    sw: width - left - right,
    sh: height - top - bottom,
  }
  const squareRect = squareInsideRect(paddedRect)
  const minOutputSide = Math.min(width, height) * minSideRatio
  if (squareRect.sw < minOutputSide || squareRect.sh < minOutputSide) return fullRect
  return squareRect
}

function canUseReferenceSheetIconCache() {
  return typeof window !== 'undefined' && typeof window.caches !== 'undefined'
}

function referenceSheetIconCacheUrl(cacheKey: string) {
  return `https://graphcore.local/reference-sheet-icon-crop?key=${encodeURIComponent(cacheKey)}`
}

function readAssetVisualJobId(asset: AssetDefinition) {
  const metadata = asset.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
    ? asset.metadata as Record<string, unknown>
    : {}
  const generation = metadata.generation && typeof metadata.generation === 'object' && !Array.isArray(metadata.generation)
    ? metadata.generation as Record<string, unknown>
    : {}
  return typeof metadata.visualJobId === 'string'
    ? metadata.visualJobId
    : typeof generation.jobId === 'string'
      ? generation.jobId
      : ''
}

async function imageBitmapFromBlob(blob: Blob) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob)
  }

  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    throw new Error('This browser cannot decode reference sheet images.')
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Reference sheet image failed to load.'))
      nextImage.src = objectUrl
    })
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function blobFromCanvas(canvas: HTMLCanvasElement) {
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.92)
  }) ?? await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

export async function loadReferenceSheetIconCrop(input: {
  entityKey: string
  referenceSheetAsset: AssetDefinition
  referenceSheetUrl: string
}) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return null
  const cacheKey = buildReferenceSheetIconCacheKey({
    projectId: input.referenceSheetAsset.projectId,
    entityKey: input.entityKey,
    referenceSheetAssetKey: input.referenceSheetAsset.key,
    storagePath: input.referenceSheetAsset.storagePath,
    visualJobId: readAssetVisualJobId(input.referenceSheetAsset),
  })
  const cacheUrl = referenceSheetIconCacheUrl(cacheKey)

  if (canUseReferenceSheetIconCache()) {
    try {
      const cache = await window.caches.open(REFERENCE_SHEET_ICON_CACHE_NAME)
      const cachedResponse = await cache.match(cacheUrl)
      if (cachedResponse) {
        return {
          cacheKey,
          url: URL.createObjectURL(await cachedResponse.blob()),
        }
      }
    } catch {
      // Cropping still works without Cache Storage.
    }
  }

  const response = await fetch(input.referenceSheetUrl, { cache: 'force-cache' })
  if (!response.ok) throw new Error(`Reference sheet image request failed with HTTP ${response.status}.`)
  const sourceBlob = await response.blob()
  const image = await imageBitmapFromBlob(sourceBlob)
  const naturalWidth = 'width' in image ? image.width : 0
  const naturalHeight = 'height' in image ? image.height : 0
  const rect = resolveTopRightReferenceSheetIconCropRect({ naturalWidth, naturalHeight })

  const analysisCanvas = document.createElement('canvas')
  analysisCanvas.width = rect.outputWidth
  analysisCanvas.height = rect.outputHeight
  const analysisContext = analysisCanvas.getContext('2d')
  if (!analysisContext) throw new Error('Could not create a reference sheet crop canvas.')
  analysisContext.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.outputWidth, rect.outputHeight)
  if ('close' in image && typeof image.close === 'function') image.close()

  let outputCanvas = analysisCanvas
  try {
    const imageData = analysisContext.getImageData(0, 0, rect.outputWidth, rect.outputHeight)
    const trimRect = resolveReferenceSheetIconTrimRectFromPixels({
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    })
    if (trimRect.sx !== 0 || trimRect.sy !== 0 || trimRect.sw !== rect.outputWidth || trimRect.sh !== rect.outputHeight) {
      outputCanvas = document.createElement('canvas')
      outputCanvas.width = rect.outputWidth
      outputCanvas.height = rect.outputHeight
      const outputContext = outputCanvas.getContext('2d')
      if (!outputContext) throw new Error('Could not create a reference sheet trim canvas.')
      outputContext.drawImage(
        analysisCanvas,
        trimRect.sx,
        trimRect.sy,
        trimRect.sw,
        trimRect.sh,
        0,
        0,
        rect.outputWidth,
        rect.outputHeight,
      )
    }
  } catch {
    outputCanvas = analysisCanvas
  }

  const cropBlob = await blobFromCanvas(outputCanvas)
  if (!cropBlob) throw new Error('Could not encode reference sheet icon crop.')

  if (canUseReferenceSheetIconCache()) {
    try {
      const cache = await window.caches.open(REFERENCE_SHEET_ICON_CACHE_NAME)
      await cache.put(cacheUrl, new Response(cropBlob, {
        headers: {
          'content-type': cropBlob.type || 'image/webp',
        },
      }))
    } catch {
      // Browser storage can be unavailable or full; the object URL remains usable.
    }
  }

  return {
    cacheKey,
    url: URL.createObjectURL(cropBlob),
  }
}
