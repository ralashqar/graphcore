import test from 'node:test';
import assert from 'node:assert/strict';
import {rotateStudioVolume,snapRotation,sweptAngle} from './cityStudioRotate.ts';
import {validSculptPolygon,sculptPrimitiveBoundary,type SculptVolume} from './citySculpt.ts';

const box:SculptVolume={id:'main',kind:'rectangle',operation:'add',x:1,z:-2,width:8,depth:6,startFloor:0,spanFloors:2};
const area=(loop:[number,number][])=>Math.abs(loop.reduce((t,p,i)=>{const q=loop[(i+1)%loop.length];return t+p[0]*q[1]-q[0]*p[1];},0)/2);

test('a turned rectangle becomes a valid polygon that keeps its walls and area',()=>{
 const turned=rotateStudioVolume(box,Math.PI/6)!;
 assert.equal(turned.kind,'polygon');assert.ok(validSculptPolygon(turned));
 assert.deepEqual(turned.edgeIds,['south','east','north','west']);
 assert.ok(Math.abs(area(sculptPrimitiveBoundary(turned))-48)<.05);
 assert.ok(Math.abs(turned.x-1)<1e-6&&Math.abs(turned.z+2)<1e-6,'turns about its centre');
});

test('turning twice composes and a full turn returns the footprint',()=>{
 const once=rotateStudioVolume(rotateStudioVolume(box,Math.PI/4)!,Math.PI/4)!,quarter=rotateStudioVolume(box,Math.PI/2)!;
 assert.ok(Math.abs(once.width-quarter.width)<.01&&Math.abs(once.depth-quarter.depth)<.01);
 assert.ok(Math.abs(quarter.width-6)<.01&&Math.abs(quarter.depth-8)<.01);
});

test('circles ignore rotation, ovals refuse, zero keeps the original',()=>{
 const circle:SculptVolume={...box,kind:'ellipse',width:6,depth:6};assert.equal(rotateStudioVolume(circle,1),circle);
 assert.equal(rotateStudioVolume({...box,kind:'ellipse'},1),null);
 assert.equal(rotateStudioVolume(box,0),box);
});

test('rotation snaps to 15 degrees unless free',()=>{
 assert.ok(Math.abs(snapRotation(.3)-Math.PI/12)<1e-9);
 assert.equal(snapRotation(.3,true),.3);
 assert.ok(Math.abs(sweptAngle(0,0,[1,0],[0,1])-Math.PI/2)<1e-9);
 assert.ok(Math.abs(sweptAngle(0,0,[-1,.01],[-1,-.01])-.02)<.001,'wraps across ±π');
});
