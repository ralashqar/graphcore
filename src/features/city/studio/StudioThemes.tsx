// Facade themes in the studio (docs/city-studio-themes.md): the Themes gallery (thumbnail cards, style filter, search)
// opened from Inspector › Part ("Apply theme to this part"), Inspector › Building ("Apply to whole building") and the
// Build palette's starting ideas; and the Theme section of the inspector, with the active theme's sliders per aspect,
// reroll dice, per-aspect locks, colours, detach and remove. Every action is one labelled undo step (st.commit).
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {ArrowsClockwise,DiceFive,Lock,LockOpen,MagnifyingGlass,Palette,Scissors,Trash,X} from '@phosphor-icons/react';
import {FACADE_THEMES,THEME_ASPECT_LABELS,THEME_MAP,THEME_THUMBNAIL,themeAspectDefault,themeAspects,type FacadeTheme,type ThemeAspect} from '../../../domain/cityStudioThemeCatalog';
import {cycleThemePalette,detachFacadeTheme,effectiveThemeRef,removeFacadeTheme,rerollTheme,setThemeTune,themeRefAt,toggleThemeLock} from '../../../domain/cityStudioThemes';
import {rhythmScopeSettings,setRhythmLayer,toggleFacadeRhythmLock,type RhythmLayer,type RhythmPoolLayer} from '../../../domain/cityStudioFacadeRhythm';
import type {StudioRecipe} from '../../../domain/cityStudioTypes';
import {StyleFilter,styleMatches} from './studioStyles';
import {themeDragStarts,themeDropOutcome,themeGhostLabel,THEME_DRAG} from '../studioThemeBrush';
import {setThemeDrag,themeDragState,useThemeDrag} from './themeDrag';
import {playStudioCue} from '../studioAudio';
import type {StudioState} from './useStudioState';
import './studioThemes.css';

const themeMatches=(t:FacadeTheme,filter:StudioState['styleFilter'],query:string)=>(filter==='all'||t.tags.some(tag=>styleMatches(filter,tag)))&&(!query||`${t.label} ${t.blurb} ${t.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()));

/** Thumbnail with a colour-swatch fallback until the rendered thumbnail exists. */
export function ThemeThumb({t}:{t:FacadeTheme}){
 const [failed,setFailed]=useState(false),p=t.look.palettes[0];
 return failed?<span className="studio-theme-swatch" aria-hidden="true" style={{background:`linear-gradient(135deg,${p.wall.color??'#ccc'} 0 62%,${p.trim} 62% 78%,${p.door} 78%)`}}/>:<img src={THEME_THUMBNAIL(t.id)} alt="" loading="lazy" draggable={false} onError={()=>setFailed(true)}/>;
}

export function ThemeGallery({st}:{st:StudioState}){
 const g=st.themeGallery;if(!g)return null;
 const title=g.scope==='part'?`Theme ${st.partName(g.partId)}`:g.scope==='building'?'Theme the whole building':'Start from a theme';
 const current=st.recipe&&(g.scope==='part'?themeRefAt(st.recipe,g.partId):themeRefAt(st.recipe))?.theme;
 return <aside className="studio-starters-sheet studio-theme-gallery" aria-label="Themes">
  <header><strong>{title}</strong><button aria-label="Close themes" onClick={()=>st.setThemeGallery(null)}><X size={16}/></button></header>
  <ThemeCards st={st} selected={current??undefined} onPick={id=>st.applyTheme(id,g)} action="Apply"/>
 </aside>;
}

/**
 * Theme cards with search and the shared style filter: the gallery sheet and, compact, the Paint › Themes palette.
 * Every card can also be dragged onto a part in the view (mouse: drag; touch: long-press, then drag).
 */
export function ThemeCards({st,selected,onPick,action,compact}:{st:StudioState;selected?:string;onPick:(id:string)=>void;action:string;compact?:boolean}){
 const [query,setQuery]=useState(''),drag=useThemeCardDrag(st);
 const list=FACADE_THEMES.filter(t=>themeMatches(t,st.styleFilter,query));
 return <div className={`studio-theme-cards${compact?' is-compact':''}`}>
  <div className="studio-theme-filters"><label className="studio-theme-search"><MagnifyingGlass size={14}/><input aria-label="Search themes" placeholder={compact?'Search themes':'Search: Tokyo, balconies, brick…'} value={query} onChange={e=>setQuery(e.target.value)}/></label><StyleFilter value={st.styleFilter} onChange={st.setStyleFilter} label="Theme style"/></div>
  <div className="studio-theme-grid">{list.map(t=><button key={t.id} className="studio-theme-card" data-theme={t.id} aria-label={`${action} ${t.label}`} aria-pressed={selected===t.id} title={`${t.blurb} · Drag onto a part`} onPointerDown={e=>drag.down(e,t.id)} onContextMenu={e=>e.preventDefault()} onDragStart={e=>e.preventDefault()} onClick={()=>{if(!drag.clickSuppressed())onPick(t.id);}}><ThemeThumb t={t}/><span><b>{t.label}</b>{!compact&&<small>{t.blurb}</small>}</span></button>)}
   {!list.length&&<p className="studio-palette-hint">No theme matches. Try another style or word.</p>}</div>
 </div>;
}

/**
 * Pointer-event drag of a theme card over the view (not HTML5 drag-and-drop: the overlay is its own React root over
 * the canvas). The view is probed through the interaction hook; release over a part applies the theme through the same
 * applyTheme as the gallery; empty ground in an empty plot starts a themed block; Esc or release elsewhere cancels.
 */
export function useThemeCardDrag(st:StudioState){
 const stRef=useRef(st);stRef.current=st;
 const suppressUntil=useRef(0),stop=useRef<(()=>void)|null>(null);
 useEffect(()=>()=>stop.current?.(),[]);
 const down=(e:ReactPointerEvent,theme:string)=>{
  if(e.button!==0||stop.current)return;
  const kind=(e.pointerType==='touch'||e.pointerType==='pen'?e.pointerType:'mouse') as 'mouse'|'touch'|'pen',pointer=e.pointerId,x0=e.clientX,y0=e.clientY,t0=performance.now();
  let dragging=false,last={x:x0,y:y0};
  const update=(x:number,y:number)=>{last={x,y};const s=stRef.current,over=document.elementFromPoint(x,y)?.tagName==='CANVAS',probe=over?s.interaction.probePart(x,y):null;
   setThemeDrag({theme,x,y,pointerType:kind,outcome:themeDropOutcome({overCanvas:over&&!!probe,partId:probe?.partId??null,inPlot:!!probe?.inPlot,hasParts:!!s.recipe?.volumes.some(v=>v.operation==='add')})});};
  const block=(ev:TouchEvent)=>{if(dragging)ev.preventDefault();};
  const cleanup=()=>{window.clearTimeout(timer);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',cancel,true);window.removeEventListener('keydown',key,true);window.removeEventListener('touchmove',block);document.body.classList.remove('studio-theme-dragging');if(dragging)setThemeDrag(null);dragging=false;stop.current=null;};
  const begin=()=>{if(dragging)return;dragging=true;document.body.classList.add('studio-theme-dragging');playStudioCue('tick');update(last.x,last.y);};
  const move=(ev:PointerEvent)=>{if(ev.pointerId!==pointer)return;
   if(!dragging){const go=themeDragStarts(kind,Math.hypot(ev.clientX-x0,ev.clientY-y0),performance.now()-t0);if(go==='cancel'){cleanup();return;}last={x:ev.clientX,y:ev.clientY};if(go)begin();return;}
   ev.preventDefault();update(ev.clientX,ev.clientY);};
  const up=(ev:PointerEvent)=>{if(ev.pointerId!==pointer)return;if(!dragging){cleanup();return;}
   update(ev.clientX,ev.clientY);const final=themeDragState();suppressUntil.current=performance.now()+500;cleanup();
   if(final&&final.outcome.kind!=='none')stRef.current.dropTheme(theme,final.outcome);else if(final?.outcome.kind==='none'&&final.outcome.reason)stRef.current.interaction.setIssue(final.outcome.reason);};
  const cancel=(ev:PointerEvent)=>{if(ev.pointerId===pointer){if(dragging)suppressUntil.current=performance.now()+500;cleanup();}};
  const key=(ev:KeyboardEvent)=>{if(ev.key==='Escape'&&dragging){ev.preventDefault();suppressUntil.current=performance.now()+500;cleanup();}};
  // Touch: a still long-press lifts the card; moving first scrolls the list instead.
  const timer=kind==='touch'?window.setTimeout(()=>{if(stop.current===cleanup&&!dragging){begin();navigator.vibrate?.(12);}},THEME_DRAG.longPressMs):0;
  window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',cancel,true);window.addEventListener('keydown',key,true);window.addEventListener('touchmove',block,{passive:false});
  stop.current=cleanup;
 };
 return {down,clickSuppressed:()=>performance.now()<suppressUntil.current};
}

/** The card following the pointer while a theme is dragged, with what a release will do. */
export function ThemeDragGhost(){
 const drag=useThemeDrag();if(!drag||typeof document==='undefined')return null;
 const t=THEME_MAP.get(drag.theme);if(!t)return null;const o=drag.outcome;
 const label=o.kind==='part'?themeGhostLabel(t.label):o.kind==='starter'?themeGhostLabel(t.label,{starter:true}):o.reason||'Release over a part · Esc cancels';
 return createPortal(<div className={`studio-theme-drag-ghost is-${o.kind}`} role="status" aria-live="polite" data-outcome={o.kind} style={{left:drag.x+(drag.pointerType==='touch'?-60:14),top:drag.y+(drag.pointerType==='touch'?-120:14)}}><ThemeThumb t={t}/><span>{label}</span></div>,document.body);
}

/** Rhythm aspects the panel tunes directly on the rhythm at the theme's scope. */
const RHYTHM_ROWS:[RhythmPoolLayer,RhythmLayer,string][]=[['ground','ground','Ground openings'],['upper','upper','Upper openings'],['attic','attic','Top storey']];

/** Inspector › Theme for a part (partId) or the building. */
export function ThemeSection({st,partId}:{st:StudioState;partId?:string}){
 const recipe=st.recipe!;
 const own=themeRefAt(recipe,partId),inherited=partId&&!own?effectiveThemeRef(recipe,partId):undefined,ref=own??inherited,t=ref&&THEME_MAP.get(ref.theme);
 const open=()=>st.setThemeGallery(partId?{scope:'part',partId}:{scope:'building'});
 const commit=(next:StudioRecipe,label:string)=>st.commit(next,label);
 const head=<div className="studio-inspector-actions"><button className="studio-primary" onClick={open}><Palette size={16}/>{partId?'Apply theme to this part':'Apply to whole building'}</button></div>;
 if(!ref||!t)return <>{head}<small className="studio-palette-hint">A theme dresses {partId?'this part':'the building'} in one go: openings, shops, balconies, signs, colours and roof props. It re-fits when you resize.</small></>;
 if(!own)return <>{head}<small className="studio-palette-hint">Dressed by the building theme <b>{t.label}</b>. Tune it on the building, or give this part its own theme.</small></>;
 const rhythm=recipe.studio.facadeRhythm,target=partId?[{partId}]:[],settings=rhythm?rhythmScopeSettings(rhythm,partId?{partId}:undefined):null;
 const aspects=themeAspects(t),locked=(a:ThemeAspect)=>!!ref.locks?.includes(a),rhythmLocked=(l:RhythmLayer)=>!!rhythm?.locks?.includes(l);
 const pct=(n:number)=>`${Math.round(n*100)}%`;
 const uniform=settings?(settings.layers.upper.uniformity+settings.layers.ground.uniformity)/2:0;
 return <div className="studio-theme-panel">
  <div className="studio-theme-active"><ThemeThumb t={t}/><span><b>{t.label}</b><small>{ref.detached?'Detached: shops, paint and roof props are ordinary items; decorations still follow the theme.':t.blurb}</small></span></div>
  <div className="studio-inspector-actions is-icons">
   <button aria-label="Reroll theme" title="New look for every unlocked aspect · Space" onClick={()=>commit(rerollTheme(recipe,partId),'Reroll theme')}><DiceFive size={18} weight="duotone"/></button>
   <button aria-label="Next colours" title="Next colourway" onClick={()=>commit(cycleThemePalette(recipe,partId),'Theme colours')}><ArrowsClockwise size={18}/></button>
   <button aria-label="Change theme" title={partId?'Apply another theme to this part':'Apply another theme to the building'} onClick={open}><Palette size={18}/></button>
   {!ref.detached&&<button aria-label="Detach theme" title="Turn shops, paint rules and roof props into ordinary items; keep the rhythm as plain settings" onClick={()=>{const out=detachFacadeTheme(recipe,st.draft.design,partId);if('reason' in out)st.interaction.setIssue(out.reason);else{commit(out.recipe,'Detach theme');if(out.notes.length)st.interaction.setIssue(out.notes.join(' '));}}}><Scissors size={18}/></button>}
   <button aria-label="Remove theme" title="Remove the theme's shops, decorations, paint and roof props; keep its rhythm and colours" onClick={()=>commit(removeFacadeTheme(recipe,partId),'Remove theme')}><Trash size={18}/></button>
  </div>
  <div className="studio-theme-rows" role="group" aria-label="Theme aspects">
   {settings&&RHYTHM_ROWS.map(([layer,seed,label])=><ThemeRow key={layer} label={label} value={settings.layers[layer].coverage} display={pct(settings.layers[layer].coverage)} locked={rhythmLocked(seed)}
    onChange={v=>commit(setRhythmLayer(recipe,target,layer,{coverage:v}),`${label} density`)} onLock={()=>commit(toggleFacadeRhythmLock(recipe,seed),`Lock ${label.toLowerCase()}`)}/>)}
   {settings&&<ThemeRow label="Uniformity" value={uniform} display={pct(uniform)} title="High: repeated, regular windows. Low: random mixes."
    onChange={v=>{let next=recipe;for(const layer of ['ground','upper','attic'] as const)next=setRhythmLayer(next,target,layer,{uniformity:v});commit(next,'Theme uniformity');}}/>}
   {aspects.map(a=>{const value=ref.tune?.[a]??themeAspectDefault(t,a),inactive=!!ref.detached&&(a==='shops'||a==='roof');return inactive?null:<ThemeRow key={a} label={THEME_ASPECT_LABELS[a]} value={value} display={pct(value)} locked={locked(a)} tuned={ref.tune?.[a]!==undefined}
    onChange={v=>commit(setThemeTune(recipe,partId,a,v),`${THEME_ASPECT_LABELS[a]} density`)} onLock={()=>commit(toggleThemeLock(recipe,partId,a),`Lock ${THEME_ASPECT_LABELS[a].toLowerCase()}`)}
    onReset={ref.tune?.[a]!==undefined?()=>commit(setThemeTune(recipe,partId,a,null),`Reset ${THEME_ASPECT_LABELS[a].toLowerCase()}`):undefined}
    onRoll={()=>commit(rerollTheme(recipe,partId,a),`Reroll ${THEME_ASPECT_LABELS[a].toLowerCase()}`)}/>;})}
  </div>
  <small className="studio-palette-hint">Locked aspects keep their look when you reroll. Pools, spacing and scoped rules live in Facade rhythm below.</small>
 </div>;
}

function ThemeRow({label,value,display,locked,tuned,title,onChange,onLock,onReset,onRoll}:{label:string;value:number;display:string;locked?:boolean;tuned?:boolean;title?:string;onChange:(v:number)=>void;onLock?:()=>void;onReset?:()=>void;onRoll?:()=>void}){
 return <div className={`studio-theme-row${tuned?' is-tuned':''}`} title={title}>
  <label><span>{label}</span><input type="range" min={0} max={1} step={.05} value={value} aria-label={label} onChange={e=>onChange(Number(e.target.value))}/><output>{display}</output></label>
  {onRoll&&<button aria-label={`Reroll ${label.toLowerCase()}`} title="Reroll this aspect" onClick={onRoll}><DiceFive size={13}/></button>}
  {onLock&&<button aria-label={`${locked?'Unlock':'Lock'} ${label.toLowerCase()}`} aria-pressed={!!locked} title={locked?'Locked: rerolls keep it':'Lock against rerolls'} onClick={onLock}>{locked?<Lock size={13}/>:<LockOpen size={13}/>}</button>}
  {onReset&&<button aria-label={`Reset ${label.toLowerCase()}`} title="Back to the theme's own density" onClick={onReset}><X size={12}/></button>}
 </div>;
}
