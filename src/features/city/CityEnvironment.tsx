import {PMREMGenerator,type Node} from "three/webgpu";
import {color,mix,screenUV,smoothstep} from "three/tsl";
import {cityGpu} from "./cityRenderer";
import {setCityReflection} from "./cityReflections";
import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AgXToneMapping, Color, DataTexture, DirectionalLight, EquirectangularReflectionMapping, FloatType, Fog, Object3D, PCFShadowMap, RGBAFormat, Vector3 } from "three";
import { CITY_LOOKS, useCityLook } from "./CityLook";

const CityScreenOcclusion=lazy(()=>import("./CityScreenOcclusion"));

/** One prefiltered reflection environment for the entire canvas, never a live cube camera. */
export function CityEnvironment({preview=false,driving=false,lowPower=false}:{preview?:boolean;driving?:boolean;lowPower?:boolean}){
 useFrame(()=>{cityGpu(gl).info.reset();},0);
 const settings=useCityLook(), look=CITY_LOOKS[settings.look];
 const {gl,scene,camera,invalidate}=useThree();
 const sun=useRef<DirectionalLight>(null);
 const target=useMemo(()=>new Object3D(),[]), direction=useMemo(()=>new Vector3(),[]);
 const shadows=settings.quality==="high"&&!lowPower;
 const radius=preview?28:100;
 const fog=useMemo(()=>new Fog(look.horizon,60,140),[]);
 useEffect(()=>{fog.color.set(look.horizon);fog.near=preview?60:driving?190:850;fog.far=preview?140:driving?470:1600;invalidate();},[fog,look,preview,driving,invalidate]);
 useEffect(()=>{
   const tone=gl.toneMapping,exposure=gl.toneMappingExposure;
   gl.toneMapping=AgXToneMapping;gl.toneMappingExposure=look.exposure;
   const width=128,height=64,data=new Float32Array(width*height*4);
   const sky=new Color(look.sky),horizon=new Color(look.horizon),ground=new Color(look.ground),warm=new Color(look.sun),sample=new Color();
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     const altitude=-Math.cos(Math.PI*(y+.5)/height);
     sample.copy(horizon).lerp(altitude>0?sky:ground,Math.pow(Math.abs(altitude),.55));
     // Broad bright sky patches give glass legible highlights at city scale.
     const patch=Math.exp(-Math.pow((x/width-.32)/.12,2)-Math.pow((y/height-.74)/.13,2));
     sample.r+=warm.r*patch*1.8;sample.g+=warm.g*patch*1.8;sample.b+=warm.b*patch*1.8;
     const i=(y*width+x)*4;data[i]=sample.r;data[i+1]=sample.g;data[i+2]=sample.b;data[i+3]=1;
   }
   const texture=new DataTexture(data,width,height,RGBAFormat,FloatType);texture.mapping=EquirectangularReflectionMapping;texture.needsUpdate=true;
   const generator=new PMREMGenerator(cityGpu(gl)),environment=generator.fromEquirectangular(texture);
   const oldEnvironment=setCityReflection(scene,environment.texture);
   texture.dispose();generator.dispose();invalidate();
   return()=>{setCityReflection(scene,oldEnvironment);environment.dispose();gl.toneMapping=tone;gl.toneMappingExposure=exposure;};
 },[gl,scene,look,invalidate]);
 useEffect(()=>{const enabled=gl.shadowMap.enabled,type=gl.shadowMap.type;gl.shadowMap.enabled=shadows;gl.shadowMap.type=PCFShadowMap;invalidate();return()=>{gl.shadowMap.enabled=enabled;gl.shadowMap.type=type;};},[gl,shadows,invalidate]);
 useFrame(()=>{
   if(!sun.current)return;
   camera.getWorldDirection(direction);
   const distance=Math.abs(direction.y)>.1?Math.max(0,-camera.position.y/direction.y):50;
   const step=radius*2/1024;
   const x=preview?0:Math.round((camera.position.x+direction.x*distance)/step)*step;
   const z=preview?0:Math.round((camera.position.z+direction.z*distance)/step)*step;
   target.position.set(x,0,z);target.updateMatrixWorld();
   sun.current.position.set(x-100,settings.look==="afternoon"?110:180,z+90);
 });
 useEffect(()=>{
   const nodeScene=scene as typeof scene & {backgroundNode:Node|null};
   const old=nodeScene.backgroundNode;
   nodeScene.backgroundNode=mix(color(look.horizon),color(look.sky),smoothstep(.15,1,screenUV.y.oneMinus()));
   invalidate();return()=>{nodeScene.backgroundNode=old;};
 },[scene,look,invalidate]);
 return <>
   {settings.occlusion==="screen"&&!lowPower&&<Suspense fallback={null}><CityScreenOcclusion/></Suspense>}
   <primitive attach="fog" object={fog}/>
   <hemisphereLight args={[look.fill,look.ground,look.hemisphere]}/>
   <ambientLight intensity={.12} color={look.horizon}/>
   <primitive object={target}/>
   <directionalLight ref={sun} target={target} position={[-100,180,90]} color={look.sun} intensity={look.intensity} castShadow={shadows}
     shadow-mapSize={[1024,1024]} shadow-bias={-.00015} shadow-normalBias={.08}
     shadow-camera-left={-radius} shadow-camera-right={radius} shadow-camera-top={radius} shadow-camera-bottom={-radius} shadow-camera-near={1} shadow-camera-far={500}/>
 </>;
}
