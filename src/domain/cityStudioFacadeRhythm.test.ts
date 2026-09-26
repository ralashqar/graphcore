import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,sculptFloorBottom,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioBays,studioFloorCount,validateStudio} from './cityStudio.ts';
import {validateModularBuilding} from './cityBuildingVariation.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import {FREE_OPENING,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {expandFacadeRhythm,materializeFacadeRhythm,newFacadeRhythm,RHYTHM_STYLE_IDS,setFacadeRhythm,setFacadeRhythmRule,shuffleFacadeRhythm,toggleFacadeRhythmLock,validateFacadeRhythm,type FacadeRhythm,type RhythmStyle} from './cityStudioFacadeRhythm.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const vol=(id:string,patch:Partial<SculptVolume>={}):SculptVolume=>({id,kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:3,...patch});
const recipe=(rhythm:FacadeRhythm|undefined,volumes=[vol('main')],free?:StudioFreeOpening[]):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:{...freshStudio(),...(rhythm?{facadeRhythm:rhythm}:{}),...(free?{freeOpenings:free}:{})}});
const design=(r:StudioRecipe)=>({...newDesign('rhythm-test'),groundHeight:3.8,upperHeight:3.2,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const expand=(r:StudioRecipe)=>{const d=design(r);return expandFacadeRhythm(r,d,studioBays(r,d));};
const face=(list:StudioFreeOpening[],shapeId:string,side:string)=>list.filter(o=>o.shapeId===shapeId&&o.side===side);
const col=(id:string)=>id.split('/').at(-2)!;
const storey=(id:string)=>Number(id.split('/').at(-3));

test('the same seed and recipe always give the same facade; layer seeds change it',()=>{
 const r=recipe({...newFacadeRhythm('cottage',7),variety:1});
 assert.deepEqual(expand(r),expand(structuredClone(r)));
 const a=expand(r).freeOpenings.length;assert.ok(a>10);
 const variants=new Set(Array.from({length:6},(_,i)=>JSON.stringify(expand(recipe({...newFacadeRhythm('cottage',7),variety:1,layerSeeds:{ground:i,upper:i,attic:i,trims:i}})).freeOpenings.map(o=>[o.u,o.shape,o.bottom]))));
 assert.ok(variants.size>1,'shuffled seeds lay out different facades');
 assert.ok(expand(r).freeOpenings.every(o=>o.id.startsWith('generated/rhythm/')));
});

test('a wider face gains bays; columns stay vertically aligned across storeys',()=>{
 for(const style of RHYTHM_STYLE_IDS){
  const count=(w:number)=>{const out=expand(recipe(newFacadeRhythm(style),[vol('main',{width:w})]));return out.faces.find(f=>f.side==='north')!.columns;};
  assert.ok(count(18)>count(9),`${style}: wider face, more columns`);
  const r=recipe(newFacadeRhythm(style),[vol('main',{width:14,spanFloors:4})]),d=design(r),out=expand(r),north=face(out.freeOpenings,'main','north');
  const L=14,centre=new Map<string,number[]>();for(const o of north){const k=col(o.id);centre.set(`${storey(o.id)}/${k}`,[...(centre.get(`${storey(o.id)}/${k}`)??[]),o.u*L]);}
  const byCol=new Map<string,Set<number>>();for(const [k,xs] of centre){const c=k.split('/')[1],mid=Math.round((Math.min(...xs)+Math.max(...xs))/2*1000)/1000;(byCol.get(c)??byCol.set(c,new Set()).get(c)!).add(mid);}
  for(const [c,mids] of byCol)assert.equal(mids.size,1,`${style}: column ${c} is aligned`);
  // Storey lines: every window of one storey shares its sill (rounds and doors excepted).
  for(let f=0;f<4;f++){const sills=new Set(north.filter(o=>storey(o.id)===f&&o.shape!=='round'&&o.bottom>FREE_OPENING.doorSill).map(o=>o.bottom.toFixed(3)));assert.ok(sills.size<=1,`${style}: storey ${f} sill line`);}
  assert.ok(north.every(o=>{const f=storey(o.id),y=sculptFloorBottom(f,d.groundHeight,d.upperHeight)-sculptFloorBottom(0,d.groundHeight,d.upperHeight);return o.bottom>=y-1e-9&&o.bottom+o.height<=y+(f?d.upperHeight:d.groundHeight)-.3;}),`${style}: openings stay inside their storey`);
 }
});

test('resizing re-lays the facade through resolveSculpt and suppresses kit tiles',()=>{
 for(const width of [8,12,17]){
  const r=recipe(newFacadeRhythm('townhouse'),[vol('main',{width})]),d=design(r),out=resolveSculpt(r,d).studio!;
  assert.deepEqual(out.inactive,[]);assert.equal(out.freeFaces?.length,4,'all four faces generated');
  const north=out.freeFaces!.find(f=>f.side==='north')!,door=north.groups.find(g=>g.role==='door')!;
  assert.ok(Math.abs((door.x0+door.x1)/2-width/2)<1e-6,'townhouse door is centred');
  const northBays=out.bays.filter(b=>b.anchor.shapeId==='main'&&b.anchor.side==='north').map(b=>b.id);
  assert.ok(!out.pieces.some(p=>northBays.includes(p.id)),'kit tiles of generated faces are removed');
  assert.ok(out.bays.find(b=>b.entrance)?.anchor.side==='north','the entrance moves to the generated door');
  assert.ok(out.freeTrims!.length>0&&out.freeTrims!.every(t=>t.openingId.startsWith('generated/rhythm/')),'generated trims are exposed on the resolved result');
  assert.equal(r.studio.freeOpenings,undefined,'the recipe is never mutated');
 }
});

test('manual openings own their face unless the rhythm fills around them',()=>{
 const manual:StudioFreeOpening={id:'mine',shapeId:'main',side:'north',u:.2,bottom:5,width:1.2,height:1.5,shape:'round'};
 const own=expand(recipe({...newFacadeRhythm('townhouse'),manual:'own'},[vol('main')],[manual]));
 assert.equal(face(own.freeOpenings,'main','north').length,0);assert.equal(own.faces.find(f=>f.side==='north')!.status,'manual');
 assert.ok(face(own.freeOpenings,'main','south').length>0,'other faces still generate');
 const kit=recipe({...newFacadeRhythm('townhouse'),manual:'own'});kit.studio.openings.push({id:'kit-door',anchor:{shapeId:'main',side:'east',u:.5,floor:0},module:'door-panelled'});
 assert.equal(face(expand(kit).freeOpenings,'main','east').length,0,'a manual kit opening also owns its face');
 const fill=expand(recipe({...newFacadeRhythm('townhouse'),manual:'fill'},[vol('main')],[manual])),north=face(fill.freeOpenings,'main','north');
 assert.ok(north.length>0,'fill keeps generated openings around the manual one');
 const d=design(recipe(undefined));const out=resolveSculpt(recipe({...newFacadeRhythm('townhouse'),manual:'fill'},[vol('main')],[manual]),d).studio!;
 assert.deepEqual(out.inactive,[],'filled openings never collide with the manual one');
});

test('hidden faces are skipped and partly hidden faces only use exposed wall',()=>{
 const covered=[vol('main',{width:10,depth:8}),vol('wing',{x:8,width:6,depth:8,spanFloors:3})];
 const out=expand(recipe(newFacadeRhythm('civic'),covered));
 assert.equal(face(out.freeOpenings,'main','east').length,0);assert.equal(out.faces.find(f=>f.shapeId==='main'&&f.side==='east')!.status,'hidden');
 assert.ok(face(out.freeOpenings,'wing','west').length===0,'the wing wall inside the main part stays blank');
 const partial=[vol('main',{width:12,depth:10,spanFloors:4}),vol('wing',{x:7.5,z:-2,width:5,depth:4,spanFloors:2})];
 for(const style of RHYTHM_STYLE_IDS){
  const r=recipe(newFacadeRhythm(style),partial),studio=resolveSculpt(r,design(r)).studio!;
  assert.deepEqual(studio.inactive,[],`${style}: every generated opening sits on exposed wall`);
  assert.ok(face(expandFacadeRhythm(r,design(r),studioBays(r,design(r))).freeOpenings,'main','east').some(o=>storey(o.id)>=2),`${style}: upper storeys above the wing still open`);
 }
});

test('each style puts a door on the street face of every ground part',()=>{
 const parts=[vol('main',{width:12,depth:9}),vol('wing',{x:8,z:-1,width:4.5,depth:6,spanFloors:2}),vol('tower',{x:-4,z:-3,width:4,depth:3,startFloor:3,spanFloors:1})];
 for(const style of RHYTHM_STYLE_IDS){
  const r=recipe(newFacadeRhythm(style),parts),out=resolveSculpt(r,design(r)).studio!;
  assert.deepEqual(out.inactive,[],style);
  for(const part of ['main','wing']){const doors=out.freeFaces!.filter(f=>f.shapeId===part).flatMap(f=>f.groups.filter(g=>g.role==='door').map(()=>f.side));assert.ok(doors.includes('north'),`${style}: ${part} has a street door`);}
  assert.ok(!out.freeFaces!.some(f=>f.shapeId==='tower'&&f.groups.some(g=>g.role==='door')),`${style}: upper parts have no doors`);
  if(style==='civic'||style==='townhouse'){const n=out.freeFaces!.find(f=>f.shapeId==='main'&&f.side==='north')!,door=n.groups.filter(g=>g.role==='door').sort((a,b)=>b.x1-b.x0-(a.x1-a.x0))[0];assert.ok(Math.abs((door.x0+door.x1)/2-n.length/2)<1e-6,`${style}: symmetric centre door`);}
 // A part whose street wall is hidden and whose side walls are half hidden still gets a door on visible wall.
 const behind=recipe(newFacadeRhythm('townhouse'),[vol('main',{width:17,depth:9,spanFloors:4}),vol('wing',{x:8,z:-5,width:5,depth:6,spanFloors:3})]),studio=resolveSculpt(behind,design(behind)).studio!;
 assert.deepEqual(studio.inactive,[]);assert.ok(studio.freeFaces!.some(f=>f.shapeId==='wing'&&f.groups.some(g=>g.role==='door')),'the wing door moves to its exposed side wall');
 }
});

test('generated openings never merge by accident; mullioned groups stay within one column',()=>{
 for(const style of RHYTHM_STYLE_IDS)for(const density of [0,1])for(const w of [6,19]){
  const r=recipe({...newFacadeRhythm(style,3),density,variety:.8},[vol('main',{width:w,spanFloors:4})]),out=resolveSculpt(r,design(r)).studio!;
  assert.deepEqual(out.inactive,[],`${style}/${density}/${w}`);
  for(const f of out.freeFaces!)for(const g of f.groups)assert.equal(new Set(g.members.map(m=>m.split('/').slice(-3,-1).join('/'))).size,1,`${style} ${g.id} crosses columns`);
  const cols=new Set(out.freeFaces!.flatMap(f=>f.groups.map(g=>`${f.id}/${g.members[0].split('/').slice(-3,-1).join('/')}`)));
  assert.equal(cols.size,out.freeFaces!.reduce((n,f)=>n+f.groups.length,0),'one group per generated column slot');
 }
 const loft=expand(recipe(newFacadeRhythm('loft'),[vol('main',{width:14})]));
 assert.ok(loft.freeOpenings.some(o=>o.id.endsWith('/2')),'loft upper windows are intentional triples');
});

test('shuffle bumps unlocked layers only; locks keep ground, upper, attic and trims',()=>{
 let r=recipe({...newFacadeRhythm('cottage',11),variety:1,trims:'rich'},[vol('main',{width:16,spanFloors:3})]);
 r=toggleFacadeRhythmLock(r,'ground');assert.deepEqual(r.studio.facadeRhythm!.locks,['ground']);
 const pick=(x:StudioRecipe,f:(o:StudioFreeOpening)=>boolean)=>JSON.stringify(expand(x).freeOpenings.filter(f));
 const ground=pick(r,o=>storey(o.id)===0);let changed=false,v=r.studio.facadeRhythm!;
 for(let i=0;i<8;i++){v=shuffleFacadeRhythm(v);const next={...r,studio:{...r.studio,facadeRhythm:v}};assert.equal(pick(next,o=>storey(o.id)===0),ground,'locked ground layer');if(pick(next,o=>storey(o.id)>0)!==pick(r,o=>storey(o.id)>0))changed=true;}
 assert.ok(changed,'unlocked upper layer changes');assert.equal(v.layerSeeds!.ground,undefined);assert.equal(v.layerSeeds!.upper,8);
 // Scoped shuffle only touches its rule and respects the same locks.
 const scoped=shuffleFacadeRhythm(r.studio.facadeRhythm!,{partId:'main',side:'south'});
 assert.deepEqual(scoped.rules,[{partId:'main',side:'south',layerSeeds:{upper:1,attic:1,trims:1}}]);
 const a=expand(r),b=expand({...r,studio:{...r.studio,facadeRhythm:scoped}});
 assert.deepEqual(face(a.freeOpenings,'main','north'),face(b.freeOpenings,'main','north'),'other faces are untouched');
 const trimsLocked=toggleFacadeRhythmLock(r,'trims'),t0=expand(trimsLocked).freeTrims;let t=trimsLocked.studio.facadeRhythm!;for(let i=0;i<4;i++)t=shuffleFacadeRhythm(t);
 assert.deepEqual(expand({...r,studio:{...r.studio,facadeRhythm:{...t,layerSeeds:{...t.layerSeeds,upper:0,attic:0}}}}).freeTrims,t0,'locked trims keep their choice');
});

test('rules override style per part/face and can turn walls off',()=>{
 let r=recipe(newFacadeRhythm('townhouse'),[vol('main'),vol('wing',{x:9,z:-1,width:6,depth:6,spanFloors:2})]);
 r=setFacadeRhythmRule(r,{partId:'wing'},{style:'warehouse'});r=setFacadeRhythmRule(r,{partId:'main',side:'south'},{off:true});r=setFacadeRhythmRule(r,{side:'west'},{style:'cottage'});
 assert.equal(validateStudio(r),null);
 const out=expand(r);
 assert.equal(face(out.freeOpenings,'main','south').length,0);assert.ok(out.faces.filter(f=>f.shapeId==='wing').every(f=>f.style==='warehouse'),'part rule beats side rule');
 assert.equal(out.faces.find(f=>f.shapeId==='main'&&f.side==='west')!.style,'cottage');
 const stale=expand(setFacadeRhythmRule(r,{partId:'gone'},{style:'loft'}));assert.ok(stale.inactive.some(i=>i.id.includes('gone')),'a rule without a wall is reported');
 const cleared=setFacadeRhythmRule(setFacadeRhythmRule(setFacadeRhythmRule(r,{partId:'wing'},null),{partId:'main',side:'south'},null),{side:'west'},null);assert.equal(cleared.studio.facadeRhythm!.rules,undefined);
 assert.equal(setFacadeRhythm(r,null).studio.facadeRhythm,undefined);assert.equal(setFacadeRhythm(r,{style:'loft',density:.2}).studio.facadeRhythm!.style,'loft');
});

test('materialize turns generated openings into editable manual ones with identical geometry',()=>{
 const r=recipe({...newFacadeRhythm('townhouse'),trims:'rich'},[vol('main',{width:11,spanFloors:3}),vol('wing',{x:7.5,z:-1,width:5,depth:5,spanFloors:2})]),d=design(r);
 const before=resolveSculpt(r,d).studio!,shape=(s:typeof before)=>s.freeFaces!.map(f=>({id:f.id,groups:f.groups.map(g=>({role:g.role,outline:g.outline.map(p=>p.map(n=>Math.round(n*1e6)))}))}));
 const one=materializeFacadeRhythm(r,d,{shapeId:'main',side:'north'});assert.ok('recipe' in one);
 assert.equal(validateStudio(one.recipe),null);assert.ok(one.ids.every(id=>!id.startsWith('generated/')));
 assert.equal(one.recipe.studio.freeOpenings!.length,one.ids.length);assert.ok(one.recipe.studio.freeTrims!.length>0,'trims come along');
 const mid=resolveSculpt(one.recipe,d).studio!;assert.deepEqual(mid.inactive,[]);
 assert.deepEqual(shape(mid).find(f=>f.id==='main/north')!.groups,shape(before).find(f=>f.id==='main/north')!.groups);
 assert.equal(expand(one.recipe).faces.find(f=>f.shapeId==='main'&&f.side==='north')!.status,'manual');
 assert.ok(!expand(one.recipe).faces.some(f=>f.shapeId==='main'&&f.door),'the manual door keeps the part from gaining a second generated door');
 const all=materializeFacadeRhythm(r,d);assert.ok('recipe' in all);assert.equal(all.recipe.studio.facadeRhythm,undefined);
 const after=resolveSculpt(all.recipe,d).studio!;assert.deepEqual(after.inactive,[]);assert.deepEqual(shape(after),shape(before),'round trip keeps every group');
 assert.equal(after.freeTrims,undefined,'no rhythm left: trims come from the recipe');assert.deepEqual(all.recipe.studio.freeTrims!.map(t=>t.kinds),expand(r).freeTrims.map(t=>t.kinds),'every generated trim was kept');
 assert.ok('reason' in materializeFacadeRhythm(recipe(undefined),d));
});

test('local validation accepts the rhythm; business and profile validators keep rejecting it',()=>{
 const r=recipe({...newFacadeRhythm('civic',42),density:.3,variety:.6,trims:'rich',locks:['ground'],layerSeeds:{upper:2},rules:[{partId:'main',side:'north',style:'shopfront'}]});
 assert.equal(validateStudio(r),null);
 for(const bad of [{version:3,seed:1,style:'civic'},{version:1,seed:1,style:'civic',layers:{}},{version:1,seed:1,style:'civic',rules:[{fromFloor:1,toFloor:1,off:true}]},{version:2,seed:1,style:'civic',layers:{upper:{pool:[{id:'lintel',weight:1}]}}},{version:2,seed:1,style:'civic',layers:{trims:{pool:[{id:'arch',weight:1}]}}},{version:2,seed:1,style:'civic',layers:{upper:{pool:[{id:'arch',weight:0}]}}},{version:2,seed:1,style:'civic',layers:{upper:{pattern:'zigzag'}}},{version:2,seed:1,style:'civic',rules:[{fromFloor:2,toFloor:1}]},{version:2,seed:1,style:'civic',rules:[{fromFloor:1,toFloor:1,density:.2}]},{version:2,seed:1,style:'civic',rules:[{side:'north',x0:1,x1:3}]},{version:2,seed:1,style:'civic',bay:20},{version:2,seed:1,style:'civic',layers:{roof:{}}},{version:2,seed:1,style:'civic',rules:[{partId:'main',fromFloor:1,toFloor:2},{partId:'main',fromFloor:1,toFloor:2}]},{version:1,seed:1.5,style:'civic'},{version:1,seed:1,style:'gothic'},{version:1,seed:1,style:'civic',density:2},{version:1,seed:1,style:'civic',locks:['roof']},{version:1,seed:1,style:'civic',rules:[{style:'loft'}]},{version:1,seed:1,style:'civic',extra:true},{version:1,seed:1,style:'civic',rules:[{side:'north'},{side:'north'}]}])assert.ok(validateFacadeRhythm(bad),JSON.stringify(bad));
 assert.ok(validateStudio(recipe({version:1,seed:1,style:'nope' as RhythmStyle})));
 assert.ok(validateVariationRecipe(JSON.parse(JSON.stringify(r)),3),'business import rejects facadeRhythm');
 const modular={version:1,template:'x',recipe:{...JSON.parse(JSON.stringify(r)),studio:{...JSON.parse(JSON.stringify(r.studio)),catalogue:'synarc-kit-5',variation:{version:1,seed:1,rules:[],layers:{}}}}};delete modular.recipe.plotSize;modular.recipe.plotSize=24;
 assert.equal(validateModularBuilding(modular),false,'profile schema rejects facadeRhythm');
});

test('expansion is cheap for a four-part building',()=>{
 const r=recipe({...newFacadeRhythm('townhouse'),trims:'rich'},[vol('main',{width:12,depth:9,spanFloors:4}),vol('wing',{x:9,z:-1,width:6,depth:6,spanFloors:3}),vol('back',{x:-7,z:-3,width:5,depth:5,spanFloors:2}),vol('tower',{x:-2,z:-2,width:4,depth:4,startFloor:4,spanFloors:2})]),d=design(r),bays=studioBays(r,d);
 for(let i=0;i<5;i++)expandFacadeRhythm(r,d,bays);
 const t=performance.now(),n=50;for(let i=0;i<n;i++)expandFacadeRhythm(r,d,bays);const ms=(performance.now()-t)/n;
 const out=expandFacadeRhythm(r,d,bays);console.log(`facade rhythm: ${out.freeOpenings.length} openings on ${out.faces.filter(f=>f.status==='generated').length} faces in ${ms.toFixed(2)} ms`);
 assert.ok(ms<20);
});
