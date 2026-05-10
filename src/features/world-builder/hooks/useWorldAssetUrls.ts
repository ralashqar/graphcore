import { useCallback, useEffect, useMemo, useState } from 'react'

import { resolveAssetSourceUrl } from '../../../domain/assets'
import {
  cacheSignedAssetResponse,
  getCachedAssetObjectUrl,
  getCachedSignedAssetUrl,
  setCachedSignedAssetUrl,
} from '../../../domain/assetUrlCache'
import type { AssetDefinition, DefinitionBase } from '../../../domain/graphcore'
import type { WorldEntity, WorldResult } from '../../../domain/worldGraph'
import type { SignProjectAssetUrlsInput, SignedProjectAssetUrl } from '../../../application/ports'

type UseWorldAssetUrlsInput = {
  assetByKey: Map<string, AssetDefinition>
  definitionByKey: Map<string, DefinitionBase>
  worldEntities: WorldEntity[]
  worldResults: WorldResult[]
  onSignProjectAssetUrls: (input: SignProjectAssetUrlsInput) => Promise<SignedProjectAssetUrl[]> | SignedProjectAssetUrl[]
}

const worldGraphSignedAssetUrlCache = new Map<string, { storagePath: string; url: string }>()

function isPendingVisualAsset(asset: AssetDefinition | null | undefined) {
  if (!asset) return false
  const generation = asset.metadata.generation && typeof asset.metadata.generation === 'object' && !Array.isArray(asset.metadata.generation)
    ? asset.metadata.generation as Record<string, unknown>
    : null
  const state = typeof generation?.state === 'string' ? generation.state : ''
  return state === 'pending' || state === 'queued' || state === 'running'
}

function isWorldGraphSignableAsset(asset: AssetDefinition | null | undefined) {
  if (!asset) return false
  if (asset.kind !== 'image' && asset.kind !== 'video' && asset.kind !== 'mesh') return false
  if (resolveAssetSourceUrl(asset)) return false
  if (isPendingVisualAsset(asset)) return false
  const storagePath = asset.storagePath?.trim() ?? ''
  if (!storagePath || storagePath.startsWith('external/') || storagePath.startsWith('local-upload/')) return false
  const storageBucket = typeof asset.metadata.storageBucket === 'string' ? asset.metadata.storageBucket.trim() : ''
  return Boolean(storageBucket) || storagePath.startsWith('generated/')
}

function readEntityReferenceSheetAssetKey(entity: WorldEntity | null | undefined) {
  const metadata = entity?.metadata && typeof entity.metadata === 'object' && !Array.isArray(entity.metadata)
    ? entity.metadata as Record<string, unknown>
    : {}
  const value = metadata.referenceSheetAssetKey
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function useWorldAssetUrls({
  assetByKey,
  definitionByKey,
  worldEntities,
  worldResults,
  onSignProjectAssetUrls,
}: UseWorldAssetUrlsInput) {
  const [signedAssetUrlsByKey, setSignedAssetUrlsByKey] = useState<Map<string, string>>(() => new Map())

  useEffect(() => {
    let cancelled = false
    const desiredAssetKeys = new Set<string>()

    for (const entity of worldEntities) {
      const linkedDefinition = entity.linkedDefinitionKey ? definitionByKey.get(entity.linkedDefinitionKey) ?? null : null
      const previewAssetKey = entity.thumbnailAssetKey ?? linkedDefinition?.iconAssetKey ?? null
      if (previewAssetKey) desiredAssetKeys.add(previewAssetKey)
      const referenceSheetAssetKey = readEntityReferenceSheetAssetKey(entity)
      if (referenceSheetAssetKey) desiredAssetKeys.add(referenceSheetAssetKey)
    }

    for (const result of worldResults) {
      if (result.previewAssetKey) desiredAssetKeys.add(result.previewAssetKey)
    }

    const candidateAssets = Array.from(desiredAssetKeys)
      .map((assetKey) => assetByKey.get(assetKey) ?? null)
      .filter((asset): asset is AssetDefinition => isWorldGraphSignableAsset(asset))

    const cachedUrls = new Map<string, string>()
    const candidates = candidateAssets.filter((asset) => {
      if (signedAssetUrlsByKey.has(asset.key)) return false
      const cached = worldGraphSignedAssetUrlCache.get(asset.key)
      if (cached?.storagePath === asset.storagePath) {
        cachedUrls.set(asset.key, cached.url)
        return false
      }
      return true
    })

    if (cachedUrls.size > 0) {
      setSignedAssetUrlsByKey((current) => {
        const next = new Map(current)
        for (const [assetKey, signedUrl] of cachedUrls) {
          next.set(assetKey, signedUrl)
        }
        return next
      })
    }

    if (candidates.length === 0) return undefined

    const signAssets = async () => {
      const objectCacheUrls = new Map<string, string>()
      const assetsNeedingSignedUrls: AssetDefinition[] = []
      for (const asset of candidates) {
        const cachedObjectUrl = await getCachedAssetObjectUrl(asset)
        if (cancelled) return
        if (cachedObjectUrl) {
          worldGraphSignedAssetUrlCache.set(asset.key, { storagePath: asset.storagePath, url: cachedObjectUrl })
          objectCacheUrls.set(asset.key, cachedObjectUrl)
        } else {
          const persistentCachedUrl = getCachedSignedAssetUrl(asset)
          if (persistentCachedUrl) {
            const resolvedUrl = await cacheSignedAssetResponse(asset, persistentCachedUrl)
            if (cancelled) return
            worldGraphSignedAssetUrlCache.set(asset.key, { storagePath: asset.storagePath, url: resolvedUrl })
            objectCacheUrls.set(asset.key, resolvedUrl)
          } else {
            assetsNeedingSignedUrls.push(asset)
          }
        }
      }

      if (objectCacheUrls.size > 0) {
        setSignedAssetUrlsByKey((current) => {
          const next = new Map(current)
          for (const [assetKey, signedUrl] of objectCacheUrls) {
            next.set(assetKey, signedUrl)
          }
          return next
        })
      }

      if (assetsNeedingSignedUrls.length === 0) return

      const byProjectId = new Map<string, AssetDefinition[]>()
      for (const asset of assetsNeedingSignedUrls) {
        const groupKey = asset.projectId?.trim() || '__unscoped__'
        byProjectId.set(groupKey, [...(byProjectId.get(groupKey) ?? []), asset])
      }

      const nextUrls = new Map<string, string>()

      for (const [projectId, group] of byProjectId) {
        let signedEntries: SignedProjectAssetUrl[] = []
        try {
          signedEntries = await onSignProjectAssetUrls({
            ...(projectId !== '__unscoped__' ? { projectId } : {}),
            assetKeys: group.map((asset) => asset.key),
          })
        } catch (error) {
          console.warn('[GraphCore] world graph asset signing failed.', {
            projectId: projectId === '__unscoped__' ? null : projectId,
            assetKeys: group.map((asset) => asset.key),
            message: error instanceof Error ? error.message : String(error),
          })
          continue
        }

        if (cancelled) return

        for (const entry of signedEntries) {
          const assetKey = entry.assetKey?.trim()
          const signedUrl = entry.signedUrl?.trim()
          const asset = assetKey ? assetByKey.get(assetKey) ?? null : null
          if (!assetKey || !signedUrl || !asset) continue
          setCachedSignedAssetUrl(asset, signedUrl)
          const resolvedUrl = await cacheSignedAssetResponse(asset, signedUrl)
          if (cancelled) return
          worldGraphSignedAssetUrlCache.set(assetKey, { storagePath: asset.storagePath, url: resolvedUrl })
          nextUrls.set(assetKey, resolvedUrl)
        }
      }

      if (cancelled || nextUrls.size === 0) return

      setSignedAssetUrlsByKey((current) => {
        const next = new Map(current)
        for (const [assetKey, signedUrl] of nextUrls) {
          next.set(assetKey, signedUrl)
        }
        return next
      })
    }

    void signAssets()

    return () => {
      cancelled = true
    }
  }, [assetByKey, definitionByKey, onSignProjectAssetUrls, signedAssetUrlsByKey, worldEntities, worldResults])

  const imageUrlByEntityKey = useMemo(() => {
    return new Map(worldEntities.map((entity) => {
      const linkedDefinition = entity.linkedDefinitionKey ? definitionByKey.get(entity.linkedDefinitionKey) ?? null : null
      const previewAssetKey = entity.thumbnailAssetKey ?? linkedDefinition?.iconAssetKey ?? null
      const asset = previewAssetKey ? assetByKey.get(previewAssetKey) ?? null : null
      return [entity.key, resolveAssetSourceUrl(asset) ?? (previewAssetKey ? signedAssetUrlsByKey.get(previewAssetKey) ?? null : null)]
    }))
  }, [assetByKey, definitionByKey, signedAssetUrlsByKey, worldEntities])

  const referenceSheetUrlByEntityKey = useMemo(() => {
    return new Map(worldEntities.map((entity) => {
      const assetKey = readEntityReferenceSheetAssetKey(entity)
      const asset = assetKey ? assetByKey.get(assetKey) ?? null : null
      return [entity.key, resolveAssetSourceUrl(asset) ?? (assetKey ? signedAssetUrlsByKey.get(assetKey) ?? null : null)]
    }))
  }, [assetByKey, signedAssetUrlsByKey, worldEntities])

  const imageUrlByResultKey = useMemo(() => {
    return new Map(worldResults.map((result) => {
      const asset = result.previewAssetKey ? assetByKey.get(result.previewAssetKey) ?? null : null
      return [
        result.key,
        resolveAssetSourceUrl(asset) ?? (result.previewAssetKey ? signedAssetUrlsByKey.get(result.previewAssetKey) ?? null : null),
      ]
    }))
  }, [assetByKey, signedAssetUrlsByKey, worldResults])

  const setSignedAssetUrl = useCallback((assetKey: string, signedUrl: string) => {
    const cleanAssetKey = assetKey.trim()
    const cleanSignedUrl = signedUrl.trim()
    if (!cleanAssetKey || !cleanSignedUrl) return
    setSignedAssetUrlsByKey((current) => {
      const next = new Map(current)
      next.set(cleanAssetKey, cleanSignedUrl)
      return next
    })
  }, [])

  return {
    imageUrlByEntityKey,
    imageUrlByResultKey,
    referenceSheetUrlByEntityKey,
    setSignedAssetUrl,
    signedAssetUrlsByKey,
  }
}
