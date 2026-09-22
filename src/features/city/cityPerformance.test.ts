import test from "node:test";
import assert from "node:assert/strict";
import {cachedCityDesign} from "./cityDesignCache.ts";
import {newDesign} from "../../domain/cityBuildingV3.ts";
import {cityRepresentation} from "../../domain/cityStreaming.ts";
test("whole-building detail has a hysteresis band and preserves active displacements",()=>{
 assert.equal(cityRepresentation("full",250,true),"full");
 assert.equal(cityRepresentation("simple",250,true),"simple");
 assert.equal(cityRepresentation("simple",300,true),"full");
 assert.equal(cityRepresentation("full",200,true),"simple");
 assert.equal(cityRepresentation("full",400,false),"hidden");
 assert.equal(cityRepresentation("full",100,false,true),"full");
});
test("cached assembly survives camera reads; editing creates a fresh recipe",()=>{
 const design=newDesign("performance-fixture"),before=JSON.stringify(design);
 const full=cachedCityDesign(design,"#987654","near");
 assert.strictEqual(cachedCityDesign(design,"#987654","near"),full);
 const simple=cachedCityDesign(design,"#987654","medium",true);
 assert.strictEqual(cachedCityDesign(design,"#987654","medium",true),simple);
 assert.notStrictEqual(full,simple);
 assert.equal(JSON.stringify(design),before);
 assert.notStrictEqual(cachedCityDesign({...design,facadeSeed:design.facadeSeed+1},"#987654","near"),full);
 assert.deepEqual(simple.signs,full.signs,"brand placement stays identical across detail levels");
});

test("sign-only reads do not retain an extra complete building assembly",async()=>{
 const {cachedCitySigns,hasCityDesign}=await import("./cityDesignCache.ts");
 const d=newDesign("sign-only"),signs=cachedCitySigns(d,"#556677",true);
 assert.ok(signs.length>0);
 assert.strictEqual(cachedCitySigns(d,"#556677",true),signs);
 assert.equal(hasCityDesign(d,"#556677","far",true),false);
});
