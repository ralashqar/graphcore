import {useMemo} from 'react';
import {BufferGeometry,DoubleSide,Float32BufferAttribute} from 'three';
import type {RoofOpeningGhost} from '../../domain/cityStudioRoofOpenings';

/** Translucent skylight/dormer preview on the slope; red when it cannot fit there. */
export function CityStudioRoofOpeningGhost({ghost}:{ghost:RoofOpeningGhost}){
 const {shell,edge}=useMemo(()=>{const shell=new BufferGeometry();shell.setAttribute('position',new Float32BufferAttribute(ghost.triangles,3));const positions:number[]=[];ghost.outline.forEach((p,i)=>{const q=ghost.outline[(i+1)%ghost.outline.length];positions.push(...p,...q);});const edge=new BufferGeometry();edge.setAttribute('position',new Float32BufferAttribute(positions,3));return {shell,edge};},[ghost]);
 const color=ghost.valid?'#fff1c9':'#e39a80';
 return <group>
  <mesh geometry={shell} raycast={()=>null} renderOrder={5}><meshBasicMaterial color={color} transparent opacity={.35} depthWrite={false} side={DoubleSide}/></mesh>
  <lineSegments geometry={edge} raycast={()=>null} renderOrder={6}><lineBasicMaterial color={ghost.valid?'#fffaf0':'#e39a80'} transparent opacity={.95} depthTest={false}/></lineSegments>
 </group>;
}
