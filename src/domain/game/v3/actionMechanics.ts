import { z } from 'zod'
import { type Ability, idSchema, type Node } from '../v2/spec.ts'

export const ACTION_CATALOG = 'actions-1.0.0'
export const ACTION_RUNTIME = 'gameplay-3.3.0'
const strike = z.object({
  windup: z.number().min(.05).max(.6),
  active: z.number().min(.05).max(.5),
  recovery: z.number().min(.1).max(1),
  damage: z.number().min(1).max(60),
  range: z.number().min(.5).max(2.5),
  cost: z.number().min(0).max(30),
}).strict()
const common = {
  version: z.literal(1),
  catalog: z.literal(ACTION_CATALOG),
  id: idSchema,
  actorDefinition: idSchema,
  label: z.string().min(1).max(200),
  cooldown: z.number().min(.25).max(3),
}
export const actionPackageSchema = z.discriminatedUnion('capability', [
  z.object({
    ...common,
    capability: z.literal('combo'),
    strikes: z.array(strike).length(3),
    bufferSeconds: z.number().min(.05).max(.35),
    cancelRecoveryFraction: z.number().min(0).max(1),
  }).strict(),
  z.object({
    ...common,
    capability: z.literal('dash'),
    distance: z.number().min(.25).max(5),
    windup: z.number().min(.05).max(.3),
    active: z.number().min(.1).max(.6),
    recovery: z.number().min(.1).max(.8),
    cost: z.number().min(0).max(40),
  }).strict(),
])
export type ActionPackage = z.infer<typeof actionPackageSchema>
// Bounded IDs do not embed user-selected actor IDs. Actor ownership is a separate field.
export function actionRecipe(
  capability: ActionPackage['capability'],
  actorDefinition: string,
): ActionPackage {
  return actionPackageSchema.parse({
    version: 1,
    catalog: ACTION_CATALOG,
    id: `action.${capability}`,
    actorDefinition,
    label: capability === 'combo' ? 'Three-hit combo' : 'Forward dash',
    cooldown: .4,
    ...(capability === 'combo'
      ? {
        capability,
        bufferSeconds: .25,
        cancelRecoveryFraction: .25,
        strikes: [0, 1, 2].map((i) => ({
          windup: .12,
          active: .15,
          recovery: .3,
          damage: 10 + i * 5,
          range: 1.7,
          cost: 5,
        })),
      }
      : {
        capability,
        distance: 3,
        windup: .05,
        active: .25,
        recovery: .25,
        cost: 12,
      }),
  })
}
export const actionAbilityId = (p: ActionPackage, index = 0) =>
  `runtime.${p.capability}.${index}`
export function actionNodes(packages: ActionPackage[]): Node[] {
  return packages.flatMap((p) => {
    const pose = `runtime.pose.${p.capability}`
    const abilities: Ability[] = (p.capability === 'combo' ? p.strikes : [p])
      .map((s, i) => ({
        id: actionAbilityId(p, i),
        label: `${p.label}${p.capability === 'combo' ? ` ${i + 1}` : ''}`,
        version: 1,
        kind: 'ability',
        op: p.capability === 'combo' ? 'strike' : 'roll',
        pose,
        projectile: null,
        cost: s.cost,
        cooldown: .1,
        windup: s.windup,
        active: s.active,
        recovery: s.recovery,
        range: 'range' in s ? s.range : 1,
        amount: 'damage' in s ? s.damage : 1,
        distance: p.capability === 'dash' ? p.distance : 0,
        duration: .1,
      }))
    return [{
      id: pose,
      label: p.label,
      version: 1,
      kind: 'pose',
      style: p.capability === 'combo' ? 'strike' : 'dodge',
      anticipation: .1,
      extension: .7,
      lift: 0,
      socket: 'weapon.primary.tip',
    }, ...abilities] as Node[]
  })
}
export function compileActionGraph(p: ActionPackage, motionProfile?:string) {
  const operations = p.capability === 'combo'
    ? [
      ['input', 'tap buffer', 'input.edge:bool', 'buffer.expiry:tick'],
      [
        'eligibility',
        'ground + stamina + cooldown',
        'actor.state',
        'eligible:bool',
      ],
      ...p.strikes.map((
        _,
        i,
      ) => [
        `strike${i}`,
        `strike ${i + 1} / windup → active → recovery`,
        'eligible:bool',
        'hit.once:target',
      ]),
      [
        'cancel',
        'recovery cancel window',
        'phase:tick',
        'interrupt.allowed:bool',
      ],
    ]
    : [['input', 'dash edge', 'input.edge:bool', 'requested:bool'], [
      'eligibility',
      'ground + stamina + cooldown',
      'actor.state',
      'eligible:bool',
    ], [
      'movement',
      motionProfile?'accelerate → travel → brake (fixed total distance)':'fixed facing displacement',
      'direction + distance:m',
      'capsule.request:m',
    ], [
      'collision',
      'controller sweep',
      'capsule.request:m',
      'resolved.position:m',
    ], ['recovery', 'recovery + cooldown', 'elapsed:tick', 'ready:bool']]
  return {
    nodes: operations.map(([id, op, input, output]) => ({
      id,
      op,
      contract: {
        group: id === 'movement' || id === 'collision' ? 'movement' : 'state',
        input,
        output,
      },
    })),
    links: operations.slice(1).map((n, i) => ({
      from: operations[i][0],
      to: n[0],
    })),
    transitions: [
      {
        from: 'idle',
        to: 'windup',
        guard: 'tap + grounded + resources + cooldown',
      },
      { from: 'active', to: 'recovery', guard: 'fixed gameplay time' },
      {
        from: 'recovery',
        to: p.capability === 'combo' ? 'next strike or idle' : 'idle',
        guard: 'valid buffered tap / finish / interruption',
      },
    ],
  }
}
