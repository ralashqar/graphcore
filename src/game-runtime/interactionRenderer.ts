import { Scene } from '@babylonjs/core/scene'
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Design } from '../domain/game/v2/spec'
import type { InteractionRuntime } from '../domain/game/interactions/runtime'
import { quadrupedPose } from '../domain/game/interactions/poses'
import { add, rotate, mix } from '../domain/game/v2/pose'
export function createInteractionVisuals(scene: Scene, design: Design) {
  const mat = (name: string, color: string) => {
      const m = new StandardMaterial(name, scene)
      m.diffuseColor = Color3.FromHexString(color)
      return m
    },
    wood = mat('interaction.wood', '#A48561'),
    metal = mat('interaction.metal', '#77999A'),
    horse = mat('interaction.horse', '#BA9972'),
    glow = mat('interaction.anchor', '#A9EAA5')
  const parts = new Map<
      string,
      { mesh: Mesh; offset: { x: number; y: number; z: number } }[]
    >(),
    limbs = new Map<string, Mesh[]>(),
    anchors = new Map<string, Mesh[]>()
  const legs = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'],
    links = [
      ['hips', 'chest'],
      ['chest', 'head'],
      ...legs.flatMap((n) => [
        [n + 'Hip', n + 'Knee'],
        [n + 'Knee', n + 'Foot'],
      ]),
    ]
  for (const e of design.nodes.filter((n) => n.kind === 'interactive_entity')) {
    const b = design.nodes.find((n) => n.id === e.body)
    if (b?.kind !== 'body') continue
    const p: { mesh: Mesh; offset: { x: number; y: number; z: number } }[] = []
    const box = (
      name: string,
      size: { x: number; y: number; z: number },
      offset: { x: number; y: number; z: number },
      material: StandardMaterial,
    ) => {
      const mesh = CreateBox(
        name,
        { width: size.x, height: size.y, depth: size.z },
        scene,
      )
      mesh.material = material
      p.push({ mesh, offset })
    }
    if (e.mechanism) {
      const m = design.nodes.find((n) => n.id === e.mechanism)
      if (m?.kind === 'mechanism')
        box(e.id, m.size, { x: m.size.x / 2, y: m.size.y / 2, z: 0 }, wood)
    } else if (b.family === 'quadruped') {
      box(
        e.id,
        { x: b.width, y: 0.45, z: b.length * 0.75 },
        { x: 0, y: b.height * 0.7, z: 0 },
        horse,
      )
      box(
        `${e.id}.saddle`,
        { x: 0.5, y: 0.2, z: 0.6 },
        { x: 0, y: 1.55, z: 0 },
        wood,
      )
      const head = CreateSphere(
        `${e.id}.head`,
        { diameter: 0.38, segments: 8 },
        scene,
      )
      head.material = horse
      p.push({ mesh: head, offset: { x: 0, y: b.height, z: b.length * 0.48 } })
      limbs.set(
        e.id,
        links.map((_, i) => {
          const m = CreateCylinder(
            `${e.id}.limb${i}`,
            { height: 1, diameter: 0.11, tessellation: 6 },
            scene,
          )
          m.material = horse
          return m
        }),
      )
    } else {
      box(
        e.id,
        { x: b.width, y: b.height, z: b.length },
        { x: 0, y: b.height / 2, z: 0 },
        e.motor ? metal : wood,
      )
      if (e.motor) {
        for (const x of [-1, 1])
          for (const z of [-1, 1]) {
            const wheel = CreateCylinder(
              `${e.id}.wheel${x}${z}`,
              { height: 0.18, diameter: 0.48, tessellation: 12 },
              scene,
            )
            wheel.rotation.z = Math.PI / 2
            wheel.material = metal
            p.push({
              mesh: wheel,
              offset: { x: (x * b.width) / 2, y: 0.24, z: z * b.length * 0.33 },
            })
          }
      } else
        box(
          `${e.id}.back`,
          { x: b.width, y: 0.75, z: 0.12 },
          { x: 0, y: b.height + 0.35, z: -b.length / 2 },
          wood,
        )
    }
    parts.set(e.id, p)
    const a = design.nodes.find((n) => n.id === e.anchors)
    anchors.set(
      e.id,
      a?.kind === 'anchor_set'
        ? a.anchors.map((anchor) => {
            const m = CreateSphere(
              `${e.id}.${anchor.id}`,
              { diameter: 0.08, segments: 5 },
              scene,
            )
            m.material = glow
            return m
          })
        : [],
    )
  }
  return {
    update(runtime: InteractionRuntime, tick: number, debug: boolean) {
      for (const e of design.nodes.filter(
        (n) => n.kind === 'interactive_entity',
      )) {
        const s = runtime.state.entities[e.id],
          b = runtime.get(e.body, 'body'),
          yaw = s.yaw - (e.mechanism ? s.angle : 0)
        for (const p of parts.get(e.id) ?? []) {
          const pos = add(s.position, rotate(p.offset, yaw))
          p.mesh.position.set(pos.x, pos.y, pos.z)
          p.mesh.rotation.y = yaw
          p.mesh.setEnabled(s.enabled)
        }
        if (b.family === 'quadruped') {
          const joints = quadrupedPose(b, s, tick / 8, Math.abs(s.speed))
          for (const [i, [from, to]] of links.entries()) {
            const p = joints[from],
              q = joints[to],
              m = limbs.get(e.id)![i],
              mid = mix(p, q, 0.5),
              dir = new Vector3(q.x - p.x, q.y - p.y, q.z - p.z),
              len = dir.length()
            dir.normalize()
            const axis = Vector3.Cross(Vector3.Up(), dir)
            m.position.set(mid.x, mid.y, mid.z)
            m.scaling.y = len
            m.rotationQuaternion =
              axis.length() < 1e-6
                ? Quaternion.Identity()
                : Quaternion.RotationAxis(
                    axis.normalize(),
                    Math.acos(Math.max(-1, Math.min(1, dir.y))),
                  )
            m.setEnabled(s.enabled)
          }
        }
        const a = runtime.get(e.anchors, 'anchor_set')
        for (const [i, m] of (anchors.get(e.id) ?? []).entries()) {
          const p = runtime.anchor(e, a.anchors[i].id).position
          m.position.set(p.x, p.y, p.z)
          m.setEnabled(debug && s.enabled)
        }
      }
    },
  }
}
