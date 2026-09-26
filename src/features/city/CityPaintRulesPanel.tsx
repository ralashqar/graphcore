// Paint rules panel (Paint tool → Paint rules): presets (plinth, ground/upper/top floor, string courses, quoins,
// frieze, alternate bays) that paint every generated wall in a scope, picked in 3D like the rhythm scopes
// (Whole building / These parts / These walls, Shift adds or removes). Rules resolve per face at resolve time
// (cityStudioPaintRules); hand strokes and bands still paint on top. State lives in usePaintRules so CityStudio
// can route wall clicks (useStudioInteraction `onPaintPick`) and highlight the scope.
import {useState,type DragEvent} from 'react';
import {ArrowDown,ArrowUp,DotsSixVertical,PaintBucket,Trash,X} from '@phosphor-icons/react';
import {addPaintRule,paintRuleLabel,paintRuleScopeLabel,PAINT_RULE_PRESETS,PAINT_RULES,movePaintRule,removePaintRule,reorderPaintRule,storeyName,updatePaintRule,type PaintRuleFloors,type PaintRuleScope,type PaintRuleWall,type StudioPaintRule} from '../../domain/cityStudioPaintRules';
import type {StudioBay,StudioFinish,StudioRecipe} from '../../domain/cityStudioTypes';

export type PaintRuleScopeKind='building'|'parts'|'walls';
const SCOPES:[PaintRuleScopeKind,string][]=[['building','Whole building'],['parts','These parts'],['walls','These walls']];
const kindOf=(s:PaintRuleScope|undefined):PaintRuleScopeKind=>s?.walls?'walls':s?.parts?'parts':'building';
const sameWall=(a:PaintRuleWall,b:PaintRuleWall)=>a.partId===b.partId&&a.side===b.side;
const wallName=(w:PaintRuleWall,partName:(id:string)=>string)=>`${partName(w.partId)} · ${w.side==='curve'?'round wall':w.side.startsWith('edge:')?'wall':w.side}`;

export function usePaintRules({recipe,commit,setIssue}:{recipe:StudioRecipe|null;commit:(r:StudioRecipe)=>void;setIssue:(m:string)=>void}){
 const [open,setOpen]=useState(false),[kind,setKindState]=useState<PaintRuleScopeKind>('building'),[parts,setParts]=useState<string[]>([]),[walls,setWalls]=useState<PaintRuleWall[]>([]),[selectedId,setSelectedId]=useState<string|null>(null);
 const rule=recipe?.studio.paintRules?.find(r=>r.id===selectedId)??null;
 // A selected rule edits its own scope; otherwise the picker sets where new presets go.
 const targets=rule&&kindOf(rule.scope)===kind?{parts:rule.scope?.parts??[],walls:rule.scope?.walls??[]}:rule?{parts:[],walls:[]}:{parts,walls};
 const picking=open&&kind!=='building';
 const scopeValue=(k:PaintRuleScopeKind,p:string[],w:PaintRuleWall[]):PaintRuleScope|undefined=>k==='parts'&&p.length?{parts:p}:k==='walls'&&w.length?{walls:w}:undefined;
 const writeTargets=(p:string[],w:PaintRuleWall[])=>{
  if(!rule){setParts(p);setWalls(w);return;}
  const scope=scopeValue(kind,p,w);if(!scope){setIssue('A rule needs at least one target. Choose Whole building instead.');return;}
  if(recipe)commit(updatePaintRule(recipe,rule.id,{scope}));
 };
 const setKind=(k:PaintRuleScopeKind)=>{setKindState(k);setIssue('');if(!rule){setParts([]);setWalls([]);return;}if(k==='building'&&rule.scope&&recipe)commit(updatePaintRule(recipe,rule.id,{scope:undefined}));};
 const select=(id:string|null)=>{setSelectedId(id);const r=recipe?.studio.paintRules?.find(x=>x.id===id);if(r)setKindState(kindOf(r.scope));};
 const onWall=(shapeId:string,side:string,shift:boolean)=>{
  if(kind==='parts'){const has=targets.parts.includes(shapeId);writeTargets(shift?(has?targets.parts.filter(p=>p!==shapeId):[...targets.parts,shapeId]):[shapeId],targets.walls);}
  else if(kind==='walls'){const w={partId:shapeId,side},has=targets.walls.some(x=>sameWall(x,w));writeTargets(targets.parts,shift?(has?targets.walls.filter(x=>!sameWall(x,w)):[...targets.walls,w]):[w]);}
 };
 const scope=():PaintRuleScope|undefined|null=>{const s=scopeValue(kind,parts,walls);return kind!=='building'&&!s?null:s;};
 const hint=kind==='parts'?'Click parts to choose them · Shift adds or removes':kind==='walls'?'Click walls to choose them · Shift adds or removes':'';
 /** Bays to highlight: the chosen scope (amber) and what a click would pick. */
 const highlight=(bays:StudioBay[],hover:StudioBay|null)=>{
  if(!open)return {selected:[] as StudioBay[],preview:[] as StudioBay[]};
  const selected=kind==='parts'?bays.filter(b=>targets.parts.includes(b.anchor.shapeId)):kind==='walls'?bays.filter(b=>targets.walls.some(w=>w.partId===b.anchor.shapeId&&w.side===b.anchor.side)):[];
  const preview=!hover||!picking?[]:kind==='parts'?bays.filter(b=>b.anchor.shapeId===hover.anchor.shapeId):bays.filter(b=>b.anchor.shapeId===hover.anchor.shapeId&&b.anchor.side===hover.anchor.side);
  return {selected,preview};
 };
 return {open,setOpen:(v:boolean)=>{setOpen(v);if(!v)setSelectedId(null);},kind,setKind,targets,writeTargets,picking,onWall,hint,highlight,rule,select,scope};
}
export type PaintRulesState=ReturnType<typeof usePaintRules>;

/** Amber planes on the bays of the chosen scope; lighter ones for the hover preview. */
export function PaintRuleMarks({marks}:{marks:{selected:StudioBay[];preview:StudioBay[]}}){
 return <>{[...marks.selected.map(b=>({b,kind:'selected'})),...marks.preview.map(b=>({b,kind:'preview'}))].map(({b,kind})=><mesh key={`paint-rule/${kind}/${b.id}`} position={[b.x+Math.sin(b.rotation)*(kind==='selected'?.27:.29),b.y+b.height/2,b.z+Math.cos(b.rotation)*(kind==='selected'?.27:.29)]} rotation={[0,b.rotation,0]} raycast={()=>null}><planeGeometry args={[b.width-.02,b.height-.02]}/><meshBasicMaterial color={kind==='selected'?'#f0a53c':'#ffd88a'} transparent opacity={kind==='selected'?.26:.2} depthWrite={false}/></mesh>)}</>;
}

const Swatch=({finish}:{finish:StudioFinish})=><i className={`paint-rule-swatch${finish.texture?` studio-material-sample is-${finish.texture}`:''}`} style={{backgroundColor:finish.color}}/>;
const ONLY:[string,PaintRuleFloors|undefined][]=[['All floors',undefined],['Ground','ground'],['Upper','upper'],['Top','top']];
const sameFloors=(a:PaintRuleFloors|undefined,b:PaintRuleFloors|undefined)=>JSON.stringify(a)===JSON.stringify(b);

function RuleEditor({recipe,rule,commit,finish,floor}:{recipe:StudioRecipe;rule:StudioPaintRule;commit:(r:StudioRecipe)=>void;finish:StudioFinish;floor:number}){
 const patch=(p:Partial<Omit<StudioPaintRule,'id'>>)=>commit(updatePaintRule(recipe,rule.id,p));
 const num=(v:string,lo:number,hi:number)=>{const n=Number(v);return Number.isFinite(n)?Math.round(Math.max(lo,Math.min(hi,n))*100)/100:null;};
 return <div className="paint-rule-editor" aria-label="Edit paint rule">
  <div className="paint-rule-row">
   <button onClick={()=>patch({finish:{...finish}})} title="Paint this rule with the current colour and material"><PaintBucket size={14}/> Use current finish</button>
   <span className="studio-segment" aria-label="Rule channel">{(['wall','trim'] as const).map(c=><button key={c} aria-pressed={rule.channel===c} onClick={()=>patch({channel:c})}>{c}</button>)}</span>
  </div>
  {rule.kind==='floors'&&<div className="paint-rule-row"><span>Storeys</span>{([['Ground','ground'],['Upper','upper'],['Top','top'],[`Storey ${storeyName(floor)}`,{from:floor,to:floor}]] as [string,PaintRuleFloors][]).map(([label,f])=><button key={label} aria-pressed={sameFloors(rule.floors,f)} onClick={()=>patch({floors:f})}>{label}</button>)}</div>}
  {rule.kind==='band'&&rule.band&&<div className="paint-rule-row">
   <label>Height <input type="number" aria-label="Band height" min={.05} max={10} step={.05} value={rule.band.height} onChange={e=>{const h=num(e.target.value,.05,10);if(h!==null)patch({band:{...rule.band!,height:h}});}}/> m</label>
   <label>{rule.band.at==='top'?'Below top':rule.band.at==='storeys'?'Offset':'Lift'} <input type="number" aria-label="Band offset" min={-5} max={30} step={.05} value={rule.band.offset} onChange={e=>{const o=num(e.target.value,-5,30);if(o!==null)patch({band:{...rule.band!,offset:o}});}}/> m</label>
   {rule.band.at==='floor'&&<small>above storey {storeyName(rule.band.floor!)}</small>}
  </div>}
  {rule.kind==='quoins'&&rule.quoins&&<div className="paint-rule-row">
   <label>Width <input type="range" aria-label="Quoin width" min={.2} max={1.5} step={.05} value={rule.quoins.width} onChange={e=>patch({quoins:{...rule.quoins!,width:Number(e.target.value)}})}/><output>{rule.quoins.width.toFixed(2)} m</output></label>
   <button aria-pressed={!!rule.quoins.course} onClick={()=>patch({quoins:rule.quoins!.course?{width:rule.quoins!.width}:{...rule.quoins!,course:.45}})}>Long and short stones</button>
  </div>}
  {rule.kind==='alternate'&&rule.alternate&&<div className="paint-rule-row"><span>Columns</span>{([[1,'1st, 3rd…'],[0,'2nd, 4th…']] as const).map(([phase,label])=><button key={phase} aria-pressed={rule.alternate!.phase===phase} onClick={()=>patch({alternate:{phase}})}>{label}</button>)}</div>}
  {rule.kind!=='floors'&&<div className="paint-rule-row"><span>Only on</span>{ONLY.map(([label,f])=><button key={label} aria-pressed={sameFloors(rule.floors,f)} onClick={()=>patch({floors:f})}>{label}</button>)}</div>}
 </div>;
}

export function CityPaintRulesPanel({recipe,commit,state,partName,finish,channel,floor,setIssue}:{recipe:StudioRecipe;commit:(r:StudioRecipe)=>void;state:PaintRulesState;partName:(id:string)=>string;finish:StudioFinish;channel:string;floor:number;setIssue:(m:string)=>void}){
 const rules=recipe.studio.paintRules??[],[dragId,setDragId]=useState<string|null>(null);
 if(!state.open)return <div className="paint-rules is-closed"><button className="paint-rules-toggle" aria-expanded={false} onClick={()=>state.setOpen(true)} title="Paint whole storeys, plinths, string courses and corners on every generated wall in a scope">Paint rules{rules.length?` · ${rules.length}`:''}</button></div>;
 const add=(id:string)=>{const preset=PAINT_RULE_PRESETS.find(p=>p.id===id)!,scope=state.rule?(state.rule.scope??undefined):state.scope();
  if(scope===null){setIssue(state.hint||'Pick a target first.');return;}if(rules.length>=PAINT_RULES.limit){setIssue('This building has reached its paint-rule limit.');return;}
  commit(addPaintRule(recipe,{...preset.rule,channel:channel==='trim'?'trim':'wall',finish:{...finish},...(scope?{scope}:{})}));setIssue('');};
 const drop=(e:DragEvent,index:number)=>{e.preventDefault();if(dragId)commit(reorderPaintRule(recipe,dragId,index));setDragId(null);};
 const t=state.targets;
 return <div className="paint-rules is-open" role="group" aria-label="Paint rules">
  <div className="paint-rules-side">
   <div className="paint-rules-head"><strong>Paint rules</strong><button aria-label="Close paint rules" onClick={()=>state.setOpen(false)}><X size={12}/></button></div>
   <span className="studio-caption">{state.rule?'Rule applies to':'Apply to'}</span>
   <div className="rhythm-scopes" role="radiogroup" aria-label="Paint rules apply to">{SCOPES.map(([id,label])=><button key={id} role="radio" aria-checked={state.kind===id} onClick={()=>state.setKind(id)}>{label}</button>)}</div>
   {state.kind!=='building'&&<div className="rhythm-targets">{(state.kind==='parts'?t.parts.map(p=>({key:p,label:partName(p),remove:()=>state.writeTargets(t.parts.filter(x=>x!==p),t.walls)})):t.walls.map(w=>({key:`${w.partId}/${w.side}`,label:wallName(w,partName),remove:()=>state.writeTargets(t.parts,t.walls.filter(x=>!sameWall(x,w)))}))).map(c=><span key={c.key}>{c.label}<button aria-label={`Remove ${c.label}`} onClick={c.remove}><X size={10}/></button></span>)}
    {!(state.kind==='parts'?t.parts:t.walls).length&&<small>{state.hint}</small>}</div>}
   <span className="studio-caption">Add with current finish</span>
   <div className="paint-rule-presets">{PAINT_RULE_PRESETS.map(p=><button key={p.id} title={p.blurb} aria-label={`Add ${p.label} rule`} onClick={()=>add(p.id)}><PresetIcon id={p.id}/><span>{p.label}</span></button>)}</div>
  </div>
  <div className="paint-rules-main">
   {rules.length?<ol className="paint-rule-list" aria-label="Active paint rules">{rules.map((r,i)=><li key={r.id} draggable onDragStart={()=>setDragId(r.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,i)} className={`${state.rule?.id===r.id?'is-selected':''}${dragId===r.id?' is-dragging':''}`}>
     <DotsSixVertical className="paint-rule-grip" size={13} aria-hidden="true"/>
     <button className="paint-rule-pick" aria-pressed={state.rule?.id===r.id} title="Edit this rule" onClick={()=>state.select(state.rule?.id===r.id?null:r.id)}><Swatch finish={r.finish}/><strong>{paintRuleLabel(r)}</strong><small>{paintRuleScopeLabel(r,partName)}{r.channel==='trim'?' · trim':''}</small></button>
     <button aria-label={`Move ${paintRuleLabel(r)} up`} disabled={!i} onClick={()=>commit(movePaintRule(recipe,r.id,-1))}><ArrowUp size={11}/></button>
     <button aria-label={`Move ${paintRuleLabel(r)} down`} disabled={i===rules.length-1} onClick={()=>commit(movePaintRule(recipe,r.id,1))}><ArrowDown size={11}/></button>
     <button aria-label={`Remove rule ${paintRuleLabel(r)}`} onClick={()=>{if(state.rule?.id===r.id)state.select(null);commit(removePaintRule(recipe,r.id));}}><Trash size={11}/></button>
    </li>)}</ol>:<p className="paint-rules-empty">Rules paint every generated wall in the scope and follow resizing. Storey fills go first, then bands and quoins; wall rules beat part rules, which beat building rules; later rules win. Brush strokes always paint on top. Shift-drag a band to run it around the building.</p>}
   {state.rule&&<RuleEditor recipe={recipe} rule={state.rule} commit={commit} finish={finish} floor={floor}/>}
  </div>
 </div>;
}

function PresetIcon({id}:{id:string}){
 const fill=(y:number,h:number,x=-14,w=28)=><rect x={x} y={y} width={w} height={h} className="paint-rule-icon-fill"/>;
 return <svg viewBox="-18 -18 36 36" className="paint-rule-icon" aria-hidden="true"><rect x="-14" y="-15" width="28" height="30" rx="1.5"/>
  {id==='plinth'&&fill(10,5)}{id==='ground'&&fill(5,10)}{id==='upper'&&fill(-15,20)}{id==='top'&&fill(-15,10)}{id==='frieze'&&fill(-15,4)}
  {id==='courses'&&<>{fill(-6,2)}{fill(4,2)}</>}
  {id==='quoins'&&[0,1,2,3,4,5].map(k=><g key={k}>{fill(-15+k*5,5,-14,k%2?4:6)}{fill(-15+k*5,5,k%2?10:8,k%2?4:6)}</g>)}
  {id==='alternate'&&<>{fill(-15,30,-14,7)}{fill(-15,30,0,7)}</>}
 </svg>;
}
