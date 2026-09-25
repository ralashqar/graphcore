import test from 'node:test';
import assert from 'node:assert/strict';
import {sculptFloorTop} from '../../domain/citySculpt.ts';
import {formatStoreys,storeySpanForTop,storeyStartForBottom,verticalPlaneHeight} from './studioStoreys.ts';

test('height handle snaps to the nearest roof line independent of zoom',()=>{
 const g=3.6,u=3;
 for(let span=1;span<=8;span++)assert.equal(storeySpanForTop(0,sculptFloorTop(span-1,g,u)+.4,g,u),span);
 assert.equal(storeySpanForTop(0,-5,g,u),1,'never below one storey');
 assert.equal(storeySpanForTop(6,100,g,u),2,'never above eight storeys');
});

test('lift handle snaps the base to a storey line',()=>{
 assert.equal(storeyStartForBottom(2,.2,3.6,3),0);
 assert.equal(storeyStartForBottom(2,.65+3.6+3+.3,3.6,3),2);
 assert.equal(storeyStartForBottom(3,500,3.6,3),5);
});

test('vertical plane follows the pointer ray',()=>{
 // Camera 20 m back looking at a plane through the origin; a ray tilted up by 0.25 reaches y=5+5.
 assert.equal(verticalPlaneHeight([0,5,20],[0,.25,-1],[0,0,0],[0,-1]),10);
 assert.equal(verticalPlaneHeight([0,5,20],[1,0,0],[0,0,0],[0,-1]),null,'parallel rays miss');
 assert.equal(formatStoreys(3,10.5),'3 storeys · 10.5 m');
});
