import {MeshBasicNodeMaterial} from "three/webgpu";
import {uv,abs,max,smoothstep,float,vec3} from "three/tsl";
import {useFrame} from "@react-three/fiber";
import {useEffect,useMemo,useRef,useState} from "react";
import {BoxGeometry,CylinderGeometry,Vector3,MeshBasicMaterial,PlaneGeometry} from "three";
import {buildingMasses} from "../../domain/cityBuildingDesign";
import type {CityProperty} from "../../domain/city";
import {Batch,type Instance} from "./CityInstances";
import {useCityMapLayout} from "./CityMapLayout";
import {useCityLook} from "./CityLook";
import {useStudioIsolate} from "./cityStudioIsolate";

/** Development telemetry: contact marks per property id (browser suites read window.__cityGrounding). */
const groundingStats:Record<string,number>={};
if(typeof window!=="undefined"&&import.meta.env?.DEV)(window as unknown as {__cityGrounding?:typeof groundingStats}).__cityGrounding=groundingStats;

/** Footprint-derived grounding and bounded low-detail shadow casters. No per-window shadow pass. Studio buildings
 * carry their parts' footprint (`groundFootprint`, empty for an empty plot); presets use their design masses. While
 * the studio isolates a plot, only that plot casts. */
export function CityBuildingGrounding({properties,center,reduced=true}:{properties:CityProperty[];center?:{x:number;z:number};reduced?:boolean}){
 const {quality}=useCityLook(),{plotAxis,plotSize}=useCityMapLayout(),isolate=useStudioIsolate();
 const [focus,setFocus]=useState({x:0,z:0});
 const scratch=useRef(new Vector3()),elapsed=useRef(0);
 // Driving keeps buildings resident. Refresh only the small caster selection as the camera travels.
 useFrame(({camera},dt)=>{if(quality!=="high"||!center)return;elapsed.current+=dt;if(elapsed.current<.5)return;elapsed.current=0;camera.getWorldDirection(scratch.current);const t=Math.abs(scratch.current.y)>.1?Math.max(0,-camera.position.y/scratch.current.y):40;const x=Math.round((camera.position.x+scratch.current.x*t)/32)*32,z=Math.round((camera.position.z+scratch.current.z*t)/32)*32;setFocus(old=>old.x===x&&old.z===z?old:{x,z});});
 const resources=useMemo(()=>({
   plane:new PlaneGeometry(1,1).rotateX(-Math.PI/2),box:new BoxGeometry(1,1,1),cylinder:new CylinderGeometry(.5,.5,1,16),
   proxy:new MeshBasicMaterial({colorWrite:false,depthWrite:false}),
   contact:(()=>{
     const m=new MeshBasicNodeMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
     m.colorNode=vec3(.055,.075,.09);
     m.opacityNode=float(1).sub(smoothstep(.43,.5,max(abs(uv().x.sub(.5)),abs(uv().y.sub(.5))))).mul(.3);
     return m;
   })(),
 }),[]);
 useEffect(()=>()=>Object.values(resources).forEach(r=>r.dispose()),[resources]);
 const data=useMemo(()=>{
   const contacts:Instance[]=[],proxies:Instance[]=[],roundProxies:Instance[]=[],marksById=new Map<string,number>();
   const nearest=new Set([...properties].sort((a,b)=>Math.hypot(plotAxis(a.x)-focus.x,plotAxis(a.z)-focus.z)-Math.hypot(plotAxis(b.x)-focus.x,plotAxis(b.z)-focus.z)).slice(0,24).map(p=>p.id));
   for(const p of properties){
     const d=p.profile.buildingDesign;if(!d||p.profile.buildingArt)continue;
     const footprint=p.groundFootprint;
     const masses=footprint?footprint.map(f=>({x:f.x,z:f.z,width:f.width,depth:f.depth,y:f.bottom,height:f.top-f.bottom,round:!!f.round})):buildingMasses(d).map(m=>({...m,round:d.version===3&&["round-tower","ellipse-tower"].includes(d.archetype||"")}));
     const base=footprint?Math.min(...footprint.map(f=>f.bottom),.7):Math.min(...masses.map(m=>m.y)),scale=plotSize/24,angle=d.rotation*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
     const casts=quality==="high"&&(isolate.on?isolate.plotId===p.id:nearest.has(p.id));let marks=0;
     masses.forEach((m,i)=>{
       const item={key:`ground:${p.id}:${i}`,property:p,x:plotAxis(p.x)+(m.x*c+m.z*s)*scale,z:plotAxis(p.z)+(m.z*c-m.x*s)*scale,rotation:angle};
       if(m.y<=base+.001){contacts.push({...item,y:.312*scale,scale:[(m.width+1.1)*scale,1,(m.depth+1.1)*scale]});marks++;}
       if(casts)(m.round ? roundProxies : proxies).push({...item,key:`shadow:${p.id}:${i}`,y:(m.y+m.height/2)*scale,scale:[Math.max(.1,m.width-.25)*scale,m.height*scale,Math.max(.1,m.depth-.25)*scale]});
     });
     marksById.set(p.id,marks);
   }
   return {contacts,proxies,roundProxies,marksById};
 },[properties,focus,plotAxis,plotSize,quality,isolate.on,isolate.plotId]);
 useEffect(()=>{if(!import.meta.env.DEV)return;for(const [id,n] of data.marksById)groundingStats[id]=n;return()=>{for(const id of data.marksById.keys())if(groundingStats[id]===data.marksById.get(id))delete groundingStats[id];};},[data]);
 if(quality==="fast")return null;
 return <>
   <Batch pieces={[{geometry:resources.plane,material:resources.contact}]} instances={data.contacts} animate reduced={reduced}/>
   {quality==="high"&&<Batch pieces={[{geometry:resources.box,material:resources.proxy}]} instances={data.proxies} animate reduced={reduced} castShadow/>}
   {quality==="high"&&<Batch pieces={[{geometry:resources.cylinder,material:resources.proxy}]} instances={data.roundProxies} animate reduced={reduced} castShadow/>}
 </>;
}
