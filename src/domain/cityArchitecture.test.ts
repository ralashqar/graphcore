import test from "node:test";
import assert from "node:assert/strict";
import { architecture, FACADE } from "./cityArchitecture.ts";
test("all tiers and both L orientations preserve metre-sized facade proportions",()=>{
 for(let tier=0;tier<6;tier++) for(let variant=0;variant<2;variant++) {
  const near=architecture(tier,variant,true),far=architecture(tier,variant,false);
  for(const w of near.windows) { assert.equal(w.width,FACADE.windowWidth);assert.equal(w.height,FACADE.windowHeight); }
  for(const wing of near.wings) assert.equal(wing.height%3,0);
  assert.ok(far.windows.length<=near.windows.length);
  assert.ok(near.windows.length*2+48<600,"preset triangle budget");
  assert.ok(near.windows.length>0);
 }
});
