import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,sculptBuildLimit,sculptFootprint,sculptWalls,validateSculpt,SCULPT_BUSINESS_POLYGON_RULES,SCULPT_STUDIO_POLYGON_LIMIT,type SculptVolume,type SculptWallSide} from './citySculpt.ts';
import {freshStudio,studioBays,studioFloorCount} from './cityStudio.ts';
import {upgradeStudioInterior} from './cityStudioInteriors.ts';
import {outlineFastCheck,OUTLINE_MESSAGES} from './cityStudioOutline.ts';
import {applyOutlineEdit,asOutlinePolygon,deleteOutlineVertices,editableOutline,extrudeOutlineEdge,insertOutlineVertex,isOutlineRefusal,moveOutlineEdge,moveOutlineVertices,outlineRemovalSummary,refitOutlineContent,setOutlineEdgeLength,splitStudioPartAtStorey,setOutlineVertex,simplifyOutline,squareOutlineCorners,straightenOutline,type OutlineEdit} from './cityStudioOutlineEdit.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import {setFacadeRhythm} from './cityStudioFacadeRhythm.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';
import type {StudioFreeOpening} from './cityStudioFreeOpenings.ts';

const part=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:8,depth:8,startFloor:0,spanFloors:2,...patch});
const recipe=(volumes:SculptVolume[]):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:freshStudio()});
const design=(r:StudioRecipe)=>({...newDesign('outline-edit-test'),groundHeight:3,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const area=(ring:[number,number][])=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
const ok=(e:OutlineEdit):SculptVolume=>{assert.ok(!isOutlineRefusal(e),isOutlineRefusal(e)?e.reason:'');return e as SculptVolume;};
const window=(id:string,side:SculptWallSide,u:number,width=1.2,bottom=1,height=1.4):StudioFreeOpening=>({id,shapeId:'main',side,u,bottom,width,height,shape:'rect'});
const withOpenings=(r:StudioRecipe,openings:StudioFreeOpening[])=>({...r,studio:{...r.studio,freeOpenings:openings}});
const limit=sculptBuildLimit(24);

test('inserting a corner splits a wall: the first half keeps its id, the footprint is unchanged and walls split',()=>{
 const v=ok(insertOutlineVertex(part(),0,.5,'edge:half'));
 assert.equal(v.kind,'polygon');assert.deepEqual(v.edgeIds,['south','edge:half','east','north','west']);
 assert.equal(outlineFastCheck(v,limit),null);const r=recipe([v]);assert.equal(validateSculpt(r,2),null);
 assert.equal(area(sculptFootprint([v])[0][0]),64);
 const ground=sculptWalls(r,design(r)).filter(w=>w.floor===0);
 assert.ok(ground.some(w=>w.source?.side==='south'&&Math.abs(w.length-4)<1e-6));assert.ok(ground.some(w=>w.source?.side==='edge:half'&&Math.abs(w.length-4)<1e-6));
 assert.ok(studioBays(r,design(r)).some(b=>b.anchor.side==='edge:half'));
 // Business recipes keep the strict rule: straight-through corners and more than 12 corners are rejected.
 assert.match(validateSculpt(r,2,24,SCULPT_BUSINESS_POLYGON_RULES)??'',/Keep each solid/);
});

test('moving, multi-moving and deleting corners',()=>{
 const inserted=ok(insertOutlineVertex(part(),0,.5,'edge:half')),pulled=ok(setOutlineVertex(inserted,1,[0,-6]));
 assert.equal(area(sculptFootprint([pulled])[0][0]),72);assert.equal(outlineFastCheck(pulled,limit),null);
 const both=ok(moveOutlineVertices(part(),[2,3],[0,2]));assert.equal(both.depth,10);assert.deepEqual(both.edgeIds,['south','east','north','west']);
 const removed=ok(deleteOutlineVertices(pulled,[1]));assert.deepEqual(removed.edgeIds,['south','east','north','west']);assert.equal(area(sculptFootprint([removed])[0][0]),64);
 assert.equal((deleteOutlineVertices(part(),[0,1]) as {reason:string}).reason,OUTLINE_MESSAGES.min);
 // Self-crossing, too short and off-plot outlines are refused with plain reasons.
 assert.equal(outlineFastCheck(ok(setOutlineVertex(part(),3,[6,0])),limit),OUTLINE_MESSAGES.cross);
 assert.equal(outlineFastCheck(ok(setOutlineVertex(ok(insertOutlineVertex(part(),0,.5,'edge:x')),1,[-5,-4])),limit),OUTLINE_MESSAGES.fold);
 assert.equal(outlineFastCheck(ok(setOutlineVertex(ok(insertOutlineVertex(part(),0,.5,'edge:x')),1,[-3.75,-4])),limit),OUTLINE_MESSAGES.short);
 assert.equal(outlineFastCheck(ok(setOutlineVertex(part(),2,[14,4])),limit),OUTLINE_MESSAGES.plot);
});

test('push/pull extrudes a wall section with new return walls; neighbours along the normal just stretch',()=>{
 const stretched=ok(extrudeOutlineEdge(part(),1,2));assert.equal(stretched.vertices?.length,4);assert.equal(stretched.width,10);assert.deepEqual(stretched.edgeIds,['south','east','north','west']);
 const split=ok(insertOutlineVertex(ok(insertOutlineVertex(part(),0,.25,'edge:mid')),1,1/3,'edge:right'));
 assert.deepEqual(split.edgeIds,['south','edge:mid','edge:right','east','north','west']);
 const bump=ok(extrudeOutlineEdge(split,1,1.5,{start:'edge:ra',end:'edge:rb'}));
 assert.deepEqual(bump.edgeIds,['south','edge:ra','edge:mid','edge:rb','edge:right','east','north','west']);
 assert.equal(area(sculptFootprint([bump])[0][0]),64+2*1.5);assert.equal(validateSculpt(recipe([bump]),2),null);
 const notch=ok(extrudeOutlineEdge(split,1,-2,{start:'edge:na',end:'edge:nb'}));assert.equal(area(sculptFootprint([notch])[0][0]),64-4);assert.equal(outlineFastCheck(notch,limit),null);
 // Alt: move the wall, neighbours stretch (and here stay square).
 const moved=ok(moveOutlineEdge(part(),2,1));assert.equal(moved.depth,9);assert.equal(moved.vertices?.length,4);
 const longer=ok(setOutlineEdgeLength(part(),0,6));assert.equal(Math.round(area(sculptFootprint([longer])[0][0])),56);
});

test('edge ids stay stable: untouched walls keep their openings exactly',()=>{
 const base=withOpenings(recipe([part()]),[window('n','north',.5),window('w','west',.3)]);
 const edited=applyOutlineEdit(base,'main',ok(insertOutlineVertex(part(),0,.5)),'Add corner');
 assert.deepEqual(edited.recipe.studio.freeOpenings,base.studio.freeOpenings);assert.equal(edited.label,'Add corner');
 const again=applyOutlineEdit(edited.recipe,'main',ok(setOutlineVertex(edited.recipe.volumes[0],1,[0,-5])),'Move corner');
 assert.deepEqual(again.recipe.studio.freeOpenings,base.studio.freeOpenings);
});

test('changed walls re-fit openings by absolute position, then relative, else drop with a summary',()=>{
 const base=withOpenings(recipe([part()]),[window('east','east',.5),window('north','north',.5),window('corner','east',.8,2)]);
 // Extruding the east wall: its openings keep their place; the stretched north wall keeps the absolute position.
 const pushed=applyOutlineEdit(base,'main',ok(extrudeOutlineEdge(part(),1,2)),'Push wall'),by=(id:string)=>pushed.recipe.studio.freeOpenings!.find(o=>o.id===id)!;
 assert.equal(by('east').side,'east');assert.equal(by('east').u,.5);assert.equal(by('north').side,'north');assert.ok(Math.abs(by('north').u-.4)<1e-9);assert.equal(pushed.refit.removed.length,0);
 // Shortening the east wall to 5 m: the 2 m window at 6.4 m no longer fits absolutely but does relatively (4 m).
 const shorter=applyOutlineEdit(base,'main',ok(setOutlineVertex(part(),2,[4,1])),'Move corner');
 const corner=shorter.recipe.studio.freeOpenings!.find(o=>o.id==='corner')!;assert.ok(Math.abs(corner.u-.8)<1e-9);
 // A 3 m wall cannot hold it at all: it is removed and reported.
 const short=applyOutlineEdit(base,'main',ok(setOutlineVertex(part(),2,[4,-1])),'Move corner');
 assert.ok(!short.recipe.studio.freeOpenings!.some(o=>o.id==='corner'));assert.match(short.label,/^Move corner · removed 1 window on the changed walls$/);
});

test('splitting a wall moves content to the half it sits on and whole-wall paint follows both halves',()=>{
 let base=withOpenings(recipe([part()]),[window('right','south',.75),window('left','south',.25)]);
 base={...base,studio:{...base.studio,surfaces:[{id:'wash',anchor:{shapeId:'main',side:'south',u:.5,floor:0},scope:'wall',channel:'wall',finish:{color:'#aa7733'}}],paintRegions:[{id:'dab',shapeId:'main',side:'south',channel:'wall',rects:[[1,1.5,1,1.5]],finish:{color:'#336699'}}]}};
 const split=applyOutlineEdit(base,'main',ok(insertOutlineVertex(part(),0,.5,'edge:half')),'Add corner'),o=split.recipe.studio.freeOpenings!;
 assert.deepEqual(o.find(x=>x.id==='left'),{...base.studio.freeOpenings![1],u:.5});
 assert.equal(o.find(x=>x.id==='right')!.side,'edge:half');assert.ok(Math.abs(o.find(x=>x.id==='right')!.u-.5)<1e-9);
 assert.deepEqual(split.recipe.studio.surfaces.map(s=>s.anchor.side).sort(),['edge:half','south']);
 const dab=split.recipe.studio.paintRegions!.find(p=>p.id==='dab')!;assert.equal(dab.side,'edge:half');assert.equal(split.refit.removed.length,0);
 // Deleting the corner again merges the halves: the longer (or first) id survives and content comes back.
 const merged=applyOutlineEdit(split.recipe,'main',ok(deleteOutlineVertices(split.recipe.volumes[0],[1])),'Remove corner');
 assert.ok(merged.recipe.studio.freeOpenings!.every(x=>x.side==='south'));
});

test('kit tiles, storefront anchors and decorations follow or drop with their wall',()=>{
 const base=recipe([part()]);base.studio.openings=[{id:'kit-n',anchor:{shapeId:'main',side:'north',u:.5,floor:1},module:'window-sash'},{id:'kit-e',anchor:{shapeId:'main',side:'east',u:.9,floor:1},module:'window-sash'}];
 base.studio.assemblies=[{id:'balcony',kind:'balcony',anchors:[{shapeId:'main',side:'east',u:.9,floor:1}],look:'simple'}];
 const shorter=applyOutlineEdit(base,'main',ok(deleteOutlineVertices(ok(insertOutlineVertex(part(),1,.25,'edge:low')),[2])),'Remove corner');
 assert.deepEqual(shorter.recipe.studio.openings.find(o=>o.id==='kit-n'),base.studio.openings[0]);
 // Collapse the east wall entirely by deleting both of its corners' neighbours: a triangle keeps no east wall.
 const triangle=applyOutlineEdit(base,'main',ok(deleteOutlineVertices(part(),[2])),'Remove corner');
 assert.ok(triangle.recipe.volumes[0].edgeIds!.length===3);
 assert.equal(outlineRemovalSummary([{kind:'window',count:4,where:'wall'}],1),'removed 4 windows on the changed wall');
 assert.equal(outlineRemovalSummary([{kind:'balcony',count:2,where:'wall'},{kind:'furniture piece',count:1,where:'inside'}],2),'removed 2 balconies on the changed walls; removed 1 furniture piece outside the new outline');
});

test('interiors: furniture outside the new outline is removed and interior walls are clipped',()=>{
 const r0=upgradeStudioInterior(recipe([part()]));assert.equal(r0.version,6);if(r0.version!==6)return;
 r0.interior.furniture=[{id:'sofa',floor:0,kind:'table',x:3,z:3,rotation:0},{id:'desk',floor:0,kind:'table',x:-2,z:-2,rotation:0}];
 r0.interior.partitions=[{id:'wall',floor:0,a:[-3,2],b:[3,2]}];r0.interior.doors=[{id:'door',partitionId:'wall',u:.2,style:'panelled',hinge:'left'}];
 const edited=applyOutlineEdit(r0,'main',ok(setOutlineVertex(part(),2,[1,1])),'Move corner'),i=edited.recipe.version===6?edited.recipe.interior:null;
 assert.ok(i);assert.deepEqual(i!.furniture!.map(f=>f.id),['desk']);
 const wall=i!.partitions.find(p=>p.id==='wall')!;assert.ok(wall.b[0]<-.5&&wall.b[0]>-1);assert.ok(Math.abs(wall.a[0]+3)<.05);
 assert.equal(i!.doors.length,1);assert.match(edited.label,/removed 1 furniture piece outside the new outline/);
});

test('old recipes migrate transparently: a rectangle becomes a polygon with side-named walls and untouched content',()=>{
 const base=withOpenings(recipe([part()]),[window('n','north',.5),window('s','south',.2)]),poly=asOutlinePolygon(part())!;
 assert.deepEqual(poly.edgeIds,['south','east','north','west']);
 const same=refitOutlineContent(base,{...base,volumes:[poly]},'main');assert.deepEqual(same.recipe.studio.freeOpenings,base.studio.freeOpenings);assert.equal(same.summary,'');
 const bays=(r:StudioRecipe)=>studioBays(r,design(r)).map(b=>`${b.anchor.side}/${b.anchor.floor}/${b.anchor.u.toFixed(4)}`).sort();
 assert.deepEqual(bays({...base,volumes:[poly]}),bays(base));
 // Ovals become their bay facets (same footprint); curved-wall openings land on a facet or are reported.
 const oval=part({kind:'ellipse',width:12,depth:10}),facets=asOutlinePolygon(oval)!;
 assert.equal(facets.kind,'polygon');assert.ok(facets.vertices!.length>=8&&facets.vertices!.length<=SCULPT_STUDIO_POLYGON_LIMIT);assert.equal(validateSculpt(recipe([facets]),2),null);
 assert.ok(Math.abs(area(sculptFootprint([facets])[0][0])-area(sculptFootprint([oval])[0][0]))<1e-6);
 const curved=withOpenings(recipe([oval]),[{...window('arc','curve',.25,.8),shapeId:'main'}]),converted=applyOutlineEdit(curved,'main',facets,'Edit outline');
 const moved=converted.recipe.studio.freeOpenings!;assert.ok(moved.length===1&&moved[0].side.startsWith('edge:arc')||converted.refit.removed.length===1);
});

test('the studio corner limit is enforced; business presets keep 12 corners',()=>{
 const ring=(n:number)=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2;return [Math.round(Math.cos(a)*8*100)/100,Math.round(Math.sin(a)*8*100)/100] as [number,number];});
 const polygon=(n:number):SculptVolume=>{const pts=ring(n),xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;return part({kind:'polygon',x,z,width:Math.max(...xs)-Math.min(...xs),depth:Math.max(...zs)-Math.min(...zs),vertices:pts.map(p=>[p[0]-x,p[1]-z]),edgeIds:pts.map((_,i)=>`edge:e${i}` as SculptWallSide)});};
 assert.equal(outlineFastCheck(polygon(48),limit),null);assert.equal(validateSculpt(recipe([polygon(48)]),2),null);
 assert.equal(outlineFastCheck(polygon(SCULPT_STUDIO_POLYGON_LIMIT+1),limit),OUTLINE_MESSAGES.limit);
 assert.equal((insertOutlineVertex(polygon(SCULPT_STUDIO_POLYGON_LIMIT),0) as {reason:string}).reason,OUTLINE_MESSAGES.limit);
 const business=recipe([polygon(13)]);business.studio.catalogue='synarc-kit-5';
 assert.ok(validateVariationRecipe(business,2,24));assert.equal(validateVariationRecipe(business,2,24,true),null);
 assert.equal(validateVariationRecipe(recipe([polygon(12)]),2,24),null);
 // A 64-corner part still resolves (walls, bays and roof) within the studio.
 const big=recipe([polygon(SCULPT_STUDIO_POLYGON_LIMIT)]);assert.ok(resolveSculpt(big,design(big)).studio);
});

test('straighten, square corners and simplify tidy a hand-drawn outline',()=>{
 const wobbly=part({kind:'polygon',width:8.2,depth:8,vertices:[[-4.1,-4],[4.1,-3.8],[3.9,4],[-4,3.9]],edgeIds:['south','east','north','west']});
 const straight=ok(straightenOutline(wobbly));assert.deepEqual(editableOutline(straight)!.points.map(p=>p.map(n=>Math.abs(n%.25)<1e-9||Math.abs(Math.abs(n%.25)-.25)<1e-9)),[[true,true],[true,true],[true,true],[true,true]]);
 assert.ok(editableOutline(straight)!.points.every((p,i,a)=>{const q=a[(i+1)%a.length];return Math.abs(p[0]-q[0])<1e-9||Math.abs(p[1]-q[1])<1e-9;}));
 const turned=part({kind:'polygon',width:8,depth:8,vertices:[[0,-4],[4,0],[0,4.1],[-4.05,0]],edgeIds:['south','east','north','west']}),square=ok(squareOutlineCorners(turned)),pts=editableOutline(square)!.points;
 for(let i=0;i<4;i++){const a=pts[i],b=pts[(i+1)%4],c=pts[(i+2)%4],d1=[b[0]-a[0],b[1]-a[1]],d2=[c[0]-b[0],c[1]-b[1]];assert.ok(Math.abs(d1[0]*d2[0]+d1[1]*d2[1])<1e-6);}
 const busy=ok(insertOutlineVertex(ok(insertOutlineVertex(part(),0,.5,'edge:a')),2,.5,'edge:b')),simple=ok(simplifyOutline(busy));
 assert.equal(simple.vertices!.length,4);assert.ok(simple.edgeIds!.includes('south'));
});

test('generated (unified) walls regenerate on new walls and a pushed section keeps its facade rhythm',()=>{
 let r:StudioRecipe=recipe([part()]);r.studio.facade='unified';r=setFacadeRhythm(r,{style:'townhouse'});
 const split=ok(insertOutlineVertex(ok(insertOutlineVertex(part(),0,.25,'edge:mid')),1,1/3,'edge:right')),bump=ok(extrudeOutlineEdge(split,1,2,{start:'edge:ra',end:'edge:rb'}));
 const edited=applyOutlineEdit(r,'main',bump,'Push out wall').recipe,out=resolveSculpt(edited,design(edited)).studio!;
 const faces=new Set((out.freeFaces??[]).filter(f=>f.shapeId==='main').map(f=>f.side));
 for(const side of ['south','edge:mid','edge:right','edge:ra','edge:rb','east','north','west'])assert.ok(faces.has(side as SculptWallSide),side);
});

test('per-storey outlines: splitting a part at a storey moves upper content, then its outline edits alone',()=>{
 const base=withOpenings(recipe([part({spanFloors:3})]),[window('low','north',.5,1.2,1),window('high','north',.5,1.2,4),window('tall','east',.5,1.2,2,2.5)]);
 const out=splitStudioPartAtStorey(base,'main',1,'upper');assert.ok(!('reason' in out));if('reason' in out)return;
 const r=out.recipe,[lower,upper]=r.volumes;assert.equal(lower.spanFloors,1);assert.equal(upper.startFloor,1);assert.equal(upper.spanFloors,2);
 const f=r.studio.freeOpenings!;assert.equal(f.find(o=>o.id==='low')!.shapeId,'main');assert.equal(f.find(o=>o.id==='high')!.shapeId,'upper');assert.equal(f.find(o=>o.id==='high')!.bottom,1);
 assert.ok(!f.some(o=>o.id==='tall'));assert.equal(out.removed[0].count,1);assert.equal(validateSculpt(r,3),null);
 const edited=applyOutlineEdit(r,'upper',ok(extrudeOutlineEdge(upper,2,-2)),'Pull in wall');
 assert.equal(edited.recipe.volumes[0].kind,'rectangle');assert.equal(validateSculpt(edited.recipe,3),null);
 assert.ok(Math.abs(area(sculptFootprint([edited.recipe.volumes[1]])[0][0])-48)<1e-6);
});
