import assert from 'node:assert/strict';
import test from 'node:test';
import {clearSculptPreview,sculptPreviewSnapshot,setSculptPreview,subscribeSculptPreview} from './citySculptPreview.ts';
import type {SculptRecipe} from '../../domain/citySculpt.ts';

const recipe:Extract<SculptRecipe,{version:3}>={version:3,levels:[{floor:0,shapes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:12}]}],attachments:[]};

test('live Sculpt intent is plot-scoped and never changes an authored recipe',()=>{
 const authored=structuredClone(recipe),events:number[]=[];
 const unsubscribe=subscribeSculptPreview('preview-test-a',()=>events.push(sculptPreviewSnapshot('preview-test-a').revision));
 setSculptPreview('preview-test-a',{...recipe,levels:[{floor:0,shapes:[{...recipe.levels[0].shapes[0],width:14}]}]});
 const preview=sculptPreviewSnapshot('preview-test-a').recipe;
 assert.equal(preview?.version===3?preview.levels[0].shapes[0].width:null,14);
 assert.equal(sculptPreviewSnapshot('preview-test-b').recipe,null);
 assert.deepEqual(recipe,authored);
 clearSculptPreview('preview-test-a',true);
 assert.equal(sculptPreviewSnapshot('preview-test-a').hold,true);
 assert.equal(sculptPreviewSnapshot('preview-test-a').recipe,null);
 clearSculptPreview('preview-test-a');
 assert.equal(sculptPreviewSnapshot('preview-test-a').hold,false);
 assert.deepEqual(events,[1,2,3]);
 unsubscribe();
});
