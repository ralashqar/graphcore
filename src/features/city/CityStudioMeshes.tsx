import {CITY_LIGHT_MODE} from './cityRenderMode';
import {useCityVisibility} from './CityVisibility';
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {BoxGeometry,BufferGeometry,Color,Group,Vector3,InstancedMesh,Mesh,Object3D,type Material} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {useFrame,useThree} from '@react-three/fiber';
import {STOREFRONT_MODULE_IDS,STUDIO_FAMILIES,STUDIO_MODULE_MAP,studioModules} from '../../domain/cityStudioCatalog';
import {seeThroughGlass} from './CityStudioOpeningInstances';
import type {StudioPiece,StudioChannel} from '../../domain/cityStudioTypes';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
import type {CityTextureId} from '../../domain/cityTexturePresets';
import {viewDistance} from './CityStudioDetailBatches';

type Piece={geometry:BufferGeometry;channel:string};
/** Kit detail levels: `full` is the authored kit; `medium` is the prepared far kit (kit-medium.glb, built by
 * scripts/build-city-kit-medium.py: bevels, small parts and hidden faces removed; docs/city-generated-walls-at-scale.md). */
export type StudioKitDetail='full'|'medium';
/** Medium kit switch (equivalent distance, as the other kit levels): the medium kit from `enter` m, back to the full
 * kit inside `leave` m. `?cityGwKitMedium=<m>` moves it, `?cityGwKitMedium=0` turns the level off (measurements). */
const mediumParam=typeof window!=='undefined'?new URLSearchParams(window.location.search).get('cityGwKitMedium'):null;
export const KIT_MEDIUM=mediumParam==='0'?null:{enter:Number(mediumParam)||135,leave:(Number(mediumParam)||135)*.9} as const;
const pending=new Map<string,Promise<Map<string,Piece[]>>>();
/** The Tokyo pack (docs/city-tokyo-kit.md) is served beside kit v5; its roots are plain module ids. */
const TOKYO_KIT={full:'/city/tokyo-kit/v1/kit.glb',medium:'/city/tokyo-kit/v1/kit-medium.glb'} as const;
/** The storefront pack (docs/city-storefront-kit.md, ~2 MB) loads only for buildings that use its pieces. */
const STOREFRONT_KIT={full:'/city/storefront-kit/v1/kit.glb',medium:'/city/storefront-kit/v1/kit-medium.glb'} as const;
/** Whether these pieces need the storefront pack (loadStudioKit's `storefront`). */
export const usesStorefrontKit=(pieces:readonly {module:string}[])=>pieces.some(p=>STOREFRONT_MODULE_IDS.has(p.module));
function parseStudioKit(url:string){return new GLTFLoader().loadAsync(url).then(gltf=>{
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
 return pack;
});}
export function loadStudioKit(version:2|3|4|5=2,detail:StudioKitDetail='full',storefront=false):Promise<Map<string,Piece[]>>{
 // Kit v5 with `storefront`: the plain v5 pack plus the storefront pack (a copy; geometries are shared).
 if(storefront&&version===5){const id=`5/${detail}/storefront`,previous=pending.get(id);if(previous)return previous;
  const loading=Promise.all([loadStudioKit(5,detail),parseStudioKit(STOREFRONT_KIT[detail])]).then(([base,extra])=>{const pack=new Map(base);for(const [module,pieces] of extra)pack.set(module,pieces);
   if(pack.size!==studioModules(5).length)throw Error('The storefront kit is incomplete.');return pack;}).catch(e=>{pending.delete(id);throw e;});pending.set(id,loading);return loading;}
 const id=`${version}/${detail}`,previous=pending.get(id);if(previous)return previous;
 // Kit v5 also loads the Tokyo pack: the studio's v5 catalogue (studioModules(5)) includes its modules.
 const loading=Promise.all([parseStudioKit(`/city/synarc-kit/v${version}/${detail==='medium'?'kit-medium':'kit'}.glb`),version===5?parseStudioKit(TOKYO_KIT[detail]):null]).then(([pack,tokyo])=>{
 if(tokyo)for(const [module,pieces] of tokyo)pack.set(module,pieces);
 if(pack.size!==studioModules(version).length-(version===5?STOREFRONT_MODULE_IDS.size:0)||!pack.has('wall-full')||version>=3&&!pack.has('stair-top-threshold'))throw Error('The architectural kit is incomplete.');return pack;
}).catch(e=>{pending.delete(id);throw e;});pending.set(id,loading);return loading;}

export function StudioInstances({geometry,channel,placements,texture,onSelect,representation,seeThrough=false}:{geometry:BufferGeometry;channel:string;placements:StudioPiece[];texture?:string;onSelect?:(p:StudioPiece)=>void;representation?:'full'|'simple';/** Transparent glazing (storefront displays behind the glass). */seeThrough?:boolean}){
 const visibility=useCityVisibility(),revision=useRef(-1),visibleIndices=useRef<number[]>([]),ref=useRef<InstancedMesh>(null),invalidate=useThree(s=>s.invalidate);
 const material=useMemo(()=>{const m=citySurfaceMaterial(channel==='glass',texture as CityTextureId);if(seeThrough&&channel==='glass')seeThroughGlass(m);return m;},[channel,texture,seeThrough]);useEffect(()=>()=>material.dispose(),[material]);
 const data=useMemo(()=>{const matrices=new Float32Array(placements.length*16),colors=new Float32Array(placements.length*3),dummy=new Object3D(),color=new Color();for(const [i,p] of placements.entries()){dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(...p.scale);dummy.updateMatrix();dummy.matrix.toArray(matrices,i*16);const palette=STUDIO_FAMILIES[p.family];color.set(p.finishes?.[channel as StudioChannel]?.color??palette[channel as keyof typeof palette]??palette.trim).toArray(colors,i*3);}return {matrices,colors};},[placements,channel]);
 useLayoutEffect(()=>{if(!ref.current)return;ref.current.count=placements.length;ref.current.instanceMatrix.array.set(data.matrices);if(placements.length&&!ref.current.instanceColor)ref.current.setColorAt(0,new Color());ref.current.instanceColor?.array.set(data.colors);ref.current.computeBoundingSphere();revision.current=-1;invalidate();},[data,placements,invalidate]);
 useFrame(()=>{if(!ref.current||revision.current===(visibility?.revision??0))return;revision.current=visibility?.revision??0;let count=0;const indices:number[]=[];placements.forEach((p,i)=>{const level=p.propertyId?(visibility?.levels.get(p.propertyId)??'full'):'full',show=level!=='hidden'&&(level!=='simple'||STUDIO_MODULE_MAP.get(p.module)?.minDetail!=='near')&&(!representation||level===representation);if(!show)return;ref.current!.instanceMatrix.array.set(data.matrices.subarray(i*16,i*16+16),count*16);ref.current!.instanceColor?.array.set(data.colors.subarray(i*3,i*3+3),count*3);indices.push(i);count++;});visibleIndices.current=indices;ref.current.count=count;ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;});
 return <instancedMesh ref={ref} args={[geometry,material,placements.length]} frustumCulled onClick={onSelect?e=>{if(e.instanceId!==undefined){e.stopPropagation();onSelect(placements[visibleIndices.current[e.instanceId]]);}}:undefined}/>;
}

export function CityStudioMeshes({pieces,version=2}:{pieces:StudioPiece[];version?:2|3|4|5}){
 const visibility=useCityVisibility(),proxyOnly=!!visibility&&CITY_LIGHT_MODE;
 // Business pieces (propertyId) follow CityVisibility and its proxies; a studio building's own kit goes medium far away.
 const business=useMemo(()=>pieces.some(p=>p.propertyId),[pieces]);
 // The storefront pack loads only when these pieces use it (docs/city-storefront-kit.md).
 const storefront=useMemo(()=>version===5&&usesStorefrontKit(pieces),[pieces,version]);
 const root=useRef<Group>(null),point=useMemo(()=>new Vector3(),[]),sample=useRef(0);const [near,setNear]=useState(true),[medium,setMedium]=useState(false);
 useFrame(({camera,clock,size})=>{if(clock.elapsedTime-sample.current<.5||!root.current)return;sample.current=clock.elapsedTime;root.current.getWorldPosition(point);const next=camera.position.distanceToSquared(point)<14400;setNear(old=>old===next?old:next);
  const far=!!KIT_MEDIUM&&!business&&!next&&viewDistance(camera,size.height,point.x,point.z)>=(medium?KIT_MEDIUM.leave:KIT_MEDIUM.enter);if(far!==medium)setMedium(far);});
 const [mediumPack,setMediumPack]=useState<Map<string,Piece[]>|null>(null);
 useEffect(()=>setMediumPack(null),[version,storefront]);
 useEffect(()=>{if(!medium||mediumPack)return;let live=true;loadStudioKit(version,'medium',storefront).then(p=>{if(live){setMediumPack(p);invalidate();}}).catch(()=>{});return()=>{live=false;};},[medium,version,storefront,mediumPack]);// eslint-disable-line react-hooks/exhaustive-deps
 const [pack,setPack]=useState<Map<string,Piece[]>|null>(null),[retry,setRetry]=useState(0),{gl,invalidate}=useThree();
 // Adding the storefront pack keeps the current pack on screen until the larger one is ready.
 useEffect(()=>setPack(null),[retry,version,proxyOnly]);
 useEffect(()=>{let live=true;if(proxyOnly){gl.domElement.dataset.cityStudioKit='proxy';invalidate();return;}loadStudioKit(version,'full',storefront).then(pack=>{if(live){setPack(pack);gl.domElement.dataset.cityStudioKit='ready';invalidate();}}).catch(()=>{if(live)gl.domElement.dataset.cityStudioKit='fallback';});return()=>{live=false;};},[retry,gl,invalidate,version,proxyOnly,storefront]);
 useEffect(()=>{const retry=()=>setRetry(n=>n+1);window.addEventListener('online',retry);return()=>window.removeEventListener('online',retry);},[]);
 const groups=useMemo(()=>{const out=new Map<string,{piece:Piece;placements:StudioPiece[];texture?:string;see?:boolean}>();
  if(!pack)return out;
  const kit=medium&&mediumPack?mediumPack:pack;
  for(const p of pieces.filter(p=>p.propertyId||near||STUDIO_MODULE_MAP.get(p.module)?.minDetail!=='near'))for(const [i,piece] of (kit.get(p.module)??[]).entries()){
   // Kit pieces in generated walls leave out their wall slab (and, for portal doors, their leaf).
   if(p.omit?.includes(piece.channel))continue;
   const texture=p.finishes?.[piece.channel as StudioChannel]?.texture,key=`${p.module}/${kit===pack?i:'medium:'+piece.channel}/${texture??''}`,group=out.get(key)??{piece,placements:[],texture,see:STOREFRONT_MODULE_IDS.has(p.module)};group.placements.push(p);out.set(key,group);
  }return out;
 },[pieces,pack,near,medium,mediumPack]);
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

 return <group ref={root} name={`studio-kit-v${version}`}>{!proxyOnly&&(pack?[...groups].map(([key,g])=><StudioInstances key={key} geometry={g.piece.geometry} channel={g.piece.channel} placements={g.placements} texture={g.texture} seeThrough={g.see} representation={pieces.some(p=>p.propertyId)?'full':undefined}/>):<StudioInstances geometry={fallbackCube} channel="wall" placements={fallback}/>)}{(pack||proxyOnly)&&proxies.map((g,i)=><StudioInstances key={'proxy/'+i} geometry={g.geometry} channel={g.channel} placements={g.placements} texture={g.texture} representation="simple"/>)}</group>;
}
