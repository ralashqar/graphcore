import type { CityBuildingDesignV2 } from "../../domain/cityBuildingV2.ts";
import { resolveCurrent, resolveV3, type CityBuildingDesignV3 } from "../../domain/cityBuildingV3.ts";
type Design = CityBuildingDesignV2 | CityBuildingDesignV3;
const cache = new WeakMap<Design, Map<string, ReturnType<typeof resolveCurrent>>>();
/** Recipes are immutable; camera motion never invalidates their assembled geometry. */
export function cachedCityDesign(design: CityBuildingDesignV3, brand: string, lod: "near" | "medium" | "far", simple?: boolean): ReturnType<typeof resolveV3>;
export function cachedCityDesign(design: Design, brand: string, lod: "near" | "medium" | "far", simple?: boolean): ReturnType<typeof resolveCurrent>;
export function cachedCityDesign(design: Design, brand: string, lod: "near" | "medium" | "far", simple = false) {
 let entries = cache.get(design);
 if (!entries) { entries = new Map(); cache.set(design, entries); }
 const key = `${brand}:${lod}:${simple}`;
 let result = entries.get(key);
 if (!result) {
  const recipe = simple ? {...design, finish: "procedural" as const} : design;
  result = resolveCurrent(recipe, brand, lod);
  entries.set(key, result);
 }
 return result;
}

export function hasCityDesign(design:Design,brand:string,lod:string,simple:boolean){return cache.get(design)?.has(`${brand}:${lod}:${simple}`)??false;}
export function storeCityDesign(design:Design,brand:string,lod:string,simple:boolean,result:ReturnType<typeof resolveCurrent>){
 let entries=cache.get(design);if(!entries){entries=new Map();cache.set(design,entries);}
 entries.set(`${brand}:${lod}:${simple}`,result);
}

type Signs=ReturnType<typeof resolveV3>["signs"];
const signCache=new WeakMap<Design,Map<string,Signs>>();
export function extractCitySigns(result:ReturnType<typeof resolveCurrent>):Signs{return "signs" in result && Array.isArray(result.signs)?result.signs:[{...result.sign,rotation:0,campaign:false}];}
export function hasCitySigns(design:Design,brand:string,simple:boolean){return signCache.get(design)?.has(`${brand}:${simple}`)??false;}
export function storeCitySigns(design:Design,brand:string,simple:boolean,signs:Signs){let entries=signCache.get(design);if(!entries){entries=new Map();signCache.set(design,entries);}entries.set(`${brand}:${simple}`,signs);}
export function cachedCitySigns(design:Design,brand:string,simple:boolean):Signs{
 const existing=signCache.get(design)?.get(`${brand}:${simple}`);if(existing)return existing;
 const recipe=simple?{...design,finish:"procedural" as const}:design;
 const signs=extractCitySigns(resolveCurrent(recipe,brand,"far"));storeCitySigns(design,brand,simple,signs);return signs;
}
