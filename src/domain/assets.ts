import type { AssetDefinition } from './graphcore.ts'

export const supportedMeshExtensions = ['.glb', '.gltf'] as const
export const supportedMeshAccept = '.glb,.gltf,model/gltf-binary,model/gltf+json'

export type AssetUrlCreationKind = 'image' | 'mesh' | 'video'
export type AssetUrlCreateOptions = {
  existingAssetKey?: string | null
  metadata?: Record<string, unknown>
  name?: string
  openAssetsTab?: boolean
  selectAsset?: boolean
}

const imageMimeTypesByExtension: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const videoMimeTypesByExtension: Record<string, string> = {
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

function safeLowerPath(value: string) {
  try {
    return new URL(value).pathname.toLowerCase()
  } catch {
    return value.split('?')[0].toLowerCase()
  }
}

function getPathExtension(value: string) {
  const lowerPath = safeLowerPath(value)
  const match = lowerPath.match(/\.[a-z0-9]+$/)
  return match?.[0] ?? ''
}

export function buildAssetSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)
}

export function isMeshAsset(asset: AssetDefinition | null | undefined): asset is AssetDefinition & { kind: 'mesh' } {
  return asset?.kind === 'mesh'
}

export function isImageAsset(asset: AssetDefinition | null | undefined): asset is AssetDefinition & { kind: 'image' } {
  return asset?.kind === 'image'
}

export function isSupportedMeshPath(value: string) {
  const lowerPath = safeLowerPath(value)
  return supportedMeshExtensions.some((extension) => lowerPath.endsWith(extension))
}

export function inferRemoteAssetMimeType(url: string, kind: AssetUrlCreationKind) {
  if (kind === 'mesh') {
    return getPathExtension(url) === '.gltf' ? 'model/gltf+json' : 'model/gltf-binary'
  }

  if (kind === 'video') {
    return videoMimeTypesByExtension[getPathExtension(url)] ?? 'video/mp4'
  }

  return imageMimeTypesByExtension[getPathExtension(url)] ?? 'image/png'
}

export function inferAssetKindFromUpload(file: File): AssetDefinition['kind'] | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type === 'model/gltf-binary' || file.type === 'model/gltf+json' || isSupportedMeshPath(file.name)) return 'mesh'
  return null
}

export function inferUploadMimeType(file: File, kind: AssetDefinition['kind']) {
  if (file.type) return file.type
  if (kind === 'mesh') return inferRemoteAssetMimeType(file.name, 'mesh')
  return 'application/octet-stream'
}

export function getAssetKeyPrefix(kind: AssetUrlCreationKind | AssetDefinition['kind']) {
  if (kind === 'mesh') return 'mesh'
  if (kind === 'audio') return 'audio'
  if (kind === 'video') return 'video'
  if (kind === 'image') return 'image'
  return 'asset'
}

export function resolveAssetPreviewUrl(asset: AssetDefinition | null | undefined) {
  if (!asset) return null
  return typeof asset.metadata.previewUrl === 'string'
    ? asset.metadata.previewUrl
    : typeof asset.metadata.sourceUrl === 'string' && (asset.kind === 'image' || asset.kind === 'video')
      ? asset.metadata.sourceUrl
      : null
}

export function resolveAssetSourceUrl(asset: AssetDefinition | null | undefined) {
  if (!asset) return null
  return typeof asset.metadata.sourceUrl === 'string'
    ? asset.metadata.sourceUrl
    : typeof asset.metadata.previewUrl === 'string'
      ? asset.metadata.previewUrl
      : null
}
