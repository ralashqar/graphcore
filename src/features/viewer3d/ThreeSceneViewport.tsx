import { useEffect, useMemo, useState } from 'react'
import { Bounds, Grid, OrbitControls, useBounds } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'

type ThreeSceneViewportProps = {
  meshSourceUrl: string | null
  modelLabel: string
  modelSubtype: string
  showFloor: boolean
  showGrid: boolean
  resetSignal: number
}

type LoadedSceneState =
  | { status: 'idle'; scene: null; error: null }
  | { status: 'loading'; scene: null; error: null }
  | { status: 'ready'; scene: Group; error: null }
  | { status: 'error'; scene: null; error: string }

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

function useLoadedScene(meshSourceUrl: string | null): LoadedSceneState {
  const [state, setState] = useState<LoadedSceneState>({ status: 'idle', scene: null, error: null })

  useEffect(() => {
    if (!meshSourceUrl) {
      setState({ status: 'idle', scene: null, error: null })
      return
    }

    let isActive = true
    const loader = new GLTFLoader()
    setState({ status: 'loading', scene: null, error: null })

    loader.load(
      meshSourceUrl,
      (gltf) => {
        if (!isActive) return
        const root = (gltf.scene || gltf.scenes[0])?.clone(true)
        if (!root) {
          setState({ status: 'error', scene: null, error: 'Loaded mesh had no scene root.' })
          return
        }

        configureSceneShadows(root)
        const bounds = new Box3().setFromObject(root)
        const center = bounds.getCenter(new Vector3())
        root.position.sub(center)
        root.position.y -= bounds.min.y
        setState({ status: 'ready', scene: root, error: null })
      },
      undefined,
      (error) => {
        if (!isActive) return
        const message = error instanceof Error ? error.message : 'Mesh preview failed to load.'
        setState({ status: 'error', scene: null, error: message })
      },
    )

    return () => {
      isActive = false
    }
  }, [meshSourceUrl])

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

function ProxyModel({ subtype }: { subtype: string }) {
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
  fitKey,
  loadedScene,
  modelSubtype,
  showFloor,
  showGrid,
}: {
  fitKey: string
  loadedScene: LoadedSceneState
  modelSubtype: string
  showFloor: boolean
  showGrid: boolean
}) {
  return (
    <>
      <color attach="background" args={['#0c121b']} />
      <fog attach="fog" args={['#0c121b', 12, 28]} />
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
      <Bounds fit clip observe margin={1.2}>
        <FitBounds fitKey={fitKey} />
        {loadedScene.status === 'ready' ? <primitive object={loadedScene.scene} /> : <ProxyModel subtype={modelSubtype} />}
      </Bounds>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={1.8}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  )
}

export function ThreeSceneViewport({
  meshSourceUrl,
  modelLabel,
  modelSubtype,
  showFloor,
  showGrid,
  resetSignal,
}: ThreeSceneViewportProps) {
  const loadedScene = useLoadedScene(meshSourceUrl)
  const fitKey = `${modelLabel}:${modelSubtype}:${meshSourceUrl ?? 'proxy'}:${resetSignal}`

  return (
    <div className="three-scene-shell">
      <div className="canvas-stage three-scene-canvas">
        <Canvas camera={{ position: [4.8, 3.8, 5.4], fov: 48 }} shadows dpr={[1, 2]}>
          <SceneContents
            fitKey={fitKey}
            loadedScene={loadedScene}
            modelSubtype={modelSubtype}
            showFloor={showFloor}
            showGrid={showGrid}
          />
        </Canvas>
      </div>
      <div className="three-scene-status">
        <span className="section-label">Viewport</span>
        <strong>
          {loadedScene.status === 'loading'
            ? 'Loading mesh...'
            : loadedScene.status === 'ready'
              ? 'Mesh preview active'
              : meshSourceUrl
                ? 'Proxy fallback active'
                : 'Proxy preview active'}
        </strong>
        <span>
          {loadedScene.status === 'error'
            ? loadedScene.error
            : loadedScene.status === 'ready'
              ? modelLabel
              : `Showing a generated ${modelSubtype} placeholder until a mesh is bound.`}
        </span>
      </div>
    </div>
  )
}
