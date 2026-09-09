import { z } from 'zod'
import { poseSequenceSchema, type PoseSequence } from './poseSequence.ts'
import type { Node } from '../v2/spec.ts'
const id = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/)
export const abilityProgramSchema = z
  .object({
    version: z.literal(1),
    id,
    actorDefinition: id,
    label: z.string().min(1).max(120),
    kind: z.enum(['roll', 'uppercut']),
    movementPolicy: z.literal('momentum-1.0.0').optional(),
    motion: id,
    windup: z.number().min(0.05).max(0.6),
    active: z.number().min(0.1).max(0.8),
    recovery: z.number().min(0.1).max(1),
    cost: z.number().min(0).max(40),
    cooldown: z.number().min(0.2).max(4),
    distance: z.number().min(0).max(4),
    damage: z.number().min(0).max(50),
    range: z.number().min(0.5).max(2),
    reaction: id.nullable(),
  })
  .strict()
export const reactionProgramSchema = z
  .object({
    version: z.literal(1),
    id,
    actorDefinitions: z.array(id).min(1).max(20),
    impulse: z.number().min(0).max(5),
    lift: z.number().min(0).max(4),
    proneSeconds: z.number().min(0.2).max(2),
    recoil: id,
    fall: id,
    prone: id,
    getUp: id,
  })
  .strict()
export const performanceSchema = z
  .object({
    version: z.literal(1),
    sequences: z.array(poseSequenceSchema).max(24),
    abilities: z.array(abilityProgramSchema).max(2),
    reactions: z.array(reactionProgramSchema).max(4),
  })
  .strict()
  .superRefine((p, ctx) => {
    const error = (message: string) =>
        ctx.addIssue({ code: 'custom', message }),
      motion = (id: string, role: string) =>
        p.sequences.find((s) => s.id === id && s.role === role)
    for (const array of [p.sequences, p.abilities, p.reactions])
      if (new Set(array.map((v) => v.id)).size !== array.length)
        error('Duplicate performance identity')
    const roles = p.sequences
      .filter((s) => s.role !== 'custom')
      .map((s) => s.role)
    if (new Set(roles).size !== roles.length)
      error('One motion per gameplay role')
    if (new Set(p.abilities.map((a) => a.kind)).size !== p.abilities.length)
      error('One ability per input slot')
    for (const a of p.abilities) {
      const s = motion(a.motion, a.kind)
      if (!s) {
        error('Missing compatible ability motion')
        continue
      }
      const duration = a.windup + a.active + a.recovery
      if (Math.abs(duration - s.duration) > 0.001)
        error('Ability and motion durations disagree')
      for (const [name, seconds] of [
        ['active_start', a.windup],
        ['active_end', a.windup + a.active],
        ['complete', duration],
      ] as const) {
        const marker = s.markers.find((m) => m.name === name)
        if (!marker || Math.abs(marker.time * duration - seconds) > 0.001)
          error(`Missing synchronized ${name}`)
      }
      if (a.kind === 'roll' && (a.damage !== 0 || a.reaction !== null))
        error('Roll cannot emit combat effects')
      if (a.movementPolicy && a.kind !== 'roll') error('Momentum policy is supported only for rolls')
      if (
        a.kind === 'uppercut' &&
        (a.distance !== 0 || !p.reactions.some((r) => r.id === a.reaction))
      )
        error('Uppercut requires a reaction and stationary controller')
    }
    for (const r of p.reactions)
      for (const [key, role] of [
        ['recoil', 'recoil'],
        ['fall', 'fall_back'],
        ['prone', 'prone'],
        ['getUp', 'get_up'],
      ] as const)
        if (!motion(r[key], role)) error('Missing reaction motion')
  })
export type Performance = z.infer<typeof performanceSchema>
export type AbilityProgram = z.infer<typeof abilityProgramSchema>
export type ReactionProgram = z.infer<typeof reactionProgramSchema>
export const programAbilityId = (p: AbilityProgram) =>
  `runtime.program.${p.kind}`
export function programNodes(performance?: Performance): Node[] {
  return [
    ...(performance?.abilities.length
      ? [
          {
            id: 'runtime.pose.program',
            label: 'Program pose',
            version: 1,
            kind: 'pose',
            style: 'strike',
            anticipation: 0.1,
            extension: 0.7,
            lift: 0,
            socket: 'weapon.primary.tip',
          } as Node,
        ]
      : []),
    ...(performance?.abilities ?? []).map<Node>((p) => ({
      id: programAbilityId(p),
      label: p.label,
      version: 1,
      kind: 'ability',
      op: p.kind === 'roll' ? 'roll' : 'strike',
      pose: 'runtime.pose.program',
      projectile: null,
      cost: p.cost,
      cooldown: p.cooldown + p.windup + p.active + p.recovery,
      windup: p.windup,
      active: p.active,
      recovery: p.recovery,
      range: p.range,
      amount: p.damage,
      distance: p.distance,
      duration: 0.1,
    })),
  ]
}
const key = (
  time: number,
  label: string,
  root: PoseSequence['keys'][number]['root'] = [0, 0, 0],
  rotations: PoseSequence['keys'][number]['rotations'] = {},
  targets: PoseSequence['keys'][number]['targets'] = [],
): PoseSequence['keys'][number] => ({
  time,
  label,
  easing: 'smooth',
  root,
  rotations,
  targets,
})
export function performanceRecipe(
  kind: 'roll' | 'uppercut',
  actorDefinition: string,
  receivers: string[] = [],
): Performance {
  const duration = kind === 'roll' ? 1 : 0.8,
    windup = kind === 'roll' ? 0.15 : 0.2,
    active = kind === 'roll' ? 0.55 : 0.2,
    recovery = duration - windup - active
  const sequence: PoseSequence = {
    version: 1,
    id: `motion.${kind}`,
    label: kind === 'roll' ? 'Forward roll' : 'Rising uppercut',
    role: kind,
    duration,
    loop: false,
    contacts: [],
    markers: [
      { name: 'active_start', time: windup / duration },
      { name: 'active_end', time: (windup + active) / duration },
      { name: 'complete', time: 1 },
    ],
    keys:
      kind === 'roll'
        ? [
            key(0, 'Ready'),
            key(0.15, 'Tuck', [0, -0.3, 0], {
              Spine2: [0.4, 0, 0],
              LeftLeg: [-1, 0, 0],
              RightLeg: [-1, 0, 0],
              LeftShin: [1.6, 0, 0],
              RightShin: [1.6, 0, 0],
            }),
            key(0.4, 'Shoulder roll', [0, -0.55, 0], {
              Hips: [Math.PI, 0, 0],
              LeftLeg: [-1, 0, 0],
              RightLeg: [-1, 0, 0],
              LeftShin: [1.6, 0, 0],
              RightShin: [1.6, 0, 0],
            }),
            key(0.7, 'Feet under body', [0, -0.25, 0], {
              Hips: [Math.PI * 2, 0, 0],
            }),
            key(1, 'Ready', [0, 0, 0], { Hips: [Math.PI * 2, 0, 0] }),
          ]
        : [
            key(0, 'Ready'),
            key(0.25, 'Coil', [0, -0.12, 0], { Chest: [0.15, -0.3, 0] }, [
              { effector: 'RightHand', position: [-0.25, 1.05, 0.12] },
            ]),
            key(0.5, 'Strike', [0, 0, 0], { Chest: [-0.1, 0.3, 0] }, [
              { effector: 'RightHand', position: [-0.18, 1.85, 0.3] },
            ]),
            key(0.7, 'Follow through', [0, 0, 0], { Chest: [0, 0.15, 0] }, [
              { effector: 'RightHand', position: [-0.18, 1.55, 0.4] },
            ]),
            key(1, 'Ready'),
          ],
  }
  const sequences: PoseSequence[] = [sequence],
    reactions: ReactionProgram[] = []
  if (kind === 'uppercut') {
    const motion = (
      role: PoseSequence['role'],
      duration: number,
      keys: PoseSequence['keys'],
    ): PoseSequence => ({
      version: 1,
      id: `motion.${role}`,
      label: role.replaceAll('_', ' '),
      role,
      duration,
      loop: false,
      keys,
      contacts: [],
      markers: [],
    })
    sequences.push(
      motion('recoil', 0.5, [
        key(0, 'Receive impact'),
        key(1, 'Recoil', [0, -0.05, 0], { Chest: [-0.3, 0, 0] }),
      ]),
      motion('fall_back', 0.8, [
        key(0, 'Off balance'),
        key(0.5, 'Fall', [0, -0.3, 0], { Hips: [-Math.PI / 4, 0, 0] }),
        key(1, 'On back', [0, -0.75, 0], { Hips: [-Math.PI / 2, 0, 0] }),
      ]),
      motion('prone', 0.5, [
        key(0, 'On back', [0, -0.75, 0], { Hips: [-Math.PI / 2, 0, 0] }),
        key(1, 'On back', [0, -0.75, 0], { Hips: [-Math.PI / 2, 0, 0] }),
      ]),
      motion('get_up', 1.4, [
        key(0, 'On back', [0, -0.75, 0], { Hips: [-Math.PI / 2, 0, 0] }),
        key(0.35, 'Brace', [0, -0.55, 0], {
          Hips: [-0.5, 0, 0],
          Spine2: [0.4, 0, 0],
        }),
        key(0.7, 'Kneel', [0, -0.25, 0], {
          LeftLeg: [-0.8, 0, 0],
          LeftShin: [1.4, 0, 0],
          Spine2: [0.2, 0, 0],
        }),
        key(1, 'Stand'),
      ]),
    )
    reactions.push({
      version: 1,
      id: 'reaction.knockdown',
      actorDefinitions: receivers,
      impulse: 3,
      lift: 2,
      proneSeconds: 0.6,
      recoil: 'motion.recoil',
      fall: 'motion.fall_back',
      prone: 'motion.prone',
      getUp: 'motion.get_up',
    })
  }
  return performanceSchema.parse({
    version: 1,
    sequences,
    abilities: [
      {
        version: 1,
        id: `program.${kind}`,
        actorDefinition,
        label: sequence.label,
        kind,
        ...(kind === 'roll' ? { movementPolicy: 'momentum-1.0.0' } : {}),
        motion: sequence.id,
        windup,
        active,
        recovery,
        cost: 12,
        cooldown: 0.5,
        distance: kind === 'roll' ? 2.5 : 0,
        damage: kind === 'uppercut' ? 15 : 0,
        range: 1.7,
        reaction: kind === 'uppercut' ? 'reaction.knockdown' : null,
      },
    ],
    reactions,
  })
}
export function performanceGraph(p: Performance) {
  const nodes = p.sequences.map((s) => ({
      id: s.id,
      group: 'animation',
      label: s.label,
    })),
    links: Array<{ from: string; to: string }> = []
  for (const a of p.abilities) {
    nodes.push(
      {
        id: `${a.id}.eligibility`,
        group: 'state',
        label: 'Input → ground / resources / cooldown',
      },
      {
        id: `${a.id}.movement`,
        group: 'movement',
        label:
          a.kind === 'roll'
            ? 'Distance → collision sweep → resolved position'
            : 'Fixed facing → active hit window',
      },
      {
        id: `${a.id}.hit`,
        group: 'effect',
        label:
          a.kind === 'uppercut'
            ? 'Confirmed hit → damage → receiver'
            : 'No damage or protection',
      },
    )
    links.push(
      { from: `${a.id}.eligibility`, to: `${a.id}.movement` },
      { from: `${a.id}.movement`, to: `${a.id}.hit` },
      { from: `${a.id}.eligibility`, to: a.motion },
    )
    if (a.reaction)
      links.push({ from: `${a.id}.hit`, to: `${a.reaction}.recoil` })
  }
  for (const r of p.reactions) {
    const phases = [
      'recoil',
      'fall',
      'supported',
      'prone',
      'getUp',
      'locomotion',
    ] as const
    for (const [i, phase] of phases.entries()) {
      nodes.push({
        id: `${r.id}.${phase}`,
        group: 'reaction',
        label:
          phase === 'supported'
            ? 'Physics landing + clearance'
            : phase === 'locomotion'
              ? 'Restore control'
              : phase,
      })
      if (i)
        links.push({ from: `${r.id}.${phases[i - 1]}`, to: `${r.id}.${phase}` })
      if (phase in r && phase !== 'supported' && phase !== 'locomotion')
        links.push({ from: `${r.id}.${phase}`, to: r[phase] })
    }
  }
  return { nodes, links }
}
