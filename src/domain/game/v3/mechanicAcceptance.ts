import { UnifiedSimulation } from './simulation.ts'
import { type Design, of } from './spec.ts'
import { emptyMechanicState, primitive } from './mechanics.ts'

export async function acceptMechanics(design: Design, buildId: string) {
  const reports: { nodeKey: string; passed: boolean; message: string }[] = []
  for (const package_ of design.mechanics?.packages ?? []) {
    const sim = await UnifiedSimulation.createUnified(design, buildId)
    try {
      const actorNode = of(design, 'actor_instance').find((a) =>
        a.definition === package_.actorDefinition
      )
      if (!actorNode) {
        throw new Error('Mechanic has no placed actor to validate')
      }
      const actor = sim.state.actors.find((a) => a.id === actorNode.id)!,
        spec = sim.actorSpec(actor)
      if (actor.id !== design.player) {
        throw new Error(
          'Initial traversal authoring supports the player controller only',
        )
      }
      const profile = design.mechanics!.surfaces.find((s) =>
        s.capabilities.includes(package_.capability)
      )
      const box = of(design, 'world')[0].boxes.find((b) =>
        b.id === profile?.collider
      )
      if (!profile || !box) throw new Error('No compatible authored surface')
      const x = profile.face.startsWith('x'),
        sign = profile.face.endsWith('+') ? 1 : -1
      const normal = { x: x ? sign : 0, z: x ? 0 : sign },
        tangent = { x: normal.z, z: -normal.x }
      actor.position = {
        x: box.position.x + normal.x * (box.size.x / 2 + spec.radius + .03),
        y: box.position.y - box.size.y / 2 + .8,
        z: box.position.z + normal.z * (box.size.z / 2 + spec.radius + .03),
      }
      if (box.size.y < spec.height + 1) {
        throw new Error(
          'Authored surface is too short for traversal acceptance',
        )
      }
      actor.mode = 'air'
      actor.vy = 0
      actor.health = spec.health
      actor.stamina = spec.stamina
      if (!sim.physics.free(actor.id, actor.position)) {
        throw new Error('Canonical approach is obstructed on this surface')
      }
      sim.mechanicStates[actor.id] = emptyMechanicState({
        x: actor.position.x - tangent.x * 5 / 60,
        y: actor.position.y,
        z: actor.position.z - tangent.z * 5 / 60,
      })
      // Test each package independently so a sibling does not hide a broken recipe.
      sim.source = {
        ...design,
        mechanics: { ...design.mechanics!, packages: [package_] },
      }
      let attached = 0
      for (let i = 0; i < 12; i++) {
        sim.step({
          traverse: true,
          jump: i === 0 &&
            primitive(package_, 'require_air').activation === 'jump',
        })
        if (sim.mechanicStates[actor.id].phase === 'attached') attached++
        if (!Object.values(actor.position).every(Number.isFinite)) {
          throw new Error('Non-finite motor displacement')
        }
      }
      if (
        package_.capability === 'wall_jump'
          ? sim.mechanicStates[actor.id].jumps !== 1
          : attached < 8
      ) throw new Error('Mechanic did not sustain the required traversal phase')
      if (
        sim.state.events.some((e) => e.type === 'mechanic_contact_rejected')
      ) {
        throw new Error('Contact constraints exceeded the supported correction')
      }
      sim.step({ drop: true })
      if (sim.mechanicStates[actor.id].phase === 'attached') {
        throw new Error('Traversal did not release')
      }
      for (let i = 0; i < 300; i++) sim.step()
      if (sim.state.actors.find((a) => a.id === actor.id)!.mode !== 'ground') {
        throw new Error('No supported landing after traversal')
      }
      reports.push({
        nodeKey: package_.id,
        passed: true,
        message:
          'Authored surface entry, contact, release and landing passed fixed-step acceptance',
      })
    } catch (error) {
      reports.push({
        nodeKey: package_.id,
        passed: false,
        message: String(error),
      })
    } finally {
      sim.dispose()
    }
  }
  return reports
}
