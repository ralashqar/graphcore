// Facade rhythm rules panel (Openings → Rhythm): style presets, per-layer opening pools with weights,
// coverage/uniformity/bay controls, scoped rules picked in 3D (parts, walls, floors, painted regions) and
// the per-wall actions (keep manual, unpack, plain). State lives in useRhythmPanel so CityStudio can route
// wall clicks and highlight the chosen scope; the recipe logic is in cityStudioFacadeRhythm.
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowCounterClockwise,DiceFive,Lock,LockOpen,Minus,Plus,Trash,X} from '@phosphor-icons/react';
import {FREE_TRIM_KINDS,type TrimKind} from '../../domain/cityStudioTrimParts';
import {isFrame,studioFaceFrame} from '../../domain/cityStudioFreeOpenings';
import {applyRhythmStyle,materializeFacadeRhythm,removeFacadeRhythmRule,rhythmRuleLabel,rhythmScopeSettings,RHYTHM_OPENINGS,RHYTHM_SPECS,RHYTHM_STYLES,setFacadeRhythm,setFacadeRhythmRule,setRhythmLayer,shuffleFacadeRhythm,toggleFacadeRhythmLock,type FacadeRhythmRule,type RhythmLayer,type RhythmPattern,type RhythmPoolEntry,type RhythmPoolLayer,type RhythmStyle,type RhythmTarget,type RhythmTrims} from '../../domain/cityStudioFacadeRhythm';
import type {SculptWallSide} from '../../domain/citySculpt';
import type {StudioBay,StudioRecipe} from '../../domain/cityStudioTypes';
import type {CityBuildingDesignV3} from '../../domain/cityBuildingV3';
import {freeOpeningOutline} from './studioFreeOpeningTool';
import {studioKitVersion,studioModules} from '../../domain/cityStudioCatalog';
import {MODULE_POOL_PREFIX,moduleOpeningSpec} from '../../domain/cityStudioModuleSpec';

export type RhythmScopeKind='building'|'parts'|'walls'|'floors'|'region';
export type RhythmWallAction='pick'|'unpack'|'off'|'manual';
type WallInfo={bay:StudioBay;point:{x:number;y:number;z:number};shift:boolean};
type Heights=Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>;
const SCOPES:[RhythmScopeKind,string][]=[['building','Whole building'],['parts','These parts'],['walls','This wall'],['floors','These floors'],['region','Painted region']];
const LAYER_TABS:[RhythmPoolLayer,string][]=[['ground','Ground'],['upper','Upper'],['attic','Top'],['corners','Corners'],['trims','Trims']];
const PATTERNS:[RhythmPattern,string,string][]=[['aligned','Aligned','Each column keeps its choice up the storeys'],['groups','Blocks','Two-by-two blocks share a choice'],['alternating','Alternate','Odd and even storeys differ'],['independent','Scattered','Every cell rolls on its own']];
const TRIM_LABELS:Record<TrimKind,string>={shutters:'Shutters','window-box':'Flower box',keystone:'Keystone',hood:'Hood',lintel:'Lintel','sill-brackets':'Sill brackets',canopy:'Canopy',lamps:'Lamps'};
const sameTarget=(a:RhythmTarget,b:RhythmTarget)=>JSON.stringify([a.partId,a.side,a.fromFloor,a.toFloor,a.x0,a.x1])===JSON.stringify([b.partId,b.side,b.fromFloor,b.toFloor,b.x0,b.x1]);
/** Face-local x span of a bay (metres along the face frame). */
function baySpan(r:StudioRecipe,d:Heights,b:StudioBay):[number,number]|null{
 const f=studioFaceFrame(r,d,b.anchor.shapeId,b.anchor.side);if(!isFrame(f))return null;
 const s=(b.x-f.origin[0])*f.tangent[0]+(b.z-f.origin[1])*f.tangent[1];return [s-b.width/2,s+b.width/2];
}
const inTarget=(r:StudioRecipe,d:Heights,t:RhythmTarget,b:StudioBay)=>{
 const a=b.anchor;if(t.partId&&t.partId!==a.shapeId||t.side&&t.side!==a.side)return false;
 if(t.fromFloor!==undefined&&(a.floor<t.fromFloor||a.floor>t.toFloor!))return false;
 if(t.x0!==undefined){const s=baySpan(r,d,b);if(!s)return false;const c=(s[0]+s[1])/2;return c>=t.x0-1e-6&&c<=t.x1!+1e-6;}
 return true;
};

export function useRhythmPanel({recipe,design,floor,commit,setIssue}:{recipe:StudioRecipe|null;design:Heights&CityBuildingDesignV3;floor:number;commit:(r:StudioRecipe)=>void;setIssue:(m:string)=>void}){
 const [scope,setScopeState]=useState<RhythmScopeKind>('building'),[targets,setTargets]=useState<RhythmTarget[]>([]),[layer,setLayer]=useState<RhythmPoolLayer>('upper');
 const [action,setAction]=useState<RhythmWallAction>('pick'),[regionStart,setRegionStart]=useState<{bay:StudioBay;span:[number,number]}|null>(null);
 const setScope=(next:RhythmScopeKind)=>{setScopeState(next);setAction('pick');setRegionStart(null);setTargets(next==='floors'?[{fromFloor:floor,toFloor:floor}]:[]);};
 // "These floors" follows the storey rail.
 const lastFloor=useRef(floor);
 useEffect(()=>{if(lastFloor.current===floor)return;lastFloor.current=floor;if(scope==='floors')setTargets([{fromFloor:floor,toFloor:floor}]);},[floor,scope]);
 const picking=action!=='pick'||scope!=='building';
 const onWall=(shapeId:string,side:string,info?:WallInfo)=>{
  if(!recipe)return;const s=side as SculptWallSide,wall={partId:shapeId,side:s};
  if(action==='unpack'){
   const out=materializeFacadeRhythm(recipe,design,{shapeId,side:s});if('reason' in out){setIssue(out.reason);return;}if(!out.ids.length){setIssue('This wall has no generated openings to unpack.');return;}commit(out.recipe);return;
  }
  const rule=recipe.studio.facadeRhythm?.rules?.find(x=>sameTarget(x,wall));
  if(action==='off'){commit(setFacadeRhythmRule(recipe,wall,{off:rule?.off?undefined:true}));return;}
  if(action==='manual'){commit(setFacadeRhythmRule(recipe,wall,{manual:rule?.manual==='own'?undefined:'own'}));return;}
  const shift=!!info?.shift,toggle=(t:RhythmTarget)=>setTargets(list=>shift?(list.some(x=>sameTarget(x,t))?list.filter(x=>!sameTarget(x,t)):[...list,t]):[t]);
  if(scope==='parts')toggle({partId:shapeId});
  else if(scope==='walls'||scope==='building'){if(scope==='building')setScopeState('walls');toggle(wall);}
  else if(scope==='floors'){const f=info?.bay.anchor.floor??floor;setTargets(list=>{const cur=list[0];return shift&&cur?[{fromFloor:Math.min(cur.fromFloor!,f),toFloor:Math.max(cur.toFloor!,f)}]:[{fromFloor:f,toFloor:f}];});}
  else if(scope==='region'&&info){
   const span=baySpan(recipe,design,info.bay);if(!span)return;
   if(!regionStart||regionStart.bay.anchor.shapeId!==shapeId||regionStart.bay.anchor.side!==side){setRegionStart({bay:info.bay,span});setIssue('');return;}
   const a=regionStart.bay.anchor.floor,b=info.bay.anchor.floor,t:RhythmTarget={partId:shapeId,side:s,fromFloor:Math.min(a,b),toFloor:Math.max(a,b),x0:Math.round(Math.max(0,Math.min(regionStart.span[0],span[0]))*100)/100,x1:Math.round(Math.max(regionStart.span[1],span[1])*100)/100};
   setRegionStart(null);setTargets(list=>shift?[...list.filter(x=>!sameTarget(x,t)),t]:[t]);
  }
 };
 const hint=action==='unpack'?'Click a wall to unpack its generated openings for editing':action==='off'?'Click a wall to keep it plain (click again to restore)':action==='manual'?'Click a wall to keep it manual (click again to let the rhythm fill around your openings)'
  :scope==='parts'?'Click parts to choose them · Shift adds more':scope==='walls'?'Click walls to choose them · Shift adds more':scope==='floors'?'Use the storey rail or click a storey · Shift-click extends the range':scope==='region'?(regionStart?'Click where the region ends (same wall)':'Click where the painted region starts, then where it ends'):'';
 /** Bays to highlight: the chosen scope and a preview of what a click would pick. */
 const highlight=(bays:StudioBay[],hover:StudioBay|null)=>{
  if(!recipe)return {selected:[] as StudioBay[],preview:[] as StudioBay[]};
  const selected=scope==='building'||action!=='pick'?[]:bays.filter(b=>targets.some(t=>inTarget(recipe,design,t,b)));
  let preview:StudioBay[]=[];
  if(hover){const a=hover.anchor;
   if(action!=='pick'||scope==='walls'||scope==='building')preview=bays.filter(b=>b.anchor.shapeId===a.shapeId&&b.anchor.side===a.side);
   else if(scope==='parts')preview=bays.filter(b=>b.anchor.shapeId===a.shapeId);
   else if(scope==='floors')preview=bays.filter(b=>b.anchor.floor===a.floor);
   else if(scope==='region'){const span=baySpan(recipe,design,hover);if(regionStart&&regionStart.bay.anchor.shapeId===a.shapeId&&regionStart.bay.anchor.side===a.side&&span){const t={partId:a.shapeId,side:a.side,fromFloor:Math.min(a.floor,regionStart.bay.anchor.floor),toFloor:Math.max(a.floor,regionStart.bay.anchor.floor),x0:Math.min(span[0],regionStart.span[0]),x1:Math.max(span[1],regionStart.span[1])};preview=bays.filter(b=>inTarget(recipe,design,t,b));}else preview=[hover];}
  }
  return {selected,preview};
 };
 return {scope,setScope,targets,setTargets,layer,setLayer,action,setAction,picking,onWall,hint,highlight,regionStart};
}
export type RhythmPanelState=ReturnType<typeof useRhythmPanel>;

function OpeningIcon({id}:{id:string}){
 const o=RHYTHM_OPENINGS.find(x=>x.id===id);
 if(!o?.icon)return <svg viewBox="-20 -20 40 40" className="rhythm-icon" aria-hidden="true"><rect x="-20" y="-20" width="40" height="40" rx="5"/><path d="M-12,12 L12,-12 M-12,0 L0,-12 M0,12 L12,0" className="rhythm-hatch"/></svg>;
 const {shape,w,h,panels=1}=o.icon,W=w*30,H=h*30,gap=2.5,pw=(W-(panels-1)*gap)/panels;
 return <svg viewBox="-20 -20 40 40" className="rhythm-icon" aria-hidden="true"><rect x="-20" y="-20" width="40" height="40" rx="5"/>
  {Array.from({length:panels},(_,i)=>{const cx=-W/2+pw/2+i*(pw+gap),cy=id==='door'?16-H/2:0,pts=freeOpeningOutline(shape,pw,H,10);return <path key={i} d={`M${pts.map(([x,y])=>`${(cx+x).toFixed(2)},${(cy-y).toFixed(2)}`).join(' L')} Z`}/>;})}
</svg>;
}
function StyleIcon({id}:{id:RhythmStyle}){
 return <svg viewBox="-26 -26 52 52" className="studio-free-icon rhythm-style-icon" aria-hidden="true"><rect x="-26" y="-26" width="52" height="52" rx="6"/>{[-12,0,12].map(x=><path key={x} d={id==='civic'||id==='warehouse'?`M${x-4},10 L${x-4},-2 A4,4 0 0 1 ${x+4},-2 L${x+4},10 Z`:id==='shopfront'||id==='loft'?`M${x-5},12 L${x-5},2 L${x+5},2 L${x+5},12 Z M${x-3},-4 L${x-3},-14 L${x+3},-14 L${x+3},-4 Z`:`M${x-3},12 L${x-3},0 L${x+3},0 L${x+3},12 Z M${x-3},-4 L${x-3},-14 L${x+3},-14 L${x+3},-4 Z`}/>)}</svg>;
}
const ruleSummary=(r:FacadeRhythmRule)=>[r.style&&RHYTHM_SPECS[r.style].label,r.off&&'plain',r.manual==='own'&&'manual',r.manual==='fill'&&'fills',r.layers&&Object.keys(r.layers).map(l=>LAYER_TABS.find(t=>t[0]===l)?.[1].toLowerCase()).join('/')+' rules',r.bay&&`${r.bay} m bays`,r.variety!==undefined&&'variety',r.trims&&`${r.trims} trims`,r.layerSeeds&&'rerolled'].filter(Boolean).join(', ');

/** Chip for one pool entry: tap includes, double-tap or + favours, long-press or − avoids. */
function PoolChip({id,label,entry,share,icon,set,thumb}:{id:string;label:string;entry?:RhythmPoolEntry;share:number;icon:boolean;set:(weight:number|null)=>void;thumb?:string}){
 const press=useRef<number|null>(null),long=useRef(false),w=entry?.weight??0;
 const favour=()=>set(w>=1?Math.min(64,w*2):1),avoid=()=>set(w>1?w/2:null);
 return <div className={`rhythm-chip${entry?w>1?' is-favoured':'':' is-avoided'}`}>
  <button className="rhythm-chip-main" aria-label={label} aria-pressed={!!entry} title={`${label}: tap to include · double-tap or + to favour · long-press or − to avoid`}
   onPointerDown={()=>{long.current=false;press.current=window.setTimeout(()=>{long.current=true;set(null);},550);}}
   onPointerUp={()=>{if(press.current)clearTimeout(press.current);}} onPointerLeave={()=>{if(press.current)clearTimeout(press.current);}}
   onClick={()=>{if(long.current){long.current=false;return;}if(!entry)set(1);}} onDoubleClick={favour} onContextMenu={e=>{e.preventDefault();set(null);}}>
   {thumb?<img className="rhythm-kit-thumb" src={thumb} alt=""/>:icon&&<OpeningIcon id={id}/>}<span>{label}</span>{entry&&<small>{Math.round(share*100)}%{w>1?` · ×${+w.toFixed(2)}`:''}</small>}
  </button>
  <span className="rhythm-chip-weights"><button aria-label={`Avoid ${label}`} disabled={!entry} onClick={avoid}><Minus size={11}/></button><button aria-label={`Favour ${label}`} onClick={favour}><Plus size={11}/></button></span>
 </div>;
}

/**
 * Kit pieces in the pool (`module:<id>`): Blender windows, doors and wall panels at their native size, with the
 * tray thumbnails. Pieces already in the pool are listed first; the rest open under "More kit pieces".
 */
function KitPoolChips({recipe,layer,pool,total,setWeight}:{recipe:StudioRecipe;layer:RhythmPoolLayer;pool:RhythmPoolEntry[];total:number;setWeight:(id:string,w:number|null)=>void}){
 const version=studioKitVersion(recipe.studio.catalogue);
 const kit=useMemo(()=>studioModules(version).filter(p=>{const spec=moduleOpeningSpec(p.id);return !!spec&&spec.kind!=='blind'&&(layer==='ground'||spec.category!=='door');}),[version,layer]);
 const chip=(p:typeof kit[number])=>{const id=MODULE_POOL_PREFIX+p.id,entry=pool.find(e=>e.id===id);return <PoolChip key={id} id={id} label={p.label} icon={false} thumb={`/city/synarc-kit/v${version}/thumbnails/${p.id}.png`} entry={entry} share={total?(entry?.weight??0)/total:0} set={w=>setWeight(id,w)}/>;};
 const used=kit.filter(p=>pool.some(e=>e.id===MODULE_POOL_PREFIX+p.id)),rest=kit.filter(p=>!used.includes(p));
 return <div className="rhythm-kit" aria-label={`${layer} kit pieces`}>
  <span className="studio-caption">Kit pieces{used.length?` · ${used.length} in the pool`:''}</span>
  {!!used.length&&<div className="rhythm-pool">{used.map(chip)}</div>}
  <details><summary>{used.length?'More kit pieces':'Add kit pieces'}</summary><div className="rhythm-pool rhythm-kit-pool">{rest.map(chip)}</div></details>
 </div>;
}

export function CityRhythmPanel({recipe,commit,panel,partName,shuffle,onClose}:{recipe:StudioRecipe;commit:(r:StudioRecipe)=>void;panel:RhythmPanelState;partName:(id:string)=>string;shuffle:()=>void;onClose:()=>void}){
 const rhythm=recipe.studio.facadeRhythm,{scope,targets,layer}=panel;
 const needsTargets=scope!=='building',ready=!needsTargets||targets.length>0,cellScope=scope==='floors'||scope==='region';
 const settings=useMemo(()=>rhythm?rhythmScopeSettings(rhythm,targets[0]):null,[rhythm,targets]);
 const L=settings?.layers[layer],total=L?L.pool.reduce((n,p)=>n+p.weight,0):0;
 const writeTargets=needsTargets?targets:[];
 const patchScope=(patch:Omit<FacadeRhythmRule,keyof RhythmTarget>)=>{if(!ready)return;commit(writeTargets.length?writeTargets.reduce((r,t)=>setFacadeRhythmRule(r,t,patch),recipe):setFacadeRhythm(recipe,patch));};
 const setLayerRule=(patch:Parameters<typeof setRhythmLayer>[3])=>{if(ready)commit(setRhythmLayer(recipe,writeTargets,layer,patch));};
 const setWeight=(id:string,weight:number|null)=>{if(!L)return;const pool=L.pool.filter(p=>p.id!==id);if(weight!==null){const at=L.pool.findIndex(p=>p.id===id);pool.splice(at<0?pool.length:at,0,{id,weight:Math.round(weight*100)/100});}setLayerRule({pool});};
 const seedLayer:RhythmLayer=layer==='corners'?'upper':layer as RhythmLayer;
 const reroll=()=>{if(!rhythm)return;let v=rhythm;if(writeTargets.length)for(const t of writeTargets)v=shuffleFacadeRhythm(v,t,seedLayer);else v=shuffleFacadeRhythm(v,undefined,seedLayer);commit({...recipe,studio:{...recipe.studio,facadeRhythm:v}});};
 const derivedBay=settings?(RHYTHM_SPECS[settings.style].bay*(1.3-.6*settings.density)):2.5;
 const walls=scope==='walls'&&targets.length>0;
 const wallAction=(a:'manual'|'off'|'unpack')=>{
  if(a!=='unpack'&&walls){const flag=a==='manual'?'manual':'off',on=targets.every(t=>{const rr=rhythm?.rules?.find(x=>sameTarget(x,t));return a==='manual'?rr?.manual==='own':!!rr?.off;});commit(targets.reduce((r,t)=>setFacadeRhythmRule(r,t,flag==='manual'?{manual:on?undefined:'own'}:{off:on?undefined:true}),recipe));return;}
  panel.setAction(panel.action===a?'pick':a);
 };
 return <div className="studio-rhythm rhythm-panel" role="group" aria-label="Facade rhythm">
  <div className="rhythm-side">
   <span className="studio-caption">Style preset</span>
   <div className="rhythm-styles">{RHYTHM_STYLES.map(st=><button className="studio-tile" key={st.id} title={st.blurb} aria-pressed={settings?.style===st.id} disabled={!ready&&!!rhythm} onClick={()=>commit(applyRhythmStyle(recipe,writeTargets,st.id))}><StyleIcon id={st.id}/><span>{st.label}</span></button>)}</div>
   <span className="studio-caption">Apply to</span>
   <div className="rhythm-scopes" role="radiogroup" aria-label="Apply rules to">{SCOPES.map(([id,label])=><button key={id} role="radio" aria-checked={scope===id} disabled={!rhythm&&id!=='building'} onClick={()=>panel.setScope(id)}>{label}</button>)}</div>
   {scope!=='building'&&<div className="rhythm-targets">{targets.length?targets.map((t,i)=><span key={i}>{rhythmRuleLabel(t,partName)}<button aria-label="Remove from selection" onClick={()=>panel.setTargets(targets.filter(x=>x!==t))}><X size={10}/></button></span>):<small>{panel.hint}</small>}
    {scope==='floors'&&targets[0]&&<small>Shift-click a storey or use the rail to change the range</small>}</div>}
   {rhythm&&<div className="rhythm-actions">
    <button onClick={shuffle} title="Reroll every unlocked layer · Space"><DiceFive size={15}/> Shuffle</button>
    <button aria-pressed={panel.action==='manual'||walls&&targets.every(t=>rhythm.rules?.find(x=>sameTarget(x,t))?.manual==='own')} title="Keep a wall entirely manual: the rhythm stops filling around your openings there" onClick={()=>wallAction('manual')}>Keep wall manual</button>
    <button aria-pressed={panel.action==='unpack'} title="Click a wall to turn its generated openings into editable free openings" onClick={()=>wallAction('unpack')}>Unpack a wall</button>
    <button aria-pressed={panel.action==='off'||walls&&targets.every(t=>!!rhythm.rules?.find(x=>sameTarget(x,t))?.off)} title="Keep a wall plain" onClick={()=>wallAction('off')}>Plain wall</button>
    <button aria-label="Remove rhythm" title="Remove the rhythm (manual openings stay)" onClick={()=>{commit(setFacadeRhythm(recipe,null));onClose();}}><Trash size={15}/></button>
   </div>}
  </div>
  {rhythm&&settings&&L?<div className="rhythm-main">
   <div className="rhythm-tabs" role="tablist" aria-label="Rhythm layers">{LAYER_TABS.map(([id,label])=><span key={id} className="rhythm-tab"><button role="tab" aria-selected={layer===id} onClick={()=>panel.setLayer(id)}>{label}{settings.explicit[id]&&<i aria-label="edited"/>}</button>{id!=='corners'&&<button className="rhythm-lock" aria-label={`Lock ${id}`} aria-pressed={!!rhythm.locks?.includes(id as RhythmLayer)} title={`Keep the ${label.toLowerCase()} layer when shuffling`} onClick={()=>commit(toggleFacadeRhythmLock(recipe,id as RhythmLayer))}>{rhythm.locks?.includes(id as RhythmLayer)?<Lock size={12}/>:<LockOpen size={12}/>}</button>}</span>)}
    <span className="rhythm-tab-tools"><button aria-label={`Reroll ${layer}`} title="Reroll this layer" disabled={!ready||!!rhythm.locks?.includes(seedLayer)} onClick={reroll}><DiceFive size={14}/></button><button aria-label="Reset layer to style" title="Back to the style preset" disabled={!ready||!settings.explicit[layer]} onClick={()=>setLayerRule(null)}><ArrowCounterClockwise size={14}/></button></span></div>
   {!ready?<p className="rhythm-empty">{panel.hint}</p>:<>
    <div className="rhythm-pool" aria-label={`${layer} pool`}>{layer==='trims'?FREE_TRIM_KINDS.map(k=><PoolChip key={k} id={k} label={TRIM_LABELS[k]} icon={false} entry={L.pool.find(p=>p.id===k)} share={total?(L.pool.find(p=>p.id===k)?.weight??0)/total:0} set={w=>setWeight(k,w)}/>)
     :RHYTHM_OPENINGS.filter(o=>layer==='ground'||!['shop'].includes(o.id)).map(o=><PoolChip key={o.id} id={o.id} label={o.label} icon entry={L.pool.find(p=>p.id===o.id)} share={total?(L.pool.find(p=>p.id===o.id)?.weight??0)/total:0} set={w=>setWeight(o.id,w)}/>)}</div>
    {layer!=='trims'&&<KitPoolChips recipe={recipe} layer={layer} pool={L.pool} total={total} setWeight={setWeight}/>}
    <div className="rhythm-sliders">
     <label title="Share of bays that get an opening; the rest stay blind wall">{layer==='trims'?'Trimmed':'Coverage'} <input type="range" min={0} max={1} step={.05} value={L.coverage} aria-label={`${layer} coverage`} onChange={e=>setLayerRule({coverage:Number(e.target.value)})}/><output>{Math.round(L.coverage*100)}%</output></label>
     <label title="How often a bay takes the building-wide favourite instead of its own pick">Uniformity <input type="range" min={0} max={1} step={.05} value={L.uniformity} aria-label={`${layer} uniformity`} onChange={e=>setLayerRule({uniformity:Number(e.target.value)})}/><output>{Math.round(L.uniformity*100)}%</output></label>
     {!cellScope&&layer!=='trims'&&<label title="Column pitch for every storey of the chosen walls">Bay width <input type="range" min={1.2} max={6} step={.1} value={settings.bay??derivedBay} aria-label="Bay width" onChange={e=>patchScope({bay:Number(e.target.value)})}/><output>{(settings.bay??derivedBay).toFixed(1)} m</output>{settings.bay!==undefined&&<button className="rhythm-auto" onClick={()=>patchScope({bay:undefined})}>Auto</button>}</label>}
    </div>
    <div className="rhythm-row"><span>Pattern</span>{PATTERNS.map(([id,label,title])=><button key={id} title={title} aria-pressed={L.pattern===id} onClick={()=>setLayerRule({pattern:id})}>{label}</button>)}
     <span>Every</span>{[0,1,2].map(n=><button key={n} aria-label={n?`Every ${n+1} columns`:'Every column'} aria-pressed={L.spacing===n} onClick={()=>setLayerRule({spacing:n})}>{['1','2nd','3rd'][n]}</button>)}</div>
    <div className="rhythm-row"><span>Variety</span>{([['Calm',.15],['Mixed',.35],['Lively',.7]] as const).map(([label,value])=><button key={label} aria-pressed={Math.abs(settings.variety-value)<.01} title="Feeds the style preset: alternative shapes and blind bays" onClick={()=>patchScope({variety:value})}>{label}</button>)}
     <span>Trims</span>{(['none','simple','rich'] as RhythmTrims[]).map(t=><button key={t} aria-label={`${t} trims`} aria-pressed={settings.trims===t} onClick={()=>patchScope({trims:t})}>{t==='none'?'None':t==='simple'?'Simple':'Rich'}</button>)}
     {!cellScope&&<><span>Manual openings</span><button aria-pressed={settings.manual==='fill'} title="Your windows reserve their span; generated openings fill around them" onClick={()=>patchScope({manual:'fill'})}>Fill around</button><button aria-pressed={settings.manual==='own'} title="A wall with your own openings is left to you" onClick={()=>patchScope({manual:'own'})}>Own the wall</button></>}</div>
   </>}
   {!!rhythm.rules?.length&&<details className="rhythm-rules" open><summary>Scoped rules ({rhythm.rules.length})</summary><ul>{rhythm.rules.map((r,i)=><li key={i}><button className="rhythm-rule-pick" title="Edit this scope" onClick={()=>{const kind:RhythmScopeKind=r.x0!==undefined?'region':r.fromFloor!==undefined?'floors':r.side?'walls':'parts';panel.setScope(kind);panel.setTargets([{partId:r.partId,side:r.side,fromFloor:r.fromFloor,toFloor:r.toFloor,x0:r.x0,x1:r.x1}]);}}><strong>{rhythmRuleLabel(r,partName)}</strong><small>{ruleSummary(r)||'no changes'}</small></button><button aria-label={`Remove rule ${rhythmRuleLabel(r,partName)}`} onClick={()=>commit(removeFacadeRhythmRule(recipe,i))}><X size={12}/></button></li>)}</ul></details>}
  </div>:<p className="rhythm-empty">Pick a style preset to lay generated openings on every wall. Your own windows stay; the rhythm fills around them.</p>}
 </div>;
}
