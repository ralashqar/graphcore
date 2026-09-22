import {useEffect,useState,useMemo} from "react";
import type {CityProperty} from "../../domain/city";
import {cachedCityDesign,hasCityDesign,storeCityDesign,hasCitySigns,storeCitySigns,cachedCitySigns} from "./cityDesignCache";
import {CITY_LIGHT_MODE} from "./cityRenderMode";
/** Worker resolves recipes; the renderer still owns instancing and GPU resources.
 * A failed worker falls back to one bounded recipe job per event-loop turn. */
export function usePreparedCity(properties:CityProperty[],enabled:boolean){
 const [ready,setReady]=useState<CityProperty[]>([]);
 useEffect(()=>{
  if(!enabled){setReady(properties);return;}
  let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
  const jobs=properties.flatMap(p=>{
   const design=p.profile.buildingDesign;
   if(!design||design.version===1||p.profile.buildingArt)return [];
   const levels= CITY_LIGHT_MODE ? [{lod:"medium" as const,simple:true},{lod:"far" as const,simple:true}] : [{lod:"near" as const,simple:false},{lod:"medium" as const,simple:true},{lod:"far" as const,simple:false}];
   return levels.filter(l=>!(l.lod==="far"?hasCitySigns(design,p.profile.color,l.simple):hasCityDesign(design,p.profile.color,l.lod,l.simple))).map(l=>({design,brand:p.profile.color,...l}));
  });
  if(!jobs.length){setReady(properties);return;}
  let worker:Worker|undefined,watchdog:ReturnType<typeof setTimeout>|undefined;
  let fallingBack=false;
  const done=()=>{if(watchdog)clearTimeout(watchdog);if(!cancelled)setReady(properties);};
  const fallback=()=>{
   if(fallingBack||cancelled)return;fallingBack=true;if(watchdog)clearTimeout(watchdog);
   worker?.terminate();let index=0;
   const next=()=>{if(cancelled)return;const job=jobs[index++];if(!job){done();return;}(job.lod==="far"?cachedCitySigns(job.design,job.brand,job.simple):cachedCityDesign(job.design,job.brand,job.lod,job.simple));timer=setTimeout(next,0);};
   next();
  };
  try{
   worker=new Worker(new URL("./cityDesign.worker.ts",import.meta.url),{type:"module"});
   worker.onmessage=event=>{
    if(cancelled||fallingBack)return;
    if(watchdog)clearTimeout(watchdog);watchdog=setTimeout(fallback,15000);
    if(event.data.error){fallback();return;}
    if(event.data.done){worker?.terminate();done();return;}
    const job=jobs[event.data.index];
    if(job.lod==="far")storeCitySigns(job.design,job.brand,job.simple,event.data.result);
    else storeCityDesign(job.design,job.brand,job.lod,job.simple,event.data.result);
   };
   worker.onerror=event=>{event.preventDefault();fallback();};
   watchdog=setTimeout(fallback,15000);
   worker.postMessage({id:1,jobs});
  }catch{fallback();}
  return ()=>{cancelled=true;worker?.terminate();if(timer)clearTimeout(timer);if(watchdog)clearTimeout(watchdog);};
 },[properties,enabled]);
 // Never display an earlier recipe or a removed business while an edit resolves.
 return useMemo(()=>enabled?ready.filter(p=>properties.includes(p)):properties,[enabled,ready,properties]);
}
