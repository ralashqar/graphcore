import catalogue from '../../public/city/synarc-kit/v2/catalogue.json' with {type:'json'};
import catalogueV3 from '../../public/city/synarc-kit/v3/catalogue.json' with {type:'json'};
import catalogueV4 from '../../public/city/synarc-kit/v4/catalogue.json' with {type:'json'};
import catalogueV5 from '../../public/city/synarc-kit/v5/catalogue.json' with {type:'json'};
import catalogueTokyo from '../../public/city/tokyo-kit/v1/catalogue.json' with {type:'json'};
import catalogueStorefront from '../../public/city/storefront-kit/v1/catalogue.json' with {type:'json'};
import type {StudioFamily} from './cityStudioTypes.ts';

export const STUDIO_MODULES = catalogue.parts;
export const STUDIO_MODULES_V3 = catalogueV3.parts;
export const STUDIO_MODULES_V4 = catalogueV4.parts;
/** The shared (business) v5 catalogue: business variation pools and validators read only this list. */
export const STUDIO_MODULES_V5 = catalogueV5.parts;
/**
 * Tokyo pack (docs/city-tokyo-kit.md): extra modules loaded beside kit v5 (public/city/tokyo-kit/v1). Local studio
 * only: it joins the construction studio's v5 catalogue (studioModules(5), STUDIO_MODULE_MAP) but never the shared
 * business list above, and validateModularBuilding rejects its ids.
 */
export const STUDIO_MODULES_TOKYO = catalogueTokyo.parts as unknown as typeof STUDIO_MODULES_V5;
export const TOKYO_MODULE_IDS:ReadonlySet<string> = new Set(STUDIO_MODULES_TOKYO.map(part=>part.id));
/**
 * Storefront pack (docs/city-storefront-kit.md): shopfront sections, awnings, fascias, signs and street objects,
 * served from public/city/storefront-kit/v1 and loaded only when a building uses one of its pieces. Studio only,
 * like the Tokyo pack: business validators reject its ids.
 */
export const STUDIO_MODULES_STOREFRONT = catalogueStorefront.parts as unknown as typeof STUDIO_MODULES_V5;
export const STOREFRONT_MODULE_IDS:ReadonlySet<string> = new Set(STUDIO_MODULES_STOREFRONT.map(part=>part.id));
/** Street styles of the storefront pack (and the studio's style filter). */
export type StorefrontStyle='new-york'|'paris'|'london'|'italian'|'tokyo'|'modern';
/** Street object placement (storefront pack): stands on the ground storey, 0-1.5 m in front of the wall. */
export type StreetModule={doorSafe:boolean;obstacles:[x0:number,x1:number,z0:number,z1:number,height:number][]};
type StorefrontPart={id:string;style?:StorefrontStyle;mount?:string;doorSafe?:boolean;obstacles?:StreetModule['obstacles']};
const STOREFRONT_PARTS=new Map((catalogueStorefront.parts as StorefrontPart[]).map(p=>[p.id,p]));
/** The street style of a storefront-pack module, or null for any other module. */
export const storefrontModuleStyle=(id:string):StorefrontStyle|null=>STOREFRONT_PARTS.get(id)?.style??null;
/** Ground-mounted street object spec (A-frames, café tables, crates...), or null. */
export function streetModule(id:string):StreetModule|null{const p=STOREFRONT_PARTS.get(id);return p?.mount==='ground'?{doorSafe:!!p.doorSafe,obstacles:p.obstacles??[]}:null;}
/** Pieces clear of this half-width around a door bay's centre line keep the entrance path open (door-safe objects). */
export const STREET_ENTRANCE_CLEAR=.55;
/** The construction studio's v5 catalogue: the shared v5 modules plus the Tokyo and storefront packs. */
export const STUDIO_MODULES_V5_STUDIO = [...STUDIO_MODULES_V5,...STUDIO_MODULES_TOKYO,...STUDIO_MODULES_STOREFRONT];
export type StudioModule = typeof catalogueV3.parts[number] & {baySpan?:number};
export const STUDIO_MODULE_MAP = new Map<string,StudioModule>(STUDIO_MODULES_V5_STUDIO.map(part => [part.id, part as StudioModule]));
export const studioModules=(version:2|3|4|5)=>version===5?STUDIO_MODULES_V5_STUDIO:version===4?STUDIO_MODULES_V4:version===3?STUDIO_MODULES_V3:STUDIO_MODULES;
export const studioKitVersion=(catalogue:string|undefined):2|3|4|5=>catalogue==='synarc-kit-5'?5:catalogue==='synarc-kit-4'?4:catalogue==='synarc-kit-3'?3:2;
export const studioModuleAvailable=(catalogue:string,id:string)=>studioModules(studioKitVersion(catalogue)).some(p=>p.id===id);
export const STUDIO_FAMILIES: Record<StudioFamily, {label: string; wall: string; trim: string; frame: string; door: string; glass: string}> = {
 'warm-brick': {label:'Warm brick',wall:'#af7057',trim:'#e0cba7',frame:'#4d5647',door:'#4c6456',glass:'#537779'},
 'pastel-stucco': {label:'Pastel stucco',wall:'#bdc8ad',trim:'#f0e6cf',frame:'#5d7163',door:'#546f64',glass:'#64858a'},
 'pale-limestone': {label:'Pale limestone',wall:'#d8cbb2',trim:'#eee1c7',frame:'#565c59',door:'#5d6665',glass:'#618088'},
};
export const STUDIO_COLORS = ['#ddd0b8','#b8c4a6','#dba995','#a6bec6','#c5b8c6','#b07858','#677b6d','#454e4d'];
