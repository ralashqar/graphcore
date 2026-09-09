import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import type { AssetContainer } from '@babylonjs/core/assetContainer'
import type { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector'
import '@babylonjs/loaders/glTF'
import { locomotionWeights, advanceAnimationBlend, emptyAnimationBlend, type AnimationBlend, type AnimationState } from '../domain/game/v3/animationMixer'
import type { AnimationGraph } from '../domain/game/v3/animation'
import { of, type Manifest } from '../domain/game/v3/spec'
import type { Simulation, ActorState } from '../domain/game/v2/simulation'
import type { Animation } from '@babylonjs/core/Animations/animation'

type Track = { target: TransformNode; property: 'position' | 'rotationQuaternion' | 'scaling'; animation: Animation }
type Clip = { duration: number; loop: boolean; speed: number; tracks: Track[] }
export async function animationVisuals(scene: Scene, manifest: Manifest, urls: Record<string, string>) {
  const actors = new Map<string, { root: TransformNode; clips: Map<AnimationState, Clip>; transitions: AnimationGraph['transitions']; blend: AnimationBlend; previous: ActorState['position']; velocity: { x: number; z: number }; tick: number; mode: string; enteredFrom: string; elapsed: number; gait: number }>()
  const containers: AssetContainer[] = []
  const played = new Set<string>()
  const loops: Record<string, number> = {}
  let loaded = 0, expected = 0
  try {
    for (const instance of of(manifest.design, 'actor_instance')) {
      const graph = manifest.animations?.graphs.find(g => g.actorDefinition === instance.definition)
      if (!graph?.bindings.length) continue
      expected += graph.bindings.length
      const root = new TransformNode(`animated.${instance.id}`, scene), clips = new Map<AnimationState, Clip>()
      let targets: Map<string, TransformNode> | null = null
      for (const binding of graph.bindings) {
        const asset = manifest.assets.find(a => a.id === binding.clipRevision)
        if (!asset || asset.rigRevision !== graph.rigRevision || !urls[asset.recipeKey]) continue
        const container = await LoadAssetContainerAsync(urls[asset.recipeKey], scene, { pluginExtension: '.glb' })
        containers.push(container)
        container.animationGroups.forEach(g => g.stop())
        if (!targets) {
          container.addAllToScene()
          const nodes = [...container.transformNodes, ...container.meshes]
          targets = new Map(nodes.map(n => [n.name, n]))
          for (const node of nodes) if (!node.parent) node.parent = root
        }
        const tracks: Track[] = []
        for (const group of container.animationGroups) for (const track of group.targetedAnimations) {
          const target = targets.get(track.target.name), property = track.animation.targetProperty
          if (target && ['position', 'rotationQuaternion', 'scaling'].includes(property)) tracks.push({ target, property: property as Track['property'], animation: track.animation })
        }
        if (tracks.length) { clips.set(binding.state, { duration: asset.duration, loop: asset.loop, speed: asset.naturalSpeed, tracks }); loaded++ }
      }
      root.setEnabled(false)
      actors.set(instance.id, { root, clips, transitions: graph.transitions, blend: emptyAnimationBlend(), previous: { ...instance.position }, velocity: { x: 0, z: 0 }, tick: 0, mode: '', enteredFrom: '', elapsed: 0, gait: 0 })
    }
  } catch { containers.forEach(c => c.dispose()); actors.forEach(a => a.root.dispose()); return { update: () => new Set<string>(), metrics: () => ({ animationLoadFailed: true, animationBindings: 0, expectedAnimationBindings: expected, playedAnimations: [] as string[] }) } }
  scene.onDisposeObservable.add(() => containers.forEach(c => c.dispose()))
  return { metrics: () => ({ animationLoadFailed: loaded !== expected, animationBindings: loaded, expectedAnimationBindings: expected, playedAnimations: [...played], animationLoops: { ...loops } }), update(sim: Simulation) {
    const rendered = new Set<string>()
    for (const actor of sim.state.actors) {
      const visual = actors.get(actor.id)
      if (!visual) continue
      const tickDelta = sim.state.tick-visual.tick
      if (tickDelta < 0 || tickDelta > 6) { visual.previous = { ...actor.position }; visual.velocity = { x: 0, z: 0 }; visual.elapsed = 0; visual.gait = 0; visual.mode = ''; visual.enteredFrom = ''; visual.blend = emptyAnimationBlend() }
      const dt = Math.max(0, Math.min(.1, tickDelta/60))
      const velocity = dt ? { x: (actor.position.x-visual.previous.x)/dt, z: (actor.position.z-visual.previous.z)/dt } : visual.velocity
      visual.velocity = velocity
      visual.previous = { ...actor.position }; visual.tick = sim.state.tick
      visual.elapsed += dt
      if (visual.mode !== actor.mode) { visual.enteredFrom = visual.mode; visual.elapsed = 0; visual.mode = actor.mode }
      let state: AnimationState | null = null
      const ability = manifest.design.nodes.find(n => n.kind === 'ability' && n.id === actor.action?.ability)
      if (ability?.kind === 'ability' && ability.op === 'roll') state = 'roll'
      else if (actor.mode === 'climb') state = 'climb'
      else if (actor.mode === 'hang') state = visual.enteredFrom === 'air' && visual.elapsed < (visual.clips.get('catch')?.duration ?? 0) ? 'catch' : Math.abs(velocity.x) > .1 ? velocity.x < 0 ? 'shimmy_left' : 'shimmy_right' : 'hang'
      else if (actor.mode === 'air') state = actor.vy > 0 && visual.elapsed < Math.min(.2, visual.clips.get('takeoff')?.duration ?? 0) ? 'takeoff' : 'airborne'
      else if (actor.mode === 'ground' && visual.enteredFrom === 'air' && visual.elapsed < Math.min(.2, visual.clips.get('landing')?.duration ?? 0)) state = 'landing'
      const localX = velocity.x*Math.cos(actor.yaw)-velocity.z*Math.sin(actor.yaw), localZ = velocity.x*Math.sin(actor.yaw)+velocity.z*Math.cos(actor.yaw)
      visual.blend = advanceAnimationBlend(visual.blend, state ? { [state]: 1 } : locomotionWeights(localX, localZ), visual.transitions, dt)
      const weights = visual.blend.weights
      const supported = Object.entries(weights).filter(([s,w]) => w > .001 && visual.clips.has(s as AnimationState)) as Array<[AnimationState, number]>
      const total = supported.reduce((sum, [,w]) => sum+w, 0)
      const show = actor.health > 0 && total > .99 && !sim.interactions.poses.has(actor.id)
      visual.root.setEnabled(show)
      if (!show) continue
      const cycle = supported.reduce((sum, [s,w]) => sum + visual.clips.get(s)!.duration*w, 0)/total
      const naturalSpeed = supported.reduce((sum, [s,w]) => sum + visual.clips.get(s)!.speed*w, 0)/total
      const playbackRate = !state && naturalSpeed > .1 ? Math.max(.25, Math.min(2, Math.hypot(velocity.x, velocity.z)/naturalSpeed)) : 1
      const nextGait = visual.gait + dt*playbackRate/Math.max(.1, cycle)
      if (nextGait >= 1) for (const [name, weight] of supported) if (weight > .1 && visual.clips.get(name)!.loop) loops[`${actor.id}:${name}`] = (loops[`${actor.id}:${name}`] ?? 0)+1
      visual.gait = nextGait % 1
      const values = new Map<TransformNode, Map<string, { value: Vector3 | Quaternion; weight: number }>>()
      for (const [name, weight] of supported) {
        const clip = visual.clips.get(name)!, time = clip.loop ? visual.gait*clip.duration : Math.min(name === 'roll' ? (actor.action?.tick ?? 0)/60 : visual.elapsed, clip.duration)
        played.add(`${actor.id}:${name}`)
        for (const track of clip.tracks) {
          const value = track.animation.evaluate(time*track.animation.framePerSecond)
          if (!(value instanceof Quaternion) && !(value instanceof Vector3)) continue
          const properties = values.get(track.target) ?? new Map(); values.set(track.target, properties)
          const old = properties.get(track.property)
          const blend = old ? weight/(old.weight+weight) : 1
          const mixed = old ? value instanceof Quaternion ? Quaternion.Slerp(old.value as Quaternion, value, blend) : Vector3.Lerp(old.value as Vector3, value, blend) : value.clone()
          properties.set(track.property, { value: mixed, weight: (old?.weight ?? 0)+weight })
        }
      }
      for (const [target, properties] of values) for (const [property, sample] of properties) {
        if (property === 'rotationQuaternion') target.rotationQuaternion = sample.value as Quaternion
        else if (property === 'position') target.position.copyFrom(sample.value as Vector3)
        else target.scaling.copyFrom(sample.value as Vector3)
      }
      visual.root.position.set(actor.position.x, actor.position.y, actor.position.z)
      visual.root.rotation.y = actor.yaw
      rendered.add(actor.id)
    }
    return rendered
  } }
}
