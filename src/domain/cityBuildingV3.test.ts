import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  applyComposition,
  buildingSlots,
  classifyCorners,
  COMPOSITIONS,
  massesV3,
  newDesign,
  normalizeV3,
  overlaps,
  resolveV3,
} from "./cityBuildingV3.ts";
import { DEFAULT_DESIGN_V2, resolveDesign } from "./cityBuildingV2.ts";
test("all compositions and shape extremes have supported floors and bounded parts", () => {
  for (let i = 0; i < COMPOSITIONS.length; i++) {
    for (
      const blueprint of ["office", "terraces", "courtyard", "l-shape"] as const
    ) {
      for (const finish of ["procedural", "accents", "facade"] as const) {
        for (const width of [12, 18]) {
          for (const depth of [10, 18]) {
            for (const total of [1, 8]) {
              const preset = applyComposition(newDesign("fixture"), i),
                d = normalizeV3({
                  ...preset,
                  blueprint,
                  finish,
                  width,
                  depth,
                  middleFloors: total === 1 ? 0 : 6,
                  crown: total === 1 ? "none" : "recessed",
                  crownSetback: 2,
                });
              const r = resolveV3(d, "#335577");
              assert.equal(new Set(r.masses.map((m) => m.y)).size, d.floors);
              for (const p of r.parts) {
                assert.ok(p.size.every((v) => v > 0));
                assert.ok(Math.abs(p.position[0]) + p.size[0] / 2 <= 12);
                assert.ok(Math.abs(p.position[2]) + p.size[2] / 2 <= 12);
              }
              for (
                const m of r.masses.filter((m) => m.y > .65)
              ) {
                assert.ok(
                  r.masses.some((s) =>
                    Math.abs(s.y + s.height - m.y) < .001 &&
                    m.x - m.width / 2 >= s.x - s.width / 2 - .001 &&
                    m.x + m.width / 2 <= s.x + s.width / 2 + .001 &&
                    m.z - m.depth / 2 >= s.z - s.depth / 2 - .001 &&
                    m.z + m.depth / 2 <= s.z + s.depth / 2 + .001
                  ),
                  "unsupported upper floor",
                );
              }
              const active = r.slots.filter((s) => s.active);
              for (let a = 0; a < active.length; a++) {
                for (let b = a + 1; b < active.length; b++) {
                  assert.ok(!overlaps(active[a], active[b]));
                }
              }
            }
          }
        }
      }
    }
  }
});
test("corners distinguish courtyards and exterior corners", () => {
  const corners = classifyCorners(
    massesV3({ ...newDesign("a"), blueprint: "courtyard" }),
  );
  assert.ok(corners.some((c) => c.kind === "convex"));
  assert.ok(corners.some((c) => c.kind === "concave"));
});
test("unavailable roof sign selection survives shape changes and reactivates", () => {
  const d = normalizeV3({
    ...newDesign("a"),
    blueprint: "office",
    roof: "pitched",
    slots: { "brand.roof": "brand" },
  });
  assert.equal(
    buildingSlots(d).find((s) => s.id === "brand.roof")!.active,
    false,
  );
  assert.equal(
    buildingSlots(d).find((s) => s.id === "brand.roof")!.selected,
    "brand",
  );
  assert.equal(
    buildingSlots({ ...d, roof: "flat" }).find((s) => s.id === "brand.roof")!
      .active,
    true,
  );
});
test("scoped seeds preserve shape, branding and the other subsystem", () => {
  const d = {
    ...newDesign("a"),
    finish: "facade" as const,
    rhythm: "alternating" as const,
  };
  const r = resolveV3(d, "#335577"),
    facade = resolveV3({ ...d, facadeSeed: d.facadeSeed + 1 }, "#335577"),
    grounds = resolveV3({ ...d, groundsSeed: d.groundsSeed + 1 }, "#335577");
  assert.deepEqual(r, resolveV3(d, "#335577"));
  assert.deepEqual(r.masses, facade.masses);
  assert.deepEqual(r.masses, grounds.masses);
  assert.deepEqual(r.slots, facade.slots);
  assert.deepEqual(r.signs, grounds.signs);
  assert.deepEqual(
    r.attachments.filter((a) => a.role === "facade"),
    grounds.attachments.filter((a) => a.role === "facade"),
  );
  assert.notDeepEqual(r.parts, facade.parts);
  assert.notDeepEqual(r.slots, grounds.slots);
});
test("composition preserves brand palette and version two geometry retains the slab-overlap correction", () => {
  const d = newDesign("a");
  assert.deepEqual(applyComposition(d, 2).palette, d.palette);
  assert.equal(
    createHash("sha256").update(
      JSON.stringify(resolveDesign(DEFAULT_DESIGN_V2, "#335577")),
    ).digest("hex"),
    "e1e1c70dba6136c6185b8a087a68184d637e86a2a1e6c826a7a8e2e4c92ea6b8",
  );
});

test("optional attachment groups remain within declared envelopes and actual native bounds", async () => {
  const { readFileSync } = await import("node:fs");
  const catalog = JSON.parse(
    readFileSync(
      new URL("../../public/city/decorators/manifest.json", import.meta.url),
      "utf8",
    ),
  ).assets;
  for (
    const blueprint of ["office", "courtyard", "l-shape", "terraces"] as const
  ) {
    for (const width of [12, 18]) {
      for (const depth of [10, 18]) {
        const d = normalizeV3({
          ...newDesign("slots"),
          blueprint,
          width,
          depth,
          finish: "facade",
          density: "full",
          slots: {
            "brand.roof": "brand",
            "campaign.side": "campaign",
            "canopy.entrance": "canopy",
            "ground.left": "planter",
            "ground.right": "bollards",
            "terrace.left": "planter",
            "terrace.right": "planter",
          },
        });
        const r = resolveV3(d, "#335577"),
          active = r.slots.filter((s) => s.active);
        for (let a = 0; a < active.length; a++) {
          for (let b = a + 1; b < active.length; b++) {
            assert.ok(!overlaps(active[a], active[b]));
          }
        }
        for (const a of r.attachments) {
          const [w, , dep] = catalog[a.asset].size,
            c = Math.cos(a.rotation),
            s = Math.sin(a.rotation);
          for (const x of [-w / 2, w / 2]) {
            for (const z of [0, dep]) {
              assert.ok(Math.abs(a.position[0] + x * c + z * s) < 11.8);
              assert.ok(Math.abs(a.position[2] + z * c - x * s) < 11.8);
            }
          }
        }
        for (const tree of r.parts.filter((p) => p.kind === "tree")) {
          assert.ok(
            active.some((s) =>
              s.selected === "planter" &&
              tree.position.every((v, i) =>
                Math.abs(v - s.position[i]) + tree.size[i] <=
                  s.size[i] / 2 + .001
              )
            ),
            "tree exceeds its reserved slot",
          );
        }
      }
    }
  }
});

test("procedural recessed panes have no solid wall overlapping their opening",()=>{
 const d=newDesign("recess-test");d.finish="procedural";
 const parts=resolveV3(d,"#506b58","near").parts;
 const panes=parts.filter(p=>p.color===d.palette.glass && Math.min(p.size[0],p.size[2])===.04);
 assert.ok(panes.length>0);
 for(const pane of panes) {
  const walls=parts.filter(p=>p.color===d.palette.wall);
  for(const wall of walls) assert.ok(![0,1,2].every(axis=>Math.abs(wall.position[axis]-pane.position[axis])<(wall.size[axis]+pane.size[axis])/2-.001));
 }
});

test("clean procedural windows do not add projecting vertical frame bars",()=>{
 const d=newDesign("clean-windows");d.finish="procedural";
 const parts=resolveV3(d,"#506b58","near").parts;
 assert.equal(parts.filter(p=>p.color===d.palette.trim && ((p.size[0]===.1 && p.size[2]===.16)||(p.size[0]===.16 && p.size[2]===.1))).length,0);
});

test("native architectural details are scoped and restricted to near view",()=>{
 for(const architecture of ["brick","creative","boutique","glass"] as const) {
  const d={...newDesign("native-details"),architecture,finish:"facade" as const,detailScope:"all" as const,roof:"parapet" as const};
  const near=resolveV3(d,"#445566","near");
  assert.ok(near.attachments.some(a=>a.role==="column"));
  assert.ok(near.attachments.some(a=>a.role==="cornice"));
  assert.ok(!resolveV3(d,"#445566","medium").attachments.some(a=>["column","cornice"].includes(a.role)));
  assert.ok(!resolveV3({...d,finish:"procedural"},"#445566").attachments.some(a=>["column","cornice"].includes(a.role)));
  const entrance=resolveV3({...d,detailScope:"entrance"},"#445566");
  assert.ok(entrance.attachments.filter(a=>a.role==="column").every(a=>a.position[1]<1));
 }
});

test("stairs fit side walls, preserve selections when blocked and reserve solid backing",()=>{
 const d={...newDesign("stairs"),width:12,depth:10,finish:"facade" as const,stairExtension:"concrete" as const,solidSideWalls:true,slots:{}};
 const r=resolveV3(d,"#445566");
 assert.equal(r.extensionReason,null);
 assert.equal(r.attachments.filter(a=>a.role==="stairs").length,1);
 assert.ok(r.attachments.some(a=>a.role==="facade" && a.asset.includes("Plain")));
 const blocked=resolveV3({...d,finish:"procedural"},"#445566");
 assert.ok(blocked.extensionReason);
 assert.ok(!blocked.attachments.some(a=>a.role==="stairs"));
 assert.ok(!resolveV3(d,"#445566","far").attachments.some(a=>a.role==="stairs"));
});
