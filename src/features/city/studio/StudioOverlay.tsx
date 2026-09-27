// Studio UI v2 shell (docs/city-studio-ui-v2.md): a CSS grid of top bar / tool rail + palette / stage / inspector /
// hotbar laid over the canvas. Only the panels take pointer events; the stage passes clicks through to the building.
import {useEffect,useState} from 'react';
import {ArrowUUpLeft,ArrowUUpRight,ArrowsOut,Check,Compass,Eye,House,Keyboard,Palette,Plus,SpeakerHigh,SpeakerSlash,Trash,X} from '@phosphor-icons/react';
import {STUDIO_EXAMPLES,TOKYO_EXAMPLE_START} from '../../../domain/cityStudioExamples';
import {StyleFilter,exampleStyle,styleMatches} from './studioStyles';
import {COMPOSITIONS} from '../../../domain/cityBuildingV3';
import {expandBuildingVariation} from '../../../domain/cityBuildingVariation';
import {unpackStorefront} from '../../../domain/cityStorefrontStamps';
import {upgradeStudio} from '../../../domain/cityStudio';
import {playStudioCue,setStudioAudioMuted} from '../studioAudio';
import {CityStudioToast} from '../CityStudioToast';
import {CityUnifiedFacadeNotice} from '../CityUnifiedFacade';
import {CityStudioPaintRing} from '../CityStudioPaintRing';
import {CityStudioFloorRail} from '../CityStudioFloorRail';
import {CityPresetCollection} from '../CityPresetCollection';
import {StudioToolRail} from './StudioToolRail';
import {StudioPalette} from './StudioPalette';
import {ThemeGallery} from './StudioThemes';
import {StudioInspector} from './StudioInspector';
import {StudioHotbar} from './StudioHotbar';
import {StudioShortcutSheet} from './StudioShortcutSheet';
import {studioStatus} from './studioStatus';
import type {StudioState} from './useStudioState';

/** Phone widths share one panel slot between the palette and the inspector. */
function useNarrow(){
 const query='(max-width: 600px)',[narrow,setNarrow]=useState(()=>typeof window!=='undefined'&&window.matchMedia(query).matches);
 useEffect(()=>{const m=window.matchMedia(query),on=()=>setNarrow(m.matches);on();m.addEventListener('change',on);return()=>m.removeEventListener('change',on);},[]);
 return narrow;
}

export function StudioOverlay({st}:{st:StudioState}){
 const {land,draft,recipe,plot,interaction}=st,narrow=useNarrow();
 // On phones a Select selection shows the inspector with just the level chooser above the rail; otherwise the palette.
 const inspecting=st.rail==='select'&&st.selection.level!=='building',showInspector=st.inspectorOpen&&(!narrow||inspecting||!st.paletteOpen),compactPalette=narrow&&inspecting;
 return <section className={`city-studio studio-v2${st.paletteOpen?' has-palette':''}${st.inspectorOpen?' has-inspector':''}`} aria-label="Construction studio" data-rail={st.rail} onPointerDown={e=>e.stopPropagation()}>
  <div className="studio-shell">
  <StudioTopBar st={st}/>
  {!recipe&&<aside className="studio-convert"><h2>Make this building your own</h2><p>Convert this saved design into editable parts. Your original stays in undo history.</p><button className="studio-primary" disabled={!upgradeStudio(draft,plot.size)} onClick={()=>{const next=upgradeStudio(draft,plot.size);if(next)land.edit(next);}}>Edit building parts</button>{!upgradeStudio(draft,plot.size)&&<p>This specialised building remains available in the original builder with cityStudio=0.</p>}</aside>}
  {recipe&&<>
   <div className="studio-left"><StudioToolRail st={st}/>{st.paletteOpen&&<StudioPalette st={st} compact={compactPalette}/>}</div>
   <StudioStage st={st}/>
   {showInspector&&<StudioInspector st={st}/>}
   <StudioHotbar st={st}/>
  </>}
  </div>
  {recipe&&st.starters&&<StudioStarters st={st}/>}
  {recipe&&st.themeGallery&&<ThemeGallery st={st}/>}
  {st.help&&<StudioShortcutSheet close={()=>st.setHelp(false)}/>}
  {st.replace!==null&&<div className="studio-confirm" role="dialog" aria-label="Replace building"><h2>Start a new shape?</h2><p>You can undo this and return to your current building.</p><button onClick={()=>st.setReplace(null)}>Keep building</button><button className="studio-primary" onClick={()=>{if(st.replace===-1){st.empty();st.setReplace(null);}else st.starter(st.replace!);}}>Replace building</button></div>}
  {interaction.touchPending&&<div className="studio-touch-confirm"><button onClick={interaction.cancel}>Cancel</button><button className="studio-primary" onClick={interaction.confirm}><Check/> Place</button></div>}
  {st.ring&&<CityStudioPaintRing x={st.ring.x} y={st.ring.y} colors={st.colors} current={{color:st.color,texture:st.texture}} preview={st.previewRing} pick={st.pickRing} close={st.closeRing}/>}
  <CityStudioToast notice={land.notice}/><CityUnifiedFacadeNotice notice={st.unifiedFacade.notice}/>
 </section>;
}

function StudioTopBar({st}:{st:StudioState}){
 const {land,draft,recipe,interaction,muted}=st;
 return <header className="studio-header">
  <div className="studio-title"><House size={22} weight="duotone"/><div><input aria-label="Building name" maxLength={60} value={draft.name} onChange={e=>land.edit({...draft,name:e.target.value})}/><small>{land.saving?'Saving…':land.dirty?'Saving your changes':'Saved on this device'} <span>· Local test world</span></small></div></div>
  <div className="studio-history">
   <button title="Undo · Ctrl Z" aria-label="Undo" disabled={!land.history.length||interaction.active} onClick={land.undo}><ArrowUUpLeft/></button>
   <button title="Redo · Ctrl Shift Z" aria-label="Redo" disabled={!land.future.length||interaction.active} onClick={land.redo}><ArrowUUpRight/></button>
   <span className="studio-header-divider" aria-hidden="true"/>
   <button aria-label={muted?'Turn sound on':'Mute sound'} title={muted?'Sound off':'Sound on'} aria-pressed={!muted} onClick={()=>{setStudioAudioMuted(!muted);if(muted)playStudioCue('chime');}}>{muted?<SpeakerSlash/>:<SpeakerHigh/>}</button>
   <button aria-label="Keyboard shortcuts and help" title="Shortcuts and help · ?" aria-pressed={st.help} onClick={()=>st.setHelp(!st.help)}><Keyboard/></button>
  </div>
  <div className="studio-complete"><button disabled={!recipe||land.previewStatus.pending||!!land.previewStatus.error} onClick={st.walk}><Eye/> <span>Walk around</span></button><button className="studio-primary" disabled={interaction.active||land.previewStatus.pending||!!land.previewStatus.error||land.saving} onClick={()=>void land.finish()}><Check/> Done</button><button aria-label="Exit construction" title="Exit" onClick={()=>void land.close()}><X/></button></div>
 </header>;
}

/** The stage keeps the camera views, storey rail and status line on its edges, clear of the building. */
function StudioStage({st}:{st:StudioState}){
 const {land,recipe,interaction,prepared,inactive}=st;if(!recipe)return null;
 const status=studioStatus(st);
 return <div className="studio-stage">
  <div className="studio-stage-right">
   <nav className="studio-views" aria-label="Building camera"><button title="Orbit view" aria-label="Orbit view" onClick={()=>st.view('orbit')}><Compass/></button><button title="Top view" aria-label="Top view" onClick={()=>st.view('top')}>Top</button><button title="Front view" aria-label="Front view" onClick={()=>st.view('front')}>Front</button><button title="Frame selection · Z" aria-label="Focus selection" onClick={()=>st.view('focus')}><ArrowsOut/></button></nav>
   <CityStudioFloorRail storeys={st.highestStorey} floor={Math.min(st.floor,st.highestStorey-1)} choose={st.chooseFloor} canAdd={st.highestStorey<8&&recipe.volumes.some(v=>v.operation==='add')} add={st.addInteriorStorey} viewMode={st.floorViewMode} setViewMode={st.setFloorViewMode} viewsEnabled={recipe.version===6} slab={recipe.version===6&&st.floor>0&&st.interior?{open:(recipe.interior.openFloors??[]).includes(st.floor),toggle:st.toggleInteriorFloor}:undefined}/>
  </div>
  <StudioIntro/>
  <div className="studio-stage-bottom">
   {interaction.issue.includes('storefront is protected')&&st.protectedStamp&&<div className="studio-unpack-hint"><span>Unlock this storefront for tile edits.</span><button onClick={()=>st.commit(unpackStorefront(recipe,st.protectedStamp!.id,expandBuildingVariation(recipe,st.draft.design).recipe))}>Unpack storefront</button></div>}
   {!!prepared?.roofNotes.length&&<div className="studio-roof-note" role="status">{prepared.roofNotes.join(' ')}</div>}
   {!!inactive.length&&<details className="studio-inactive"><summary>{inactive.length} details need a little space</summary>{inactive.map(item=><div key={item.id}><span>{item.reason}</span><button aria-label={item.id.startsWith('generated/')?'Edit variation rule':'Remove inactive detail'} onClick={()=>st.removeInactive(item.id)}><Trash size={14}/></button></div>)}</details>}
   <div className="studio-feedback" role="status" aria-live="polite">{land.error?<><span>{land.error}</span><button onClick={()=>void land.retry()}>Retry save</button></>:land.previewStatus.error?<><span>{land.previewStatus.error}</span><button onClick={land.retryPreview}>Retry building</button></>:status}</div>
  </div>
 </div>;
}

const INTRO_KEY='city-studio-ui-v2-intro';
const introWanted=()=>{try{const q=new URLSearchParams(window.location.search);if(q.get('cityStudioTest')==='1'&&q.get('studioIntro')!=='1')return false;return localStorage.getItem(INTRO_KEY)!=='seen';}catch{return false;}};
/** First-visit hint card: the rail, Select levels and the brush in one line each. */
function StudioIntro(){
 const [open,setOpen]=useState(introWanted);if(!open)return null;
 const close=()=>{setOpen(false);try{localStorage.setItem(INTRO_KEY,'seen');}catch{/* remembered for this visit only */}};
 return <aside className="studio-intro" aria-label="Getting started"><strong>Build like a game</strong><ul><li><kbd>V</kbd> Select, then <kbd>Tab</kbd> to pick parts, walls, tiles, openings or objects</li><li><kbd>B</kbd> Build blocks · <kbd>P</kbd> Paint anything · <kbd>E</kbd> Erase</li><li>The inspector on the right edits whatever you select · <kbd>?</kbd> shortcuts</li></ul><button className="studio-primary" onClick={close}>Got it</button></aside>;
}

function StudioStarters({st}:{st:StudioState}){
 const recipe=st.recipe!,kitVersion=st.kitVersion,choose=(i:number)=>recipe.volumes.length?st.setReplace(i):i===-1?st.empty():st.starter(i);
 return <aside className="studio-starters-sheet" aria-label={st.collection?'Blender collection':'Starting ideas'}>
  <header><strong>{st.collection?'Blender collection':'Starting ideas'}</strong><button aria-label="Close starting ideas" onClick={()=>st.setStarters(false)}><X size={16}/></button></header>
  {st.collection?<CityPresetCollection choose={i=>choose(-i-2)}/>:<><StyleFilter value={st.styleFilter} onChange={st.setStyleFilter} label="Idea style"/><div className="studio-tray studio-starters">{STUDIO_EXAMPLES.map((example,i)=>example.preview?.includes('/v5/')||!styleMatches(st.styleFilter,exampleStyle(i,example.preview))?null:<button className="studio-tile" key={example.name} onClick={()=>choose(-i-2)}><img src={example.preview??`/city/synarc-kit/v${i>=TOKYO_EXAMPLE_START?5:kitVersion}/thumbnails/${example.thumbnail}.png`} alt=""/><span>{example.name}</span></button>)}<button className="studio-tile" aria-label="Start from a theme" onClick={()=>{st.setStarters(false);st.setThemeGallery({scope:'starter'});}}><Palette size={30} weight="duotone"/><span>Themes…</span></button>{st.styleFilter==='all'&&<button className="studio-tile" onClick={()=>choose(-1)}><Plus size={30}/><span>Empty plot</span></button>}{(st.styleFilter==='all'||st.styleFilter==='classic')&&COMPOSITIONS.filter(p=>!['twin-tower','atrium-campus'].includes(p.patch.archetype??'')).map(p=>{const index=COMPOSITIONS.indexOf(p);return <button key={p.name} className="studio-tile" onClick={()=>choose(index)}><img src={`/city/presets/${p.name.toLowerCase().replaceAll(' ','-')}.webp`} alt=""/><span>{p.name}</span></button>;})}</div></>}
 </aside>;
}
