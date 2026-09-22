import test from "node:test";
import assert from "node:assert/strict";
import {cityLightMode} from "./cityRenderMode.ts";
test("light mode defaults on with explicit comparison and deployment overrides",()=>{
 assert.equal(cityLightMode(""),true);
 assert.equal(cityLightMode("?demo=1"),true);
 assert.equal(cityLightMode("?cityLight=0"),false);
 assert.equal(cityLightMode("","false"),false);
 assert.equal(cityLightMode("?cityLight=1","false"),true);
});
