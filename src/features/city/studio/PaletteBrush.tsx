// The one brush (docs/city-studio-ui-v2.md): Paint or Erase mode, a "what am I painting" target, a size, and the
// items of that target. Catalogues are read generically (studioModules, STUDIO_STOREFRONT_STAMPS, ROOF_OPENING_PRESETS, trims),
// so new kit pieces appear here without UI changes.
import {useMemo,useState} from 'react';
import {AppWindow,Buildings,Drop,Eraser,Eyedropper,FrameCorners,HouseLine,MagnifyingGlass,PaintBrush,Sparkle,Square,Storefront,Swatches,Wall,Cube,Palette,type Icon} from '@phosphor-icons/react';
import {STUDIO_STOREFRONT_STAMPS} from '../../../domain/cityStorefrontStamps';
import {studioModules} from '../../../domain/cityStudioCatalog';
import {moduleOpeningSpec} from '../../../domain/cityStudioModuleSpec';
import {FREE_TRIM_KINDS} from '../../../domain/cityStudioTrimParts';
import {FREE_PRESETS,freeOpeningOutline} from '../studioFreeOpeningTool';
import {PAINT_BRUSHES} from '../studioPaintRegionTool';
import {CityNycFacadeDetails} from '../CityNycFacadeDetails';
import {BRUSH_SIZES,BRUSH_TARGETS,type StudioBrushSize,type StudioBrushTarget} from '../studioRail';
import {RoofExtras} from './RoofExtras';
import {StudioSurfaceLibrary} from './StudioSurfaceLibrary';
import {ThemeCards,ThemeThumb} from './StudioThemes';
import {THEME_MAP} from '../../../domain/cityStudioThemeCatalog';
import {themeBrushTuned} from '../../../domain/cityStudioThemeBrush';
import {THEME_WALL_SIZE_REASON} from '../studioThemeBrush';
import {StyleFilter,moduleStyle,stampStyle,styleMatches} from './studioStyles';
import {EntranceBrushTray} from './StudioEntrances';
import {DECOR_LABELS,TRIM_LABELS,type OpeningGroup,type StudioState} from './useStudioState';

export const TARGET_ICONS:Record<StudioBrushTarget,Icon>={material:Swatches,openings:AppWindow,storefronts:Storefront,trims:FrameCorners,decor:Sparkle,roof:HouseLine,themes:Palette};
const SIZE_ICONS:Record<StudioBrushSize,Icon>={tile:Square,wall:Wall,part:Cube,free:Drop,building:Buildings};
const DETAILS=[['balcony','balcony-centre'],['cornice','cornice'],['canopy','canopy-glass'],['stair','stair-flight'],['pilaster','pilaster'],['ornament','floral-relief'],['planter','window-box'],['light','wall-lamp']] as const;
const MATERIALS=[['','Smooth'],['brick','Brick'],['plaster','Plaster'],['concrete','Stone'],['timber','Timber']] as const;

export function PaletteBrush({st}:{st:StudioState}){
 const erase=st.erase,t=st.target;
 return <div className={`studio-brush-palette${erase?' is-erasing':''}`}>
  <div className="studio-segment studio-brush-mode" role="group" aria-label="Brush mode"><button aria-pressed={!erase} aria-label="Paint with the brush" onClick={()=>erase&&st.toggleErase()}><PaintBrush size={16}/> Paint</button><button aria-pressed={erase} aria-label="Erase with the brush" onClick={()=>!erase&&st.toggleErase()}><Eraser size={16}/> Erase</button></div>
  <span className="studio-caption">{erase?'What to erase':'What to paint'}</span>
  <div className="studio-targets" role="group" aria-label="Brush target">{BRUSH_TARGETS.map(x=>{const Glyph=TARGET_ICONS[x.id];return <button key={x.id} aria-pressed={t===x.id} title={x.hint} onClick={()=>st.chooseTarget(x.id)}><Glyph size={22} weight={t===x.id?'fill':'regular'}/><span>{x.label}</span></button>;})}</div>
  {!!st.sizes.length&&<><span className="studio-caption">Size</span><div className="studio-sizes" role="group" aria-label="Brush size">
   {BRUSH_SIZES.filter(x=>st.sizes.includes(x.id)||t==='themes'&&x.id==='wall').map(x=>{const Glyph=SIZE_ICONS[x.id],off=t==='themes'&&x.id==='wall';return <button key={x.id} aria-pressed={!off&&st.size===x.id} disabled={off} title={off?THEME_WALL_SIZE_REASON:x.hint} onClick={()=>st.chooseSize(x.id)}><Glyph size={16}/>{x.label}</button>;})}
   {t==='material'&&st.size==='free'&&<span className="studio-free-sizes">{PAINT_BRUSHES.map(b=><button key={b.size} aria-pressed={st.freeBrush===b.size&&!st.band} title={`${b.size} m brush on generated walls`} onClick={()=>{st.setFreeBrush(b.size);st.setBand(false);st.chooseSize('free');}}><i style={{width:5+b.size*5,height:5+b.size*5}}/>{b.label}</button>)}</span>}
  </div></>}
  {t==='material'?<MaterialItems st={st}/>:t==='themes'?<ThemeItems st={st}/>:erase?<EraseNote st={st}/>:t==='openings'?<OpeningItems st={st}/>:t==='storefronts'?<StorefrontItems st={st}/>:t==='trims'?<TrimItems st={st}/>:t==='decor'?<DecorItems st={st}/>:<RoofExtras st={st}/>}
 </div>;
}

function EraseNote({st}:{st:StudioState}){
 const label=BRUSH_TARGETS.find(x=>x.id===st.target)?.label.toLowerCase();
 return <p className="studio-palette-hint is-erase">{st.size==='wall'?`Click a wall to erase all of its ${label}.`:st.size==='part'?`Click a part to erase all of its ${label}.`:`Click one of the ${label} to erase it.`} The red outline shows what goes; each click is one undo step.{st.target==='openings'?' Generated rhythm openings are not stored: select their wall and make it plain instead.':''}</p>;
}

/** Paint › Themes: theme cards (click to hold one on the brush, or drag one onto a part), the picked-up look and hints. */
function ThemeItems({st}:{st:StudioState}){
 const b=st.themeBrush,t=THEME_MAP.get(b.theme);
 if(st.erase)return <p className="studio-palette-hint is-erase">{st.size==='building'?'Click the building to remove every theme.':'Click a part to remove its own theme · Shift-click removes every theme.'} Rhythm and colours stay as ordinary settings; each click is one undo step.</p>;
 return <>
  {t&&<div className="studio-theme-brush-note"><ThemeThumb t={t}/><span><b>{t.label}</b><br/><small>{themeBrushTuned(b)?'Picked-up look: same seed, colours and tuning.':'A fresh look on every click.'}</small></span>
   <button aria-label="Pick up a theme" title="Pick up a part's theme · or Alt-click" aria-pressed={st.eyedropper} onClick={()=>st.setEyedropper(!st.eyedropper)}><Eyedropper size={18}/></button></div>}
  {st.themeNote&&<p className="studio-palette-hint" role="status">{st.themeNote}</p>}
  <ThemeCards st={st} selected={b.theme} onPick={st.chooseThemeBrush} action="Paint" compact/>
  <p className="studio-palette-hint">Click a part to dress it · Shift-click for the whole building · Alt-click picks up a part's theme. Drag a card onto a part to apply it directly.</p>
 </>;
}

function MaterialItems({st}:{st:StudioState}){
 return <>
  <span className="studio-caption">Surface</span>
  <div className="studio-segment" role="group" aria-label="Paint channel">{(['wall','trim','frame','door'] as const).map(c=><button key={c} aria-pressed={st.channel===c} onClick={()=>st.setChannel(c)}>{c}</button>)}</div>
  {!st.erase&&<>
   <span className="studio-caption">Material</span>
   <div className="studio-materials" aria-label="Material">{MATERIALS.map(([id,label])=><button key={id} aria-pressed={st.texture===id} onClick={()=>st.chooseTexture(id,label)}><i className={`studio-material-sample is-${id||'smooth'}`}/>{label}</button>)}</div>
   <span className="studio-caption">Colour</span>
   <div className="studio-swatches">{st.colors.map(c=><button key={c} aria-label={`Paint ${c}`} aria-pressed={st.color===c} style={{background:c}} onClick={()=>st.chooseColor(c)}/>)}<input type="color" aria-label="Custom paint colour" value={st.color} onChange={e=>{st.setColor(e.target.value);st.setEyedropper(false);}} onBlur={e=>st.chooseColor(e.target.value)}/></div>
   <StudioSurfaceLibrary st={st}/>
  </>}
  <div className="studio-paint-actions">
   {!st.erase&&<button aria-pressed={st.band&&st.size==='free'} title="Paint a full-width band on generated walls (plinth, string course)" onClick={()=>{const on=!(st.band&&st.size==='free');st.chooseSize('free');st.setBand(on);}}>Band</button>}
   {!st.erase&&st.band&&st.size==='free'&&<button aria-pressed={st.bandAround} title="Bands run around every generated wall of the building as a paint rule (or hold Shift while dragging)" onClick={()=>st.setBandAround(!st.bandAround)}>Around building</button>}
   <button aria-label="Sample finish" title="Sample finish · or Alt-click" aria-pressed={st.eyedropper} onClick={()=>{if(st.erase)st.toggleErase();st.setEyedropper(!st.eyedropper);}}><Eyedropper size={18}/></button>
  </div>
  <p className="studio-palette-hint">{st.erase?'Click paint to remove it; on kit tiles this restores the inherited finish.':'C opens the quick paint ring · Alt-click samples a finish.'}</p>
 </>;
}

const OPENING_GROUPS:readonly OpeningGroup[]=['Freeform','Windows','Doors','Walls'];
function OpeningItems({st}:{st:StudioState}){
 const [query,setQuery]=useState(''),group=st.openingGroup,kit=st.kitVersion;
 const category=group==='Windows'?'window':group==='Doors'?'door':group==='Walls'?'wall':null;
 const pieces=useMemo(()=>category?studioModules(kit).filter(p=>p.category===category&&(!st.unified||!!moduleOpeningSpec(p.id))&&styleMatches(st.styleFilter,moduleStyle(p.id))&&(!query||p.label.toLowerCase().includes(query.toLowerCase()))):[],[category,kit,st.unified,query,st.styleFilter]);
 return <div className="studio-openings">
  <div className="studio-segment studio-opening-groups" role="group" aria-label="Opening type">{OPENING_GROUPS.map(g=><button key={g} aria-pressed={group===g} title={g==='Freeform'?'Cut openings anywhere: arches, round and pointed windows, doors near the ground':undefined} onClick={()=>st.setOpeningGroup(g)}>{g}</button>)}</div>
  {group==='Freeform'?<div className="studio-tray is-grid">{FREE_PRESETS.map(p=>{const loop=freeOpeningOutline(p.preset.shape,p.preset.width,p.preset.height),scale=22/Math.max(p.preset.width,p.preset.height);return <button className="studio-tile" key={p.id} aria-label={`Cut ${p.label}`} aria-pressed={st.effectiveTool==='free-opening'&&st.openingKind==='free'&&st.freePresetId===p.id} onClick={()=>st.chooseFreePreset(p.id,p.label)}><svg viewBox="-26 -26 52 52" className="studio-free-icon" aria-hidden="true"><rect x="-26" y="-26" width="52" height="52" rx="6"/><path d={`M${loop.map(([x,y])=>`${(x*scale).toFixed(2)},${(-y*scale).toFixed(2)}`).join('L')}Z`}/></svg><span>{p.label}</span></button>;})}</div>
  :<>{kit===5&&<StyleFilter value={st.styleFilter} onChange={st.setStyleFilter}/>}{pieces.length>8||query?<label className="studio-search"><MagnifyingGlass size={14}/><input aria-label={`Search ${group.toLowerCase()}`} placeholder={`Search ${group.toLowerCase()}`} value={query} onChange={e=>setQuery(e.target.value)}/></label>:null}
   <div className="studio-tray is-grid">{pieces.map(p=><button className="studio-tile" key={p.id} aria-label={p.label} title={p.label} aria-pressed={st.openingKind==='kit'&&st.kitModule===p.id} onClick={()=>st.chooseKitModule(p.id,p.label)}><img src={`/city/synarc-kit/v${kit}/thumbnails/${p.id}.png`} alt="" loading="lazy"/><span>{p.label}</span></button>)}{!pieces.length&&<small className="studio-palette-hint">No {group.toLowerCase()} match.</small>}</div>
   {kit!==5&&<button onClick={()=>st.commit({...st.recipe!,studio:{...st.recipe!.studio,catalogue:'synarc-kit-5',assemblyRevision:'connected-access-1'}})}>Add Blender catalog · undoable</button>}
   {group==='Doors'&&<EntranceBrushTray st={st}/>}
   {st.unifiedFacade.canConvert&&<p className="studio-palette-hint">Kit tiles sit on a grid here. Select the building (Esc) and convert it to an editable facade to move them freely.</p>}
  </>}
  <p className="studio-palette-hint">{group==='Freeform'?'Click a wall to cut · drag one to move it · near the ground it becomes a door.':st.unified?'Kit pieces snap to bays and storeys and can be dragged.':'Click or drag across tiles to place.'}</p>
 </div>;
}

function StorefrontItems({st}:{st:StudioState}){
 if(st.kitVersion!==5)return <><p className="studio-palette-hint">Storefront stamps come with the Blender catalog.</p><button onClick={()=>st.commit({...st.recipe!,studio:{...st.recipe!.studio,catalogue:'synarc-kit-5',assemblyRevision:'connected-access-1'}})}>Add Blender catalog · undoable</button></>;
 return <><StyleFilter value={st.styleFilter} onChange={st.setStyleFilter}/><div className="studio-tray is-grid">{STUDIO_STOREFRONT_STAMPS.filter(s=>styleMatches(st.styleFilter,stampStyle(s.id))).map(s=><button className="studio-tile" key={s.id} aria-label={`Paint ${s.label}`} aria-pressed={st.stampId===s.id} onClick={()=>st.chooseStamp(s.id,s.label)}><Storefront size={28}/><span>{s.label}</span></button>)}</div><p className="studio-palette-hint">Click a ground-floor tile: the stamp spans neighbouring bays and stays protected until unpacked.</p></>;
}

function TrimItems({st}:{st:StudioState}){
 return <><div className="studio-tray is-grid">{FREE_TRIM_KINDS.map(kind=><button className="studio-tile" key={kind} aria-label={TRIM_LABELS[kind]} aria-pressed={st.trimKind===kind} onClick={()=>st.chooseTrim(kind)}><FrameCorners size={28}/><span>{TRIM_LABELS[kind]}</span></button>)}</div><p className="studio-palette-hint">Click a free window or door to add or remove this trim. Trims that do not suit the shape are refused. Kit trims such as Tokyo awnings, fascias and hoods are placed from Decorations → Facade details.</p></>;
}

function DecorItems({st}:{st:StudioState}){
 const recipe=st.recipe!,kit=st.kitVersion,tool=st.effectiveTool;
 return <>
  {kit===2&&<div className="studio-placed-details"><span>Connected stairs and canopy ends are available in the new kit.</span><button onClick={()=>st.commit({...recipe,studio:{...recipe.studio,catalogue:'synarc-kit-3',assemblyRevision:'connected-access-1'}})}>Upgrade this building · undoable</button></div>}
  <div className="studio-segment" role="group" aria-label="Decoration look"><button aria-pressed={st.look==='simple'} onClick={()=>st.setLook('simple')}>Simple</button><button aria-pressed={st.look==='ornate'} onClick={()=>st.setLook('ornate')}>Ornate</button></div>
  <div className="studio-tray is-grid">{DETAILS.map(([id,module])=><button className="studio-tile" key={id} aria-label={DECOR_LABELS[id]} aria-pressed={tool===id&&(id!=='ornament'||!st.detailModule)} disabled={id==='stair'&&kit===2} onClick={()=>st.chooseDecor(id)}><img src={`/city/synarc-kit/v${kit}/thumbnails/${module}.png`} alt=""/><span>{DECOR_LABELS[id]}</span></button>)}</div>
  {tool==='cornice'&&<button disabled={!st.interaction.hover} onClick={st.followWall}>Follow this wall</button>}
  {tool==='stair'&&<div className="studio-detail-options"><span className="studio-caption">To storey</span><div className="studio-segment" role="group" aria-label="Stair destination">{Array.from({length:Math.max(1,st.highestStorey-1)},(_,i)=><button key={i} aria-pressed={Math.min(st.destination,st.highestStorey)===i+1} onClick={()=>st.setDestination(i+1)}>{i+2}</button>)}</div><div className="studio-segment" aria-label="Stair exit">{([['door','Door'],['balcony','Balcony'],['terrace','Terrace']] as const).map(([id,label])=><button key={id} aria-pressed={st.exitKind===id} onClick={()=>st.setExitKind(id)}>{label}</button>)}</div><div className="studio-segment" aria-label="Stair shape">{(['auto','straight','switchback'] as const).map(id=><button key={id} aria-pressed={st.stairLayout===id} onClick={()=>st.setStairLayout(id)}>{id}</button>)}</div><button aria-pressed={st.flip} onClick={()=>st.setFlip(!st.flip)}>Flip direction</button></div>}
  {kit>=3&&tool==='stair'&&!!st.placedStairs.length&&<div className="studio-placed-details"><span>Placed stairs</span>{st.placedStairs.map((a,i)=><button key={a.id} aria-pressed={st.stairEditing===a.id} onClick={()=>st.chooseStair(a.id)}>Stair {i+1} · storey {(a.destination??1)+1}</button>)}{st.stairEditing&&<><button className="studio-primary" disabled={st.stairBusy} onClick={()=>void st.refitStair()}>{st.stairBusy?'Fitting…':'Apply changes'}</button><button disabled={st.stairBusy} onClick={st.removeStair}>Remove stair</button></>}</div>}
  {kit>=4&&<><span className="studio-caption">Facade details</span>{kit===5&&<StyleFilter value={st.styleFilter} onChange={st.setStyleFilter}/>}<CityNycFacadeDetails version={kit} selected={tool==='ornament'?st.detailModule:''} choose={id=>st.chooseDecor('ornament',id)} filter={id=>styleMatches(st.styleFilter,moduleStyle(id))}/></>}
  <p className="studio-palette-hint">Click or drag across neighbouring tiles · Select → Object edits a placed decoration.</p>
 </>;
}
