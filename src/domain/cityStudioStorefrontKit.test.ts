// Storefront pack (docs/city-storefront-kit.md): the built files match the catalogue, channels, budgets and bounds
// hold, street objects keep the entrance clear, the medium level matches, stamps and starting ideas resolve through
// the studio's existing data paths, and business recipes never see the pack.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {STOREFRONT_MODULE_IDS,STREET_ENTRANCE_CLEAR,STUDIO_MODULES_STOREFRONT,STUDIO_MODULES_V5,STUDIO_MODULE_MAP,storefrontModuleStyle,streetModule,studioModuleAvailable,studioModules} from './cityStudioCatalog.ts';
import {moduleOpeningSpec} from './cityStudioModuleSpec.ts';
import {STAMP_MAP,STOREFRONT_KIT_STAMPS,STOREFRONT_STAMPS,STUDIO_STOREFRONT_STAMPS} from './cityStorefrontStamps.ts';
import {previewStorefront,usesStudioOnlyKit,validateModularBuilding,variationChoices} from './cityBuildingVariation.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import {VARIATION_LAYERS} from './cityVariationTypes.ts';
import {createModularDesign} from './cityModularBuilding.ts';
import {newDesign} from './cityBuildingV3.ts';
import {freshStudio,studioBays,studioDraft,validateStudio} from './cityStudio.ts';
import {resolveSculpt} from './citySculpt.ts';
import {STOREFRONT_EXAMPLE_START,STUDIO_EXAMPLES,studioExample} from './cityStudioExamples.ts';
import {STOREFRONT_PRESETS} from './cityStorefrontPresets.ts';
import {createLandWorld,initialLandDraft} from './cityLand.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

type Accessor={count:number;bufferView?:number;byteOffset?:number;componentType:number;type:string};
type Gltf={scenes:{nodes:number[]}[];scene?:number;nodes:{name?:string;children?:number[];mesh?:number;translation?:number[];rotation?:number[];scale?:number[];matrix?:number[]}[];meshes:{primitives:{material?:number;indices?:number;attributes:Record<string,number>}[]}[];materials:{name:string}[];accessors:Accessor[];bufferViews:{byteOffset?:number;byteLength:number;byteStride?:number}[]};
const folder=new URL('../../public/city/storefront-kit/v1/',import.meta.url);
const read=(name:string)=>readFileSync(new URL(name,folder));
const json=(name:string)=>JSON.parse(read(name).toString('utf8'));
function glb(name:string):{g:Gltf;bin:Buffer}{const b=read(name);assert.equal(b.toString('ascii',0,4),'glTF');const length=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+length));return {g,bin:b.subarray(28+length)};}
const CHANNELS=['wall','trim','frame','door','glass'];
const STYLES=['new-york','paris','london','italian','tokyo','modern'];
const channelOf=(material:string)=>material.replace(/\.\d+$/,'').split('/').at(-1)!;
/** Module id -> {channels, triangles, positions} as loadStudioKit and the renderer see them. */
function modules({g,bin}:{g:Gltf;bin:Buffer}){
 const out=new Map<string,{channels:Set<string>;triangles:number;xs:number[]}>();
 const positions=(i:number)=>{const a=g.accessors[i],v=g.bufferViews[a.bufferView!],o=(v.byteOffset??0)+(a.byteOffset??0),stride=v.byteStride??12,xs:number[]=[];assert.equal(a.componentType,5126);for(let k=0;k<a.count;k++)xs.push(bin.readFloatLE(o+k*stride));return xs;};
 for(const root of g.scenes[g.scene??0].nodes){
  const entry={channels:new Set<string>(),triangles:0,xs:[] as number[]};
  const walk=(i:number)=>{const n=g.nodes[i];assert.ok(!n.matrix&&!n.rotation&&!n.translation&&!n.scale,`${n.name}: baked transforms`);if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives){if(p.material!==undefined)entry.channels.add(channelOf(g.materials[p.material].name));entry.triangles+=(p.indices!==undefined?g.accessors[p.indices].count:g.accessors[p.attributes.POSITION].count)/3;entry.xs.push(...positions(p.attributes.POSITION));}n.children?.forEach(walk);};
  walk(root);out.set(g.nodes[root].name??'',entry);
 }
 return out;
}
/** Triangle budgets: shopfront sections carry a display behind the glass; street objects are small props. */
const BUDGET={window:1300,door:1000,trim:600,street:800} as const;
type Part={id:string;category:'window'|'door'|'trim';label:string;size:number[];opening:{width:number;bottom:number;top:number}|null;stretch:string[];channels:string[];collision:string;minDetail:string;style:string;mount?:string;doorSafe?:boolean;obstacles?:number[][];triangles:number;bounds:{min:number[];max:number[]}};

test('Storefront kit: catalogue, measured manifest, kit.glb and thumbnails agree',()=>{
 const catalogue=json('catalogue.json'),manifest=json('manifest.json'),built=modules(glb('kit.glb'));
 assert.equal(catalogue.id,'storefront-kit-1');assert.equal(catalogue.extends,'synarc-kit-5');
 assert.equal(createHash('sha256').update(read('kit.glb')).digest('hex'),manifest.glbSha256,'kit.glb changed: rebuild with scripts/build-city-kit-storefront.py');
 assert.equal(createHash('sha256').update(readFileSync(new URL('../../scripts/build-city-kit-storefront.py',import.meta.url))).digest('hex'),manifest.scriptSha256,'the build script changed: rebuild the pack');
 assert.deepEqual(STUDIO_MODULES_STOREFRONT.map(p=>p.id),catalogue.parts.map((p:Part)=>p.id));
 assert.deepEqual([...built.keys()].sort(),catalogue.parts.map((p:Part)=>p.id).sort(),'one root per module');
 for(const part of catalogue.parts as Part[]){
  const measured=(manifest.parts as Part[]).find(p=>p.id===part.id)!,mesh=built.get(part.id)!;
  for(const key of Object.keys(part))assert.deepEqual(measured[key as keyof Part],part[key as keyof Part],`${part.id} metadata drift: ${key}`);
  assert.equal(mesh.triangles,measured.triangles,`${part.id}: manifest triangles`);
  const budget=part.mount==='ground'?BUDGET.street:BUDGET[part.category];
  assert.ok(measured.triangles>0&&measured.triangles<=budget,`${part.id}: ${measured.triangles} triangles over the ${budget} budget`);
  for(const c of mesh.channels)assert.ok(CHANNELS.includes(c),`${part.id}: channel ${c}`);
  assert.deepEqual(part.channels,CHANNELS);assert.ok(STYLES.includes(part.style),`${part.id}: style ${part.style}`);
  assert.ok(existsSync(new URL(`../../public/city/synarc-kit/v5/thumbnails/${part.id}.png`,import.meta.url)),`${part.id}: tray thumbnail`);
  const [w,h,d]=part.size,{min,max}=measured.bounds;
  assert.ok(min.every((v,i)=>Number.isFinite(v)&&v<max[i]));
  assert.ok(min[0]>=-w/2-.01&&max[0]<=w/2+.01,`${part.id}: stays within its width`);
  assert.ok(min[1]>=-.02&&max[1]<=h+.01,`${part.id}: stays within its height`);
  // Shopfront sections carry the 0.3 m wall slab (dropped in generated walls); trims and street objects do not.
  assert.equal(mesh.channels.has('wall'),part.category!=='trim',`${part.id}: wall channel`);
  if(part.opening){assert.ok(part.opening.width<w&&part.opening.top<=h&&part.opening.bottom>=0);assert.equal(part.collision,'opening');}
  // Studio conventions read ids: doors start with door-, windows with window-, shopfronts contain shop.
  if(part.category==='door')assert.match(part.id,/^door-shop-/);
  if(part.category==='window')assert.match(part.id,/^window-shop-/);
  if(part.category==='trim')assert.match(part.id,part.mount?/^street-/:/^shop-/);
  // Sections stand on the wall line; trims and street objects stay in front of it within their depth.
  if(part.category==='trim')assert.ok(min[2]>=-.06&&max[2]<=d+.02,`${part.id}: depth ${min[2]}..${max[2]}`);
 }
 const counts={sections:catalogue.parts.filter((p:Part)=>p.category!=='trim').length,street:catalogue.parts.filter((p:Part)=>p.mount==='ground').length};
 assert.ok(counts.sections>=30&&counts.street>=30,JSON.stringify(counts));
});

test('Storefront street objects stand in front of the wall and keep the entrance clear',()=>{
 const built=modules(glb('kit.glb'));
 for(const part of STUDIO_MODULES_STOREFRONT as unknown as Part[]){
  const street=streetModule(part.id);
  assert.equal(!!street,part.mount==='ground',part.id);if(!street)continue;
  assert.equal(part.category,'trim');assert.deepEqual(part.stretch,[],`${part.id}: street objects keep their size`);
  assert.ok(part.size[0]<=2+1e-9&&part.size[2]<=1.7,`${part.id}: one bay wide, shallow`);
  assert.ok(street.obstacles.length>0,`${part.id}: walking colliders`);
  for(const [x0,x1,z0,z1,h] of street.obstacles){assert.ok(x0<x1&&z0<z1&&h>0&&h<=part.size[1]+.01);assert.ok(x0>=-1.01&&x1<=1.01&&z0>=0&&z1<=part.size[2]+.05,`${part.id}: collider inside its slot`);}
  if(street.doorSafe){
   // Nothing (geometry or collider) inside the entrance path in front of a door.
   assert.ok(built.get(part.id)!.xs.every(x=>Math.abs(x)>=STREET_ENTRANCE_CLEAR-1e-3),`${part.id}: geometry clear of the door`);
   assert.ok(street.obstacles.every(([x0,x1])=>Math.min(Math.abs(x0),Math.abs(x1))>=STREET_ENTRANCE_CLEAR-1e-3&&Math.sign(x0)===Math.sign(x1)),`${part.id}: colliders clear of the door`);
  }
 }
 assert.ok(STUDIO_MODULES_STOREFRONT.filter(p=>streetModule(p.id)?.doorSafe).length>=10,'enough door-side pieces');
});

test('Storefront kit: the medium level matches the kit',()=>{
 const manifest=json('kit-medium.json'),full=modules(glb('kit.glb')),medium=modules(glb('kit-medium.glb'));
 assert.equal(manifest.sourceSha256,createHash('sha256').update(read('kit.glb')).digest('hex'),'kit.glb changed: rebuild with scripts/build-city-kit-medium.py -- storefront');
 assert.equal(manifest.glbSha256,createHash('sha256').update(read('kit-medium.glb')).digest('hex'));
 assert.deepEqual([...medium.keys()].sort(),[...full.keys()].sort());
 for(const [id,m] of medium){for(const c of m.channels)assert.ok(full.get(id)!.channels.has(c),`${id}: ${c}`);assert.ok(m.triangles<=full.get(id)!.triangles,id);}
 for(const part of STUDIO_MODULES_STOREFRONT)if(part.minDetail!=='near')assert.ok(medium.get(part.id)!.triangles>0,part.id);
 assert.ok(manifest.triangles.medium<.9*manifest.triangles.full);
});

test('Storefront modules and stamps join the studio catalogue only',()=>{
 for(const part of STUDIO_MODULES_STOREFRONT){
  assert.ok(STUDIO_MODULE_MAP.has(part.id)&&studioModuleAvailable('synarc-kit-5',part.id));
  assert.ok(!STUDIO_MODULES_V5.some(p=>p.id===part.id),`${part.id} collides with kit v5`);
  for(const catalogue of ['synarc-kit-2','synarc-kit-3','synarc-kit-4'])assert.ok(!studioModuleAvailable(catalogue,part.id));
  const spec=moduleOpeningSpec(part.id);
  if(['window','door'].includes(part.category))assert.equal(spec?.kind,'aperture',part.id);else assert.equal(spec,null,part.id);
  assert.ok(storefrontModuleStyle(part.id));
 }
 assert.ok(studioModules(5).length>=STUDIO_MODULES_V5.length+STUDIO_MODULES_STOREFRONT.length);
 for(const layer of VARIATION_LAYERS)assert.ok(variationChoices(layer).every(c=>!STOREFRONT_MODULE_IDS.has(c.id)&&!c.id.startsWith('stamp-sf-')),layer);
 assert.ok(STOREFRONT_STAMPS.every(s=>!s.id.startsWith('stamp-sf-')));
 for(const s of STOREFRONT_KIT_STAMPS){
  assert.ok(STAMP_MAP.has(s.id)&&STUDIO_STOREFRONT_STAMPS.includes(s));assert.ok(s.style&&STYLES.includes(s.style),s.id);
  const all=[s.window,s.door,s.canopy,s.fascia,s.sign,s.overhead,s.letters,...(s.dressing??[]),...(s.alternates?.window??[]),...(s.alternates?.canopy??[]),...(s.alternates?.letters??[]),...(s.alternates?.dressing??[])].filter((m):m is string=>!!m);
  for(const m of all)assert.ok(STUDIO_MODULE_MAP.has(m),`${s.id}: ${m}`);
  assert.ok(all.some(m=>STOREFRONT_MODULE_IDS.has(m)),`${s.id} uses the pack`);
  for(const m of [s.window,...(s.alternates?.window??[])])assert.equal(moduleOpeningSpec(m)?.kind,'aperture',`${s.id}: ${m}`);
  if(s.door)assert.equal(STUDIO_MODULE_MAP.get(s.door)!.category,'door');
  for(const m of [s.canopy,s.fascia,s.sign,s.overhead,s.letters,...(s.alternates?.canopy??[]),...(s.alternates?.letters??[])])if(m)assert.ok(STUDIO_MODULE_MAP.get(m)!.category==='trim'&&!streetModule(m),`${s.id}: ${m}`);
  assert.equal(s.dressing?.length??s.span,s.span);
  for(const [i,m] of (s.dressing??[]).entries())if(m){assert.ok(streetModule(m),`${s.id}: ${m} is a street object`);if(s.door&&i===(s.doorBay??0))assert.ok(streetModule(m)!.doorSafe,`${s.id}: ${m} in front of the door`);}
  for(const m of s.alternates?.dressing??[])assert.ok(streetModule(m),`${s.id}: ${m}`);
 }
 const types=new Set(STOREFRONT_KIT_STAMPS.map(s=>s.id.replace(/-\d$/,'')));
 assert.ok(types.size>=16,`${types.size} shop types`);
 assert.deepEqual(new Set(STOREFRONT_KIT_STAMPS.map(s=>s.style)),new Set(STYLES),'every street style has shops');
});

test('business recipes and presets keep rejecting the storefront pack',()=>{
 const d=createModularDesign(newDesign('storefront-business'),8),m=d.modular!,base=m.recipe;
 assert.equal(validateModularBuilding(m),true,'a shared template is unchanged');
 const bay=studioBays(base,d).find(b=>b.anchor.floor===1)!,ground=studioBays(base,d).find(b=>b.anchor.floor===0&&!b.entrance)!;
 const variants:((r:StudioRecipe)=>void)[]=[
  r=>{r.studio.openings.push({id:'t',anchor:ground.anchor,module:'window-shop-florist'});},
  r=>{r.studio.defaults.window='window-shop-pub';},
  r=>{r.studio.assemblies.push({id:'t',kind:'canopy',look:'ornate',module:'shop-awning-striped',anchors:[bay.anchor]});},
  r=>{r.studio.assemblies.push({id:'t',kind:'ornament',look:'ornate',module:'street-cafe-set',anchors:[ground.anchor]});},
  r=>{r.studio.stamps=[{id:'t',stamp:'stamp-sf-cafe-2',anchor:ground.anchor}];},
  r=>{r.studio.variation!.layers.windows.pool=[{id:'window-shop-bay',weight:1}];},
 ];
 for(const [i,change] of variants.entries()){
  const r=structuredClone(base);change(r);
  assert.ok(usesStudioOnlyKit(r.studio as unknown as Record<string,unknown>)||i===5);
  assert.equal(validateModularBuilding({...m,recipe:r}),false,`business schema rejects storefront variant ${i}`);
  assert.ok(validateVariationRecipe(r,d.floors),`business preset import rejects storefront variant ${i}`);
  if(i<5)assert.equal(validateVariationRecipe(r,d.floors,24,true),null,`studio accepts storefront variant ${i}`);
 }
});

const plot=createLandWorld([],72,24).plots[0];
function street(width=20):{r:StudioRecipe;draft:ReturnType<typeof studioDraft>}{
 const r:StudioRecipe={version:5,plotSize:24,attachments:[],volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width,depth:8,startFloor:0,spanFloors:3}],studio:{...freshStudio(),catalogue:'synarc-kit-5'}};
 return {r,draft:studioDraft({...initialLandDraft(plot),design:{...initialLandDraft(plot).design,groundHeight:3.6}},r)};
}

test('every storefront stamp paints a complete shop on a v5 building',()=>{
 const {r,draft}=street(),front=studioBays(r,draft.design).filter(b=>b.anchor.floor===0&&b.anchor.side==='north'&&!b.entrance).sort((a,b)=>a.anchor.u-b.anchor.u);
 for(const s of STOREFRONT_KIT_STAMPS){
  const preview=previewStorefront(r,draft.design,s.id,front[0].anchor);
  assert.equal(preview.reason,null,s.id);assert.equal(validateStudio(preview.recipe),null);
  const out=resolveSculpt(preview.recipe,draft.design).studio!,pieces=new Set(out.pieces.map(p=>p.module));
  assert.deepEqual(out.inactive,[],s.id);
  for(const m of [s.fascia,s.sign,s.overhead])if(m)assert.ok(pieces.has(m),`${s.id}: ${m}`);
  const pick=(base:string|undefined,list?:string[])=>!!base&&[base,...list??[]].some(m=>pieces.has(m));
  assert.ok(pick(s.window,s.alternates?.window)||s.span===1&&!!s.door,`${s.id}: window`);
  if(s.door)assert.ok(pieces.has(s.door),`${s.id}: door`);
  if(s.canopy)assert.ok(pick(s.canopy,s.alternates?.canopy),`${s.id}: canopy`);
  if(s.letters)assert.ok(pick(s.letters,s.alternates?.letters),`${s.id}: letters`);
  for(const m of s.dressing??[])if(m)assert.ok(pick(m,s.alternates?.dressing),`${s.id}: dressing ${m}`);
  // Street objects bring walking colliders.
  if(s.dressing?.some(Boolean))assert.ok(out.blockers.some(b=>b.id.includes('/dressing/')),`${s.id}: colliders`);
 }
});

test('placed stamps pick seeded alternatives, so repeated shops differ but stay stable',()=>{
 const {r,draft}=street(),front=studioBays(r,draft.design).filter(b=>b.anchor.floor===0&&b.anchor.side==='north'&&!b.entrance).sort((a,b)=>a.anchor.u-b.anchor.u);
 const looks=new Set<string>();
 for(let i=0;i<6;i++){
  const recipe=structuredClone(r);recipe.studio.stamps=[{id:`shop-${i}`,stamp:'stamp-sf-bodega-2',anchor:front[0].anchor}];
  const a=resolveSculpt(recipe,draft.design).studio!.pieces.map(p=>p.module).join(),b=resolveSculpt(structuredClone(recipe),draft.design).studio!.pieces.map(p=>p.module).join();
  assert.equal(a,b,'deterministic');looks.add(a);
 }
 assert.ok(looks.size>=2,`${looks.size} distinct bodegas`);
});

test('street objects: ground storey only, door-side pieces in front of doors, colliders',()=>{
 const {r,draft}=street(),bays=studioBays(r,draft.design),door=bays.find(b=>b.entrance)!;
 const window=bays.find(b=>b.anchor.floor===0&&b.anchor.side==='north'&&!b.entrance)!,upper=bays.find(b=>b.anchor.floor===1&&b.anchor.side==='north')!;
 const place=(module:string,anchor=window.anchor)=>{const recipe=structuredClone(r);recipe.studio.assemblies.push({id:'street',kind:'ornament',look:'ornate',module,anchors:[anchor]});assert.equal(validateStudio(recipe),null);return resolveSculpt(recipe,draft.design).studio!;};
 const ok=place('street-cafe-set');assert.deepEqual(ok.inactive,[]);
 const piece=ok.pieces.find(p=>p.module==='street-cafe-set')!;assert.ok(Math.abs(piece.y-window.y)<1e-9,'stands on the ground storey floor');
 assert.ok(ok.blockers.some(b=>b.id.startsWith('street/')),'walking collider');
 assert.match(place('street-cafe-set',door.anchor).inactive[0]?.reason??'',/entrance/);
 assert.deepEqual(place('street-aboard',door.anchor).inactive,[],'door-side pieces fit beside the door');
 assert.match(place('street-bench',upper.anchor).inactive[0]?.reason??'',/street level/);
});

test('storefront starting ideas resolve completely on both plot sizes',()=>{
 assert.equal(STUDIO_EXAMPLES.length-STOREFRONT_EXAMPLE_START,STOREFRONT_PRESETS.length);
 const all=new Set<string>();
 for(const size of [24,48] as const)for(let i=0;i<STOREFRONT_PRESETS.length;i++){
  const draft=studioExample(initialLandDraft(plot),STOREFRONT_EXAMPLE_START+i,size),r=draft.sculpt as StudioRecipe,name=STOREFRONT_PRESETS[i].name;
  assert.equal(STUDIO_EXAMPLES[STOREFRONT_EXAMPLE_START+i].name,name);assert.equal(draft.name,name);
  assert.equal(validateStudio(r),null,name);assert.equal(r.studio.facade,'unified');assert.equal(r.studio.catalogue,'synarc-kit-5');
  const out=resolveSculpt(r,draft.design).studio!,used=new Set(out.pieces.map(p=>p.module).filter(m=>STOREFRONT_MODULE_IDS.has(m)));
  assert.deepEqual(out.inactive,[],name);assert.equal(new Set(out.pieces.map(p=>p.id)).size,out.pieces.length);
  // The Tokyo row mixes the storefront pack with the Tokyo pack's stamps.
  const tokyo=STOREFRONT_PRESETS[i].style==='tokyo';
  assert.ok(used.size>=(tokyo?3:10),`${name}: ${used.size} storefront modules`);
  assert.ok([...used].filter(m=>streetModule(m)).length>=(tokyo?1:4),`${name}: street objects`);
  assert.equal(validateModularBuilding({version:1,template:'t',recipe:r}),false,`${name}: never a business recipe`);
  for(const m of used)all.add(m);
 }
 assert.ok(all.size>=.6*STUDIO_MODULES_STOREFRONT.length,`the starting ideas show ${all.size} of ${STUDIO_MODULES_STOREFRONT.length} pieces`);
});
