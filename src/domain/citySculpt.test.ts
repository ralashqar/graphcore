import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPOSITIONS,applyComposition,newDesign} from './cityBuildingV3.ts';
import {addSculptAttachment,affectedSculptNodes,buildSculptGraph,effectiveSculptShapes,linkSculptFloor,resolveSculpt,resolveSculptDecorations,resizeSculptFace,sculptFootprint,sculptFromPreset,sculptPitchedRoofFits,sculptWalls,setSculptShapes,upgradeSculpt,validateSculpt,type SculptAttachment,type SculptPrimitive,type SculptRecipe} from './citySculpt.ts';
import {createLandWorld,fitLandDesign,initialLandDraft,LocalLandRepository} from './cityLand.ts';

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
 assert.equal(reloaded.finished?.sculpt?.levels[1]?.shapes[0].width,sculpt.levels[1]?.shapes[0].width);
 assert.equal(reloaded.draft?.sculpt?.levels[1]?.shapes[0].width,10);
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
