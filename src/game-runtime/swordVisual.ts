import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'

export function createSwordVisual(scene:Scene,targets:Map<string,TransformNode>) {
  const hand=targets.get('RightHand'),back=targets.get('Chest')
  if(!hand||!back)return undefined
  const root=new TransformNode('equipment.sword',scene)
  const metal=new StandardMaterial('equipment.sword.metal',scene);metal.diffuseColor=new Color3(.66,.73,.79)
  const grip=new StandardMaterial('equipment.sword.grip',scene);grip.diffuseColor=new Color3(.19,.12,.08)
  const blade=MeshBuilder.CreateBox('sword.blade',{width:.055,height:.65,depth:.015},scene);blade.position.y=.4;blade.parent=root;blade.material=metal
  const guard=MeshBuilder.CreateBox('sword.guard',{width:.19,height:.025,depth:.035},scene);guard.position.y=.06;guard.parent=root;guard.material=metal
  const handle=MeshBuilder.CreateCylinder('sword.handle',{height:.14,diameter:.028,tessellation:8},scene);handle.parent=root;handle.material=grip
  scene.onDisposeObservable.add(()=>{metal.dispose();grip.dispose()})
  let wasStowed:boolean|undefined
  return {update(stowed:boolean){
    if(wasStowed===stowed)return
    wasStowed=stowed;root.parent=stowed?back:hand
    root.position.set(stowed?.08:0,stowed?-.22:0,stowed?-.15:.015)
    root.rotation.set(stowed?Math.PI:0,0,stowed?-.5:0)
  }}
}
