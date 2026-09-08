import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder'
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader'
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import '@babylonjs/loaders/glTF/2.0/glTFLoader'
import '@babylonjs/loaders/glTF/glTFFileLoader'
import '@babylonjs/loaders/glTF/2.0/Extensions/EXT_texture_webp'
import { type GameBuildManifest, type PrefabSpec } from '../domain/game/contracts.ts'
import { initialGameState, movePlayer, interact, nearestInteraction, restoreGameState, type GameState, type GameplayEvent } from '../domain/game/simulation.ts'

export type GamePlayer = { dispose: () => void; state: () => GameState; save: () => GameState; restore: (input: unknown) => void; restart: () => void; pause: (paused: boolean) => void; metrics: () => { fps: number; meshes: number; vertices: number; playedClips: string[] } }
export async function createGamePlayer(canvas: HTMLCanvasElement, manifest: GameBuildManifest, options: {
  assetUrls?: Record<string, string>; onUpdate?: (state: GameState, target: string | null) => void;
  onEvent?: (event: GameplayEvent) => void; onError?: (message: string) => void;
} = {}): Promise<GamePlayer> {
  const d = manifest.design, engine = new Engine(canvas, true, { stencil: true }), scene = new Scene(engine)
  scene.clearColor = Color4.FromHexString(`${d.style.sky}ff`)
  const light = new HemisphericLight('sky', new Vector3(0, 1, 0), scene); light.intensity = .85
  const sun = new DirectionalLight('sun', new Vector3(-.4, -1, .3), scene); sun.intensity = .65
  const camera = new ArcRotateCamera('camera', -Math.PI / 2, .78, 10, Vector3.Zero(), scene)
  camera.lowerRadiusLimit = 5; camera.upperRadiusLimit = 16; camera.upperBetaLimit = 1.25; camera.lowerBetaLimit = .3
  camera.attachControl(canvas, true); camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput')
  canvas.tabIndex = 0
  const material = (name: string, hex: string) => { const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(hex); m.specularColor = new Color3(.08, .08, .08); return m }
  const ground = CreateGround('ground', { width: d.level.width, height: d.level.depth }, scene); ground.material = material('ground', d.style.ground)
  const make = (p: PrefabSpec, name: string) => {
    const mesh = p.role === 'player' || p.role === 'npc' ? CreateCapsule(name, { height: p.size.y, radius: p.size.x / 2 }, scene)
      : p.role === 'goal' ? CreateCylinder(name, { height: .12, diameter: 1.7 }, scene)
        : CreateBox(name, { width: p.size.x, height: p.size.y, depth: p.size.z }, scene)
    mesh.material = material(`${name}.material`, p.color); mesh.position.y = p.role === 'goal' ? .06 : p.size.y / 2
    return mesh
  }
  const playerPrefab = d.prefabs.find(p => p.role === 'player')!, avatar = new TransformNode('player', scene), playerPlaceholder = make(playerPrefab, 'player.placeholder')
  playerPlaceholder.parent = avatar
  const entities = new Map<string, TransformNode>()
  const imports: Promise<unknown>[] = []
  const animated: { role: string; clips: AnimationGroup[]; active: string }[] = []
  const playedClips = new Set<string>()
  const importAsset = (p: PrefabSpec, root: TransformNode, placeholder: ReturnType<typeof make>) => {
    const url = p.assetRecipeKey ? options.assetUrls?.[p.assetRecipeKey] : null
    if (!url) return
    imports.push((async () => {
      const imported = await SceneLoader.ImportMeshAsync('', '', url, scene, undefined, '.glb')
      if (scene.isDisposed) return
      const importedRoot = new TransformNode(`${root.name}.asset`, scene)
      for (const mesh of imported.meshes) if (!mesh.parent) mesh.parent = importedRoot
      const bounds = importedRoot.getHierarchyBoundingVectors(true), size = bounds.max.subtract(bounds.min)
      const scale = Math.min(p.size.x / Math.max(.001, size.x), p.size.y / Math.max(.001, size.y), p.size.z / Math.max(.001, size.z))
      importedRoot.scaling.setAll(scale); importedRoot.position.set(-(bounds.max.x + bounds.min.x) * scale / 2, -bounds.min.y * scale, -(bounds.max.z + bounds.min.z) * scale / 2); importedRoot.parent = root
      imported.animationGroups.forEach(group => group.stop())
      if (p.role === 'player' && !['Idle', 'Walk'].every(name => imported.animationGroups.some(group => group.name.includes(name)))) throw new Error('Player rig requires Idle and Walk clips')
      animated.push({ role: p.role, clips: imported.animationGroups, active: '' })
      placeholder.dispose()
    })().catch(error => { options.onError?.(`Asset ${p.assetRecipeKey}: ${error instanceof Error ? error.message : String(error)}`); throw error }))
  }
  importAsset(playerPrefab, avatar, playerPlaceholder)
  for (const instance of d.level.instances) {
    const p = d.prefabs.find(p => p.key === instance.prefabKey)!, root = new TransformNode(instance.key, scene), placeholder = make(p, instance.key + '.placeholder')
    placeholder.parent = root; root.position.set(instance.position.x, instance.position.y, instance.position.z); root.rotation.y = instance.rotationY; entities.set(instance.key, root)
    importAsset(p, root, placeholder)
  }
  let state = initialGameState(manifest), paused = false, disposed = false, accumulator = 0, lastUpdate = 0, moving = false
  const keys = new Set<string>()
  const publish = () => { const target = nearestInteraction(d, state); options.onUpdate?.(structuredClone(state), target ? d.prefabs.find(p => p.key === target.prefabKey)?.label ?? null : null) }
  const down = (e: KeyboardEvent) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
    keys.add(e.code)
    if (e.code === 'KeyE' && !e.repeat && !paused) { const target = nearestInteraction(d, state); if (target) { const result = interact(d, state, target.key); state = result.state; options.onEvent?.(result.event); publish() } }
  }
  const up = (e: KeyboardEvent) => keys.delete(e.code), blur = () => keys.clear(), resize = () => engine.resize()
  canvas.addEventListener('keydown', down); canvas.addEventListener('keyup', up); window.addEventListener('blur', blur); window.addEventListener('resize', resize)
  const sync = () => {
    avatar.position.x = state.position.x; avatar.position.z = state.position.z
    camera.target.copyFromFloats(state.position.x, 1, state.position.z)
    for (const i of d.level.instances) { const p = d.prefabs.find(p => p.key === i.prefabKey)!, root = entities.get(i.key)!; root.setEnabled(!state.picked.includes(i.key) && !(p.role === 'door' && state.doorOpen)) }
    for (const animation of animated) {
      const wanted = animation.role === 'player' && moving && !paused && !state.complete ? 'Walk' : 'Idle'
      if (animation.active !== wanted) { animation.clips.forEach(clip => clip.stop()); const clip = animation.clips.find(clip => clip.name.includes(wanted)); clip?.start(true); if (clip) playedClips.add(`${animation.role}.${wanted}`); animation.active = wanted }
    }
  }
  engine.runRenderLoop(() => {
    if (disposed) return
    accumulator += Math.min(engine.getDeltaTime() / 1000, .1)
    while (accumulator >= 1 / 60) {
      if (!paused && !state.complete) {
        const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))
        const sideways = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
        // Use camera azimuth directly; the previous frame's camera position can lag its moving target.
        const look = new Vector3(-Math.cos(camera.alpha), 0, -Math.sin(camera.alpha))
        const right = new Vector3(look.z, 0, -look.x)
        const before = state.position
        state = movePlayer(d, state, { x: look.x * forward + right.x * sideways, z: look.z * forward + right.z * sideways, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') }, 1 / 60)
        moving = Math.hypot(before.x - state.position.x, before.z - state.position.z) > .001
        if (forward || sideways) avatar.rotation.y = Math.atan2(look.x * forward + right.x * sideways, look.z * forward + right.z * sideways)
      }
      accumulator -= 1 / 60
    }
    sync(); scene.render()
    if (performance.now() - lastUpdate > 100) { publish(); lastUpdate = performance.now() }
  })
  const dispose = () => { disposed = true; canvas.removeEventListener('keydown', down); canvas.removeEventListener('keyup', up); window.removeEventListener('blur', blur); window.removeEventListener('resize', resize); engine.stopRenderLoop(); scene.dispose(); engine.dispose() }
  try { await Promise.all(imports); await scene.whenReadyAsync(); publish() } catch (error) { dispose(); throw error }
  return { dispose, state: () => structuredClone(state), save: () => structuredClone(state), restore: input => { state = restoreGameState(manifest, input); sync(); publish() }, restart: () => { state = initialGameState(manifest); keys.clear(); publish() }, pause: value => { paused = value; keys.clear() }, metrics: () => ({ fps: engine.getFps(), meshes: scene.meshes.length, vertices: scene.getTotalVertices(), playedClips: [...playedClips] }) }
}
