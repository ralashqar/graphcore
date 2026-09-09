import type { MotionRecipe, AnimationGraph } from './animation.ts'
export type AnimationState = MotionRecipe['state']
export function locomotionWeights(x: number, z: number, runSpeed = 4): Partial<Record<AnimationState, number>> {
  if (![x, z, runSpeed].every(Number.isFinite) || runSpeed <= 0) throw new Error('Invalid locomotion velocity')
  const speed = Math.hypot(x, z), moving = Math.min(1, speed / .25)
  if (!speed) return { idle: 1 }
  const total = Math.abs(x) + Math.abs(z), forward = Math.max(0, z) / total * moving
  const running = Math.min(1, Math.max(0, (speed - 1.5) / Math.max(.1, runSpeed - 1.5)))
  return { idle: 1-moving, walk: forward*(1-running), run: forward*running, backward: Math.max(0, -z)/total*moving, strafe_left: Math.max(0, -x)/total*moving, strafe_right: Math.max(0, x)/total*moving }
}

type Weights = Partial<Record<AnimationState, number>>
export type AnimationBlend = { state: AnimationState | null; weights: Weights; from: Weights; elapsed: number; duration: number }
export const emptyAnimationBlend = (): AnimationBlend => ({ state: null, weights: {}, from: {}, elapsed: 0, duration: 0 })
export type ActionClipClock = { active: AnimationState | null; times: Partial<Record<AnimationState, number>> }
export function advanceActionClipClock(previous: ActionClipClock, active: AnimationState | null, dt: number): ActionClipClock {
  if(!Number.isFinite(dt)||dt<0)throw new Error('Invalid animation clock delta')
  const times={...previous.times}
  if(active)times[active]=active===previous.active?(times[active]??0)+dt:0
  return {active,times}
}
export function advanceAnimationBlend(previous: AnimationBlend, target: Weights, transitions: AnimationGraph['transitions'], dt: number): AnimationBlend {
  if (!Number.isFinite(dt) || dt < 0 || Object.values(target).some(w => !Number.isFinite(w) || w < 0)) throw new Error('Invalid animation blend input')
  const state = (Object.entries(target).sort((a, b) => b[1]-a[1])[0]?.[0] as AnimationState | undefined) ?? null
  const event = state === 'roll' ? 'roll' : state === 'takeoff' ? 'jump' : state === 'airborne' ? 'airborne' : state === 'landing' ? 'grounded' : state === 'catch' ? 'ledge_caught' : state === 'climb' ? 'climb' : state?.startsWith('shimmy') ? 'shimmy' : previous.state === 'roll' || previous.state === 'climb' || previous.state === 'landing' || previous.state === 'catch' ? 'finished' : previous.state === 'hang' ? 'drop' : 'movement'
  const changed = state !== previous.state
  const duration = changed ? transitions.find(t => t.from === previous.state && t.to === state && t.event === event)?.blendSeconds ?? 0 : previous.duration
  const from = changed ? { ...previous.weights } : previous.from
  const elapsed = changed ? dt : previous.elapsed+dt
  const alpha = duration > 0 && Object.keys(from).length ? Math.min(1, elapsed/duration) : 1
  const weights: Weights = {}
  for (const name of new Set([...Object.keys(from), ...Object.keys(target)]) as Set<AnimationState>) {
    const weight = (from[name] ?? 0)*(1-alpha)+(target[name] ?? 0)*alpha
    if (weight > 0) weights[name] = weight
  }
  return { state, weights, from, elapsed, duration }
}
