/** Frozen movement/presentation policy. Missing policy preserves older builds. */
export const MOTION_PROFILE = 'motion-1.0.0' as const
export const MOTION_RUNTIME = 'gameplay-3.4.0' as const

// Integral of smoothstep velocity: continuous velocity and acceleration at joins.
const integral = (u: number) => u * u * u - .5 * u * u * u * u
export function dashTravel(tick: number, active: number, recovery: number): number {
  const brake = Math.max(1, Math.min(recovery, Math.round(active * .65)))
  const ramp = Math.max(1, Math.round(active * .3))
  const t = Math.max(0, Math.min(active + brake, tick))
  const area = active - ramp / 2 + brake / 2
  const travel = t < ramp ? ramp * integral(t / ramp)
    : t <= active ? t - ramp / 2
    : active - ramp / 2 + brake * ((t - active) / brake - integral((t - active) / brake))
  return travel / area
}
export function dashStep(tick: number, active: number, recovery: number, distance: number) {
  return distance * (dashTravel(tick, active, recovery) - dashTravel(tick - 1, active, recovery))
}
