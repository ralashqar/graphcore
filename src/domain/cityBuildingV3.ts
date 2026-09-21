import { archetypeParts, roofVariants, type ArchetypeChoices } from "./cityBuildingArchetypes.ts";
import { frontStructure, ENTRANCE_STYLES } from "./cityBuildingEntrances.ts";
import { groundsParts, type GroundsChoices } from "./cityBuildingGrounds.ts";
import type {
  BuildingMass,
  CityBuildingDesignV1,
} from "./cityBuildingDesign.ts";
import {
  type Attachment,
  type CityBuildingDesignV2,
  DEFAULT_DESIGN_V2,
  type DesignPart,
  exposedWalls,
  fitBays,
  massesV2,
  normalizeDesign,
  type ResolvedDesign,
  resolveDesign,
  upgradeDesign,
} from "./cityBuildingV2.ts";
export const SLOT_IDS = [
  "brand.entrance",
  "brand.facade",
  "brand.roof",
  "campaign.side",
  "canopy.entrance",
  "ground.left",
  "ground.right",
  "terrace.left",
  "terrace.right",
] as const;
export type SlotId = typeof SLOT_IDS[number];
export const COMPONENTS = [
  "brand",
  "campaign",
  "canopy",
  "planter",
  "bollards",
] as const;
export type ComponentId = typeof COMPONENTS[number];
export type CityBuildingDesignV3 = Omit<CityBuildingDesignV2, "version"> & GroundsChoices & ArchetypeChoices & {
  version: 3;
  generatorRevision: "city-grammar-1";
  entranceStyle?: typeof ENTRANCE_STYLES[number];
  base: "storefront" | "lobby" | "plinth";
  middleFloors: number;
  rhythm: "vertical" | "ribbon" | "alternating";
  crown: "none" | "recessed" | "penthouse" | "terrace";
  crownSetback: number;
  facadeSeed: number;
  groundsSeed: number;
  density: "restrained" | "full";
  slots: Partial<Record<SlotId, ComponentId | null>>;
};
export type Slot = {
  id: SlotId;
  label: string;
  position: [number, number, number];
  size: [number, number, number];
  rotation: number;
  compatible: ComponentId[];
  selected: ComponentId | null;
  active: boolean;
  reason: string | null;
};
export type DesignSign = ResolvedDesign["sign"] & {
  rotation: number;
  campaign: boolean;
};
export type Corner = {
  x: number;
  z: number;
  y: number;
  height: number;
  kind: "convex" | "concave" | "end";
};
export type ResolvedV3 = ResolvedDesign & {
  slots: Slot[];
  signs: DesignSign[];
  corners: Corner[];
};
export function identitySeed(id: string) {
  let n = 2166136261;
  for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return (n >>> 0) % 1000000;
}
export function newDesign(id: string): CityBuildingDesignV3 {
  const seed = identitySeed(id);
  return {
    ...DEFAULT_DESIGN_V2,
    version: 3,
    generatorRevision: "city-grammar-1",
    base: "lobby",
    middleFloors: 2,
    rhythm: "vertical",
    crown: "recessed",
    crownSetback: 1,
    facadeSeed: seed,
    groundsSeed: identitySeed(id + ":grounds"),
    seed,
    density: "restrained",
    slots: {
      "brand.entrance": "brand",
      "canopy.entrance": "canopy",
      "ground.left": "planter",
      "ground.right": "planter",
    },
  };
}
export function upgradeV3(
  d: CityBuildingDesignV1 | CityBuildingDesignV2,
): CityBuildingDesignV3 {
  const v = d.version === 1 ? upgradeDesign(d) : d;
  return normalizeV3({
    ...newDesign(String(v.seed)),
    ...v,
    version: 3,
    middleFloors: v.floors - 1,
    crown: "none",
    facadeSeed: v.seed,
    groundsSeed: v.seed,
    slots: {
      "brand.entrance": "brand",
      "canopy.entrance": v.canopy ? "canopy" : null,
      "ground.left": v.grounds === "minimal"
        ? null
        : v.grounds === "urban"
        ? "bollards"
        : "planter",
      "ground.right": v.grounds === "minimal"
        ? null
        : v.grounds === "urban"
        ? "bollards"
        : "planter",
    },
  });
}
export function normalizeV3(d: CityBuildingDesignV3): CityBuildingDesignV3 {
  return {
    ...d,
    ...normalizeDesign({ ...d, version: 2 }),
    version: 3,
    width: Math.max(d.blueprint === "office" && d.massing !== "hall-wings" ? 8 : 12, d.finish === "procedural" ? d.width : Math.round(d.width / 2) * 2),
    depth: Math.max(d.blueprint === "office" && d.massing !== "hall-wings" ? 8 : 10, d.finish === "procedural" ? d.depth : Math.round(d.depth / 2) * 2),
    floors: 1 + d.middleFloors + (d.crown === "none" ? 0 : 1),
    canopy: d.slots["canopy.entrance"] === "canopy",
    ...(d.roofVariant && !roofVariants(d).includes(d.roofVariant) ? {roofVariant:"standard" as const} : {}),
    ...(d.massing === "hall-wings" && d.roof === "pitched" ? {roof:"parapet" as const} : {}),
  };
}
export const COMPOSITIONS: {
  name: string;
  patch: Partial<CityBuildingDesignV3>;
}[] = [
  {
    name: "Retail flagship",
    patch: {
      archetype: "shop",
      blueprint: "office",
      base: "storefront",
      middleFloors: 1,
      crown: "none",
      architecture: "boutique",
      rhythm: "vertical",
      roof: "parapet",
      grounds: "urban",
    },
  },
  {
    name: "Glass headquarters",
    patch: {
      blueprint: "office",
      base: "lobby",
      middleFloors: 4,
      crown: "penthouse",
      architecture: "glass",
      rhythm: "ribbon",
      roof: "flat",
    },
  },
  {
    name: "Brick creative studio",
    patch: {
      blueprint: "office",
      base: "storefront",
      middleFloors: 2,
      crown: "none",
      architecture: "brick",
      rhythm: "alternating",
      roof: "pitched",
    },
  },
  {
    name: "Stepped garden office",
    patch: {
      blueprint: "terraces",
      base: "lobby",
      middleFloors: 3,
      crown: "terrace",
      architecture: "creative",
      rhythm: "vertical",
      roof: "planted",
    },
  },
  {
    name: "Courtyard workspace",
    patch: {
      blueprint: "courtyard",
      base: "lobby",
      middleFloors: 2,
      crown: "recessed",
      architecture: "brick",
      rhythm: "vertical",
      roof: "planted",
    },
  },
  {
    name: "Corner showroom",
    patch: {
      archetype: "shop",
      blueprint: "l-shape",
      base: "storefront",
      middleFloors: 1,
      crown: "penthouse",
      architecture: "boutique",
      rhythm: "alternating",
      roof: "parapet",
    },
  },
  { name: "Terrace cafe", patch: { archetype: "cafe", roofVariant: "shed", blueprint: "office", width: 12, depth: 10, middleFloors: 0, crown: "none", podium: false, base: "storefront", architecture: "boutique", roof: "flat", entranceStyle: "wide-canopy", pavingPattern: "terracotta", grounds: "planted" } },
  { name: "Gabled cafe", patch: { archetype: "cafe", blueprint: "office", width: 12, depth: 10, middleFloors: 0, crown: "none", podium: false, base: "storefront", architecture: "brick", roof: "pitched", entranceStyle: "wide-canopy", pavingPattern: "ribbon" } },
  { name: "Village shop", patch: { archetype: "shop", blueprint: "office", width: 12, depth: 10, middleFloors: 1, crown: "none", podium: false, base: "storefront", architecture: "boutique", roof: "pitched", slots: { "canopy.entrance": null }, pavingPattern: "checker" } },
  { name: "Canopy kiosk", patch: { archetype: "kiosk", blueprint: "office", width: 8, depth: 8, middleFloors: 0, crown: "none", podium: false, groundHeight: 3, base: "storefront", architecture: "creative", roof: "flat", entranceStyle: "wide-canopy", grounds: "urban" } },
  { name: "Gabled kiosk", patch: { archetype: "kiosk", blueprint: "office", width: 8, depth: 8, middleFloors: 0, crown: "none", podium: false, groundHeight: 3, base: "storefront", architecture: "brick", roof: "pitched", slots: { "canopy.entrance": null }, pavingPattern: "terracotta" } },
  { name: "City museum", patch: { archetype: "museum", massing: "hall-wings", blueprint: "office", width: 16, depth: 12, middleFloors: 1, crown: "recessed", podium: true, base: "lobby", architecture: "creative", roof: "flat", entranceStyle: "portico", slots: { "canopy.entrance": null }, pavingPattern: "ribbon", grounds: "minimal" } },
  { name: "Civic bank", patch: { archetype: "bank", blueprint: "office", width: 18, depth: 12, middleFloors: 1, crown: "none", podium: false, base: "plinth", architecture: "boutique", roof: "parapet", entranceStyle: "pediment", slots: { "canopy.entrance": null }, pavingPattern: "checker", grounds: "urban" } },
  { name: "Boutique hotel", patch: { archetype: "hotel", slots: { "canopy.entrance": null }, blueprint: "terraces", width: 14, depth: 12, middleFloors: 3, crown: "penthouse", podium: true, base: "lobby", architecture: "boutique", roof: "planted", grounds: "planted", pavingPattern: "basalt" } },
];
export function applyComposition(d: CityBuildingDesignV3, index: number) {
  const p = COMPOSITIONS[index];
  return normalizeV3({
    ...newDesign(String(d.seed)),
    ...p.patch,
    seed: d.seed,
    facadeSeed: d.facadeSeed,
    groundsSeed: d.groundsSeed,
    palette: d.palette,
    finish: d.finish,
    slots: {
      ...newDesign(String(d.seed)).slots,
      "ground.left": p.patch.grounds === "minimal" ? null : p.patch.grounds === "urban" ? "bollards" : "planter",
      "ground.right": p.patch.grounds === "minimal" ? null : p.patch.grounds === "urban" ? "bollards" : "planter",
      ...p.patch.slots,
    },
  });
}
export function massesV3(d: CityBuildingDesignV3): BuildingMass[] {
  const n = normalizeV3(d),
    raw = massesV2({ ...n, version: 2 }),
    last = raw.at(-1)!.y,
    result: BuildingMass[] = [];
  if (n.massing === "hall-wings" && n.blueprint === "office") {
    const floors = [...raw]; raw.length = 0;
    for (const m of floors) {
      const centerWidth = m.width / 2;
      raw.push({...m, width:centerWidth});
      if (m.y === .65 || m.y < last) for (const side of [-1,1]) raw.push({...m, x:side*m.width*3/8, z:-m.depth*.175, width:m.width/4, depth:m.depth*.65});
    }
  }
  for (const y of [...new Set(raw.map((m) => m.y))]) {
    const previous = result.length
      ? result.filter((m) => m.y === result.at(-1)!.y)
      : [];
    for (const original of raw.filter((m) => m.y === y)) {
      const inset = y === last && n.crown !== "none" ? n.crownSetback : 0;
      const m = {
        ...original,
        width: Math.max(2, original.width - 2 * inset),
        depth: Math.max(2, original.depth - 2 * inset),
      };
      if (!previous.length) {
        result.push(m);
        continue;
      }
      for (const support of previous) {
        const x0 = Math.max(m.x - m.width / 2, support.x - support.width / 2),
          x1 = Math.min(m.x + m.width / 2, support.x + support.width / 2),
          z0 = Math.max(m.z - m.depth / 2, support.z - support.depth / 2),
          z1 = Math.min(m.z + m.depth / 2, support.z + support.depth / 2);
        if (x1 - x0 > .5 && z1 - z0 > .5) {
          result.push({
            ...m,
            x: (x0 + x1) / 2,
            z: (z0 + z1) / 2,
            width: x1 - x0,
            depth: z1 - z0,
          });
        }
      }
    }
  }
  return result;
}
export function classifyCorners(masses: BuildingMass[]): Corner[] {
  const walls = exposedWalls(masses), seen = new Map<string, Corner>();
  for (const w of walls) {
    for (const dir of [-1, 1]) {
      const x = w.x + (w.nz ? dir * w.length / 2 : 0),
        z = w.z + (w.nx ? dir * w.length / 2 : 0),
        key = [x, z, w.y].join(":");
      if (seen.has(key)) continue;
      let filled = 0;
      for (const dx of [-.01, .01]) {
        for (const dz of [-.01, .01]) {
          if (
            masses.some((m) =>
              m.y === w.y && x + dx > m.x - m.width / 2 &&
              x + dx < m.x + m.width / 2 && z + dz > m.z - m.depth / 2 &&
              z + dz < m.z + m.depth / 2
            )
          ) filled++;
        }
      }
      if (filled !== 2) {
        seen.set(key, {
          x,
          z,
          y: w.y,
          height: w.height,
          kind: filled === 3 ? "concave" : filled === 1 ? "convex" : "end",
        });
      }
    }
  }
  return [...seen.values()];
}
export function overlaps(
  a: { position: number[]; size: number[] },
  b: { position: number[]; size: number[] },
) {
  return a.position.every((v, i) =>
    Math.abs(v - b.position[i]) < (a.size[i] + b.size[i]) / 2 - .001
  );
}
export function buildingSlots(
  d: CityBuildingDesignV3,
  masses = massesV3(d),
): Slot[] {
  const ground = masses[0],
    top = masses.find((m) => m.y === masses.at(-1)!.y)!,
    front = ground.z + ground.depth / 2,
    slots: Slot[] = [];
  const structure = frontStructure(d.entranceStyle, d.blueprint, front, ground.width, d.groundHeight, d.palette.wall, d.palette.trim);
  const put = (
    id: SlotId,
    label: string,
    position: Slot["position"],
    size: Slot["size"],
    compatible: ComponentId[],
    rotation = 0,
    reason: string | null = null,
  ) =>
    slots.push({
      id,
      label,
      position,
      size,
      rotation,
      compatible,
      selected: d.slots[id] || null,
      active: !reason && !!d.slots[id],
      reason,
    });
  put(
    "brand.entrance",
    "Entrance sign",
    [0, d.groundHeight + (structure.depth ? .55 : .35), front + (structure.depth || 0) + .32],
    [3.2, structure.depth ? .45 : .55, .3],
    ["brand"],
  );
  put(
    "brand.facade",
    "Façade sign",
    [top.x, top.y + 1.5, top.z + top.depth / 2 + .32],
    [Math.min(4, top.width - 1), 1, .3],
    ["brand"],
    0,
    d.floors < 2 ? "Add an upper floor to use this sign." : null,
  );
  put(
    "brand.roof",
    "Roof-edge sign",
    [top.x, top.y + top.height + .65, top.z + top.depth / 2 + .85],
    [Math.min(6, top.width - 1), 1, .3],
    ["brand"],
    0,
    d.roof === "pitched" || (d.roofVariant && d.roofVariant !== "standard") ? "A pitched roof does not support this sign." : null,
  );
  const right =
    masses.filter((m) => m.y === .65).sort((a, b) =>
      (b.x + b.width / 2) - (a.x + a.width / 2)
    )[0];
  put(
    "campaign.side",
    "Campaign panel",
    [right.x + right.width / 2 + .32, 2.15, right.z],
    [.3, 1.2, Math.min(3, right.depth - 1)],
    ["campaign"],
    Math.PI / 2,
  );
  put(
    "canopy.entrance",
    "Entrance canopy",
    [0, d.groundHeight - .2, front + 1],
    [d.entranceStyle === "wide-canopy" && d.blueprint === "office" ? Math.min(10, ground.width - 1) : 3.4, .4, 1.8],
    ["canopy"],
    0,
    structure.depth ? "The portico replaces this canopy. Your selection is retained." : null,
  );
  for (const [i, side] of ["left", "right"].entries()) {
    const sign = i ? 1 : -1,
      shift = (identitySeed(String(d.groundsSeed) + side) % 5) * .1;
    put(
      ("ground." + side) as SlotId,
      side + " forecourt",
      [sign * 9.8, 1.4, 9.5 - shift],
      [2, 2.3, 2],
      ["planter", "bollards"],
    );
    put(
      ("terrace." + side) as SlotId,
      side + " terrace",
      [
        top.x + sign * Math.max(0, top.width / 2 - 1.5),
        top.y + top.height + .6,
        top.z,
      ],
      [1.2, 1.2, 1.2],
      ["planter"],
      0,
      d.roof === "pitched" || (d.roofVariant && d.roofVariant !== "standard") || top.width < 5 || top.depth < 3
        ? "This roof has no clear planter area."
        : null,
    );
  }
  const occupied: Slot[] = [];
  for (const slot of slots) {
    if (
      !slot.reason &&
      (!slot.compatible.includes(slot.selected!) && slot.selected)
    ) slot.reason = "This component is incompatible with the slot.";
    if (
      !slot.reason &&
      (Math.abs(slot.position[0]) + slot.size[0] / 2 > 11.8 ||
        Math.abs(slot.position[2]) + slot.size[2] / 2 > 11.8)
    ) slot.reason = "The component would cross the plot boundary.";
    if (
      !slot.reason && slot.id.startsWith("ground.") &&
      masses.some((m) =>
        m.y === .65 &&
        overlaps(slot, {
          position: [m.x, m.y + m.height / 2, m.z],
          size: [m.width + .3, m.height, m.depth + .3],
        })
      )
    ) slot.reason = "The building needs this clearance.";
    if (
      !slot.reason && slot.selected &&
      occupied.some((other) => overlaps(slot, other))
    ) slot.reason = "Another selected attachment occupies this space.";
    if (!slot.reason && structure.envelope && slot.id !== "brand.entrance" && overlaps(slot, structure.envelope)) slot.reason = "The entrance structure needs this clearance.";
    slot.active = !!slot.selected && !slot.reason;
    if (slot.active) occupied.push(slot);
  }
  return slots;
}
export function resolveCurrent(
  d: CityBuildingDesignV2 | CityBuildingDesignV3,
  brand: string,
  lod: "near" | "medium" | "far" = "near",
) {
  return d.version === 3
    ? resolveV3(d, brand, lod)
    : resolveDesign(d, brand, lod);
}
export function resolveV3(
  input: CityBuildingDesignV3,
  brand: string,
  lod: "near" | "medium" | "far" = "near",
): ResolvedV3 {
  const d = normalizeV3(input),
    p = d.palette,
    masses = massesV3(d),
    walls = exposedWalls(masses),
    parts: DesignPart[] = [],
    attachments: Attachment[] = [];
  const detailArchitecture = ({ brick: "brick", "white-brick": "creative", marble: "boutique", metal: "glass" } as const)[d.detailSet as "brick" | "white-brick" | "marble" | "metal"] ?? d.architecture;
  const facadeEnabled = d.finish === "facade" && (!d.detailScope || d.detailScope === "all");
  const slots = buildingSlots(d, masses), corners = classifyCorners(masses);
  const signs: DesignSign[] = slots.filter((s) =>
    s.active && (s.selected === "brand" || s.selected === "campaign")
  ).map((s) => ({
    x: s.position[0],
    y: s.position[1],
    z: s.position[2],
    width: s.rotation ? s.size[2] : s.size[0],
    height: s.size[1],
    rotation: s.rotation,
    campaign: s.selected === "campaign",
  }));
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
  ) => {
    if (d.detailScope === "entrance" && (role === "facade" || role === "cornice")) return;
    if (d.detailScope === "crown" && (role === "facade" || role === "door" || role === "entrance")) return;
    attachments.push({ asset, position: [x, y, z], rotation, scale, role });
  };
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
  if (lod === "near" && d.tile !== "garden" && (!d.pavingPattern || d.pavingPattern === "classic")) {
    for (let g = -8; g <= 8; g += 4) {
      box(g, .26, 0, .035, .01, 22.7, "#a8ada4");
      box(0, .26, g, 22.7, .01, .035, "#a8ada4");
    }
  }
  box(0, .29, (entrance.z + 11.4) / 2, 3.2, .08, 11.4 - entrance.z, p.trim);
  parts.push(...groundsParts(d, lod));
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
  }[detailArchitecture];
  const bayWidth = facadeEnabled
    ? (detailArchitecture === "boutique" || detailArchitecture === "creative" ? 4 : 2)
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
      d.crown === "penthouse" && y === masses.at(-1)!.y ? p.glass : p.wall,
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
    if (top && d.roof === "parapet" && (!d.roofVariant || d.roofVariant === "standard")) {
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
      const offset of fitBays(length, bayWidth, facadeEnabled ? 0 : .35)
    ) {
      const wx = x + (horizontal ? offset : 0),
        wz = z + (horizontal ? 0 : offset);
      const door = Math.abs(y - .65) < .01 && nz === 1 &&
        Math.abs(wz - entrance.z) < .01 && Math.abs(wx) < (bayWidth / 2 + 1.4);
      const reserved = slots.some((s) =>
        s.active && (s.selected === "brand" || s.selected === "campaign") &&
        overlaps({
          position: [wx + nx * .2, y + height / 2, wz + nz * .2],
          size: [
            horizontal ? bayWidth : .6,
            height,
            horizontal ? .6 : bayWidth,
          ],
        }, s)
      );
      if (door || reserved) continue;
      if (y === .65 && d.base === "plinth") continue;
      const panel = y > .65 && d.rhythm === "alternating" &&
        (Math.round(offset / bayWidth) + d.facadeSeed) % 2 === 0;
      if (panel) {
        box(
          wx + nx * .04,
          y + height / 2,
          wz + nz * .04,
          horizontal ? bayWidth : .08,
          height - .6,
          horizontal ? .08 : bayWidth,
          p.trim,
        );
        continue;
      }
      const winH = Math.min(
        height - .65,
        y === .65
          ? (d.base === "storefront" ? height - .75 : height - 1.1)
          : d.rhythm === "ribbon"
          ? 1.2
          : d.architecture === "glass"
          ? height - .75
          : 1.7,
      );
      box(
        wx + nx * .04,
        y + height * .5,
        wz + nz * .04,
        horizontal ? bayWidth : .08,
        winH,
        horizontal ? .08 : bayWidth,
        p.glass,
        facadeEnabled && d.rhythm !== "ribbon" && y > .65
          ? "facade"
          : undefined,
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
      if (
        facadeEnabled && d.rhythm !== "ribbon" && lod === "near" &&
        y > .65
      ) {
        const plain = y > .65 &&
          ((Math.round(wx * 7 + wz * 11) + d.facadeSeed) % 5 === 0) &&
          bayWidth === 2;
        if (plain && detailArchitecture === "brick") {
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
      d.finish !== "procedural" && lod === "near" && top && d.roof !== "pitched" && (!d.roofVariant || d.roofVariant === "standard")
    ) {
      const trimBays = fitBays(length, 2, .1, .65);
      for (const [index, off] of trimBays.entries()) {
        const ends = detailArchitecture === "glass"
          ? "Cornice_Metal"
          : detailArchitecture === "brick"
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
  parts.push(...frontStructure(d.entranceStyle, d.blueprint, entrance.z, masses[0].width, d.groundHeight, p.wall, p.trim).parts);
  const canopy = slots.find((s) => s.id === "canopy.entrance")!;
  if (canopy.active) box(...canopy.position, ...canopy.size, brand);
  if (d.finish !== "procedural" && lod === "near") {
    for (let z = entrance.z + .3; z + 2 <= 11.4; z += 2) {
      attach("Floor_2x2", 0, .3, z, 0, 1, "paving");
    }
    attach("Door_1", 0, .65, entrance.z + .14, 0, 1, "door");
    attach(
      detailArchitecture === "glass" ? "DoorFrame_Metal_Single" : "DoorFrame_Trim",
      0,
      .65,
      entrance.z + .02,
      0,
      1,
      "entrance",
    );
  }
  const entranceWall = walls.find(w => w.y === .65 && w.nz === 1 && Math.abs(w.z - entrance.z) < .001 && Math.abs(w.x) < w.length / 2);
  const frontage = entranceWall ? 2 * Math.min(entranceWall.length / 2 - entranceWall.x, entranceWall.length / 2 + entranceWall.x) : masses[0].width;
  parts.push(...archetypeParts(d.archetype, frontage, masses[0].depth, entrance.z, d.groundHeight, p.trim, brand, lod));
  if (d.roofVariant && d.roofVariant !== "standard") {
    const tops = masses.filter(m => !masses.some(upper => Math.abs(upper.y-m.y-m.height)<.001 && Math.abs(upper.x-m.x)<upper.width/2 && Math.abs(upper.z-m.z)<upper.depth/2));
    for (const m of tops) {
      const count = d.roofVariant === "sawtooth" ? 3 : 1;
      for (let i=0;i<count;i++) parts.push({kind:d.roofVariant === "hip" ? "hip" : "shed", position:[m.x,m.y+m.height+.7,m.z-m.depth/2+(i+.5)*m.depth/count],size:[m.width,1.4,m.depth/count],color:p.roof});
    }
  }
  const lastY = masses.at(-1)!.y;
  if (d.roof === "pitched" && (!d.roofVariant || d.roofVariant === "standard")) {
    const m = masses.at(-1)!;
    parts.push({
      kind: "roof",
      position: [m.x, m.y + m.height + .7, m.z],
      size: [m.width, 1.4, m.depth],
      color: p.roof,
    });
  }
  if ((!d.roofVariant || d.roofVariant === "standard") && (d.roof === "planted" || d.crown === "terrace")) {
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

  if (lod !== "far") {
    for (
      const slot of slots.filter((s) =>
        s.active && (s.selected === "planter" || s.selected === "bollards")
      )
    ) {
      const [x, y, z] = slot.position;
      if (slot.selected === "bollards") {
        for (const dx of [-.6, .6]) box(x + dx, .75, z, .18, 1, .18, p.trim);
      } else {
        const terrace = slot.id.startsWith("terrace."), w = terrace ? 1.1 : 1.7;
        box(
          x,
          y - slot.size[1] / 2 + .25,
          z,
          w,
          .5,
          w,
          p.trim,
          d.finish !== "procedural" && !terrace ? "props" : undefined,
        );
        if (lod === "near" && d.finish !== "procedural" && !terrace) {
          attach("Prop_Planter_Single", x, .25, z - 1, 0, 1, "props");
        }
        for (
          const offset of !terrace && d.density === "full"
            ? [-.35, 0, .35]
            : [0]
        ) {
          parts.push({
            kind: "tree",
            position: [x + offset, y + (terrace ? .1 : .25), z],
            size: terrace
              ? [.45, .45, .45]
              : d.density === "full"
              ? [.45, .6, .45]
              : [.7, .7, .7],
            color: "#648657",
          });
        }
      }
    }
  }
  if (lod === "near") {
    for (const corner of corners) {
      // Narrow procedural corner posts preserve clearance where 2 m native blocks cannot fit.
      if (corner.kind === "convex") {
        box(
          corner.x,
          corner.y + corner.height / 2,
          corner.z,
          .14,
          corner.height,
          .14,
          p.trim,
        );
      }
    }
  }
  return {
    parts,
    attachments,
    walls,
    masses,
    entrance,
    sign,
    slots,
    signs,
    corners,
  };
}
