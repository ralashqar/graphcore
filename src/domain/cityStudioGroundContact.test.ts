// Ground contact and plot-ground walking (docs/city-ground-contact.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLandWorld,initialLandDraft,landProperty} from './cityLand.ts';
import {upgradeStudio} from './cityStudio.ts';
import {studioExample,STUDIO_EXAMPLES} from './cityStudioExamples.ts';
import {resolveSculpt} from './citySculpt.ts';
import {upgradeStudioInterior} from './cityStudioInteriors.ts';
import {buildSculptCityBake} from './citySculptCityBake.ts';
import {FOUNDATION_BOTTOM,PLOT_GROUND,foundationVertices,minY,offsetRing} from './cityGroundContact.ts';
import {DEFAULT_PLOT_GROUND,PLOT_STEP_UP,isGroundPart,plotGroundHeight,type PlotGroundProfile} from './cityPlotGround.ts';
import {plotGroundProfile} from './cityPlotGroundProfile.ts';
import {newDesign,applyComposition,COMPOSITIONS,resolveCurrent} from './cityBuildingV3.ts';
import {DEFAULT_SYNARC_KIT} from './citySynarcKit.ts';
import {createModularDesign} from './cityModularBuilding.ts';
import {buildingMasses,buildingParts,DEFAULT_BUILDING_DESIGN,type CityBuildingDesign} from './cityBuildingDesign.ts';
import {upgradeDesign} from './cityBuildingV2.ts';
import {StudioWalkingCollision} from './cityStudioCollision.ts';
import {DriveWorld,pavementHeight,syncCityDriveWorld} from './cityDriveWorld.ts';
import {WalkingWorld,advanceFoot,createFootState} from './cityExploration.ts';
import type {StudioRecipe} from './cityStudioTypes.ts';

const plot=createLandWorld([],400,48).plots[0];
const example=(i:number)=>studioExample(upgradeStudio(initialLandDraft(plot),plot.size)!,i,plot.size);
/** Highest walkable grounds top under a local point, as drawn (paving patterns and kit pads included). */
const drawnGroundTop=(d:CityBuildingDesign,x:number,z:number)=>Math.max(...buildingParts(d,'#fff').filter(p=>p.kind==='box'&&isGroundPart(p)&&p.position[1]+p.size[1]/2<.45&&Math.abs(x-p.position[0])<=p.size[0]/2&&Math.abs(z-p.position[2])<=p.size[2]/2).map(p=>p.position[1]+p.size[1]/2));
const ringBounds=(v:number[])=>{let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(let i=0;i<v.length;i+=3){x0=Math.min(x0,v[i]);x1=Math.max(x1,v[i]);z0=Math.min(z0,v[i+2]);z1=Math.max(z1,v[i+2]);}return {x0,x1,z0,z1};};

test('every studio example starts at the datum and gets a foundation from below the plot surface',()=>{
 for(let i=0;i<STUDIO_EXAMPLES.length;i++){
  const d=example(i),r=resolveSculpt(d.sculpt!,d.design),s=r.studio!,name=STUDIO_EXAMPLES[i].name;
  assert.equal(r.floors[0].bottom,PLOT_GROUND.datum,`${name}: ground-floor datum`);
  assert.ok(Math.min(...s.pieces.map(p=>p.y))>=PLOT_GROUND.datum-1e-9||s.pieces.some(p=>p.module.startsWith('stair')),`${name}: kit pieces start at the datum`);
  const f=foundationVertices(r.floors[0].polygons);assert.ok(f.length>=18,`${name}: foundation geometry`);
  const top=Math.max(...f.filter((_,k)=>k%3===1));
  assert.ok(minY(f)<PLOT_GROUND.surface-.1&&minY(f)===FOUNDATION_BOTTOM,`${name}: skirt below the surface`);
  assert.equal(top,PLOT_GROUND.datum,`${name}: plinth reaches the datum`);
  // The plinth wraps the whole ground floor (outset) and reaches below every drawn ground top under it.
  const b=ringBounds(f),fp=r.floors[0].polygons.flatMap(p=>p[0]);
  assert.ok(b.x0<Math.min(...fp.map(v=>v[0]))&&b.x1>Math.max(...fp.map(v=>v[0]))&&b.z0<Math.min(...fp.map(v=>v[1]))&&b.z1>Math.max(...fp.map(v=>v[1])),`${name}: plinth encloses the footprint`);
  const property=landProperty(plot,d).profile.buildingDesign!;
  assert.ok(minY(f)<drawnGroundTop(property,b.x0+.2,b.z0+.2)-.05,`${name}: skirt below the drawn ground`);
 }
});
test('the city bake carries the foundation in its always-drawn envelope, in world space',()=>{
 const d=example(0),r=resolveSculpt(d.sculpt!,d.design),bake=buildSculptCityBake(r,undefined,{design:d.design,transform:{x:100,z:-50,rotation:Math.PI/2,scale:2}});
 const surface=bake.batches.find(b=>b.key==='surface|none')!;let low=Infinity;
 for(let i=0;i<surface.envelope;i++)low=Math.min(low,surface.positions[surface.indices[i]*3+1]);
 assert.ok(Math.abs(low-FOUNDATION_BOTTOM*2)<1e-5,`envelope reaches ${low}`);
});
test('interior floors, door landings and doorsteps meet the datum consistently',()=>{
 const d=example(43),r6=upgradeStudioInterior(d.sculpt as StudioRecipe),r=resolveSculpt(r6,d.design).studio!;
 const interior=r.decks.find(k=>k.id.startsWith('interior/0'))!,landings=r.decks.filter(k=>k.id.endsWith('/landing'));
 assert.ok(Math.abs(interior.y-(PLOT_GROUND.datum+.04))<1e-9,'walkable ground floor sits on the slab above the datum');
 assert.ok(landings.length>0&&landings.every(k=>Math.abs(k.y-interior.y)<1e-9),'door landings are level with the floor');
 for(const p of (r.portals??[]).filter(p=>p.floor===0))assert.ok(Math.abs(p.y-PLOT_GROUND.datum)<.05,`door ${p.id} threshold at the datum`);
 // Doorstep ramps start at or below the plot surface, so they meet the ground rather than floating.
 for(const k of r.decks.filter(k=>k.id.startsWith('entry/')&&!k.id.endsWith('/landing')))assert.ok(k.y<=PLOT_GROUND.surface,`${k.id} starts at the ground`);
});
test('business buildings of every kind have a foundation reaching below their drawn ground',()=>{
 const base=newDesign('ground');
 const designs:[string,CityBuildingDesign][]=[['v1',DEFAULT_BUILDING_DESIGN],['v2',upgradeDesign(DEFAULT_BUILDING_DESIGN)],['v3',base],
  ...COMPOSITIONS.map((c,i)=>[`v3 ${c.name}`,applyComposition(base,i)] as [string,CityBuildingDesign]).filter(([,d])=>(d as {generatorRevision?:string}).generatorRevision!=='city-office-4'),
  ['v3 facade',{...base,finish:'facade'}],['v3 kit tiles',{...base,synarcKit:DEFAULT_SYNARC_KIT}],['modular',createModularDesign(base,0)],['modular 8',createModularDesign(base,8)]];
 for(const [name,d] of designs){
  const parts=buildingParts(d,'#fff'),masses=buildingMasses(d),datum=Math.min(...masses.map(m=>m.y));
  assert.equal(datum,PLOT_GROUND.datum,`${name}: datum`);
  for(const m of masses.filter(m=>m.y===datum)){
   const ground=drawnGroundTop(d,m.x,m.z);
   const covers=parts.some(p=>!isGroundPart(p)&&(p.kind==='box'?Math.abs(m.x-p.position[0])<=p.size[0]/2+.01&&Math.abs(m.z-p.position[2])<=p.size[2]/2+.01&&p.position[1]-p.size[1]/2<ground-.05&&p.position[1]+p.size[1]/2>=datum-1e-6
    :p.kind==='mesh'&&!!p.vertices&&minY(p.vertices)<ground-.05&&Math.max(...p.vertices.filter((_,k)=>k%3===1))>=datum-1e-6));
   assert.ok(covers,`${name}: a foundation fills from below the ground (${ground}) to the datum under mass ${m.x},${m.z}`);
  }
 }
});
test('saved designs are not rewritten by the correction',()=>{
 const d=example(9),before=JSON.stringify(d);resolveSculpt(d.sculpt!,d.design);plotGroundProfile(landProperty(plot,d).profile.buildingDesign);assert.equal(JSON.stringify(d),before);
 const m=createModularDesign(newDesign('m'),3),saved=JSON.stringify(m);resolveCurrent(m,'#fff','near');assert.equal(JSON.stringify(m),saved);
});
test('foundation offsets outer rings outward and courtyard holes into the hole',()=>{
 const square:[number,number][]=[[-1,-1],[1,-1],[1,1],[-1,1]];
 for(const ring of [square,[...square].reverse()]){const o=offsetRing(ring,.1);assert.ok(o.every(p=>Math.abs(Math.abs(p[0])-1.1)<1e-9&&Math.abs(Math.abs(p[1])-1.1)<1e-9));const h=offsetRing(ring,.1,true);assert.ok(h.every(p=>Math.abs(Math.abs(p[0])-.9)<1e-9));}
 // Side faces point outwards: a triangle's normal agrees with its centre's direction from the middle.
 const v=foundationVertices([[square]]);let outward=0,up=0;
 for(let i=0;i<v.length;i+=9){const a=[v[i],v[i+1],v[i+2]],b=[v[i+3],v[i+4],v[i+5]],c=[v[i+6],v[i+7],v[i+8]],e1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],e2=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],n=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];
  if(Math.abs(n[1])>1e-9){assert.ok(n[1]>0,'the cap faces up');up++;continue;}const cx=(a[0]+b[0]+c[0])/3,cz=(a[2]+b[2]+c[2])/3;assert.ok(n[0]*cx+n[2]*cz>0,'side faces outwards');outward++;}
 assert.equal(outward,8);assert.equal(up,2);
});

// ---- Walking on plots ----
const X=33,Z=33;// a block centre on the pavement grid (roads every 66 m)
function studioPlot(i=0,enclosure?:'none'){
 const d=example(i),r=resolveSculpt(d.sculpt!,d.design),design=landProperty(plot,d).profile.buildingDesign!,ground=plotGroundProfile(enclosure?{...design,enclosure} as CityBuildingDesign:design);
 const drive=new DriveWorld(1e4);syncCityDriveWorld(drive,[{id:'plot',x:0,z:0}],()=>X,48);
 const walk=new WalkingWorld(drive);walk.studio.set({id:'plot',x:X,z:Z,rotation:0,scale:2,result:r.studio!,ground});
 return {d,r,ground,walk,drive};
}
const w=(x:number,z:number)=>({x:X+2*x,z:Z+2*z});
const idle={forward:false,reverse:false,left:false,right:false,walk:false};
const step=1/60;
function walkTo(walk:WalkingWorld,s:ReturnType<typeof createFootState>,target:{x:number;z:number},seconds=8){
 const trace:number[]=[];for(let i=0;i<seconds/step;i++){const dx=target.x-s.x,dz=target.z-s.z;if(Math.hypot(dx,dz)<.15)break;advanceFoot(s,{...idle,forward:true,walk:true},Math.atan2(dx,dz),step,walk);trace.push(s.y);}return trace;
}

test('the plot profile follows the drawn grounds: pads, garden wall and gate opening',()=>{
 const {ground}=studioPlot();
 assert.equal(plotGroundHeight(ground,0,0),PLOT_GROUND.surface,'surface');
 assert.ok(Math.abs(plotGroundHeight(ground,0,11.6)!-PLOT_GROUND.kerb)<1e-9,'kerb ring');
 assert.equal(plotGroundHeight(ground,0,12.5),null,'off the plot');
 assert.ok(ground.walls.length>=12,'garden wall, caps and gate posts');
 const gate=ground.walls.filter(b=>Math.abs(b.z-11.05)<.01);assert.ok(gate.every(b=>Math.abs(b.x)-b.width/2>=2.1),'the gate opening stays clear (4.2 m local between post caps)');
 const open=plotGroundProfile({...landProperty(plot,example(0)).profile.buildingDesign!,enclosure:'none'} as CityBuildingDesign);assert.equal(open.walls.length,0,'an open boundary has no walls');
 assert.deepEqual(plotGroundProfile(undefined),DEFAULT_PLOT_GROUND);
});
test('the walker stands on the pavement, kerb, surface and path at their real heights',()=>{
 const {walk}=studioPlot();const c=walk.studio;
 assert.ok(Math.abs(c.ground(w(3.5,16).x,w(3.5,16).z,.5)-pavementHeight(w(3.5,16).x,w(3.5,16).z))<1e-9,'pavement');
 assert.ok(Math.abs(c.ground(w(3.5,11.6).x,w(3.5,11.6).z,.6)-PLOT_GROUND.kerb*2)<1e-9,'kerb');
 assert.ok(Math.abs(c.ground(w(3.5,9).x,w(3.5,9).z,.8)-PLOT_GROUND.surface*2)<1e-9,'surface');
 assert.ok(c.ground(w(0,9).x,w(0,9).z,.8)>PLOT_GROUND.surface*2+.1,'the entrance path is raised above the surface');
});
test('kerbs are stepped up and down automatically; the walker never sinks into the plot',()=>{
 const {walk}=studioPlot(0,'none');const s=createFootState(w(3.5,12.9).x,w(3.5,12.9).z,Math.PI);
 const up=walkTo(walk,s,w(3.5,9));assert.ok(Math.hypot(s.x-w(3.5,9).x,s.z-w(3.5,9).z)<.2,`reached the plot (${(s.x-X)/2},${(s.z-Z)/2} y ${s.y})`);
 assert.ok(Math.abs(s.y-PLOT_GROUND.surface*2)<1e-9&&s.grounded);
 assert.ok(up.some(y=>Math.abs(y-PLOT_GROUND.kerb*2)<1e-9),'stood on the kerb on the way');
 for(let i=1;i<up.length;i++)assert.ok(up[i]>=up[i-1]-1e-9&&up[i]-up[i-1]<=PLOT_STEP_UP,'monotonic, step-sized rises');
 const down=walkTo(walk,s,w(3.5,12.9));assert.ok(Math.abs(s.y-.18)<1e-9&&s.grounded,`back on the pavement (${(s.z-Z)/2} y ${s.y} ${s.grounded})`);
 for(let i=1;i<down.length;i++)assert.ok(down[i-1]-down[i]<=PLOT_STEP_UP,'stepped down, not dropped');
});
test('the garden wall blocks and the gate and entrance path stay walkable',()=>{
 const {walk,r}=studioPlot();
 let s=createFootState(w(-8,13).x,w(-8,13).z,Math.PI);walkTo(walk,s,w(-8,9),4);
 assert.ok(s.z>w(0,11.05).z+.3,`the front wall stops the walker (${(s.z-Z)/2} local)`);
 s=createFootState(w(12.6,0).x,w(12.6,0).z,-Math.PI/2);walkTo(walk,s,w(9,0),4);
 assert.ok(s.x>w(11.05,0).x+.3,'the side wall stops the walker');
 // Through the gate, along the path, to the door landing.
 const e=r.entrance!;s=createFootState(w(0,14).x,w(0,14).z,Math.PI);walkTo(walk,s,w(0,10.4));
 assert.ok(Math.hypot(s.x-w(0,10.4).x,s.z-w(0,10.4).z)<.2,'through the gate');
 walkTo(walk,s,w(e.x,e.z+1.6));assert.ok(Math.hypot(s.x-w(e.x,e.z+1.6).x,s.z-w(e.x,e.z+1.6).z)<.2,'along the path');
 walkTo(walk,s,w(e.x,e.z+.6));assert.ok(s.y>=(PLOT_GROUND.datum+.04)*2-.05,`up the doorstep onto the landing (${s.y})`);
});
test('ledges taller than a step block; low ones do not',()=>{
 const tall:PlotGroundProfile={walls:[],pads:[...DEFAULT_PLOT_GROUND.pads,{id:'plinth',x:0,y:.4,z:0,width:4,height:.3,depth:4,rotation:0}]};
 const c=new StudioWalkingCollision(),result={bays:[],pieces:[],blockers:[],decks:[],inactive:[],roof:[],roofNotes:[]};
 c.set({id:'p',x:0,z:0,rotation:0,scale:2,result,ground:tall});
 assert.ok(c.sweep(0,.5,-8,0,6,.34).t<1,'a 0.6 m ledge blocks a walker on the surface');
 assert.equal(c.sweep(0,1.1,-8,0,6,.34).t,1,'from the ledge height it is walkable');
 assert.equal(c.sweep(0,.18,-26,0,6,.34).t,1,'the kerb does not block from the pavement');
 assert.equal(c.clear(0,.5,-3,.34),false);assert.equal(c.clear(0,.5,-6,.34),true);
});
test('driving is unchanged: cars stay off plots while walkers enter studio plots',()=>{
 const {walk,drive}=studioPlot();
 assert.equal(drive.clear(X,Z+15,2),false,'the car collider still covers the plot');
 walk.elevation=PLOT_GROUND.surface*2;assert.equal(walk.clear(w(3.5,9).x,w(3.5,9).z),true,'the walker may stand on the plot surface');
 const car=drive.sweep(X,Z+30,0,-10,1.1);assert.ok(car.t<1,'a car driving in stops at the plot');
});
