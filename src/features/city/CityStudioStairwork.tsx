/**
 * Draws StudioResolved.stairwork (docs/city-stairs-entrances.md): interior stairs, stairwell guards and door entrances.
 * Procedural boxes and cylinders are instanced per material; glass panels and cheek walls are merged triangle soups;
 * Blender stair parts (public/city/stairs/v1) are instanced per part, with the medium LOD beyond 28 m.
 * Everything is building-local, so this mounts inside the sculpt building group.
 */
import {useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {BoxGeometry,BufferGeometry,CylinderGeometry,Euler,Float32BufferAttribute,Group,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,Quaternion,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {STAIRWORK_MATERIALS,STAIR_PART_IDS,type StairPartId,type StairworkMaterial,type StudioStairwork} from '../../domain/cityStudioRailings';
import type {StudioFloorView} from './cityStudioView';

type Piece={geometry:BufferGeometry;material:MeshStandardMaterial};
type Pack=Map<StairPartId,Piece[]>;
type KitState={status:'idle'|'loading'|'ready'|'error';full:Pack|null;medium:Pack|null};
let state:KitState={status:'idle',full:null,medium:null};
const listeners=new Set<()=>void>(),subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},snapshot=()=>state;
const publish=(next:KitState)=>{state=next;listeners.forEach(fn=>fn());};
const kitMaterials={matte:new MeshStandardMaterial({vertexColors:true,roughness:.72}),metal:new MeshStandardMaterial({vertexColors:true,roughness:.35,metalness:.6}),light:new MeshStandardMaterial({vertexColors:true,emissive:'#ffb866',emissiveIntensity:1.4,roughness:.4})};
async function loadPack(url:string):Promise<Pack>{
 const gltf=await new GLTFLoader().loadAsync(url),pack:Pack=new Map();gltf.scene.updateMatrixWorld(true);
 try{for(const root of gltf.scene.children){const id=String(root.userData.stair_part_id??root.name) as StairPartId;if(!STAIR_PART_IDS.includes(id))continue;
  const groups=new Map<keyof typeof kitMaterials,BufferGeometry[]>();const inverse=new Matrix4().copy(root.matrixWorld).invert();
  root.traverse(obj=>{if(!(obj instanceof Mesh)||Array.isArray(obj.material))return;
   const source=obj.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(inverse,obj.matrixWorld)),g=source.index?source.toNonIndexed():source;if(source!==g)source.dispose();
   for(const key of Object.keys(g.attributes))if(!['position','normal'].includes(key))g.deleteAttribute(key);
   const material=obj.material as MeshStandardMaterial,colors=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3)material.color.toArray(colors,i);g.setAttribute('color',new Float32BufferAttribute(colors,3));
   const kind=material.emissiveIntensity>0&&material.emissive.getHex()!==0?'light':material.metalness>.2?'metal':'matte';groups.set(kind,[...(groups.get(kind)??[]),g]);});
  pack.set(id,[...groups].map(([kind,geometries])=>{const geometry=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());return {geometry,material:kitMaterials[kind]};}));}
  if(pack.size!==STAIR_PART_IDS.length)throw Error('Stair parts library is incomplete');return pack;}
 finally{gltf.scene.traverse(obj=>{if(obj instanceof Mesh){obj.geometry.dispose();(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>m.dispose());}});}
}
export function loadStairKit(){
 if(state.status==='loading'||state.status==='ready')return;publish({status:'loading',full:null,medium:null});
 void Promise.all([loadPack('/city/stairs/v1/kit.glb'),loadPack('/city/stairs/v1/kit-medium.glb')]).then(([full,medium])=>publish({status:'ready',full,medium})).catch(()=>publish({status:'error',full:null,medium:null}));
}
export function useStairKit(){const result=useSyncExternalStore(subscribe,snapshot,snapshot);useEffect(()=>{loadStairKit();},[]);return result;}

const materialCache=new Map<StairworkMaterial,MeshStandardMaterial>();
export function stairworkMaterial(m:StairworkMaterial){let out=materialCache.get(m);if(!out){const s=STAIRWORK_MATERIALS[m];out=new MeshStandardMaterial({color:s.color,roughness:s.roughness,metalness:s.metalness??0,transparent:s.opacity!==undefined,opacity:s.opacity??1,depthWrite:s.opacity===undefined,side:s.opacity!==undefined?2:0});materialCache.set(m,out);}return out;}
const unitBox=new BoxGeometry(1,1,1),unitCyl=new CylinderGeometry(1,1,1,10,1);
const Y=new Vector3(0,1,0);

type Batch={key:string;geometry:BufferGeometry;material:MeshStandardMaterial;matrices:Matrix4[]};
function batches(work:StudioStairwork[]){
 const out=new Map<string,Batch>(),push=(key:string,geometry:BufferGeometry,material:MeshStandardMaterial,m:Matrix4)=>{(out.get(key)??out.set(key,{key,geometry,material,matrices:[]}).get(key)!).matrices.push(m);};
 const e=new Euler(0,0,0,'YXZ'),q=new Quaternion(),s=new Vector3(),p=new Vector3(),d=new Vector3();
 for(const w of work){
  for(const b of w.boxes){e.set(b.rx??0,b.ry,0,'YXZ');q.setFromEuler(e);push(`box|${b.m}`,unitBox,stairworkMaterial(b.m),new Matrix4().compose(p.set(...b.p),q,s.set(...b.s)));}
  for(const c of w.cyls){d.set(c.b[0]-c.a[0],c.b[1]-c.a[1],c.b[2]-c.a[2]);const length=d.length();if(length<1e-4)continue;q.setFromUnitVectors(Y,d.normalize());push(`cyl|${c.m}`,unitCyl,stairworkMaterial(c.m),new Matrix4().compose(p.set((c.a[0]+c.b[0])/2,(c.a[1]+c.b[1])/2,(c.a[2]+c.b[2])/2),q,s.set(c.r,length,c.r)));}
 }
 return [...out.values()];
}
function soups(work:StudioStairwork[]){
 const by=new Map<StairworkMaterial,number[]>();for(const w of work)for(const m of w.meshes){const list=by.get(m.m)??by.set(m.m,[]).get(m.m)!;for(let i=0;i<m.v.length;i++)list.push(m.v[i]);}
 return [...by].filter(([,v])=>v.length).map(([m,v])=>{const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.computeVertexNormals();return {m,geometry:g};});
}
function Instances({batch}:{batch:Batch}){
 const ref=useRef<InstancedMesh>(null),invalidate=useThree(s=>s.invalidate);
 useLayoutEffect(()=>{const mesh=ref.current;if(!mesh)return;batch.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();invalidate();},[batch,invalidate]);
 return <instancedMesh dispose={null} ref={ref} name={`stairwork-${batch.key}`} args={[batch.geometry,batch.material,batch.matrices.length]} castShadow={false} receiveShadow/>;
}
/** One floor's stairwork (or the entrances): procedural pieces plus the stair parts at the current level of detail. */
function StairworkFloor({work,lod}:{work:StudioStairwork[];lod:'full'|'medium'}){
 const kit=useStairKit(),procedural=useMemo(()=>batches(work),[work]),merged=useMemo(()=>soups(work),[work]);
 useEffect(()=>()=>merged.forEach(s=>s.geometry.dispose()),[merged]);
 const parts=useMemo(()=>{const pack=lod==='full'?kit.full:kit.medium;if(!pack)return [];const out=new Map<string,Batch>(),q=new Quaternion(),e=new Euler(),s=new Vector3(),p=new Vector3();
  for(const w of work)for(const part of w.parts){const pieces=pack.get(part.part);if(!pieces)continue;e.set(0,part.ry,0);q.setFromEuler(e);const m=new Matrix4().compose(p.set(...part.p),q,s.set(...(part.s??[1,1,1])));pieces.forEach((piece,i)=>{const key=`${part.part}|${i}|${lod}`;(out.get(key)??out.set(key,{key,geometry:piece.geometry,material:piece.material,matrices:[]}).get(key)!).matrices.push(m);});}
  return [...out.values()];},[work,kit,lod]);
 return <group>{procedural.map(b=><Instances key={b.key+b.matrices.length} batch={b}/>)}{merged.map(s=><mesh key={s.m} geometry={s.geometry} material={stairworkMaterial(s.m)} receiveShadow/>)}{parts.map(b=><Instances key={b.key+b.matrices.length} batch={b}/>)}</group>;
}
/**
 * All stairwork of one building. `view` follows the floor views (cutaway, single floor); entrances always show.
 * `interior` false hides interior stairs and guards (buildings whose interiors are not drawn).
 */
export function CityStudioStairwork({work,view,interior=true}:{work:StudioStairwork[]|undefined;view:StudioFloorView;interior?:boolean}){
 const group=useRef<Group>(null),camera=useThree(s=>s.camera),[lod,setLod]=useState<'full'|'medium'>('full'),check=useRef(0),world=useMemo(()=>new Vector3(),[]);
 useFrame(state=>{if(state.clock.elapsedTime-check.current<.5||!group.current)return;check.current=state.clock.elapsedTime;group.current.getWorldPosition(world);const next=camera.position.distanceTo(world)>28?'medium':'full';setLod(previous=>previous===next?previous:next);});
 const floors=useMemo(()=>{const out=new Map<string,{floor:number;entrance:boolean;work:StudioStairwork[]}>();for(const w of work??[]){if(w.kind!=='entrance'&&!interior)continue;const key=w.kind==='entrance'?'entrance':`floor-${w.floor}`;(out.get(key)??out.set(key,{floor:w.floor,entrance:w.kind==='entrance',work:[]}).get(key)!).work.push(w);}return [...out.values()];},[work,interior]);
 return <group ref={group} name="city-studio-stairwork">{floors.map(f=>{const shown=f.entrance||view.mode==='whole'||view.mode==='cutaway'&&f.floor<=view.floor||view.mode==='floor'&&f.floor===view.floor;return <group key={f.entrance?'entrance':f.floor} visible={shown}><StairworkFloor work={f.work} lod={lod}/></group>;})}</group>;
}
