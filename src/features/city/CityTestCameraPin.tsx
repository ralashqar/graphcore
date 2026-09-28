import {useEffect} from "react";
import {useFrame,useThree} from "@react-three/fiber";
import type {PerspectiveCamera} from "three";

/**
 * Development test hook (`?cityStudioTest` or `?cityGroundTest`): browser suites pin the camera for close-up
 * screenshots by setting `window.__cityCameraPin={position:[x,y,z],target:[x,y,z],fov?}` (null releases it). The pose
 * is applied first in each frame (so distance levels and streaming see it) and again just before rendering, after every
 * controller has run, so it wins over studio and follow cameras.
 */
type Pin={position:[number,number,number];target:[number,number,number];fov?:number}|null|undefined;
const enabled=()=>{if(!import.meta.env.DEV||typeof window==="undefined")return false;const q=new URLSearchParams(window.location.search);return q.has("cityStudioTest")||q.has("cityGroundTest");};
function apply(camera:import("three").Camera){
 const pin=(window as unknown as {__cityCameraPin?:Pin}).__cityCameraPin;if(!pin)return;
 camera.position.set(...pin.position);camera.lookAt(...pin.target);
 const perspective=camera as PerspectiveCamera;if(pin.fov&&perspective.isPerspectiveCamera&&perspective.fov!==pin.fov){perspective.fov=pin.fov;perspective.updateProjectionMatrix();}
 camera.updateMatrixWorld(true);
}
export function CityTestCameraPin(){
 const scene=useThree(s=>s.scene),on=enabled();
 useFrame(({camera})=>{if(on)apply(camera);},-1000);
 useEffect(()=>{
  if(!on)return;
  const previous=scene.onBeforeRender;
  scene.onBeforeRender=function(renderer,s,camera,...rest){previous.call(this,renderer,s,camera,...rest);apply(camera);};
  return()=>{scene.onBeforeRender=previous;};
 },[scene,on]);
 return null;
}
