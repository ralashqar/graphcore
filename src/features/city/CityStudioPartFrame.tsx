import {useMemo} from 'react';
import {BufferGeometry,Float32BufferAttribute} from 'three';
import type {SculptVolume} from '../../domain/citySculpt';
import {studioFrameSegments} from './studioFrame';

export function CityStudioPartFrame({volume,groundHeight,upperHeight,roof,color='#fffaf0',opacity=.85}:{volume:SculptVolume;groundHeight:number;upperHeight?:number;roof?:string;color?:string;opacity?:number}){
 const geometry=useMemo(()=>{const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(studioFrameSegments(volume,groundHeight,upperHeight,roof),3));return g;},[volume,groundHeight,upperHeight,roof]);
 return <lineSegments geometry={geometry} raycast={()=>null} renderOrder={5}><lineBasicMaterial color={color} transparent opacity={opacity} depthTest={false} depthWrite={false}/></lineSegments>;
}
