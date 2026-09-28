import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign} from './cityBuildingV3.ts';
import {resolveSculpt,type SculptVolume} from './citySculpt.ts';
import {freshStudio,studioFloorCount,validateStudio,paintStudioStroke,studioBays} from './cityStudio.ts';
import {buildStudioDetailBatches} from './cityStudioDetailBatches.ts';
import {finishKey,paintPartition,softLayers,SOFT_STEPS} from './cityStudioPaintGeometry.ts';
import {addPaintStroke,brushRect,fillPaintFace,paintBand,paintStripes,PAINT_REGIONS} from './cityStudioPaintRegions.ts';
import {brushSurface,decodeSurfaceKey,encodeSurfaceKey,fadePresetColor,finishRenderTexture,legacyPattern,matchFinish,paintRoomFloors,pendingFade,pushRecent,resolveFade,roomFloorSurface,setRoomFloorSurface,setStoreyFloorSurface,surfaceRender,tileFinish,validFloorSurface,validSurfaceSpec,validateInteriorSurfaces,type StudioSurfaceSpec} from './cityStudioSurfaces.ts';
import {herringbone,NUMERIC_OPS,patternsFor,samplePattern,SURFACE_PATTERN_IDS,SURFACE_PATTERNS,LEGACY_FLOOR_PATTERN} from './citySurfacePatterns.ts';
import {emptyInterior} from './cityStudioInteriors.ts';
import {pieceTexture,pieceTint} from './cityStudioPieceSurface.ts';
import {describeLandChange} from './cityLandHistory.ts';
import {validateModularBuilding} from './cityBuildingVariation.ts';
import {validateVariationRecipe} from './cityVariationValidation.ts';
import {TEXTURE_IDS} from './cityTexturePresets.ts';
import type {StudioFinish,StudioRecipe} from './cityStudioTypes.ts';
import type {LandDraft} from './cityLand.ts';

const volume=(patch:Partial<SculptVolume>={}):SculptVolume=>({id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:9,startFloor:0,spanFloors:2,...patch});
function fixture(){
 const r:StudioRecipe={version:5,volumes:[volume()],attachments:[],plotSize:24,studio:{...freshStudio(),freeOpenings:[{id:'d',shapeId:'main',side:'north',u:.5,bottom:0,width:1.3,height:2.5,shape:'arch'}] as never}};
 const design={...newDesign('surfaces'),groundHeight:3.4,floors:studioFloorCount(r),middleFloors:studioFloorCount(r)-1,crown:'none' as const,roof:'flat' as const};
 return {r,design};
}
const brick:StudioSurfaceSpec={pattern:'brick-flemish',scale:1.5,rotation:0,wear:.4,painted:.6,accent:'#dddddd'};

test('every pattern evaluates to finite outputs in range, numerically, across large coordinates',()=>{
 for(const id of SURFACE_PATTERN_IDS){const meta=SURFACE_PATTERNS[id];if(!('fn' in meta))continue;
  for(const [x,y] of [[0,0],[.37,1.91],[-3.3,7.2],[1234.5,-876.25],[4.01,.013]]){const o=samplePattern(id,x,y)!;
   for(const k of ['tone','accent','height','rough'] as const)assert.ok(Number.isFinite(o[k]),`${id}.${k} finite at ${x},${y}`);
   assert.ok(o.accent>=-1e-9&&o.accent<=1+1e-9&&o.rough>=0&&o.rough<=1&&o.tone>.2&&o.tone<1.8,`${id} in range ${JSON.stringify(o)}`);}}
 assert.deepEqual(patternsFor('floor').filter(id=>!id.startsWith('cc0')).length>=17,true,'floor library');
 for(const id of ['timber-planks','timber-herringbone','timber-chevron','timber-parquet','tile-square','tile-hex','tile-checker','tile-subway','terrazzo','stone-flags','concrete-polished','marble','carpet','rubber','cobbles','brick-paving','tatami'])assert.ok(patternsFor('floor').includes(id as never),id);
 for(const id of ['brick-stretcher','brick-flemish','brick-english','stone-ashlar','stone-rubble','render-stucco','weatherboard','shingles','timber-cladding','corrugated-metal','concrete-panel','glazed-tile','tokyo-tile'])assert.ok(patternsFor('wall').includes(id as never),id);
});

test('herringbone covers the plane exactly once (no gaps, no overlaps)',()=>{
 for(const n of [2,5])for(let i=0;i<4000;i++){const x=(Math.sin(i*12.9898)*43758.5453%1)*9-4.5,y=(Math.sin(i*78.233)*12345.678%1)*9-4.5,h=herringbone(NUMERIC_OPS,x,y,.1,n);
  assert.equal(h.found,1,`covered at ${x},${y} (n=${n})`);assert.ok(h.d>=-1e-9&&h.d<=.05+1e-9,'edge distance within half a plank width');}
});

test('surface spec validation: bounds, keys and fade',()=>{
 assert.ok(validSurfaceSpec(brick));assert.ok(validSurfaceSpec({pattern:'tatami'}));
 for(const bad of [{pattern:'glitter'},{pattern:'brick-flemish',scale:0},{pattern:'brick-flemish',scale:5},{pattern:'brick-flemish',rotation:360},{pattern:'brick-flemish',wear:1.2},{pattern:'brick-flemish',painted:-.1},{pattern:'brick-flemish',soft:3},{pattern:'brick-flemish',accent:'red'},{pattern:'brick-flemish',extra:1},{pattern:'brick-flemish',fade:{color:'#000000',y0:1,y1:1}},{pattern:'brick-flemish',fade:{color:'#000000',y0:-1,y1:1}},null,[]])
  assert.equal(validSurfaceSpec(bad),false,JSON.stringify(bad));
 assert.ok(validFloorSurface({pattern:'tatami',color:'#c8bd84',scale:2,rotation:90,wear:.2}));
 assert.equal(validFloorSurface({pattern:'weatherboard'}),false,'wall-only patterns are not floors');
 assert.equal(validFloorSurface({pattern:'tatami',painted:.5}),false,'floors take no paint');
});

test('render keys: tint, scale, wear and fade round-trip; plain finishes keep their texture id',()=>{
 const key=finishRenderTexture({color:'#123456',surface:brick},'#ffffff')!;
 assert.ok(key.startsWith('s:'));const d=decodeSurfaceKey(key)!;
 assert.deepEqual(d,{pattern:'brick-flemish',tint:'#123456',accent:'#dddddd',scale:1.5,rotation:0,wear:.4,painted:.6,fade:null});
 assert.equal(decodeSurfaceKey(finishRenderTexture({surface:{pattern:'marble'}},'#abcdef')!)!.tint,'#abcdef','family colour tints an uncoloured surface');
 const faded=encodeSurfaceKey(surfaceRender({pattern:'render-stucco',fade:{color:'#223322',y0:0,y1:1.2}},'#eeeeee'));assert.deepEqual(decodeSurfaceKey(faded)!.fade,{color:'#223322',y0:0,y1:1.2});
 // Old recipes: curated texture ids render exactly as before.
 for(const id of TEXTURE_IDS)assert.equal(finishRenderTexture({color:'#ffffff',texture:id}),id);
 assert.equal(finishRenderTexture(undefined),undefined);
 assert.notEqual(finishRenderTexture({color:'#123456',surface:{...brick,scale:2}}),key,'scale is part of the key');
 assert.equal(finishRenderTexture({color:'#123456',surface:{...brick,soft:1}}),key,'the soft edge is geometry, not material');
});

test('legacy ids migrate for display without changing stored data',()=>{
 assert.equal(legacyPattern('brick'),'cc0-brick');assert.equal(legacyPattern('checker'),'cc0-pavers');assert.equal(legacyPattern(''),null);
 assert.deepEqual(LEGACY_FLOOR_PATTERN,{timber:'timber-planks',tile:'tile-square',stone:'stone-flags'});
 const m=matchFinish({color:'#aa0000',texture:'brick'},'#ffffff');assert.deepEqual(m,{color:'#aa0000',texture:'brick',surface:null});
 const s=matchFinish({color:'#aa0000',surface:{...brick,soft:1,fade:{color:'#000000',y0:0,y1:1}}},'#ffffff');assert.deepEqual(s.surface,brick,'eyedropper takes material, colour and scale, not stroke-only parts');
});

test('fades resolve to the stroke extent; presets derive from the base colour',()=>{
 const f:StudioFinish={color:'#e0d0c0',surface:{pattern:'render-stucco',fade:pendingFade({color:'#445544',from:'bottom'})}};
 assert.deepEqual(resolveFade(f,.2,1.4).surface!.fade,{color:'#445544',y0:.2,y1:1.4});
 assert.deepEqual(resolveFade({...f,surface:{...f.surface!,fade:pendingFade({color:'#ffffff',from:'top'})}},3,6).surface!.fade,{color:'#ffffff',y0:6,y1:3});
 const band=paintBand(fixture().r,{shapeId:'main',side:'north',channel:'wall',y0:0,y1:1.2,finish:f,id:'damp'});
 assert.deepEqual(band.studio.paintRegions![0].finish.surface!.fade,{color:'#445544',y0:0,y1:1.2});assert.equal(validateStudio(band),null);
 const stroke=addPaintStroke(fixture().r,{shapeId:'main',side:'north',channel:'wall',rects:[brushRect(2,2,1)],finish:f,id:'s'});
 assert.deepEqual(stroke.studio.paintRegions![0].finish.surface!.fade,{color:'#445544',y0:1.5,y1:2.5});
 assert.notEqual(fadePresetColor('#e0d0c0','damp'),'#e0d0c0');assert.ok(parseInt(fadePresetColor('#806040','sun').slice(1,3),16)>0x80,'sun fading lightens');
 assert.equal(tileFinish(f).surface!.fade,undefined,'kit tiles and rules drop the fade');
 assert.equal(validateStudio(paintStudioStroke(fixture().r,[studioBays(fixture().r,fixture().design)[0].anchor],'spot','wall',f)),'A painted finish is invalid.','tile paint rejects an unresolved fade');
});

test('stencilled stripes: one region, bounded rects, horizontal bands or vertical stripes',()=>{
 const {r}=fixture(),f={color:'#223344'};
 const h=paintStripes(r,{shapeId:'main',side:'north',channel:'wall',y0:1,y1:2,length:12,width:.2,gap:.2,direction:'horizontal',finish:f,id:'h'});
 assert.equal(h.studio.paintRegions!.length,1);assert.equal(h.studio.paintRegions![0].rects.length,3);assert.equal(h.studio.paintRegions![0].band,true);
 const v=paintStripes(r,{shapeId:'main',side:'north',channel:'wall',y0:0,y1:3,length:12,width:.3,gap:.3,direction:'vertical',finish:f,id:'v'});
 assert.equal(v.studio.paintRegions![0].rects.length,20);assert.ok(v.studio.paintRegions![0].rects.every(q=>q[2]===0&&q[3]===3));
 const many=paintStripes(r,{shapeId:'main',side:'north',channel:'wall',y0:0,y1:3,length:500,width:.02,gap:.02,direction:'vertical',finish:f});
 assert.ok(many.studio.paintRegions![0].rects.length<=PAINT_REGIONS.rects);assert.equal(validateStudio(v),null);
});

test('soft brush: stepped feather rings composite colour over what is below, keeping crisp strips',()=>{
 const layer={finish:{color:'#ff0000',surface:{pattern:'render-stucco' as const,soft:.3}},rects:[[2,4,2,4] as [number,number,number,number]]};
 const rings=softLayers(layer);assert.equal(rings.length,SOFT_STEPS);assert.equal(rings.at(-1)!.opacity,undefined,'the stroke itself is opaque');
 assert.ok(rings[0].rects[0][0]<2-.19&&rings[0].opacity!<.5);
 const p=paintPartition(8,6,[layer],{color:'#0000ff'},'#0000ff')!;
 const colours=new Set(p.slots.map(s=>s.finish.color));assert.equal(colours.size,SOFT_STEPS,'core plus two blended rings');
 assert.ok([...colours].some(c=>c!=='#ff0000'&&c!=='#0000ff'),'a blended colour exists');
 for(const s of p.strips)for(let k=1;k<s.runs.length;k++)assert.equal(s.runs[k].x0,s.runs[k-1].x1,'runs tile each strip');
 // Opaque layers behave as before.
 const opaque=paintPartition(8,6,[{finish:{color:'#ff0000'},rects:[[2,4,2,4]]}],{color:'#0000ff'})!;assert.equal(opaque.slots.length,1);
});

test('resolved buildings: surface finishes route into keyed wall batches (tint in key, painted, worn, faded)',()=>{
 const {r,design}=fixture();
 let next=addPaintStroke(r,{shapeId:'main',side:'north',channel:'wall',rects:[brushRect(2,1.5,1)],finish:{color:'#aa3322',surface:brick},id:'s'});
 next=paintBand(next,{shapeId:'main',side:'north',channel:'wall',y0:0,y1:1,finish:{color:'#dddddd',surface:{pattern:'render-stucco',fade:pendingFade({color:'#556655',from:'bottom'}),soft:.2}},id:'b'});
 assert.equal(validateStudio(next),null);
 const d=buildStudioDetailBatches(resolveSculpt(next,design).studio!),keys=d.batches.filter(b=>b.material.kind==='wall').map(b=>(b.material as {texture:string}).texture);
 assert.ok(keys.some(k=>k.startsWith('s:brick-flemish|#aa3322|#dddddd|1.5|0|0.4|0.6|')),keys.join(' '));
 assert.ok(keys.some(k=>k.startsWith('s:render-stucco|')&&decodeSurfaceKey(k)!.fade?.y1===1),'faded band');
 // Part finish with a surface: the whole face and the kit channel keys.
 const part:StudioRecipe={...next,studio:{...next.studio,parts:{main:{finishes:{wall:{color:'#8899aa',surface:{pattern:'weatherboard',scale:1.2}}}}}}};
 assert.equal(validateStudio(part),null);
 const wall=buildStudioDetailBatches(resolveSculpt(part,design).studio!).batches.find(b=>b.material.kind==='wall'&&(b.material as {texture:string}).texture.startsWith('s:weatherboard'));assert.ok(wall,'part surface batch');
 const piece={family:'warm-brick' as const,finishes:{wall:{color:'#8899aa',surface:{pattern:'weatherboard' as const}}}};
 assert.ok(pieceTexture(piece,'wall')!.startsWith('s:weatherboard|#8899aa'));assert.equal(pieceTint(piece,'wall'),'#ffffff','surface tints travel in the key');
 assert.equal(pieceTint({family:'warm-brick',finishes:{wall:{color:'#123456'}}},'wall'),'#123456');
 assert.ok(validateStudio({...part,studio:{...part.studio,parts:{main:{finishes:{wall:{surface:{pattern:'weatherboard',soft:.5}}}}}}}),'part finishes take no stroke-only fields');
 // Fill wall carries the finish; finishKey separates parameters.
 assert.notEqual(finishKey({surface:{pattern:'marble'}}),finishKey({surface:{pattern:'marble',scale:2}}));
 assert.equal(fillPaintFace(next,{shapeId:'main',side:'north',channel:'wall',height:6,finish:{color:'#000000',surface:{pattern:'tokyo-tile'}},id:'f'}).studio.paintRegions!.length,1);
});

test('floor finishes: per-room surfaces, storey defaults, legacy finishes and resolved rooms',()=>{
 const r6={...fixture().r,version:6 as const,interior:{...emptyInterior(),partitions:[{id:'p',floor:0,a:[3,-4.5] as [number,number],b:[3,4.5] as [number,number]}]}};
 const {design}=fixture(),resolve=(x:StudioRecipe)=>resolveSculpt(x,design).studio!;
 const levels=resolve(r6).interiorLevels!,rooms=levels[0].rooms;assert.equal(rooms.length,2);
 assert.equal(levels[0].roomSurfaces[0].surface,undefined,'no surface: the legacy flat finish');
 let next=setStoreyFloorSurface(r6,0,{pattern:'timber-herringbone',color:'#a07850',scale:1.2});
 next=setRoomFloorSurface(next,rooms[0],0,{pattern:'tatami'});
 assert.equal(validateStudio(next),null);
 const again=resolve(next).interiorLevels!;assert.equal(again[0].floorSurface!.pattern,'timber-herringbone');
 const at=(x:number)=>{const room=again[0].rooms.find(q=>Math.sign(q.x-3)===Math.sign(x-3))!;return again[0].roomSurfaces.find(q=>q.id===room.id)?.surface?.pattern;};
 assert.equal(at(rooms[0].x),'tatami');assert.equal(at(rooms[1].x),'timber-herringbone','other rooms take the storey default');
 assert.ok(!again[0].rooms.some(q=>q.id===rooms[0].id&&rooms[0].id.startsWith('room/')&&again[0].roomSurfaces.find(x=>x.id===q.id)?.surface?.pattern==='tatami'),'painted rooms take a fresh intent id');
 // A room with a legacy finish keeps its flat material; setting a surface replaces it.
 const legacy={...next,interior:{...next.interior,roomFinishes:[...next.interior.roomFinishes!.filter(x=>x.id!==rooms[1].id),{id:rooms[1].id,floor:0,x:rooms[1].x,z:rooms[1].z,floorFinish:'stone' as const}]}};
 assert.equal(roomFloorSurface(legacy.interior,0,rooms[1].id),undefined);
 const painted=paintRoomFloors(legacy,resolve(legacy).interiorLevels![0].rooms,0,{pattern:'marble'});assert.ok(painted.interior.roomFinishes!.every(x=>x.floorSurface?.pattern==='marble'&&x.floorFinish===undefined));
 assert.equal(setStoreyFloorSurface(next,0,null).interior.floorSurfaces,undefined);
 assert.ok(validateInteriorSurfaces({floorFinish:'timber',floorSurfaces:[{floor:0,surface:{pattern:'brick-flemish'}}]}),'wall pattern on a floor');
 assert.ok(validateInteriorSurfaces({floorFinish:'timber',floorSurfaces:[{floor:0,surface:{pattern:'marble'}},{floor:0,surface:{pattern:'marble'}}]}),'duplicate storeys');
 // Undo labels: one labelled step per surface change.
 const draft=(sculpt:StudioRecipe)=>({name:'x',sculpt,design,nature:[]} as unknown as LandDraft);
 assert.equal(describeLandChange(draft(r6),draft(next)),'Floor finish');
 const {r}=fixture();assert.equal(describeLandChange(draft(r),draft(paintBand(r,{shapeId:'main',side:'north',channel:'wall',y0:0,y1:1,finish:{color:'#000000'}}))),'Paint');
});

test('business imports and profiles reject surface fields; the studio accepts them',()=>{
 const {r}=fixture(),base={...r,studio:{...r.studio,freeOpenings:undefined,catalogue:'synarc-kit-5' as const}};
 const withPart={...base,studio:{...base.studio,parts:{main:{finishes:{wall:{color:'#8899aa',surface:{pattern:'weatherboard' as const}}}}}}};
 assert.equal(validateStudio(withPart),null);
 assert.ok(validateVariationRecipe(JSON.parse(JSON.stringify(withPart)),2),'business import rejects a surface finish');
 assert.equal(validateModularBuilding({version:1,template:'t',recipe:withPart}),false,'profile schema rejects a surface finish');
 const plain={...base,studio:{...base.studio,parts:{main:{finishes:{wall:{color:'#8899aa',texture:'brick'}}}}}};
 assert.equal(validateVariationRecipe(JSON.parse(JSON.stringify(plain)),2),null,'plain finishes still import');
 const v6={...base,version:6 as const,interior:{...emptyInterior(),floorSurfaces:[{floor:0,surface:{pattern:'tatami' as const}}]}};
 assert.equal(validateStudio(v6),null);
 assert.ok(validateVariationRecipe(JSON.parse(JSON.stringify(v6)),2,24,true),'interior presets reject storey floor surfaces');
 const room={...base,version:6 as const,interior:{...emptyInterior(),roomFinishes:[{id:'r',floor:0,x:1,z:1,floorSurface:{pattern:'tatami' as const}}]}};
 assert.ok(validateVariationRecipe(JSON.parse(JSON.stringify(room)),2,24,true),'interior presets reject room floor surfaces');
});

test('recents keep the newest unique finishes',()=>{
 const id=(f:StudioFinish)=>JSON.stringify(f);let list:StudioFinish[]=[];
 for(const c of ['#111111','#222222','#111111','#333333'])list=pushRecent(list,{color:c},id,3);
 assert.deepEqual(list.map(f=>f.color),['#333333','#111111','#222222']);
});

test('brush surfaces omit defaults and keep a pending fade until painted',()=>{
 assert.deepEqual(brushSurface('tatami',{scale:1,rotation:0,wear:0,painted:0,soft:0},null),{pattern:'tatami'});
 const s=brushSurface('brick-flemish',{accent:'#ffffff',scale:1.5,rotation:45,wear:.2,painted:.5,soft:.3},{color:'#334433',from:'bottom'});
 assert.deepEqual({...s,fade:undefined},{pattern:'brick-flemish',accent:'#ffffff',scale:1.5,rotation:45,wear:.2,painted:.5,soft:.3,fade:undefined});
 assert.equal(validSurfaceSpec(s),false,'a pending fade is not storable');assert.ok(validSurfaceSpec(resolveFade({surface:s},0,2).surface));
});
