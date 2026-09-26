import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveSculpt} from './citySculpt.ts';
import {freshStudio,validateStudio} from './cityStudio.ts';
import {newDesign} from './cityBuildingV3.ts';
import {validateModularBuilding} from './cityBuildingVariation.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import {resolveFreeOpenings,type FreeFaceOpening} from './cityStudioFreeOpenings.ts';
import {STYLE_DIMS} from './cityStudioFreeOpeningGeometry.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';
import {TRIM,TRIM_PARTS,TRIM_PART_IDS,applicableTrimKinds,deformTrimPositions,fitFreeTrims,freeTrimKinds,groupTrimKinds,pruneFreeTrims,setFreeTrims,sliceCoord,sliceFactor,toggleFreeTrim,trimBounds,trimPart,trimPlacementRect,validateFreeTrims,type TrimKind} from './cityStudioTrimParts.ts';

const face={length:12,height:9.4,ground:true};
const o=(id:string,x:number,bottom:number,width:number,height:number,shape:FreeFaceOpening['shape']='rect',style?:FreeFaceOpening['style']):FreeFaceOpening=>({id,x,bottom,width,height,shape,...(style?{style}:{})});
const fit=(openings:FreeFaceOpening[],kinds:Record<string,TrimKind[]>,groundTop=3.2)=>{const {groups}=resolveFreeOpenings(face,openings);return {groups,...fitFreeTrims({length:face.length,height:face.height,groups,groundTop},g=>g.members.flatMap(m=>kinds[m]??[]))};};

test('catalogue.json and TRIM_PARTS agree on anchors, bounds, stretch bands and tints',()=>{
 const catalogue=JSON.parse(readFileSync(new URL('../../public/city/trims/v1/catalogue.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(catalogue.parts).sort(),[...TRIM_PART_IDS].sort());
 for(const id of TRIM_PART_IDS){const c=catalogue.parts[id],t=TRIM_PARTS[id] as {anchor:string;tint:string;bounds:unknown;stretch:unknown;parent?:string};assert.deepEqual([c.anchor,c.tint,c.parent,c.bounds,c.stretch],[t.anchor,t.tint,t.parent,t.bounds,t.stretch],id);}
});
test('nine-slice keeps caps rigid, scales bands about the origin and supports several bands',()=>{
 const shutter=trimPart('shutter');
 // Width 0.535 -> 0.735: stiles (0..0.06, 0.44..0.5) keep 6 cm; the leaf edge moves by the full 0.2 m.
 const f=sliceFactor(shutter.stretch.x,.535,.735);assert.ok(Math.abs(f-(.38+.2)/.38)<1e-9);
 assert.equal(sliceCoord(.03,shutter.stretch.x,f),.03);assert.ok(Math.abs(sliceCoord(.5,shutter.stretch.x,f)-.7)<1e-9);assert.ok(Math.abs(sliceCoord(.44,shutter.stretch.x,f)-sliceCoord(.5,shutter.stretch.x,f)+.06)<1e-9);
 assert.equal(sliceCoord(-.035,shutter.stretch.x,f),-.035,'pintle outside the band only translates (here: not at all)');
 // Height 1.5 -> 2.1 over two bands: rails keep 8/10 cm, top of the leaf is exactly 2.1.
 const bounds=trimBounds(shutter,{x:.735,y:2.1});assert.ok(Math.abs(bounds[1][1]-2.1)<1e-9&&Math.abs(bounds[0][1]-.7)<1e-9);
 const fy=sliceFactor(shutter.stretch.y,1.5,2.1),mid=[.66,.74].map(v=>sliceCoord(v,shutter.stretch.y,fy));assert.ok(Math.abs(mid[1]-mid[0]-.08)<1e-9,'mid rail keeps its height');
 // Lintel: symmetric twin bands keep the central key 0.24 m wide at any width.
 const lintel=trimPart('lintel-stone'),fl=sliceFactor(lintel.stretch.x,1.32,2.6),key=[-.12,.12].map(v=>sliceCoord(v,lintel.stretch.x,fl));assert.ok(Math.abs(key[1]-key[0]-.24)<1e-9);assert.ok(Math.abs(sliceCoord(.66,lintel.stretch.x,fl)*2-2.6)<1e-9);
 // Deformation and mirror; fixed parts are untouched; bands never collapse.
 const src=new Float32Array([.5,1.5,.02,-.035,0,0]),out=deformTrimPositions(src,shutter,{x:.735,y:2.1},true);assert.ok(Math.abs(out[0]+.7)<1e-6&&Math.abs(out[1]-2.1)<1e-6&&Math.abs(out[3]-.035)<1e-6);
 assert.deepEqual([...deformTrimPositions(src,trimPart('keystone'),{x:3})],[...src]);
 assert.equal(sliceFactor(shutter.stretch.x,.535,0),TRIM.minFactor);
});
test('rules: keystones only on arches, hoods and lintels only on square heads, boxes only on wide upper windows',()=>{
 const {groups}=resolveFreeOpenings(face,[o('rect',2,4,1.2,1.5),o('arch',5,4,1.1,2,'arch'),o('round',8,4.5,1,1,'round'),o('door',10.5,0,1.3,2.6),o('narrow',2,.9,.7,1.4)]),by=(id:string)=>groups.find(g=>g.members.includes(id))!,ctx={groundTop:3.2};
 assert.deepEqual(applicableTrimKinds(ctx,by('rect')),['shutters','window-box','hood','lintel','sill-brackets']);
 assert.deepEqual(applicableTrimKinds(ctx,by('arch')),['shutters','window-box','keystone','sill-brackets']);
 assert.deepEqual(applicableTrimKinds(ctx,by('round')),[]);
 assert.deepEqual(applicableTrimKinds(ctx,by('door')),['hood','lintel','canopy','lamps']);
 assert.ok(!applicableTrimKinds(ctx,by('narrow')).includes('window-box'),'narrow ground-floor window has no box');
});
test('fitter stretches parts to each opening and never overlaps neighbours',()=>{
 const {groups,placements,skipped}=fit([o('narrow',2,4,.8,1.4),o('wide',6.4,4,2.4,1.6),o('arch',10,4,1.1,2,'arch','stone'),o('door',6,0,1.4,2.6)],{narrow:['shutters','hood','sill-brackets'],wide:['shutters','window-box','lintel','hood'],arch:['keystone','shutters'],door:['canopy','lamps']});
 const of=(id:string,part:string)=>placements.filter(p=>p.groupId===groups.find(g=>g.members.includes(id))!.id&&p.part===part);
 // Shutters: one mirrored leaf each side, as tall as the window, leaf = half the window (clamped).
 const narrow=of('narrow','shutter');assert.equal(narrow.length,2);assert.deepEqual(narrow.map(p=>p.mirror),[true,false]);
 const [l,r]=narrow.map(trimPlacementRect),g=groups.find(g=>g.members.includes('narrow'))!,s=STYLE_DIMS[g.style].surround;
 assert.ok(Math.abs(l[1]-(g.x0-s-TRIM.gap)-.035)<1e-6&&Math.abs(r[0]-(g.x1+s+TRIM.gap)+.035)<1e-6,'leaves hinge just outside the surround');
 assert.ok(Math.abs(l[3]-l[2]-1.4)<1e-6&&Math.abs(narrow[0].stretch.x!-.035-.4)<1e-6,'narrow window: 0.4 m leaves, 1.4 m tall');
 const wide=of('wide','shutter');assert.ok(Math.abs(wide[0].stretch.x!-.035-.7)<1e-6,'wide window: leaves clamp at 0.7 m');
 // Hood over the narrow window follows its width; lintel and hood stack on the wide one.
 const hood=of('narrow','hood-mould')[0];assert.ok(Math.abs(hood.stretch.x!-(.8+2*s+.26))<1e-9&&Math.abs(hood.y-(g.y1+s))<1e-9);
 const lintel=of('wide','lintel-stone')[0],wideHood=of('wide','hood-mould')[0];assert.ok(wideHood.y>lintel.y+.28,'hood sits above the lintel');
 // Window box: body spans the sill, brackets under the ends, several plant clumps.
 assert.equal(of('wide','window-box').length,1);assert.equal(of('wide','sill-bracket').length,2);assert.ok(placements.filter(p=>p.part.startsWith('window-box-plant')).length>=6);
 assert.equal(of('narrow','sill-bracket').length,2);
 // Keystone at the apex, scaled; canopy and two lanterns at the door.
 const key=of('arch','keystone')[0],arch=groups.find(g=>g.members.includes('arch'))!;assert.ok(Math.abs(key.y-arch.y1)<1e-9&&key.scale>.9&&key.scale<1.1);
 assert.equal(of('door','door-canopy').length,1);assert.equal(of('door','wall-lamp').length,2);
 // No placement leaves the face or overlaps another group's opening or trims.
 for(const p of placements){const a=trimPlacementRect(p);assert.ok(a[0]>=TRIM.edge-1e-6&&a[1]<=face.length-TRIM.edge+1e-6&&a[2]>=0&&a[3]<=face.height,p.key);
  for(const q of placements)if(q.groupId!==p.groupId){const b=trimPlacementRect(q);assert.ok(!(a[0]<b[1]-1e-6&&b[0]<a[1]-1e-6&&a[2]<b[3]-1e-6&&b[2]<a[3]-1e-6),`${p.key} x ${q.key}`);}
  for(const h of groups)if(h.id!==p.groupId)assert.ok(!(a[0]<h.x1&&h.x0<a[1]&&a[2]<h.y1&&h.y0<a[3]),`${p.key} over ${h.id}`);}
 assert.deepEqual(skipped,[]);
});
test('fitter narrows or skips when the wall is short, and reports rule violations',()=>{
 // Two windows 0.9 m apart: leaves shrink to what fits; closer still, shutters are skipped.
 const tight=fit([o('a',3,4,1.2,1.5),o('b',5.1,4,1.2,1.5)],{a:['shutters'],b:['shutters']});
 const leaves=tight.placements.map(p=>p.stretch.x!-.035);assert.ok(leaves.length===4&&leaves.every(w=>w>=.3-1e-6&&w<.6),String(leaves));
 const cramped=fit([o('a',3,4,1.2,1.5),o('b',4.7,4,1.2,1.5)],{a:['shutters']});assert.equal(cramped.placements.length,0);assert.match(cramped.skipped[0].reason,/Not enough wall/);
 const rules=fit([o('r',4,4.5,1,1,'round'),o('d',8,0,1.2,2.4)],{r:['keystone','window-box'],d:['hood','canopy']});
 assert.deepEqual(rules.skipped.map(s=>s.kind),['keystone','window-box','hood']);assert.equal(rules.placements.filter(p=>p.part==='door-canopy').length,1);
 // Face edge: a window near the corner only gets the lantern/shutter that fits.
 const edge=fit([o('e',.85,4,1,1.4)],{e:['shutters']});assert.equal(edge.placements.length,0);
 // Merged mullioned group: union of member kinds, one keystone per arched panel.
 const merged=fit([o('m1',5,4,1,1.8,'arch'),o('m2',6.1,4,1,1.8,'arch')],{m1:['keystone'],m2:['shutters']});
 assert.equal(merged.groups.length,1);assert.equal(merged.placements.filter(p=>p.part==='keystone').length,2);assert.equal(merged.placements.filter(p=>p.part==='shutter').length,2);
});
test('recipe field: validation, editing helpers and local-only boundary',()=>{
 assert.equal(validateFreeTrims(undefined),null);assert.equal(validateFreeTrims([{openingId:'a',kinds:['shutters','hood']}]),null);
 for(const bad of [{},[{openingId:'a',kinds:[]}],[{openingId:'a',kinds:['glitter']}],[{openingId:'a',kinds:['hood','hood']}],[{openingId:'a',kinds:['hood'],x:1}],[{openingId:'a',kinds:['hood']},{openingId:'a',kinds:['lintel']}],[{openingId:'__proto__',kinds:['hood']}],Array.from({length:65},(_,i)=>({openingId:`o${i}`,kinds:['hood']}))])assert.ok(validateFreeTrims(bad),JSON.stringify(bad).slice(0,60));
 const base:StudioRecipe={version:5,volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:10,startFloor:0,spanFloors:3}],attachments:[],plotSize:24,studio:{...freshStudio(),freeOpenings:[{id:'w',shapeId:'main',side:'north',u:.5,bottom:4,width:1.2,height:1.5,shape:'rect'}]}};
 let r=toggleFreeTrim(base,'w','shutters');r=toggleFreeTrim(r,'w','hood');assert.deepEqual(freeTrimKinds(r,'w'),['shutters','hood']);
 assert.deepEqual(setFreeTrims(r,'w',['lamps','keystone']).studio.freeTrims,[{openingId:'w',kinds:['keystone','lamps']}],'canonical order');
 assert.equal(toggleFreeTrim(toggleFreeTrim(r,'w','shutters'),'w','hood').studio.freeTrims,undefined,'empty list removes the field');
 assert.equal(validateStudio(r),null);assert.ok(validateStudio({...r,studio:{...r.studio,freeTrims:[{openingId:'w',kinds:['nope' as TrimKind]}]}}));
 const orphan=setFreeTrims(r,'gone',['hood']);assert.equal(validateStudio(orphan),null,'stale entries stay valid');assert.deepEqual(pruneFreeTrims(orphan).studio.freeTrims,r.studio.freeTrims);
 assert.deepEqual(groupTrimKinds(orphan.studio.freeTrims,{members:['w','gone']}),['shutters','hood']);
 // Business profiles and preset imports reject the field (freeOpenings removed to isolate it).
 const {freeOpenings:_,...studio}=r.studio,local={...r,studio:{...studio,catalogue:'synarc-kit-5' as const}};void _;
 assert.equal(validateModularBuilding({version:1,template:'t',recipe:local}),false);
 const d={...newDesign('trim-test'),groundHeight:3.4,floors:3,middleFloors:2,crown:'none' as const,roof:'flat' as const};assert.ok(validateVariationRecipe(local,d.floors));
 // Resolution is unaffected by trims (rendering-only): the face still resolves with the opening.
 const out=resolveSculpt(r,d).studio!;assert.deepEqual(out.inactive,[]);assert.equal(out.freeFaces!.length,1);
});
