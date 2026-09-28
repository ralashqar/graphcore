// In-world marks for the theme brush and theme-card drags (docs/city-studio-themes.md › Theme brush): the part (or
// every part) a click or a drop would dress glows with its frame and tinted walls, with a ghost label above it; a drop
// on an empty plot shows the themed starter block.
import {useEffect,useState} from 'react';
import {Html} from '@react-three/drei';
import {THEME_MAP} from '../../../domain/cityStudioThemeCatalog';
import {sculptFloorBottom,sculptFloorTop,type SculptVolume} from '../../../domain/citySculpt';
import {CityStudioPartFrame} from '../CityStudioPartFrame';
import {themeGhostLabel} from '../studioThemeBrush';
import {useThemeDrag} from './themeDrag';
import type {StudioState} from './useStudioState';

/** Shift held (the brush previews the whole building while it is down). */
function useShiftHeld(){
 const [held,setHeld]=useState(false);
 useEffect(()=>{const on=(e:KeyboardEvent)=>setHeld(e.shiftKey),off=()=>setHeld(false);window.addEventListener('keydown',on);window.addEventListener('keyup',on);window.addEventListener('blur',off);return()=>{window.removeEventListener('keydown',on);window.removeEventListener('keyup',on);window.removeEventListener('blur',off);};},[]);
 return held;
}

export function StudioThemeMarks({st}:{st:StudioState}){
 const drag=useThemeDrag(),shift=useShiftHeld();
 const {recipe,interaction,draft,walking}=st;if(!recipe||walking)return null;
 const gh=draft.design.groundHeight,uh=draft.design.upperHeight,solid=recipe.volumes.filter(v=>v.operation==='add');
 let parts:SculptVolume[]=[],label='',erase=false,starter:{w:number;d:number;floors:number}|null=null;
 if(drag){const t=THEME_MAP.get(drag.theme),o=drag.outcome;
  if(t&&o.kind==='part'){const v=solid.find(x=>x.id===o.partId);if(v){parts=[v];label=themeGhostLabel(t.label);}}
  else if(t&&o.kind==='starter')starter={w:Math.min(19,t.starter.width),d:Math.min(19,t.starter.depth),floors:t.starter.floors};
 }else if(st.effectiveTool==='pick'&&(st.rail==='paint'||st.rail==='erase')&&st.target==='themes'&&!interaction.active){
  const t=THEME_MAP.get(st.themeBrush.theme),part=interaction.hover?.anchor.shapeId??interaction.hoverPick.roofPartId,building=st.size==='building'||shift;erase=st.erase;
  if(t&&(part||building&&interaction.hover)){parts=building?solid:solid.filter(v=>v.id===part);label=themeGhostLabel(t.label,{erase,building,sample:!erase&&st.eyedropper});}
 }
 const color=erase?'#e0705f':'#ffc76a',ids=new Set(parts.map(p=>p.id)),bays=interaction.bays.filter(b=>ids.has(b.anchor.shapeId));
 const top=parts.reduce<SculptVolume|null>((best,v)=>!best||v.startFloor+v.spanFloors>best.startFloor+best.spanFloors?v:best,null);
 return <group name="studio-theme-marks">
  {parts.map(v=><CityStudioPartFrame key={`theme-frame/${v.id}`} volume={v} groundHeight={gh} upperHeight={uh} color={color} opacity={.95}/>)}
  {bays.map(b=><mesh key={`theme-bay/${b.id}`} position={[b.x+Math.sin(b.rotation)*.3,b.y+b.height/2,b.z+Math.cos(b.rotation)*.3]} rotation={[0,b.rotation,0]} raycast={()=>null} renderOrder={4}><planeGeometry args={[b.width-.03,b.height-.03]}/><meshBasicMaterial color={color} transparent opacity={.2} depthWrite={false}/></mesh>)}
  {top&&label&&<Html position={[top.x,sculptFloorTop(top.startFloor+top.spanFloors-1,gh,uh)+1.6,top.z]} center zIndexRange={[45,25]} style={{pointerEvents:'none'}}><span className={`studio-theme-hover-label${erase?' is-erase':''}`} data-theme-label>{label}</span></Html>}
  {starter&&<mesh position={[0,(sculptFloorBottom(0,gh,uh)+sculptFloorTop(starter.floors-1,gh,uh))/2,0]} scale={[starter.w,sculptFloorTop(starter.floors-1,gh,uh)-sculptFloorBottom(0,gh,uh),starter.d]} raycast={()=>null}><boxGeometry/><meshBasicMaterial color="#9fd2a8" transparent opacity={.22} depthWrite={false}/></mesh>}
 </group>;
}
