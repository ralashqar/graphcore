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

test('arcades spread evenly and keep piers wider than the merge gap',async()=>{
 const {arcadeCentres,planArcade,ARCADE}=await import('./studioFreeOpeningTool.ts');
 const c=arcadeCentres(0,10);assert.equal(c.length,5);
 for(let i=1;i<c.length;i++)assert.ok(c[i]-c[i-1]-ARCADE.width>.25,'pier wider than merge gap');
 assert.ok(Math.abs(c[0]-ARCADE.width/2)<1e-9&&Math.abs(c.at(-1)!-(10-ARCADE.width/2))<1e-9);
 assert.deepEqual(arcadeCentres(0,1),[.5]);
 const r=recipe(),plan=planArcade(r,d,{shapeId:'main',side:'south',u:.05,heightAboveBase:1},{shapeId:'main',side:'south',u:.95,heightAboveBase:1},9);
 assert.ok(!('reason' in plan));if('reason' in plan)return;
 assert.ok(plan.height<=d.groundHeight-.35+1e-9,'arch height stays within the ground storey');
 assert.ok(plan.centres.length>=4&&plan.ghosts.every(g=>g.door));
 const upper={...r,volumes:[{...r.volumes[0],startFloor:1}]} as typeof r;
 assert.ok('reason' in planArcade(upper,d,{shapeId:'main',side:'south',u:.1,heightAboveBase:1},{shapeId:'main',side:'south',u:.9,heightAboveBase:1},2.5));
});

test('trim choices follow the opening role and shape',async()=>{
 const {freeOpeningTrimChoices}=await import('./studioFreeOpeningTool.ts');
 const r=recipe([{id:'door',shapeId:'main',side:'south',u:.3,bottom:0,width:1.4,height:2.4,shape:'arch'},{id:'win',shapeId:'main',side:'south',u:.7,bottom:4.5,width:1.2,height:1.4,shape:'rect'}]);
 const door=freeOpeningTrimChoices(r,d,'door')!,win=freeOpeningTrimChoices(r,d,'win')!;
 assert.equal(door.role,'door');assert.ok(door.kinds.includes('canopy')&&!door.kinds.includes('window-box'));
 assert.equal(win.role,'window');assert.ok(win.kinds.includes('shutters')&&win.kinds.includes('hood')&&!win.kinds.includes('keystone'));
 assert.equal(freeOpeningTrimChoices(r,d,'missing'),null);
});
