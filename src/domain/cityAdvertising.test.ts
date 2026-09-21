import test from "node:test";
import assert from "node:assert/strict";
import { AD_PLACEMENTS, DEFAULT_ADVERTISING, advertisingLayout } from "./cityAdvertising.ts";
import { COMPOSITIONS, applyComposition, newDesign, massesV3, buildingSlots, resolveV3 } from "./cityBuildingV3.ts";
test("adverts face only the two visible sides and stay inside the plot for all presets and rotations",()=>{
 let active=0;
 for(let i=0;i<COMPOSITIONS.length;i++) for(const rotation of [0,1,2,3] as const) for(const id of AD_PLACEMENTS) {
  const d={...applyComposition(newDesign("ads"),i),rotation,advertising:{...DEFAULT_ADVERTISING,placements:[id],width:18,height:24}};
  const layout=advertisingLayout(d,massesV3(d),buildingSlots(d));
  for(const sign of layout.signs) {
   active++;
   const angle=sign.rotation+rotation*Math.PI/2;
   assert.ok(Math.sin(angle)>-.001 && Math.cos(angle)>-.001);
   assert.ok(sign.width>0 && sign.height>0);
  }
  for(const part of layout.parts) {
   assert.ok(Math.abs(part.position[0])+part.size[0]/2<11.75);
   assert.ok(Math.abs(part.position[2])+part.size[2]/2<11.75);
   assert.ok(part.size.every(v=>v>0));
  }
 }
 assert.ok(active>150);
});
test("unavailable placements persist and old recipes produce no extra adverts",()=>{
 const d={...newDesign("ad-state"),blueprint:"office" as const,roof:"pitched" as const,advertising:{...DEFAULT_ADVERTISING,placements:["roof-left" as const]}};
 const fit=advertisingLayout(d,massesV3(d),buildingSlots(d)).fits.find(f=>f.id==="roof-left")!;
 assert.ok(fit.selected && fit.reason);
 assert.ok(!resolveV3(newDesign("old"),"#445566").signs.some(s=>s.advertisement));
});

test("upper facade above a wider podium remains eligible for a large advert",()=>{
 const d={...applyComposition(newDesign("podium-ad"),1),advertising:{...DEFAULT_ADVERTISING,placements:["facade-left" as const],width:18,height:24}};
 const fit=advertisingLayout(d,massesV3(d),buildingSlots(d)).fits.find(f=>f.id==="facade-left")!;
 assert.equal(fit.reason,null);
 assert.ok(fit.height>6 && fit.width>8);
});
