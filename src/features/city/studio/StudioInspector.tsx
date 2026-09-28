// Right-hand inspector (docs/city-studio-ui-v2.md): a breadcrumb for the Select selection and progressive sections
// for the building, a part, walls, tiles, openings and objects. Actions apply to the selection.
import {RoomFloorOptions} from './StudioFloorSurfaces';
import {useState,type ReactNode} from 'react';
import {ArrowClockwise,ArrowsOut,CaretDown,CaretRight,Copy,DiceFive,PaintBrush,Polygon,Trash,X} from '@phosphor-icons/react';
import {STUDIO_FAMILIES,STUDIO_MODULE_MAP,studioModules} from '../../../domain/cityStudioCatalog';
import {moduleOpeningSpec} from '../../../domain/cityStudioModuleSpec';
import {FREE_OPENING_SHAPES,FREE_OPENING_STYLES,freeOpeningHitFromBay,nudgeFreeOpening,placeFreeOpening} from '../../../domain/cityStudioFreeOpenings';
import {freeTrimKinds,toggleFreeTrim} from '../../../domain/cityStudioTrimParts';
import {nudgeRoofOpening,removeRoofOpening} from '../../../domain/cityStudioRoofOpenings';
import {materializeFacadeRhythm,setFacadeRhythmRule} from '../../../domain/cityStudioFacadeRhythm';
import {STAMP_MAP,unpackStorefront} from '../../../domain/cityStorefrontStamps';
import {expandBuildingVariation} from '../../../domain/cityBuildingVariation';
import {studioDraft} from '../../../domain/cityStudio';
import type {SculptWallSide} from '../../../domain/citySculpt';
import type {StudioFamily,StudioRecipe,StudioRoof} from '../../../domain/cityStudioTypes';
import {preparedStudioPlot} from '../cityStudioRegistry';
import {CityRhythmPanel} from '../CityRhythmPanel';
import {CityPaintRulesPanel} from '../CityPaintRulesPanel';
import {CityVariationDimensions} from '../CityVariationDimensions';
import {CityVariationPanel} from '../CityVariationPanel';
import {FREE_PRESETS,freeOpeningOutline,freePresetFor,freeModuleTrayId} from '../studioFreeOpeningTool';
import {assembliesAt,countStudioItems,kitOpeningAt,removeStudioOpenings,selectionCrumbs,wallLabel,type StudioObjectRef,type StudioSelection,type WallRef} from '../studioSelection';
import {LEVEL_ICONS,OutlineActions} from './StudioPalette';
import {editableOutline,setOutlineEdgeLength,OUTLINE_EDIT} from '../../../domain/cityStudioOutlineEdit';
import {StyleFilter,moduleStyle,styleMatches} from './studioStyles';
import {LEVEL_COLOURS} from './StudioSceneMarks';
import {DECOR_LABELS,TRIM_LABELS,type StudioState} from './useStudioState';
import {ThemeSection} from './StudioThemes';
import {EntranceOpeningSection,EntranceScopeSection} from './StudioEntrances';

const ROOFS:StudioRoof[]=['flat','terrace','pitched','mansard'];
const SHAPE_LABELS:Record<string,string>={rect:'Rectangle',arch:'Arch',round:'Round',pointed:'Pointed'};

function Section({title,children,open:initial=true,label,count}:{title:string;children:ReactNode;open?:boolean;label?:string;count?:number}){
 const [open,setOpen]=useState(initial);
 return <section className="studio-inspector-section"><button className="studio-section-toggle" aria-expanded={open} aria-label={label} onClick={()=>setOpen(!open)}>{open?<CaretDown size={12}/>:<CaretRight size={12}/>}<span>{title}</span>{count!==undefined&&<small>{count}</small>}</button>{open&&<div className="studio-section-body">{children}</div>}</section>;
}

export function StudioInspector({st}:{st:StudioState}){
 const recipe=st.recipe;if(!recipe)return null;
 const s=st.selection,objectName=(o:StudioObjectRef)=>o.kind==='roof-opening'?(recipe.studio.roofOpenings?.find(x=>x.id===o.id)?.kind==='dormer'?'Dormer':'Skylight'):o.kind==='roof-detail'?STUDIO_MODULE_MAP.get(recipe.studio.roofDetails?.find(x=>x.id===o.id)?.module??'')?.label??'Roof detail':o.kind==='assembly'?DECOR_LABELS[recipe.studio.assemblies.find(x=>x.id===o.id)?.kind??'balcony']:'Object';
 const crumbs=selectionCrumbs(s,st.partName,objectName),interior=st.rail==='rooms'||st.rail==='furnish';
 return <aside className="studio-inspector" aria-label="Inspector">
  <header className="studio-inspector-head"><strong>{interior?(st.rail==='rooms'?'Rooms':'Furniture'):'Inspector'}</strong><button aria-label="Hide inspector" title="Hide inspector" onClick={()=>st.setInspectorOpen(false)}><X size={14}/></button></header>
  {!interior&&<nav className="studio-crumbs" aria-label="Selection path">{crumbs.map((c,i)=>{const Glyph=c.level==='building'?null:LEVEL_ICONS[c.level],last=i===crumbs.length-1;return <button key={`${c.level}/${i}`} aria-current={last?'location':undefined} style={{'--level':c.level==='building'?'#b9c7b3':LEVEL_COLOURS[c.level]} as React.CSSProperties} title={last?'Current selection':`Step up to ${c.label}`} onClick={()=>st.goTo(c.selection)}>{Glyph&&<Glyph size={13}/>}<span>{c.label}</span></button>;})}</nav>}
  <div className="studio-inspector-body">
   {st.rail==='rooms'?<RoomSection st={st}/>:st.rail==='furnish'?<FurnitureSection st={st}/>:
    s.level==='building'?<BuildingSection st={st}/>:s.level==='part'?<PartSection st={st} partId={s.partId}/>:s.level==='wall'?<WallSection st={st} walls={s.walls}/>:s.level==='tile'?<TileSection st={st} sel={s}/>:s.level==='opening'?<OpeningSection st={st} sel={s}/>:<ObjectSection st={st} sel={s}/>}
   {!interior&&<RulesSection st={st}/>}
  </div>
 </aside>;
}

function StyleControls({st,part}:{st:StudioState;part:boolean}){
 const style=part?st.style:st.recipe!.studio.defaults;
 return <>
  <span className="studio-caption">Architectural look</span>
  <div className="studio-family">{Object.entries(STUDIO_FAMILIES).map(([id,f])=><button key={id} title={f.label} aria-label={f.label} aria-pressed={style?.family===id} onClick={()=>st.editStyle({family:id as StudioFamily},part)}><i style={{background:f.wall,borderColor:f.trim}}/><small>{f.label}</small></button>)}</div>
  <span className="studio-caption">Windows</span>
  <div className="studio-segment">{(['sparse','regular','glazing'] as const).map(r=><button key={r} aria-pressed={style?.rhythm===r} onClick={()=>st.editStyle({rhythm:r},part)}>{r==='glazing'?'Glass':r}</button>)}</div>
  <span className="studio-caption">Quick roof</span>
  <div className="studio-roofs">{ROOFS.map(roof=><button key={roof} aria-pressed={style?.roof===roof} onClick={()=>st.editStyle({roof},part)}><span className={`studio-roof-icon is-${roof}`}/>{roof}</button>)}</div>
 </>;
}

function BuildingSection({st}:{st:StudioState}){
 const recipe=st.recipe!,parts=recipe.volumes.filter(v=>v.operation==='add').length;
 return <>
  <div className="studio-inspector-title"><strong>{st.draft.name||'Building'}</strong><small>{parts} {parts===1?'part':'parts'} · {st.highestStorey} {st.highestStorey===1?'storey':'storeys'}{recipe.studio.facade==='unified'?' · editable facade':''}</small></div>
  <div className="studio-inspector-actions"><button aria-label="Roll a new facade look" title="New look · Space (hand-placed edits stay)" disabled={!st.diceReady} onClick={st.tryAnotherLook}><DiceFive size={18} weight="duotone"/> New look</button>{st.unifiedFacade.canConvert&&<button className="studio-unified-convert" title="Turn the kit tiles into kit pieces on generated walls: every window can be moved and the rhythm fills around them (undoable)" onClick={st.unifiedFacade.convert}>Convert to editable facade</button>}</div>
  {st.kitVersion!==5&&!st.diceReady&&<small className="studio-palette-hint">Add the Blender catalog (Brush → Openings) to use style dice.</small>}
  <Section title="Theme" label="Building theme"><ThemeSection st={st}/></Section>
  <Section title="Default style"><StyleControls st={st} part={false}/></Section>
  <EntranceScopeSection st={st} target="building"/>
  <section className="studio-inspector-section"><button className="studio-section-toggle" aria-expanded={st.variationOpen} aria-label="Variation rules" onClick={()=>st.setVariationOpen(!st.variationOpen)}>{st.variationOpen?<CaretDown size={12}/>:<CaretRight size={12}/>}<span>Variation and structure</span></button>
   {st.variationOpen&&<div className="studio-section-body studio-advanced-body"><p className="studio-palette-hint">Fine-tune structure and tile variation. Manual edits remain protected.</p><CityVariationDimensions recipe={recipe} design={st.draft.design} onChange={(r,d)=>st.land.edit(studioDraft({...st.draft,design:d},r))}/><CityVariationPanel recipe={recipe} design={st.draft.design} onChange={(r,heights)=>heights?st.land.edit(studioDraft({...st.draft,design:{...st.draft.design,...heights}},r)):st.commit(r)} selectedPart={st.selected?.id}/></div>}
  </section>
 </>;
}

function EraseRow({st,where,place}:{st:StudioState;where:{walls?:WallRef[];parts?:string[]};place:'wall'|'part'}){
 const c=countStudioItems(st.recipe!,where),row=(what:'openings'|'paint'|'decor'|'trims'|'storefronts'|'roof',label:string)=>c[what]?<button key={what} className="studio-erase" aria-label={`Erase all ${label} on this ${place}`} onClick={()=>st.eraseItems(what,where,place)}><Trash size={14}/><span>{label}</span><small>{c[what]}</small></button>:null;
 const rows=[row('openings','openings'),row('paint','paint'),row('decor','decorations'),row('trims','trims'),row('storefronts','storefronts'),place==='part'?row('roof','roof details'):null].filter(Boolean);
 return <Section title={`Erase on this ${place}`} count={rows.length}>{rows.length?<div className="studio-erase-list">{rows}</div>:<small className="studio-palette-hint">Nothing hand-placed here. Generated rhythm openings are switched off with “Make this wall plain”.</small>}</Section>;
}

function PartSection({st,partId}:{st:StudioState;partId:string}){
 const v=st.selected;if(!v||v.id!==partId)return null;
 const kind=v.operation==='subtract'?'Cutout':v.kind==='ellipse'?(Math.abs(v.width-v.depth)<1e-6?'Round part':'Oval part'):v.kind==='polygon'?'Polygon part':'Box part';
 const walls=[...new Map(st.interaction.bays.filter(b=>b.anchor.shapeId===v.id).map(b=>[b.anchor.side,{shapeId:v.id,side:b.anchor.side}])).values()];
 return <>
  <div className="studio-inspector-title"><strong>{st.partName(v.id)}</strong><small>{kind} · {v.spanFloors} {v.spanFloors===1?'storey':'storeys'}{v.startFloor?` from storey ${v.startFloor+1}`:''}</small></div>
  <div className="studio-inspector-actions is-icons">
   <button aria-label="Duplicate part" title="Duplicate · Ctrl D" onClick={st.duplicate}><Copy/></button>
   {v.kind!=='polygon'&&<button aria-label="Rotate part" title="Quarter turn (drag the Turn handle for free rotation)" onClick={()=>st.editPart({width:v.depth,depth:v.width})}><ArrowClockwise/></button>}
   {v.operation==='add'&&<button aria-label="Sculpt outline" title="Edit outline: drag corners, add corners, push or pull walls" onClick={()=>{st.chooseRail('build');st.setBuildShape('outline');}}><Polygon/></button>}
   <button aria-label="Frame part" title="Frame · Z" onClick={()=>st.view('focus')}><ArrowsOut/></button>
   <button aria-label="Remove part" title="Remove · Delete" onClick={st.remove}><Trash/></button>
  </div>
  <Section title="Size"><div className="studio-precision">{([['width','Width',.25],['depth','Depth',.25],['spanFloors','Storeys',1],['startFloor','Base storey',1]] as const).filter(([key])=>v.kind!=='polygon'||key==='spanFloors'||key==='startFloor').map(([key,label,step])=><label key={key}>{label}<input aria-label={label} type="number" step={step} value={v[key]} onChange={e=>st.editPart({[key]:Number(e.target.value)})}/></label>)}</div><small className="studio-palette-hint">Or drag the Move, Height, Lift and Turn handles on the building.</small></Section>
  {v.operation==='add'&&<OutlineSection st={st}/>}
  {v.operation==='add'&&<Section title="Theme" label="Part theme"><ThemeSection st={st} partId={v.id}/></Section>}
  {v.operation==='add'&&<Section title="Style"><StyleControls st={st} part/><button onClick={()=>st.chooseRail('roof')}>Shape roof</button></Section>}
  {!!walls.length&&<Section title="Walls" count={walls.length}><div className="studio-chip-row">{walls.map(w=><button key={w.side} onClick={()=>st.select({level:'wall',partId:v.id,walls:[w]})}>{wallLabel(w)}</button>)}</div></Section>}
  <Section title="Paint"><div className="studio-inspector-actions"><button aria-label="Paint whole part" onClick={()=>st.paintPart(v.id)}><i className="studio-finish-dot" style={{background:st.color}}/>Paint whole part</button><button className="studio-text" onClick={()=>{const r=st.recipe!;st.commit({...r,studio:{...r.studio,surfaces:r.studio.surfaces.filter(x=>x.anchor.shapeId!==v.id),openings:r.studio.openings.filter(x=>x.anchor.shapeId!==v.id)}});}}>Reset local paint and openings</button></div></Section>
  {v.operation==='add'&&v.startFloor===0&&<EntranceScopeSection st={st} target={`part:${v.id}`}/>}
  <EraseRow st={st} where={{parts:[v.id]}} place="part"/>
 </>;
}

function rhythmRule(r:StudioRecipe,w:WallRef){return r.studio.facadeRhythm?.rules?.find(x=>x.partId===w.shapeId&&x.side===w.side&&x.fromFloor===undefined&&x.x0===undefined);}
function WallSection({st,walls}:{st:StudioState;walls:WallRef[]}){
 const recipe=st.recipe!,one=walls.length===1?walls[0]:null;
 const free=(recipe.studio.freeOpenings??[]).filter(o=>walls.some(w=>w.shapeId===o.shapeId&&w.side===o.side)),kit=recipe.studio.openings.filter(o=>walls.some(w=>w.shapeId===o.anchor.shapeId&&w.side===o.anchor.side)),stamps=(recipe.studio.stamps??[]).filter(o=>walls.some(w=>w.shapeId===o.anchor.shapeId&&w.side===o.anchor.side));
 const generated=!!preparedStudioPlot(st.plot.id)?.result.freeFaces?.some(f=>walls.some(w=>w.shapeId===f.shapeId&&w.side===f.side)),rule=one?rhythmRule(recipe,one):undefined,rhythm=!!recipe.studio.facadeRhythm;
 const partId=walls[0].shapeId,select=(o:{kind:'free'|'kit'|'stamp';id:string},wall:WallRef)=>st.select({level:'opening',partId:wall.shapeId,wall,openings:[o]});
 return <>
  <div className="studio-inspector-title"><strong>{one?wallLabel(one):`${walls.length} walls`}</strong><small>{st.partName(partId)} · {generated?'generated wall':'kit tiles'}{rule?.off?' · plain':rule?.manual==='own'?' · manual':''}</small></div>
  <Section title="Openings on this wall" count={free.length+kit.length+stamps.length}>
   <ul className="studio-opening-list">
    {free.map(o=><li key={o.id}><button onClick={()=>select({kind:'free',id:o.id},{shapeId:o.shapeId,side:o.side})}>{o.module?STUDIO_MODULE_MAP.get(o.module)?.label??'Kit piece':`${SHAPE_LABELS[o.shape]} ${o.bottom<=.05?'door':'window'}`}<small>{o.width.toFixed(1)} × {o.height.toFixed(1)} m</small></button><button aria-label="Remove opening" onClick={()=>st.commit(removeStudioOpenings(recipe,[{kind:'free',id:o.id}]),'Remove opening')}><Trash size={13}/></button></li>)}
    {kit.map(o=><li key={o.id}><button onClick={()=>select({kind:'kit',id:o.id},{shapeId:o.anchor.shapeId,side:o.anchor.side})}>{STUDIO_MODULE_MAP.get(o.module)?.label??o.module}<small>storey {o.anchor.floor+1}</small></button><button aria-label="Remove opening" onClick={()=>st.commit(removeStudioOpenings(recipe,[{kind:'kit',id:o.id}]),'Remove opening')}><Trash size={13}/></button></li>)}
    {stamps.map(o=><li key={o.id}><button onClick={()=>select({kind:'stamp',id:o.id},{shapeId:o.anchor.shapeId,side:o.anchor.side})}>{STAMP_MAP.get(o.stamp)?.label??'Storefront'}<small>storefront</small></button><button aria-label="Unpack this storefront" title="Unpack into editable tiles" onClick={()=>st.commit(unpackStorefront(recipe,o.id,expandBuildingVariation(recipe,st.draft.design).recipe))}><ArrowsOut size={13}/></button></li>)}
    {!free.length&&!kit.length&&!stamps.length&&<li className="studio-palette-hint">{rhythm&&generated?'Only generated rhythm openings: unpack this wall to edit them.':'No hand-placed openings yet. Use the Brush → Openings.'}</li>}
   </ul>
  </Section>
  {rhythm&&one&&generated&&<Section title="Facade rhythm on this wall">
   <div className="studio-inspector-actions">
    <button onClick={()=>{const out=materializeFacadeRhythm(recipe,st.draft.design,{shapeId:one.shapeId,side:one.side as SculptWallSide});if('reason' in out){st.interaction.setIssue(out.reason);return;}if(!out.ids.length){st.interaction.setIssue('This wall has no generated openings to unpack.');return;}st.commit(out.recipe);}}>Unpack this wall</button>
    <button aria-pressed={!!rule?.off} onClick={()=>st.commit(setFacadeRhythmRule(recipe,{partId:one.shapeId,side:one.side as SculptWallSide},{off:rule?.off?undefined:true}))}>Make this wall plain</button>
    <button aria-pressed={rule?.manual==='own'} onClick={()=>st.commit(setFacadeRhythmRule(recipe,{partId:one.shapeId,side:one.side as SculptWallSide},{manual:rule?.manual==='own'?undefined:'own'}))}>Keep this wall manual</button>
   </div>
   <small className="studio-palette-hint">Pools, spacing and style for this wall live in Facade rhythm below.</small>
  </Section>}
  <Section title="Paint"><div className="studio-inspector-actions"><button aria-label={one?'Paint this wall':'Paint these walls'} onClick={()=>st.paintWalls(walls)}><i className="studio-finish-dot" style={{background:st.color}}/>{one?'Paint this wall':'Paint these walls'}</button><button onClick={()=>{st.chooseRail('paint');st.chooseTarget('material');st.chooseSize('free');st.setBand(true);}}><PaintBrush size={15}/>Paint a band</button></div></Section>
  <EraseRow st={st} where={{walls}} place="wall"/>
 </>;
}

function TileSection({st,sel}:{st:StudioState;sel:Extract<StudioSelection,{level:'tile'}>}){
 const recipe=st.recipe!,bays=st.interaction.bays.filter(b=>sel.bays.includes(b.id)),first=bays[0];
 if(!first)return <small className="studio-palette-hint">This tile changed. Pick it again.</small>;
 const generated=!!preparedStudioPlot(st.plot.id)?.result.freeFaces?.some(f=>f.shapeId===first.anchor.shapeId&&f.side===first.anchor.side);
 const decorations=assembliesAt(recipe,first.anchor),kit=bays.map(b=>kitOpeningAt(recipe,b.anchor)).filter(Boolean);
 /** Put an opening on every selected tile: a kit tile opening, or a free opening centred on the tile of a generated wall. */
 const place=(choice:{free?:string;module?:string})=>{let next=recipe,skipped='';
  for(const b of bays){
   if(generated||st.unified){const hit=freeOpeningHitFromBay(next,st.draft.design,b,{x:b.x,y:b.y+b.height/2,z:b.z});if(!hit)continue;const preset=choice.free?freePresetFor(choice.free):freePresetFor(freeModuleTrayId(choice.module!));const out=placeFreeOpening(next,st.draft.design,hit,preset,st.interaction.bays);if('reason' in out){skipped=out.reason;continue;}next=out.recipe;continue;}
   if(!choice.module)continue;if(b.entrance&&!choice.module.startsWith('door-')){skipped='Keep a door at the main entrance.';continue;}
   const openings=next.studio.openings.filter(o=>!(o.anchor.shapeId===b.anchor.shapeId&&o.anchor.side===b.anchor.side&&o.anchor.floor===b.anchor.floor&&Math.abs(o.anchor.u-b.anchor.u)<.025));
   next={...next,studio:{...next.studio,openings:[...openings,{id:crypto.randomUUID(),anchor:{...b.anchor},module:choice.module}]}};
  }
  if(next!==recipe)st.commit(next,'Add opening');if(skipped)st.interaction.setIssue(skipped);};
 const pieces=studioModules(st.kitVersion).filter(p=>(p.category==='window'||p.category==='door')&&(!(generated||st.unified)||!!moduleOpeningSpec(p.id))&&styleMatches(st.styleFilter,moduleStyle(p.id))).slice(0,24);
 return <>
  <div className="studio-inspector-title"><strong>{bays.length>1?`${bays.length} tiles`:'Tile'}</strong><small>{wallLabel(sel.wall)} · storey {first.anchor.floor+1} · {STUDIO_MODULE_MAP.get(first.module)?.label??first.module}{first.entrance?' · main entrance':''}</small></div>
  <Section title="Opening type">
   {(generated||st.unified)&&<><span className="studio-caption">Shapes</span><div className="studio-tray is-grid is-compact">{FREE_PRESETS.filter(p=>p.id!=='arcade').map(p=>{const loop=freeOpeningOutline(p.preset.shape,p.preset.width,p.preset.height),scale=22/Math.max(p.preset.width,p.preset.height);return <button className="studio-tile" key={p.id} aria-label={`Place ${p.label}`} title={p.label} onClick={()=>place({free:p.id})}><svg viewBox="-26 -26 52 52" className="studio-free-icon" aria-hidden="true"><rect x="-26" y="-26" width="52" height="52" rx="6"/><path d={`M${loop.map(([x,y])=>`${(x*scale).toFixed(2)},${(-y*scale).toFixed(2)}`).join('L')}Z`}/></svg><span>{p.label}</span></button>;})}</div></>}
   <span className="studio-caption">Kit pieces</span><StyleFilter value={st.styleFilter} onChange={st.setStyleFilter}/><div className="studio-tray is-grid is-compact">{pieces.map(p=><button className="studio-tile" key={p.id} aria-label={`Place ${p.label}`} title={p.label} onClick={()=>place({module:p.id})}><img src={`/city/synarc-kit/v${st.kitVersion}/thumbnails/${p.id}.png`} alt="" loading="lazy"/><span>{p.label}</span></button>)}</div>
   {!!kit.length&&<button onClick={()=>st.commit(removeStudioOpenings(recipe,kit.map(o=>({kind:'kit' as const,id:o!.id}))),'Remove opening')}><Trash size={14}/> Remove opening here</button>}
  </Section>
  <Section title="Paint"><div className="studio-inspector-actions"><button aria-label="Paint this tile" onClick={()=>st.paintTiles(sel.bays)}><i className="studio-finish-dot" style={{background:st.color}}/>{bays.length>1?'Paint these tiles':'Paint this tile'}</button></div></Section>
  {!!decorations.length&&<Section title="Decorations here" count={decorations.length}><ul className="studio-opening-list">{decorations.map(a=><li key={a.id}><button onClick={()=>st.select({level:'object',partId:first.anchor.shapeId,object:{kind:'assembly',id:a.id}})}>{DECOR_LABELS[a.kind]}<small>{a.look}</small></button><button aria-label={`Remove ${DECOR_LABELS[a.kind]}`} onClick={()=>st.commit({...recipe,studio:{...recipe.studio,assemblies:recipe.studio.assemblies.filter(x=>x.id!==a.id)}},'Remove decoration')}><Trash size={13}/></button></li>)}</ul></Section>}
 </>;
}

function OpeningSection({st,sel}:{st:StudioState;sel:Extract<StudioSelection,{level:'opening'}>}){
 const recipe=st.recipe!,refs=sel.openings;
 if(refs.length>1)return <><div className="studio-inspector-title"><strong>{refs.length} openings</strong><small>{wallLabel(sel.wall)}</small></div><div className="studio-inspector-actions"><button onClick={st.deleteSelection}><Trash size={15}/> Remove {refs.length} openings</button></div></>;
 const ref=refs[0];
 if(ref.kind==='free'){
  const o=recipe.studio.freeOpenings?.find(x=>x.id===ref.id);if(!o)return null;
  const nudge=(patch:Parameters<typeof nudgeFreeOpening>[3])=>{const out=nudgeFreeOpening(recipe,st.draft.design,o.id,patch,st.interaction.bays);if('reason' in out)st.interaction.setIssue(out.reason);else st.commit(out.recipe);};
  const choice=st.freeChoice,module=o.module?STUDIO_MODULE_MAP.get(o.module):null;
  return <>
   <div className="studio-inspector-title"><strong>{module?module.label:`${SHAPE_LABELS[o.shape]} ${choice?.role??'opening'}`}</strong><small>{wallLabel(sel.wall)} · {o.width.toFixed(2)} × {o.height.toFixed(2)} m · drag it on the wall to move</small></div>
   {!module&&<Section title="Shape"><div className="studio-segment" role="group" aria-label="Opening shape">{FREE_OPENING_SHAPES.map(shape=><button key={shape} aria-pressed={o.shape===shape} onClick={()=>nudge({shape})}>{SHAPE_LABELS[shape]}</button>)}</div>
    <div className="studio-precision"><label>Width<input aria-label="Opening width" type="number" step={.1} min={.4} value={+o.width.toFixed(2)} onChange={e=>nudge({width:Number(e.target.value)})}/></label><label>Height<input aria-label="Opening height" type="number" step={.1} min={.4} value={+o.height.toFixed(2)} onChange={e=>nudge({height:Number(e.target.value)})}/></label></div>
    <span className="studio-caption">Surround</span><div className="studio-segment" role="group" aria-label="Opening surround">{FREE_OPENING_STYLES.map(style=><button key={style} aria-pressed={(o.style??'painted')===style} onClick={()=>nudge({style})}>{style}</button>)}</div></Section>}
   {(module?module.category==='door':o.bottom<.05)&&<EntranceOpeningSection st={st} target={`free:${o.id}`} members={[o.id]} partId={sel.partId}/>}
   <div className="studio-free-dress" role="group" aria-label="Dress this opening"><span>{module?'Kit piece · drag to move':`${choice?.role==='door'?'Door':'Window'} · dress it`}</span>{choice?.kinds.map(kind=><button key={kind} aria-pressed={freeTrimKinds(recipe,o.id).includes(kind)} onClick={()=>st.commit(toggleFreeTrim(recipe,o.id,kind))}>{TRIM_LABELS[kind]}</button>)}{!choice?.kinds.length&&<small>No trims suit this shape</small>}<button aria-label="Remove this opening" onClick={st.deleteSelection}><Trash size={15}/></button><button aria-label="Done dressing" onClick={()=>st.goTo({level:'wall',partId:sel.partId,walls:[sel.wall]})}><X size={15}/></button></div>
  </>;
 }
 if(ref.kind==='kit'){
  const o=recipe.studio.openings.find(x=>x.id===ref.id);if(!o)return null;const spec=STUDIO_MODULE_MAP.get(o.module),same=studioModules(st.kitVersion).filter(p=>p.category===spec?.category).slice(0,18);
  return <><div className="studio-inspector-title"><strong>{spec?.label??o.module}</strong><small>{wallLabel(sel.wall)} · storey {o.anchor.floor+1} · kit tile</small></div>
   <Section title="Swap piece"><div className="studio-tray is-grid is-compact">{same.map(p=><button className="studio-tile" key={p.id} aria-label={`Swap to ${p.label}`} aria-pressed={p.id===o.module} onClick={()=>st.commit({...recipe,studio:{...recipe.studio,openings:recipe.studio.openings.map(x=>x.id===o.id?{...x,module:p.id}:x)}})}><img src={`/city/synarc-kit/v${st.kitVersion}/thumbnails/${p.id}.png`} alt="" loading="lazy"/><span>{p.label}</span></button>)}</div></Section>
   {spec?.category==='door'&&o.anchor.floor===0&&<EntranceOpeningSection st={st} target={`kit:${o.id}`} members={[o.id]} partId={sel.partId}/>}
   <div className="studio-inspector-actions"><button aria-label="Remove this opening" onClick={st.deleteSelection}><Trash size={15}/> Remove</button></div></>;
 }
 const stamp=recipe.studio.stamps?.find(x=>x.id===ref.id);if(!stamp)return null;
 return <><div className="studio-inspector-title"><strong>{STAMP_MAP.get(stamp.stamp)?.label??'Storefront'}</strong><small>{wallLabel(sel.wall)} · protected storefront</small></div>
  <EntranceOpeningSection st={st} target={`stamp:${stamp.id}`} members={[`stamp/${stamp.id}/opening/0`]} partId={sel.partId}/>
  <div className="studio-inspector-actions"><button onClick={()=>st.commit(unpackStorefront(recipe,stamp.id,expandBuildingVariation(recipe,st.draft.design).recipe))}>Unpack this storefront</button><button aria-label="Remove this storefront" onClick={st.deleteSelection}><Trash size={15}/> Remove</button></div></>;
}

function ObjectSection({st,sel}:{st:StudioState;sel:Extract<StudioSelection,{level:'object'}>}){
 const recipe=st.recipe!,o=sel.object;
 if(o.kind==='roof-opening'){
  const chosen=recipe.studio.roofOpenings?.find(x=>x.id===o.id);if(!chosen)return null;const faces=preparedStudioPlot(st.plot.id)?.result.roofFaces??[];
  const change=(patch:Parameters<typeof nudgeRoofOpening>[4])=>{const out=nudgeRoofOpening(recipe,st.draft.design,faces,chosen.id,patch);if('reason' in out)st.interaction.setIssue(out.reason);else st.commit(out.recipe);};
  return <><div className="studio-inspector-title"><strong>{chosen.kind==='dormer'?'Dormer':'Skylight'}</strong><small>{sel.partId?st.partName(sel.partId):''} · drag it on the roof to move</small></div>
   <div className="studio-free-dress" role="group" aria-label="Selected roof opening"><span>{chosen.kind==='dormer'?'Dormer':'Skylight'}</span>{chosen.kind==='dormer'&&<>{(['gable','shed','flat'] as const).map(roof=><button key={roof} aria-pressed={(chosen.roof??'gable')===roof} onClick={()=>change({roof})}>{roof==='gable'?'Gable roof':roof==='shed'?'Shed roof':'Flat roof'}</button>)}{(['rect','arch'] as const).map(shape=><button key={shape} aria-pressed={(chosen.shape??'rect')===shape} onClick={()=>change({shape})}>{shape==='rect'?'Square window':'Arched window'}</button>)}</>}<button aria-label="Remove this roof opening" onClick={()=>{st.commit(removeRoofOpening(recipe,chosen.id));st.goTo(sel.partId?{level:'part',partId:sel.partId}:{level:'building'});}}><Trash size={15}/></button><button aria-label="Done with roof opening" onClick={()=>st.goTo(sel.partId?{level:'part',partId:sel.partId}:{level:'building'})}><X size={15}/></button></div></>;
 }
 if(o.kind==='roof-detail'){
  const d=recipe.studio.roofDetails?.find(x=>x.id===o.id);if(!d)return null;
  return <><div className="studio-inspector-title"><strong>{STUDIO_MODULE_MAP.get(d.module)?.label??'Roof detail'}</strong><small>{st.partName(d.partId)} · roof detail</small></div>
   <div className="studio-inspector-actions"><button onClick={()=>st.commit({...recipe,studio:{...recipe.studio,roofDetails:recipe.studio.roofDetails?.map(x=>x.id===d.id?{...x,rotation:(x.rotation+1)%4}:x)}})}><ArrowClockwise size={15}/> Turn</button><button aria-label="Remove this roof detail" onClick={st.deleteSelection}><Trash size={15}/> Remove</button></div></>;
 }
 if(o.kind==='assembly'){
  const a=recipe.studio.assemblies.find(x=>x.id===o.id);if(!a)return null;
  return <><div className="studio-inspector-title"><strong>{a.module?STUDIO_MODULE_MAP.get(a.module)?.label??DECOR_LABELS[a.kind]:DECOR_LABELS[a.kind]}</strong><small>{sel.partId?st.partName(sel.partId):''} · {a.anchors.length} {a.anchors.length===1?'tile':'tiles'}</small></div>
   <Section title="Look"><div className="studio-segment" role="group" aria-label="Decoration look">{(['simple','ornate'] as const).map(look=><button key={look} aria-pressed={a.look===look} onClick={()=>st.commit({...recipe,studio:{...recipe.studio,assemblies:recipe.studio.assemblies.map(x=>x.id===a.id?{...x,look}:x)}})}>{look}</button>)}</div></Section>
   <div className="studio-inspector-actions">{a.kind==='stair'&&<button onClick={()=>st.chooseStair(a.id)}>Edit stair</button>}<button aria-label="Remove this decoration" onClick={st.deleteSelection}><Trash size={15}/> Remove</button></div></>;
 }
 return null;
}

function RoomSection({st}:{st:StudioState}){
 const recipe=st.recipe!;
 if(recipe.version!==6)return <small className="studio-palette-hint">Add interiors (Rooms palette) to plan rooms and furnish them.</small>;
 const room=st.selectedRoom;
 return <section className="studio-room-panel" aria-label="Rooms and furnishing">
  <strong>Rooms on this floor</strong>
  <div className="studio-room-buttons">{st.roomChoices.map((r,index)=><button key={r.id} aria-pressed={st.selectedRoomId===r.id} onClick={()=>{st.setSelectedRoomId(r.id);if(st.roomsTool!=='interior-room')st.setRoomsTool('interior-room');}}>Room {index+1} <small>{Math.round(r.area)} m²{r.openToBelow?' · open to below':''}</small></button>)}{!st.roomChoices.length&&<small>No closed rooms yet: draw walls between the outside walls.</small>}</div>
  {room&&<div className="studio-room-options"><span className="studio-caption">Selected room floor</span><RoomFloorOptions st={st} room={room}/><label>Wall colour <input type="color" aria-label="Selected room wall colour" value={room.wallColor} onChange={e=>st.editRoom(room,{wallColor:e.target.value})}/></label>{st.floor>0&&<button aria-pressed={room.openToBelow} onClick={()=>st.editRoom(room,{openToBelow:!room.openToBelow})}>{room.openToBelow?'Restore this room floor':'Open this room to below'}</button>}</div>}
  <button onClick={()=>st.chooseRail('furnish')}>Browse furniture</button>
 </section>;
}

function FurnitureSection({st}:{st:StudioState}){
 const recipe=st.recipe!,item=recipe.version===6?recipe.interior.furniture?.find(x=>x.id===st.selectedFurnitureId):null;
 return <div className="studio-inspector-title"><strong>{item?'Selected piece':'Furnishing'}</strong><small>{item?`${item.kind} on storey ${item.floor+1} · R turns it, Delete removes it`:'Choose a piece in the library, then click the floor. Click a placed piece to move, turn or remove it.'}</small></div>;
}

function RulesSection({st}:{st:StudioState}){
 const recipe=st.recipe!,panel=st.rhythmPanel;
 const toggleRhythm=()=>{if(st.rhythmOpen){panel.setAction('pick');panel.setScope('building');st.setRhythmOpen(false);return;}
  const s=st.selection;if(s.level==='wall'){panel.setScope('walls');panel.setTargets(s.walls.map(w=>({partId:w.shapeId,side:w.side as SculptWallSide})));}else if(s.level==='part'){panel.setScope('parts');panel.setTargets([{partId:s.partId}]);}else if(s.level!=='building'&&s.partId&&s.level!=='object'){panel.setScope('walls');panel.setTargets([{partId:s.partId,side:(s.level==='tile'||s.level==='opening'?s.wall.side:'north') as SculptWallSide}]);}else panel.setScope('building');
  st.setRhythmOpen(true);};
 return <div className="studio-inspector-rules">
  <section className="studio-inspector-section"><button className="studio-section-toggle" aria-expanded={st.rhythmOpen} aria-label="Rhythm" title="Facade rhythm: generated openings from weighted pools, scoped to the building, parts, walls, floors or regions" onClick={toggleRhythm}>{st.rhythmOpen?<CaretDown size={12}/>:<CaretRight size={12}/>}<span>Facade rhythm</span>{recipe.studio.facadeRhythm&&<small>{recipe.studio.facadeRhythm.style??'custom'}</small>}</button>
   {st.rhythmOpen&&<div className="studio-section-body"><CityRhythmPanel recipe={recipe} commit={r=>st.commit(r)} panel={panel} partName={st.partName} shuffle={st.tryAnotherLook} onClose={()=>{panel.setAction('pick');panel.setScope('building');}} onTheme={(id,partId)=>st.applyTheme(id,partId?{scope:'part',partId}:{scope:'building'})}/></div>}
  </section>
  <CityPaintRulesPanel recipe={recipe} commit={r=>st.commit(r)} state={st.paintRules} partName={st.partName} finish={st.finish} channel={st.channel} floor={st.floor} setIssue={st.interaction.setIssue}/>
 </div>;
}

const SIDE_NAMES:Record<string,string>={south:'South',north:'North',east:'East',west:'West'};
/** Numeric wall length: commits on Enter or blur as one undo step (the next wall stretches). */
function EdgeLength({value,label,onCommit}:{value:number;label:string;onCommit:(value:number)=>void}){
 const shown=(Math.round(value*100)/100).toString(),[text,setText]=useState(shown),[was,setWas]=useState(shown);
 if(was!==shown){setWas(shown);setText(shown);}
 const commit=()=>{const n=Number(text);if(Number.isFinite(n)&&Math.abs(n-value)>.004)onCommit(n);else setText(shown);};
 return <label className="studio-outline-length"><input aria-label={label} type="number" step={OUTLINE_EDIT.grid} min={OUTLINE_EDIT.minEdge} value={text} onChange={e=>setText(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();}else if(e.key==='Escape'){setText(shown);}}}/>m</label>;
}
/** Inspector › Part › Outline: corners, wall lengths (editable) and tidy actions (docs/city-studio-sculpt-v2.md). */
function OutlineSection({st}:{st:StudioState}){
 const v=st.selected;const o=v&&editableOutline(v);if(!v||!o)return null;const n=o.points.length;
 const sel=st.interaction.outlineSelection?.partId===v.id?st.interaction.outlineSelection.indices:[];
 return <Section title="Outline" count={n} label="Outline">
  <small className="studio-palette-hint">{n} corners · up to {OUTLINE_EDIT.limit}{v.kind==='ellipse'?' · the first edit turns the oval facets into walls':v.kind==='rectangle'?' · the first edit turns the box into a polygon':''}{sel.length?` · ${sel.length} selected`:''}</small>
  <div className="studio-outline-edges" role="list" aria-label="Outline walls">{o.points.map((p,i)=>{const q=o.points[(i+1)%n],length=Math.hypot(q[0]-p[0],q[1]-p[1]),side=o.ids[i];return <div role="listitem" key={side} className={sel.includes(i)&&sel.includes((i+1)%n)?'is-selected':''}><span>{i+1}. {SIDE_NAMES[side]??'Wall'}</span><EdgeLength value={length} label={`Wall ${i+1} length`} onCommit={value=>st.interaction.editOutline(x=>setOutlineEdgeLength(x,i,value),'Set wall length')}/></div>;})}</div>
  <div className="studio-inspector-actions"><button onClick={()=>{st.chooseRail('build');st.setBuildShape('outline');}}>Edit outline</button>{v.spanFloors>1&&<button title="The storeys from here up become their own part with their own outline" onClick={st.splitAtStorey}>Split at storey {(st.floor>v.startFloor&&st.floor<v.startFloor+v.spanFloors?st.floor:v.startFloor+1)+1}</button>}</div>
  <OutlineActions st={st} count={false}/>
 </Section>;
}
