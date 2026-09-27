// Tokyo pack (docs/city-tokyo-kit.md): the built files match the catalogue, channels and budgets hold, the medium
// level matches, the studio uses the pack through its existing data paths, and business recipes never see it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {STUDIO_MODULES_TOKYO,STUDIO_MODULES_V5,STUDIO_MODULE_MAP,TOKYO_MODULE_IDS,studioModuleAvailable,studioModules} from './cityStudioCatalog.ts';
import {moduleOpeningSpec} from './cityStudioModuleSpec.ts';
import {STAMP_MAP,STOREFRONT_STAMPS,STUDIO_STOREFRONT_STAMPS,TOKYO_STOREFRONT_STAMPS} from './cityStorefrontStamps.ts';
import {previewStorefront,validateModularBuilding,variationChoices} from './cityBuildingVariation.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import {VARIATION_LAYERS} from './cityVariationTypes.ts';
import {createModularDesign} from './cityModularBuilding.ts';
import {newDesign} from './cityBuildingV3.ts';
import {freshStudio,studioBays,studioDraft,validateStudio} from './cityStudio.ts';
import {resolveSculpt} from './citySculpt.ts';
import {RHYTHM_STYLE_IDS,expandFacadeRhythm,rhythmLayerPreset} from './cityStudioFacadeRhythm.ts';
import {STUDIO_EXAMPLES,TOKYO_EXAMPLE_START,studioExample} from './cityStudioExamples.ts';
import {TOKYO_PRESETS} from './cityTokyoPresets.ts';
import {createLandWorld,initialLandDraft} from './cityLand.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

type Gltf={scenes:{nodes:number[]}[];scene?:number;nodes:{name?:string;children?:number[];mesh?:number}[];meshes:{primitives:{material?:number;indices?:number;attributes:Record<string,number>}[]}[];materials:{name:string}[];accessors:{count:number}[]};
const folder=new URL('../../public/city/tokyo-kit/v1/',import.meta.url);
const read=(name:string)=>readFileSync(new URL(name,folder));
const json=(name:string)=>JSON.parse(read(name).toString('utf8'));
function glb(name:string):Gltf{const b=read(name);assert.equal(b.toString('ascii',0,4),'glTF');return JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));}
const CHANNELS=['wall','trim','frame','door','glass'];
const channelOf=(material:string)=>material.replace(/\.\d+$/,'').split('/').at(-1)!;
/** Module id -> {channels, triangles} as loadStudioKit and the renderer see them. */
function modules(g:Gltf){
 const out=new Map<string,{channels:Set<string>;triangles:number}>();
 for(const root of g.scenes[g.scene??0].nodes){
  const entry={channels:new Set<string>(),triangles:0};
  const walk=(i:number)=>{const n=g.nodes[i];if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives){if(p.material!==undefined)entry.channels.add(channelOf(g.materials[p.material].name));entry.triangles+=(p.indices!==undefined?g.accessors[p.indices].count:g.accessors[p.attributes.POSITION].count)/3;}n.children?.forEach(walk);};
  walk(root);out.set(g.nodes[root].name??'',entry);
 }
 return out;
}
/** Triangle budgets per category (the synarc kit's detailed tiles run to about 600-1000). */
const BUDGET:Record<string,number>={window:800,door:700,wall:600,trim:400,roof:900};

test('Tokyo kit: catalogue, measured manifest, kit.glb and thumbnails agree',()=>{
 const catalogue=json('catalogue.json'),manifest=json('manifest.json'),g=glb('kit.glb'),built=modules(g);
 assert.equal(catalogue.id,'tokyo-kit-1');assert.equal(catalogue.extends,'synarc-kit-5');
 assert.equal(createHash('sha256').update(read('kit.glb')).digest('hex'),manifest.glbSha256,'kit.glb changed: rebuild with scripts/build-city-kit-tokyo.py');
 assert.equal(createHash('sha256').update(readFileSync(new URL('../../scripts/build-city-kit-tokyo.py',import.meta.url))).digest('hex'),manifest.scriptSha256,'the build script changed: rebuild the pack');
 assert.equal(catalogue.parts.length,32);assert.deepEqual(STUDIO_MODULES_TOKYO.map(p=>p.id),catalogue.parts.map((p:{id:string})=>p.id));
 assert.deepEqual([...built.keys()].sort(),catalogue.parts.map((p:{id:string})=>p.id).sort(),'one root per module');
 assert.deepEqual(new Set(g.materials.map(m=>channelOf(m.name))),new Set(CHANNELS));
 for(const mesh of g.meshes)for(const p of mesh.primitives){assert.ok(p.attributes.NORMAL!==undefined);assert.ok(p.attributes.TEXCOORD_0!==undefined);}
 for(const part of catalogue.parts){
  const measured=manifest.parts.find((p:{id:string})=>p.id===part.id),mesh=built.get(part.id)!;
  for(const key of Object.keys(part))assert.deepEqual(measured[key],part[key],`${part.id} metadata drift: ${key}`);
  assert.equal(mesh.triangles,measured.triangles,`${part.id}: manifest triangles`);
  assert.ok(measured.triangles>0&&measured.triangles<=BUDGET[part.category],`${part.id}: ${measured.triangles} triangles over the ${part.category} budget`);
  for(const c of mesh.channels)assert.ok(CHANNELS.includes(c),`${part.id}: channel ${c}`);
  assert.deepEqual(part.channels,CHANNELS);
  assert.ok(existsSync(new URL(`../../public/city/synarc-kit/v5/thumbnails/${part.id}.png`,import.meta.url)),`${part.id}: tray thumbnail`);
  const [w,h]=part.size,{min,max}=measured.bounds;
  assert.ok(min.every((v:number,i:number)=>Number.isFinite(v)&&v<max[i]));
  assert.ok(min[0]>=-w/2-.01&&max[0]<=w/2+.01,`${part.id}: stays within its width`);
  assert.ok(max[1]<=h+.01,`${part.id}: stays within its height`);
  // Facade tiles carry the 0.3 m wall slab (kit pieces in generated walls drop it); crowns and props do not.
  assert.equal(mesh.channels.has('wall'),['window','door','wall'].includes(part.category)||part.id==='tokyo-roof-stairhouse',`${part.id}: wall channel`);
  if(part.opening){assert.ok(part.opening.width<w&&part.opening.top<=h&&part.opening.bottom>=0);assert.equal(part.collision,'opening');}
  // Studio conventions read module ids: doors start with door-, windows with window-, shopfronts contain shop.
  if(part.category==='door')assert.match(part.id,/^door-tokyo-/);
  if(part.category==='window')assert.match(part.id,/^window-tokyo-/);
  if(part.category==='wall')assert.match(part.id,/^wall-tokyo-/);
 }
});

test('Tokyo kit: the medium level matches the kit',()=>{
 const manifest=json('kit-medium.json'),full=modules(glb('kit.glb')),medium=modules(glb('kit-medium.glb'));
 assert.equal(manifest.sourceSha256,createHash('sha256').update(read('kit.glb')).digest('hex'),'kit.glb changed: rebuild with scripts/build-city-kit-medium.py -- tokyo');
 assert.equal(manifest.glbSha256,createHash('sha256').update(read('kit-medium.glb')).digest('hex'));
 assert.deepEqual([...medium.keys()].sort(),[...full.keys()].sort());
 for(const [id,m] of medium){for(const c of m.channels)assert.ok(full.get(id)!.channels.has(c),`${id}: ${c}`);assert.ok(m.triangles<=full.get(id)!.triangles,id);}
 for(const part of STUDIO_MODULES_TOKYO)if(part.minDetail!=='near')assert.ok(medium.get(part.id)!.triangles>0,part.id);
 // Mostly unbevelled boxes: the medium level drops small parts and hidden faces (see docs/city-tokyo-kit.md).
 assert.ok(manifest.triangles.medium<.85*manifest.triangles.full);
});

test('Tokyo modules join the studio v5 catalogue only',()=>{
 assert.equal(studioModules(5).length,STUDIO_MODULES_V5.length+STUDIO_MODULES_TOKYO.length);
 for(const part of STUDIO_MODULES_TOKYO){
  assert.ok(STUDIO_MODULE_MAP.has(part.id)&&studioModuleAvailable('synarc-kit-5',part.id));
  assert.ok(!STUDIO_MODULES_V5.some(p=>p.id===part.id),`${part.id} collides with kit v5`);
  for(const catalogue of ['synarc-kit-2','synarc-kit-3','synarc-kit-4'])assert.ok(!studioModuleAvailable(catalogue,part.id));
 }
 // Kit pieces as opening types: windows/doors/shopfronts cut their aperture, wall tiles are panels (relief only).
 for(const part of STUDIO_MODULES_TOKYO){
  const spec=moduleOpeningSpec(part.id);
  if(['window','door'].includes(part.category))assert.equal(spec?.kind,'aperture',part.id);
  else if(part.category==='wall')assert.equal(spec?.kind,'panel',part.id);
  else assert.equal(spec,null,part.id);
 }
 for(const layer of VARIATION_LAYERS)assert.ok(variationChoices(layer).every(c=>!TOKYO_MODULE_IDS.has(c.id)&&!c.id.startsWith('stamp-tokyo-')),layer);
 assert.ok(STOREFRONT_STAMPS.every(s=>!s.id.startsWith('stamp-tokyo-')));
 assert.equal(STUDIO_STOREFRONT_STAMPS.length,STOREFRONT_STAMPS.length+TOKYO_STOREFRONT_STAMPS.length);
 for(const s of TOKYO_STOREFRONT_STAMPS){assert.ok(STAMP_MAP.has(s.id));for(const m of [s.window,s.door,s.canopy,s.fascia])if(m)assert.ok(TOKYO_MODULE_IDS.has(m),`${s.id}: ${m}`);}
});

test('business recipes and presets keep rejecting the Tokyo pack',()=>{
 const d=createModularDesign(newDesign('tokyo-business'),8),m=d.modular!,base=m.recipe;
 assert.equal(validateModularBuilding(m),true,'a shared template is unchanged');
 assert.equal(validateVariationRecipe(base,d.floors),null);
 const bay=studioBays(base,d).find(b=>b.anchor.floor===1)!,ground=studioBays(base,d).find(b=>b.anchor.floor===0&&!b.entrance)!;
 const variants:((r:StudioRecipe)=>void)[]=[
  r=>{r.studio.openings.push({id:'t',anchor:bay.anchor,module:'window-tokyo-sash'});},
  r=>{r.studio.defaults.window='window-tokyo-strip';},
  r=>{r.studio.assemblies.push({id:'t',kind:'ornament',look:'ornate',module:'tokyo-fascia',anchors:[bay.anchor]});},
  r=>{r.studio.roofDetails=[{id:'t',partId:r.volumes[0].id,module:'tokyo-roof-water-tank',u:0,v:0,rotation:0}];},
  r=>{r.studio.stamps=[{id:'t',stamp:'stamp-tokyo-konbini-2',anchor:ground.anchor}];},
  r=>{r.studio.variation!.layers.windows.pool=[{id:'window-tokyo-sash',weight:1}];},
 ];
 for(const [i,change] of variants.entries()){
  const r=structuredClone(base);change(r);
  assert.equal(validateModularBuilding({...m,recipe:r}),false,`business schema rejects Tokyo variant ${i}`);
  assert.ok(validateVariationRecipe(r,d.floors),`business preset import rejects Tokyo variant ${i}`);
  // The local construction studio accepts the same references (except variation pools, which stay shared).
  if(i<5)assert.equal(validateVariationRecipe(r,d.floors,24,true),null,`studio accepts Tokyo variant ${i}`);
 }
});

test('Tokyo storefront stamps paint on a v5 studio building',()=>{
 const plot=createLandWorld([],72,24).plots[0],r:StudioRecipe={version:5,plotSize:24,attachments:[],volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:8,startFloor:0,spanFloors:3}],studio:{...freshStudio(),catalogue:'synarc-kit-5'}};
 const draft=studioDraft({...initialLandDraft(plot),design:{...initialLandDraft(plot).design,groundHeight:3.6}},r),front=studioBays(r,draft.design).filter(b=>b.anchor.floor===0&&b.anchor.side==='north'&&!b.entrance).sort((a,b)=>a.anchor.u-b.anchor.u);
 for(const s of TOKYO_STOREFRONT_STAMPS){
  const preview=previewStorefront(r,draft.design,s.id,front[0].anchor);
  assert.equal(preview.reason,null,s.id);assert.equal(validateStudio(preview.recipe),null);
  const pieces=resolveSculpt(preview.recipe,draft.design).studio!.pieces.map(p=>p.module);
  for(const m of [s.window,s.door,s.fascia,s.canopy])if(m&&(s.span>1||m!==s.window))assert.ok(pieces.includes(m),`${s.id}: ${m}`);
 }
});

test('Tokyo rhythm style: kit pieces on the v5 kit, its own shapes elsewhere',()=>{
 assert.ok(RHYTHM_STYLE_IDS.includes('tokyo'));
 assert.ok(rhythmLayerPreset('tokyo',.35,'upper').pool.every(p=>p.id.startsWith('module:')&&TOKYO_MODULE_IDS.has(p.id.slice(7))));
 const plot=createLandWorld([],72,24).plots[0];
 for(const catalogue of ['synarc-kit-5','synarc-kit-3'] as const){
  const r:StudioRecipe={version:5,plotSize:24,attachments:[],volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:10,depth:10,startFloor:0,spanFloors:4}],studio:{...freshStudio(),catalogue,facade:'unified',facadeRhythm:{version:2,seed:3,style:'tokyo'}}};
  const draft=studioDraft({...initialLandDraft(plot),design:{...initialLandDraft(plot).design,groundHeight:3.6}},r);assert.equal(validateStudio(r),null);
  const e=expandFacadeRhythm(r,draft.design),kit=e.freeOpenings.filter(o=>o.module);
  if(catalogue==='synarc-kit-5'){assert.ok(kit.length>=12,'upper storeys take Tokyo kit pieces');assert.ok(kit.every(o=>TOKYO_MODULE_IDS.has(o.module!)));}
  else{assert.equal(kit.length,0,'no Tokyo pieces outside kit v5');assert.ok(e.freeOpenings.length>=12,'shaped openings instead');}
  assert.deepEqual(resolveSculpt(r,draft.design).studio!.inactive,[]);
 }
});

test('Tokyo starting ideas resolve completely on both plot sizes',()=>{
 assert.equal(STUDIO_EXAMPLES.length-TOKYO_EXAMPLE_START,TOKYO_PRESETS.length);
 const plot=createLandWorld([],72,24).plots[0];
 for(const size of [24,48] as const)for(let i=0;i<TOKYO_PRESETS.length;i++){
  const draft=studioExample(initialLandDraft(plot),TOKYO_EXAMPLE_START+i,size),r=draft.sculpt as StudioRecipe,name=TOKYO_PRESETS[i].name;
  assert.equal(STUDIO_EXAMPLES[TOKYO_EXAMPLE_START+i].name,name);assert.equal(draft.name,name);
  assert.equal(validateStudio(r),null,name);assert.equal(r.studio.facade,'unified');assert.equal(r.studio.catalogue,'synarc-kit-5');
  const out=resolveSculpt(r,draft.design).studio!,used=new Set(out.pieces.map(p=>p.module).filter(m=>TOKYO_MODULE_IDS.has(m)));
  assert.deepEqual(out.inactive,[],name);assert.equal(new Set(out.pieces.map(p=>p.id)).size,out.pieces.length);
  assert.ok(used.size>=8,`${name}: ${used.size} Tokyo modules`);
  assert.ok([...used].some(m=>STUDIO_MODULE_MAP.get(m)!.category==='roof'),`${name}: rooftop props`);
  assert.equal(validateModularBuilding({version:1,template:'t',recipe:r}),false,`${name}: never a business recipe`);
 }
 const all=new Set<string>();
 for(let i=0;i<TOKYO_PRESETS.length;i++){const draft=studioExample(initialLandDraft(plot),TOKYO_EXAMPLE_START+i,24);for(const p of resolveSculpt(draft.sculpt!,draft.design).studio!.pieces)all.add(p.module);}
 assert.ok(STUDIO_MODULES_TOKYO.filter(p=>all.has(p.id)).length>=26,'the starting ideas show most of the pack');
});
