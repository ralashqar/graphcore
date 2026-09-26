import type {SculptRecipe,SculptResolved} from '../../domain/citySculpt';
import type {CityBuildingDesignV3} from '../../domain/cityBuildingV3';
import type {StudioDetailBatches} from '../../domain/cityStudioDetailBatches';
/** Worker result plus the merged, transferred studio detail batches (the cache keeps the only copy). */
export type PreparedSculpt=SculptResolved&{details?:StudioDetailBatches;timing?:{resolveMs:number;mergeMs:number}};
type Request={resolve:(value:PreparedSculpt)=>void;reject:(error:Error)=>void};
type Lane={worker?:Worker;sequence:number;pending:Map<number,Request>};
// Keep interactive preparation independent of the background city's queue.
const lanes:Lane[]=[{sequence:0,pending:new Map()},{sequence:0,pending:new Map()}];
const cached=new Map<string,PreparedSculpt>(),inflight=new Map<string,Promise<PreparedSculpt>>();
function getWorker(lane:Lane){
 if(!lane.worker){
  const worker=new Worker(new URL('./citySculpt.worker.ts',import.meta.url),{type:'module'});lane.worker=worker;
  worker.onmessage=(event:MessageEvent<{id:number;result?:SculptResolved;details?:StudioDetailBatches;timing?:PreparedSculpt['timing'];error?:string}>)=>{
   const request=lane.pending.get(event.data.id);if(!request)return;lane.pending.delete(event.data.id);
   const {result,details,timing}=event.data;
   if(result)request.resolve(details||timing?{...result,...(details?{details}:{}),...(timing?{timing}:{})}:result);else request.reject(new Error(event.data.error||'Sculpt preparation failed.'));
  };
  worker.onerror=()=>{for(const request of lane.pending.values())request.reject(new Error('Sculpt preparation failed.'));lane.pending.clear();worker.terminate();lane.worker=undefined;};
 }return lane.worker;
}
export function prepareSculpt(recipe:SculptRecipe,design:CityBuildingDesignV3,interactive=false){
 const key=JSON.stringify([recipe,design]),previous=cached.get(key);if(previous)return Promise.resolve(previous);
 const requestKey=`${interactive}:${key}`,existing=inflight.get(requestKey);if(existing)return existing;
 const lane=lanes[interactive?1:0];
 const task=new Promise<PreparedSculpt>((resolve,reject)=>{const id=++lane.sequence;try{const worker=getWorker(lane);lane.pending.set(id,{resolve,reject});worker.postMessage({id,recipe,design});}catch(error){lane.pending.delete(id);reject(error);}}).then(result=>{cached.set(key,result);while(cached.size>32)cached.delete(cached.keys().next().value!);return result;}).finally(()=>inflight.delete(requestKey));
 inflight.set(requestKey,task);return task;
}
