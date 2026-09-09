import type { MechanicPackage } from './mechanics.ts'

// Runtime dataflow is compiled from the primitive catalog, never from model-written code.
export const mechanicPorts = {
  query_surface: {
    group: 'sensing',
    input: 'actor.position:m',
    output: 'surface.contact:m',
    resource: null,
  },
  require_air: {
    group: 'state',
    input: 'surface.contact:m',
    output: 'eligible:bool',
    resource: null,
  },
  tangent_motion: {
    group: 'movement',
    input: 'eligible:bool',
    output: 'velocity:m/s',
    resource: 'controller',
  },
  gravity_scale: {
    group: 'movement',
    input: 'velocity:m/s',
    output: 'velocity:m/s',
    resource: 'controller',
  },
  maintain_clearance: {
    group: 'movement',
    input: 'velocity:m/s',
    output: 'displacement:m',
    resource: 'controller',
  },
  consume_stamina: {
    group: 'state',
    input: 'eligible:bool',
    output: 'remaining:points',
    resource: 'stamina',
  },
  exit_impulse: {
    group: 'movement',
    input: 'exit:bool',
    output: 'velocity:m/s',
    resource: 'controller',
  },
  contact_pose: {
    group: 'presentation',
    input: 'surface.contact:m',
    output: 'joint.transforms:m',
    resource: 'feet',
  },
} as const
export function compileMechanicGraph(package_: MechanicPackage) {
  const node = (op: keyof typeof mechanicPorts) =>
    package_.primitives.find((p) => p.op === op)!.id
  const links = [
    ['query_surface', 'require_air'],
    ['require_air', 'tangent_motion'],
    ['tangent_motion', 'gravity_scale'],
    ['gravity_scale', 'maintain_clearance'],
    ['require_air', 'consume_stamina'],
    ['query_surface', 'contact_pose'],
  ] as const
  return {
    version: 1 as const,
    nodes: package_.primitives.map((p) => ({
      ...p,
      contract: mechanicPorts[p.op],
    })),
    links: links.map(([from, to]) => ({ from: node(from), to: node(to) })),
    states: ['inactive', 'attached', 'departing'] as const,
    transitions: [
      {
        from: 'inactive',
        to: 'attached',
        guard: 'airborne + input + compatible surface + resources + cooldown',
      },
      {
        from: 'attached',
        to: 'departing',
        guard:
          'release / jump / obstruction / lost surface / duration / stamina',
      },
      { from: 'departing', to: 'inactive', guard: 'supported landing' },
    ],
    maximumPrimitiveEvaluationsPerTick: 8,
  }
}
