import {useMemo,useState} from 'react';
import {Html} from '@react-three/drei';
import {useThree} from '@react-three/fiber';
import {massesV3} from '../../domain/cityBuildingV3';
import {exposedWalls} from '../../domain/cityBuildingV2';
import {effectiveSculptShapes,sculptWalls} from '../../domain/citySculpt';
import {landPosition,type LandDraft,type LandPlot} from '../../domain/cityLand';
import {assembleSynarcKit,isKitWallBay,kitBayKey,kitBayPaints,paintSynarcKitBay,
  SYNARC_KIT_DOORS,SYNARC_KIT_WINDOWS,type KitPlacement,type KitWall,type SynarcKitPaintId} from '../../domain/citySynarcKit';
import type {CityLandController} from './useCityLand';
import {CitySynarcKitControls} from './CitySynarcKitControls';

const OPENINGS:SynarcKitPaintId[]=['wall-full',...SYNARC_KIT_WINDOWS,...SYNARC_KIT_DOORS];
const ACCENTS:SynarcKitPaintId[]=['canopy-short','canopy-long','entrance-column','balcony-slab','ac-unit','wall-lamp','vent','sign-band','buttress'];
const label=(id:string)=>id.replaceAll('-',' ');

export function CityLandTiles({land,plot,draft}:{land:CityLandController;plot:LandPlot;draft:LandDraft}){
 const {camera}=useThree(),[selected,setSelected]=useState(''),[hover,setHover]=useState(''),[brush,setBrush]=useState<SynarcKitPaintId|null>('window-detailed'),[issue,setIssue]=useState('');
 const d=draft.design,kit=d.synarcKit,sculpting=draft.builderMode==='sculpt'&&!!draft.sculpt;
 const unsupported=d.generatorRevision==='city-office-4'||sculpting&&draft.sculpt?.version!==4&&Array.from({length:d.floors},(_,floor)=>effectiveSculptShapes(draft.sculpt!,floor)).some(shapes=>shapes.some(shape=>shape.kind==='ellipse'));
 const walls=useMemo<KitWall[]>(()=>{
  if(!kit||unsupported)return [];
  if(sculpting)return sculptWalls(draft.sculpt!,d).filter(w=>w.source?.side!=='curve').map(w=>({x:(w.a[0]+w.b[0])/2,z:(w.a[1]+w.b[1])/2,
   nx:w.nx,nz:w.nz,length:w.length,y:w.bottom,height:w.top-w.bottom,floor:w.floor,courtyard:w.ring>0}));
  const masses=massesV3(d),levels=[...new Set(masses.map(m=>m.y))].sort((a,b)=>a-b);
  return exposedWalls(masses).map(w=>({...w,floor:levels.findIndex(y=>Math.abs(y-w.y)<.001)}));
 },[kit,unsupported,sculpting,draft.sculpt,d]);
 const assembly=useMemo(()=>kit&&walls.length?assembleSynarcKit(walls,kit):null,[kit,walls]);
 const bays=useMemo(()=>assembly?.placements.filter(isKitWallBay)??[],[assembly]);
 const bay=bays.find(p=>kitBayKey(p)===selected)??null;
 const selectedPaints=kit&&bay?kitBayPaints(kit,bay):[];
 const entrance=!!bay&&!!assembly?.entrance&&bay.floor===0&&Math.hypot(bay.x-assembly.entrance.x,bay.z-assembly.entrance.z)<.1;
 const choices=brush===null?[]:OPENINGS.includes(brush)?entrance?[...SYNARC_KIT_DOORS]:['wall-full',...SYNARC_KIT_WINDOWS]:ACCENTS;
 const changeKit=(next:typeof kit)=>{setIssue('');land.edit({...draft,design:{...d,synarcKit:next,finish:'procedural'}});};
 const paint=(target:KitPlacement)=>{
  if(!kit)return;setSelected(kitBayKey(target));
  const result=paintSynarcKitBay(walls,kit,target,brush);
  if(result.reason){setIssue(result.reason);return;}
  setIssue('');if(result.kit!==kit)changeKit(result.kit);
 };
 const center=landPosition(plot),scale=plot.size/24;
 return <>
  {kit&&assembly&&<group position={[center.x,0,center.z]} rotation={[0,plot.rotation*Math.PI/2,0]} scale={scale}>
   {bays.map(p=>{const key=kitBayKey(p),active=key===selected||key===hover,nx=Math.sin(p.rotation),nz=Math.cos(p.rotation);
    return <mesh key={key} name="tile-paint-bay" position={[p.x+nx*.24,p.y+1.5,p.z+nz*.24]} rotation={[0,p.rotation,0]}
     onPointerOver={e=>{e.stopPropagation();setHover(key);}} onPointerOut={()=>setHover(current=>current===key?'':current)}
     onPointerDown={e=>{e.stopPropagation();if(e.button===0)paint(p);}}>
     <boxGeometry args={[1.94,2.9,.06]}/><meshBasicMaterial color={key===selected?'#f2c875':'#69e3b4'} transparent opacity={active?.29:.055} depthWrite={false}/>
    </mesh>;
   })}
  </group>}
  <primitive object={camera}><Html fullscreen position={[0,0,-1]} style={{pointerEvents:'none'}}>
   <aside className="city-land-panel land-tile-tools" onPointerDown={e=>e.stopPropagation()}>
    <h2>Tiles</h2><p>Choose a kit for the whole building, then pick a part and click a highlighted wall bay to paint it. Drag elsewhere to orbit.</p>
    <CitySynarcKitControls value={kit} onChange={changeKit} disabledReason={unsupported?'This footprint needs straight façade bays. Choose a rectangular preset or shape first.':undefined}/>
    {kit&&assembly&&<><strong>Paint one bay</strong><div className="land-tile-brushes" role="group" aria-label="Tile paint brushes">
     <button aria-pressed={brush===null} onClick={()=>setBrush(null)}>Clear overrides</button>
     {['wall-full',...SYNARC_KIT_WINDOWS,...SYNARC_KIT_DOORS,...ACCENTS].map(id=><button key={id} aria-pressed={brush===id} onClick={()=>setBrush(id as SynarcKitPaintId)}>{label(id)}</button>)}
    </div>
    <label>Wall bay<select aria-label="Tile wall bay" value={bay?kitBayKey(bay):''} onChange={e=>setSelected(e.target.value)}><option value="">Choose a bay</option>{bays.map((p,i)=>{const side=Math.abs(Math.cos(p.rotation))>.7?(Math.cos(p.rotation)>0?'front':'back'):(Math.sin(p.rotation)>0?'right':'left');return <option key={kitBayKey(p)} value={kitBayKey(p)}>{`Floor ${p.floor+1} · ${side} · ${p.floor===0&&assembly.entrance&&Math.hypot(p.x-assembly.entrance.x,p.z-assembly.entrance.z)<.1?'entrance':`bay ${i+1}`}`}</option>;})}</select></label>
    {bay?<div className="land-tile-selection"><strong>Selected bay · floor {bay.floor+1}</strong><small>{entrance?'Entrance · door choices only':'Exposed wall · whole 2 m tile'} · {selectedPaints.length} override{selectedPaints.length===1?'':'s'}</small>
     <button onClick={()=>paint(bay)}>{brush===null?'Clear selected bay':`Paint ${label(brush!)}`}</button></div>:<small>Click a glowing bay to select and paint it. Use the buttons here for touch or keyboard after selecting.</small>}
    {!!assembly.inactive.length&&<small>{assembly.inactive.length} saved override(s) are inactive: {assembly.inactive.map(item=>item.reason).join(' ')}</small>}
    {brush!==null&&bay&&!choices.includes(brush)&&<small>This part may not fit the selected bay; incompatible choices are rejected without changing the building.</small>}
    {issue&&<p role="alert" className="land-tile-issue">{issue}</p>}
    </>}
    <div className="land-save-state" role="status">{land.saving?'Saving…':land.dirty?'Unsaved changes':'Saved on this device'}</div>
   </aside>
  </Html></primitive>
 </>;
}
