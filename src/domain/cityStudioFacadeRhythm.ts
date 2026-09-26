/**
 * Facade rhythm generator (local studio only): "generated openings" instead of kit tiles.
 *
 * Recipe: optional `studio.facadeRhythm` (local plots only; business/profile validators reject it):
 *  {version:1|2, seed, style, density?, variety?, trims?, manual?, bay?, locks?, layerSeeds?, layers?, rules?}
 *   style      townhouse | shopfront | civic | cottage | warehouse | loft (see RHYTHM_STYLES). A style is a
 *              PRESET: it fills every layer's pool/coverage/pattern/uniformity (see rhythmLayerPreset);
 *              explicit `layers` fields override the preset. Setting a style on a scope clears the layer
 *              overrides accumulated below it ("apply preset").
 *   density    0..1 (default .5): narrower bays / more openings as it rises
 *   variety    0..1 (default .35): feeds the presets (alternative shapes, uniformity, blind bays)
 *   trims      none | simple | rich (default simple): generated trim parts per opening
 *   manual     fill (version 2 default): manual free openings reserve their span (+ margin) and generated
 *              openings stay on the column grid around them; own (version 1 default): a wall with a manual
 *              free opening is left entirely to the user. Version 2: explicit kit tiles and storefront stamps are
 *              manual spans too (they reserve their tile; docs/city-unified-facades.md); version 1: a kit opening
 *              still owns its whole wall.
 *   bay        v2: column pitch in metres (1.2..8), overriding the density-derived pitch
 *   locks      layers kept on shuffle: ground | upper | attic | trims
 *   layerSeeds per-layer shuffle counters (shuffle bumps unlocked ones)
 *   layers     v2: per pool layer (ground | upper | attic | corners | trims) {pool?, coverage?, spacing?, pattern?, uniformity?}
 *              pool        up to 24 {id,weight}; ids are RHYTHM_OPENING_TYPES or `module:<kit module id>` (a kit window,
 *                          door or wall piece at its native size, standing on the storey floor; trims layer: trim kinds)
 *              coverage    0..1 share of cells that get an opening (the rest are blind wall)
 *              spacing     0..8: only every (spacing+1)-th column opens
 *              pattern     aligned (per column) | groups (2x2 blocks) | alternating (per column, odd/even storeys)
 *                          | independent (every cell)
 *              uniformity  0..1 chance a cell takes the favourite (heaviest entry; seeded among ties) instead of
 *                          its own weighted roll
 *              `corners` (optional) overrides the outer columns of upper storeys; `attic` is the top storey
 *              of parts with 3+ storeys (inherits upper when the style has no attic treatment).
 *   rules      scoped overrides; target fields {partId?, side?, fromFloor?, toFloor?, x0?, x1?}
 *              class precedence building < part (side-only < part < part+side) < floor < region, later wins
 *              within a class. Floor/region rules (v2) act per cell: only style, seed, variety, trims, off,
 *              layers and layerSeeds apply; region x0/x1 are metres along the face (need partId+side).
 *              Part-class rules may also set density, bay (v2) and manual (v2, "keep this wall manual").
 *
 * Version 1 recipes keep the original generator exactly (legacy path). Version 2 (newFacadeRhythm) uses the
 * pool generator for every cell; setters upgrade a recipe to version 2 only when a version-2 field is set.
 *
 * Expansion is pure and deterministic: expandFacadeRhythm(recipe,design,bays) lays columns from each
 * straight part face's length and storey heights (never absolute positions), so resizing a part
 * re-lays its facade. Generated ids start with `generated/rhythm/` and never enter the saved recipe;
 * resolveStudio merges them with the manual free openings/trims before the free faces are built, so
 * faces owned by generated openings suppress kit tiles exactly like manual ones. The merged trim list
 * is exposed as StudioResolved.freeTrims.
 *
 * UI API
 *  RHYTHM_STYLES / RHYTHM_LAYERS / RHYTHM_POOL_LAYERS / RHYTHM_OPENINGS   catalogues for the panel
 *  newFacadeRhythm(style?,seed?) -> FacadeRhythm (version 2)
 *  setFacadeRhythm(recipe,patch|null) -> recipe         style/density/variety/trims/manual/bay; null removes
 *  setFacadeRhythmRule(recipe,target,patch|null) -> recipe   scoped override (null clears the rule)
 *  applyRhythmStyle(recipe,targets,style) -> recipe     preset: style + clears layer overrides at those scopes
 *  setRhythmLayer(recipe,targets,layer,patch|null)      pool/coverage/... at the building (targets=[]) or rules
 *  rhythmScopeSettings(rhythm,target?) -> effective settings incl. full per-layer rules for display
 *  toggleFacadeRhythmLock(recipe,layer) -> recipe
 *  shuffleFacadeRhythm(rhythm,target?,layer?) -> rhythm  dice; target reshuffles one rule scope, layer one layer
 *  facadeRhythmFaces(recipe,design,bays?) -> face summaries (generated/manual/off/hidden) for highlighting
 *  materializeFacadeRhythm(recipe,design,face?) -> {recipe,ids}|{reason}
 *     converts generated openings (+ trims) of one face (or all, which also removes the rhythm) into
 *     manual free openings so they can be edited one by one.
 */
import {FREE_OPENING,faceMaxOpeningWidth,faceU,freeOpeningIsDoor,isFrame,studioBayFaceSpans,studioFaceFrame,studioKitModuleOpenings,validateFreeOpenings,type FreeOpeningShape,type FreeOpeningStyle,type StudioFaceFrame,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {moduleOpeningSpec,poolModule} from './cityStudioModuleSpec.ts';
import {FREE_TRIM_KINDS,validateFreeTrims,type StudioFreeTrim,type TrimKind} from './cityStudioTrimParts.ts';
import {sculptFloorBottom,validSculptSide,type SculptWallSide} from './citySculpt.ts';
import {studioBays} from './cityStudio.ts';
import {expandBuildingVariation} from './cityBuildingVariation.ts';
import type {StudioBay,StudioRecipe} from './cityStudioTypes.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';

export const RHYTHM_STYLE_IDS=['townhouse','shopfront','civic','cottage','warehouse','loft'] as const;
/** Seeded layers (shuffle/lock). */
export const RHYTHM_LAYERS=['ground','upper','attic','trims'] as const;
/** Layers with pool settings (version 2). */
export const RHYTHM_POOL_LAYERS=['ground','upper','attic','corners','trims'] as const;
export const RHYTHM_OPENING_TYPES=['rect','tall','wide','arch','pointed','round','paired','triple','door','shop','blind'] as const;
export const RHYTHM_PATTERNS=['aligned','groups','alternating','independent'] as const;
export type RhythmStyle=typeof RHYTHM_STYLE_IDS[number];
export type RhythmLayer=typeof RHYTHM_LAYERS[number];
export type RhythmPoolLayer=typeof RHYTHM_POOL_LAYERS[number];
export type RhythmOpeningType=typeof RHYTHM_OPENING_TYPES[number];
export type RhythmPattern=typeof RHYTHM_PATTERNS[number];
export type RhythmTrims='none'|'simple'|'rich';
export type RhythmPoolEntry={id:string;weight:number};
export type RhythmLayerRule={pool?:RhythmPoolEntry[];coverage?:number;spacing?:number;pattern?:RhythmPattern;uniformity?:number};
export type RhythmLayers=Partial<Record<RhythmPoolLayer,RhythmLayerRule>>;
export type RhythmTarget={partId?:string;side?:SculptWallSide;fromFloor?:number;toFloor?:number;x0?:number;x1?:number};
export type FacadeRhythmRule=RhythmTarget&{style?:RhythmStyle;seed?:number;density?:number;variety?:number;trims?:RhythmTrims;off?:boolean;manual?:'own'|'fill';bay?:number;layers?:RhythmLayers;layerSeeds?:Partial<Record<RhythmLayer,number>>};
export type FacadeRhythm={version:1|2;seed:number;style:RhythmStyle;density?:number;variety?:number;trims?:RhythmTrims;manual?:'own'|'fill';bay?:number;locks?:RhythmLayer[];layerSeeds?:Partial<Record<RhythmLayer,number>>;layers?:RhythmLayers;rules?:FacadeRhythmRule[]};
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
/** Opening types for the pool editor: label and an icon outline (shape, relative width/height, panels). */
export const RHYTHM_OPENINGS:readonly {id:RhythmOpeningType;label:string;icon:{shape:FreeOpeningShape;w:number;h:number;panels?:number}|null}[]=[
 {id:'rect',label:'Window',icon:{shape:'rect',w:.5,h:.7}},{id:'tall',label:'Tall window',icon:{shape:'rect',w:.4,h:1}},{id:'wide',label:'Wide window',icon:{shape:'rect',w:1,h:.55}},
 {id:'arch',label:'Arch',icon:{shape:'arch',w:.5,h:.8}},{id:'pointed',label:'Pointed arch',icon:{shape:'pointed',w:.45,h:.85}},{id:'round',label:'Round',icon:{shape:'round',w:.55,h:.55}},
 {id:'paired',label:'Paired',icon:{shape:'rect',w:.3,h:.75,panels:2}},{id:'triple',label:'Triple',icon:{shape:'rect',w:.25,h:.75,panels:3}},
 {id:'door',label:'Door',icon:{shape:'arch',w:.5,h:1}},{id:'shop',label:'Shopfront',icon:{shape:'rect',w:1,h:.8}},{id:'blind',label:'Blind bay',icon:null},
];
/** Tuning: panel gap inside a mullioned group (merges), minimum pier (never merges), minimum panel width, headroom. */
export const RHYTHM={panelGap:.1,minPier:.5,minPanel:.5,minDoor:.9,head:.45,pad:.1,rules:32,pool:24,defaultDensity:.5,defaultVariety:.35,fillGap:.6,fillRise:.5,maxFloor:39} as const;

// ---- recipe -----------------------------------------------------------------------------------
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown,lo:number,hi:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const intIn=(v:unknown,lo:number,hi:number)=>finite(v,lo,hi)&&Number.isInteger(v);
const seedOk=(v:unknown)=>intIn(v,0,999999);
const idOk=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=100&&!['__proto__','constructor','prototype'].includes(v);
const seedsOk=(v:unknown)=>v===undefined||object(v)&&Object.entries(v).every(([k,n])=>(RHYTHM_LAYERS as readonly string[]).includes(k)&&seedOk(n));
const TRIM_LEVELS=['none','simple','rich'];
const V1_KEYS=['version','seed','style','density','variety','trims','manual','locks','layerSeeds','rules'],V2_KEYS=[...V1_KEYS,'bay','layers'];
const RULE_V1=['partId','side','style','seed','density','variety','trims','off','layerSeeds'],RULE_V2=[...RULE_V1,'fromFloor','toFloor','x0','x1','manual','bay','layers'];
const poolIds=(layer:RhythmPoolLayer):readonly string[]=>layer==='trims'?FREE_TRIM_KINDS:RHYTHM_OPENING_TYPES;
/** Pool id check: the layer's opening types or trim kinds, and on opening layers any kit piece (`module:<id>`). */
const poolIdOk=(layer:RhythmPoolLayer,id:string)=>poolIds(layer).includes(id)||layer!=='trims'&&!!moduleOpeningSpec(poolModule(id)??undefined);
function layersOk(v:unknown){
 if(v===undefined)return true;if(!object(v)||Object.keys(v).some(k=>!(RHYTHM_POOL_LAYERS as readonly string[]).includes(k)))return false;
 return Object.entries(v).every(([layer,x])=>{
  if(!object(x)||Object.keys(x).some(k=>!['pool','coverage','spacing','pattern','uniformity'].includes(k)))return false;
  if(x.pool!==undefined&&(!Array.isArray(x.pool)||x.pool.length>RHYTHM.pool||x.pool.some(p=>!object(p)||Object.keys(p).some(k=>k!=='id'&&k!=='weight')||!poolIdOk(layer as RhythmPoolLayer,String(p.id))||!finite(p.weight,.01,100))||new Set(x.pool.map(p=>(p as RhythmPoolEntry).id)).size!==x.pool.length))return false;
  return (x.coverage===undefined||finite(x.coverage,0,1))&&(x.uniformity===undefined||finite(x.uniformity,0,1))&&(x.spacing===undefined||intIn(x.spacing,0,8))&&(x.pattern===undefined||(RHYTHM_PATTERNS as readonly string[]).includes(String(x.pattern)));
 });
}
const ruleKey=(r:RhythmTarget)=>[r.partId??'',r.side??'',r.fromFloor??'',r.toFloor??'',r.x0??'',r.x1??''].join('|');
export function validateFacadeRhythm(v:unknown):string|null{
 if(v===undefined)return null;
 const bad='The facade rhythm is invalid.';
 if(!object(v)||(v.version!==1&&v.version!==2))return bad;
 const v2=v.version===2;
 if(Object.keys(v).some(k=>!(v2?V2_KEYS:V1_KEYS).includes(k))||!seedOk(v.seed)||!RHYTHM_STYLE_IDS.includes(v.style as RhythmStyle))return bad;
 if(v.density!==undefined&&!finite(v.density,0,1)||v.variety!==undefined&&!finite(v.variety,0,1)||v.trims!==undefined&&!TRIM_LEVELS.includes(String(v.trims))||v.manual!==undefined&&!['own','fill'].includes(String(v.manual)))return bad;
 if(v.locks!==undefined&&(!Array.isArray(v.locks)||new Set(v.locks).size!==v.locks.length||v.locks.some(l=>!(RHYTHM_LAYERS as readonly string[]).includes(l)))||!seedsOk(v.layerSeeds))return bad;
 if(v.bay!==undefined&&!finite(v.bay,1.2,8)||!layersOk(v.layers))return bad;
 if(v.rules!==undefined){
  if(!Array.isArray(v.rules)||v.rules.length>RHYTHM.rules)return 'Too many facade rhythm rules.';
  const seen=new Set<string>(),badRule='A facade rhythm rule is invalid.';
  for(const r of v.rules){
   if(!object(r)||Object.keys(r).some(k=>!(v2?RULE_V2:RULE_V1).includes(k))||r.partId===undefined&&r.side===undefined&&r.fromFloor===undefined)return badRule;
   if(r.partId!==undefined&&!idOk(r.partId)||r.side!==undefined&&!validSculptSide(r.side)||r.style!==undefined&&!RHYTHM_STYLE_IDS.includes(r.style as RhythmStyle)||r.seed!==undefined&&!seedOk(r.seed)||r.density!==undefined&&!finite(r.density,0,1)||r.variety!==undefined&&!finite(r.variety,0,1)||r.trims!==undefined&&!TRIM_LEVELS.includes(String(r.trims))||r.off!==undefined&&typeof r.off!=='boolean'||!seedsOk(r.layerSeeds))return badRule;
   if(r.manual!==undefined&&!['own','fill'].includes(String(r.manual))||r.bay!==undefined&&!finite(r.bay,1.2,8)||!layersOk(r.layers))return badRule;
   if((r.fromFloor===undefined)!==(r.toFloor===undefined)||r.fromFloor!==undefined&&(!intIn(r.fromFloor,0,RHYTHM.maxFloor)||!intIn(r.toFloor,Number(r.fromFloor),RHYTHM.maxFloor)))return 'Choose a valid floor range.';
   if((r.x0===undefined)!==(r.x1===undefined)||r.x0!==undefined&&(r.partId===undefined||r.side===undefined||!finite(r.x0,0,200)||!finite(r.x1,Number(r.x0)+.1,200)))return 'A painted rhythm region is invalid.';
   if((r.fromFloor!==undefined||r.x0!==undefined)&&(r.density!==undefined||r.bay!==undefined||r.manual!==undefined))return 'Floor and region rules cannot change bays or manual walls.';
   const key=ruleKey(r as RhythmTarget);if(seen.has(key))return 'Facade rhythm rules must target different walls.';seen.add(key);
  }
 }
 return null;
}
export const newFacadeRhythm=(style:RhythmStyle='townhouse',seed=1):FacadeRhythm=>({version:2,seed,style});
const withRhythm=(r:StudioRecipe,rhythm:FacadeRhythm|undefined):StudioRecipe=>{const studio={...r.studio};if(rhythm)studio.facadeRhythm=rhythm;else delete studio.facadeRhythm;return {...r,studio};};
const clean=<T extends object>(o:T):T=>{for(const k of Object.keys(o) as (keyof T)[])if(o[k]===undefined)delete o[k];return o;};
/** Version 2 is only adopted when a version-2 field is written, so saved version-1 recipes keep their facade. */
const needsV2=(p:Record<string,unknown>)=>['bay','layers','fromFloor','toFloor','x0','x1'].some(k=>p[k]!==undefined)||p.manual!==undefined&&('partId' in p||'side' in p);
export function setFacadeRhythm(r:StudioRecipe,patch:Partial<Omit<FacadeRhythm,'version'>>|null):StudioRecipe{
 if(patch===null)return withRhythm(r,undefined);
 const base=r.studio.facadeRhythm??newFacadeRhythm(),next:FacadeRhythm=clean({...base,...patch,version:base.version===2||needsV2(patch)?2:1});
 if(next.layers&&!Object.keys(next.layers).length)delete next.layers;return withRhythm(r,next);
}
const sameTarget=(a:RhythmTarget,b:RhythmTarget)=>ruleKey(a)===ruleKey(b);
const targetFields=(t:RhythmTarget):RhythmTarget=>clean({partId:t.partId,side:t.side,fromFloor:t.fromFloor,toFloor:t.toFloor,x0:t.x0,x1:t.x1});
export function setFacadeRhythmRule(r:StudioRecipe,target:RhythmTarget,patch:Omit<FacadeRhythmRule,keyof RhythmTarget>|null):StudioRecipe{
 const base=r.studio.facadeRhythm??newFacadeRhythm(),rules=(base.rules??[]).filter(x=>!sameTarget(x,target));
 if(patch){const old=base.rules?.find(x=>sameTarget(x,target)),rule:FacadeRhythmRule=clean({...old,...patch,...targetFields(target)});if(rule.layers&&!Object.keys(rule.layers).length)delete rule.layers;
  // Keep the rule's position so "later wins" does not change when it is edited.
  const at=base.rules?.findIndex(x=>sameTarget(x,target))??-1;if(at>=0)rules.splice(at,0,rule);else rules.push(rule);}
 const next:FacadeRhythm={...base,rules,version:base.version===2||needsV2({...target,...patch})?2:1};if(!rules.length)delete next.rules;return withRhythm(r,next);
}
export function removeFacadeRhythmRule(r:StudioRecipe,index:number):StudioRecipe{
 const base=r.studio.facadeRhythm;if(!base?.rules?.[index])return r;const rules=base.rules.filter((_,i)=>i!==index),next:FacadeRhythm={...base,rules};if(!rules.length)delete next.rules;return withRhythm(r,next);
}
/** Style preset for the scopes: sets the style and drops the layer overrides written at those scopes. */
export function applyRhythmStyle(r:StudioRecipe,targets:RhythmTarget[],style:RhythmStyle):StudioRecipe{
 if(!targets.length){const base=r.studio.facadeRhythm;return setFacadeRhythm(r,base?{style,layers:undefined}:{style,seed:Math.floor(Math.random()*100000)});}
 let out=r;for(const t of targets){const old=out.studio.facadeRhythm?.rules?.find(x=>sameTarget(x,t));out=setFacadeRhythmRule(out,t,{...old,style,layers:undefined});}return out;
}
/** Merge layer settings at the building (no targets) or at each target rule; null clears that layer's overrides. */
export function setRhythmLayer(r:StudioRecipe,targets:RhythmTarget[],layer:RhythmPoolLayer,patch:RhythmLayerRule|null):StudioRecipe{
 const merge=(layers:RhythmLayers|undefined):RhythmLayers|undefined=>{const out={...layers};if(patch===null)delete out[layer];else out[layer]=clean({...out[layer],...patch});return Object.keys(out).length?out:undefined;};
 if(!targets.length){const base=r.studio.facadeRhythm??newFacadeRhythm();return withRhythm(r,clean<FacadeRhythm>({...base,version:2,layers:merge(base.layers)}));}
 let out=r;for(const t of targets){const old=out.studio.facadeRhythm?.rules?.find(x=>sameTarget(x,t));out=setFacadeRhythmRule(out,t,{...old,layers:merge(old?.layers)});}
 const v=out.studio.facadeRhythm!;return withRhythm(out,{...v,version:2});
}
export function toggleFacadeRhythmLock(r:StudioRecipe,layer:RhythmLayer):StudioRecipe{
 const base=r.studio.facadeRhythm??newFacadeRhythm(),locks=base.locks?.includes(layer)?base.locks.filter(l=>l!==layer):RHYTHM_LAYERS.filter(l=>l===layer||base.locks?.includes(l));
 const next:FacadeRhythm={...base,locks};if(!locks.length)delete next.locks;return withRhythm(r,next);
}
/** Dice: unlocked layers get new seeds (the whole building, or one rule scope; all layers or one). Locked layers never change. */
export function shuffleFacadeRhythm(v:FacadeRhythm,target?:RhythmTarget,layer?:RhythmLayer):FacadeRhythm{
 const n=structuredClone(v),bump=(s:Partial<Record<RhythmLayer,number>>|undefined)=>{const out={...s};for(const l of RHYTHM_LAYERS)if(!v.locks?.includes(l)&&(!layer||l===layer))out[l]=((out[l]??0)+1)%1000000;return out;};
 if(!target)n.layerSeeds=bump(n.layerSeeds);
 else{n.rules??=[];let rule=n.rules.find(x=>sameTarget(x,target));if(!rule){rule=targetFields(target);n.rules.push(rule);if(needsV2(target))n.version=2;}rule.layerSeeds=bump(rule.layerSeeds);}
 return n;
}

// ---- presets ----------------------------------------------------------------------------------
const round2=(n:number)=>Math.round(n*100)/100;
const typeOfShape=(s:FreeOpeningShape):RhythmOpeningType=>s;
const addEntry=(pool:RhythmPoolEntry[],id:string,weight:number)=>{if(weight<.01)return;const e=pool.find(p=>p.id===id);if(e)e.weight=round2(e.weight+weight);else pool.push({id,weight:round2(weight)});};
/**
 * The layer rule a style preset stands for at a variety: the style's slot shape (or shopfront, pair, triple)
 * as the main pick, its alternative shapes and single variant as lighter picks, blind bays as coverage.
 */
export function rhythmLayerPreset(style:RhythmStyle,variety:number=RHYTHM.defaultVariety,layer:RhythmPoolLayer):FullLayerRule{
 const spec=RHYTHM_SPECS[style],pool:RhythmPoolEntry[]=[],alt=(s:Slot,main:FreeOpeningShape)=>{for(const a of s.alt??[])if(a!==main)addEntry(pool,typeOfShape(a),variety*.5);};
 let coverage=1;
 if(layer==='trims'){
  // Every trim kind the style uses (simple level), weighted by how often it appears.
  for(const options of Object.values(spec.trims.rich))for(const kinds of options??[])for(const k of kinds)addEntry(pool,k,.25);
  for(const options of Object.values(spec.trims.simple))for(const kinds of options??[])for(const k of kinds)addEntry(pool,k,.75);
  return {pool,coverage:1,spacing:0,pattern:'aligned',uniformity:1};
 }
 if(layer==='ground'){const s=spec.ground;addEntry(pool,s.kind==='shop'?'shop':typeOfShape(s.shape),1);alt(s,s.kind==='shop'?'rect':s.shape);}
 else{
  const s=layer==='attic'&&spec.attic?spec.attic:spec.upper,main=s.panels===2?'paired':s.panels===3?'triple':typeOfShape(s.shape);addEntry(pool,main,1);alt(s,s.shape);
  if(s===spec.upper&&spec.upper.single)addEntry(pool,typeOfShape(spec.upper.single.shape),variety*.5);
  if(s===spec.upper&&spec.upper.blind)coverage=round2(1-spec.upper.blind*variety);
 }
 return {pool,coverage,spacing:0,pattern:'aligned',uniformity:round2(1-variety*.6)};
}
/** Where the scope rules apply: a rule applies to a target when all its target fields are satisfied by it. */
const ruleContains=(rule:RhythmTarget,t:RhythmTarget)=>(rule.partId===undefined||rule.partId===t.partId)&&(rule.side===undefined||rule.side===t.side)
 &&(rule.fromFloor===undefined||t.fromFloor!==undefined&&t.fromFloor>=rule.fromFloor&&(t.toFloor??t.fromFloor)<=rule.toFloor!)
 &&(rule.x0===undefined||t.x0!==undefined&&t.x0>=rule.x0-1e-6&&(t.x1??t.x0)<=rule.x1!+1e-6);
const ruleClass=(r:RhythmTarget)=>r.x0!==undefined?5:r.fromFloor!==undefined?4:r.partId&&r.side?3:r.partId?2:1;
type Folded={style:RhythmStyle;seed:number;density?:number;variety?:number;trims?:RhythmTrims;off?:boolean;manual?:'own'|'fill';bay?:number;layers:RhythmLayers;seedLists:Record<RhythmLayer,number[]>};
const FIELDS=['style','seed','density','variety','trims','off','manual','bay'] as const;
function foldRule(s:Folded,r:FacadeRhythmRule){
 const next:Folded={...s,seedLists:{...s.seedLists}} as Folded;
 for(const k of FIELDS)if(r[k]!==undefined)(next as Record<string,unknown>)[k]=r[k];
 let layers=r.style!==undefined?{}:s.layers;
 if(r.layers){layers={...layers};for(const [k,x] of Object.entries(r.layers) as [RhythmPoolLayer,RhythmLayerRule][])layers[k]={...layers[k],...x};}
 next.layers=layers;
 for(const l of RHYTHM_LAYERS)if(r.layerSeeds?.[l]!==undefined)next.seedLists[l]=[...next.seedLists[l],r.layerSeeds[l]!];
 return next;
}
const baseFold=(v:FacadeRhythm):Folded=>({style:v.style,seed:v.seed,density:v.density,variety:v.variety,trims:v.trims,manual:v.manual,bay:v.bay,layers:v.layers??{},seedLists:Object.fromEntries(RHYTHM_LAYERS.map(l=>[l,[v.layerSeeds?.[l]??0]])) as Record<RhythmLayer,number[]>});
/** Rules in precedence order (class, then array order). */
const orderedRules=(v:FacadeRhythm)=>(v.rules??[]).map((r,i)=>({r,i})).sort((a,b)=>ruleClass(a.r)-ruleClass(b.r)||a.i-b.i);
/** Full layer rule (preset + overrides). The attic inherits the upper layer when the style has no attic treatment; corners inherit upper. */
type FullLayerRule=Required<Pick<RhythmLayerRule,'pool'|'coverage'|'spacing'|'pattern'|'uniformity'>>;
const layerCache=new WeakMap<Folded,Map<RhythmPoolLayer,FullLayerRule>>();
function layerRule(s:Folded,layer:RhythmPoolLayer):FullLayerRule{
 let cache=layerCache.get(s);if(!cache)layerCache.set(s,cache=new Map());const hit=cache.get(layer);if(hit)return hit;
 const rule=layer==='corners'||layer==='attic'&&!RHYTHM_SPECS[s.style].attic?{...layerRule(s,'upper'),...s.layers[layer]}:{...rhythmLayerPreset(s.style,s.variety??RHYTHM.defaultVariety,layer),...s.layers[layer]};
 cache.set(layer,rule);return rule;
}
export type RhythmScopeSettings={style:RhythmStyle;density:number;variety:number;trims:RhythmTrims;manual:'own'|'fill';bay?:number;off:boolean;layers:Record<RhythmPoolLayer,FullLayerRule>;explicit:Record<RhythmPoolLayer,boolean>};
/** Effective settings at a scope, for the rules panel (building when no target). */
export function rhythmScopeSettings(v:FacadeRhythm,target?:RhythmTarget):RhythmScopeSettings{
 let s=baseFold(v);if(target)for(const {r} of orderedRules(v))if(ruleContains(r,target))s=foldRule(s,r);
 return {style:s.style,density:s.density??RHYTHM.defaultDensity,variety:s.variety??RHYTHM.defaultVariety,trims:s.trims??'simple',manual:s.manual??(v.version===2?'fill':'own'),bay:s.bay,off:!!s.off,
  layers:Object.fromEntries(RHYTHM_POOL_LAYERS.map(l=>[l,layerRule(s,l)])) as RhythmScopeSettings['layers'],explicit:Object.fromEntries(RHYTHM_POOL_LAYERS.map(l=>[l,!!s.layers[l]])) as Record<RhythmPoolLayer,boolean>};
}
/** Short description of a rule target for lists. */
export function rhythmRuleLabel(r:RhythmTarget,partName:(id:string)=>string=id=>id){
 const floors=r.fromFloor===undefined?'':r.fromFloor===r.toFloor?`floor ${r.fromFloor+1}`:`floors ${r.fromFloor+1}–${r.toFloor!+1}`;
 const where=r.partId&&r.side?`${partName(r.partId)} · ${r.side} wall`:r.partId?partName(r.partId):r.side?`every ${r.side} wall`:'';
 const region=r.x0!==undefined?` · ${r.x0.toFixed(1)}–${r.x1!.toFixed(1)} m`:'';
 return [where,floors].filter(Boolean).join(' · ')+region||'Whole building';
}

// ---- expansion --------------------------------------------------------------------------------
const hash=(text:string)=>{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);h^=h>>>13;h=Math.imul(h,0x5bd1e995);h^=h>>>15;return (h>>>0)/4294967296;};
type Settings={style:RhythmStyle;density:number;variety:number;trims:RhythmTrims;off:boolean;manual:'own'|'fill';bay?:number;seeds:Record<RhythmLayer,string>;fold:Folded};
const settle=(s:Folded,v:FacadeRhythm):Settings=>({style:s.style,density:s.density??RHYTHM.defaultDensity,variety:s.variety??RHYTHM.defaultVariety,trims:s.trims??'simple',off:!!s.off,manual:s.manual??(v.version===2?'fill':'own'),bay:s.bay,fold:s,
 seeds:Object.fromEntries(RHYTHM_LAYERS.map(l=>[l,`${s.seed}/${l}/${s.seedLists[l].join('.')}`])) as Record<RhythmLayer,string>});
/** Face-level settings: building plus the part-class rules (side-only < part < part+side). */
function effective(v:FacadeRhythm,shapeId:string,side:SculptWallSide):Settings&{matched:number[]}{
 let s=baseFold(v);const matched:number[]=[];
 for(const {r,i} of orderedRules(v)){if(ruleClass(r)>3||r.partId&&r.partId!==shapeId||r.side&&r.side!==side)continue;matched.push(i);s=foldRule(s,r);}
 return {...settle(s,v),matched};
}
// Ellipse parts dress their one curved face (arc-length face, see cityStudioFaceCurve).
const straightSides=(v:StudioRecipe['volumes'][number]):SculptWallSide[]=>v.kind==='ellipse'?['curve']:v.kind==='polygon'?(v.edgeIds??[]).filter(s=>s!=='curve'):['north','south','east','west'];
type Interval=[number,number];
/** Exposed face-x intervals per storey (merged), from the resolved bays. */
function exposure(f:StudioFaceFrame,bays:StudioBay[]){
 const out=new Map<number,Interval[]>();
 for(const b of bays){if(b.anchor.shapeId!==f.shapeId||b.anchor.side!==f.side)continue;(out.get(b.anchor.floor)??out.set(b.anchor.floor,[]).get(b.anchor.floor)!).push(...studioBayFaceSpans(f,b));}
 for(const [k,list] of out){list.sort((a,b)=>a[0]-b[0]);const merged:Interval[]=[];for(const i of list){const last=merged.at(-1);if(last&&i[0]<=last[1]+.02)last[1]=Math.max(last[1],i[1]);else merged.push([...i]);}out.set(k,merged);}
 return out;
}
const inside=(list:Interval[]|undefined,x0:number,x1:number)=>!!list?.some(([a,b])=>x0-RHYTHM.pad>=a-1e-6&&x1+RHYTHM.pad<=b+1e-6);
/** Columns over an exposed extent; `room` is the widest opening a column can take (a lone column has no piers). */
type Layout={n:number;pitch:number;room:number;centres:number[];corner:number};
function layout([x0,x1]:Interval,spec:Spec,density:number,odd:boolean,bayWidth?:number):Layout|null{
 const L=x1-x0;
 const bay=bayWidth??spec.bay*(1.3-.6*density),corner=Math.min(spec.corner,Math.max(FREE_OPENING.edge+RHYTHM.pad+.05,L*.12)),usable=L-2*corner;
 if(usable<RHYTHM.minPanel+RHYTHM.minPier*.5)return null;
 let n=Math.max(1,Math.round(usable/bay));
 if(odd&&n%2===0)n=Math.abs(usable/(n+1)-bay)<Math.abs(usable/(n-1)-bay)&&usable/(n+1)-spec.pier>=RHYTHM.minPanel?n+1:n-1;
 while(n>1&&usable/n-Math.max(spec.pier,RHYTHM.minPier)<RHYTHM.minPanel)n-=odd?2:1;
 const pitch=usable/n;return {n,pitch,room:n===1?usable:pitch-Math.max(spec.pier,RHYTHM.minPier),corner,centres:Array.from({length:n},(_,i)=>x0+corner+(i+.5)*pitch)};
}
type Placed={col:number;floor:number;x:number;bottom:number;width:number;height:number;shape:FreeOpeningShape;style:FreeOpeningStyle;glazing?:boolean;role:Role;panels:number;panelWidth:number;trimRole?:Role;trimStyle?:RhythmStyle;trimSet?:Settings;trimKey?:string;module?:string};
/**
 * A kit piece as a pool pick: native size, standing on the storey floor, centred on the column. Its tile must fit the
 * column pitch (or the whole usable face for a lone column) and its aperture the column's opening room; doors only on
 * the ground storey.
 */
function placeModule(id:string,col:number,floor:number,x:number,lay:Layout,room:number,floorY:number,floorH:number,faceTop:number):Placed|null{
 const spec=moduleOpeningSpec(id);if(!spec||spec.category==='door'&&floor!==0)return null;
 const tol=FREE_OPENING.moduleTol,aperture=spec.aperture?spec.aperture.x1-spec.aperture.x0:0;
 if(spec.width>(lay.n===1?lay.room+2*lay.corner:lay.pitch)+tol||aperture>room+tol||spec.height>floorH+tol||floorY+spec.height>faceTop+tol)return null;
 return {col,floor,x,bottom:floorY,width:spec.width,height:spec.height,shape:'rect',style:'painted',role:spec.category==='door'&&floor===0?'door':floor===0?'ground':'upper',panels:1,panelWidth:spec.width,module:id};
}
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
const TRIM_SLOTS:Record<TrimKind,string>={lintel:'head',hood:'head',keystone:'crown',shutters:'side','window-box':'sill','sill-brackets':'sill',canopy:'door',lamps:'lamps'};
const choose=<T extends {weight:number}>(items:T[],n:number)=>{const total=items.reduce((a,p)=>a+p.weight,0);if(!items.length||total<=0)return undefined;let pick=n*total;return items.find(p=>(pick-=p.weight)<0)??items.at(-1);};
/** The favourite: the most heavily weighted entry (a seeded pick among ties). */
const favourite=(items:RhythmPoolEntry[],n:number)=>{const top=Math.max(0,...items.map(p=>p.weight));return choose(items.filter(p=>p.weight>=top-1e-9),n);};
const SHOP_SLOT:Slot={shape:'rect',w:3.2,h:3,sill:.5,head:.45,fill:true,glazing:true};
/** Geometry of a pool type on a role's base slot. */
function typeSlot(type:string,role:Role,spec:Spec):{slot:Slot;shape:FreeOpeningShape;role:Role}|null{
 if(type==='blind')return null;
 const floor0=role==='ground'||role==='side';
 if(type==='door'&&floor0)return {slot:spec.door,shape:spec.door.shape,role:'door'};
 if(type==='shop'&&role==='ground')return {slot:spec.ground.kind==='shop'?spec.ground:SHOP_SLOT,shape:'rect',role};
 if(type==='shop')type=role==='side'?'rect':'wide';
 const S:Slot=role==='ground'?(spec.ground.kind==='shop'?{...spec.side}:spec.ground):role==='side'?spec.side:role==='piano'?spec.piano??spec.upper:role==='attic'?spec.attic??spec.upper:spec.upper;
 const single:Slot=S===spec.upper&&spec.upper.single?spec.upper.single:S.panels&&S.panels>1?{...S,panels:undefined,w:Math.min(2,S.w*1.7)}:S;
 const one={...single,panels:undefined,alt:undefined};
 switch(type){
  case 'rect':case 'arch':case 'pointed':case 'round':return {slot:one,shape:type,role};
  case 'tall':case 'door':return {slot:{...one,w:one.w*.9,h:9,sill:Math.min(one.sill,.35),head:.45,fill:false},shape:'rect',role};
  case 'wide':return {slot:{...one,w:Math.max(one.w*1.9,1.8),h:one.h*.85,fill:true},shape:'rect',role};
  case 'paired':case 'triple':{const k=type==='paired'?2:3,base=S.panels===k?S:{...one,panels:k,w:Math.max(RHYTHM.minPanel,one.w*(k===2?.6:.5))};return {slot:{...base,alt:undefined},shape:base.shape==='round'?'rect':base.shape,role};}
 }
 return null;
}

/**
 * Generated free openings and trims for every straight part face. `bays` must be the resolved bays of
 * `r` (hidden walls and exposure); pass the variation-expanded recipe, as resolveStudio does.
 */
export function expandFacadeRhythm(r:StudioRecipe,d:Pick<CityBuildingDesignV3,'groundHeight'|'upperHeight'>,bays?:StudioBay[]):RhythmExpansion{
 const v=r.studio.facadeRhythm,out:RhythmExpansion={freeOpenings:[],freeTrims:[],inactive:[],faces:[]};if(!v)return out;
 const legacy=v.version!==2,allBays=bays??studioBays(r,d as CityBuildingDesignV3),gh=d.groundHeight,uh=d.upperHeight??3,used=new Set<number>();
 // Version 2: explicit kit tiles and storefront stamps are manual spans too (they reserve their tile, see
 // studioKitModuleOpenings); version 1 keeps its rule that a kit opening owns its whole wall.
 const kitFree=legacy?[]:studioKitModuleOpenings(r,d,allBays),manualFree=[...kitFree,...(r.studio.freeOpenings??[])],entry=allBays.find(b=>b.entrance),cellRules=orderedRules(v).filter(({r})=>ruleClass(r)>3);
 const kitFace=(shapeId:string,side:SculptWallSide)=>legacy&&r.studio.openings.some(o=>!o.id.startsWith('generated/')&&o.anchor.shapeId===shapeId&&o.anchor.side===side);
 const manualFace=(shapeId:string,side:SculptWallSide,set:Settings)=>kitFace(shapeId,side)||set.manual==='own'&&manualFree.some(o=>o.shapeId===shapeId&&o.side===side);
 for(const vol of [...r.volumes].filter(x=>x.operation==='add').sort((a,b)=>a.id.localeCompare(b.id))){
  // Faces of this part with their frames, exposure and settings. Columns span the exposed extent of the face
  // (all storeys), so a partly hidden face keeps aligned columns and its door lands on visible wall.
  const faces=straightSides(vol).map(side=>{const f=studioFaceFrame(r,d,vol.id,side);if(!isFrame(f))return null;const exp=exposure(f,allBays),all=[...exp.values()].flat();
   return {side,f,exp,set:effective(v,vol.id,side),extent:(all.length?[Math.min(...all.map(i=>i[0])),Math.max(...all.map(i=>i[1]))]:[0,0]) as Interval};}).filter((x):x is NonNullable<typeof x>=>!!x);
  const plan=(x:typeof faces[number],door:boolean)=>{
   const spec=RHYTHM_SPECS[x.set.style],lay=layout(x.extent,spec,x.set.density,spec.symmetric&&door,legacy?undefined:x.set.bay),doors=new Set<number>();if(!lay||!door)return lay&&{lay,doors};
   // Door columns: the centre for symmetric styles, seeded fractions (stable under resizing) otherwise.
   const R=(...parts:(string|number)[])=>hash([x.set.seeds.ground,`${vol.id}/${x.side}`,...parts].join('/')),at=spec.door.at,first=spec.symmetric?.5:at[Math.floor(R('door')*at.length)],want=[first];
   if(spec.door.second&&lay.n>=spec.door.second)want.push(first===.5?(R('door2')<.5?0:1):1-first);
   for(const p of want){const target=Math.round(p*(lay.n-1)),order=[...lay.centres.keys()].sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||a-b),w=Math.min(spec.door.w,lay.room);if(w<RHYTHM.minDoor-1e-6)break;
    const i=order.find(i=>!doors.has(i)&&[i-1,i+1].every(j=>!doors.has(j))&&inside(x.exp.get(0),lay.centres[i]-w/2,lay.centres[i]+w/2));if(i!==undefined)doors.add(i);}
   return {lay,doors};
  };
  // The door goes on the entrance face, else the most street-facing face that can take one.
  const open=(x:typeof faces[number])=>!x.set.off&&x.exp.size>0&&!manualFace(vol.id,x.side,x.set),plans=new Map<SculptWallSide,ReturnType<typeof plan>>();
  // A part that already has a manual door (free or kit) gets no generated one.
  const manualDoor=vol.startFloor===0&&(manualFree.some(o=>o.shapeId===vol.id&&(legacy?o.shape!=='round'&&o.bottom<=FREE_OPENING.doorSill:freeOpeningIsDoor(o)))||r.studio.openings.some(o=>!o.id.startsWith('generated/')&&o.anchor.shapeId===vol.id&&o.anchor.floor===0&&o.module.startsWith('door-')));
  if(vol.startFloor===0&&!manualDoor)for(const x of faces.filter(x=>open(x)&&x.exp.get(0)?.some(([a,b])=>b-a>=1.6)).sort((a,b)=>(entry?.anchor.shapeId===vol.id?Number(b.side===entry.anchor.side)-Number(a.side===entry.anchor.side):0)||b.f.normal[1]-a.f.normal[1]||b.f.length-a.f.length)){const p=plan(x,true);if(p?.doors.size){plans.set(x.side,p);break;}}
  for(const {side,f,exp,set,...x} of faces){
   set.matched.forEach(i=>used.add(i));
   const spec=RHYTHM_SPECS[set.style],base:RhythmFace={shapeId:vol.id,side,status:'generated',style:set.style,columns:0,street:false,door:false,openings:0};
   const faceCells=cellRules.filter(({r})=>(!r.partId||r.partId===vol.id)&&(!r.side||r.side===side)&&r.fromFloor===undefined||(!r.partId||r.partId===vol.id)&&(!r.side||r.side===side)&&r.toFloor!>=vol.startFloor&&r.fromFloor!<=vol.startFloor+vol.spanFloors-1);
   if(exp.size)faceCells.forEach(({i})=>used.add(i));
   if(set.off&&!faceCells.length){out.faces.push({...base,status:'off'});continue;}
   if(!exp.size){out.faces.push({...base,status:'hidden'});continue;}
   if(manualFace(vol.id,side,set)){out.faces.push({...base,status:'manual'});continue;}
   const p=plans.get(side)??plan({side,f,exp,set,...x},false);
   if(!p){out.faces.push({...base,status:'narrow'});continue;}
   const {lay,doors}=p,street=vol.startFloor===0&&(doors.size>0||f.normal[1]>.7);
   const key=`${vol.id}/${side}`,col=(i:number)=>spec.symmetric?Math.min(i,lay.n-1-i):i,R=(layer:RhythmLayer,...parts:(string|number)[])=>hash([set.seeds[layer],key,...parts].join('/'));
   const top=vol.startFloor+vol.spanFloors-1,placed:Placed[]=[];
   if(legacy){
    // Version 1: the original generator, unchanged.
    const blind=new Set<number>();if(spec.upper.blind&&lay.n>=3)for(let i=0;i<lay.n;i++)if(R('upper','blind',col(i))<spec.upper.blind*set.variety&&blind.size<lay.n-2)blind.add(i);
    // Building-wide choices (per style) keep all faces of a style consistent; a rule's own seeds still set it apart.
    const B=(layer:RhythmLayer,...parts:(string|number)[])=>hash([set.seeds[layer],set.style,...parts].join('/'));
    const pairSingle=spec.upper.single&&B('upper','single')<set.variety*.5;
    for(let floor=vol.startFloor;floor<=top;floor++){
     const floorY=sculptFloorBottom(floor,gh,uh)-f.base,floorH=floor?uh:gh,list=exp.get(floor);if(!list)continue;
     const role:Role=floor===0?(street?'ground':'side'):floor===1&&spec.piano&&top>=2?'piano':floor===top&&floor>=2&&spec.attic?'attic':'upper';
     const layer:RhythmLayer=floor===0?'ground':role==='attic'?'attic':'upper';
     const slot0:Slot=role==='ground'?spec.ground:role==='side'?spec.side:role==='piano'?spec.piano!:role==='attic'?spec.attic!:pairSingle?spec.upper.single!:spec.upper;
     const faceRoll=B(layer,role,'face'),altRoll=B(layer,role,'alt');
     lay.centres.forEach((x,i)=>{
      if(floor===0&&doors.has(i)){const p=place(spec.door,'door',spec,spec.door.shape,i,floor,x,Math.min(lay.room,faceMaxOpeningWidth(f,x)),floorY,floorH,f.height);if(p&&inside(list,x-p.width/2,x+p.width/2))placed.push(p);return;}
      if(floor>0&&blind.has(i)&&role!=='attic')return;
      const shape=pickShape(slot0,set.variety,faceRoll,R(layer,role,'col',col(i)),altRoll);
      const p=place(slot0,role,spec,shape,i,floor,x,Math.min(lay.room,faceMaxOpeningWidth(f,x)),floorY,floorH,f.height);
      if(p&&inside(list,x-p.width/2,x+p.width/2))placed.push(p);
     });
    }
   }else{
    // Version 2: every cell draws from its layer pool (style preset + overrides, scoped per cell).
    for(let floor=vol.startFloor;floor<=top;floor++){
     const floorY=sculptFloorBottom(floor,gh,uh)-f.base,floorH=floor?uh:gh,list=exp.get(floor);if(!list)continue;
     const row:{p:Placed|null;cov:number;coverage:number;retry:()=>Placed|null}[]=[];
     lay.centres.forEach((x,i)=>{
      // Cell settings: face settings plus floor/region rules that cover this storey and column centre.
      let cf=set.fold;for(const {r} of faceCells)if(ruleContains(r,{partId:vol.id,side,fromFloor:floor,toFloor:floor,x0:x,x1:x}))cf=foldRule(cf,r);
      const cs=cf===set.fold?set:settle(cf,v);if(cs.off)return;
      const cspec=RHYTHM_SPECS[cs.style],c=col(i);
      if(floor===0&&doors.has(i)){const p=place(spec.door,'door',spec,spec.door.shape,i,floor,x,Math.min(lay.room,faceMaxOpeningWidth(f,x)),floorY,floorH,f.height);if(p&&inside(list,x-p.width/2,x+p.width/2))placed.push({...p,trimRole:'door',trimStyle:cs.style,trimSet:cs,trimKey:`${c}/${floor}`});return;}
      const role:Role=floor===0?(street?'ground':'side'):floor===1&&cspec.piano&&top>=2?'piano':floor===top&&floor>=2?'attic':'upper';
      const poolLayer:RhythmPoolLayer=floor===0?'ground':role==='attic'?'attic':'upper',seedLayer:RhythmLayer=poolLayer==='attic'&&!cspec.attic&&!cf.layers.attic?'upper':poolLayer as RhythmLayer;
      let L=layerRule(cf,poolLayer);if(floor>0&&lay.n>=3&&(i===0||i===lay.n-1)&&cf.layers.corners)L={...L,...cf.layers.corners};
      const CR=(...parts:(string|number)[])=>hash([cs.seeds[seedLayer],key,...parts].join('/')),CB=(...parts:(string|number)[])=>hash([cs.seeds[seedLayer],cs.style,...parts].join('/'));
      const pk=L.pattern==='aligned'?`c${c}`:L.pattern==='groups'?`g${Math.floor(c/2)}/${Math.floor(floor/2)}`:L.pattern==='alternating'?`c${c}/${floor%2}`:`c${c}/${floor}`;
      const spaced=c%(L.spacing+1)===0,cov=CR('coverage',pk),pick=()=>{const type=CR('uniform',pk)<L.uniformity?favourite(L.pool,CB('dominant')):choose(L.pool,CR('pick',pk));
       // Kit pieces from the pool: the tile stands on the storey floor, centred on its column.
       const kit=type&&poolModule(type.id);if(kit){const p=placeModule(kit,i,floor,x,lay,Math.min(lay.room,faceMaxOpeningWidth(f,x)),floorY,floorH,f.height);return p&&inside(list,x-p.width/2+RHYTHM.pad,x+p.width/2-RHYTHM.pad)?{...p,trimKey:`${c}/${floor}`} as Placed:null;}
       const t=type&&typeSlot(type.id,role,cspec);if(!t)return null;
       const p=place(t.slot,t.role,cspec,t.shape,i,floor,x,Math.min(lay.room,faceMaxOpeningWidth(f,x)),floorY,floorH,f.height);if(!p||!inside(list,x-p.width/2,x+p.width/2))return null;
       return {...p,trimRole:t.role==='door'?'door':role==='attic'&&!cspec.attic?'upper':role,trimStyle:cs.style,trimSet:cs,trimKey:`${c}/${floor}`} as Placed;};
      if(!spaced)return;
      row.push({p:cov>=L.coverage?null:pick(),cov,coverage:L.coverage,retry:pick});
     });
     // Coverage never blanks a whole storey while it is above zero: the closest roll opens.
     const mostlyOpen=row.filter(c=>c.coverage>=.5);
     if(mostlyOpen.length&&row.every(c=>c.cov>=c.coverage)){const best=[...mostlyOpen].sort((a,b)=>a.cov-a.coverage-(b.cov-b.coverage))[0];best.p=best.retry();}
     for(const c of row)if(c.p)placed.push(c.p);
    }
   }
   // Trims: one seeded option per role (building-wide per style), filtered by what each opening can carry.
   let count=0;
   for(const p of placed){
    const k0=p.panels,ids:string[]=[],cells:StudioFreeOpening[]=[];
    for(let j=0;j<k0;j++){
     const cx=p.x-p.width/2+p.panelWidth/2+j*(p.panelWidth+RHYTHM.panelGap),id=`generated/rhythm/${key}/${p.floor}/c${p.col}/${j}`;
     cells.push(p.module?{id,shapeId:vol.id,side,u:faceU(f,cx),bottom:p.bottom,width:p.width,height:p.height,shape:'rect',module:p.module}:{id,shapeId:vol.id,side,u:faceU(f,cx),bottom:p.bottom,width:p.panelWidth,height:p.height,shape:p.shape,style:p.style,...(p.glazing!==undefined?{glazing:p.glazing}:{})});
    }
    const clash=(o:StudioFreeOpening)=>manualFree.some(m=>m.shapeId===vol.id&&m.side===side&&Math.abs(m.u*f.length-o.u*f.length)<(m.width+o.width)/2+RHYTHM.fillGap&&m.bottom<o.bottom+o.height+RHYTHM.fillRise&&o.bottom<m.bottom+m.height+RHYTHM.fillRise);
    // Fill: manual openings reserve their span plus a margin. Version 2 drops the whole cell (a pair never loses one panel).
    const fill=set.manual==='fill';
    if(fill&&!legacy&&cells.some(clash))continue;
    for(const o of cells){if(fill&&legacy&&clash(o))continue;out.freeOpenings.push(o);ids.push(o.id);count++;}
    // Kit pieces bring their own trims.
    const ts=p.trimSet??set,level=ts.trims;if(level==='none'||!ids.length||p.module)continue;
    const trimRule=legacy?undefined:ts.fold.layers.trims,role=p.trimRole??p.role;
    if(trimRule?.pool||trimRule?.coverage!==undefined){
     // Trim pool: coverage per opening, then one weighted kind per slot (head, crown, side, sill, door, lamps).
     const L=layerRule(ts.fold,'trims'),c=p.trimKey??`${p.col}/${p.floor}`,[cc,ff]=c.split('/'),pk=L.pattern==='aligned'?`c${cc}`:L.pattern==='groups'?`g${Math.floor(Number(cc)/2)}/${Math.floor(Number(ff)/2)}`:L.pattern==='alternating'?`c${cc}/${Number(ff)%2}`:`c${cc}/${ff}`;
     const T=(...parts:(string|number)[])=>hash([ts.seeds.trims,key,...parts].join('/'));
     if(T('coverage',pk)>=L.coverage||Number(cc)%(L.spacing+1))continue;
     const allowed=L.pool.filter(e=>trimAllowed(e.id as TrimKind,p)),slots=[...new Set(allowed.map(e=>TRIM_SLOTS[e.id as TrimKind]))],kinds=new Set<TrimKind>();
     for(const s of slots){const inSlot=allowed.filter(e=>TRIM_SLOTS[e.id as TrimKind]===s),e=T('uniform',s,pk)<L.uniformity?favourite(inSlot,hash([ts.seeds.trims,ts.style,s].join('/'))):choose(inSlot,T('pick',s,pk));if(e)kinds.add(e.id as TrimKind);}
     const list=FREE_TRIM_KINDS.filter(k=>kinds.has(k));if(list.length)out.freeTrims.push({openingId:ids[0],kinds:list});
     continue;
    }
    const tstyle=p.trimStyle??set.style,options=RHYTHM_SPECS[tstyle].trims[level][role];if(!options?.length)continue;
    const kinds=FREE_TRIM_KINDS.filter(k=>options[Math.floor(hash(`${ts.seeds.trims}/${tstyle}/${role}`)*options.length)].includes(k)&&trimAllowed(k,p));
    if(kinds.length)out.freeTrims.push({openingId:ids[0],kinds});
   }
   out.faces.push({...base,columns:lay.n,street,door:doors.size>0,openings:count});
  }
 }
 (v.rules??[]).forEach((rule,i)=>{if(!used.has(i)&&!rule.off)out.inactive.push({id:`facade-rhythm/rule/${rule.partId??'*'}/${rule.side??'*'}${rule.fromFloor!==undefined?`/floors-${rule.fromFloor}-${rule.toFloor}`:''}${rule.x0!==undefined?`/x-${rule.x0}-${rule.x1}`:''}`,reason:'This rhythm rule has no wall to dress.'});});
 return out;
}
export const facadeRhythmFaces=(r:StudioRecipe,d:CityBuildingDesignV3,bays?:StudioBay[])=>r.studio.facadeRhythm?expandFacadeRhythm(r,d,bays??studioBays(expandBuildingVariation(r,d).recipe,d)).faces:[];

/**
 * Turn generated openings (and their trims) into manual free openings: one face, or all of them (which
 * also removes the rhythm). The face then belongs to the user (a "keep manual" rule is added when the
 * rhythm fills around manual openings); resolved geometry is unchanged.
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
 let next:StudioRecipe={...r,studio:{...r.studio,freeOpenings,...(freeTrims.length?{freeTrims}:{})}};
 if(!face){const studio={...next.studio};delete studio.facadeRhythm;next={...next,studio};}
 else if(r.studio.facadeRhythm.version===2&&effective(r.studio.facadeRhythm,face.shapeId,face.side).manual==='fill'){const t={partId:face.shapeId,side:face.side};next=setFacadeRhythmRule(next,t,{...r.studio.facadeRhythm.rules?.find(x=>sameTarget(x,t)),manual:'own'});}
 return {recipe:next,ids:opened.map(o=>o.id)};
}
