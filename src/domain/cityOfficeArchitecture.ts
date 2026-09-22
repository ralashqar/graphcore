import type {
  CityBuildingDesignV3,
  ResolvedV3,
  Slot,
} from "./cityBuildingV3.ts";
import type { BuildingMass } from "./cityBuildingDesign.ts";
import type { DesignPart } from "./cityBuildingV2.ts";
import { groundsParts } from "./cityBuildingGrounds.ts";
export const OFFICE_TYPES = [
  "twin-tower",
  "round-tower",
  "ellipse-tower",
  "rounded-office",
  "art-deco",
  "atrium-campus",
] as const;
export type OfficeArchitecture = {
  bridgeFloor?: number;
  towerGap?: number;
  shorterTower?: number;
  style?: "international" | "deco" | "brutalist";
};
type Point = [number, number];
type Floor = { polygon: Point[]; y: number; height: number; level: number };
const rect = (
  x: number,
  z: number,
  w: number,
  h: number,
): Point[] => [[x - w / 2, z - h / 2], [x + w / 2, z - h / 2], [
  x + w / 2,
  z + h / 2,
], [x - w / 2, z + h / 2]];
const cross = (a: Point, b: Point, c: Point) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
/** Sample equal distances along a dense ellipse; equal angles would compress its ends. */
export function ellipseOutline(w: number, h: number): Point[] {
  const dense: Point[] = Array.from(
    { length: 513 },
    (
      _,
      i,
    ) => [
      Math.cos(i * Math.PI / 256) * w / 2,
      Math.sin(i * Math.PI / 256) * h / 2,
    ],
  );
  const lengths = [0];
  for (let i = 1; i < dense.length; i++) {
    lengths.push(
      lengths[i - 1] +
        Math.hypot(
          dense[i][0] - dense[i - 1][0],
          dense[i][1] - dense[i - 1][1],
        ),
    );
  }
  const total = lengths.at(-1)!,
    count = Math.max(16, Math.min(40, Math.round(total / 1.8 / 4) * 4)),
    out: Point[] = [];
  for (let j = 0, i = 1; j < count; j++) {
    const distance = (j + .5) * total / count;
    while (lengths[i] < distance) i++;
    const t = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
    out.push([
      dense[i - 1][0] * (1 - t) + dense[i][0] * t,
      dense[i - 1][1] * (1 - t) + dense[i][1] * t,
    ]);
  }
  return out;
}
function rounded(w: number, h: number): Point[] {
  const r = Math.min(w, h) * .22, out: Point[] = [];
  for (let c = 0; c < 4; c++) {
    const angle = c * Math.PI / 2;
    const cx = c === 0 || c === 3 ? w / 2 - r : -w / 2 + r,
      cz = c < 2 ? h / 2 - r : -h / 2 + r;
    for (let k = 0; k <= 4; k++) {
      const a = angle + k * Math.PI / 8;
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  return out;
}
export function officeFloors(d: CityBuildingDesignV3): Floor[] {
  const out: Floor[] = [],
    o = d.officeArchitecture || {},
    gap = Math.min(d.width * .35, Math.max(2, o.towerGap ?? 4));
  for (let f = 0; f < d.floors; f++) {
    const y = .65 + (f ? d.groundHeight + (f - 1) * 3 : 0),
      height = f ? 3 : d.groundHeight;
    const shrink = (d.archetype === "art-deco"
      ? Math.floor(f / 2) * Math.min(d.setback, 1.3) : 0) +
      (d.podium && f > 0 ? .6 : 0);
    const w = Math.max(5, d.width - shrink * 2),
      h = Math.max(5, d.depth - shrink * 2);
    const add = (polygon: Point[]) =>
      out.push({ polygon, y, height, level: f });
    if (d.archetype === "twin-tower" && f > 0) {
      const half = gap / 2,
        tw = (w - gap) / 2,
        left = -w / 2,
        right = w / 2,
        back = -h / 2,
        front = h / 2;
      const rightExists = f < Math.max(2, d.floors - (o.shorterTower ?? 0));
      const bridge = o.bridgeFloor ?? Math.min(3, d.floors - 1);
      if (f === bridge && rightExists) {
        add([
          [left, back],
          [-half, back],
          [-half, front-2.4],
          [half, front-2.4],
          [half, back],
          [right, back],
          [right, front],
          [half, front],
          [half, front-.4],
          [-half, front-.4],
          [-half, front],
          [left, front],
        ]);
      } else {
        add(rect(-(w + gap) / 4, 0, tw, h));
        if (rightExists) add(rect((w + gap) / 4, 0, tw, h));
      }
    } else if (d.archetype === "round-tower") {
      add(ellipseOutline(Math.min(w, h), Math.min(w, h)));
    } else if (d.archetype === "ellipse-tower") add(ellipseOutline(w, h));
    else if (d.archetype === "rounded-office") add(rounded(w, h));
    else if (d.archetype === "atrium-campus" && f > 0) {
      const wing = Math.max(2, w * .28);
      add(rect(-w / 2 + wing / 2, 0, wing, h));
      add(rect(w / 2 - wing / 2, 0, wing, h));
    } else add(rect(0, 0, w, h));
  }
  return out;
}
export function officeMasses(d: CityBuildingDesignV3): BuildingMass[] {
  return officeFloors(d).map((f) => {
    const xs = f.polygon.map((p) => p[0]),
      zs = f.polygon.map((p) => p[1]),
      x0 = Math.min(...xs),
      x1 = Math.max(...xs),
      z0 = Math.min(...zs),
      z1 = Math.max(...zs);
    return {
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      width: x1 - x0,
      depth: z1 - z0,
      y: f.y,
      height: f.height,
    };
  });
}
function triangles(p: Point[]): number[][] {
  const ids = p.map((_, i) => i), out: number[][] = [];
  let guard = 0;
  while (ids.length > 3 && guard++ < p.length * p.length) {
    let found = false;
    for (let i = 0; i < ids.length; i++) {
      const a = ids[(i + ids.length - 1) % ids.length],
        b = ids[i],
        c = ids[(i + 1) % ids.length];
      if (cross(p[a], p[b], p[c]) <= 1e-8) continue;
      if (
        ids.some((k) =>
          k !== a && k !== b && k !== c && cross(p[a], p[b], p[k]) >= -1e-8 &&
          cross(p[b], p[c], p[k]) >= -1e-8 && cross(p[c], p[a], p[k]) >= -1e-8
        )
      ) continue;
      out.push([a, b, c]);
      ids.splice(i, 1);
      found = true;
      break;
    }
    if (!found) break;
  }
  if (ids.length === 3) out.push([...ids]);
  return out;
}
function prism(p: Point[], bottom: number, top: number): number[] {
  const v: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) =>
    v.push(...a, ...b, ...c);
  for (const [a, b, c] of triangles(p)) {
    tri([p[c][0], top, p[c][1]], [p[b][0], top, p[b][1]], [
      p[a][0],
      top,
      p[a][1],
    ]);
    tri([p[a][0], bottom, p[a][1]], [p[b][0], bottom, p[b][1]], [
      p[c][0],
      bottom,
      p[c][1],
    ]);
  }
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    tri([a[0], bottom, a[1]], [a[0], top, a[1]], [b[0], top, b[1]]);
    tri([a[0], bottom, a[1]], [b[0], top, b[1]], [b[0], bottom, b[1]]);
  }
  return v;
}
function entranceEdge(d: CityBuildingDesignV3) {
  const p = officeFloors(d)[0].polygon;
  let best = 0;
  for (let i = 1; i < p.length; i++) {
    if (
      (p[i][1] + p[(i + 1) % p.length][1]) >
        (p[best][1] + p[(best + 1) % p.length][1]) + 1e-5
    ) best = i;
  }
  const a = p[best], b = p[(best + 1) % p.length];
  return {
    a,
    b,
    x: (a[0] + b[0]) / 2,
    z: (a[1] + b[1]) / 2,
    index: best,
    rotation: -Math.atan2(b[1] - a[1], b[0] - a[0]),
  };
}
export function officeSlots(d: CityBuildingDesignV3): Slot[] {
  const e = entranceEdge(d),
    length = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
  return Object.entries(d.slots).map(([id, selected]) => ({
    id: id as Slot["id"],
    label: id === "brand.entrance" ? "Integrated entrance sign" : id,
    position: [e.x, d.groundHeight + .25, e.z + .06] as [
      number,
      number,
      number,
    ],
    size: [Math.min(4, length - .2), .5, .12] as [number, number, number],
    rotation: 0,
    compatible: id === "brand.entrance" ? ["brand"] : [],
    selected: selected ?? null,
    active: id === "brand.entrance" && selected === "brand",
    reason: id === "brand.entrance"
      ? null
      : "Retained: this slot is not supported by the connected office envelope.",
  }));
}
export function resolveOffice(
  d: CityBuildingDesignV3,
  brand: string,
  lod: "near" | "medium" | "far",
): ResolvedV3 {
  const floors = officeFloors(d),
    parts: DesignPart[] = groundsParts(d, lod),
    p = d.palette,
    wall: number[] = [],
    trim: number[] = [],
    roof: number[] = [],
    entry = entranceEdge(d),
    o = d.officeArchitecture || {};
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    depth: number,
    color: string,
    rotation = 0,
    _glass = false,
  ) =>
    parts.push({
      kind: "box",
      position: [x, y, z],
      size: [w, h, depth],
      color,
      rotation,
    });
  for (const f of floors) {
    const poly = f.polygon;
    // Shared mitred inner boundary closes both convex and re-entrant wall junctions.
    const inner = poly.map((b, i): Point => {
      const a = poly[(i + poly.length - 1) % poly.length],
        c = poly[(i + 1) % poly.length],
        u = [b[0] - a[0], b[1] - a[1]],
        v = [c[0] - b[0], c[1] - b[1]],
        ul = Math.hypot(...u),
        vl = Math.hypot(...v),
        nx = -u[1] / ul - v[1] / vl,
        nz = u[0] / ul + v[0] / vl,
        den = 1 + (u[0] * v[0] + u[1] * v[1]) / (ul * vl);
      return [
        b[0] + nx * .18 / Math.max(.15, den),
        b[1] + nz * .18 / Math.max(.15, den),
      ];
    });
    if (lod !== "near") {
      // At city distance use one closed envelope with thin glazing panels.
      // The editor/near representation retains real apertures and full returns.
      wall.push(...prism(poly, f.y, f.y + f.height - .16));
      trim.push(...prism(poly, f.y + f.height - .16, f.y + f.height));
    }
    if (lod === "near") roof.push(...prism(inner, f.y, f.y + .12));
    if (d.archetype !== "atrium-campus" || f.level !== 0 || d.floors === 1) {
      roof.push(
        ...prism(
          inner,
          f.y + f.height - .12,
          f.y + f.height + (lod === "near" ? 0 : .012),
        ),
      );
    }
    if (d.archetype === "atrium-campus" && f.level === 0 && d.floors > 1) {
      const gap = (d.width - (d.podium ? 1.2 : 0)) * .44,
        span = (d.width - .36 - gap) / 2;
      for (const side of [-1, 1]) {
        roof.push(
          ...prism(
            rect(side * (gap / 2 + span / 2), 0, span, d.depth - .36),
            f.y + f.height - .12,
            f.y + f.height,
          ),
        );
      }
    }
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        ia = inner[i],
        ib = inner[(i + 1) % poly.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len = Math.hypot(dx, dz),
        nx = dz / len,
        nz = -dx / len;
      const strip = (
        lo: number,
        hi: number,
        y0: number,
        y1: number,
        target: number[],
      ) => {
        if (lod !== "near" || hi - lo < 1e-5 || y1 - y0 < 1e-5) return;
        const lerp = (
          u: Point,
          v: Point,
          t: number,
        ): Point => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t];
        target.push(
          ...prism(
            [
              lerp(a, b, lo),
              lerp(b, a, 1 - hi),
              lerp(ib, ia, 1 - hi),
              lerp(ia, ib, lo),
            ],
            y0,
            y1,
          ),
        );
      };
      if(len<.85){strip(0,1,f.y,f.y+f.height-.16,wall);strip(0,1,f.y+f.height-.16,f.y+f.height,trim);continue;}
      const ground = f.level === 0, isEntry = ground && i === entry.index;
      const count = Math.max(1, Math.floor(len / 1.9)),
        n = isEntry && count % 2 === 0 ? count - 1 : count,
        bay = len / n,
        win = Math.min(o.style === "brutalist" ? .8 : 1.4, bay - .35),
        sill = ground ? .35 : .62,
        top = f.height - (ground ? .8 : .38);
      strip(0, 1, f.y + top, f.y + f.height - .16, wall);
      strip(0, 1, f.y + f.height - .16, f.y + f.height, trim);
      for (let j = 0; j < n; j++) {
        const mid = (j + .5) / n,
          isDoor = isEntry && j === Math.floor(n / 2),
          width = isDoor ? Math.min(1.6, bay - .3) : win,
          lo = mid - width / (2 * len),
          hi = mid + width / (2 * len);
        strip(j / n, lo, f.y + sill, f.y + top, wall);
        strip(hi, (j + 1) / n, f.y + sill, f.y + top, wall);
        if (isDoor) {
          strip(j / n, lo, f.y, f.y + sill, wall);
          strip(hi, (j + 1) / n, f.y, f.y + sill, wall);
        } else strip(j / n, (j + 1) / n, f.y, f.y + sill, wall);
        const y0 = isDoor ? f.y + .12 : f.y + sill;
        box(
          a[0] + dx * mid + nx * (lod === "near" ? -.1 : .025),
          (y0 + f.y + top) / 2,
          a[1] + dz * mid + nz * (lod === "near" ? -.1 : .025),
          width,
          f.y + top - y0,
          lod === "near" ? .06 : .02,
          p.glass,
          -Math.atan2(dz, dx),
          true,
        );
        if ((lod === "near" && d.rhythm === "vertical") || o.style === "deco") {
          box(
            a[0] + dx * mid - nx * .045,
            (y0 + f.y + top) / 2,
            a[1] + dz * mid - nz * .045,
            o.style === "deco" ? .14 : .045,
            f.y + top - y0,
            .05,
            p.trim,
            -Math.atan2(dz, dx),
          );
        }
      }
    }
  }
  // Glazed atrium spans the central ground-floor lobby, below the flanking wings.
  if (d.archetype === "atrium-campus" && d.floors > 1) {
    const gap = (d.width - (d.podium ? 1.2 : 0)) * .44;
    box(
      0,
      .65 + d.groundHeight + .04,
      0,
      gap,
      .12,
      d.depth - .4,
      p.glass,
      0,
      true,
    );
    if (lod !== "far") {
      for (let z = -d.depth / 2 + .5; z < d.depth / 2; z += 2) {
        box(0, .65 + d.groundHeight + .14, z, gap, .1, .08, p.trim);
      }
    }
  }
  for (
    const [vertices, color, role] of [[wall, p.wall, "wall"], [
      trim,
      p.trim,
      "none",
    ], [roof, p.roof, "roof"]] as const
  ) {
    if (vertices.length) {
      parts.push({
        kind: "mesh",
        vertices,
        position: [0, 0, 0],
        size: [1, 1, 1],
        color,
        textureRole: role,
      });
    }
  }
  parts.push({
    kind: "mesh",
    vertices: prism(floors[0].polygon, .26, .65),
    position: [0, 0, 0],
    size: [1, 1, 1],
    color: p.wall,
    textureRole: "wall",
  });
  if (d.grounds === "planted" && lod !== "far") {
    for (const side of [-1, 1]) {
      box(
        side * (d.width / 2 + .65),
        .57,
        d.depth / 2 - .8,
        .9,
        .6,
        1.5,
        p.trim,
      );
      box(
        side * (d.width / 2 + .65),
        .93,
        d.depth / 2 - .8,
        .72,
        .25,
        1.3,
        "#648767",
      );
    }
  }
  box(entry.x, .28, (entry.z + 11) / 2, 2, .06, 11 - entry.z, p.trim);
  const slots = officeSlots(d),
    sign = {
      x: entry.x,
      y: d.groundHeight + .25,
      z: entry.z + .08,
      width: Math.min(
        4,
        Math.hypot(entry.b[0] - entry.a[0], entry.b[1] - entry.a[1]) - .2,
      ),
      height: .5,
    };
  if (slots.some((s) => s.active)) {
    box(
      sign.x,
      sign.y,
      sign.z - .01,
      sign.width + .08,
      sign.height + .06,
      .08,
      brand,
    );
  }
  const notes = [
    "Connected office envelopes use fitted procedural panels. Native finishes, exterior stairs and roof assemblies remain saved for compatible presets.",
  ];
  if (
    d.archetype === "twin-tower" &&
    (d.floors < 2 ||
      (o.bridgeFloor ?? 3) >= Math.max(2, d.floors - (o.shorterTower ?? 0)))
  ) {
    notes.push(
      "A bridge requires a shared upper storey on both towers; increase floors or reduce the shorter-tower difference.",
    );
  }
  if (d.advertising?.placements.length) {
    notes.push(
      "Additional ad placements are retained but inactive on this envelope. The integrated entrance sign remains available.",
    );
  }
  return {
    parts,
    attachments: [],
    walls: [],
    masses: officeMasses(d),
    entrance: { x: entry.x, z: entry.z },
    sign,
    signs: slots.some((s) => s.active)
      ? [{ ...sign, rotation: 0, campaign: false }]
      : [],
    slots,
    corners: [],
    kitNotes: notes,
    extensionReason: d.stairExtension && d.stairExtension !== "none"
      ? "Exterior stairs need a compatible flat-wall preset."
      : null,
    roofContours: floors.map((f) => f.polygon),
    assemblyEnvelopes: [],
  };
}
