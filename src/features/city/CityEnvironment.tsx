import {PMREMGenerator,type Node} from "three/webgpu";
import {Fn,color,luminance,mix,output,positionWorld,rangeFogFactor,screenUV,smoothstep,uniform,vec3,vec4} from "three/tsl";
import {cityGpu} from "./cityRenderer";
import {setCityReflection} from "./cityReflections";
import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AgXToneMapping, Color, DataTexture, DirectionalLight, EquirectangularReflectionMapping, FloatType, Fog, Object3D, PCFShadowMap, RGBAFormat, Vector2, Vector3, type OrthographicCamera } from "three";
import { isolateRadii, studioIsolate } from "./cityStudioIsolate";
import { CITY_LOOKS, useCityLook } from "./CityLook";

const CityScreenOcclusion=lazy(()=>import("./CityScreenOcclusion"));
const WHITE=new Color(1,1,1);
const isoKey=(iso:{plotId:string|null;x:number;z:number;size:number},shadow:number)=>JSON.stringify({on:true,plot:iso.plotId,center:[iso.x,iso.z],fade:isolateRadii(iso.size),shadowRadius:shadow});

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
 // The scene fog as one node: the usual camera-range haze plus the studio Isolate frame, a light desaturated
 // silhouette beyond ~40 m of the edited plot. Installed once per canvas; Isolate on/off only moves uniforms, so no
 // material recompiles when toggling.
 const framing=useMemo(()=>{
   const u={center:uniform(new Vector2()),amount:uniform(0),inner:uniform(40),outer:uniform(62),tint:uniform(new Color()),haze:uniform(new Color()),near:uniform(850),far:uniform(1600)};
   const node=Fn(()=>{
     const base=output.rgb,k=smoothstep(u.inner,u.outer,positionWorld.xz.sub(u.center).length()).mul(u.amount);
     const framed=mix(base,mix(vec3(luminance(base)),u.tint,.8),k);
     return vec4(mix(framed,u.haze,rangeFogFactor(u.near,u.far)),output.a);
   })();
   return {...u,node};
 },[]);
 useEffect(()=>{const nodeScene=scene as typeof scene&{fogNode:Node|null};const old=nodeScene.fogNode;nodeScene.fogNode=framing.node;invalidate();return()=>{nodeScene.fogNode=old;};},[scene,framing,invalidate]);
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
 const shadowRadius=useRef(radius);
 useFrame(()=>{
   const iso=studioIsolate();
   framing.haze.value.copy(fog.color);framing.near.value=fog.near;framing.far.value=fog.far;
   framing.amount.value=iso.on?1:0;
   if(iso.on){const r=isolateRadii(iso.size);framing.center.value.set(iso.x,iso.z);framing.inner.value=r.inner;framing.outer.value=r.outer;framing.tint.value.copy(fog.color).lerp(WHITE,.45);}
   if(!sun.current)return;
   // Isolate: the sun's shadow map covers only the edited plot (and so only its casters), at a sharper texel size.
   const r=iso.on?Math.max(24,iso.size*.8):radius,cam=sun.current.shadow.camera as OrthographicCamera;
   if(shadowRadius.current!==r||cam.right!==r){shadowRadius.current=r;cam.left=-r;cam.right=r;cam.top=r;cam.bottom=-r;cam.updateProjectionMatrix();}
   if(iso.on){target.position.set(iso.x,0,iso.z);target.updateMatrixWorld();sun.current.position.set(iso.x-100,settings.look==="afternoon"?110:180,iso.z+90);
     if(import.meta.env.DEV&&gl.domElement.dataset.cityIsolate!==isoKey(iso,r))gl.domElement.dataset.cityIsolate=isoKey(iso,r);return;}
   if(import.meta.env.DEV&&gl.domElement.dataset.cityIsolate)delete gl.domElement.dataset.cityIsolate;
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
