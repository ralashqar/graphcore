import { designSchema, type Design, type Movement, socketIds } from './spec.ts'

export const TRANSITIONS: Movement['transitions'] = [
  { from: 'ground', to: 'air', guard: 'jump' },
  { from: 'ground', to: 'air', guard: 'unsupported' },
  { from: 'air', to: 'ground', guard: 'landed' },
  { from: 'air', to: 'hang', guard: 'grip' },
  { from: 'hang', to: 'climb', guard: 'climb' },
  { from: 'hang', to: 'air', guard: 'drop' },
  { from: 'climb', to: 'ground', guard: 'finished' },
  { from: 'climb', to: 'air', guard: 'unsupported' },
  ...(['ground', 'air', 'hang', 'climb'] as const).map((from) => ({
    from,
    to: 'dead' as const,
    guard: 'death' as const,
  })),
]
export function createCombatTemplate(): Design {
  const base = (id: string, label: string) => ({ id, label, version: 1 })
  return designSchema.parse({
    schemaVersion: 2,
    template: 'combat_traversal.v1',
    title: 'The proving courtyard',
    brief:
      'Defeat the sentinel, climb the stone ledge and activate the beacon.',
    defaultActor: 'mage',
    assets: [],
    nodes: [
      {
        ...base('movement', 'Character motor'),
        kind: 'movement',
        speed: 3.5,
        sprint: 5.5,
        jump: 5.5,
        gravity: 14,
        staminaRecovery: 12,
        sprintDrain: 10,
        grabReach: 0.8,
        climbSeconds: 0.65,
        shimmySpeed: 1,
        transitions: TRANSITIONS,
      },
      {
        ...base('rig', 'Canonical humanoid'),
        kind: 'rig',
        type: 'canonical_humanoid',
        sockets: socketIds
          .map((id) => ({
            id,
            joint: id.includes('left')
              ? 'leftHand'
              : id.includes('foot.right')
                ? 'rightFoot'
                : id === 'chest'
                  ? 'chest'
                  : 'rightHand',
            offset: { x: 0, y: 0, z: id.includes('weapon') ? 0.3 : 0 },
            forward: { x: 0, y: 0, z: 1 },
          }))
          .map((s) => ({
            ...s,
            joint: s.id === 'foot.left' ? 'leftFoot' : s.joint,
          })),
      },
      ...(['cast', 'strike', 'dodge', 'shield', 'grip'] as const).map(
        (style) => ({
          ...base(`pose.${style}`, `${style} pose`),
          kind: 'pose',
          style,
          anticipation: 0.15,
          extension: 0.8,
          lift: 0.1,
          socket: style === 'strike' ? 'weapon.primary.tip' : 'hand.right.cast',
        }),
      ),
      {
        ...base('projectile.bolt', 'Slowing bolt'),
        kind: 'projectile',
        socket: 'hand.right.cast',
        speed: 16,
        gravity: 0,
        radius: 0.14,
        lifetime: 2,
        damage: 25,
        slowFactor: 0.5,
        slowSeconds: 2,
      },
      ...(['strike', 'bolt', 'dodge', 'shield'] as const).map((op) => ({
        ...base(`ability.${op}`, op[0].toUpperCase() + op.slice(1)),
        kind: 'ability',
        op,
        pose: `pose.${op === 'bolt' ? 'cast' : op}`,
        projectile: op === 'bolt' ? 'projectile.bolt' : null,
        cost: op === 'bolt' ? 10 : op === 'strike' ? 5 : 15,
        cooldown: op === 'shield' ? 3 : op === 'dodge' ? 1 : 0.6,
        windup: op === 'dodge' ? 0.05 : 0.2,
        active: op === 'dodge' ? 0.3 : 0.1,
        recovery: 0.2,
        range: op === 'bolt' ? 20 : 2,
        amount: 25,
        distance: op === 'dodge' ? 3 : 0,
        duration: op === 'shield' ? 1.5 : 0.3,
      })),
      {
        ...base('brain.sentinel', 'Sentinel behavior'),
        kind: 'behavior',
        mode: 'patrol_chase_attack',
        detectionRange: 8,
        attackRange: 1.7,
        patrolRadius: 1,
        thinkTicks: 12,
      },
      ...(['mage', 'melee', 'enemy', 'target'] as const).map((role, i) => ({
        ...base(`actor.${role}`, role[0].toUpperCase() + role.slice(1)),
        kind: 'actor',
        role,
        team: i < 2 ? 'player' : i === 2 ? 'hostile' : 'neutral',
        health: i === 2 ? 50 : 100,
        stamina: 100,
        height: 1.8,
        radius: 0.35,
        abilities:
          role === 'target'
            ? []
            : i === 2
              ? ['ability.strike']
              : [
                  `ability.${role === 'mage' ? 'bolt' : 'strike'}`,
                  'ability.dodge',
                  'ability.shield',
                ],
        movement: 'movement',
        rig: 'rig',
        behavior: role === 'enemy' ? 'brain.sentinel' : null,
        canClimb: i < 2,
        spawn: {
          x: i < 2 ? 0 : i === 2 ? 0 : -5,
          y: 0,
          z: i < 2 ? -6 : i === 2 ? 0 : -2,
        },
      })),
      {
        ...base('world', 'Courtyard geometry'),
        kind: 'world',
        width: 24,
        depth: 24,
        boxes: [
          {
            id: 'platform',
            position: { x: 0, y: 1, z: 6 },
            size: { x: 8, y: 2, z: 5 },
            ramp: false,
          },
          {
            id: 'cover',
            position: { x: 5, y: 0.7, z: 0 },
            size: { x: 2, y: 1.4, z: 2 },
            ramp: false,
          },
          {
            id: 'ramp',
            position: { x: -8, y: 0.5, z: 4 },
            size: { x: 2, y: 1, z: 3 },
            ramp: true,
          },
        ],
        ledges: [
          {
            id: 'ledge.main',
            start: { x: -3, y: 2, z: 3.5 },
            end: { x: 3, y: 2, z: 3.5 },
            normal: { x: 0, y: 0, z: -1 },
            landing: { x: 0, y: 2, z: 4.5 },
            connects: [],
          },
        ],
        objective: { x: 0, y: 2, z: 6 },
      },
      {
        ...base('scenario', 'Courtyard acceptance'),
        kind: 'scenario',
        objective:
          'Defeat the sentinel, climb the ledge and activate the beacon.',
        requireEnemyDefeat: true,
        requireClimb: true,
        seed: 7,
      },
    ],
  })
}
