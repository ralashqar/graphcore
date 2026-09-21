import assert from "node:assert/strict";
import { buildingDesignSchema } from "./city-building-design-schema.ts";
import { DEFAULT_BUILDING_DESIGN } from "../../../src/domain/cityBuildingDesign.ts";
Deno.test("building designs reject unknown content and geometry outside bounds", () => {
  assert.deepEqual(
    buildingDesignSchema.parse(DEFAULT_BUILDING_DESIGN),
    DEFAULT_BUILDING_DESIGN,
  );
  for (
    const patch of [
      { floors: 999 },
      { width: 25 },
      { setback: -1 },
      { rotation: 4 },
      { version: 2 },
      { blueprint: "script" },
      { script: "alert(1)" },
    ]
  ) {
    assert.throws(() =>
      buildingDesignSchema.parse({ ...DEFAULT_BUILDING_DESIGN, ...patch })
    );
  }
});

import { DEFAULT_DESIGN_V2 } from "../../../src/domain/cityBuildingV2.ts";
Deno.test("version two is bounded and legacy remains valid", () => {
  assert.equal(buildingDesignSchema.parse(DEFAULT_DESIGN_V2).version, 2);
  for (
    const patch of [
      { depth: 50 },
      { groundHeight: 9 },
      { roof: "pitched", blueprint: "courtyard" },
      { palette: { wall: "url(x)" } },
      { finish: "upload" },
      { finish: "facade", width: 15 },
      { finish: "accents", depth: 11 },
      { seed: -1 },
      { script: "alert(1)" },
    ]
  ) {
    assert.throws(() =>
      buildingDesignSchema.parse({ ...DEFAULT_DESIGN_V2, ...patch })
    );
  }
});
