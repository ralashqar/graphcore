import { UnifiedSimulation } from './simulation.ts'
import { programAbilityId } from './performance.ts'
import type { Design } from './spec.ts'
export async function acceptPerformance(design: Design, buildId: string) {
  const reports: Array<{ nodeKey: string; passed: boolean; message: string }> =
    []
  for (const program of design.mechanics?.performance?.abilities ?? []) {
    const sim = await UnifiedSimulation.createUnified(design, buildId)
    try {
      for (let i = 0; i < 60; i++) sim.step()
      const shield = sim.player.shieldUntil,
        origin = { ...sim.player.position }
      sim.step({ [program.kind]: true })
      if (sim.player.action?.ability !== programAbilityId(program))
        throw new Error('Program did not activate')
      for (let i = 0; i < 150; i++) sim.step()
      if (
        program.kind === 'roll' &&
        (sim.player.shieldUntil !== shield ||
          Math.hypot(
            sim.player.position.x - origin.x,
            sim.player.position.z - origin.z,
          ) >
            program.distance + 0.05)
      )
        throw new Error('Roll exceeded movement or protection contract')
      if (!sim.canSave())
        throw new Error('Program did not recover to checkpoint')
      sim.restore(sim.save())
      reports.push({
        nodeKey: program.id,
        passed: true,
        message:
          'Program activation, bounded movement, recovery and checkpoint passed',
      })
    } catch (e) {
      reports.push({ nodeKey: program.id, passed: false, message: String(e) })
    } finally {
      sim.dispose()
    }
  }
  return reports
}
