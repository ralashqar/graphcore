/**
 * Parametric trim parts on free-opening faces (shutters, window boxes, keystones, hoods, lintels,
 * brackets, canopies, lanterns). The Blender kit (/city/trims/v1/trims.glb) loads lazily once; each
 * placement from fitFreeTrims is nine-slice deformed on the CPU per unique (part, size, mirror) and
 * cached for this building, then drawn with one InstancedMesh per deformed geometry and material
 * class. Trim-class instances are tinted per instance (vertex colour x instanceColor), which works on
 * WebGPU and on the WebGL2 node backend without custom vertex shaders.
 */
import {useEffect,useLayoutEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {useThree} from '@react-three/fiber';
import {BufferGeometry,Color,Float32BufferAttribute,InstancedMesh,Matrix4,Mesh,MeshStandardMaterial,Object3D,type Material} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
import {STUDIO_FAMILIES} from '../../domain/cityStudioCatalog';
import {DEFAULT_FREE_PALETTE} from '../../domain/cityStudioFreeOpeningGeometry';
import {TRIM_PARTS,deformTrimPositions,fitFreeTrims,groupTrimKinds,trimFactors,trimPart,type StudioFreeTrim,type TrimPartId,type TrimPlacement} from '../../domain/cityStudioTrimParts';
import type {StudioFreeFace} from '../../domain/cityStudioFreeFaces';

type TrimClass='trim'|'planting'|'metal'|'light';
type Piece={cls:TrimClass;geometry:BufferGeometry};
type Pack=Map<TrimPartId,Piece[]>;
let state:{status:'idle'|'loading'|'ready'|'error';pack:Pack|null}={status:'idle',pack:null};
const listeners=new Set<()=>void>(),subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},snapshot=()=>state;
const publish=(next:typeof state)=>{state=next;listeners.forEach(fn=>fn());};
const classOf=(name:string):TrimClass=>{const c=name.split('/')[0];return c==='planting'||c==='metal'||c==='light'?c:'trim';};

export function loadTrimKit(){
 if(state.status==='loading'||state.status==='ready')return;
 publish({status:'loading',pack:null});
 void new GLTFLoader().loadAsync('/city/trims/v1/trims.glb').then(gltf=>{
  const pack:Pack=new Map();gltf.scene.updateMatrixWorld(true);
  try{
   for(const root of gltf.scene.children){const id=String(root.userData.trim_id??root.name) as TrimPartId;if(!Object.hasOwn(TRIM_PARTS,id))continue;
    const inverse=new Matrix4().copy(root.matrixWorld).invert(),groups=new Map<TrimClass,BufferGeometry[]>();
    root.traverse(obj=>{
     if(!(obj instanceof Mesh)||Array.isArray(obj.material))return;
     const source=obj.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(inverse,obj.matrixWorld)),g=source.index?source.toNonIndexed():source;if(source!==g)source.dispose();
     for(const key of Object.keys(g.attributes))if(!['position','normal'].includes(key))g.deleteAttribute(key);
     const material=obj.material as MeshStandardMaterial,colors=new Float32Array(g.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3)material.color.toArray(colors,i);g.setAttribute('color',new Float32BufferAttribute(colors,3));
     const cls=classOf(material.name);groups.set(cls,[...(groups.get(cls)??[]),g]);
    });
    pack.set(id,[...groups].map(([cls,list])=>{const geometry=mergeGeometries(list);list.forEach(g=>g.dispose());if(!geometry)throw Error('Invalid trim geometry');return {cls,geometry};}));
   }
   if(pack.size!==Object.keys(TRIM_PARTS).length)throw Error('Trim library is incomplete');publish({status:'ready',pack});
  }catch(error){pack.forEach(parts=>parts.forEach(p=>p.geometry.dispose()));throw error;}
  finally{gltf.scene.traverse(obj=>{if(obj instanceof Mesh){obj.geometry.dispose();(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>m.dispose());}});}
 }).catch(()=>publish({status:'error',pack:null}));
}
export function useTrimKit(){const result=useSyncExternalStore(subscribe,snapshot,snapshot);useEffect(()=>{loadTrimKit();const retry=()=>{if(state.status==='error')loadTrimKit();};window.addEventListener('online',retry);return()=>window.removeEventListener('online',retry);},[]);return result;}

let shared:Record<TrimClass,Material>|null=null;
function trimMaterials(){
 if(shared)return shared;
 const trim=citySurfaceMaterial(),planting=citySurfaceMaterial(),metal=citySurfaceMaterial(),light=citySurfaceMaterial();
 for(const m of [trim,planting,metal,light])m.vertexColors=true;
 trim.roughness=.72;planting.roughness=.9;metal.roughness=.42;metal.metalness=.5;light.emissive.set('#ffb65c');light.emissiveIntensity=1.1;
 return shared={trim,planting,metal,light};
}
/** Deform one piece; flat normals are recomputed when the shape changed. Non-indexed triangles. */
function deformPiece(piece:Piece,part:TrimPartId,stretch:TrimPlacement['stretch'],mirror:boolean){
 const spec=trimPart(part),f=trimFactors(spec,stretch),g=piece.geometry.clone();if(f.x===1&&f.y===1&&!mirror)return g;
 const pos=g.getAttribute('position');g.setAttribute('position',new Float32BufferAttribute(deformTrimPositions(pos.array,spec,stretch,mirror),3));
 if(mirror)for(const name of ['position','color']){const a=g.getAttribute(name).array as Float32Array;for(let t=0;t<a.length;t+=9)for(let k=0;k<3;k++){const v=a[t+3+k];a[t+3+k]=a[t+6+k];a[t+6+k]=v;}}
 g.computeVertexNormals();return g;
}
const q=(n:number|undefined)=>n===undefined?'-':(Math.round(n*200)/200).toFixed(3);

function TrimBatch({geometry,material,matrices,colors}:{geometry:BufferGeometry;material:Material;matrices:Matrix4[];colors:Color[]|null}){
 const ref=useRef<InstancedMesh>(null),invalidate=useThree(s=>s.invalidate);
 useLayoutEffect(()=>{const mesh=ref.current;if(!mesh)return;matrices.forEach((m,i)=>{mesh.setMatrixAt(i,m);if(colors)mesh.setColorAt(i,colors[i]);});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();invalidate();},[matrices,colors,invalidate]);
 return <instancedMesh dispose={null} ref={ref} args={[geometry,material,matrices.length]} raycast={()=>null}/>;
}

/** Trims for all free-opening faces of one building (building-local, inside the sculpt group). */
export function CityStudioTrimParts({faces,trims,groundHeight=3.2,visible=true}:{faces?:StudioFreeFace[];trims?:StudioFreeTrim[];groundHeight?:number;visible?:boolean}){
 const kit=useTrimKit();
 const fitted=useMemo(()=>{
  if(!faces?.length||!trims?.length)return [];
  return faces.map(face=>{
   const family=STUDIO_FAMILIES[face.family],painted=face.finishes.trim?.color??family.trim,accent=new Color(face.finishes.door?.color??family.door);
   const tints=new Map(face.groups.map(g=>[g.id,new Color(g.style==='painted'?painted:DEFAULT_FREE_PALETTE[g.style].trim)]));
   const result=fitFreeTrims({length:face.length,height:face.height,groups:face.groups,groundTop:Math.max(0,groundHeight-face.base)},g=>groupTrimKinds(trims,g));
   const frame=new Object3D();frame.position.set(face.origin[0],face.base,face.origin[1]);frame.rotation.set(0,face.rotation,0);frame.updateMatrix();
   return {face,frame:frame.matrix.clone(),accent,tints,...result};
  });
 },[faces,trims,groundHeight]);
 const batches=useMemo(()=>{
  if(!kit.pack)return [];
  const materials=trimMaterials(),geometries=new Map<string,BufferGeometry>(),buckets=new Map<string,{geometry:BufferGeometry;material:Material;matrices:Matrix4[];colors:Color[]|null}>(),obj=new Object3D(),white=new Color(1,1,1);
  for(const f of fitted)for(const p of f.placements){
   obj.position.set(p.x,p.y,p.z);obj.rotation.set(0,p.turn,0);obj.scale.setScalar(p.scale);obj.updateMatrix();const matrix=new Matrix4().multiplyMatrices(f.frame,obj.matrix);
   const tint=p.tint==='accent'?f.accent:p.tint==='trim'?f.tints.get(p.groupId)??white:white;
   (kit.pack.get(p.part)??[]).forEach((piece,i)=>{
    const key=`${p.part}/${i}/${q(p.stretch.x)}/${q(p.stretch.y)}/${p.mirror?1:0}`;let geometry=geometries.get(key);if(!geometry){geometry=deformPiece(piece,p.part,p.stretch,p.mirror);geometries.set(key,geometry);}
    let bucket=buckets.get(key);if(!bucket){bucket={geometry,material:materials[piece.cls],matrices:[],colors:piece.cls==='trim'?[]:null};buckets.set(key,bucket);}
    bucket.matrices.push(matrix);bucket.colors?.push(tint);
   });
  }
  return [...buckets.entries()];
 },[kit.pack,fitted]);
 useEffect(()=>()=>{new Set(batches.map(([,b])=>b.geometry)).forEach(g=>g.dispose());},[batches]);
 useEffect(()=>{
  if(typeof window==='undefined'||!new URLSearchParams(window.location.search).has('cityStudioTest'))return;
  (window as unknown as {__cityStudioTrims?:unknown}).__cityStudioTrims={status:kit.status,faces:fitted.map(f=>({id:f.face.id,length:f.face.length,height:f.face.height,base:f.face.base})),placements:fitted.reduce((n,f)=>n+f.placements.length,0),skipped:fitted.flatMap(f=>f.skipped),batches:batches.length,instances:batches.reduce((n,[,b])=>n+b.matrices.length,0),triangles:batches.reduce((n,[,b])=>n+b.matrices.length*b.geometry.getAttribute('position').count/3,0)};
 },[kit.status,fitted,batches]);
 if(!fitted.length)return null;
 return <group name={`studio-trims-${kit.status}`} visible={visible}>{batches.map(([key,b])=><TrimBatch key={`${key}/${b.matrices.length}`} geometry={b.geometry} material={b.material} matrices={b.matrices} colors={b.colors}/>)}</group>;
}
