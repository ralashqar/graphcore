import {useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {AnimationMixer,LoopOnce,Mesh,MeshStandardMaterial,Group,type AnimationAction} from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {CITY_CHARACTER_MANIFEST as manifest,type CityCharacterSkin} from '../../domain/cityCharacter';
import type {FootState} from '../../domain/cityExploration';
import {useCityReflection} from './cityReflections';
const loader=new GLTFLoader(),skins=new Map<CityCharacterSkin,Promise<GLTF>>();
let clips:Promise<GLTF>|undefined;
export function preloadCityCharacter(skin:CityCharacterSkin='ranger'){
 let model=skins.get(skin);if(!model){model=loader.loadAsync(manifest.skins[skin].url).catch(e=>{skins.delete(skin);throw e;});skins.set(skin,model);}
 clips??=loader.loadAsync(manifest.clips).then(a=>{if(!manifest.clipNames.every(name=>a.animations.some(c=>c.name===name)))throw Error('Incomplete City animation library');return a;}).catch(e=>{clips=undefined;throw e;});
 return Promise.all([model,clips]).then(([model,animations])=>({model,animations}));
}
export type CharacterStatus='loading'|'ready'|'error';
export function CityCharacter({motion,active,onStatus,retry,skin='ranger'}:{motion:RefObject<FootState>;active:boolean;onStatus:(s:CharacterStatus)=>void;retry:number;skin?:CityCharacterSkin}){
 const [asset,setAsset]=useState<Awaited<ReturnType<typeof preloadCityCharacter>>|null>(null),gl=useThree(s=>s.gl),reflection=useCityReflection();
 useEffect(()=>{let live=true;onStatus('loading');void preloadCityCharacter(skin).then(a=>{if(live){setAsset(a);onStatus('ready');}}).catch(()=>{if(live)onStatus('error');});return()=>{live=false;};},[retry,skin,onStatus]);
 const model=useMemo(()=>{
  if(!asset)return null;const scene=clone(asset.model.scene),materials=new Map<MeshStandardMaterial,MeshStandardMaterial>();
  scene.traverse(o=>{if(o instanceof Mesh){const original=o.material as MeshStandardMaterial;let m=materials.get(original);if(!m){m=original.clone();m.roughness=.85;m.metalness=0;materials.set(original,m);}o.material=m;o.castShadow=true; // Animated bounds must not discard limbs at the frustum edge.
   o.frustumCulled=false;}});
  const mixer=new AnimationMixer(scene),actions:Record<string,AnimationAction>={};
  for(const clip of asset.animations.animations){const a=mixer.clipAction(clip);if(['jump','land','wave'].includes(clip.name)){a.setLoop(LoopOnce,1);a.clampWhenFinished=true;}a.play().setEffectiveWeight(0);actions[clip.name]=a;}
  actions.idle.setEffectiveWeight(1);mixer.update(0);
  const root=new Group();root.add(scene);root.scale.setScalar(1.8/2.27495116298);root.position.y=.00202530925*root.scale.y;
  return {root,scene,mixer,actions,entries:Object.entries(actions),materials:[...materials.values()]};
 },[asset]);
 useEffect(()=>{if(model)for(const m of model.materials){m.envMap=reflection;m.envMapIntensity=.2;m.needsUpdate=true;}},[model,reflection]);
 useEffect(()=>()=>{model?.mixer.stopAllAction();if(model)model.mixer.uncacheRoot(model.scene);model?.materials.forEach(m=>m.dispose());},[model]);
 const current=useRef('');
 useFrame((_,dt)=>{
  if(!model||!active||document.hidden)return;const s=motion.current,d=Math.min(dt,.1);
  const action=!s.grounded?(s.airTime<.13?'jump':'airborne'):s.land>0?'land':s.wave>0?'wave':'locomotion';
  if(action!==current.current){if(action!=='locomotion')model.actions[action]?.reset().play();current.current=action;gl.domElement.dataset.cityCharacterAnimation=action;}
  const moving=Math.min(1,s.speed/.3),running=Math.max(0,Math.min(1,(s.speed-2.2)/(5.5-2.2)));
  for(const [name,a] of model.entries){
   const wanted=action==='locomotion'?(name==='idle'?1-moving:name==='walk'?moving*(1-running):name==='run'?moving*running:0):name===action?1:0;
   // Fast full-body cancellation for a wave; no overlay on moving/jumping poses.
   a.setEffectiveWeight(a.getEffectiveWeight()+(wanted-a.getEffectiveWeight())*(1-Math.exp(-24*d)));
   if(name==='walk')a.setEffectiveTimeScale(Math.max(.65,Math.min(1.5,s.speed/2.2)));if(name==='run')a.setEffectiveTimeScale(Math.max(.7,Math.min(1.25,s.speed/5.5)));
  }
  if(action==='jump'||action==='land'){const a=model.actions[action];a.paused=true;a.time=Math.min(1,action==='jump'?s.airTime/.13:(.15-s.land)/.15)*a.getClip().duration;}
  model.mixer.update(d);
 });
 useEffect(()=>{gl.domElement.dataset.cityCharacter=asset?skin:'loading';return()=>{delete gl.domElement.dataset.cityCharacter;delete gl.domElement.dataset.cityCharacterAnimation;};},[asset,skin,gl]);
 return model?<primitive object={model.root} dispose={null}/>:null;
}
