/**
 * Facade theme recipe operations (local construction studio; docs/city-studio-themes.md). Every function is pure and
 * returns a new recipe; the studio commits each as one labelled undo step.
 *
 *  applyFacadeTheme(recipe, design, themeId, {partId?, seed?, palette?})
 *     Themes one part (partId) or the whole building (replacing every part theme). It converts a kit-tile building to
 *     unified facades first, switches to the Blender catalogue, writes the theme's rhythm (style, variety, trims, bay,
 *     density, layer pools) at that scope, its colours and roof, and stores the reference. The rhythm scope's own
 *     style and pool overrides are replaced; plain and manual wall rules are kept.
 *  setThemeTune / toggleThemeLock / rerollTheme / cycleThemePalette    panel controls (aspects: shops, decorations, roof)
 *  removeFacadeTheme      drops the reference: storefronts, decorations, paint rules and roof props go; the rhythm,
 *                         colours and roof stay as ordinary settings
 *  detachFacadeTheme      turns storefronts, paint rules, kit strips, the entrance and roof props into ordinary items
 *                         and keeps the decorations resolving from a detached reference
 *  themeStarterRecipe     a standard box building for an empty plot, themed
 */
import {FACADE_THEMES,THEME_MAP,themeAspects,type FacadeTheme,type StudioThemeRef,type ThemeAspect} from './cityStudioThemeCatalog.ts';
import {newFacadeRhythm,shuffleFacadeRhythm,type FacadeRhythm,type FacadeRhythmRule} from './cityStudioFacadeRhythm.ts';
import {convertToUnifiedFacade,isKitTileBuilding} from './cityStudioUnifiedFacade.ts';
import {expandFacadeThemes} from './cityStudioThemeExpand.ts';
import {THEME_ROOF_SPOTS} from './cityStudioThemeDecor.ts';
import {freshStudio,validateStudio} from './cityStudio.ts';
import {resolveSculpt} from './citySculpt.ts';
import type {StudioChannel,StudioFinish,StudioPartStyle,StudioRecipe} from './cityStudioTypes.ts';
import type {CityBuildingDesignV3} from './cityBuildingV3.ts';

export {FACADE_THEMES,THEME_MAP};
const scopeId=(partId?:string)=>partId?`part-${partId}`:'building';
/** The reference stored at exactly this scope (a part's own, or the building's). */
export const themeRefAt=(r:StudioRecipe,partId?:string)=>r.studio.facadeThemes?.find(x=>x.partId===partId);
/** The theme that dresses a part: its own, else the building's. */
export const effectiveThemeRef=(r:StudioRecipe,partId:string)=>themeRefAt(r,partId)??themeRefAt(r);
const finishesOf=(t:FacadeTheme,palette:number):Partial<Record<StudioChannel,StudioFinish>>=>{const p=t.look.palettes[palette%t.look.palettes.length];return {wall:{...p.wall},trim:{color:p.trim},frame:{color:p.frame},door:{color:p.door}};};
/** A rhythm rule without its styling: only its wall target and the plain / keep-manual switches survive. */
const strip=(x:FacadeRhythmRule):FacadeRhythmRule|null=>{const out:FacadeRhythmRule={};for(const k of ['partId','side','fromFloor','toFloor','x0','x1','off','manual'] as const)if(x[k]!==undefined)(out as Record<string,unknown>)[k]=x[k];return out.off!==undefined||out.manual!==undefined?out:null;};
const rhythmFields=(t:FacadeTheme,layers?:FacadeRhythm['layers'])=>{const x=t.rhythm,l=layers??x.layers;return {style:x.style,variety:x.variety,trims:x.trims,...(x.bay!==undefined?{bay:x.bay}:{}),...(x.density!==undefined?{density:x.density}:{}),...(l?{layers:structuredClone(l)}:{})};};

/** Options for applying a theme. tune/locks/seeds/layers carry a picked-up look (the theme brush eyedropper). */
export type ApplyThemeOptions={partId?:string;seed?:number;palette?:number;tune?:StudioThemeRef['tune'];locks?:ThemeAspect[];seeds?:StudioThemeRef['seeds'];layers?:FacadeRhythm['layers']};
export function applyFacadeTheme(input:StudioRecipe,d:CityBuildingDesignV3,themeId:string,options:ApplyThemeOptions={}):{recipe:StudioRecipe;label:string}|{reason:string}{
 const t=THEME_MAP.get(themeId);if(!t)return {reason:'This theme is unavailable.'};
 const partId=options.partId;
 if(partId&&!input.volumes.some(v=>v.id===partId&&v.operation==='add'))return {reason:'Choose a solid part to theme.'};
 if(!input.volumes.some(v=>v.operation==='add'))return {reason:'Draw a part first, or start from a theme in Build.'};
 let r=input;
 if(r.studio.facade!=='unified'){
  if(isKitTileBuilding(r)){const c=convertToUnifiedFacade({...r,studio:{...r.studio,catalogue:'synarc-kit-5',assemblyRevision:r.studio.assemblyRevision??'connected-access-1'}},d);if('reason' in c)return c;r=c.recipe;}
  else r={...r,studio:{...r.studio,facade:'unified'}};
 }
 r=structuredClone(r);const s=r.studio;
 s.catalogue='synarc-kit-5';s.assemblyRevision??='connected-access-1';s.roofRevision='roof-envelope-2';
 const seed=options.seed??Math.floor(Math.random()*1000000),palette=(options.palette??seed)%t.look.palettes.length;
 const aspects=new Set<ThemeAspect>(themeAspects(t)),only=<V,>(o:Partial<Record<ThemeAspect,V>>|undefined)=>{const out=Object.fromEntries(Object.entries(o??{}).filter(([a])=>aspects.has(a as ThemeAspect)));return Object.keys(out).length?out as Partial<Record<ThemeAspect,V>>:undefined;};
 const tune=only(options.tune),seeds=only(options.seeds),locks=options.locks?.filter(a=>aspects.has(a));
 const ref:StudioThemeRef={id:scopeId(partId),theme:t.id,...(partId?{partId}:{}),seed,palette,...(tune?{tune}:{}),...(locks?.length?{locks}:{}),...(seeds?{seeds}:{})};
 s.facadeThemes=[...(partId?(s.facadeThemes??[]).filter(x=>x.partId!==partId):[]),ref];
 // Rhythm: the theme's settings at its scope; styling below that scope is replaced (plain/manual walls stay).
 const base:FacadeRhythm=s.facadeRhythm?{...s.facadeRhythm,version:2}:newFacadeRhythm(t.rhythm.style,seed%100000);
 if(!partId){
  const rules=(base.rules??[]).map(strip).filter((x):x is FacadeRhythmRule=>!!x);
  s.facadeRhythm={version:2,seed:base.seed,...rhythmFields(t,options.layers),...(base.locks?{locks:base.locks}:{}),...(rules.length?{rules}:{})};
 }else{
  const rules=(base.rules??[]).map(x=>x.partId===partId?strip(x):x).filter((x):x is FacadeRhythmRule=>!!x),at=rules.findIndex(x=>x.partId===partId&&x.side===undefined&&x.fromFloor===undefined&&x.x0===undefined);
  const rule:FacadeRhythmRule={...(at>=0?rules[at]:{partId}),...rhythmFields(t,options.layers),seed:seed%1000000};
  if(at>=0)rules[at]=rule;else rules.push(rule);
  s.facadeRhythm={...base,rules};
 }
 // Look: family, colours and roof at the scope.
 const look:StudioPartStyle={family:t.look.family,finishes:finishesOf(t,palette),roof:t.look.roof,...(t.look.roofSettings?{roofSettings:{...t.look.roofSettings}}:{})};
 if(!partId){
  s.defaults={...s.defaults,...look};if(!t.look.roofSettings)delete s.defaults.roofSettings;
  for(const [id,p] of Object.entries(s.parts)){const q={...p};delete q.family;delete q.finishes;delete q.roof;delete q.roofSettings;s.parts[id]=q;}
 }else{const p={...s.parts[partId],...look};if(!t.look.roofSettings)delete p.roofSettings;s.parts[partId]=p;}
 return {recipe:r,label:`${partId?'Theme part':'Theme building'}: ${t.label}`};
}
const withRefs=(r:StudioRecipe,map:(x:StudioThemeRef)=>StudioThemeRef|null,partId?:string):StudioRecipe=>{
 const refs=(r.studio.facadeThemes??[]).map(x=>x.partId===partId?map(x):x).filter((x):x is StudioThemeRef=>!!x),studio={...r.studio};
 if(refs.length)studio.facadeThemes=refs;else delete studio.facadeThemes;return {...r,studio};
};
export function setThemeTune(r:StudioRecipe,partId:string|undefined,aspect:ThemeAspect,value:number|null):StudioRecipe{
 return withRefs(r,x=>{const tune={...x.tune};if(value===null)delete tune[aspect];else tune[aspect]=Math.round(Math.max(0,Math.min(1,value))*100)/100;const n:StudioThemeRef={...x,tune};if(!Object.keys(tune).length)delete n.tune;return n;},partId);
}
export function toggleThemeLock(r:StudioRecipe,partId:string|undefined,aspect:ThemeAspect):StudioRecipe{
 return withRefs(r,x=>{const locks=x.locks?.includes(aspect)?x.locks.filter(a=>a!==aspect):[...(x.locks??[]),aspect],n:StudioThemeRef={...x,locks};if(!locks.length)delete n.locks;return n;},partId);
}
/** Dice: every unlocked aspect (or just `aspect`) gets a new seed, and the rhythm at the scope reshuffles its unlocked layers. */
export function rerollTheme(r:StudioRecipe,partId?:string,aspect?:ThemeAspect|'rhythm'):StudioRecipe{
 const ref=themeRefAt(r,partId),t=ref&&THEME_MAP.get(ref.theme);if(!ref||!t)return r;
 let next=aspect==='rhythm'?r:withRefs(r,x=>{const seeds={...x.seeds};for(const a of aspect?[aspect]:themeAspects(t))if(!x.locks?.includes(a))seeds[a]=((seeds[a]??0)+1)%1000000;return {...x,seeds};},partId);
 const rhythm=next.studio.facadeRhythm;
 if(rhythm&&(!aspect||aspect==='rhythm'))next={...next,studio:{...next.studio,facadeRhythm:shuffleFacadeRhythm(rhythm,partId?{partId}:undefined)}};
 return next;
}
export function cycleThemePalette(r:StudioRecipe,partId?:string):StudioRecipe{
 const ref=themeRefAt(r,partId),t=ref&&THEME_MAP.get(ref.theme);if(!ref||!t)return r;
 const palette=((ref.palette??0)+1)%t.look.palettes.length,next=withRefs(r,x=>({...x,palette}),partId),s={...next.studio};
 if(partId)s.parts={...s.parts,[partId]:{...s.parts[partId],finishes:finishesOf(t,palette)}};else s.defaults={...s.defaults,finishes:finishesOf(t,palette)};
 return {...next,studio:s};
}
export const removeFacadeTheme=(r:StudioRecipe,partId?:string)=>withRefs(r,()=>null,partId);
/**
 * Detach: the theme's storefronts, paint rules, kit strips, entrance and roof props become ordinary items (editable,
 * erasable); the reference stays, detached, so its decorations keep resolving. Limits of ordinary items apply.
 */
export function detachFacadeTheme(r:StudioRecipe,d:CityBuildingDesignV3,partId?:string):{recipe:StudioRecipe;notes:string[]}|{reason:string}{
 const ref=themeRefAt(r,partId);if(!ref)return {reason:'No theme to detach here.'};if(ref.detached)return {reason:'This theme is already detached.'};
 const expanded=expandFacadeThemes(r,d),notes:string[]=[],next=structuredClone(r),s=next.studio,tag=`${ref.id}-${Math.floor(Date.now()%1e6).toString(36)}`;
 const stamps=(expanded.studio.stamps??[]).filter(x=>x.id.startsWith(`theme-${ref.id}-`)).map((x,i)=>({...x,id:`detached-${tag}-${i}`}));
 const paint=(expanded.studio.paintRules??[]).filter(x=>x.id.startsWith(`theme/${ref.id}/`)).map((x,i)=>({...x,id:`detached-${tag}-paint-${i}`}));
 const free=(expanded.studio.freeOpenings??[]).filter(x=>x.id.startsWith(`generated/theme/${ref.id}/`)).map((x,i)=>({...x,id:`detached-${tag}-${i}`}));
 let roof:NonNullable<StudioRecipe['studio']['roofDetails']>=[];
 try{roof=(resolveSculpt(r,d).studio?.pieces??[]).filter(p=>p.id.startsWith(`theme/${ref.id}/roof/`)).map((p,i)=>{const bits=p.id.split('/'),[u,v]=THEME_ROOF_SPOTS[Number(bits.at(-1))]??[0,0];return {id:`detached-${tag}-roof-${i}`,partId:bits.at(-2)!,module:p.module,u,v,rotation:((Math.round(p.rotation/(Math.PI/2))%4)+4)%4};});}catch{roof=[];}
 const room=(limit:number,have:number,list:unknown[],what:string)=>{const keep=Math.max(0,limit-have);if(list.length>keep)notes.push(`${list.length-keep} ${what} left out (limit ${limit}).`);return keep;};
 if(stamps.length)s.stamps=[...(s.stamps??[]),...stamps.slice(0,room(32,s.stamps?.length??0,stamps,'storefronts'))];
 if(paint.length)s.paintRules=[...paint.slice(0,room(24,s.paintRules?.length??0,paint,'paint rules')),...(s.paintRules??[])];
 if(free.length)s.freeOpenings=[...(s.freeOpenings??[]),...free];
 if(roof.length)s.roofDetails=[...(s.roofDetails??[]),...roof.slice(0,room(16,s.roofDetails?.length??0,roof,'roof props'))];
 s.facadeThemes=(s.facadeThemes??[]).map(x=>x.id===ref.id?{...x,detached:true}:x);
 const error=validateStudio(next);if(error)return {reason:error};
 return {recipe:next,notes};
}
/** A standard box building themed as a whole, for an empty plot (clamped to the plot). */
export function themeStarterRecipe(r:StudioRecipe|null,d:CityBuildingDesignV3,themeId:string,plotSize:24|48=24,seed?:number):{recipe:StudioRecipe;label:string}|{reason:string}{
 const t=THEME_MAP.get(themeId);if(!t)return {reason:'This theme is unavailable.'};
 const max=plotSize===48?20:19,{width,depth,floors}=t.starter;
 void r;const base:StudioRecipe={version:5,plotSize,attachments:[],volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:Math.min(max,width),depth:Math.min(max,depth),startFloor:0,spanFloors:floors}],studio:{...freshStudio(),catalogue:'synarc-kit-5',facade:'unified'}};
 return applyFacadeTheme(base,d,themeId,{seed:seed??Math.floor(Math.random()*1000000)});
}
