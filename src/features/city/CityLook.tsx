import { useSyncExternalStore } from "react";
import "./CityLook.css";

export const CITY_LOOKS = {
  daylight: {name:"Miniature Daylight", sky:"#8bbbd7", horizon:"#d6e5e9", ground:"#86876e", sun:"#fff0d5", fill:"#bedcff", intensity:3.1, hemisphere:.65, exposure:1.05},
  afternoon: {name:"Warm Afternoon", sky:"#95b7d0", horizon:"#f2ddc1", ground:"#92765f", sun:"#ffd19b", fill:"#c5d7f4", intensity:3.3, hemisphere:.55, exposure:1.0},
  overcast: {name:"Soft Overcast", sky:"#afc4d0", horizon:"#e0e7e8", ground:"#828b7b", sun:"#edf4ff", fill:"#dce9f2", intensity:1.6, hemisphere:.95, exposure:1.05},
} as const;
export type CityLook = {look:keyof typeof CITY_LOOKS; quality:"fast"|"balanced"|"high"; occlusion:"off"|"architectural"|"screen"};
const key="city-scene-look-v1", event="city-scene-look-change";
const fallback:CityLook={look:"daylight",quality:"balanced",occlusion:"architectural"};
let cachedRaw:string|null|undefined, cached:CityLook=fallback;
function snapshot():CityLook {
  let raw:string|null=null;
  try {raw=localStorage.getItem(key);} catch {return cached;}
  if(raw!==cachedRaw){
    cachedRaw=raw;
    try {const value=JSON.parse(raw||"null"); cached={look:typeof value?.look === "string" && Object.prototype.hasOwnProperty.call(CITY_LOOKS,value.look)?value.look:"daylight",quality:["fast","balanced","high"].includes(value?.quality)?value.quality:"balanced",occlusion:["off","architectural","screen"].includes(value?.occlusion)?value.occlusion:"architectural"};}
    catch {cached=fallback;}
  }
  return cached;
}
function subscribe(callback:()=>void){window.addEventListener(event,callback);window.addEventListener("storage",callback);return()=>{window.removeEventListener(event,callback);window.removeEventListener("storage",callback);};}
export function useCityLook(){return useSyncExternalStore(subscribe,snapshot,()=>fallback);}
function update(value:CityLook){cached=value;try{localStorage.setItem(key,JSON.stringify(value));}catch{}window.dispatchEvent(new Event(event));}
function rendererSnapshot(){return document.querySelector<HTMLCanvasElement>("canvas[data-city-backend]")?.dataset.cityBackend || "loading";}
function subscribeRenderer(callback:()=>void){window.addEventListener("city-renderer-ready",callback);return()=>window.removeEventListener("city-renderer-ready",callback);}
export function CityLookControls(){
 const backend=useSyncExternalStore(subscribeRenderer,rendererSnapshot,()=>"loading");
 const value=useCityLook();
 return <details className="city-look-controls"><summary>Scene look</summary><div>
   <label>Lighting<select aria-label="Scene lighting" value={value.look} onChange={e=>update({...value,look:e.target.value as CityLook["look"]})}>{Object.entries(CITY_LOOKS).map(([id,p])=><option key={id} value={id}>{p.name}</option>)}</select></label>
   <label>Quality<select aria-label="Scene quality" value={value.quality} onChange={e=>update({...value,quality:e.target.value as CityLook["quality"]})}><option value="fast">Fast — no dynamic shadows</option><option value="balanced">Balanced — soft grounding</option><option value="high">High — nearby sun shadows</option></select></label>
   <label>Ambient occlusion<select aria-label="Ambient occlusion" value={value.occlusion} onChange={e=>update({...value,occlusion:e.target.value as CityLook["occlusion"]})}><option value="off">Off</option><option value="architectural">Architectural — baked detail</option><option value="screen">Enhanced — screen-space AO</option></select></label>
   <small>Renderer: {backend==="webgpu"?"WebGPU":backend==="webgl2"?"WebGL2 compatibility":"Starting…"}</small>
   <small>Applies to your city and preview on this device. Building colours stay unchanged. Architectural AO is lighter; Enhanced adds real-time shading.</small>
 </div></details>;
}
