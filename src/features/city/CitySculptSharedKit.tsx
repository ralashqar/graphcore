/**
 * Kit pieces of every finished studio plot in the city, drawn as shared instanced meshes (one per module ×
 * channel × texture across all buildings, docs/city-generated-walls-at-scale.md) instead of per building.
 *
 * Per-plot levels (CitySculptCity decides them from the camera, several times a second):
 *   near   every piece, including `minDetail: near` modules (as CityStudioMeshes within 120 m)
 *   full   the kit pieces without near-only modules
 *   proxy  far proxies: the kit wall channel as boxes around the aperture (kit tiles only) and a recessed glass
 *          pane, other modules as one box (the business buildings' far representation)
 *   hidden outside the view frustum
 * Each plot's instance matrices and colours are computed once, in world space; a level change only copies the
 * plot's blocks into the shared instance buffers (compaction, like CityInstances) and uploads the used range.
 */
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type MutableRefObject} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Box3,BoxGeometry,BufferGeometry,Color,InstancedBufferAttribute,InstancedMesh,Matrix4,Quaternion,Vector3,type Material} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {STUDIO_FAMILIES,STUDIO_MODULE_MAP} from '../../domain/cityStudioCatalog';
import type {StudioChannel,StudioPiece} from '../../domain/cityStudioTypes';
import type {CityPlotTransform} from '../../domain/citySculptCityBake';
import type {CityTextureId} from '../../domain/cityTexturePresets';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
import {loadStudioKit} from './CityStudioMeshes';
import {cityGwStats} from './cityGwStats';

export type KitLevel='hidden'|'proxy'|'full'|'near';
export type KitLevels={revision:number;levels:Map<string,KitLevel>};
export type KitPlot={id:string;version:2|3|4|5;pieces:StudioPiece[];transform:CityPlotTransform};
type Tier='full'|'near'|'proxy';
type Pack=Map<string,{geometry:BufferGeometry;channel:string}[]>;
type Block={plot:string;matrices:Float32Array;colors:Float32Array;count:number};
type GroupSource={geometry:BufferGeometry;channel:string;texture?:string;tier:Tier};
type Group=GroupSource&{key:string;blocks:Block[];total:number};

const shows=(tier:Tier,level:KitLevel|undefined)=>tier==='proxy'?level==='proxy':tier==='near'?level==='near':level==='full'||level==='near';
const materials=new Map<string,{material:Material;users:number}>();
function acquire(glass:boolean,texture?:string){const key=`${glass}|${texture??''}`;let e=materials.get(key);if(!e){e={material:citySurfaceMaterial(glass,texture as CityTextureId),users:0};materials.set(key,e);}e.users++;return e.material;}
function release(glass:boolean,texture?:string){const key=`${glass}|${texture??''}`,e=materials.get(key);if(!e||--e.users>0)return;materials.delete(key);e.material.dispose();}

// Proxy shapes are shared across plots and never disposed (a few dozen small boxes).
const proxyGeometry=new Map<string,BufferGeometry>();
function proxy(key:string,boxes:number[][]){let g=proxyGeometry.get(key);if(!g){const parts=boxes.map(([x,y,z,w,h,d])=>new BoxGeometry(w,h,d).translate(x,y,z));g=parts.length===1?parts[0]:mergeGeometries(parts)!;if(parts.length>1)parts.forEach(p=>p.dispose());proxyGeometry.set(key,g);}return g;}
/** The far proxy boxes of one piece (as CityStudioMeshes' business proxies): [key, channel, geometry][]. */
export function studioPieceProxies(p:StudioPiece):{key:string;channel:string;texture?:string;geometry:BufferGeometry}[]{
 const part=STUDIO_MODULE_MAP.get(p.module);if(!part||part.minDetail==='near')return [];
 const [w,h,d]=part.size,o=part.collision==='solid'&&!p.omit?.includes('wall')?null:part.opening,channel=['window','wall','door'].includes(part.category)?'wall':'trim',texture=p.finishes?.[channel as StudioChannel]?.texture,out=[];
 const boxes=(o?[[-w/2+(w-o.width)/4,h/2,0,(w-o.width)/2,h,d],[w/2-(w-o.width)/4,h/2,0,(w-o.width)/2,h,d],[0,o.bottom/2,0,o.width,o.bottom,d],[0,(h+o.top)/2,0,o.width,h-o.top,d]]:[[0,h/2,0,w,h,d]]).filter(b=>b[3]>.001&&b[4]>.001);
 if(!p.omit?.includes('wall')&&boxes.length){const key=JSON.stringify([boxes,channel,texture]);out.push({key,channel,texture,geometry:proxy(key,boxes)});}
 if(o&&!p.omit?.includes('glass')){const glass=[[0,(o.bottom+o.top)/2,-.1,o.width,o.top-o.bottom,.04]],key=JSON.stringify(['glass',o.width,o.bottom,o.top]);out.push({key,channel:'glass',geometry:proxy(key,glass)});}
 return out;
}
const plotMatrix=(t:CityPlotTransform)=>new Matrix4().compose(new Vector3(t.x,0,t.z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),t.rotation),new Vector3(t.scale,t.scale,t.scale));
/** One plot's instance blocks per group key (world-space matrices, channel colours). Cached per plot object. */
function plotBlocks(plot:KitPlot,pack:Pack){
 const sources=new Map<string,GroupSource&{placements:StudioPiece[]}>(),world=plotMatrix(plot.transform);
 const push=(key:string,source:GroupSource,p:StudioPiece)=>{let s=sources.get(key);if(!s){s={...source,placements:[]};sources.set(key,s);}s.placements.push(p);};
 for(const p of plot.pieces){
  const near=STUDIO_MODULE_MAP.get(p.module)?.minDetail==='near';
  for(const [i,piece] of (pack.get(p.module)??[]).entries()){
   // Kit pieces in generated walls leave out their wall slab (and, for portal doors, their leaf).
   if(p.omit?.includes(piece.channel))continue;
   const texture=p.finishes?.[piece.channel as StudioChannel]?.texture,tier:Tier=near?'near':'full';
   push(`${plot.version}/${p.module}/${i}/${texture??''}/${tier}`,{geometry:piece.geometry,channel:piece.channel,texture,tier},p);
  }
  for(const x of studioPieceProxies(p))push(`proxy/${x.key}`,{geometry:x.geometry,channel:x.channel,texture:x.texture,tier:'proxy'},p);
 }
 const out=new Map<string,GroupSource&{block:Block}>(),local=new Matrix4(),q=new Quaternion(),pos=new Vector3(),scale=new Vector3(),up=new Vector3(0,1,0),color=new Color();
 for(const [key,s] of sources){
  const n=s.placements.length,matrices=new Float32Array(n*16),colors=new Float32Array(n*3);
  s.placements.forEach((p,i)=>{
   local.compose(pos.set(p.x,p.y,p.z),q.setFromAxisAngle(up,p.rotation),scale.set(...p.scale));local.premultiply(world).toArray(matrices,i*16);
   const palette=STUDIO_FAMILIES[p.family];color.set(p.finishes?.[s.channel as StudioChannel]?.color??palette[s.channel as keyof typeof palette]??palette.trim).toArray(colors,i*3);
  });
  out.set(key,{geometry:s.geometry,channel:s.channel,texture:s.texture,tier:s.tier,block:{plot:plot.id,matrices,colors,count:n}});
 }
 return out;
}
/** World-space bounds of a plot's kit pieces (module boxes at their scale), for per-plot frustum tests. */
export function kitBounds(plot:KitPlot):Box3{
 const box=new Box3(),world=plotMatrix(plot.transform),p=new Vector3(),half=new Vector3();
 for(const piece of plot.pieces){
  const part=STUDIO_MODULE_MAP.get(piece.module),[w,h,d]=part?.size??[2,3,.3],r=Math.hypot(w*piece.scale[0],d*piece.scale[2])/2;
  p.set(piece.x,piece.y+h*piece.scale[1]/2,piece.z).applyMatrix4(world);half.set(r,h*piece.scale[1]/2,r).multiplyScalar(plot.transform.scale);
  box.expandByPoint(p.clone().sub(half));box.expandByPoint(p.clone().add(half));
 }
 return box;
}
const blockCache=new WeakMap<KitPlot,{pack:Pack;blocks:ReturnType<typeof plotBlocks>}>();
const capacityFor=(n:number)=>Math.max(64,2**Math.ceil(Math.log2(Math.max(1,n))));

export function CitySculptSharedKit({plots,levels}:{plots:KitPlot[];levels:MutableRefObject<KitLevels>}){
 const invalidate=useThree(s=>s.invalidate);
 const versions=useMemo(()=>[...new Set(plots.map(p=>p.version))].sort().join(','),[plots]);
 const [packs,setPacks]=useState<Map<number,Pack>>(new Map());
 useEffect(()=>{let live=true;for(const v of versions.split(',').filter(Boolean).map(Number) as (2|3|4|5)[]){if(packs.has(v))continue;loadStudioKit(v).then(pack=>{if(live){setPacks(old=>new Map(old).set(v,pack));invalidate();}}).catch(()=>{});}return()=>{live=false;};},[versions]);// eslint-disable-line react-hooks/exhaustive-deps
 const groups=useMemo(()=>{
  const out=new Map<string,Group>();
  for(const plot of plots){
   const pack=packs.get(plot.version);if(!pack)continue;
   let cached=blockCache.get(plot);if(!cached||cached.pack!==pack){cached={pack,blocks:plotBlocks(plot,pack)};blockCache.set(plot,cached);}
   for(const [key,s] of cached.blocks){let g=out.get(key);if(!g){g={key,geometry:s.geometry,channel:s.channel,texture:s.texture,tier:s.tier,blocks:[],total:0};out.set(key,g);}g.blocks.push(s.block);g.total+=s.block.count;}
  }
  return [...out.values()];
 },[plots,packs]);
 useEffect(()=>{const canvas=document.querySelector('canvas');if(canvas&&import.meta.env.DEV)canvas.dataset.citySculptKit=JSON.stringify({groups:groups.length,instances:groups.reduce((n,g)=>n+g.total,0),packs:[...packs.keys()]});},[groups,packs]);
 return <group name="city-sculpt-shared-kit">{groups.map(g=><KitGroup key={`${g.key}|${capacityFor(g.total)}`} group={g} capacity={capacityFor(g.total)} levels={levels}/>)}</group>;
}

function KitGroup({group,capacity,levels}:{group:Group;capacity:number;levels:MutableRefObject<KitLevels>}){
 const glass=group.channel==='glass';
 const material=useMemo(()=>acquire(glass,group.texture),[glass,group.texture]);
 useEffect(()=>()=>release(glass,group.texture),[glass,group.texture]);
 const mesh=useMemo(()=>{const m=new InstancedMesh(group.geometry,material,capacity);m.instanceColor=new InstancedBufferAttribute(new Float32Array(capacity*3),3);m.count=0;m.visible=false;m.frustumCulled=false;m.name=`city-sculpt-kit-${group.tier}`;return m;},[group.geometry,material,capacity]);
 useEffect(()=>()=>{mesh.dispose();},[mesh]);
 const applied=useRef<{revision:number;group:Group|null;included:string}>({revision:-1,group:null,included:''});
 const invalidate=useThree(s=>s.invalidate);
 const update=()=>{
  const state=levels.current,a=applied.current;if(a.revision===state.revision&&a.group===group)return;
  let included='';for(const b of group.blocks)included+=shows(group.tier,state.levels.get(b.plot))?'1':'0';
  a.revision=state.revision;if(a.group===group&&a.included===included)return;a.group=group;a.included=included;
  let count=0;const matrices=mesh.instanceMatrix.array as Float32Array,colors=mesh.instanceColor!.array as Float32Array;
  group.blocks.forEach((b,i)=>{if(included[i]!=='1')return;matrices.set(b.matrices,count*16);colors.set(b.colors,count*3);count+=b.count;});
  mesh.count=count;mesh.visible=count>0;cityGwStats.kitUploads++;cityGwStats.kitInstancesCopied+=count;
  mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,count*16);mesh.instanceMatrix.needsUpdate=true;
  mesh.instanceColor!.clearUpdateRanges();mesh.instanceColor!.addUpdateRange(0,count*3);mesh.instanceColor!.needsUpdate=true;
  invalidate();
 };
 useLayoutEffect(update);
 useFrame(update);
 return <primitive object={mesh}/>;
}
