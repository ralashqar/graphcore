import { presentPose } from './presentation'
import type { PresentationFrame } from './animationRenderer'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder'
import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import { Simulation, DT, type Input } from '../domain/game/v2/simulation.ts'
import { nodesOf, type Manifest } from '../domain/game/v2/spec.ts'
import { add, rotate, poseAt, mix } from '../domain/game/v2/pose.ts'
import { createInteractionVisuals } from './interactionRenderer'
import { interactionPath } from '../domain/game/interactions/navigation'

export async function createCombatPlayer(
  canvas: HTMLCanvasElement,
  manifest: Manifest,
  onUpdate: (text: string, feedback: string) => void,
  extensions?: { create: () => Simulation; replaceMechanics?: (sim: Simulation, manifest: unknown) => Promise<void>; summary: (sim: Simulation) => string; hint: (sim: Simulation) => string; visuals?: (scene: Scene) => Promise<{ update: (sim: Simulation, frame?:PresentationFrame) => Set<string>; metrics?: () => Record<string, unknown> }>; decorate?: (scene: Scene, sim: () => Simulation) => (() => void) },
) {
  let sim = extensions ? extensions.create() : await Simulation.create(manifest.design, manifest.id),
    paused = false,
    accumulator = 0,
    debug = false,
    lastEvent = '',
    disposed = false
  const previousPoses=new Map<string,{position:{x:number;y:number;z:number};yaw:number}>()
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true }),
    scene = new Scene(engine)
  scene.clearColor = new Color4(0.1, 0.13, 0.14, 1)
  const camera = new ArcRotateCamera(
    'camera',
    -Math.PI / 2,
    1.02,
    12,
    new Vector3(0, 1, 0),
    scene,
  )
  camera.attachControl(canvas, true)
  camera.lowerRadiusLimit = 5
  camera.upperRadiusLimit = 22
  new HemisphericLight('light', new Vector3(0.3, 1, 0.2), scene).intensity = 1.1
  const material = (name: string, color: string) => {
    const m = new StandardMaterial(name, scene)
    m.diffuseColor = Color3.FromHexString(color)
    m.specularColor = Color3.Black()
    return m
  }
  const stone = material('stone', '#798275'),
    groundMat = material('ground', '#303E3B'),
    friendly = material('player', '#DFC898'),
    hostile = material('hostile', '#C66658'),
    neutral = material('target', '#92A4A6'),
    energy = material('energy', '#A8F1CD')
  const world = nodesOf(manifest.design, 'world')[0],
    floor = CreateGround(
      'floor',
      { width: world.width, height: world.depth },
      scene,
    )
  floor.material = groundMat
  for (const b of world.boxes) {
    const box = CreateBox(
      b.id,
      { width: b.size.x, height: b.size.y, depth: b.size.z },
      scene,
    )
    box.position.set(b.position.x, b.position.y, b.position.z)
    box.material = stone
    if (b.ramp) {
      box.scaling.y = 0.12
      box.rotation.x = -Math.atan2(b.size.y, b.size.z)
    }
  }
  const beacon = CreateCylinder(
    'beacon',
    { height: 0.15, diameter: 1.3 },
    scene,
  )
  beacon.position.set(
    world.objective.x,
    world.objective.y + 0.12,
    world.objective.z,
  )
  beacon.material = energy
  const debugMeshes: Mesh[] = []
  for (const ledge of world.ledges) {
    const l = CreateLines(
      ledge.id,
      {
        points: [
          new Vector3(ledge.start.x, ledge.start.y + 0.03, ledge.start.z),
          new Vector3(ledge.end.x, ledge.end.y + 0.03, ledge.end.z),
        ],
      },
      scene,
    )
    l.color = Color3.FromHexString('#C9FF64')
    debugMeshes.push(l)
  }
  const links = [
    ['hips', 'chest'],
    ['chest', 'head'],
    ['chest', 'leftShoulder'],
    ['chest', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'],
    ['leftElbow', 'leftHand'],
    ['rightShoulder', 'rightElbow'],
    ['rightElbow', 'rightHand'],
    ['hips', 'leftHip'],
    ['hips', 'rightHip'],
    ['leftHip', 'leftKnee'],
    ['leftKnee', 'leftFoot'],
    ['rightHip', 'rightKnee'],
    ['rightKnee', 'rightFoot'],
  ]
  const actorMeshes = new Map<
      string,
      { head: Mesh; links: Mesh[]; socket: Mesh }
    >(),
    projectileMeshes = new Map<string, Mesh>()
  for (const a of sim.state.actors) {
    const mat =
        a.id === sim.state.player
          ? friendly
          : sim.actorSpec(a).role === 'enemy'
            ? hostile
            : neutral,
      head = CreateSphere(a.id, { diameter: 0.32, segments: 8 }, scene)
    head.material = mat
    const limbs = links.map((_, i) => {
      const m = CreateCylinder(
        `${a.id}.${i}`,
        { height: 1, diameter: i === 0 ? 0.3 : 0.1, tessellation: 6 },
        scene,
      )
      m.material = mat
      return m
    })
    const socket = CreateSphere(
      `${a.id}.socket`,
      { diameter: 0.12, segments: 6 },
      scene,
    )
    socket.material = energy
    actorMeshes.set(a.id, { head, links: limbs, socket })
  }
  const keys = new Set<string>(),
    edges = new Set<string>()
  const interactionVisuals = createInteractionVisuals(scene, manifest.design)
  const updateDecoration = extensions?.decorate?.(scene, () => sim)
  const animationVisuals = await extensions?.visuals?.(scene)
  const down = (e: KeyboardEvent) => {
    if (
      [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'Space',
        'KeyE',
        'KeyV',
        'KeyQ','KeyZ','KeyX',
        'KeyR',
        'KeyF',
        'Digit1','Digit2','Digit3','Digit4',
        'KeyC',
        'Escape',
        'ShiftLeft',
        'ShiftRight',
        'AltLeft',
        'KeyV',
      ].includes(e.code)
    ) {
      e.preventDefault()
      if (!keys.has(e.code)) edges.add(e.code)
      keys.add(e.code)
    }
  }
  const up = (e: KeyboardEvent) => keys.delete(e.code),
    blur = () => {
      keys.clear()
      edges.clear()
      accumulator = 0
    }
  canvas.tabIndex = 0
  canvas.addEventListener('keydown', down)
  canvas.addEventListener('keyup', up)
  canvas.addEventListener('blur', blur)
  const click = (e: MouseEvent) => {
    if (e.button === 0 && e.shiftKey) edges.add('KeyF')
  }
  canvas.addEventListener('mousedown', click)
  const visibility = () => {
    if (document.hidden) blur()
  }
  document.addEventListener('visibilitychange', visibility)
  const resize = () => engine.resize()
  window.addEventListener('resize', resize)
  const render = () => {
    if (disposed) return
    if (!paused && !document.hidden) {
      accumulator = Math.min(0.1, accumulator + engine.getDeltaTime() / 1000)
      let count = 0
      while (accumulator >= DT && count++ < 6) {
        const spec = sim.actorSpec(sim.player),
          primary = spec.abilities.find(
            (id) =>
              nodesOf(sim.design, 'ability').find((a) => a.id === id)
                ?.op === (spec.role === 'mage' ? 'bolt' : 'strike'),
          ) ?? spec.abilities.find(id => nodesOf(sim.design,'ability').some(a=>a.id===id&&(a.op==='strike'||a.op==='bolt')))
        const x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
          z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
          yaw = -camera.alpha - Math.PI / 2,
          movement = rotate({ x, y: 0, z }, yaw)
        const input: Input = {
          x: movement.x,
          z: movement.z,
          sprint: keys.has('ShiftLeft'),
          traverse: keys.has('KeyV'),
          strafe: keys.has('AltLeft'),
          jump: edges.has('Space'),
          interact: edges.has('KeyE'),
          drop: edges.has('KeyC'),
          cancel: edges.has('Escape'),
          attack: edges.has('KeyF'),
          dash: edges.has('KeyQ'),
          roll:edges.has('KeyZ'),uppercut:edges.has('KeyX'),
          ability: ['Digit1','Digit2','Digit3','Digit4'].some(k=>edges.has(k))
            ? spec.abilities.filter(id=>!id.startsWith('runtime.'))[['Digit1','Digit2','Digit3','Digit4'].findIndex(k=>edges.has(k))]
            : edges.has('KeyV')
            ? spec.abilities.find(id=>nodesOf(sim.design,'ability').some(a=>a.id===id&&a.op==='roll'))
            : edges.has('KeyF')
            ? (spec.abilities.includes('runtime.combo.0') ? undefined : primary)
            : edges.has('KeyQ')
              ? (spec.abilities.includes('runtime.dash.0') ? undefined : spec.abilities.find(id=>nodesOf(sim.design,'ability').some(a=>a.id===id&&a.op==='dodge')))
              : edges.has('KeyR')
                ? spec.abilities.find(id=>nodesOf(sim.design,'ability').some(a=>a.id===id&&a.op==='shield'))
                : undefined,
        }
        previousPoses.clear()
        for(const actor of sim.state.actors)previousPoses.set(actor.id,{position:{...actor.position},yaw:actor.yaw})
        sim.step(input)
        edges.clear()
        accumulator -= DT
      }
    }
    const animated = animationVisuals?.update(sim,{alpha:accumulator/DT,previous:previousPoses,dt:paused?0:Math.min(.1,engine.getDeltaTime()/1000)}) ?? new Set<string>()
    for (const a of sim.state.actors) {
      const meshes = actorMeshes.get(a.id)!
      meshes.head.setEnabled(a.health > 0 && !animated.has(a.id))
      meshes.links.forEach((m) => m.setEnabled(a.health > 0 && !animated.has(a.id)))
      meshes.socket.setEnabled(debug && a.health > 0)
      if (a.health <= 0) continue
      const action = a.action,
        ability = nodesOf(sim.design, 'ability').find(
          (v) => v.id === action?.ability,
        ),
        progress =
          action && ability
            ? Math.min(
                1,
                (action.tick * DT) /
                  (ability.windup + ability.active + ability.recovery),
              )
            : 0,
        joints = poseAt(
          sim.design,
          ability?.pose ?? null,
          progress,
          sim.actorSpec(a).height,
          a.mode === 'hang' || a.mode === 'climb',
        ),
        positions = Object.fromEntries(
          Object.entries(joints).map(([k, p]) => [
            k,
            add(a.position, rotate(p, a.yaw)),
          ]),
        )
      const composedPose=(sim as Simulation & {mechanicPose?:(actor:typeof a,p:Record<string,{x:number;y:number;z:number}>)=>Record<string,{x:number;y:number;z:number}>}).mechanicPose?.(a,positions)
      if(composedPose)Object.assign(positions,composedPose)
      const ledge = world.ledges.find((l) => l.id === a.ledge)
      const contactJoints = sim.interactions.poses.get(a.id)
      if (contactJoints) Object.assign(positions, contactJoints)
      if (ledge) {
        for (const side of ['left', 'right'])
          positions[`${side}Hand`] = {
            x: a.position.x + (side === 'left' ? -0.25 : 0.25),
            y: ledge.start.y,
            z: ledge.start.z,
          }
      }
      meshes.head.position.copyFromFloats(
        positions.head.x,
        positions.head.y,
        positions.head.z,
      )
      meshes.socket.position.copyFromFloats(
        positions.rightHand.x,
        positions.rightHand.y,
        positions.rightHand.z,
      )
      links.forEach(([from, to], i) => {
        const p = positions[from],
          q = positions[to],
          mid = mix(p, q, 0.5),
          dir = new Vector3(q.x - p.x, q.y - p.y, q.z - p.z),
          len = dir.length()
        dir.normalize()
        const axis = Vector3.Cross(Vector3.Up(), dir)
        meshes.links[i].position.set(mid.x, mid.y, mid.z)
        meshes.links[i].scaling.y = len
        meshes.links[i].rotationQuaternion =
          axis.length() < 1e-6
            ? Quaternion.Identity()
            : Quaternion.RotationAxis(
                axis.normalize(),
                Math.acos(Math.max(-1, Math.min(1, dir.y))),
              )
      })
    }
    for (const [id, m] of projectileMeshes)
      if (!sim.state.projectiles.some((p) => p.id === id)) {
        m.dispose()
        projectileMeshes.delete(id)
      }
    for (const p of sim.state.projectiles) {
      let m = projectileMeshes.get(p.id)
      if (!m) {
        m = CreateSphere(p.id, { diameter: 0.28, segments: 8 }, scene)
        m.material = energy
        projectileMeshes.set(p.id, m)
      }
      m.position.set(p.position.x, p.position.y, p.position.z)
    }
    debugMeshes.forEach((m) => m.setEnabled(debug))
    interactionVisuals.update(sim.interactions, sim.state.tick, debug)
    const cameraPose = animated?.has(sim.player.id)
      ? presentPose(sim.player, previousPoses.get(sim.player.id), accumulator/DT)
      : sim.player
    camera.target.copyFromFloats(cameraPose.position.x, cameraPose.position.y + 1, cameraPose.position.z)
    const event = sim.state.events.at(-1)
    if (event) lastEvent = event.detail
    onUpdate(
      extensions ? `${extensions.summary(sim)} · Health ${Math.ceil(sim.player.health)} · Stamina ${Math.round(sim.player.stamina)}` : sim.state.complete
        ? 'Beacon activated. Trial complete.'
        : `${sim.player.mode} · Health ${Math.ceil(sim.player.health)} · Stamina ${Math.round(sim.player.stamina)}`,
      extensions?.hint(sim) || sim.interactions.hint(sim.player.id) || lastEvent,
    )
    updateDecoration?.()
    scene.render()
  }
  engine.runRenderLoop(render)
  return {
    state: () => structuredClone(sim.state),
    pathToPoint: (point: { x: number; z: number }) =>
      interactionPath(
        sim.physics,
        sim.player.id,
        sim.player.position,
        { ...point, y: 0 },
        world,
      ),
    save: () => sim.save(),
    replaceMechanics: async (value:unknown) => {
      if(!extensions?.replaceMechanics)throw new Error('This runtime does not support live mechanics')
      await extensions.replaceMechanics(sim,value)
      blur()
    },
    restore: (v: unknown) => sim.restore(v),
    pause: (v: boolean) => {
      paused = v
      blur()
    },
    restart: () => {
      const role = sim.actorSpec(sim.player).role
      sim.dispose()
      sim = extensions ? extensions.create() : new Simulation(manifest.design, manifest.id, role)
      blur()
    },
    debug: (v: boolean) => {
      debug = v
    },
    metrics: () => ({
      cameraTarget: camera.target.asArray(),
      ...animationVisuals?.metrics?.(),
      mechanics: structuredClone((sim as Simulation & { mechanicStates?: unknown }).mechanicStates ?? {}),
      fps: engine.getFps(),
      meshes: scene.meshes.length,
      vertices: scene.getTotalVertices(),
    }),
    dispose: () => {
      disposed = true
      engine.stopRenderLoop(render)
      canvas.removeEventListener('keydown', down)
      canvas.removeEventListener('keyup', up)
      canvas.removeEventListener('blur', blur)
      canvas.removeEventListener('mousedown', click)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('resize', resize)
      sim.dispose()
      scene.dispose()
      engine.dispose()
    },
  }
}
export type CombatPlayer = Awaited<ReturnType<typeof createCombatPlayer>>
