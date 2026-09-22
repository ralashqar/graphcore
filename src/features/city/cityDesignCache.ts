import {bakeCityOcclusion,type CityBakedOcclusion} from "./CityOcclusionBake.ts";
import type { CityBuildingDesignV2 } from "../../domain/cityBuildingV2.ts";
import { resolveCurrent, resolveV3, type CityBuildingDesignV3 } from "../../domain/cityBuildingV3.ts";
type Design = CityBuildingDesignV2 | CityBuildingDesignV3;
// Bounded content caches survive refreshed object identities and share equivalent recipes.
export function cityDesignKey(design:Design,brand:string,lod:string,simple:boolean){return JSON.stringify([simple?{...design,finish:"procedural"}:design,brand,lod,simple]);}
const sharedDesigns=new Map<string,ReturnType<typeof resolveCurrent> & Partial<CityBakedOcclusion>>();
const sharedSigns=new Map<string,ReturnType<typeof resolveV3>["signs"]>();
function remember<T>(cache:Map<string,T>,key:string,value:T){cache.delete(key);cache.set(key,value);if(cache.size>256)cache.delete(cache.keys().next().value!);}
const cache = new WeakMap<Design, Map<string, (ReturnType<typeof resolveCurrent> & Partial<CityBakedOcclusion>)>>();
/** Recipes are immutable; camera motion never invalidates their assembled geometry. */
export function cachedCityDesign(design: CityBuildingDesignV3, brand: string, lod: "near" | "medium" | "far", simple?: boolean): (ReturnType<typeof resolveV3> & Partial<CityBakedOcclusion>);
export function cachedCityDesign(design: Design, brand: string, lod: "near" | "medium" | "far", simple?: boolean): (ReturnType<typeof resolveCurrent> & Partial<CityBakedOcclusion>);
export function cachedCityDesign(design: Design, brand: string, lod: "near" | "medium" | "far", simple = false) {
 let entries = cache.get(design);
 if (!entries) { entries = new Map(); cache.set(design, entries); }
 const key = `${brand}:${lod}:${simple}`;
 const sharedKey=cityDesignKey(design,brand,lod,simple);
 let result = entries.get(key) || sharedDesigns.get(sharedKey);
 if (!result) {
  const recipe = simple ? {...design, finish: "procedural" as const} : design;
  const assembled = resolveCurrent(recipe, brand, lod);
  result = {...assembled,occlusion:lod === "far"?[]:bakeCityOcclusion(assembled.parts,recipe.palette.glass)};
  remember(sharedDesigns,sharedKey,result);
 }
 entries.set(key,result);
 return result;
}

export function hasCityDesign(design:Design,brand:string,lod:string,simple:boolean){return !!(cache.get(design)?.has(`${brand}:${lod}:${simple}`)||sharedDesigns.has(cityDesignKey(design,brand,lod,simple)));}
export function storeCityDesign(design:Design,brand:string,lod:string,simple:boolean,result:(ReturnType<typeof resolveCurrent> & Partial<CityBakedOcclusion>)){
 let entries=cache.get(design);if(!entries){entries=new Map();cache.set(design,entries);}
 const sharedKey=cityDesignKey(design,brand,lod,simple);const shared=sharedDesigns.get(sharedKey)||result;remember(sharedDesigns,sharedKey,shared);entries.set(`${brand}:${lod}:${simple}`,shared);
}

type Signs=ReturnType<typeof resolveV3>["signs"];
const signCache=new WeakMap<Design,Map<string,Signs>>();
export function extractCitySigns(result:(ReturnType<typeof resolveCurrent> & Partial<CityBakedOcclusion>)):Signs{return "signs" in result && Array.isArray(result.signs)?result.signs:[{...result.sign,rotation:0,campaign:false}];}
export function hasCitySigns(design:Design,brand:string,simple:boolean){return !!(signCache.get(design)?.has(`${brand}:${simple}`)||sharedSigns.has(cityDesignKey(design,brand,"far",simple)));}
export function storeCitySigns(design:Design,brand:string,simple:boolean,signs:Signs){let entries=signCache.get(design);if(!entries){entries=new Map();signCache.set(design,entries);}entries.set(`${brand}:${simple}`,signs);remember(sharedSigns,cityDesignKey(design,brand,"far",simple),signs);}
export function cachedCitySigns(design:Design,brand:string,simple:boolean):Signs{
 const existing=signCache.get(design)?.get(`${brand}:${simple}`)||sharedSigns.get(cityDesignKey(design,brand,"far",simple));if(existing)return existing;
 const recipe=simple?{...design,finish:"procedural" as const}:design;
 const signs=extractCitySigns(resolveCurrent(recipe,brand,"far"));storeCitySigns(design,brand,simple,signs);return signs;
}

/** Preserve prepared data across equivalent server snapshots, never across edits. */
export function adoptCityDesign(previous:Design,next:Design,brand:string){
 if(previous===next)return;
 if(cityDesignKey(previous,brand,"identity",false)!==cityDesignKey(next,brand,"identity",false))return;
 const geometry=cache.get(previous);if(geometry)cache.set(next,geometry);
 const signs=signCache.get(previous);if(signs)signCache.set(next,signs);
}
