// Unified facades: kit pieces as opening types in generated walls, stamps and kit tiles as manual spans, the
// retirement of whole-wall ownership, and the conversion of kit-tile buildings (docs/city-unified-facades.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,paintStudio,studioBays,studioFloorCount,validateStudio} from './cityStudio.ts';
import {validateModularBuilding,expandBuildingVariation,enableBuildingVariation} from './cityBuildingVariation.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import {faceX,nudgeFreeOpening,placeFreeOpening,resolveFreeOpenings,resolveStudioFreeFace,studioFaceFrame,validateFreeOpenings,type StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {buildFreeOpeningFaceGeometry} from './cityStudioFreeOpeningGeometry.ts';
import {moduleOpeningSpec} from './cityStudioModuleSpec.ts';
import {expandFacadeRhythm,newFacadeRhythm,setRhythmLayer,validateFacadeRhythm} from './cityStudioFacadeRhythm.ts';
import {convertToUnifiedFacade,isKitTileBuilding} from './cityStudioUnifiedFacade.ts';
import {createLandWorld,initialLandDraft} from './cityLand.ts';
import {nycPreset,NYC_PRESETS} from './cityNycPresets.ts';
import {studioExample,STUDIO_EXAMPLES} from './cityStudioExamples.ts';
import type {StudioRecipe,StudioResolved} from './cityStudioTypes.ts';

const vol=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:10,startFloor:0,spanFloors:3,...patch});
const recipe=(free:StudioFreeOpening[]=[],volumes=[vol()]):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:{...freshStudio(),...(free.length?{freeOpenings:free}:{})}});
const design=(r:StudioRecipe)=>({...newDesign('unified-test'),groundHeight:3.4,upperHeight:3.2,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const kit=(id:string,module:string,u:number,bottom:number,side:StudioFreeOpening['side']='north',shapeId='main'):StudioFreeOpening=>{const s=moduleOpeningSpec(module)!;return {id,shapeId,side,u,bottom,width:s.width,height:s.height,shape:'rect',module};};
const studio=(r:StudioRecipe)=>resolveSculpt(r,design(r)).studio!;
const plot=createLandWorld([],72,24).plots[0];

test('kit modules become opening types: measured aperture, panel or blind',()=>{
 assert.deepEqual(moduleOpeningSpec('window-sash'),{id:'window-sash',category:'window',kind:'aperture',width:2,height:3,aperture:{x0:-.675,x1:.675,y0:.75,y1:2.65}});
 assert.equal(moduleOpeningSpec('door-panelled')!.aperture!.y0,0);
 assert.equal(moduleOpeningSpec('window-nyc-shop-wide')!.width,4);
 assert.equal(moduleOpeningSpec('wall-panel')!.kind,'panel');
 assert.equal(moduleOpeningSpec('wall-full')!.kind,'blind');
 for(const id of ['corner-convex','wall-curve','cornice','balcony-centre','nyc-chimney','nope'])assert.equal(moduleOpeningSpec(id),null,id);
});

test('a kit window cuts exactly its aperture; the wall keeps the reveal but draws no frame or glass',()=>{
 const face={length:12,height:9.8,ground:true};
 const res=resolveFreeOpenings(face,[{id:'k',x:5,bottom:3.4,width:2,height:3,shape:'rect',module:'window-sash'}]);
 assert.deepEqual(res.inactive,[]);assert.equal(res.groups.length,1);
 const g=res.groups[0];assert.equal(g.module,'window-sash');assert.equal(g.role,'window');
 assert.deepEqual([g.x0,g.x1,g.y0,g.y1].map(v=>+v.toFixed(4)),[4.325,5.675,4.15,6.05]);
 assert.deepEqual(res.modules,[{id:'k',module:'window-sash',kind:'aperture',x0:4,x1:6,y0:3.4,y1:6.4,group:'k'}]);
 const geo=buildFreeOpeningFaceGeometry(face,res.groups);
 assert.equal(geo.glass.indices.length,0);assert.equal(geo.frame.indices.length,0);assert.equal(geo.trim.indices.length,0);assert.equal(geo.door.indices.length,0);
 const plain=buildFreeOpeningFaceGeometry(face,[]);assert.ok(geo.wall.indices.length>plain.wall.indices.length,'the hole adds reveal and wear-band triangles');
 // Kit doors at the base of a ground part are doors; on upper storeys or upper parts they stay windows.
 assert.equal(resolveFreeOpenings(face,[{id:'d',x:3,bottom:0,width:2,height:3,shape:'rect',module:'door-panelled'}]).groups[0].role,'door');
 assert.equal(resolveFreeOpenings(face,[{id:'d',x:3,bottom:3.4,width:2,height:3,shape:'rect',module:'door-balcony'}]).groups[0].role,'window');
 // Panels and blinds: no hole; a blind still reserves its tile against other kit pieces.
 const panel=resolveFreeOpenings(face,[{id:'p',x:3,bottom:0,width:2,height:3,shape:'rect',module:'wall-panel'},{id:'b',x:7,bottom:0,width:2,height:3,shape:'rect',module:'wall-full'},{id:'x',x:7.5,bottom:0,width:2,height:3,shape:'rect',module:'window-sash'}]);
 assert.equal(panel.groups.length,0);assert.deepEqual(panel.modules.map(m=>m.kind),['panel','blind']);assert.deepEqual(panel.inactive.map(i=>i.id),['x']);
});

test('kit pieces never merge, abut like bays, refuse to be squeezed and keep shaped openings off their surround',()=>{
 const face={length:6,height:9,ground:true};
 const row=resolveFreeOpenings(face,[0,1,2].map(i=>({id:`k${i}`,x:1+2*i,bottom:3,width:2,height:3,shape:'rect' as const,module:'window-sash'})));
 assert.deepEqual(row.inactive,[]);assert.equal(row.groups.length,3,'adjacent tiles stay three separate pieces');
 const clash=resolveFreeOpenings(face,[{id:'k',x:3,bottom:3,width:2,height:3,shape:'rect',module:'window-sash'},{id:'cut',x:3.6,bottom:4.5,width:1,height:1,shape:'rect'}]);
 assert.deepEqual(clash.inactive.map(i=>i.id),['cut'],'a hole through the kit surround is refused');
 const beside=resolveFreeOpenings(face,[{id:'k',x:1,bottom:3,width:2,height:3,shape:'rect',module:'window-sash'},{id:'win',x:4.5,bottom:4,width:1,height:1.4,shape:'rect'}]);
 assert.deepEqual(beside.inactive,[]);assert.equal(beside.groups.length,2);
 assert.match(resolveFreeOpenings(face,[{id:'k',x:.5,bottom:3,width:2,height:3,shape:'rect',module:'window-sash'}]).inactive[0].reason,/does not fit/,'never clamped');
 assert.match(resolveFreeOpenings({...face,height:4},[{id:'k',x:3,bottom:3,width:2,height:3,shape:'rect',module:'window-sash'}]).inactive[0].reason,/too low/);
});

test('resolveSculpt draws a kit piece in the generated wall as an instanced kit piece without its wall slab',()=>{
 const r=recipe([kit('k','window-shuttered',.5,3.4)]),out=studio(r),frame=studioFaceFrame(r,design(r),'main','north');
 assert.ok(!('reason' in frame));const face=out.freeFaces!.find(f=>f.id==='main/north')!;assert.ok(face);
 const piece=out.pieces.find(p=>p.id==='free/k')!;assert.ok(piece,'kit piece emitted');
 assert.equal(piece.module,'window-shuttered');assert.deepEqual(piece.omit,['wall']);assert.deepEqual(piece.scale,[1,1,1]);
 assert.ok(Math.abs(piece.x-0)<1e-6&&Math.abs(piece.z-5)<1e-6&&Math.abs(piece.y-frame.base-3.4)<1e-6,'centred on the face, on the storey floor');
 assert.ok(!out.pieces.some(p=>out.bays.some(b=>b.id===p.id&&b.anchor.side==='north')),'bay tiles of the face are gone');
 assert.ok(out.pieces.some(p=>out.bays.some(b=>b.id===p.id&&b.anchor.side==='south')),'other walls keep their tiles');
 assert.equal(face.groups[0].module,'window-shuttered');assert.equal(face.geometry.glass.indices.length,0);
 // The bay under the piece stays resolved for anchors; v6 portal doors leave their kit leaf out.
 const v6:StudioRecipe={...recipe([kit('d','door-panelled',.3,0)]),version:6,interior:{partitions:[],doors:[],stairs:[],floorFinish:'timber',wallColor:'#eeeeee'}} as StudioRecipe;
 const o6=studio(v6);assert.deepEqual(o6.pieces.find(p=>p.id==='free/d')!.omit,['wall','door','glass']);assert.ok(o6.portals!.some(p=>p.id.startsWith('exterior/free/d')));
});

test('kit pieces work on curved walls: flat on the chord, refused where the curve is too tight',()=>{
 const round=vol({id:'tower',kind:'ellipse',width:9,depth:9}),r=recipe([kit('k','window-sash',.5,3.4,'curve','tower')],[round]),out=studio(r);
 assert.deepEqual(out.inactive.filter(i=>i.id==='k'),[]);const p=out.pieces.find(p=>p.id==='free/k')!;assert.ok(p);
 const face=out.freeFaces!.find(f=>f.id==='tower/curve')!,plane=face.bend!.planes[face.groups.findIndex(g=>g.id==='k')];
 assert.ok(Math.abs(Math.atan2(plane.nx,plane.nz)-p.rotation)<1e-9,'faces the chord normal');
 const tight=recipe([kit('k','window-nyc-shop-wide',.5,0,'curve','tower')],[vol({id:'tower',kind:'ellipse',width:2.4,depth:2.4})]);tight.studio.catalogue='synarc-kit-4';
 assert.match(studio(tight).inactive.find(i=>i.id==='k')!.reason,/curves too tightly|narrow/);
});

test('placing and dragging kit pieces: storey floors, bay snap, no overlap',()=>{
 const r=recipe(),d=design(r),bays=studioBays(r,d);
 const placed=placeFreeOpening(r,d,{shapeId:'main',side:'north',u:.43,heightAboveBase:5},{width:2,height:3,shape:'rect',module:'window-arched'},bays);
 assert.ok(!('reason' in placed));const o=placed.opening;assert.equal(o.module,'window-arched');assert.equal(o.bottom,3.4,'stands on the first-floor slab');
 const f=studioFaceFrame(r,d,'main','north');assert.ok(!('reason' in f));
 assert.ok(bays.some(b=>b.anchor.side==='north'&&Math.abs(Math.abs(b.x)-Math.abs(faceX(f,o.u)-6))<1e-6),'snapped onto a bay centre');
 const moved=nudgeFreeOpening(placed.recipe,d,o.id,{dy:3.1},bays);assert.ok(!('reason' in moved));assert.equal(moved.opening.bottom,6.6,'next storey up');
 assert.equal(moved.opening.width,2);
 const again=placeFreeOpening(placed.recipe,d,{shapeId:'main',side:'north',u:o.u,heightAboveBase:4.5},{width:2,height:3,shape:'rect',module:'window-sash'},bays);
 assert.ok('reason' in again,'a second piece on the same tile is refused');
});

test('validation: local plots accept kit pieces and unified facades; business profiles reject them',()=>{
 const r=recipe([kit('k','window-sash',.5,0)]);r.studio.facade='unified';
 assert.equal(validateStudio(r),null);
 assert.equal(validateFreeOpenings([{...kit('k','window-sash',.5,0),width:1.5}]),'A kit piece opening is invalid.');
 assert.equal(validateFreeOpenings([{...kit('k','window-sash',.5,0),style:'stone'}]),'A kit piece opening is invalid.');
 assert.equal(validateFreeOpenings([{id:'k',shapeId:'main',side:'north',u:.5,bottom:0,width:2,height:3,shape:'rect',module:'cornice'}]),'A kit piece opening is invalid.');
 assert.match(validateStudio(recipe([kit('k','window-collection-cafe',.5,0)]))!,/not in the selected kit/,'kit-3 has no collection windows');
 assert.match(validateStudio({...r,studio:{...r.studio,facade:'tiles' as never}})!,/facade model/);
 // Many kit pieces: a converted building has one per bay.
 assert.equal(validateFreeOpenings(Array.from({length:200},(_,i)=>({...kit(`k${i}`,'window-sash',.5,0)}))),null);
 assert.ok(validateFreeOpenings(Array.from({length:70},(_,i)=>({id:`f${i}`,shapeId:'main',side:'north' as const,u:.5,bottom:0,width:1,height:1,shape:'rect' as const}))));
 // Rhythm pools may name kit pieces.
 assert.equal(validateFacadeRhythm({version:2,seed:1,style:'townhouse',layers:{upper:{pool:[{id:'module:window-sash',weight:1}]}}}),null);
 assert.ok(validateFacadeRhythm({version:2,seed:1,style:'townhouse',layers:{trims:{pool:[{id:'module:window-sash',weight:1}]}}}));
 assert.ok(validateFacadeRhythm({version:2,seed:1,style:'townhouse',layers:{upper:{pool:[{id:'module:cornice',weight:1}]}}}));
 // Business/profile boundaries never see these fields.
 const d=nycPreset(initialLandDraft(plot),0,24),biz=structuredClone(d.sculpt) as StudioRecipe;biz.studio.catalogue='synarc-kit-5';biz.studio.variation=expandBuildingVariation(enableBuildingVariation(biz),d.design).recipe.studio.variation??enableBuildingVariation(biz).studio.variation;
 for(const extra of [{facade:'unified'},{freeOpenings:[kit('k','window-sash',.5,0,'north','nyc-main')]},{facadeRhythm:{version:2,seed:1,style:'townhouse',layers:{upper:{pool:[{id:'module:window-sash',weight:1}]}}}}]){
  const value={...biz,studio:{...biz.studio,...extra}};
  assert.equal(validateModularBuilding({version:1,template:'t',recipe:value}),false,JSON.stringify(Object.keys(extra)));
  assert.ok(validateVariationRecipe(value,d.design.floors,24),JSON.stringify(Object.keys(extra)));
 }
});

test('storefront stamps and kit tiles reserve their span on a rhythm wall; the rhythm fills around them',()=>{
 const d0=nycPreset(initialLandDraft(plot),1,24),r=structuredClone(d0.sculpt) as StudioRecipe,d=d0.design;
 r.studio.catalogue='synarc-kit-5';r.studio.openings=[];r.studio.assemblies=[];
 const front=studioBays(r,d).filter(b=>b.anchor.side==='north'&&b.anchor.floor===0).sort((a,b)=>a.anchor.u-b.anchor.u);
 r.studio.stamps=[{id:'cafe',stamp:'stamp-cafe-2',anchor:front[0].anchor}];
 r.studio.openings=[{id:'mine',anchor:studioBays(r,d).filter(b=>b.anchor.side==='north'&&b.anchor.floor===2)[0].anchor,module:'window-nyc-paired'}];
 r.studio.facadeRhythm=newFacadeRhythm('townhouse',3);
 const out=resolveSculpt(r,d).studio!,expanded=expandBuildingVariation(r,d).recipe,rhythm=expandFacadeRhythm(expanded,d,studioBays(expanded,d));
 const north=rhythm.faces.find(f=>f.side==='north')!;assert.equal(north.status,'generated','a kit tile no longer makes the wall manual');assert.ok(north.openings>0);
 assert.ok(!out.inactive.some(i=>/own this wall/.test(i.reason)),'no whole-wall ownership');
 const stampPieces=out.pieces.filter(p=>p.id.startsWith('free/kit/stamp/cafe/'));assert.equal(stampPieces.length,2,'both storefront bays render as kit pieces');
 assert.ok(out.pieces.some(p=>p.id==='free/kit/mine'),'the manual kit tile renders as a kit piece');
 assert.ok(out.pieces.some(p=>p.id.startsWith('stamp/cafe/canopy/'))&&out.pieces.some(p=>p.id.startsWith('stamp/cafe/fascia/')),'the stamp keeps its canopy and fascia assemblies');
 const face=resolveStudioFreeFace(expanded,d,'nyc-main','north',studioBays(expanded,d));assert.ok(!('reason' in face));
 const tiles=face.resolution.modules.filter(m=>m.id.startsWith('kit/'));
 for(const o of rhythm.freeOpenings.filter(o=>o.side==='north')){const x=faceX(face.frame,o.u);
  for(const t of tiles)assert.ok(x+o.width/2<=t.x0+.01||x-o.width/2>=t.x1-.01||o.bottom>=t.y1-.01||o.bottom+o.height<=t.y0+.01,`${o.id} keeps clear of ${t.id}`);}
});

test('version-1 rhythms keep the legacy rule: a kit opening owns its wall',()=>{
 const d0=nycPreset(initialLandDraft(plot),1,24),r=structuredClone(d0.sculpt) as StudioRecipe;r.studio.facadeRhythm={version:1,seed:3,style:'townhouse'};
 const out=expandFacadeRhythm(r,d0.design,studioBays(r,d0.design));assert.equal(out.faces.find(f=>f.side==='north')!.status,'manual');
});

test('rhythm pools with kit pieces place native tiles on storey floors',()=>{
 let r=recipe([],[vol({width:14})]);r=setRhythmLayer(r,[],'upper',{pool:[{id:'module:window-shuttered',weight:1}],coverage:1,uniformity:1});
 const d=design(r),out=expandFacadeRhythm(r,d,studioBays(r,d)),kits=out.freeOpenings.filter(o=>o.module);
 assert.ok(kits.length>=6,`${kits.length} kit pieces`);assert.ok(kits.every(o=>o.module==='window-shuttered'&&o.width===2&&o.height===3&&[3.4,6.6].some(b=>Math.abs(o.bottom-b)<1e-6)));
 assert.ok(!out.freeTrims.some(t=>kits.some(k=>k.id===t.openingId)),'kit pieces bring their own trims');
 const res=resolveSculpt(r,d).studio!;assert.deepEqual(res.inactive,[]);assert.equal(res.pieces.filter(p=>p.id.startsWith('free/generated/rhythm/')).length,kits.length);
});

/** Kit window/door/panel tiles as drawn: [module, x, y, z, rotation]. */
const kitTiles=(s:StudioResolved)=>{const bays=new Set(s.bays.map(b=>b.id));return s.pieces.filter(p=>(bays.has(p.id)||p.id.startsWith('free/'))&&moduleOpeningSpec(p.module)&&moduleOpeningSpec(p.module)!.kind!=='blind').map(p=>[p.module,+p.x.toFixed(3),+p.y.toFixed(3),+p.z.toFixed(3),+(((p.rotation%(2*Math.PI))+2*Math.PI+1e-6)%(2*Math.PI)).toFixed(4)].join('|')).sort();};

test('conversion keeps New York presets looking the same: every kit tile becomes a kit piece in place',()=>{
 for(let i=0;i<NYC_PRESETS.length;i++){
  const draft=nycPreset(initialLandDraft(plot),i,24),r=draft.sculpt as StudioRecipe,before=resolveSculpt(r,draft.design).studio!;
  const snapshot=structuredClone(r),out=convertToUnifiedFacade(r,draft.design);assert.ok(!('reason' in out),NYC_PRESETS[i].name);
  assert.deepEqual(r,snapshot,'the input recipe is untouched (the studio commits the result as one undo step)');
  const after=resolveSculpt(out.recipe,draft.design).studio!;
  assert.equal(out.recipe.studio.facade,'unified');assert.deepEqual(out.recipe.studio.openings,[]);
  assert.deepEqual(kitTiles(after),kitTiles(before),`${NYC_PRESETS[i].name}: same kit tiles at the same places`);
  assert.equal(after.pieces.filter(p=>p.id.startsWith('free/')).length,out.openings);
  assert.deepEqual(after.inactive.map(x=>x.id).sort(),before.inactive.map(x=>x.id).sort(),'assemblies stay anchored');
  const assemblyPieces=(s:StudioResolved)=>s.pieces.filter(p=>p.id.startsWith('nyc/')).map(p=>[p.module,p.x,p.y,p.z,p.rotation,...p.scale].map(v=>typeof v==='number'?+v.toFixed(4):v).join('|')).sort();assert.deepEqual(assemblyPieces(after),assemblyPieces(before),'cornices, awnings, balconies and pilasters unchanged');
  assert.deepEqual(after.decks,before.decks);assert.equal(after.freeFaces!.length,before.bays.reduce((s,b)=>s.add(`${b.anchor.shapeId}/${b.anchor.side}`),new Set<string>()).size,'every exposed wall is generated');
  assert.deepEqual(out.recipe.studio.surfaces,r.studio.surfaces);assert.ok(!isKitTileBuilding(out.recipe));
  assert.equal(validateStudio(out.recipe),null);
  assert.match((convertToUnifiedFacade(out.recipe,draft.design) as {reason:string}).reason,/already/);
 }
});

test('conversion of the studio examples: parity except the one tile across a round seam',()=>{
 for(let i=0;i<STUDIO_EXAMPLES.length;i++){
  const draft=studioExample(initialLandDraft(plot),i,24),r=draft.sculpt as StudioRecipe,before=resolveSculpt(r,draft.design).studio!,out=convertToUnifiedFacade(r,draft.design);
  assert.ok(!('reason' in out),STUDIO_EXAMPLES[i].name);const after=resolveSculpt(out.recipe,draft.design).studio!,b=kitTiles(before),a=kitTiles(after);
  assert.deepEqual(after.inactive.map(x=>x.id).sort(),before.inactive.map(x=>x.id).sort(),`${STUDIO_EXAMPLES[i].name}: nothing new is inactive`);
  if(r.volumes.some(v=>v.kind==='ellipse'))assert.ok(a.length>=b.length-2,`${STUDIO_EXAMPLES[i].name}: curved walls keep their tiles`);
  else assert.deepEqual(a,b,`${STUDIO_EXAMPLES[i].name}: same kit tiles at the same places`);
 }
});

test('conversion keeps paint, stamps and stairs, and materialises variation picks',()=>{
 const draft=studioExample(initialLandDraft(plot),2,24),base=draft.sculpt as StudioRecipe,d=draft.design;
 // A stair to the second storey exits through a balcony door (the resolver turns that bay's window into one).
 base.studio.assemblies.find(a=>a.id==='side-stair')!.destination=2;
 // Tile paint on one bay (frame channel) is carried by the kit piece standing there.
 const bay=studioBays(base,d).find(b=>b.anchor.side==='north'&&b.anchor.floor===1)!;
 const painted=paintStudio(base,bay.anchor,'spot','frame',{color:'#aa2233'}),out=convertToUnifiedFacade(painted,d);assert.ok(!('reason' in out));
 const after=resolveSculpt(out.recipe,d).studio!,piece=after.pieces.find(p=>p.id.startsWith('free/')&&Math.abs(p.x-bay.x)<1e-6&&Math.abs(p.z-bay.z)<1e-6&&Math.abs(p.y-bay.y)<1e-6)!;
 assert.equal(piece.finishes?.frame?.color,'#aa2233');
 assert.ok(after.accessRoutes!.some(a=>a.id==='side-stair'),'the connected stair still reaches its exit');
 assert.ok(after.pieces.some(p=>p.id.startsWith('free/')&&p.module==='door-balcony'),'its balcony door became a kit piece');
 // Variation picks become fixed pieces; the variation is dropped.
 const v5=nycPreset(initialLandDraft(plot),4,24),varied=enableBuildingVariation(v5.sculpt as StudioRecipe),vb=resolveSculpt(varied,v5.design).studio!;
 const vc=convertToUnifiedFacade(varied,v5.design);assert.ok(!('reason' in vc));assert.equal(vc.recipe.studio.variation,undefined);
 const va=resolveSculpt(vc.recipe,v5.design).studio!;assert.deepEqual(kitTiles(va),kitTiles(vb),'variation windows kept in place');
 assert.ok(vc.recipe.studio.assemblies.some(a=>a.id.startsWith('converted/'))||vc.recipe.studio.roofDetails?.some(p=>p.id.startsWith('converted/')));
 assert.ok(!vc.recipe.studio.assemblies.some(a=>a.id.startsWith('generated/')));
 // Stamps stay stamps and render as kit pieces.
 const s0=structuredClone(v5.sculpt) as StudioRecipe;s0.studio.catalogue='synarc-kit-5';s0.studio.openings=[];
 const front=studioBays(s0,v5.design).filter(b=>b.anchor.side==='north'&&b.anchor.floor===0).sort((a,b)=>a.anchor.u-b.anchor.u);const at=front.findIndex((b,i)=>!b.entrance&&front[i+1]&&!front[i+1].entrance);s0.studio.stamps=[{id:'shop',stamp:'stamp-retail-2',anchor:front[at].anchor}];assert.deepEqual(expandBuildingVariation(s0,v5.design).diagnostics,[]);
 const sb=resolveSculpt(s0,v5.design).studio!,sc=convertToUnifiedFacade(s0,v5.design);assert.ok(!('reason' in sc));assert.deepEqual(sc.recipe.studio.stamps,s0.studio.stamps);
 const sa=resolveSculpt(sc.recipe,v5.design).studio!;assert.deepEqual(kitTiles(sa),kitTiles(sb));assert.ok(sa.pieces.some(p=>p.id.startsWith('free/kit/stamp/shop/')));
});
