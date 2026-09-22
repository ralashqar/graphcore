import test from "node:test";
import assert from "node:assert/strict";
import {
  applyComposition,
  COMPOSITIONS,
  newDesign,
  normalizeV3,
  resolveV3,
} from "./cityBuildingV3.ts";
import { ellipseOutline, officeFloors } from "./cityOfficeArchitecture.ts";
const presets = COMPOSITIONS.map((p, i) => ({ p, i })).filter(({ p }) =>
  p.patch.generatorRevision === "city-office-4"
);
test("all office envelopes remain finite, closed panels bounded at dimension and floor extremes", () => {
  for (const { i } of presets) {
    for (const width of [8, 18]) {
      for (const depth of [8, 18]) {
        for (const floors of [1, 8]) {
          const d = normalizeV3({
            ...applyComposition(newDesign("office-test"), i),
            width,
            depth,
            middleFloors: floors - 1,
            crown: "none",
          });
          for (const lod of ["near", "medium", "far"] as const) {
            const r = resolveV3(d, "#446677", lod);
            assert.equal(new Set(r.masses.map((m) => m.y)).size, floors);
            assert.equal(r.attachments.length, 0);
            for (const p of r.parts) {
              assert.ok(p.size.every((n) => n > 0));
              if (p.vertices) {
                for (let n = 0; n < p.vertices.length; n++) {
                  assert.ok(Number.isFinite(p.vertices[n]));
                  if (n % 3 !== 1) assert.ok(Math.abs(p.vertices[n]) < 11.5);
                }
              }
            }
            assert.ok(r.sign.width > 0);
            assert.deepEqual(r, resolveV3(d, "#446677", lod));
          }
        }
      }
    }
  }
});
test("elliptical bays have approximately equal physical spacing, including elongated footprints", () => {
  const p = ellipseOutline(18, 8),
    lengths = p.map((a, i) =>
      Math.hypot(
        a[0] - p[(i + 1) % p.length][0],
        a[1] - p[(i + 1) % p.length][1],
      )
    );
  assert.ok(Math.max(...lengths) / Math.min(...lengths) < 1.08);
});
test("bridge joins both towers only at a supported shared storey and restores when valid", () => {
  const d = applyComposition(newDesign("bridge"), presets[0].i);
  d.officeArchitecture = { bridgeFloor: 3, towerGap: 4, shorterTower: 0 };
  const shapes = officeFloors(d);
  assert.equal(shapes.filter((f) => f.level === 3).length, 1);
  assert.equal(shapes.find((f) => f.level === 3)!.polygon.length, 12);
  assert.equal(shapes.filter((f) => f.level === 2).length, 2);
  d.officeArchitecture.shorterTower = 3;
  assert.equal(officeFloors(d).filter((f) => f.level === 3).length, 1);
  assert.equal(officeFloors(d).find((f) => f.level === 3)!.polygon.length, 4);
  assert.ok(
    resolveV3(d, "#fff").kitNotes.some((n) => n.includes("bridge requires")),
  );
  d.officeArchitecture.shorterTower = 0;
  assert.equal(officeFloors(d).find((f) => f.level === 3)!.polygon.length, 12);
});
test("office character changes openings without moving footprint or branding", () => {
  const d = applyComposition(newDesign("style"), presets[2].i),
    b = {
      ...d,
      officeArchitecture: {
        ...d.officeArchitecture,
        style: "brutalist" as const,
      },
    };
  assert.deepEqual(officeFloors(d), officeFloors(b));
  assert.deepEqual(resolveV3(d, "#fff").sign, resolveV3(b, "#fff").sign);
  assert.notDeepEqual(resolveV3(d, "#fff").parts, resolveV3(b, "#fff").parts);
});

test('merged solid meshes have balanced boundary edges and outward volume',()=>{
 for(const {i}of presets){const d=applyComposition(newDesign('closed-office'),i),r=resolveV3(d,'#446677');
 for(const mesh of r.parts.filter(p=>p.kind==='mesh')){
 const v=mesh.vertices!,edges=new Map<string,number>();let volume=0;
 for(let n=0;n<v.length;n+=9){const a=v.slice(n,n+3),b=v.slice(n+3,n+6),c=v.slice(n+6,n+9);volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
 const points=[a,b,c].map(p=>p.map(x=>Math.round(x*1e6)).join(','));for(let j=0;j<3;j++){const a=points[j],b=points[(j+1)%3],key=[a,b].sort().join('|');edges.set(key,(edges.get(key)||0)+(a<b?1:-1));}}
 assert.ok(volume>0,`${d.archetype}: outward signed volume`);assert.ok([...edges.values()].every(n=>n===0),`${d.archetype}: unclosed extrusion`);
 }
 }
});

test('Deco character has visibly wider vertical framing than International',()=>{
 const d=applyComposition(newDesign('deco-character'),presets[2].i);
 const deco={...d,officeArchitecture:{...d.officeArchitecture,style:'deco' as const}};
 assert.notDeepEqual(resolveV3(d,'#fff').parts,resolveV3(deco,'#fff').parts);
 assert.deepEqual(officeFloors(d),officeFloors(deco));
});
