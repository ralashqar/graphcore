import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign,resolveV3,normalizeV3,applyComposition} from './cityBuildingV3.ts';
import {createModularDesign,resizeModularStructure,validateModularDesign} from './cityModularBuilding.ts';
import {effectiveVariation,expandBuildingVariation,previewStorefront,shuffleVariation,validateVariation} from './cityBuildingVariation.ts';
import {studioBays} from './cityStudio.ts';
import {resolveSculpt,sculptFloorTop} from './citySculpt.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import {VARIATION_LAYERS} from './cityVariationTypes.ts';
import {unpackStorefront} from './cityStorefrontStamps.ts';
const design=(i=8)=>createModularDesign(newDesign('variation-test'),i);
test('all 24 templates resolve identically through the business and studio paths',()=>{
 for(let i=0;i<24;i++){const d=design(i),r=d.modular!.recipe;assert.equal(validateModularDesign(d),null,String(i));const original=JSON.stringify(r),a=resolveV3(d,'#aaaaaa').studioAssembly!,b=resolveSculpt(r,d).studio!;assert.deepEqual(a,b);assert.equal(JSON.stringify(r),original);assert.deepEqual(resolveV3(JSON.parse(JSON.stringify(d)),'#aaaaaa').studioAssembly,a);assert.equal(a.bays.filter(b=>b.entrance).length,1);assert.ok(a.pieces.length>20);}
});
test('manual opening, paint and primary entrance survive independent shuffles',()=>{
 const d=design(),r=d.modular!.recipe,v=r.studio.variation!,bay=studioBays(r,d).find(b=>b.anchor.floor===1)!;
 r.studio.openings.push({id:'manual',anchor:bay.anchor,module:'window-collection-cottage'});r.studio.surfaces.push({id:'paint',anchor:bay.anchor,scope:'spot',channel:'wall',finish:{color:'#123456'}});
 const initial=studioBays(r,d).find(b=>b.entrance)!.anchor;
 for(let i=0;i<12;i++){r.studio.variation=shuffleVariation(r.studio.variation!,'ground');const result=resolveSculpt(r,d).studio!;assert.deepEqual(result.bays.find(b=>b.entrance)!.anchor,initial);assert.ok(result.bays.some(b=>b.module==='window-collection-cottage'&&b.finishes.wall?.color==='#123456'));}
 assert.equal(r.studio.variation!.layers.windows.seed,v.layers.windows.seed);
});
test('scope precedence is deterministic and explicit inheritance works',()=>{
 const d=design(),r=d.modular!.recipe,v=r.studio.variation!,b=studioBays(r,d).find(b=>b.anchor.floor===1)!;
 v.rules=[{id:'region',name:'Region',scope:{kind:'region',fromFloor:1,toFloor:1,faces:[{partId:b.anchor.shapeId,side:b.anchor.side,from:0,to:1}]},layers:{windows:{coverage:.4}}},{id:'floor',name:'Floor',scope:{kind:'floor',fromFloor:1,toFloor:1},layers:{windows:{coverage:.3}}},{id:'part',name:'Part',scope:{kind:'part',partId:b.anchor.shapeId},layers:{windows:{coverage:.2}}}];
 assert.equal(effectiveVariation(v,'windows',b).rule.coverage,.4);delete v.rules[0].layers.windows;assert.equal(effectiveVariation(v,'windows',b).rule.coverage,.3);assert.equal(validateVariation(v),null);
});
test('layer and scoped locks survive shuffling including explicit seed overrides',()=>{
 const v=design().modular!.recipe.studio.variation!;v.layers.windows.locked=true;v.rules=[{id:'f',name:'Floor',scope:{kind:'floor',fromFloor:1,toFloor:1},layers:{ground:{seed:20},windows:{seed:8}}}];const n=shuffleVariation(v);assert.equal(n.layers.windows.seed,v.layers.windows.seed);assert.equal(n.rules[0].layers.ground!.seed,21);assert.equal(n.rules[0].layers.windows!.seed,8);assert.deepEqual(shuffleVariation(v,'windows','f'),v);
});
test('mixed-width storefronts preserve occupied bays and never stretch openings',()=>{
 const d=design(16),r=d.modular!.recipe,v=r.studio.variation!;v.layers.ground.pool=[{id:'stamp-cafe-3',weight:1},{id:'stamp-retail-2',weight:1}];v.layers.ground.coverage=1;
 for(let i=0;i<10;i++){v.layers.ground.seed=i;const result=resolveSculpt(r,d).studio!;assert.equal(result.bays.filter(b=>b.entrance).length,1);for(const p of result.pieces.filter(p=>p.module.startsWith('window-')||p.module.startsWith('door-')))assert.equal(p.scale[0],1);}
});
test('storefront previews protect entrances, replace whole stamps, and unpack to manual edits',()=>{
 const d=design(16),r=d.modular!.recipe,bays=studioBays(r,d),entry=bays.find(b=>b.entrance)!;assert.ok(previewStorefront(r,d,'stamp-cafe-2',entry.anchor).reason);
 const target=bays.find(b=>b.anchor.floor===0&&!b.entrance&&!previewStorefront(r,d,'stamp-cafe-2',b.anchor).reason)!;assert.ok(target);
 const first=previewStorefront(r,d,'stamp-cafe-2',target.anchor);assert.equal(first.reason,null);assert.equal(r.studio.stamps,undefined);
 const second=previewStorefront(first.recipe,d,'stamp-restaurant-2',target.anchor);assert.equal(second.reason,null);assert.equal(second.replaced,1);assert.equal(second.recipe.studio.stamps!.length,1);
 const expanded=expandBuildingVariation(second.recipe,d).recipe,unpacked=unpackStorefront(second.recipe,second.recipe.studio.stamps![0].id,expanded);assert.equal(unpacked.studio.stamps!.length,0);assert.ok(unpacked.studio.openings.some(o=>o.id.startsWith('manual/')));assert.ok(previewStorefront(unpacked,d,'stamp-cafe-2',target.anchor).reason);
});
test('custom upper height propagates into bays and connected roof elevations',()=>{
 const d=resizeModularStructure(design(16),{upperHeight:4,groundHeight:4.25,floors:6});assert.equal(validateModularDesign(d),null);const out=resolveV3(d,'#aaaaaa').studioAssembly!;assert.ok(out.bays.filter(b=>b.anchor.floor>0).every(b=>Math.abs(b.height-4)<1e-8));assert.ok(out.roofFaces!.some(f=>Math.abs(f.base-sculptFloorTop(5,4.25,4))<.01));
});
test('bad input, unknown fields, overflow and catalog escapes are rejected',()=>{
 const d=design();for(const mutate of [(r:any)=>r.studio.extra=true,(r:any)=>r.volumes[0].extra=true,(r:any)=>r.studio.defaults.finishes={glass:{color:'#ffffff'}},(r:any)=>r.studio.variation.layers.ground.pool=[{id:'arbitrary-url',weight:1}],(r:any)=>r.studio.variation.layers.ground.coverage=NaN,(r:any)=>r.studio.stamps=[{id:'x',stamp:'stamp-cafe-2',anchor:{shapeId:'a',side:'invalid',u:0,floor:0}}]]){const r=structuredClone(d.modular!.recipe);mutate(r);assert.ok(validateVariationRecipe(r,d.floors));}
});
test('zero coverage gives wall infill, roof rules skip pitched roofs, missing scopes remain stored',()=>{
 const d=design(0),r=d.modular!.recipe,v=r.studio.variation!;for(const layer of VARIATION_LAYERS)v.layers[layer].coverage=0;v.rules=[{id:'gone',name:'Gone',scope:{kind:'part',partId:'missing'},layers:{windows:{coverage:1}}}];const result=expandBuildingVariation(r,d);assert.ok(result.diagnostics.some(d=>d.id==='gone'));assert.equal(result.recipe.studio.roofDetails?.length??0,0);assert.ok(studioBays(result.recipe,d).filter(b=>!b.entrance).every(b=>b.module==='wall-full'));assert.equal(v.rules.length,1);
});
test('legacy presets drop modular intent only on explicit preset change',()=>{const d=design(),legacy=applyComposition(d,0);assert.equal(legacy.modular,undefined);assert.equal(legacy.upperHeight,undefined);assert.equal(normalizeV3(d).generatorRevision,'city-variation-5');});
