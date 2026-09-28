// Floor finishes (docs/city-surfaces.md): a pattern picker with colour, joints, scale, rotation and wear, used per
// room (inspector) and per storey (Rooms palette), plus the floor brush that paints rooms as they are clicked.
// Every change is one labelled undo step ("Floor finish"); slider drags coalesce through the history groups.
import {useEffect,useRef} from 'react';
import {PaintBucket} from '@phosphor-icons/react';
import {floorRenderKey,legacyFloorSurface,paintRoomFloors,setRoomLegacyFloor,roomFloorSurface,setRoomFloorSurface,setStoreyFloorSurface,storeyFloorSurface,type StudioFloorSurface} from '../../../domain/cityStudioSurfaces';
import {patternsFor,surfacePattern,type SurfacePatternId} from '../../../domain/citySurfacePatterns';
import type {StudioRecipe,StudioRoom} from '../../../domain/cityStudioTypes';
import {surfaceSwatch} from './surfaceSwatch';
import {setFloorBrush,useFloorBrush} from './useSurfaceBrush';
import type {StudioState} from './useStudioState';
import {requestSurfaceWarmup} from '../cityStudioWarmup';
import './studioSurfaces.css';

const FLOOR_PATTERNS=patternsFor('floor').filter(id=>!surfacePattern(id)!.texture||id==='cc0-pavers');
type V6=Extract<StudioRecipe,{version:6}>;

export function FloorSurfacePicker({value,onChange:apply,label}:{value:StudioFloorSurface;onChange:(s:StudioFloorSurface)=>void;label:string}){
 const onChange=(s:StudioFloorSurface)=>{requestSurfaceWarmup(floorRenderKey(s));apply(s);};
 const meta=surfacePattern(value.pattern)!,set=(patch:Partial<StudioFloorSurface>)=>onChange({...value,...patch});
 return <div className="studio-floor-surfaces" aria-label={label}>
  <div className="studio-surface-grid">{FLOOR_PATTERNS.map(id=>{const s=surfaceSwatch(id,id===value.pattern?value.color:undefined,id===value.pattern?value.accent:undefined,{size:44});return <button key={id} data-floor-pattern={id} aria-pressed={value.pattern===id} title={surfacePattern(id)!.label} aria-label={`${label}: ${surfacePattern(id)!.label}`} onClick={()=>onChange({pattern:id as SurfacePatternId,color:surfacePattern(id)!.tint===('#ffffff')?'#d8cfbf':surfacePattern(id)!.tint,...(value.scale?{scale:value.scale}:{}),...(value.rotation?{rotation:value.rotation}:{})})}><i className="studio-surface-swatch" style={{backgroundImage:s.image,backgroundColor:s.blend,backgroundBlendMode:s.blend?'multiply':undefined}}/><span>{surfacePattern(id)!.label}</span></button>;})}</div>
  <label className="studio-surface-row">Colour <input type="color" aria-label={`${label} colour`} value={value.color??meta.tint} onChange={e=>set({color:e.target.value})}/>{!meta.texture&&<>Joints <input type="color" aria-label={`${label} joints`} value={value.accent??meta.accent} onChange={e=>set({accent:e.target.value})}/></>}</label>
  <label className="studio-surface-slider"><span>Scale</span><input type="range" aria-label={`${label} scale`} min={-2} max={2} step={.1} value={Math.log2(value.scale??1)} onChange={e=>set({scale:Math.round(2**Number(e.target.value)*100)/100})}/><output>{(value.scale??1).toFixed(2)}×</output></label>
  <label className="studio-surface-slider"><span>Rotation</span><input type="range" aria-label={`${label} rotation`} min={0} max={345} step={15} value={value.rotation??0} onChange={e=>set({rotation:Number(e.target.value)})}/><output>{value.rotation??0}°</output></label>
  <label className="studio-surface-slider"><span>Wear</span><input type="range" aria-label={`${label} wear`} min={0} max={1} step={.05} value={value.wear??0} onChange={e=>set({wear:Number(e.target.value)})}/><output>{Math.round((value.wear??0)*100)}%</output></label>
 </div>;
}

/** Inspector: the selected room's floor. */
export function RoomFloorOptions({st,room}:{st:StudioState;room:StudioRoom}){
 const recipe=st.recipe;if(recipe?.version!==6)return null;
 const value=roomFloorSurface(recipe.interior,st.floor,room.id)??storeyFloorSurface(recipe.interior,st.floor)??legacyFloorSurface(room.floorFinish);
 const own=roomFloorSurface(recipe.interior,st.floor,room.id),intent=recipe.interior.roomFinishes?.find(item=>item.id===room.id);
 const quick=(finish:'timber'|'tile'|'stone')=>{let id='';const next=setRoomLegacyFloor(recipe,room,st.floor,finish,()=>(id=globalThis.crypto.randomUUID()));if(st.commit(next,'Floor finish')&&id)st.setSelectedRoomId(id);};
 return <>
  <div className="studio-segment" aria-label="Quick floor finish">{(['timber','tile','stone'] as const).map(finish=><button key={finish} aria-pressed={!intent?.floorSurface&&room.floorFinish===finish&&!own} onClick={()=>quick(finish)}>{finish}</button>)}</div>
  <FloorSurfacePicker label="Selected room floor" value={value} onChange={s=>paintRoom(st,recipe,room,s)}/>
 </>;
}
function paintRoom(st:StudioState,recipe:V6,room:StudioRoom,s:StudioFloorSurface){
 let id='';const next=setRoomFloorSurface(recipe,room,st.floor,s,()=>(id=globalThis.crypto.randomUUID()));if(st.commit(next,'Floor finish')&&id)st.setSelectedRoomId(id);
}

/** Rooms palette: this storey's default floor and the floor brush. */
export function StoreyFloorOptions({st}:{st:StudioState}){
 const recipe=st.recipe,brush=useFloorBrush(),last=useRef<string|null>(null);
 // Floor brush: clicking a room (Choose room) paints it with the brush surface, one undo step per room.
 useEffect(()=>{
  const id=st.selectedRoomId;if(!brush.armed||!id||id===last.current||recipe?.version!==6)return;last.current=id;
  const room=st.roomChoices.find(r=>r.id===id);if(!room)return;const now=roomFloorSurface(recipe.interior,st.floor,room.id);
  if(JSON.stringify(now)!==JSON.stringify(brush.surface))paintRoom(st,recipe,room,brush.surface);
 },[st.selectedRoomId,brush.armed]);// eslint-disable-line react-hooks/exhaustive-deps
 if(recipe?.version!==6)return null;
 const storey=storeyFloorSurface(recipe.interior,st.floor);
 return <div className="studio-floor-surfaces">
  <span className="studio-caption">Storey {st.floor+1} floor</span>
  <FloorSurfacePicker label="Storey floor" value={storey??legacyFloorSurface(recipe.interior.floorFinish)} onChange={s=>st.commit(setStoreyFloorSurface(recipe,st.floor,s),'Floor finish')}/>
  {storey&&<button onClick={()=>st.commit(setStoreyFloorSurface(recipe,st.floor,null),'Floor finish')}>Use the building floor finish</button>}
  <span className="studio-caption">Floor brush</span>
  <div className="studio-floor-brush">
   <button aria-pressed={brush.armed} title="Choose room: each room you click takes the brush floor" onClick={()=>{last.current=st.selectedRoomId;setFloorBrush({armed:!brush.armed});if(!brush.armed&&st.roomsTool!=='interior-room')st.setRoomsTool('interior-room');}}><PaintBucket size={14}/> {brush.armed?'Painting rooms':'Paint rooms'}</button>
   <button disabled={!st.roomChoices.length} onClick={()=>st.commit(paintRoomFloors(recipe,st.roomChoices,st.floor,brush.surface),'Floor finish')}>All rooms on this storey</button>
  </div>
  <FloorSurfacePicker label="Floor brush" value={brush.surface} onChange={s=>setFloorBrush({surface:s})}/>
 </div>;
}
