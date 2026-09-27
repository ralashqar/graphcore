import {resolveSculpt} from '../../domain/citySculpt.ts';
import {buildStudioDetailBatches,detailTransferables,withoutDetailGeometry} from '../../domain/cityStudioDetailBatches.ts';
import {buildSculptCityBake,cityBakeTransferables,type CityPlotTransform} from '../../domain/citySculptCityBake.ts';
import type {CityBuildingDesignV3} from '../../domain/cityBuildingV3.ts';
import type {SculptRecipe} from '../../domain/citySculpt.ts';
import type {StudioResolved} from '../../domain/cityStudioTypes.ts';
import type {StudioOpeningInstances} from '../../domain/cityStudioOpeningPieces.ts';
import {FACE_CACHE,faceCacheStats} from '../../domain/cityStudioFaceCache.ts';
import {OPENING_INSTANCING} from '../../domain/cityStudioFreeOpeningGeometry.ts';
/** `flags`: measurement switches from the page URL (?cityOpenings=0, ?cityFaceCache=0), see citySculptService. */
type Message={id:number;recipe:SculptRecipe;design:CityBuildingDesignV3;kind?:'city';transform?:CityPlotTransform;signName?:string;flags?:{openings:boolean;faceCache:boolean}};
/** What the city keeps of a finished plot's studio result: no geometry (the bake has it), collision and kit data only. */
const cityStudio=(s:StudioResolved):StudioResolved=>({...withoutDetailGeometry(s),roofPatches:undefined,roofEdges:undefined,roof:[]});
// Canonical opening pieces go to the main thread once per worker (its registry keeps them; same key, same geometry).
const sentPieces=new Set<string>();
const unsentPieces=<T extends {openings?:StudioOpeningInstances}>(o:T|undefined):T|undefined=>{
 if(!o?.openings)return o;const pieces=o.openings.pieces.filter(p=>!sentPieces.has(p.key));pieces.forEach(p=>sentPieces.add(p.key));return {...o,openings:{...o.openings,pieces}};};
// Face cache hits and misses since the previous reply (cityStudioFaceCache), for the city's load statistics.
let reported={hits:0,misses:0};
const cacheDelta=()=>{const s=faceCacheStats(),d={hits:s.hits-reported.hits,misses:s.misses-reported.misses};reported={hits:s.hits,misses:s.misses};return d;};
// Generated studio detail (free faces, roof openings) is merged per material here and transferred, not
// copied; the per-face buffers it replaces are dropped from the posted result. City plots (`kind: 'city'`)
// get a world-space bake instead (citySculptCityBake), also transferred.
self.onmessage=(event:MessageEvent<Message>)=>{
 const {id,recipe,design,flags}=event.data;
 if(flags){OPENING_INSTANCING.enabled=flags.openings;FACE_CACHE.enabled=flags.faceCache;}
 try{
  const started=performance.now(),resolved=resolveSculpt(recipe,design),resolveMs=performance.now()-started;
  const details=resolved.studio&&(resolved.studio.freeFaces?.length||resolved.studio.roofOpenings?.length)?buildStudioDetailBatches(resolved.studio):undefined;
  if(event.data.kind==='city'){
   if(!resolved.studio)throw new Error('Only studio buildings are prepared for the city batches.');
   const volumeRoofTextures=recipe.version===4||recipe.version===5||recipe.version===6?Object.fromEntries(recipe.volumes.map(v=>[v.id,v.roofTexture])):{};
   const bake=unsentPieces(buildSculptCityBake(resolved,details,{design,transform:event.data.transform!,volumeRoofTextures,signName:event.data.signName}))!;
   (self as unknown as Worker).postMessage({id,city:{studio:cityStudio(resolved.studio),bake,timing:{resolveMs,bakeMs:performance.now()-started-resolveMs,faces:cacheDelta()}}},cityBakeTransferables(bake));
   return;
  }
  const result=details&&resolved.studio?{...resolved,studio:withoutDetailGeometry(resolved.studio)}:resolved;
  (self as unknown as Worker).postMessage({id,result,details:unsentPieces(details),timing:{resolveMs,mergeMs:performance.now()-started-resolveMs,faces:cacheDelta()}},details?detailTransferables(details):[]);
 }catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};
