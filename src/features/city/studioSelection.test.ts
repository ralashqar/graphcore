import test from 'node:test';
import assert from 'node:assert/strict';
import {assembliesAt,countStudioItems,eraseStudioItems,kitOpeningAt,removeStudioOpenings,roofDetailNear,selectionCrumbs,stepUpSelection,toggleIn,sameWall,type StudioSelection} from './studioSelection.ts';
import type {StudioRecipe} from '../../domain/cityStudioTypes.ts';

const anchor=(side:string,floor=0,u=.5)=>({shapeId:'main',side,floor,u}) as never;
const recipe=():StudioRecipe=>({version:5,volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:8,startFloor:0,spanFloors:3},{id:'wing',kind:'rectangle',operation:'add',x:8,z:0,width:4,depth:4,startFloor:0,spanFloors:1}],attachments:[],
 studio:{catalogue:'synarc-kit-5',defaults:{},parts:{main:{finishes:{wall:{color:'#fff'}}}},
  surfaces:[{id:'s1',anchor:anchor('north'),scope:'spot',channel:'wall',finish:{color:'#f00'}},{id:'s2',anchor:anchor('east'),scope:'spot',channel:'wall',finish:{color:'#0f0'}}],
  openings:[{id:'k1',anchor:anchor('north',1,.25),module:'window-sash'},{id:'k2',anchor:anchor('south',1),module:'window-sash'}],
  assemblies:[{id:'a1',kind:'balcony',anchors:[anchor('north',1,.25)],look:'simple'}],
  stamps:[{id:'t1',stamp:'stamp-cafe-2',anchor:anchor('north')}],
  freeOpenings:[{id:'f1',shapeId:'main',side:'north',u:.3,bottom:3,width:1.2,height:1.5,shape:'rect'},{id:'f2',shapeId:'main',side:'west',u:.5,bottom:3,width:1.2,height:1.5,shape:'arch'}],
  freeTrims:[{openingId:'f1',kinds:['shutters']},{openingId:'f2',kinds:['keystone']}],
  paintRegions:[{id:'p1',shapeId:'main',side:'north',channel:'wall',rects:[[0,0,1,1]],finish:{color:'#00f'}}],
  roofDetails:[{id:'r1',partId:'main',module:'nyc-chimney',u:.25,v:.25,rotation:0}],
 }} as unknown as StudioRecipe);

test('stepping up the breadcrumb goes opening → wall → part → building',()=>{
 let s:StudioSelection={level:'opening',partId:'main',wall:{shapeId:'main',side:'north'},openings:[{kind:'free',id:'f1'}]};
 s=stepUpSelection(s);assert.equal(s.level,'wall');
 s=stepUpSelection(s);assert.deepEqual(s,{level:'part',partId:'main'});
 s=stepUpSelection(s);assert.equal(s.level,'building');
 assert.equal(stepUpSelection(s).level,'building');
 assert.deepEqual(stepUpSelection({level:'object',partId:null,object:{kind:'roof-detail',id:'r1'}}),{level:'building'});
});

test('crumbs name each level and carry the selection they step back to',()=>{
 const crumbs=selectionCrumbs({level:'tile',partId:'main',wall:{shapeId:'main',side:'north'},bays:['b1','b2']},id=>id==='main'?'Main part':id);
 assert.deepEqual(crumbs.map(c=>c.label),['Building','Main part','Front wall','2 tiles']);
 assert.equal(crumbs[2].selection.level,'wall');
});

test('shift toggles membership, a plain click replaces',()=>{
 const a={shapeId:'main',side:'north'},b={shapeId:'main',side:'east'};
 assert.deepEqual(toggleIn([a],b,sameWall,false),[b]);
 assert.deepEqual(toggleIn([a],b,sameWall,true),[a,b]);
 assert.deepEqual(toggleIn([a,b],a,sameWall,true),[b]);
});

test('bulk erase removes only the chosen kind on the chosen wall, as one edit',()=>{
 const r=recipe(),north={walls:[{shapeId:'main',side:'north'}]};
 const openings=eraseStudioItems(r,'openings',north);
 assert.deepEqual(openings.studio.freeOpenings?.map(o=>o.id),['f2']);
 assert.deepEqual(openings.studio.openings.map(o=>o.id),['k2']);
 assert.deepEqual(openings.studio.freeTrims?.map(t=>t.openingId),['f2'],'trims of removed openings are pruned');
 assert.equal(openings.studio.surfaces.length,2,'paint is untouched');
 const paint=eraseStudioItems(r,'paint',north);
 assert.deepEqual(paint.studio.surfaces.map(s=>s.id),['s2']);assert.equal(paint.studio.paintRegions,undefined);
 assert.equal(eraseStudioItems(r,'decor',north).studio.assemblies.length,0);
 assert.equal(eraseStudioItems(r,'storefronts',north).studio.stamps,undefined);
 assert.deepEqual(eraseStudioItems(r,'trims',north).studio.freeTrims?.map(t=>t.openingId),['f2']);
 assert.equal(eraseStudioItems(r,'openings',{walls:[{shapeId:'wing',side:'north'}]}),r,'nothing matched returns the same recipe');
});

test('erasing paint on a part also clears the part finish; roof details go with their part',()=>{
 const r=recipe(),out=eraseStudioItems(r,'paint',{parts:['main']});
 assert.equal(out.studio.surfaces.length,0);assert.equal(out.studio.parts.main.finishes,undefined);
 assert.equal(eraseStudioItems(r,'roof',{parts:['main']}).studio.roofDetails?.length,0);
 assert.equal(eraseStudioItems(r,'roof',{parts:['wing']}),r);
});

test('counts drive the inspector',()=>{
 const c=countStudioItems(recipe(),{walls:[{shapeId:'main',side:'north'}]});
 assert.deepEqual(c,{openings:2,storefronts:1,trims:1,paint:2,decor:1,roof:1});
});

test('tile lookups and removal by reference',()=>{
 const r=recipe();
 assert.equal(kitOpeningAt(r,anchor('north',1,.26))?.id,'k1');
 assert.equal(kitOpeningAt(r,anchor('north',1,.4)),null);
 assert.deepEqual(assembliesAt(r,anchor('north',1,.25)).map(a=>a.id),['a1']);
 const out=removeStudioOpenings(r,[{kind:'free',id:'f1'},{kind:'kit',id:'k2'},{kind:'stamp',id:'t1'}]);
 assert.deepEqual(out.studio.freeOpenings?.map(o=>o.id),['f2']);assert.deepEqual(out.studio.openings.map(o=>o.id),['k1']);assert.deepEqual(out.studio.stamps,[]);
 assert.deepEqual(out.studio.freeTrims?.map(t=>t.openingId),['f2']);
 assert.equal(roofDetailNear(r,'main',3,2),'r1');assert.equal(roofDetailNear(r,'main',-4,-3),null);
});
