// Ground contact (docs/city-scene-lighting.md "footprint grounding"): a studio building's grounding follows its parts,
// not the preset design it was converted from; an empty plot has none.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLandWorld,initialLandDraft,landGroundFootprint,landProperty} from './cityLand.ts';
import {emptyStudioDraft,studioDraft,upgradeStudio} from './cityStudio.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const plot=createLandWorld([],400,48).plots[0];
const fresh=()=>emptyStudioDraft(upgradeStudio(initialLandDraft(plot),plot.size)!);

test('a newly bought (empty) plot has no ground contact although its preset design still has masses',()=>{
 const d=fresh();
 assert.ok(d.design.width>0&&d.design.depth>0,'the preset design still carries dimensions');
 assert.deepEqual(landGroundFootprint(d),[]);
 assert.deepEqual(landProperty(plot,d).groundFootprint,[]);
});

test('grounding follows drawn, resized and removed parts',()=>{
 const empty=fresh(),r=structuredClone(empty.sculpt) as StudioRecipe;
 r.volumes=[{id:'a',kind:'rectangle',operation:'add',x:1,z:-2,width:6,depth:4,startFloor:0,spanFloors:2}];
 let d=studioDraft(empty,r);
 const one=landGroundFootprint(d)!;
 assert.equal(one.length,1);assert.deepEqual([one[0].x,one[0].z,one[0].width,one[0].depth],[1,-2,6,4]);
 assert.ok(one[0].top>one[0].bottom&&one[0].bottom<.7);
 r.volumes[0].width=10;r.volumes.push({id:'round',kind:'ellipse',operation:'add',x:-5,z:3,width:4,depth:4,startFloor:1,spanFloors:1},{id:'cut',kind:'rectangle',operation:'subtract',x:0,z:0,width:2,depth:2,startFloor:0,spanFloors:1});
 d=studioDraft(empty,r);const two=landGroundFootprint(d)!;
 assert.equal(two.length,2,'subtractions do not add ground contact');
 assert.ok(Math.abs(two[0].width-10)<1e-9);
 assert.equal(two[1].round,true);assert.ok(two[1].bottom>two[0].bottom,'an upper part starts above the ground');
 r.volumes=[];assert.deepEqual(landGroundFootprint(studioDraft(empty,r)),[]);
});

test('preset (non-studio) drafts keep their design masses',()=>{
 assert.equal(landGroundFootprint(initialLandDraft(plot)),null);
 assert.equal(landProperty(plot,initialLandDraft(plot)).groundFootprint,undefined);
});
