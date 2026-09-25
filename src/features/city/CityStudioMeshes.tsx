import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {BoxGeometry,BufferGeometry,Color,Group,Vector3,InstancedMesh,Mesh,Object3D,type Material} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {useFrame,useThree} from '@react-three/fiber';
import {STUDIO_FAMILIES,STUDIO_MODULE_MAP} from '../../domain/cityStudioCatalog';
import type {StudioPiece,StudioChannel} from '../../domain/cityStudioTypes';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
import type {CityTextureId} from '../../domain/cityTexturePresets';

type Piece={geometry:BufferGeometry;channel:string};
const pending=new Map<2|3,Promise<Map<string,Piece[]>>>();
export function loadStudioKit(version:2|3=2){const previous=pending.get(version);if(previous)return previous;const loading=new GLTFLoader().loadAsync(`/city/synarc-kit/v${version}/kit.glb`).then(gltf=>{
 const pack=new Map<string,Piece[]>();gltf.scene.updateMatrixWorld(true);
 for(const root of gltf.scene.children){const groups=new Map<string,BufferGeometry[]>();root.traverse(child=>{
  if(!(child instanceof Mesh)||Array.isArray(child.material))return;
  const channel=(child.material.name as string).replace(/\.\d+$/,'').split('/').at(-1)!.replace(/^studio_/,''),g=child.geometry.clone().applyMatrix4(child.matrixWorld);
  const geometry=g.index?g.toNonIndexed():g;if(g!==geometry)g.dispose();
  for(const attr of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(attr))geometry.deleteAttribute(attr);
  const list=groups.get(channel)??[];list.push(geometry);groups.set(channel,list);
 });
 pack.set(String(root.userData.name??root.name).replace(/^v3\//,''),[...groups].flatMap(([channel,geometries])=>{const geometry=geometries.length===1?geometries[0]:mergeGeometries(geometries);if(!geometry)return geometries.map(geometry=>({geometry,channel}));if(geometries.length>1)geometries.forEach(g=>g.dispose());return [{geometry,channel}];}));}
 gltf.scene.traverse(child=>{if(child instanceof Mesh){child.geometry.dispose();(Array.isArray(child.material)?child.material:[child.material]).forEach((m:Material)=>m.dispose());}});
 if(pack.size!==(version===3?72:64)||!pack.has('wall-full')||version===3&&!pack.has('stair-top-threshold'))throw Error('The architectural kit is incomplete.');return pack;
}).catch(e=>{pending.delete(version);throw e;});pending.set(version,loading);return loading;}

function Instances({geometry,channel,placements,texture}:{geometry:BufferGeometry;channel:string;placements:StudioPiece[];texture?:string}){
 const ref=useRef<InstancedMesh>(null),invalidate=useThree(s=>s.invalidate),dummy=useMemo(()=>new Object3D(),[]);
 const material=useMemo(()=>citySurfaceMaterial(channel==='glass',texture as CityTextureId),[channel,texture]);
 useEffect(()=>()=>material.dispose(),[material]);
 useLayoutEffect(()=>{if(!ref.current)return;for(const [i,p] of placements.entries()){
  dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(...p.scale);dummy.updateMatrix();ref.current.setMatrixAt(i,dummy.matrix);
  const palette=STUDIO_FAMILIES[p.family],color=p.finishes?.[channel as StudioChannel]?.color??palette[channel as keyof typeof palette]??palette.trim;
  ref.current.setColorAt(i,new Color(color));
 }ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();invalidate();},[placements,dummy,invalidate,channel]);
 return <instancedMesh ref={ref} args={[geometry,material,placements.length]} frustumCulled/>;
}

export function CityStudioMeshes({pieces,version=2}:{pieces:StudioPiece[];version?:2|3}){
 const root=useRef<Group>(null),point=useMemo(()=>new Vector3(),[]),sample=useRef(0);const [near,setNear]=useState(true);
 useFrame(({camera,clock})=>{if(clock.elapsedTime-sample.current<.5||!root.current)return;sample.current=clock.elapsedTime;root.current.getWorldPosition(point);const next=camera.position.distanceToSquared(point)<14400;setNear(old=>old===next?old:next);});
 const [pack,setPack]=useState<Map<string,Piece[]>|null>(null),[retry,setRetry]=useState(0),{gl,invalidate}=useThree();
 useEffect(()=>{let live=true;setPack(null);loadStudioKit(version).then(pack=>{if(live){setPack(pack);gl.domElement.dataset.cityStudioKit='ready';invalidate();}}).catch(()=>{if(live)gl.domElement.dataset.cityStudioKit='fallback';});return()=>{live=false;};},[retry,gl,invalidate,version]);
 useEffect(()=>{const retry=()=>setRetry(n=>n+1);window.addEventListener('online',retry);return()=>window.removeEventListener('online',retry);},[]);
 const groups=useMemo(()=>{const out=new Map<string,{piece:Piece;placements:StudioPiece[];texture?:string}>();
  if(!pack)return out;
  for(const p of pieces.filter(p=>near||STUDIO_MODULE_MAP.get(p.module)?.minDetail!=='near'))for(const [i,piece] of (pack.get(p.module)??[]).entries()){
   const texture=p.finishes?.[piece.channel as StudioChannel]?.texture,key=`${p.module}/${i}/${texture??''}`,group=out.get(key)??{piece,placements:[],texture};group.placements.push(p);out.set(key,group);
  }return out;
 },[pieces,pack,near]);
 const fallbackCube=useMemo(()=>new BoxGeometry(1,1,1),[]);
 useEffect(()=>()=>fallbackCube.dispose(),[fallbackCube]);
 const fallback=useMemo(()=>{
  if(pack)return [];
  return pieces.flatMap(p=>{const part=STUDIO_MODULE_MAP.get(p.module);if(!part)return [];const [w,h,d]=part.size,o=part.opening;
   const boxes=o?[[-w/2+(w-o.width)/4,h/2,(w-o.width)/2,h],[w/2-(w-o.width)/4,h/2,(w-o.width)/2,h],[0,o.bottom/2,o.width,o.bottom],[0,(h+o.top)/2,o.width,h-o.top]]:[[0,h/2,w,h]];
   return boxes.filter(b=>b[2]>.001&&b[3]>.001).map(([x,y,width,height],i):StudioPiece=>({...p,id:p.id+'/fallback'+i,x:p.x+Math.cos(p.rotation)*x*p.scale[0],y:p.y+y*p.scale[1],z:p.z-Math.sin(p.rotation)*x*p.scale[0],scale:[width*p.scale[0],height*p.scale[1],d*p.scale[2]]}));
  });
 },[pack,pieces]);

 return <group ref={root} name={`studio-kit-v${version}`}>{pack?[...groups].map(([key,g])=><Instances key={key} geometry={g.piece.geometry} channel={g.piece.channel} placements={g.placements} texture={g.texture}/>):<Instances geometry={fallbackCube} channel="wall" placements={fallback}/>}</group>;
}
