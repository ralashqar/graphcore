import test from 'node:test';
import assert from 'node:assert/strict';
import {studioFrameSegments} from './studioFrame.ts';

const box={id:'a',kind:'rectangle' as const,operation:'add' as const,x:0,z:0,width:8,depth:6,startFloor:0,spanFloors:2};
test('frames are dashed segment pairs and gain a roof silhouette for pitched roofs',()=>{
 const flat=studioFrameSegments(box,3.6,3,'flat'),pitched=studioFrameSegments(box,3.6,3,'pitched');
 assert.equal(flat.length%6,0);assert.ok(flat.length>100);
 assert.ok(pitched.length>flat.length,'roof silhouette adds edges');
 const ys=[];for(let i=1;i<pitched.length;i+=3)ys.push(pitched[i]);
 assert.ok(Math.max(...ys)>Math.max(...flat.filter((_,i)=>i%3===1)),'ridge rises above the wall top');
});
