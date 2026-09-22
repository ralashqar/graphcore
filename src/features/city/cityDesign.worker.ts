import {extractCitySigns} from "./cityDesignCache.ts";
import { resolveCurrent } from "../../domain/cityBuildingV3.ts";
self.onmessage=(event:MessageEvent)=>{
 const {id,jobs}=event.data;
 try {
  jobs.forEach((job:{design:Parameters<typeof resolveCurrent>[0];brand:string;lod:"near"|"medium"|"far";simple:boolean},index:number)=>{
   const result=resolveCurrent(job.simple?{...job.design,finish:"procedural"}:job.design,job.brand,job.lod);
   self.postMessage({id,index,result:job.lod==="far"?extractCitySigns(result):result});
  });
  self.postMessage({id,done:true});
 } catch(error){self.postMessage({id,error:String(error)});}
};
