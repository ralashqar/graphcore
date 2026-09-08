import { z } from 'zod'
import { vector, type InteractionNode, type Entity, type Vec } from './spec.ts'
import { anchorAt, contactPoseAt } from './poses.ts'
import { add, sub, length, mix, rotate } from '../v2/pose.ts'
import type { Physics } from '../v2/physics.ts'
import type { ActorState, Input } from '../v2/simulation.ts'
const DT = 1 / 60
const transformSchema = z
  .object({ position: vector, yaw: z.number().finite() })
  .strict()
const entityStateSchema = transformSchema
  .extend({
    enabled: z.boolean(),
    speed: z.number().finite().min(-8).max(8),
    angle: z.number().finite().min(0).max(2.6),
    goal: z.number().finite().min(0).max(2.6),
    occupants: z.record(z.string(), z.string()),
  })
  .strict()
const sessionSchema = z
  .object({
    actor: z.string(),
    entity: z.string(),
    interaction: z.string(),
    phase: z.number().int().nonnegative(),
    tick: z.number().int().nonnegative(),
    start: transformSchema,
    safe: transformSchema,
    target: transformSchema,
    health: z.number().finite(),
    attached: z.boolean(),
  })
  .strict()
export const interactionStateSchema = z
  .object({
    entities: z.record(z.string(), entityStateSchema),
    sessions: z.record(z.string(), sessionSchema),
  })
  .strict()
export type InteractionState = z.infer<typeof interactionStateSchema>
type Session = z.infer<typeof sessionSchema>
export type InteractionPort = {
  physics: Physics
  actors: () => ActorState[]
  height: (id: string) => number
  event: (id: string, type: string, detail: string) => void
  bounds: { width: number; depth: number }
}
const approach = (a: number, b: number, d: number) =>
  a + Math.max(-d, Math.min(d, b - a))
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
export class InteractionRuntime {
  state: InteractionState = { entities: {}, sessions: {} }
  poses = new Map<string, Record<string, Vec>>()
  nodes: InteractionNode[]
  port: InteractionPort
  constructor(nodes: InteractionNode[], port: InteractionPort) {
    this.nodes = nodes
    this.port = port
    for (const e of nodes.filter(
      (n): n is Entity => n.kind === 'interactive_entity',
    )) {
      this.state.entities[e.id] = {
        position: { ...e.position },
        yaw: e.yaw,
        enabled: e.enabled,
        speed: 0,
        angle: 0,
        goal: 0,
        occupants: {},
      }
      const body = this.get(e.body, 'body'),
        mechanism = e.mechanism ? this.get(e.mechanism, 'mechanism') : null,
        size = mechanism?.size ?? {
          x: body.width,
          y: body.height,
          z: body.length,
        }
      this.port.physics.addProp(e.id, size, e.position, e.yaw)
      this.sync(e)
    }
    this.port.physics.refresh()
  }
  get<K extends InteractionNode['kind']>(
    id: string,
    kind: K,
  ): Extract<InteractionNode, { kind: K }> {
    const n = this.nodes.find((n) => n.id === id && n.kind === kind)
    if (!n) throw new Error(`Missing ${kind} ${id}`)
    return n as Extract<InteractionNode, { kind: K }>
  }
  actor(id: string) {
    const a = this.port.actors().find((a) => a.id === id)
    if (!a) throw new Error('Interaction actor disappeared')
    return a
  }
  owns(id: string) {
    return !!this.state.sessions[id]
  }
  anchor(e: Entity, id: string) {
    return anchorAt(
      this.get(e.anchors, 'anchor_set'),
      id,
      this.state.entities[e.id],
    )
  }
  sync(e: Entity) {
    const s = this.state.entities[e.id]
    let p = s.position,
      yaw = s.yaw
    if (e.mechanism) {
      const m = this.get(e.mechanism, 'mechanism')
      yaw -= s.angle
      p = add(p, rotate({ x: m.size.x / 2, y: 0, z: 0 }, yaw))
    }
    this.port.physics.syncProp(e.id, p, yaw, s.enabled)
  }
  hint(id: string) {
    const s = this.state.sessions[id]
    if (s)
      return s.attached
        ? 'E / C · Exit safely'
        : `${this.get(s.interaction, 'interaction').label} · ${this.get(s.interaction, 'interaction').phases[s.phase]?.id ?? 'complete'} · Esc cancel`
    const candidate = this.nearest(id)
    return candidate ? `E · ${candidate.i.label}` : ''
  }
  nearest(id: string) {
    const actor = this.actor(id)
    return this.nodes
      .filter((n): n is Entity => n.kind === 'interactive_entity')
      .flatMap((e) =>
        e.interactions.map((id) => ({ e, i: this.get(id, 'interaction') })),
      )
      .filter(
        ({ e, i }) =>
          this.state.entities[e.id].enabled &&
          !this.state.entities[e.id].occupants[i.slot] &&
          length(sub(actor.position, this.anchor(e, i.approach).position)) <=
            i.maxDistance,
      )
      .sort(
        (a, b) =>
          length(sub(actor.position, this.anchor(a.e, a.i.approach).position)) -
          length(sub(actor.position, this.anchor(b.e, b.i.approach).position)),
      )[0]
  }
  request(actorId: string, entityId: string, interactionId: string) {
    const a = this.actor(actorId),
      e = this.get(entityId, 'interactive_entity'),
      i = this.get(interactionId, 'interaction'),
      target = this.state.entities[e.id],
      p = this.anchor(e, i.approach)
    const reject = (reason: string) => {
      this.port.event(a.id, 'interaction_rejected', reason)
      return false
    }
    if (
      this.owns(a.id) ||
      !e.interactions.includes(i.id) ||
      !target.enabled ||
      a.health <= 0 ||
      a.mode !== 'ground' ||
      a.action
    )
      return reject('Actor or target is unavailable')
    if (target.occupants[i.slot]) return reject('Interaction slot is occupied')
    if (Math.abs(target.speed) > 0.05)
      return reject('Wait until the target stops')
    if (e.mechanism && this.get(e.mechanism, 'mechanism').locked)
      return reject('Door is locked')
    if (length(sub(a.position, p.position)) > i.maxDistance)
      return reject('Move closer to the approach anchor')
    if (
      !this.port.physics.actorPathClear(a.id, a.position, p.position, [e.id]) ||
      !this.port.physics.supported(p.position)
    )
      return reject('Approach is obstructed')
    for (const phase of i.phases)
      if (phase.pose) {
        const pose = contactPoseAt(
          this.get(phase.pose, 'contact_pose'),
          this.get(e.anchors, 'anchor_set'),
          target,
          this.port.height(a.id),
        )
        if (pose.errors.length) return reject(pose.errors.join('; '))
      }
    const start = { position: { ...a.position }, yaw: a.yaw }
    target.occupants[i.slot] = a.id
    this.state.sessions[a.id] = {
      actor: a.id,
      entity: e.id,
      interaction: i.id,
      phase: 0,
      tick: 0,
      start,
      safe: structuredClone(start),
      target: { position: { ...target.position }, yaw: target.yaw },
      health: a.health,
      attached: false,
    }
    this.port.event(a.id, 'interaction_started', i.label)
    return true
  }
  release(s: Session) {
    const i = this.get(s.interaction, 'interaction')
    delete this.state.entities[s.entity].occupants[i.slot]
    delete this.state.sessions[s.actor]
    this.poses.delete(s.actor)
    this.port.physics.sync(
      s.actor,
      this.actor(s.actor).position,
      this.actor(s.actor).health > 0,
    )
  }
  exit(s: Session, force = false) {
    const a = this.actor(s.actor),
      e = this.get(s.entity, 'interactive_entity'),
      i = this.get(s.interaction, 'interaction'),
      target = this.state.entities[e.id]
    if (!force && Math.abs(target.speed) > 0.05) {
      target.speed = 0
      this.port.event(
        a.id,
        'interaction_blocked',
        'Stopped. Press exit again when clear.',
      )
      return false
    }
    const choices = i.exits.map((id) => this.anchor(e, id))
    if (force) choices.push(s.safe)
    const destination = choices.find(
      (p) =>
        this.port.physics.free(a.id, p.position, [e.id]) &&
        this.port.physics.supported(p.position) &&
        (force ||
          this.port.physics.actorPathClear(a.id, a.position, p.position, [
            e.id,
          ])),
    )
    if (!destination) {
      this.port.event(
        a.id,
        'interaction_blocked',
        'No clear supported exit; attachment retained',
      )
      return false
    }
    a.position = { ...destination.position }
    a.yaw = destination.yaw
    a.vy = 0
    a.mode = a.health > 0 ? 'ground' : 'dead'
    target.speed = 0
    this.release(s)
    this.port.event(a.id, 'interaction_exited', i.label)
    return true
  }
  abort(s: Session, reason: string) {
    const a = this.actor(s.actor)
    if (s.attached) {
      if (!this.exit(s, true)) return
    } else {
      if (
        this.port.physics.free(a.id, s.safe.position, [s.entity]) &&
        this.port.physics.supported(s.safe.position)
      ) {
        a.position = { ...s.safe.position }
        a.yaw = s.safe.yaw
      }
      this.release(s)
    }
    this.port.event(a.id, 'interaction_cancelled', reason)
  }
  moveTarget(e: Entity, input: Input) {
    const s = this.state.entities[e.id]
    if (!e.motor) return
    const m = this.get(e.motor, 'locomotor'),
      x = input.x ?? 0,
      z = input.z ?? 0,
      n = Math.min(1, Math.hypot(x, z)),
      desired = n > 0.01 ? Math.atan2(x, z) : s.yaw
    let yaw =
      s.yaw +
      Math.max(
        -m.turnRate * DT,
        Math.min(m.turnRate * DT, wrap(desired - s.yaw)),
      )
    const throttle =
      m.type === 'vehicle' ? n * Math.cos(wrap(desired - s.yaw)) : n
    s.speed = approach(
      s.speed,
      throttle * m.maxSpeed,
      (n > 0.01 ? m.acceleration : m.braking) * DT,
    )
    const p = add(s.position, rotate({ x: 0, y: 0, z: s.speed * DT }, yaw)),
      body = this.get(e.body, 'body'),
      outside =
        Math.abs(p.x) + Math.max(body.width, body.length) / 2 >
          this.port.bounds.width / 2 ||
        Math.abs(p.z) + Math.max(body.width, body.length) / 2 >
          this.port.bounds.depth / 2
    const supported = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ].every(([x, z]) =>
      this.port.physics.supported(
        add(
          p,
          rotate(
            { x: x * body.width * 0.4, y: 0, z: z * body.length * 0.4 },
            yaw,
          ),
        ),
      ),
    )
    const riderClear = Object.values(s.occupants).every((id) => {
      const session = this.state.sessions[id]
      if (!session?.attached) return true
      const i = this.get(session.interaction, 'interaction'),
        pose = contactPoseAt(
          this.get(i.phases.at(-1)!.pose!, 'contact_pose'),
          this.get(e.anchors, 'anchor_set'),
          { position: p, yaw },
          this.port.height(id),
        )
      return this.port.physics.actorPathClear(
        id,
        this.actor(id).position,
        pose.root,
        [e.id],
      )
    })
    const clear =
      !outside &&
      this.port.physics.propClear(e.id, p, yaw, Object.values(s.occupants)) &&
      supported &&
      riderClear
    if (clear) {
      s.position = p
      s.yaw = yaw
    } else {
      s.speed = 0
    }
    this.sync(e)
  }
  tick(playerId: string, input: Input) {
    const consumed = new Set<string>()
    if (input.interact && !this.owns(playerId)) {
      const nearest = this.nearest(playerId)
      if (nearest) {
        consumed.add(playerId)
        this.request(playerId, nearest.e.id, nearest.i.id)
      }
    }
    for (const s of Object.values(this.state.sessions)) {
      const a = this.actor(s.actor),
        e = this.get(s.entity, 'interactive_entity'),
        i = this.get(s.interaction, 'interaction'),
        target = this.state.entities[e.id],
        intent = s.actor === playerId ? input : {}
      consumed.add(a.id)
      if (a.health < s.health || a.health <= 0 || !target.enabled) {
        this.abort(s, 'Participant interrupted or target unavailable')
        continue
      }
      if (intent.cancel) {
        this.abort(s, 'Cancelled by actor')
        continue
      }
      if (s.attached) {
        if (intent.drop || intent.interact) {
          this.exit(s)
          continue
        }
        this.moveTarget(e, intent)
        const final = i.phases.at(-1)!,
          pose = contactPoseAt(
            this.get(final.pose!, 'contact_pose'),
            this.get(e.anchors, 'anchor_set'),
            target,
            this.port.height(a.id),
          )
        a.position = pose.root
        a.yaw = pose.yaw
        this.poses.set(a.id, pose.joints)
        a.vy = 0
        continue
      }
      if (
        length(sub(target.position, s.target.position)) >
          i.targetMotionTolerance ||
        Math.abs(wrap(target.yaw - s.target.yaw)) > 0.15
      ) {
        this.abort(s, 'Target moved during alignment')
        continue
      }
      const phase = i.phases[s.phase],
        pose = phase.pose
          ? contactPoseAt(
              this.get(phase.pose, 'contact_pose'),
              this.get(e.anchors, 'anchor_set'),
              target,
              this.port.height(a.id),
            )
          : null,
        end = pose
          ? { position: pose.root, yaw: pose.yaw }
          : this.anchor(e, i.approach)
      s.tick++
      const t = Math.min(1, s.tick / (phase.seconds / DT)),
        p = mix(s.start.position, end.position, t)
      if (
        pose?.errors.length ||
        !this.port.physics.actorPathClear(a.id, a.position, p, [e.id])
      ) {
        this.abort(s, pose?.errors.join('; ') || 'Interaction path obstructed')
        continue
      }
      a.position = p
      a.yaw = s.start.yaw + wrap(end.yaw - s.start.yaw) * t
      a.vy = 0
      if (pose)
        this.poses.set(
          a.id,
          Object.fromEntries(
            Object.entries(pose.joints).map(([key, v]) => [
              key,
              add(v, sub(p, pose.root)),
            ]),
          ),
        )
      if (t < 1) continue
      if (phase.op === 'attach') {
        s.attached = true
        target.speed = 0
        this.port.event(a.id, 'interaction_attached', `${e.id}:${i.slot}`)
      } else if (phase.op === 'actuate') {
        const m = this.get(e.mechanism!, 'mechanism')
        target.goal = target.angle > 0.1 ? 0 : m.openAngle
        this.release(s)
        this.port.event(a.id, 'mechanism_requested', e.id)
      } else {
        s.phase++
        s.tick = 0
        s.start = { position: { ...a.position }, yaw: a.yaw }
      }
    }
    for (const e of this.nodes.filter(
      (n): n is Entity => n.kind === 'interactive_entity',
    )) {
      const target = this.state.entities[e.id]
      if (!Object.keys(target.occupants).length && e.motor)
        this.moveTarget(e, {})
      if (e.mechanism && Math.abs(target.angle - target.goal) > 0.001) {
        const m = this.get(e.mechanism, 'mechanism'),
          angle = approach(
            target.angle,
            target.goal,
            (m.openAngle / m.seconds) * DT,
          ),
          samples = Math.max(
            1,
            Math.ceil(Math.abs(angle - target.angle) / 0.01),
          )
        let clear = true
        for (let n = 1; n <= samples; n++) {
          const yaw =
              target.yaw -
              (target.angle + ((angle - target.angle) * n) / samples),
            p = add(
              target.position,
              rotate({ x: m.size.x / 2, y: 0, z: 0 }, yaw),
            )
          if (!this.port.physics.propClear(e.id, p, yaw)) {
            clear = false
            break
          }
        }
        if (clear) {
          target.angle = angle
          this.sync(e)
        } else {
          target.goal = target.angle
          this.port.event(
            playerId,
            'mechanism_blocked',
            'Door swing obstructed by ' + this.port.physics.lastObstruction,
          )
        }
      }
    }
    return consumed
  }
  canSave() {
    return (
      Object.values(this.state.sessions).every((s) => s.attached) &&
      Object.values(this.state.entities).every(
        (s) => Math.abs(s.speed) < 0.01 && Math.abs(s.goal - s.angle) < 0.001,
      )
    )
  }
  restore(value: unknown) {
    const next = interactionStateSchema.parse(value),
      ids = this.nodes
        .filter((n) => n.kind === 'interactive_entity')
        .map((n) => n.id)
    if (
      Object.keys(next.entities).length !== ids.length ||
      ids.some((id) => !next.entities[id])
    )
      throw new Error('Interaction save belongs to another design')
    for (const [id, t] of Object.entries(next.entities)) {
      const e = this.get(id, 'interactive_entity')
      if (
        Math.abs(t.speed) > 0.01 ||
        Math.abs(t.goal - t.angle) > 0.001 ||
        (!e.motor &&
          (length(sub(t.position, e.position)) > 0.001 ||
            Math.abs(t.yaw - e.yaw) > 0.001))
      )
        throw new Error('Unsafe target checkpoint')
      for (const [slot, actor] of Object.entries(t.occupants)) {
        const s = next.sessions[actor]
        if (
          !s ||
          s.entity !== id ||
          this.get(s.interaction, 'interaction').slot !== slot
        )
          throw new Error('Orphan occupied slot')
      }
    }
    for (const [id, s] of Object.entries(next.sessions)) {
      const a = this.actor(id),
        e = this.get(s.entity, 'interactive_entity'),
        i = this.get(s.interaction, 'interaction')
      if (
        id !== s.actor ||
        !s.attached ||
        s.phase !== i.phases.length - 1 ||
        !e.interactions.includes(i.id) ||
        next.entities[e.id].occupants[i.slot] !== id ||
        a.health <= 0
      )
        throw new Error('Invalid attachment checkpoint')
      const pose = contactPoseAt(
        this.get(i.phases.at(-1)!.pose!, 'contact_pose'),
        this.get(e.anchors, 'anchor_set'),
        next.entities[e.id],
        this.port.height(id),
      )
      if (length(sub(a.position, pose.root)) > 0.05)
        throw new Error('Attachment transform mismatch')
    }
    this.state = next
    for (const e of this.nodes.filter(
      (n): n is Entity => n.kind === 'interactive_entity',
    ))
      this.sync(e)
    this.port.physics.refresh()
    for (const e of this.nodes.filter(
      (n): n is Entity => n.kind === 'interactive_entity',
    )) {
      const t = next.entities[e.id]
      if (
        e.motor &&
        (!this.port.physics.propClear(
          e.id,
          t.position,
          t.yaw,
          Object.values(t.occupants),
        ) ||
          !this.port.physics.supported(t.position) ||
          Math.abs(t.position.x) > this.port.bounds.width / 2 - 1 ||
          Math.abs(t.position.z) > this.port.bounds.depth / 2 - 1)
      )
        throw new Error(
          'Target checkpoint intersects the world or lacks support',
        )
    }
  }
}
