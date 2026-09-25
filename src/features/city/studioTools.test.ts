import test from 'node:test';
import assert from 'node:assert/strict';
import {STUDIO_BELT,STUDIO_DICE_KEY,studioFloorStep,studioToolForKey} from './studioTools.ts';

test('every tool has a unique hotkey that is not the dice key',()=>{
 const keys=STUDIO_BELT.map(tool=>tool.hotkey);
 assert.equal(new Set(keys).size,keys.length);
 assert.ok(!keys.includes(STUDIO_DICE_KEY));
 assert.equal(new Set(STUDIO_BELT.map(tool=>tool.label)).size,STUDIO_BELT.length,'labels are unique button names');
});

test('number keys choose tools',()=>{
 assert.equal(studioToolForKey('1'),'Shape');
 assert.equal(studioToolForKey('8'),'Furniture');
 assert.equal(studioToolForKey('9'),null);
});

test('floor stepping stays inside the building',()=>{
 assert.equal(studioFloorStep(0,3,1),1);
 assert.equal(studioFloorStep(2,3,1),2);
 assert.equal(studioFloorStep(0,3,-1),0);
 assert.equal(studioFloorStep(0,0,1),0);
});
