import {CITY_LIGHT_MODE} from './cityRenderMode';
import {useCityVisibility} from './CityVisibility';
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {BoxGeometry,BufferGeometry,Color,Group,Vector3,InstancedMesh,Mesh,Object3D,type Material} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {useFrame,useThree} from '@react-three/fiber';
import {STUDIO_FAMILIES,STUDIO_MODULE_MAP,studioModules} from '../../domain/cityStudioCatalog';
import type {StudioPiece,StudioChannel} from '../../domain/cityStudioTypes';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
import type {CityTextureId} from '../../domain/cityTexturePresets';

type Piece={geometry:BufferGeometry;channel:string};
const pending=new Map<2|3|4|5,Promise<Map<string,Piece[]>>>();
export function loadStudioKit(version:2|3|4|5=2){const previous=pending.get(version);if(previous)return previous;const loading=new GLTFLoader().loadAsync(`/city/synarc-kit/v${version}/kit.glb`).then(gltf=>{
 const pack=new Map<string,Piece[]>();gltf.scene.updateMatrixWorld(true);
 for(const root of gltf.scene.children){const groups=new Map<string,BufferGeometry[]>();root.traverse(child=>{
  if(!(child instanceof Mesh)||Array.isArray(child.material))return;
  const channel=(child.material.name as string).replace(/\.\d+$/,'').split('/').at(-1)!.replace(/^studio_/,''),g=child.geometry.clone().applyMatrix4(child.matrixWorld);
  const geometry=g.index?g.toNonIndexed():g;if(g!==geometry)g.dispose();
  for(const attr of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(attr))geometry.deleteAttribute(attr);
  const list=groups.get(channel)??[];list.push(geometry);groups.set(channel,list);
 });
 pack.set(String(root.userData.name??root.name).replace(/^v[345]\//,''),[...groups].flatMap(([channel,geometries])=>{const geometry=geometries.length===1?geometries[0]:mergeGeometries(geometries);if(!geometry)return geometries.map(geometry=>({geometry,channel}));if(geometries.length>1)geometries.forEach(g=>g.dispose());return [{geometry,channel}];}));}
 gltf.scene.traverse(child=>{if(child instanceof Mesh){child.geometry.dispose();(Array.isArray(child.material)?child.material:[child.material]).forEach((m:Material)=>m.dispose());}});
 if(pack.size!==studioModules(version).length||!pack.has('wall-full')||version>=3&&!pack.has('stair-top-threshold'))throw Error('The architectural kit is incomplete.');return pack;
}).catch(e=>{pending.delete(version);throw e;});pending.set(version,loading);return loading;}

export function StudioInstances({geometry,channel,placements,texture,onSelect,representation}:{geometry:BufferGeometry;channel:string;placements:StudioPiece[];texture?:string;onSelect?:(p:StudioPiece)=>void;representation?:'full'|'simple'}){
 const visibility=useCityVisibility(),revision=useRef(-1),visibleIndices=useRef<number[]>([]),ref=useRef<InstancedMesh>(null),invalidate=useThree(s=>s.invalidate);
 const material=useMemo(()=>citySurfaceMaterial(channel==='glass',texture as CityTextureId),[channel,texture]);useEffect(()=>()=>material.dispose(),[material]);
 const data=useMemo(()=>{const matrices=new Float32Array(placements.length*16),colors=new Float32Array(placements.length*3),dummy=new Object3D(),color=new Color();for(const [i,p] of placements.entries()){dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(...p.scale);dummy.updateMatrix();dummy.matrix.toArray(matrices,i*16);const palette=STUDIO_FAMILIES[p.family];color.set(p.finishes?.[channel as StudioChannel]?.color??palette[channel as keyof typeof palette]??palette.trim).toArray(colors,i*3);}return {matrices,colors};},[placements,channel]);
 useLayoutEffect(()=>{if(!ref.current)return;ref.current.count=placements.length;ref.current.instanceMatrix.array.set(data.matrices);if(placements.length&&!ref.current.instanceColor)ref.current.setColorAt(0,new Color());ref.current.instanceColor?.array.set(data.colors);ref.current.computeBoundingSphere();revision.current=-1;invalidate();},[data,placements,invalidate]);
 useFrame(()=>{if(!ref.current||revision.current===(visibility?.revision??0))return;revision.current=visibility?.revision??0;let count=0;const indices:number[]=[];placements.forEach((p,i)=>{const level=p.propertyId?(visibility?.levels.get(p.propertyId)??'full'):'full',show=level!=='hidden'&&(level!=='simple'||STUDIO_MODULE_MAP.get(p.module)?.minDetail!=='near')&&(!representation||level===representation);if(!show)return;ref.current!.instanceMatrix.array.set(data.matrices.subarray(i*16,i*16+16),count*16);ref.current!.instanceColor?.array.set(data.colors.subarray(i*3,i*3+3),count*3);indices.push(i);count++;});visibleIndices.current=indices;ref.current.count=count;ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;});
 return <instancedMesh ref={ref} args={[geometry,material,placements.length]} frustumCulled onClick={onSelect?e=>{if(e.instanceId!==undefined){e.stopPropagation();onSelect(placements[visibleIndices.current[e.instanceId]]);}}:undefined}/>;
}

export function CityStudioMeshes({pieces,version=2}:{pieces:StudioPiece[];version?:2|3|4|5}){
 const visibility=useCityVisibility(),proxyOnly=!!visibility&&CITY_LIGHT_MODE;
 const root=useRef<Group>(null),point=useMemo(()=>new Vector3(),[]),sample=useRef(0);const [near,setNear]=useState(true);
 useFrame(({camera,clock})=>{if(clock.elapsedTime-sample.current<.5||!root.current)return;sample.current=clock.elapsedTime;root.current.getWorldPosition(point);const next=camera.position.distanceToSquared(point)<14400;setNear(old=>old===next?old:next);});
 const [pack,setPack]=useState<Map<string,Piece[]>|null>(null),[retry,setRetry]=useState(0),{gl,invalidate}=useThree();
 useEffect(()=>{let live=true;setPack(null);if(proxyOnly){gl.domElement.dataset.cityStudioKit='proxy';invalidate();return;}loadStudioKit(version).then(pack=>{if(live){setPack(pack);gl.domElement.dataset.cityStudioKit='ready';invalidate();}}).catch(()=>{if(live)gl.domElement.dataset.cityStudioKit='fallback';});return()=>{live=false;};},[retry,gl,invalidate,version,proxyOnly]);
 useEffect(()=>{const retry=()=>setRetry(n=>n+1);window.addEventListener('online',retry);return()=>window.removeEventListener('online',retry);},[]);
 const groups=useMemo(()=>{const out=new Map<string,{piece:Piece;placements:StudioPiece[];texture?:string}>();
  if(!pack)return out;
  for(const p of pieces.filter(p=>p.propertyId||near||STUDIO_MODULE_MAP.get(p.module)?.minDetail!=='near'))for(const [i,piece] of (pack.get(p.module)??[]).entries()){
   // Kit pieces in generated walls leave out their wall slab (and, for portal doors, their leaf).
   if(p.omit?.includes(piece.channel))continue;
   const texture=p.finishes?.[piece.channel as StudioChannel]?.texture,key=`${p.module}/${i}/${texture??''}`,group=out.get(key)??{piece,placements:[],texture};group.placements.push(p);out.set(key,group);
  }return out;
 },[pieces,pack,near]);
 const fallbackCube=useMemo(()=>new BoxGeometry(1,1,1),[]);
 useEffect(()=>()=>fallbackCube.dispose(),[fallbackCube]);
 const fallback=useMemo(()=>{
  if(pack||proxyOnly)return [];
  return pieces.flatMap(p=>{const part=STUDIO_MODULE_MAP.get(p.module);if(!part)return [];const [w,h,d]=part.size,o=part.collision==='solid'?null:part.opening;
   if(p.omit?.includes('wall'))return [];
   const boxes=o?[[-w/2+(w-o.width)/4,h/2,(w-o.width)/2,h],[w/2-(w-o.width)/4,h/2,(w-o.width)/2,h],[0,o.bottom/2,o.width,o.bottom],[0,(h+o.top)/2,o.width,h-o.top]]:[[0,h/2,w,h]];
   return boxes.filter(b=>b[2]>.001&&b[3]>.001).map(([x,y,width,height],i):StudioPiece=>({...p,id:p.id+'/fallback'+i,x:p.x+Math.cos(p.rotation)*x*p.scale[0],y:p.y+y*p.scale[1],z:p.z-Math.sin(p.rotation)*x*p.scale[0],scale:[width*p.scale[0],height*p.scale[1],d*p.scale[2]]}));
  });
 },[pieces,pack,proxyOnly]);

 const proxies=useMemo(()=>{const groups=new Map<string,{geometry:BufferGeometry;channel:string;placements:StudioPiece[];texture?:string}>();
  const add=(key:string,channel:string,p:StudioPiece,boxes:number[][],texture?:string)=>{let group=groups.get(key);if(!group){const parts=boxes.filter(b=>b[3]>.001&&b[4]>.001).map(([x,y,z,w,h,d])=>new BoxGeometry(w,h,d).translate(x,y,z));if(!parts.length)return;const geometry=parts.length===1?parts[0]:mergeGeometries(parts)!;if(parts.length>1)parts.forEach(g=>g.dispose());group={geometry,channel,placements:[],texture};groups.set(key,group);}group.placements.push(p);};
  for(const p of pieces){if(!p.propertyId)continue;const part=STUDIO_MODULE_MAP.get(p.module);if(!part||part.minDetail==='near')continue;const [w,h,d]=part.size,o=part.collision==='solid'&&!p.omit?.includes('wall')?null:part.opening,channel=['window','wall','door'].includes(part.category)?'wall':'trim',texture=p.finishes?.[channel]?.texture;
   const boxes=o?[[-w/2+(w-o.width)/4,h/2,0,(w-o.width)/2,h,d],[w/2-(w-o.width)/4,h/2,0,(w-o.width)/2,h,d],[0,o.bottom/2,0,o.width,o.bottom,d],[0,(h+o.top)/2,0,o.width,h-o.top,d]]:[[0,h/2,0,w,h,d]];
   if(!p.omit?.includes('wall'))add(JSON.stringify([boxes,channel,texture]),channel,p,boxes,texture);
   if(o&&!p.omit?.includes('glass'))add(JSON.stringify(['glass',o.width,o.bottom,o.top]),'glass',p,[[0,(o.bottom+o.top)/2,-.1,o.width,o.top-o.bottom,.04]]);
  }return [...groups.values()];
 },[pieces]);
 useEffect(()=>()=>proxies.forEach(g=>g.geometry.dispose()),[proxies]);

 return <group ref={root} name={`studio-kit-v${version}`}>{!proxyOnly&&(pack?[...groups].map(([key,g])=><StudioInstances key={key} geometry={g.piece.geometry} channel={g.piece.channel} placements={g.placements} texture={g.texture} representation={pieces.some(p=>p.propertyId)?'full':undefined}/>):<StudioInstances geometry={fallbackCube} channel="wall" placements={fallback}/>)}{(pack||proxyOnly)&&proxies.map((g,i)=><StudioInstances key={'proxy/'+i} geometry={g.geometry} channel={g.channel} placements={g.placements} texture={g.texture} representation="simple"/>)}</group>;
}
