import type { AssetDefinition } from './graphcore.ts'

const REFERENCE_SHEET_ICON_CACHE_NAME = 'graphcore:reference-sheet-icon-crops:v2'
const REFERENCE_SHEET_ICON_OUTPUT_SIZE = 512
const REFERENCE_SHEET_ICON_SAFE_INSET_RATIO = 0.1
const REFERENCE_SHEET_ICON_CROP_VERSION = 'safe-inset-10'

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

  const canvas = document.createElement('canvas')
  canvas.width = rect.outputWidth
  canvas.height = rect.outputHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create a reference sheet crop canvas.')
  context.drawImage(image, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.outputWidth, rect.outputHeight)
  if ('close' in image && typeof image.close === 'function') image.close()

  const cropBlob = await blobFromCanvas(canvas)
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
