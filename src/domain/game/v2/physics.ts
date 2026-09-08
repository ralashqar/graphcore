// Rapier 0.17's package main is CommonJS despite type=module; use its ESM build in Node and browsers.
// @ts-ignore The published ESM file shares the package's root declarations.
import runtime from '@dimforge/rapier3d-compat/rapier.es.js'
import type * as Rapier from '@dimforge/rapier3d-compat'
const RAPIER = runtime as typeof Rapier
import type { Actor, World, Vec } from './spec.ts'
import { add, sub, scale } from './pose.ts'
let initialized: Promise<void> | null = null
export async function initPhysics() {
  initialized ??= RAPIER.init()
  await initialized
}
const rotation = { x: 0, y: 0, z: 0, w: 1 }
export class Physics {
  world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  controller = this.world.createCharacterController(0.015)
  actors = new Map<string, { collider: Rapier.Collider; spec: Actor }>()
  ids = new Map<number, string>()
  props = new Map<string, { collider: Rapier.Collider; size: Vec }>()
  lastObstruction = ''
  constructor(spec: World) {
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4)
    this.controller.enableAutostep(0.25, 0.25, false)
    this.controller.enableSnapToGround(0.12)
    const ground = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        spec.width / 2,
        0.2,
        spec.depth / 2,
      ).setTranslation(0, -0.2, 0),
    )
    this.ids.set(ground.handle, 'ground')
    for (const b of spec.boxes) {
      let desc: Rapier.ColliderDesc
      if (b.ramp) {
        const { x, y, z } = b.size
        desc = RAPIER.ColliderDesc.convexHull(
          new Float32Array([
            -x / 2,
            -y / 2,
            -z / 2,
            x / 2,
            -y / 2,
            -z / 2,
            -x / 2,
            -y / 2,
            z / 2,
            x / 2,
            -y / 2,
            z / 2,
            -x / 2,
            y / 2,
            z / 2,
            x / 2,
            y / 2,
            z / 2,
          ]),
        )!
      } else
        desc = RAPIER.ColliderDesc.cuboid(
          b.size.x / 2,
          b.size.y / 2,
          b.size.z / 2,
        )
      const collider = this.world.createCollider(
        desc.setTranslation(b.position.x, b.position.y, b.position.z),
      )
      this.ids.set(collider.handle, b.id)
    }
    this.world.step()
  }
  add(id: string, spec: Actor, feet: Vec) {
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(
        spec.height / 2 - spec.radius,
        spec.radius,
      ).setTranslation(feet.x, feet.y + spec.height / 2, feet.z),
    )
    this.actors.set(id, { collider, spec })
    this.ids.set(collider.handle, id)
  }
  sync(id: string, feet: Vec, alive = true) {
    const a = this.actors.get(id)!
    a.collider.setTranslation({ ...feet, y: feet.y + a.spec.height / 2 })
    a.collider.setEnabled(alive)
  }
  refresh() {
    this.world.step()
  }
  move(id: string, feet: Vec, delta: Vec) {
    const a = this.actors.get(id)!
    this.controller.computeColliderMovement(
      a.collider,
      delta,
      undefined,
      undefined,
      (c) => c.handle !== a.collider.handle,
    )
    return {
      position: add(feet, this.controller.computedMovement()),
      grounded: this.controller.computedGrounded(),
    }
  }
  free(id: string, feet: Vec, exclude: string[] = []) {
    const a = this.actors.get(id)!
    let clear = true
    this.world.intersectionsWithShape(
      { ...feet, y: feet.y + a.spec.height / 2 + 0.02 },
      rotation,
      new RAPIER.Capsule(
        a.spec.height / 2 - a.spec.radius,
        a.spec.radius * 0.98,
      ),
      () => {
        clear = false
        return false
      },
      undefined,
      undefined,
      a.collider,
      undefined,
      (c) => !exclude.includes(this.ids.get(c.handle) ?? ''),
    )
    return clear
  }
  addProp(id: string, size: Vec, position: Vec, yaw: number) {
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2),
    )
    this.props.set(id, { collider, size })
    this.ids.set(collider.handle, id)
    this.syncProp(id, position, yaw)
  }
  syncProp(id: string, position: Vec, yaw: number, enabled = true) {
    const p = this.props.get(id)!
    p.collider.setTranslation({ ...position, y: position.y + p.size.y / 2 })
    p.collider.setRotation({
      x: 0,
      y: Math.sin(yaw / 2),
      z: 0,
      w: Math.cos(yaw / 2),
    })
    p.collider.setEnabled(enabled)
  }
  propClear(id: string, position: Vec, yaw: number, exclude: string[] = []) {
    const p = this.props.get(id)!
    let clear = true
    this.lastObstruction = ''
    this.world.intersectionsWithShape(
      { ...position, y: position.y + p.size.y / 2 + 0.025 },
      { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      new RAPIER.Cuboid(p.size.x * 0.49, p.size.y * 0.49, p.size.z * 0.49),
      (c) => {
        clear = false
        this.lastObstruction = this.ids.get(c.handle) ?? 'world'
        return false
      },
      undefined,
      undefined,
      p.collider,
      undefined,
      (c) => !exclude.includes(this.ids.get(c.handle) ?? ''),
    )
    return clear
  }
  actorPathClear(id: string, from: Vec, to: Vec, exclude: string[] = []) {
    const a = this.actors.get(id)!,
      delta = sub(to, from)
    return (
      !this.world.castShape(
        { ...from, y: from.y + a.spec.height / 2 + 0.03 },
        rotation,
        delta,
        new RAPIER.Capsule(
          a.spec.height / 2 - a.spec.radius,
          a.spec.radius * 0.95,
        ),
        0,
        1,
        true,
        undefined,
        undefined,
        a.collider,
        undefined,
        (c) => !exclude.includes(this.ids.get(c.handle) ?? ''),
      ) && this.free(id, to, exclude)
    )
  }
  sweep(
    from: Vec,
    to: Vec,
    radius: number,
    exclude: string[],
    staticOnly = false,
  ) {
    const hit = this.world.castShape(
      from,
      rotation,
      sub(to, from),
      new RAPIER.Ball(radius),
      0,
      1,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (c) => {
        const id = this.ids.get(c.handle) ?? ''
        return !exclude.includes(id) && (!staticOnly || !this.actors.has(id))
      },
    )
    return hit
      ? {
          id: this.ids.get(hit.collider.handle) ?? 'world',
          time: hit.time_of_impact,
          point: add(from, scale(sub(to, from), hit.time_of_impact)),
        }
      : null
  }
  supported(feet: Vec) {
    return !!this.world.castRay(
      new RAPIER.Ray({ ...feet, y: feet.y + 0.08 }, { x: 0, y: -1, z: 0 }),
      0.2,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (c) => !this.actors.has(this.ids.get(c.handle) ?? ''),
    )
  }
  dispose() {
    this.world.free()
  }
}
