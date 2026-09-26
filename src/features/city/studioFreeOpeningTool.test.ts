import test from 'node:test';
import assert from 'node:assert/strict';
import {FREE_PRESETS,freeOpeningAtHit,freeOpeningGhost,freeOpeningOutline} from './studioFreeOpeningTool.ts';
import type {StudioRecipe} from '../../domain/cityStudioTypes.ts';

const recipe=(openings:NonNullable<StudioRecipe['studio']['freeOpenings']>=[]):StudioRecipe=>({version:5,volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:10,startFloor:0,spanFloors:2}],attachments:[],studio:{catalogue:'synarc-kit-5',defaults:{},parts:{},surfaces:[],openings:[],assemblies:[],freeOpenings:openings}}) as StudioRecipe;
const d={groundHeight:3.6,upperHeight:3};
const bounds=(loop:[number,number][])=>({minX:Math.min(...loop.map(p=>p[0])),maxX:Math.max(...loop.map(p=>p[0])),minY:Math.min(...loop.map(p=>p[1])),maxY:Math.max(...loop.map(p=>p[1]))});

test('outlines fill their box for every shape',()=>{
 for(const shape of ['rect','arch','pointed','round'] as const){const b=bounds(freeOpeningOutline(shape,1.2,2));assert.ok(Math.abs(b.minX+.6)<1e-6&&Math.abs(b.maxX-.6)<1e-6,shape);assert.ok(Math.abs(b.maxY-1)<1e-6,`${shape} reaches the top`);assert.ok(Math.abs(b.minY+1)<1e-6,`${shape} reaches the bottom`);}
 const pointed=freeOpeningOutline('pointed',1.2,2),apex=pointed.reduce((a,p)=>p[1]>a[1]?p:a);assert.ok(Math.abs(apex[0])<1e-6,'pointed apex is centred');
});

test('ghost snaps low drops on the ground floor to a door',()=>{
 const r=recipe(),preset=FREE_PRESETS.find(p=>p.id==='window')!.preset;
 const low=freeOpeningGhost(r,d,{shapeId:'main',side:'south',u:.5,heightAboveBase:.9},preset)!,high=freeOpeningGhost(r,d,{shapeId:'main',side:'south',u:.5,heightAboveBase:2.4},preset)!;
 assert.equal(low.door,true);assert.equal(high.door,false);assert.ok(high.y>low.y);
 assert.equal(freeOpeningGhost(r,d,{shapeId:'main',side:'south',u:.5,heightAboveBase:.4},FREE_PRESETS.find(p=>p.id==='round')!.preset)!.door,false,'round openings never become doors');
});

test('picking finds an existing opening under the pointer',()=>{
 const r=recipe([{id:'w1',shapeId:'main',side:'south',u:.5,bottom:1,width:1.2,height:1.5,shape:'rect'}]);
 assert.equal(freeOpeningAtHit(r,d,{shapeId:'main',side:'south',u:.5,heightAboveBase:1.6})?.id,'w1');
 assert.equal(freeOpeningAtHit(r,d,{shapeId:'main',side:'south',u:.9,heightAboveBase:1.6}),null);
 assert.equal(freeOpeningAtHit(r,d,{shapeId:'main',side:'north',u:.5,heightAboveBase:1.6}),null);
});
