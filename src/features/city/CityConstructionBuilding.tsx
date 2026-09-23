import {useEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Group} from 'three';
import type {CityProperty} from '../../domain/city';
import {landPosition,type LandPlot} from '../../domain/cityLand';
import {CityPreparedBuildings} from './CityDesignBuildings';
import {usePreparedCity,type CityPreparationStatus} from './usePreparedCity';
import type {CityLandController} from './useCityLand';

const fingerprint=(p:CityProperty|null|undefined)=>p?JSON.stringify([p.id,p.profile.buildingDesign,p.profile.color,p.profile.name,p.profile.logo]):'';
/** One vertical transform for building and signs; plot surfaces and grounding stay outside it. */
export function CityConstructionBuilding({property,plot,land}:{property:CityProperty;plot:LandPlot;land:CityLandController}){
 const group=useRef<Group>(null),{gl}=useThree();
 const [preparation,setPreparation]=useState<CityPreparationStatus>({pending:true,error:null});
 const requested=useMemo(()=>[property],[property]);
 const prepared=usePreparedCity(requested,true,true,true,{retry:land.previewRetry,onStatus:setPreparation});
 const [shown,setShown]=useState<CityProperty|null>(null),[animating,setAnimating]=useState(false);
 const wanted=fingerprint(property),candidate=prepared[0],candidateKey=fingerprint(candidate),shownKey=fingerprint(shown);
 const shownPreset=useRef(land.presetRevision);
 const desired=useRef(wanted);desired.current=wanted;
 const animation=useRef({phase:'idle' as 'idle'|'out'|'in',elapsed:0,next:null as CityProperty|null,key:''});
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const {x,z}=landPosition(plot),visible=useMemo(()=>shown?[shown]:[],[shown]);
 useEffect(()=>{
  if(candidateKey!==wanted||!candidate||candidateKey===shownKey)return;
  const a=animation.current;a.next=candidate;a.key=candidateKey;a.elapsed=0;
  if(reduced||!shown||shownPreset.current===land.presetRevision){shownPreset.current=land.presetRevision;setShown(candidate);a.phase='idle';setAnimating(false);if(group.current)group.current.scale.set(1,1,1);}
  else {a.phase='out';setAnimating(true);}
 },[candidateKey,wanted,land.previewRetry,land.presetRevision,reduced]);
 useEffect(()=>{
  land.setPreviewStatus({pending:!preparation.error&&(preparation.pending||shownKey!==wanted||animating),error:preparation.error});
 },[preparation.pending,preparation.error,shownKey,wanted,animating,land.setPreviewStatus]);
 useEffect(()=>()=>land.setPreviewStatus({pending:false,error:null}),[land.setPreviewStatus]);
 useEffect(()=>{gl.domElement.dataset.cityPreparedBuildings=shown?'1':'0';},[gl,shown]);
 useFrame((_,dt)=>{
  const a=animation.current,g=group.current;if(!g)return;
  if(a.phase==='out'&&a.key!==desired.current){a.phase='idle';g.scale.set(1,1,1);setAnimating(false);}
  if(a.phase==='out'){
   a.elapsed+=Math.min(dt,.05);const t=Math.min(1,a.elapsed/.16);g.scale.set(1,Math.max(0,1-t*t),1);
   if(t===1){shownPreset.current=land.presetRevision;setShown(a.next);a.phase='in';a.elapsed=0;}
  }else if(a.phase==='in'){
   a.elapsed+=Math.min(dt,.05);const t=Math.min(1,a.elapsed/.3);
   g.scale.set(1,1-Math.pow(1-t,3),1);
   if(t===1){a.phase='idle';g.scale.set(1,1,1);setAnimating(false);}
  }
  gl.domElement.dataset.cityConstruction=JSON.stringify({pending:preparation.pending||shownKey!==wanted||a.phase!=='idle',phase:a.phase,scale:g.scale.y,scaleXYZ:g.scale.toArray(),shown:shown?.profile.buildingDesign?.blueprint,wanted:property.profile.buildingDesign?.blueprint,error:preparation.error});
 });
 const datum=.25*plot.size/24;
 return <><CityPreparedBuildings properties={visible} reduced layer="grounds"/><group name="construction-building-rise" ref={group} position={[x,datum,z]}><group position={[-x,-datum,-z]}><CityPreparedBuildings properties={visible} reduced layer="building"/></group></group></>;
}
