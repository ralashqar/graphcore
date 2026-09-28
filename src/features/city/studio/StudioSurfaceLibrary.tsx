// Surface library for the paint brush (docs/city-surfaces.md): materials grouped by kind with recents (the quick
// material row and colour swatches above it stay as before, so any material takes any colour), pattern scale/rotation, wear, painted-over, soft edge, fades and stencilled stripes.
// Stroke-only effects (soft edge, fade, stripes) apply on generated walls; kit tiles take the material, colour,
// scale, rotation, wear and paint.
import {useMemo,useState} from 'react';
import {Eyedropper} from '@phosphor-icons/react';
import {LEGACY_TEXTURE_PATTERN,SURFACE_GROUPS,SURFACE_PATTERN_IDS,patternsFor,surfacePattern,type SurfaceGroup,type SurfacePatternId} from '../../../domain/citySurfacePatterns';
import {fadePresetColor,finishId,finishRenderTexture} from '../../../domain/cityStudioSurfaces';
import {requestSurfaceWarmup} from '../cityStudioWarmup';
import {CITY_TEXTURES,type CityTextureId} from '../../../domain/cityTexturePresets';
import type {StudioFinish} from '../../../domain/cityStudioTypes';
import {surfaceSwatch} from './surfaceSwatch';
import './studioSurfaces.css';
import type {StudioState} from './useStudioState';

/** Photo textures of the original palette (kept as plain texture ids, so old finishes stay exactly as they were). */
const CLASSIC:[string,string][]=[['','Smooth'],['brick','Brick'],['plaster','Plaster'],['concrete','Concrete'],['timber','Timber'],['metal','Metal'],['terracotta','Terracotta'],['pavers','Pavers']];
const WALL_PATTERNS=new Set(patternsFor('wall'));
const inGroup=(id:SurfacePatternId,group:SurfaceGroup|'All')=>(group==='All'||surfacePattern(id)!.group===group)&&!surfacePattern(id)!.texture;

export function Swatch({finish,size=34,label}:{finish:StudioFinish;size?:number;label?:string}){
 const s=finish.surface?surfaceSwatch(finish.surface.pattern,finish.color,finish.surface.accent,{size,scale:finish.surface.scale,rotation:finish.surface.rotation,painted:finish.surface.painted}):finish.texture?surfaceSwatch(LEGACY_TEXTURE_PATTERN[finish.texture as CityTextureId]??'cc0-brick',finish.color):null;
 return <i className="studio-surface-swatch" aria-label={label} style={{width:size,height:size,backgroundColor:s?.blend??finish.color,backgroundImage:s?.image,backgroundBlendMode:s?.blend?'multiply':undefined,backgroundSize:'cover'}}/>;
}

export function StudioSurfaceLibrary({st}:{st:StudioState}){
 const b=st.surfaceBrush,[group,setGroup]=useState<SurfaceGroup|'All'>(()=>b.pattern?surfacePattern(b.pattern)!.group:'Brick');
 const patterns=useMemo(()=>SURFACE_PATTERN_IDS.filter(id=>inGroup(id,group)&&(WALL_PATTERNS.has(id)||group==='All'||group==='Tile'||group==='Stone'||group==='Concrete')),[group]);
 const current=b.regionFinish(st.color,st.texture),pick=(id:SurfacePatternId)=>{const tint=b.choosePattern(id);requestSurfaceWarmup(finishRenderTexture({color:tint??st.color,surface:{pattern:id}})??'');if(tint)st.chooseColor(tint);st.setTexture('');b.remember({color:tint??st.color,surface:{pattern:id}});};
 const classic=(id:string,label:string)=>{b.choosePattern(null);st.chooseTexture(id,label);};
 const p=b.params,region=st.size==='free'||st.band,[tuneOpen,setTuneOpen]=useState(true),[effectsOpen,setEffectsOpen]=useState(()=>!!(p.soft||b.fade||b.stencil));
 return <div className="studio-surface-library">
  {!!b.recents.length&&<><span className="studio-caption">Recent</span><div className="studio-surface-recents">{b.recents.map(f=><button key={finishId(f)} title={f.surface?surfacePattern(f.surface.pattern)?.label:f.texture||'Smooth'} aria-label={`Use recent ${f.surface?.pattern??f.texture??'colour'} ${f.color??''}`} onClick={()=>{const got=b.adopt(f,st.color);st.setTexture(got.texture);st.chooseColor(got.color);}}><Swatch finish={f} size={26}/></button>)}</div></>}
  <span className="studio-caption">Material</span>
  <div className="studio-segment studio-surface-groups" role="group" aria-label="Material group">{(['All',...SURFACE_GROUPS] as const).map(g=><button key={g} aria-label={`${g} materials`} aria-pressed={group===g} onClick={()=>setGroup(g)}>{g}</button>)}</div>
  <div className="studio-surface-grid" aria-label="Materials">
   {group==='Classic'?CLASSIC.map(([id,label])=><button key={id||'smooth'} aria-label={`Classic ${label.toLowerCase()}`} aria-pressed={!b.pattern&&st.texture===id} title={label} onClick={()=>classic(id,label)}><i className={`studio-material-sample is-${id||'smooth'}`}/><span>{label}</span></button>)
   :patterns.map(id=>{const s=surfaceSwatch(id,undefined,undefined,{size:48});return <button key={id} data-pattern={id} aria-pressed={b.pattern===id} title={surfacePattern(id)!.label} onClick={()=>pick(id)}><i className="studio-surface-swatch" style={{backgroundImage:s.image}}/><span>{surfacePattern(id)!.label}</span></button>;})}
  </div>
  <div className="studio-surface-current"><Swatch finish={current} size={44} label="Current finish"/><span>{b.pattern?surfacePattern(b.pattern)!.label:st.texture?CITY_TEXTURES[st.texture as CityTextureId]?.label??st.texture:'Smooth'}<small>{st.color}{b.pattern&&p.accent?` · joints ${p.accent}`:''}</small></span>
   <button aria-label="Match a finish" title="Match: pick material, colour and scale from the building · or Alt-click" aria-pressed={st.eyedropper} onClick={()=>{if(st.erase)st.toggleErase();st.setEyedropper(!st.eyedropper);}}><Eyedropper size={16}/> Match</button></div>
  {b.pattern&&<label className="studio-surface-row">Joints / accent <input type="color" aria-label="Accent colour" value={p.accent??surfacePattern(b.pattern)!.accent} onChange={e=>b.setParam('accent',e.target.value)}/>{p.accent&&<button onClick={()=>b.setParam('accent',undefined)}>Reset</button>}</label>}
  <details className="studio-surface-tune" open={tuneOpen} onToggle={e=>setTuneOpen(e.currentTarget.open)}><summary>Pattern and wear</summary>
   <Slider label="Scale" value={Math.log2(p.scale)} min={-2} max={2} step={.1} show={`${p.scale.toFixed(2)}×`} set={v=>b.setParam('scale',Math.round(2**v*100)/100)}/>
   <Slider label="Rotation" value={p.rotation} min={0} max={345} step={15} show={`${p.rotation}°`} set={v=>b.setParam('rotation',v)}/>
   <Slider label="Wear" value={p.wear} min={0} max={1} step={.05} show={`${Math.round(p.wear*100)}%`} set={v=>b.setParam('wear',v)}/>
   <Slider label="Painted over" value={p.painted} min={0} max={1} step={.05} show={`${Math.round(p.painted*100)}%`} set={v=>b.setParam('painted',v)} hint="Paint the brush colour over the natural material (painted brick); wear chips it"/>
  </details>
  <details className="studio-surface-tune" open={effectsOpen} onToggle={e=>setEffectsOpen(e.currentTarget.open)}><summary>Brush effects {region?'':'· generated walls'}</summary>
   <Slider label="Soft edge" value={p.soft} min={0} max={1.5} step={.05} show={p.soft?`${p.soft.toFixed(2)} m`:'crisp'} set={v=>b.setParam('soft',v)}/>
   <span className="studio-caption">Fade</span>
   <div className="studio-segment" role="group" aria-label="Fade">
    <button aria-pressed={!b.fade} onClick={()=>b.setFade(null)}>None</button>
    <button aria-pressed={b.fade?.from==='bottom'} title="Rising damp: darker at the bottom of the stroke" onClick={()=>{b.setFade({color:fadePresetColor(st.color,'damp'),from:'bottom'});st.chooseSize('free');st.setBand(true);}}>Rising damp</button>
    <button aria-pressed={b.fade?.from==='top'} title="Sun-faded: paler at the top of the stroke" onClick={()=>{b.setFade({color:fadePresetColor(st.color,'sun'),from:'top'});st.chooseSize('free');st.setBand(true);}}>Sun-faded</button>
   </div>
   {b.fade&&<label className="studio-surface-row">Fade colour <input type="color" aria-label="Fade colour" value={b.fade.color} onChange={e=>b.setFade({...b.fade!,color:e.target.value})}/><button onClick={()=>b.setFade({...b.fade!,from:b.fade!.from==='bottom'?'top':'bottom'})}>{b.fade.from==='bottom'?'From bottom':'From top'}</button></label>}
   <span className="studio-caption">Stencil</span>
   <div className="studio-segment" role="group" aria-label="Stencil stripes">
    <button aria-pressed={!b.stencil} onClick={()=>b.setStencil(null)}>None</button>
    <button aria-pressed={b.stencil?.direction==='horizontal'} onClick={()=>{b.setStencil({direction:'horizontal',width:b.stencil?.width??.2,gap:b.stencil?.gap??.2});st.chooseSize('free');st.setBand(true);}}>Bands</button>
    <button aria-pressed={b.stencil?.direction==='vertical'} onClick={()=>{b.setStencil({direction:'vertical',width:b.stencil?.width??.3,gap:b.stencil?.gap??.3});st.chooseSize('free');st.setBand(true);}}>Stripes</button>
   </div>
   {b.stencil&&<><Slider label="Stripe" value={b.stencil.width} min={.05} max={1.5} step={.05} show={`${b.stencil.width.toFixed(2)} m`} set={v=>b.setStencil({...b.stencil!,width:v})}/><Slider label="Gap" value={b.stencil.gap} min={.05} max={1.5} step={.05} show={`${b.stencil.gap.toFixed(2)} m`} set={v=>b.setStencil({...b.stencil!,gap:v})}/></>}
   {(b.fade||b.stencil)&&<p className="studio-palette-hint">Drag a band on a generated wall: the {b.stencil?'stripes fill it':'fade spans it'}.</p>}
   {(p.scale!==1||p.rotation||p.wear||p.painted||p.soft||b.fade||b.stencil)&&<button onClick={b.reset}>Reset effects</button>}
  </details>
 </div>;
}

function Slider({label,value,min,max,step,show,set,hint}:{label:string;value:number;min:number;max:number;step:number;show:string;set:(v:number)=>void;hint?:string}){
 return <label className="studio-surface-slider" title={hint}><span>{label}</span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e=>set(Number(e.target.value))}/><output>{show}</output></label>;
}
