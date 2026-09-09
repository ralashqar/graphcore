import { rigProfileSchema } from './animation.ts'
import { hashGameValue } from '../compiler.ts'
const joints: Array<[string, string | null, [number, number, number]]> = [
  ['Hips', null, [0, 1, 0]], ['Spine1', 'Hips', [0, .10, 0]], ['Spine2', 'Spine1', [0, .12, 0]], ['Chest', 'Spine2', [0, .13, 0]],
  ['Neck1', 'Chest', [0, .18, 0]], ['Neck2', 'Neck1', [0, .05, 0]], ['Head', 'Neck2', [0, .08, 0]],
  ['LeftShoulder', 'Chest', [.10, .12, 0]], ['LeftArm', 'LeftShoulder', [.10, 0, 0]], ['LeftForeArm', 'LeftArm', [.28, 0, 0]], ['LeftHand', 'LeftForeArm', [.25, 0, 0]],
  ['RightShoulder', 'Chest', [-.10, .12, 0]], ['RightArm', 'RightShoulder', [-.10, 0, 0]], ['RightForeArm', 'RightArm', [-.28, 0, 0]], ['RightHand', 'RightForeArm', [-.25, 0, 0]],
  ['LeftLeg', 'Hips', [.10, -.05, 0]], ['LeftShin', 'LeftLeg', [0, -.43, 0]], ['LeftFoot', 'LeftShin', [0, -.43, 0]], ['LeftToeBase', 'LeftFoot', [0, -.04, .16]],
  ['RightLeg', 'Hips', [-.10, -.05, 0]], ['RightShin', 'RightLeg', [0, -.43, 0]], ['RightFoot', 'RightShin', [0, -.43, 0]], ['RightToeBase', 'RightFoot', [0, -.04, .16]],
]
export async function humanoidMannequin() {
  const profile = { version: 1, id: 'humanoid.mannequin.v1', units: 'meters', up: 'Y', forward: 'Z', joints: joints.map(([id, parent, translation]) => ({ id, parent, translation, rotation: [0, 0, 0, 1], sourceJoint: id })), sockets: {
    left_hand: { joint: 'LeftHand', translation: [0, 0, 0] }, right_hand: { joint: 'RightHand', translation: [0, 0, 0] },
    left_foot: { joint: 'LeftFoot', translation: [0, 0, 0] }, right_foot: { joint: 'RightFoot', translation: [0, 0, 0] },
  } }
  return rigProfileSchema.parse({ ...profile, revision: await hashGameValue(profile) })
}
