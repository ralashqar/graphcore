/**
 * Animated leaves of kit doors (every door opens, cityStudioDoorMotion): for each placed kit door piece with
 * `portal`, its leaf geometry (split from the kit at load) is drawn at the piece and moved every frame by its door
 * state: swinging about the hinge, sliding into the wall or rolling up to the head. The static kit draws the same
 * leaves closed wherever these are not mounted (far, or the city's shared kit beyond its near level).
 */
import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Group,Matrix4,type BufferGeometry} from 'three';
import {STOREFRONT_MODULE_IDS} from '../../domain/cityStudioCatalog';
import {kitDoorMotion,kitDoorPortalId,kitLeafMatrix,type KitDoorLeaf} from '../../domain/cityStudioDoorMotion';
import {studioDoorAngle} from '../../domain/cityStudioDoorState';
import type {StudioPiece} from '../../domain/cityStudioTypes';
import {StudioInstances} from './CityStudioMeshes';

type Pack=Map<string,{geometry:BufferGeometry;channel:string;leaf?:number}[]>;
function Leaf({plotId,portalId,leaf,parts,piece}:{plotId:string;portalId:string;leaf:KitDoorLeaf;parts:{geometry:BufferGeometry;channel:string}[];piece:StudioPiece}){
 const group=useRef<Group>(null),last=useRef(-1),values=useMemo(()=>new Array<number>(16),[]),matrix=useMemo(()=>new Matrix4(),[]);
 // The leaf's own placement: the piece's family and finishes at the leaf group's origin (the group carries the motion).
 const at=useMemo(()=>[{...piece,x:0,y:0,z:0,rotation:0,scale:[1,1,1] as StudioPiece['scale']}],[piece]);
 useFrame(({invalidate})=>{const g=group.current;if(!g)return;const f=studioDoorAngle(plotId,portalId);if(f===last.current)return;last.current=f;g.matrix.copy(matrix.fromArray(kitLeafMatrix(leaf,f,values)));g.matrixWorldNeedsUpdate=true;invalidate();});
 return <group ref={group} matrixAutoUpdate={false} name={`studio-kit-door-${portalId}`}>{parts.map((p,i)=><StudioInstances key={i} geometry={p.geometry} channel={p.channel} placements={at} texture={piece.finishes?.[p.channel as 'wall']?.texture} seeThrough={STOREFRONT_MODULE_IDS.has(piece.module)}/>)}</group>;
}
export function CityStudioKitDoorLeaves({plotId,pieces,pack,version}:{plotId:string;pieces:StudioPiece[];pack:Pack;version:2|3|4|5}){
 const doors=useMemo(()=>pieces.filter(p=>p.portal).flatMap(piece=>{
  const spec=kitDoorMotion(version,piece.module),parts=pack.get(piece.module)??[];if(!spec)return [];
  return [{piece,leaves:spec.leaves.map((leaf,index)=>({leaf,index,parts:parts.filter(p=>p.leaf===index&&!piece.omit?.includes(p.channel))}))}];
 }),[pieces,pack,version]);
 return <group name="city-studio-kit-doors">{doors.map(({piece,leaves})=><group key={piece.id} position={[piece.x,piece.y,piece.z]} rotation={[0,piece.rotation,0]} scale={piece.scale}>
  {leaves.map(({leaf,index,parts})=><Leaf key={index} plotId={plotId} portalId={kitDoorPortalId(piece.id,index)} leaf={leaf} parts={parts} piece={piece}/>)}
 </group>)}</group>;
}
