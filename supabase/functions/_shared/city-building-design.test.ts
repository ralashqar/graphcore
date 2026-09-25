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
 const d={...newDesign("textures"),textures:{wall:"brick",roof:"terracotta",ground:"pavers",wallBorder:"primary",groundBorder:"concrete"}};
 assert.deepEqual((buildingDesignSchema.parse(d) as typeof d).textures,d.textures);
 assert.throws(()=>buildingDesignSchema.parse({...d,textures:{wall:"https://example.com/file"}}));
 assert.throws(()=>buildingDesignSchema.parse({...d,textures:{script:"bad"}}));
 assert.throws(()=>buildingDesignSchema.parse({...d,textures:{groundBorder:"https://example.com"}}));
 assert.throws(()=>buildingDesignSchema.parse({...d,textures:{wall:"primary"}}));
});

Deno.test("native side wall and stair settings persist and reject unknown assets",()=>{
 const d={...newDesign("stairs"),solidSideWalls:true,stairExtension:"marble"};
 assert.deepEqual(buildingDesignSchema.parse(d),d);
 assert.throws(()=>buildingDesignSchema.parse({...d,stairExtension:"external-model"}));
});
import { NATIVE_FACADE_IDS } from "../../../src/domain/cityNativeFacades.ts";
Deno.test("curated native facade selections survive profile validation and reject arbitrary models",()=>{
 const owner="11111111-1111-4111-8111-111111111111";
 for(const nativeFacade of NATIVE_FACADE_IDS){
  const recipe={...newDesign("catalogue"),nativeFacade};
  const parsed=buildingDesignSchema.parse(recipe);
  assert.equal(parsed.version,3);
  assert.equal("nativeFacade" in parsed ? parsed.nativeFacade : undefined,nativeFacade);
  const profile=parseProfile({...emptyCityProfile(),name:"Catalogue",website:"https://example.com",description:"Native facade fixture",buildingDesign:recipe},owner);
  assert.equal(profile.buildingDesign && "nativeFacade" in profile.buildingDesign ? profile.buildingDesign.nativeFacade : undefined,nativeFacade);
 }
 assert.throws(()=>buildingDesignSchema.parse({...newDesign("catalogue"),nativeFacade:"../../custom.glb"}));
 const legacy={...newDesign("catalogue")};delete legacy.nativeFacade;
 assert.equal("nativeFacade" in buildingDesignSchema.parse(legacy),false);
});

Deno.test("architectural kit choices survive public recipe validation and reject executable or unknown data",()=>{
 const owner="11111111-1111-4111-8111-111111111111";
 const recipe={...newDesign("architecture"),architecturalKit:{corners:"matching" as const,roofline:"classical" as const,entrance:"grand-marble" as const,frontage:"cafe" as const,roof:"slate-dormers" as const,connectedPlanters:true,stairRails:true,ornaments:true,rooftopUnits:false}};
 assert.deepEqual(buildingDesignSchema.parse(recipe),recipe);
 const profile=parseProfile({...emptyCityProfile(),name:"Kit",website:"https://example.com",description:"Architectural assemblies",buildingDesign:recipe},owner);
 assert.deepEqual(profile.buildingDesign && "architecturalKit" in profile.buildingDesign ? profile.buildingDesign.architecturalKit : undefined,recipe.architecturalKit);
 for(const kit of [{roof:"external-url"},{entrance:"Door_99"},{script:"alert(1)"},{rooftopUnits:1}])assert.equal(buildingDesignSchema.safeParse({...recipe,architecturalKit:kit}).success,false);
});

Deno.test("grass textures and legacy checker recipes remain valid", () => {
 for (const ground of ["grass-lawn", "grass-meadow", "grass-lush", "checker"]) {
  const recipe = {...newDesign("grass"), textures: {ground}};
  assert.deepEqual(buildingDesignSchema.parse(recipe), recipe);
 }
});

Deno.test("multi-storey exterior stairs persist independently from entrance steps",()=>{
 const recipe={...newDesign("escape"),stairExtension:"fire-escape"};
 assert.deepEqual(buildingDesignSchema.parse(recipe),recipe);
});
Deno.test("connected shell recipes and all compositions survive the shared save boundary", async () => {
 const {COMPOSITIONS,applyComposition,newDesign}=await import("../../../src/domain/cityBuildingV3.ts");
 for(let i=0;i<COMPOSITIONS.length;i++){
  const d=applyComposition(newDesign("validation"),i);
  assert.deepEqual(buildingDesignSchema.parse(d),d,COMPOSITIONS[i].name);
 }
 const legacy={...newDesign("old"),generatorRevision:"city-grammar-1"};
 const parsed=buildingDesignSchema.parse(legacy);
 assert.ok(parsed.version===3);
 if(parsed.version===3)assert.equal(parsed.generatorRevision,"city-grammar-1");
 assert.throws(()=>buildingDesignSchema.parse({...legacy,generatorRevision:"unknown"}));
});
Deno.test("window families and spiral access survive strict recipe validation",async()=>{
 const {newDesign}=await import("../../../src/domain/cityBuildingV3.ts");
 const {WINDOW_FAMILIES}=await import("../../../src/domain/cityWindowFamilies.ts");
 for(const windowFamily of WINDOW_FAMILIES)for(const stairExtension of ["spiral","straight"]){
  const design={...newDesign("details"),windowFamily,stairExtension};
  assert.deepEqual(buildingDesignSchema.parse(design),design);
 }
 assert.throws(()=>buildingDesignSchema.parse({...newDesign("details"),windowFamily:"untrusted-model"}));
});
Deno.test("curated door recipes round-trip and reject unknown styles",async()=>{
 const {newDesign}=await import("../../../src/domain/cityBuildingV3.ts");
 const {DOOR_FAMILIES,DOOR_SURROUNDS}=await import("../../../src/domain/cityProceduralEntrances.ts");
 for(const doorFamily of DOOR_FAMILIES)for(const doorSurround of DOOR_SURROUNDS){const d={...newDesign("doors"),doorFamily,doorSurround,doorTransom:true};assert.deepEqual(buildingDesignSchema.parse(d),d);}
 assert.throws(()=>buildingDesignSchema.parse({...newDesign("doors"),doorFamily:"external-script"}));
});

Deno.test("connected residential recipes round-trip and reject unsafe assembly inputs",async()=>{
 const {COMPOSITIONS,applyComposition,newDesign}=await import("../../../src/domain/cityBuildingV3.ts");
 for(let i=0;i<COMPOSITIONS.length;i++)if(COMPOSITIONS[i].patch.base==="residential"){
  const d=applyComposition(newDesign("home"),i);assert.deepEqual(buildingDesignSchema.parse(d),d);
  assert.throws(()=>buildingDesignSchema.parse({...d,connectedArchitecture:{roofPitch:90}}));
  assert.throws(()=>buildingDesignSchema.parse({...d,connectedArchitecture:{dormers:20}}));
  assert.throws(()=>buildingDesignSchema.parse({...d,generatorRevision:"city-shell-2"}));
 }
});

Deno.test("connected office presets round trip and reject incompatible revisions/options",async()=>{
 const {COMPOSITIONS,applyComposition,newDesign}=await import("../../../src/domain/cityBuildingV3.ts");
 for(let i=0;i<COMPOSITIONS.length;i++)if(COMPOSITIONS[i].patch.generatorRevision==="city-office-4"){
  const d=applyComposition(newDesign("office-schema"),i);assert.deepEqual(buildingDesignSchema.parse(d),d);
  assert.equal(buildingDesignSchema.safeParse({...d,generatorRevision:"city-shell-2"}).success,false);
  assert.equal(buildingDesignSchema.safeParse({...d,officeArchitecture:{bridgeFloor:99}}).success,false);
  assert.equal(buildingDesignSchema.safeParse({...d,officeArchitecture:{script:"bad"}}).success,false);
 }
});


import {createModularDesign} from '../../../src/domain/cityModularBuilding.ts';
Deno.test('modular variation profiles are strict, revision-pinned and round-trip all templates',()=>{
 for(let i=0;i<24;i++){const d=createModularDesign(newDesign('schema-variation'),i);assert.deepEqual(buildingDesignSchema.parse(JSON.parse(JSON.stringify(d))),JSON.parse(JSON.stringify(d)));}
 const d=createModularDesign(newDesign('schema-variation'),8);
 for(const change of [(v:any)=>v.generatorRevision='city-shell-2',(v:any)=>delete v.modular,(v:any)=>v.modular.recipe.studio.arbitrary=true,(v:any)=>v.modular.recipe.volumes[0].spanFloors=99,(v:any)=>v.modular.recipe.studio.variation.layers.ground.pool=[{id:'remote-module',weight:1}],(v:any)=>v.upperHeight=8,(v:any)=>v.modular.recipe.studio.openings[0].anchor.side='invalid']){const n=structuredClone(d);change(n);assert.equal(buildingDesignSchema.safeParse(n).success,false);}
});
