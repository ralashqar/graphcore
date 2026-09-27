// Studio camera: eased view presets, interior floor framing and neighbour clearance (docs/city-studio-game-ux.md,
// "Camera glides" and "Camera clearance"). Moved out of CityStudio.tsx for studio UI v2.
import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Vector3,type PerspectiveCamera} from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import {easeInOutCubic,glideCameraPose,studioGlideEnabled,STUDIO_GLIDE_MS,type CameraPose,type Vec3} from '../studioCameraGlide';
import {studioClearanceBoxes,studioClearanceFraction,studioClearViewPosition,STUDIO_CLEARANCE_MARGIN} from '../../../domain/cityStudioCameraClearance';
import {useCityMapLayout} from '../CityMapLayout';
import {landPosition,type LandDraft,type LandPlot} from '../../../domain/cityLand';
import {sculptFloorBottom,sculptFloorTop,type SculptVolume} from '../../../domain/citySculpt';
import type {StudioRecipe} from '../../../domain/cityStudioTypes';
import type {CityLandController} from '../useCityLand';

export type StudioViewKind='top'|'front'|'orbit'|'focus';
export function useStudioCamera({land,plot,draft,recipe,camera,reduced,walking}:{land:CityLandController;plot:LandPlot;draft:LandDraft;recipe:StudioRecipe|null;camera:PerspectiveCamera;reduced:boolean;walking:boolean}){
 const controls=useRef<OrbitControlsImpl>(null),{invalidate}=useThree(),cameraSaved=useRef<{position:Vector3;target:Vector3}|null>(null);
 const center=landPosition(plot),scale=plot.size/24,target=useMemo(()=>new Vector3(center.x,6*scale,center.z),[plot.id]);// eslint-disable-line react-hooks/exhaustive-deps
 const glide=useRef<{from:CameraPose;to:CameraPose;start:number}|null>(null);
 // Neighbouring city and test-world buildings stream in around the plot. Presets, glides and zooming must never
 // leave the camera inside one (docs/city-studio-game-ux.md, "Camera clearance").
 const {plotAxis}=useCityMapLayout(),occupied=land.world?.occupied,landPlots=land.world?.plots;
 const cityClearance=useMemo(()=>studioClearanceBoxes((occupied??[]).map(p=>({id:p.id,x:p.x,z:p.z,tier:p.tier,design:p.profile.buildingDesign})),plot.id,plotAxis,plot.size),[occupied,plot.id,plot.size,plotAxis]);
 const landClearance=useMemo(()=>studioClearanceBoxes((landPlots??[]).flatMap(p=>{const built=p.finished??p.draft;return built&&p.id!==plot.id?[{id:p.id,x:p.x,z:p.z,design:built.design,centre:landPosition(p)}]:[];}),plot.id,plotAxis,plot.size),[landPlots,plot.id,plot.size,plotAxis]);
 const clearanceBoxes=useMemo(()=>[...cityClearance,...landClearance],[cityClearance,landClearance]);
 /** Pulls `position` towards `aim` until the sight line no longer enters a neighbouring building. */
 const clearPosition=(aim:Vector3,position:Vector3)=>{const t=studioClearanceFraction(aim,position,clearanceBoxes,STUDIO_CLEARANCE_MARGIN);if(t<1)position.sub(aim).multiplyScalar(t).add(aim);return t<1;};
 // Framed views keep their distance and rise over a neighbour; the per-frame clamp below only ever comes in.
 const glideTo=(aim:Vector3,position:Vector3)=>{const clear=studioClearViewPosition(aim,position,clearanceBoxes,STUDIO_CLEARANCE_MARGIN);position.set(clear.x,clear.y,clear.z);const c=controls.current;if(reduced||!c||!studioGlideEnabled()){c?.target.copy(aim);camera.position.copy(position);c?.update();invalidate();return;}glide.current={from:{position:camera.position.toArray() as Vec3,target:c.target.toArray() as Vec3},to:{position:position.toArray() as Vec3,target:aim.toArray() as Vec3},start:performance.now()};invalidate();};
 // Runs after OrbitControls (priority -1): glide first, then keep the drawn pose clear of neighbouring buildings.
 // Scaling along the sight line keeps the orientation, and the controls read the clamped radius next frame.
 useFrame(()=>{const g=glide.current,c=controls.current;if(!c||walking)return;
  if(g){const t=Math.min(1,(performance.now()-g.start)/STUDIO_GLIDE_MS),pose=glideCameraPose(g.from,g.to,easeInOutCubic(t));c.target.set(...pose.target);camera.position.set(...pose.position);c.update();if(t>=1)glide.current=null;invalidate();}
  if(clearPosition(c.target,camera.position)){camera.updateMatrixWorld();invalidate();}
 });
 useEffect(()=>{const c=controls.current;if(!c)return;const stop=()=>{glide.current=null;};c.addEventListener('start',stop);return()=>c.removeEventListener('start',stop);});
 const focusInteriorFloor=(level:number)=>{const aim=new Vector3(center.x,(sculptFloorBottom(level,draft.design.groundHeight,draft.design.upperHeight)+1.1)*scale,center.z);glideTo(aim,aim.clone().add(new Vector3(plot.size*.28,plot.size*1.05,plot.size*.52)));};
 const highestStorey=Math.max(1,...(recipe?.volumes.filter(v=>v.operation==='add').map(v=>v.startFloor+v.spanFloors)??[]));
 /** View presets; interior tools frame the active floor from above instead of the Top preset. */
 const view=(kind:StudioViewKind,ctx:{selected?:SculptVolume;interior:boolean;floor:number})=>{
  if(kind==='top'&&ctx.interior){focusInteriorFloor(ctx.floor);return;}
  const selected=ctx.selected,aim=kind==='focus'&&selected?new Vector3(selected.x*scale+center.x,sculptFloorTop(selected.startFloor+selected.spanFloors-1,draft.design.groundHeight,draft.design.upperHeight)*scale*.5,selected.z*scale+center.z):target.clone();
  let offset=kind==='top'?new Vector3(0,plot.size*1.6,.01):kind==='front'?new Vector3(0,6,plot.size*1.25):new Vector3(plot.size*.85,plot.size*.7,plot.size*.85);
  if(recipe?.studio.catalogue==='synarc-kit-5'&&kind!=='focus'){const height=(sculptFloorTop(highestStorey-1,draft.design.groundHeight,draft.design.upperHeight)+3)*scale;aim.y=height*.42;const radius=Math.hypot(plot.size*.5,height*.5),fov=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));offset=offset.normalize().multiplyScalar(radius/Math.sin(fov)*1.15);}
  glideTo(aim,aim.clone().add(offset));
 };
 /** Remembers the orbit pose before walking and restores it afterwards. */
 const saveForWalk=()=>{cameraSaved.current={position:camera.position.clone(),target:controls.current?.target.clone()??target.clone()};};
 useEffect(()=>{if(!walking&&cameraSaved.current){camera.position.copy(cameraSaved.current.position);controls.current?.target.copy(cameraSaved.current.target);controls.current?.update();cameraSaved.current=null;invalidate();}},[walking,camera,invalidate]);
 return {controls,target,center,scale,glide,view,focusInteriorFloor,saveForWalk,highestStorey};
}
export type StudioCamera=ReturnType<typeof useStudioCamera>;
