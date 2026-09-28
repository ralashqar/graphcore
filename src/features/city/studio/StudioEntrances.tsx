/**
 * Studio UI for door entrances and interior stairs (docs/city-stairs-entrances.md):
 *  - EntranceOpeningSection: Inspector › Opening (a door): this door's entrance, or the default it inherits.
 *  - EntranceScopeSection: Inspector › Building / Part: the default entrance for every door there.
 *  - EntranceBrushTray: Brush › Openings › Doors: hold a treatment and click doors to apply it.
 *  - InteriorStairTray: Rooms › Inside stair: shape, railing, entry and exit sides, turn, width and rotation, for the
 *    next stair or the selected one, with its fit status.
 */
import {useEffect,useState,type ReactNode} from 'react';
import {ArrowClockwise,CaretDown,CaretRight,PaintBrush,Trash} from '@phosphor-icons/react';
import {ENTRANCE_BLURBS,ENTRANCE_LABELS,ENTRANCE_PRESETS,ENTRANCE_SURROUNDS,entranceChoice,entranceFor,setStudioEntrance,type EntrancePreset,type EntranceSource} from '../../../domain/cityStudioEntrances';
import {RAIL_LABELS,RAIL_STYLES,type RailStyle} from '../../../domain/cityStudioRailings';
import {STAIR,STAIR_SHAPE_LABELS,stairShapeOf,type StairShape} from '../../../domain/cityStudioStairs';
import {sculptFloorBottom} from '../../../domain/citySculpt';
import type {StudioInteriorStair} from '../../../domain/cityStudioTypes';
import {setEntranceBrush,setStairGhost,setStairOptions,useStairsEntrances,type EntranceHeld} from './studioStairsEntrances';
import type {StudioState} from './useStudioState';
import './studioStairsEntrances.css';

const SOURCE:Record<EntranceSource,string>={door:'this door',part:'the part default',building:'the building default',theme:'the facade theme',shop:'storefront default',default:'the default'};
function Fold({title,children,label,open:initial=true}:{title:string;children:ReactNode;label?:string;open?:boolean}){
 const [open,setOpen]=useState(initial);
 return <section className="studio-inspector-section"><button className="studio-section-toggle" aria-expanded={open} aria-label={label} onClick={()=>setOpen(!open)}>{open?<CaretDown size={12}/>:<CaretRight size={12}/>}<span>{title}</span></button>{open&&<div className="studio-section-body">{children}</div>}</section>;
}
/** Side-elevation pictograms of the entrance presets (door on the left, street to the right). */
export function EntranceIcon({preset}:{preset:EntrancePreset}){
 const steps='M4 30h6v-3h4v-3h4v-3h-14z',door=<rect x="2" y="6" width="5" height="15" className="door"/>;
 const body:Record<EntrancePreset,ReactNode>={
  steps:<path d={steps}/>,'railed-steps':<><path d={steps}/><path d="M6 13h4l8 8" className="rail"/></>,
  stoop:<><path d="M4 30h8v-9l10 6v3z" className="cheek"/><path d="M4 30h4v-9h-4z"/><path d="M22 30h6v-2h-6z"/><path d="M8 16l14 8" className="rail"/><circle cx="23" cy="20" r="1.6" className="lamp"/></>,
  porch:<><path d="M4 30h14v-9h-14z"/><path d="M18 30h4v-3h4v-3h-8z"/><path d="M3 7l18 3v2l-18-3z" className="roof"/><path d="M17 11v10" className="rail"/></>,
  canopy:<><path d={steps}/><path d="M4 5h16" className="glass"/><path d="M4 1l15 4" className="rail"/></>,
  hood:<><path d={steps}/><path d="M3 4l12 2v2l-12-1z" className="roof"/><path d="M4 8q4 0 4 4" className="rail"/></>,
  ramp:<><path d="M4 30h8l18-4v4z"/><path d="M12 22l18-4" className="rail"/></>,
  vestibule:<><path d="M4 30h9v-9h-9z"/><path d="M13 30h4v-3h4v-3h-8z"/><path d="M4 3h12v18h-3v-15h-9z" className="cheek"/></>,
  grand:<><path d="M4 30h3v-9h-3zM7 30h5v-2h5v-2h5v-2h5v6z"/><path d="M7 16l20 8" className="rail"/><circle cx="27" cy="22" r="1.8" className="urn"/></>,
  slope:<path d="M4 30h4v-9l22 9z"/>,
 };
 return <svg viewBox="0 0 32 32" className="studio-entrance-icon" aria-hidden="true">{preset!=='vestibule'&&door}{body[preset]}</svg>;
}
/** Plan pictograms of the stair shapes (you enter at the bottom). */
export function StairIcon({shape}:{shape:StairShape|'auto'}){
 const d:Record<StairShape|'auto',ReactNode>={
  auto:<text x="16" y="21" textAnchor="middle" fontSize="11">A</text>,
  straight:<><rect x="11" y="4" width="10" height="24"/>{[8,12,16,20,24].map(y=><path key={y} d={`M11 ${y}h10`}/>)}</>,
  l:<><rect x="6" y="12" width="9" height="16"/><rect x="6" y="3" width="9" height="9" className="landing"/><rect x="15" y="3" width="13" height="9"/>{[16,20,24].map(y=><path key={y} d={`M6 ${y}h9`}/>)}{[19,23].map(x=><path key={x} d={`M${x} 3v9`}/>)}</>,
  u:<><rect x="5" y="10" width="10" height="18"/><rect x="17" y="10" width="10" height="18"/><rect x="5" y="3" width="22" height="7" className="landing"/>{[14,18,22].map(y=><path key={y} d={`M5 ${y}h10M17 ${y}h10`}/>)}</>,
  spiral:<><circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="2"/>{[0,1,2,3,4,5,6,7].map(k=><path key={k} d={`M${16+2*Math.cos(k*.8)} ${16+2*Math.sin(k*.8)}L${16+12*Math.cos(k*.8)} ${16+12*Math.sin(k*.8)}`}/>)}</>,
  core:<><rect x="3" y="2" width="26" height="28" className="core"/><rect x="6" y="11" width="9" height="17"/><rect x="17" y="11" width="9" height="17"/><rect x="6" y="5" width="20" height="6" className="landing"/></>,
 };
 return <svg viewBox="0 0 32 32" className="studio-stair-icon" aria-hidden="true">{d[shape]}</svg>;
}

/** Preset tiles plus railing, surround and ramp side. `value` null: nothing chosen (inherits). */
function EntrancePicker({value,onChange,inherited}:{value:EntranceHeld|null;onChange:(next:EntranceHeld)=>void;inherited?:EntrancePreset}){
 const current=value?.preset??inherited;
 return <div className="studio-entrance-picker">
  <div className="studio-tray is-grid is-compact studio-entrance-tiles" role="group" aria-label="Entrance style">{ENTRANCE_PRESETS.map(p=><button key={p} className="studio-tile" aria-pressed={value?.preset===p} data-inherited={!value&&inherited===p?'':undefined} title={ENTRANCE_BLURBS[p]} aria-label={`Entrance: ${ENTRANCE_LABELS[p]}`} onClick={()=>onChange({...value,preset:p})}><EntranceIcon preset={p}/><span>{ENTRANCE_LABELS[p]}</span></button>)}</div>
  {current&&current!=='slope'&&<><span className="studio-caption">Railing</span><div className="studio-segment studio-chips" role="group" aria-label="Entrance railing">{RAIL_STYLES.map(r=><button key={r} aria-pressed={value?.rail===r} onClick={()=>onChange({preset:current,...value,rail:r})}>{RAIL_LABELS[r]}</button>)}</div></>}
  <span className="studio-caption">Door surround</span><div className="studio-segment" role="group" aria-label="Door surround">{ENTRANCE_SURROUNDS.map(s=><button key={s} aria-pressed={(value?.surround??'none')===s} onClick={()=>onChange({preset:current??'steps',...value,surround:s})}>{s==='none'?'None':s==='pilasters'?'Pilasters':'Pediment'}</button>)}</div>
  {current==='ramp'&&<><span className="studio-caption">Ramp side (from the street)</span><div className="studio-segment" role="group" aria-label="Ramp side">{(['left','right'] as const).map(s=><button key={s} aria-pressed={(value?.side??'right')===s} onClick={()=>onChange({preset:'ramp',...value,side:s})}>{s}</button>)}</div></>}
 </div>;
}
const held=(e:{preset:EntrancePreset;rail?:RailStyle;surround?:EntranceHeld['surround'];side?:'left'|'right'}|null):EntranceHeld|null=>e?{preset:e.preset,...(e.rail?{rail:e.rail}:{}),...(e.surround?{surround:e.surround}:{}),...(e.side?{side:e.side}:{})}:null;
function BrushButton({st,choice}:{st:StudioState;choice:EntranceHeld}){
 const brush=useStairsEntrances().brush,on=brush.armed&&brush.held.preset===choice.preset;
 return <button className="studio-entrance-brush-button" aria-pressed={on} title="Hold this entrance on the brush and click other doors" onClick={()=>{if(on){setEntranceBrush({armed:false});return;}armBrush(st,choice);}}><PaintBrush size={14}/>{on?'Brushing… click doors':'Brush onto other doors'}</button>;
}
function armBrush(st:StudioState,choice:EntranceHeld){setEntranceBrush({armed:true,held:choice,note:'',apply:target=>{const r=st.land.getDraft()?.sculpt;if(!r||(r.version!==5&&r.version!==6))return;st.commit(setStudioEntrance(r,target,choice),`Entrance: ${ENTRANCE_LABELS[choice.preset]}`);}});}

/** Inspector › Opening: the entrance of one door (free opening, kit tile or storefront). */
export function EntranceOpeningSection({st,target,members,partId}:{st:StudioState;target:string;members:string[];partId:string}){
 const recipe=st.recipe!,own=entranceFor(recipe,target),effective=entranceChoice(recipe,{members,partId});
 return <Fold title="Entrance" label="Door entrance">
  <small className="studio-palette-hint">Now: <b>{ENTRANCE_LABELS[effective.preset]}</b> from {SOURCE[effective.source]}. The ground floor is raised, so every door gets a way up.</small>
  <EntrancePicker value={held(own)} inherited={effective.preset} onChange={next=>st.commit(setStudioEntrance(recipe,target,next),`Entrance: ${ENTRANCE_LABELS[next.preset]}`)}/>
  <div className="studio-inspector-actions">{own&&<button aria-label="Use the default entrance" onClick={()=>st.commit(setStudioEntrance(recipe,target,null),'Entrance: default')}><Trash size={14}/> Use default</button>}<BrushButton st={st} choice={held(own)??{preset:effective.preset}}/></div>
 </Fold>;
}
/** Inspector › Building or Part: the default entrance of every door there that has no choice of its own. */
export function EntranceScopeSection({st,target}:{st:StudioState;target:'building'|`part:${string}`}){
 const recipe=st.recipe!,own=entranceFor(recipe,target);
 return <Fold title={target==='building'?'Entrances':'Entrances on this part'} label={target==='building'?'Building entrances':'Part entrances'} open={false}>
  <small className="studio-palette-hint">{own?`Every door ${target==='building'?'of the building':'of this part'} without its own choice: ${ENTRANCE_LABELS[own.preset]}.`:'Doors follow the facade theme (brownstone stoops, Georgian railed steps, civic grand stairs…) or plain steps.'}</small>
  <EntrancePicker value={held(own)} onChange={next=>st.commit(setStudioEntrance(recipe,target,next),`Entrances: ${ENTRANCE_LABELS[next.preset]}`)}/>
  {own&&<div className="studio-inspector-actions"><button onClick={()=>st.commit(setStudioEntrance(recipe,target,null),'Entrances: theme defaults')}><Trash size={14}/> Back to theme defaults</button></div>}
 </Fold>;
}
/** Brush › Openings › Doors: hold an entrance and click doors. */
export function EntranceBrushTray({st}:{st:StudioState}){
 const {brush}=useStairsEntrances();
 useEffect(()=>()=>setEntranceBrush({armed:false,hover:null}),[]);
 return <div className="studio-entrance-brush">
  <span className="studio-caption">Entrances</span>
  <EntrancePicker value={brush.held} onChange={next=>{if(brush.armed)armBrush(st,next);else setEntranceBrush({held:next});}}/>
  <button className="studio-entrance-brush-button" aria-pressed={brush.armed} aria-label="Entrance brush" onClick={()=>brush.armed?setEntranceBrush({armed:false}):armBrush(st,brush.held)}><PaintBrush size={14}/>{brush.armed?'Click doors to apply · click here to stop':'Brush entrances onto doors'}</button>
  {brush.note&&<small className="studio-palette-hint" role="status">{brush.note}</small>}
 </div>;
}

const SHAPES:(StairShape|'auto')[]=['auto','straight','l','u','spiral','core'];
const SHAPE_SHORT:Record<StairShape|'auto',string>={auto:'auto',straight:'straight',l:'L',u:'U',spiral:'spiral',core:'core'};
/** Rooms › Inside stair: options for the next stair, or the selected one (each change is one undo step). */
export function InteriorStairTray({st}:{st:StudioState}){
 const recipe=st.recipe!,interior=recipe.version===6?recipe.interior:null,{stair:options}=useStairsEntrances();
 const selected=interior&&st.roomsTool==='interior-stair'?interior.stairs.find(s=>s.id===st.interiorEditId)??null:null;
 useEffect(()=>{setStairGhost({armed:st.roomsTool==='interior-stair'&&!selected,plotId:st.plot.id,floor:st.floor});},[st.roomsTool,selected,st.plot.id,st.floor]);
 useEffect(()=>()=>setStairGhost({armed:false}),[]);
 const v={layout:selected?.layout==='switchback'?'u':selected?.layout??options.layout,rail:selected?.rail??(selected?'timber':options.rail),entry:selected?.entry??(selected?'front':options.entry),exit:selected?.exit??(selected?'ahead':options.exit),flip:selected?.flip??options.flip,width:selected?.width??(selected?1:options.width),rotation:selected?.rotation??options.rotation};
 const change=(patch:Partial<StudioInteriorStair>)=>{
  if(!selected||!interior){setStairOptions(patch as never);return;}
  const next={...selected,...patch};for(const [k,def] of [['rail','timber'],['entry','front'],['exit','ahead'],['width',1]] as const)if(next[k]===def)delete next[k];
  st.commit({...recipe,interior:{...interior,stairs:interior.stairs.map(s=>s.id===selected.id?next:s)}} as typeof recipe,'Change stair');
 };
 const shape=stairShapeOf(v.layout as StudioInteriorStair['layout']),fixed=shape==='spiral'||shape==='core';
 const d=st.draft.design,rise=sculptFloorBottom(st.floor+1,d.groundHeight,d.upperHeight)-sculptFloorBottom(st.floor,d.groundHeight,d.upperHeight),n=Math.ceil(rise/STAIR.riserMax-1e-9);
 const reason=selected?st.prepared?.inactive?.find(i=>i.id===selected.id)?.reason:null;
 return <div className="studio-stair-tray">
  <span className="studio-caption">{selected?'Selected stair':'Inside stairs'} · {n} risers of {(rise/n).toFixed(3)} m</span>
  <div className="studio-segment studio-stair-shapes" role="group" aria-label="Interior stair shape">{SHAPES.map(id=><button key={id} aria-pressed={(v.layout==='switchback'?'u':v.layout)===id} title={id==='auto'?'The first that fits: straight, U, L, spiral':STAIR_SHAPE_LABELS[id]} onClick={()=>change({layout:id})}><StairIcon shape={id}/>{SHAPE_SHORT[id]}</button>)}</div>
  <div className="studio-segment" role="group" aria-label="Stair turn and rotation"><button aria-pressed={v.flip} title="Turn the other way (L, U, spiral, core)" onClick={()=>change({flip:!v.flip})}>Flip turn</button><button aria-label="Rotate stair" title="A quarter turn" onClick={()=>change({rotation:((v.rotation+Math.PI/2)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)})}><ArrowClockwise size={14}/> Rotate</button></div>
  <span className="studio-caption">Enter from</span><div className="studio-segment" role="group" aria-label="Stair entry side">{(['front','left','right'] as const).map(e=><button key={e} disabled={fixed} aria-pressed={v.entry===e} onClick={()=>change({entry:e})}>{e}</button>)}</div>
  <span className="studio-caption">Leave the top</span><div className="studio-segment" role="group" aria-label="Stair exit side">{(['ahead','left','right'] as const).map(e=><button key={e} disabled={fixed} aria-pressed={v.exit===e} onClick={()=>change({exit:e})}>{e}</button>)}</div>
  <span className="studio-caption">Railing</span><div className="studio-segment studio-chips" role="group" aria-label="Stair railing">{RAIL_STYLES.map(r=><button key={r} aria-pressed={v.rail===r} onClick={()=>change({rail:r})}>{RAIL_LABELS[r]}</button>)}</div>
  <span className="studio-caption">Width</span><div className="studio-segment" role="group" aria-label="Stair width">{[.9,1,1.2,1.4].map(w=><button key={w} disabled={shape==='spiral'} aria-pressed={Math.abs(v.width-w)<.01} onClick={()=>change({width:w})}>{w.toFixed(1)} m</button>)}</div>
  {reason&&<small className="studio-palette-hint is-warning" role="status">{reason}</small>}
  <small className="studio-palette-hint">{selected?'Changes apply to the selected stair. Choose another stair or draw a new one below.':'Click a floor where you step on and drag towards where it climbs. The ghost shows the fit: green fits, red says why not.'}</small>
 </div>;
}
