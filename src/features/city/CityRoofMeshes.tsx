import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {BufferGeometry,Float32BufferAttribute,InstancedMesh,Object3D,Vector3} from 'three';
import {useThree} from '@react-three/fiber';
import type {StudioRoofEdge,StudioRoofPatch} from '../../domain/cityStudioTypes';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
function RoofPatch({patch}:{patch:StudioRoofPatch}){
 const geometry=useMemo(()=>{const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(patch.vertices,3));g.computeVertexNormals();return g;},[patch.vertices]);
 const material=useMemo(()=>{const m=citySurfaceMaterial(false,patch.finish==='terracotta'?'terracotta':patch.finish==='metal'?'metal':undefined);m.color.set(patch.color??(patch.finish==='terracotta'?'#a9694e':patch.finish==='metal'?'#7c9189':'#64727b'));return m;},[patch.finish,patch.color]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);useEffect(()=>()=>material.dispose(),[material]);return <mesh geometry={geometry} material={material}/>;
}
function RoofEdges({edges}:{edges:StudioRoofEdge[]}){
 const ref=useRef<InstancedMesh>(null),invalidate=useThree(s=>s.invalidate),material=useMemo(()=>{const m=citySurfaceMaterial();m.color.set('#56645f');return m;},[]);
 useEffect(()=>()=>material.dispose(),[material]);
 useLayoutEffect(()=>{if(!ref.current)return;const dummy=new Object3D(),up=new Vector3(0,1,0);edges.forEach((e,i)=>{const a=new Vector3(...e.a),b=new Vector3(...e.b),direction=b.clone().sub(a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.position.y+=.025;dummy.quaternion.setFromUnitVectors(up,direction.clone().normalize());dummy.scale.set(e.kind==='abutment'?.15:.07,direction.length(),.055);dummy.updateMatrix();ref.current!.setMatrixAt(i,dummy.matrix);});ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();invalidate();},[edges,invalidate]);
 return <instancedMesh ref={ref} args={[undefined,material,edges.length]}><boxGeometry args={[1,1,1]}/></instancedMesh>;
}
export function CityRoofMeshes({patches,edges}:{patches:StudioRoofPatch[];edges:StudioRoofEdge[]}){return <group name="connected-roofs">{patches.map(p=><RoofPatch key={p.partId} patch={p}/>)}<RoofEdges edges={edges}/></group>;}
