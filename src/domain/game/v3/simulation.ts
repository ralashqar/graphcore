import { z } from 'zod'
import {
  Simulation,
  type Input,
  type State,
  type ActorState,
  type Action,
} from '../v2/simulation.ts'
import { initPhysics } from '../v2/physics.ts'
import { type Ability } from '../v2/spec.ts'
import { of, type Design } from './spec.ts'
import { runtimeDesign, validate } from './compiler.ts'
import { sub, length } from '../v2/pose.ts'

const missionSchema = z
  .object({
    inventory: z.record(z.string(), z.number().int().nonnegative()),
    completed: z.array(z.string()),
    pickups: z.array(z.string()),
    activated: z.array(z.string()),
    unlocked: z.array(z.string()),
    talked: z.array(z.string()),
    used: z.array(z.string()),
  })
  .strict()
export type MissionState = z.infer<typeof missionSchema>
export class UnifiedSimulation extends Simulation {
  declare state: State & { mission: MissionState }
  source: Design
  constructor(design: Design, id: string) {
    super(runtimeDesign(design), id, 'mage', true)
    this.source = design
    this.state.mission = {
      inventory: {},
      completed: [],
      pickups: [],
      activated: [],
      unlocked: [],
      talked: [],
      used: [],
    }
    for (const a of of(design, 'actor_instance'))
      if (a.activation) {
        const state = this.state.actors.find((s) => s.id === a.id)!
        state.health = 0
        state.mode = 'dead'
        this.physics.sync(state.id, state.position, false)
      } else this.state.mission.activated.push(a.id)
    this.physics.refresh()
    this.updateLocks()
  }
  static async createUnified(design: Design, id: string) {
    const errors = validate(design)
    if (errors.length) throw new Error(JSON.stringify(errors))
    await initPhysics()
    return new UnifiedSimulation(design, id)
  }
  ready(prerequisites: string[]) {
    return prerequisites.every((id) =>
      this.state.mission.completed.includes(id),
    )
  }
  near(position: { x: number; y: number; z: number }, range = 1.7) {
    return length(sub(this.player.position, position)) <= range
  }
  updateLocks() {
    for (const lock of of(this.source, 'lock')) {
      const entity = this.interactions.get(lock.entity, 'interactive_entity')
      if (entity.mechanism)
        this.interactions.get(entity.mechanism, 'mechanism').locked =
          !this.state.mission.unlocked.includes(lock.id)
    }
  }
  interactMission(): boolean {
    if (
      this.interactions.owns(this.player.id) ||
      this.player.mode !== 'ground' ||
      this.player.health <= 0 ||
      this.player.action
    )
      return false
    const m = this.state.mission
    for (const n of of(this.source, 'pickup'))
      if (
        !m.pickups.includes(n.id) &&
        this.ready(n.prerequisites) &&
        this.near(n.position)
      ) {
        const count = m.inventory[n.item] ?? 0,
          limit = of(this.source, 'item').find(
            (i) => i.id === n.item,
          )!.stackLimit
        if (
          count + n.quantity > limit ||
          Object.values(m.inventory).reduce((a, b) => a + b, 0) + n.quantity >
            this.source.inventoryCapacity
        ) {
          this.event(this.player, 'inventory_full', 'Inventory is full')
          return true
        }
        m.inventory[n.item] = count + n.quantity
        m.pickups.push(n.id)
        this.event(this.player, 'collected', n.label)
        return true
      }
    for (const n of of(this.source, 'objective'))
      if (
        n.op === 'deliver' &&
        !m.completed.includes(n.id) &&
        this.ready(n.prerequisites)
      ) {
        const actor = this.state.actors.find((a) => a.id === n.target)!
        if (actor.health > 0 && this.near(actor.position)) {
          if ((m.inventory[n.item!] ?? 0) >= n.quantity)
            this.complete(n.id, { item: n.item!, quantity: n.quantity })
          else
            this.event(
              this.player,
              'missing_item',
              'Required delivery item is missing',
            )
          return true
        }
      }
    for (const n of of(this.source, 'dialogue')) {
      const actor = this.state.actors.find((a) => a.id === n.actor)!
      if (
        actor.health > 0 &&
        this.ready(n.prerequisites) &&
        this.near(actor.position)
      ) {
        if (!m.talked.includes(n.id)) m.talked.push(n.id)
        this.event(this.player, 'dialogue', n.text)
        return true
      }
    }
    const candidate = this.interactions.nearest(this.player.id)
    if (candidate) {
      const lock = of(this.source, 'lock').find(
        (l) => l.entity === candidate.e.id,
      )
      if (
        lock &&
        !m.unlocked.includes(lock.id) &&
        !this.interactions.get(candidate.e.mechanism!, 'mechanism').locked
      )
        return false
      if (lock && !m.unlocked.includes(lock.id)) {
        if (!(m.inventory[lock.item] > 0)) {
          this.event(this.player, 'locked', 'A key is required')
          return true
        }
        // Commit the key only once, after the spatial request has been admitted.
        this.interactions.get(candidate.e.mechanism!, 'mechanism').locked =
          false
        if (
          this.interactions.request(
            this.player.id,
            candidate.e.id,
            candidate.i.id,
          )
        ) {
          if (lock.consume) m.inventory[lock.item]--
          m.unlocked.push(lock.id)
          this.event(this.player, 'unlocked', candidate.e.label)
        } else this.updateLocks()
        return true
      }
    }
    return false
  }
  complete(id: string, consume?: { item: string; quantity: number }) {
    if (this.state.mission.completed.includes(id)) return
    const objective = of(this.source, 'objective').find((o) => o.id === id)!,
      inventory = { ...this.state.mission.inventory }
    if (consume) {
      if ((inventory[consume.item] ?? 0) < consume.quantity) return
      inventory[consume.item] -= consume.quantity
    }
    for (const r of objective.rewards)
      inventory[r.item] = (inventory[r.item] ?? 0) + r.quantity
    if (
      Object.values(inventory).reduce((a, b) => a + b, 0) >
        this.source.inventoryCapacity ||
      Object.entries(inventory).some(
        ([id, n]) =>
          n > of(this.source, 'item').find((i) => i.id === id)!.stackLimit,
      )
    ) {
      this.event(
        this.player,
        'inventory_full',
        'Make room for the objective reward',
      )
      return
    }
    this.state.mission.inventory = inventory
    this.state.mission.completed.push(id)
    this.event(this.player, 'objective', objective.label)
  }
  override step(input: Input = {}) {
    if (input.ability && !input.aim) {
      const ability = this.design.nodes.find(
        (n) => n.kind === 'ability' && n.id === input.ability,
      )
      if (
        ability?.kind === 'ability' &&
        (ability.op === 'bolt' || ability.op === 'strike')
      ) {
        const target = this.state.actors
          .filter(
            (a) =>
              a.health > 0 &&
              this.actorSpec(a).team === 'hostile' &&
              length(sub(a.position, this.player.position)) <= ability.range,
          )
          .sort(
            (a, b) =>
              length(sub(a.position, this.player.position)) -
              length(sub(b.position, this.player.position)),
          )[0]
        if (target) input = { ...input, aim: target.position }
      }
    }
    const serial = this.state.serial,
      claimed = input.interact && this.interactMission()
    super.step(claimed ? { ...input, interact: false } : input)
    const m = this.state.mission
    for (const event of this.state.events.filter(
      (e) =>
        e.tick === this.state.tick && Number(e.id.split(':').at(-1)) > serial,
    )) {
      if (event.type === 'interaction_attached') {
        const id = event.detail.split(':')[0]
        if (!m.used.includes(id)) m.used.push(id)
      }
    }
    for (const e of of(this.source, 'interactive_entity'))
      if (e.mechanism) {
        const s = this.interactions.state.entities[e.id],
          mechanism = this.interactions.get(e.mechanism, 'mechanism')
        if (s.angle >= mechanism.openAngle - 0.02 && !m.used.includes(e.id))
          m.used.push(e.id)
      }
    for (const objective of of(this.source, 'objective')) {
      if (
        m.completed.includes(objective.id) ||
        !this.ready(objective.prerequisites)
      )
        continue
      const done =
        objective.op === 'talk'
          ? m.talked.includes(objective.target)
          : objective.op === 'collect'
            ? m.pickups.includes(objective.target)
            : objective.op === 'interact'
              ? m.used.includes(objective.target)
              : objective.op === 'defeat'
                ? m.activated.includes(objective.target) &&
                  this.state.actors.find((a) => a.id === objective.target)
                    ?.health === 0
                : objective.op === 'reach'
                  ? this.near(
                      of(this.source, 'region').find(
                        (r) => r.id === objective.target,
                      )!.position,
                      of(this.source, 'region').find(
                        (r) => r.id === objective.target,
                      )!.radius,
                    )
                  : false
      if (done) this.complete(objective.id)
    }
    for (const instance of of(this.source, 'actor_instance'))
      if (
        instance.activation &&
        this.ready([instance.activation]) &&
        !m.activated.includes(instance.id)
      ) {
        const actor = this.state.actors.find((a) => a.id === instance.id)!
        actor.health = this.actorSpec(actor).health
        actor.mode = 'ground'
        m.activated.push(actor.id)
        this.physics.sync(actor.id, actor.position, true)
      }
    this.state.complete = of(this.source, 'objective')
      .filter((o) => o.required)
      .every((o) => m.completed.includes(o.id))
    return this.state
  }
  summary() {
    const next = of(this.source, 'objective').filter(
      (o) =>
        !this.state.mission.completed.includes(o.id) &&
        this.ready(o.prerequisites),
    )
    return this.state.complete
      ? 'Mission complete'
      : next.map((o) => o.label).join(' · ')
  }
  hint() {
    const m = this.state.mission
    for (const n of of(this.source, 'pickup'))
      if (
        !m.pickups.includes(n.id) &&
        this.ready(n.prerequisites) &&
        this.near(n.position)
      )
        return `E · ${n.label}`
    for (const n of of(this.source, 'dialogue'))
      if (this.near(this.state.actors.find((a) => a.id === n.actor)!.position))
        return `E · ${n.label}`
    return this.interactions.hint(this.player.id)
  }
  override save() {
    return { ...super.save(), mission: structuredClone(this.state.mission) }
  }
  override restore(value: unknown) {
    const { mission, ...state } = value as Record<string, unknown>,
      m = missionSchema.parse(mission)
    for (const [ids, kind] of [
      [m.completed, 'objective'],
      [m.pickups, 'pickup'],
      [m.activated, 'actor_instance'],
      [m.unlocked, 'lock'],
      [m.talked, 'dialogue'],
      [m.used, 'interactive_entity'],
    ] as const) {
      if (
        new Set(ids).size !== ids.length ||
        ids.some(
          (id) =>
            !this.source.nodes.some((n) => n.id === id && n.kind === kind),
        )
      )
        throw new Error('Unknown checkpoint reference')
    }
    for (const [id, count] of Object.entries(m.inventory)) {
      const item = of(this.source, 'item').find((n) => n.id === id)
      if (!item || count > item.stackLimit) throw new Error('Invalid inventory')
    }
    if (
      Object.values(m.inventory).reduce((a, b) => a + b, 0) >
      this.source.inventoryCapacity
    )
      throw new Error('Inventory exceeds capacity')
    for (const id of m.completed) {
      const o = of(this.source, 'objective').find((o) => o.id === id)!
      if (!o.prerequisites.every((p) => m.completed.includes(p)))
        throw new Error('Invalid objective prerequisites')
    }
    super.restore(state)
    this.state.mission = m
    this.state.complete = of(this.source, 'objective')
      .filter((o) => o.required)
      .every((o) => m.completed.includes(o.id))
    this.updateLocks()
  }
  override release(actor: ActorState, ability: Ability, action: Action) {
    super.release(actor, ability, action)
    this.applyEffects(actor, actor, ability.id, 'release')
  }
  override hit(
    source: ActorState,
    target: ActorState,
    amount: number,
    ability: string,
  ) {
    const hit = super.hit(source, target, amount, ability)
    if (hit) this.applyEffects(source, target, ability, 'hit')
    return hit
  }
  applyEffects(
    source: ActorState,
    target: ActorState,
    ability: string,
    phase: 'release' | 'hit',
  ) {
    for (const binding of of(this.source, 'ability_effects').filter(
      (b) => b.ability === ability && b.phase === phase,
    ))
      for (const id of binding.effects) {
        const e = of(this.source, 'effect').find((e) => e.id === id)!,
          a = e.target === 'self' ? source : target
        if (e.op === 'damage') super.hurt(source, a, Math.max(0, e.amount))
        if (e.op === 'heal')
          a.health = Math.min(
            this.actorSpec(a).health,
            a.health + Math.max(0, e.amount),
          )
        if (e.op === 'resource')
          a.stamina = Math.max(
            0,
            Math.min(this.actorSpec(a).stamina, a.stamina + e.amount),
          )
        if (e.op === 'status') {
          a.slowFactor = e.amount
          a.slowUntil = this.state.tick + Math.ceil(e.duration * 60)
        }
        if (e.op === 'impulse') {
          const moved = this.physics.move(a.id, a.position, {
            x: Math.sin(source.yaw) * e.amount * 0.1,
            y: 0,
            z: Math.cos(source.yaw) * e.amount * 0.1,
          })
          a.position = moved.position
          this.physics.sync(a.id, a.position)
        }
        if (e.op === 'projectile' && e.projectile) {
          const spec = this.design.nodes.find(
            (n) => n.kind === 'ability' && n.id === ability,
          )
          if (spec?.kind === 'ability')
            super.release(
              source,
              { ...spec, op: 'bolt', projectile: e.projectile },
              {
                id: this.event(source, 'effect', e.id),
                ability,
                tick: 0,
                released: false,
                hits: [],
                direction: {
                  x: Math.sin(source.yaw),
                  y: 0,
                  z: Math.cos(source.yaw),
                },
              },
            )
        }
      }
  }
}
