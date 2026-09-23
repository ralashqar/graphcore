import type {SculptRecipe,SculptResolved} from '../../domain/citySculpt';
import type {CityBuildingDesignV3} from '../../domain/cityBuildingV3';
let worker:Worker|undefined,sequence=0;
const pending=new Map<number,{resolve:(value:SculptResolved)=>void;reject:(error:Error)=>void}>();
function getWorker(){
 if(!worker){
  worker=new Worker(new URL('./citySculpt.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent<{id:number;result?:SculptResolved;error?:string}>)=>{
   const request=pending.get(event.data.id);if(!request)return;pending.delete(event.data.id);
   if(event.data.result)request.resolve(event.data.result);else request.reject(new Error(event.data.error||'Sculpt preparation failed.'));
  };
  worker.onerror=()=>{for(const request of pending.values())request.reject(new Error('Sculpt preparation failed.'));pending.clear();worker?.terminate();worker=undefined;};
 }
 return worker;
}
export function prepareSculpt(recipe:SculptRecipe,design:CityBuildingDesignV3){
 return new Promise<SculptResolved>((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});getWorker().postMessage({id,recipe,design});});
}
