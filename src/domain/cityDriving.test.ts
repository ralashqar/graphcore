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
 assert.ok(driveStep({...s,z:330},{...input,forward:true},.04,330).speed>0);
});

test("curbs preserve momentum and steer the car back into the road",()=>{
 const s={x:4.99,z:33,heading:Math.PI/4,speed:12};
 const next=driveStep(s,{...input,forward:true},.04,330);
 assert.ok(next.x<5 && next.z>s.z);
 assert.ok(next.speed>=s.speed);
 assert.ok(next.heading<s.heading);
});

test("head-on and reverse curb contact recover while staying on roads",()=>{
 for(const speed of [12,-8]) {
  let s={x:4.99,z:33,heading:speed>0?Math.PI/2:-Math.PI/2,speed};
  const controls={...input,forward:speed>0,reverse:speed<0};
  for(let i=0;i<180;i++) {
   s=driveStep(s,controls,1/60,330);
   assert.ok(onCityRoad(s.x,s.z,330));
   assert.ok(Math.abs(s.speed)>1);
  }
  assert.ok(Math.hypot(s.x-4.99,s.z-33)>5);
 }
});

test("reverse input brakes first and steering builds progressively",()=>{
 const start={x:0,z:33,heading:0,speed:12};
 const reverse=driveStep(start,{...input,reverse:true},1/60,330);
 assert.ok(reverse.speed>0 && reverse.speed<start.speed);
 const turn=driveStep(start,{...input,left:true},1/120,330);
 assert.ok(turn.steering!>0 && turn.steering!<.1);
 const coast=driveStep(start,input,1/60,330);
 assert.ok(coast.speed>11.8);
 const stopped=driveStep({...start,speed:0},{...input,left:true},1/60,330);
 assert.equal(stopped.heading,0);
});
