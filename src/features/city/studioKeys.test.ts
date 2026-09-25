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
