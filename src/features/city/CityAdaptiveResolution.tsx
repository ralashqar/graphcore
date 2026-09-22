import {useRef} from "react";
import {useFrame,useThree} from "@react-three/fiber";
/** Conservative pixel budget. Buildings/textures remain resident when resolution changes. */
export function CityAdaptiveResolution({onChange}:{onChange:(ratio:number)=>void}){
 const {gl,setDpr}=useThree();
 const sample=useRef({age:0,time:0,frames:0,slow:0,cooldown:0});
 const enabled=new URLSearchParams(window.location.search).get("cityQuality")!=="high";
 useFrame((_,delta)=>{
  if(!enabled || document.hidden)return;
  const s=sample.current;s.age+=delta;
  // Ignore startup/asset compilation and pause/resume stalls.
  if(s.age<10 || delta>.2)return;
  s.time+=delta;s.frames++;
  if(s.time<4)return;
  const average=s.time/s.frames;s.time=0;s.frames=0;
  s.slow=average>1/35?s.slow+1:0;
  if(s.slow>=2 && s.age-s.cooldown>12){
   const current=gl.getPixelRatio(),next=Math.max(.85,Math.round(current*.85*100)/100);
   if(next<current){setDpr(next);onChange(next);gl.domElement.dataset.cityResolution=String(next);}
   s.slow=0;s.cooldown=s.age;
  }
 });
 return null;
}
