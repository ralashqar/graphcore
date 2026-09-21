import test from "node:test";
import assert from "node:assert/strict";
import { driveStep,onCityRoad } from "./cityDriving.ts";
const input={forward:false,reverse:false,left:false,right:false,brake:false};
test("driving advances along roads, brakes and never enters plots",()=>{
 let s={x:0,z:33,heading:0,speed:0};
 for(let i=0;i<120;i++)s=driveStep(s,{...input,forward:true},1/60,330);
 assert.ok(s.z>45 && s.speed>0);
 for(let i=0;i<100;i++)s=driveStep(s,{...input,brake:true},1/60,330);
 assert.ok(s.speed<.001);
 for(let i=0;i<3000;i++) {
  s=driveStep(s,{...input,forward:true,left:true},1/60,330);
  assert.ok(onCityRoad(s.x,s.z,330));
 }
});
test("bounds and long frame deltas cannot teleport the car",()=>{
 const s={x:0,z:329,heading:0,speed:20};
 const next=driveStep(s,{...input,forward:true},5,330);
 assert.ok(next.z-s.z<=.800001);
 assert.ok(onCityRoad(next.x,next.z,330));
 assert.equal(driveStep({...s,z:330},{...input,forward:true},.04,330).speed,0);
});
