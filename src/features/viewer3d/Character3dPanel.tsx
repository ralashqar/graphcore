import { useEffect, useMemo, useRef, useState } from 'react'

import { visualAssetGenerationService } from '../../application/services/visualAssetGenerationService'
import { isImageAsset, isMeshAsset, resolveAssetSourceUrl } from '../../domain/assets'
import { compileEnvironmentBlueprint } from '../../domain/environmentBlueprint'
import { compileAssemblyGraph, createAssemblyCompileCache } from '../../domain/environmentAssemblyCompiler'
import {
  getCharacterProfile,
  getResolvedEnvironmentGeometryBinding,
  getEnvironmentProfile,
  getResolvedDefinition3dBinding,
  type EnvironmentRenderBindingConfig,
  type Render3dBindingConfig,
} from '../../domain/render3d'
import type { MeshGenerationJob } from '../../domain/meshGeneration'
import { isTerminalMeshGenerationJobStatus } from '../../domain/meshGeneration'
import type { AssetDefinition, AssemblyGraphDefinition, DefinitionBase, EnvironmentBlueprintV1 } from '../../domain/graphcore'
import {
  resolveSpatialWorldSpawn,
  selectSpatialWorldLod,
  type SpatialWorldMarker,
  type SpatialWorldMarkerCreateRequest,
  type SpatialWorldMarkerUpdateRequest,
  type SpatialWorldPerformanceEvent,
  type SpatialWorldVariant,
  type SpatialWorldVariantAlignmentUpdateRequest,
} from '../../domain/spatialWorldGeneration'
import { supabase } from '../../utils/supabase'
import { runCoalescedRequest } from '../../data/requestCoordinator'
import { MediaThumb, findAssetByKey } from '../content/shared'
import { ThreeSceneViewport, type SpatialLoadState } from './ThreeSceneViewport'

function is3dDebugEnabled() {
  if (import.meta.env.VITE_DEBUG_3D_VIEWER === 'true') return true
  if (typeof window === 'undefined') return false
  try {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return true
    return window.localStorage.getItem('graphcore.debug3d') === 'true'
  } catch {
    return false
  }
}

function extractTrellisModelUrl(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const data = payload as { data?: unknown }
  const result = data.data && typeof data.data === 'object' ? data.data as { model_glb?: unknown } : null
  const modelGlb = result?.model_glb && typeof result.model_glb === 'object' ? result.model_glb as { url?: unknown } : null
  return typeof modelGlb?.url === 'string' && modelGlb.url.trim() ? modelGlb.url : null
}

type Definition3dPanelProps = {
  assets: AssetDefinition[]
  assemblyGraph?: AssemblyGraphDefinition | null
  environmentBlueprint?: EnvironmentBlueprintV1 | null
  definition: DefinitionBase
  isDeletingGeneratedMesh?: boolean
  meshGenerationJob?: MeshGenerationJob | null
  spatialWorldVariant?: SpatialWorldVariant | null
  spatialWorldMarkers?: SpatialWorldMarker[]
  onDeleteGeneratedMesh?: (() => void) | null
  onRequestGenerateConceptArt?: (() => void) | null
  onRequestGenerateMesh?: (() => void) | null
  onUpdateComponents: (itemKey: string, components: DefinitionBase['components']) => void
  onResolveAssetUrls?: (assetKeys: string[]) => Promise<AssetDefinition[]>
  onCreateSpatialWorldMarker?: (request: SpatialWorldMarkerCreateRequest) => Promise<{ marker: SpatialWorldMarker | null }>
  onUpdateSpatialWorldMarker?: (request: SpatialWorldMarkerUpdateRequest) => Promise<{ marker: SpatialWorldMarker | null }>
  onDeleteSpatialWorldMarker?: (markerId: string) => Promise<unknown>
  onUpdateSpatialWorldAlignment?: (request: SpatialWorldVariantAlignmentUpdateRequest) => Promise<unknown>
  onStartSpatialWorldProcessing?: (request: { variantId: string; operation?: 'validate' | 'optimize' | 'generate_lods' }) => Promise<unknown>
  onUploadSpatialWorldMarkerScreenshot?: (input: { markerId: string; variantId: string; blob: Blob }) => Promise<unknown>
  onRecordSpatialWorldPerformance?: (event: SpatialWorldPerformanceEvent) => Promise<unknown>
}

export function Definition3dPanel({
  assets,
  assemblyGraph = null,
  environmentBlueprint = null,
  definition,
  isDeletingGeneratedMesh = false,
  meshGenerationJob = null,
  spatialWorldVariant = null,
  spatialWorldMarkers = [],
  onDeleteGeneratedMesh = null,
  onRequestGenerateConceptArt = null,
  onRequestGenerateMesh = null,
  onUpdateComponents,
  onResolveAssetUrls,
  onCreateSpatialWorldMarker,
  onUpdateSpatialWorldMarker,
  onDeleteSpatialWorldMarker,
  onUpdateSpatialWorldAlignment,
  onStartSpatialWorldProcessing,
  onUploadSpatialWorldMarkerScreenshot,
  onRecordSpatialWorldPerformance,
}: Definition3dPanelProps) {
  const [showFloor, setShowFloor] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [resetSignal, setResetSignal] = useState(0)
  const [generationMessage, setGenerationMessage] = useState<string | null>(null)
  const [generationPending, setGenerationPending] = useState(false)
  const [meshViewportError, setMeshViewportError] = useState<string | null>(null)
  const [fallbackMeshSourceUrl, setFallbackMeshSourceUrl] = useState<string | null>(null)
  const [renderMode, setRenderMode] = useState<'mesh' | 'spatial_world' | 'hybrid'>('mesh')
  const [resolvedSpatialAssets, setResolvedSpatialAssets] = useState<Record<string, AssetDefinition>>({})
  const [spatialLoadState, setSpatialLoadState] = useState<SpatialLoadState>({ status: 'idle', progress: 0, splatCount: null, error: null })
  const [viewportPerformance, setViewportPerformance] = useState({ fps: 0, frameTimeMs: 0 })
  const [navigationMode, setNavigationMode] = useState<'orbit' | 'walk'>('orbit')
  const [walkSpeed, setWalkSpeed] = useState(3.2)
  const [showColliderDebug, setShowColliderDebug] = useState(false)
  const [localMarkers, setLocalMarkers] = useState<SpatialWorldMarker[]>([])
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [markerPlacementKind, setMarkerPlacementKind] = useState<SpatialWorldMarker['kind'] | null>(null)
  const [cameraState, setCameraState] = useState({ position: [4.8, 3.8, 5.4] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: 48 })
  const [cameraView, setCameraView] = useState<{ position: [number, number, number]; target: [number, number, number] | null; fov: number; signal: number } | null>(null)
  const [captureScreenshotSignal, setCaptureScreenshotSignal] = useState(0)
  const [pendingScreenshotMarkerId, setPendingScreenshotMarkerId] = useState<string | null>(null)
  const [spatialAuthoringMessage, setSpatialAuthoringMessage] = useState<string | null>(null)
  const [supportsWalkMode, setSupportsWalkMode] = useState(true)
  const [alignmentDraft, setAlignmentDraft] = useState({ position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number], confidence: 0, groundPlaneOffset: 0 })
  const markerMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTelemetryAtRef = useRef(0)
  const spatialLoadStartedAtRef = useRef(Date.now())

  const isEnvironment = definition.kind === 'environment'
  const isSpatialEnvironment = isEnvironment || definition.kind === 'world_model'
  const isItem = definition.kind === 'item'
  const renderBinding = getResolvedDefinition3dBinding(definition)
  const geometryBinding = isEnvironment ? getResolvedEnvironmentGeometryBinding(definition) : null
  const subtype = isEnvironment
    ? getEnvironmentProfile(definition)?.config.subtype ?? 'exterior'
    : isItem
      ? 'pickup'
      : getCharacterProfile(definition)?.config.subtype ?? 'humanoid'
  const entityLabel = isEnvironment ? 'Environment' : definition.kind === 'world_model' ? 'World Model' : isItem ? 'Item' : 'Character'
  const meshAssets = useMemo(() => assets.filter(isMeshAsset).sort((left, right) => left.name.localeCompare(right.name)), [assets])
  const imageAssets = useMemo(() => assets.filter(isImageAsset).sort((left, right) => left.name.localeCompare(right.name)), [assets])
  const meshAsset = findAssetByKey(assets, renderBinding.primaryMeshAssetKey)
  const previewImageAsset = findAssetByKey(assets, renderBinding.previewImageAssetKey)
  const deviceMemoryGb = typeof navigator !== 'undefined' && 'deviceMemory' in navigator ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0) || null : null
  const selectedSplatAssetKey = spatialWorldVariant?.manifest
    ? selectSpatialWorldLod({ manifest: spatialWorldVariant.manifest, deviceMemoryGb, fps: viewportPerformance.fps > 0 ? viewportPerformance.fps : null })
    : renderBinding.spatialWorldAssetKey
  const spatialWorldAsset = resolvedSpatialAssets[selectedSplatAssetKey ?? '']
    ?? findAssetByKey(assets, selectedSplatAssetKey ?? null)
  const colliderAsset = resolvedSpatialAssets[renderBinding.colliderMeshAssetKey ?? '']
    ?? findAssetByKey(assets, renderBinding.colliderMeshAssetKey ?? null)
  const meshSourceUrl = resolveAssetSourceUrl(meshAsset)
  const spatialWorldSourceUrl = resolveAssetSourceUrl(spatialWorldAsset)
  const colliderSourceUrl = resolveAssetSourceUrl(colliderAsset)
  const viewportMeshSourceUrl = meshSourceUrl ?? fallbackMeshSourceUrl
  const meshSourceLabel = meshSourceUrl ?? 'No mesh source bound'
  const meshGenerationPending = Boolean(meshGenerationJob && !isTerminalMeshGenerationJobStatus(meshGenerationJob.status))
  const meshAssetGenerationState =
    meshAsset?.metadata.generation && typeof meshAsset.metadata.generation === 'object' && typeof (meshAsset.metadata.generation as { state?: unknown }).state === 'string'
      ? String((meshAsset.metadata.generation as { state: string }).state)
      : null
  const shouldSkipMeshFallbackLoad = meshGenerationPending || meshAssetGenerationState === 'pending' || meshAssetGenerationState === 'running'
  const meshGenerationMessage = meshGenerationJob?.errorMessage
    ?? meshGenerationJob?.providerLogs[meshGenerationJob.providerLogs.length - 1]
    ?? null
  const requiresPreviewImageForMesh = !isEnvironment
  const canStartMeshGeneration = !requiresPreviewImageForMesh || Boolean(previewImageAsset)
  const shouldUseConceptFallbackCta = !isEnvironment && !isItem && !previewImageAsset
  const showGeneratedMeshDelete = !isEnvironment && (meshGenerationPending || meshAsset?.metadata.generatedBy === 'trellis_mesh')
  const isProceduralEnvironment = isEnvironment && (geometryBinding?.sourceMode === 'procedural_graph' || geometryBinding?.sourceMode === 'procedural_blueprint')

  useEffect(() => {
    setRenderMode(renderBinding.spatialWorldAssetKey ? 'spatial_world' : 'mesh')
    spatialLoadStartedAtRef.current = Date.now()
    setSpatialLoadState({ status: 'idle', progress: 0, splatCount: null, error: null })
  }, [definition.key, renderBinding.spatialWorldAssetKey])

  useEffect(() => {
    setLocalMarkers(spatialWorldMarkers.filter((marker) => marker.variantId === spatialWorldVariant?.id))
  }, [spatialWorldMarkers, spatialWorldVariant?.id])

  useEffect(() => {
    if (!spatialWorldVariant) return
    setAlignmentDraft({
      position: spatialWorldVariant.alignmentTransform.position,
      rotation: spatialWorldVariant.alignmentTransform.rotation,
      scale: spatialWorldVariant.alignmentTransform.scale,
      confidence: spatialWorldVariant.alignmentConfidence ?? 0,
      groundPlaneOffset: spatialWorldVariant.manifest?.groundPlaneOffset ?? 0,
    })
  }, [spatialWorldVariant])

  useEffect(() => {
    const keys = [selectedSplatAssetKey, renderBinding.colliderMeshAssetKey, ...(spatialWorldVariant?.manifest?.lodAssetKeys ?? [])].filter((key): key is string => Boolean(key))
    if (!onResolveAssetUrls || keys.length === 0) {
      setResolvedSpatialAssets({})
      return
    }
    let active = true
    void onResolveAssetUrls(keys).then((signedAssets) => {
      if (!active) return
      setResolvedSpatialAssets(Object.fromEntries(signedAssets.map((asset) => [asset.key, asset])))
    }).catch((error) => {
      if (!active) return
      setSpatialLoadState({ status: 'error', progress: 0, splatCount: null, error: error instanceof Error ? error.message : 'Spatial assets could not be signed.' })
    })
    return () => { active = false }
  }, [onResolveAssetUrls, renderBinding.colliderMeshAssetKey, selectedSplatAssetKey, spatialWorldVariant?.manifest?.lodAssetKeys])

  useEffect(() => () => {
    if (markerMoveTimerRef.current) clearTimeout(markerMoveTimerRef.current)
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)')
    const update = () => setSupportsWalkMode(!query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])

  const spawnPosition = useMemo(() => resolveSpatialWorldSpawn({ markers: localMarkers, manifest: spatialWorldVariant?.manifest ?? null }), [localMarkers, spatialWorldVariant?.manifest])
  const selectedMarker = localMarkers.find((marker) => marker.id === selectedMarkerId) ?? null

  async function createMarkerAt(position: [number, number, number], kind = markerPlacementKind) {
    if (!kind || !spatialWorldVariant || !onCreateSpatialWorldMarker) return
    const sequence = localMarkers.filter((marker) => marker.kind === kind).length + 1
    const camera = kind === 'camera_viewpoint' ? { fov: cameraState.fov, target: cameraState.target, projection: 'perspective' as const } : null
    const response = await onCreateSpatialWorldMarker({
      projectId: spatialWorldVariant.projectId, draftId: spatialWorldVariant.draftId, variantId: spatialWorldVariant.id,
      key: `${kind}-${Date.now()}`, kind, name: `${kind.replace(/_/g, ' ')} ${sequence}`, description: '',
      transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] }, camera,
      linkedEntityKey: null, linkedLocationKey: definition.key, linkedSceneId: null, linkedSpotId: null, linkedCoverageSetupId: null,
      screenshotAssetKey: null, visible: true, metadata: { authoredIn: 'spatial_viewer' },
    })
    if (response.marker) {
      setLocalMarkers((current) => [...current, response.marker!])
      setSelectedMarkerId(response.marker.id)
      setMarkerPlacementKind(null)
      setSpatialAuthoringMessage(`${response.marker.name} placed.`)
    }
  }

  function moveMarker(markerId: string, position: [number, number, number]) {
    setLocalMarkers((current) => current.map((marker) => marker.id === markerId ? { ...marker, transform: { ...marker.transform, position } } : marker))
    if (markerMoveTimerRef.current) clearTimeout(markerMoveTimerRef.current)
    markerMoveTimerRef.current = setTimeout(() => { void onUpdateSpatialWorldMarker?.({ markerId, transform: { ...(localMarkers.find((marker) => marker.id === markerId)?.transform ?? { rotation: [0, 0, 0], scale: [1, 1, 1] }), position } }) }, 250)
  }
  const compileCacheRef = useRef(createAssemblyCompileCache())
  const lastCompiledPreviewRef = useRef<{
    signature: string
    value: {
      compileResult: ReturnType<typeof compileAssemblyGraph>
      compiledEnvironment: ReturnType<typeof compileAssemblyGraph>['compiledModel']
    }
  } | null>(null)
  const compiledPreview = useMemo(
    () => {
      if (!(isEnvironment && geometryBinding && (geometryBinding.sourceMode === 'procedural_graph' || geometryBinding.sourceMode === 'procedural_blueprint'))) return null
      if (geometryBinding.sourceMode === 'procedural_blueprint' && environmentBlueprint) {
        const compileResult = compileEnvironmentBlueprint(environmentBlueprint, {
          existingGraph: assemblyGraph ?? undefined,
          existingCache: compileCacheRef.current,
        })
        compileCacheRef.current = compileResult.compileResult.cache
        const value = {
          compileResult: compileResult.compileResult,
          compiledEnvironment: {
            ...compileResult.compiledModel,
            parts: compileResult.compiledModel.parts.filter((part) => part.kind !== 'debug' && part.kind !== 'line'),
          },
        }
        lastCompiledPreviewRef.current = { signature: JSON.stringify({ blueprint: environmentBlueprint, graphKey: assemblyGraph?.key ?? null }), value }
        return value
      }
      if (!assemblyGraph) return null
      const signature = JSON.stringify({
        key: assemblyGraph.key,
        metadata: assemblyGraph.metadata,
        nodes: assemblyGraph.nodes,
        edges: assemblyGraph.edges,
      })
      if (lastCompiledPreviewRef.current?.signature === signature) {
        return lastCompiledPreviewRef.current.value
      }

      const compileResult = compileAssemblyGraph(assemblyGraph, compileCacheRef.current)
      compileCacheRef.current = compileResult.cache
      const value = {
        compileResult,
        compiledEnvironment: {
          ...compileResult.compiledModel,
          parts: compileResult.compiledModel.parts.filter((part) => part.kind !== 'debug' && part.kind !== 'line'),
        },
      }
      lastCompiledPreviewRef.current = { signature, value }
      return value
    },
    [assemblyGraph, environmentBlueprint, geometryBinding, isEnvironment],
  )

  useEffect(() => {
    const debug3dViewer = is3dDebugEnabled()
    if (!debug3dViewer) return
    console.log('[GraphCore][3D] Panel state snapshot.', {
      definitionKey: definition.key,
      definitionKind: definition.kind,
      renderBinding,
      meshAsset: meshAsset
        ? {
            key: meshAsset.key,
            kind: meshAsset.kind,
            storagePath: meshAsset.storagePath,
            metadata: {
              generatedBy: meshAsset.metadata.generatedBy,
              storageBucket: meshAsset.metadata.storageBucket,
              sourceUrl: typeof meshAsset.metadata.sourceUrl === 'string' ? `${meshAsset.metadata.sourceUrl.slice(0, 160)}...` : null,
              previewUrl: typeof meshAsset.metadata.previewUrl === 'string' ? `${meshAsset.metadata.previewUrl.slice(0, 160)}...` : null,
            },
          }
        : null,
      previewImageAsset: previewImageAsset
        ? {
            key: previewImageAsset.key,
            storagePath: previewImageAsset.storagePath,
            hasSourceUrl: typeof previewImageAsset.metadata.sourceUrl === 'string' && previewImageAsset.metadata.sourceUrl.length > 0,
            hasPreviewUrl: typeof previewImageAsset.metadata.previewUrl === 'string' && previewImageAsset.metadata.previewUrl.length > 0,
          }
        : null,
      meshSourceUrlPreview: meshSourceUrl ? `${meshSourceUrl.slice(0, 160)}...` : null,
      fallbackMeshSourceUrlPreview: fallbackMeshSourceUrl ? `${fallbackMeshSourceUrl.slice(0, 160)}...` : null,
      meshGenerationJob,
    })
  }, [definition.key, definition.kind, fallbackMeshSourceUrl, meshAsset, meshGenerationJob, meshSourceUrl, previewImageAsset, renderBinding])

  useEffect(() => {
    const bucket = typeof meshAsset?.metadata.storageBucket === 'string' && meshAsset.metadata.storageBucket.trim()
      ? meshAsset.metadata.storageBucket.trim()
      : null
    const storagePath = typeof meshAsset?.storagePath === 'string' && meshAsset.storagePath.trim()
      ? meshAsset.storagePath.trim()
      : null

    if (meshSourceUrl || !meshAsset || !bucket || !storagePath || shouldSkipMeshFallbackLoad) {
      setFallbackMeshSourceUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      if (shouldSkipMeshFallbackLoad) {
        setMeshViewportError(null)
      }
      return
    }

    let cancelled = false
    const debug3dViewer = is3dDebugEnabled()
    setMeshViewportError(null)

    if (debug3dViewer) {
      console.log('[GraphCore][3D] Attempting direct Storage download fallback for mesh.', {
        assetKey: meshAsset.key,
        bucket,
        storagePath,
      })
    }

    void supabase.storage.from(bucket).download(storagePath).then(({ data, error }) => {
      if (cancelled) return

      if (error || !data) {
        if (debug3dViewer) {
          console.error('[GraphCore][3D] Direct Storage download fallback failed.', {
            assetKey: meshAsset.key,
            bucket,
            storagePath,
            error,
          })
        }
        const requestId = typeof meshGenerationJob?.providerRequestId === 'string' ? meshGenerationJob.providerRequestId : null
        const model = typeof meshGenerationJob?.model === 'string' && meshGenerationJob.model.trim()
          ? meshGenerationJob.model
          : 'fal-ai/trellis-2'
        if (!requestId) {
          setMeshViewportError(error?.message ?? 'The generated mesh could not be downloaded from Storage.')
          return
        }

        if (debug3dViewer) {
          console.log('[GraphCore][3D] Falling back to Trellis result URL.', {
            assetKey: meshAsset.key,
            requestId,
            model,
          })
        }

        void runCoalescedRequest({
          key: `ai-fal-result:${model}:${requestId}`,
          className: 'edge-function',
          ttlMs: 5000,
          retryPolicy: { attempts: 2 },
          fn: () => supabase.functions.invoke('ai-fal', {
            body: {
              action: 'result',
              model,
              requestId,
            },
          }),
        }).then(({ data: resultData, error: resultError }) => {
          if (cancelled) return
          if (resultError) {
            if (debug3dViewer) {
              console.error('[GraphCore][3D] Trellis result URL fallback failed.', {
                assetKey: meshAsset.key,
                requestId,
                error: resultError,
              })
            }
            setMeshViewportError(resultError.message || error?.message || 'The generated mesh could not be loaded.')
            return
          }

          const fallbackUrl = extractTrellisModelUrl(resultData)
          if (!fallbackUrl) {
            if (debug3dViewer) {
              console.error('[GraphCore][3D] Trellis result URL fallback returned no model URL.', {
                assetKey: meshAsset.key,
                requestId,
                resultData,
              })
            }
            setMeshViewportError('The generated mesh could not be loaded from Trellis 2 result output.')
            return
          }

          if (debug3dViewer) {
            console.log('[GraphCore][3D] Trellis result URL fallback succeeded.', {
              assetKey: meshAsset.key,
              requestId,
              fallbackUrl,
            })
          }
          setFallbackMeshSourceUrl((current) => {
            if (current?.startsWith('blob:')) URL.revokeObjectURL(current)
            return fallbackUrl
          })
        })
        return
      }

      const objectUrl = URL.createObjectURL(data)
      if (debug3dViewer) {
        console.log('[GraphCore][3D] Direct Storage download fallback succeeded.', {
          assetKey: meshAsset.key,
          bucket,
          storagePath,
          size: data.size,
        })
      }

      setFallbackMeshSourceUrl((current) => {
        if (current?.startsWith('blob:')) URL.revokeObjectURL(current)
        return objectUrl
      })
    })

    return () => {
      cancelled = true
    }
  }, [meshAsset, meshGenerationJob, meshSourceUrl, shouldSkipMeshFallbackLoad])
  const compiledEnvironment = compiledPreview?.compiledEnvironment ?? null
  const compiledPartSummary = useMemo(
    () =>
      compiledEnvironment?.parts
        .filter((part) => part.kind === 'solid')
        .map((part) => {
          const yValues = part.positions.filter((_, index) => index % 3 === 1)
          const minY = yValues.length > 0 ? Math.min(...yValues) : 0
          const maxY = yValues.length > 0 ? Math.max(...yValues) : 0
          return {
            id: part.id,
            sourceNodeKey: part.sourceNodeKey,
            solidKind: String(part.metadata?.solidKind ?? 'unknown'),
            derivedKind: typeof part.metadata?.derivedKind === 'string' ? part.metadata.derivedKind : null,
            minY,
            maxY,
          }
        }) ?? [],
    [compiledEnvironment],
  )

  useEffect(() => {
    if (!compiledPreview || !assemblyGraph) return
    const shellBands = compiledPreview.compileResult.spatialDocument.shellBands.map((band) => ({
      id: band.id,
      derivedKind: band.metadata.derivedKind,
      baseElevation: band.baseElevation,
      topElevation: band.topElevation,
      sourceNodeKeys: band.sourceNodeKeys,
    }))
    console.groupCollapsed(`[Environment Compile] ${assemblyGraph.key}`)
    console.table(shellBands)
    console.table(
      compiledPartSummary.map((part) => ({
        id: part.id,
        sourceNodeKey: part.sourceNodeKey,
        solidKind: part.solidKind,
        derivedKind: part.derivedKind,
        minY: Number(part.minY.toFixed(3)),
        maxY: Number(part.maxY.toFixed(3)),
      })),
    )
    if (compiledPreview.compileResult.diagnostics.length > 0) {
      console.warn('Diagnostics', compiledPreview.compileResult.diagnostics)
    }
    console.groupEnd()
  }, [assemblyGraph, compiledPartSummary, compiledPreview])

  function updateRenderBinding(changes: Partial<typeof renderBinding>) {
    if (isEnvironment) {
      const nextConfig: EnvironmentRenderBindingConfig = {
        primaryMeshAssetKey: renderBinding.primaryMeshAssetKey ?? null,
        previewImageAssetKey: renderBinding.previewImageAssetKey ?? null,
        spatialWorldVariantId: renderBinding.spatialWorldVariantId ?? null,
        spatialWorldAssetKey: renderBinding.spatialWorldAssetKey ?? null,
        spatialWorldManifestAssetKey: renderBinding.spatialWorldManifestAssetKey ?? null,
        colliderMeshAssetKey: renderBinding.colliderMeshAssetKey ?? null,
        spatialWorldJobId: renderBinding.spatialWorldJobId ?? null,
        lightingProfile: renderBinding.lightingProfile ?? '',
        generationPrompt: renderBinding.generationPrompt ?? null,
        generationStyle: renderBinding.generationStyle ?? null,
        ...changes,
      }
      const nextComponents = definition.components.some((component) => component.type === 'environment_render_binding')
        ? definition.components.map((component) => component.type === 'environment_render_binding' ? { ...component, config: nextConfig } : component)
        : [...definition.components, { type: 'environment_render_binding', config: nextConfig } as DefinitionBase['components'][number]]
      onUpdateComponents(definition.key, nextComponents)
      return
    }

    const nextConfig: Render3dBindingConfig = {
      primaryMeshAssetKey: renderBinding.primaryMeshAssetKey ?? null,
      previewImageAssetKey: renderBinding.previewImageAssetKey ?? null,
      conceptPrompt: renderBinding.conceptPrompt ?? null,
      generationPrompt: renderBinding.generationPrompt ?? null,
      generationStyle: renderBinding.generationStyle ?? null,
      ...changes,
    }
    const nextComponents = definition.components.some((component) => component.type === 'render_3d_binding')
      ? definition.components.map((component) => component.type === 'render_3d_binding' ? { ...component, config: nextConfig } : component)
      : [...definition.components, { type: 'render_3d_binding', config: nextConfig } as DefinitionBase['components'][number]]
    onUpdateComponents(definition.key, nextComponents)
  }

  async function handleGenerateStub() {
    setGenerationPending(true)
    try {
      const result = await visualAssetGenerationService.generateMeshFromImage({
        definitionKey: definition.key,
        imageAssetKey: renderBinding.previewImageAssetKey,
        imageUrl: resolveAssetSourceUrl(previewImageAsset),
        prompt: renderBinding.generationPrompt,
        style: renderBinding.generationStyle,
      })
      setGenerationMessage(result.message)
    } catch (error) {
      setGenerationMessage(error instanceof Error ? error.message : '3D mesh generation stub failed unexpectedly.')
    } finally {
      setGenerationPending(false)
    }
  }

  return (
    <div className="character-3d-panel">
      <div className="character-3d-layout">
        <div className="character-3d-stage">
          <ThreeSceneViewport
            compiledEnvironment={compiledEnvironment}
            meshSourceUrl={viewportMeshSourceUrl}
            colliderSourceUrl={colliderSourceUrl}
            spatialWorldSourceUrl={spatialWorldSourceUrl}
            spatialWorldTransform={spatialWorldVariant ? { position: alignmentDraft.position, rotation: alignmentDraft.rotation, scale: alignmentDraft.scale } : null}
            renderMode={renderMode}
            navigationMode={navigationMode}
            walkSpeed={walkSpeed}
            spawnPosition={spawnPosition}
            spatialBounds={spatialWorldVariant?.manifest?.bounds ?? null}
            markers={localMarkers}
            selectedMarkerId={selectedMarkerId}
            markerPlacementKind={markerPlacementKind}
            showColliderDebug={showColliderDebug}
            cameraView={cameraView}
            captureScreenshotSignal={captureScreenshotSignal}
            modelKind={isSpatialEnvironment ? 'environment' : 'character'}
            modelLabel={definition.name}
            modelSubtype={subtype}
            showFloor={showFloor}
            showGrid={showGrid}
            resetSignal={resetSignal}
            onMeshLoadStateChange={(state) => {
              setMeshViewportError(state.status === 'error' ? state.error : null)
            }}
            onSpatialLoadStateChange={(state) => {
              setSpatialLoadState(state)
              if (state.status === 'ready' && spatialWorldVariant && onRecordSpatialWorldPerformance) {
                void onRecordSpatialWorldPerformance({ projectId: spatialWorldVariant.projectId, draftId: spatialWorldVariant.draftId, variantId: spatialWorldVariant.id, eventType: 'load', fps: null, frameTimeMs: null, loadTimeMs: Date.now() - spatialLoadStartedAtRef.current, selectedLodAssetKey: selectedSplatAssetKey ?? null, deviceMemoryGb, metadata: { splatCount: state.splatCount } })
              }
            }}
            onPerformanceChange={(sample) => {
              setViewportPerformance(sample)
              if (!spatialWorldVariant || !onRecordSpatialWorldPerformance || Date.now() - lastTelemetryAtRef.current < 15_000) return
              lastTelemetryAtRef.current = Date.now()
              void onRecordSpatialWorldPerformance({ projectId: spatialWorldVariant.projectId, draftId: spatialWorldVariant.draftId, variantId: spatialWorldVariant.id, eventType: 'frame_sample', fps: sample.fps, frameTimeMs: sample.frameTimeMs, loadTimeMs: null, selectedLodAssetKey: selectedSplatAssetKey ?? null, deviceMemoryGb, metadata: { renderMode, navigationMode } })
            }}
            onMarkerSelect={setSelectedMarkerId}
            onMarkerMove={moveMarker}
            onMarkerPlace={(position) => void createMarkerAt(position)}
            onCameraStateChange={setCameraState}
            onWalkRecovery={() => {
              setSpatialAuthoringMessage('Walk position was outside the generated bounds and has been reset.')
              if (spatialWorldVariant && onRecordSpatialWorldPerformance) void onRecordSpatialWorldPerformance({ projectId: spatialWorldVariant.projectId, draftId: spatialWorldVariant.draftId, variantId: spatialWorldVariant.id, eventType: 'walk_recovery', fps: viewportPerformance.fps || null, frameTimeMs: viewportPerformance.frameTimeMs || null, loadTimeMs: null, selectedLodAssetKey: selectedSplatAssetKey ?? null, deviceMemoryGb, metadata: {} })
            }}
            onScreenshotCaptured={(blob) => {
              if (!pendingScreenshotMarkerId || !spatialWorldVariant || !onUploadSpatialWorldMarkerScreenshot) return
              void onUploadSpatialWorldMarkerScreenshot({ markerId: pendingScreenshotMarkerId, variantId: spatialWorldVariant.id, blob })
                .then(() => setSpatialAuthoringMessage('Viewpoint screenshot saved.'))
                .catch((error) => setSpatialAuthoringMessage(error instanceof Error ? error.message : 'Viewpoint screenshot could not be saved.'))
                .finally(() => setPendingScreenshotMarkerId(null))
            }}
          />
        </div>

        <div className="character-3d-sidebar">
          {!isSpatialEnvironment && !isProceduralEnvironment ? (
            <div className="editor-section">
              <button
                className="primary-button compact"
                disabled={meshGenerationPending || generationPending || !canStartMeshGeneration}
                onClick={shouldUseConceptFallbackCta ? () => onRequestGenerateConceptArt?.() : () => onRequestGenerateMesh?.()}
                type="button"
              >
                {meshGenerationPending
                  ? 'Generating 3D...'
                  : generationPending
                    ? 'Checking mesh generation path...'
                  : shouldUseConceptFallbackCta
                    ? 'Generate concept art'
                    : 'Generate 3D mesh'}
              </button>
              {showGeneratedMeshDelete ? (
                <button className={isDeletingGeneratedMesh ? 'ghost-button compact danger button-with-spinner' : 'ghost-button compact danger'} disabled={isDeletingGeneratedMesh} onClick={() => onDeleteGeneratedMesh?.()} type="button">
                  {isDeletingGeneratedMesh ? <><span className="button-spinner" aria-hidden="true" />Deleting...</> : meshGenerationPending ? 'Cancel generation' : 'Delete 3D'}
                </button>
              ) : null}
              {!shouldUseConceptFallbackCta && !canStartMeshGeneration ? (
                <div className="inline-note is-warning">Generate a concept image in Details before creating a 3D mesh.</div>
              ) : null}
              {meshGenerationMessage ? <div className={meshGenerationJob?.errorMessage ? 'inline-note is-warning' : 'inline-note'}>{meshGenerationMessage}</div> : null}
              {meshViewportError ? <div className="inline-note is-warning">{meshViewportError}</div> : null}
              {generationMessage ? <div className="inline-note is-warning">{generationMessage}</div> : null}
            </div>
          ) : null}

          {isSpatialEnvironment ? (
            <div className="editor-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Scene</span>
                  <h3>Viewport controls</h3>
                </div>
                <p className="subtle-line">Orbit with mouse drag, pan with right-drag, and dolly with scroll.</p>
              </div>
              <div className="chip-row">
                {spatialWorldAsset ? (
                  <>
                    <button className={renderMode === 'mesh' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRenderMode('mesh')} type="button">Mesh</button>
                    <button className={renderMode === 'spatial_world' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRenderMode('spatial_world')} type="button">Spatial</button>
                    <button className={renderMode === 'hybrid' ? 'segment-button is-active' : 'segment-button'} onClick={() => setRenderMode('hybrid')} type="button">Hybrid</button>
                    <button className={navigationMode === 'orbit' ? 'segment-button is-active' : 'segment-button'} onClick={() => setNavigationMode('orbit')} type="button">Orbit</button>
                    <button className={navigationMode === 'walk' ? 'segment-button is-active' : 'segment-button'} disabled={!colliderAsset || !supportsWalkMode} onClick={() => setNavigationMode('walk')} title={!supportsWalkMode ? 'Walk mode requires a fine pointer and keyboard.' : undefined} type="button">Walk</button>
                    <button className={showColliderDebug ? 'segment-button is-active' : 'segment-button'} disabled={!colliderAsset} onClick={() => setShowColliderDebug((current) => !current)} type="button">Collider</button>
                  </>
                ) : null}
                <button className={showFloor ? 'segment-button is-active' : 'segment-button'} onClick={() => setShowFloor((current) => !current)} type="button">
                  Floor
                </button>
                <button className={showGrid ? 'segment-button is-active' : 'segment-button'} onClick={() => setShowGrid((current) => !current)} type="button">
                  Grid
                </button>
                <button className="ghost-button compact" onClick={() => setResetSignal((current) => current + 1)} type="button">
                  Reset camera
                </button>
              </div>
              {spatialWorldAsset ? (
                <div className="three-scene-status">
                  <strong>{spatialLoadState.status === 'ready' ? 'Spatial world ready' : spatialLoadState.status === 'loading' ? 'Loading spatial world' : spatialLoadState.status === 'error' ? 'Spatial world unavailable' : 'Spatial world bound'}</strong>
                  <span>{spatialLoadState.status === 'loading' ? `${Math.round(spatialLoadState.progress * 100)}% loaded` : spatialLoadState.status === 'ready' ? `${spatialLoadState.splatCount.toLocaleString()} splats` : spatialLoadState.error ?? spatialWorldAsset.name}</span>
                  {spatialLoadState.status === 'ready' ? <span>{Math.round(viewportPerformance.fps)} FPS · {viewportPerformance.frameTimeMs.toFixed(1)} ms frame</span> : null}
                  {navigationMode === 'walk' ? <span>Click the world to lock the pointer. Use WASD or arrow keys; Escape releases it.</span> : null}
                </div>
              ) : null}
              {spatialWorldAsset ? (
                <label className="field-stack compact-field">
                  <span>Walk speed · {walkSpeed.toFixed(1)} m/s</span>
                  <input aria-label="Walk speed" max="8" min="1" onChange={(event) => setWalkSpeed(Number(event.target.value))} step="0.2" type="range" value={walkSpeed} />
                </label>
              ) : null}
            </div>
          ) : null}

          {isSpatialEnvironment && spatialWorldVariant ? (
            <div className="editor-section spatial-authoring-section">
              <div className="section-head">
                <div><span className="eyebrow">Spatial authoring</span><h3>Anchors and viewpoints</h3></div>
                <span className="chip">{localMarkers.length} markers</span>
              </div>
              <p className="subtle-line">Choose a marker type, then double-click the collider surface to place it. Generated geometry remains non-canonical until you link a marker explicitly.</p>
              <div className="chip-row">
                {(['annotation', 'entry_point', 'canon_anchor'] as const).map((kind) => (
                  <button className={markerPlacementKind === kind ? 'segment-button is-active' : 'segment-button'} key={kind} onClick={() => { setNavigationMode('orbit'); setShowColliderDebug(true); setMarkerPlacementKind((current) => current === kind ? null : kind) }} type="button">{kind.replace(/_/g, ' ')}</button>
                ))}
                <button className="segment-button" onClick={() => void createMarkerAt(cameraState.position, 'camera_viewpoint')} type="button">Save viewpoint</button>
              </div>
              {selectedMarker ? (
                <div className="schema-card spatial-marker-editor">
                  <div className="schema-card-head"><strong>{selectedMarker.name}</strong><span className="chip">{selectedMarker.kind.replace(/_/g, ' ')}</span></div>
                  <label className="field-stack"><span>Name</span><input value={selectedMarker.name} onChange={(event) => setLocalMarkers((current) => current.map((marker) => marker.id === selectedMarker.id ? { ...marker, name: event.target.value } : marker))} onBlur={() => void onUpdateSpatialWorldMarker?.({ markerId: selectedMarker.id, name: selectedMarker.name })} /></label>
                  <label className="field-stack"><span>Description</span><textarea value={selectedMarker.description} onChange={(event) => setLocalMarkers((current) => current.map((marker) => marker.id === selectedMarker.id ? { ...marker, description: event.target.value } : marker))} onBlur={() => void onUpdateSpatialWorldMarker?.({ markerId: selectedMarker.id, description: selectedMarker.description })} /></label>
                  <label className="field-stack"><span>Canon/entity key</span><input placeholder="Optional existing entity key" value={selectedMarker.linkedEntityKey ?? ''} onChange={(event) => setLocalMarkers((current) => current.map((marker) => marker.id === selectedMarker.id ? { ...marker, linkedEntityKey: event.target.value || null } : marker))} onBlur={() => void onUpdateSpatialWorldMarker?.({ markerId: selectedMarker.id, linkedEntityKey: selectedMarker.linkedEntityKey })} /></label>
                  <div className="chip-row">
                    {selectedMarker.kind === 'camera_viewpoint' ? <button className="ghost-button compact" onClick={() => setCameraView({ position: selectedMarker.transform.position, target: selectedMarker.camera?.target ?? null, fov: selectedMarker.camera?.fov ?? 50, signal: Date.now() })} type="button">Restore camera</button> : null}
                    {selectedMarker.kind === 'camera_viewpoint' ? <button className="ghost-button compact" onClick={() => { setPendingScreenshotMarkerId(selectedMarker.id); setCaptureScreenshotSignal((current) => current + 1) }} type="button">Capture screenshot</button> : null}
                    <button className="ghost-button compact" onClick={() => void onUpdateSpatialWorldMarker?.({ markerId: selectedMarker.id, visible: !selectedMarker.visible }).then(() => setLocalMarkers((current) => current.map((marker) => marker.id === selectedMarker.id ? { ...marker, visible: !marker.visible } : marker)))} type="button">{selectedMarker.visible ? 'Hide' : 'Show'}</button>
                    <button className="ghost-button compact danger" onClick={() => void onDeleteSpatialWorldMarker?.(selectedMarker.id).then(() => { setLocalMarkers((current) => current.filter((marker) => marker.id !== selectedMarker.id)); setSelectedMarkerId(null) })} type="button">Delete</button>
                  </div>
                </div>
              ) : null}
              <div className="schema-card">
                <div className="schema-card-head"><strong>Alignment and processing</strong><span className="chip">{Math.round((spatialWorldVariant.alignmentConfidence ?? 0) * 100)}% confidence</span></div>
                {(['position', 'rotation', 'scale'] as const).map((field) => (
                  <div className="spatial-vector-field" key={field}>
                    <span>{field}</span>
                    {alignmentDraft[field].map((value, index) => <input aria-label={`${field} ${['x', 'y', 'z'][index]}`} key={`${field}-${index}`} onChange={(event) => setAlignmentDraft((current) => ({ ...current, [field]: current[field].map((entry, itemIndex) => itemIndex === index ? Number(event.target.value) : entry) as [number, number, number] }))} step={field === 'rotation' ? 0.05 : 0.1} type="number" value={value} />)}
                  </div>
                ))}
                <div className="spatial-vector-field"><span>ground</span><input aria-label="Ground plane offset" onChange={(event) => setAlignmentDraft((current) => ({ ...current, groundPlaneOffset: Number(event.target.value) }))} step="0.1" type="number" value={alignmentDraft.groundPlaneOffset} /><span>confidence</span><input aria-label="Alignment confidence" max="1" min="0" onChange={(event) => setAlignmentDraft((current) => ({ ...current, confidence: Number(event.target.value) }))} step="0.05" type="number" value={alignmentDraft.confidence} /></div>
                <div className="chip-row">
                  <button className="ghost-button compact" onClick={() => void onUpdateSpatialWorldAlignment?.({ variantId: spatialWorldVariant.id, transform: { position: alignmentDraft.position, rotation: alignmentDraft.rotation, scale: alignmentDraft.scale }, confidence: alignmentDraft.confidence, groundPlaneOffset: alignmentDraft.groundPlaneOffset, validationNotes: ['Reviewed in the spatial authoring viewport.'] }).then(() => setSpatialAuthoringMessage('Alignment saved.'))} type="button">Save alignment</button>
                  <button className="ghost-button compact" onClick={() => void onStartSpatialWorldProcessing?.({ variantId: spatialWorldVariant.id, operation: 'validate' }).then(() => setSpatialAuthoringMessage('Spatial validation queued.'))} type="button">Validate assets</button>
                  <button className="ghost-button compact" onClick={() => void onStartSpatialWorldProcessing?.({ variantId: spatialWorldVariant.id, operation: 'generate_lods' }).catch((error) => setSpatialAuthoringMessage(error instanceof Error ? error.message : 'LOD processing could not be queued.'))} type="button">Generate LODs</button>
                </div>
              </div>
              {spatialAuthoringMessage ? <div aria-live="polite" className="inline-note">{spatialAuthoringMessage}</div> : null}
            </div>
          ) : null}

          {isEnvironment && !isProceduralEnvironment ? (
            <div className="editor-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Binding</span>
                  <h3>Mesh and preview assets</h3>
                </div>
                <p className="subtle-line">
                  {isEnvironment
                    ? 'Environments use `environment_render_binding`; this tab gives it a structured editor.'
                    : 'Characters use `render_3d_binding`; this tab gives it a structured editor.'}
                </p>
              </div>
              <div className="editor-grid compact">
                <label className="field-block full-width">
                  <span>Primary Mesh</span>
                  <select
                    value={renderBinding.primaryMeshAssetKey ?? ''}
                    onChange={(event) => updateRenderBinding({ primaryMeshAssetKey: event.target.value || null })}
                  >
                    <option value="">No mesh bound</option>
                    {meshAssets.map((asset) => (
                      <option key={asset.key} value={asset.key}>
                        {asset.name} ({asset.key})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-block full-width">
                  <span>Preview Image</span>
                  <select
                    value={renderBinding.previewImageAssetKey ?? ''}
                    onChange={(event) => updateRenderBinding({ previewImageAssetKey: event.target.value || null })}
                  >
                    <option value="">No concept image</option>
                    {imageAssets.map((asset) => (
                      <option key={asset.key} value={asset.key}>
                        {asset.name} ({asset.key})
                      </option>
                    ))}
                  </select>
                </label>
                {isEnvironment ? (
                  <label className="field-block full-width">
                    <span>Lighting Profile</span>
                    <input
                      value={renderBinding.lightingProfile ?? ''}
                      onChange={(event) => updateRenderBinding({ lightingProfile: event.target.value })}
                      placeholder="Day exterior, moody cavern, bright interior..."
                    />
                  </label>
                ) : null}
                <label className="field-block full-width">
                  <span>Generation Prompt</span>
                  <textarea
                    rows={4}
                    value={renderBinding.generationPrompt ?? ''}
                    onChange={(event) => updateRenderBinding({ generationPrompt: event.target.value || null })}
                    placeholder="Describe silhouette, materials, and major forms for the future mesh pass."
                  />
                </label>
                <label className="field-block full-width">
                  <span>Generation Style</span>
                  <input
                    value={renderBinding.generationStyle ?? ''}
                    onChange={(event) => updateRenderBinding({ generationStyle: event.target.value || null })}
                    placeholder="Stylized, realistic, low poly, hand painted..."
                  />
                </label>
              </div>
            </div>
          ) : null}

          {isEnvironment ? (
            <div className="editor-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Summary</span>
                  <h3>Bound assets</h3>
                </div>
              </div>
              <div className="character-3d-summary-card">
                <div className="character-3d-summary-row">
                  <strong>Geometry mode</strong>
                  <span>{geometryBinding?.sourceMode ?? 'mesh'}</span>
                </div>
                <div className="character-3d-summary-row">
                  <strong>Assembly graph</strong>
                  <span>{geometryBinding?.assemblyGraphKey ?? 'None'}</span>
                </div>
                <div className="character-3d-summary-row">
                  <strong>Mesh</strong>
                  <span>{meshAsset?.name ?? 'None'}</span>
                </div>
                <div className="character-3d-summary-row">
                  <strong>Mesh source</strong>
                  <span>{meshSourceLabel}</span>
                </div>
                <div className="character-3d-summary-row">
                  <strong>Concept image</strong>
                  <span>{previewImageAsset?.name ?? 'None'}</span>
                </div>
                <div className="character-3d-summary-row">
                  <strong>Spatial world</strong>
                  <span>{spatialWorldAsset?.name ?? 'None'}</span>
                </div>
                <div className="character-3d-summary-row">
                  <strong>Collider</strong>
                  <span>{colliderAsset?.name ?? 'None'}</span>
                </div>
                {compiledEnvironment ? (
                  <div className="character-3d-summary-row">
                    <strong>Compiled parts</strong>
                    <span>{compiledEnvironment.parts.length}</span>
                  </div>
                ) : null}
                {compiledEnvironment ? (
                  <div className="character-3d-summary-row">
                    <strong>Structural fusion</strong>
                    <span>{String(compiledEnvironment.metadata?.structuralFusionCount ?? 0)}</span>
                  </div>
                ) : null}
                {compiledPartSummary.length > 0 ? (
                  <div className="character-3d-summary-row" style={{ display: 'block' }}>
                    <strong>Solid Parts</strong>
                    <div className="inline-note" style={{ marginTop: 8 }}>
                      {compiledPartSummary.map((part) => (
                        <div key={part.id}>
                          {part.solidKind}
                          {part.derivedKind ? ` (${part.derivedKind})` : ''}
                          {` y=${part.minY.toFixed(2)}..${part.maxY.toFixed(2)} from ${part.sourceNodeKey}`}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="character-3d-preview-thumb">
                  <MediaThumb asset={previewImageAsset} label={previewImageAsset?.name ?? definition.name} large />
                </div>
              </div>
            </div>
          ) : null}

          {isEnvironment && !isProceduralEnvironment ? (
            <div className="editor-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">AI Path</span>
                  <h3>Generate 3D mesh</h3>
                </div>
                <p className="subtle-line">
                  This keeps the future {'image -> mesh -> asset -> bind'} path visible for this {entityLabel.toLowerCase()} without enabling the provider step yet.
                </p>
              </div>
              <button className="primary-button compact" disabled={generationPending} onClick={handleGenerateStub} type="button">
                {generationPending ? 'Checking mesh generation path...' : 'Generate 3D mesh (Stub)'}
              </button>
              {generationMessage ? <div className="inline-note is-warning">{generationMessage}</div> : null}
            </div>
          ) : (
            isEnvironment ? <div className="editor-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Compiled</span>
                  <h3>Procedural mesh preview</h3>
                </div>
                <p className="subtle-line">This view is compiled directly from the assembly graph. Update the graph and regenerate from the Graph tab.</p>
              </div>
            </div> : null
          )}
        </div>
      </div>
    </div>
  )
}
