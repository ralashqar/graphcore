import catalogue from '../../public/city/synarc-kit/v2/catalogue.json' with {type:'json'};
import type {StudioFamily} from './cityStudioTypes.ts';

export const STUDIO_MODULES = catalogue.parts;
export const STUDIO_MODULE_MAP = new Map(STUDIO_MODULES.map(part => [part.id, part]));
export const STUDIO_FAMILIES: Record<StudioFamily, {label: string; wall: string; trim: string; frame: string; door: string; glass: string}> = {
 'warm-brick': {label:'Warm brick',wall:'#af7057',trim:'#e0cba7',frame:'#4d5647',door:'#4c6456',glass:'#537779'},
 'pastel-stucco': {label:'Pastel stucco',wall:'#bdc8ad',trim:'#f0e6cf',frame:'#5d7163',door:'#546f64',glass:'#64858a'},
 'pale-limestone': {label:'Pale limestone',wall:'#d8cbb2',trim:'#eee1c7',frame:'#565c59',door:'#5d6665',glass:'#618088'},
};
export const STUDIO_COLORS = ['#ddd0b8','#b8c4a6','#dba995','#a6bec6','#c5b8c6','#b07858','#677b6d','#454e4d'];
