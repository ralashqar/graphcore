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
