import type {SculptRecipe,SculptResolved} from '../../domain/citySculpt';
import type {CityBuildingDesignV3} from '../../domain/cityBuildingV3';
import type {StudioDetailBatches} from '../../domain/cityStudioDetailBatches';
import type {StudioResolved} from '../../domain/cityStudioTypes';
import type {CityPlotTransform,SculptCityBake} from '../../domain/citySculptCityBake';
/** Worker result plus the merged, transferred studio detail batches (the cache keeps the only copy). */
export type PreparedSculpt=SculptResolved&{details?:StudioDetailBatches;timing?:{resolveMs:number;mergeMs:number}};
/** City-scale preparation of a finished studio plot: the studio result without geometry (collision, doors, kit
 * pieces) and the world-space bake (citySculptCityBake), both transferred. */
export type PreparedSculptCity={studio:StudioResolved;bake:SculptCityBake;timing:{resolveMs:number;bakeMs:number}};
type Request={resolve:(value:never)=>void;reject:(error:Error)=>void};
type Lane={worker?:Worker;sequence:number;pending:Map<number,Request>};
type Reply={id:number;result?:SculptResolved;details?:StudioDetailBatches;timing?:PreparedSculpt['timing'];city?:PreparedSculptCity;error?:string};
// Keep interactive preparation independent of the background city's queue.
const lanes:Lane[]=[{sequence:0,pending:new Map()},{sequence:0,pending:new Map()}];
// Finished city plots prepare on their own small pool, so a full city loads in parallel and never delays the studio.
const cityLanes:Lane[]=Array.from({length:Math.max(1,Math.min(3,(typeof navigator!=='undefined'&&navigator.hardwareConcurrency||4)-2))},()=>({sequence:0,pending:new Map()}));
const cached=new Map<string,PreparedSculpt>(),inflight=new Map<string,Promise<PreparedSculpt>>();
function getWorker(lane:Lane){
 if(!lane.worker){
  const worker=new Worker(new URL('./citySculpt.worker.ts',import.meta.url),{type:'module'});lane.worker=worker;
  worker.onmessage=(event:MessageEvent<Reply>)=>{
   const request=lane.pending.get(event.data.id);if(!request)return;lane.pending.delete(event.data.id);
   const {result,details,timing,city}=event.data;
   if(city)request.resolve(city as never);
   else if(result)request.resolve((details||timing?{...result,...(details?{details}:{}),...(timing?{timing}:{})}:result) as never);else request.reject(new Error(event.data.error||'Sculpt preparation failed.'));
  };
  worker.onerror=()=>{for(const request of lane.pending.values())request.reject(new Error('Sculpt preparation failed.'));lane.pending.clear();worker.terminate();lane.worker=undefined;};
 }return lane.worker;
}
function post<T>(lane:Lane,message:Record<string,unknown>){return new Promise<T>((resolve,reject)=>{const id=++lane.sequence;try{const worker=getWorker(lane);lane.pending.set(id,{resolve:resolve as (value:never)=>void,reject});worker.postMessage({id,...message});}catch(error){lane.pending.delete(id);reject(error);}});}
export function prepareSculpt(recipe:SculptRecipe,design:CityBuildingDesignV3,interactive=false){
 const key=JSON.stringify([recipe,design]),previous=cached.get(key);if(previous)return Promise.resolve(previous);
 const requestKey=`${interactive}:${key}`,existing=inflight.get(requestKey);if(existing)return existing;
 const task=post<PreparedSculpt>(lanes[interactive?1:0],{recipe,design}).then(result=>{cached.set(key,result);while(cached.size>32)cached.delete(cached.keys().next().value!);return result;}).finally(()=>inflight.delete(requestKey));
 inflight.set(requestKey,task);return task;
}
/** Not cached here: the caller (CitySculptCity) keeps the one copy per plot. */
export function prepareSculptCity(recipe:SculptRecipe,design:CityBuildingDesignV3,transform:CityPlotTransform,signName:string){
 const lane=cityLanes.reduce((a,b)=>b.pending.size<a.pending.size?b:a);
 return post<PreparedSculptCity>(lane,{kind:'city',recipe,design,transform,signName});
}
