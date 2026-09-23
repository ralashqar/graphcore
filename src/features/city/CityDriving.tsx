import {CityLandEditor} from './CityLandEditor';
import type {CityLandController} from './useCityLand';
import {landPrice,landEntrance,type LandPlot} from '../../domain/cityLand';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import {Group,PerspectiveCamera,Vector3} from 'three';
import type {CityProperty} from '../../domain/city';
import {advanceDrive,interpolateDrive,recoverDrive,DRIVE_PROFILE,type DriveInput} from '../../domain/cityDriving';
import {DriveWorld,syncCityDriveWorld,pavementHeight} from '../../domain/cityDriveWorld';
import {advanceFoot,carEntryDistance,interpolateFoot,WalkingWorld,findCarExit,canEnterCar,recoverFoot,parkDrive,FOOT_PROFILE,orbitFootCamera,zoomFootCamera,type ExplorationSession} from '../../domain/cityExploration';
import {useCityMapLayout} from './CityMapLayout';
import {CityDriveCar} from './CityDriveCar';
import {CityCharacter,type CharacterStatus} from './CityCharacter';
const empty=()=>({forward:false,reverse:false,left:false,right:false,brake:false,walk:false});
export function CityDriving({land,active,session,capacity,properties,hasPavilion,launchPlaza,onRegion,onExit,reduced,viewCamera}:{land?:CityLandController|null;active:boolean;session:ExplorationSession;properties:CityProperty[];hasPavilion:boolean;launchPlaza:boolean;viewCamera:PerspectiveCamera;capacity:number;onRegion:(x:number,z:number)=>void;onExit:()=>void;reduced:boolean}){
 const resumeLand=useRef(false);
 const landBusy=!!land&&land.phase!=='exploring';
 const [nearPlot,setNearPlot]=useState<LandPlot|null>(null),[resetConfirm,setResetConfirm]=useState(false);
 const landRef=useRef(land);landRef.current=land;
 const car=useRef<Group>(null),pedestrian=useRef<Group>(null),input=useRef(empty());
 const state=useRef(session.car),previous=useRef({...session.car}),display=useRef({...session.car});
 const foot=useRef(session.foot),previousFoot=useRef({...session.foot}),displayFoot=useRef({...session.foot});
 const [mode,setMode]=useState(session.mode),[status,setStatus]=useState<CharacterStatus>('loading'),[retry,setRetry]=useState(0),[hint,setHint]=useState('');
 const readiness=useRef(status);readiness.current=status;
 const onStatus=useCallback((value:CharacterStatus)=>setStatus(value),[]);
 const look=useRef({yaw:0,pitch:0,dragging:false,delay:0}),timer=useRef(0),simulation=useRef(0),cameraReady=useRef(false);
 const {gl,setEvents,events}=useThree(),{logicalAxis,plotAxis,plotSize,roadCapacityMultiplier}=useCityMapLayout();
 const bound=Math.max(66,Math.ceil(Math.sqrt(capacity*roadCapacityMultiplier)/4)*66+5);
 const world=useMemo(()=>new DriveWorld(bound),[bound]),walkingWorld=useMemo(()=>new WalkingWorld(world),[world]);
 const activePointers=useRef(new Map<number,{x:number;y:number}>());
 const recover=useRef(()=>{}),interact=useRef(()=>{}),leave=useRef(()=>{}),clear=useRef(()=>{});
 clear.current=()=>{for(const id of activePointers.current.keys())if(gl.domElement.hasPointerCapture(id))gl.domElement.releasePointerCapture(id);activePointers.current.clear();input.current=empty();foot.current.jumpBuffer=0;foot.current.wave=0;look.current.dragging=false;simulation.current=0;};
 const align=()=>{Object.assign(previous.current,state.current);Object.assign(display.current,state.current);Object.assign(previousFoot.current,foot.current);Object.assign(displayFoot.current,foot.current);};
 recover.current=()=>{
  if(session.mode==='driving'){const next=recoverDrive(world,session.safeCar);if(!next){setHint('No clear road position is available yet.');return;}Object.assign(state.current,next);walkingWorld.park(state.current);}
  else {const next=recoverFoot(walkingWorld,session.safeFoot);if(!next){setHint('No clear walking position is available yet.');return;}Object.assign(foot.current,next);}
  align();clear.current();cameraReady.current=false;
 };
 const nearestPlot=()=>{if(!landRef.current?.world||!foot.current.grounded)return null;let nearest:LandPlot|null=null,distance=Math.min(2,carEntryDistance(foot.current,state.current,walkingWorld));for(const p of landRef.current.world.plots){const entry=landEntrance(p),dist=Math.hypot(entry.x-foot.current.x,entry.z-foot.current.z);if(dist<distance&&walkingWorld.clear(entry.x,entry.z)&&walkingWorld.sweep(foot.current.x,foot.current.z,entry.x-foot.current.x,entry.z-foot.current.z,FOOT_PROFILE.radius).t===1){nearest=p;distance=dist;}}return nearest;};
 interact.current=()=>{
  if(session.mode==='driving'){
   if(readiness.current!=='ready'){setHint(readiness.current==='error'?'Character could not load. Use Retry character.':'Character is loading…');return;}
   if(Math.hypot(state.current.vx,state.current.vz)>=1){setHint('Slow down to exit');return;}
   walkingWorld.park(state.current);const next=findCarExit(state.current,walkingWorld);
   if(!next){setHint('No clear space to exit here. Move the car a little.');return;}
   parkDrive(state.current);Object.assign(foot.current,next);Object.assign(session.safeFoot,next);session.footCamera.heading=state.current.heading+look.current.yaw;
   session.mode='on-foot';
  }else{
   const p=nearestPlot();
   if(p){const entry=landEntrance(p),carDistance=carEntryDistance(foot.current,state.current,walkingWorld);if(!canEnterCar(foot.current,state.current,walkingWorld)||Math.hypot(entry.x-foot.current.x,entry.z-foot.current.z)<carDistance){clear.current();foot.current.vx=0;foot.current.vz=0;foot.current.speed=0;landRef.current!.open(p);return;}}
   if(!canEnterCar(foot.current,state.current,walkingWorld)){setHint('Stand beside a car door to enter');return;}
   session.mode='driving';
  }
  align();clear.current();look.current.yaw=0;look.current.pitch=0;setMode(session.mode);setHint('');
 };
 leave.current=()=>{parkDrive(state.current);foot.current.vx=0;foot.current.vz=0;foot.current.speed=0;align();clear.current();onExit();};
 useLayoutEffect(()=>{
  syncCityDriveWorld(world,[...properties,...(land?.world?.plots||[])],plotAxis,plotSize,hasPavilion,launchPlaza);
  if(!world.clear(state.current.x,state.current.z,DRIVE_PROFILE.radius)){const next=recoverDrive(world,session.safeCar);if(next)Object.assign(state.current,next);}
  walkingWorld.park(state.current);
  if(session.mode==='on-foot'&&!walkingWorld.clear(foot.current.x,foot.current.z)){const next=recoverFoot(walkingWorld,session.safeFoot);if(next)Object.assign(foot.current,next);}
  align();
 },[world,walkingWorld,properties,plotAxis,plotSize,hasPavilion,launchPlaza,session,land?.world?.id]);
 useEffect(()=>{if(!hint)return;const id=setTimeout(()=>setHint(''),3500);return()=>clearTimeout(id);},[hint]);
 useEffect(()=>{if(!active)return;const enabled=events.enabled;setEvents({enabled:land?.phase==='construction'});return()=>setEvents({enabled});},[active,setEvents,land?.phase]);
 useEffect(()=>{
  if(!active||landBusy)return;align();clear.current();if(!resumeLand.current)cameraReady.current=false;resumeLand.current=false;
  const keys:Record<string,keyof ReturnType<typeof empty>>={w:'forward',ArrowUp:'forward',s:'reverse',ArrowDown:'reverse',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right',' ':'brake',Shift:'walk'};
  const key=(e:KeyboardEvent)=>{
   const k=e.key.length===1?e.key.toLowerCase():e.key,action=keys[k];
   if(e.type==='keyup'){if(action)input.current[action]=false;return;}
   if((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]'))return;
   if(k==='Escape'){leave.current();return;}if(k==='r'&&!e.repeat){recover.current();return;}if(k==='e'&&!e.repeat){e.preventDefault();interact.current();return;}
   if(session.mode==='on-foot'&&['+','=','-','_'].includes(k)){e.preventDefault();zoomFootCamera(session.footCamera,k==='-'||k==='_'?160:-160);return;}
   if(k==='g'&&!e.repeat&&session.mode==='on-foot'&&foot.current.grounded){foot.current.wave=2.1333334;e.preventDefault();}
   if(action){e.preventDefault();input.current[action]=true;if(k===' '&&!e.repeat&&session.mode==='on-foot')foot.current.jumpBuffer=FOOT_PROFILE.buffer;}
  };
  const reset=()=>{clear.current();parkDrive(state.current);foot.current.vx=0;foot.current.vz=0;align();};
  const visibility=()=>{if(document.hidden)reset();};
  const pointers=activePointers.current;
  const down=(e:PointerEvent)=>{
   if(e.button!==2&&e.pointerType!=='touch'&&!(session.mode==='on-foot'&&e.button===0))return;
   pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});look.current.dragging=true;gl.domElement.setPointerCapture(e.pointerId);
  };
  const move=(e:PointerEvent)=>{
   const pointer=pointers.get(e.pointerId);if(!pointer||!look.current.dragging)return;
   const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
   if(pointers.size===2&&session.mode==='on-foot'){
    const pair=[...pointers.values()],before=Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y);
    pointer.x=e.clientX;pointer.y=e.clientY;const after=Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y);
    if(before>1&&after>1)zoomFootCamera(session.footCamera,Math.log(before/after)*1000);
   }else{
    pointer.x=e.clientX;pointer.y=e.clientY;
    if(session.mode==='driving'){look.current.yaw-=dx*.006;look.current.pitch=Math.max(-1,Math.min(1,look.current.pitch+dy*.005));}
    else orbitFootCamera(session.footCamera,dx,dy);
   }
  };
  const up=(e:PointerEvent)=>{pointers.delete(e.pointerId);look.current.dragging=pointers.size>0;look.current.delay=1;};
  const wheel=(e:WheelEvent)=>{if(session.mode!=='on-foot')return;e.preventDefault();zoomFootCamera(session.footCamera,e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?window.innerHeight:1));};
  const menu=(e:Event)=>e.preventDefault();
  window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',reset);document.addEventListener('visibilitychange',visibility);
  const canvas=gl.domElement,oldTouchAction=canvas.style.touchAction;canvas.style.touchAction='none';canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('lostpointercapture',up);canvas.addEventListener('contextmenu',menu);canvas.addEventListener('wheel',wheel,{passive:false});
  return()=>{clear.current();canvas.style.touchAction=oldTouchAction;window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',visibility);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('lostpointercapture',up);canvas.removeEventListener('contextmenu',menu);canvas.removeEventListener('wheel',wheel);delete canvas.dataset.cityDriving;delete canvas.dataset.cityDrivePerformance;delete canvas.dataset.cityExploration;};
 },[active,gl,session,landBusy]);
 const desired=useRef(new Vector3()),target=useRef(new Vector3()),lookTarget=useRef(new Vector3()),movementDirection=useRef(new Vector3());
 const costs=useRef(new Float32Array(240)),costIndex=useRef(0),costCount=useRef(0);
 useFrame((_,dt)=>{
  if(!active||document.hidden)return;
  if(landBusy){resumeLand.current=true;if(pedestrian.current){pedestrian.current.position.set(foot.current.x,foot.current.y,foot.current.z);pedestrian.current.rotation.y=foot.current.heading;}Object.assign(displayFoot.current,foot.current);gl.domElement.dataset.cityLand=JSON.stringify({phase:land?.phase,plot:land?.selected?.id});return;}
  gl.domElement.dataset.cityLand=JSON.stringify({phase:'exploring',near:nearPlot?.id});
  const started=performance.now(),d=Math.min(dt,.1),onFoot=session.mode==='on-foot';simulation.current+=d;
  viewCamera.getWorldDirection(movementDirection.current);const movementHeading=cameraReady.current?Math.atan2(movementDirection.current.x,movementDirection.current.z):session.footCamera.heading;
  while(simulation.current>=DRIVE_PROFILE.step){
   if(onFoot){Object.assign(previousFoot.current,foot.current);advanceFoot(foot.current,input.current,movementHeading,DRIVE_PROFILE.step,walkingWorld);}
   else {Object.assign(previous.current,state.current);advanceDrive(state.current,input.current,DRIVE_PROFILE.step,world);}
   simulation.current-=DRIVE_PROFILE.step;
  }
  const s=state.current,f=foot.current;
  if(onFoot){if(f.grounded&&walkingWorld.clear(f.x,f.z,FOOT_PROFILE.radius+.08)){session.safeFoot.x=f.x;session.safeFoot.z=f.z;session.safeFoot.heading=f.heading;}}
  else {const roadDistance=Math.min(Math.abs(s.x-Math.round(s.x/66)*66),Math.abs(s.z-Math.round(s.z/66)*66));if(roadDistance<3&&world.clear(s.x,s.z,DRIVE_PROFILE.radius+.2)){session.safeCar.x=s.x;session.safeCar.z=s.z;session.safeCar.heading=s.heading;}}
  const v=interpolateDrive(display.current,previous.current,s,simulation.current/DRIVE_PROFILE.step),p=interpolateFoot(displayFoot.current,previousFoot.current,f,simulation.current/DRIVE_PROFILE.step);
  if(car.current){car.current.position.set(v.x,0,v.z);car.current.rotation.y=v.heading;}
  if(pedestrian.current){pedestrian.current.position.set(p.x,p.y,p.z);pedestrian.current.rotation.y=p.heading;}
  if(!look.current.dragging&& !onFoot){look.current.delay-=d;if(look.current.delay<=0){look.current.yaw=Math.atan2(Math.sin(look.current.yaw),Math.cos(look.current.yaw))*Math.exp(-3*d);look.current.pitch*=Math.exp(-3*d);}}
  const actor=onFoot?p:v,heading=onFoot?session.footCamera.heading:v.heading+look.current.yaw,speed=Math.min(1,Math.hypot(v.vx,v.vz)/24),distance=onFoot?session.footCamera.distance:9+(reduced?0:speed*2);
  const baseHeight=onFoot?p.y:0;
  const horizontal=onFoot?Math.cos(session.footCamera.pitch)*distance:distance;
  desired.current.set(actor.x-Math.sin(heading)*horizontal,onFoot?baseHeight+1.15+Math.sin(session.footCamera.pitch)*distance:4.8+look.current.pitch*2+(reduced?0:speed*.5),actor.z-Math.cos(heading)*horizontal);
  if(onFoot)desired.current.y=Math.max(desired.current.y,pavementHeight(desired.current.x,desired.current.z)+.35);
  let hit=onFoot?walkingWorld.sweepCamera(actor.x,baseHeight+1.15,actor.z,desired.current.x-actor.x,desired.current.y-baseHeight-1.15,desired.current.z-actor.z,.3):world.sweep(actor.x,actor.z,desired.current.x-actor.x,desired.current.z-actor.z,.3);
  if(hit.t<1){if(onFoot)desired.current.y=baseHeight+1.15+(desired.current.y-baseHeight-1.15)*Math.max(0,hit.t-.015);desired.current.x=actor.x+(desired.current.x-actor.x)*Math.max(0,hit.t-.015);desired.current.z=actor.z+(desired.current.z-actor.z)*Math.max(0,hit.t-.015);}
  lookTarget.current.set(actor.x+(onFoot?0:Math.sin(heading)*3+v.vx*.12),baseHeight+(onFoot?1.15:1.3),actor.z+(onFoot?0:Math.cos(heading)*3+v.vz*.12));
  if(!cameraReady.current){viewCamera.position.copy(desired.current);target.current.copy(lookTarget.current);cameraReady.current=true;}else {const blend=1-Math.exp(-(reduced?4:7)*d);viewCamera.position.lerp(desired.current,blend);target.current.lerp(lookTarget.current,blend);}
  hit=onFoot?walkingWorld.sweepCamera(actor.x,baseHeight+1.15,actor.z,viewCamera.position.x-actor.x,viewCamera.position.y-baseHeight-1.15,viewCamera.position.z-actor.z,.3):world.sweep(actor.x,actor.z,viewCamera.position.x-actor.x,viewCamera.position.z-actor.z,.3);
  if(hit.t<1){if(onFoot)viewCamera.position.y=baseHeight+1.15+(viewCamera.position.y-baseHeight-1.15)*Math.max(0,hit.t-.015);viewCamera.position.x=actor.x+(viewCamera.position.x-actor.x)*Math.max(0,hit.t-.015);viewCamera.position.z=actor.z+(viewCamera.position.z-actor.z)*Math.max(0,hit.t-.015);}
  if(onFoot)viewCamera.position.y=Math.max(viewCamera.position.y,pavementHeight(viewCamera.position.x,viewCamera.position.z)+.35);
  viewCamera.lookAt(target.current);
  const fov=60+(reduced||onFoot?0:speed*5),next=reduced?60:viewCamera.fov+(fov-viewCamera.fov)*(1-Math.exp(-4*d));if(Math.abs(next-viewCamera.fov)>.01){viewCamera.fov=next;viewCamera.updateProjectionMatrix();}
  costs.current[costIndex.current++%240]=performance.now()-started;costCount.current=Math.min(240,costCount.current+1);
  timer.current+=dt;if(timer.current>.2){timer.current=0;const nearby=onFoot?nearestPlot():null;setNearPlot(prev=>prev?.id===nearby?.id&&prev?.revision===nearby?.revision?prev:nearby);onRegion(logicalAxis(actor.x),logicalAxis(actor.z));gl.domElement.dataset.cityDriving=JSON.stringify(v);gl.domElement.dataset.cityExploration=JSON.stringify({mode:session.mode,foot:p,camera:session.footCamera,character:readiness.current});const samples=Array.from(costs.current.subarray(0,costCount.current)).sort((a,b)=>a-b);gl.domElement.dataset.cityDrivePerformance=JSON.stringify({p95:samples[Math.floor(samples.length*.95)],samples:samples.length});}
 },-1);
 const hold=(key:keyof ReturnType<typeof empty>)=>({onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);input.current[key]=true;},onPointerUp:()=>{input.current[key]=false;},onPointerCancel:()=>{input.current[key]=false;},onLostPointerCapture:()=>{input.current[key]=false;}});
 const onFoot=mode==='on-foot';
 return <><primitive object={viewCamera}>{active&&!landBusy&&<Html position={[0,0,-1]} fullscreen style={{pointerEvents:'none'}}><div className="city-drive-controls" role="region" aria-label={onFoot?'Walking controls':'Driving controls'}>
 <div className="city-drive-touch">{(onFoot?[['left','Left'],['forward','Run'],['reverse','Back'],['right','Right'],['walk','Walk']]:[['left','Steer left'],['forward','Accelerate'],['reverse','Reverse'],['right','Steer right'],['brake','Handbrake']]).map(([key,label])=><button key={key} type="button" {...hold(key as keyof DriveInput|'walk')}>{label}</button>)}{onFoot&&<button type="button" onPointerDown={()=>{foot.current.jumpBuffer=FOOT_PROFILE.buffer;}}>Jump</button>}</div>
 {onFoot&&nearPlot&&<span className="city-explore-hint">E · {nearPlot.owner?'Edit building':`View plot · ${landPrice(nearPlot)}`}</span>}
 {hint&&<span className="city-explore-hint" role="status">{hint}</span>}
 {onFoot&&<button type="button" onClick={()=>{if(foot.current.grounded)foot.current.wave=2.1333334;}} title="Wave (G)">Wave</button>}
 {land?.error&&<span role="alert">{land.error}<button onClick={()=>void land.retry()}>Retry test world</button></span>}
 {land&&<button onClick={()=>setResetConfirm(true)}>Reset test world</button>}
 {resetConfirm&&<span role="alertdialog" aria-label="Reset test world">Remove all local plots and buildings? <button onClick={()=>{void land?.reset();setResetConfirm(false);}}>Confirm reset</button><button onClick={()=>setResetConfirm(false)}>Keep world</button></span>}
 {status==='error'&&<button type="button" onClick={()=>setRetry(n=>n+1)}>Retry character</button>}
 <button type="button" onClick={()=>interact.current()} title={onFoot?'Enter car (E)':'Exit car (E)'}>{onFoot?(nearPlot?(nearPlot.owner?'Edit building':`View plot · ${landPrice(nearPlot)}`):'Enter car'):status==='loading'?'Character loading…':'Exit car'}</button>
 <button type="button" onClick={()=>recover.current()} title="Return to safe road (R)">Recover</button><button type="button" onClick={()=>leave.current()}>Back to map</button>
 </div></Html>}</primitive>
 {active&&landBusy&&land?.selected&&land.draft&&<CityLandEditor land={land} session={session} camera={viewCamera} reduced={reduced}/>}
 <group ref={car} visible={active}><CityDriveCar motion={display} reduced={reduced} active={active}/></group>
 <group ref={pedestrian} visible={active&&onFoot}><CityCharacter motion={displayFoot} active={active&&onFoot} onStatus={onStatus} retry={retry}/></group></>;
}
