/**
 * City-scale rendering of finished studio plots (every studio plot not being edited), see
 * docs/city-generated-walls-at-scale.md. Replaces one CitySculptBuilding per plot (its own grounds preparation,
 * materials, roof meshes, instanced kit and detail batches: dozens of draw calls each) with shared batches:
 *
 * - Worker bakes (citySculptService.prepareSculptCity): generated walls' far representation, roofs, edges,
 *   flashing and the entrance path in world space, with colour per vertex.
 * - Chunks of CITY_CHUNK×CITY_CHUNK plot cells concatenate those bakes per material: about one draw per material
 *   per chunk. Only the chunk of a changed plot is rebuilt (typed-array copies, no geometry work).
 * - Kit pieces: shared instanced meshes across all plots (CitySculptSharedKit) with a far proxy level.
 * - Near overlays: plots within 55 m (65 m to leave, as CityStudioDetailBatches) mount their own merged detail
 *   batches at full near detail with trims, animated free-door leaves, interiors and the full-resolution sign; the
 *   chunk then leaves out that plot's far detail (index rewrite only). Near overlays are the existing
 *   per-building path, so near visuals are unchanged.
 * - Signs of far plots come from one shared atlas; grounds from one shared preparation.
 *
 * The edited plot never passes through here (CityLandScene keeps it on CitySculptBuilding), so studio edit
 * latency is unaffected. `?cityGwBatch=0` routes every plot back to CitySculptBuilding.
 */
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Box3,BufferAttribute,BufferGeometry,CanvasTexture,Frustum,Matrix4,SRGBColorSpace,Sphere,Vector3,type Material,type Texture} from 'three';
import {MeshBasicNodeMaterial,type MeshStandardNodeMaterial} from 'three/webgpu';
import {attribute,vec3} from 'three/tsl';
import {landPosition,landProperty,type LandDraft,type LandPlot} from '../../domain/cityLand';
import type {CityProperty} from '../../domain/city';
import {studioKitVersion} from '../../domain/cityStudioCatalog';
import type {StudioResolved} from '../../domain/cityStudioTypes';
import type {CityBakeSign,CityPlotTransform,SculptCityBake} from '../../domain/citySculptCityBake';
import {chunkDrawIndices,cityChunkKey,mergeCityChunk,type CityChunkBatch} from '../../domain/citySculptCityChunks';
import type {CityTextureId} from '../../domain/cityTexturePresets';
import {prepareSculpt,prepareSculptCity,type PreparedSculpt} from './citySculptService';
import {preparedStudioPlot,publishStudioPlot,removeStudioPlot} from './cityStudioRegistry';
import {CityStudioDetailBatches,STUDIO_DETAIL_LOD,viewDistance} from './CityStudioDetailBatches';
import {CityStudioFreeDoorLeaves,CityStudioInteriorMeshes} from './CityStudioInteriorMeshes';
import {CityStudioTrimParts} from './CityStudioTrimParts';
import {CitySculptSharedKit,kitBounds,type KitLevel,type KitLevels,type KitPlot} from './CitySculptSharedKit';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
import {freeWallMaterial} from './CityStudioFreeOpeningFace';
import {useCityReflection} from './cityReflections';
import {CityPreparedBuildings} from './CityDesignBuildings';
import {usePreparedCity} from './usePreparedCity';
import {sculptSignMaterial} from './CitySculptBuilding';
import {cityGwStats} from './cityGwStats';

type Entry={plot:LandPlot;draft:LandDraft};
type Ready={id:string;key:string;plot:LandPlot;draft:LandDraft;transform:CityPlotTransform;studio:StudioResolved;bake:SculptCityBake;kit:KitPlot;/** kit pieces' world bounds (frustum test) */kitBox:Box3};
/** Kit detail: full pieces inside KIT_FULL.enter m (equivalent distance, as the map zoom), proxies beyond KIT_FULL.leave;
 * near-only modules within 120 m. `?cityGwKitFar=<m>` moves the proxy switch (measurement). */
const kitFar=typeof window!=='undefined'?Number(new URLSearchParams(window.location.search).get('cityGwKitFar'))||0:0;
/** Overlays mount hidden inside PRELOAD.enter m (equivalent distance) and unmount beyond PRELOAD.leave. */
export const PRELOAD={enter:95,leave:110} as const;
export const KIT_FULL={enter:kitFar||400,leave:(kitFar||400)*1.12,nearOnly:120} as const;
// Recipe JSON is large (tens of kB per unified building): key each draft object once.
const draftKeys=new WeakMap<LandDraft,string>();
const entryKey=(e:Entry)=>{let k=draftKeys.get(e.draft);if(k===undefined){k=JSON.stringify([e.draft.sculpt,e.draft.design,e.draft.name,e.draft.color]);draftKeys.set(e.draft,k);}return `${e.plot.x}:${e.plot.z}:${e.plot.rotation}:${e.plot.size}:${k}`;};
const transformOf=(p:LandPlot):CityPlotTransform=>{const c=landPosition(p);return {x:c.x,z:c.z,rotation:p.rotation*Math.PI/2,scale:p.size/24};};
type Force={overlay?:'near'|'far';kit?:KitLevel};
const testForce=():Force|undefined=>typeof window!=='undefined'&&new URLSearchParams(window.location.search).has('cityStudioTest')?(window as unknown as {__cityGwForce?:Force}).__cityGwForce:undefined;

// Chunk materials, shared by key across chunks (vertex colours carry every finish).
const shared=new Map<string,{material:Material;users:number}>();
function chunkMaterial(b:Pick<CityChunkBatch,'key'|'kind'|'texture'>):Material{
 if(b.kind==='wall')return freeWallMaterial('#ffffff',b.texture as CityTextureId,true);
 if(b.kind==='glass'){const g=citySurfaceMaterial(true);g.colorNode=attribute('color','vec3').mul(.036).add(vec3(.0144,.036,.052));return g;}
 const s=citySurfaceMaterial(false,b.texture as CityTextureId);s.vertexColors=true;return s;
}
function acquire(b:CityChunkBatch){let e=shared.get(b.key);if(!e){e={material:chunkMaterial(b),users:0};shared.set(b.key,e);}e.users++;return e.material;}
function release(key:string){const e=shared.get(key);if(!e||--e.users>0)return;shared.delete(key);e.material.dispose();}

export function CitySculptCity({entries}:{entries:Entry[]}){
 const {camera,size,invalidate,gl}=useThree();
 const wanted=useMemo(()=>new Map(entries.map(e=>[e.plot.id,{entry:e,key:entryKey(e)}])),[entries]);
 const wantedRef=useRef(wanted);wantedRef.current=wanted;
 const [ready,setReady]=useState<Map<string,Ready>>(()=>new Map());
 const readyRef=useRef(ready);readyRef.current=ready;
 const requested=useRef(new Map<string,string>()),arrived=useRef<Ready[]>([]),started=useRef(performance.now()),timing=useRef({count:0,resolveMs:0,bakeMs:0,roundTripMs:0,loadedMs:0});
 // Request changed plots, nearest chunk first so chunks complete (and merge) one after another.
 useEffect(()=>{
  const todo=[...wanted.values()].filter(w=>requested.current.get(w.entry.plot.id)!==w.key&&readyRef.current.get(w.entry.plot.id)?.key!==w.key);
  const cam=camera.position,band=(p:LandPlot)=>{const c=landPosition(p);return Math.round(Math.hypot(c.x-cam.x,c.z-cam.z)/150);};
  todo.sort((a,b)=>band(a.entry.plot)-band(b.entry.plot)||cityChunkKey(a.entry.plot).localeCompare(cityChunkKey(b.entry.plot)));
  for(const w of todo){
   const {plot,draft}=w.entry,key=w.key;if(!draft.sculpt)continue;requested.current.set(plot.id,key);
   const transform=transformOf(plot),begun=performance.now();
   void prepareSculptCity(draft.sculpt,draft.design,transform,draft.name).then(result=>{
    if(wantedRef.current.get(plot.id)?.key!==key)return;
    const t=timing.current;t.count++;t.resolveMs+=result.timing.resolveMs;t.bakeMs+=result.timing.bakeMs;t.roundTripMs+=performance.now()-begun;
    const recipe=draft.sculpt!,version=studioKitVersion(recipe.version===5||recipe.version===6?recipe.studio.catalogue:undefined);
    const kit={id:plot.id,version,pieces:result.studio.pieces,transform};
    arrived.current.push({id:plot.id,key,plot,draft,transform,studio:result.studio,bake:result.bake,kit,kitBox:kitBounds(kit)});
   }).catch(error=>{if(requested.current.get(plot.id)===key)requested.current.delete(plot.id);console.warn('City studio plot preparation failed',plot.id,error);});
  }
  for(const id of [...requested.current.keys()])if(!wanted.has(id))requested.current.delete(id);
 },[wanted,camera]);
 // Commit arrivals in batches (four times a second) so a loading city merges each chunk only a few times.
 useEffect(()=>{
  const flush=()=>{
   const now=wantedRef.current,batch=arrived.current;arrived.current=[];if(batch.length)cityGwStats.flushes++;
   setReady(old=>{
    const stale=[...old.keys()].some(id=>!now.has(id));if(!batch.length&&!stale)return old;
    const next=new Map(old);for(const r of batch)if(now.get(r.id)?.key===r.key)next.set(r.id,r);for(const id of [...next.keys()])if(!now.has(id))next.delete(id);return next;
   });
  };
  const timer=setInterval(flush,250);return()=>clearInterval(timer);
 },[]);
 // A plot that leaves (opened for editing) goes at once, not with the next arrival batch.
 useEffect(()=>{setReady(old=>[...old.keys()].some(id=>!wanted.has(id))?new Map([...old].filter(([id])=>wanted.has(id))):old);},[wanted]);
 useEffect(()=>{if(!timing.current.loadedMs&&wanted.size&&[...wanted.values()].every(w=>ready.get(w.entry.plot.id)?.key===w.key))timing.current.loadedMs=performance.now()-started.current;},[ready,wanted]);
 // Walking collision and doors for every finished plot (CityDriving reads the registry).
 const published=useRef(new Map<string,Ready>());
 // Only withdraw what this component published: an opened plot's CitySculptBuilding may already have replaced it.
 const withdraw=(id:string,r:Ready)=>{if(preparedStudioPlot(id)?.result===r.studio)removeStudioPlot(id);};
 useEffect(()=>{
  for(const r of ready.values()){if(published.current.get(r.id)?.key===r.key)continue;published.current.set(r.id,r);publishStudioPlot({id:r.id,...r.transform,result:r.studio});}
  for(const [id,r] of [...published.current])if(!ready.has(id)){published.current.delete(id);withdraw(id,r);}
 },[ready]);
 useEffect(()=>()=>{for(const [id,r] of published.current)withdraw(id,r);published.current.clear();},[]);// eslint-disable-line react-hooks/exhaustive-deps

 // Distance LOD for every ready plot: near overlays (55/65 m) and the shared kit's level, several times a second.
 const kitLevels=useRef<KitLevels>({revision:0,levels:new Map()});
 const [near,setNear]=useState<ReadonlySet<string>>(()=>new Set());
 const [leaving,setLeaving]=useState<ReadonlySet<string>>(()=>new Set());
 // Plots approaching the near radius mount their overlay hidden first (PRELOAD), so preparation, trim fitting,
 // uploads and first-use shader compiles happen before the swap rather than on it.
 const [preload,setPreload]=useState<ReadonlySet<string>>(()=>new Set());
 const preloadRef=useRef(preload);preloadRef.current=preload;
 const nearRef=useRef(near);nearRef.current=near;
 const scratch=useMemo(()=>({frustum:new Frustum(),matrix:new Matrix4(),check:-1}),[]);
 const decide=useCallback((force=false)=>{
  const s=scratch,f=testForce();
  s.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);s.frustum.setFromProjectionMatrix(s.matrix,camera.coordinateSystem);
  const levels=kitLevels.current.levels,nextNear=new Set<string>(),nextPreload=new Set<string>();let changed=false;
  for(const r of readyRef.current.values()){
   const {x,z}=r.transform,d=viewDistance(camera,size.height,x,z),wasNear=nearRef.current.has(r.id);
   if(f?.overlay?f.overlay==='near':d<(wasNear?STUDIO_DETAIL_LOD.far:STUDIO_DETAIL_LOD.near))nextNear.add(r.id);
   if(f?.overlay?f.overlay==='near':d<(preloadRef.current.has(r.id)?PRELOAD.leave:PRELOAD.enter))nextPreload.add(r.id);
   // Kit visibility: the bounds of the plot's own kit pieces (as tight as the per-building instanced meshes were).
   const old=levels.get(r.id),visible=!r.kitBox.isEmpty()&&s.frustum.intersectsBox(r.kitBox);
   const level:KitLevel=f?.kit??(!visible?'hidden':Math.hypot(camera.position.x-x,camera.position.y,camera.position.z-z)<KIT_FULL.nearOnly?'near':d<((old==='full'||old==='near')?KIT_FULL.leave:KIT_FULL.enter)?'full':'proxy');
   if(old!==level){levels.set(r.id,level);changed=true;}
  }
  for(const id of [...levels.keys()])if(!readyRef.current.has(id)){levels.delete(id);changed=true;}
  if(changed){kitLevels.current.revision++;cityGwStats.kitRevisions++;invalidate();const h:Record<string,number>={};for(const l of levels.values())h[l]=(h[l]??0)+1;cityGwStats.levels=JSON.stringify(h);cityGwStats.viewDistance=Math.round(viewDistance(camera,size.height,0,0));}
  const pre=preloadRef.current;if(nextPreload.size!==pre.size||[...nextPreload].some(id=>!pre.has(id)))setPreload(nextPreload);
  const current=nearRef.current;
  if(force||nextNear.size!==current.size||[...nextNear].some(id=>!current.has(id))){
   const gone=[...current].filter(id=>!nextNear.has(id));
   cityGwStats.nearChanges++;setNear(nextNear);
   if(gone.length){setLeaving(old=>new Set([...old,...gone].filter(id=>!nextNear.has(id))));setTimeout(()=>setLeaving(old=>{const next=new Set(old);gone.forEach(id=>next.delete(id));return next;}),600);}
  }
 },[camera,size.height,scratch,invalidate]);
 useLayoutEffect(()=>{decide(true);},[ready,decide]);
 useFrame(state=>{if(state.clock.elapsedTime-scratch.check<.2)return;scratch.check=state.clock.elapsedTime;decide();});

 // Overlays report when their own near detail is on screen; only then does the chunk drop that plot's far detail.
 const [overlaid,setOverlaid]=useState<ReadonlySet<string>>(()=>new Set());
 const onOverlay=useCallback((id:string,shown:boolean)=>setOverlaid(old=>{if(old.has(id)===shown)return old;const next=new Set(old);if(shown)next.add(id);else next.delete(id);return next;}),[]);
 const excluded=useMemo(()=>new Set([...overlaid].filter(id=>near.has(id))),[overlaid,near]);

 // Chunks keep their plot list identity until one of their plots changes.
 const chunkCache=useRef(new Map<string,{signature:string;plots:{id:string;bake:SculptCityBake}[]}>());
 const chunks=useMemo(()=>{
  const lists=new Map<string,Ready[]>();for(const r of ready.values()){const key=cityChunkKey(r.plot),list=lists.get(key)??[];list.push(r);lists.set(key,list);}
  const out:{key:string;plots:{id:string;bake:SculptCityBake}[]}[]=[];
  for(const [key,list] of lists){list.sort((a,b)=>a.id<b.id?-1:1);const signature=list.map(r=>`${r.id}\u0000${r.key}`).join('\u0001'),cached=chunkCache.current.get(key);
   if(cached&&cached.signature===signature){out.push({key,plots:cached.plots});continue;}
   const plots=list.map(r=>({id:r.id,bake:r.bake}));chunkCache.current.set(key,{signature,plots});out.push({key,plots});}
  for(const key of [...chunkCache.current.keys()])if(!lists.has(key))chunkCache.current.delete(key);
  return out;
 },[ready]);
 const kitPlots=useMemo(()=>[...ready.values()].map(r=>r.kit),[ready]);
 // Grounds come from the wanted plots (not the arrivals), so their preparation list is stable while the city loads;
 // three groups prepare on three design workers in parallel.
 const groundGroups=useMemo(()=>{const groups:CityProperty[][]=[[],[],[]];for(const w of wanted.values()){const p=w.entry.plot;groups[Math.abs(Math.round(p.x*7+p.z*13))%3].push(landProperty(p,w.entry.draft));}return groups;},[wanted]);
 const signs=useMemo(()=>[...ready.values()].filter(r=>r.bake.sign).map(r=>({id:r.id,name:r.draft.name,color:r.draft.color,sign:r.bake.sign!})),[ready]);
 useEffect(()=>{
  if(!import.meta.env.DEV)return;
  const t=timing.current;gl.domElement.dataset.citySculptCity=JSON.stringify({plots:wanted.size,ready:ready.size,chunks:chunks.length,chunkBatches:chunks.reduce((n,c)=>n+new Set(c.plots.flatMap(p=>p.bake.batches.map(b=>b.key))).size,0),near:near.size,overlays:excluded.size,
   triangles:{envelope:Math.round([...ready.values()].reduce((n,r)=>n+r.bake.triangles.envelope,0)),detail:Math.round([...ready.values()].reduce((n,r)=>n+r.bake.triangles.detail,0))},
   worker:t.count?{plots:t.count,resolveMs:+(t.resolveMs/t.count).toFixed(1),bakeMs:+(t.bakeMs/t.count).toFixed(1),roundTripMs:+(t.roundTripMs/t.count).toFixed(1)}:null,loadedMs:Math.round(t.loadedMs)});
 },[gl,wanted,ready,chunks,near,excluded]);
 useEffect(()=>()=>{delete gl.domElement.dataset.citySculptCity;},[gl]);
 const mounted=useMemo(()=>[...new Set([...near,...leaving,...preload])].map(id=>ready.get(id)).filter((r):r is Ready=>!!r),[near,leaving,preload,ready]);
 return <group name="city-sculpt-city">
  {groundGroups.map((g,i)=><CitySculptGrounds key={i} properties={g}/>)}
  {chunks.map(c=><CitySculptChunk key={c.key} plots={c.plots} excluded={c.plots.filter(p=>excluded.has(p.id)).map(p=>p.id).join('\n')}/>)}
  <CitySculptSharedKit plots={kitPlots} levels={kitLevels}/>
  <CitySculptSigns signs={signs} excluded={excluded}/>
  {mounted.map(r=><NearOverlay key={r.id} ready={r} visible={near.has(r.id)||leaving.has(r.id)} onShown={onOverlay}/>)}
 </group>;
}
/** Grounds (paving, lawns, enclosure) of a group of finished plots, as each CitySculptBuilding drew its own. */
function CitySculptGrounds({properties}:{properties:CityProperty[]}){
 const key=JSON.stringify(properties.map(p=>[p.id,p.profile.buildingDesign,p.profile.color])),stable=useMemo(()=>properties,[key]);// eslint-disable-line react-hooks/exhaustive-deps
 const grounds=usePreparedCity(stable,true,true,true);
 return <CityPreparedBuildings properties={grounds} layer="grounds" reduced/>;
}

/** One chunk: a mesh per material over its plots' concatenated bakes; excluded plots draw only their envelope. */
function CitySculptChunk({plots,excluded}:{plots:{id:string;bake:SculptCityBake}[];excluded:string}){
 const invalidate=useThree(s=>s.invalidate);
 const batches=useMemo(()=>{const t=performance.now(),out=mergeCityChunk(plots);cityGwStats.chunkMerges++;cityGwStats.chunkMergeMs+=performance.now()-t;return out;},[plots]);
 const geometries=useMemo(()=>batches.map(b=>{
  const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(b.positions,3));g.setAttribute('normal',new BufferAttribute(b.normals,3));g.setAttribute('color',new BufferAttribute(b.colors,3));
  if(b.uvs)g.setAttribute('uv',new BufferAttribute(b.uvs,2));if(b.distance)g.setAttribute('openingDistance',new BufferAttribute(b.distance,1));
  // The drawn index list is rewritten in place (compacted, with a draw range) when plots are left out.
  g.setIndex(new BufferAttribute(b.indices.slice(),1));g.boundingSphere=new Sphere(new Vector3(b.sphere[0],b.sphere[1],b.sphere[2]),b.sphere[3]);return g;
 }),[batches]);
 useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries]);
 const keys=batches.map(b=>b.key).join('\n');
 const materials=useMemo(()=>new Map(batches.map(b=>[b.key,acquire(b)])),[keys]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>()=>{for(const key of materials.keys())release(key);},[materials]);
 const reflection=useCityReflection();
 useEffect(()=>{const g=materials.get('glass') as MeshStandardNodeMaterial|undefined;if(g&&g.envMap!==reflection){g.envMap=reflection as Texture|null;g.needsUpdate=true;invalidate();}},[materials,reflection,invalidate]);
 const shown=useMemo(()=>new WeakMap<BufferGeometry,string>(),[]);
 useLayoutEffect(()=>{
  const out=new Set(excluded.split('\n').filter(Boolean));
  batches.forEach((b,i)=>{
   const g=geometries[i],signature=out.size?excluded:'';if((shown.get(g)??'')===signature)return;shown.set(g,signature);
   const draw=chunkDrawIndices(b,out),index=g.index!;
   cityGwStats.indexRewrites++;(index.array as Uint32Array).set(draw,0);index.clearUpdateRanges();index.addUpdateRange(0,draw.length);index.needsUpdate=true;g.setDrawRange(0,draw.length);
  });
  invalidate();
 },[batches,geometries,excluded,invalidate,shown]);
 return <group name="city-sculpt-chunk">{batches.map((b,i)=><mesh key={b.key} name={`city-sculpt-chunk-${b.kind}`} geometry={geometries[i]} material={materials.get(b.key)} dispose={null}/>)}</group>;
}

/** Near representation of one plot: its own merged detail batches (full near detail), trims, doors, interior, sign. */
function NearOverlay({ready,visible,onShown}:{ready:Ready;visible:boolean;onShown:(id:string,shown:boolean)=>void}){
 const [prepared,setPrepared]=useState<PreparedSculpt|null>(null);const invalidate=useThree(s=>s.invalidate);
 const recipe=ready.draft.sculpt!,design=ready.draft.design;
 useEffect(()=>{let live=true;void prepareSculpt(recipe,design,false).then(value=>{if(live){setPrepared(value);invalidate();}}).catch(()=>{});return()=>{live=false;};},[recipe,design,invalidate]);
 const {x,z,rotation,scale}=ready.transform;
 const studio=prepared?.studio,interior=recipe.version===6?recipe.interior:null;
 useEffect(()=>{if(!prepared||!visible)return;onShown(ready.id,true);return()=>onShown(ready.id,false);},[prepared,visible,ready.id,onShown]);
 return <>
  <group name="city-sculpt-near" visible={visible} position={[x,0,z]} rotation={[0,rotation,0]} scale={scale}>
   {prepared?.details&&<CityStudioDetailBatches details={prepared.details} center={{x,z}} full={false} pinNear>{studio?.freeFaces&&studio.portals&&<CityStudioFreeDoorLeaves plotId={ready.id} portals={studio.portals} faces={studio.freeFaces}/>}{studio?.freeFaces&&<CityStudioTrimParts faces={studio.freeFaces} trims={studio.freeTrims??(recipe.version===5||recipe.version===6?recipe.studio.freeTrims:undefined)} groundHeight={design.groundHeight}/>}</CityStudioDetailBatches>}
   {prepared&&studio?.interiorLevels&&interior&&<CityStudioInteriorMeshes plotId={ready.id} levels={studio.interiorLevels} portals={studio.portals??[]} decks={studio.decks} view={{mode:'whole',floor:0}} finish={interior.floorFinish} wallColor={interior.wallColor}/>}
  </group>
  {prepared&&visible&&ready.bake.sign&&<WorldSign sign={ready.bake.sign} name={ready.draft.name} color={ready.draft.color}/>}
 </>;
}
function WorldSign({sign,name,color}:{sign:CityBakeSign;name:string;color:string}){
 const material=useMemo(()=>sculptSignMaterial(name,color),[name,color]);
 useEffect(()=>()=>{material.map?.dispose();material.dispose();},[material]);
 return <mesh position={[sign.x,sign.y,sign.z]} rotation={[0,sign.angle,0]} material={material}><planeGeometry args={[sign.width,sign.height]}/></mesh>;
}

/** Entrance signs of plots without a near overlay: atlas pages of 256×48 cells (the full 512×96 sign at half
 * resolution) drawn incrementally, and one merged quad mesh per page. */
const CELL={w:256,h:48,page:2048},COLS=CELL.page/CELL.w,PER_PAGE=COLS*Math.floor(CELL.page/CELL.h);
type AtlasPage={canvas:HTMLCanvasElement;texture:CanvasTexture;material:MeshBasicNodeMaterial;free:number[];used:number};
class SignAtlas{
 pages:AtlasPage[]=[];cells=new Map<string,{page:number;cell:number;content:string}>();
 private page(){const canvas=document.createElement('canvas');canvas.width=canvas.height=CELL.page;const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;const page={canvas,texture,material:new MeshBasicNodeMaterial({map:texture}),free:[] as number[],used:0};this.pages.push(page);return page;}
 /** Draws new or changed signs, frees removed ones; returns whether any page changed. */
 update(signs:{id:string;name:string;color:string}[]){
  let changed=false;const live=new Set(signs.map(s=>s.id));
  for(const [id,c] of this.cells)if(!live.has(id)){this.pages[c.page].free.push(c.cell);this.cells.delete(id);}
  for(const s of signs){
   const content=`${s.name}\u0000${s.color}`,old=this.cells.get(s.id);if(old?.content===content)continue;
   let slot=old;if(!slot){let index=this.pages.findIndex(p=>p.free.length||p.used<PER_PAGE);if(index<0){this.page();index=this.pages.length-1;}const p=this.pages[index];slot={page:index,cell:p.free.length?p.free.pop()!:p.used++,content};}
   slot.content=content;this.cells.set(s.id,slot);
   const p=this.pages[slot.page],ctx=p.canvas.getContext('2d')!,cx=(slot.cell%COLS)*CELL.w,cy=Math.floor(slot.cell/COLS)*CELL.h;
   ctx.save();ctx.translate(cx,cy);ctx.scale(.5,.5);ctx.fillStyle=s.color;ctx.fillRect(0,0,512,96);ctx.fillStyle='#fff8e9';ctx.textAlign='center';ctx.textBaseline='middle';
   let font=52;do{ctx.font=`700 ${font--}px sans-serif`;}while(ctx.measureText(s.name).width>475&&font>18);ctx.fillText(s.name,256,49);ctx.restore();
   p.texture.needsUpdate=true;changed=true;
  }
  return changed;
 }
 dispose(){for(const p of this.pages){p.texture.dispose();p.material.dispose();}this.pages=[];this.cells.clear();}
}
function CitySculptSigns({signs,excluded}:{signs:{id:string;name:string;color:string;sign:CityBakeSign}[];excluded:ReadonlySet<string>}){
 const atlas=useMemo(()=>new SignAtlas(),[]);
 useEffect(()=>()=>atlas.dispose(),[atlas]);
 const content=signs.map(s=>`${s.id}\u0000${s.name}\u0000${s.color}`).join('\u0001');
 const [pageCount,setPageCount]=useState(0);
 useLayoutEffect(()=>{atlas.update(signs);setPageCount(atlas.pages.length);},[content]);// eslint-disable-line react-hooks/exhaustive-deps
 const placement=signs.map(s=>`${s.id}:${s.sign.x.toFixed(3)}:${s.sign.y.toFixed(3)}:${s.sign.z.toFixed(3)}:${s.sign.angle.toFixed(4)}:${s.sign.width.toFixed(3)}`).join('|')+'#'+[...excluded].sort().join('|')+'#'+content;
 const geometries=useMemo(()=>atlas.pages.slice(0,pageCount).map((_,page)=>{
  const list=signs.filter(s=>atlas.cells.get(s.id)?.page===page&&!excluded.has(s.id)),positions=new Float32Array(list.length*12),uvs=new Float32Array(list.length*8),normals=new Float32Array(list.length*12),indices=new Uint32Array(list.length*6);
  list.forEach((s,i)=>{
   const {x,y,z,angle,width,height}=s.sign,rx=Math.cos(angle)*width/2,rz=-Math.sin(angle)*width/2,h=height/2,cell=atlas.cells.get(s.id)!.cell,u0=(cell%COLS)*CELL.w/CELL.page,u1=u0+CELL.w/CELL.page,v1=1-Math.floor(cell/COLS)*CELL.h/CELL.page,v0=v1-CELL.h/CELL.page;
   // Corners as PlaneGeometry (top-left, top-right, bottom-left, bottom-right); the plane faces the sign's angle.
   positions.set([x-rx,y+h,z-rz,x+rx,y+h,z+rz,x-rx,y-h,z-rz,x+rx,y-h,z+rz],i*12);uvs.set([u0,v1,u1,v1,u0,v0,u1,v0],i*8);
   for(let k=0;k<4;k++)normals.set([Math.sin(angle),0,Math.cos(angle)],i*12+k*3);
   const b=i*4;indices.set([b,b+2,b+1,b+2,b+3,b+1],i*6);
  });
  cityGwStats.signRebuilds++;const g=new BufferGeometry();g.setAttribute('position',new BufferAttribute(positions,3));g.setAttribute('normal',new BufferAttribute(normals,3));g.setAttribute('uv',new BufferAttribute(uvs,2));g.setIndex(new BufferAttribute(indices,1));g.computeBoundingSphere();return g;
 }),[atlas,pageCount,placement]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries]);
 return <group name="city-sculpt-signs">{geometries.map((g,i)=><mesh key={i} geometry={g} material={atlas.pages[i].material} dispose={null}/>)}</group>;
}
