import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,sculptBuildLimit,sculptFootprint,sculptWalls,validateSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,paintStudio,studioBays,studioFloorCount} from './cityStudio.ts';
import {upgradeStudioInterior,interiorContains} from './cityStudioInteriors.ts';
import {bevelOutlineCorner,outlineFastCheck,pullOutlineEdge,pullOutlineSection,recessOutlineCorner} from './cityStudioOutline.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const part=(id='main',patch:Partial<SculptVolume>={}):SculptVolume=>({id,kind:'rectangle',operation:'add',x:0,z:0,width:8,depth:8,startFloor:0,spanFloors:2,...patch});
const recipe=(volumes:SculptVolume[]):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:freshStudio()});
const design=(r:StudioRecipe)=>({...newDesign('outline-test'),groundHeight:3,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const area=(ring:[number,number][])=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);

test('pulling a wall adds snapped area and facade bays while keeping its source face',()=>{
 const original=part(),pulled=pullOutlineEdge(original,1,1.13),r=recipe([pulled]);
 assert.equal(pulled.kind,'polygon');assert.equal(pulled.width,9);assert.equal(outlineFastCheck(pulled,sculptBuildLimit(24)),null);
 assert.equal(validateSculpt(r,2),null);assert.equal(area(sculptFootprint([pulled])[0][0]),72);
 assert.ok(studioBays(r,design(r)).some(b=>b.anchor.side==='east'&&b.x===5));
 assert.ok(sculptWalls(r,design(r)).every(w=>w.source?.shapeId==='main'));
});

test('bevel preserves old face anchors, gives the diagonal its own face, and clips the roof footprint',()=>{
 const original=part(),base=recipe([original]),north=studioBays(base,design(base)).find(b=>b.anchor.floor===1&&b.anchor.side==='north'&&b.anchor.u<.5)!;
 const painted=paintStudio(base,north.anchor,'spot','wall',{color:'#aa7733'});
 const bevel=bevelOutlineCorner(original,2,1.1,'corner-2'),r={...painted,volumes:[bevel]};
 assert.equal(bevel.kind,'polygon');assert.equal(bevel.vertices?.length,5);assert.equal(validateSculpt(r,2),null);
 assert.equal(area(sculptFootprint([bevel])[0][0]),63.5);
 const bays=studioBays(r,design(r));assert.ok(bays.some(b=>b.anchor.side==='edge:corner-2'));
 assert.ok(bays.some(b=>b.anchor.side==='north'&&b.finishes.wall?.color==='#aa7733'));
 assert.ok(bays.filter(b=>b.anchor.side==='north').every(b=>b.anchor.u>=0&&b.anchor.u<=1));
});

test('beveled parts retain connected union walls and invalid edge pulls are rejected',()=>{
 const left=bevelOutlineCorner(part('left',{x:-3,width:6}),2,1,'left-corner'),right=part('right',{x:3,width:6}),r=recipe([left,right]);
 assert.equal(validateSculpt(r,2),null);
 assert.equal(sculptFootprint(r.volumes)[0].length,1);
 const bays=studioBays(r,design(r));assert.ok(bays.some(b=>b.anchor.shapeId==='left'));assert.ok(bays.some(b=>b.anchor.shapeId==='right'));
 assert.equal(outlineFastCheck(pullOutlineEdge(right,1,8),sculptBuildLimit(24)),'Keep this part inside the buildable plot.');
});

test('a recessed corner forms a walkable L footprint with new walls and stable old faces',()=>{
 const original=part(),base=recipe([original]),north=studioBays(base,design(base)).find(b=>b.anchor.floor===0&&b.anchor.side==='north'&&b.anchor.u<.4)!;
 const painted=paintStudio(base,north.anchor,'wall','wall',{color:'#ba7654'}),recess=recessOutlineCorner(original,2,2,'entrance-corner'),r={...painted,volumes:[recess]};
 assert.equal(recess.vertices?.length,6);assert.equal(outlineFastCheck(recess,sculptBuildLimit(24)),null);assert.equal(validateSculpt(r,2),null);
 assert.equal(area(sculptFootprint([recess])[0][0]),60);
 const bays=studioBays(r,design(r));assert.ok(bays.some(b=>b.anchor.side==='edge:entrance-corner-a'));assert.ok(bays.some(b=>b.anchor.side==='edge:entrance-corner-b'));
 assert.ok(bays.some(b=>b.anchor.side==='north'&&b.finishes.wall?.color==='#ba7654'));
 assert.equal(sculptWalls(r,design(r)).filter(w=>w.floor===0&&w.source?.shapeId==='main').length,6);
});

test('a bay pull changes only a short exposed wall section and fills the new side faces',()=>{
 const original=part(),pulled=pullOutlineSection(original,1,.5,1.1,'bay-1'),r=recipe([pulled]);
 assert.equal(pulled.vertices?.length,8);assert.equal(outlineFastCheck(pulled,sculptBuildLimit(24)),null);assert.equal(validateSculpt(r,2),null);
 assert.equal(area(sculptFootprint([pulled])[0][0]),66);
 const bays=studioBays(r,design(r));assert.ok(bays.some(b=>b.anchor.side==='east'&&b.x===5));
 assert.ok(bays.some(b=>b.anchor.side==='edge:bay-1-start'));assert.ok(bays.some(b=>b.anchor.side==='edge:bay-1-end'));
});

test('two joined masses keep one union roof and matching walkable upper slab around a recess',()=>{
 const left=part('left',{x:-3,width:6}),right=recessOutlineCorner(part('right',{x:3,width:6}),2,2,'joined-entry'),r=upgradeStudioInterior(recipe([left,right]));
 assert.equal(r.version,6);assert.equal(validateSculpt(r,2),null);
 const footprint=sculptFootprint([left,right]);assert.equal(footprint.length,1);assert.equal(area(footprint[0][0]),92);
 const out=resolveSculpt(r,design(r)).studio!,upper=out.decks.filter(deck=>deck.id.startsWith('interior/1/')&&deck.polygon);
 assert.ok(out.roof.every(Number.isFinite));assert.ok(upper.length);
 assert.ok(upper.some(deck=>interiorContains([deck.polygon!],-2,3)));
 assert.ok(!upper.some(deck=>interiorContains([deck.polygon!],5,3)));
});
