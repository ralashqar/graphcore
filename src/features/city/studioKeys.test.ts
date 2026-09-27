import test from 'node:test';
import assert from 'node:assert/strict';
import {studioDeleteTarget,studioDuplicateTarget} from './studioKeys.ts';

test('Delete removes furniture while furnishing, never the selected building part',()=>{
 assert.equal(studioDeleteTarget({category:'Furniture',furnitureId:'sofa-1',partId:'main'}),'furniture');
 assert.equal(studioDeleteTarget({category:'Furniture',furnitureId:null,partId:'main'}),null);
 assert.equal(studioDeleteTarget({category:'Rooms',furnitureId:null,partId:'main'}),null);
});

test('Delete and duplicate act on parts in exterior workspaces',()=>{
 assert.equal(studioDeleteTarget({category:'Shape',furnitureId:'sofa-1',partId:'main'}),'part');
 assert.equal(studioDeleteTarget({category:'Surfaces',furnitureId:null,partId:null}),null);
 assert.equal(studioDuplicateTarget({category:'Shape',partId:'main'}),'part');
 assert.equal(studioDuplicateTarget({category:'Furniture',partId:'main'}),null);
});

test('Delete in Select acts at the selection level and never removes the part from a wall or tile',()=>{
 assert.equal(studioDeleteTarget({category:'Shape',furnitureId:null,partId:'main',level:'wall'}),null);
 assert.equal(studioDeleteTarget({category:'Shape',furnitureId:null,partId:'main',level:'tile'}),null);
 assert.equal(studioDeleteTarget({category:'Shape',furnitureId:null,partId:'main',level:'opening'}),'opening');
 assert.equal(studioDeleteTarget({category:'Shape',furnitureId:null,partId:null,level:'object'}),'object');
 assert.equal(studioDeleteTarget({category:'Shape',furnitureId:null,partId:'main',level:'part'}),'part');
 assert.equal(studioDeleteTarget({category:'Furniture',furnitureId:null,partId:'main',level:'opening'}),null,'furnishing never deletes building pieces');
 assert.equal(studioDuplicateTarget({category:'Shape',partId:'main',level:'wall'}),null);
});
