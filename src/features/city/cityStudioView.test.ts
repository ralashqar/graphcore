import test from 'node:test';
import assert from 'node:assert/strict';
import {studioPieceFloor} from './cityStudioView.ts';
import type {StudioBay,StudioPiece} from '../../domain/cityStudioTypes.ts';

const floors=[{floor:0,bottom:.18},{floor:1,bottom:3.04},{floor:2,bottom:6.04}];
const piece=(id:string,y:number):StudioPiece=>({id,module:'window-sash',x:0,y,z:0,rotation:0,scale:[1,1,1],family:'warm-brick'});
const bay=(id:string,shapeId:string,floor:number):StudioBay=>({id,anchorSpan:.2,anchor:{shapeId,side:'north',u:.5,floor},x:0,y:floors[floor].bottom,z:0,width:2,height:3,rotation:0,module:'window-sash',family:'warm-brick',finishes:{},entrance:false});

test('selected floor follows bay ownership at a storey line, including disconnected parts',()=>{
 const bays=[bay('west/north/1','west',1),bay('east/north/1','east',1),bay('west/north/2','west',2)];
 assert.equal(studioPieceFloor(piece('west/north/1',3.04),bays,floors,[]),1);
 assert.equal(studioPieceFloor(piece('east/north/1/header',6.04),bays,floors,[]),1);
 assert.equal(studioPieceFloor(piece('west/north/2',6.04),bays,floors,[]),2);
 assert.equal(studioPieceFloor(piece('terrace/west/north/1',6.04),bays,floors,[]),2);
 assert.equal(studioPieceFloor(piece('unanchored-detail',3.04),bays,floors,[]),1);
});
