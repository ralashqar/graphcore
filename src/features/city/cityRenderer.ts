
import {useSyncExternalStore} from "react";
import {WebGPURenderer} from "three/webgpu";
import type {WebGLRenderer} from "three";
import type {DefaultGLProps} from "@react-three/fiber/dist/declarations/src/core/renderer";

/** City-only renderer. WebGPURenderer supplies the same node pipeline on WebGL2 fallback. */
let compatibility=false,epoch=0;
const rendererEvent="city-renderer-ready";
const subscribe=(callback:()=>void)=>{window.addEventListener(rendererEvent,callback);return()=>window.removeEventListener(rendererEvent,callback);};
export const useCityRendererEpoch=()=>useSyncExternalStore(subscribe,()=>epoch,()=>0);
const pending=new WeakMap<object,Promise<WebGLRenderer>>();
export function createCityRenderer(props:DefaultGLProps){
 let renderer=pending.get(props.canvas);
 if(!renderer){renderer=initializeCityRenderer(props);pending.set(props.canvas,renderer);renderer.catch(()=>pending.delete(props.canvas));}
 return renderer;
}
async function initializeCityRenderer(props:DefaultGLProps){
 const forceWebGL=compatibility || new URLSearchParams(window.location.search).get("cityBackend")==="webgl";
 const renderer=new WebGPURenderer({canvas:props.canvas as HTMLCanvasElement,alpha:props.alpha,antialias:true,powerPreference:"high-performance",forceWebGL});
 const bounds=(props.canvas as HTMLCanvasElement).getBoundingClientRect();
 renderer.setSize(Math.max(1,bounds.width),Math.max(1,bounds.height),false);
 await renderer.init();
 renderer.info.autoReset=false;
 let disposed=false;
 const dispose=renderer.dispose.bind(renderer);
 renderer.dispose=()=>{disposed=true;pending.delete(props.canvas);return dispose();};
 renderer.domElement.dataset.cityBackend=(renderer.backend as {isWebGPUBackend?:boolean}).isWebGPUBackend?"webgpu":"webgl2";
 renderer.domElement.dataset.cityAdapter=renderer.domElement.dataset.cityBackend;
 window.dispatchEvent(new Event("city-renderer-ready"));
 const lost=renderer.onDeviceLost.bind(renderer);
 renderer.onDeviceLost=(info)=>{
   if(disposed)return;
   renderer.domElement.dataset.cityDeviceLost="true";lost(info);
   // Recreate complete canvas roots; never mix backends inside a live scene.
   compatibility=true;epoch++;window.dispatchEvent(new Event(rendererEvent));
 };
 // Fiber 9's renderer contract is structurally WebGL-shaped, although async WebGPU is supported.
 return renderer as unknown as WebGLRenderer;
}
export function cityGpu(gl:unknown){return gl as WebGPURenderer;}
