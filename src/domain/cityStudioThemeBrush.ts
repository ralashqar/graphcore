/**
 * The theme brush (docs/city-studio-themes.md › Theme brush): a facade theme held like paint. Pure helpers shared by the
 * Paint brush's Themes target, card drag-and-drop and the eyedropper; applying always goes through applyFacadeTheme,
 * so results match the inspector's "Apply theme to this part".
 *
 *  sampleThemeBrush   Alt-click: the theme dressing a part (its own, else the building's) with its seed, colourway,
 *                     aspect tuning, locks, reroll counters and the rhythm layers at that scope
 *  themeBrushOptions  the applyFacadeTheme options a brush carries
 *  eraseThemeAt       Erase with the Themes target: a part's own theme, or every theme at building size
 */
import {THEME_MAP} from './cityStudioThemeCatalog.ts';
import {effectiveThemeRef,removeFacadeTheme,themeRefAt,type ApplyThemeOptions} from './cityStudioThemes.ts';
import type {FacadeRhythm} from './cityStudioFacadeRhythm.ts';
import type {StudioThemeRef,ThemeAspect} from './cityStudioThemeCatalog.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

export type ThemeBrush={theme:string;seed?:number;palette?:number;tune?:StudioThemeRef['tune'];locks?:ThemeAspect[];seeds?:StudioThemeRef['seeds'];layers?:FacadeRhythm['layers'];
 /** Picked up from this part (display only). */from?:string};

/** Rhythm layers stored at a theme reference's own scope (the part's whole-part rule, or the building base). */
function scopeLayers(r:StudioRecipe,ref:StudioThemeRef):FacadeRhythm['layers']{
 const rhythm=r.studio.facadeRhythm;if(!rhythm)return undefined;
 if(!ref.partId)return rhythm.layers;
 return rhythm.rules?.find(x=>x.partId===ref.partId&&x.side===undefined&&x.fromFloor===undefined&&x.x0===undefined)?.layers;
}

export function sampleThemeBrush(r:StudioRecipe,partId:string):ThemeBrush|null{
 const ref=effectiveThemeRef(r,partId);if(!ref||!THEME_MAP.has(ref.theme))return null;
 const layers=scopeLayers(r,ref);
 return {theme:ref.theme,seed:ref.seed,...(ref.palette!==undefined?{palette:ref.palette}:{}),...(ref.tune?{tune:{...ref.tune}}:{}),...(ref.locks?.length?{locks:[...ref.locks]}:{}),...(ref.seeds?{seeds:{...ref.seeds}}:{}),...(layers?{layers:structuredClone(layers)}:{}),from:partId};
}

/** applyFacadeTheme options for a brush (seed only when picked up; a plain card rolls a fresh look). */
export function themeBrushOptions(b:ThemeBrush):Omit<ApplyThemeOptions,'partId'>{
 return {...(b.seed!==undefined?{seed:b.seed}:{}),...(b.palette!==undefined?{palette:b.palette}:{}),...(b.tune?{tune:b.tune}:{}),...(b.locks?{locks:b.locks}:{}),...(b.seeds?{seeds:b.seeds}:{}),...(b.layers?{layers:b.layers}:{})};
}

/** True when the brush carries a picked-up look rather than just a theme. */
export const themeBrushTuned=(b:ThemeBrush)=>b.seed!==undefined;

export function eraseThemeAt(r:StudioRecipe,target:{partId:string}|{building:true}):{recipe:StudioRecipe;label:string}|{reason:string}{
 if('building' in target){
  if(!r.studio.facadeThemes?.length)return {reason:'This building has no themes to remove.'};
  const studio={...r.studio};delete studio.facadeThemes;return {recipe:{...r,studio},label:'Remove every theme'};
 }
 const own=themeRefAt(r,target.partId);
 if(own)return {recipe:removeFacadeTheme(r,target.partId),label:`Remove theme: ${THEME_MAP.get(own.theme)?.label??own.theme}`};
 if(themeRefAt(r))return {reason:'This part is dressed by the building theme. Erase at Building size (or Shift-click) to remove it.'};
 return {reason:'This part has no theme to remove.'};
}
