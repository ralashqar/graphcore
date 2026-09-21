import assert from "node:assert/strict";
import {buildingDesignSchema} from "./city-building-design-schema.ts";
import {DEFAULT_BUILDING_DESIGN} from "../../../src/domain/cityBuildingDesign.ts";
Deno.test("building designs reject unknown content and geometry outside bounds",()=>{
 assert.deepEqual(buildingDesignSchema.parse(DEFAULT_BUILDING_DESIGN),DEFAULT_BUILDING_DESIGN);
 for(const patch of [{floors:999},{width:25},{setback:-1},{rotation:4},{version:2},{blueprint:"script"},{script:"alert(1)"}]) assert.throws(()=>buildingDesignSchema.parse({...DEFAULT_BUILDING_DESIGN,...patch}));
});
