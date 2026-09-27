import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMetres,outlineCornerAngle,snapOutlineDistance,snapOutlineVertex} from './studioOutlineSnap.ts';

test('corner drags snap to the grid, line up with other corners and the plot edge, and step in 15 degrees',()=>{
 assert.deepEqual(snapOutlineVertex([1.13,2.61],{others:[],limit:10.5}).point,[1.25,2.5]);
 assert.deepEqual(snapOutlineVertex([1.13,2.61],{others:[],limit:10.5,free:true}).point,[1.13,2.61]);
 const aligned=snapOutlineVertex([3.9,6.12],{others:[[4.1,-4]],limit:10.5});assert.deepEqual(aligned.point,[4.1,6]);assert.equal(aligned.guides[0].kind,'align');
 const plot=snapOutlineVertex([10.35,1.1],{others:[],limit:10.5});assert.deepEqual(plot.point,[10.5,1]);assert.equal(plot.guides[0].kind,'plot');
 // 45 degrees from the previous corner (off-grid diagonal kept exact).
 const diagonal=snapOutlineVertex([2.9,3.1],{prev:[0,0],others:[],limit:10.5}),[x,z]=diagonal.point;
 assert.ok(Math.abs(x-z)<1e-9);assert.equal(diagonal.guides[0].kind,'angle');
});

test('wall pushes snap to 0.25 m, other corners and the plot edge',()=>{
 const wall={a:[4,-4] as [number,number],b:[4,4] as [number,number],normal:[1,0] as [number,number]};
 assert.equal(snapOutlineDistance(1.13,{...wall,others:[],limit:10.5}).distance,1.25);
 assert.equal(snapOutlineDistance(2.9,{...wall,others:[[7.1,0]],limit:10.5}).distance,3.1);
 assert.equal(snapOutlineDistance(6.35,{...wall,others:[],limit:10.5}).distance,6.5);
 assert.equal(snapOutlineDistance(1.13,{...wall,others:[],limit:10.5,free:true}).distance,1.13);
});

test('corner angles and lengths read naturally',()=>{
 assert.equal(outlineCornerAngle([-4,-4],[4,-4],[4,4]),90);
 assert.equal(Math.round(outlineCornerAngle([-4,-4],[0,-4],[4,-4])),180);
 assert.equal(formatMetres(3.456),'3.46 m');
});
