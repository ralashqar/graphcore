import { nodesOf, type Design, type Vec } from './spec.ts'
export const add = (a: Vec, b: Vec): Vec => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
})
export const sub = (a: Vec, b: Vec): Vec => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
})
export const scale = (a: Vec, s: number): Vec => ({
  x: a.x * s,
  y: a.y * s,
  z: a.z * s,
})
export const length = (a: Vec) => Math.hypot(a.x, a.y, a.z)
export const unit = (a: Vec) => scale(a, 1 / (length(a) || 1))
export const mix = (a: Vec, b: Vec, t: number) =>
  add(scale(a, 1 - t), scale(b, t))
export const rotate = (p: Vec, yaw: number): Vec => ({
  x: p.x * Math.cos(yaw) + p.z * Math.sin(yaw),
  y: p.y,
  z: -p.x * Math.sin(yaw) + p.z * Math.cos(yaw),
})
export function solveLimb(
  root: Vec,
  target: Vec,
  a: number,
  b: number,
  pole: Vec,
) {
  const delta = sub(target, root),
    distance = Math.max(
      0.001,
      Math.min(a + b - 0.001, Math.max(Math.abs(a - b) + 0.001, length(delta))),
    ),
    axis = unit(delta)
  const projected = sub(
      pole,
      scale(axis, axis.x * pole.x + axis.y * pole.y + axis.z * pole.z),
    ),
    bend = unit(projected)
  const along = (a * a - b * b + distance * distance) / (2 * distance),
    height = Math.sqrt(Math.max(0, a * a - along * along))
  return {
    middle: add(root, add(scale(axis, along), scale(bend, height))),
    end: add(root, scale(axis, distance)),
  }
}
export function poseAt(
  d: Design,
  poseId: string | null,
  progress: number,
  height = 1.8,
  grip = false,
) {
  const spec = nodesOf(d, 'pose').find((p) => p.id === poseId),
    t = Math.max(0, Math.min(1, progress)),
    pulse = Math.sin(t * Math.PI),
    size = height / 1.8
  const rightShoulder = { x: 0.22, y: 1.4, z: 0 },
    leftShoulder = { x: -0.22, y: 1.4, z: 0 }
  let right = { x: 0.32, y: 0.95, z: 0.08 },
    left = { x: -0.32, y: 0.95, z: 0.08 }
  if (spec) {
    const reach = spec.extension * 0.6 * pulse,
      lift = spec.lift * pulse
    if (spec.style === 'cast')
      right = { x: 0.24, y: 1.3 + lift, z: 0.15 + reach }
    if (spec.style === 'strike')
      right = { x: 0.45 * (1 - 2 * t), y: 1.3 + lift, z: 0.2 + reach }
    if (spec.style === 'shield') {
      right = { x: 0.18, y: 1.35, z: 0.35 }
      left = { x: -0.18, y: 1.35, z: 0.35 }
    }
    if (spec.style === 'dodge') {
      right = { x: 0.38, y: 1.15, z: -0.25 }
      left = { x: -0.38, y: 1.15, z: -0.25 }
    }
  }
  if (grip) {
    right = { x: 0.25, y: 1.7, z: 0.4 }
    left = { x: -0.25, y: 1.7, z: 0.4 }
  }
  const r = solveLimb(rightShoulder, right, 0.34, 0.34, { x: 1, y: 0, z: -1 }),
    l = solveLimb(leftShoulder, left, 0.34, 0.34, { x: -1, y: 0, z: -1 })
  const joints: Record<string, Vec> = {
    hips: { x: 0, y: 0.88, z: 0 },
    chest: { x: 0, y: 1.25, z: 0 },
    head: { x: 0, y: 1.64, z: 0 },
    rightShoulder,
    leftShoulder,
    rightElbow: r.middle,
    leftElbow: l.middle,
    rightHand: r.end,
    leftHand: l.end,
    rightHip: { x: 0.13, y: 0.88, z: 0 },
    leftHip: { x: -0.13, y: 0.88, z: 0 },
    rightFoot: { x: 0.13, y: 0.08, z: 0.08 },
    leftFoot: { x: -0.13, y: 0.08, z: 0.08 },
  }
  for (const side of ['right', 'left']) {
    const leg = solveLimb(
      joints[`${side}Hip`],
      joints[`${side}Foot`],
      0.42,
      0.42,
      { x: 0, y: 0, z: 1 },
    )
    joints[`${side}Knee`] = leg.middle
    joints[`${side}Foot`] = leg.end
  }
  return Object.fromEntries(
    Object.entries(joints).map(([k, p]) => [k, scale(p, size)]),
  )
}
export function socketAt(
  d: Design,
  socketId: string,
  position: Vec,
  yaw: number,
  height: number,
  poseId: string | null,
  progress: number,
) {
  const rig = nodesOf(d, 'rig')[0],
    s = rig.sockets.find((s) => s.id === socketId)
  if (!s) throw new Error(`Missing socket ${socketId}`)
  const joints = poseAt(d, poseId, progress, height)
  return {
    position: add(
      position,
      rotate(add(joints[s.joint], scale(s.offset, height / 1.8)), yaw),
    ),
    forward: unit(rotate(s.forward, yaw)),
  }
}
