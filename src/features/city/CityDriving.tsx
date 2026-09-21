import { useEffect,useRef } from "react";
import { useFrame,useThree } from "@react-three/fiber";
import { Html,PerspectiveCamera } from "@react-three/drei";
import { Group,PerspectiveCamera as Camera,Vector3 } from "three";
import { driveStep,type DriveInput } from "../../domain/cityDriving";
import { useCityMapLayout } from "./CityMapLayout";
const empty=():DriveInput=>({forward:false,reverse:false,left:false,right:false,brake:false});
export function CityDriving({capacity,onRegion,onExit,reduced}:{capacity:number;onRegion:(x:number,z:number)=>void;onExit:()=>void;reduced:boolean}) {
 const camera=useRef<Camera>(null),car=useRef<Group>(null),input=useRef(empty());
 const state=useRef({x:0,z:33,heading:0,speed:0}),look=useRef({yaw:0,pitch:0}),timer=useRef(0);
 const {gl,setEvents,events}=useThree(),{logicalAxis,roadCapacityMultiplier}=useCityMapLayout();
 const bound=Math.max(66,(Math.ceil(Math.sqrt(capacity*roadCapacityMultiplier)/4)-1)*66);
 useEffect(()=>{const enabled=events.enabled;setEvents({enabled:false});return()=>setEvents({enabled});},[setEvents]);
 const exit=useRef(onExit);exit.current=onExit;
 useEffect(()=>{
  const keys:Record<string,keyof DriveInput>={w:"forward",ArrowUp:"forward",s:"reverse",ArrowDown:"reverse",a:"left",ArrowLeft:"left",d:"right",ArrowRight:"right"," ":"brake"};
  const key=(e:KeyboardEvent)=>{
   if(e.type==="keyup") {const action=keys[e.key];if(action)input.current[action]=false;return;}
   if((e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true]"))return;
   if(e.key==="Escape"){exit.current();return;}
   const action=keys[e.key];if(action){e.preventDefault();input.current[action]=true;}
  };
  const clear=()=>{input.current=empty();};
  const visibility=()=>{if(document.hidden)clear();};
  let dragging=false;
  const down=(e:PointerEvent)=>{if(e.button===2){dragging=true;gl.domElement.setPointerCapture(e.pointerId);}};
  const move=(e:PointerEvent)=>{if(dragging){look.current.yaw=Math.max(-1.2,Math.min(1.2,look.current.yaw-e.movementX*.006));look.current.pitch=Math.max(-1,Math.min(1,look.current.pitch+e.movementY*.005));}};
  const up=()=>{dragging=false;};
  const menu=(e:Event)=>e.preventDefault();
  window.addEventListener("keydown",key);window.addEventListener("keyup",key);window.addEventListener("blur",clear);document.addEventListener("visibilitychange",visibility);
  const canvas=gl.domElement;canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);canvas.addEventListener("contextmenu",menu);
  return()=>{clear();window.removeEventListener("keydown",key);window.removeEventListener("keyup",key);window.removeEventListener("blur",clear);document.removeEventListener("visibilitychange",visibility);canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);canvas.removeEventListener("contextmenu",menu);delete canvas.dataset.cityDriving;};
 },[gl]);
 const simulation=useRef(0),cameraReady=useRef(false);
 const desired=useRef(new Vector3()),target=useRef(new Vector3());
 useFrame((_,dt)=>{
  // Bounded fixed steps keep driving speed stable through occasional long frames.
  simulation.current+=Math.min(dt,.1);
  while(simulation.current>=1/120){
   state.current=driveStep(state.current,input.current,1/120,bound);
   simulation.current-=1/120;
  }
  const v=state.current;
  if(car.current){car.current.position.set(v.x,.65,v.z);car.current.rotation.y=v.heading;}
  if(camera.current){
   const heading=v.heading+look.current.yaw;
   desired.current.set(v.x-Math.sin(heading)*9,4.8+look.current.pitch*2,v.z-Math.cos(heading)*9);
   // The chase camera stays in the road corridor instead of clipping into plots.
   const dx=Math.abs(desired.current.x-Math.round(desired.current.x/66)*66),dz=Math.abs(desired.current.z-Math.round(desired.current.z/66)*66);
   if(Math.min(dx,dz)>6){if(dx<dz)desired.current.x=Math.round(desired.current.x/66)*66+Math.sign(desired.current.x-Math.round(desired.current.x/66)*66)*6;else desired.current.z=Math.round(desired.current.z/66)*66+Math.sign(desired.current.z-Math.round(desired.current.z/66)*66)*6;}
   if(!cameraReady.current || reduced){camera.current.position.copy(desired.current);cameraReady.current=true;}
   else camera.current.position.lerp(desired.current,1-Math.exp(-10*Math.min(dt,.1)));
   target.current.set(v.x+Math.sin(heading)*7,1.8,v.z+Math.cos(heading)*7);
   camera.current.lookAt(target.current);
  }
  timer.current+=dt;
  if(timer.current>.3){timer.current=0;onRegion(logicalAxis(v.x),logicalAxis(v.z));gl.domElement.dataset.cityDriving=JSON.stringify(v);}
 });
 const hold=(key:keyof DriveInput)=>({onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);input.current[key]=true;},onPointerUp:()=>{input.current[key]=false;},onPointerCancel:()=>{input.current[key]=false;},onLostPointerCapture:()=>{input.current[key]=false;}});
 const hud = <Html position={[0,0,-1]} fullscreen style={{pointerEvents:"none"}}><div className="city-drive-controls" role="region" aria-label="Driving controls">
   <div className="city-drive-touch">{([["left","Steer left"],["forward","Accelerate"],["reverse","Reverse"],["right","Steer right"],["brake","Brake"]] as const).map(([key,label])=><button key={key} type="button" {...hold(key)}>{label}</button>)}</div>
   <button type="button" onClick={onExit}>Back to map</button>
  </div></Html>;
 return <>
  <PerspectiveCamera ref={camera} makeDefault fov={60} near={.2} far={1200} position={[0,4.8,24]}>{hud}</PerspectiveCamera>
  <group ref={car} position={[0,.65,33]}>
   <mesh castShadow><boxGeometry args={[2.2,.65,4]}/><meshLambertMaterial color="#c97745"/></mesh>
   <mesh position={[0,.65,-.25]} castShadow><boxGeometry args={[1.85,.8,2]}/><meshLambertMaterial color="#41636d"/></mesh>
   {[-1,1].flatMap(x=>[-1.2,1.2].map(z=><mesh key={`${x}:${z}`} position={[x*1.05,-.15,z]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.45,.45,.25,12]}/><meshLambertMaterial color="#27312e"/></mesh>))}
   {[-.7,.7].map(x=><mesh key={x} position={[x,.12,2.02]}><boxGeometry args={[.45,.2,.06]}/><meshBasicMaterial color="#fff2ce"/></mesh>)}
  </group>

 </>;
}
