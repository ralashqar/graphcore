import test from 'node:test';
import assert from 'node:assert/strict';
import {addPaintStroke,brushRect,erasePaintAt,mergeRects,paintBand,paintFinishAt,validatePaintRegions,PAINT_REGIONS} from './cityStudioPaintRegions.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const recipe=():StudioRecipe=>({version:5,volumes:[],attachments:[],studio:{catalogue:'synarc-kit-5',defaults:{},parts:{},surfaces:[],openings:[],assemblies:[]}}) as unknown as StudioRecipe;

test('strokes merge dabs and later regions paint over earlier ones',()=>{
 let r=recipe();
 const dabs=[0,.2,.4,.6].map(x=>brushRect(1+x,1.5,.5));
 r=addPaintStroke(r,{shapeId:'main',side:'north',channel:'wall',rects:dabs,finish:{color:'#aa3322'},id:'a'});
 assert.equal(r.studio.paintRegions![0].rects.length,1,'a straight drag becomes one rectangle');
 r=paintBand(r,{shapeId:'main',side:'north',channel:'wall',y0:0,y1:.9,finish:{texture:'brick'},id:'b'});
 assert.deepEqual(paintFinishAt(r.studio.paintRegions,'main','north','wall',1.2,1.5),{color:'#aa3322'});
 assert.deepEqual(paintFinishAt(r.studio.paintRegions,'main','north','wall',50,.4),{texture:'brick'},'bands span the whole face');
 assert.equal(paintFinishAt(r.studio.paintRegions,'main','south','wall',1.2,1.5),null);
 assert.equal(validatePaintRegions(r.studio.paintRegions),null);
});

test('erase removes the topmost region under the point',()=>{
 let r=paintBand(recipe(),{shapeId:'main',side:'north',channel:'wall',y0:0,y1:1,finish:{color:'#112233'},id:'band'});
 r=addPaintStroke(r,{shapeId:'main',side:'north',channel:'wall',rects:[brushRect(2,.5,.6)],finish:{color:'#445566'},id:'dab'});
 r=erasePaintAt(r,'main','north',2,.5);
 assert.deepEqual(r.studio.paintRegions!.map(g=>g.id),['band']);
 r=erasePaintAt(r,'main','north',2,.5);assert.equal(r.studio.paintRegions,undefined);
});

test('validation rejects bad regions and long strokes stay within budget',()=>{
 assert.match(validatePaintRegions([{id:'x',shapeId:'m',side:'n',channel:'wall',rects:[[1,0,0,1]],finish:{color:'#fff000'}}])!,/invalid shape/);
 assert.match(validatePaintRegions([{id:'x',shapeId:'m',side:'n',channel:'wall',rects:[[0,1,0,1]],finish:{color:'red'}}])!,/invalid/);
 const scattered=Array.from({length:PAINT_REGIONS.rects+40},(_,i)=>brushRect((i%7)*3,Math.floor(i/7)*.9,.4));
 const r=addPaintStroke(recipe(),{shapeId:'m',side:'n',channel:'wall',rects:scattered,finish:{color:'#123456'}});
 assert.ok(r.studio.paintRegions![0].rects.length<=PAINT_REGIONS.rects);
 assert.deepEqual(mergeRects([[0,1,0,1],[1,2,0,1],[5,6,0,1]]),[[0,2,0,1],[5,6,0,1]]);
});
