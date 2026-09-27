import test from 'node:test';
import assert from 'node:assert/strict';
import {BRUSH_TARGETS,STUDIO_FOCUS_KEY,STUDIO_ISOLATE_KEY,STUDIO_RAIL,brushSizesFor,cycleSelectLevel,drillSelectLevel,nextBrushSize,pushHotbar,studioCategoryFor,studioRailForKey} from './studioRail.ts';
import {STUDIO_DICE_KEY} from './studioTools.ts';

test('rail tools have unique letter hotkeys that do not clash with other studio keys',()=>{
 const keys=STUDIO_RAIL.map(t=>t.hotkey);
 assert.equal(new Set(keys).size,keys.length);
 for(const reserved of [STUDIO_DICE_KEY,'C',STUDIO_FOCUS_KEY.toUpperCase(),STUDIO_ISOLATE_KEY.toUpperCase(),'1','9'])assert.ok(!keys.includes(String(reserved)),String(reserved));
 assert.deepEqual(keys,['V','B','P','E','R','G','I','F']);
 assert.equal(new Set(STUDIO_RAIL.map(t=>t.label)).size,STUDIO_RAIL.length,'labels are unique button names');
});

test('letters choose rail tools in either case',()=>{
 assert.equal(studioRailForKey('v'),'select');
 assert.equal(studioRailForKey('P'),'paint');
 assert.equal(studioRailForKey('f'),'furnish');
 assert.equal(studioRailForKey('x'),null);
 assert.equal(studioRailForKey('PageUp'),null);
});

test('Tab cycles granularity and double-click drills down',()=>{
 assert.equal(cycleSelectLevel('part'),'wall');
 assert.equal(cycleSelectLevel('object'),'part');
 assert.equal(cycleSelectLevel('part',-1),'object');
 assert.equal(drillSelectLevel('part'),'wall');assert.equal(drillSelectLevel('wall'),'tile');assert.equal(drillSelectLevel('object'),null);
});

test('brush targets map onto the legacy workspace categories',()=>{
 assert.equal(studioCategoryFor('paint','material'),'Surfaces');
 assert.equal(studioCategoryFor('erase','openings'),'Openings');
 assert.equal(studioCategoryFor('paint','decor'),'Details');
 assert.equal(studioCategoryFor('furnish','material'),'Furniture');
 assert.equal(studioCategoryFor('select','roof'),'Shape');
 assert.equal(new Set(BRUSH_TARGETS.map(t=>t.label)).size,BRUSH_TARGETS.length);
});

test('brush sizes: material everywhere, erase sizes for every target',()=>{
 assert.deepEqual(brushSizesFor('material',false),['tile','wall','part','free']);
 assert.deepEqual(brushSizesFor('openings',false),[]);
 assert.deepEqual(brushSizesFor('openings',true),['tile','wall','part']);
 assert.equal(nextBrushSize('part',['tile','wall','part']),'tile');
});

test('hotbar slots are stable: new items enter slot 1, known items keep their slot, nine at most',()=>{
 let list=pushHotbar([],{id:'a',target:'material',label:'a'});
 list=pushHotbar(list,{id:'b',target:'material',label:'b'});
 assert.deepEqual(list.map(x=>x.id),['b','a']);
 assert.deepEqual(pushHotbar(list,{id:'a',target:'material',label:'a'}).map(x=>x.id),['b','a']);
 for(let i=0;i<12;i++)list=pushHotbar(list,{id:`x${i}`,target:'openings',label:''});
 assert.equal(list.length,9);assert.equal(list[0].id,'x11');
});
