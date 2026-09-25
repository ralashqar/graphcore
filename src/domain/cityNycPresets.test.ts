import test from 'node:test';
import assert from 'node:assert/strict';
import {NYC_PRESETS,nycPreset} from './cityNycPresets.ts';
import {initialLandDraft,type LandPlot} from './cityLand.ts';
import {resolveSculpt} from './citySculpt.ts';
import {validateStudio,studioBays} from './cityStudio.ts';
import {upgradeStudioInterior} from './cityStudioInteriors.ts';
import {STUDIO_MODULES_V4} from './cityStudioCatalog.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';
const draft=(i:number,size:24|48=24)=>nycPreset(initialLandDraft({id:'nyc-test',size,rotation:0,vegetationSeed:1} as LandPlot),i,size);
const state=(i:number)=>{const d=draft(i);return {d,r:d.sculpt as StudioRecipe};};

test('all NYC presets resolve, retain native proportions on both plot sizes, and round-trip',()=>{
 for(const size of [24,48] as const)for(let i=0;i<NYC_PRESETS.length;i++){
  const d=draft(i,size),r=d.sculpt as StudioRecipe,out=resolveSculpt(r,d.design).studio!;
  assert.equal(validateStudio(r),null);assert.deepEqual(out.inactive,[],NYC_PRESETS[i].name);
  assert.equal(r.volumes[0].width,NYC_PRESETS[i].width);assert.equal(out.bays.filter(b=>b.entrance).length,1);
  assert.ok(out.pieces.some(p=>p.module==='nyc-cornice'));assert.ok(out.pieces.some(p=>p.module==='nyc-chimney'));
  assert.deepEqual(resolveSculpt(JSON.parse(JSON.stringify(r)),d.design).studio,out);
 }
});
test('garage consumes two bays, keeps native scale and remains solid after interior conversion',()=>{
 const {d,r}=state(3),out=resolveSculpt(r,d.design).studio!,garage=out.bays.find(b=>b.module==='wall-nyc-garage')!;
 assert.equal(garage.width,4);assert.equal(garage.entrance,false);assert.equal(out.pieces.find(p=>p.id===garage.id)?.scale[0],1);
 assert.ok(out.blockers.some(b=>b.id===garage.id&&b.width===4));
 const inside=resolveSculpt(upgradeStudioInterior(r),d.design).studio!;
 assert.ok(inside.blockers.some(b=>b.id===garage.id));assert.ok(!inside.portals?.some(p=>p.id.includes(garage.id)));
 assert.ok(inside.portals?.some(p=>p.floor===0));
});
test('wide opening retains its intent when the wall shrinks, storey lowers or host disappears',()=>{
 for(const mutation of ['width','height','host']){
  const {d,r}=state(3);if(mutation==='width')r.volumes[0].width=7;else if(mutation==='height')d.design.groundHeight=3;else r.volumes[0].id='replacement';
  const out=resolveSculpt(r,d.design).studio!;
  assert.ok(out.inactive.some(p=>p.id==='nyc/garage'),mutation);assert.ok(r.studio.openings.some(p=>p.id==='nyc/garage'));
  assert.ok(!out.pieces.some(p=>p.module==='wall-nyc-garage'));
 }
});
test('wide openings cannot overlap a pedestrian entrance or another opening',()=>{
 const {d,r}=state(3),garage=r.studio.openings.find(o=>o.id==='nyc/garage')!,door=r.studio.openings.find(o=>o.module==='door-nyc-residential')!;
 garage.anchor.u=door.anchor.u;
 let out=resolveSculpt(r,d.design).studio!;assert.ok(out.inactive.some(p=>p.id===garage.id));assert.ok(out.bays.some(b=>b.entrance&&b.module.startsWith('door-')));
 const original=state(3);original.r.studio.openings.push({...structuredClone(original.r.studio.openings.find(o=>o.id==='nyc/garage')!),id:'overlap'});
 out=resolveSculpt(original.r,original.d.design).studio!;assert.ok(out.inactive.some(p=>p.id==='overlap'));
});
test('roof details require clear supported flat roofs and preserve failed choices',()=>{
 const {d,r}=state(5);r.studio.roofDetails!.push({...r.studio.roofDetails![0],id:'overlap'});
 let out=resolveSculpt(r,d.design).studio!;assert.ok(out.inactive.some(p=>p.id==='overlap'));assert.ok(out.blockers.some(p=>p.id==='nyc/tank'));
 r.studio.defaults.roof='pitched';out=resolveSculpt(r,d.design).studio!;assert.ok(out.inactive.some(p=>p.id==='nyc/tank'));
});
test('NYC catalog is explicit and rejects unsupported spans, variants and foreign module choices',()=>{
 const {r}=state(0);assert.equal(STUDIO_MODULES_V4.length,105);
 r.studio.catalogue='synarc-kit-3';assert.ok(validateStudio(r));r.studio.catalogue='synarc-kit-4';
 r.studio.openings[0].span=99;assert.ok(validateStudio(r));delete r.studio.openings[0].span;
 assert.equal(validateStudio(r),null);
});
test('storefronts cover the street level and roof returns join adjacent cornices',()=>{
 const {d,r}=state(0),out=resolveSculpt(r,d.design).studio!;
 assert.ok(studioBays(r,d.design).filter(b=>b.anchor.floor===0&&['north','east'].includes(b.anchor.side)).every(b=>b.module.includes('shop')||b.module==='door-nyc-residential'));
 assert.equal(out.pieces.filter(p=>p.module==='nyc-cornice-return').length,4);
 assert.ok(out.pieces.some(p=>p.module==='nyc-awning-corner'));
});
test('the NYC catalog retains connected stair thresholds and stringers',()=>{
 const {d,r}=state(0),bay=studioBays(r,d.design).filter(b=>b.anchor.floor===0&&b.anchor.side==='west').sort((a,b)=>Math.abs(a.z)-Math.abs(b.z))[0];
 r.studio.assemblies.push({id:'nyc-access',kind:'stair',look:'simple',anchors:[bay.anchor],destination:1,exitKind:'door',layout:'switchback'});
 const out=resolveSculpt(r,d.design).studio!;assert.ok(!out.inactive.some(p=>p.id==='nyc-access'));
 assert.ok(out.pieces.some(p=>p.module==='stair-stringer-left'));assert.ok(out.pieces.some(p=>p.module==='stair-top-threshold'));
});
