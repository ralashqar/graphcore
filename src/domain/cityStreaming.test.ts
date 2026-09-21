import test from "node:test";
import assert from "node:assert/strict";
import { entranceScale, streamRadius } from "./cityStreaming.ts";
test("streaming preloads more ground as the camera zooms out",()=>{
 assert.ok(streamRadius(1440,960,3)>streamRadius(1440,960,12));
 assert.ok(streamRadius(390,844,18)>=120);
 assert.ok(streamRadius(8000,8000,1)<=520);
});
test("entrances have one bounded overshoot and settle exactly",()=>{
 assert.equal(entranceScale(0),0); assert.equal(entranceScale(550),1); assert.equal(entranceScale(5000),1);
 const scales=Array.from({length:551},(_,i)=>entranceScale(i));
 assert.ok(Math.max(...scales)>1 && Math.max(...scales)<1.04);
 const peak=scales.indexOf(Math.max(...scales));
 assert.ok(scales.slice(1,peak+1).every((s,i)=>s>=scales[i]));
 assert.ok(scales.slice(peak+1).every((s,i)=>s<=scales[peak+i]));
});

import { residentDetails } from "./cityStreaming.ts";
import { test as residencyTest } from "node:test";
import { strict as residencyAssert } from "node:assert";
residencyTest("camera detail candidates cannot change an occupied building until whole-property eviction",()=>{
 const first=residentDetails(new Map(),new Map([["a","near"],["b","medium"]]));
 const panned=residentDetails(first,new Map([["a","far"],["b","near"],["c","medium"]]));
 residencyAssert.equal(panned.get("a"),"near");
 residencyAssert.equal(panned.get("b"),"medium");
 const evicted=residentDetails(panned,new Map([["b","far"]]));
 residencyAssert.ok(!evicted.has("a"));
 const returned=residentDetails(evicted,new Map([["a","medium"],["b","near"]]));
 residencyAssert.equal(returned.get("a"),"medium");
 residencyAssert.equal(returned.get("b"),"medium");
});

residencyTest("retained near buildings reserve the twelve-property detail budget",()=>{
 const old = new Map(Array.from({length:12},(_,i)=>[String(i),"near" as const]));
 const next = residentDetails(old,new Map([...old,["new","near"]]));
 residencyAssert.equal(next.get("new"),"medium");
 residencyAssert.equal([...next.values()].filter(v=>v==="near").length,12);
});
