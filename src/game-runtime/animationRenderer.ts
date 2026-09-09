import { presentPose } from './presentation'
import { compatibleReplacement } from '../domain/game/v3/performanceMotion'
import { evaluateSequence } from '../domain/game/v3/poseSequence'
import { somaMannequin, isCanonicalHumanoid } from '../domain/game/v3/mannequin'
import { estimateSomaPose, contactPose, type Rig, type SkeletalPose } from '../domain/game/v3/somaPose'
import { createSomaVisual } from './somaVisual'
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader'
import type { AssetContainer } from '@babylonjs/core/assetContainer'
import type { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector'
import '@babylonjs/loaders/glTF'
import { locomotionWeights, advanceAnimationBlend, emptyAnimationBlend, advanceActionClipClock, type ActionClipClock, type AnimationBlend, type AnimationState } from '../domain/game/v3/animationMixer'
import type { AnimationGraph } from '../domain/game/v3/animation'
import { of, type Manifest } from '../domain/game/v3/spec'
import type { Simulation, ActorState } from '../domain/game/v2/simulation'
import type { Animation } from '@babylonjs/core/Animations/animation'

export type PresentationFrame={alpha:number;previous:Map<string,{position:ActorState['position'];yaw:number}>;dt:number}
type Track = { target: TransformNode; property: 'position' | 'rotationQuaternion' | 'scaling'; animation: Animation }
type Clip = { contract?:string; duration: number; loop: boolean; speed: number; tracks: Track[] }
export async function animationVisuals(scene: Scene, manifest: Manifest, urls: Record<string, string>) {
  const actors = new Map<string, { root: TransformNode; targets: Map<string,TransformNode>; rig:Rig|undefined; samples:Map<TransformNode,{rotation:Quaternion;position:Vector3}>; clips: Map<AnimationState, Clip>; transitions: AnimationGraph['transitions']; blend: AnimationBlend; clock:ActionClipClock; previous: ActorState['position']; velocity: { x: number; z: number }; tick: number; mode: string; enteredFrom: string; elapsed: number; gait: number }>()
  const containers: AssetContainer[] = []
  const played = new Set<string>()
  const loops: Record<string, number> = {}
  let proceduralFrames=0,contactRejections=0
  let loaded = 0, expected = 0
  try {
    for (const instance of of(manifest.design, 'actor_instance')) {
      const graph = manifest.animations?.graphs.find(g => g.actorDefinition === instance.definition)
      const rig=manifest.animations?.rigs.find(r=>r.revision===graph?.rigRevision) ?? (manifest.design.mechanics?.motionProfile?await somaMannequin():undefined)
      if (!graph?.bindings.length && !isCanonicalHumanoid(rig?.id)) continue
      expected += graph?.bindings.length??0
      const root = new TransformNode(`animated.${instance.id}`, scene), clips = new Map<AnimationState, Clip>()
      let targets: Map<string, TransformNode> | null = null
      for (const binding of graph?.bindings??[]) {
        const asset = manifest.assets.find(a => a.id === binding.clipRevision)
        if (!asset || asset.rigRevision !== graph?.rigRevision || !urls[asset.recipeKey]) continue
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
        if (tracks.length) { clips.set(binding.state, { contract:asset.motionContract&&compatibleReplacement(asset,asset.motionContract,manifest.design.mechanics?.performance?.sequences.find(s=>s.role===asset.state)?.duration??-1)?asset.motionContract:undefined,duration: asset.duration, loop: asset.loop, speed: asset.naturalSpeed, tracks }); loaded++ }
      }
      if(!targets && isCanonicalHumanoid(rig?.id))targets=createSomaVisual(scene,root,rig)
      root.setEnabled(false)
      actors.set(instance.id, { root, targets:targets??new Map(),rig,samples:new Map(), clips, transitions: graph?.transitions??[], blend: emptyAnimationBlend(), clock:{active:null,times:{}}, previous: { ...instance.position }, velocity: { x: 0, z: 0 }, tick: 0, mode: '', enteredFrom: '', elapsed: 0, gait: 0 })
    }
  } catch { containers.forEach(c => c.dispose()); actors.forEach(a => a.root.dispose()); return { update: () => new Set<string>(), metrics: () => ({ animationLoadFailed: true, animationBindings: 0, expectedAnimationBindings: expected, playedAnimations: [] as string[] }) } }
  scene.onDisposeObservable.add(() => containers.forEach(c => c.dispose()))
  return { metrics: () => ({ presentationPositions: Object.fromEntries([...actors].map(([id,a])=>[id,a.root.position.asArray()])), somaActors:[...actors].filter(([,a])=>isCanonicalHumanoid(a.rig?.id)).map(([id])=>id),proceduralFrames,contactRejections,animationLoadFailed: loaded !== expected, animationBindings: loaded, expectedAnimationBindings: expected, playedAnimations: [...played], animationLoops: { ...loops } }), update(sim: Simulation,frame?:PresentationFrame) {
    const rendered = new Set<string>()
    for (const actor of sim.state.actors) {
      const visual = actors.get(actor.id)
      if (!visual) continue
      const tickDelta = sim.state.tick-visual.tick
      if (tickDelta < 0 || tickDelta > 6) { visual.previous = { ...actor.position }; visual.velocity = { x: 0, z: 0 }; visual.elapsed = 0; visual.gait = 0; visual.mode = ''; visual.enteredFrom = ''; visual.blend = emptyAnimationBlend();visual.samples.clear() }
      const simulationDt = Math.max(0, Math.min(.1, tickDelta/60))
      const dt = frame ? Math.max(0, Math.min(.1, frame.dt)) : simulationDt
      const velocity = simulationDt ? { x: (actor.position.x-visual.previous.x)/simulationDt, z: (actor.position.z-visual.previous.z)/simulationDt } : visual.velocity
      visual.velocity = velocity
      visual.previous = { ...actor.position }; visual.tick = sim.state.tick
      visual.elapsed += dt
      if (visual.mode !== actor.mode) { visual.enteredFrom = visual.mode; visual.elapsed = 0; visual.mode = actor.mode }
      const performance='performanceMotion' in sim?(sim as import('../domain/game/v3/simulation').UnifiedSimulation).performanceMotion(actor):undefined
      const presentationOffset = frame ? (frame.alpha-1)/60 : 0
      const performanceSeconds = performance ? Math.max(0,performance.seconds+presentationOffset) : 0
      const replacement=performance&&visual.clips.get(performance.sequence.role as AnimationState)?.contract===manifest.nodeHashes[`motion.${performance.sequence.id}`]&&!!manifest.nodeHashes[`motion.${performance.sequence.id}`]
      let state: AnimationState | null = null
      const ability = sim.design.nodes.find(n => n.kind === 'ability' && n.id === actor.action?.ability)
      if (ability?.kind === 'ability' && ability.op === 'roll') state = 'roll'
      else if (actor.mode === 'climb') state = 'climb'
      else if (actor.mode === 'hang') state = visual.enteredFrom === 'air' && visual.elapsed < (visual.clips.get('catch')?.duration ?? 0) ? 'catch' : Math.abs(velocity.x) > .1 ? velocity.x < 0 ? 'shimmy_left' : 'shimmy_right' : 'hang'
      else if (actor.mode === 'air') state = actor.vy > 0 && visual.elapsed < Math.min(.2, visual.clips.get('takeoff')?.duration ?? 0) ? 'takeoff' : 'airborne'
      else if (actor.mode === 'ground' && visual.enteredFrom === 'air' && visual.elapsed < Math.min(.2, visual.clips.get('landing')?.duration ?? 0)) state = 'landing'
      if(performance&&performance.sequence.role!=='custom')state=performance.sequence.role
      const localX = velocity.x*Math.cos(actor.yaw)-velocity.z*Math.sin(actor.yaw), localZ = velocity.x*Math.sin(actor.yaw)+velocity.z*Math.cos(actor.yaw)
      if(tickDelta<0||tickDelta>6)visual.clock={active:null,times:{}}
      visual.clock=advanceActionClipClock(visual.clock,state,dt)
      visual.blend = advanceAnimationBlend(visual.blend, state ? { [state]: 1 } : locomotionWeights(localX, localZ), visual.transitions, dt)
      const weights = visual.blend.weights
      const supported = Object.entries(weights).filter(([s,w]) => w > .001 && visual.clips.has(s as AnimationState)) as Array<[AnimationState, number]>
      const total = supported.reduce((sum, [,w]) => sum+w, 0)
      const mechanic=(sim as Simulation & {mechanicStates?:Record<string,{phase:string}>}).mechanicStates?.[actor.id]
      const soma=isCanonicalHumanoid(visual.rig?.id)
      const procedural=performance?!replacement:!!actor.action || actor.mode==='air' || actor.mode==='hang' || actor.mode==='climb' || mechanic?.phase==='attached' || sim.interactions.poses.has(actor.id) || total<.99
      const show = soma ? actor.health>0 : actor.health > 0 && total > .99 && !sim.interactions.poses.has(actor.id) && mechanic?.phase!=='attached' && !actor.action?.ability.startsWith('runtime.')
      visual.root.setEnabled(show)
      if (!show) continue
      // Keep the underlying gait clock alive while a full-body action hides it.
      // Action blend weights can approach zero and must not collapse cycle length.
      const gaitClips = Object.entries(locomotionWeights(localX,localZ)).filter(([s,w])=>w>0&&visual.clips.has(s as AnimationState)) as Array<[AnimationState,number]>
      const gaitWeight = gaitClips.reduce((sum,[,w])=>sum+w,0)
      const cycle = gaitClips.reduce((sum,[s,w])=>sum+visual.clips.get(s)!.duration*w,0)/Math.max(.001,gaitWeight)
      const naturalSpeed = gaitClips.reduce((sum,[s,w])=>sum+visual.clips.get(s)!.speed*w,0)/Math.max(.001,gaitWeight)
      const playbackRate = naturalSpeed > .1 ? Math.max(.25, Math.min(2, Math.hypot(velocity.x, velocity.z)/naturalSpeed)) : 1
      const nextGait = visual.gait + dt*playbackRate/Math.max(.1, cycle)
      if (nextGait >= 1) for (const [name, weight] of supported) if (weight > .1 && visual.clips.get(name)!.loop) loops[`${actor.id}:${name}`] = (loops[`${actor.id}:${name}`] ?? 0)+1
      visual.gait = nextGait % 1
      const values = new Map<TransformNode, Map<string, { value: Vector3 | Quaternion; weight: number }>>()
      for (const [name, weight] of supported) {
        const clip = visual.clips.get(name)!, time = performance&&replacement&&name===state?Math.min(performanceSeconds,clip.duration):clip.loop ? visual.gait*clip.duration : Math.min(visual.clock.times[name]??0, clip.duration)
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
      if(soma && visual.rig){
        const rig=visual.rig
        if(procedural){
          proceduralFrames++
          const id=actor.action?.ability??'',kind=id.includes('dash')?'dash':ability?.kind==='ability'?ability.op:'idle'
          const pose=performance?evaluateSequence(rig,performance.sequence,performanceSeconds):estimateSomaPose(rig,{time:sim.state.tick/60+presentationOffset,speed:Math.hypot(velocity.x,velocity.z),mode:actor.mode,action:actor.action&&ability?.kind==='ability'?{kind,index:Number(id.split('.').at(-1))||0,seconds:Math.max(0,actor.action.tick/60+presentationOffset),windup:ability.windup,active:ability.active,recovery:ability.recovery}:undefined})
          for(const j of rig.joints){const target=visual.targets.get(j.id);if(target){target.rotationQuaternion=Quaternion.FromArray(pose.rotations[j.id]);target.position.copyFromFloats(...(j.parent?j.translation:pose.root))}}
        }
        // Blend the previous displayed pose, including interrupted action time.
        const blend=visual.samples.size?1-Math.exp(-(frame?.dt??dt)/.065):1
        for(const j of rig.joints){const target=visual.targets.get(j.id);if(!target)continue
          const previous=visual.samples.get(target)
          if(previous){target.rotationQuaternion=Quaternion.Slerp(previous.rotation,target.rotationQuaternion??Quaternion.Identity(),blend);target.position=Vector3.Lerp(previous.position,target.position,blend)}
        }
        const posed:SkeletalPose={root:[...rig.joints[0].translation],rotations:{}}
        for(const j of rig.joints){const t=visual.targets.get(j.id);posed.rotations[j.id]=t?.rotationQuaternion?.asArray() as SkeletalPose['rotations'][string]??j.rotation;if(!j.parent&&t)posed.root=t.position.asArray() as [number,number,number]}
        const contacts=(sim as Simulation & {mechanicPoses?:Record<string,Record<string,{x:number;y:number;z:number}>>}).mechanicPoses?.[actor.id]
        const interaction=sim.interactions.poses.get(actor.id)
        const worldContacts=mechanic?.phase==='attached'?contacts:interaction
        if(worldContacts)for(const [side,logical]of [['Left','left'],['Right','right']] as const)for(const limb of ['Hand','Foot'] as const){
          const point=worldContacts[`${logical}${limb}`];if(!point)continue
          const dx=point.x-actor.position.x,dz=point.z-actor.position.z
          const target={x:-(dx*Math.cos(actor.yaw)-dz*Math.sin(actor.yaw)),y:point.y-actor.position.y,z:dx*Math.sin(actor.yaw)+dz*Math.cos(actor.yaw)}
          if(!contactPose(rig,posed,limb==='Hand'?[`${side}Arm`,`${side}ForeArm`,`${side}Hand`]:[`${side}Leg`,`${side}Shin`,`${side}Foot`],target,{x:side==='Left'?1:-1,y:0,z:limb==='Hand'?-.5:1},.12))contactRejections++
        }
        for(const j of rig.joints){const target=visual.targets.get(j.id);if(!target)continue;target.rotationQuaternion=Quaternion.FromArray(posed.rotations[j.id]);visual.samples.set(target,{rotation:target.rotationQuaternion.clone(),position:target.position.clone()})}
      }
      const display = presentPose(actor, frame?.previous.get(actor.id), frame?.alpha ?? 1)
      visual.root.position.set(display.position.x, display.position.y, display.position.z)
      visual.root.rotation.y = display.yaw
      rendered.add(actor.id)
    }
    return rendered
  } }
}
