import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  estateBuilding,
  estatePlotAxis,
  estateLogicalAxis,
  plotAxis,
  logicalAxis,
  frontage,
  buildingVariant,
  roadNetwork,
  BUILDING_RECIPES,
  billboardEnvelope,
  buildingMassing,
} from "./cityLayout.ts";

test("hero signs span connected roofs on camera-facing edges within plot setbacks", () => {
  for (let tier = 0; tier < BUILDING_RECIPES.length; tier++) {
    for (const id of ["business-1", "business-2"]) {
      const sign = billboardEnvelope(tier, id), layout = buildingMassing(tier, id);
      assert.ok(sign.width >= 11.6);
      assert.ok(sign.width + 0.22 <= layout.width);
      assert.ok(sign.front + 0.15 <= 8);
      assert.ok(sign.rotation === 0 || sign.rotation === Math.PI / 2);
      assert.ok(sign.bottom > layout.frontageHeight);
      for (const w of layout.wings) {
        assert.ok(Math.abs(w.x) + w.width / 2 <= 8);
        assert.ok(Math.abs(w.z) + w.depth / 2 <= 8);
      }
      const [a, b] = layout.wings;
      assert.ok(Math.abs(a.x-b.x) <= (a.width+b.width)/2);
      assert.ok(Math.abs(a.z-b.z) <= (a.depth+b.depth)/2);
    }
  }
});

test("logical positions round-trip across blocks and expansion rings", () => {
  for (let coordinate = -100; coordinate <= 100; coordinate++)
    assert.equal(logicalAxis(plotAxis(coordinate)), coordinate);
  assert.equal(plotAxis(2) - plotAxis(1), 24);
  assert.equal(plotAxis(3) - plotAxis(2), 42);
  assert.equal(plotAxis(1) - plotAxis(-1), 42);
  for (const recipe of BUILDING_RECIPES)
    assert.ok(recipe.width <= 16 && recipe.depth <= 16);
});
test("all plots face an adjacent street and variants depend only on identity", () => {
  for (let x = -20; x <= 20; x++)
    if (x) {
      const street = plotAxis(x) + Math.sin(frontage(x)) * 21;
      assert.ok(Math.abs(street / 66 - Math.round(street / 66)) < 1e-9);
    }
  assert.equal(
    buildingVariant("fixed-business"),
    buildingVariant("fixed-business"),
  );
  assert.deepEqual(
    new Set(
      Array.from({ length: 100 }, (_, i) => buildingVariant(`business-${i}`)),
    ),
    new Set([0, 1]),
  );
});
test("physical road sockets align exactly, including curves, tees and plaza", () => {
  const network = roadNetwork(400);
  const sockets: Record<string, number[][]> = {
    Street_4Lane: [
      [-3, 0],
      [3, 0],
    ],
    Street_4WayIntersection: [
      [-9, 0],
      [9, 0],
      [0, -9],
      [0, 9],
    ],
    Street_TIntersection: [
      [-9, 0],
      [9, 0],
      [0, -9],
    ],
    Street_Curve_4LaneShort: [
      [0, 9],
      [9, 0],
    ],
  };
  const endpoints = new Map<string, number>();
  function mark(x: number, z: number) {
    const key = `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
    endpoints.set(key, (endpoints.get(key) || 0) + 1);
  }
  for (const p of network.placements)
    for (const [x, z] of sockets[p.asset])
      mark(
        p.x + Math.cos(p.rotation) * x + Math.sin(p.rotation) * z,
        p.z - Math.sin(p.rotation) * x + Math.cos(p.rotation) * z,
      );
  for (const [x, z] of [
    [-9, 0],
    [9, 0],
    [0, -9],
    [0, 9],
  ])
    mark(x, z);
  for (const [key, count] of endpoints)
    assert.equal(count, 2, `Open or overlapping connection ${key}`);
  assert.equal(network.nodes.filter((n) => n.kind === "curve").length, 4);
  assert.equal(network.nodes.filter((n) => n.kind === "plaza").length, 1);
});
test("expansion preserves interior road positions and only replaces the old perimeter junctions", () => {
  const old = roadNetwork(400),
    expanded = roadNetwork(484),
    keys = new Set(expanded.placements.map((p) => p.key));
  for (const p of old.placements)
    if (p.asset === "Street_4Lane" || p.asset === "Street_4WayIntersection")
      assert.ok(keys.has(p.key));
});

test("exported modular footprints and full-height bays match the runtime without scaling", () => {
 const manifest=JSON.parse(readFileSync(new URL("../../public/city/downtown/manifest.json",import.meta.url),"utf8"));
 for(let tier=0;tier<6;tier++) for(let variant=0;variant<2;variant++) {
  const id=["preset-0","preset-1"].find(id=>buildingVariant(id)===variant)!;
  const expected=buildingMassing(tier,id).wings.map(w=>[w.x,w.z,w.width,w.depth,w.height/3]);
  for(const lod of ["near","far"]) {
   const asset=manifest.assets[`Building_${tier}_${variant}_${lod}`];
   assert.equal(asset.layoutVersion,3); assert.equal(asset.modulePitch,2);assert.equal(asset.floorHeight,3);
   assert.deepEqual(asset.wings,expected);
  }
 }
});

test("demo estates have one centre per road block with 48m of clear plot space", () => {
  const centres = new Set<number>();
  for (let n = -10; n <= 10; n++) {
    assert.equal(estateLogicalAxis(estatePlotAxis(n)), n);
    if (!n) continue;
    const centre = estatePlotAxis(n);
    assert.ok(!centres.has(centre)); centres.add(centre);
    assert.equal(((centre % 66) + 66) % 66, 33);
    // Each plot ends 9m from both road centre lines; billboards stay inside it.
    assert.equal(((centre - 24) % 66 + 66) % 66, 9);
  }
  assert.equal(centres.size, 20);
});

test("enlarged Quaternius estates put both wings on the right edges and clear the sign", () => {
  const variations = new Set();
  for (let tier=0;tier<6;tier++) for (const id of ["demo-0","demo-1","demo-2","demo-3"]) {
    const e=estateBuilding(tier,id); const layout=buildingMassing(e.tier,id);
    variations.add(`${e.tier}:${e.variant}:${e.scale}`);
    const bounds=layout.wings.map(w=>({
      minX:e.x+(w.z-w.depth/2)*e.scale, maxX:e.x+(w.z+w.depth/2)*e.scale,
      minZ:e.z+(-w.x-w.width/2)*e.scale, maxZ:e.z+(-w.x+w.width/2)*e.scale,
    }));
    assert.ok(Math.abs(Math.max(...bounds.map(b=>b.maxX))-19)<1e-8);
    assert.ok(Math.abs(Math.min(...bounds.map(b=>b.minZ))+19)<1e-8);
    for(const b of bounds) { assert.ok(b.minX>-22 && b.maxX<22 && b.minZ>-22 && b.maxZ<18); }
    assert.ok(e.height>=20 && e.height<60);
  }
  assert.ok(variations.size>=6);
});
