import test from 'node:test';
import assert from 'node:assert/strict';
import {studioClearanceBoxes,studioClearanceFraction,studioClearViewPosition,studioNeighbourTop} from './cityStudioCameraClearance.ts';
import {estatePlotAxis} from './cityLayout.ts';

const box={id:'n',minX:-10,maxX:10,minZ:30,maxZ:50,top:20};

test('a clear sight line keeps the camera where the controls put it',()=>{
 assert.equal(studioClearanceFraction({x:0,y:10,z:0},{x:0,y:10,z:-60},[box],1),1);
 // Passing above the neighbour's roof is fine.
 assert.equal(studioClearanceFraction({x:0,y:30,z:0},{x:0,y:40,z:60},[box],1),1);
});

test('a camera inside or behind a neighbour is pulled to just before it',()=>{
 const inside=studioClearanceFraction({x:0,y:10,z:0},{x:0,y:16,z:40},[box],1);
 assert.ok(Math.abs(inside-29/40)<1e-9,`${inside}`);
 const behind=studioClearanceFraction({x:0,y:10,z:0},{x:0,y:10,z:80},[box],2);
 assert.ok(Math.abs(behind-28/80)<1e-9,`${behind}`);
 // The nearest of several neighbours wins.
 const nearer={...box,id:'m',minZ:20,maxZ:25};
 assert.ok(Math.abs(studioClearanceFraction({x:0,y:10,z:0},{x:0,y:10,z:80},[box,nearer],0)-20/80)<1e-9);
});

test('a target panned over a neighbour never traps the camera',()=>{
 assert.equal(studioClearanceFraction({x:0,y:5,z:40},{x:0,y:12,z:70},[box],1),1);
});

test('neighbour heights follow their recipes with room for roofs, and fall back to the tier massing',()=>{
 const low=studioNeighbourTop({tier:1},48),tall=studioNeighbourTop({tier:5},48);
 assert.ok(low>=3*2&&tall>30*2,`${low} ${tall}`);
 assert.ok(tall>low);
});

test('clearance boxes cover whole neighbouring plots and skip the plot being edited',()=>{
 const boxes=studioClearanceBoxes([{id:'self',x:2,z:-5},{id:'next',x:2,z:-4,tier:2},{id:'land',x:0,z:0,centre:{x:500,z:500}}],'self',estatePlotAxis,48);
 assert.deepEqual(boxes.map(b=>b.id),['next','land']);
 const next=boxes[0];assert.ok(Math.abs(next.maxX-next.minX-22.45*2)<1e-9);
 assert.equal((boxes[1].minX+boxes[1].maxX)/2,500);
});

test('framed views rise over a neighbour at the same distance before coming in',()=>{
 const target={x:0,y:10,z:0},camera={x:0,y:16,z:40};
 const lifted=studioClearViewPosition(target,camera,[box],1);
 assert.ok(Math.abs(Math.hypot(lifted.x,lifted.y-10,lifted.z)-Math.hypot(0,6,40))<1e-9,'same distance');
 assert.ok(lifted.y>16&&studioClearanceFraction(target,lifted,[box],1)===1);
 // A neighbour too tall to clear falls back to coming in along the sight line.
 const tower={...box,top:500},closer=studioClearViewPosition(target,camera,[tower],1,.5);
 assert.ok(Math.abs(closer.z-29)<1e-9&&closer.x===0);
 assert.deepEqual(studioClearViewPosition(target,{x:0,y:10,z:-60},[box],1),{x:0,y:10,z:-60});
});
