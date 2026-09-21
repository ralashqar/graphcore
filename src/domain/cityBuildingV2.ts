import type {
  BuildingMass,
  BuildingPart,
  CityBuildingDesignV1,
} from "./cityBuildingDesign.ts";
export const ARCHITECTURES = [
  "glass",
  "brick",
  "boutique",
  "creative",
] as const;
export const FINISHES = ["procedural", "accents", "facade"] as const;
export const ROOFS = ["flat", "parapet", "planted", "pitched"] as const;
export type Palette = {
  wall: string;
  trim: string;
  glass: string;
  roof: string;
};
export type CityBuildingDesignV2 = Omit<CityBuildingDesignV1, "version"> & {
  version: 2;
  depth: number;
  groundHeight: number;
  podium: boolean;
  architecture: typeof ARCHITECTURES[number];
  finish: typeof FINISHES[number];
  roof: typeof ROOFS[number];
  grounds: "minimal" | "planted" | "urban";
  canopy: boolean;
  seed: number;
  palette: Palette;
};
export const DEFAULT_DESIGN_V2: CityBuildingDesignV2 = {
  version: 2,
  blueprint: "terraces",
  floors: 4,
  width: 16,
  depth: 12,
  setback: 1,
  facade: "ribbon",
  tile: "limestone",
  landscaping: true,
  rotation: 0,
  groundHeight: 3.6,
  podium: true,
  architecture: "glass",
  finish: "procedural",
  roof: "parapet",
  grounds: "planted",
  canopy: true,
  seed: 42,
  palette: {
    wall: "#d7d7cb",
    trim: "#ece9dd",
    glass: "#618e98",
    roof: "#77877e",
  },
};
export const ARCHITECTURE_LABELS = {
  glass: "Glass office",
  brick: "Warm brick",
  boutique: "Boutique storefront",
  creative: "Creative studio",
};
export function brandPalette(brand: string): Palette {
  const n = parseInt(brand.slice(1), 16),
    rgb = [n >> 16, (n >> 8) & 255, n & 255];
  const mix = (a: number) =>
    "#" +
    rgb.map((v) =>
      Math.round(v * (1 - a) + 245 * a).toString(16).padStart(2, "0")
    ).join("");
  return { wall: mix(.72), trim: mix(.91), glass: mix(.18), roof: mix(.35) };
}
export function upgradeDesign(d: CityBuildingDesignV1): CityBuildingDesignV2 {
  return {
    ...DEFAULT_DESIGN_V2,
    ...d,
    version: 2,
    depth: d.blueprint === "office" || d.blueprint === "terraces"
      ? Math.max(10, d.width - 3)
      : d.width,
    grounds: d.landscaping ? "planted" : "minimal",
  };
}
export function normalizeDesign(d: CityBuildingDesignV2): CityBuildingDesignV2 {
  const modular = d.finish !== "procedural";
  return {
    ...d,
    width: modular ? Math.round(d.width / 2) * 2 : d.width,
    depth: modular ? Math.round(d.depth / 2) * 2 : d.depth,
    setback: modular ? Math.round(d.setback) : d.setback,
    roof: d.roof === "pitched" && d.blueprint !== "office" ? "parapet" : d.roof,
  };
}
export function massesV2(input: CityBuildingDesignV2): BuildingMass[] {
  const d = normalizeDesign(input), out: BuildingMass[] = [];
  for (let f = 0; f < d.floors; f++) {
    const shrink =
      (d.blueprint === "terraces" ? Math.floor(f / 2) * d.setback : 0) +
      (d.podium && f > 0 ? 1 : 0);
    const w = Math.max(8, d.width - shrink * 2),
      depth = Math.max(8, d.depth - shrink * 2),
      y = .65 + (f ? d.groundHeight + (f - 1) * 3 : 0),
      height = f ? 3 : d.groundHeight;
    if (d.blueprint === "courtyard" || d.blueprint === "l-shape") {
      out.push({ x: 0, z: -depth / 2 + 2, width: w, depth: 4, y, height });
      out.push({ x: w / 2 - 2, z: 2, width: 4, depth: depth - 4, y, height });
      if (d.blueprint === "courtyard") {
        out.push({
          x: -w / 2 + 2,
          z: 2,
          width: 4,
          depth: depth - 4,
          y,
          height,
        });
      }
    } else out.push({ x: 0, z: 0, width: w, depth, y, height });
  }
  return out;
}
export type Wall = {
  x: number;
  z: number;
  nx: number;
  nz: number;
  length: number;
  y: number;
  height: number;
};
/** Segment the rectangle union boundary. Internal faces never receive walls or decoration. */
export function exposedWalls(masses: BuildingMass[]): Wall[] {
  const out: Wall[] = [];
  for (const m of masses) {
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const horizontal = nz !== 0,
        lo = horizontal ? m.x - m.width / 2 : m.z - m.depth / 2,
        hi = horizontal ? m.x + m.width / 2 : m.z + m.depth / 2;
      const fixed = horizontal
        ? m.z + nz * m.depth / 2
        : m.x + nx * m.width / 2;
      const neighbours = masses.filter((o) =>
        o !== m && Math.abs(o.y - m.y) < .001
      );
      const cuts = [
        lo,
        hi,
        ...neighbours.flatMap((o) =>
          horizontal
            ? [o.x - o.width / 2, o.x + o.width / 2]
            : [o.z - o.depth / 2, o.z + o.depth / 2]
        ).filter((v) => v > lo && v < hi),
      ].sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i], b = cuts[i + 1];
        if (b - a < .001) {
          continue;
        }
        const mid = (a + b) / 2,
          x = horizontal ? mid : fixed,
          z = horizontal ? fixed : mid;
        const covered = neighbours.some((o) =>
          x + nx * .001 > o.x - o.width / 2 &&
          x + nx * .001 < o.x + o.width / 2 &&
          z + nz * .001 > o.z - o.depth / 2 && z + nz * .001 < o.z + o.depth / 2
        );
        if (!covered) {
          out.push({
            x,
            z,
            nx,
            nz,
            length: b - a,
            y: m.y,
            height: m.height,
          });
        }
      }
    }
  }
  const groups = new Map<string, Wall[]>();
  for (const w of out) {
    const key = [w.nx, w.nz, w.nz ? w.z : w.x, w.y, w.height].join(":");
    const list = groups.get(key) || [];
    list.push(w);
    groups.set(key, list);
  }
  const merged: Wall[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => (a.nz ? a.x : a.z) - (b.nz ? b.x : b.z));
    for (const w of group) {
      const previous = merged.at(-1);
      const start = (w.nz ? w.x : w.z) - w.length / 2;
      if (
        previous && previous.nx === w.nx && previous.nz === w.nz &&
        previous.y === w.y && previous.height === w.height &&
        (w.nz ? previous.z === w.z : previous.x === w.x) &&
        Math.abs(
            (w.nz ? previous.x : previous.z) + previous.length / 2 - start,
          ) < .001
      ) {
        const lo = (w.nz ? previous.x : previous.z) - previous.length / 2,
          hi = start + w.length;
        previous.length = hi - lo;
        if (w.nz) previous.x = (hi + lo) / 2;
        else previous.z = (hi + lo) / 2;
      } else merged.push({ ...w });
    }
  }
  return merged;
}
/** The same fixed bay width on every orientation; symmetric margins absorb remainders. */
export function fitBays(
  length: number,
  width: number,
  gap = .35,
  margin = .3,
): number[] {
  const count = Math.max(
    0,
    Math.floor((length - 2 * margin + gap) / (width + gap)),
  );
  return Array.from(
    { length: count },
    (_, i) => (i - (count - 1) / 2) * (width + gap),
  );
}
export type Attachment = {
  asset: string;
  position: [number, number, number];
  rotation: number;
  scale: number;
  axisScale?: [number, number, number];
  role: string;
};
export type DesignPart = BuildingPart & { textureRole?: "groundBorder"; fallback?: "facade" | "props"; fallbackAsset?: string; fallbackAssets?: string[] };
export type ResolvedDesign = {
  parts: DesignPart[];
  attachments: Attachment[];
  walls: Wall[];
  masses: BuildingMass[];
  entrance: { x: number; z: number };
  sign: { x: number; y: number; z: number; width: number; height: number };
};
export function resolveDesign(
  input: CityBuildingDesignV2,
  brand: string,
  lod: "near" | "medium" | "far" = "near",
): ResolvedDesign {
  const d = normalizeDesign(input),
    p = d.palette,
    masses = massesV2(d),
    walls = exposedWalls(masses),
    parts: DesignPart[] = [],
    attachments: Attachment[] = [];
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    depth: number,
    color: string,
    fallback?: DesignPart["fallback"],
  ) =>
    parts.push({
      kind: "box",
      position: [x, y, z],
      size: [w, h, depth],
      color,
      fallback,
    });
  const attach = (
    asset: string,
    x: number,
    y: number,
    z: number,
    rotation = 0,
    scale = 1,
    role = "accent",
  ) => attachments.push({ asset, position: [x, y, z], rotation, scale, role });
  const entrance = { x: 0, z: masses[0].z + masses[0].depth / 2 };
  const sign = {
    x: 0,
    y: d.canopy ? d.groundHeight - .05 : d.groundHeight + .1,
    z: entrance.z + (d.canopy ? 1.67 : .23),
    width: 3.2,
    height: .55,
  };
  const surface =
    { garden: "#8c9d77", limestone: "#d5ceba", slate: "#7b8587" }[d.tile];
  box(0, .05, 0, 23.5, .24, 23.5, p.trim);
  box(0, .2, 0, 22.8, .1, 22.8, surface);
  if (lod === "near" && d.tile !== "garden") {
    for (let g = -8; g <= 8; g += 4) {
      box(g, .26, 0, .035, .01, 22.7, "#a8ada4");
      box(0, .26, g, 22.7, .01, .035, "#a8ada4");
    }
  }
  box(0, .29, (entrance.z + 11.4) / 2, 3.2, .08, 11.4 - entrance.z, p.trim);
  // Floor plates tessellate the union without overlapping faces at joined wings.
  for (const m of masses) {
    if (m.y === .65) box(m.x, .45, m.z, m.width, .4, m.depth, p.trim);
    box(m.x, m.y + .09, m.z, m.width, .18, m.depth, p.trim);
    box(m.x, m.y + m.height - .09, m.z, m.width, .18, m.depth, p.roof);
  }
  const family = {
    glass: ["Metal_Window_Half", "Metal_Plain_3", "Cornice_Metal_Center"],
    brick: ["Brick_Window_Trim", "Brick_Plain_1", "Cornice_Brick_Center"],
    boutique: ["Marble_Window", "Marble_Plain_3", "Cornice_Marble_Center"],
    creative: [
      "WhiteBrick_Window",
      "WhiteBrick_Plain_3",
      "Cornice_WhiteBrick_Center",
    ],
  }[d.architecture];
  const bayWidth = d.finish === "facade"
    ? (d.architecture === "boutique" || d.architecture === "creative" ? 4 : 2)
    : d.architecture === "glass"
    ? 2.8
    : 1.6;
  for (const wall of walls) {
    const { x, z, nx, nz, y, height, length } = wall,
      angle = Math.atan2(nx, nz),
      horizontal = nz !== 0;
    box(
      x - nx * .075,
      y + height / 2,
      z - nz * .075,
      horizontal ? length : .15,
      // Slabs own the bottom/top 18 cm; coplanar wall faces caused z-fighting.
      height - .36,
      horizontal ? .15 : length,
      p.wall,
    );
    box(
      x,
      y + height - .16,
      z,
      horizontal ? length : .22,
      .18,
      horizontal ? .22 : length,
      p.trim,
    );
    const top = !masses.some((m) =>
      Math.abs(m.y - y - height) < .001 && x - nx * .1 > m.x - m.width / 2 &&
      x - nx * .1 < m.x + m.width / 2 && z - nz * .1 > m.z - m.depth / 2 &&
      z - nz * .1 < m.z + m.depth / 2
    );
    if (top && d.roof === "parapet") {
      box(
        x,
        y + height + .24,
        z,
        horizontal ? length : .2,
        .48,
        horizontal ? .2 : length,
        p.trim,
      );
    }
    if (lod === "far") continue;
    for (
      const offset of fitBays(length, bayWidth, d.finish === "facade" ? 0 : .35)
    ) {
      const wx = x + (horizontal ? offset : 0),
        wz = z + (horizontal ? 0 : offset);
      const door = Math.abs(y - .65) < .01 && nz === 1 &&
        Math.abs(wz - entrance.z) < .01 && Math.abs(wx) < (bayWidth / 2 + 1.4);
      if (door) continue;
      const winH = Math.min(
        height - .65,
        d.architecture === "glass" || y === .65 ? height - .75 : 1.7,
      );
      box(
        wx + nx * .04,
        y + height * .5,
        wz + nz * .04,
        horizontal ? bayWidth : .08,
        winH,
        horizontal ? .08 : bayWidth,
        p.glass,
        d.finish === "facade" && y > .65 ? "facade" : undefined,
      );
      if (lod === "near" && (d.finish === "procedural" || y === .65)) {
        for (const side of [-1, 1]) {
          box(
            wx + (horizontal ? side * bayWidth / 2 : nx * .1),
            y + height * .5,
            wz + (horizontal ? nz * .1 : side * bayWidth / 2),
            horizontal ? .1 : .16,
            winH + .16,
            horizontal ? .16 : .1,
            p.trim,
          );
        }
      }
      if (d.finish === "facade" && lod === "near" && y > .65) {
        const plain = y > .65 &&
          ((Math.round(wx * 7 + wz * 11 + y) + d.seed) % 5 === 0) &&
          bayWidth === 2;
        if (plain && d.architecture === "brick") {
          for (let row = 0; row < 3; row++) {
            attach(family[1], wx, y + row, wz, angle, 1, "facade");
          }
        } else {attach(
            plain ? family[1] : family[0],
            wx,
            y,
            wz,
            angle,
            1,
            "facade",
          );}
      }
    }
    if (
      d.finish !== "procedural" && lod === "near" && top && d.roof !== "pitched"
    ) {
      const trimBays = fitBays(length, 2, .1, .65);
      for (const [index, off] of trimBays.entries()) {
        const ends = d.architecture === "glass"
          ? "Cornice_Metal"
          : d.architecture === "brick"
          ? "Cornice_Brick"
          : null;
        const asset = ends && trimBays.length > 1 &&
            (index === 0 || index === trimBays.length - 1)
          ? ends + (index === 0 ? "_L" : "_R")
          : family[2];
        attach(
          asset,
          x + (horizontal ? off : 0),
          y + height,
          z + (horizontal ? 0 : off),
          angle,
          1,
          "cornice",
        );
      }
    }
  }
  box(0, 1.85, entrance.z + .12, 2, 2.4, .2, p.glass);
  if (d.canopy) {
    box(0, d.groundHeight - .4, entrance.z + .7, 3.4, .2, 1.6, brand);
  }
  if (d.finish !== "procedural" && lod === "near") {
    for (let z = entrance.z + .3; z + 2 <= 11.4; z += 2) {
      attach("Floor_2x2", 0, .3, z, 0, 1, "paving");
    }
    attach("Door_1", 0, .65, entrance.z + .14, 0, 1, "door");
    attach(
      d.architecture === "glass" ? "DoorFrame_Metal_Single" : "DoorFrame_Trim",
      0,
      .65,
      entrance.z + .02,
      0,
      1,
      "entrance",
    );
    if (d.canopy) {
      attach(
        "Prop_Awning",
        0,
        d.groundHeight - .5,
        entrance.z + .1,
        0,
        1,
        "canopy",
      );
    }
  }
  const lastY = masses.at(-1)!.y;
  if (d.roof === "pitched") {
    const m = masses.at(-1)!;
    parts.push({
      kind: "roof",
      position: [m.x, m.y + m.height + .7, m.z],
      size: [m.width, 1.4, m.depth],
      color: p.roof,
    });
  }
  const rng = (i: number) => {
    let n = Math.imul(d.seed + i * 374761393, 668265263);
    n = (n ^ (n >>> 13)) >>> 0;
    return n / 4294967296;
  };
  if (d.roof === "planted") {
    for (const m of masses.filter((m) => m.y === lastY)) {
      box(
        m.x,
        m.y + m.height + .12,
        m.z,
        Math.max(1, m.width - 1),
        .24,
        Math.max(1, m.depth - 1),
        "#718d64",
      );
      if (lod === "near") {
        box(m.x, m.y + m.height + .35, m.z, 1.3, .45, 1.3, p.trim);
      }
    }
  }
  if (d.grounds !== "minimal" && lod !== "far") {
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? 9.8 : -9.8, z = (i < 2 ? -1 : 1) * (8.5 + rng(i));
      if (
        Math.abs(x) < 2 ||
        masses.filter((m) => m.y === .65).some((m) =>
          Math.abs(x - m.x) < m.width / 2 + 1.3 &&
          Math.abs(z - m.z) < m.depth / 2 + 1.3
        )
      ) continue;
      box(
        x,
        .5,
        z,
        1.7,
        .5,
        1.7,
        p.trim,
        d.finish !== "procedural" ? "props" : undefined,
      );
      if (d.grounds === "planted") {
        box(x, 1.2, z, .2, 1.1, .2, "#816f58");
        parts.push({
          kind: "tree",
          position: [x, 2.4, z],
          size: [.9, 1.2, .9],
          color: "#648657",
        });
      }
      if (d.finish !== "procedural" && lod === "near") {
        attach(
          d.grounds === "planted" ? "Prop_Planter_Single" : "Prop_Bollard",
          x,
          .25,
          z - 1,
          0,
          1,
          "props",
        );
      }
    }
  }
  return { parts, attachments, walls, masses, entrance, sign };
}
