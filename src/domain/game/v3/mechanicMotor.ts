import type { ActorState, Input } from '../v2/simulation.ts'
import type { Physics } from '../v2/physics.ts'
import type { World } from '../v2/spec.ts'
import { queryMechanicSurfaces } from './mechanicSurfaces.ts'
import {
  type MechanicBundle,
  type MechanicState,
  primitive,
} from './mechanics.ts'
const dt = 1 / 60
export function mechanicMotor(
  bundle: MechanicBundle,
  state: MechanicState,
  actor: ActorState,
  definition: string,
  input: Input,
  world: World,
  physics: Physics,
  dimensions: { radius: number; height: number },
  gravity: number,
): boolean {
  state.cooldown = Math.max(0, state.cooldown - dt)
  const measured = {
    x: (actor.position.x - state.previousPosition.x) / dt,
    y: actor.vy,
    z: (actor.position.z - state.previousPosition.z) / dt,
  }
  state.previousPosition = { ...actor.position }
  if (actor.mode === 'ground' && state.phase !== 'attached') {
    state.phase = 'inactive'
    state.jumps = 0
  }
  if (
    actor.health <= 0 || actor.action || actor.mode === 'hang' ||
    actor.mode === 'climb'
  ) {
    state.phase = 'inactive'
    state.packageId = null
    state.surface = null
    state.contacts = {}
    return false
  }
  const release = () => {
    state.phase = 'departing'
    state.cooldown =
      bundle.packages.find((p) => p.id === state.packageId)?.cooldown ?? .25
    state.packageId = null
    state.surface = null
    state.contacts = {}
  }
  const contacts = queryMechanicSurfaces(
    world,
    bundle.surfaces,
    actor.position,
    dimensions.radius,
    dimensions.height,
  )
  let p = bundle.packages.find((p) => p.id === state.packageId)
  if (state.phase === 'inactive') {
    if (!input.traverse || actor.mode !== 'air' || state.cooldown > 0) {
      return false
    }
    const choices = bundle.packages.filter((p) =>
      p.actorDefinition === definition
    ).sort((
      a,
      b,
    ) => (input.jump && primitive(a, 'require_air').activation === 'jump'
      ? -1
      : input.jump && primitive(b, 'require_air').activation === 'jump'
      ? 1
      : a.id.localeCompare(b.id))
    )
    for (const candidate of choices) {
      const contact = contacts.find((c) =>
        c.distance <= primitive(candidate, 'query_surface').reach &&
        bundle.surfaces.find((s) => s.id === c.surface)!.capabilities.includes(
          candidate.capability,
        )
      )
      if (!contact || actor.stamina <= 0) continue
      const speed = measured.x * contact.tangent.x +
        measured.z * contact.tangent.z
      if (
        Math.abs(speed) < primitive(candidate, 'require_air').minimumSpeed ||
        primitive(candidate, 'require_air').activation === 'jump' &&
          (!input.jump || state.jumps > 0)
      ) continue
      p = candidate
      state.packageId = p.id
      state.surface = contact.surface
      state.phase = 'attached'
      state.contacts = {}
      state.elapsed = 0
      state.direction = Math.sign(speed) || 1
      state.velocity = { ...measured, y: Math.min(1, actor.vy) }
      break
    }
    if (state.phase === 'inactive') return false
  }
  if (state.phase === 'attached' && p) {
    const contact = contacts.find((c) =>
      c.surface === state.surface &&
      c.distance <= primitive(p!, 'query_surface').reach
    )
    if (
      !contact || !input.traverse || input.drop || actor.stamina <= 0 ||
      state.elapsed >= p.duration
    ) release()
    else if (input.jump && state.jumps === 0) {
      const jumping=bundle.packages.find(candidate=>candidate.actorDefinition===definition&&candidate.capability==='wall_jump'&&bundle.surfaces.find(s=>s.id===contact.surface)?.capabilities.includes('wall_jump'))??p
      const impulse = primitive(jumping, 'exit_impulse')
      state.packageId=jumping.id
      state.velocity = {
        x: contact.normal.x * impulse.outward,
        y: impulse.upward,
        z: contact.normal.z * impulse.outward,
      }
      state.jumps++
      release()
    } else {
      const travel = primitive(p, 'tangent_motion'),
        fall = primitive(p, 'gravity_scale'),
        clearance = primitive(p, 'maintain_clearance')
      state.elapsed = Math.min(p.duration, state.elapsed + dt)
      actor.stamina = Math.max(
        0,
        actor.stamina - primitive(p, 'consume_stamina').perSecond * dt,
      )
      state.velocity = {
        x: contact.tangent.x * state.direction * travel.speed,
        y: Math.max(
          -fall.maximumDescent,
          state.velocity.y - gravity * fall.factor * dt,
        ),
        z: contact.tangent.z * state.direction * travel.speed,
      }
      // Clearance correction is bounded; the capsule sweep remains authoritative.
      const correction = Math.max(
        -.05,
        Math.min(.05, clearance.distance - contact.distance),
      )
      const delta = {
        x: state.velocity.x * dt + contact.normal.x * correction,
        y: state.velocity.y * dt,
        z: state.velocity.z * dt + contact.normal.z * correction,
      }
      const moved = physics.move(actor.id, actor.position, delta)
      const error = Math.hypot(
        moved.position.x - actor.position.x - delta.x,
        moved.position.z - actor.position.z - delta.z,
      )
      actor.position = moved.position
      actor.vy = state.velocity.y
      actor.yaw = Math.atan2(
        state.velocity.x || contact.tangent.x * state.direction,
        state.velocity.z || contact.tangent.z * state.direction,
      )
      if (error > .04 || moved.grounded) release()
      if (moved.grounded) {
        actor.mode = 'ground'
        actor.vy = 0
        state.phase = 'inactive'
        state.jumps = 0
      }
      return true
    }
  }
  if (state.phase === 'departing') {
    state.velocity.y -= gravity * dt
    const moved = physics.move(actor.id, actor.position, {
      x: state.velocity.x * dt,
      y: state.velocity.y * dt,
      z: state.velocity.z * dt,
    })
    actor.position = moved.position
    actor.vy = state.velocity.y
    actor.mode = moved.grounded ? 'ground' : 'air'
    if (moved.grounded) {
      state.phase = 'inactive'
      state.jumps = 0
      actor.vy = 0
    }
    return true
  }
  return false
}
