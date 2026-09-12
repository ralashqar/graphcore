import { estimateSomaPose, multiply, forwardPose, type Rig, type Q, type SkeletalPose } from '../v3/somaPose.ts'
import { applySwordStance } from '../v3/equipmentPose.ts'
import type { MotionNode, StudioStance } from './graph.ts'

const turn = (angle: number): Q => [0, Math.sin(angle/2), 0, Math.cos(angle/2)]
const swing = (angle: number): Q => [Math.sin(angle/2), 0, 0, Math.cos(angle/2)]
export function boundaryPose(rig: Rig, stance: StudioStance, boundary: string): SkeletalPose {
  const pose = estimateSomaPose(rig, { time: 0, speed: 0, mode: 'ground' })
  if (stance.equipment === 'one_handed_sword') applySwordStance(rig, pose, 1)
  const angle = boundary.endsWith('boundary_1') ? -.7 : boundary.endsWith('boundary_2') ? .65 : 0
  for (const joint of ['Spine2','Chest']) if (pose.rotations[joint]) pose.rotations[joint] = multiply(turn((angle+stance.torsoTurn)*.45), pose.rotations[joint])
  if (pose.rotations.RightArm) pose.rotations.RightArm = multiply(turn(angle), multiply(swing(stance.guardHeight*2), pose.rotations.RightArm))
  return pose
}
export function blendPose(a: SkeletalPose, b: SkeletalPose, amount: number): SkeletalPose {
  const t = Math.max(0,Math.min(1,amount)), rotations: Record<string,Q> = {}
  for (const [id, qa] of Object.entries(a.rotations)) {
    const qb = b.rotations[id] ?? qa, sign = qa.reduce((sum,v,i) => sum+v*qb[i],0)<0?-1:1
    const q = qa.map((v,i) => v*(1-t)+qb[i]*sign*t), size = Math.hypot(...q)
    rotations[id] = q.map(v => v/size) as Q
  }
  return { root: a.root.map((v,i) => v*(1-t)+b.root[i]*t) as SkeletalPose['root'], rotations }
}
export function studioPose(rig: Rig, node: MotionNode, stance: StudioStance, seconds: number): SkeletalPose {
  if (node.kind === 'locomotion') {
    const pose = estimateSomaPose(rig, { time: seconds, speed: node.speed, mode: 'ground' })
    if (stance.equipment === 'one_handed_sword') {
      const guard = boundaryPose(rig,stance,node.entry)
      for (const joint of ['RightArm','RightForeArm','RightHand']) pose.rotations[joint] = guard.rotations[joint]
    }
    return pose
  }
  const t = Math.max(0, Math.min(1, seconds/node.duration))
  const start = boundaryPose(rig,stance,node.entry), end = boundaryPose(rig,stance,node.exit)
  const hit = boundaryPose(rig,stance,node.exit)
  hit.rotations.RightArm = multiply(swing(-.7),hit.rotations.RightArm)
  const phase = t < node.impact ? t/node.impact : (t-node.impact)/(1-node.impact)
  const eased = phase*phase*(3-2*phase)
  return t < node.impact ? blendPose(start,hit,eased) : blendPose(hit,end,eased)
}
export function poseConstraint(rig: Rig, pose: SkeletalPose, time: number) {
  const world = forwardPose(rig,pose)
  return { time, positions: rig.joints.map(j => { const p=world.positions[j.id]; return [p.x,p.y,p.z] as [number,number,number] }), rotations: rig.joints.map(j => world.rotations[j.id]) }
}
