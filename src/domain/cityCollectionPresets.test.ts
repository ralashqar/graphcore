import test from 'node:test';
import assert from 'node:assert/strict';
import {COLLECTION_PRESETS,collectionPreset} from './cityCollectionPresets.ts';
import {initialLandDraft,type LandPlot} from './cityLand.ts';
import {resolveSculpt} from './citySculpt.ts';
import {validateStudio} from './cityStudio.ts';
import {studioModuleAvailable,STUDIO_MODULE_MAP} from './cityStudioCatalog.ts';
import {studioDeckHeight} from './cityStudioCollision.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';
const draft=(i:number,size:24|48=24)=>collectionPreset(initialLandDraft({id:'collection-test',size,rotation:0,vegetationSeed:1} as LandPlot),i,size);
test('24 authored buildings are valid, deterministic and fully assigned on both plot sizes',()=>{
 assert.equal(COLLECTION_PRESETS.length,24);
 for(const size of [24,48] as const)for(let i=0;i<24;i++){
  const d=draft(i,size),r=d.sculpt as StudioRecipe,out=resolveSculpt(r,d.design).studio!;
  assert.equal(validateStudio(r),null,COLLECTION_PRESETS[i].name);assert.deepEqual(out.inactive,[],COLLECTION_PRESETS[i].name);
  assert.equal(out.bays.filter(b=>b.entrance).length,1);assert.ok(out.pieces.some(p=>p.module.includes('collection-')));
  assert.equal(new Set(out.pieces.map(p=>p.id)).size,out.pieces.length);
  for(const p of out.pieces){assert.ok(studioModuleAvailable(r.studio.catalogue,p.module));if(STUDIO_MODULE_MAP.get(p.module)?.opening)assert.equal(p.scale[0],1);}
  assert.deepEqual(resolveSculpt(JSON.parse(JSON.stringify(r)),d.design).studio,out);
 }
});
test('courtyard roof equipment stays on the perimeter and the open courtyard has no roof',()=>{
 const d=draft(17),out=resolveSculpt(d.sculpt!,d.design).studio!;
 assert.ok(out.pieces.some(p=>p.id==='collection/roof'));
 assert.ok(out.roofFaces!.every(f=>studioDeckHeight({id:'test',x:0,z:0,y:f.base,width:0,depth:0,rotation:0,polygon:f.polygon,plane:f.plane},0,0)===null));
});
test('skybridge joins both towers and has an exposed underside with headroom',()=>{
 const d=draft(21),out=resolveSculpt(d.sculpt!,d.design).studio!;
 assert.ok(out.pieces.some(p=>p.module==='window-collection-bridge'));
 const soffit=out.roofPatches!.find(p=>p.partId==='soffit-3')!;assert.ok(soffit.wallVertices!.length>0);
 const deck=out.decks.find(d=>d.id.startsWith('soffit/3/')&&studioDeckHeight(d,0,0)!==null)!;assert.equal(deck.underside,9.65);
 assert.ok(!out.bays.some(b=>b.anchor.shapeId==='bridge'&&Math.abs(Math.sin(b.rotation))>.9),'bridge ends meet towers without internal facades');
});
test('v5 modules cannot enter older catalogs through roof, facade or opening settings',()=>{
 const r=draft(5).sculpt as StudioRecipe;r.studio.catalogue='synarc-kit-4';assert.ok(validateStudio(r));
 for(const id of ['collection-lantern','collection-civic-cornice','window-collection-cottage'])assert.equal(studioModuleAvailable('synarc-kit-4',id),false);
});
test('bespoke facade details inherit edited part finishes',()=>{
 const d=draft(12),r=d.sculpt as StudioRecipe;r.studio.parts.main={finishes:{trim:{color:'#123456'}}};
 const out=resolveSculpt(r,d.design).studio!;
 const accents=out.pieces.filter(p=>p.module==='collection-civic-pilaster');assert.ok(accents.length);
 assert.ok(accents.every(p=>p.finishes?.trim?.color==='#123456'));
 assert.ok(accents.every(p=>p.scale[0]===1),'pilasters preserve their width beside windows');
});
