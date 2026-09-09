import type { UnifiedSimulation } from './simulation.ts'
import type { Input } from '../v2/simulation.ts'
import { actionAbilityId, type ActionPackage } from './actionMechanics.ts'

const ticks = (seconds: number) => Math.max(1, Math.round(seconds * 60))
export class ActionController {
  active: {
    packageId: string
    index: number
    token: string
    bufferUntil: number
  } | null = null
  attackHeld = false
  dashHeld = false
  reset() {
    this.active = null
    this.attackHeld = false
    this.dashHeld = false
  }
  prepare(sim: UnifiedSimulation, raw: Input): Input {
    const input = { ...raw }, actor = sim.player, now = sim.state.tick
    const packages = sim.source.mechanics?.actions ?? []
    const combo = packages.find((p) => p.capability === 'combo'),
      dash = packages.find((p) => p.capability === 'dash')
    const attack = !!raw.attack && !this.attackHeld,
      dashTap = !!raw.dash && !this.dashHeld
    this.attackHeld = !!raw.attack
    this.dashHeld = !!raw.dash
    const activePackage = packages.find((p) => p.id === this.active?.packageId)
    if (
      this.active &&
      (!activePackage || actor.action?.id !== this.active.token ||
        actor.mode !== 'ground' || actor.health <= 0 ||
        sim.interactions.owns(actor.id) || sim.forcedMovement[actor.id])
    ) {
      this.active = null
    }
    const cooldownKey = (p: ActionPackage) =>
      `runtime.action.${p.capability}.cooldown`
    const start = (p: ActionPackage, index: number) => {
      if (
        sim.interactions.owns(actor.id) || sim.forcedMovement[actor.id] ||
        actor.mode !== 'ground' || actor.health <= 0
      ) return false
      if (!this.active && (actor.cooldowns[cooldownKey(p)] ?? 0) > now) {
        return false
      }
      const cost = p.capability === 'combo' ? p.strikes[index].cost : p.cost
      if (actor.stamina < cost) {
        sim.event(actor, 'action_rejected', 'Insufficient stamina')
        return false
      }
      const previous = actor.action
      actor.action = null
      if (
        !sim.startComposedAction(actionAbilityId(p, index), {
          ...input,
          aim: undefined,
        })
      ) {
        actor.action = previous
        return false
      }
      this.active = {
        packageId: p.id,
        index,
        token: actor.action!.id,
        bufferUntil: -1,
      }
      // Cooldown includes maximum playback, so interruption cannot reset it.
      const duration = p.capability === 'combo' ? p.strikes[index] : p
      actor.cooldowns[cooldownKey(p)] = now +
        ticks(
          duration.windup + duration.active + duration.recovery + p.cooldown,
        )
      sim.event(actor, 'action_stage', `${p.capability}:${index + 1}`)
      return true
    }
    if (this.active && activePackage && actor.action) {
      input.ability = undefined // Exclusive action owns activation until its cancel window.
      const p = activePackage,
        stage = p.capability === 'combo' ? p.strikes[this.active.index] : p
      const cancelAt = ticks(stage.windup) + ticks(stage.active) +
        ticks(
          stage.recovery *
            (p.capability === 'combo' ? p.cancelRecoveryFraction : 1),
        )
      const canCancel = actor.action.tick >= Math.min(cancelAt,ticks(stage.windup)+ticks(stage.active)+ticks(stage.recovery)-1)
      if (p.capability === 'combo' && attack && this.active.index < 2) {
        this.active.bufferUntil = now + ticks(p.bufferSeconds)
      }
      if (raw.cancel && !canCancel) input.cancel = false
      if (canCancel && raw.cancel) {
        this.active = null
        return input
      }
      if (
        canCancel && dashTap && dash && dash.id !== p.id &&
        (actor.cooldowns[cooldownKey(dash)] ?? 0) <= now
      ) {
        if (start(dash, 0)) return input
      }
      if (
        p.capability === 'combo' && canCancel && this.active.index < 2 &&
        this.active.bufferUntil >= now
      ) {
        start(p, this.active.index + 1)
      }
    } else if (!actor.action && !raw.cancel) {
      if (dashTap && dash) start(dash, 0)
      else if (attack && combo) start(combo, 0)
    }
    return input
  }
}
