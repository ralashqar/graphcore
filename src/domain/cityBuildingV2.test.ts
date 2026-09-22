import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHITECTURES,
  DEFAULT_DESIGN_V2,
  exposedWalls,
  FINISHES,
  fitBays,
  massesV2,
  normalizeDesign,
  resolveDesign,
} from "./cityBuildingV2.ts";
import {
  buildingParts,
  DEFAULT_BUILDING_DESIGN,
} from "./cityBuildingDesign.ts";
import { createHash } from "node:crypto";
test("all blueprint/family/finish extremes stay bounded with exposed walls only", () => {
  for (
    const blueprint of ["office", "terraces", "courtyard", "l-shape"] as const
  ) {
    for (const architecture of ARCHITECTURES) {
      for (const finish of FINISHES) {
        for (const width of [12, 18]) {
          for (const depth of [10, 18]) {
            for (const floors of [1, 8]) {
              const d = {
                ...DEFAULT_DESIGN_V2,
                blueprint,
                architecture,
                finish,
                width,
                depth,
                floors,
                setback: 2,
              };
              const r = resolveDesign(d, "#335577");
              for (const part of r.parts) {
                assert.ok(part.position.every(Number.isFinite));
                assert.ok(part.size.every((v) => v > 0));
                assert.ok(Math.abs(part.position[0]) + part.size[0] / 2 <= 12);
                assert.ok(Math.abs(part.position[2]) + part.size[2] / 2 <= 12);
              }
              for (const a of r.attachments) {
                assert.ok(a.scale === 1);
                assert.ok(
                  Math.abs(a.position[0]) < 12 && Math.abs(a.position[2]) < 12,
                );
              }
              for (const wall of r.walls) {
                const x = wall.x + wall.nx * .001, z = wall.z + wall.nz * .001;
                assert.ok(
                  !r.masses.some((m) =>
                    m.y === wall.y && x > m.x - m.width / 2 &&
                    x < m.x + m.width / 2 && z > m.z - m.depth / 2 &&
                    z < m.z + m.depth / 2
                  ),
                );
              }
            }
          }
        }
      }
    }
  }
});
test("bays preserve width and centre spare space; joined boundaries are merged", () => {
  for (const length of [4, 5, 8, 12, 18]) {
    const b = fitBays(length, 2);
    if (b.length) assert.ok(Math.abs(b[0] + b.at(-1)!) < .00001);
    for (let i = 1; i < b.length; i++) {
      assert.ok(Math.abs(b[i] - b[i - 1] - 2.35) < .00001);
    }
  }
  const walls = exposedWalls(
    massesV2({ ...DEFAULT_DESIGN_V2, blueprint: "courtyard", floors: 1 }),
  );
  assert.equal(walls.filter((w) => w.nz === -1).length, 1);
});
test("seed is reproducible and cannot change the shell or branding; LOD reduces parts", () => {
  const d = { ...DEFAULT_DESIGN_V2, finish: "facade" as const };
  assert.deepEqual(resolveDesign(d, "#335577"), resolveDesign(d, "#335577"));
  assert.deepEqual(
    resolveDesign(d, "#335577").masses,
    resolveDesign({ ...d, seed: 99 }, "#335577").masses,
  );
  assert.deepEqual(
    resolveDesign(d, "#335577").sign,
    resolveDesign({ ...d, seed: 99 }, "#335577").sign,
  );
  assert.ok(
    resolveDesign(d, "#335577", "far").parts.length <
      resolveDesign(d, "#335577", "near").parts.length,
  );
  assert.equal(resolveDesign(d, "#335577", "far").attachments.length, 0);
  assert.equal(
    normalizeDesign({ ...d, blueprint: "l-shape", roof: "pitched", width: 15 })
      .roof,
    "parapet",
  );
  assert.equal(normalizeDesign({ ...d, width: 15 }).width, 16);
});
test("legacy recipe keeps its silhouette with recessed ribbon windows", () => {
  const hash = createHash("sha256").update(
    JSON.stringify(buildingParts(DEFAULT_BUILDING_DESIGN, "#335577")),
  ).digest("hex");
  assert.equal(
    hash,
    "fa22e7d3edc03fef537383bdab7146eb7e5cec5768bf83935c17f1a03b296f58",
  );
});

test("catalogue attachment extents respect roads and the clear entrance across roofs and grounds", async () => {
  const { readFileSync } = await import("node:fs");
  const catalog = JSON.parse(
    readFileSync(
      new URL("../../public/city/decorators/manifest.json", import.meta.url),
      "utf8",
    ),
  ).assets;
  for (
    const blueprint of ["office", "terraces", "courtyard", "l-shape"] as const
  ) {
    for (const architecture of ARCHITECTURES) {
      for (const roof of ["flat", "parapet", "planted", "pitched"] as const) {
        for (const grounds of ["minimal", "planted", "urban"] as const) {
          for (const width of [12, 18]) {
            for (const depth of [10, 18]) {
              const r = resolveDesign({
                ...DEFAULT_DESIGN_V2,
                blueprint,
                architecture,
                roof,
                grounds,
                width,
                depth,
                finish: "facade",
              }, "#335577");
              for (const a of r.attachments) {
                const entry = catalog[a.asset];
                assert.ok(entry, a.asset);
                const [w, , depth] = entry.size,
                  c = Math.cos(a.rotation),
                  s = Math.sin(a.rotation);
                for (const x of [-w / 2, w / 2]) {
                  for (const z of [0, depth]) {
                    const px = a.position[0] + (x * c + z * s) * a.scale,
                      pz = a.position[2] + (z * c - x * s) * a.scale;
                    assert.ok(
                      Math.abs(px) <= 11.8 && Math.abs(pz) <= 11.8,
                      `${a.asset} crosses boundary: ${px},${pz}`,
                    );
                    if (a.role === "props") {
                      assert.ok(
                        Math.abs(px) > 1.6,
                        "decorator blocks entrance path",
                      );
                    }
                  }
                }
              }
              for (const m of r.masses) {
                for (const other of r.masses) {
                  if (m === other || m.y !== other.y) continue;
                  assert.ok(
                    Math.min(m.x + m.width / 2, other.x + other.width / 2) <=
                        Math.max(
                          m.x - m.width / 2,
                          other.x - other.width / 2,
                        ) ||
                      Math.min(m.z + m.depth / 2, other.z + other.depth / 2) <=
                        Math.max(m.z - m.depth / 2, other.z - other.depth / 2),
                    "joined masses overlap",
                  );
                }
              }
            }
          }
        }
      }
    }
  }
});
