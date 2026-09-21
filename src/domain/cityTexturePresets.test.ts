import {test} from "node:test";
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {CITY_TEXTURES, SELECTABLE_TEXTURE_IDS} from "./cityTexturePresets.ts";
import {groundsParts} from "./cityBuildingGrounds.ts";
test("checker is retired and all grass presets have packed material maps",()=>{
 assert.ok(!SELECTABLE_TEXTURE_IDS.some(id=>String(id)==="checker"));
 assert.equal(CITY_TEXTURES.checker.asset,CITY_TEXTURES.pavers.asset);
 assert.deepEqual(groundsParts({pavingPattern:"checker"},"near"),groundsParts({pavingPattern:"classic"},"near"));
 for(const id of ["grass-lawn","grass-meadow","grass-lush"] as const)
  for(const suffix of ["Color","Surface"]) assert.ok(existsSync(`public/city/textures/${CITY_TEXTURES[id].asset}-${suffix}.webp`));
});
