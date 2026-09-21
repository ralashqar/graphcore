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
