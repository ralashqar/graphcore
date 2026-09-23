import {useEffect,useMemo,useRef,useState} from 'react';
import {Html,OrbitControls} from '@react-three/drei';
import {useFrame,useThree,type ThreeEvent} from '@react-three/fiber';
import {Group,Plane,Raycaster,Vector2,Vector3,type PerspectiveCamera} from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import {applyComposition,COMPOSITIONS,type CityBuildingDesignV3} from '../../domain/cityBuildingV3';
import {brandPalette} from '../../domain/cityBuildingV2';
import {presetCategory} from '../../domain/cityBuildingArchetypes';
import {landPrice,fitLandDesign,landEntrance,landPosition,type LandDraft} from '../../domain/cityLand';
import {pavementHeight} from '../../domain/cityDriveWorld';
import type {ExplorationSession} from '../../domain/cityExploration';
import type {CityLandController} from './useCityLand';
import {plotLocal,createLandSignMaterial} from './CityLandScene';
import './cityLand.css';
import {startSculpt} from './CitySculptControls';
import {CityVolumeSculptControls} from './CityVolumeSculptControls';
import {sculptFromPreset} from '../../domain/citySculpt';
import {CityLandTiles} from './CityLandTiles';

const MODES=['Building','Grounds','Nature','Style','Branding'] as const;
const PALETTES=[['Sage','#54796b'],['Terracotta','#b07758'],['Ocean','#43798f'],['Sand','#ac9872'],['Slate','#586474'],['Rose','#ab7780']] as const;
type Axis='width'|'depth'|'floors';
export function CityLandEditor({land,session,camera,reduced}:{land:CityLandController;session:ExplorationSession;camera:PerspectiveCamera;reduced:boolean}){
 const {gl,invalidate}=useThree(),controls=useRef<OrbitControlsImpl>(null),[mode,setMode]=useState<typeof MODES[number]>('Building'),[category,setCategory]=useState('All'),[builderTab,setBuilderTab]=useState<'presets'|'sculpt'|'tiles'>(land.draft?.builderMode==='sculpt'?'sculpt':'presets'),[dragging,setDragging]=useState(false),[ghost,setGhost]=useState<CityBuildingDesignV3|null>(null);
 const [reopenConfirm,setReopenConfirm]=useState(false);
 const celebrationMaterial=useMemo(()=>createLandSignMaterial(false,landPrice(land.selected!)),[]);
 useEffect(()=>()=>{celebrationMaterial.map?.dispose();celebrationMaterial.dispose();},[celebrationMaterial]);
 const telemetry=useRef(0);
 const phaseClock=useRef(0),from=useRef({x:0,z:0}),celebration=useRef<Group>(null),sign=useRef<Group>(null);
 const draft=land.draft!,plot=land.selected!,construction=land.phase==='construction',scale=plot.size/24,center=landPosition(plot),entrance=landEntrance(plot);
 const sculpting=construction&&draft.builderMode==='sculpt'&&!!draft.sculpt;
 const showSculpt=construction&&mode==='Building'&&builderTab==='sculpt'&&sculpting;
 const showTiles=construction&&mode==='Building'&&builderTab==='tiles';
 const d=draft.design,height=(d.groundHeight+Math.max(0,d.floors-1)*3+2)*scale;
 // Framing is captured on entry, not recomputed when the recipe changes.
 const target=useMemo(()=>new Vector3(center.x,height*.38,center.z),[plot.id]);
 const desired=useMemo(()=>new Vector3(),[]),aim=useMemo(()=>new Vector3(),[]);
 const drag=useRef<{axis:Axis;start:Vector3;plane:Plane;direction:Vector3;draft:LandDraft;value:CityBuildingDesignV3;pointer:number}|null>(null),ray=useMemo(()=>new Raycaster(),[]),mouse=useMemo(()=>new Vector2(),[]),point=useMemo(()=>new Vector3(),[]);
 const latest=useRef(land);latest.current=land;
 useEffect(()=>{phaseClock.current=0;from.current={x:session.foot.x,z:session.foot.z};},[land.phase]);
 useEffect(()=>{
  const move=(e:PointerEvent)=>{const r=drag.current;if(!r||r.pointer!==e.pointerId)return;const rect=gl.domElement.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(mouse,camera);if(!ray.ray.intersectPlane(r.plane,point))return;
   const delta=point.clone().sub(r.start).dot(r.direction)/scale,next={...r.draft.design};
   if(r.axis==='floors')next.middleFloors+=Math.round(delta/3);else next[r.axis]+=Math.round(delta*4)/2;
   r.value=fitLandDesign(next,plot.rotation);setGhost(r.value);invalidate();
  };
  const end=(e:PointerEvent)=>{const r=drag.current;if(!r||r.pointer!==e.pointerId)return;if(e.type!=='pointercancel')latest.current.edit({...r.draft,design:r.value});drag.current=null;setDragging(false);setGhost(null);if(controls.current)controls.current.enabled=true;if(gl.domElement.hasPointerCapture(e.pointerId))gl.domElement.releasePointerCapture(e.pointerId);};
  const cancel=()=>{if(drag.current&&gl.domElement.hasPointerCapture(drag.current.pointer))gl.domElement.releasePointerCapture(drag.current.pointer);drag.current=null;setDragging(false);setGhost(null);if(controls.current)controls.current.enabled=true;};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(drag.current)cancel();else void latest.current.close();}};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);window.addEventListener('blur',cancel);window.addEventListener('keydown',key);
  return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key);};
 },[gl,camera,scale,plot.rotation]);
 useFrame((_,dt)=>{
  phaseClock.current+=Math.min(dt,.1);const t=phaseClock.current;
  telemetry.current+=dt;if(construction&&telemetry.current>.2){telemetry.current=0;gl.domElement.dataset.cityConstructionCamera=JSON.stringify({position:camera.position.toArray(),target:target.toArray()});const rect=gl.domElement.getBoundingClientRect();const positions={width:plotLocal(plot,d.width/2+.4/scale,height*.45/scale,0),depth:plotLocal(plot,0,height*.45/scale,d.depth/2+.4/scale),floors:plotLocal(plot,0,height/scale+.5/scale,0)};gl.domElement.dataset.cityLandHandles=JSON.stringify(Object.fromEntries(Object.entries(positions).map(([key,p])=>{const v=new Vector3(...p).project(camera);return [key,{x:rect.left+(v.x+1)*rect.width/2,y:rect.top+(1-v.y)*rect.height/2}]})));}

  if(land.phase==='staging'){
   const blend=reduced?1:Math.min(1,t/.6);session.foot.x=from.current.x+(entrance.x-from.current.x)*blend;session.foot.z=from.current.z+(entrance.z-from.current.z)*blend;session.foot.y=pavementHeight(session.foot.x,session.foot.z);session.foot.heading=entrance.heading;session.foot.speed=blend<1?2.2:0;
   if(blend===1){session.foot.speed=0;if(plot.owner)land.beginConstruction();else land.setPhase('inspection');}
  }
  if(!construction){
   const angle=plot.rotation*Math.PI/2,dist=plot.size*1.08;
   desired.set(center.x+Math.sin(angle+.35)*dist,Math.max(plot.size*.9,height+8),center.z+Math.cos(angle+.35)*dist);aim.set(center.x,height*.25,center.z);
   camera.position.lerp(desired,reduced?1:1-Math.exp(-5*dt));camera.lookAt(aim);camera.updateMatrixWorld();
  }
  if(land.phase==='celebration'){
   if(sign.current)sign.current.scale.setScalar(reduced?0:Math.max(0,1-t/.65));
   if(celebration.current)celebration.current.children.forEach((child,i)=>{const a=i*2.399;child.position.set(Math.cos(a)*(2+t*3),4+Math.sin(i*1.7)*2+t*4-t*t*4,Math.sin(a)*(2+t*3));child.rotation.x=t*(i%3+1);child.rotation.z=t;});
   if(t>(reduced?.15:1.1))land.beginConstruction();
  }
 });
 const start=(axis:Axis,e:ThreeEvent<PointerEvent>)=>{e.stopPropagation();const normal=camera.getWorldDirection(new Vector3()),direction=axis==='floors'?new Vector3(0,1,0):axis==='width'?new Vector3(Math.cos(plot.rotation*Math.PI/2),0,-Math.sin(plot.rotation*Math.PI/2)):new Vector3(Math.sin(plot.rotation*Math.PI/2),0,Math.cos(plot.rotation*Math.PI/2));drag.current={axis,start:e.point.clone(),plane:new Plane().setFromNormalAndCoplanarPoint(normal,e.point),direction,draft:structuredClone(draft),value:d,pointer:e.pointerId};setDragging(true);if(controls.current)controls.current.enabled=false;gl.domElement.setPointerCapture(e.pointerId);};
 const editDesign=(patch:Partial<CityBuildingDesignV3>)=>land.edit({...draft,design:{...d,...patch}});
 const dimension=(axis:Axis,delta:number)=>editDesign(axis==='floors'?{middleFloors:d.middleFloors+delta}:{[axis]:d[axis]+delta});
 const dimensions=ghost||d;
 return <>
 {construction&&<OrbitControls ref={controls} camera={camera} target={target} enablePan={false} enabled={!dragging} minDistance={plot.size*.55} maxDistance={plot.size*4} minPolarAngle={.12} maxPolarAngle={1.35} enableDamping dampingFactor={.12}/>}
 {construction&&!sculpting&&!land.previewStatus.error&&mode==='Building'&&builderTab==='presets'&&<group rotation={[0,plot.rotation*Math.PI/2,0]} position={[center.x,0,center.z]}>
  {(['width','depth','floors'] as const).map(axis=>{const pos:[number,number,number]=axis==='width'?[dimensions.width*scale/2+.4,height*.45,0]:axis==='depth'?[0,height*.45,dimensions.depth*scale/2+.4]:[0,(dimensions.groundHeight+(dimensions.floors-1)*3+2)*scale+.5,0];return <mesh key={axis} name={`land-handle-${axis}`} position={pos} onPointerDown={e=>start(axis,e)}><boxGeometry args={axis==='width'?[.22,Math.min(height,8),dimensions.depth*scale*.55]:axis==='depth'?[dimensions.width*scale*.55,Math.min(height,8),.22]:[dimensions.width*scale*.6,.22,dimensions.depth*scale*.6]}/><meshBasicMaterial color={axis==='floors'?'#e4bb60':'#7bddbe'} transparent opacity={.34} depthWrite={false}/>{ghost&&drag.current?.axis===axis&&<Html center style={{pointerEvents:'none'}}><span className="land-handle-label">{axis==='floors'?`${dimensions.floors} floors`:`${dimensions[axis]*scale} m`}</span></Html>}</mesh>;})}
 </group>}
 {showSculpt&&<CityVolumeSculptControls land={land} plot={plot} draft={draft} orbitEnabled={enabled=>{if(controls.current)controls.current.enabled=enabled;}} viewTopDown={()=>{camera.position.set(center.x,plot.size*2.1,center.z+.01);controls.current?.target.set(center.x,.1,center.z);controls.current?.update();invalidate();}}/>}
 {showTiles&&<CityLandTiles land={land} plot={plot} draft={draft}/>}
 {land.phase==='celebration'&&<><group ref={sign} position={plotLocal(plot,5,3,10.8)} rotation={[0,plot.rotation*Math.PI/2,0]}><mesh material={celebrationMaterial}><planeGeometry args={[5.2*scale,2.6*scale]}/></mesh></group>{!reduced&&<group ref={celebration} position={[center.x,1,center.z]}>{Array.from({length:36},(_,i)=><mesh key={i}><boxGeometry args={[.22,.07,.34]}/><meshBasicMaterial color={['#e6bb60','#e98973','#7ddcb5','#bfa7e3'][i%4]}/></mesh>)}</group>}</>}
 <primitive object={camera}><Html fullscreen position={[0,0,-1]} style={{pointerEvents:'none'}}><section className="city-land-ui" aria-label="Plot construction" onPointerDown={e=>e.stopPropagation()}>
 <header className="city-land-header"><div><small>LOCAL TEST WORLD · NO REAL PAYMENT</small><strong>{construction?draft.name:plot.owner?'Your land':'A place of your own'}</strong></div><div className="city-land-actions">{construction&&<><button disabled={!land.history.length||dragging} onClick={land.undo}>Undo</button><button disabled={!land.future.length||dragging} onClick={land.redo}>Redo</button><button className="land-primary" disabled={land.saving||dragging||land.previewStatus.pending||!!land.previewStatus.error} onClick={()=>void land.finish()}>Save &amp; Finish</button></>}<button disabled={land.phase==='purchasing'||land.saving} onClick={()=>void land.close()}>{construction?'Exit':'Cancel'}</button></div></header>
 {land.error&&<div role="alert" className="city-land-error">{land.error}{land.error.includes('changed in another tab')?<><button onClick={()=>setReopenConfirm(true)}>Reopen saved plot</button>{reopenConfirm&&<span role="alertdialog">Discard these unsaved edits and load the saved version?<button onClick={()=>{void land.reopen();setReopenConfirm(false);}}>Discard and reload</button><button onClick={()=>setReopenConfirm(false)}>Keep edits</button></span>}</>:<button onClick={()=>void land.retry()}>Retry save</button>}</div>}
 {!construction&&<div className="city-land-purchase"><span>{plot.size} × {plot.size} m · Fixed location</span><h2>{land.phase==='celebration'?'It’s yours!':'Build your corner of the city'}</h2><p>{land.phase==='celebration'?'Opening your building studio…':'Choose a building, shape it and make it your own.'}</p>{land.phase==='inspection'&&<button className="land-primary" onClick={()=>void land.purchase()}>Buy land · {landPrice(plot)} <small>Simulated purchase</small></button>}{land.phase==='purchasing'&&<p role="status">Saving your purchase…</p>}</div>}
 {construction&&<>
 <div className="city-land-preview-status" role="status" aria-live="polite">{land.previewStatus.error?<><span>{land.previewStatus.error}</span><button onClick={land.retryPreview}>Retry building</button></>:land.previewStatus.pending?<><span className="land-loading-spinner" aria-hidden="true"/>Preparing building… You can keep choosing presets.</>:null}</div>

 {!showSculpt&&!showTiles&&<aside className="city-land-panel"><h2>{mode}</h2>{mode==='Building'?<><p>Drag a highlighted face to resize. Drag elsewhere to orbit; scroll to zoom.</p>{(['width','depth','floors'] as const).map(axis=><div className="land-stepper" key={axis}><span>{axis}<b>{axis==='floors'?dimensions.floors:`${dimensions[axis]*scale} m`}</b></span><button aria-label={`Decrease ${axis}`} onClick={()=>dimension(axis,axis==='floors'?-1:-.5)}>−</button><button aria-label={`Increase ${axis}`} onClick={()=>dimension(axis,axis==='floors'?1:.5)}>+</button></div>)}<small>Dimensions snap to this building’s supported layout. Entrances remain street-facing.</small></>:mode==='Grounds'?<><p>Paving and enclosure</p>{(['garden','limestone','slate'] as const).map(tile=><button aria-pressed={d.tile===tile} key={tile} onClick={()=>editDesign({tile,pavingPattern:'classic',textures:{...d.textures,ground:tile==='garden'?'grass-lawn':'pavers',groundBorder:'concrete'}})}>{tile}</button>)}<label>Grass / paving<select value={d.textures?.ground||'none'} onChange={e=>editDesign({textures:{...d.textures,ground:e.target.value as 'grass-lawn'|'grass-meadow'|'grass-lush'|'pavers'|'none',groundBorder:'concrete'}})}><option value="none">Palette only</option><option value="grass-lawn">Short lawn</option><option value="grass-meadow">Meadow grass</option><option value="grass-lush">Lush grass</option><option value="pavers">Paving stones</option></select></label><label>Fence<select value={d.enclosure||'garden-wall'} onChange={e=>editDesign({enclosure:e.target.value as typeof d.enclosure})}><option value="garden-wall">Neutral garden wall</option><option value="open-rail">Open rail</option><option value="brick-court">Brick courtyard</option><option value="none">Open boundary</option></select></label></>:mode==='Nature'?<><p>Plants keep the path and building clear.</p>{(['minimal','garden','wooded'] as const).map(style=><button key={style} aria-pressed={draft.nature.style===style} onClick={()=>land.edit({...draft,nature:{...draft.nature,style}})}>{style}</button>)}<label>Density<input type="range" min="0" max="8" value={draft.nature.density} onChange={e=>land.edit({...draft,nature:{...draft.nature,density:Number(e.target.value)}})}/></label><button onClick={()=>land.edit({...draft,nature:{...draft.nature,seed:(draft.nature.seed+7919)%1000000}})}>Try another arrangement</button></>:mode==='Style'?<><p>A coordinated palette for walls, trim, glass and roof.</p>{PALETTES.map(([name,color])=><button key={name} onClick={()=>editDesign({palette:brandPalette(color)})}><i style={{background:color}}/>{name}</button>)}</>:<><label>Building name<input maxLength={60} value={draft.name} onChange={e=>land.edit({...draft,name:e.target.value})}/></label><label>Brand colour<input type="color" value={draft.color} onChange={e=>land.edit({...draft,color:e.target.value})}/></label><button onClick={()=>editDesign({palette:brandPalette(draft.color)})}>Coordinate building colours</button><label>Sign position<select value={d.slots['brand.roof']?'brand.roof':d.slots['brand.facade']?'brand.facade':'brand.entrance'} onChange={e=>editDesign({slots:{...d.slots,'brand.roof':null,'brand.facade':null,'brand.entrance':null,[e.target.value]:'brand'}})}><option value="brand.entrance">Entrance</option><option value="brand.facade">Facade</option><option value="brand.roof">Roof edge</option></select></label><small>Uses supported sign slots; unavailable placements retain their selection.</small></>}
 <div className="land-save-state" role="status">{land.saving?'Saving…':land.dirty?'Unsaved changes':'Saved on this device'}</div></aside>}
 <footer className="city-land-bottom"><nav aria-label="Construction modes">{MODES.map(m=><button key={m} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m}</button>)}</nav>{mode==='Building'&&<><div className="land-builder-tabs"><button aria-pressed={builderTab==='presets'} onClick={()=>{setBuilderTab('presets');if(sculpting)land.edit({...draft,builderMode:'preset'});}}>Presets</button><button aria-pressed={builderTab==='sculpt'} disabled={!draft.sculpt&&!sculptFromPreset(d)} title={!draft.sculpt&&!sculptFromPreset(d)?'This specialised architecture remains preset-only.':''} onClick={()=>{const next=startSculpt(draft);if(next){setBuilderTab('sculpt');if(!sculpting)land.edit(next);}}}>Sculpt</button><button aria-pressed={builderTab==='tiles'} onClick={()=>setBuilderTab('tiles')}>Tiles</button></div>{builderTab==='presets'&&!sculpting&&<><label className="land-category">Building type <select value={category} onChange={e=>setCategory(e.target.value)}>{['All',...new Set(COMPOSITIONS.map(p=>presetCategory(p.patch.archetype)))].map(c=><option key={c}>{c}</option>)}</select></label><div className="city-land-carousel">{COMPOSITIONS.map((p,i)=>category!=='All'&&presetCategory(p.patch.archetype)!==category?null:<button key={p.name} onClick={()=>{const design=applyComposition(d,i);land.editPreset({...draft,builderMode:'preset',sculpt:undefined,design:{...design,rotation:plot.rotation,enclosure:d.enclosure,synarcKit:design.generatorRevision==='city-office-4'?undefined:d.synarcKit}});}}><img src={`/city/presets/${p.name.toLowerCase().replaceAll(' ','-')}.webp`} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/><span>{p.name}</span></button>)}</div></>}</>}</footer>
 </>}
 </section></Html></primitive></>;
}
