import type { Simulation } from '../v2/simulation.ts'
import type { Entity } from './spec.ts'
import { interactionPath } from './navigation.ts'
export async function acceptInteractions(sim: Simulation) {
  const entities = sim.interactions.nodes.filter(
      (n): n is Entity => n.kind === 'interactive_entity',
    ),
    reports: { nodeKey: string; passed: boolean; message: string }[] = []
  if (!entities.length) return reports
  const direct = (x: number, z: number) => {
    for (let n = 0; n < 1500; n++) {
      const dx = x - sim.player.position.x,
        dz = z - sim.player.position.z,
        d = Math.hypot(dx, dz)
      if (d < 0.1) return
      sim.step({ x: dx / Math.max(d, 1), z: dz / Math.max(d, 1) })
    }
    throw new Error(
      `Approach route blocked at ${JSON.stringify(sim.player.position)}, target ${x},${z}`,
    )
  }
  const walk = (x: number, z: number) => {
    const path = interactionPath(
      sim.physics,
      sim.player.id,
      sim.player.position,
      { x, y: 0, z },
      sim.interactions.port.bounds,
    )
    if (!path) throw new Error('No reachable interaction route')
    for (const p of path) direct(p.x, p.z)
  }
  const idle = (n = 120) => {
    for (let i = 0; i < n; i++) sim.step()
  }
  try {
    direct(0, 0)
    walk(0, -8)
    for (const e of entities) {
      const i = sim.interactions.get(e.interactions[0], 'interaction'),
        entry = sim.interactions.anchor(e, i.approach)
      walk(entry.position.x, entry.position.z)
      sim.step({ interact: true })
      idle(180)
      if (i.mode === 'door')
        reports.push({
          nodeKey: e.id,
          passed: sim.interactions.state.entities[e.id].angle > 0.2,
          message: 'Door contact opens the physical hinge',
        })
      else {
        const attached =
          !!sim.interactions.state.sessions[sim.player.id]?.attached
        reports.push({
          nodeKey: e.id,
          passed: attached,
          message:
            'Approach, contact and attachment complete through simulation input',
        })
        if (!attached)
          throw new Error(
            `Failed ${e.id}: ${JSON.stringify(sim.state.events.slice(-5))}`,
          )
        if (e.motor) {
          const old = sim.interactions.state.entities[e.id].position.z
          for (let t = 0; t < 25; t++) sim.step({ z: 1 })
          idle()
          reports.push({
            nodeKey: e.id,
            passed:
              sim.interactions.state.entities[e.id].position.z > old + 0.05,
            message: 'Mounted controller moves target and attached rider',
          })
        }
        const saved = sim.save()
        sim.restore(saved)
        sim.step({ drop: true })
        idle(20)
        reports.push({
          nodeKey: e.id,
          passed: !sim.interactions.owns(sim.player.id),
          message:
            'Attached checkpoint restores and clear dismount releases the slot',
        })
      }
    }
  } catch (error) {
    reports.push({
      nodeKey: 'interactions',
      passed: false,
      message: String(error),
    })
  }
  return reports
}
