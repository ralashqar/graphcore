import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleSynarcKit,DEFAULT_SYNARC_KIT,isKitWallBay,paintSynarcKitBay,type KitWall} from './citySynarcKit.ts';
import {newDesign,resolveV3} from './cityBuildingV3.ts';
import {resolveSculpt,type SculptRecipe} from './citySculpt.ts';

const walls:KitWall[]=[
 {x:0,z:6,nx:0,nz:1,length:12,y:.65,height:3.6,floor:0},
 {x:0,z:-6,nx:0,nz:-1,length:12,y:.65,height:3.6,floor:0},
 {x:6,z:0,nx:1,nz:0,length:12,y:.65,height:3.6,floor:0},
 {x:-6,z:0,nx:-1,nz:0,length:12,y:.65,height:3.6,floor:0},
];

test('measured modules replace, rather than overlay, the entrance wall bay',()=>{
 const assembly=assembleSynarcKit(walls,DEFAULT_SYNARC_KIT);
 assert.equal(assembly.placements.filter(p=>p.part.endsWith('/door-residential')).length,1);
 assert.ok(assembly.entrance);
 assert.equal(assembly.infill.length,8); // four height bands and four closed corner extensions
 assert.ok(assembly.placements.filter(p=>p.part.includes('/window-')).every(p=>p.scaleX===1));
 assert.equal(assembly.placements.filter(p=>p.part.endsWith('/corner-convex')).length,4);
 assert.ok(assembly.placements.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
});

test('authored opening moves entrance and incompatible painted parts remain inactive',()=>{
 const candidate=assembleSynarcKit(walls,{
  ...DEFAULT_SYNARC_KIT,paints:[
   {id:'side',part:'door-shop',floor:0,x:6,z:0,nx:1,nz:0},
   {id:'window',part:'window-detailed',floor:0,x:0,z:6,nx:0,nz:1},
  ],
 });
 assert.ok(candidate.inactive.some(item=>item.id==='side'));
 assert.ok(candidate.placements.some(p=>p.part.endsWith('/window-detailed')));
 const changed=assembleSynarcKit(walls.map(w=>({...w,z:w.z+1})),{
  ...DEFAULT_SYNARC_KIT,paints:[{id:'stale',part:'canopy-long',floor:0,x:0,z:6,nx:0,nz:1}],
 });
 assert.ok(changed.inactive.some(item=>item.id==='stale'));
});

test('entrance accents flank and clear the door rather than covering its leaves',()=>{
 const base=assembleSynarcKit(walls,DEFAULT_SYNARC_KIT),door=base.entrance!;
 const result=assembleSynarcKit(walls,{...DEFAULT_SYNARC_KIT,paints:[
  {id:'columns',part:'entrance-column',floor:0,x:door.x,z:door.z,nx:0,nz:1},
  {id:'brand',part:'sign-band',floor:0,x:door.x,z:door.z,nx:0,nz:1},
 ]});
 const columns=result.placements.filter(p=>p.part.endsWith('/entrance-column'));
 assert.equal(columns.length,2);
 assert.ok(columns.every(p=>Math.hypot(p.x-door.x,p.z-door.z)>1.1));
 assert.ok(result.placements.some(p=>p.part.endsWith('/sign-band')&&p.y>walls[0].y+2.4));
 const window=base.placements.find(p=>p.part.endsWith('/window-single'))!;
 const invalid=assembleSynarcKit(walls,{...DEFAULT_SYNARC_KIT,paints:[
  {id:'blocked-buttress',part:'buttress',floor:0,x:window.x,z:window.z,
   nx:Math.sin(window.rotation),nz:Math.cos(window.rotation)},
 ]});
 assert.ok(invalid.inactive.some(item=>item.id==='blocked-buttress'));
});

test('preset and sculpt share the same original kit resolver',()=>{
 const d={...newDesign('synarc-test'),blueprint:'office' as const,width:12,depth:12,
  middleFloors:1,crown:'none' as const,synarcKit:structuredClone(DEFAULT_SYNARC_KIT)};
 const preset=resolveV3(d,'#c69a73');
 assert.ok(preset.synarcKitAssembly?.placements.length);
 assert.ok(preset.parts.some(p=>'fallback' in p&&p.fallback==='facade'));
 const sculpt:SculptRecipe={version:3,levels:[{floor:0,shapes:[{id:'main',kind:'rectangle',operation:'add',x:0,z:0,width:12,depth:12}]}],attachments:[]};
 const result=resolveSculpt(sculpt,d);
 assert.ok(result.kit?.placements.length);
 assert.ok(result.kit?.entrance);
});

test('tile painting replaces one legal bay, preserves entrance, and can clear overrides',()=>{
 const base=assembleSynarcKit(walls,DEFAULT_SYNARC_KIT);
 const door=base.placements.find(p=>p.part.endsWith('/door-residential'))!;
 const window=base.placements.find(p=>p.part.endsWith('/window-single')&&p.floor===0)!;
 assert.ok(isKitWallBay(door)&&isKitWallBay(window));
 const painted=paintSynarcKitBay(walls,DEFAULT_SYNARC_KIT,window,'window-detailed');
 assert.equal(painted.reason,null);
 assert.equal(painted.kit.paints.length,1);
 assert.ok(assembleSynarcKit(walls,painted.kit).placements.some(p=>p.x===window.x&&p.z===window.z&&p.part.endsWith('/window-detailed')));
 const changed=paintSynarcKitBay(walls,painted.kit,window,'wall-full');
 assert.equal(changed.reason,null);
 assert.equal(changed.kit.paints.length,1);
 assert.equal(changed.kit.paints[0].part,'wall-full');
 assert.equal(paintSynarcKitBay(walls,changed.kit,door,'window-paired').reason,'The entrance bay must keep a door.');
 assert.equal(paintSynarcKitBay(walls,changed.kit,window,'door-shop').reason,'Doors can only replace the street-facing entrance bay.');
 assert.equal(paintSynarcKitBay(walls,changed.kit,window,'balcony-slab').kit,changed.kit);
 const cleared=paintSynarcKitBay(walls,changed.kit,window,null);
 assert.equal(cleared.kit.paints.length,0);
});
