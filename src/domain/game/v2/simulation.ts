import { z } from 'zod'
import { nodesOf, vec, type Design, type Ability, type Vec } from './spec.ts'
import { Physics, initPhysics } from './physics.ts'
import { add, sub, scale, length, mix, socketAt } from './pose.ts'
import {
  InteractionRuntime,
  interactionStateSchema,
  type InteractionState,
} from '../interactions/runtime.ts'
import {
  interactionNodeSchema,
  type InteractionNode,
} from '../interactions/spec.ts'
export const DT = 1 / 60
export type Input = {
  x?: number
  z?: number
  sprint?: boolean
  strafe?: boolean
  jump?: boolean
  interact?: boolean
  drop?: boolean
  ability?: string
  cancel?: boolean
  aim?: Vec
}
export type Action = {
  id: string
  ability: string
  tick: number
  released: boolean
  hits: string[]
  direction: Vec
}
export type ActorState = {
  id: string
  specId: string
  position: Vec
  yaw: number
  health: number
  stamina: number
  vy: number
  mode: 'ground' | 'air' | 'hang' | 'climb' | 'dead'
  cooldowns: Record<string, number>
  action: Action | null
  shieldUntil: number
  slowUntil: number
  slowFactor: number
  ledge: string | null
  climbTick: number
  climbStart: Vec | null
}
export type Projectile = {
  id: string
  source: string
  spec: string
  position: Vec
  velocity: Vec
  age: number
  ability: string
}
export type Event = {
  id: string
  tick: number
  actor: string
  type: string
  detail: string
}
export type State = {
  version: 2
  buildId: string
  tick: number
  serial: number
  player: string
  actors: ActorState[]
  projectiles: Projectile[]
  climbed: boolean
  complete: boolean
  events: Event[]
  rng: number
  interactions?: InteractionState
}
export const stateSchema = z
  .object({
    version: z.literal(2),
    buildId: z.string(),
    tick: z.number().int().nonnegative(),
    serial: z.number().int().nonnegative(),
    player: z.string(),
    actors: z.array(
      z
        .object({
          id: z.string(),
          specId: z.string(),
          position: vec,
          yaw: z.number().finite(),
          health: z.number().min(0),
          stamina: z.number().min(0),
          vy: z.number().finite(),
          mode: z.enum(['ground', 'air', 'hang', 'climb', 'dead']),
          cooldowns: z.record(z.string(), z.number().finite()),
          action: z.null(),
          shieldUntil: z.number().finite(),
          slowUntil: z.number().finite(),
          slowFactor: z.number().min(0.2).max(1),
          ledge: z.null(),
          climbTick: z.number().finite(),
          climbStart: z.null(),
        })
        .strict(),
    ),
    projectiles: z.array(z.never()).length(0),
    climbed: z.boolean(),
    complete: z.boolean(),
    events: z.array(
      z.object({
        id: z.string(),
        tick: z.number(),
        actor: z.string(),
        type: z.string(),
        detail: z.string(),
      }),
    ),
    rng: z.number().int(),
    interactions: interactionStateSchema.optional(),
  })
  .strict()
const ticks = (seconds: number) => Math.max(1, Math.round(seconds / DT))
export class Simulation {
  state: State
  physics: Physics
  design: Design
  interactions: InteractionRuntime
  externalObjectives: boolean
  constructor(design: Design, buildId: string, role = 'mage', externalObjectives = false) {
    this.externalObjectives = externalObjectives
    this.design = design
    this.physics = new Physics(nodesOf(design, 'world')[0])
    const specs = nodesOf(design, 'actor').filter(
      (a) => a.role === role || a.role === 'enemy' || a.role === 'target',
    )
    this.state = {
      version: 2,
      buildId,
      tick: 0,
      serial: 0,
      player: specs.find((a) => a.role === role)!.id,
      actors: specs.map((a) => ({
        id: a.id,
        specId: a.id,
        position: { ...a.spawn },
        yaw: 0,
        health: a.health,
        stamina: a.stamina,
        vy: 0,
        mode: 'ground',
        cooldowns: {},
        action: null,
        shieldUntil: 0,
        slowUntil: 0,
        slowFactor: 1,
        ledge: null,
        climbTick: 0,
        climbStart: null,
      })),
      projectiles: [],
      climbed: false,
      complete: false,
      events: [],
      rng: nodesOf(design, 'scenario')[0].seed,
    }
    for (const a of this.state.actors)
      this.physics.add(a.id, this.actorSpec(a), a.position)
    this.physics.refresh()
    this.interactions = new InteractionRuntime(
      design.nodes.filter(
        (n) => interactionNodeSchema.safeParse(n).success,
      ) as InteractionNode[],
      {
        physics: this.physics,
        actors: () => this.state.actors,
        height: (id) =>
          this.actorSpec(this.state.actors.find((a) => a.id === id)!).height,
        event: (id, type, detail) =>
          this.event(this.state.actors.find((a) => a.id === id)!, type, detail),
        bounds: nodesOf(design, 'world')[0],
      },
    )
    if (this.interactions.nodes.length)
      this.state.interactions = this.interactions.state
  }
  static async create(design: Design, id: string, role = design.defaultActor) {
    await initPhysics()
    return new Simulation(design, id, role)
  }
  actorSpec(a: ActorState) {
    return nodesOf(this.design, 'actor').find((n) => n.id === a.specId)!
  }
  get player() {
    return this.state.actors.find((a) => a.id === this.state.player)!
  }
  event(a: ActorState, type: string, detail: string) {
    const id = `${this.state.buildId}:${++this.state.serial}`
    this.state.events.push({
      id,
      tick: this.state.tick,
      actor: a.id,
      type,
      detail,
    })
    if (this.state.events.length > 300) this.state.events.shift()
    return id
  }
  transition(a: ActorState, mode: ActorState['mode']) {
    if (a.mode === mode) return
    this.event(a, 'state', `${a.mode} → ${mode}`)
    a.mode = mode
    if (mode !== 'hang' && mode !== 'climb') {
      a.ledge = null
      a.climbStart = null
    }
  }
  hurt(source: ActorState, target: ActorState, amount: number) {
    if (
      target.health <= 0 ||
      this.actorSpec(source).team === this.actorSpec(target).team ||
      target.shieldUntil > this.state.tick
    )
      return false
    target.health = Math.max(0, target.health - amount)
    this.event(target, 'damage', `${amount} damage from ${source.id}`)
    if (target.health === 0) {
      target.action = null
      this.transition(target, 'dead')
      this.physics.sync(target.id, target.position, false)
    }
    return true
  }
  activate(a: ActorState, id: string, input: Input) {
    const spec = this.actorSpec(a),
      ability = nodesOf(this.design, 'ability').find((x) => x.id === id)
    if (
      !ability ||
      !spec.abilities.includes(id) ||
      a.mode !== 'ground' ||
      a.action ||
      a.health <= 0 ||
      a.stamina < ability.cost ||
      (a.cooldowns[id] ?? 0) > this.state.tick
    ) {
      this.event(
        a,
        'rejected',
        'Ability unavailable: state, resource, or cooldown',
      )
      return false
    }
    const aim = input.aim
        ? sub(input.aim, a.position)
        : { x: Math.sin(a.yaw), y: 0, z: Math.cos(a.yaw) },
      norm = Math.hypot(aim.x, aim.z) || 1,
      direction = { x: aim.x / norm, y: 0, z: aim.z / norm }
    a.yaw = Math.atan2(direction.x, direction.z)
    a.stamina -= ability.cost
    a.cooldowns[id] = this.state.tick + ticks(ability.cooldown)
    a.action = {
      id: this.event(a, 'ability', ability.label),
      ability: id,
      tick: 0,
      released: false,
      hits: [],
      direction,
    }
    return true
  }
  ai(a: ActorState): Input {
    const spec = this.actorSpec(a),
      brain = nodesOf(this.design, 'behavior').find(
        (n) => n.id === spec.behavior,
      )
    if (!brain || a.health <= 0 || this.player.health <= 0) return {}
    const delta = sub(this.player.position, a.position),
      dist = Math.hypot(delta.x, delta.z)
    if (dist < brain.detectionRange) {
      if (dist <= brain.attackRange)
        return this.state.tick % brain.thinkTicks === 0
          ? { ability: spec.abilities[0], aim: this.player.position }
          : {}
      return { x: delta.x / (dist || 1), z: delta.z / (dist || 1) }
    }
    const angle =
        this.state.tick / 120 + nodesOf(this.design, 'scenario')[0].seed,
      target = {
        x: spec.spawn.x + Math.cos(angle) * brain.patrolRadius,
        y: spec.spawn.y,
        z: spec.spawn.z + Math.sin(angle) * brain.patrolRadius,
      },
      p = sub(target, a.position),
      n = Math.max(1, Math.hypot(p.x, p.z))
    return { x: (p.x / n) * 0.3, z: (p.z / n) * 0.3 }
  }
  release(a: ActorState, ability: Ability, action: Action) {
    action.released = true
    this.event(a, 'release', ability.id)
    if (ability.op === 'shield')
      a.shieldUntil = this.state.tick + ticks(ability.duration)
    if (ability.op === 'bolt') {
      const spec = nodesOf(this.design, 'projectile').find(
          (p) => p.id === ability.projectile,
        )!,
        origin = socketAt(
          this.design,
          spec.socket,
          a.position,
          a.yaw,
          this.actorSpec(a).height,
          ability.pose,
          0.5,
        ).position
      const chest = add(a.position, {
        x: 0,
        y: this.actorSpec(a).height * 0.7,
        z: 0,
      })
      const obstruction = this.physics.sweep(chest, origin, spec.radius, [a.id])
      if (obstruction) {
        const target = this.state.actors.find(t=>t.id===obstruction.id)
        if(target && this.hit(a,target,spec.damage,ability.id)) {
          target.slowUntil=this.state.tick+ticks(spec.slowSeconds)
          target.slowFactor=spec.slowFactor
          this.event(a,'impact',target.id)
        } else this.event(a, 'blocked', 'Launch socket is obstructed')
        return
      }
      if (this.state.projectiles.length >= 64) {
        this.event(a, 'blocked', 'Projectile budget reached')
        return
      }
      this.state.projectiles.push({
        id: `${action.id}:projectile`,
        source: a.id,
        spec: spec.id,
        position: origin,
        velocity: scale(action.direction, spec.speed),
        age: 0,
        ability: ability.id,
      })
    }
  }
  traversal(a: ActorState, input: Input) {
    const spec = this.actorSpec(a),
      m = nodesOf(this.design, 'movement').find((m) => m.id === spec.movement)!,
      world = nodesOf(this.design, 'world')[0]
    if (a.mode === 'hang' || a.mode === 'climb') {
      let ledge = world.ledges.find((l) => l.id === a.ledge)
      if (!ledge || input.drop || !this.physics.supported(ledge.landing)) {
        this.transition(a, 'air')
        return false
      }
      if (a.mode === 'hang') {
        const nextX = a.position.x + (input.x ?? 0) * m.shimmySpeed * DT
        if (nextX < ledge.start.x || nextX > ledge.end.x) {
          const connection = world.ledges.find(
            (l) =>
              ledge!.connects.includes(l.id) &&
              nextX >= l.start.x &&
              nextX <= l.end.x,
          )
          if (connection) {
            ledge = connection
            a.ledge = ledge.id
          }
        }
        a.position = {
          x: Math.max(ledge.start.x, Math.min(ledge.end.x, nextX)),
          y: ledge.start.y - spec.height * 0.9,
          z: ledge.start.z - spec.radius - 0.05,
        }
        if (input.interact) {
          const landing = { ...ledge.landing, x: a.position.x },
            above = { ...a.position, y: landing.y + 0.04 }
          if (
            this.physics.free(a.id, landing) &&
            this.physics.free(a.id, above)
          ) {
            a.climbStart = { ...a.position }
            a.climbTick = 0
            this.transition(a, 'climb')
          } else
            this.event(
              a,
              'blocked',
              'Climb landing or overhead clearance is blocked',
            )
        }
      } else {
        a.climbTick++
        const t = Math.min(1, a.climbTick / ticks(m.climbSeconds)),
          landing = { ...ledge.landing, x: a.climbStart!.x },
          start = a.climbStart!,
          above = { ...start, y: landing.y + 0.04 },
          next =
            t < 0.6
              ? mix(start, above, t / 0.6)
              : mix(above, { ...landing, y: landing.y + 0.02 }, (t - 0.6) / 0.4)
        if (!this.physics.free(a.id, next)) {
          this.transition(a, 'air')
          return false
        }
        a.position = next
        if (t === 1) {
          this.transition(a, 'ground')
          a.vy = 0
          if (a.id === this.state.player) this.state.climbed = true
          this.event(a, 'climbed', 'Ledge traversal complete')
        }
      }
      return true
    }
    if (a.mode === 'air' && input.interact && spec.canClimb && !a.action) {
      const grip = world.ledges.find(
        (l) =>
          a.position.x >= l.start.x &&
          a.position.x <= l.end.x &&
          Math.abs(a.position.z - l.start.z) <= m.grabReach + spec.radius &&
          Math.abs(a.position.y + spec.height * 0.9 - l.start.y) <=
            m.grabReach &&
          Math.cos(a.yaw) > 0.4,
      )
      if (grip) {
        a.ledge = grip.id
        a.vy = 0
        this.transition(a, 'hang')
        this.event(a, 'grip', grip.id)
        return true
      }
    }
    return false
  }
  step(input: Input = {}) {
    this.state.tick++
    for (const a of this.state.actors)
      this.physics.sync(a.id, a.position, a.health > 0)
    this.physics.refresh()
    const claimed = this.interactions.tick(this.state.player, input)
    if (this.state.interactions)
      this.state.interactions = this.interactions.state
    for (const a of this.state.actors) {
      if (a.health <= 0) continue
      if (claimed.has(a.id)) {
        this.physics.sync(a.id, a.position, a.health > 0)
        continue
      }
      const intent = a.id === this.state.player ? input : this.ai(a),
        spec = this.actorSpec(a),
        m = nodesOf(this.design, 'movement').find(
          (m) => m.id === spec.movement,
        )!
      if (intent.cancel && a.action) {
        a.action = null
        this.event(a, 'cancelled', 'Action cancelled; cost remains committed')
      }
      if (intent.ability) this.activate(a, intent.ability, intent)
      if (this.traversal(a, intent)) {
        this.physics.sync(a.id, a.position)
        continue
      }
      let x = intent.x ?? 0,
        z = intent.z ?? 0
      const norm = Math.max(1, Math.hypot(x, z))
      x /= norm
      z /= norm
      if (!a.action && !intent.strafe && Math.hypot(x, z) > 0.01) a.yaw = Math.atan2(x, z)
      if (intent.jump && a.mode === 'ground' && !a.action) {
        a.vy = m.jump
        this.transition(a, 'air')
      }
      const sprint = intent.sprint && a.stamina > 0 && !a.action
      let speed = sprint ? m.sprint : m.speed
      speed *= a.slowUntil > this.state.tick ? a.slowFactor : 1
      a.stamina = Math.max(
        0,
        Math.min(
          spec.stamina,
          a.stamina +
            DT *
              (sprint && Math.hypot(x, z) > 0.1
                ? -m.sprintDrain
                : m.staminaRecovery),
        ),
      )
      let dx = x * speed * DT,
        dz = z * speed * DT
      const action = a.action
      if (action) {
        const ability = nodesOf(this.design, 'ability').find(
          (v) => v.id === action.ability,
        )!
        action.tick++
        const start = ticks(ability.windup),
          end = start + ticks(ability.active)
        dx = 0
        dz = 0
        if (action.tick >= start && !action.released)
          this.release(a, ability, action)
        if (action.tick >= start && action.tick <= end) {
          if (ability.op === 'dodge' || (ability.op === 'roll' && action.tick > start)) {
            if (ability.op === 'dodge') a.shieldUntil = this.state.tick + 1
            dx = (action.direction.x * ability.distance) / ticks(ability.active)
            dz = (action.direction.z * ability.distance) / ticks(ability.active)
          }
          if (ability.op === 'strike') {
            const origin = add(a.position, {
                x: 0,
                y: spec.height * 0.6,
                z: 0,
              }),
              end = add(origin, scale(action.direction, ability.range)),
              hit = this.physics.sweep(origin, end, 0.25, [
                a.id,
                ...action.hits,
              ])
            if (hit) {
              const target = this.state.actors.find((t) => t.id === hit.id)
              if (target) {
                action.hits.push(target.id)
                this.hit(a, target, ability.amount, ability.id)
              }
            }
          }
        }
        if (action.tick >= end + ticks(ability.recovery)) a.action = null
      }
      a.vy -= m.gravity * DT
      const moved = this.physics.move(a.id, a.position, {
        x: dx,
        y: a.vy * DT,
        z: dz,
      })
      a.position = moved.position
      const world = nodesOf(this.design, 'world')[0]
      a.position.x = Math.max(
        -world.width / 2 + spec.radius,
        Math.min(world.width / 2 - spec.radius, a.position.x),
      )
      a.position.z = Math.max(
        -world.depth / 2 + spec.radius,
        Math.min(world.depth / 2 - spec.radius, a.position.z),
      )
      if (moved.grounded && a.vy <= 0) {
        a.vy = 0
        this.transition(a, 'ground')
      } else if (a.mode === 'ground') this.transition(a, 'air')
      if (a.position.y < -10) {
        a.health = 0
        a.action = null
        this.transition(a, 'dead')
      }
      this.physics.sync(a.id, a.position, a.health > 0)
    }
    this.physics.refresh()
    this.state.projectiles = this.state.projectiles.filter((p) => {
      const spec = nodesOf(this.design, 'projectile').find(
          (s) => s.id === p.spec,
        )!,
        source = this.state.actors.find((a) => a.id === p.source)!
      p.velocity.y += spec.gravity * DT
      const end = add(p.position, scale(p.velocity, DT)),
        exclude = this.state.actors
          .filter(
            (a) =>
              a.id === source.id ||
              a.health <= 0 ||
              this.actorSpec(a).team === this.actorSpec(source).team,
          )
          .map((a) => a.id),
        hit = this.physics.sweep(p.position, end, spec.radius, exclude)
      p.age++
      if (hit) {
        const target = this.state.actors.find((a) => a.id === hit.id)
        if (target && this.hit(source, target, spec.damage, p.ability)) {
          target.slowUntil = this.state.tick + ticks(spec.slowSeconds)
          target.slowFactor = spec.slowFactor
        }
        this.event(source, 'impact', hit.id)
        return false
      }
      p.position = end
      return p.age < ticks(spec.lifetime)
    })
    if (
      !this.externalObjectives && input.interact &&
      !claimed.has(this.state.player) &&
      this.player.mode === 'ground' &&
      this.player.health > 0
    ) {
      const objective = nodesOf(this.design, 'world')[0].objective,
        s = nodesOf(this.design, 'scenario')[0]
      if (
        length(sub(objective, this.player.position)) < 1.6 &&
        (!s.requireClimb || this.state.climbed) &&
        (!s.requireEnemyDefeat ||
          this.state.actors
            .filter((a) => this.actorSpec(a).role === 'enemy')
            .every((a) => a.health === 0)) &&
        !this.state.complete
      ) {
        this.state.complete = true
        this.event(this.player, 'complete', 'Beacon activated')
      }
    }
    return this.state
  }
  canSave() {
    return (
      this.interactions.canSave() &&
      this.player.mode === 'ground' &&
      this.player.health > 0 &&
      this.state.projectiles.length === 0 &&
      this.state.actors.every(
        (a) => !a.action && (a.mode === 'ground' || a.mode === 'dead'),
      )
    )
  }
  hit(source: ActorState, target: ActorState, amount: number, _ability: string) {
    return this.hurt(source, target, amount)
  }
  save() {
    if (!this.canSave())
      throw new Error(
        'Save at a grounded checkpoint after actions and projectiles finish.',
      )
    return structuredClone(this.state)
  }
  restore(value: unknown) {
    const s = stateSchema.parse(value)
    if (
      s.buildId !== this.state.buildId ||
      s.player !== this.state.player ||
      s.actors.length !== this.state.actors.length ||
      new Set(s.actors.map((a) => a.id)).size !== s.actors.length
    )
      throw new Error('Save belongs to a different build or archetype')
    for (const a of s.actors) {
      const current = this.state.actors.find((x) => x.id === a.id)
      if (!current || current.specId !== a.specId)
        throw new Error('Invalid save actor')
      const spec = this.actorSpec(current)
      if (
        a.health > spec.health ||
        a.stamina > spec.stamina
      )
        throw new Error('Invalid save state')
    }
    const previous = this.state,
      previousInteractions = structuredClone(this.interactions.state)
    this.state = s as State
    try {
      for (const a of this.state.actors)this.physics.sync(a.id,a.position,a.health>0)
      this.physics.refresh()
      this.interactions.restore(
        s.interactions ?? { entities: {}, sessions: {} },
      )
      for(const a of s.actors)if(a.health>0&&!s.interactions?.sessions[a.id]&&!this.physics.free(a.id,a.position))throw new Error('Invalid save state')
    } catch (error) {
      this.state = previous
      for (const a of this.state.actors)this.physics.sync(a.id,a.position,a.health>0)
      this.physics.refresh()
      this.interactions.restore(previousInteractions)
      throw error
    }
    for (const a of this.state.actors)
      this.physics.sync(a.id, a.position, a.health > 0)
    this.physics.refresh()
  }
  dispose() {
    this.physics.dispose()
  }
}
