// Surface brush state (docs/city-surfaces.md): the pattern and its parameters layered on the studio brush colour and
// texture. `regionFinish` feeds generated-wall strokes, bands and fills (soft edge, fade); `tileFinish` feeds kit
// tiles, whole walls/parts and building-wide rules (no stroke-only fields). Recents persist per device.
import {useCallback,useMemo,useState,useSyncExternalStore} from 'react';
import {brushSurface,finishId,matchFinish,pushRecent,tileFinish as stripStroke,type FadeBrush,type StudioFloorSurface,type SurfaceParams} from '../../../domain/cityStudioSurfaces';
import {LEGACY_TEXTURE_PATTERN,surfacePattern,type SurfacePatternId} from '../../../domain/citySurfacePatterns';
import type {CityTextureId} from '../../../domain/cityTexturePresets';
import type {StudioFinish} from '../../../domain/cityStudioTypes';

export type StencilBrush={direction:'horizontal'|'vertical';width:number;gap:number};
const DEFAULTS:SurfaceParams={scale:1,rotation:0,wear:0,painted:0,soft:0};
const RECENTS_KEY='city-studio-surface-recents-v1';
function loadRecents():StudioFinish[]{try{const v=JSON.parse(globalThis.localStorage?.getItem(RECENTS_KEY)??'[]');return Array.isArray(v)?v.slice(0,10):[];}catch{return [];}}
function saveRecents(list:StudioFinish[]){try{globalThis.localStorage?.setItem(RECENTS_KEY,JSON.stringify(list));}catch{/* private mode */}}

export function useSurfaceBrush(){
 const [pattern,setPatternState]=useState<SurfacePatternId|null>(null),[params,setParams]=useState<SurfaceParams>(DEFAULTS);
 const [fade,setFade]=useState<FadeBrush|null>(null),[stencil,setStencil]=useState<StencilBrush|null>(null),[recents,setRecents]=useState<StudioFinish[]>(loadRecents);
 const setParam=useCallback(<K extends keyof SurfaceParams>(key:K,value:SurfaceParams[K])=>setParams(p=>({...p,[key]:value})),[]);
 /** Region finish (strokes, bands, fills on generated walls). A legacy texture with tuned parameters becomes its CC0 pattern. */
 const regionFinish=useCallback((color:string,texture:string):StudioFinish=>{
  const tuned=params.scale!==1||!!params.rotation||!!params.wear||!!params.painted||!!params.soft||!!fade,id=pattern??(tuned?LEGACY_TEXTURE_PATTERN[texture as CityTextureId]??(texture===''?'paint-smooth':null):null);
  if(!id)return texture?{color,texture}:{color};
  return {color,surface:brushSurface(id,params,fade)};
 },[pattern,params,fade]);
 const tileFinish=useCallback((color:string,texture:string)=>stripStroke(regionFinish(color,texture)),[regionFinish]);
 /** Library pick: the pattern and its default tint (returned so the brush colour follows). */
 const choosePattern=useCallback((id:SurfacePatternId|null)=>{setPatternState(id);setParams(p=>({...p,accent:undefined}));return id?surfacePattern(id)!.tint:null;},[]);
 /** Eyedropper / recents: material, colour and scale from a finish. Returns the colour and texture to set. */
 const adopt=useCallback((f:StudioFinish|undefined,fallback:string)=>{
  const m=matchFinish(f,fallback);
  if(m.surface){const s=m.surface;setPatternState(s.pattern);setParams({accent:s.accent,scale:s.scale??1,rotation:s.rotation??0,wear:s.wear??0,painted:s.painted??0,soft:params.soft});}
  else{setPatternState(null);setParams(p=>({...DEFAULTS,soft:p.soft}));}
  return {color:m.color,texture:m.texture};
 },[params.soft]);
 const remember=useCallback((f:StudioFinish)=>setRecents(list=>{const next=pushRecent(list,stripStroke(f),finishId,10);saveRecents(next);return next;}),[]);
 const reset=useCallback(()=>{setParams(DEFAULTS);setFade(null);setStencil(null);},[]);
 return useMemo(()=>({pattern,params,setParam,fade,setFade,stencil,setStencil,recents,regionFinish,tileFinish,choosePattern,adopt,remember,reset}),[pattern,params,setParam,fade,stencil,recents,regionFinish,tileFinish,choosePattern,adopt,remember,reset]);
}
export type SurfaceBrush=ReturnType<typeof useSurfaceBrush>;

// ---- Floor brush (Rooms): the surface to paint and whether clicking rooms paints them ------------------------------
type FloorBrushState={surface:StudioFloorSurface;armed:boolean};
let floorBrush:FloorBrushState={surface:{pattern:'timber-planks',color:surfacePattern('timber-planks')!.tint},armed:false};
const floorListeners=new Set<()=>void>();
export function setFloorBrush(patch:Partial<FloorBrushState>){floorBrush={...floorBrush,...patch};floorListeners.forEach(f=>f());}
export function useFloorBrush(){return useSyncExternalStore(f=>{floorListeners.add(f);return()=>{floorListeners.delete(f);};},()=>floorBrush,()=>floorBrush);}
