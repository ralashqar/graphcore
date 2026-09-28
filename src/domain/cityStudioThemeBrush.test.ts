// Theme brush (docs/city-studio-themes.md › Theme brush): the eyedropper picks up a part's theme with its seed,
// colours, tuning and rhythm layers; painting it elsewhere goes through applyFacadeTheme and reproduces that look;
// erase removes a part's own theme or every theme.
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFacadeTheme,effectiveThemeRef,setThemeTune,themeRefAt,toggleThemeLock} from './cityStudioThemes.ts';
import {eraseThemeAt,sampleThemeBrush,themeBrushOptions,themeBrushTuned} from './cityStudioThemeBrush.ts';
import {setRhythmLayer} from './cityStudioFacadeRhythm.ts';
import {freshStudio,validateStudio} from './cityStudio.ts';
import {newDesign,type CityBuildingDesignV3} from './cityBuildingV3.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const design:CityBuildingDesignV3={...newDesign('theme-brush'),groundHeight:3.6,floors:4};
const two=():StudioRecipe=>({version:5,plotSize:24,attachments:[],volumes:[
 {id:'a',kind:'rectangle',operation:'add',x:-4,z:0,width:8,depth:10,startFloor:0,spanFloors:4},
 {id:'b',kind:'rectangle',operation:'add',x:5,z:0,width:8,depth:10,startFloor:0,spanFloors:3}],studio:{...freshStudio(),catalogue:'synarc-kit-5',facade:'unified'}});
const apply=(r:StudioRecipe,id:string,options:Parameters<typeof applyFacadeTheme>[3]={})=>{const out=applyFacadeTheme(r,design,id,options);if('reason' in out)throw Error(out.reason);return out.recipe;};

test('theme brush: paint theme A on part a and B on part b, each part keeps its own reference and look',()=>{
 let r=apply(two(),'nyc-tenement',{partId:'a',seed:11});r=apply(r,'tokyo-zakkyo',{partId:'b',seed:12});
 assert.equal(themeRefAt(r,'a')?.theme,'nyc-tenement');assert.equal(themeRefAt(r,'b')?.theme,'tokyo-zakkyo');
 assert.notDeepEqual(r.studio.parts.a.finishes,r.studio.parts.b.finishes);assert.equal(validateStudio(r),null);
});

test('theme brush: eyedropper picks up seed, colours, tuning, locks and rhythm layers, and paints the same look',()=>{
 let r=apply(two(),'paris-haussmann',{partId:'a',seed:321,palette:1});r=apply(r,'tokyo-zakkyo',{partId:'b',seed:5});
 r=setThemeTune(r,'a','shops',.8);r=toggleThemeLock(r,'a','shops');r=setRhythmLayer(r,[{partId:'a'}],'upper',{coverage:.35});
 const b=sampleThemeBrush(r,'a')!;
 assert.equal(b.theme,'paris-haussmann');assert.equal(b.seed,321);assert.equal(b.palette,1);assert.equal(b.tune?.shops,.8);assert.deepEqual(b.locks,['shops']);assert.ok(themeBrushTuned(b));
 const painted=apply(r,b.theme,{partId:'b',...themeBrushOptions(b)}),ra=themeRefAt(painted,'a')!,rb=themeRefAt(painted,'b')!;
 assert.equal(rb.theme,'paris-haussmann');assert.equal(rb.seed,ra.seed);assert.equal(rb.palette,ra.palette);assert.deepEqual(rb.tune,ra.tune);assert.deepEqual(rb.locks,ra.locks);
 assert.deepEqual(painted.studio.parts.b.finishes,painted.studio.parts.a.finishes);
 const rule=(id:string)=>painted.studio.facadeRhythm!.rules!.find(x=>x.partId===id&&x.side===undefined&&x.fromFloor===undefined)!;
 assert.equal(rule('b').layers?.upper?.coverage,.35);assert.deepEqual(rule('b').layers,rule('a').layers);
 assert.equal(validateStudio(painted),null);
});

test('theme brush: a plain card rolls a fresh look; a part without its own theme samples the building theme',()=>{
 assert.deepEqual(themeBrushOptions({theme:'seaside'}),{});assert.ok(!themeBrushTuned({theme:'seaside'}));
 const r=apply(two(),'victorian-terrace',{seed:77}),b=sampleThemeBrush(r,'b')!;
 assert.equal(b.theme,'victorian-terrace');assert.equal(b.seed,77);assert.equal(effectiveThemeRef(r,'b')?.partId,undefined);
 assert.equal(sampleThemeBrush(two(),'a'),null);
});

test('theme brush: erase removes a part theme, refuses an inherited one and clears every theme at building size',()=>{
 let r=apply(two(),'soviet-block',{seed:3});r=apply(r,'seaside',{partId:'a',seed:4});
 const part=eraseThemeAt(r,{partId:'a'});assert.ok(!('reason' in part));if('reason' in part)return;
 assert.equal(themeRefAt(part.recipe,'a'),undefined);assert.equal(themeRefAt(part.recipe)?.theme,'soviet-block');assert.match(part.label,/Remove theme: Beach/);
 const inherited=eraseThemeAt(part.recipe,{partId:'a'});assert.ok('reason' in inherited);
 const all=eraseThemeAt(r,{building:true});assert.ok(!('reason' in all));if('reason' in all)return;
 assert.equal(all.recipe.studio.facadeThemes,undefined);assert.equal(all.label,'Remove every theme');
 assert.ok('reason' in eraseThemeAt(all.recipe,{building:true}));
});
