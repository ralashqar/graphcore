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

Deno.test("grounds and detail presets are bounded optional recipe choices", () => {
  const recipe = { ...newDesign("grounds-test"), enclosure: "garden-wall", pavingPattern: "checker", detailSet: "marble", detailScope: "crown" };
  assert.deepEqual(buildingDesignSchema.parse(recipe), recipe);
  for (const key of ["enclosure", "pavingPattern", "detailSet", "detailScope"]) {
    assert.throws(() => buildingDesignSchema.parse({...recipe, [key]: "custom-script"}));
  }
});

Deno.test("compact rectangular designs and bounded entrances round-trip", () => {
  const d = {...newDesign("kiosk"), blueprint: "office", width:8, depth:8, entranceStyle:"pediment"};
  assert.deepEqual(buildingDesignSchema.parse(d), d);
  assert.throws(() => buildingDesignSchema.parse({...d, blueprint:"courtyard"}));
  assert.throws(() => buildingDesignSchema.parse({...d, entranceStyle:"upload"}));
  assert.throws(() => buildingDesignSchema.parse({...d, width:7}));
});

Deno.test("archetypes validate massing and roof compatibility", () => {
  const d = {...newDesign("museum"), blueprint:"office", archetype:"museum", massing:"hall-wings", roofVariant:"sawtooth", roof:"flat"};
  assert.deepEqual(buildingDesignSchema.parse(d), d);
  for (const patch of [{width:8}, {blueprint:"courtyard"}, {archetype:"bank"}, {roof:"pitched"}, {massing:"custom"}]) assert.throws(() => buildingDesignSchema.parse({...d,...patch}));
});

Deno.test("advertising choices round-trip and reject unbounded or hidden-side placements",()=>{
 const d={...newDesign("ad-schema"),advertising:{placements:["facade-left","fence-right"],width:12,height:5,style:"image"}};
 assert.deepEqual(buildingDesignSchema.parse(d),d);
 for(const ad of [{...d.advertising,width:99},{...d.advertising,placements:["back"]},{...d.advertising,placements:["facade-left","facade-left"]},{...d.advertising,script:"x"}]) assert.equal(buildingDesignSchema.safeParse({...d,advertising:ad}).success,false);
});

Deno.test("texture choices round trip and reject arbitrary URLs",()=>{
 const d={...newDesign("textures"),textures:{wall:"brick",roof:"terracotta",ground:"pavers"}};
 assert.deepEqual((buildingDesignSchema.parse(d) as typeof d).textures,d.textures);
 assert.throws(()=>buildingDesignSchema.parse({...d,textures:{wall:"https://example.com/file"}}));
 assert.throws(()=>buildingDesignSchema.parse({...d,textures:{script:"bad"}}));
});
