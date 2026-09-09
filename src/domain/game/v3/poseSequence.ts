import { z } from 'zod'
import { somaSkeleton } from './somaSkeleton.ts'
import {
  estimateSomaPose,
  contactPose,
  forwardPose,
  multiply,
  type Rig,
  type Q,
  type SkeletalPose,
} from './somaPose.ts'

export const PERFORMANCE_RUNTIME = 'gameplay-3.5.0' as const
export const PERFORMANCE_CATALOG = 'performance-1.0.0' as const
const id = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/)
const angle = z
  .number()
  .finite()
  .min(-Math.PI * 2)
  .max(Math.PI * 2)
const rotation = z.tuple([angle, angle, angle])
const offset = z.tuple([
  z.number().min(-0.3).max(0.3),
  z.number().min(-0.85).max(0.2),
  z.number().min(-0.3).max(0.3),
])
const target = z
  .object({
    effector: z.enum(['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']),
    position: z.tuple([
      z.number().min(-1).max(1),
      z.number().min(-0.1).max(2),
      z.number().min(-1).max(1),
    ]),
  })
  .strict()
export const poseSequenceSchema = z
  .object({
    version: z.literal(1),
    id,
    label: z.string().min(1).max(120),
    role: z.enum([
      'custom',
      'roll',
      'uppercut',
      'recoil',
      'fall_back',
      'prone',
      'get_up',
    ]),
    duration: z.number().min(0.5).max(4),
    loop: z.boolean(),
    keys: z
      .array(
        z
          .object({
            time: z.number().min(0).max(1),
            label: z.string().min(1).max(60),
            easing: z.enum(['linear', 'smooth']),
            root: offset,
            rotations: z.record(z.string(), rotation),
            targets: z.array(target).max(4),
          })
          .strict(),
      )
      .min(2)
      .max(12),
    contacts: z
      .array(
        z
          .object({
            effector: target.shape.effector,
            start: z.number().min(0).max(1),
            end: z.number().min(0).max(1),
            position: target.shape.position,
          })
          .strict(),
      )
      .max(8),
    markers: z
      .array(
        z
          .object({
            name: z.enum([
              'ready',
              'active_start',
              'active_end',
              'recover',
              'complete',
            ]),
            time: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(5),
  })
  .strict()
  .superRefine((s, ctx) => {
    const error = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (s.keys[0].time !== 0 || s.keys.at(-1)!.time !== 1)
      error('Sequence must cover the entire normalized timeline')
    for (let i = 0; i < s.keys.length; i++) {
      const k = s.keys[i]
      if (i && k.time <= s.keys[i - 1].time)
        error('Keys must strictly increase')
      for (const [joint, angles] of Object.entries(k.rotations)) {
        if (!somaSkeleton.joints.some((j) => j.name === joint))
          error(`Unknown SOMA joint ${joint}`)
        if (joint !== 'Hips' && angles.some((v) => Math.abs(v) > Math.PI))
          error(`Joint rotation outside supported range: ${joint}`)
      }
      if (new Set(k.targets.map((t) => t.effector)).size !== k.targets.length)
        error('Duplicate effector target')
    }
    for (const c of s.contacts)
      if (c.start > c.end) error('Invalid contact interval')
    if (new Set(s.markers.map((m) => m.name)).size !== s.markers.length)
      error('Duplicate semantic marker')
    if (s.markers.some((m, i) => i > 0 && m.time < s.markers[i - 1].time))
      error('Markers must be ordered')
    if (s.loop) {
      const a = s.keys[0],
        b = s.keys.at(-1)!
      if (
        JSON.stringify([a.root, a.rotations, a.targets]) !==
        JSON.stringify([b.root, b.rotations, b.targets])
      )
        error('Loop endpoints must match')
    }
  })
export type PoseSequence = z.infer<typeof poseSequenceSchema>
const axis = (r: number[], i: number): Q => {
  const q: Q = [0, 0, 0, Math.cos(r[i] / 2)]
  q[i] = Math.sin(r[i] / 2)
  return q
}
export function evaluateSequence(
  rig: Rig,
  sequence: PoseSequence,
  seconds: number,
): SkeletalPose {
  const u = Math.max(
    0,
    Math.min(
      1,
      sequence.loop
        ? (seconds / sequence.duration) % 1
        : seconds / sequence.duration,
    ),
  )
  const index = Math.max(
    0,
    sequence.keys.findIndex(
      (_k, i) => i < sequence.keys.length - 1 && u <= sequence.keys[i + 1].time,
    ),
  )
  const a = sequence.keys[index],
    b = sequence.keys[index + 1],
    linear = Math.max(0, Math.min(1, (u - a.time) / (b.time - a.time)))
  const t = b.easing === 'smooth' ? linear * linear * (3 - 2 * linear) : linear
  const pose = estimateSomaPose(rig, { time: 0, speed: 0, mode: 'pose' })
  for (let i = 0; i < 3; i++)
    pose.root[i] += a.root[i] + (b.root[i] - a.root[i]) * t
  // Euler winding is retained between milestones (a full roll must not collapse to identity).
  for (const joint of new Set([
    ...Object.keys(a.rotations),
    ...Object.keys(b.rotations),
  ])) {
    const ar = a.rotations[joint] ?? [0, 0, 0],
      br = b.rotations[joint] ?? [0, 0, 0],
      r = ar.map((v, i) => v + (br[i] - v) * t)
    pose.rotations[joint] = multiply(
      pose.rotations[joint],
      multiply(multiply(axis(r, 0), axis(r, 1)), axis(r, 2)),
    )
  }
  // Keep the approximation above its local support plane without changing the controller.
  const uncorrected = forwardPose(rig, pose),
    lowest = Math.min(...Object.values(uncorrected.positions).map((p) => p.y))
  pose.root[1] += Math.max(0, -lowest)
  const fk = forwardPose(rig, pose)
  for (const effector of [
    'LeftHand',
    'RightHand',
    'LeftFoot',
    'RightFoot',
  ] as const) {
    const av = a.targets.find((p) => p.effector === effector)?.position,
      bv = b.targets.find((p) => p.effector === effector)?.position
    const contact = sequence.contacts.find(
      (c) => c.effector === effector && u >= c.start && u <= c.end,
    )
    if (!av && !bv && !contact) continue
    const p = fk.positions[effector],
      from = av ?? [p.x, p.y, p.z],
      to = bv ?? [p.x, p.y, p.z]
    const position =
        contact?.position ?? from.map((v, i) => v + (to[i] - v) * t),
      side = effector.startsWith('Left') ? 'Left' : 'Right',
      hand = effector.endsWith('Hand')
    contactPose(
      rig,
      pose,
      hand
        ? [`${side}Arm`, `${side}ForeArm`, effector]
        : [`${side}Leg`, `${side}Shin`, effector],
      { x: position[0], y: position[1], z: position[2] },
      { x: hand ? (side === 'Left' ? 1 : -1) : 0, y: 0, z: hand ? -1 : 1 },
      0.12,
    )
  }
  return pose
}
export function validateSequence(rig: Rig, s: PoseSequence): string[] {
  const failures = new Set<string>()
  let previous: SkeletalPose | undefined
  for (const key of s.keys) {
    const fk = forwardPose(rig, evaluateSequence(rig, s, key.time * s.duration))
    for (const target of key.targets) {
      const p = fk.positions[target.effector]
      if (
        Math.hypot(
          p.x - target.position[0],
          p.y - target.position[1],
          p.z - target.position[2],
        ) > 0.12
      )
        failures.add(`Unreachable ${target.effector} milestone`)
    }
  }
  for (let i = 0; i <= Math.ceil(s.duration * 60); i++) {
    const time = Math.min(s.duration, i / 60),
      pose = evaluateSequence(rig, s, time),
      fk = forwardPose(rig, pose)
    for (const [name, q] of Object.entries(pose.rotations)) {
      if (!q.every(Number.isFinite) || Math.abs(Math.hypot(...q) - 1) > 0.001)
        failures.add(`Invalid rotation ${name}`)
      if (previous) {
        const dot = Math.min(
          1,
          Math.abs(
            q.reduce((sum, v, k) => sum + v * previous!.rotations[name][k], 0),
          ),
        )
        if (2 * Math.acos(dot) * 60 > 45)
          failures.add(`Excessive angular speed ${name}`)
      }
    }
    if (!pose.root.every(Number.isFinite))
      failures.add('Invalid root transform')
    for (const c of s.contacts)
      if (time / s.duration >= c.start && time / s.duration <= c.end) {
        const p = fk.positions[c.effector]
        if (
          Math.hypot(
            p.x - c.position[0],
            p.y - c.position[1],
            p.z - c.position[2],
          ) > 0.12
        )
          failures.add(`Unreachable ${c.effector} contact`)
      }
    previous = pose
  }
  return [...failures]
}
