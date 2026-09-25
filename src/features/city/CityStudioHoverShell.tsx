import {useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {ExtrudeGeometry,Shape,Vector2,type MeshBasicMaterial} from 'three';
import {sculptFloorBottom,sculptFloorTop,sculptPrimitiveBoundary,type SculptVolume} from '../../domain/citySculpt';

const OUTSET=.22;

/** Soft glow around the building part under the cursor, so players see what a click will pick. */
export function CityStudioHoverShell({volume,groundHeight,upperHeight,reduced}:{volume:SculptVolume;groundHeight:number;upperHeight?:number;reduced:boolean}){
 const bottom=sculptFloorBottom(volume.startFloor,groundHeight,upperHeight),top=sculptFloorTop(volume.startFloor+volume.spanFloors-1,groundHeight,upperHeight);
 const geometry=useMemo(()=>{const loop=sculptPrimitiveBoundary(volume),cx=loop.reduce((t,p)=>t+p[0],0)/loop.length,cz=loop.reduce((t,p)=>t+p[1],0)/loop.length,shape=new Shape(loop.map(([x,z])=>{const len=Math.hypot(x-cx,z-cz)||1,grow=(len+OUTSET)/len;return new Vector2(cx+(x-cx)*grow,-(cz+(z-cz)*grow));}));return new ExtrudeGeometry(shape,{depth:top-bottom+.3,bevelEnabled:false});},[volume,top,bottom]);
 const material=useRef<MeshBasicMaterial>(null);
 useFrame(({clock,invalidate})=>{if(reduced||!material.current)return;material.current.opacity=.2+.08*Math.sin(clock.elapsedTime*4);invalidate();});
 return <mesh geometry={geometry} position={[0,bottom-.04,0]} rotation={[-Math.PI/2,0,0]} raycast={()=>null} renderOrder={2}><meshBasicMaterial ref={material} color="#ffd88a" transparent opacity={.22} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2}/></mesh>;
}
