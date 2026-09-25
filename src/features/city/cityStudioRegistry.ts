import type {StudioCollisionPlot} from '../../domain/cityStudioCollision';
import {removeStudioDoors,resetStudioDoors} from '../../domain/cityStudioDoorState';
const plots=new Map<string,StudioCollisionPlot>();
const listeners=new Set<(id:string,p:StudioCollisionPlot|null)=>void>();
export function publishStudioPlot(p:StudioCollisionPlot){resetStudioDoors(p.id,p.result.portals??[]);plots.set(p.id,p);listeners.forEach(fn=>fn(p.id,p));}
export function removeStudioPlot(id:string){plots.delete(id);removeStudioDoors(id);listeners.forEach(fn=>fn(id,null));}
export function subscribeStudioPlots(fn:(id:string,p:StudioCollisionPlot|null)=>void){for(const p of plots.values())fn(p.id,p);listeners.add(fn);return()=>{listeners.delete(fn);};}
export function preparedStudioPlot(id:string){return plots.get(id);}
