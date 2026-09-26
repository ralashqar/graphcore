import {useMemo} from 'react';
import {Shape,ShapeGeometry,Vector2,BufferGeometry,Float32BufferAttribute} from 'three';
import {freeOpeningOutline,type FreeOpeningGhost} from './studioFreeOpeningTool';

/** Translucent cut-out preview where a click will place the opening; doors glow warmer. */
export function CityStudioFreeOpeningGhost({ghost,outline=false}:{ghost:FreeOpeningGhost;outline?:boolean}){
 const {fill,edge}=useMemo(()=>{const loop=freeOpeningOutline(ghost.shape,ghost.width,ghost.height),shape=new Shape(loop.map(([x,y])=>new Vector2(x,y))),positions:number[]=[];loop.forEach(([x,y],i)=>{const [nx,ny]=loop[(i+1)%loop.length];positions.push(x,y,0,nx,ny,0);});const edge=new BufferGeometry();edge.setAttribute('position',new Float32BufferAttribute(positions,3));return {fill:new ShapeGeometry(shape),edge};},[ghost.shape,ghost.width,ghost.height]);
 return <group position={[ghost.x,ghost.y,ghost.z]} rotation={[0,ghost.rotation,0]}>
  {!outline&&<mesh geometry={fill} raycast={()=>null} renderOrder={5}><meshBasicMaterial color={ghost.door?'#f0b979':'#fff1c9'} transparent opacity={.38} depthWrite={false}/></mesh>}
  <lineSegments geometry={edge} raycast={()=>null} renderOrder={6}><lineBasicMaterial color={outline?"#ffd88a":"#fffaf0"} transparent opacity={.95} depthTest={false}/></lineSegments>
 </group>;
}
