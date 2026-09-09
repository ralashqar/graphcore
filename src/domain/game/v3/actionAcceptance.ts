import { UnifiedSimulation } from './simulation.ts'
import type { Design } from './spec.ts'

export async function acceptActions(design: Design, buildId: string) {
  const reports: { nodeKey: string; passed: boolean; message: string }[] = []
  for (const p of design.mechanics?.actions ?? []) {
    const sim = await UnifiedSimulation.createUnified(design, buildId)
    try {
      for (let i = 0; i < 60; i++) sim.step({})
      const origin = { ...sim.player.position }, shield = sim.player.shieldUntil
      if (p.capability === 'combo') {
        sim.step({ attack: true })
        for (let stage = 0; stage < 3; stage++) {
          let guard = 0
          while (
            sim.player.action?.ability === `runtime.combo.${stage}` &&
            guard++ < 200
          ) {
            const s = p.strikes[stage],
              cancelAt = Math.round(s.windup * 60) + Math.round(s.active * 60) +
                Math.round(s.recovery * p.cancelRecoveryFraction * 60)
            sim.step({
              attack: stage < 2 && sim.player.action.tick === Math.min(cancelAt - 1, Math.round(s.windup*60)+Math.round(s.active*60)+Math.round(s.recovery*60)-2),
            })
          }
        }
        const released = sim.state.events.filter((e) =>
          e.type === 'release' && e.detail.startsWith('runtime.combo.')
        )
        if (
          released.length !== 3 ||
          new Set(released.map((e) => e.detail)).size !== 3
        ) throw new Error('Three buffered strikes did not complete')
      } else {
        sim.step({ dash: true })
        for (let i = 0; i < 120; i++) sim.step({})
        if (
          !sim.state.events.some((e) =>
            e.type === 'action_stage' && e.detail === 'dash:1'
          )
        ) throw new Error('Dash did not start')
        const distance = Math.hypot(
          sim.player.position.x - origin.x,
          sim.player.position.z - origin.z,
        )
        if (distance > p.distance + .1 || sim.player.shieldUntil !== shield) {
          throw new Error('Dash displacement or protection contract failed')
        }
      }
      if (
        !Object.values(sim.player.position).every(Number.isFinite) ||
        sim.player.health <= 0 || !sim.canSave()
      ) throw new Error('Action did not return to a safe checkpoint')
      sim.restore(sim.save())
      reports.push({
        nodeKey: p.id,
        passed: true,
        message:
          `${p.capability}: fixed-step action, recovery and checkpoint passed`,
      })
    } catch (error) {
      reports.push({ nodeKey: p.id, passed: false, message: String(error) })
    } finally {
      sim.dispose()
    }
  }
  return reports
}
