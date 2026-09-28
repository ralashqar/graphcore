// Studio surface finishes (docs/city-surfaces.md): the local-only `surface` part of a StudioFinish (walls) and the
// room / storey floor surfaces of recipe v6 interiors. Business validators reject every field here (their finish
// and interior checks allow exact keys only), so business behaviour is unchanged.
//
// Wall finish:  {color?, texture?, surface?:{pattern, accent?, scale?, rotation?, wear?, painted?, soft?, fade?}}
//   `color` tints the pattern (defaults to the family colour), `accent` colours joints, grout, chips and borders.
//   `fade` is a vertical gradient in face metres (y0 = fully `fade.color`, y1 = the finish), resolved when painted.
//   `soft` (metres) feathers a painted region's edge in stepped rings (cityStudioPaintGeometry composites them).
// Floor surface: {pattern, color?, accent?, scale?, rotation?, wear?} per room (roomFinishes[].floorSurface)
//   or per storey (interior.floorSurfaces); legacy floorFinish timber/tile/stone keep resolving as before.
// Rendering: a finish with a surface becomes a render key (`surfaceRenderKey`), which travels wherever a texture id
// travels (detail batches, city bake, kit instances) and selects one shared node material per key; every
// parameter is a uniform, so keys of one pattern share one compiled pipeline.
import {isSurfacePattern,surfacePattern,LEGACY_FLOOR_COLOR,LEGACY_FLOOR_PATTERN,LEGACY_TEXTURE_PATTERN,type SurfacePatternId} from './citySurfacePatterns.ts';
import type {CityTextureId} from './cityTexturePresets.ts';
import type {StudioFinish,StudioRecipe} from './cityStudioTypes.ts';

export type SurfaceFade={color:string;y0:number;y1:number};
export type StudioSurfaceSpec={pattern:SurfacePatternId;accent?:string;scale?:number;rotation?:number;wear?:number;painted?:number;soft?:number;fade?:SurfaceFade};
export type StudioFloorSurface={pattern:SurfacePatternId;color?:string;accent?:string;scale?:number;rotation?:number;wear?:number};
export const SURFACE_LIMITS={scale:[.25,4],rotation:[0,360],wear:[0,1],painted:[0,1],soft:[0,1.5],fadeY:[0,100]} as const;

const hex=(v:unknown):v is string=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const inRange=(v:unknown,[lo,hi]:readonly [number,number],open=false)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&(open?v<hi:v<=hi);
const only=(v:object,keys:string[])=>Object.keys(v).every(k=>keys.includes(k));

export function validSurfaceSpec(s:unknown):s is StudioSurfaceSpec{
 if(!s||typeof s!=='object'||Array.isArray(s))return false;const v=s as Record<string,unknown>;
 if(!only(v,['pattern','accent','scale','rotation','wear','painted','soft','fade'])||!isSurfacePattern(v.pattern))return false;
 if(v.accent!==undefined&&!hex(v.accent))return false;
 for(const key of ['scale','wear','painted','soft'] as const)if(v[key]!==undefined&&!inRange(v[key],SURFACE_LIMITS[key]))return false;
 if(v.rotation!==undefined&&!inRange(v.rotation,SURFACE_LIMITS.rotation,true))return false;
 if(v.fade!==undefined){const f=v.fade as Record<string,unknown>;if(!f||typeof f!=='object'||!only(f,['color','y0','y1'])||!hex(f.color)||!inRange(f.y0,SURFACE_LIMITS.fadeY)||!inRange(f.y1,SURFACE_LIMITS.fadeY)||Math.abs((f.y1 as number)-(f.y0 as number))<.05)return false;}
 return true;
}
export function validFloorSurface(s:unknown):s is StudioFloorSurface{
 if(!s||typeof s!=='object'||Array.isArray(s))return false;const v=s as Record<string,unknown>;
 if(!only(v,['pattern','color','accent','scale','rotation','wear'])||!isSurfacePattern(v.pattern)||!(surfacePattern(v.pattern)!.use as readonly string[]).includes('floor'))return false;
 if(v.color!==undefined&&!hex(v.color)||v.accent!==undefined&&!hex(v.accent))return false;
 if(v.scale!==undefined&&!inRange(v.scale,SURFACE_LIMITS.scale)||v.wear!==undefined&&!inRange(v.wear,SURFACE_LIMITS.wear)||v.rotation!==undefined&&!inRange(v.rotation,SURFACE_LIMITS.rotation,true))return false;
 return true;
}

// ---- Render keys ------------------------------------------------------------------------------------------------
/** Everything a surface material needs, with defaults applied. */
export type SurfaceRender={pattern:SurfacePatternId;tint:string;accent:string;scale:number;rotation:number;wear:number;painted:number;fade:SurfaceFade|null};
const r3=(v:number)=>Math.round(v*1000)/1000;
export const SURFACE_KEY_PREFIX='s:';
export const isSurfaceKey=(key:string|undefined|null):key is string=>typeof key==='string'&&key.startsWith(SURFACE_KEY_PREFIX);
export function encodeSurfaceKey(s:SurfaceRender):string{
 return SURFACE_KEY_PREFIX+[s.pattern,s.tint.toLowerCase(),s.accent.toLowerCase(),r3(s.scale),r3(s.rotation),r3(s.wear),r3(s.painted),s.fade?`${s.fade.color.toLowerCase()}@${r3(s.fade.y0)}@${r3(s.fade.y1)}`:''].join('|');
}
export function decodeSurfaceKey(key:string):SurfaceRender|null{
 if(!isSurfaceKey(key))return null;const [pattern,tint,accent,scale,rotation,wear,painted,fade]=key.slice(SURFACE_KEY_PREFIX.length).split('|');
 if(!isSurfacePattern(pattern)||!hex(tint)||!hex(accent))return null;const num=(v:string,d:number)=>{const n=Number(v);return Number.isFinite(n)?n:d;};
 const f=fade?fade.split('@'):null;
 return {pattern,tint,accent,scale:num(scale,1),rotation:num(rotation,0),wear:num(wear,0),painted:num(painted,0),fade:f&&hex(f[0])?{color:f[0],y0:num(f[1],0),y1:num(f[2],1)}:null};
}
export function surfaceRender(spec:Omit<StudioSurfaceSpec,'soft'>,tint:string|undefined):SurfaceRender{
 const meta=surfacePattern(spec.pattern)!;
 return {pattern:spec.pattern,tint:tint??meta.tint,accent:spec.accent??meta.accent,scale:spec.scale??1,rotation:spec.rotation??0,wear:spec.wear??0,painted:spec.painted??0,fade:spec.fade??null};
}
/**
 * Texture id or surface render key of a finish: plain finishes keep their curated texture id (old recipes render
 * exactly as before); surface finishes encode their pattern, tint (colour, else `fallbackColor`) and parameters.
 */
export function finishRenderTexture(f:StudioFinish|undefined,fallbackColor?:string):string|undefined{
 if(f?.surface&&validSurfaceSpec(f.surface))return encodeSurfaceKey(surfaceRender(f.surface,f.color??fallbackColor));
 return f?.texture;
}
export const floorRenderKey=(s:StudioFloorSurface)=>encodeSurfaceKey(surfaceRender(s,s.color));

// ---- Brush helpers ------------------------------------------------------------------------------------------------
/** Finish without region-only parts (fade, soft): kit tiles and building-wide rules. */
export function tileFinish(f:StudioFinish):StudioFinish{
 if(!f.surface)return f;const {fade:_f,soft:_s,...surface}=f.surface;void _f;void _s;return {...f,surface};
}
/** Brush fade before painting: which end carries the fade colour; resolved to face metres per stroke. */
export type FadeBrush={color:string;from:'bottom'|'top'};
/** Resolves a pending fade (negative y0, see `pendingFade`) to a region's vertical extent: bottom fades rise, top fades fall. */
export function resolveFade(f:StudioFinish,y0:number,y1:number):StudioFinish{
 const fade=f.surface?.fade;if(!fade||fade.y0>=0)return f;
 const lo=Math.max(0,Math.min(y0,y1)),hi=Math.min(100,Math.max(y0,y1,lo+.05)),top=fade.y1===-2;
 return {...f,surface:{...f.surface!,fade:{color:fade.color,y0:top?hi:lo,y1:top?lo:hi}}};
}
/** A pending fade for the brush (resolved on commit by `resolveFade`). */
export const pendingFade=(b:FadeBrush):SurfaceFade=>({color:b.color,y0:-1,y1:b.from==='top'?-2:-1});
/** Fade colour presets derived from a base colour. */
export function fadePresetColor(base:string,preset:'damp'|'sun'):string{
 const n=parseInt(base.slice(1),16),c=[n>>16&255,n>>8&255,n&255];
 const out=preset==='damp'?[c[0]*.58+14,c[1]*.62+18,c[2]*.55+8]:[c[0]*.55+255*.45,c[1]*.55+250*.45,c[2]*.6+238*.4];
 return '#'+out.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
}
/** Mix of two hex colours (a at 0, b at 1). */
export function mixHex(a:string,b:string,t:number):string{
 const p=(h:string)=>{const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255];},x=p(a),y=p(b);
 return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
/** What the eyedropper hands the brush: material, colour and scale (plus the rest of the surface). */
export function matchFinish(f:StudioFinish|undefined,fallbackColor:string):{color:string;texture:string;surface:Omit<StudioSurfaceSpec,'fade'|'soft'>|null}{
 if(f?.surface&&validSurfaceSpec(f.surface)){const {fade:_f,soft:_s,...rest}=f.surface;void _f;void _s;return {color:f.color??fallbackColor,texture:'',surface:rest};}
 return {color:f?.color??fallbackColor,texture:f?.texture??'',surface:null};
}
/** Pattern shown for a legacy finish (the library highlights its CC0 equivalent). */
export const legacyPattern=(texture:string|undefined):SurfacePatternId|null=>texture?LEGACY_TEXTURE_PATTERN[texture as CityTextureId]??null:null;

/** Brush parameters of the surface library (defaults: scale 1, no rotation, wear, paint or feather). */
export type SurfaceParams={accent?:string;scale:number;rotation:number;wear:number;painted:number;soft:number};
/** The stored surface of the brush: defaults are omitted so keys and recipes stay small; a fade stays pending. */
export function brushSurface(pattern:SurfacePatternId,p:SurfaceParams,fade:FadeBrush|null):StudioSurfaceSpec{
 const s:StudioSurfaceSpec={pattern};if(p.accent)s.accent=p.accent;if(p.scale!==1)s.scale=p.scale;if(p.rotation)s.rotation=p.rotation;if(p.wear)s.wear=p.wear;if(p.painted)s.painted=p.painted;if(p.soft)s.soft=p.soft;if(fade)s.fade=pendingFade(fade);return s;
}
/** Short identity of a finish for recents and hotbar ids. */
export const finishId=(f:StudioFinish)=>JSON.stringify([f.color??'',f.texture??'',f.surface?{...f.surface,fade:undefined}:null]);
/** Most-recent-first list without duplicates. */
export function pushRecent<T>(list:readonly T[],item:T,id:(t:T)=>string,limit=10):T[]{const key=id(item);return [item,...list.filter(x=>id(x)!==key)].slice(0,limit);}

// ---- Interior floors ----------------------------------------------------------------------------------------------
export type InteriorFloorIntent={floorFinish:'timber'|'tile'|'stone';floorSurfaces?:{floor:number;surface:StudioFloorSurface}[];roomFinishes?:{id:string;floor:number;floorFinish?:'timber'|'tile'|'stone';floorSurface?:StudioFloorSurface}[]};
/** Surface of a legacy floor finish (same colour as the old flat material). */
export const legacyFloorSurface=(finish:'timber'|'tile'|'stone'):StudioFloorSurface=>({pattern:LEGACY_FLOOR_PATTERN[finish],color:LEGACY_FLOOR_COLOR[finish]});
/** Storey default: its own surface, else none (the old flat building-wide finish renders). */
export const storeyFloorSurface=(i:InteriorFloorIntent,floor:number):StudioFloorSurface|undefined=>i.floorSurfaces?.find(s=>s.floor===floor)?.surface;
/**
 * Room surface: the room's own surface, else its legacy finish (flat as before) when set, else the storey default.
 * `undefined` means "draw the legacy flat material".
 */
export function roomFloorSurface(i:InteriorFloorIntent,floor:number,roomId:string):StudioFloorSurface|undefined{
 const own=i.roomFinishes?.find(r=>r.id===roomId&&r.floor===floor);if(own?.floorSurface)return own.floorSurface;if(own?.floorFinish)return undefined;return storeyFloorSurface(i,floor);
}
export function validateInteriorSurfaces(i:InteriorFloorIntent):string|null{
 if(i.floorSurfaces!==undefined){if(!Array.isArray(i.floorSurfaces)||i.floorSurfaces.length>8||new Set(i.floorSurfaces.map(s=>s?.floor)).size!==i.floorSurfaces.length)return 'Storey floor finishes are invalid.';
  if(i.floorSurfaces.some(s=>!s||typeof s!=='object'||!only(s,['floor','surface'])||!Number.isInteger(s.floor)||s.floor<0||s.floor>=8||!validFloorSurface(s.surface)))return 'A storey floor finish is invalid.';}
 if((i.roomFinishes??[]).some(r=>r.floorSurface!==undefined&&!validFloorSurface(r.floorSurface)))return 'A room floor finish is invalid.';
 return null;
}
type V6=Extract<StudioRecipe,{version:6}>;
/** Sets (or clears with null) one storey's default floor surface. */
export function setStoreyFloorSurface(r:V6,floor:number,surface:StudioFloorSurface|null):V6{
 const list=(r.interior.floorSurfaces??[]).filter(s=>s.floor!==floor);if(surface)list.push({floor,surface:{...surface}});list.sort((a,b)=>a.floor-b.floor);
 const {floorSurfaces:_old,...rest}=r.interior;void _old;return {...r,interior:list.length?{...rest,floorSurfaces:list}:rest};
}
/**
 * Sets one room's floor surface; null clears it. A room without a room-finish intent gets one like the Rooms panel
 * creates (a fresh id, so it never collides with generated `room/<floor>/<index>` ids); the resolved room takes it.
 */
export function setRoomFloorSurface(r:V6,room:{id:string;x:number;z:number;boundaryIds?:string[]},floor:number,surface:StudioFloorSurface|null,newId:()=>string=()=>globalThis.crypto.randomUUID()):V6{
 const list=r.interior.roomFinishes??[],existing=list.find(item=>item.id===room.id&&item.floor===floor);
 const {floorFinish,floorSurface:_old,...rest}={id:existing?.id??newId(),floor,x:room.x,z:room.z,...(room.boundaryIds?{boundaryIds:room.boundaryIds}:{}),...existing} as NonNullable<V6['interior']['roomFinishes']>[number];void _old;
 const intent=surface?{...rest,floorSurface:{...surface}}:{...rest,...(floorFinish?{floorFinish}:{})};
 return {...r,interior:{...r.interior,roomFinishes:[...list.filter(item=>item!==existing),intent]}};
}
/** The original quick finishes (timber/tile/stone): a flat room finish, clearing any patterned surface. */
export function setRoomLegacyFloor(r:V6,room:{id:string;x:number;z:number;boundaryIds?:string[]},floor:number,finish:'timber'|'tile'|'stone',newId?:()=>string):V6{
 const cleared=setRoomFloorSurface(r,room,floor,null,newId),list=cleared.interior.roomFinishes!,last=list.find(item=>item.id===room.id&&item.floor===floor)??list[list.length-1];
 return {...cleared,interior:{...cleared.interior,roomFinishes:list.map(item=>item===last?{...item,floorFinish:finish}:item)}};
}
/** Paints several rooms at once (the floor brush): one recipe, one undo step. */
export function paintRoomFloors(r:V6,rooms:{id:string;x:number;z:number;boundaryIds?:string[]}[],floor:number,surface:StudioFloorSurface):V6{
 return rooms.reduce((next,room)=>setRoomFloorSurface(next,room,floor,surface),r);
}
