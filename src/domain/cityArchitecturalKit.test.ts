import { test } from "node:test";
import assert from "node:assert/strict";
import { newDesign, normalizeV3, resolveV3 } from "./cityBuildingV3.ts";
import { KIT_DIMENSIONS } from "./cityKitDimensions.ts";
import {
  attachmentBounds,
  KIT_ENTRANCES,
  KIT_FRONTAGES,
  KIT_ROOFLINES,
  kitEntrance,
} from "./cityArchitecturalKit.ts";
const fixture = () =>
  normalizeV3({
    ...newDesign("kit-test"),
    finish: "facade",
    blueprint: "office",
    width: 14,
    depth: 10,
    middleFloors: 1,
    crown: "none",
    nativeFacade: "brick-classic",
    slots: {},
    architecturalKit: {
      corners: "matching",
      roofline: "classical",
      entrance: "wood",
      frontage: "cafe",
      roof: "slate-dormers",
      ornaments: true,
      stairRails: true,
    },
  });
test("kit variants remain finite, bounded and use exported components across footprints and heights", () => {
  for (
    const blueprint of ["office", "terraces", "courtyard", "l-shape"] as const
  ) {
    for (const width of [12, 18]) {
      for (const groundHeight of [3, 4.5]) {
        for (
          const architecture of [
            "brick",
            "glass",
            "creative",
            "boutique",
          ] as const
        ) {
          const d = normalizeV3({
            ...fixture(),
            blueprint,
            width,
            depth: width,
            groundHeight,
            architecture,
            nativeFacade: "automatic",
          });
          const r = resolveV3(d, "#567865");
          for (const a of r.attachments) {
            assert.ok(KIT_DIMENSIONS[a.asset], a.asset);
            assert.ok(
              [...a.position, ...(a.axisScale || [a.scale])].every(
                Number.isFinite,
              ),
            );
            if (
              [
                "roof",
                "cornice",
                "ornament",
                "equipment",
                "frontage",
                "planter-run",
              ].includes(a.role)
            ) {
              const b = attachmentBounds(a);
              assert.ok(
                Math.abs(b.position[0]) + b.size[0] / 2 <= 11.501,
                a.asset + " x",
              );
              assert.ok(
                Math.abs(b.position[2]) + b.size[2] / 2 <= 11.501,
                a.asset + " z",
              );
            }
          }
          assert.deepEqual(r, resolveV3(d, "#567865"));
        }
      }
    }
  }
});
test("every entrance has one frame owner and the selected leaves, with complete fallback ownership", () => {
  for (const entrance of KIT_ENTRANCES.filter((e) => e !== "existing")) {
    const d = fixture();
    d.architecturalKit = { entrance };
    const r = resolveV3(d, "#567865"), choice = kitEntrance(entrance)!;
    assert.equal(
      r.attachments.filter((a) => a.asset === choice.frame).length,
      1,
    );
    assert.ok(r.attachments.some((a) => a.asset === choice.leaf));
    assert.equal(
      r.attachments.filter((a) => a.asset.startsWith("DoorFrame_")).length,
      1,
    );
    assert.ok(r.parts.some((p) => p.fallbackAssets?.includes(choice.leaf)));
    if ("steps" in choice) {
      assert.ok(r.attachments.some((a) => a.asset === choice.steps));
    }
  }
});
test("rooflines use adjoining cells including both corner hands rather than scattered centre pieces", () => {
  for (const roofline of KIT_ROOFLINES.filter((r) => r !== "existing")) {
    const d = fixture();
    d.architecturalKit = { roofline };
    const r = resolveV3(d, "#567865"),
      a = r.attachments.filter((a) => a.role === "cornice");
    assert.ok(a.some((a) => a.asset.endsWith("90Angle_L")));
    assert.ok(a.some((a) => a.asset.endsWith("90Angle_R")));
    assert.ok(a.some((a) => a.asset.endsWith("_Center")));
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const maxY = Math.max(...a.map((p) => p.position[1]));
      const run = a.filter((piece) =>
        Math.abs(piece.rotation - angle) < .01 &&
        Math.abs(piece.position[1] - maxY) < .001
      ).sort((a, b) =>
        Math.cos(angle) * (a.position[0] - b.position[0]) -
        Math.sin(angle) * (a.position[2] - b.position[2])
      );
      for (let i = 1; i < run.length; i++) {
        const prev = run[i - 1],
          curr = run[i],
          dist = Math.abs(
            Math.cos(angle) * (curr.position[0] - prev.position[0]) -
              Math.sin(angle) * (curr.position[2] - prev.position[2]),
          );
        assert.ok(
          Math.abs(
            dist -
              (KIT_DIMENSIONS[prev.asset][0] * prev.axisScale![0] +
                  KIT_DIMENSIONS[curr.asset][0] * curr.axisScale![0]) / 2,
          ) < .001,
        );
      }
    }
  }
});
test("slate is one fitted roof with four corners, dormer and loading shell; incompatible shapes retain selection", () => {
  const d = fixture(), r = resolveV3(d, "#567865");
  assert.equal(
    r.attachments.filter((a) => a.asset === "Roof_Slate_Corner").length,
    4,
  );
  assert.ok(r.attachments.some((a) => a.asset === "Roof_Slate_Window_1"));
  assert.ok(
    r.parts.some((p) => p.fallbackAssets?.includes("Roof_Slate_Corner")),
  );
  assert.equal(r.parts.filter((p) => p.kind === "roof").length, 0);
  const bad = resolveV3({ ...d, blueprint: "courtyard" }, "#567865");
  assert.ok(bad.kitNotes.length);
  assert.equal(bad.attachments.some((a) => a.role === "roof"), false);
  assert.equal(d.architecturalKit!.roof, "slate-dormers");
});
test("storefronts use unbranded source awnings and mode-specific ground floor panels", () => {
  for (const frontage of KIT_FRONTAGES.filter((f) => f !== "existing")) {
    const d = fixture();
    d.architecturalKit = { frontage };
    d.slots=newDesign("storefront-sign").slots;
    d.base = "storefront";
    const r = resolveV3(d, "#567865");
    assert.equal(
      r.attachments.filter((a) => a.asset === "Prop_Awning_Long").length,
      frontage === "department" ? 2 : 1,
    );
    assert.equal(
      r.attachments.some((a) => /Carmines|Bakery|Pub/.test(a.asset)),
      false,
    );
    const window={cafe:"Brick_Inset_Window",boutique:"Marble_ShopWindow",department:"Trim_FirstFloor_Window"}[frontage];
    assert.ok(r.attachments.filter(a=>a.asset===window&&a.position[1]<1).length>=2,"display bays must flank the entrance");
  }
});
test("legacy recipes are unchanged by an empty kit, and far LOD has no kit meshes", () => {
  const d = fixture();
  delete d.architecturalKit;
  assert.deepEqual(
    resolveV3(d, "#567865"),
    resolveV3({ ...d, architecturalKit: {} }, "#567865"),
  );
  assert.equal(resolveV3(fixture(), "#567865", "far").attachments.length, 0);
});

test("grand entrance steps are optional and far slate keeps its silhouette",()=>{
 const d=fixture();d.architecturalKit={entrance:"grand-marble",entranceSteps:false,roof:"slate-dormers"};
 const near=resolveV3(d,"#778899");
 assert.ok(near.attachments.some(a=>a.asset==="Door_4"));
 assert.equal(near.attachments.some(a=>a.asset==="Entrance_Marble_2x2"),false);
 const far=resolveV3(d,"#778899","far");
 assert.ok(far.parts.some(p=>p.kind==="hip"&&p.position[1]>far.masses.at(-1)!.y));
});
