// Studio Isolate (docs/city-studio-ui-v2.md "Isolate"): while on, the edited plot renders as usual and the rest of the
// scene gets cheaper. Neighbouring studio plots pin to their far chunks and kit proxies (no near overlays, no shop
// interiors), business buildings draw their simple representation, only the edited building casts sun shadows, moving
// things pause and everything beyond ~40 m of the plot fades to a light silhouette through the scene fog node
// (uniforms only, no shader recompile). A module store, so renderer components read it without React re-renders of
// the scene and turning it off restores everything on the next frame.
import {useSyncExternalStore} from 'react';

export type StudioIsolate={on:boolean;plotId:string|null;x:number;z:number;/** plot edge in metres */size:number};
export const ISOLATE_OFF:StudioIsolate={on:false,plotId:null,x:0,z:0,size:24};
/** Fade radii around the plot centre: fully visible inside `inner`, a silhouette beyond `outer`. */
export function isolateRadii(size:number){const inner=Math.max(40,size*.71+6);return {inner,outer:inner+22};}

let state:StudioIsolate=ISOLATE_OFF;
const listeners=new Set<()=>void>();
export function studioIsolate(){return state;}
export function setStudioIsolate(next:StudioIsolate){
 if(next.on===state.on&&next.plotId===state.plotId&&next.x===state.x&&next.z===state.z&&next.size===state.size)return;
 state=next.on?next:ISOLATE_OFF;listeners.forEach(fn=>fn());
}
export function subscribeStudioIsolate(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function useStudioIsolate(){return useSyncExternalStore(subscribeStudioIsolate,studioIsolate,studioIsolate);}
/** True while isolating and `id` is not the edited plot: the caller should draw its cheapest representation. */
export const isolatedAway=(id:string)=>state.on&&state.plotId!==id;

// ---- Per-device preference ------------------------------------------------------------------------------------------
export const ISOLATE_KEY='city-studio-isolate-v1';
let lowPower=typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('cityLowPower')==='1';
/** The existing low-power path (software renderer detection in CityScene; `?cityLowPower=1` for tests). */
export function setCityLowPower(value:boolean){lowPower=lowPower||value;}
export function cityLowPower(){return lowPower;}
/** Remembered choice, else on for the low-power path and off elsewhere. */
export function isolatePreference(storage:Pick<Storage,'getItem'>|null=safeStorage(),low=lowPower):boolean{
 try{const v=storage?.getItem(ISOLATE_KEY);if(v==='1')return true;if(v==='0')return false;}catch{/* default below */}
 return low;
}
export function saveIsolatePreference(on:boolean,storage:Pick<Storage,'setItem'>|null=safeStorage()){try{storage?.setItem(ISOLATE_KEY,on?'1':'0');}catch{/* this visit only */}}
function safeStorage():Storage|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
