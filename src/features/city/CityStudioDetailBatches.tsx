/**
 * Draws one building's worker-merged studio detail (free-opening faces and roof openings): one mesh per
 * material batch, with node materials shared across buildings by key (reference counted). Distance LOD
 * only mutates drawRange/visibility from a throttled frame check, never React state: near and far share
 * the same buffers (see cityStudioDetailBatches). `full` pins near detail (the plot being edited); near-only
 * extras (trims) are passed as children. `hidden` owners (floor slicing) draw from a subset index.
 */
import {useEffect,useLayoutEffect,useMemo,useRef,type ReactNode} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {BufferAttribute,BufferGeometry,Group,Mesh,Sphere,Vector3,type Camera,type Material,type OrthographicCamera,type PerspectiveCamera} from 'three';
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
 if(m.kind==='glass'){const g=citySurfaceMaterial(true);g.color.set(m.color);return g;}
 const r=citySurfaceMaterial(false,m.texture as CityTextureId);r.color.set(m.color);return r;
}
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
export function CityStudioDetailBatches({details,center,full,hidden,children}:{details:StudioDetailBatches;center:{x:number;z:number};full:boolean;hidden?:ReadonlySet<string>|null;children?:ReactNode}){
 const {camera,size,invalidate,gl,scene}=useThree();
 const geometries=useMemo(()=>details.batches.map(b=>batchGeometry(b)),[details]);
 useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries]);
 const subsets=useMemo(()=>hidden?.size?details.batches.map(b=>subsetGeometry(b,hidden)):null,[details,hidden]);
 useEffect(()=>()=>subsets?.forEach(g=>g.dispose()),[subsets]);
 const keys=details.batches.map(b=>b.key).join('\n');
 // Materials follow the batch keys only, so preview results with the same finishes reuse them.
 const materials=useMemo(()=>new Map(details.batches.map(b=>[b.key,acquire(b.key,b.material)])),[keys]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>()=>{for(const key of materials.keys())release(key);},[materials]);
 const meshes=useRef<(Mesh|null)[]>([]),root=useRef<Group>(null),nearGroup=useRef<Group>(null),lod=useRef<'near'|'far'>('near'),check=useRef(0);
 const apply=(next:'near'|'far')=>{
  lod.current=next;
  details.batches.forEach((b,i)=>{const mesh=meshes.current[i];if(!mesh)return;if(subsets){mesh.visible=(subsets[i].index?.count??0)>0;return;}const [start,count]=next==='near'?[0,b.near]:[b.farStart,b.far];mesh.geometry.setDrawRange(start,count);mesh.visible=count>0;});
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
  {details.batches.map((b,i)=><mesh key={b.key} name={`studio-detail-${b.material.kind}`} ref={m=>{meshes.current[i]=m;}} dispose={null} geometry={subsets?.[i]??geometries[i]} material={materials.get(b.key)}/>)}
  <group ref={nearGroup}>{children}</group>
 </group>;
}
