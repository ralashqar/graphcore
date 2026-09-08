import type { Anchors, ContactPose, Transform, Vec, Body } from './spec.ts'
import { add, sub, rotate, solveLimb, length } from '../v2/pose.ts'
export function anchorAt(
  anchors: Anchors,
  id: string,
  target: Transform,
): Transform {
  const a = anchors.anchors.find((a) => a.id === id)
  if (!a) throw new Error(`Missing anchor ${id}`)
  return {
    position: add(target.position, rotate(a.position, target.yaw)),
    yaw: target.yaw + a.yaw,
  }
}
export function contactPoseAt(
  pose: ContactPose,
  anchors: Anchors,
  target: Transform,
  height = 1.8,
) {
  const pelvis = anchorAt(anchors, pose.pelvis, target),
    s = height / 1.8,
    root = add(pelvis.position, { x: 0, y: -0.88 * s, z: 0 }),
    yaw = pelvis.yaw
  const at = (x: number, y: number, z: number) =>
    add(root, rotate({ x: x * s, y: y * s, z: z * s }, yaw))
  const joints: Record<string, Vec> = {
    hips: pelvis.position,
    chest: at(0, 1.25, 0),
    head: at(0, 1.64, 0),
    leftShoulder: at(-0.22, 1.4, 0),
    rightShoulder: at(0.22, 1.4, 0),
    leftHip: at(-0.13, 0.88, 0),
    rightHip: at(0.13, 0.88, 0),
  }
  const errors: string[] = []
  for (const side of ['left', 'right'])
    for (const limb of ['Hand', 'Foot']) {
      const joint = side + limb,
        c = pose.contacts.find((c) => c.joint === joint),
        hand = limb === 'Hand',
        start = joints[side + (hand ? 'Shoulder' : 'Hip')],
        end = c
          ? anchorAt(anchors, c.anchor, target).position
          : at(
              side === 'left' ? -0.22 : 0.22,
              hand ? 0.95 : 0.08,
              hand ? 0.1 : 0.08,
            )
      const solved = solveLimb(
        start,
        end,
        (hand ? 0.34 : 0.42) * s,
        (hand ? 0.34 : 0.42) * s,
        rotate(
          { x: hand ? (side === 'left' ? -1 : 1) : 0, y: 0, z: hand ? -1 : 1 },
          yaw,
        ),
      )
      joints[side + (hand ? 'Elbow' : 'Knee')] = solved.middle
      joints[joint] = solved.end
      if (c && length(sub(end, solved.end)) > c.tolerance)
        errors.push(`${joint} cannot reach ${c.anchor}`)
    }
  return { root, yaw, joints, errors }
}
export function quadrupedPose(
  body: Body,
  target: Transform,
  phase: number,
  speed: number,
) {
  const at = (x: number, y: number, z: number) =>
      add(target.position, rotate({ x, y, z }, target.yaw)),
    joints: Record<string, Vec> = {
      hips: at(0, body.height * 0.68, -body.length * 0.32),
      chest: at(0, body.height * 0.7, body.length * 0.3),
      head: at(0, body.height, body.length * 0.48),
    }
  for (const [i, name] of [
    'frontLeft',
    'frontRight',
    'rearLeft',
    'rearRight',
  ].entries()) {
    const x = (name.endsWith('Left') ? -1 : 1) * body.width * 0.4,
      z = (name.startsWith('front') ? 1 : -1) * body.length * 0.32,
      cycle = phase + (i === 0 || i === 3 ? 0 : Math.PI),
      lift = Math.max(0, Math.sin(cycle)) * 0.16 * Math.min(1, speed),
      stride = Math.cos(cycle) * 0.22 * Math.min(1, speed)
    const top = at(x, body.height * 0.65, z),
      foot = at(x, 0.06 + lift, z + stride),
      limb = solveLimb(
        top,
        foot,
        body.legLength * 0.58,
        body.legLength * 0.58,
        rotate(
          { x: 0, y: 0, z: name.startsWith('front') ? 1 : -1 },
          target.yaw,
        ),
      )
    joints[name + 'Hip'] = top
    joints[name + 'Knee'] = limb.middle
    joints[name + 'Foot'] = limb.end
  }
  return joints
}
