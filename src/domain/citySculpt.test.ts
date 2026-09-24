import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPOSITIONS,applyComposition,newDesign} from './cityBuildingV3.ts';
import {addSculptAttachment,affectedSculptNodes,buildSculptGraph,effectiveSculptShapes,linkSculptFloor,reprojectSculptTiles,resolveSculpt,resolveSculptDecorations,resizeSculptFace,sculptFootprint,sculptFromPreset,sculptPitchedRoofFits,sculptWalls,setSculptShapes,upgradeSculpt,upgradeSculptVolumes,validateSculpt,type SculptAttachment,type SculptPrimitive,type SculptRecipe} from './citySculpt.ts';
import {createLandWorld,fitLandDesign,initialLandDraft,LocalLandRepository} from './cityLand.ts';
import {assembleSynarcKit,DEFAULT_SYNARC_KIT,isKitWallBay} from './citySynarcKit.ts';

const rect=(id:string,x:number,z:number,width:number,depth:number,operation:'add'|'subtract'='add'):SculptPrimitive=>({id,kind:'rectangle',operation,x,z,width,depth});
const design=newDesign('sculpt-test');
const ringArea=(ring:number[][])=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
const footprintArea=(shapes:SculptPrimitive[])=>sculptFootprint(shapes).reduce((sum,polygon)=>sum+ringArea(polygon[0])-polygon.slice(1).reduce((holes,ring)=>holes+ringArea(ring),0),0);
const exactRectangleArea=(shapes:SculptPrimitive[])=>{
 const xs=[...new Set(shapes.flatMap(s=>[s.x-s.width/2,s.x+s.width/2]))].sort((a,b)=>a-b),
  zs=[...new Set(shapes.flatMap(s=>[s.z-s.depth/2,s.z+s.depth/2]))].sort((a,b)=>a-b);
 let total=0;for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++){
  const x=(xs[i-1]+xs[i])/2,z=(zs[j-1]+zs[j])/2;
  if(shapes.some(s=>Math.abs(x-s.x)<s.width/2&&Math.abs(z-s.z)<s.depth/2))total+=(xs[i]-xs[i-1])*(zs[j]-zs[j-1]);
 }return total;
};
test('joined rectangles resolve to one outline without internal wall edges',()=>{
 const shapes=[rect('main',-2,0,10,10),rect('wing',3,2,8,6)];const polygons=sculptFootprint(shapes);
 assert.equal(polygons.length,1);assert.equal(polygons[0].length,1);
 const recipe={version:1 as const,levels:[{floor:0,shapes}]};assert.equal(validateSculpt(recipe,design.floors),null);
 const resolved=resolveSculpt(recipe,design);assert.ok(resolved.vertices.wall.length>0);
 assert.ok(resolved.vertices.wall.every(Number.isFinite));assert.ok(resolved.entrance);
});
test('rectangle unions retain their exact area and produce no diagonal roof gaps',()=>{
 const troublesome=[
  [rect('main',0,0,12,12),rect('wing-0',-4.5,-1,4.5,9.5),rect('wing-1',-5.5,2.5,3.5,6),rect('wing-2',-4.5,2.5,9,6)],
  [rect('main',0,0,12,12),rect('wing-0',5.5,1.5,9.5,3.5),rect('wing-1',-1,-1.5,5.5,2.5),rect('wing-2',5,5.5,8.5,4.5)],
 ];
 for(const shapes of troublesome)assert.ok(Math.abs(footprintArea(shapes)-exactRectangleArea(shapes))<.001);
 const oneFloor={...design,middleFloors:0,crown:'none' as const,floors:1,roof:'flat' as const};
 const resolved=resolveSculpt({version:1,levels:[{floor:0,shapes:troublesome[0]}]},oneFloor);
 const top=.65+oneFloor.groundHeight-.09,vertices=resolved.vertices.roof;let roofArea=0;
 for(let i=0;i<vertices.length;i+=9){const a=vertices.slice(i,i+3),b=vertices.slice(i+3,i+6),c=vertices.slice(i+6,i+9);
  if(Math.abs(a[1]-top)>.001||Math.abs(b[1]-top)>.001||Math.abs(c[1]-top)>.001)continue;
  roofArea+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;
 }
 assert.ok(Math.abs(roofArea-exactRectangleArea(troublesome[0]))<.001);
 let seed=70319;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const pick=(min:number,max:number)=>Math.round((min+next()*(max-min))*2)/2;
 for(let i=0;i<3000;i++){
  const shapes=[rect('main',0,0,12,12),...Array.from({length:3},(_,j)=>rect(`wing-${j}`,pick(-6,6),pick(-6,6),pick(2,12),pick(2,12)))];
  assert.ok(Math.abs(footprintArea(shapes)-exactRectangleArea(shapes))<.001,`rectangle sample ${i}`);
 }
});
test('a drawn rectangle joins curved shapes without removing their existing footprint',()=>{
 const round:SculptPrimitive={id:'round',kind:'ellipse',operation:'add',x:0,z:0,width:10,depth:8};
 const wing=rect('rect-wing',3,0,8,6),shapes=[round,wing],polygons=sculptFootprint(shapes);
 assert.equal(polygons.length,1);
 const joined=footprintArea(shapes),circle=footprintArea([round]),box=footprintArea([wing]);
 assert.ok(joined>circle&&joined>box&&joined<circle+box);
 const oneFloor={...design,middleFloors:0,crown:'none' as const,floors:1,roof:'flat' as const};
 const resolved=resolveSculpt({version:1,levels:[{floor:0,shapes}]},oneFloor);
 assert.ok(resolved.vertices.roof.every(Number.isFinite));
});
test('courtyard subtraction retains one polygon with a real roof opening',()=>{
 const shapes=[rect('outer',0,0,16,16),rect('court',0,0,5,5,'subtract')];
 const polygon=sculptFootprint(shapes);assert.equal(polygon.length,1);assert.equal(polygon[0].length,2);
 const recipe={version:1 as const,levels:[{floor:0,shapes}]};const resolved=resolveSculpt(recipe,design);
 assert.ok(resolved.vertices.roof.length>0);assert.equal(validateSculpt(recipe,design.floors),null);
});
test('solid-volume upgrade preserves every legacy floor footprint and attachments',()=>{
 const legacy:SculptRecipe={version:3,levels:[{floor:0,shapes:[rect('main',0,0,14,14)]},{floor:2,shapes:[rect('upper',0,0,10,10)]}],attachments:[{id:'entry',kind:'door',floor:0,x:0,z:7,nx:0,nz:1,span:1.6,style:'stone'}]};
 const next=upgradeSculptVolumes(legacy,4);assert.equal(next.version,4);assert.equal(next.volumes.length,2);
 for(let floor=0;floor<4;floor++)assert.deepEqual(sculptFootprint(effectiveSculptShapes(next,floor)),sculptFootprint(effectiveSculptShapes(legacy,floor)));
 assert.deepEqual(next.attachments,legacy.attachments);assert.equal(validateSculpt(next,4),null);
 const v2:SculptRecipe={version:2,levels:[{floor:0,shapes:[rect('main',0,0,12,12)]}],attachments:[{id:'old-door',kind:'door',floor:0,x:0,z:6,nx:0,nz:1,span:1.6,style:'simple'}]};
 assert.deepEqual(resolveSculptDecorations(upgradeSculptVolumes(v2,design.floors),design),resolveSculptDecorations(v2,design));
});
test('vertical add and circular cut resolve into supported curved inner façades',()=>{
 const recipe:Extract<SculptRecipe,{version:4}>={version:4,volumes:[
  {...rect('base',0,0,16,16),startFloor:0,spanFloors:4},
  {...rect('cut',0,0,5,5,'subtract'),kind:'ellipse',startFloor:1,spanFloors:3},
 ],attachments:[]};
 const d={...design,middleFloors:3,crown:'none' as const,floors:4,roof:'flat' as const};
 assert.equal(validateSculpt(recipe,4),null);
 assert.equal(sculptFootprint(effectiveSculptShapes(recipe,0))[0].length,1);
 assert.equal(sculptFootprint(effectiveSculptShapes(recipe,1))[0].length,2);
 const inner=sculptWalls(recipe,d).filter(w=>w.floor===1&&w.ring>0);
 assert.ok(inner.length>=8);assert.ok(inner.every(w=>w.source?.shapeId==='cut'&&w.source.side==='curve'));
 const resolved=resolveSculpt(recipe,d);assert.ok(resolved.vertices.glass.length>0);
 assert.ok(Object.values(resolved.vertices).every(vertices=>vertices.every(Number.isFinite)));
 const mixed=resolveSculpt(recipe,{...d,synarcKit:structuredClone(DEFAULT_SYNARC_KIT)});
 assert.ok(mixed.kit?.placements.length);assert.ok(mixed.curvedVertices?.wall.length);
 assert.equal(mixed.curvedVertices?.glass.length,0);
 assert.ok(mixed.kit?.placements.some(p=>p.floor===1&&isKitWallBay(p)));
 const legacy:SculptRecipe={version:3,levels:[{floor:0,shapes:[rect('old-base',0,0,16,16),{...rect('old-cut',0,0,5,5,'subtract'),kind:'ellipse'}]}],attachments:[]};
 const old=resolveSculpt(legacy,{...d,synarcKit:structuredClone(DEFAULT_SYNARC_KIT)});
 assert.ok(old.kit?.placements.length);assert.equal(old.curvedVertices?.wall.length,0);
});
test('solid volumes move apart, overhang and accept cuts through former entrances',()=>{
 const ground={...rect('ground',0,0,12,12),startFloor:0,spanFloors:3};
 const base:Extract<SculptRecipe,{version:4}>={version:4,volumes:[ground],attachments:[]};
 assert.equal(validateSculpt(base,3),null);
 const overhang={...base,volumes:[ground,{...rect('overhang',5,0,7,7),startFloor:1,spanFloors:2}]};
 const island={...base,volumes:[ground,{...rect('island',8,0,2,2),startFloor:0,spanFloors:3}]};
 const entryCut={...base,volumes:[ground,{...rect('entry-cut',0,4,12,6,'subtract'),startFloor:0,spanFloors:3}]};
 for(const recipe of [overhang,island,entryCut])assert.equal(validateSculpt(recipe,3),null);
 assert.equal(sculptFootprint(effectiveSculptShapes(island,0)).length,2);
 assert.ok(resolveSculpt(island,{...design,middleFloors:2,crown:'none',floors:3}).vertices.wall.length>0);
 assert.doesNotThrow(()=>resolveSculpt(entryCut,{...design,middleFloors:2,crown:'none',floors:3}));
 assert.match(validateSculpt({...base,volumes:[ground,{...rect('outside',9,0,5,5),startFloor:0,spanFloors:1}]},3)||'',/inside the plot/);
 assert.match(validateSculpt({...base,volumes:[ground,{...rect('too-tall',0,0,4,4),startFloor:0,spanFloors:9}]},9)||'',/eight-floor/);
});
test('one subtractive operand cuts whichever disconnected or raised solids it intersects',()=>{
 const left={...rect('left',-4,0,6,8),startFloor:0,spanFloors:2};
 const right={...rect('right',4,0,6,8),startFloor:1,spanFloors:3};
 const cut={...rect('cut',0,0,12,4,'subtract'),startFloor:0,spanFloors:4};
 const recipe:SculptRecipe={version:4,volumes:[left,right,cut],attachments:[]};
 assert.equal(validateSculpt(recipe,4),null);
 assert.ok(sculptFootprint(effectiveSculptShapes(recipe,0)).length>0);
 assert.ok(sculptFootprint(effectiveSculptShapes(recipe,1)).length>1);
 const result=resolveSculpt(recipe,{...design,middleFloors:3,crown:'none',floors:4});
 assert.equal(result.floors.length,4);
 assert.ok(Object.values(result.vertices).every(vertices=>vertices.every(Number.isFinite)));
 const moved:SculptRecipe={...recipe,volumes:[left,right,{...cut,x:4}]};
 assert.equal(validateSculpt(moved,4),null);
 assert.notDeepEqual(sculptFootprint(effectiveSculptShapes(moved,1)),result.floors[1].polygons);
});
test('raising one of two intersecting solids keeps their three-dimensional union valid',()=>{
 const a={...rect('base',-2,0,10,10),startFloor:0,spanFloors:1};
 const b={...rect('wing',3,0,8,8),startFloor:0,spanFloors:3};
 const recipe:SculptRecipe={version:4,volumes:[a,b],attachments:[]};
 assert.equal(validateSculpt(recipe,3),null);
 assert.equal(sculptFootprint(effectiveSculptShapes(recipe,0)).length,1);
 assert.equal(sculptFootprint(effectiveSculptShapes(recipe,2)).length,1);
});
test('linked levels inherit until a detached floor changes and unsupported overhangs are rejected',()=>{
 const base=[rect('base',0,0,14,14)];let recipe:SculptRecipe={version:1,levels:[{floor:0,shapes:base}]};
 assert.deepEqual(effectiveSculptShapes(recipe,3),base);
 recipe=setSculptShapes(recipe,2,[rect('upper',0,0,10,10)]);assert.equal(effectiveSculptShapes(recipe,1)[0].width,14);assert.equal(effectiveSculptShapes(recipe,3)[0].width,10);
 assert.equal(validateSculpt(recipe,design.floors),null);
 assert.deepEqual(effectiveSculptShapes(linkSculptFloor(recipe,2),3),base);
 const overhang=setSculptShapes(recipe,2,[rect('bad',3.5,0,10,10)]);assert.match(validateSculpt(overhang,design.floors)||'',/supported/);
});
test('round and L presets convert; specialised twin towers remain preset-only',()=>{
 for(const archetype of ['round-tower','ellipse-tower'] as const){const d={...design,archetype},recipe=sculptFromPreset(d)!;assert.equal(validateSculpt(recipe,d.floors),null);assert.ok(resolveSculpt(recipe,d).vertices.glass.length>0);}
 const l={...design,blueprint:'l-shape' as const};assert.equal(validateSculpt(sculptFromPreset(l)!,l.floors),null);
 assert.equal(sculptFromPreset({...design,archetype:'twin-tower'}),null);
});
test('every convertible preset resolves at minimum and maximum plot dimensions',()=>{
 for(let i=0;i<COMPOSITIONS.length;i++)for(const size of [8,18]){
  const d=fitLandDesign({...applyComposition(newDesign('all-presets'),i),width:size,depth:size},0),recipe=sculptFromPreset(d);
  if(!recipe)continue;
  assert.equal(validateSculpt(recipe,d.floors),null,COMPOSITIONS[i].name);
  const resolved=resolveSculpt(recipe,d);assert.equal(resolved.floors.length,d.floors);
  for(const vertices of Object.values(resolved.vertices))assert.ok(vertices.every(Number.isFinite),COMPOSITIONS[i].name);
 }
});
test('local drafts persist sculpt recipe separately from completed version',async()=>{
 const initial=createLandWorld([],72,24),store=new Map<string,string>(),storage={getItem:(key:string)=>store.get(key)||null,setItem:(key:string,value:string)=>{store.set(key,value);}};
 const repo=new LocalLandRepository(storage,initial);let plot=await repo.purchase(initial.plots[0].id,0,'purchase');const draft=initialLandDraft(plot),sculpt=sculptFromPreset(draft.design)!;
 plot=await repo.finish(plot.id,plot.revision,{...draft,builderMode:'sculpt',sculpt});
 plot=await repo.saveDraft(plot.id,plot.revision,{...draft,builderMode:'sculpt',sculpt:setSculptShapes(sculpt,1,[rect('upper',0,0,10,10)])});
 const reloaded=(await new LocalLandRepository(storage,initial).list()).plots[0];
 assert.equal(reloaded.finished?.sculpt&&effectiveSculptShapes(reloaded.finished.sculpt,1)[0].width,effectiveSculptShapes(sculpt,1)[0].width);
 assert.equal(reloaded.draft?.sculpt&&effectiveSculptShapes(reloaded.draft.sculpt,1)[0].width,10);
});
test('version-4 solids survive local draft and finish reload',async()=>{
 const initial=createLandWorld([],72,24),store=new Map<string,string>(),storage={getItem:(key:string)=>store.get(key)||null,setItem:(key:string,value:string)=>{store.set(key,value);}};
 const repo=new LocalLandRepository(storage,initial),plot=await repo.purchase(initial.plots[0].id,0,'solid-purchase');
 const draft=initialLandDraft(plot),sculpt=upgradeSculptVolumes(sculptFromPreset(draft.design)!,draft.design.floors);
 const saved=await repo.saveDraft(plot.id,plot.revision,{...draft,builderMode:'sculpt',sculpt});
 await repo.finish(plot.id,saved.revision,{...draft,builderMode:'sculpt',sculpt});
 const reloaded=(await new LocalLandRepository(storage,initial).list()).plots[0];
 assert.deepEqual(reloaded.draft?.sculpt,sculpt);assert.deepEqual(reloaded.finished?.sculpt,sculpt);
});
test('large plots accept wider solids while small plots keep their build envelope',()=>{
 const solid={...rect('large',0,0,22,16),startFloor:0,spanFloors:1};
 const recipe:SculptRecipe={version:4,plotSize:48,volumes:[solid],attachments:[]};
 assert.equal(validateSculpt(recipe,1),null);
 assert.match(validateSculpt({...recipe,plotSize:24},1)??'',/inside the plot/);
});

test('exposed wall and roof geometry retains per-volume material ownership',()=>{
 const recipe:SculptRecipe={version:4,volumes:[
  {...rect('main',-2,0,10,10),startFloor:0,spanFloors:1,wallTexture:'brick',roofTexture:'terracotta'},
  {...rect('wing',3,0,8,8),startFloor:0,spanFloors:1,wallTexture:'timber',roofTexture:'metal'},
 ],attachments:[]};
 const resolved=resolveSculpt(recipe,{...design,crown:'none',middleFloors:0,floors:1});
 assert.ok((resolved.volumeVertices?.main.wall.length??0)>0);
 assert.ok((resolved.volumeVertices?.wing.wall.length??0)>0);
 assert.ok((resolved.volumeVertices?.main.roof.length??0)>0);
 assert.ok((resolved.volumeVertices?.wing.roof.length??0)>0);
});
test('whole-volume tile roles and styles affect only their exposed walls',()=>{
 const d={...design,crown:'none' as const,middleFloors:0,floors:1,synarcKit:DEFAULT_SYNARC_KIT};
 const recipe:SculptRecipe={version:4,volumes:[
  {...rect('solid',-4,0,5,6),startFloor:0,spanFloors:1,kitRole:'solid',kitStyle:'painted-townhouse'},
  {...rect('glazed',4,0,5,6),startFloor:0,spanFloors:1,kitRole:'windows',kitStyle:'modern-office',kitWindow:'window-paired'},
 ],attachments:[]};
 assert.equal(validateSculpt(recipe,1),null);
 const parts=resolveSculpt(recipe,d).kit!.placements.filter(isKitWallBay);
 const left=parts.filter(p=>p.x<0),right=parts.filter(p=>p.x>0);
 assert.ok(left.some(p=>p.part==='painted-townhouse/wall-full'));
 assert.ok(left.every(p=>p.part.startsWith('painted-townhouse/')&&!p.part.includes('/window-')));
 assert.ok(right.length>0&&right.every(p=>p.part==='modern-office/window-paired'));
 const chosen=right[0],paint={id:'one-solid-bay',part:'wall-full' as const,floor:chosen.floor,x:chosen.x,z:chosen.z,nx:Math.sin(chosen.rotation),nz:Math.cos(chosen.rotation)};
 const overridden=resolveSculpt(recipe,{...d,synarcKit:{...DEFAULT_SYNARC_KIT,paints:[paint]}}).kit!.placements.filter(isKitWallBay);
 assert.equal(overridden.find(p=>p.x===chosen.x&&p.z===chosen.z)?.part,'modern-office/wall-full');
 assert.ok(overridden.some(p=>p.x>0&&p.part==='modern-office/window-paired'));
 assert.equal(validateSculpt({...recipe,volumes:[{...recipe.volumes[0],kitRole:'invalid' as never},recipe.volumes[1]]},1)?.length!>0,true);
});
test('curved wall geometry retains its own material ownership when flat kit bays are present',()=>{
 const d={...design,crown:'none' as const,middleFloors:0,floors:1,synarcKit:DEFAULT_SYNARC_KIT};
 const recipe:SculptRecipe={version:4,volumes:[
  {...rect('main',-2,0,10,10),startFloor:0,spanFloors:1},
  {...rect('round',3,0,8,8),kind:'ellipse',startFloor:0,spanFloors:1,wallTexture:'brick'},
 ],attachments:[]};
 assert.equal(validateSculpt(recipe,1),null);
 const resolved=resolveSculpt(recipe,d);
 assert.ok(resolved.kit);
 assert.ok((resolved.curvedVolumeWalls?.round.length??0)>0);
 assert.ok((resolved.volumeVertices?.round.wall.length??0)>0);
});
test('one cylinder can switch its curved facade pattern without changing its footprint',()=>{
 const d={...design,crown:'none' as const,middleFloors:0,floors:1};
 const base={...rect('round',0,0,10,10),kind:'ellipse' as const,startFloor:0,spanFloors:1};
 const recipe:SculptRecipe={version:4,volumes:[base],attachments:[]};
 const solid:SculptRecipe={...recipe,volumes:[{...base,curvedFacade:'solid'}]};
 const glazed:SculptRecipe={...recipe,volumes:[{...base,curvedFacade:'glazing'}]};
 assert.equal(validateSculpt(solid,1),null);
 assert.equal(validateSculpt(glazed,1),null);
 assert.deepEqual(sculptFootprint(effectiveSculptShapes(solid,0)),sculptFootprint(effectiveSculptShapes(glazed,0)));
 const solidGlass=resolveSculpt(solid,d).vertices.glass.length,glazedGlass=resolveSculpt(glazed,d).vertices.glass.length;
 assert.equal(solidGlass,0);
 assert.ok(glazedGlass>solidGlass);
});
test('curved sculpt walls receive fitted kit windows without procedural window overlap',()=>{
 const d={...design,crown:'none' as const,middleFloors:0,floors:1,synarcKit:DEFAULT_SYNARC_KIT};
 const recipe:SculptRecipe={version:4,volumes:[{...rect('round',0,0,10,10),kind:'ellipse',startFloor:0,spanFloors:1,curvedFacade:'windows',kitStyle:'modern-office',kitWindow:'window-paired'}],attachments:[]};
 const resolved=resolveSculpt(recipe,d),bays=resolved.kit!.placements.filter(isKitWallBay);
 assert.ok(bays.length>=8,'the cylinder must have selectable fitted tile bays');
 assert.ok(bays.some(p=>p.part==='modern-office/window-paired'));
 assert.ok(bays.every(p=>p.scaleX>=.55&&p.scaleX<=1.45));
 assert.equal(resolved.curvedVertices?.glass.length,0,'old curved glass must not overlap kit tiles');
 assert.ok((resolved.curvedVertices?.wall.length??0)>0,'an inset backing closes angular seams');
 const paint={id:'round-window',part:'window-detailed' as const,floor:0,x:bays[0].x,z:bays[0].z,nx:Math.sin(bays[0].rotation),nz:Math.cos(bays[0].rotation)};
 const withPaint:SculptRecipe={...recipe,tileAnchors:[{id:paint.id,volumeId:'round',side:'curve',u:((Math.atan2(paint.z/5,paint.x/5)+Math.PI*2)%(Math.PI*2))/(Math.PI*2),floor:0,part:paint.part}]};
 assert.equal(validateSculpt(withPaint,1),null);
 const moved:SculptRecipe={...withPaint,volumes:[{...recipe.volumes[0],x:1}]};
 const projected=reprojectSculptTiles(moved,{...DEFAULT_SYNARC_KIT,paints:[paint]},d)!;
 assert.ok(Math.abs(projected.paints[0].x-(paint.x+1))<.6,'paint follows the curved volume');
});
test('facade tile anchors follow a moved volume and remain authored when hidden',()=>{
 const d={...design,crown:'none',middleFloors:0,floors:1};
 const base={...rect('main',0,0,12,12),startFloor:0,spanFloors:1};
 const recipe:SculptRecipe={version:4,volumes:[base],attachments:[]};
 const walls=sculptWalls(recipe,d).map(w=>({x:(w.a[0]+w.b[0])/2,z:(w.a[1]+w.b[1])/2,nx:w.nx,nz:w.nz,length:w.length,y:w.bottom,height:w.top-w.bottom,floor:w.floor}));
 const bay=assembleSynarcKit(walls,DEFAULT_SYNARC_KIT).placements.filter(isKitWallBay).find(p=>p.floor===0&&p.z>5&&p.x<0)!;
 assert.ok(bay);
 const paint={id:'anchored-window',part:'window-detailed' as const,floor:0,x:bay.x,z:bay.z,nx:Math.sin(bay.rotation),nz:Math.cos(bay.rotation)};
 const authored:SculptRecipe={...recipe,tileAnchors:[{id:paint.id,volumeId:'main',side:'north',u:(bay.x+6)/12,floor:0,part:paint.part}]};
 const moved:SculptRecipe={...authored,volumes:[{...base,x:1}]};
 const projected=reprojectSculptTiles(moved,{...DEFAULT_SYNARC_KIT,paints:[paint]},d)!;
 assert.ok(Math.abs(projected.paints[0].x-(bay.x+1))<.6);
 assert.equal(authored.version===4&&authored.tileAnchors?.[0].id,paint.id);
});
test('entrance brush snaps to a real bay and dependent details retain intent through shape edits',()=>{
 const base:SculptRecipe={version:1,levels:[{floor:0,shapes:[rect('main',0,0,12,12)]}]};
 const wall=sculptWalls(base,design).find(w=>w.floor===0&&w.nz>.9)!;
 const make=(kind:SculptAttachment['kind'],id:string,span=2.4):SculptAttachment=>({id,kind,floor:0,x:0,z:6,nx:wall.nx,nz:wall.nz,span,style:'stone'});
 const door=addSculptAttachment(base,design,make('door','door'));
 assert.equal(door.reason,null);assert.equal(door.recipe.version,2);
 const entrance=resolveSculpt(door.recipe,design).entrance!;
 assert.ok(Math.abs(entrance.x)<1.5);assert.equal(entrance.z,6);
 const canopy=addSculptAttachment(door.recipe,design,make('canopy','canopy'));
 assert.equal(canopy.reason,null);
 const pillars=addSculptAttachment(canopy.recipe,design,make('pillars','pillars'));
 assert.equal(pillars.reason,null);
 assert.deepEqual(resolveSculptDecorations(pillars.recipe,design).map(d=>d.active),[true,true,true]);
 const narrow=setSculptShapes(pillars.recipe,0,[rect('small',0,0,2,12)]);
 assert.equal(narrow.version,2);assert.equal(resolveSculptDecorations(narrow,design).find(d=>d.id==='pillars')?.active,false);
 assert.equal(resolveSculptDecorations(pillars.recipe,design).find(d=>d.id==='pillars')?.active,true);
});
test('ground brush protects building, entrance route and plot boundary',()=>{
 const recipe:SculptRecipe={version:1,levels:[{floor:0,shapes:[rect('main',0,0,12,12)]}]};
 const at=(id:string,x:number,z:number):SculptAttachment=>({id,kind:'planter',floor:0,x,z,nx:0,nz:1,span:2,style:'simple'});
 assert.match(addSculptAttachment(recipe,design,at('inside',0,0)).reason||'',/building/);
 assert.match(addSculptAttachment(recipe,design,at('path',0,8)).reason||'',/path/);
 assert.match(addSculptAttachment(recipe,design,at('edge',10.5,8)).reason||'',/plot/);
 assert.equal(addSculptAttachment(recipe,design,at('clear',7.5,8)).reason,null);
});
test('empty version-2 recipe preserves version-1 geometry exactly',()=>{
 const old:SculptRecipe={version:1,levels:[{floor:0,shapes:[rect('main',0,0,14,12)]}]};
 const next:SculptRecipe={version:2,levels:old.levels,attachments:[]};
 const before=resolveSculpt(old,design),after=resolveSculpt(next,design);
 assert.deepEqual(after.vertices,before.vertices);assert.deepEqual(after.entrance,before.entrance);
});
test('off-centre door moves its bay and entrance assemblies follow without new authored coordinates',()=>{
 const base:SculptRecipe={version:1,levels:[{floor:0,shapes:[rect('main',0,0,12,12)]}]},wall=sculptWalls(base,design).find(w=>w.floor===0&&w.nz>.9)!;
 const door=(id:string,x:number):SculptAttachment=>({id,kind:'door',floor:0,x,z:6,nx:wall.nx,nz:wall.nz,span:2.4,style:'simple'});
 const first=addSculptAttachment(base,design,door('first',0)).recipe;
 const canopy=addSculptAttachment(first,design,{...door('canopy',0),kind:'canopy'}).recipe;
 const moved=addSculptAttachment(canopy,design,door('second',3)).recipe;
 const resolved=resolveSculpt(moved,design),details=resolveSculptDecorations(moved,design);
 assert.ok(resolved.entrance!.x>1.5);assert.ok(Math.abs(details.find(d=>d.kind==='canopy')!.x-resolved.entrance!.x)<.001);
 assert.equal(details.filter(d=>d.kind==='door').length,1);
});
test('full-run trim fits an exposed wall and ground groups cannot overlap',()=>{
 const base:SculptRecipe={version:1,levels:[{floor:0,shapes:[rect('main',0,0,12,12)]}]},wall=sculptWalls(base,design).find(w=>w.floor===0&&w.nz>.9)!;
 const trim:SculptAttachment={id:'edge',kind:'trim',floor:0,x:0,z:6,nx:wall.nx,nz:wall.nz,span:11.8,style:'metal'};
 const placed=addSculptAttachment(base,design,trim);assert.equal(placed.reason,null);
 assert.equal(resolveSculptDecorations(placed.recipe,design).find(d=>d.kind==='trim')?.span,12);
 const planter:SculptAttachment={id:'planter',kind:'planter',floor:0,x:8,z:8,nx:0,nz:1,span:2,style:'simple'};
 const withPlanter=addSculptAttachment(placed.recipe,design,planter).recipe;
 assert.match(addSculptAttachment(withPlanter,design,{...planter,id:'overlap',x:8.5}).reason||'',/occupies/);
});
test('version-3 source anchors move doors and attached porch with a resized face',()=>{
 const old:SculptRecipe={version:1,levels:[{floor:0,shapes:[rect('main',0,0,12,12)]}]};
 const upgraded=upgradeSculpt(old,design),front=sculptWalls(upgraded,design).find(w=>w.floor===0&&w.nz>.9)!;
 assert.equal(upgraded.version,3);
 const door=addSculptAttachment(upgraded,design,{id:'door',kind:'door',floor:0,x:3,z:6,nx:front.nx,nz:front.nz,span:2.4,style:'simple'});
 assert.equal(door.reason,null);assert.equal(door.recipe.version,3);
 const canopy=addSculptAttachment(door.recipe,design,{id:'canopy',kind:'canopy',floor:0,x:2.4,z:6,nx:front.nx,nz:front.nz,span:2.8,style:'simple'});
 assert.equal(canopy.reason,null);
 const before=resolveSculptDecorations(canopy.recipe,design);
 const widened=setSculptShapes(canopy.recipe,0,[rect('main',0,0,16,14)]);
 const after=resolveSculptDecorations(widened,design),entry=after.find(a=>a.kind==='door')!,cover=after.find(a=>a.kind==='canopy')!;
 assert.ok(entry.active);assert.ok(entry.x>before[0].x+1);assert.equal(entry.z,7);
 assert.equal(cover.x,entry.x);assert.equal(cover.z,entry.z);
 const replaced=setSculptShapes(widened,0,[rect('replacement',0,0,16,14)]);
 assert.equal(resolveSculptDecorations(replaced,design).find(a=>a.kind==='door')?.active,false);
 assert.equal(resolveSculptDecorations(widened,design).find(a=>a.kind==='door')?.active,true);
});
test('moving one rectangular face leaves its opposite edge fixed and updates anchored details',()=>{
 const shape=rect('main',0,0,12,12),base=upgradeSculpt({version:1,levels:[{floor:0,shapes:[shape]}]},design),front=sculptWalls(base,design).find(w=>w.floor===0&&w.nz>.9)!;
 const door=addSculptAttachment(base,design,{id:'door',kind:'door',floor:0,x:2,z:6,nx:front.nx,nz:front.nz,span:2.4,style:'simple'}).recipe;
 const moved=resizeSculptFace(shape,'north',2.5);
 assert.equal(moved.z-moved.depth/2,shape.z-shape.depth/2);
 assert.equal(moved.z+moved.depth/2,shape.z+shape.depth/2+2.5);
 const edited=setSculptShapes(door,0,[moved]),entry=resolveSculptDecorations(edited,design).find(a=>a.kind==='door')!;
 assert.ok(entry.active);assert.equal(entry.z,8.5);
 assert.equal(validateSculpt(edited,design.floors),null);
 const east=resizeSculptFace(shape,'east',.5);
 assert.equal(east.x-east.width/2,shape.x-shape.width/2);
});
test('semantic graph repacks façade bays and extends full-wall trim',()=>{
 const base=upgradeSculpt({version:1,levels:[{floor:0,shapes:[rect('main',0,0,12,12)]}]},design);
 const front=sculptWalls(base,design).find(w=>w.floor===0&&w.nz>.9)!;
 const trim=addSculptAttachment(base,design,{id:'trim',kind:'trim',floor:0,x:0,z:6,nx:front.nx,nz:front.nz,span:11.9,style:'metal'});
 assert.equal(trim.reason,null);
 const before=buildSculptGraph(trim.recipe,design);
 const widened=setSculptShapes(trim.recipe,0,[rect('main',0,0,16,12)]),after=buildSculptGraph(widened,design);
 assert.equal(after.decorations.find(a=>a.id==='trim')?.span,16);
 assert.ok(after.walls.find(w=>w.wall.floor===0&&w.wall.nz>.9)!.bayCount>before.walls.find(w=>w.wall.floor===0&&w.wall.nz>.9)!.bayCount);
 assert.ok(after.nodes.some(n=>n.stage==='facade'&&n.dependsOn[0].startsWith('wall:')));
 assert.ok(after.nodes.some(n=>n.stage==='roof'&&n.dependsOn.some(dep=>dep.startsWith('wall:'))));
 assert.equal(validateSculpt(widened,design.floors),null);
 const resolved=resolveSculpt(widened,design);assert.ok(resolved.vertices.glass.every(Number.isFinite));
});
test('graph dependencies propagate an entrance edit through its façade and porch',()=>{
 const base=upgradeSculpt({version:1,levels:[{floor:0,shapes:[rect('main',0,0,12,12)]}]},design),front=sculptWalls(base,design).find(w=>w.floor===0&&w.nz>.9)!;
 const at=(id:string,kind:SculptAttachment['kind']):SculptAttachment=>({id,kind,floor:0,x:0,z:6,nx:front.nx,nz:front.nz,span:2.8,style:'simple'});
 const door=addSculptAttachment(base,design,at('entry','door')).recipe,porch=addSculptAttachment(door,design,at('porch','canopy')).recipe;
 const graph=buildSculptGraph(porch,design),affected=affectedSculptNodes(graph,['intent:entry']);
 assert.ok(affected.some(id=>id.startsWith('facade:')));
 assert.ok(affected.includes('attachment:entry'));
 assert.ok(affected.includes('attachment:porch'));
});
test('every convertible preset can resolve through the typed graph without losing its outline',()=>{
 for(let i=0;i<COMPOSITIONS.length;i++)for(const size of [8,18]){
  const d=fitLandDesign({...applyComposition(newDesign('graph-presets'),i),width:size,depth:size},0),old=sculptFromPreset(d);if(!old)continue;
  const next=upgradeSculpt(old,d),graph=buildSculptGraph(next,d),resolved=resolveSculpt(next,d);
  assert.equal(graph.floors.length,d.floors,COMPOSITIONS[i].name);
  assert.equal(resolved.floors.length,d.floors,COMPOSITIONS[i].name);
  assert.ok(graph.walls.every(run=>run.bayCount>=1),COMPOSITIONS[i].name);
 }
});
test('pitched roof fits a rectangular top floor and keeps its sloped faces outward',()=>{
 const base=upgradeSculpt({version:1,levels:[{floor:0,shapes:[rect('main',0,0,12,10)]}]},design),pitched={...design,roof:'pitched' as const};
 assert.equal(sculptPitchedRoofFits(base,pitched.floors-1),true);
 const vertices=resolveSculpt(base,pitched).vertices.roof,top=.65+pitched.groundHeight+(pitched.floors-1)*3;
 let slopes=0;
 for(let i=0;i<vertices.length;i+=9){const a=vertices.slice(i,i+3),b=vertices.slice(i+3,i+6),c=vertices.slice(i+6,i+9);if(Math.max(a[1],b[1],c[1])<=top+.1)continue;const ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);if(Math.abs(ny)>.01){assert.ok(ny>0);slopes++;}}
 assert.ok(slopes>=4);
 const cut=setSculptShapes(base,pitched.floors-1,[rect('main',0,0,12,10),rect('court',0,0,3,3,'subtract')]);
 assert.equal(sculptPitchedRoofFits(cut,pitched.floors-1),false);
});
