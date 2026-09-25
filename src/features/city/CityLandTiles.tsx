import {useEffect,useMemo,useRef,useState} from 'react';
import {Html} from '@react-three/drei';
import {useThree} from '@react-three/fiber';
import {massesV3} from '../../domain/cityBuildingV3';
import {exposedWalls} from '../../domain/cityBuildingV2';
import {effectiveSculptShapes,sculptFloorTop,sculptKitWalls,sculptWalls,type SculptTileAnchor,type SculptVolume} from '../../domain/citySculpt';
import {landPosition,type LandDraft,type LandPlot} from '../../domain/cityLand';
import {assembleSynarcKit,DEFAULT_SYNARC_KIT,isKitWallBay,kitBayKey,kitBayPaints,paintSynarcKitBay,
  SYNARC_KIT_DOORS,SYNARC_KIT_STYLES,SYNARC_KIT_WINDOWS,type KitPlacement,type KitWall,type SynarcKitPaintId} from '../../domain/citySynarcKit';
import type {CityLandController} from './useCityLand';
import {CitySynarcKitControls} from './CitySynarcKitControls';
import {CITY_TEXTURES,SELECTABLE_TEXTURE_IDS,type CityTextureId} from '../../domain/cityTexturePresets';
import {startSculpt} from './CitySculptControls';

const OPENINGS:SynarcKitPaintId[]=['wall-full',...SYNARC_KIT_WINDOWS,...SYNARC_KIT_DOORS];
const ACCENTS:SynarcKitPaintId[]=['canopy-short','canopy-long','entrance-column','balcony-slab','ac-unit','wall-lamp','vent','sign-band','buttress'];
const label=(id:string)=>id.replaceAll('-',' ');

export function CityLandTiles({land,plot,draft,selectedVolume}:{land:CityLandController;plot:LandPlot;draft:LandDraft;selectedVolume:string|null}){
 const {camera}=useThree(),[selected,setSelected]=useState(''),[hover,setHover]=useState(''),[brush,setBrush]=useState<SynarcKitPaintId|null>('window-detailed'),[issue,setIssue]=useState(''),[interaction,setInteraction]=useState<'part'|'paint'>('part'),[globalOpen,setGlobalOpen]=useState(true);
 const initialized=useRef(false);
 const d=draft.design,kit=d.synarcKit,sculpting=draft.builderMode==='sculpt'&&!!draft.sculpt;
 const volumes=sculpting&&(draft.sculpt?.version===4||draft.sculpt?.version===5||draft.sculpt?.version===6)?draft.sculpt.volumes:[];
 const selectedShape=volumes.find(v=>v.id===selectedVolume);
 useEffect(()=>{if(initialized.current||!volumes.length)return;initialized.current=true;if(!selectedVolume)land.setSelectedVolume(volumes[0].id);},[volumes,selectedVolume,land]);
 useEffect(()=>setGlobalOpen(!selectedShape),[selectedShape?.id]);
 const unsupported=!sculpting&&d.generatorRevision==='city-office-4'||sculpting&&(draft.sculpt?.version!==4&&draft.sculpt?.version!==5)&&Array.from({length:d.floors},(_,floor)=>effectiveSculptShapes(draft.sculpt!,floor)).some(shapes=>shapes.some(shape=>shape.kind==='ellipse'));
 const walls=useMemo<KitWall[]>(()=>{
  if(!kit||unsupported)return [];
  if(sculpting)return sculptKitWalls(draft.sculpt!,d);
  const masses=massesV3(d),levels=[...new Set(masses.map(m=>m.y))].sort((a,b)=>a-b);
  return exposedWalls(masses).map(w=>({...w,floor:levels.findIndex(y=>Math.abs(y-w.y)<.001)}));
 },[kit,unsupported,sculpting,draft.sculpt,d]);
 const assembly=useMemo(()=>kit&&walls.length?assembleSynarcKit(walls,kit):null,[kit,walls]);
 const bays=useMemo(()=>assembly?.placements.filter(isKitWallBay)??[],[assembly]);
 const volumeWalls=useMemo(()=>sculpting&&draft.sculpt&&selectedVolume?sculptWalls(draft.sculpt,d).filter(w=>w.source?.shapeId===selectedVolume):[],[sculpting,draft.sculpt,selectedVolume,d]);
 const visibleBays=selectedVolume&&sculpting?bays.filter(p=>volumeWalls.some(w=>{const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],t=((p.x-w.a[0])*dx+(p.z-w.a[1])*dz)/(w.length*w.length);return w.floor===p.floor&&w.nx*Math.sin(p.rotation)+w.nz*Math.cos(p.rotation)>.95&&t>=-.02&&t<=1.02&&Math.abs((p.x-w.a[0])*w.nx+(p.z-w.a[1])*w.nz)<.5;})):bays;
 const bay=visibleBays.find(p=>kitBayKey(p)===selected)??null;
 const selectedPaints=kit&&bay?kitBayPaints(kit,bay):[];
 const entrance=!!bay&&!!assembly?.entrance&&bay.floor===0&&Math.hypot(bay.x-assembly.entrance.x,bay.z-assembly.entrance.z)<.1;
 const choices=brush===null?[]:OPENINGS.includes(brush)?entrance?[...SYNARC_KIT_DOORS]:['wall-full',...SYNARC_KIT_WINDOWS]:ACCENTS;
 const changeKit=(next:typeof kit)=>{setIssue('');land.edit({...draft,design:{...d,synarcKit:next,finish:'procedural'}});};
 const changeVolume=(patch:Partial<SculptVolume>)=>{
  if((draft.sculpt?.version!==4&&draft.sculpt?.version!==5)||!selectedShape)return;
  setIssue('');land.edit({...draft,sculpt:{...draft.sculpt,volumes:draft.sculpt.volumes.map(v=>v.id===selectedShape.id?{...v,...patch}:v)},
   design:{...d,synarcKit:kit??structuredClone(DEFAULT_SYNARC_KIT),finish:'procedural'}});
 };
 const paint=(target:KitPlacement)=>{
  if(!kit)return;setSelected(kitBayKey(target));
  const result=paintSynarcKitBay(walls,kit,target,brush);
  if(result.reason){setIssue(result.reason);return;}
  setIssue('');if(result.kit===kit)return;
  let sculpt=draft.sculpt;
  if((sculpt?.version===4||sculpt?.version===5||sculpt?.version===6)&&selectedVolume){
   const shape=sculpt.volumes.find(v=>v.id===selectedVolume),wall=volumeWalls.filter(w=>w.floor===target.floor).sort((a,b)=>Math.hypot((a.a[0]+a.b[0])/2-target.x,(a.a[1]+a.b[1])/2-target.z)-Math.hypot((b.a[0]+b.b[0])/2-target.x,(b.a[1]+b.b[1])/2-target.z))[0];
   if(shape&&wall?.source){
    const side=wall.source.side,u=side==='curve'?((Math.atan2((target.z-shape.z)/(shape.depth/2),(target.x-shape.x)/(shape.width/2))+Math.PI*2)%(Math.PI*2))/(Math.PI*2):side==='north'||side==='south'?(target.x-(shape.x-shape.width/2))/shape.width:(target.z-(shape.z-shape.depth/2))/shape.depth;
    const retained=(sculpt.tileAnchors??[]).filter(anchor=>result.kit.paints.some(p=>p.id===anchor.id));
    const added=result.kit.paints.filter(p=>!retained.some(a=>a.id===p.id)&&p.floor===target.floor&&Math.hypot(p.x-target.x,p.z-target.z)<.1).map(p=>({id:p.id,volumeId:selectedVolume,side,u:Math.max(0,Math.min(1,u)),floor:p.floor,part:p.part}) satisfies SculptTileAnchor);
    sculpt={...sculpt,tileAnchors:[...retained,...added]};
   }
  }
  land.edit({...draft,sculpt,design:{...d,synarcKit:result.kit,finish:'procedural'}});
 };
 const center=landPosition(plot),scale=plot.size/24;
 return <>
  {interaction==='part'&&volumes.length>0&&<group position={[center.x,0,center.z]} rotation={[0,plot.rotation*Math.PI/2,0]} scale={scale}>
   {volumes.map(v=>{const bottom=v.startFloor===0?.65:sculptFloorTop(v.startFloor-1,d.groundHeight),top=sculptFloorTop(v.startFloor+v.spanFloors-1,d.groundHeight),active=v.id===selectedVolume;
    return <mesh key={v.id} name={`tile-select-volume-${v.id}`} position={[v.x,(bottom+top)/2,v.z]} scale={[v.width,top-bottom,v.depth]}
      onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();land.setSelectedVolume(v.id);setSelected('');}}>
      {v.kind==='ellipse'?<cylinderGeometry args={[.5,.5,1,32]}/>:<boxGeometry args={[1,1,1]}/>}
      <meshBasicMaterial color={active?'#eac37b':'#75d8b4'} transparent opacity={active?.18:.065} depthWrite={false} wireframe/>
     </mesh>;
   })}
  </group>}
  {interaction==='paint'&&kit&&assembly&&<group position={[center.x,0,center.z]} rotation={[0,plot.rotation*Math.PI/2,0]} scale={scale}>
   {visibleBays.map(p=>{const key=kitBayKey(p),active=key===selected||key===hover,nx=Math.sin(p.rotation),nz=Math.cos(p.rotation);
    return <mesh key={key} name="tile-paint-bay" position={[p.x+nx*.24,p.y+1.5,p.z+nz*.24]} rotation={[0,p.rotation,0]}
     onPointerOver={e=>{e.stopPropagation();setHover(key);}} onPointerOut={()=>setHover(current=>current===key?'':current)}
     onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();paint(p);}}>
     <boxGeometry args={[1.94*p.scaleX,2.9,.06]}/><meshBasicMaterial color={key===selected?'#f2c875':'#69e3b4'} transparent opacity={active?.29:.055} depthWrite={false}/>
    </mesh>;
   })}
  </group>}
  <primitive object={camera}><Html fullscreen position={[0,0,-1]} style={{pointerEvents:'none'}}>
   <aside className="city-land-panel land-tile-tools" onPointerDown={e=>e.stopPropagation()}>
    <h2>Facade tiles</h2>
    {!sculpting?<div className="land-sculpt-volume-kit"><strong>Building parts</strong><small>This is still a single preset. Convert it to editable Sculpt volumes to give each part its own façade.</small><button type="button" disabled={!startSculpt(draft)} onClick={()=>{const next=startSculpt(draft);if(!next)return;land.edit({...next,sculpt:(next.sculpt?.version===4||next.sculpt?.version===5||next.sculpt?.version===6)?{...next.sculpt,plotSize:plot.size}:next.sculpt});land.setSelectedVolume((next.sculpt?.version===4||next.sculpt?.version===5||next.sculpt?.version===6)?next.sculpt.volumes[0]?.id??null:null);}}>Edit building parts</button></div>:
     <div className="land-sculpt-volume-picker"><strong>Part to edit</strong><small>Click a highlighted shape in the scene or choose it here. Each part keeps its own façade defaults.</small><label>Active part<select aria-label="Active sculpt part" value={selectedShape?.id??''} onChange={e=>{land.setSelectedVolume(e.target.value||null);setSelected('');setInteraction('part');}}><option value="">Whole building</option>{volumes.map((v,i)=><option key={v.id} value={v.id}>{`${v.operation==='subtract'?'Cut':'Solid'} ${v.kind==='ellipse'?'cylinder / ellipse':'box'} ${i+1} · floors ${v.startFloor+1}–${v.startFloor+v.spanFloors}`}</option>)}</select></label><div className="land-sculpt-tool-grid" role="group" aria-label="Tile interaction mode"><button type="button" aria-pressed={interaction==='part'} onClick={()=>setInteraction('part')}>Select part</button><button type="button" aria-pressed={interaction==='paint'} onClick={()=>setInteraction('paint')}>Paint bays</button></div></div>}
    <p>{interaction==='part'&&sculpting?'Click a shape to select it. Right-drag rotates and middle-drag pans.':'Click a highlighted bay to paint it. Right-drag rotates and middle-drag pans.'}</p>
     {selectedShape&&<div className="land-sculpt-volume-kit"><strong>{selectedShape.kind==='ellipse'?'Selected curved part':'Selected box'} · whole shape</strong><small>These defaults apply to this part’s exposed wall bays. Painted bays remain individual exceptions. Choosing one enables the tile kit if needed.</small>
      {!volumeWalls.length&&<small>This part has no exposed wall on its current floors. Move or resize it so its edge reaches the outside or a visible cutout; its saved tile choices will then appear.</small>}
      {selectedShape.kind==='ellipse'?<label>Curved facade pattern<select aria-label="Curved facade pattern" value={selectedShape.curvedFacade??'windows'} onChange={e=>changeVolume({curvedFacade:e.target.value as 'solid'|'windows'|'glazing'})}><option value="solid">Solid panels</option><option value="windows">Recessed windows</option><option value="glazing">Broad glazing</option></select><small>Kit tiles follow tangent segments around this part. Very narrow curves retain their procedural finish.</small></label>:
       <label>Wall arrangement<select aria-label="Selected volume wall arrangement" value={selectedShape.kitRole??'mixed'} onChange={e=>changeVolume({kitRole:e.target.value==='mixed'?undefined:e.target.value as SculptVolume['kitRole']})}><option value="mixed">Default wall and window mix</option><option value="solid">Solid wall bays</option><option value="windows">Window bays</option><option value="glazing">Broad glazing bays</option></select></label>}
     <label>Tile style<select aria-label="Selected volume tile style" value={selectedShape.kitStyle??''} onChange={e=>changeVolume({kitStyle:e.target.value?e.target.value as SculptVolume['kitStyle']:undefined})}><option value="">Use whole-building style</option>{SYNARC_KIT_STYLES.map(id=><option key={id} value={id}>{label(id)}</option>)}</select></label>
     <label>Window block<select aria-label="Selected volume window block" value={selectedShape.kitWindow??''} onChange={e=>changeVolume({kitWindow:e.target.value?e.target.value as SculptVolume['kitWindow']:undefined})}><option value="">Use whole-building window</option>{SYNARC_KIT_WINDOWS.map(id=><option key={id} value={id}>{label(id)}</option>)}</select></label>
      <label>Entrance block<select aria-label="Selected volume entrance block" value={selectedShape.kitDoor??''} onChange={e=>changeVolume({kitDoor:e.target.value?e.target.value as SculptVolume['kitDoor']:undefined})}><option value="">Use whole-building entrance</option>{SYNARC_KIT_DOORS.map(id=><option key={id} value={id}>{label(id)}</option>)}</select><small>Applies only when this part owns the street-facing entrance.</small></label>
      <label>Wall texture<select aria-label="Selected volume wall finish" value={selectedShape.wallTexture??''} onChange={e=>changeVolume({wallTexture:e.target.value?e.target.value as CityTextureId:undefined})}><option value="">Use building finish</option>{SELECTABLE_TEXTURE_IDS.map(id=><option key={id} value={id}>{CITY_TEXTURES[id].label}</option>)}</select></label>
     </div>}
     <details className="land-tile-global" open={globalOpen} onToggle={e=>setGlobalOpen(e.currentTarget.open)}><summary>Whole-building tile defaults</summary><CitySynarcKitControls value={kit} onChange={changeKit} disabledReason={unsupported?'This footprint cannot use the tile kit. Choose another preset or shape.':undefined}/></details>
     {interaction==='paint'&&kit&&assembly&&<><strong>Paint one bay</strong><div className="land-tile-brushes" role="group" aria-label="Tile paint brushes">
     <button aria-pressed={brush===null} onClick={()=>setBrush(null)}>Clear overrides</button>
     {['wall-full',...SYNARC_KIT_WINDOWS,...SYNARC_KIT_DOORS,...ACCENTS].map(id=><button key={id} aria-pressed={brush===id} onClick={()=>setBrush(id as SynarcKitPaintId)}>{label(id)}</button>)}
    </div>
    <label>Wall bay<select aria-label="Tile wall bay" value={bay?kitBayKey(bay):''} onChange={e=>setSelected(e.target.value)}><option value="">Choose a bay</option>{visibleBays.map((p,i)=>{const side=Math.abs(Math.cos(p.rotation))>.7?(Math.cos(p.rotation)>0?'front':'back'):(Math.sin(p.rotation)>0?'right':'left');return <option key={kitBayKey(p)} value={kitBayKey(p)}>{`Floor ${p.floor+1} · ${side} · ${p.floor===0&&assembly.entrance&&Math.hypot(p.x-assembly.entrance.x,p.z-assembly.entrance.z)<.1?'entrance':`bay ${i+1}`}`}</option>;})}</select></label>
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
