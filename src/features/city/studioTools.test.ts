import test from 'node:test';
import assert from 'node:assert/strict';
import {studioFloorStep} from './studioTools.ts';

test('floor stepping stays inside the building',()=>{
 assert.equal(studioFloorStep(0,3,1),1);
 assert.equal(studioFloorStep(2,3,1),2);
 assert.equal(studioFloorStep(0,3,-1),0);
 assert.equal(studioFloorStep(0,0,1),0);
});
