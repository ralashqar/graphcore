import {useEffect,useState,useMemo,useRef} from "react";
import type {CityProperty} from "../../domain/city";
import {adoptCityDesign,cityDesignKey,cachedCityDesign,hasCityDesign,storeCityDesign,hasCitySigns,storeCitySigns,cachedCitySigns} from "./cityDesignCache";
import {CITY_LIGHT_MODE} from "./cityRenderMode";
/** Worker resolves recipes; the renderer still owns instancing and GPU resources.
 * Ordinary city loading retains its fallback; interactive editors report errors instead of blocking the UI. */
export type CityPreparationStatus={pending:boolean;error:string|null};
export type CityPreparationOptions={retry:number;onStatus:(status:CityPreparationStatus)=>void};
export function usePreparedCity(properties:CityProperty[],enabled:boolean,preview=false,retainWhilePreparing=false,options?:CityPreparationOptions){
 const warmWorker=useRef<Worker|null>(null);
 useEffect(()=>()=>{warmWorker.current?.terminate();warmWorker.current=null;},[]);
 const statusCallback=useRef(options?.onStatus);statusCallback.current=options?.onStatus;
 const [ready,setReady]=useState<CityProperty[]>([]);
  const levelsFor=(design:NonNullable<CityProperty["profile"]["buildingDesign"]>)=>{
    const lod=preview && design.version===3 && ["city-connected-3","city-office-4"].includes(design.generatorRevision)?"near" as const:"medium" as const;
    return CITY_LIGHT_MODE?[{lod,simple:true},{lod:"far" as const,simple:true}]:preview?[{lod:"near" as const,simple:false},{lod:"far" as const,simple:false}]:[{lod:"near" as const,simple:false},{lod:"medium" as const,simple:true},{lod:"far" as const,simple:false}];
  };

 const previous=useRef<CityProperty[]>([]);
 useMemo(()=>{
  const before=new Map(previous.current.map(p=>[p.id,p]));
  for(const p of properties){
   const old=before.get(p.id),a=old?.profile.buildingDesign,b=p.profile.buildingDesign;
   if(a&&b&&a.version!==1&&b.version!==1&&old?.profile.color===p.profile.color)adoptCityDesign(a,b,p.profile.color);
  }
  previous.current=properties;
 },[properties]);
 // Autosave/profile object refreshes must not cancel an identical in-flight recipe.
 const preparationKey=JSON.stringify(properties.map(p=>[p.id,p.profile.buildingDesign,p.profile.color,!!p.profile.buildingArt]));
 useEffect(()=>{
  const status=(pending:boolean,error:string|null=null)=>statusCallback.current?.({pending,error});
  if(!enabled){setReady(properties);return;}
  let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
  const seen=new Set<string>();
  const jobs=properties.flatMap(p=>{
   const design=p.profile.buildingDesign;
   if(!design||design.version===1||p.profile.buildingArt)return [];
   return levelsFor(design).filter(l=>!(l.lod==="far"?hasCitySigns(design,p.profile.color,l.simple):hasCityDesign(design,p.profile.color,l.lod,l.simple))).map(l=>({design,brand:p.profile.color,...l}));
  }).filter(job=>{const key=cityDesignKey(job.design,job.brand,job.lod,job.simple);if(seen.has(key))return false;seen.add(key);return true;});
  if(!jobs.length){setReady(properties);status(false);return;}
  status(true);
  let publishedAt=0;
  const publish=()=>{
   if(cancelled||performance.now()-publishedAt<3000)return;
   publishedAt=performance.now();
   setReady(properties.filter(p=>{const d=p.profile.buildingDesign;if(!d||d.version===1||p.profile.buildingArt)return true;return levelsFor(d).every(j=>j.lod==="far"?hasCitySigns(d,p.profile.color,j.simple):hasCityDesign(d,p.profile.color,j.lod,j.simple));}));
  };
  let worker:Worker|undefined,watchdog:ReturnType<typeof setTimeout>|undefined;
  let fallingBack=false,completed=false;
  const done=()=>{completed=true;if(watchdog)clearTimeout(watchdog);if(!cancelled){setReady(properties);status(false);}};
  const fallback=()=>{
   if(options){warmWorker.current=null;fallingBack=true;if(watchdog)clearTimeout(watchdog);worker?.terminate();if(!cancelled)status(false,'Building preparation failed. Your previous building is still available.');return;}
   if(fallingBack||cancelled)return;fallingBack=true;if(watchdog)clearTimeout(watchdog);
   worker?.terminate();let index=0;
   const next=()=>{if(cancelled)return;const job=jobs[index++];if(!job){done();return;}(job.lod==="far"?cachedCitySigns(job.design,job.brand,job.simple):cachedCityDesign(job.design,job.brand,job.lod,job.simple));publish();timer=setTimeout(next,0);};
   next();
  };
  try{
   worker=(options?warmWorker.current:null)||new Worker(new URL("./cityDesign.worker.ts",import.meta.url),{type:"module"});
   if(options)warmWorker.current=worker;
   worker.onmessage=event=>{
    if(cancelled||fallingBack)return;
    if(watchdog)clearTimeout(watchdog);watchdog=setTimeout(fallback,15000);
    if(event.data.error){fallback();return;}
    if(event.data.done){if(!options)worker?.terminate();done();return;}
    const job=jobs[event.data.index];
    if(job.lod==="far")storeCitySigns(job.design,job.brand,job.simple,event.data.result);
    else storeCityDesign(job.design,job.brand,job.lod,job.simple,event.data.result);
    publish();
   };
   worker.onerror=event=>{event.preventDefault();fallback();};
   watchdog=setTimeout(fallback,15000);
   worker.postMessage({id:1,jobs});
  }catch{fallback();}
  return ()=>{cancelled=true;if(!options||!completed){worker?.terminate();if(warmWorker.current===worker)warmWorker.current=null;}if(timer)clearTimeout(timer);if(watchdog)clearTimeout(watchdog);};
 },[preparationKey,enabled,preview,options?.retry]);
 // Interactive construction may retain its last ready recipe during worker preparation.
 const lastReady=useRef(new Map<string,CityProperty>());
 const prepared=useMemo(()=>enabled?properties.filter(p=>{
  const d=p.profile.buildingDesign;
  if(!d||d.version===1||p.profile.buildingArt)return true;
  return levelsFor(d).every(j=>j.lod==="far"?hasCitySigns(d,p.profile.color,j.simple):hasCityDesign(d,p.profile.color,j.lod,j.simple));
 }):properties,[enabled,ready,properties,preview]);
 const displayed=useMemo(()=>{
  if(!retainWhilePreparing)return prepared;
  const current=new Map(prepared.map(p=>[p.id,p]));
  return properties.flatMap(p=>{const ready=current.get(p.id)||lastReady.current.get(p.id);return ready?[ready]:[];});
 },[prepared,properties,retainWhilePreparing]);
 useEffect(()=>{lastReady.current=new Map(displayed.map(p=>[p.id,p]));},[displayed]);
 return displayed;
}
