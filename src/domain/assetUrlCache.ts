import type { AssetDefinition } from './graphcore.ts'

const SIGNED_ASSET_URL_CACHE_KEY = 'graphcore:signed-asset-url-cache:v1'
const ASSET_RESPONSE_CACHE_KEY = 'graphcore:asset-response-cache:v1'
const SIGNED_ASSET_URL_TTL_MS = 50 * 60 * 1000
const SIGNED_ASSET_URL_EXPIRY_BUFFER_MS = 2 * 60 * 1000
const SIGNED_ASSET_URL_MAX_ENTRIES = 400
const ASSET_RESPONSE_CACHE_TIMEOUT_MS = 2500

type SignedAssetUrlCacheEntry = {
  projectId: string | null
  assetKey: string
  storagePath: string
  url: string
  cachedAt: number
  expiresAt: number
}

let signedAssetUrlCache: Record<string, SignedAssetUrlCacheEntry> | null = null

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function signedAssetUrlCacheKey(asset: Pick<AssetDefinition, 'key' | 'projectId' | 'storagePath'>) {
  return [asset.projectId ?? '', asset.key, asset.storagePath].join('\u001f')
}

function canUseCacheStorage() {
  return typeof window !== 'undefined' && typeof window.caches !== 'undefined'
}

function assetResponseCacheUrl(asset: Pick<AssetDefinition, 'key' | 'projectId' | 'storagePath'>) {
  const params = new URLSearchParams({
    projectId: asset.projectId ?? '',
    assetKey: asset.key,
    storagePath: asset.storagePath,
  })
  return `https://graphcore.local/asset-cache?${params.toString()}`
}

function assetAllowsResponseBodyCache(asset: Pick<AssetDefinition, 'metadata'>) {
  const metadata = asset.metadata
  return metadata.cacheSignedResponse === true
    || metadata.cache_signed_response === true
    || metadata.cacheObjectResponse === true
    || metadata.cache_object_response === true
}

function readSignedAssetUrlCache() {
  if (signedAssetUrlCache) return signedAssetUrlCache
  if (!canUseLocalStorage()) {
    signedAssetUrlCache = {}
    return signedAssetUrlCache
  }

  try {
    const raw = window.localStorage.getItem(SIGNED_ASSET_URL_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    signedAssetUrlCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, SignedAssetUrlCacheEntry>
      : {}
  } catch {
    signedAssetUrlCache = {}
  }
  return signedAssetUrlCache
}

function writeSignedAssetUrlCache() {
  if (!canUseLocalStorage() || !signedAssetUrlCache) return
  try {
    window.localStorage.setItem(SIGNED_ASSET_URL_CACHE_KEY, JSON.stringify(signedAssetUrlCache))
  } catch {
    // Browser storage can be unavailable or full; URL signing still works without this cache.
  }
}

function pruneSignedAssetUrlCache(now = Date.now()) {
  const cache = readSignedAssetUrlCache()
  for (const [key, entry] of Object.entries(cache)) {
    if (!entry.url || entry.expiresAt <= now + SIGNED_ASSET_URL_EXPIRY_BUFFER_MS) {
      delete cache[key]
    }
  }

  const entries = Object.entries(cache)
  if (entries.length <= SIGNED_ASSET_URL_MAX_ENTRIES) return

  entries
    .sort(([, left], [, right]) => left.cachedAt - right.cachedAt)
    .slice(0, entries.length - SIGNED_ASSET_URL_MAX_ENTRIES)
    .forEach(([key]) => {
      delete cache[key]
    })
}

export function getCachedSignedAssetUrl(asset: Pick<AssetDefinition, 'key' | 'projectId' | 'storagePath'>, now = Date.now()) {
  const entry = readSignedAssetUrlCache()[signedAssetUrlCacheKey(asset)]
  if (!entry || entry.storagePath !== asset.storagePath || entry.expiresAt <= now + SIGNED_ASSET_URL_EXPIRY_BUFFER_MS) {
    return null
  }
  return entry.url
}

export function setCachedSignedAssetUrl(
  asset: Pick<AssetDefinition, 'key' | 'projectId' | 'storagePath'>,
  url: string,
  now = Date.now(),
) {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) return

  const cache = readSignedAssetUrlCache()
  cache[signedAssetUrlCacheKey(asset)] = {
    projectId: asset.projectId ?? null,
    assetKey: asset.key,
    storagePath: asset.storagePath,
    url: trimmedUrl,
    cachedAt: now,
    expiresAt: now + SIGNED_ASSET_URL_TTL_MS,
  }
  pruneSignedAssetUrlCache(now)
  writeSignedAssetUrlCache()
}

export async function getCachedAssetObjectUrl(asset: Pick<AssetDefinition, 'key' | 'projectId' | 'storagePath'>) {
  if (!canUseCacheStorage()) return null
  try {
    const cache = await window.caches.open(ASSET_RESPONSE_CACHE_KEY)
    const response = await cache.match(assetResponseCacheUrl(asset))
    if (!response) return null

    const expiresAt = Number(response.headers.get('x-graphcore-expires-at') ?? '')
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + SIGNED_ASSET_URL_EXPIRY_BUFFER_MS) {
      await cache.delete(assetResponseCacheUrl(asset))
      return null
    }

    return URL.createObjectURL(await response.blob())
  } catch {
    return null
  }
}

export async function cacheSignedAssetResponse(
  asset: Pick<AssetDefinition, 'key' | 'projectId' | 'storagePath' | 'kind' | 'metadata'>,
  signedUrl: string,
) {
  if (asset.kind !== 'image' || !canUseCacheStorage()) return signedUrl
  if (!assetAllowsResponseBodyCache(asset)) return signedUrl

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), ASSET_RESPONSE_CACHE_TIMEOUT_MS)
  try {
    const response = await fetch(signedUrl, { cache: 'force-cache', signal: controller.signal })
    if (!response.ok) return signedUrl

    const contentType = response.headers.get('content-type') ?? 'image/webp'
    const blob = await response.blob()
    const cache = await window.caches.open(ASSET_RESPONSE_CACHE_KEY)
    await cache.put(assetResponseCacheUrl(asset), new Response(blob, {
      headers: {
        'content-type': contentType,
        'x-graphcore-expires-at': String(Date.now() + SIGNED_ASSET_URL_TTL_MS),
      },
    }))
    return URL.createObjectURL(blob)
  } catch {
    return signedUrl
  } finally {
    window.clearTimeout(timeoutId)
  }
}
