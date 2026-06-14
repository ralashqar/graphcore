import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bounds, Grid, Html, OrbitControls, PointerLockControls, TransformControls, useBounds } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Group, Line, LineBasicMaterial, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three'

import type { CompiledEnvironmentModel, CompiledMeshPart } from '../../domain/environmentAssembly'
import { isSpatialWorldPositionOutOfBounds, type SpatialWorldManifest, type SpatialWorldMarker } from '../../domain/spatialWorldGeneration'

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

type ThreeSceneViewportProps = {
  compiledEnvironment?: CompiledEnvironmentModel | null
  meshSourceUrl: string | null
  colliderSourceUrl?: string | null
  spatialWorldSourceUrl?: string | null
  spatialWorldTransform?: {
    position: [number, number, number]
    rotation: [number, number, number]
    scale: [number, number, number]
  } | null
  renderMode?: 'mesh' | 'spatial_world' | 'hybrid'
  navigationMode?: 'orbit' | 'walk'
  walkSpeed?: number
  spawnPosition?: [number, number, number]
  spatialBounds?: SpatialWorldManifest['bounds']
  markers?: SpatialWorldMarker[]
  selectedMarkerId?: string | null
  markerPlacementKind?: SpatialWorldMarker['kind'] | null
  showColliderDebug?: boolean
  cameraView?: { position: [number, number, number]; target: [number, number, number] | null; fov: number; signal: number } | null
  captureScreenshotSignal?: number
  modelKind: 'character' | 'environment'
  modelLabel: string
  modelSubtype: string
  showFloor: boolean
  showGrid: boolean
  resetSignal: number
  onMeshLoadStateChange?: ((state: LoadedSceneState) => void) | null
  onSpatialLoadStateChange?: ((state: SpatialLoadState) => void) | null
  onPerformanceChange?: ((sample: { fps: number; frameTimeMs: number }) => void) | null
  onMarkerSelect?: ((markerId: string | null) => void) | null
  onMarkerMove?: ((markerId: string, position: [number, number, number]) => void) | null
  onMarkerPlace?: ((position: [number, number, number]) => void) | null
  onCameraStateChange?: ((state: { position: [number, number, number]; target: [number, number, number]; fov: number }) => void) | null
  onWalkRecovery?: (() => void) | null
  onScreenshotCaptured?: ((blob: Blob) => void) | null
}

type LoadedSceneState =
  | { status: 'idle'; scene: null; error: null }
  | { status: 'loading'; scene: null; error: null }
  | { status: 'ready'; scene: Group; error: null }
  | { status: 'error'; scene: null; error: string }

export type SpatialLoadState =
  | { status: 'idle'; progress: 0; splatCount: null; error: null }
  | { status: 'loading'; progress: number; splatCount: null; error: null }
  | { status: 'ready'; progress: 1; splatCount: number; error: null }
  | { status: 'error'; progress: number; splatCount: null; error: string }

const targetCharacterMeshHeight = 2.3

function configureSceneShadows(group: Group) {
  group.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true
      child.receiveShadow = true

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => {
        if (material instanceof MeshStandardMaterial) {
          material.needsUpdate = true
        }
      })
    }
  })
}

function useLoadedScene(meshSourceUrl: string | null, modelKind: 'character' | 'environment', normalize = true): LoadedSceneState {
  const [state, setState] = useState<LoadedSceneState>({ status: 'idle', scene: null, error: null })

  useEffect(() => {
    const debug3dViewer = is3dDebugEnabled()
    if (!meshSourceUrl) {
      if (debug3dViewer) {
        console.log('[GraphCore][3D] No mesh source URL was available for the viewport.')
      }
      setState({ status: 'idle', scene: null, error: null })
      return
    }

    let isActive = true
    const loader = new GLTFLoader()
    if (debug3dViewer) {
      console.log('[GraphCore][3D] Starting GLB load.', {
        meshSourceUrl,
      })
    }
    setState({ status: 'loading', scene: null, error: null })

    loader.load(
      meshSourceUrl,
      (gltf) => {
        if (!isActive) return
        const root = (gltf.scene || gltf.scenes[0])?.clone(true)
        if (!root) {
          if (debug3dViewer) {
            console.error('[GraphCore][3D] GLB loaded without a scene root.', {
              meshSourceUrl,
              sceneCount: gltf.scenes?.length ?? 0,
            })
          }
          setState({ status: 'error', scene: null, error: 'Loaded mesh had no scene root.' })
          return
        }

        configureSceneShadows(root)
        let bounds = new Box3().setFromObject(root)
        if (normalize && modelKind === 'character') {
          const height = bounds.max.y - bounds.min.y
          if (Number.isFinite(height) && height > 0.001) {
            const scale = targetCharacterMeshHeight / height
            root.scale.setScalar(scale)
            bounds = new Box3().setFromObject(root)
          }
        }
        if (normalize) {
          const center = bounds.getCenter(new Vector3())
          root.position.sub(center)
          root.position.y -= bounds.min.y
        }
        if (debug3dViewer) {
          console.log('[GraphCore][3D] GLB load succeeded.', {
            meshSourceUrl,
            childCount: root.children.length,
            modelKind,
            bounds: {
              min: bounds.min.toArray(),
              max: bounds.max.toArray(),
            },
          })
        }
        setState({ status: 'ready', scene: root, error: null })
      },
      undefined,
      (error) => {
        if (!isActive) return
        const message = error instanceof Error ? error.message : 'Mesh preview failed to load.'
        if (debug3dViewer) {
          console.error('[GraphCore][3D] GLB load failed.', {
            meshSourceUrl,
            error,
            message,
          })
        }
        setState({ status: 'error', scene: null, error: message })
      },
    )

    return () => {
      isActive = false
      if (debug3dViewer) {
        console.log('[GraphCore][3D] Cancelled GLB load effect.', {
          meshSourceUrl,
        })
      }
    }
  }, [meshSourceUrl, modelKind, normalize])

  return state
}

function FitBounds({ fitKey }: { fitKey: string }) {
  const bounds = useBounds()

  useEffect(() => {
    bounds.refresh().clip().fit()
  }, [bounds, fitKey])

  return null
}

function SpatialWorldView({
  sourceUrl,
  transform,
  onLoadStateChange,
}: {
  sourceUrl: string
  transform: NonNullable<ThreeSceneViewportProps['spatialWorldTransform']>
  onLoadStateChange: (state: SpatialLoadState) => void
}) {
  const { gl, invalidate, scene } = useThree()
  const bounds = useBounds()
  const splat = useMemo(() => new SplatMesh({
    url: sourceUrl,
    enableLod: true,
    onProgress: (event) => {
      const total = Number(event.total)
      const loaded = Number(event.loaded)
      onLoadStateChange({
        status: 'loading',
        progress: total > 0 ? Math.min(1, loaded / total) : 0,
        splatCount: null,
        error: null,
      })
    },
  }), [onLoadStateChange, sourceUrl])

  useEffect(() => {
    const spark = new SparkRenderer({ renderer: gl })
    scene.add(spark)
    onLoadStateChange({ status: 'loading', progress: 0, splatCount: null, error: null })
    let active = true
    void splat.initialized.then(() => {
      if (!active) return
      onLoadStateChange({ status: 'ready', progress: 1, splatCount: splat.splats?.getNumSplats() ?? 0, error: null })
      splat.updateMatrixWorld(true)
      bounds.refresh(splat).clip().fit()
      invalidate()
    }).catch((error) => {
      if (!active) return
      onLoadStateChange({ status: 'error', progress: 0, splatCount: null, error: error instanceof Error ? error.message : 'Spatial world failed to load.' })
    })
    return () => {
      active = false
      scene.remove(spark)
      spark.dispose()
      splat.dispose()
    }
  }, [bounds, gl, invalidate, onLoadStateChange, scene, splat])

  return (
    <primitive
      object={splat}
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale}
    />
  )
}

function PerformanceProbe({ onPerformanceChange }: { onPerformanceChange: (sample: { fps: number; frameTimeMs: number }) => void }) {
  const elapsedRef = useRef(0)
  const framesRef = useRef(0)
  useFrame((_, delta) => {
    elapsedRef.current += delta
    framesRef.current += 1
    if (elapsedRef.current < 1) return
    const fps = framesRef.current / elapsedRef.current
    onPerformanceChange({ fps, frameTimeMs: 1000 / Math.max(fps, 0.01) })
    elapsedRef.current = 0
    framesRef.current = 0
  })
  return null
}

function CameraRig({
  cameraView,
  onCameraStateChange,
  captureScreenshotSignal,
  onScreenshotCaptured,
}: {
  cameraView: ThreeSceneViewportProps['cameraView']
  onCameraStateChange: NonNullable<ThreeSceneViewportProps['onCameraStateChange']> | null
  captureScreenshotSignal: number
  onScreenshotCaptured: NonNullable<ThreeSceneViewportProps['onScreenshotCaptured']> | null
}) {
  const { camera, controls, gl } = useThree()
  const reportElapsed = useRef(0)
  useEffect(() => {
    if (!cameraView) return
    camera.position.fromArray(cameraView.position)
    if ('fov' in camera) {
      camera.fov = cameraView.fov
      camera.updateProjectionMatrix()
    }
    const orbit = controls as { target?: Vector3; update?: () => void } | null
    if (cameraView.target && orbit?.target) orbit.target.fromArray(cameraView.target)
    orbit?.update?.()
  }, [camera, cameraView, controls])
  useEffect(() => {
    if (!captureScreenshotSignal || !onScreenshotCaptured) return
    gl.domElement.toBlob((blob) => { if (blob) onScreenshotCaptured(blob) }, 'image/webp', 0.86)
  }, [captureScreenshotSignal, gl, onScreenshotCaptured])
  useFrame((_, delta) => {
    if (!onCameraStateChange) return
    reportElapsed.current += delta
    if (reportElapsed.current < 0.35) return
    reportElapsed.current = 0
    const orbit = controls as { target?: Vector3 } | null
    const target = orbit?.target ?? camera.getWorldDirection(new Vector3()).add(camera.position)
    onCameraStateChange({
      position: camera.position.toArray() as [number, number, number],
      target: target.toArray() as [number, number, number],
      fov: 'fov' in camera ? camera.fov : 50,
    })
  })
  return null
}

function WalkController({
  active,
  collider,
  speed,
  spawn,
  bounds,
  onRecover,
}: {
  active: boolean
  collider: Group | null
  speed: number
  spawn: [number, number, number]
  bounds: SpatialWorldManifest['bounds']
  onRecover: (() => void) | null
}) {
  const { camera } = useThree()
  const keys = useRef(new Set<string>())
  const velocityY = useRef(0)
  const raycaster = useMemo(() => new Raycaster(), [])
  const forward = useMemo(() => new Vector3(), [])
  const right = useMemo(() => new Vector3(), [])
  const movement = useMemo(() => new Vector3(), [])
  const down = useMemo(() => new Vector3(0, -1, 0), [])

  useEffect(() => {
    if (!active) return
    const keyDown = (event: KeyboardEvent) => keys.current.add(event.code)
    const keyUp = (event: KeyboardEvent) => keys.current.delete(event.code)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    return () => {
      keys.current.clear()
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    camera.position.fromArray(spawn)
    velocityY.current = 0
  }, [active, camera, spawn])

  useFrame((_, delta) => {
    if (!active) return
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    right.crossVectors(forward, camera.up).normalize()
    movement.set(0, 0, 0)
    if (keys.current.has('KeyW') || keys.current.has('ArrowUp')) movement.add(forward)
    if (keys.current.has('KeyS') || keys.current.has('ArrowDown')) movement.sub(forward)
    if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) movement.add(right)
    if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) movement.sub(right)
    if (movement.lengthSq() > 0) movement.normalize().multiplyScalar(speed * delta)
    const candidate = camera.position.clone().add(movement)
    if (collider && movement.lengthSq() > 0) {
      raycaster.set(camera.position, movement.clone().normalize())
      raycaster.far = Math.max(0.45, movement.length() + 0.35)
      if (raycaster.intersectObject(collider, true).length === 0) camera.position.x = candidate.x, camera.position.z = candidate.z
    } else {
      camera.position.x = candidate.x
      camera.position.z = candidate.z
    }
    velocityY.current -= 12 * delta
    camera.position.y += velocityY.current * delta
    if (collider) {
      raycaster.set(camera.position, down)
      raycaster.far = 3
      const ground = raycaster.intersectObject(collider, true)[0]
      if (ground && ground.distance < 1.75) {
        camera.position.y += 1.7 - ground.distance
        velocityY.current = 0
      }
    }
    const tuple = camera.position.toArray() as [number, number, number]
    if (isSpatialWorldPositionOutOfBounds(tuple, bounds)) {
      camera.position.fromArray(spawn)
      velocityY.current = 0
      onRecover?.()
    }
  })
  return active ? <PointerLockControls makeDefault /> : null
}

function SpatialMarkers({
  markers,
  selectedMarkerId,
  onMarkerSelect,
  onMarkerMove,
}: {
  markers: SpatialWorldMarker[]
  selectedMarkerId: string | null
  onMarkerSelect: NonNullable<ThreeSceneViewportProps['onMarkerSelect']> | null
  onMarkerMove: NonNullable<ThreeSceneViewportProps['onMarkerMove']> | null
}) {
  return markers.filter((marker) => marker.visible).map((marker) => {
    const color = marker.kind === 'entry_point' ? '#5eead4' : marker.kind === 'camera_viewpoint' ? '#f6c177' : marker.kind === 'canon_anchor' ? '#8fb4ff' : '#d7dee8'
    const markerMesh = (
      <mesh onClick={(event) => { event.stopPropagation(); onMarkerSelect?.(marker.id) }}>
        <octahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.28} />
        <Html center distanceFactor={10} position={[0, 0.35, 0]}><button className="spatial-marker-label" type="button" onClick={() => onMarkerSelect?.(marker.id)}>{marker.name}</button></Html>
      </mesh>
    )
    if (marker.id !== selectedMarkerId || !onMarkerMove) return <group key={marker.id} position={marker.transform.position} rotation={marker.transform.rotation} scale={marker.transform.scale}>{markerMesh}</group>
    return (
      <TransformControls
        key={marker.id}
        mode="translate"
        position={marker.transform.position}
        rotation={marker.transform.rotation}
        scale={marker.transform.scale}
        onObjectChange={(event) => {
          const object = (event?.target as unknown as { object?: { position: Vector3 } } | null)?.object
          if (!object) return
          onMarkerMove(marker.id, object.position.toArray() as [number, number, number])
        }}
      >{markerMesh}</TransformControls>
    )
  })
}

function FloorPlane() {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, -0.001, 0]}>
      <planeGeometry args={[32, 32]} />
      <shadowMaterial opacity={0.28} />
    </mesh>
  )
}

function compiledPartGeometry(part: CompiledMeshPart) {
  const geometry = new BufferGeometry()

  if (part.kind === 'line') {
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(part.linePoints), 3))
    return geometry
  }

  geometry.setAttribute('position', new BufferAttribute(new Float32Array(part.positions), 3))
  if (part.normals.length > 0) {
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(part.normals), 3))
  } else {
    geometry.computeVertexNormals()
  }
  geometry.setIndex(part.indices)
  return geometry
}

function CompiledPartView({ part }: { part: CompiledMeshPart }) {
  const geometry = useMemo(() => compiledPartGeometry(part), [part])
  const useFlatShading = part.kind !== 'line' && (part.metadata.solidKind === 'boolean_result' || part.metadata.solidKind === 'bridge_room')
  const doubleSidedKinds = new Set(['wall_shell', 'roof', 'slab', 'landing'])
  const lineObject = useMemo(
    () => (part.kind === 'line' ? new Line(geometry, new LineBasicMaterial({ color: part.color })) : null),
    [geometry, part.color, part.kind],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      lineObject?.material.dispose()
    },
    [geometry, lineObject],
  )

  if (part.kind === 'line') {
    return lineObject ? <primitive object={lineObject} /> : null
  }

  return (
    <mesh castShadow receiveShadow geometry={geometry}>
      <meshStandardMaterial
        color={part.color}
        flatShading={useFlatShading}
        metalness={part.kind === 'debug' ? 0.15 : 0.08}
        opacity={part.kind === 'debug' ? 0.92 : 1}
        roughness={part.kind === 'surface' ? 0.7 : 0.56}
        side={typeof part.metadata.solidKind === 'string' && doubleSidedKinds.has(part.metadata.solidKind) ? DoubleSide : undefined}
        transparent={part.kind === 'debug'}
      />
    </mesh>
  )
}

function CompiledEnvironmentView({ model }: { model: CompiledEnvironmentModel }) {
  return (
    <group>
      {model.parts.map((part) => (
        <CompiledPartView key={part.id} part={part} />
      ))}
    </group>
  )
}

function ProxyModel({ kind, subtype }: { kind: 'character' | 'environment'; subtype: string }) {
  if (kind === 'environment') {
    return (
      <mesh castShadow receiveShadow position={[0, 0.92, 0]}>
        <boxGeometry args={[2.2, 1.84, 2.2]} />
        <meshStandardMaterial color="#7f92a6" roughness={0.58} metalness={0.08} />
      </mesh>
    )
  }

  const materialProps = useMemo(() => {
    if (subtype === 'spirit') return { color: '#8bf6df', emissive: '#57d7c0', emissiveIntensity: 0.35, roughness: 0.12, metalness: 0.08 }
    if (subtype === 'undead') return { color: '#d2e7d5', emissive: '#608e72', emissiveIntensity: 0.08, roughness: 0.72, metalness: 0.08 }
    if (subtype === 'vehicle') return { color: '#8fa5c3', roughness: 0.36, metalness: 0.34 }
    if (subtype === 'construct') return { color: '#aab8cc', roughness: 0.28, metalness: 0.52 }
    if (subtype === 'beast') return { color: '#d0a56d', roughness: 0.74, metalness: 0.06 }
    return { color: '#84c7bf', roughness: 0.46, metalness: 0.12 }
  }, [subtype])

  if (subtype === 'vehicle') {
    return (
      <group position={[0, 0.65, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
          <boxGeometry args={[2.2, 0.7, 1.3]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 1.08, 0]}>
          <boxGeometry args={[1.1, 0.45, 1]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
        {[-0.8, 0.8].flatMap((x) => [-0.52, 0.52].map((z) => (
          <mesh castShadow receiveShadow key={`${x}-${z}`} position={[x, 0.22, z]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.24, 0.24, 0.24, 20]} />
            <meshStandardMaterial color="#202734" roughness={0.9} metalness={0.08} />
          </mesh>
        )))}
      </group>
    )
  }

  if (subtype === 'beast') {
    return (
      <group position={[0, 0.58, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.46, 0]}>
          <capsuleGeometry args={[0.38, 1.25, 6, 14]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
        <mesh castShadow receiveShadow position={[0.88, 0.65, 0]}>
          <sphereGeometry args={[0.34, 24, 24]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      </group>
    )
  }

  if (subtype === 'construct') {
    return (
      <mesh castShadow receiveShadow position={[0, 1.05, 0]}>
        <octahedronGeometry args={[0.92, 0]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
    )
  }

  if (subtype === 'spirit') {
    return (
      <mesh castShadow receiveShadow position={[0, 1.15, 0]}>
        <icosahedronGeometry args={[0.92, 1]} />
        <meshStandardMaterial transparent opacity={0.92} {...materialProps} />
      </mesh>
    )
  }

  if (subtype === 'undead') {
    return (
      <mesh castShadow receiveShadow position={[0, 1.05, 0]}>
        <torusKnotGeometry args={[0.58, 0.2, 120, 18]} />
        <meshStandardMaterial {...materialProps} />
      </mesh>
    )
  }

  return (
    <mesh castShadow receiveShadow position={[0, 1.1, 0]}>
      <capsuleGeometry args={[0.44, 1.45, 8, 18]} />
      <meshStandardMaterial {...materialProps} />
    </mesh>
  )
}

function SceneContents({
  compiledEnvironment,
  fitKey,
  loadedScene,
  colliderScene,
  modelKind,
  modelSubtype,
  showFloor,
  showGrid,
  spatialWorldSourceUrl,
  spatialWorldTransform,
  renderMode,
  onSpatialLoadStateChange,
  navigationMode,
  walkSpeed,
  spawnPosition,
  spatialBounds,
  markers,
  selectedMarkerId,
  markerPlacementKind,
  showColliderDebug,
  cameraView,
  onMarkerSelect,
  onMarkerMove,
  onMarkerPlace,
  onCameraStateChange,
  onWalkRecovery,
  captureScreenshotSignal,
  onScreenshotCaptured,
}: {
  compiledEnvironment: CompiledEnvironmentModel | null
  fitKey: string
  loadedScene: LoadedSceneState
  colliderScene: LoadedSceneState
  modelKind: 'character' | 'environment'
  modelSubtype: string
  showFloor: boolean
  showGrid: boolean
  spatialWorldSourceUrl: string | null
  spatialWorldTransform: NonNullable<ThreeSceneViewportProps['spatialWorldTransform']>
  renderMode: NonNullable<ThreeSceneViewportProps['renderMode']>
  onSpatialLoadStateChange: (state: SpatialLoadState) => void
  navigationMode: 'orbit' | 'walk'
  walkSpeed: number
  spawnPosition: [number, number, number]
  spatialBounds: SpatialWorldManifest['bounds']
  markers: SpatialWorldMarker[]
  selectedMarkerId: string | null
  markerPlacementKind: SpatialWorldMarker['kind'] | null
  showColliderDebug: boolean
  cameraView: ThreeSceneViewportProps['cameraView']
  onMarkerSelect: NonNullable<ThreeSceneViewportProps['onMarkerSelect']> | null
  onMarkerMove: NonNullable<ThreeSceneViewportProps['onMarkerMove']> | null
  onMarkerPlace: NonNullable<ThreeSceneViewportProps['onMarkerPlace']> | null
  onCameraStateChange: NonNullable<ThreeSceneViewportProps['onCameraStateChange']> | null
  onWalkRecovery: (() => void) | null
  captureScreenshotSignal: number
  onScreenshotCaptured: NonNullable<ThreeSceneViewportProps['onScreenshotCaptured']> | null
}) {
  const fogArgs = modelKind === 'environment'
    ? ['#0c121b', 48, 140] as const
    : ['#0c121b', 12, 28] as const
  const maxDistance = modelKind === 'environment' ? 120 : 30
  const showSpatialWorld = Boolean(spatialWorldSourceUrl) && (renderMode === 'spatial_world' || renderMode === 'hybrid')
  const showMeshWorld = renderMode === 'mesh' || renderMode === 'hybrid' || !showSpatialWorld

  return (
    <>
      <color attach="background" args={['#0c121b']} />
      <fog attach="fog" args={fogArgs} />
      <ambientLight intensity={0.7} />
      <hemisphereLight intensity={0.8} color="#f5f7ff" groundColor="#1a1f29" />
      <directionalLight
        castShadow
        intensity={1.8}
        position={[5.5, 9, 6.5]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      {showFloor ? <FloorPlane /> : null}
      {showGrid ? (
        <Grid
          position={[0, 0.002, 0]}
          args={[12, 12]}
          cellSize={0.5}
          cellThickness={0.7}
          cellColor="#2d3d55"
          sectionSize={2}
          sectionThickness={1.2}
          sectionColor="#5eead4"
          fadeDistance={18}
          fadeStrength={1}
        />
      ) : null}
      <Bounds fit clip margin={1.2}>
        <FitBounds fitKey={fitKey} />
        {showSpatialWorld && spatialWorldSourceUrl ? (
          <SpatialWorldView sourceUrl={spatialWorldSourceUrl} transform={spatialWorldTransform} onLoadStateChange={onSpatialLoadStateChange} />
        ) : null}
        {showMeshWorld && (compiledEnvironment
          ? <CompiledEnvironmentView model={compiledEnvironment} />
          : loadedScene.status === 'ready'
            ? <primitive object={loadedScene.scene} />
            : !showSpatialWorld ? <ProxyModel kind={modelKind} subtype={modelSubtype} /> : null)}
        {colliderScene.status === 'ready' ? (
          <primitive
            object={colliderScene.scene}
            position={spatialWorldTransform.position}
            rotation={spatialWorldTransform.rotation}
            scale={spatialWorldTransform.scale}
            visible={showColliderDebug}
            onDoubleClick={(event: { stopPropagation: () => void; point: Vector3 }) => {
              if (!markerPlacementKind || !onMarkerPlace) return
              event.stopPropagation()
              onMarkerPlace(event.point.toArray() as [number, number, number])
            }}
          />
        ) : null}
        <SpatialMarkers markers={markers} selectedMarkerId={selectedMarkerId} onMarkerSelect={onMarkerSelect} onMarkerMove={onMarkerMove} />
      </Bounds>
      {navigationMode === 'orbit' ? (
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={1.8} maxDistance={maxDistance} maxPolarAngle={Math.PI / 2.05} />
      ) : null}
      <WalkController active={navigationMode === 'walk'} collider={colliderScene.status === 'ready' ? colliderScene.scene : null} speed={walkSpeed} spawn={spawnPosition} bounds={spatialBounds} onRecover={onWalkRecovery} />
      <CameraRig cameraView={cameraView} onCameraStateChange={onCameraStateChange} captureScreenshotSignal={captureScreenshotSignal} onScreenshotCaptured={onScreenshotCaptured} />
    </>
  )
}

export function ThreeSceneViewport({
  compiledEnvironment = null,
  meshSourceUrl,
  colliderSourceUrl = null,
  spatialWorldSourceUrl = null,
  spatialWorldTransform = null,
  renderMode = 'mesh',
  navigationMode = 'orbit',
  walkSpeed = 3.2,
  spawnPosition = [0, 1.7, 0],
  spatialBounds = null,
  markers = [],
  selectedMarkerId = null,
  markerPlacementKind = null,
  showColliderDebug = false,
  cameraView = null,
  captureScreenshotSignal = 0,
  modelKind,
  modelLabel,
  modelSubtype,
  showFloor,
  showGrid,
  resetSignal,
  onMeshLoadStateChange = null,
  onSpatialLoadStateChange = null,
  onPerformanceChange = null,
  onMarkerSelect = null,
  onMarkerMove = null,
  onMarkerPlace = null,
  onCameraStateChange = null,
  onWalkRecovery = null,
  onScreenshotCaptured = null,
}: ThreeSceneViewportProps) {
  const loadedScene = useLoadedScene(meshSourceUrl, modelKind)
  const colliderScene = useLoadedScene(colliderSourceUrl, 'environment', false)
  const [spatialState, setSpatialState] = useState<SpatialLoadState>({ status: 'idle', progress: 0, splatCount: null, error: null })
  const fitKey = `${modelLabel}:${modelSubtype}:${renderMode}:${spatialWorldSourceUrl ?? compiledEnvironment?.graphKey ?? meshSourceUrl ?? 'proxy'}:${spatialState.status}:${spatialState.splatCount ?? 0}:${resetSignal}`
  const resolvedSpatialTransform = spatialWorldTransform ?? { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  const reportSpatialState = useCallback((state: SpatialLoadState) => {
    setSpatialState(state)
    onSpatialLoadStateChange?.(state)
  }, [onSpatialLoadStateChange])

  useEffect(() => {
    onMeshLoadStateChange?.(loadedScene)
  }, [loadedScene, onMeshLoadStateChange])

  return (
    <div className="three-scene-shell">
      <div className="canvas-stage three-scene-canvas">
        <Canvas camera={{ position: [4.8, 3.8, 5.4], fov: 48 }} fallback={<div className="three-scene-webgl-fallback" role="alert">This device could not start the WebGL spatial viewer. Mesh and metadata tools remain available.</div>} gl={{ preserveDrawingBuffer: true }} shadows dpr={[1, 2]}>
          <SceneContents
            compiledEnvironment={compiledEnvironment}
            fitKey={fitKey}
            loadedScene={loadedScene}
            colliderScene={colliderScene}
            modelKind={modelKind}
            modelSubtype={modelSubtype}
            showFloor={showFloor}
            showGrid={showGrid}
            spatialWorldSourceUrl={spatialWorldSourceUrl}
            spatialWorldTransform={resolvedSpatialTransform}
            renderMode={renderMode}
            onSpatialLoadStateChange={reportSpatialState}
            navigationMode={navigationMode}
            walkSpeed={walkSpeed}
            spawnPosition={spawnPosition}
            spatialBounds={spatialBounds}
            markers={markers}
            selectedMarkerId={selectedMarkerId}
            markerPlacementKind={markerPlacementKind}
            showColliderDebug={showColliderDebug}
            cameraView={cameraView}
            onMarkerSelect={onMarkerSelect}
            onMarkerMove={onMarkerMove}
            onMarkerPlace={onMarkerPlace}
            onCameraStateChange={onCameraStateChange}
            onWalkRecovery={onWalkRecovery}
            captureScreenshotSignal={captureScreenshotSignal}
            onScreenshotCaptured={onScreenshotCaptured}
          />
          {onPerformanceChange ? <PerformanceProbe onPerformanceChange={onPerformanceChange} /> : null}
        </Canvas>
      </div>
    </div>
  )
}
