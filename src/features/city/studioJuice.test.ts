import test from 'node:test';
import assert from 'node:assert/strict';
import {JUICE_LIMIT,studioCueForEdit,studioJuiceBursts} from './studioJuice.ts';
import type {StudioBay,StudioRecipe} from '../../domain/cityStudioTypes.ts';

const recipe=(patch:Partial<StudioRecipe>={}):StudioRecipe=>({version:5,volumes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:10,depth:10,startFloor:0,spanFloors:2}],attachments:[],studio:{catalogue:'synarc-kit-5',defaults:{},parts:{},surfaces:[],openings:[],assemblies:[]},...patch}) as StudioRecipe;
const bay=(u:number,floor=0):StudioBay=>({id:`main/north/${floor}/${u}`,anchorSpan:.2,anchor:{shapeId:'main',side:'north',u,floor},x:u*10-5,y:floor*3,z:5,width:2,height:3,rotation:0,module:'window',family:'warm-brick',finishes:{},entrance:false});

test('new and taller parts burst; unchanged parts do not',()=>{
 const a=recipe(),b=recipe({volumes:[{...a.volumes[0],spanFloors:3},{id:'wing',kind:'rectangle',operation:'add',x:8,z:0,width:4,depth:4,startFloor:0,spanFloors:1}]});
 const kinds=studioJuiceBursts(a,b,[],3.6).map(x=>x.kind).sort();
 assert.deepEqual(kinds,['build','grow']);
 assert.deepEqual(studioJuiceBursts(a,a,[],3.6),[]);
 assert.deepEqual(studioJuiceBursts(b,a,[],3.6).map(x=>x.kind),['remove']);
});

test('openings and paint burst at the matching bay',()=>{
 const bays=[bay(.1),bay(.5),bay(.9)],a=recipe();
 const b=recipe({studio:{...a.studio,openings:[{id:'o1',anchor:{shapeId:'main',side:'north',u:.52,floor:0},module:'door'}],surfaces:[{id:'s1',anchor:{shapeId:'main',side:'north',u:.88,floor:0},scope:'spot',channel:'wall',finish:{color:'#ff0000'}}]}});
 const bursts=studioJuiceBursts(a,b,bays,3.6);
 assert.equal(bursts.find(x=>x.kind==='place')?.x,bays[1].x);
 const paint=bursts.find(x=>x.kind==='paint');assert.equal(paint?.x,bays[2].x);assert.equal(paint?.color,'#ff0000');
});

test('bursts are capped and cues follow labels',()=>{
 const a=recipe(),surfaces=Array.from({length:60},(_,i)=>({id:`s${i}`,anchor:{shapeId:'main',side:'north' as const,u:.5,floor:0},scope:'spot' as const,channel:'wall' as const,finish:{color:'#fff'}}));
 assert.equal(studioJuiceBursts(a,recipe({studio:{...a.studio,surfaces}}),[bay(.5)],3.6).length,JUICE_LIMIT);
 assert.equal(studioCueForEdit('Paint',false),'paint');
 assert.equal(studioCueForEdit('Add furniture',false),'place');
 assert.equal(studioCueForEdit('Remove shape',false),'remove');
 assert.equal(studioCueForEdit('Rename building',true),'tick');
});
