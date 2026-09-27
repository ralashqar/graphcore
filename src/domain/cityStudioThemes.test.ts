// Facade themes (docs/city-studio-themes.md): every theme resolves completely on both plot sizes and on a curved
// part, determinism per seed, re-fit after resizing, hand-placed items kept, business validators reject the field,
// and the panel operations (tune, lock, reroll, palette, detach, remove) behave.
import test from 'node:test';
import assert from 'node:assert/strict';
import {FACADE_THEMES,THEME_MAP,THEME_ASPECTS,THEME_DECOR_DEFAULTS,themeAspects,themeForStyle,validateFacadeThemes} from './cityStudioThemeCatalog.ts';
import {applyFacadeTheme,cycleThemePalette,detachFacadeTheme,removeFacadeTheme,rerollTheme,setThemeTune,themeStarterRecipe,toggleThemeLock} from './cityStudioThemes.ts';
import {familyStamps,expandFacadeThemes} from './cityStudioThemeExpand.ts';
import {STUDIO_MODULE_MAP,streetModule} from './cityStudioCatalog.ts';
import {STAMP_MAP} from './cityStorefrontStamps.ts';
import {RHYTHM_STYLE_IDS,validateFacadeRhythm} from './cityStudioFacadeRhythm.ts';
import {moduleOpeningSpec,poolModule} from './cityStudioModuleSpec.ts';
import {freshStudio,validateStudio} from './cityStudio.ts';
import {resolveSculpt} from './citySculpt.ts';
import {validateModularBuilding} from './cityBuildingVariation.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import {newDesign,type CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const design:CityBuildingDesignV3={...newDesign('themes'),groundHeight:3.6};
const withFloors=(r:StudioRecipe):CityBuildingDesignV3=>({...design,floors:Math.max(1,...r.volumes.map(v=>v.startFloor+v.spanFloors))});
const box=(width:number,depth:number,floors:number,plotSize:24|48=24,extra:StudioRecipe['volumes']=[]):StudioRecipe=>({version:5,plotSize,attachments:[],volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width,depth,startFloor:0,spanFloors:floors},...extra],studio:{...freshStudio(),catalogue:'synarc-kit-5',facade:'unified'}});
const resolve=(r:StudioRecipe)=>resolveSculpt(r,withFloors(r)).studio!;
const apply=(r:StudioRecipe,id:string,options:{partId?:string;seed?:number}={})=>{const out=applyFacadeTheme(r,withFloors(r),id,{seed:7,...options});if('reason' in out)throw Error(`${id}: ${out.reason}`);return out.recipe;};
const themed=(pieces:{id:string}[])=>pieces.filter(p=>p.id.startsWith('theme/'));

test('theme catalogue: at least 24 themes, valid rhythm, kit modules, stamps and a legacy map for every old style',()=>{
 assert.ok(FACADE_THEMES.length>=24,`${FACADE_THEMES.length} themes`);
 assert.equal(new Set(FACADE_THEMES.map(t=>t.id)).size,FACADE_THEMES.length);
 for(const t of FACADE_THEMES){
  assert.ok(t.blurb.length>20&&t.label&&t.tags.length,t.id);
  assert.equal(validateFacadeRhythm({version:2,seed:1,...t.rhythm}),null,`${t.id}: rhythm`);
  for(const layer of Object.values(t.rhythm.layers??{}))for(const p of layer?.pool??[]){const m=poolModule(p.id);if(m)assert.ok(moduleOpeningSpec(m),`${t.id}: ${m}`);}
  for(const x of t.decor)for(const [m] of x.modules??THEME_DECOR_DEFAULTS[x.kind])assert.ok(STUDIO_MODULE_MAP.has(m),`${t.id}: ${m}`);
  for(const x of t.decor.filter(x=>x.kind==='street'))for(const [m] of x.modules??[])assert.ok(streetModule(m),`${t.id}: street ${m}`);
  for(const [family] of t.shops?.pool??[])assert.ok(familyStamps(family).length&&familyStamps(family).every(s=>STAMP_MAP.has(s.id)),`${t.id}: ${family}`);
  if(t.shops?.entrance)assert.equal(moduleOpeningSpec(t.shops.entrance.module)?.category,'door',t.id);
  for(const [m] of t.roof?.pool??[])assert.equal(STUDIO_MODULE_MAP.get(m)?.category,'roof',`${t.id}: ${m}`);
  assert.ok(t.look.palettes.length>=1&&t.look.palettes.length<=8);
 }
 for(const style of RHYTHM_STYLE_IDS)assert.ok(themeForStyle(style),`old style ${style} maps to a theme`);
});

test('every theme resolves with nothing inactive on 24 m and 48 m plots and on a curved part',()=>{
 for(const t of FACADE_THEMES){
  for(const plot of [24,48] as const){
   const s=t.starter,r=apply(box(Math.min(19,s.width),Math.min(19,s.depth),s.floors,plot),t.id);
   assert.equal(validateStudio(r),null,t.id);
   const out=resolve(r);
   assert.deepEqual(out.inactive,[],`${t.id} on ${plot} m`);
   assert.equal(new Set(out.pieces.map(p=>p.id)).size,out.pieces.length,`${t.id}: unique piece ids`);
   assert.ok((out.freeFaces?.length??0)>=4,`${t.id}: generated walls`);
  }
  // A themed wing plus a round tower themed by the building theme.
  const r=apply(box(12,9,3,24,[{id:'tower',kind:'ellipse',operation:'add',x:6,z:-4,width:6,depth:6,startFloor:0,spanFloors:4}]),t.id);
  assert.deepEqual(resolve(r).inactive,[],`${t.id} with a curved part`);
 }
});

test('themes produce their decorations, storefronts and roof props',()=>{
 const pieces=(id:string)=>{const t=THEME_MAP.get(id)!,r=apply(box(t.starter.width,t.starter.depth,t.starter.floors),id);return resolve(r).pieces;};
 const nyc=pieces('nyc-tenement'),mods=new Set(nyc.map(p=>p.module));
 assert.ok(themed(nyc).some(p=>p.id.includes('/fire-escape/')),'fire escape');
 assert.ok(mods.has('nyc-cornice')&&mods.has('nyc-band'),'cornice and belt');
 assert.ok(nyc.some(p=>p.id.startsWith('stamp/theme-')),'storefronts');
 assert.ok(themed(nyc).some(p=>p.id.includes('/roof/')),'roof props');
 const tokyo=pieces('tokyo-zakkyo');
 assert.ok(tokyo.some(p=>p.module==='wall-tokyo-sign'||p.module==='wall-tokyo-sign-flat'),'vertical signs');
 assert.ok(tokyo.some(p=>p.module.startsWith('tokyo-roof-')),'Tokyo roof props');
 const paris=pieces('paris-haussmann');
 assert.ok(themed(paris).filter(p=>p.id.includes('/balcony-run/')).length>=2,'continuous balconies on the 2nd and 5th floors');
 const seaside=pieces('seaside');assert.ok(themed(seaside).some(p=>p.id.includes('/awning/')),'awnings');
 const brut=pieces('brutalist-civic');assert.ok(themed(brut).filter(p=>p.id.includes('/pier/')).length>=8,'fins between columns');
});

test('determinism per seed, and a new seed changes the look',()=>{
 for(const id of ['tokyo-zakkyo','nyc-tenement','mediterranean-village']){
  const t=THEME_MAP.get(id)!,a=resolve(apply(box(t.starter.width,t.starter.depth,t.starter.floors),id,{seed:11})),b=resolve(apply(box(t.starter.width,t.starter.depth,t.starter.floors),id,{seed:11}));
  assert.deepEqual(a.pieces.map(p=>[p.id,p.module,+p.x.toFixed(4)]),b.pieces.map(p=>[p.id,p.module,+p.x.toFixed(4)]),id);
  const c=resolve(apply(box(t.starter.width,t.starter.depth,t.starter.floors),id,{seed:12}));
  assert.notDeepEqual(a.pieces.map(p=>[p.id,p.module]),c.pieces.map(p=>[p.id,p.module]),`${id}: another seed differs`);
 }
});

test('re-fit after resize: decorations follow the new length and nothing goes inactive',()=>{
 const r=apply(box(10,10,5),'nyc-tenement');
 const wide=structuredClone(r);wide.volumes[0].width=18;
 const a=resolve(r),b=resolve(wide);
 assert.deepEqual(b.inactive,[]);
 const count=(o:typeof a,what:string)=>themed(o.pieces).filter(p=>p.id.includes(what)).length;
 assert.ok(b.pieces.filter(p=>p.id.startsWith('stamp/theme-')).length>a.pieces.filter(p=>p.id.startsWith('stamp/theme-')).length,'more shops on the wider front');
 assert.ok(count(b,'/cornice')>=count(a,'/cornice'));
 // The theme is stored as a reference, not as placed items.
 assert.deepEqual(r.studio.facadeThemes?.length,1);assert.equal(r.studio.stamps,undefined);assert.equal(r.studio.assemblies.length,0);
});

test('hand-placed openings and stamps are kept and filled around',()=>{
 const base=apply(box(14,10,4),'nyc-tenement'),t=structuredClone(base);
 t.studio.freeOpenings=[{id:'mine',shapeId:'main',side:'north',u:.5,bottom:4.5,width:1.2,height:1.6,shape:'round'},{id:'shopdoor',shapeId:'main',side:'north',u:.8,bottom:0,width:1.2,height:2.4,shape:'rect'}];
 assert.equal(validateStudio(t),null);
 const out=resolve(t);assert.deepEqual(out.inactive,[]);
 const expanded=expandFacadeThemes(t,withFloors(t));
 assert.ok(expanded.studio.freeOpenings!.some(o=>o.id==='mine'),'manual opening kept');
 // No generated stamp or strip overlaps the manual door.
 assert.ok(!(expanded.studio.freeOpenings??[]).some(o=>o.id.startsWith('generated/theme/')&&o.side==='north'&&Math.abs(o.u-.8)*14<(o.width+1.2)/2));
});

test('themes on two parts combine with scoped rules, and the building theme replaces them',()=>{
 let r=box(10,9,4,24,[{id:'wing',kind:'rectangle',operation:'add',x:-3,z:-6,width:10,depth:5,startFloor:0,spanFloors:3}]);
 r=apply(r,'tokyo-zakkyo',{partId:'main'});r=apply(r,'paris-haussmann',{partId:'wing'});
 assert.equal(r.studio.facadeThemes!.length,2);
 const rules=r.studio.facadeRhythm!.rules!;assert.equal(rules.find(x=>x.partId==='main')!.style,'tokyo');assert.equal(rules.find(x=>x.partId==='wing')!.style,'townhouse');
 assert.equal(r.studio.parts.main.finishes?.wall?.color!==r.studio.parts.wing.finishes?.wall?.color,true);
 const out=resolve(r);assert.deepEqual(out.inactive,[]);
 assert.ok(out.pieces.some(p=>p.module.startsWith('window-tokyo')||p.module.startsWith('wall-tokyo')),'Tokyo on main');
 // A keep-plain wall rule survives a new part theme.
 r={...r,studio:{...r.studio,facadeRhythm:{...r.studio.facadeRhythm!,rules:[...rules,{partId:'main',side:'east',off:true}]}}};
 r=apply(r,'nyc-cast-iron',{partId:'main'});
 assert.ok(r.studio.facadeRhythm!.rules!.some(x=>x.partId==='main'&&x.side==='east'&&x.off));
 r=apply(r,'glass-office');
 assert.equal(r.studio.facadeThemes!.length,1);assert.equal(r.studio.facadeThemes![0].partId,undefined);
 assert.deepEqual(resolve(r).inactive,[]);
});

test('panel operations: tune, lock, reroll, palette, detach, remove',()=>{
 let r=apply(box(12,10,5),'nyc-tenement');const d=withFloors(r);
 const count=(x:StudioRecipe,what:string)=>themed(resolve(x).pieces).filter(p=>p.id.includes(what)).length;
 const none=setThemeTune(r,undefined,'fire-escape',0);assert.equal(count(none,'/fire-escape/'),0);
 const ac=setThemeTune(r,undefined,'ac',1);assert.ok(count(ac,'/ac/')>count(r,'/ac/'));
 const shops0=setThemeTune(r,undefined,'shops',0);assert.equal(resolve(shops0).pieces.filter(p=>p.id.startsWith('stamp/theme-')).length,0);
 // Reroll changes unlocked aspects only.
 const locked=toggleThemeLock(r,undefined,'ac');assert.deepEqual(locked.studio.facadeThemes![0].locks,['ac']);
 const rolled=rerollTheme(locked);assert.equal(rolled.studio.facadeThemes![0].seeds?.ac,undefined);assert.equal(rolled.studio.facadeThemes![0].seeds?.shops,1);
 assert.notDeepEqual(rolled.studio.facadeRhythm!.layerSeeds,r.studio.facadeRhythm!.layerSeeds);
 const shade=cycleThemePalette(r);assert.notEqual(shade.studio.defaults.finishes?.wall?.color,r.studio.defaults.finishes?.wall?.color);
 // Detach: storefronts and roof props become ordinary items; decorations keep resolving.
 const det=detachFacadeTheme(r,d);if('reason' in det)throw Error(det.reason);
 assert.equal(validateStudio(det.recipe),null);assert.ok(det.recipe.studio.stamps!.length>0);assert.ok(det.recipe.studio.facadeThemes![0].detached);
 const out=resolve(det.recipe);assert.deepEqual(out.inactive,[]);assert.ok(themed(out.pieces).some(p=>p.id.includes('/fire-escape/')));
 const removed=removeFacadeTheme(r);assert.equal(removed.studio.facadeThemes,undefined);assert.equal(themed(resolve(removed).pieces).length,0);assert.ok(removed.studio.facadeRhythm);
});

test('a kit-tile building is converted to an editable facade when themed; starters theme an empty plot',()=>{
 const kit:StudioRecipe={version:5,plotSize:24,attachments:[],volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:10,depth:8,startFloor:0,spanFloors:3}],studio:{...freshStudio(),catalogue:'synarc-kit-5'}};
 const r=apply(kit,'london-georgian');assert.equal(r.studio.facade,'unified');assert.deepEqual(resolve(r).inactive,[]);
 for(const t of FACADE_THEMES.slice(0,4)){const s=themeStarterRecipe(null,design,t.id,24,3);if('reason' in s)throw Error(s.reason);assert.equal(validateStudio(s.recipe),null);assert.equal(s.recipe.studio.facadeThemes![0].theme,t.id);}
});

test('business validators reject facade themes; the studio validator checks them',()=>{
 const r=apply(box(10,10,3),'tokyo-mansion');
 assert.equal(validateModularBuilding({version:1,template:'t',recipe:r}),false);
 assert.ok(validateVariationRecipe(r,3));
 const plain=structuredClone(r);delete plain.studio.facadeThemes;
 for(const bad of [[{id:'a',theme:'nope',seed:1}],[{id:'a',theme:'seaside',seed:1.5}],[{id:'a',theme:'seaside',seed:1,tune:{shops:2}}],[{id:'a',theme:'seaside',seed:1},{id:'b',theme:'seaside',seed:1}],[{id:'a',theme:'seaside',seed:1,locks:['x']}],[{id:'a',theme:'seaside',seed:1,extra:1}]])
  assert.ok(validateFacadeThemes(bad),JSON.stringify(bad));
 assert.equal(validateFacadeThemes(r.studio.facadeThemes),null);
 assert.ok(validateStudio({...plain,studio:{...plain.studio,facadeThemes:[{id:'a',theme:'nope',seed:1}] as never}}));
 assert.ok(THEME_ASPECTS.length>=10&&FACADE_THEMES.every(t=>themeAspects(t).length>=1));
});
