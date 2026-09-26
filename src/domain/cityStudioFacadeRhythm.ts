/**
 * Facade rhythm generator (local studio only): "generated openings" instead of kit tiles.
 *
 * Recipe: optional `studio.facadeRhythm` (local plots only; business/profile validators reject it):
 *  {version:1, seed, style, density?, variety?, trims?, manual?, locks?, layerSeeds?, rules?}
 *   style      townhouse | shopfront | civic | cottage | warehouse | loft (see RHYTHM_STYLES)
 *   density    0..1 (default .5): narrower bays / more openings as it rises
 *   variety    0..1 (default .35): how far columns and storeys stray from the style's base shape
 *   trims      none | simple | rich (default simple): generated trim parts per opening
 *   manual     own (default): a face with any manual free/kit opening is left entirely to the user;
 *              fill: generated openings stay around manual free openings that they do not touch
 *   locks      layers kept on shuffle: ground | upper | attic | trims
 *   layerSeeds per-layer shuffle counters (shuffle bumps unlocked ones)
 *   rules      scoped overrides {partId?, side?, style?, seed?, density?, variety?, trims?, off?, layerSeeds?};
 *              precedence building < side-only < part < part+side
 *
 * Expansion is pure and deterministic: expandFacadeRhythm(recipe,design,bays) lays columns from each
 * straight part face's length and storey heights (never absolute positions), so resizing a part
 * re-lays its facade. Generated ids start with `generated/rhythm/` and never enter the saved recipe;
 * resolveStudio merges them with the manual free openings/trims before the free faces are built, so
 * faces owned by generated openings suppress kit tiles exactly like manual ones. The merged trim list
 * is exposed as StudioResolved.freeTrims.
 *
 * UI API
 *  RHYTHM_STYLES / RHYTHM_LAYERS                        catalogue for the picker (id, label, blurb)
 *  newFacadeRhythm(style?,seed?) -> FacadeRhythm
 *  setFacadeRhythm(recipe,patch|null) -> recipe         style/density/variety/trims/manual; null removes
 *  setFacadeRhythmRule(recipe,{partId?,side?},patch|null) -> recipe   per-part/per-face override (null clears)
 *  toggleFacadeRhythmLock(recipe,layer) -> recipe
 *  shuffleFacadeRhythm(rhythm,target?) -> rhythm        dice; target {partId?,side?} reshuffles one scope
 *  facadeRhythmFaces(recipe,design,bays?) -> face summaries (generated/manual/off/hidden) for highlighting
 *  materializeFacadeRhythm(recipe,design,face?) -> {recipe,ids}|{reason}
 *     converts generated openings (+ trims) of one face (or all, which also removes the rhythm) into
 *     manual free openings so they can be edited one by one. Call it for a face before placing a manual
 *     free opening there when manual:'own', otherwise the face's generated openings disappear.
 */
import {FREE_OPENING,faceU,isFrame,studioFaceFrame,validateFreeOpenings,type FreeOpeningShape,type FreeOpeningStyle,type StudioFaceFrame,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {FREE_TRIM_KINDS,validateFreeTrims,type StudioFreeTrim,type TrimKind} from './cityStudioTrimParts.ts';
import {sculptFloorBottom,validSculptSide,type SculptWallSide} from './citySculpt.ts';
import {studioBays} from './cityStudio.ts';
import {expandBuildingVariation} from './cityBuildingVariation.ts';
import type {StudioBay,StudioRecipe} from './cityStudioTypes.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';

export const RHYTHM_STYLE_IDS=['townhouse','shopfront','civic','cottage','warehouse','loft'] as const;
export const RHYTHM_LAYERS=['ground','upper','attic','trims'] as const;
export type RhythmStyle=typeof RHYTHM_STYLE_IDS[number];
export type RhythmLayer=typeof RHYTHM_LAYERS[number];
export type RhythmTrims='none'|'simple'|'rich';
export type FacadeRhythmRule={partId?:string;side?:SculptWallSide;style?:RhythmStyle;seed?:number;density?:number;variety?:number;trims?:RhythmTrims;off?:boolean;layerSeeds?:Partial<Record<RhythmLayer,number>>};
export type FacadeRhythm={version:1;seed:number;style:RhythmStyle;density?:number;variety?:number;trims?:RhythmTrims;manual?:'own'|'fill';locks?:RhythmLayer[];layerSeeds?:Partial<Record<RhythmLayer,number>>;rules?:FacadeRhythmRule[]};
export type RhythmFace={shapeId:string;side:SculptWallSide;status:'generated'|'manual'|'off'|'hidden'|'narrow';style:RhythmStyle;columns:number;street:boolean;door:boolean;openings:number};
export type RhythmExpansion={freeOpenings:StudioFreeOpening[];freeTrims:StudioFreeTrim[];inactive:{id:string;reason:string}[];faces:RhythmFace[]};

type Role='door'|'ground'|'side'|'piano'|'upper'|'attic';
/** One column treatment: panel width/height, sill above the storey floor, head clearance below its ceiling. */
type Slot={shape:FreeOpeningShape;w:number;h:number;sill:number;head?:number;panels?:number;alt?:FreeOpeningShape[];style?:FreeOpeningStyle;glazing?:boolean;fill?:boolean};
type Spec={label:string;blurb:string;bay:number;corner:number;pier:number;symmetric:boolean;style:FreeOpeningStyle;
 door:Slot&{at:number[];second?:number};ground:Slot&{kind:'windows'|'shop'|'arcade'};side:Slot;piano?:Slot;upper:Slot&{blind?:number;single?:Slot};attic?:Slot;
 trims:Record<'simple'|'rich',Partial<Record<Role,TrimKind[][]>>>};
/** Style catalogue. Heights clamp to the storey; widths clamp to the column pitch minus the pier. */
export const RHYTHM_SPECS:Record<RhythmStyle,Spec>={
 townhouse:{label:'Townhouse',blurb:'Symmetric bays, centred arched door, tall piano-nobile windows, small attic lights.',bay:2.3,corner:.75,pier:.9,symmetric:true,style:'painted',
  door:{shape:'arch',w:1.3,h:2.7,sill:0,style:'timber',at:[.5]},ground:{kind:'windows',shape:'rect',w:1.1,h:1.9,sill:.85,alt:['arch']},side:{shape:'rect',w:1,h:1.6,sill:.95},
  piano:{shape:'rect',w:1.1,h:2.5,sill:.3,head:.5,alt:['arch']},upper:{shape:'rect',w:1,h:1.65,sill:.8,alt:['arch']},attic:{shape:'rect',w:.9,h:1.05,sill:.95,alt:['round']},
  trims:{simple:{door:[['canopy']],ground:[['lintel','keystone']],piano:[['lintel','keystone']],upper:[['lintel','keystone']]},
   rich:{door:[['canopy','lamps']],ground:[['lintel','keystone','sill-brackets']],piano:[['hood','keystone','window-box'],['lintel','keystone','window-box']],upper:[['shutters','lintel','keystone'],['lintel','keystone','sill-brackets']],attic:[['sill-brackets']]}}},
 shopfront:{label:'Shopfront',blurb:'Wide glazed shop windows and glazed doors below, paired sashes above.',bay:2.7,corner:.55,pier:.6,symmetric:false,style:'painted',
  door:{shape:'rect',w:1.2,h:2.55,sill:0,style:'painted',glazing:true,at:[0,1,.5],second:6},ground:{kind:'shop',shape:'rect',w:3.2,h:3,sill:.5,head:.45,fill:true,alt:['arch']},side:{shape:'rect',w:1,h:1.6,sill:.95},
  upper:{shape:'rect',w:.62,h:1.7,sill:.75,panels:2,alt:['arch'],single:{shape:'rect',w:1.1,h:1.7,sill:.75,alt:['arch']}},
  trims:{simple:{door:[['canopy']],upper:[['lintel','keystone']]},rich:{door:[['canopy','lamps']],ground:[['lintel']],upper:[['window-box','lintel','keystone'],['shutters','keystone']]}}},
 civic:{label:'Civic',blurb:'Stone arcade on the street, grand centre door, tall arched hall windows, round oculi.',bay:3.1,corner:1,pier:.9,symmetric:true,style:'stone',
  door:{shape:'arch',w:1.8,h:3.4,sill:0,head:.35,style:'timber',at:[.5]},ground:{kind:'arcade',shape:'arch',w:1.7,h:3.2,sill:0,head:.4,style:'stone',glazing:true,alt:['pointed']},side:{shape:'arch',w:1.2,h:2,sill:.9,alt:['pointed']},
  piano:{shape:'arch',w:1.3,h:2.9,sill:.4,head:.45,alt:['pointed']},upper:{shape:'arch',w:1.15,h:1.9,sill:.8,alt:['rect']},attic:{shape:'round',w:.95,h:.95,sill:1,alt:['round']},
  trims:{simple:{door:[['lamps','keystone']],ground:[['keystone']],side:[['keystone']],piano:[['keystone']],upper:[['keystone','lintel']]},
   rich:{door:[['lamps','keystone']],ground:[['keystone']],side:[['keystone','sill-brackets']],piano:[['keystone','window-box']],upper:[['keystone','sill-brackets','lintel']]}}},
 cottage:{label:'Cottage',blurb:'Few small shuttered windows, an off-centre door, the odd blind bay and round light.',bay:2.9,corner:.8,pier:1.2,symmetric:false,style:'painted',
  door:{shape:'arch',w:1.05,h:2.25,sill:0,head:.5,style:'timber',at:[.3,.7,.5]},ground:{kind:'windows',shape:'rect',w:1,h:1.2,sill:1,alt:['arch']},side:{shape:'rect',w:.9,h:1.1,sill:1.05,alt:['round']},
  upper:{shape:'rect',w:.9,h:1.15,sill:.95,blind:.35,alt:['round','arch']},attic:{shape:'round',w:.75,h:.75,sill:1,alt:['rect']},
  trims:{simple:{door:[['lamps']],ground:[['shutters']],side:[['shutters']],upper:[['shutters']]},
   rich:{door:[['canopy','lamps']],ground:[['shutters','sill-brackets']],side:[['shutters']],upper:[['shutters','window-box'],['window-box']]}}},
 warehouse:{label:'Warehouse',blurb:'Broad bays, arched carriage doors, mullioned arched pairs, stone round-heads.',bay:3.6,corner:.9,pier:.9,symmetric:false,style:'stone',
  door:{shape:'arch',w:2.5,h:3.4,sill:0,head:.4,style:'timber',at:[0,1,.5],second:4},ground:{kind:'windows',shape:'arch',w:2,h:2,sill:1,alt:['rect']},side:{shape:'arch',w:1.4,h:1.8,sill:1,alt:['rect']},
  upper:{shape:'arch',w:.8,h:2,sill:.7,panels:2,alt:['rect'],single:{shape:'arch',w:1.8,h:2,sill:.7,alt:['rect']}},attic:{shape:'round',w:.9,h:.9,sill:1,alt:['arch']},
  trims:{simple:{door:[['keystone']],ground:[['keystone','lintel']],side:[['keystone','lintel']],upper:[['keystone','lintel']]},
   rich:{door:[['keystone','lamps']],ground:[['keystone','lintel','sill-brackets']],side:[['keystone','lintel']],upper:[['keystone','lintel','sill-brackets']],attic:[['sill-brackets']]}}},
 loft:{label:'Loft',blurb:'Chicago-style triple windows over a glazed ground floor.',bay:3.4,corner:.7,pier:.6,symmetric:false,style:'painted',
  door:{shape:'rect',w:1.4,h:2.6,sill:0,style:'painted',glazing:true,at:[.5,0,1]},ground:{kind:'shop',shape:'rect',w:3.4,h:3,sill:.45,head:.5,fill:true,alt:['rect']},side:{shape:'rect',w:1.2,h:1.9,sill:.8},
  upper:{shape:'rect',w:.85,h:2.1,sill:.6,head:.5,panels:3,alt:['arch'],single:{shape:'rect',w:1.3,h:2.1,sill:.6,head:.5}},
  trims:{simple:{door:[['canopy']],side:[['lintel']],upper:[['lintel','keystone']]},rich:{door:[['canopy','lamps']],ground:[['lintel']],side:[['lintel','sill-brackets']],upper:[['lintel','keystone','sill-brackets']]}}},
};
export const RHYTHM_STYLES=RHYTHM_STYLE_IDS.map(id=>({id,label:RHYTHM_SPECS[id].label,blurb:RHYTHM_SPECS[id].blurb}));
/** Tuning: panel gap inside a mullioned group (merges), minimum pier (never merges), minimum panel width, headroom. */
export const RHYTHM={panelGap:.1,minPier:.5,minPanel:.5,minDoor:.9,head:.45,pad:.1,rules:32,defaultDensity:.5,defaultVariety:.35} as const;

// ---- recipe -----------------------------------------------------------------------------------
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const seedOk=(v:unknown)=>finite(v,0,999999)&&Number.isInteger(v);
const idOk=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=100&&!['__proto__','constructor','prototype'].includes(v);
const seedsOk=(v:unknown)=>v===undefined||object(v)&&Object.entries(v).every(([k,n])=>(RHYTHM_LAYERS as readonly string[]).includes(k)&&seedOk(n));
const TRIM_LEVELS=['none','simple','rich'];
export function validateFacadeRhythm(v:unknown):string|null{
 if(v===undefined)return null;
 if(!object(v)||Object.keys(v).some(k=>!['version','seed','style','density','variety','trims','manual','locks','layerSeeds','rules'].includes(k))||v.version!==1||!seedOk(v.seed)||!RHYTHM_STYLE_IDS.includes(v.style as RhythmStyle))return 'The facade rhythm is invalid.';
 if(v.density!==undefined&&!finite(v.density,0,1)||v.variety!==undefined&&!finite(v.variety,0,1)||v.trims!==undefined&&!TRIM_LEVELS.includes(String(v.trims))||v.manual!==undefined&&!['own','fill'].includes(String(v.manual)))return 'The facade rhythm is invalid.';
 if(v.locks!==undefined&&(!Array.isArray(v.locks)||new Set(v.locks).size!==v.locks.length||v.locks.some(l=>!(RHYTHM_LAYERS as readonly string[]).includes(l)))||!seedsOk(v.layerSeeds))return 'The facade rhythm is invalid.';
 if(v.rules!==undefined){
  if(!Array.isArray(v.rules)||v.rules.length>RHYTHM.rules)return 'Too many facade rhythm rules.';
  const seen=new Set<string>();
  for(const r of v.rules){
   if(!object(r)||Object.keys(r).some(k=>!['partId','side','style','seed','density','variety','trims','off','layerSeeds'].includes(k))||r.partId===undefined&&r.side===undefined)return 'A facade rhythm rule is invalid.';
   if(r.partId!==undefined&&!idOk(r.partId)||r.side!==undefined&&(!validSculptSide(r.side)||r.side==='curve')||r.style!==undefined&&!RHYTHM_STYLE_IDS.includes(r.style as RhythmStyle)||r.seed!==undefined&&!seedOk(r.seed)||r.density!==undefined&&!finite(r.density,0,1)||r.variety!==undefined&&!finite(r.variety,0,1)||r.trims!==undefined&&!TRIM_LEVELS.includes(String(r.trims))||r.off!==undefined&&typeof r.off!=='boolean'||!seedsOk(r.layerSeeds))return 'A facade rhythm rule is invalid.';
   const key=`${r.partId??''}|${r.side??''}`;if(seen.has(key))return 'Facade rhythm rules must target different walls.';seen.add(key);
  }
 }
 return null;
}
export const newFacadeRhythm=(style:RhythmStyle='townhouse',seed=1):FacadeRhythm=>({version:1,seed,style});
const withRhythm=(r:StudioRecipe,rhythm:FacadeRhythm|undefined):StudioRecipe=>{const studio={...r.studio};if(rhythm)studio.facadeRhythm=rhythm;else delete studio.facadeRhythm;return {...r,studio};};
export function setFacadeRhythm(r:StudioRecipe,patch:Partial<Omit<FacadeRhythm,'version'>>|null):StudioRecipe{
 if(patch===null)return withRhythm(r,undefined);
 const next:FacadeRhythm={...(r.studio.facadeRhythm??newFacadeRhythm()),...patch,version:1};
 for(const k of Object.keys(next) as (keyof FacadeRhythm)[])if(next[k]===undefined)delete next[k];return withRhythm(r,next);
}
type Target={partId?:string;side?:SculptWallSide};
const sameTarget=(a:Target,b:Target)=>(a.partId??'')===(b.partId??'')&&(a.side??'')===(b.side??'');
export function setFacadeRhythmRule(r:StudioRecipe,target:Target,patch:Omit<FacadeRhythmRule,'partId'|'side'>|null):StudioRecipe{
 const base=r.studio.facadeRhythm??newFacadeRhythm(),rules=(base.rules??[]).filter(x=>!sameTarget(x,target));
 if(patch){const old=base.rules?.find(x=>sameTarget(x,target)),rule:FacadeRhythmRule={...old,...patch,...(target.partId?{partId:target.partId}:{}),...(target.side?{side:target.side}:{})};for(const k of Object.keys(rule) as (keyof FacadeRhythmRule)[])if(rule[k]===undefined)delete rule[k];rules.push(rule);}
 const next:FacadeRhythm={...base,rules};if(!rules.length)delete next.rules;return withRhythm(r,next);
}
export function toggleFacadeRhythmLock(r:StudioRecipe,layer:RhythmLayer):StudioRecipe{
 const base=r.studio.facadeRhythm??newFacadeRhythm(),locks=base.locks?.includes(layer)?base.locks.filter(l=>l!==layer):RHYTHM_LAYERS.filter(l=>l===layer||base.locks?.includes(l));
 const next:FacadeRhythm={...base,locks};if(!locks.length)delete next.locks;return withRhythm(r,next);
}
/** Dice: unlocked layers get new seeds (the whole building, or one rule scope). Locked layers never change. */
export function shuffleFacadeRhythm(v:FacadeRhythm,target?:Target):FacadeRhythm{
 const n=structuredClone(v),bump=(s:Partial<Record<RhythmLayer,number>>|undefined)=>{const out={...s};for(const l of RHYTHM_LAYERS)if(!v.locks?.includes(l))out[l]=((out[l]??0)+1)%1000000;return out;};
 if(!target)n.layerSeeds=bump(n.layerSeeds);
 else{n.rules??=[];let rule=n.rules.find(x=>sameTarget(x,target));if(!rule){rule={...(target.partId?{partId:target.partId}:{}),...(target.side?{side:target.side}:{})};n.rules.push(rule);}rule.layerSeeds=bump(rule.layerSeeds);}
 return n;
}

// ---- expansion --------------------------------------------------------------------------------
const hash=(text:string)=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h>>>0)/4294967296;};
type Settings={style:RhythmStyle;density:number;variety:number;trims:RhythmTrims;off:boolean;seeds:Record<RhythmLayer,string>};
function effective(v:FacadeRhythm,shapeId:string,side:SculptWallSide):Settings&{matched:number[]}{
 let s:FacadeRhythmRule={style:v.style,density:v.density,variety:v.variety,trims:v.trims,seed:v.seed};const matched:number[]=[],layerSeeds:Record<RhythmLayer,number[]>={ground:[],upper:[],attic:[],trims:[]};
 for(const l of RHYTHM_LAYERS)layerSeeds[l].push(v.layerSeeds?.[l]??0);
 const rules=v.rules??[];
 for(const rank of [1,2,3])rules.forEach((r,i)=>{const kind=r.partId&&r.side?3:r.partId?2:1;if(kind!==rank||r.partId&&r.partId!==shapeId||r.side&&r.side!==side)return;matched.push(i);
  s={...s,...Object.fromEntries(Object.entries(r).filter(([k,x])=>x!==undefined&&!['partId','side','layerSeeds'].includes(k)))};for(const l of RHYTHM_LAYERS)if(r.layerSeeds?.[l]!==undefined)layerSeeds[l].push(r.layerSeeds[l]!);});
 return {style:s.style!,density:s.density??RHYTHM.defaultDensity,variety:s.variety??RHYTHM.defaultVariety,trims:s.trims??'simple',off:!!s.off,matched,seeds:Object.fromEntries(RHYTHM_LAYERS.map(l=>[l,`${s.seed}/${l}/${layerSeeds[l].join('.')}`])) as Record<RhythmLayer,string>};
}
const straightSides=(v:StudioRecipe['volumes'][number]):SculptWallSide[]=>v.kind==='ellipse'?[]:v.kind==='polygon'?(v.edgeIds??[]).filter(s=>s!=='curve'):['north','south','east','west'];
type Interval=[number,number];
/** Exposed face-x intervals per storey (merged), from the resolved bays. */
function exposure(f:StudioFaceFrame,bays:StudioBay[]){
 const out=new Map<number,Interval[]>();
 for(const b of bays){if(b.anchor.shapeId!==f.shapeId||b.anchor.side!==f.side)continue;const s=(b.x-f.origin[0])*f.tangent[0]+(b.z-f.origin[1])*f.tangent[1];(out.get(b.anchor.floor)??out.set(b.anchor.floor,[]).get(b.anchor.floor)!).push([s-b.width/2,s+b.width/2]);}
 for(const [k,list] of out){list.sort((a,b)=>a[0]-b[0]);const merged:Interval[]=[];for(const i of list){const last=merged.at(-1);if(last&&i[0]<=last[1]+.02)last[1]=Math.max(last[1],i[1]);else merged.push([...i]);}out.set(k,merged);}
 return out;
}
const inside=(list:Interval[]|undefined,x0:number,x1:number)=>!!list?.some(([a,b])=>x0-RHYTHM.pad>=a-1e-6&&x1+RHYTHM.pad<=b+1e-6);
/** Columns over an exposed extent; `room` is the widest opening a column can take (a lone column has no piers). */
type Layout={n:number;pitch:number;room:number;centres:number[];corner:number};
function layout([x0,x1]:Interval,spec:Spec,density:number,odd:boolean):Layout|null{
 const L=x1-x0;
 const bay=spec.bay*(1.3-.6*density),corner=Math.min(spec.corner,Math.max(FREE_OPENING.edge+RHYTHM.pad+.05,L*.12)),usable=L-2*corner;
 if(usable<RHYTHM.minPanel+RHYTHM.minPier*.5)return null;
 let n=Math.max(1,Math.round(usable/bay));
 if(odd&&n%2===0)n=Math.abs(usable/(n+1)-bay)<Math.abs(usable/(n-1)-bay)&&usable/(n+1)-spec.pier>=RHYTHM.minPanel?n+1:n-1;
 while(n>1&&usable/n-Math.max(spec.pier,RHYTHM.minPier)<RHYTHM.minPanel)n-=odd?2:1;
 const pitch=usable/n;return {n,pitch,room:n===1?usable:pitch-Math.max(spec.pier,RHYTHM.minPier),corner,centres:Array.from({length:n},(_,i)=>x0+corner+(i+.5)*pitch)};
}
type Placed={col:number;floor:number;x:number;bottom:number;width:number;height:number;shape:FreeOpeningShape;style:FreeOpeningStyle;glazing?:boolean;role:Role;panels:number;panelWidth:number};
const pickShape=(slot:Slot,variety:number,faceRoll:number,colRoll:number,altRoll:number):FreeOpeningShape=>{
 const alt=slot.alt?.filter(a=>a!==slot.shape)??[];if(!alt.length)return slot.shape;
 // A face-wide switch at moderate variety, then individual columns stray at high variety.
 if(faceRoll<variety*.45)return alt[Math.floor(altRoll*alt.length)];
 return colRoll<Math.max(0,variety-.35)*.8?alt[Math.floor(altRoll*alt.length)]:slot.shape;
};
function place(slot:Slot,role:Role,spec:Spec,shape:FreeOpeningShape,col:number,floor:number,x:number,room:number,floorY:number,floorH:number,faceTop:number):Placed|null{
 let k=slot.panels??1,h=Math.min(slot.h,floorH-slot.sill-(slot.head??RHYTHM.head),faceTop-FREE_OPENING.top-(floorY+slot.sill));
 if(shape==='round')k=1;
 let pw=slot.fill?Math.min(slot.w,room):Math.min(slot.w,(room-(k-1)*RHYTHM.panelGap)/k);
 while(k>1&&pw<RHYTHM.minPanel){k--;pw=Math.min(slot.w*1.4,(room-(k-1)*RHYTHM.panelGap)/k);}
 if(pw<(role==='door'?RHYTHM.minDoor:RHYTHM.minPanel*(shape==='round'?1.2:1))-1e-6||h<(role==='door'?1.9:.6))return null;
 let bottom=floorY+slot.sill;
 if(shape==='round'){const d=Math.min(pw,h,slot.w);pw=d;bottom=floorY+Math.max(slot.sill,(floorH-d)/2+.05);if(bottom+d>faceTop-FREE_OPENING.top)return null;h=d;}
 const width=k*pw+(k-1)*RHYTHM.panelGap;
 return {col,floor,x,bottom,width,height:h,shape,style:slot.style??spec.style,...(slot.glazing!==undefined?{glazing:slot.glazing}:{}),role,panels:k,panelWidth:pw};
}
/** Trim kinds that suit an opening (mirrors trimKindRule so generated trims are never skipped by rule). */
function trimAllowed(kind:TrimKind,p:Placed){
 const win=p.role!=='door'&&p.bottom>FREE_OPENING.doorSill,round=p.shape==='round';
 switch(kind){
  case 'shutters':return win&&(p.shape==='rect'||p.shape==='arch');
  case 'window-box':return win&&!round&&p.width>=.9&&!['ground','side'].includes(p.role);
  case 'keystone':return p.shape==='arch'||p.shape==='pointed';
  case 'hood':case 'lintel':return p.shape==='rect';
  case 'sill-brackets':return win&&!round;
  case 'canopy':case 'lamps':return !win;
 }
}

/**
 * Generated free openings and trims for every straight part face. `bays` must be the resolved bays of
 * `r` (hidden walls and exposure); pass the variation-expanded recipe, as resolveStudio does.
 */
export function expandFacadeRhythm(r:StudioRecipe,d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>,bays?:StudioBay[]):RhythmExpansion{
 const v=r.studio.facadeRhythm,out:RhythmExpansion={freeOpenings:[],freeTrims:[],inactive:[],faces:[]};if(!v)return out;
 const allBays=bays??studioBays(r,d as CityBuildingDesignV3),gh=d.groundHeight,uh=d.upperHeight??3,manualMode=v.manual??'own',used=new Set<number>();
 const manualFree=r.studio.freeOpenings??[],entry=allBays.find(b=>b.entrance);
 const manualFace=(shapeId:string,side:SculptWallSide)=>r.studio.openings.some(o=>!o.id.startsWith('generated/')&&o.anchor.shapeId===shapeId&&o.anchor.side===side)||manualMode==='own'&&manualFree.some(o=>o.shapeId===shapeId&&o.side===side);
 for(const vol of [...r.volumes].filter(x=>x.operation==='add').sort((a,b)=>a.id.localeCompare(b.id))){
  // Faces of this part with their frames, exposure and settings. Columns span the exposed extent of the face
  // (all storeys), so a partly hidden face keeps aligned columns and its door lands on visible wall.
  const faces=straightSides(vol).map(side=>{const f=studioFaceFrame(r,d,vol.id,side);if(!isFrame(f))return null;const exp=exposure(f,allBays),all=[...exp.values()].flat();
   return {side,f,exp,set:effective(v,vol.id,side),extent:(all.length?[Math.min(...all.map(i=>i[0])),Math.max(...all.map(i=>i[1]))]:[0,0]) as Interval};}).filter((x):x is NonNullable<typeof x>=>!!x);
  const plan=(x:typeof faces[number],door:boolean)=>{
   const spec=RHYTHM_SPECS[x.set.style],lay=layout(x.extent,spec,x.set.density,spec.symmetric&&door),doors=new Set<number>();if(!lay||!door)return lay&&{lay,doors};
   // Door columns: the centre for symmetric styles, seeded fractions (stable under resizing) otherwise.
   const R=(...parts:(string|number)[])=>hash([x.set.seeds.ground,`${vol.id}/${x.side}`,...parts].join('/')),at=spec.door.at,first=spec.symmetric?.5:at[Math.floor(R('door')*at.length)],want=[first];
   if(spec.door.second&&lay.n>=spec.door.second)want.push(first===.5?(R('door2')<.5?0:1):1-first);
   for(const p of want){const target=Math.round(p*(lay.n-1)),order=[...lay.centres.keys()].sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||a-b),w=Math.min(spec.door.w,lay.room);if(w<RHYTHM.minDoor-1e-6)break;
    const i=order.find(i=>!doors.has(i)&&[i-1,i+1].every(j=>!doors.has(j))&&inside(x.exp.get(0),lay.centres[i]-w/2,lay.centres[i]+w/2));if(i!==undefined)doors.add(i);}
   return {lay,doors};
  };
  // The door goes on the entrance face, else the most street-facing face that can take one.
  const open=(x:typeof faces[number])=>!x.set.off&&x.exp.size>0&&!manualFace(vol.id,x.side),plans=new Map<SculptWallSide,ReturnType<typeof plan>>();
  // A part that already has a manual door (free or kit) gets no generated one.
  const manualDoor=vol.startFloor===0&&(manualFree.some(o=>o.shapeId===vol.id&&o.shape!=='round'&&o.bottom<=FREE_OPENING.doorSill)||r.studio.openings.some(o=>!o.id.startsWith('generated/')&&o.anchor.shapeId===vol.id&&o.anchor.floor===0&&o.module.startsWith('door-')));
  if(vol.startFloor===0&&!manualDoor)for(const x of faces.filter(x=>open(x)&&x.exp.get(0)?.some(([a,b])=>b-a>=1.6)).sort((a,b)=>(entry?.anchor.shapeId===vol.id?Number(b.side===entry.anchor.side)-Number(a.side===entry.anchor.side):0)||b.f.normal[1]-a.f.normal[1]||b.f.length-a.f.length)){const p=plan(x,true);if(p?.doors.size){plans.set(x.side,p);break;}}
  for(const {side,f,exp,set,...x} of faces){
   set.matched.forEach(i=>used.add(i));
   const spec=RHYTHM_SPECS[set.style],base:RhythmFace={shapeId:vol.id,side,status:'generated',style:set.style,columns:0,street:false,door:false,openings:0};
   if(set.off){out.faces.push({...base,status:'off'});continue;}
   if(!exp.size){out.faces.push({...base,status:'hidden'});continue;}
   if(manualFace(vol.id,side)){out.faces.push({...base,status:'manual'});continue;}
   const p=plans.get(side)??plan({side,f,exp,set,...x},false);
   if(!p){out.faces.push({...base,status:'narrow'});continue;}
   const {lay,doors}=p,street=vol.startFloor===0&&(doors.size>0||f.normal[1]>.7);
   const key=`${vol.id}/${side}`,col=(i:number)=>spec.symmetric?Math.min(i,lay.n-1-i):i,R=(layer:RhythmLayer,...parts:(string|number)[])=>hash([set.seeds[layer],key,...parts].join('/'));
   // Blind bays (upper storeys) for styles that allow them; never all of them.
   const blind=new Set<number>();if(spec.upper.blind&&lay.n>=3)for(let i=0;i<lay.n;i++)if(R('upper','blind',col(i))<spec.upper.blind*set.variety&&blind.size<lay.n-2)blind.add(i);
   // Building-wide choices (per style) keep all faces of a style consistent; a rule's own seeds still set it apart.
   const B=(layer:RhythmLayer,...parts:(string|number)[])=>hash([set.seeds[layer],set.style,...parts].join('/'));
   const pairSingle=spec.upper.single&&B('upper','single')<set.variety*.5;
   const placed:Placed[]=[];
   for(let floor=vol.startFloor;floor<vol.startFloor+vol.spanFloors;floor++){
    const floorY=sculptFloorBottom(floor,gh,uh)-f.base,floorH=floor?uh:gh,top=vol.startFloor+vol.spanFloors-1,list=exp.get(floor);if(!list)continue;
    const role:Role=floor===0?(street?'ground':'side'):floor===1&&spec.piano&&top>=2?'piano':floor===top&&floor>=2&&spec.attic?'attic':'upper';
    const layer:RhythmLayer=floor===0?'ground':role==='attic'?'attic':'upper';
    const slot0:Slot=role==='ground'?spec.ground:role==='side'?spec.side:role==='piano'?spec.piano!:role==='attic'?spec.attic!:pairSingle?spec.upper.single!:spec.upper;
    const faceRoll=B(layer,role,'face'),altRoll=B(layer,role,'alt');
    lay.centres.forEach((x,i)=>{
     if(floor===0&&doors.has(i)){const p=place(spec.door,'door',spec,spec.door.shape,i,floor,x,lay.room,floorY,floorH,f.height);if(p&&inside(list,x-p.width/2,x+p.width/2))placed.push(p);return;}
     if(floor>0&&blind.has(i)&&role!=='attic')return;
     const shape=pickShape(slot0,set.variety,faceRoll,R(layer,role,'col',col(i)),altRoll);
     const p=place(slot0,role,spec,shape,i,floor,x,lay.room,floorY,floorH,f.height);
     if(p&&inside(list,x-p.width/2,x+p.width/2))placed.push(p);
    });
   }
   // Trims: one seeded option per role (building-wide per style), filtered by what each opening can carry.
   let count=0;
   for(const p of placed){
    const k0=p.panels,ids:string[]=[];
    for(let j=0;j<k0;j++){
     const cx=p.x-p.width/2+p.panelWidth/2+j*(p.panelWidth+RHYTHM.panelGap),id=`generated/rhythm/${key}/${p.floor}/c${p.col}/${j}`;
     const o:StudioFreeOpening={id,shapeId:vol.id,side,u:faceU(f,cx),bottom:p.bottom,width:p.panelWidth,height:p.height,shape:p.shape,style:p.style,...(p.glazing!==undefined?{glazing:p.glazing}:{})};
     if(manualMode==='fill'&&manualFree.some(m=>m.shapeId===vol.id&&m.side===side&&Math.abs(m.u*f.length-o.u*f.length)<(m.width+o.width)/2+.6&&m.bottom<o.bottom+o.height+.5&&o.bottom<m.bottom+m.height+.5))continue;
     out.freeOpenings.push(o);ids.push(id);count++;
    }
    if(set.trims==='none'||!ids.length)continue;
    const options=RHYTHM_SPECS[set.style].trims[set.trims][p.role];if(!options?.length)continue;
    const kinds=FREE_TRIM_KINDS.filter(k=>options[Math.floor(hash(`${set.seeds.trims}/${set.style}/${p.role}`)*options.length)].includes(k)&&trimAllowed(k,p));
    if(kinds.length)out.freeTrims.push({openingId:ids[0],kinds});
   }
   out.faces.push({...base,columns:lay.n,street,door:doors.size>0,openings:count});
  }
 }
 (v.rules??[]).forEach((rule,i)=>{if(!used.has(i)&&!rule.off)out.inactive.push({id:`facade-rhythm/rule/${rule.partId??'*'}/${rule.side??'*'}`,reason:'This rhythm rule has no wall to dress.'});});
 return out;
}
export const facadeRhythmFaces=(r:StudioRecipe,d:CityBuildingDesignV3,bays?:StudioBay[])=>r.studio.facadeRhythm?expandFacadeRhythm(r,d,bays??studioBays(expandBuildingVariation(r,d).recipe,d)).faces:[];

/**
 * Turn generated openings (and their trims) into manual free openings: one face, or all of them (which
 * also removes the rhythm). The face then belongs to the user; resolved geometry is unchanged.
 */
export function materializeFacadeRhythm(r:StudioRecipe,d:CityBuildingDesignV3,face?:{shapeId:string;side:SculptWallSide}):{recipe:StudioRecipe;ids:string[]}|{reason:string}{
 if(!r.studio.facadeRhythm)return {reason:'This building has no facade rhythm.'};
 const expanded=expandBuildingVariation(r,d).recipe,gen=expandFacadeRhythm(expanded,d,studioBays(expanded,d));
 const pick=gen.freeOpenings.filter(o=>!face||o.shapeId===face.shapeId&&o.side===face.side);
 if(face&&!pick.length)return {reason:'This wall has no generated openings.'};
 const taken=new Set([...(r.studio.freeOpenings??[]).map(o=>o.id)]),map=new Map<string,string>(),stem=(o:StudioFreeOpening)=>`rhythm-${Math.floor(hash(`${o.shapeId}/${o.side}`)*1e8).toString(36)}`;
 const opened=pick.map(o=>{let n=1,id=`${stem(o)}-${n}`;while(taken.has(id))id=`${stem(o)}-${++n}`;taken.add(id);map.set(o.id,id);return {...o,id};});
 const freeOpenings=[...(r.studio.freeOpenings??[]),...opened],freeTrims=[...(r.studio.freeTrims??[]),...gen.freeTrims.filter(t=>map.has(t.openingId)).map(t=>({openingId:map.get(t.openingId)!,kinds:[...t.kinds]}))];
 const error=validateFreeOpenings(freeOpenings)??validateFreeTrims(freeTrims);if(error)return {reason:face?error:'Too many openings to unpack at once; unpack one wall at a time.'};
 const studio:StudioRecipe['studio']={...r.studio,freeOpenings,...(freeTrims.length?{freeTrims}:{})};if(!face)delete studio.facadeRhythm;
 return {recipe:{...r,studio},ids:opened.map(o=>o.id)};
}
