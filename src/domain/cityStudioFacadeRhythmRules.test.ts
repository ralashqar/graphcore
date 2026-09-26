// Facade rhythm rules model (version 2): pools, coverage, patterns, scopes, manual fill, presets and
// backward compatibility with version-1 recipes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioBays,studioFloorCount,validateStudio} from './cityStudio.ts';
import type {StudioFreeOpening} from './cityStudioFreeOpenings.ts';
import {applyRhythmStyle,expandFacadeRhythm,materializeFacadeRhythm,newFacadeRhythm,removeFacadeRhythmRule,rhythmLayerPreset,rhythmScopeSettings,RHYTHM_STYLE_IDS,setFacadeRhythm,setFacadeRhythmRule,setRhythmLayer,shuffleFacadeRhythm,toggleFacadeRhythmLock,type FacadeRhythm,type RhythmLayers} from './cityStudioFacadeRhythm.ts';
import {LEGACY_RHYTHM_CASES,legacyCaseHash} from './cityStudioFacadeRhythmLegacyCases.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const vol=(id:string,patch:Partial<SculptVolume>={}):SculptVolume=>({id,kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:3,...patch});
const recipe=(rhythm:FacadeRhythm|undefined,volumes=[vol('main')],free?:StudioFreeOpening[]):StudioRecipe=>({version:5,volumes,attachments:[],plotSize:24,studio:{...freshStudio(),...(rhythm?{facadeRhythm:rhythm}:{}),...(free?{freeOpenings:free}:{})}});
const design=(r:StudioRecipe)=>({...newDesign('rhythm-test'),groundHeight:3.8,upperHeight:3.2,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const});
const expand=(r:StudioRecipe)=>{const d=design(r);return expandFacadeRhythm(r,d,studioBays(r,d));};
const face=(list:StudioFreeOpening[],shapeId:string,side:string)=>list.filter(o=>o.shapeId===shapeId&&o.side===side);
const col=(id:string)=>id.split('/').at(-2)!;
const storey=(id:string)=>Number(id.split('/').at(-3));
const upperOpenings=(out:ReturnType<typeof expand>,side='north')=>face(out.freeOpenings,'main',side).filter(o=>storey(o.id)>0);
const withLayers=(layers:RhythmLayers,extra:Partial<FacadeRhythm>={},volumes=[vol('main',{width:16,spanFloors:4})])=>recipe({...newFacadeRhythm('townhouse',5),layers,...extra},volumes);
const only=(id:string)=>[{id,weight:1}];

// Recorded from the version-1 generator before the rules model (see cityStudioFacadeRhythmLegacyCases.ts).
const LEGACY_HASHES:Record<string,string>={townhouse:'8f1763cd/64/37',shopfront:'c4540b0d/112/49',civic:'9a0bc3b2/52/39',cottage:'5bcc7994/54/40',warehouse:'eee892f/60/30',loft:'c8d3f373/120/45',rules:'72d1dd80/42/38','manual-own':'84c4781b/27/18','manual-fill':'ae42bad9/81/0','four-parts':'e4bbe99/53/33'};
test('version 1 recipes resolve exactly as before the rules model',()=>{
 for(const c of LEGACY_RHYTHM_CASES)assert.equal(legacyCaseHash(c),LEGACY_HASHES[c.name],c.name);
 // Legacy setters keep version 1 unless a version-2 field is written.
 const r=recipe({version:1,seed:3,style:'civic'});
 assert.equal(setFacadeRhythm(r,{density:.2,trims:'rich',manual:'fill'}).studio.facadeRhythm!.version,1);
 assert.equal(setFacadeRhythmRule(r,{partId:'main'},{style:'loft'}).studio.facadeRhythm!.version,1);
 assert.equal(toggleFacadeRhythmLock(r,'upper').studio.facadeRhythm!.version,1);
 assert.equal(applyRhythmStyle(r,[],'loft').studio.facadeRhythm!.version,1,'a style preset alone keeps version 1');
 assert.equal(setRhythmLayer(r,[],'upper',{coverage:.5}).studio.facadeRhythm!.version,2,'pools upgrade to version 2');
 assert.equal(setFacadeRhythmRule(r,{partId:'main',side:'north'},{manual:'own'}).studio.facadeRhythm!.version,2,'keep-manual walls upgrade');
 assert.equal(newFacadeRhythm().version,2);
});

test('pools: a single entry fixes the type; weights bias the choice; results are deterministic',()=>{
 const arch=expand(withLayers({upper:{pool:only('arch')},attic:{pool:only('arch')}}));
 assert.ok(upperOpenings(arch).length>6);assert.ok(upperOpenings(arch).every(o=>o.shape==='arch'),'only arches above the ground floor');
 assert.deepEqual(arch,expand(withLayers({upper:{pool:only('arch')},attic:{pool:only('arch')}})),'same recipe, same facade');
 const count=(pool:{id:string;weight:number}[])=>{let a=0,b=0;for(let seed=0;seed<30;seed++){const out=expand(recipe({...newFacadeRhythm('townhouse',seed),layers:{upper:{pool,uniformity:0,pattern:'independent'}}},[vol('main',{width:16,spanFloors:4})]));for(const o of upperOpenings(out)){if(o.shape==='arch')a++;else if(o.shape==='rect')b++;}}return {a,b};};
 const even=count([{id:'rect',weight:1},{id:'arch',weight:1}]),favour=count([{id:'rect',weight:1},{id:'arch',weight:4}]);
 assert.ok(favour.a/(favour.a+favour.b)>even.a/(even.a+even.b)+.2,`favoured arches appear more often (${JSON.stringify({even,favour})})`);
 // Avoided types never appear; pairs are mullioned groups inside one column.
 const noRound=expand(withLayers({attic:{pool:[{id:'rect',weight:1},{id:'arch',weight:2}]}},{style:'civic'}));
 assert.ok(!noRound.freeOpenings.some(o=>o.shape==='round'),'round removed from the pool');
 const pairs=expand(withLayers({upper:{pool:only('paired')}}));assert.ok(upperOpenings(pairs).some(o=>o.id.endsWith('/1')),'paired windows have two panels');
 for(const style of RHYTHM_STYLE_IDS){
  const r=withLayers({upper:{pool:['triple','wide','tall','pointed','round','door','paired'].map(id=>({id,weight:1})),uniformity:0,pattern:'independent'},ground:{pool:['shop','door','blind','wide','arch'].map(id=>({id,weight:1})),uniformity:0,pattern:'independent'}},{style});
  const studio=resolveSculpt(r,design(r)).studio!;
  assert.deepEqual(studio.inactive,[],`${style}: every pool type fits its storey and never collides`);
  for(const f of studio.freeFaces!)for(const g of f.groups)assert.equal(new Set(g.members.map(m=>m.split('/').slice(-3,-1).join('/'))).size,1,`${style} ${g.id} merges across cells`);
 }
});

test('coverage opens a share of cells; aligned patterns blank whole columns, independent ones single cells',()=>{
 assert.equal(upperOpenings(expand(withLayers({upper:{coverage:0},attic:{coverage:0}}))).length,0,'no coverage: blind upper storeys');
 const full=upperOpenings(expand(withLayers({upper:{coverage:1,pool:only('rect')},attic:{coverage:1,pool:only('rect')}}))).length;
 const aligned=upperOpenings(expand(withLayers({upper:{coverage:.5,pool:only('rect')},attic:{coverage:.5,pool:only('rect')}},{seed:11})));
 assert.ok(aligned.length>0&&aligned.length<full,`half coverage opens some cells (${aligned.length}/${full})`);
 const byCol=new Map<string,Set<number>>();for(const o of aligned)(byCol.get(col(o.id))??byCol.set(col(o.id),new Set()).get(col(o.id))!).add(storey(o.id));
 for(const [c,floors] of byCol)assert.equal([1,2].filter(f=>floors.has(f)).length%2,0,`aligned: column ${c} opens on both upper-layer storeys or neither`);
 let mixed=false;
 for(let seed=0;seed<8&&!mixed;seed++){const out=expand(withLayers({upper:{coverage:.5,pattern:'independent',pool:only('rect')},attic:{coverage:.5,pattern:'independent',pool:only('rect')}},{seed}));const n=new Map<string,number>();for(const o of upperOpenings(out))n.set(col(o.id),(n.get(col(o.id))??0)+1);mixed=[...n.values()].some(k=>k<3);}
 assert.ok(mixed,'independent: cells of one column open separately');
 const spaced=upperOpenings(expand(withLayers({upper:{spacing:1,pool:only('rect')},attic:{spacing:1,pool:only('rect')}})));
 assert.ok(spaced.length>0&&spaced.length<full,'spacing skips columns');
 const uniform=upperOpenings(expand(withLayers({upper:{uniformity:1,pool:['rect','arch','pointed'].map(id=>({id,weight:1})),pattern:'independent'}},{},[vol('main',{width:16,spanFloors:3})])));
 assert.equal(new Set(uniform.map(o=>o.shape)).size,1,'uniformity 1: one dominant type');
});

test('scoped rules: building < part < floor < region, later wins within a class',()=>{
 const parts=[vol('main',{width:14,spanFloors:4}),vol('wing',{x:8.5,z:-1,width:4,depth:6,spanFloors:3})];
 let r=recipe({...newFacadeRhythm('townhouse',2),layers:{upper:{pool:only('rect')},attic:{pool:only('rect')}}},parts);
 r=setRhythmLayer(r,[{partId:'wing'}],'upper',{pool:only('arch')});
 r=setRhythmLayer(r,[{fromFloor:2,toFloor:2}],'upper',{pool:only('pointed')});
 r=setRhythmLayer(r,[{fromFloor:1,toFloor:2}],'upper',{pool:only('tall')});
 const region={partId:'main',side:'north' as const,fromFloor:1,toFloor:3,x0:0,x1:6};
 r=setRhythmLayer(r,[region],'upper',{pool:only('round')});r=setRhythmLayer(r,[region],'attic',{pool:only('round')});
 assert.equal(validateStudio(r),null);
 const out=expand(r),d=design(r),at=(o:StudioFreeOpening)=>o.u*14;
 const wing1=out.freeOpenings.filter(o=>o.shapeId==='wing'&&storey(o.id)===1);
 assert.ok(wing1.length>0&&wing1.every(o=>o.shape==='rect'&&o.height>1.9),'floor rule (tall) beats the part rule on the wing');
 const south=face(out.freeOpenings,'main','south');
 assert.ok(south.filter(o=>storey(o.id)===2).every(o=>o.shape==='rect'&&o.height>1.9),'the later floor rule wins within the floor class');
 assert.ok(south.filter(o=>storey(o.id)===3).every(o=>o.shape==='rect'&&o.height<1.9),'the top storey keeps the building pool');
 const north=face(out.freeOpenings,'main','north').filter(o=>storey(o.id)>=1),inRegion=north.filter(o=>at(o)<6-.01);
 assert.ok(inRegion.length>0&&inRegion.every(o=>o.shape==='round'),'the region beats floor rules');
 assert.ok(north.filter(o=>at(o)>6.5).every(o=>o.shape!=='round'),'outside the region the floor/building pools apply');
 assert.deepEqual(resolveSculpt(r,d).studio!.inactive,[]);
 // Scope settings shown by the panel follow the same containment.
 const v=r.studio.facadeRhythm!;
 assert.equal(rhythmScopeSettings(v,{partId:'wing'}).layers.upper.pool[0].id,'arch');
 assert.equal(rhythmScopeSettings(v).layers.upper.pool[0].id,'rect');
 assert.equal(rhythmScopeSettings(v,{fromFloor:2,toFloor:2}).layers.upper.pool[0].id,'tall');
 const stale=expand(setRhythmLayer(r,[{partId:'gone'}],'upper',{coverage:.2}));assert.ok(stale.inactive.some(i=>i.id.includes('gone')));
 assert.equal(removeFacadeRhythmRule(r,0).studio.facadeRhythm!.rules!.length,v.rules!.length-1);
 // Several targets at once: one rule per wall in one edit.
 const multi=setRhythmLayer(r,[{partId:'main',side:'east'},{partId:'main',side:'west'}],'upper',{coverage:0});
 assert.equal(face(expand(multi).freeOpenings,'main','east').filter(o=>storey(o.id)>0&&storey(o.id)<3).length,0);
 assert.equal(face(expand(multi).freeOpenings,'main','west').filter(o=>storey(o.id)>0&&storey(o.id)<3).length,0);
});

test('manual fill (default): a placed window reserves its span; generated openings stay aligned around it',()=>{
 const base=recipe(newFacadeRhythm('townhouse',4),[vol('main',{width:16,spanFloors:4})]),d=design(base),gen=face(expand(base).freeOpenings,'main','north');
 const target=gen.find(o=>storey(o.id)===2)!,manual:StudioFreeOpening={id:'mine',shapeId:'main',side:'north',u:target.u,bottom:target.bottom,width:1.3,height:1.4,shape:'round'};
 const r={...base,studio:{...base.studio,freeOpenings:[manual]}},out=expand(r),north=face(out.freeOpenings,'main','north');
 assert.equal(out.faces.find(f=>f.side==='north')!.status,'generated','fill is the version-2 default');
 assert.ok(!north.some(o=>col(o.id)===col(target.id)&&storey(o.id)===2),'the reserved cell is left to the manual window');
 assert.ok(north.some(o=>col(o.id)===col(target.id)&&storey(o.id)!==2),'the same column still opens on the other storeys');
 assert.equal(north.length,gen.filter(o=>!(col(o.id)===col(target.id)&&storey(o.id)===2)).length,'only the overlapping cell is dropped');
 for(const o of north)assert.deepEqual(o,gen.find(x=>x.id===o.id),'surviving openings keep their grid position');
 const studio=resolveSculpt(r,d).studio!;assert.deepEqual(studio.inactive,[]);
 const groups=studio.freeFaces!.find(f=>f.id==='main/north')!.groups;
 assert.ok(groups.some(g=>g.members.includes('mine')));assert.ok(groups.every(g=>!g.members.includes('mine')||g.members.length===1),'the manual window never merges with generated ones');
 // A manual door replaces the generated street door; the storeys above keep their rhythm.
 const door:StudioFreeOpening={id:'door',shapeId:'main',side:'north',u:.2,bottom:0,width:1.3,height:2.4,shape:'arch'};
 const withDoor=expand({...base,studio:{...base.studio,freeOpenings:[door]}});
 assert.ok(!withDoor.faces.some(f=>f.shapeId==='main'&&f.door));assert.ok(face(withDoor.freeOpenings,'main','north').some(o=>storey(o.id)>0));
 // Keep this wall manual.
 const kept=setFacadeRhythmRule(r,{partId:'main',side:'north'},{manual:'own'}),keptOut=expand(kept);
 assert.equal(keptOut.faces.find(f=>f.side==='north')!.status,'manual');assert.equal(face(keptOut.freeOpenings,'main','north').length,0);
 assert.ok(face(keptOut.freeOpenings,'main','south').length>0);assert.equal(validateStudio(kept),null);
 // Unpacking a filled wall marks it manual so the rhythm does not also fill around the unpacked copies.
 const unpacked=materializeFacadeRhythm(r,d,{shapeId:'main',side:'north'});assert.ok('recipe' in unpacked);
 assert.ok(unpacked.recipe.studio.facadeRhythm!.rules!.some(x=>x.partId==='main'&&x.side==='north'&&x.manual==='own'));
 assert.deepEqual(resolveSculpt(unpacked.recipe,d).studio!.inactive,[]);
});

test('style presets fill the layer rules; applying a style clears overrides at that scope',()=>{
 const shop=rhythmLayerPreset('shopfront',.35,'ground');assert.equal(shop.pool[0].id,'shop');assert.equal(shop.pool[0].weight,1);
 assert.equal(rhythmLayerPreset('loft',.35,'upper').pool[0].id,'triple');assert.equal(rhythmLayerPreset('warehouse',.35,'upper').pool[0].id,'paired');
 assert.ok(rhythmLayerPreset('cottage',.5,'upper').coverage<1,'cottage presets leave blind bays');
 assert.equal(rhythmLayerPreset('civic',0,'upper').pool.length,1,'no variety: only the main shape');
 assert.ok(rhythmLayerPreset('townhouse',.35,'trims').pool.some(p=>p.id==='keystone'));
 const r=recipe(newFacadeRhythm('townhouse'),[vol('main',{width:14})]);
 let edited=setRhythmLayer(r,[],'upper',{pool:only('round')});edited=setRhythmLayer(edited,[{partId:'main'}],'ground',{coverage:.3});
 assert.equal(rhythmScopeSettings(edited.studio.facadeRhythm!).explicit.upper,true);
 const restyled=applyRhythmStyle(edited,[],'civic');
 assert.equal(restyled.studio.facadeRhythm!.style,'civic');assert.equal(restyled.studio.facadeRhythm!.layers,undefined,'the building preset drops building overrides');
 assert.equal(restyled.studio.facadeRhythm!.rules!.length,1,'scoped rules stay');
 const part=applyRhythmStyle(edited,[{partId:'main'}],'loft'),rule=part.studio.facadeRhythm!.rules![0];
 assert.equal(rule.style,'loft');assert.equal(rule.layers,undefined);
 assert.equal(rhythmScopeSettings(part.studio.facadeRhythm!,{partId:'main'}).layers.upper.pool[0].id,'triple','a scoped style resets inherited overrides');
 assert.ok(expand(part).faces.filter(f=>f.shapeId==='main').every(f=>f.style==='loft'));
 // Bay width re-lays the columns (all storeys stay aligned).
 const wide=expand(setFacadeRhythm(r,{bay:4})),narrow=expand(setFacadeRhythm(r,{bay:1.6}));
 assert.ok(wide.faces.find(f=>f.side==='north')!.columns<narrow.faces.find(f=>f.side==='north')!.columns);
});

test('per-layer reroll and locks; corners and trim pools',()=>{
 const r=withLayers({upper:{pool:['rect','arch','round'].map(id=>({id,weight:1})),uniformity:0,pattern:'independent'}});
 const v=r.studio.facadeRhythm!,one=shuffleFacadeRhythm(v,undefined,'upper');assert.deepEqual(one.layerSeeds,{upper:1});
 assert.deepEqual(shuffleFacadeRhythm({...v,locks:['upper']},undefined,'upper').layerSeeds,{},'a locked layer does not reroll');
 const before=expand(r),after=expand({...r,studio:{...r.studio,facadeRhythm:one}});
 assert.deepEqual(before.freeOpenings.filter(o=>storey(o.id)===0),after.freeOpenings.filter(o=>storey(o.id)===0),'ground untouched');
 assert.notDeepEqual(before.freeOpenings.filter(o=>storey(o.id)>0),after.freeOpenings.filter(o=>storey(o.id)>0),'upper rerolled');
 const corners=expand(withLayers({upper:{pool:only('rect')},attic:{pool:only('rect')},corners:{pool:only('round')}}));
 const north=upperOpenings(corners),n=corners.faces.find(f=>f.side==='north')!.columns,outer=['c0',`c${n-1}`];
 assert.ok(north.filter(o=>outer.includes(col(o.id))).length>0&&north.filter(o=>outer.includes(col(o.id))).every(o=>o.shape==='round'),'outer columns use the corners pool');
 assert.ok(north.filter(o=>!outer.includes(col(o.id))).every(o=>o.shape==='rect'));
 const trims=expand(withLayers({upper:{pool:only('rect')},attic:{pool:only('rect')},trims:{pool:[{id:'shutters',weight:1},{id:'hood',weight:1}],coverage:1}}));
 const ids=new Set(upperOpenings(trims).map(o=>o.id)),own=trims.freeTrims.filter(t=>ids.has(t.openingId));
 assert.ok(own.length>0&&own.every(t=>t.kinds.join()==='shutters,hood'),'trim pool: one kind per slot');
 assert.equal(expand(withLayers({trims:{coverage:0}})).freeTrims.length,0,'trim coverage 0');
});
