import test from "node:test";
import assert from "node:assert/strict";
import { partitionNativeWall } from "./cityNativeShell.ts";
test("native panels and openings partition the complete wall without overlaps",()=>{
 for(const length of [3,6,8,12,18])for(const height of [3,3.6,4.2]){
  const rects=partitionNativeWall(length,height,[],[{left:-.5,right:.5,bottom:0,top:2.2}]);
  assert.ok(Math.abs(rects.reduce((sum,r)=>sum+(r.right-r.left)*(r.top-r.bottom),0)-length*height)<1e-6);
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
   const a=rects[i],b=rects[j];assert.ok(Math.min(a.right,b.right)<=Math.max(a.left,b.left)+1e-6||Math.min(a.top,b.top)<=Math.max(a.bottom,b.bottom)+1e-6);
  }
 }
});
test("windows keep their dimensions and do not cover doorway reservations",()=>{
 const result=partitionNativeWall(12,3,[{center:-3,width:2},{center:0,width:2},{center:3,width:2}],[{left:-.5,right:.5,bottom:0,top:2.2}]);
 assert.equal(result.filter(r=>r.kind==="window").length,2);
 assert.ok(result.filter(r=>r.kind==="window").every(r=>r.right-r.left===2));
 assert.ok(Math.abs(result.reduce((sum,r)=>sum+(r.right-r.left)*(r.top-r.bottom),0)-36)<1e-6);
});

test("exported native corner returns meet straight panels on both faces at every floor height",async()=>{
 const {NodeIO}=await import("@gltf-transform/core");
 const {nativeCornerJoin,NATIVE_WALL_BACK}=await import("./cityNativeShell.ts");
 const document=await new NodeIO().read("public/city/decorators/decorators.glb");
 for(const name of ["Brick_Corner_Plain","WhiteBrick_Corner_Plain","Marble_Corner_Plain","Concrete_Corner"]){
  const mesh=document.getRoot().listNodes().find(n=>n.getName()===name)!.getMesh()!;
  const points=mesh.listPrimitives().flatMap(p=>{
   const position=p.getAttribute("POSITION")!;
   return Array.from({length:position.getCount()},(_,i)=>position.getElement(i,[]));
  });
  // Check exported geometry, not merely a guessed component bounding box.
  assert.ok(points.some(p=>Math.abs(p[0]+.8)<.001));
  assert.ok(points.some(p=>Math.abs(p[2]-1.8)<.001));
  for(const height of [2.4,3,3.6,4.2,5]){
   const {scale,outer,inset}=nativeCornerJoin(height);
   const originX=scale-outer,originZ=outer-2*scale;
   const innerX=originX-.8*scale,innerZ=originZ+1.8*scale;
   assert.ok(Math.abs(innerX+NATIVE_WALL_BACK)<1e-6);
   assert.ok(Math.abs(innerZ-NATIVE_WALL_BACK)<1e-6);
   assert.ok(Math.abs(originZ+inset)<1e-6,"corner end must meet reserved straight-panel interval");
   assert.ok(Math.abs(originX+scale-inset)<1e-6,"perpendicular return must meet its panel interval");
  }
 }
});
