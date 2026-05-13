import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { resolveAssetSourceUrl } from '../../../domain/assets'
import {
  cacheSignedAssetResponse,
  getCachedAssetObjectUrl,
  getCachedSignedAssetUrl,
  setCachedSignedAssetUrl,
} from '../../../domain/assetUrlCache'
import type { AssetDefinition, DefinitionBase } from '../../../domain/graphcore'
import { loadReferenceSheetIconCrop } from '../../../domain/referenceSheetIconCrop'
import type { WorldEntity, WorldResult } from '../../../domain/worldGraph'
import type { SignProjectAssetUrlsInput, SignedProjectAssetUrl } from '../../../application/ports'

type UseWorldAssetUrlsInput = {
  assetByKey: Map<string, AssetDefinition>
  definitionByKey: Map<string, DefinitionBase>
  worldEntities: WorldEntity[]
  worldResults: WorldResult[]
  onSignProjectAssetUrls: (input: SignProjectAssetUrlsInput) => Promise<SignedProjectAssetUrl[]> | SignedProjectAssetUrl[]
}

type SignedAssetUrlEntry = { storagePath: string; url: string }
type ReferenceSheetIconUrlEntry = { cacheKey: string; url: string }

const worldGraphSignedAssetUrlCache = new Map<string, SignedAssetUrlEntry>()

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

function readAssetVisualJobId(asset: AssetDefinition | null | undefined) {
  const metadata = asset?.metadata && typeof asset.metadata === 'object' && !Array.isArray(asset.metadata)
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

function referenceSheetIconStateKey(entity: WorldEntity, asset: AssetDefinition | null | undefined) {
  if (!asset) return ''
  return [
    asset.projectId ?? '',
    entity.key,
    asset.key,
    asset.storagePath ?? '',
    readAssetVisualJobId(asset),
  ].join('\u001f')
}

export function useWorldAssetUrls({
  assetByKey,
  definitionByKey,
  worldEntities,
  worldResults,
  onSignProjectAssetUrls,
}: UseWorldAssetUrlsInput) {
  const [signedAssetUrlEntriesByKey, setSignedAssetUrlEntriesByKey] = useState<Map<string, SignedAssetUrlEntry>>(() => new Map())
  const [referenceSheetIconEntriesByEntityKey, setReferenceSheetIconEntriesByEntityKey] = useState<Map<string, ReferenceSheetIconUrlEntry>>(() => new Map())
  const referenceSheetIconEntriesRef = useRef(referenceSheetIconEntriesByEntityKey)

  useEffect(() => {
    referenceSheetIconEntriesRef.current = referenceSheetIconEntriesByEntityKey
  }, [referenceSheetIconEntriesByEntityKey])

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
      const signedEntry = signedAssetUrlEntriesByKey.get(asset.key)
      if (signedEntry?.storagePath === asset.storagePath) return false
      const cached = worldGraphSignedAssetUrlCache.get(asset.key)
      if (cached?.storagePath === asset.storagePath) {
        cachedUrls.set(asset.key, cached.url)
        return false
      }
      return true
    })

    if (cachedUrls.size > 0) {
      setSignedAssetUrlEntriesByKey((current) => {
        const next = new Map(current)
        for (const [assetKey, signedUrl] of cachedUrls) {
          const asset = assetByKey.get(assetKey) ?? null
          if (!asset) continue
          next.set(assetKey, { storagePath: asset.storagePath ?? '', url: signedUrl })
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
        setSignedAssetUrlEntriesByKey((current) => {
          const next = new Map(current)
          for (const [assetKey, signedUrl] of objectCacheUrls) {
            const asset = assetByKey.get(assetKey) ?? null
            if (!asset) continue
            next.set(assetKey, { storagePath: asset.storagePath ?? '', url: signedUrl })
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

      setSignedAssetUrlEntriesByKey((current) => {
        const next = new Map(current)
        for (const [assetKey, signedUrl] of nextUrls) {
          const asset = assetByKey.get(assetKey) ?? null
          if (!asset) continue
          next.set(assetKey, { storagePath: asset.storagePath ?? '', url: signedUrl })
        }
        return next
      })
    }

    void signAssets()

    return () => {
      cancelled = true
    }
  }, [assetByKey, definitionByKey, onSignProjectAssetUrls, signedAssetUrlEntriesByKey, worldEntities, worldResults])

  const signedAssetUrlsByKey = useMemo(() => {
    const next = new Map<string, string>()
    for (const [assetKey, entry] of signedAssetUrlEntriesByKey.entries()) {
      const asset = assetByKey.get(assetKey) ?? null
      if (asset && entry.storagePath !== asset.storagePath) continue
      next.set(assetKey, entry.url)
    }
    return next
  }, [assetByKey, signedAssetUrlEntriesByKey])

  const imageUrlByEntityKey = useMemo(() => {
    return new Map(worldEntities.map((entity) => {
      const linkedDefinition = entity.linkedDefinitionKey ? definitionByKey.get(entity.linkedDefinitionKey) ?? null : null
      const previewAssetKey = entity.thumbnailAssetKey ?? linkedDefinition?.iconAssetKey ?? null
      const asset = previewAssetKey ? assetByKey.get(previewAssetKey) ?? null : null
      const signedEntry = previewAssetKey ? signedAssetUrlEntriesByKey.get(previewAssetKey) ?? null : null
      const signedUrl = asset && signedEntry?.storagePath === asset.storagePath ? signedEntry.url : null
      return [entity.key, resolveAssetSourceUrl(asset) ?? signedUrl]
    }))
  }, [assetByKey, definitionByKey, signedAssetUrlEntriesByKey, worldEntities])

  const referenceSheetUrlByEntityKey = useMemo(() => {
    return new Map(worldEntities.map((entity) => {
      const assetKey = readEntityReferenceSheetAssetKey(entity)
      const asset = assetKey ? assetByKey.get(assetKey) ?? null : null
      const signedEntry = assetKey ? signedAssetUrlEntriesByKey.get(assetKey) ?? null : null
      const signedUrl = asset && signedEntry?.storagePath === asset.storagePath ? signedEntry.url : null
      return [entity.key, resolveAssetSourceUrl(asset) ?? signedUrl]
    }))
  }, [assetByKey, signedAssetUrlEntriesByKey, worldEntities])

  useEffect(() => {
    let cancelled = false
    const desiredEntityKeys = new Set<string>()

    const cropReferenceSheetIcons = async () => {
      for (const entity of worldEntities) {
        const assetKey = readEntityReferenceSheetAssetKey(entity)
        const asset = assetKey ? assetByKey.get(assetKey) ?? null : null
        const referenceSheetUrl = referenceSheetUrlByEntityKey.get(entity.key) ?? null
        const expectedCacheKey = referenceSheetIconStateKey(entity, asset)
        if (!asset || !expectedCacheKey) continue
        desiredEntityKeys.add(entity.key)
        if (!referenceSheetUrl) continue
        const current = referenceSheetIconEntriesByEntityKey.get(entity.key)
        if (current?.cacheKey === expectedCacheKey) continue

        try {
          const crop = await loadReferenceSheetIconCrop({
            entityKey: entity.key,
            referenceSheetAsset: asset,
            referenceSheetUrl,
          })
          if (cancelled || !crop) continue
          setReferenceSheetIconEntriesByEntityKey((currentEntries) => {
            const existing = currentEntries.get(entity.key)
            if (existing?.cacheKey === crop.cacheKey) {
              if (existing.url !== crop.url && crop.url.startsWith('blob:')) URL.revokeObjectURL(crop.url)
              return currentEntries
            }
            if (existing?.url && existing.url.startsWith('blob:')) URL.revokeObjectURL(existing.url)
            const next = new Map(currentEntries)
            next.set(entity.key, crop)
            return next
          })
        } catch (error) {
          console.warn('[GraphCore] failed to crop reference sheet icon.', {
            entityKey: entity.key,
            assetKey,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      }

      if (cancelled) return
      setReferenceSheetIconEntriesByEntityKey((currentEntries) => {
        let changed = false
        const next = new Map(currentEntries)
        for (const [entityKey, entry] of currentEntries) {
          if (desiredEntityKeys.has(entityKey)) continue
          if (entry.url.startsWith('blob:')) URL.revokeObjectURL(entry.url)
          next.delete(entityKey)
          changed = true
        }
        return changed ? next : currentEntries
      })
    }

    void cropReferenceSheetIcons()

    return () => {
      cancelled = true
    }
  }, [assetByKey, referenceSheetIconEntriesByEntityKey, referenceSheetUrlByEntityKey, worldEntities])

  useEffect(() => {
    return () => {
      for (const entry of referenceSheetIconEntriesRef.current.values()) {
        if (entry.url.startsWith('blob:')) URL.revokeObjectURL(entry.url)
      }
      referenceSheetIconEntriesRef.current = new Map()
    }
  }, [])

  const referenceSheetIconUrlByEntityKey = useMemo(() => {
    return new Map(Array.from(referenceSheetIconEntriesByEntityKey.entries()).map(([entityKey, entry]) => [entityKey, entry.url]))
  }, [referenceSheetIconEntriesByEntityKey])

  const imageUrlByResultKey = useMemo(() => {
    return new Map(worldResults.map((result) => {
      const asset = result.previewAssetKey ? assetByKey.get(result.previewAssetKey) ?? null : null
      const signedEntry = result.previewAssetKey ? signedAssetUrlEntriesByKey.get(result.previewAssetKey) ?? null : null
      const signedUrl = asset && signedEntry?.storagePath === asset.storagePath ? signedEntry.url : null
      return [
        result.key,
        resolveAssetSourceUrl(asset) ?? signedUrl,
      ]
    }))
  }, [assetByKey, signedAssetUrlEntriesByKey, worldResults])

  const setSignedAssetUrl = useCallback((assetKey: string, signedUrl: string) => {
    const cleanAssetKey = assetKey.trim()
    const cleanSignedUrl = signedUrl.trim()
    if (!cleanAssetKey || !cleanSignedUrl) return
    const asset = assetByKey.get(cleanAssetKey) ?? null
    setSignedAssetUrlEntriesByKey((current) => {
      const next = new Map(current)
      next.set(cleanAssetKey, { storagePath: asset?.storagePath ?? '', url: cleanSignedUrl })
      return next
    })
  }, [assetByKey])

  return {
    imageUrlByEntityKey,
    imageUrlByResultKey,
    referenceSheetIconUrlByEntityKey,
    referenceSheetUrlByEntityKey,
    setSignedAssetUrl,
    signedAssetUrlsByKey,
  }
}
