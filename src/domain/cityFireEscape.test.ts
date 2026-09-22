import {test} from "node:test";
import assert from "node:assert/strict";
import {newDesign,normalizeV3,resolveV3,massesV3} from "./cityBuildingV3.ts";
import {exposedWalls} from "./cityBuildingV2.ts";
import {fireEscape} from "./cityFireEscape.ts";
const design=()=>normalizeV3({...newDesign("escape"),blueprint:"office",width:12,depth:10,podium:false,crown:"none",middleFloors:3,finish:"facade",stairExtension:"fire-escape",slots:{},advertising:{placements:[],width:8,height:3,style:"image"}});
test("native fire escape connects floor-height landings through the roof",()=>{
 for(const middleFloors of [1,3,7])for(const groundHeight of [2.8,3.6,5]){
  const d=normalizeV3({...design(),middleFloors,groundHeight}),m=massesV3(d),r=resolveV3(d,"#778899");
  assert.equal(r.extensionReason,null);
  const stairs=r.attachments.filter(a=>a.role==="fire-escape");
  assert.equal(stairs.length,middleFloors+2);
  assert.equal(stairs[0].asset,"Prop_FireEscape_GroundAccess");
  assert.equal(stairs.at(-1)!.asset,"Prop_FireEscape_Top");
  const levels=[...new Set(m.map(m=>m.y))].sort((a,b)=>a-b).slice(1);levels.push(Math.max(...m.map(m=>m.y+m.height)));
  stairs.slice(1).forEach((a,i)=>assert.ok(Math.abs(a.position[1]+.125*a.axisScale![1]-levels[i])<.0001));
  assert.ok(!stairs.some(a=>a.asset.startsWith("Stairs_Entrance")));
  assert.equal(resolveV3(d,"#778899","far").attachments.filter(a=>a.role==="fire-escape").length,0);
 }
});
test("fire escape rejects setbacks, one storey and blocked plot space",()=>{
 assert.ok(resolveV3({...design(),middleFloors:0},"#778899").extensionReason);
 assert.ok(resolveV3({...design(),podium:true},"#778899").extensionReason);
 const m=massesV3(design());assert.ok(fireEscape(exposedWalls(m),m,[{position:[0,10,0],size:[24,40,24]}]).reason);
 assert.ok(resolveV3({...design(),width:20},"#778899").extensionReason);
});

 test("exported stair meshes stay inside their reserved plot envelope",async()=>{
 const {NodeIO}=await import("@gltf-transform/core");
 const doc=await new NodeIO().read("public/city/decorators/decorators.glb");
 for(const groundHeight of [2.8,5]) {
  const d=normalizeV3({...design(),groundHeight}),m=massesV3(d),r=fireEscape(exposedWalls(m),m,[]);
  assert.ok(r.bounds);
  for(const a of r.attachments){
   const node=doc.getRoot().listNodes().find(n=>n.getName()===a.asset);assert.ok(node);assert.ok(node.getMesh());
   for(const p of node.getMesh()!.listPrimitives()){
    const pos=p.getAttribute("POSITION")!;
    for(let i=0;i<pos.getCount();i++){
     const v=pos.getElement(i,[]),s=a.axisScale!,c=Math.cos(a.rotation),n=Math.sin(a.rotation);
     const world=[a.position[0]+c*v[0]*s[0]+n*v[2]*s[2],a.position[1]+v[1]*s[1],a.position[2]-n*v[0]*s[0]+c*v[2]*s[2]];
     for(let axis=0;axis<3;axis++)assert.ok(Math.abs(world[axis]-r.bounds.position[axis])<=r.bounds.size[axis]/2+.002,`${a.asset} axis ${axis}`);
    }
   }
  }
 }
});
