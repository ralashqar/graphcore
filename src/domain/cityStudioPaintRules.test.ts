import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,sculptFloorBottom,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioBays,studioFloorCount,validateStudio} from './cityStudio.ts';
import {newFacadeRhythm} from './cityStudioFacadeRhythm.ts';
import {finishKey,paintPartition,paintSlotAt} from './cityStudioPaintGeometry.ts';
import {addPaintStroke,brushRect} from './cityStudioPaintRegions.ts';
import {studioFacePaint} from './cityStudioFreeFaces.ts';
import {isFrame,studioFaceFrame} from './cityStudioFreeOpenings.ts';
import {addPaintRule,aroundBandRule,movePaintRule,orderedPaintRules,paintRuleFace,paintRuleLabel,paintRuleLayers,paintRuleRects,PAINT_RULE_PRESETS,removePaintRule,reorderPaintRule,updatePaintRule,validatePaintRules,type PaintRuleFace,type StudioPaintRule} from './cityStudioPaintRules.ts';
import {validateModularBuilding} from './cityBuildingVariation.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const box=(id:string,patch:Partial<SculptVolume>={}):SculptVolume=>({id,kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:3,...patch});
const tower=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'tower',kind:'ellipse',operation:'add',x:9,z:0,width:8,depth:8,startFloor:0,spanFloors:3,...patch});
const recipe=(volumes:SculptVolume[],extra:Partial<StudioRecipe['studio']>={}):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:{...freshStudio(),facadeRhythm:newFacadeRhythm('townhouse',3),...extra}});
const design=(r:StudioRecipe,upperHeight=3)=>({...newDesign('paint-rules'),groundHeight:3.4,upperHeight,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const red={color:'#aa3322'},stone={color:'#8a8478',texture:'concrete'},blue={color:'#335577'};
const rule=(p:Partial<StudioPaintRule>&Pick<StudioPaintRule,'kind'>):StudioPaintRule=>({id:p.id??p.kind,channel:'wall',finish:red,...p} as StudioPaintRule);
/** A 3-storey face: ground 0–3.4, then 3 m storeys. */
const face=(patch:Partial<PaintRuleFace>={}):PaintRuleFace=>({shapeId:'main',side:'north',length:12,height:9.4,storeys:[{floor:0,y0:0,y1:3.4},{floor:1,y0:3.4,y1:6.4},{floor:2,y0:6.4,y1:9.4}],floorY:f=>sculptFloorBottom(f,3.4,3)-.65,...patch});

test('rule rectangles per kind: floors, bands, quoins, alternation and floor filters',()=>{
 const f=face();
 assert.deepEqual(paintRuleRects(rule({kind:'floors',floors:'ground'}),f),[[0,12,0,3.4]]);
 assert.deepEqual(paintRuleRects(rule({kind:'floors',floors:'upper'}),f),[[0,12,3.4,9.4]],'contiguous storeys merge');
 assert.deepEqual(paintRuleRects(rule({kind:'floors',floors:'top'}),f),[[0,12,6.4,9.4]]);
 assert.deepEqual(paintRuleRects(rule({kind:'floors',floors:{from:1,to:1}}),f),[[0,12,3.4,6.4]]);
 assert.deepEqual(paintRuleRects(rule({kind:'band',band:{at:'base',offset:0,height:.9}}),f),[[0,12,0,.9]]);
 assert.deepEqual(paintRuleRects(rule({kind:'band',band:{at:'top',offset:0,height:.6}}),f).map(q=>q.map(v=>+v.toFixed(6))),[[0,12,8.8,9.4]]);
 assert.deepEqual(paintRuleRects(rule({kind:'band',band:{at:'storeys',offset:-.125,height:.25}}),f),[[0,12,3.275,3.525],[0,12,6.275,6.525]],'one course per internal storey line');
 assert.deepEqual(paintRuleRects(rule({kind:'band',band:{at:'floor',floor:1,offset:.5,height:.2}}),f).map(q=>q.map(v=>+v.toFixed(6))),[[0,12,3.9,4.1]]);
 const q=paintRuleRects(rule({kind:'quoins',quoins:{width:.7,course:.5}}),f);
 assert.equal(q.length,2*Math.ceil(9.4/.5));assert.deepEqual(q[0],[0,.7,0,.5]);assert.deepEqual(q[3].map(v=>+v.toFixed(6)),[12-.42,12,.5,1],'alternate courses are shorter');
 assert.deepEqual(paintRuleRects(rule({kind:'quoins',quoins:{width:.7}}),f),[[0,.7,0,9.4],[11.3,12,0,9.4]]);
 assert.deepEqual(paintRuleRects(rule({kind:'quoins',quoins:{width:.7}}),face({closed:true})),[],'round walls have no corners');
 const cols=face({columns:[0,3,6,9,12]});
 assert.deepEqual(paintRuleRects(rule({kind:'alternate',alternate:{phase:1}}),cols),[[0,3,0,9.4],[6,9,0,9.4]]);
 assert.deepEqual(paintRuleRects(rule({kind:'alternate',alternate:{phase:0}}),cols),[[3,6,0,9.4],[9,12,0,9.4]]);
 assert.deepEqual(paintRuleRects(rule({kind:'alternate',alternate:{phase:0}}),face()),[],'no columns: skipped');
 assert.deepEqual(paintRuleRects(rule({kind:'quoins',quoins:{width:.7},floors:'upper'}),f),[[0,.7,3.4,9.4],[11.3,12,3.4,9.4]],'floors limit any kind');
 assert.deepEqual(paintRuleRects(rule({kind:'floors',floors:'ground'}),face({storeys:[{floor:2,y0:0,y1:3}]})),[],'a part above the street has no ground floor');
});

test('tiers, scope specificity and list order decide which rule paints on top',()=>{
 const building=rule({id:'b',kind:'floors',floors:'ground',finish:red}),part=rule({id:'p',kind:'floors',floors:'ground',finish:blue,scope:{parts:['main']}}),wall=rule({id:'w',kind:'band',band:{at:'base',offset:0,height:.9},finish:stone,scope:{walls:[{partId:'main',side:'north'}]}}),later=rule({id:'l',kind:'band',band:{at:'base',offset:0,height:.5},finish:red});
 assert.deepEqual(orderedPaintRules([wall,part,building,later]).map(r=>r.id),['b','p','l','w'],'fills < accents; building < parts < walls; list order within a class');
 assert.deepEqual(orderedPaintRules([later,rule({id:'l2',kind:'band',band:{at:'base',offset:0,height:.3}})]).map(r=>r.id),['l','l2'],'later rules of a class win');
 const layers=paintRuleLayers([wall,part,building,later],face());assert.deepEqual(layers.wall.map(l=>finishKey(l.finish)),[red,blue,red,stone].map(finishKey));
 const plinthOverPart=paintPartition(12,9.4,paintRuleLayers([part,later],face()).wall,undefined)!;assert.equal(plinthOverPart.slots[paintSlotAt(plinthOverPart,5,.3)].key,finishKey(red),'a building plinth stays over a part ground-floor fill');
 assert.deepEqual(paintRuleLayers([wall,part],face({side:'south'})).wall.map(l=>finishKey(l.finish)),[finishKey(blue)],'the wall rule targets only its wall');
 assert.deepEqual(paintRuleLayers([part],face({shapeId:'wing'})).wall,[],'the part rule targets only its part');
 const p=paintPartition(12,9.4,paintRuleLayers([wall,part,building],face()).wall,undefined)!;
 assert.equal(p.slots[paintSlotAt(p,5,.4)].key,finishKey(stone));assert.equal(p.slots[paintSlotAt(p,5,2)].key,finishKey(blue));assert.equal(paintSlotAt(p,5,5),-1);
 assert.equal(paintRuleLabel(wall),'Plinth · 0.9 m');assert.equal(paintRuleLabel(rule({kind:'quoins',quoins:{width:.7},floors:'upper'})),'Corner quoins · upper floors');
});

test('hand-drawn regions and tile paint paint over rules on a resolved face',()=>{
 let r=recipe([box('main')]);const d=design(r);
 r=addPaintRule(r,{kind:'floors',floors:'ground',channel:'wall',finish:blue,id:'g'});
 r=addPaintStroke(r,{shapeId:'main',side:'north',channel:'wall',rects:[brushRect(2,1.5,1)],finish:red,id:'s'});
 assert.equal(validateStudio(r),null);
 const frame=studioFaceFrame(r,d,'main','north');assert.ok(isFrame(frame));
 const paint=studioFacePaint(r,'main','north',frame,[],{},paintRuleFace(r,d,'main','north',frame))!;
 assert.deepEqual(paint.wall.map(l=>finishKey(l.finish)),[blue,red].map(finishKey),'rule first, region on top');
 const p=paintPartition(frame.length,frame.height,paint.wall,undefined)!;
 assert.equal(p.slots[paintSlotAt(p,2,1.5)].key,finishKey(red));assert.equal(p.slots[paintSlotAt(p,6,1.5)].key,finishKey(blue));
 const f=resolveSculpt(r,d).studio!.freeFaces!.find(x=>x.id==='main/north')!;
 assert.deepEqual(f.geometry.wallPaint!.map(x=>finishKey(x.finish)).sort(),[blue,red].map(finishKey).sort());
});

test('storey-relative rules follow resizing; bands work on curved faces',()=>{
 let r=recipe([box('main',{x:-5,width:10}),tower({x:5})]);
 r=addPaintRule(r,{kind:'band',band:{at:'storeys',offset:-.125,height:.25},channel:'wall',finish:stone,id:'courses'});
 r=addPaintRule(r,{kind:'band',band:{at:'base',offset:0,height:.9},channel:'wall',finish:red,id:'plinth'});
 const ys=(upper:number)=>{const d=design(r,upper),f=resolveSculpt(r,d).studio!.freeFaces!,curve=f.find(x=>x.side==='curve')!;
  const stoneBuf=curve.geometry.wallPaint!.find(p=>finishKey(p.finish)===finishKey(stone))!.buffers;const y=[];for(let v=0;v<stoneBuf.positions.length/3;v++)y.push(stoneBuf.positions[v*3+1]);return {min:Math.min(...y),max:Math.max(...y),faces:f};};
 const a=ys(3),b=ys(3.6);
 assert.ok(Math.abs(a.min-3.275)<1e-3,`first course above the ground storey (${a.min})`);assert.ok(Math.abs(a.max-6.525)<1e-3,`second course (${a.max})`);
 assert.ok(Math.abs(b.max-7.125)<1e-3,`courses move with taller storeys (${b.max})`);
 const curve=a.faces.find(x=>x.side==='curve')!,plinth=curve.geometry.wallPaint!.find(p=>finishKey(p.finish)===finishKey(red))!.buffers;
 for(let v=0;v<plinth.positions.length/3;v++){const y=plinth.positions[v*3+1],rad=Math.hypot(plinth.positions[v*3]-5,plinth.positions[v*3+2]);assert.ok(y>-1e-4&&y<.9+1e-4);assert.ok(rad>3.7&&rad<4.3,`plinth bent onto the ring (${rad})`);}
 assert.ok(a.faces.filter(x=>x.shapeId==='main').every(x=>x.geometry.wallPaint?.length===2),'every generated wall of the box takes both rules');
});

test('around-the-building bands store a floor anchor and follow storey heights',()=>{
 const d=design(recipe([box('main')])),band=aroundBandRule(d,sculptFloorBottom(1,3.4,3)+.4,sculptFloorBottom(1,3.4,3)+.7,'wall',stone)!;
 assert.deepEqual(band.band,{at:'floor',floor:1,offset:.4,height:.3});
 assert.equal(aroundBandRule(d,1,1.02,'wall',stone),null,'too thin');
 assert.equal(aroundBandRule(d,.2,.8,'wall',stone)!.band!.floor,0,'below the first slab clamps to the ground floor');
});

test('recipe edits: add, update, reorder, move and remove are single recipe changes',()=>{
 let r=recipe([box('main')]);
 for(const p of PAINT_RULE_PRESETS.slice(0,4))r=addPaintRule(r,{...p.rule,finish:red,id:p.id});
 assert.deepEqual(r.studio.paintRules!.map(x=>x.id),['plinth','ground','upper','top']);
 r=movePaintRule(r,'top',-1);assert.deepEqual(r.studio.paintRules!.map(x=>x.id),['plinth','ground','top','upper']);
 r=reorderPaintRule(r,'plinth',3);assert.deepEqual(r.studio.paintRules!.map(x=>x.id),['ground','top','upper','plinth']);
 r=updatePaintRule(r,'ground',{scope:{parts:['main']},finish:blue});assert.deepEqual(r.studio.paintRules![0].scope,{parts:['main']});
 r=updatePaintRule(r,'ground',{scope:undefined});assert.equal('scope' in r.studio.paintRules![0],false,'undefined removes a field');
 assert.equal(validateStudio(r),null);
 for(const id of ['ground','top','upper','plinth'])r=removePaintRule(r,id);assert.equal('paintRules' in r.studio,false);
});

test('validation: studio accepts rules, rejects malformed ones; profiles and business imports reject paintRules',()=>{
 const good:StudioPaintRule[]=[rule({id:'a',kind:'floors',floors:{from:0,to:2}}),rule({id:'b',kind:'band',band:{at:'floor',floor:1,offset:.2,height:.3},scope:{walls:[{partId:'main',side:'curve'}]}}),rule({id:'c',kind:'quoins',quoins:{width:.6,course:.4},floors:'upper',channel:'trim'}),rule({id:'d',kind:'alternate',alternate:{phase:0},scope:{parts:['main']}})];
 assert.equal(validatePaintRules(good),null);assert.equal(validatePaintRules(undefined),null);
 const bad:unknown[]=[
  [rule({kind:'floors'})],[rule({kind:'band',band:{at:'floor',offset:0,height:.2}})],[rule({kind:'band',band:{at:'base',offset:0,height:0}})],[rule({kind:'band',band:{at:'side' as never,offset:0,height:.2}})],
  [rule({kind:'floors',floors:{from:2,to:1}})],[rule({kind:'floors',floors:'middle' as never})],[rule({kind:'quoins',quoins:{width:9}})],[rule({kind:'alternate',alternate:{phase:2 as never}})],
  [rule({kind:'floors',floors:'ground',scope:{}})],[rule({kind:'floors',floors:'ground',scope:{parts:['a'],walls:[{partId:'a',side:'north'}]}})],[rule({kind:'floors',floors:'ground',scope:{walls:[{partId:'a',side:'up'}]}})],
  [rule({kind:'floors',floors:'ground',finish:{texture:'glitter'}})],[rule({kind:'floors',floors:'ground',channel:'door' as never})],[{...rule({kind:'floors',floors:'ground'}),extra:1}],
  [rule({kind:'floors',floors:'ground',band:{at:'base',offset:0,height:.2}})],[rule({id:'x',kind:'floors',floors:'ground'}),rule({id:'x',kind:'floors',floors:'top'})],
  Array.from({length:25},(_,i)=>rule({id:`r${i}`,kind:'floors',floors:'ground'})),'nope'];
 for(const b of bad)assert.ok(validatePaintRules(b),JSON.stringify(b).slice(0,90));
 const r=recipe([box('main')],{paintRules:good});assert.equal(validateStudio(r),null);
 assert.ok(validateStudio({...r,studio:{...r.studio,paintRules:bad[0] as never}}));
 const {facadeRhythm:_,...studio}=r.studio,local={...r,studio:{...studio,catalogue:'synarc-kit-5' as const}};void _;
 assert.equal(validateModularBuilding({version:1,template:'t',recipe:local}),false,'profile schema rejects paintRules');
 assert.ok(validateVariationRecipe(JSON.parse(JSON.stringify(local)),2),'business import rejects paintRules');
});

test('performance: four rules on a four-part building',()=>{
 const vols=[box('a',{x:-5.5,z:-5.5,width:9,depth:8}),box('b',{x:5.5,z:-5.5,width:9,depth:8,spanFloors:4}),box('c',{x:-5.5,z:5.5,width:9,depth:8,spanFloors:2}),tower({x:5.5,z:5.5,width:8,depth:8})];
 const plain=recipe(vols),d=design(plain);let ruled=plain;
 for(const id of ['plinth','upper','courses','quoins'])ruled=addPaintRule(ruled,{...PAINT_RULE_PRESETS.find(p=>p.id===id)!.rule,finish:id==='upper'?blue:stone,id});
 const bays=studioBays(plain,d);assert.ok(bays.length);
 // Interleaved runs so machine noise hits both sides equally; medians of 9.
 resolveSculpt(plain,d);resolveSculpt(ruled,d);const ta:number[]=[],tb:number[]=[];
 for(let i=0;i<9;i++)for(const [r,t] of [[plain,ta],[ruled,tb]] as const){const s=performance.now();resolveSculpt(r,d);t.push(performance.now()-s);}
 const med=(t:number[])=>t.sort((x,y)=>x-y)[4],a=med(ta),b=med(tb),faces=resolveSculpt(ruled,d).studio!.freeFaces!;
 assert.ok(faces.length>=9&&faces.every(f=>f.geometry.wallPaint?.length),'every generated wall is painted');
 console.log(`resolve median: ${a.toFixed(1)} ms without rules, ${b.toFixed(1)} ms with 4 rules (+${(b-a).toFixed(1)} ms) over ${faces.length} faces`);
});
