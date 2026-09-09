import type { Vec } from '../v2/spec.ts'
import { add, length, scale, solveLimb, sub } from '../v2/pose.ts'
import type { MechanicState, SurfaceContact } from './mechanics.ts'
export function wallContactPose(
  base: Record<string, Vec>,
  surface: SurfaceContact,
  elapsed: number,
  height: number,
  hands: boolean,
  maximumCorrection: number,
  contacts: MechanicState['contacts'] = {},
  direction = 1,
) {
  const joints = structuredClone(base),
    errors: string[] = [],
    size = height / 1.8
  const project = (p: Vec, clearance = 0) =>
    add(
      p,
      scale(
        surface.normal,
        clearance -
          (sub(p, surface.point).x * surface.normal.x +
            sub(p, surface.point).z * surface.normal.z),
      ),
    )
  for (const [index, side] of ['left', 'right'].entries()) {
    const clock = elapsed / .24 + index * .5,
      phase = clock % 1,
      stance = phase < .5,
      cycle = Math.floor(clock)
    const hip = joints[`${side}Hip`]
    let target = project(
      add(
        hip,
        add(scale(surface.tangent, direction * (.25 - phase * .5) * size), {
          x: 0,
          y: -.48 * size,
          z: 0,
        }),
      ),
      stance ? .015 : .015 + .08 * Math.sin((phase - .5) * Math.PI * 2),
    )
    if (stance) {
      if (contacts[side]?.cycle !== cycle) {
        contacts[side] = { cycle, point: { ...target } }
      }
      target = contacts[side].point
    } else delete contacts[side]
    const solved = solveLimb(
      hip,
      target,
      .42 * size,
      .42 * size,
      add(surface.normal, { x: 0, y: .4, z: 0 }),
    )
    joints[`${side}Knee`] = solved.middle
    joints[`${side}Foot`] = solved.end
    if (length(sub(solved.end, target)) > maximumCorrection) {
      errors.push(`${side} foot contact is unreachable`)
    }
    if (hands) {
      const shoulder = joints[`${side}Shoulder`],
        handTarget = project(add(shoulder, { x: 0, y: .05, z: 0 }), .015)
      const arm = solveLimb(
        shoulder,
        handTarget,
        .34 * size,
        .34 * size,
        surface.normal,
      )
      joints[`${side}Elbow`] = arm.middle
      joints[`${side}Hand`] = arm.end
      if (length(sub(arm.end, handTarget)) > maximumCorrection) {
        errors.push(`${side} hand contact is unreachable`)
      }
    }
  }
  for (const p of Object.values(joints)) {
    if (!Object.values(p).every(Number.isFinite)) {
      errors.push('Non-finite contact transform')
    }
  }
  return { joints, errors }
}
