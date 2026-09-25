import catalogue from '../../public/city/synarc-kit/v2/catalogue.json' with {type:'json'};
import catalogueV3 from '../../public/city/synarc-kit/v3/catalogue.json' with {type:'json'};
import catalogueV4 from '../../public/city/synarc-kit/v4/catalogue.json' with {type:'json'};
import catalogueV5 from '../../public/city/synarc-kit/v5/catalogue.json' with {type:'json'};
import type {StudioFamily} from './cityStudioTypes.ts';

export const STUDIO_MODULES = catalogue.parts;
export const STUDIO_MODULES_V3 = catalogueV3.parts;
export const STUDIO_MODULES_V4 = catalogueV4.parts;
export const STUDIO_MODULES_V5 = catalogueV5.parts;
export type StudioModule = typeof catalogueV3.parts[number] & {baySpan?:number};
export const STUDIO_MODULE_MAP = new Map<string,StudioModule>(STUDIO_MODULES_V5.map(part => [part.id, part as StudioModule]));
export const studioModules=(version:2|3|4|5)=>version===5?STUDIO_MODULES_V5:version===4?STUDIO_MODULES_V4:version===3?STUDIO_MODULES_V3:STUDIO_MODULES;
export const studioKitVersion=(catalogue:string|undefined):2|3|4|5=>catalogue==='synarc-kit-5'?5:catalogue==='synarc-kit-4'?4:catalogue==='synarc-kit-3'?3:2;
export const studioModuleAvailable=(catalogue:string,id:string)=>studioModules(studioKitVersion(catalogue)).some(p=>p.id===id);
export const STUDIO_FAMILIES: Record<StudioFamily, {label: string; wall: string; trim: string; frame: string; door: string; glass: string}> = {
 'warm-brick': {label:'Warm brick',wall:'#af7057',trim:'#e0cba7',frame:'#4d5647',door:'#4c6456',glass:'#537779'},
 'pastel-stucco': {label:'Pastel stucco',wall:'#bdc8ad',trim:'#f0e6cf',frame:'#5d7163',door:'#546f64',glass:'#64858a'},
 'pale-limestone': {label:'Pale limestone',wall:'#d8cbb2',trim:'#eee1c7',frame:'#565c59',door:'#5d6665',glass:'#618088'},
};
export const STUDIO_COLORS = ['#ddd0b8','#b8c4a6','#dba995','#a6bec6','#c5b8c6','#b07858','#677b6d','#454e4d'];
