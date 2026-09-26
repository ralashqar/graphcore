// Paint rules: declarative paint for generated walls, resolved per face at resolve time (never stored per face).
// A rule paints one finish on the wall or trim channel of every face in its scope:
//  floors     whole storeys: 'ground' (building floor 0), 'upper' (floor 1 and above), 'top' (the part's top storey) or a floor range
//  band       a horizontal band: above the part base (plinth), at every storey line of the face (string courses),
//             below the top of the wall (frieze), or at an offset above one building floor (follows storey heights)
//  quoins     vertical strips at both ends of straight walls, optionally in alternating long/short courses
//  alternate  every other opening column (columns come from the face's resolved opening groups: rhythm or manual)
// Any rule may also carry `floors` to limit it to those storeys (e.g. quoins on upper floors only).
//
// Recipe: studio.paintRules?: StudioPaintRule[] (local plots only; business/profile validators reject it).
// Precedence on a face, bottom to top: part finish < rules (fills < accents; then building < parts < walls; then
// list order) < legacy tile paint < studio.paintRegions (hand strokes always win). See docs/city-paint-rules.md.
import type {StudioFinish,StudioRecipe} from './cityStudioTypes.ts';
import type {FacePaintLayer} from './cityStudioPaintGeometry.ts';
import type {FreeRect} from './cityStudioFreeOpenings.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';
import {sculptFloorBottom,sculptFloorTop,validSculptSide} from './citySculpt.ts';
import {validPaintFinish} from './cityStudioPaintRegions.ts';

export type PaintRuleWall={partId:string;side:string};
/** No scope = whole building; otherwise exactly one of `parts` or `walls`. */
export type PaintRuleScope={parts?:string[];walls?:PaintRuleWall[]};
export type PaintRuleFloors='ground'|'upper'|'top'|{from:number;to:number};
/** Metres. base: y0 = offset above the part base. storeys: y0 = each storey line + offset. top: y1 = wall top - offset. floor: y0 = bottom of `floor` + offset. */
export type PaintRuleBand={at:'base'|'storeys'|'top'|'floor';offset:number;height:number;floor?:number};
export type PaintRuleKind='floors'|'band'|'quoins'|'alternate';
export type StudioPaintRule={id:string;kind:PaintRuleKind;scope?:PaintRuleScope;channel:'wall'|'trim';finish:StudioFinish;floors?:PaintRuleFloors;band?:PaintRuleBand;quoins?:{width:number;course?:number};alternate?:{phase:0|1}};
export const PAINT_RULES={limit:24,targets:32,maxFloor:39} as const;

const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const floorIndex=(n:unknown)=>Number.isInteger(n)&&(n as number)>=0&&(n as number)<=PAINT_RULES.maxFloor;
const only=(o:object,keys:string[])=>Object.keys(o).every(k=>keys.includes(k));
const validId=(s:unknown)=>typeof s==='string'&&!!s&&s.length<=100;

function ruleError(r:StudioPaintRule):string|null{
 const bad='A paint rule is invalid.';
 if(!r||typeof r!=='object'||!validId(r.id)||!['floors','band','quoins','alternate'].includes(r.kind)||!['wall','trim'].includes(r.channel)||!validPaintFinish(r.finish))return bad;
 if(!only(r,['id','kind','scope','channel','finish','floors','band','quoins','alternate'])||!only(r.finish,['color','texture']))return bad;
 if(r.scope!==undefined){const s=r.scope;if(!s||typeof s!=='object'||!only(s,['parts','walls'])||(s.parts===undefined)===(s.walls===undefined))return 'A paint rule has an invalid scope.';
  const list=(s.parts??s.walls) as unknown[];if(!Array.isArray(list)||!list.length||list.length>PAINT_RULES.targets)return 'A paint rule has an invalid scope.';
  if(s.parts&&s.parts.some(p=>!validId(p)))return 'A paint rule has an invalid scope.';
  if(s.walls&&s.walls.some(w=>!w||typeof w!=='object'||!only(w,['partId','side'])||!validId(w.partId)||!validSculptSide(w.side)))return 'A paint rule has an invalid scope.';}
 if(r.floors!==undefined){const f=r.floors;if(typeof f==='string'?!['ground','upper','top'].includes(f):!f||typeof f!=='object'||!only(f,['from','to'])||!floorIndex(f.from)||!floorIndex(f.to)||f.from>f.to)return 'A paint rule has an invalid floor range.';}
 if(r.band!==undefined){const b=r.band;if(!b||typeof b!=='object'||!only(b,['at','offset','height','floor'])||!['base','storeys','top','floor'].includes(b.at)||!finite(b.offset)||b.offset<-50||b.offset>100||!finite(b.height)||b.height<.02||b.height>60||(b.at==='floor'?!floorIndex(b.floor):b.floor!==undefined))return 'A paint band rule is invalid.';}
 if(r.quoins!==undefined){const q=r.quoins;if(!q||typeof q!=='object'||!only(q,['width','course'])||!finite(q.width)||q.width<.1||q.width>3||q.course!==undefined&&(!finite(q.course)||q.course<.2||q.course>3))return 'A quoin rule is invalid.';}
 if(r.alternate!==undefined){const a=r.alternate;if(!a||typeof a!=='object'||!only(a,['phase'])||(a.phase!==0&&a.phase!==1))return 'An alternating paint rule is invalid.';}
 // Each kind carries exactly its own settings (plus optional floors).
 const need={floors:'floors',band:'band',quoins:'quoins',alternate:'alternate'}[r.kind] as keyof StudioPaintRule;
 if(r[need]===undefined||(['band','quoins','alternate'] as const).some(k=>k!==need&&r[k]!==undefined))return bad;
 return null;
}
export function validatePaintRules(list:unknown):string|null{
 if(list===undefined)return null;
 if(!Array.isArray(list)||list.length>PAINT_RULES.limit)return 'Too many paint rules.';
 const ids=new Set<string>();
 for(const r of list as StudioPaintRule[]){const e=ruleError(r);if(e)return e;if(ids.has(r.id))return 'A paint rule is invalid.';ids.add(r.id);}
 return null;
}

/** What a face needs for rule resolution, all in face metres (y above the part base). */
export type PaintRuleFace={shapeId:string;side:string;length:number;height:number;
 /** Storeys of the face's part, bottom to top (building floor index). */storeys:{floor:number;y0:number;y1:number}[];
 /** Face y of the bottom of any building floor (for floor-anchored bands). */floorY:(floor:number)=>number;
 /** Opening column boundaries across [0,length] (>= 2 columns), or absent. */columns?:number[];
 /** Curved ring faces have no corners (quoins skip them). */closed?:boolean};

export const paintRuleSpecificity=(r:Pick<StudioPaintRule,'scope'>)=>r.scope?.walls?2:r.scope?.parts?1:0;
export const paintRuleApplies=(r:Pick<StudioPaintRule,'scope'>,shapeId:string,side:string)=>r.scope?.walls?r.scope.walls.some(w=>w.partId===shapeId&&w.side===side):r.scope?.parts?r.scope.parts.includes(shapeId):true;
/** Fills (whole storeys, alternate bays) paint below accents (bands, quoins), so a building plinth stays visible over a part's own ground-floor finish. */
export const paintRuleTier=(r:Pick<StudioPaintRule,'kind'>)=>r.kind==='floors'||r.kind==='alternate'?0:1;
/** Rules in resolve order: fills before accents; within a tier building, then parts, then walls; list order within a class (later wins). */
export const orderedPaintRules=(rules:readonly StudioPaintRule[]|undefined)=>(rules??[]).map((r,i)=>({r,i})).sort((a,b)=>paintRuleTier(a.r)-paintRuleTier(b.r)||paintRuleSpecificity(a.r)-paintRuleSpecificity(b.r)||a.i-b.i).map(x=>x.r);

function storeySpans(f:PaintRuleFace,floors:PaintRuleFloors):[number,number][]{
 const top=f.storeys.at(-1)?.floor;
 const pick=f.storeys.filter(s=>floors==='ground'?s.floor===0:floors==='upper'?s.floor>=1:floors==='top'?s.floor===top:s.floor>=floors.from&&s.floor<=floors.to);
 const out:[number,number][]=[];for(const s of pick){const last=out.at(-1);if(last&&Math.abs(last[1]-s.y0)<.05)last[1]=s.y1;else out.push([s.y0,s.y1]);}
 return out;
}

/** Face rectangles one rule paints on one face (before clipping to the face). */
export function paintRuleRects(rule:StudioPaintRule,f:PaintRuleFace):FreeRect[]{
 const L=f.length,H=f.height;let rects:FreeRect[]=[];
 if(rule.kind==='floors')return rule.floors?storeySpans(f,rule.floors).map(([y0,y1])=>[0,L,y0,y1]):[];
 if(rule.kind==='band'&&rule.band){const b=rule.band;
  if(b.at==='base')rects=[[0,L,b.offset,b.offset+b.height]];
  else if(b.at==='top')rects=[[0,L,H-b.offset-b.height,H-b.offset]];
  else if(b.at==='floor')rects=[[0,L,f.floorY(b.floor!)+b.offset,f.floorY(b.floor!)+b.offset+b.height]];
  else rects=f.storeys.slice(1).map(s=>[0,L,s.y0+b.offset,s.y0+b.offset+b.height]);
 }else if(rule.kind==='quoins'&&rule.quoins&&!f.closed){const {width,course}=rule.quoins,w=Math.min(width,L/2);
  if(!course)rects=[[0,w,0,H],[L-w,L,0,H]];
  else for(let k=0,y=0;y<H-1e-6&&k<400;k++,y+=course){const wk=k%2?w*.6:w;rects.push([0,wk,y,Math.min(H,y+course)],[L-wk,L,y,Math.min(H,y+course)]);}
 }else if(rule.kind==='alternate'&&rule.alternate&&f.columns&&f.columns.length>=3){const c=f.columns;
  for(let k=rule.alternate.phase?0:1;k+1<c.length;k+=2)rects.push([c[k],c[k+1],0,H]);
 }
 if(rule.floors){const spans=storeySpans(f,rule.floors);rects=rects.flatMap(q=>spans.map(([y0,y1])=>[q[0],q[1],Math.max(q[2],y0),Math.min(q[3],y1)] as FreeRect)).filter(q=>q[3]-q[2]>1e-3);}
 return rects.filter(q=>q[1]-q[0]>1e-3&&q[3]-q[2]>1e-3&&q[3]>0&&q[2]<H);
}

/** Paint layers (bottom to top) the rules contribute to one face. */
export function paintRuleLayers(rules:readonly StudioPaintRule[]|undefined,f:PaintRuleFace):{wall:FacePaintLayer[];trim:FacePaintLayer[]}{
 const out={wall:[] as FacePaintLayer[],trim:[] as FacePaintLayer[]};
 for(const r of orderedPaintRules(rules)){if(!paintRuleApplies(r,f.shapeId,f.side))continue;const rects=paintRuleRects(r,f);if(rects.length)out[r.channel].push({finish:r.finish,rects});}
 return out;
}

/** Column boundaries from resolved opening groups (centres clustered within 0.35 m, split at midpoints). */
export function paintRuleColumns(length:number,groups:readonly {x0:number;x1:number}[]):number[]|undefined{
 const centres=[...groups.map(g=>(g.x0+g.x1)/2)].sort((a,b)=>a-b),cols:number[]=[];
 for(const c of centres){if(cols.length&&c-cols[cols.length-1]<.35)continue;cols.push(c);}
 if(cols.length<2)return undefined;
 return [0,...cols.slice(1).map((c,i)=>(c+cols[i])/2),length];
}

/** Rule context of a generated face from its part, the storey heights and its opening groups. */
export function paintRuleFace(r:StudioRecipe,d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>,shapeId:string,side:string,frame:{length:number;height:number;base:number;curve?:unknown},groups:readonly {x0:number;x1:number}[]=[]):PaintRuleFace|undefined{
 if(!r.studio.paintRules?.length)return undefined;
 const v=r.volumes.find(x=>x.id===shapeId);if(!v)return undefined;
 const storeys=Array.from({length:v.spanFloors},(_,i)=>{const floor=v.startFloor+i;return {floor,y0:sculptFloorBottom(floor,d.groundHeight,d.upperHeight)-frame.base,y1:sculptFloorTop(floor,d.groundHeight,d.upperHeight)-frame.base};});
 return {shapeId,side,length:frame.length,height:frame.height,storeys,floorY:f=>sculptFloorBottom(f,d.groundHeight,d.upperHeight)-frame.base,columns:paintRuleColumns(frame.length,groups),closed:!!frame.curve};
}

// ---------- Recipe edits (one undo step each) ----------
const withRules=(r:StudioRecipe,list:StudioPaintRule[]):StudioRecipe=>{const studio:StudioRecipe['studio']={...r.studio,paintRules:list};if(!list.length)delete studio.paintRules;return {...r,studio};};
export function addPaintRule(r:StudioRecipe,rule:Omit<StudioPaintRule,'id'>&{id?:string}):StudioRecipe{
 const list=r.studio.paintRules??[];if(list.length>=PAINT_RULES.limit)return r;
 return withRules(r,[...list,{...rule,id:rule.id??globalThis.crypto.randomUUID()} as StudioPaintRule]);
}
export function updatePaintRule(r:StudioRecipe,id:string,patch:Partial<Omit<StudioPaintRule,'id'>>):StudioRecipe{
 const list=r.studio.paintRules??[];if(!list.some(x=>x.id===id))return r;
 return withRules(r,list.map(x=>{if(x.id!==id)return x;const next={...x,...patch};for(const k of Object.keys(patch) as (keyof typeof patch)[])if(patch[k]===undefined)delete next[k];return next;}));
}
export const removePaintRule=(r:StudioRecipe,id:string)=>(r.studio.paintRules??[]).some(x=>x.id===id)?withRules(r,(r.studio.paintRules??[]).filter(x=>x.id!==id)):r;
/** Moves a rule up (-1) or down (+1) in the list; later rules paint over earlier ones of the same scope class. */
export function movePaintRule(r:StudioRecipe,id:string,delta:number):StudioRecipe{
 const list=[...(r.studio.paintRules??[])],i=list.findIndex(x=>x.id===id),j=i+delta;if(i<0||j<0||j>=list.length)return r;
 [list[i],list[j]]=[list[j],list[i]];return withRules(r,list);
}
/** Drag-to-reorder: moves a rule to another index. */
export function reorderPaintRule(r:StudioRecipe,id:string,to:number):StudioRecipe{
 const list=[...(r.studio.paintRules??[])],i=list.findIndex(x=>x.id===id);if(i<0)return r;const k=Math.max(0,Math.min(list.length-1,to));if(k===i)return r;
 const [item]=list.splice(i,1);list.splice(k,0,item);return withRules(r,list);
}

export type PaintRulePreset={id:string;label:string;blurb:string;rule:Pick<StudioPaintRule,'kind'|'channel'|'floors'|'band'|'quoins'|'alternate'>};
export const PAINT_RULE_PRESETS:readonly PaintRulePreset[]=[
 {id:'plinth',label:'Plinth',blurb:'0.9 m band along the foot of the walls',rule:{kind:'band',channel:'wall',band:{at:'base',offset:0,height:.9}}},
 {id:'ground',label:'Ground floor',blurb:'The whole street storey',rule:{kind:'floors',channel:'wall',floors:'ground'}},
 {id:'upper',label:'Upper floors',blurb:'Every storey above the ground floor',rule:{kind:'floors',channel:'wall',floors:'upper'}},
 {id:'top',label:'Top floor',blurb:'The top storey of each part',rule:{kind:'floors',channel:'wall',floors:'top'}},
 {id:'courses',label:'String courses',blurb:'A 0.25 m band at every storey line',rule:{kind:'band',channel:'wall',band:{at:'storeys',offset:-.125,height:.25}}},
 {id:'quoins',label:'Corner quoins',blurb:'Alternating stones at the corners of straight walls',rule:{kind:'quoins',channel:'wall',quoins:{width:.7,course:.45}}},
 {id:'frieze',label:'Frieze',blurb:'A band just under the top of the walls',rule:{kind:'band',channel:'wall',band:{at:'top',offset:0,height:.6}}},
 {id:'alternate',label:'Alternate bays',blurb:'Every other opening column',rule:{kind:'alternate',channel:'wall',alternate:{phase:1}}},
];
export const presetOfRule=(r:StudioPaintRule)=>PAINT_RULE_PRESETS.find(p=>p.rule.kind===r.kind&&JSON.stringify([p.rule.floors,p.rule.band?.at,p.rule.quoins?!!p.rule.quoins.course:undefined])===JSON.stringify([r.floors,r.band?.at,r.quoins?!!r.quoins.course:undefined]))??null;

/** Storey names match the storey rail: G, 2, 3… */
export const storeyName=(f:number)=>f===0?'G':String(f+1);
const floorsLabel=(f:PaintRuleFloors)=>typeof f==='string'?({ground:'ground floor',upper:'upper floors',top:'top floor'} as const)[f]:f.from===f.to?(f.from===0?'ground floor':`floor ${f.from+1}`):`floors ${storeyName(f.from)}–${storeyName(f.to)}`;
export function paintRuleLabel(r:StudioPaintRule):string{
 const band=r.band;
 const what=r.kind==='floors'?floorsLabel(r.floors!).replace(/^./,c=>c.toUpperCase())
  :r.kind==='band'&&band?(band.at==='base'?(band.offset<=.01&&band.height<=1.5?'Plinth':'Band'):band.at==='storeys'?'String courses':band.at==='top'?'Frieze':band.floor===0?'Band on the ground floor':`Band on floor ${band.floor!+1}`)+` · ${band.height.toFixed(2).replace(/\.?0+$/,'')} m`
  :r.kind==='quoins'?'Corner quoins':'Alternate bays';
 return r.floors&&r.kind!=='floors'?`${what} · ${floorsLabel(r.floors)}`:what;
}
export function paintRuleScopeLabel(r:Pick<StudioPaintRule,'scope'>,partName:(id:string)=>string=id=>id):string{
 if(r.scope?.walls)return r.scope.walls.length===1?`${partName(r.scope.walls[0].partId)} · ${r.scope.walls[0].side==='curve'?'round wall':`${r.scope.walls[0].side} wall`}`:`${r.scope.walls.length} walls`;
 if(r.scope?.parts)return r.scope.parts.length===1?partName(r.scope.parts[0]):`${r.scope.parts.length} parts`;
 return 'Whole building';
}

/**
 * "Around the building" band from a drag on one face: the band is stored against the building floor it
 * starts in (offset from that floor's bottom), so it follows storey-height changes and lines up on every part.
 */
export function aroundBandRule(d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>,y0:number,y1:number,channel:'wall'|'trim',finish:StudioFinish,scope?:PaintRuleScope):Omit<StudioPaintRule,'id'>|null{
 const lo=Math.min(y0,y1),hi=Math.max(y0,y1);if(hi-lo<.05)return null;
 let floor=0;while(floor<PAINT_RULES.maxFloor&&sculptFloorTop(floor,d.groundHeight,d.upperHeight)<=lo+1e-6)floor++;
 const offset=Math.round((lo-sculptFloorBottom(floor,d.groundHeight,d.upperHeight))*100)/100,height=Math.round((hi-lo)*100)/100;
 return {kind:'band',channel,finish,band:{at:'floor',floor,offset:Math.max(-50,offset),height:Math.max(.05,Math.min(60,height))},...(scope?{scope}:{})};
}
