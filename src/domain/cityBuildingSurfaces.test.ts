import test from "node:test";
import assert from "node:assert/strict";
import { pitchedRoofPositions } from "./cityBuildingSurfaces.ts";
import { DEFAULT_DESIGN_V2, resolveDesign } from "./cityBuildingV2.ts";
import { newDesign, resolveV3 } from "./cityBuildingV3.ts";

test("pitched roof is watertight with every triangle facing outward", () => {
  const positions = pitchedRoofPositions();
  const edges = new Map<string, number>();
  for (let i = 0; i < positions.length; i += 9) {
    const a = positions.slice(i, i + 3), b = positions.slice(i + 3, i + 6), c = positions.slice(i + 6, i + 9);
    const u = b.map((v, j) => v - a[j]), v = c.map((n, j) => n - a[j]);
    const normal = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    // Origin lies strictly inside the prism.
    const dot = normal.reduce((sum, n, j) => sum + n * (a[j]+b[j]+c[j])/3, 0);
    assert.ok(dot > 0, `inward or degenerate triangle ${i/9}`);
    for (const [from, to] of [[a,b],[b,c],[c,a]]) {
      const key = `${from.join(",")}>${to.join(",")}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of edges) {
    assert.equal(count, 1);
    assert.equal(edges.get(key.split(">").reverse().join(">")), 1);
  }
});

test("wall shells meet floor slabs without overlapping their visible side faces", () => {
  for (const result of [resolveDesign(DEFAULT_DESIGN_V2, "#8866aa", "near"), resolveV3(newDesign("surface-test"), "#8866aa", "near")]) {
    for (const wall of result.walls) {
      const shell = result.parts.find((part) => part.kind === "box" &&
        Math.abs(part.position[0] - (wall.x - wall.nx*.075)) < 1e-6 &&
        Math.abs(part.position[2] - (wall.z - wall.nz*.075)) < 1e-6 &&
        Math.abs(part.position[1] - (wall.y + wall.height/2)) < 1e-6);
      assert.ok(shell);
      assert.ok(Math.abs(shell.position[1] - shell.size[1]/2 - (wall.y+.18)) < 1e-6);
      assert.ok(Math.abs(shell.position[1] + shell.size[1]/2 - (wall.y+wall.height-.18)) < 1e-6);
    }
  }
});
