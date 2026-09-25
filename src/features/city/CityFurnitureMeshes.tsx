import {useEffect,useLayoutEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {useThree} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import {BufferGeometry,Float32BufferAttribute,InstancedMesh,Mesh,MeshStandardMaterial,Object3D} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {STUDIO_FURNITURE} from '../../domain/cityStudioFurniture';
import type {StudioFurniture} from '../../domain/cityStudioTypes';

type Piece={geometry:BufferGeometry;material:MeshStandardMaterial};
type Pack=Map<string,Piece[]>;
let state:{status:'idle'|'loading'|'ready'|'error';pack:Pack|null}={status:'idle',pack:null};
const listeners=new Set<()=>void>(),subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},snapshot=()=>state;
const publish=(next:typeof state)=>{state=next;listeners.forEach(fn=>fn());};
const matte=new MeshStandardMaterial({vertexColors:true,roughness:.78}),metal=new MeshStandardMaterial({vertexColors:true,roughness:.32,metalness:.55});
export function loadFurnitureKit(){
 if(state.status==='loading'||state.status==='ready')return;
 publish({status:'loading',pack:null});
 void new GLTFLoader().loadAsync('/city/furniture/v1/furniture.glb').then(gltf=>{
  const pack:Pack=new Map();gltf.scene.updateMatrixWorld(true);
  try{for(const root of gltf.scene.children){const id=String(root.userData.furniture_id??root.name);if(!Object.hasOwn(STUDIO_FURNITURE,id))continue;
   const groups=new Map<boolean,BufferGeometry[]>();root.traverse(obj=>{
    if(!(obj instanceof Mesh)||Array.isArray(obj.material))return;
    const source=obj.geometry.clone().applyMatrix4(obj.matrixWorld),g=source.index?source.toNonIndexed():source;if(source!==g)source.dispose();
    for(const key of Object.keys(g.attributes))if(!['position','normal'].includes(key))g.deleteAttribute(key);
    const material=obj.material as MeshStandardMaterial,colors=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3)material.color.toArray(colors,i);g.setAttribute('color',new Float32BufferAttribute(colors,3));
    const metallic=material.metalness>.2;groups.set(metallic,[...(groups.get(metallic)??[]),g]);
   });pack.set(id,[...groups].map(([isMetal,geometries])=>{const geometry=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());if(!geometry)throw Error('Invalid furniture geometry');return {geometry,material:isMetal?metal:matte};}));
  }if(pack.size!==Object.keys(STUDIO_FURNITURE).length)throw Error('Furniture library is incomplete');publish({status:'ready',pack});
  }catch(error){pack.forEach(parts=>parts.forEach(p=>p.geometry.dispose()));throw error;}
  finally{gltf.scene.traverse(obj=>{if(obj instanceof Mesh){obj.geometry.dispose();(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>m.dispose());}});}
 }).catch(()=>publish({status:'error',pack:null}));
}
export function useFurnitureKit(){const result=useSyncExternalStore(subscribe,snapshot,snapshot);useEffect(()=>{loadFurnitureKit();const retry=()=>{if(state.status==='error')loadFurnitureKit();};window.addEventListener('online',retry);return()=>window.removeEventListener('online',retry);},[]);return result;}
function FurnitureBatch({piece,items,y}:{piece:Piece;items:StudioFurniture[];y:number}){
 const ref=useRef<InstancedMesh>(null),invalidate=useThree(s=>s.invalidate);
 useLayoutEffect(()=>{if(!ref.current)return;const obj=new Object3D();items.forEach((item,i)=>{obj.position.set(item.x,y,item.z);obj.rotation.set(0,item.rotation,0);obj.updateMatrix();ref.current!.setMatrixAt(i,obj.matrix);});ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();invalidate();},[items,y,invalidate]);
 return <instancedMesh dispose={null} name="furniture-instances" ref={ref} args={[piece.geometry,piece.material,items.length]}/>;
}
export function FurnitureInstances({items,y}:{items:StudioFurniture[];y:number}){
 const kit=useFurnitureKit(),groups=useMemo(()=>{const out=new Map<string,StudioFurniture[]>();items.forEach(item=>out.set(item.kind,[...(out.get(item.kind)??[]),item]));return out;},[items]);
 return <group name={`furniture-library-${kit.status}`}>{[...groups].flatMap(([kind,placed])=>(kit.pack?.get(kind)??[]).map((piece,i)=><FurnitureBatch key={`${kind}/${i}`} piece={piece} items={placed} y={y}/>))}{kit.status==='error'&&items.length>0&&<Html position={[items[0].x,y+.5,items[0].z]}><button onClick={loadFurnitureKit}>Reload furniture models</button></Html>}</group>;
}
export type FurnitureGhost={item:StudioFurniture;y:number;reason:string|null};
export function FurniturePlacementGhost({ghost}:{ghost:FurnitureGhost}){
 const {item,y,reason}=ghost,kit=useFurnitureKit(),spec=STUDIO_FURNITURE[item.kind],color=reason?'#df946c':'#95bf9c';
 const material=useMemo(()=>new MeshStandardMaterial({color,transparent:true,opacity:.66,depthWrite:false,roughness:.8}),[color]);useEffect(()=>()=>material.dispose(),[material]);
 return <group name="furniture-placement-ghost" position={[item.x,y+.016,item.z]} rotation={[0,item.rotation,0]} raycast={()=>null}>
  {(kit.pack?.get(item.kind)??[]).map((part,i)=><mesh dispose={null} key={i} geometry={part.geometry} material={material}/>)}
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.01,0]}><planeGeometry args={[spec.width+.04,spec.depth+.04]}/><meshBasicMaterial color={color} transparent opacity={.25} depthWrite={false}/></mesh>
  <Html center position={[0,spec.height+.25,0]} style={{pointerEvents:'none'}}><span className="studio-drag-label">{reason||`${spec.label} · click to place · R to turn`}</span></Html>
 </group>;
}
