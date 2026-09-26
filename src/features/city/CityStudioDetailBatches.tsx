/**
 * Draws one building's worker-merged studio detail (free-opening faces and roof openings): one mesh per
 * material batch, with node materials shared across buildings by key (reference counted). Distance LOD
 * only mutates drawRange/visibility from a throttled frame check, never React state: near and far share
 * the same buffers (see cityStudioDetailBatches). `full` pins near detail (the plot being edited); near-only
 * extras (trims) are passed as children. `hidden` owners (floor slicing) draw from a subset index.
 */
import {useEffect,useLayoutEffect,useMemo,useRef,type ReactNode} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {BufferAttribute,BufferGeometry,Group,Mesh,Sphere,Vector3,type Camera,type Material,type OrthographicCamera,type PerspectiveCamera,type Texture} from 'three';
import {MeshBasicNodeMaterial,type MeshStandardNodeMaterial} from 'three/webgpu';
import {abs,dot,float,mix,normalView,positionViewDirection,pow} from 'three/tsl';
import {useCityReflection} from './cityReflections';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
import {warmHiddenMaterials} from './cityStudioWarmup';
import {freeWallMaterial} from './CityStudioFreeOpeningFace';
import type {CityTextureId} from '../../domain/cityTexturePresets';
import type {DetailBatch,DetailMaterial,StudioDetailBatches} from '../../domain/cityStudioDetailBatches';

/** Same hysteresis as far modular buildings (CityVisibility): near inside 55 m, far beyond 65 m. */
export const STUDIO_DETAIL_LOD={near:55,far:65,plot:24} as const;
const shared=new Map<string,{material:Material;users:number}>();
function createMaterial(m:DetailMaterial):Material{
 if(m.kind==='wall')return freeWallMaterial(m.color,m.texture as CityTextureId);
 if(m.kind==='painted'){const p=citySurfaceMaterial();p.vertexColors=true;return p;}
 if(m.kind==='glass'){const g=citySurfaceMaterial(true);g.color.set(m.color);if(m.seeThrough)seeThroughGlass(g);return g;}
 if(m.kind==='shell'){const s=new MeshBasicNodeMaterial();s.vertexColors=true;return s;}
 const r=citySurfaceMaterial(false,m.texture as CityTextureId);r.color.set(m.color);return r;
}
/**
 * Real glass for free-face glazing near the camera: blended after the opaque pass without depth writes, clear
 * head-on and more reflective at grazing angles (Fresnel-weighted opacity over the shared reflective glass shading).
 * Single-sided: the glazing is built as two opposite one-sided sheets, so exactly one draws from either side.
 */
function seeThroughGlass(g:MeshStandardNodeMaterial){
 g.transparent=true;g.depthWrite=false;g.envMapIntensity=3;
 const facing=abs(dot(normalView,positionViewDirection));g.opacityNode=mix(float(.9),float(.2),pow(facing,float(.55)));
}
/** Far and interior-less views keep the opaque reflective glass (same colour), swapped in without new buffers. */
const opaqueKey=(key:string)=>`${key}|opaque`;
const opaqueGlass=(m:DetailMaterial):DetailMaterial=>m.kind==='glass'?{kind:'glass',color:m.color}:m;
function acquire(key:string,m:DetailMaterial){let e=shared.get(key);if(!e){e={material:createMaterial(m),users:0};shared.set(key,e);}e.users++;return e.material;}
function release(key:string){const e=shared.get(key);if(!e||--e.users>0)return;shared.delete(key);e.material.dispose();}

function batchGeometry(b:DetailBatch,index=b.indices){
 const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(b.positions,3));g.setAttribute('normal',new BufferAttribute(b.normals,3));g.setAttribute('uv',new BufferAttribute(b.uvs,2));
 if(b.distance)g.setAttribute('openingDistance',new BufferAttribute(b.distance,1));if(b.colors)g.setAttribute('color',new BufferAttribute(b.colors,3));
 g.setIndex(new BufferAttribute(index,1));g.boundingSphere=new Sphere(new Vector3(b.sphere[0],b.sphere[1],b.sphere[2]),b.sphere[3]);return g;
}
/** Near representation without the hidden owners (own attribute objects over the same arrays). */
function subsetGeometry(b:DetailBatch,hidden:ReadonlySet<string>){
 const keep=b.owners.filter(o=>o.start<b.near&&!hidden.has(o.id)),out=new (b.indices instanceof Uint16Array?Uint16Array:Uint32Array)(keep.reduce((n,o)=>n+Math.min(o.count,b.near-o.start),0));
 let i=0;for(const o of keep){out.set(b.indices.subarray(o.start,Math.min(o.start+o.count,b.near)),i);i+=Math.min(o.count,b.near-o.start);}
 return batchGeometry(b,out);
}
/** Horizontal camera distance, or its orthographic equivalent from the plot's on-screen size. */
function viewDistance(camera:Camera,height:number,x:number,z:number){
 const o=camera as OrthographicCamera;
 if(o.isOrthographicCamera){const pixels=STUDIO_DETAIL_LOD.plot*o.zoom*height/Math.max(1e-6,o.top-o.bottom);return STUDIO_DETAIL_LOD.plot*height/(2*Math.tan(25*Math.PI/180)*Math.max(1,pixels));}
 const p=camera as PerspectiveCamera;return Math.hypot(p.position.x-x,p.position.z-z);
}

/** Test hook (?cityStudioTest): window.__cityStudioDetailForce = 'near' | 'far' pins every unedited building. */
const testForce=()=>typeof window!=='undefined'&&new URLSearchParams(window.location.search).has('cityStudioTest')?(window as unknown as {__cityStudioDetailForce?:'near'|'far'}).__cityStudioDetailForce:undefined;
/** `seeThrough`: near glazing may be transparent (something is behind it: interiors in view or window shells). */
export function CityStudioDetailBatches({details,center,full,hidden,seeThrough=true,children}:{details:StudioDetailBatches;center:{x:number;z:number};full:boolean;hidden?:ReadonlySet<string>|null;seeThrough?:boolean;children?:ReactNode}){
 const {camera,size,invalidate,gl,scene}=useThree();
 const geometries=useMemo(()=>details.batches.map(b=>batchGeometry(b)),[details]);
 useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries]);
 const subsets=useMemo(()=>hidden?.size?details.batches.map(b=>subsetGeometry(b,hidden)):null,[details,hidden]);
 useEffect(()=>()=>subsets?.forEach(g=>g.dispose()),[subsets]);
 const keys=details.batches.map(b=>b.key).join('\n');
 // Materials follow the batch keys only, so preview results with the same finishes reuse them.
 const materials=useMemo(()=>new Map(details.batches.map(b=>[b.key,acquire(b.key,b.material)])),[keys]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>()=>{for(const key of materials.keys())release(key);},[materials]);
 const opaque=useMemo(()=>new Map(details.batches.filter(b=>b.material.kind==='glass'&&b.material.seeThrough).map(b=>[b.key,acquire(opaqueKey(b.key),opaqueGlass(b.material))])),[keys]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>()=>{for(const key of opaque.keys())release(opaqueKey(key));},[opaque]);
 // The canvas-scoped prefiltered reflection (CityEnvironment), shared with the city's own glass.
 const reflection=useCityReflection();
 useEffect(()=>{for(const m of [...details.batches.filter(b=>b.material.kind==='glass').map(b=>materials.get(b.key)),...opaque.values()]){const g=m as MeshStandardNodeMaterial|undefined;if(!g||g.envMap===reflection)continue;g.envMap=reflection as Texture|null;g.needsUpdate=true;}invalidate();},[materials,opaque,reflection,invalidate]);
 const clear=useRef(seeThrough);clear.current=seeThrough;
 const meshes=useRef<(Mesh|null)[]>([]),root=useRef<Group>(null),nearGroup=useRef<Group>(null),lod=useRef<'near'|'far'>('near'),check=useRef(0);
 const apply=(next:'near'|'far')=>{
  lod.current=next;
  details.batches.forEach((b,i)=>{const mesh=meshes.current[i];if(!mesh)return;if(subsets){mesh.visible=(subsets[i].index?.count??0)>0;return;}const [start,count]=next==='near'?[0,b.near]:[b.farStart,b.far];mesh.geometry.setDrawRange(start,count);mesh.visible=count>0;});
  details.batches.forEach((b,i)=>{const mesh=meshes.current[i],far=opaque.get(b.key);if(mesh&&far)mesh.material=next==='near'&&clear.current?materials.get(b.key)!:far;});
  if(nearGroup.current)nearGroup.current.visible=next==='near';
 };
 const decide=()=>{if(full||subsets)return 'near' as const;const forced=testForce();if(forced)return forced;const d=viewDistance(camera,size.height,center.x,center.z);return d>(lod.current==='near'?STUDIO_DETAIL_LOD.far:STUDIO_DETAIL_LOD.near)?'far' as const:'near' as const;};
 useLayoutEffect(()=>{apply(decide());});
 useEffect(()=>{warmHiddenMaterials(gl,root.current,camera,scene);},[geometries,materials,gl,camera,scene]);
 useFrame((state)=>{if(state.clock.elapsedTime-check.current<.2)return;check.current=state.clock.elapsedTime;const next=decide();if(next!==lod.current){apply(next);invalidate();}});
 useEffect(()=>{
  if(typeof window==='undefined'||!new URLSearchParams(window.location.search).has('cityStudioTest'))return;
  const w=window as unknown as {__cityStudioDetail?:Record<string,unknown>};w.__cityStudioDetail??={};
  const id=`${center.x.toFixed(1)}:${center.z.toFixed(1)}`;w.__cityStudioDetail[id]={batches:details.batches.length,triangles:details.triangles,vertices:details.vertices,full};return()=>{delete w.__cityStudioDetail?.[id];};
 },[details,center.x,center.z,full]);
 return <group ref={root} name="studio-detail-batches">
  {details.batches.map((b,i)=>opaque.has(b.key)&&<mesh key={`${b.key}|warm`} visible={false} dispose={null} geometry={geometries[i]} material={opaque.get(b.key)}/>)}
  {details.batches.map((b,i)=><mesh key={b.key} name={`studio-detail-${b.material.kind}`} ref={m=>{meshes.current[i]=m;}} dispose={null} geometry={subsets?.[i]??geometries[i]} material={materials.get(b.key)}/>)}
  <group ref={nearGroup}>{children}</group>
 </group>;
}
