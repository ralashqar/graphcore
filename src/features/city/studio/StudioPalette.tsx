// Left flyout palette next to the tool rail; its content follows the rail tool (docs/city-studio-ui-v2.md).
import {AppWindow,Cube,Cylinder,DiceFive,Door,GridFour,House,Lamp,Polygon,Scissors,Stairs,Trash,Wall,X,type Icon} from '@phosphor-icons/react';
import {upgradeStudioInterior} from '../../../domain/cityStudioInteriors';
import {setSculptPreview,clearSculptPreview} from '../citySculptPreview';
import {CityRoofTray} from '../CityRoofTray';
import {RoofExtras} from './RoofExtras';
import {CityFurnitureTray} from '../CityFurnitureTray';
import {SELECT_LEVELS,studioRailLabel,type StudioSelectLevel} from '../studioRail';
import {PaletteBrush} from './PaletteBrush';
import {LEVEL_COLOURS} from './StudioSceneMarks';
import type {BuildShape,StudioState} from './useStudioState';

export const LEVEL_ICONS:Record<StudioSelectLevel,Icon>={part:Cube,wall:Wall,tile:GridFour,opening:AppWindow,object:Lamp};

export function StudioPalette({st,compact=false}:{st:StudioState;compact?:boolean}){
 const title=st.rail==='paint'||st.rail==='erase'?'Brush':studioRailLabel(st.rail);
 if(compact)return <aside className="studio-palette is-compact" aria-label={`${title} palette`}><div className="studio-palette-body"><SelectLevels st={st}/></div></aside>;
 return <aside className={`studio-palette is-${st.rail}`} aria-label={`${title} palette`}>
  <header className="studio-palette-head"><strong>{title}</strong><button aria-label="Hide palette" title="Hide palette" onClick={()=>st.setPaletteOpen(false)}><X size={14}/></button></header>
  <div className="studio-palette-body">
   {st.rail==='select'?<PaletteSelect st={st}/>:st.rail==='build'?<PaletteBuild st={st}/>:st.rail==='paint'||st.rail==='erase'?<PaletteBrush st={st}/>:st.rail==='roof'?<PaletteRoof st={st}/>:st.rail==='garden'?<PaletteGarden st={st}/>:st.rail==='rooms'?<PaletteRooms st={st}/>:<PaletteFurnish st={st}/>}
  </div>
 </aside>;
}

export function SelectLevels({st}:{st:StudioState}){
 return <div className="studio-levels" role="radiogroup" aria-label="Select level">{SELECT_LEVELS.map(l=>{const Glyph=LEVEL_ICONS[l.id],on=st.rail==='select'&&st.level===l.id;return <button key={l.id} role="radio" aria-checked={on} aria-label={`Select ${l.label.toLowerCase()}s`} title={`${l.label}: ${l.hint} · Tab cycles`} style={{'--level':LEVEL_COLOURS[l.id]} as React.CSSProperties} onClick={()=>st.setLevel(l.id)}><Glyph size={20} weight={on?'fill':'regular'}/><span>{l.label}</span></button>;})}</div>;
}

function PartList({st}:{st:StudioState}){
 const recipe=st.recipe!;
 return <div className="studio-part-list" role="group" aria-label="My parts">{recipe.volumes.map((v,i)=><button key={v.id} aria-pressed={st.selected?.id===v.id} onClick={()=>{st.chooseRail('select','part');st.select({level:'part',partId:v.id});}}>{v.kind==='ellipse'?<Cylinder size={18}/>:<Cube size={18}/>}<span>{v.operation==='subtract'?'Cutout':'Part'} {i+1}<small>Storeys {v.startFloor+1}–{v.startFloor+v.spanFloors}</small></span></button>)}{!recipe.volumes.length&&<small className="studio-palette-hint">No parts yet: choose Build and draw a block.</small>}</div>;
}

function PaletteSelect({st}:{st:StudioState}){
 const hint=SELECT_LEVELS.find(l=>l.id===st.level)?.hint;
 return <>
  <SelectLevels st={st}/>
  <p className="studio-palette-hint">{hint}. <b>Tab</b> changes level, <b>double-click</b> drills down, <b>Shift</b> adds, <b>Esc</b> steps up.</p>
  <span className="studio-caption">My parts</span>
  <PartList st={st}/>
 </>;
}

const BLOCKS:readonly {id:BuildShape;label:string;icon:Icon;hint:string}[]=[
 {id:'block',label:'Box',icon:Cube,hint:'Drag on the ground or on a roof to draw a box · Alt carves'},
 {id:'round',label:'Round',icon:Cylinder,hint:'Drag to draw a round tower'},
 {id:'oval',label:'Oval',icon:Cylinder,hint:'Drag to draw an oval'},
 {id:'outline',label:'Polygon',icon:Polygon,hint:'Sculpt the selected box into a polygon: pull walls and bays, bevel or recess corners'},
 {id:'cut',label:'Cut',icon:Scissors,hint:'Drag to carve a cutout through parts'},
];
function PaletteBuild({st}:{st:StudioState}){
 const s=st.selected,outlineOk=!!s&&s.kind!=='ellipse'&&s.operation!=='subtract';
 return <>
  <span className="studio-caption">Blocks</span>
  <div className="studio-blocks">{BLOCKS.map(b=>{const Glyph=b.icon,on=st.rail==='build'&&st.buildShape===b.id,disabled=b.id==='outline'&&!outlineOk;return <button key={b.id} className={`studio-block tool-${b.id}`} aria-label={b.label} aria-pressed={on} disabled={disabled} title={disabled?'Select a box part first (Select · Part), then sculpt its outline':b.hint} onClick={()=>{st.chooseRail('build');st.setBuildShape(b.id);}}><Glyph size={34} weight={on?'fill':'duotone'}/><span>{b.label}</span></button>;})}</div>
  {st.buildShape==='outline'&&<div className="studio-outline-options"><span>Pull</span><div className="studio-segment" aria-label="Edge action"><button aria-pressed={st.outlineEdgeMode==='whole'} onClick={()=>st.setOutlineEdgeMode('whole')}>Wall</button><button aria-pressed={st.outlineEdgeMode==='bay'} onClick={()=>st.setOutlineEdgeMode('bay')}>Bay</button></div><span>Corner</span><div className="studio-segment" aria-label="Corner action"><button aria-pressed={st.outlineCornerMode==='bevel'} onClick={()=>st.setOutlineCornerMode('bevel')}>Bevel</button><button aria-pressed={st.outlineCornerMode==='recess'} onClick={()=>st.setOutlineCornerMode('recess')}>Recess</button></div></div>}
  <p className="studio-palette-hint">{BLOCKS.find(b=>b.id===st.buildShape)?.hint}. Drawing over a roof stacks on the storey above.</p>
  <span className="studio-caption">Start from</span>
  <div className="studio-blocks is-ideas"><button className="studio-block" aria-label="Starting ideas" onClick={()=>{st.setCollection(false);st.setStarters(true);}}><House size={30} weight="duotone"/><span>Starting ideas</span></button><button className="studio-block" aria-label="Blender collection" onClick={()=>{st.setCollection(true);st.setStarters(true);}}><House size={30}/><span>Collection</span></button></div>
  <span className="studio-caption">My parts</span>
  <PartList st={st}/>
 </>;
}

function PaletteRoof({st}:{st:StudioState}){
 const recipe=st.recipe!,part=st.selected?.operation==='add'?st.selected:undefined;
 return <>
  <div className="studio-segment" role="group" aria-label="Roof tool"><button aria-pressed={st.roofMode==='roof'} onClick={()=>st.setRoofMode('roof')}>Shape</button><button aria-pressed={st.roofMode==='roof-opening'} disabled={!recipe.studio.roofRevision} onClick={()=>st.setRoofMode('roof-opening')}>Openings</button><button aria-pressed={st.roofMode==='roof-detail'} disabled={!st.roofModule} onClick={()=>st.setRoofMode('roof-detail')}>Details</button></div>
  <div className="studio-roof-panel"><CityRoofTray abutment={st.prepared?.roofEdges?.find(e=>e.partId===st.selected?.id&&e.kind==='abutment')} scope={st.roofScope} setScope={st.setRoofScope} key={st.selected?.id??'none'} recipe={recipe} part={part} commit={st.commit} preview={r=>{if(r)setSculptPreview(st.plot.id,r,st.draft.design);else clearSculptPreview(st.plot.id);}}/></div>
  <RoofExtras st={st}/>
 </>;
}

function PaletteGarden({st}:{st:StudioState}){
 const {land,draft}=st;
 return <div className="studio-garden">
  <span className="studio-caption">Planting</span><div className="studio-segment">{(['minimal','garden','wooded'] as const).map(style=><button key={style} aria-pressed={draft.nature.style===style} onClick={()=>land.edit({...draft,nature:{...draft.nature,style}})}>{style==='minimal'?'Clear':style==='garden'?'Garden':'Wooded'}</button>)}</div>
  <button title="Reshuffle the planting" onClick={()=>land.edit({...draft,nature:{...draft.nature,seed:(draft.nature.seed+7919)%1000000}})}><DiceFive size={18} weight="duotone"/> New arrangement</button>
  <span className="studio-caption">Ground</span><div className="studio-segment studio-chips" role="group" aria-label="Ground finish">{([['grass-lawn','Lawn'],['grass-meadow','Meadow'],['pavers','Pavers']] as const).map(([id,label])=><button key={id} aria-pressed={(draft.design.textures?.ground??'grass-lawn')===id} onClick={()=>land.edit({...draft,design:{...draft.design,textures:{...draft.design.textures,ground:id}}})}><i className={`studio-chip-swatch is-${id}`}/>{label}</button>)}</div>
  <span className="studio-caption">Boundary</span><div className="studio-segment" role="group" aria-label="Plot boundary">{([['garden-wall','Garden wall'],['open-rail','Rail'],['none','Open']] as const).map(([id,label])=><button key={id} aria-pressed={(draft.design.enclosure??'garden-wall')===id} onClick={()=>land.edit({...draft,design:{...draft.design,enclosure:id}})}>{label}</button>)}</div>
 </div>;
}

function PaletteRooms({st}:{st:StudioState}){
 const recipe=st.recipe!,floor=st.floor;
 if(recipe.version===5)return <div className="studio-room-tray"><span>Open this building for walkable rooms and doors.</span><button className="studio-primary" onClick={()=>st.commit(upgradeStudioInterior(recipe))}>Add interiors</button></div>;
 const i=recipe.interior;
 return <div className="studio-room-tray">
  <div className="studio-tray is-grid"><button className="studio-tile" aria-pressed={st.roomsTool==='interior-room'} onClick={()=>{st.setInteriorEditId(null);st.setRoomsTool('interior-room');}}><Cube size={30}/><span>Choose room</span></button><button className="studio-tile" aria-pressed={st.roomsTool==='interior-partition'} onClick={()=>{st.setInteriorEditId(null);st.setRoomsTool('interior-partition');}}><Wall size={30}/><span>Draw wall</span></button><button className="studio-tile" aria-pressed={st.roomsTool==='interior-door'} onClick={()=>{st.setInteriorEditId(null);st.setRoomsTool('interior-door');}}><Door size={30}/><span>Door</span></button><button className="studio-tile" aria-pressed={st.roomsTool==='interior-stair'} onClick={()=>{st.setInteriorEditId(null);st.setRoomsTool('interior-stair');}}><Stairs size={30}/><span>Inside stair</span></button></div>
  {st.roomsTool==='interior-door'&&<div className="studio-segment" aria-label="Interior door"><button aria-pressed={st.interiorDoorStyle==='panelled'} onClick={()=>st.setInteriorDoorStyle('panelled')}>Panelled</button><button aria-pressed={st.interiorDoorStyle==='glazed'} onClick={()=>st.setInteriorDoorStyle('glazed')}>Glazed</button><button aria-pressed={st.interiorDoorHinge==='left'} onClick={()=>st.setInteriorDoorHinge('left')}>Left hinge</button><button aria-pressed={st.interiorDoorHinge==='right'} onClick={()=>st.setInteriorDoorHinge('right')}>Right hinge</button></div>}
  <span className="studio-caption">Inside stairs</span><div className="studio-segment" aria-label="Interior stair shape">{(['auto','straight','switchback'] as const).map(id=><button key={id} aria-pressed={st.stairLayout===id} onClick={()=>st.setStairLayout(id)}>{id}</button>)}<button aria-pressed={st.flip} onClick={()=>st.setFlip(!st.flip)}>Flip</button></div>
  <span className="studio-caption">Whole building</span><div className="studio-segment" aria-label="Floor finish">{(['timber','tile','stone'] as const).map(finish=><button key={finish} aria-pressed={i.floorFinish===finish} onClick={()=>st.commit({...recipe,interior:{...i,floorFinish:finish}})}>{finish}</button>)}</div>
  <label className="studio-colour-row">Interior wall colour <input type="color" aria-label="Interior wall colour" value={i.wallColor} onChange={e=>st.commit({...recipe,interior:{...i,wallColor:e.target.value}})}/></label>
  <span className="studio-caption">{st.prepared?.interiorLevels?.[floor]?.rooms.length??0} rooms detected on this floor</span>
  <div className="studio-room-list">{i.partitions.filter(p=>p.floor===floor).map((p,n)=><span key={p.id}><button aria-pressed={st.interiorEditId===p.id} onClick={()=>{st.setInteriorEditId(p.id);st.setRoomsTool('interior-partition');}}>Wall {n+1} · redraw</button><button aria-label={`Remove wall ${n+1}`} onClick={()=>st.commit({...recipe,interior:{...i,partitions:i.partitions.filter(item=>item.id!==p.id)}})}><Trash size={14}/></button></span>)}{i.doors.filter(d=>i.partitions.some(p=>p.id===d.partitionId&&p.floor===floor)).map((door,n)=><span key={door.id}><button onClick={()=>st.commit({...recipe,interior:{...i,doors:i.doors.map(d=>d.id===door.id?{...d,style:d.style==='panelled'?'glazed':'panelled'}:d)}})}>Door {n+1} · {door.style}</button><button title="Flip hinge" aria-label={'Flip door '+(n+1)+' hinge'} onClick={()=>st.commit({...recipe,interior:{...i,doors:i.doors.map(d=>d.id===door.id?{...d,hinge:d.hinge==='left'?'right':'left'}:d)}})}>↔</button><button aria-label={'Remove door '+(n+1)} onClick={()=>st.commit({...recipe,interior:{...i,doors:i.doors.filter(d=>d.id!==door.id)}})}><Trash size={14}/></button></span>)}{i.stairs.filter(p=>p.floor===floor).map((p,n)=><span key={p.id}><button aria-pressed={st.interiorEditId===p.id} onClick={()=>{st.setInteriorEditId(p.id);st.setRoomsTool('interior-stair');}}>Stair {n+1} · move</button><button aria-label={`Remove interior stair ${n+1}`} onClick={()=>st.commit({...recipe,interior:{...i,stairs:i.stairs.filter(item=>item.id!==p.id)}})}><Trash size={14}/></button></span>)}</div>
 </div>;
}

function PaletteFurnish({st}:{st:StudioState}){
 const recipe=st.recipe!;
 if(recipe.version!==6)return <div className="studio-room-tray"><span>Add interior floors to furnish this building.</span><button onClick={()=>st.commit(upgradeStudioInterior(recipe))}>Add interiors</button></div>;
 return <CityFurnitureTray kind={st.furnitureKind} placing={st.furnishTool==='interior-furniture'} items={(recipe.interior.furniture??[]).filter(item=>item.floor===st.floor)} total={recipe.interior.furniture?.length??0} selected={st.selectedFurnitureId} choose={st.chooseFurniture} select={st.selectFurniture} move={st.moveFurniture} rotate={st.rotateFurniture} duplicate={()=>st.chooseFurniture(st.furnitureKind)} remove={st.removeFurniture}/>;
}
