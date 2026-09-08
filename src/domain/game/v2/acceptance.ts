import { Simulation } from './simulation.ts'
import { nodesOf, type Design, type Vec } from './spec.ts'
import { acceptInteractions } from '../interactions/acceptance.ts'
export type Report = { nodeKey: string; passed: boolean; message: string }
export async function runAcceptance(design: Design, buildId: string) {
  const reports: Report[] = []
  const sim = await Simulation.create(design, buildId)
  const check = (nodeKey: string, passed: boolean, message: string) =>
    reports.push({ nodeKey, passed, message })
  try {
    const primary = sim
      .actorSpec(sim.player)
      .abilities.find(
        (id) =>
          nodesOf(design, 'ability').find((a) => a.id === id)?.op ===
          (design.defaultActor === 'mage' ? 'bolt' : 'strike'),
      )!
    const enemy = sim.state.actors.find(
      (a) => sim.actorSpec(a).role === 'enemy',
    )!
    for (
      let i = 0;
      i < 1500 && enemy.health > 0 && sim.player.health > 0;
      i++
    ) {
      const dx = enemy.position.x - sim.player.position.x,
        dz = enemy.position.z - sim.player.position.z,
        n = Math.max(1, Math.hypot(dx, dz))
      sim.step({
        x: design.defaultActor === 'melee' && n > 1.4 ? dx / n : 0,
        z: design.defaultActor === 'melee' && n > 1.4 ? dz / n : 0,
        ...(i % 45 === 0 ? { ability: primary, aim: enemy.position } : {}),
      })
    }
    check(
      'combat',
      enemy.health === 0 && sim.player.health > 0,
      'Player defeats the hostile using registered abilities',
    )
    for (let i = 0; i < 180; i++) sim.step()
    const walk = (target: Vec, limit = 1500) => {
      for (let i = 0; i < limit; i++) {
        const d = {
            x: target.x - sim.player.position.x,
            z: target.z - sim.player.position.z,
          },
          n = Math.hypot(d.x, d.z)
        if (n < 0.12) return true
        sim.step({ x: d.x / n, z: d.z / n })
      }
      return false
    }
    const world = nodesOf(design, 'world')[0],
      ledge = world.ledges[0]
    if (ledge) {
      walk({
        x: (ledge.start.x + ledge.end.x) / 2,
        y: 0,
        z: ledge.start.z - 0.55,
      })
      sim.step({ z: 1, jump: true })
      for (let i = 0; i < 150 && !sim.state.climbed; i++)
        sim.step({ z: 0.1, interact: true })
      check(
        'movement',
        sim.state.climbed,
        'Jump, acquire grip and climb with motor clearance checks',
      )
    } else
      check(
        'movement',
        !nodesOf(design, 'scenario')[0].requireClimb,
        'Required ledge exists',
      )
    walk(world.objective)
    sim.step({ interact: true })
    check(
      'scenario',
      sim.state.complete,
      'Objective activates after combat and traversal',
    )
    for (let i = 0; i < 120; i++) sim.step()
    const saved = sim.save()
    const restored = await Simulation.create(design, buildId)
    try {
      restored.restore(saved)
      check(
        'persistence',
        restored.state.complete,
        'Safe checkpoint restores completion',
      )
    } finally {
      restored.dispose()
    }
    reports.push(...(await acceptInteractions(sim)))
  } catch (error) {
    check('runtime', false, String(error))
  } finally {
    sim.dispose()
  }
  return reports
}
