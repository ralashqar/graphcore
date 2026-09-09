import type { UnifiedSimulation } from './simulation.ts'
import type { Input, ActorState } from '../v2/simulation.ts'
import { programAbilityId, type ReactionProgram } from './performance.ts'
import { emptyMechanicState } from './mechanics.ts'
import type { Ability } from '../v2/spec.ts'
import type { Action } from '../v2/simulation.ts'

type Reaction = {
  profile: ReactionProgram
  phase: 'recoil' | 'fall' | 'prone' | 'getUp'
  time: number
  velocity: { x: number; y: number; z: number }
}
export class PerformanceController {
  velocity = { x: 0, z: 0 }
  roll: { id: string; entry: { x: number; z: number }; yaw: number; heading: number; moving: boolean } | null = null
  held = { roll: false, uppercut: false }
  reactions: Record<string, Reaction> = {}
  reset() {
    this.velocity = { x: 0, z: 0 }
    this.roll = null
    this.held = { roll: false, uppercut: false }
    this.reactions = {}
  }
  prepare(sim: UnifiedSimulation, input: Input): Input {
    for (const id of Object.keys(this.reactions)) {
      if (!sim.state.actors.some(a => a.id === id && a.health > 0)) delete this.reactions[id]
    }
    const actor = sim.player
    for (const kind of ['roll', 'uppercut'] as const) {
      const tap = !!input[kind] && !this.held[kind]
      this.held[kind] = !!input[kind]
      const program = sim.source.mechanics?.performance?.abilities.find(
        (a) => a.kind === kind,
      )
      if (
        tap &&
        program &&
        !actor.action &&
        actor.mode === 'ground' &&
        actor.health > 0 &&
        !sim.interactions.owns(actor.id) &&
        !sim.forcedMovement[actor.id] &&
        !this.reactions[actor.id]
      ) {
        sim.startComposedAction(programAbilityId(program), {
          ...input,
          aim: undefined,
        })
      }
    }
    if (this.reactions[actor.id]) return {}
    if (actor.action?.ability.startsWith('runtime.program.'))
      return {
        ...input,
        x: actor.action.ability === 'runtime.program.roll' ? input.x : 0,
        z: actor.action.ability === 'runtime.program.roll' ? input.z : 0,
        ability: undefined,
        cancel: false,
        jump: false,
        traverse: false,
        interact: false,
        drop: false,
      }
    return input
  }
  rollDisplacement(sim: UnifiedSimulation, actor: ActorState, ability: Ability, action: Action, input: Input, base: { x: number; z: number }) {
    const program = sim.source.mechanics?.performance?.abilities.find(a => programAbilityId(a) === action.ability)
    if (program?.movementPolicy !== 'momentum-1.0.0') return base
    if (this.roll?.id !== action.id) {
      const yaw = Math.atan2(action.direction.x, action.direction.z)
      this.roll = { id: action.id, entry: { ...this.velocity }, yaw, heading: yaw, moving: Math.hypot(this.velocity.x,this.velocity.z)>.01 }
    }
    const roll = this.roll, smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t*t*(3-2*t) }
    const movement = sim.design.nodes.find(n => n.kind === 'movement' && n.id === sim.actorSpec(actor).movement)
    if (movement?.kind !== 'movement') return base
    const magnitude = Math.hypot(input.x ?? 0, input.z ?? 0), length = Math.max(1, magnitude)
    const speed = (input.sprint && actor.stamina > 0 ? movement.sprint : movement.speed) * (actor.slowUntil > sim.state.tick ? actor.slowFactor : 1)
    const target = { x: (input.x ?? 0)/length*speed, z: (input.z ?? 0)/length*speed }
    const seconds = action.tick/60, recovery = smooth((seconds-ability.windup-ability.active)/ability.recovery)
    if (magnitude > .01) {
      roll.moving = true
      const difference = Math.atan2(Math.sin(Math.atan2(target.x,target.z)-roll.yaw),Math.cos(Math.atan2(target.x,target.z)-roll.yaw))
      const desired = roll.yaw + Math.max(-.35, Math.min(.35, difference))
      roll.heading += Math.max(-1.5/60, Math.min(1.5/60, desired-roll.heading))
    }
    // Blend velocity ownership, never add a second locomotion displacement.
    const carry = 1-smooth((seconds-ability.windup)/Math.max(.1,ability.active*.3))
    const natural = Math.hypot(base.x,base.z)*60
    const x = (roll.entry.x*carry + Math.sin(roll.heading)*natural*(1-carry))*(1-recovery) + target.x*recovery
    const z = (roll.entry.z*carry + Math.cos(roll.heading)*natural*(1-carry))*(1-recovery) + target.z*recovery
    actor.yaw = roll.heading
    // At rest retain the authored distance; moving rolls include entry and exit travel.
    if (!roll.moving) return base
    return { x:x/60, z:z/60 }
  }
  hit(
    sim: UnifiedSimulation,
    source: ActorState,
    target: ActorState,
    ability: string,
  ) {
    const p = sim.source.mechanics?.performance
    const action = p?.abilities.find((a) => programAbilityId(a) === ability)
    const profile = p?.reactions.find((r) => r.id === action?.reaction)
    const instance = sim.source.nodes.find(
      (n) => n.kind === 'actor_instance' && n.id === target.id,
    )
    if (
      !profile ||
      instance?.kind !== 'actor_instance' ||
      !profile.actorDefinitions.includes(instance.definition) ||
      target.health <= 0 ||
      this.reactions[target.id] ||
      sim.interactions.owns(target.id) || sim.forcedMovement[target.id]
    )
      return
    const dx = target.position.x - source.position.x,
      dz = target.position.z - source.position.z,
      n = Math.hypot(dx, dz) || 1
    target.action = null
    sim.mechanicStates[target.id] = emptyMechanicState(target.position)
    target.yaw = Math.atan2(-dx, -dz)
    this.reactions[target.id] = {
      profile,
      phase: 'recoil',
      time: 0,
      velocity: {
        x: (dx / n) * profile.impulse,
        y: profile.lift,
        z: (dz / n) * profile.impulse,
      },
    }
    sim.event(target, 'reaction_started', profile.id)
  }
  motion(sim: UnifiedSimulation, actor: ActorState) {
    const p = sim.source.mechanics?.performance,
      r = this.reactions[actor.id]
    const a = p?.abilities.find(
      (a) => programAbilityId(a) === actor.action?.ability,
    )
    const sequence = p?.sequences.find(
      (s) => s.id === (r ? r.profile[r.phase] : a?.motion),
    )
    return sequence
      ? { sequence, seconds: r ? r.time : (actor.action?.tick ?? 0) / 60 }
      : undefined
  }
  move(sim: UnifiedSimulation, actor: ActorState): boolean {
    const r = this.reactions[actor.id]
    if (!r) return false
    if (actor.health <= 0) {
      delete this.reactions[actor.id]
      return false
    }
    const movement = sim.design.nodes.find(
      (n) => n.kind === 'movement' && n.id === sim.actorSpec(actor).movement,
    )
    if (movement?.kind !== 'movement') return false
    r.time += 1 / 60
    r.velocity.y -= movement.gravity / 60
    const moved = sim.physics.move(actor.id, actor.position, {
      x: r.velocity.x / 60,
      y: r.velocity.y / 60,
      z: r.velocity.z / 60,
    })
    actor.position = moved.position
    actor.vy = r.velocity.y
    const grounded = moved.grounded && r.velocity.y <= 0
    if (grounded) {
      actor.vy = 0
      r.velocity.y = 0
    }
    sim.transition(actor, grounded ? 'ground' : 'air')
    const drag = Math.exp(-(grounded ? 12 : 2) / 60)
    r.velocity.x *= drag
    r.velocity.z *= drag
    if (actor.position.y < -10) {
      actor.health = 0
      sim.transition(actor, 'dead')
      delete this.reactions[actor.id]
      return true
    }
    const duration = this.motion(sim, actor)?.sequence.duration ?? 1
    const next = (phase: Reaction['phase']) => {
      r.phase = phase
      r.time = 0
      sim.event(actor, 'reaction_phase', phase)
    }
    if (r.phase === 'recoil' && r.time >= duration) next('fall')
    else if (r.phase === 'fall' && r.time >= duration && grounded) next('prone')
    else if (
      r.phase === 'prone' &&
      r.time >= r.profile.proneSeconds &&
      grounded &&
      sim.physics.free(actor.id, actor.position) &&
      sim.physics.supported(actor.position)
    )
      next('getUp')
    else if (r.phase === 'getUp') {
      if (!grounded || !sim.physics.free(actor.id, actor.position))
        next('prone')
      else if (r.time >= duration) {
        delete this.reactions[actor.id]
        sim.event(actor, 'reaction_complete', r.profile.id)
      }
    }
    return true
  }
}
