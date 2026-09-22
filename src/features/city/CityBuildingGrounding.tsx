import {useFrame} from "@react-three/fiber";
import {useEffect,useMemo,useRef,useState} from "react";
import {BoxGeometry,CylinderGeometry,Vector3,MeshBasicMaterial,PlaneGeometry,ShaderMaterial} from "three";
import {buildingMasses} from "../../domain/cityBuildingDesign";
import type {CityProperty} from "../../domain/city";
import {Batch,type Instance} from "./CityInstances";
import {useCityMapLayout} from "./CityMapLayout";
import {useCityLook} from "./CityLook";

/** Footprint-derived grounding and bounded low-detail shadow casters. No per-window shadow pass. */
export function CityBuildingGrounding({properties,center,reduced=true}:{properties:CityProperty[];center?:{x:number;z:number};reduced?:boolean}){
 const {quality}=useCityLook(),{plotAxis,plotSize}=useCityMapLayout();
 const [focus,setFocus]=useState({x:0,z:0});
 const scratch=useRef(new Vector3()),elapsed=useRef(0);
 // Driving keeps buildings resident. Refresh only the small caster selection as the camera travels.
 useFrame(({camera},dt)=>{if(quality!=="high"||!center)return;elapsed.current+=dt;if(elapsed.current<.5)return;elapsed.current=0;camera.getWorldDirection(scratch.current);const t=Math.abs(scratch.current.y)>.1?Math.max(0,-camera.position.y/scratch.current.y):40;const x=Math.round((camera.position.x+scratch.current.x*t)/32)*32,z=Math.round((camera.position.z+scratch.current.z*t)/32)*32;setFocus(old=>old.x===x&&old.z===z?old:{x,z});});
 const resources=useMemo(()=>({
   plane:new PlaneGeometry(1,1).rotateX(-Math.PI/2),box:new BoxGeometry(1,1,1),cylinder:new CylinderGeometry(.5,.5,1,16),
   proxy:new MeshBasicMaterial({colorWrite:false,depthWrite:false}),
   contact:new ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
     vertexShader:`varying vec2 vGround; void main(){vGround=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
     fragmentShader:`varying vec2 vGround;void main(){float edge=max(abs(vGround.x-.5),abs(vGround.y-.5));float shade=1.0-smoothstep(.43,.5,edge);gl_FragColor=vec4(.055,.075,.09,shade*.3);\n#include <colorspace_fragment>\n}`}),
 }),[]);
 useEffect(()=>()=>Object.values(resources).forEach(r=>r.dispose()),[resources]);
 const data=useMemo(()=>{
   const contacts:Instance[]=[],proxies:Instance[]=[],roundProxies:Instance[]=[];
   const nearest=new Set([...properties].sort((a,b)=>Math.hypot(plotAxis(a.x)-focus.x,plotAxis(a.z)-focus.z)-Math.hypot(plotAxis(b.x)-focus.x,plotAxis(b.z)-focus.z)).slice(0,24).map(p=>p.id));
   for(const p of properties){
     const d=p.profile.buildingDesign;if(!d||p.profile.buildingArt)continue;
     const masses=buildingMasses(d),base=Math.min(...masses.map(m=>m.y)),scale=plotSize/24,angle=d.rotation*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
     masses.forEach((m,i)=>{
       const item={key:`ground:${p.id}:${i}`,property:p,x:plotAxis(p.x)+(m.x*c+m.z*s)*scale,z:plotAxis(p.z)+(m.z*c-m.x*s)*scale,rotation:angle};
       if(m.y===base)contacts.push({...item,y:.312*scale,scale:[(m.width+1.1)*scale,1,(m.depth+1.1)*scale]});
       if(quality==="high"&&nearest.has(p.id))(d.version===3 && ["round-tower","ellipse-tower"].includes(d.archetype || "") ? roundProxies : proxies).push({...item,key:`shadow:${p.id}:${i}`,y:(m.y+m.height/2)*scale,scale:[Math.max(.1,m.width-.25)*scale,m.height*scale,Math.max(.1,m.depth-.25)*scale]});
     });
   }
   return {contacts,proxies,roundProxies};
 },[properties,focus,plotAxis,plotSize,quality]);
 if(quality==="fast")return null;
 return <>
   <Batch pieces={[{geometry:resources.plane,material:resources.contact}]} instances={data.contacts} animate reduced={reduced}/>
   {quality==="high"&&<Batch pieces={[{geometry:resources.box,material:resources.proxy}]} instances={data.proxies} animate reduced={reduced} castShadow/>}
   {quality==="high"&&<Batch pieces={[{geometry:resources.cylinder,material:resources.proxy}]} instances={data.roundProxies} animate reduced={reduced} castShadow/>}
 </>;
}
