import test from 'node:test';
import assert from 'node:assert/strict';
import {THEME_DRAG,themeBrushScope,themeDragStarts,themeDropOutcome,themeGhostLabel} from './studioThemeBrush.ts';
import {BRUSH_TARGETS,brushSizesFor,studioCategoryFor} from './studioRail.ts';

test('themes brush target: part and building sizes, surfaces category',()=>{
 assert.ok(BRUSH_TARGETS.some(t=>t.id==='themes'));
 assert.deepEqual(brushSizesFor('themes',false),['part','building']);
 assert.deepEqual(brushSizesFor('themes',true),['part','building']);
 assert.equal(studioCategoryFor('paint','themes'),'Surfaces');
});

test('theme click scope: Shift or Building size themes the building, else the clicked part',()=>{
 assert.deepEqual(themeBrushScope('part',false,'a'),{scope:'part',partId:'a'});
 assert.deepEqual(themeBrushScope('part',true,'a'),{scope:'building'});
 assert.deepEqual(themeBrushScope('building',false,null),{scope:'building'});
 assert.equal(themeBrushScope('part',false,null),null);
});

test('theme drop: part, themed starter on an empty plot, or nothing',()=>{
 assert.deepEqual(themeDropOutcome({overCanvas:true,partId:'a',inPlot:true,hasParts:true}),{kind:'part',partId:'a'});
 assert.deepEqual(themeDropOutcome({overCanvas:true,partId:null,inPlot:true,hasParts:false}),{kind:'starter'});
 assert.equal(themeDropOutcome({overCanvas:true,partId:null,inPlot:true,hasParts:true}).kind,'none');
 assert.equal(themeDropOutcome({overCanvas:true,partId:null,inPlot:false,hasParts:false}).kind,'none');
 assert.deepEqual(themeDropOutcome({overCanvas:false,partId:'a',inPlot:true,hasParts:true}),{kind:'none',reason:''});
});

test('theme ghost labels and drag start rules',()=>{
 assert.equal(themeGhostLabel('Seaside'),'Apply Seaside');
 assert.equal(themeGhostLabel('Seaside',{building:true}),'Apply Seaside to the building');
 assert.equal(themeGhostLabel('Seaside',{erase:true}),'Remove theme');
 assert.equal(themeGhostLabel('Seaside',{starter:true}),'Start a Seaside block');
 assert.equal(themeDragStarts('mouse',THEME_DRAG.mouseSlop,0),true);
 assert.equal(themeDragStarts('mouse',1,1000),false);
 assert.equal(themeDragStarts('touch',30,50),'cancel');
 assert.equal(themeDragStarts('touch',2,THEME_DRAG.longPressMs),true);
 assert.equal(themeDragStarts('touch',30,THEME_DRAG.longPressMs+10),true);
});
