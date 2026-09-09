import { acceptPerformance } from './performanceAcceptance.ts'
import { acceptActions } from './actionAcceptance.ts'
import { UnifiedSimulation } from './simulation.ts'
import { acceptMechanics } from './mechanicAcceptance.ts'
import { of, type Design } from './spec.ts'
import { interactionPath } from '../interactions/navigation.ts'

export function nextObjective(sim: UnifiedSimulation) {
  return of(sim.source, 'objective').find(
    (o) =>
      !sim.state.mission.completed.includes(o.id) && sim.ready(o.prerequisites),
  )
}
export function targetPoint(
  sim: UnifiedSimulation,
  id: string,
): { x: number; y: number; z: number } {
  const n = sim.source.nodes.find((n) => n.id === id)
  if (!n) throw new Error(`Missing target ${id}`)
  if (n.kind === 'dialogue') return targetPoint(sim, n.actor)
  if (n.kind === 'actor_instance') {
    const a = sim.state.actors.find((a) => a.id === id)!
    return { ...a.position, z: a.position.z - 1.2 }
  }
  if (n.kind === 'interactive_entity') {
    const i = sim.interactions.get(n.interactions[0], 'interaction')
    return sim.interactions.anchor(n, i.approach).position
  }
  if ('position' in n) return n.position
  throw new Error(`Target ${id} has no approach position`)
}
export async function runAcceptance(design: Design, buildId: string) {
  const sim = await UnifiedSimulation.createUnified(design, buildId),
    reports: { nodeKey: string; passed: boolean; message: string }[] = []
  const idle = (ticks = 120) => {
    for (let i = 0; i < ticks; i++) sim.step()
  }
  const walk = (point: { x: number; y: number; z: number }) => {
    const mounted = sim.interactions.state.sessions[sim.player.id]?.attached
    const path = mounted
      ? [point]
      : interactionPath(
          sim.physics,
          sim.player.id,
          sim.player.position,
          point,
          of(design, 'world')[0],
        )
    if (!path) throw new Error(`No supported route to ${JSON.stringify(point)}`)
    for (const target of path) {
      let reached = false
      for (let i = 0; i < 1800; i++) {
        const dx = target.x - sim.player.position.x,
          dz = target.z - sim.player.position.z,
          d = Math.hypot(dx, dz)
        if (d < (mounted ? 0.8 : 0.12)) {
          reached = true
          break
        }
        sim.step({ x: dx / Math.max(d, 1), z: dz / Math.max(d, 1) })
      }
      if (!reached)
        throw new Error(`Route blocked to ${JSON.stringify(target)}`)
    }
    idle(60)
  }
  try {
    for (
      let attempt = 0;
      attempt < of(design, 'objective').length * 3 && !sim.state.complete;
      attempt++
    ) {
      const objective = nextObjective(sim)
      if (!objective) throw new Error('No reachable next objective')
      if (sim.interactions.owns(sim.player.id) && objective.op !== 'reach') {
        idle()
        sim.step({ drop: true })
        idle()
        if (sim.interactions.owns(sim.player.id))
          throw new Error('Exit is blocked')
      }
      if (objective.op === 'defeat') {
        const target = sim.state.actors.find((a) => a.id === objective.target)!
        const ability = sim
          .actorSpec(sim.player)
          .abilities.find((id) =>
            sim.design.nodes.some(
              (n) =>
                n.kind === 'ability' &&
                n.id === id &&
                (n.op === 'bolt' || n.op === 'strike'),
            ),
          )
        if (!ability) throw new Error('No supported combat action')
        for (
          let i = 0;
          i < 2400 && target.health > 0 && sim.player.health > 0;
          i++
        ) {
          const dx = target.position.x - sim.player.position.x,
            dz = target.position.z - sim.player.position.z,
            d = Math.max(1, Math.hypot(dx, dz))
          sim.step({
            ...(d > 3 ? { x: dx / d, z: dz / d } : {}),
            ...(i % 45 === 0 ? { ability, aim: target.position } : {}),
          })
        }
      } else {
        walk(targetPoint(sim, objective.target))
        if (objective.op !== 'reach') sim.step({ interact: true })
        idle(180)
      }
      const passed = sim.state.mission.completed.includes(objective.id)
      reports.push({
        nodeKey: objective.id,
        passed,
        message: passed
          ? objective.label
          : `Failed ${objective.label}: ${sim.state.events.at(-1)?.detail}`,
      })
      if (!passed) break
    }
    // Every instanced recipe is exercised, even when optional to the mission.
    if (sim.state.complete)
      for (const e of of(design, 'interactive_entity')) {
        if (sim.interactions.owns(sim.player.id)) {
          idle()
          sim.step({ drop: true })
          idle()
        }
        if (!sim.state.mission.used.includes(e.id)) {
          walk(targetPoint(sim, e.id))
          sim.step({ interact: true })
          idle(180)
        }
        const passed = sim.state.mission.used.includes(e.id)
        reports.push({
          nodeKey: e.id,
          passed,
          message: 'Recipe interaction completes through input',
        })
        if (sim.interactions.state.sessions[sim.player.id]?.attached) {
          idle()
          const saved = sim.save()
          sim.restore(saved)
          sim.step({ drop: true })
          idle()
          reports.push({
            nodeKey: e.id,
            passed: !sim.interactions.owns(sim.player.id),
            message: 'Attached checkpoint and safe exit',
          })
        }
      }
    idle(240)
    const saved = sim.save(),
      restored = await UnifiedSimulation.createUnified(design, buildId)
    try {
      restored.restore(saved)
      reports.push({
        nodeKey: 'checkpoint',
        passed:
          restored.state.complete &&
          JSON.stringify(restored.state.mission) ===
            JSON.stringify(sim.state.mission),
        message: 'Mission checkpoint restores all progress',
      })
    } finally {
      restored.dispose()
    }
    reports.push({
      nodeKey: 'mission',
      passed: sim.state.complete && sim.player.health > 0,
      message: 'Required objectives complete with surviving player',
    })
  } catch (error) {
    reports.push({
      nodeKey: 'acceptance',
      passed: false,
      message: String(error),
    })
  } finally {
    sim.dispose()
  }
  if(design.mechanics)reports.push(...await acceptMechanics(design,buildId))
  reports.push(...await acceptActions(design,buildId))
  reports.push(...await acceptPerformance(design,buildId))
  return reports
}
