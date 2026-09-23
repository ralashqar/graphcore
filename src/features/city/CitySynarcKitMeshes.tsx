import {useLayoutEffect,useMemo,useRef} from 'react';
import {useThree} from '@react-three/fiber';
import {InstancedMesh,Object3D} from 'three';
import type {KitPlacement} from '../../domain/citySynarcKit';
import type {Piece} from './CityInstances';
import type {SynarcKitPack} from './CitySynarcKit';

function KitInstanceGroup({piece,placements}:{piece:Piece;placements:KitPlacement[]}){
 const mesh=useRef<InstancedMesh>(null),dummy=useMemo(()=>new Object3D(),[]),invalidate=useThree(s=>s.invalidate);
 useLayoutEffect(()=>{
  if(!mesh.current)return;
  placements.forEach((p,i)=>{
   dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);
   dummy.scale.set(p.scaleX,1,1);dummy.updateMatrix();mesh.current!.setMatrixAt(i,dummy.matrix);
  });
  mesh.current.instanceMatrix.needsUpdate=true;mesh.current.computeBoundingSphere();invalidate();
 },[placements,dummy,invalidate]);
 return <instancedMesh ref={mesh} args={[piece.geometry,piece.material,placements.length]} frustumCulled={false}/>;
}

/** Batches repeated parts inside one constructed plot; geometry is shared with city batches. */
export function CitySynarcKitMeshes({pack,placements}:{pack:SynarcKitPack;placements:KitPlacement[]}){
 const groups=useMemo(()=>{
  const map=new Map<string,KitPlacement[]>();
  for(const placement of placements){const list=map.get(placement.part)??[];list.push(placement);map.set(placement.part,list);}
  return [...map];
 },[placements]);
 return <group name="synarc-tile-kit">{groups.flatMap(([id,items])=>
  (pack.get(id)??[]).map((piece,i)=><KitInstanceGroup key={`${id}:${i}`} piece={piece} placements={items}/>))}</group>;
}
