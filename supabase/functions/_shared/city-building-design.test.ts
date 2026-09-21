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

import { newDesign } from "../../../src/domain/cityBuildingV3.ts";
Deno.test("version three enforces stack and legal single-brand slots", () => {
  const d = newDesign("fixture");
  assert.equal(buildingDesignSchema.parse(d).version, 3);
  for (
    const patch of [
      { middleFloors: 7 },
      { generatorRevision: "unknown" },
      { slots: { "brand.roof": "brand", "brand.entrance": "brand" } },
      { slots: { "ground.left": "campaign" } },
      { slots: { "arbitrary.mesh": "brand" } },
      { facadeSeed: -1 },
    ]
  ) assert.throws(() => buildingDesignSchema.parse({ ...d, ...patch }));
  assert.equal(
    buildingDesignSchema.parse({
      ...d,
      blueprint: "office",
      roof: "pitched",
      slots: { "brand.roof": "brand" },
    }).version,
    3,
    "inactive but valid choices remain saved",
  );
});

import { parseProfile } from "./city.ts";
import { emptyCityProfile } from "../../../src/domain/city.ts";
Deno.test("shared profile parser preserves each recipe version and media ownership", () => {
  const uid = "11111111-1111-4111-8111-111111111111";
  const profile = {
    ...emptyCityProfile(),
    name: "Fixture",
    website: "https://example.com",
    description: "A building fixture",
  };
  for (
    const buildingDesign of [
      DEFAULT_BUILDING_DESIGN,
      DEFAULT_DESIGN_V2,
      newDesign(uid),
    ]
  ) {
    assert.deepEqual(
      parseProfile({ ...profile, buildingDesign }, uid).buildingDesign,
      buildingDesign,
    );
  }
  assert.throws(() =>
    parseProfile({
      ...profile,
      buildingDesign: newDesign(uid),
      logo: "another-account/logo.png",
    }, uid)
  );
});
