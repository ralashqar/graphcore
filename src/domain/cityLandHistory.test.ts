import test from 'node:test';
import assert from 'node:assert/strict';
import {continuousInputGroup,describeLandChange,LAND_HISTORY_COALESCE_MS,LAND_HISTORY_LIMIT,recordLandHistory,type LandHistoryEntry} from './cityLandHistory.ts';
import type {LandDraft} from './cityLand.ts';

const draft=(name:string):LandDraft=>({name,color:'#ffffff',nature:{style:'garden',seed:1},design:{} as LandDraft['design']} as LandDraft);

test('continuous edits in one group collapse into a single undo entry',()=>{
 let history:LandHistoryEntry[]=[];let current=draft('a');
 for(let i=0;i<30;i++){const next=draft(`a${i}`);history=recordLandHistory(history,current,next,{group:'slider',at:i*16});current=next;}
 assert.equal(history.length,1);
 assert.equal(history[0].draft.name,'a','undo returns to the state before the interaction');
});

test('a pause or a different group starts a new entry',()=>{
 let history=recordLandHistory([],draft('a'),draft('b'),{group:'slider',at:0});
 history=recordLandHistory(history,draft('b'),draft('c'),{group:'slider',at:LAND_HISTORY_COALESCE_MS+1});
 history=recordLandHistory(history,draft('c'),draft('d'),{group:'colour',at:LAND_HISTORY_COALESCE_MS+2});
 history=recordLandHistory(history,draft('d'),draft('e'),{at:LAND_HISTORY_COALESCE_MS+3});
 history=recordLandHistory(history,draft('e'),draft('f'),{at:LAND_HISTORY_COALESCE_MS+4});
 assert.deepEqual(history.map(h=>h.draft.name),['a','b','c','d','e']);
});

test('history is capped',()=>{
 let history:LandHistoryEntry[]=[];
 for(let i=0;i<LAND_HISTORY_LIMIT+20;i++)history=recordLandHistory(history,draft(`${i}`),draft(`${i+1}`),{at:i});
 assert.equal(history.length,LAND_HISTORY_LIMIT);
 assert.equal(history[history.length-1].draft.name,`${LAND_HISTORY_LIMIT+19}`);
});

test('entries carry readable labels',()=>{
 const history=recordLandHistory([],draft('a'),draft('b'),{at:0});
 assert.equal(history[0].label,'Rename building');
 assert.equal(recordLandHistory([],draft('a'),draft('b'),{at:0,label:'Paint 14 tiles'})[0].label,'Paint 14 tiles');
 assert.equal(describeLandChange(draft('a'),{...draft('a'),color:'#000000'}),'Change colour');
});

test('only continuous inputs coalesce',()=>{
 const slider={tagName:'INPUT',type:'range'},other={tagName:'INPUT',type:'range'};
 assert.equal(continuousInputGroup({type:'input',target:slider}),continuousInputGroup({type:'input',target:slider}));
 assert.notEqual(continuousInputGroup({type:'input',target:slider}),continuousInputGroup({type:'input',target:other}));
 assert.equal(continuousInputGroup({type:'click',target:{tagName:'BUTTON'}}),undefined);
 assert.equal(continuousInputGroup({type:'input',target:{tagName:'INPUT',type:'checkbox'}}),undefined);
 assert.equal(continuousInputGroup(undefined),undefined);
});
