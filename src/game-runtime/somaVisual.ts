import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'
import type { Rig } from '../domain/game/v3/somaPose'
/** A no-download mannequin on exactly the same hierarchy as baked SOMA clips. */
export function createSomaVisual(scene:Scene,root:TransformNode,rig:Rig){
 const basis=new TransformNode(`${root.name}.basis`,scene);basis.parent=root;basis.scaling.x=-1
 const targets=new Map<string,TransformNode>(),material=new StandardMaterial(`${root.name}.body`,scene)
 material.diffuseColor=new Color3(.35,.65,.8)
 for(const j of rig.joints){const node=new TransformNode(j.id,scene);node.parent=j.parent?targets.get(j.parent)!:basis;node.position=Vector3.FromArray(j.translation);node.rotationQuaternion=Quaternion.FromArray(j.rotation);targets.set(j.id,node)}
 const segments:Record<string,string>={Hips:'Spine1',Spine1:'Spine2',Spine2:'Chest',Chest:'Neck1',Neck1:'Neck2',Head:'HeadEnd',LeftArm:'LeftForeArm',RightArm:'RightForeArm',LeftForeArm:'LeftHand',RightForeArm:'RightHand',LeftLeg:'LeftShin',RightLeg:'RightShin',LeftShin:'LeftFoot',RightShin:'RightFoot',LeftFoot:'LeftToeBase',RightFoot:'RightToeBase',LeftHand:'LeftHandMiddle2',RightHand:'RightHandMiddle2'}
 for(const [joint,child]of Object.entries(segments)){
  const node=targets.get(joint)!
  // Obtain offset in bind coordinates (hands' endpoint can be a grandchild).
  const rest=(name:string):Vector3=>{const j=rig.joints.find(j=>j.id===name)!;return Vector3.FromArray(j.translation).add(j.parent?rest(j.parent):Vector3.Zero())}
  const delta=rest(child).subtract(rest(joint)),torso=['Hips','Spine1','Spine2','Chest'].includes(joint),head=joint==='Head'
  const mesh=CreateSphere(`body.${joint}`,{segments:8,diameter:1},scene);mesh.parent=node;mesh.position=delta.scale(.5)
  mesh.scaling.set(torso?.28:head?.18:.10,Math.max(.07,delta.length()),torso?.17:head?.19:.10)
  const direction=delta.normalize(),axis=Vector3.Cross(Vector3.Up(),direction),dot=Vector3.Dot(Vector3.Up(),direction)
  mesh.rotationQuaternion=axis.length()>.0001?Quaternion.RotationAxis(axis.normalize(),Math.acos(Math.max(-1,Math.min(1,dot)))):dot<0?Quaternion.RotationAxis(Vector3.Right(),Math.PI):Quaternion.Identity()
  mesh.material=material
 }
 return targets
}
