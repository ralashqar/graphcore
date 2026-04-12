import { useEffect, useMemo, useState } from 'react'
import { Bounds, Grid, OrbitControls, useBounds } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Group, Line, LineBasicMaterial, Mesh, MeshStandardMaterial, Vector3 } from 'three'

import type { CompiledEnvironmentModel, CompiledMeshPart } from '../../domain/environmentAssembly'

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
  modelKind: 'character' | 'environment'
  modelLabel: string
  modelSubtype: string
  showFloor: boolean
  showGrid: boolean
  resetSignal: number
  onMeshLoadStateChange?: ((state: LoadedSceneState) => void) | null
}

type LoadedSceneState =
  | { status: 'idle'; scene: null; error: null }
  | { status: 'loading'; scene: null; error: null }
  | { status: 'ready'; scene: Group; error: null }
  | { status: 'error'; scene: null; error: string }

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

function useLoadedScene(meshSourceUrl: string | null, modelKind: 'character' | 'environment'): LoadedSceneState {
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
        if (modelKind === 'character') {
          const height = bounds.max.y - bounds.min.y
          if (Number.isFinite(height) && height > 0.001) {
            const scale = targetCharacterMeshHeight / height
            root.scale.setScalar(scale)
            bounds = new Box3().setFromObject(root)
          }
        }
        const center = bounds.getCenter(new Vector3())
        root.position.sub(center)
        root.position.y -= bounds.min.y
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
  }, [meshSourceUrl, modelKind])

  return state
}

function FitBounds({ fitKey }: { fitKey: string }) {
  const bounds = useBounds()

  useEffect(() => {
    bounds.refresh().clip().fit()
  }, [bounds, fitKey])

  return null
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
  modelKind,
  modelSubtype,
  showFloor,
  showGrid,
}: {
  compiledEnvironment: CompiledEnvironmentModel | null
  fitKey: string
  loadedScene: LoadedSceneState
  modelKind: 'character' | 'environment'
  modelSubtype: string
  showFloor: boolean
  showGrid: boolean
}) {
  const fogArgs = modelKind === 'environment'
    ? ['#0c121b', 48, 140] as const
    : ['#0c121b', 12, 28] as const
  const maxDistance = modelKind === 'environment' ? 120 : 30

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
        {compiledEnvironment
          ? <CompiledEnvironmentView model={compiledEnvironment} />
          : loadedScene.status === 'ready'
            ? <primitive object={loadedScene.scene} />
            : <ProxyModel kind={modelKind} subtype={modelSubtype} />}
      </Bounds>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={1.8}
        maxDistance={maxDistance}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  )
}

export function ThreeSceneViewport({
  compiledEnvironment = null,
  meshSourceUrl,
  modelKind,
  modelLabel,
  modelSubtype,
  showFloor,
  showGrid,
  resetSignal,
  onMeshLoadStateChange = null,
}: ThreeSceneViewportProps) {
  const loadedScene = useLoadedScene(meshSourceUrl, modelKind)
  const fitKey = `${modelLabel}:${modelSubtype}:${compiledEnvironment?.graphKey ?? meshSourceUrl ?? 'proxy'}:${resetSignal}`

  useEffect(() => {
    onMeshLoadStateChange?.(loadedScene)
  }, [loadedScene, onMeshLoadStateChange])

  return (
    <div className="three-scene-shell">
      <div className="canvas-stage three-scene-canvas">
        <Canvas camera={{ position: [4.8, 3.8, 5.4], fov: 48 }} shadows dpr={[1, 2]}>
          <SceneContents
            compiledEnvironment={compiledEnvironment}
            fitKey={fitKey}
            loadedScene={loadedScene}
            modelKind={modelKind}
            modelSubtype={modelSubtype}
            showFloor={showFloor}
            showGrid={showGrid}
          />
        </Canvas>
      </div>
    </div>
  )
}
