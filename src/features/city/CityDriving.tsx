import {useEffect,useLayoutEffect,useMemo,useRef} from "react";
import {useFrame,useThree} from "@react-three/fiber";
import {Html} from "@react-three/drei";
import {Group,PerspectiveCamera,Vector3} from "three";
import type {CityProperty} from "../../domain/city";
import {advanceDrive,createDriveState,interpolateDrive,recoverDrive,DRIVE_PROFILE,type DriveInput} from "../../domain/cityDriving";
import {DriveWorld,syncCityDriveWorld} from "../../domain/cityDriveWorld";
import {useCityMapLayout} from "./CityMapLayout";
import {CityDriveCar} from "./CityDriveCar";
const empty=():DriveInput=>({forward:false,reverse:false,left:false,right:false,brake:false});
export function CityDriving({capacity,properties,hasPavilion,launchPlaza,onRegion,onExit,reduced,viewCamera}:{properties:CityProperty[];hasPavilion:boolean;launchPlaza:boolean;viewCamera:PerspectiveCamera;capacity:number;onRegion:(x:number,z:number)=>void;onExit:()=>void;reduced:boolean}){
 const car=useRef<Group>(null),input=useRef(empty()),state=useRef(createDriveState()),previous=useRef(createDriveState()),display=useRef(createDriveState());
 const lastSafe=useRef({x:0,z:33,heading:0}),look=useRef({yaw:0,pitch:0,dragging:false,delay:0}),timer=useRef(0),simulation=useRef(0),cameraReady=useRef(false);
 const {gl,setEvents,events}=useThree(),{logicalAxis,plotAxis,plotSize,roadCapacityMultiplier}=useCityMapLayout();
 const bound=Math.max(66,Math.ceil(Math.sqrt(capacity*roadCapacityMultiplier)/4)*66+5);
 const world=useMemo(()=>new DriveWorld(bound),[bound]);
 const recover=useRef(()=>{});
 recover.current=()=>{const next=recoverDrive(world,lastSafe.current);if(!next)return;Object.assign(state.current,next);Object.assign(previous.current,next);Object.assign(display.current,next);simulation.current=0;input.current=empty();cameraReady.current=false;};
 useLayoutEffect(()=>{
  syncCityDriveWorld(world,properties,plotAxis,plotSize,hasPavilion,launchPlaza);if(!world.clear(state.current.x,state.current.z,DRIVE_PROFILE.radius))recover.current();
 },[world,properties,plotAxis,plotSize,hasPavilion,launchPlaza]);
 useEffect(()=>{const enabled=events.enabled;setEvents({enabled:false});return()=>setEvents({enabled});},[setEvents]);
 const exit=useRef(onExit);exit.current=onExit;
 useEffect(()=>{
  const keys:Record<string,keyof DriveInput>={w:'forward',ArrowUp:'forward',s:'reverse',ArrowDown:'reverse',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right',' ':'brake'};
  const key=(e:KeyboardEvent)=>{const k=e.key.length===1?e.key.toLowerCase():e.key,action=keys[k];if(e.type==='keyup'){if(action)input.current[action]=false;return;}if((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]'))return;if(k==='Escape'){exit.current();return;}if(k==='r'){recover.current();return;}if(action){e.preventDefault();input.current[action]=true;}};
  const clear=()=>{input.current=empty();look.current.dragging=false;simulation.current=0;};
  const visibility=()=>{if(document.hidden)clear();};
  const down=(e:PointerEvent)=>{if(e.button===2){look.current.dragging=true;gl.domElement.setPointerCapture(e.pointerId);}};
  const move=(e:PointerEvent)=>{if(look.current.dragging){look.current.yaw=Math.max(-1.2,Math.min(1.2,look.current.yaw-e.movementX*.006));look.current.pitch=Math.max(-1,Math.min(1,look.current.pitch+e.movementY*.005));}};
  const up=()=>{look.current.dragging=false;look.current.delay=1;};
  const menu=(e:Event)=>e.preventDefault();
  window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',visibility);
  const canvas=gl.domElement;canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('lostpointercapture',up);canvas.addEventListener('contextmenu',menu);
  return()=>{clear();window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('lostpointercapture',up);canvas.removeEventListener('contextmenu',menu);delete canvas.dataset.cityDriving;delete canvas.dataset.cityDrivePerformance;};
 },[gl]);
 const desired=useRef(new Vector3()),target=useRef(new Vector3());
 const costs=useRef(new Float32Array(240)),costIndex=useRef(0),costCount=useRef(0);
 useFrame((_,dt)=>{
  const started=performance.now(),d=Math.min(dt,.1);simulation.current+=d;
  while(simulation.current>=DRIVE_PROFILE.step){Object.assign(previous.current,state.current);advanceDrive(state.current,input.current,DRIVE_PROFILE.step,world);simulation.current-=DRIVE_PROFILE.step;}
  const s=state.current;const roadDistance=Math.min(Math.abs(s.x-Math.round(s.x/66)*66),Math.abs(s.z-Math.round(s.z/66)*66));
  if(roadDistance<3&&world.clear(s.x,s.z,DRIVE_PROFILE.radius+.2)){lastSafe.current.x=s.x;lastSafe.current.z=s.z;lastSafe.current.heading=s.heading;}
  const v=interpolateDrive(display.current,previous.current,s,simulation.current/DRIVE_PROFILE.step);
  if(car.current){car.current.position.set(v.x,0,v.z);car.current.rotation.y=v.heading;}
  if(!look.current.dragging){look.current.delay-=d;if(look.current.delay<=0){look.current.yaw*=Math.exp(-3*d);look.current.pitch*=Math.exp(-3*d);}}
  const heading=v.heading+look.current.yaw,speed=Math.min(1,Math.hypot(v.vx,v.vz)/24),distance=9+(reduced?0:speed*2);
  desired.current.set(v.x-Math.sin(heading)*distance,4.8+look.current.pitch*2+(reduced?0:speed*.5),v.z-Math.cos(heading)*distance);
  // Sweep the complete camera boom, then recheck after smoothing at corners.
  let hit=world.sweep(v.x,v.z,desired.current.x-v.x,desired.current.z-v.z,.35);
  desired.current.x=v.x+(desired.current.x-v.x)*Math.max(0,hit.t-.015);desired.current.z=v.z+(desired.current.z-v.z)*Math.max(0,hit.t-.015);
  if(!cameraReady.current||reduced){viewCamera.position.copy(desired.current);cameraReady.current=true;}else viewCamera.position.lerp(desired.current,1-Math.exp(-7*d));
  hit=world.sweep(v.x,v.z,viewCamera.position.x-v.x,viewCamera.position.z-v.z,.35);
  if(hit.t<1){viewCamera.position.x=v.x+(viewCamera.position.x-v.x)*Math.max(0,hit.t-.015);viewCamera.position.z=v.z+(viewCamera.position.z-v.z)*Math.max(0,hit.t-.015);}
  target.current.set(v.x+Math.sin(heading)*3+v.vx*.12,1.3,v.z+Math.cos(heading)*3+v.vz*.12);viewCamera.lookAt(target.current);
  const fov=60+(reduced?0:speed*5),next=reduced?60:viewCamera.fov+(fov-viewCamera.fov)*(1-Math.exp(-4*d));if(Math.abs(next-viewCamera.fov)>.01){viewCamera.fov=next;viewCamera.updateProjectionMatrix();}
  costs.current[costIndex.current++%240]=performance.now()-started;costCount.current=Math.min(240,costCount.current+1);
  timer.current+=dt;if(timer.current>.3){timer.current=0;onRegion(logicalAxis(v.x),logicalAxis(v.z));gl.domElement.dataset.cityDriving=JSON.stringify(v);const samples=Array.from(costs.current.subarray(0,costCount.current)).sort((a,b)=>a-b);gl.domElement.dataset.cityDrivePerformance=JSON.stringify({p95:samples[Math.floor(samples.length*.95)],samples:samples.length});}
 },-1);
 const hold=(key:keyof DriveInput)=>({onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);input.current[key]=true;},onPointerUp:()=>{input.current[key]=false;},onPointerCancel:()=>{input.current[key]=false;},onLostPointerCapture:()=>{input.current[key]=false;}});
 return <><primitive object={viewCamera}><Html position={[0,0,-1]} fullscreen style={{pointerEvents:'none'}}><div className="city-drive-controls" role="region" aria-label="Driving controls">
 <div className="city-drive-touch">{([['left','Steer left'],['forward','Accelerate'],['reverse','Reverse'],['right','Steer right'],['brake','Handbrake']] as const).map(([key,label])=><button key={key} type="button" {...hold(key)}>{label}</button>)}</div>
 <button type="button" onClick={()=>recover.current()} title="Return to safe road (R)">Recover</button><button type="button" onClick={onExit}>Back to map</button>
 </div></Html></primitive><group ref={car}><CityDriveCar motion={display} reduced={reduced}/></group></>;
}
