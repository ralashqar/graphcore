import { KIT_DIMENSIONS as D } from "./cityKitDimensions.ts";
import type { Attachment, DesignPart, Wall } from "./cityBuildingV2.ts";
import type { BuildingMass } from "./cityBuildingDesign.ts";
import type { Corner, DesignSign, Slot } from "./cityBuildingV3.ts";
export const KIT_CORNERS = ["existing", "matching"] as const;
export const KIT_ROOFLINES = [
  "existing",
  "restrained",
  "classical",
  "industrial",
] as const;
export const KIT_ENTRANCES = [
  "existing",
  "wood",
  "metal",
  "grand-marble",
  "grand-concrete",
] as const;
export const KIT_FRONTAGES = [
  "existing",
  "cafe",
  "boutique",
  "department",
] as const;
export const KIT_ROOFS = ["existing", "slate", "slate-dormers"] as const;
export type ArchitecturalKit = {
  corners?: typeof KIT_CORNERS[number];
  roofline?: typeof KIT_ROOFLINES[number];
  entrance?: typeof KIT_ENTRANCES[number];
  frontage?: typeof KIT_FRONTAGES[number];
  roof?: typeof KIT_ROOFS[number];
  entranceSteps?: boolean;
  connectedPlanters?: boolean;
  stairRails?: boolean;
  ornaments?: boolean;
  rooftopUnits?: boolean;
};
export function kitEntrance(choice: ArchitecturalKit["entrance"]) {
  return choice === "wood"
    ? { frame: "DoorFrame_Wooden", leaf: "Door_2" }
    : choice === "metal"
    ? { frame: "DoorFrame_MetalBrick", leaf: "Door_3" }
    : choice === "grand-marble"
    ? {
      frame: "DoorFrame_Marble",
      leaf: "Door_4",
      steps: "Entrance_Marble_2x2",
    }
    : choice === "grand-concrete"
    ? {
      frame: "DoorFrame_WhiteBrick",
      leaf: "Door_3",
      steps: "Entrance_Concrete_2x2",
    }
    : null;
}
export function kitRoofReason(
  kit: ArchitecturalKit | undefined,
  blueprint: string,
  massing?: string,
) {
  return kit?.roof && kit.roof !== "existing" &&
      (blueprint !== "office" || massing === "hall-wings")
    ? "Slate roof assemblies need a rectangular footprint. Your selection is retained until it fits."
    : null;
}
type Bounds = { position: readonly number[]; size: readonly number[] };
export function attachmentBounds(a: Attachment): Bounds {
  const d = D[a.asset],
    s = a.axisScale || [a.scale, a.scale, a.scale],
    c = Math.cos(a.rotation),
    n = Math.sin(a.rotation);
  const w = d[0] * s[0], h = d[1] * s[1], dep = d[2] * s[2];
  return {
    position: [
      a.position[0] + n * dep / 2,
      a.position[1] + h / 2,
      a.position[2] + c * dep / 2,
    ],
    size: [
      Math.abs(c) * w + Math.abs(n) * dep,
      h,
      Math.abs(n) * w + Math.abs(c) * dep,
    ],
  };
}
const overlaps = (a: Bounds, b: Bounds) =>
  a.position.every((v, i) =>
    Math.abs(v - b.position[i]) < (a.size[i] + b.size[i]) / 2 - .015
  );
/** Native modules are rear-bottom-centred. Architectural assemblies never own wall holes. */
export function architecturalDetails(input: {
  kit: ArchitecturalKit;
  family: string;
  walls: Wall[];
  corners: Corner[];
  masses: BuildingMass[];
  entrance: { z: number; width: number };
  slots: Slot[];
  signs: DesignSign[];
  lod: "near" | "medium" | "far";
  roofActive: boolean;
  equipmentAllowed: boolean;
  seed: number;
  clearances?: Bounds[];
}) {
  const { kit, family, walls, corners, masses, entrance, slots, signs, lod } =
    input;
  const attachments: Attachment[] = [],
    parts: DesignPart[] = [],
    notes: string[] = [];
  const obstacles: Bounds[] = [
    ...(input.clearances || []),
    {
      position: [0, 1.8, (entrance.z + 11.5) / 2],
      size: [entrance.width + .3, 3.6, 11.5 - entrance.z],
    },
    ...signs.map((s) => ({
      position: [s.x, s.y, s.z],
      size: [
        Math.abs(Math.cos(s.rotation)) * s.width + .1,
        s.height,
        Math.abs(Math.sin(s.rotation)) * s.width + .1,
      ],
    })),
  ];
  const push = (
    asset: string,
    x: number,
    y: number,
    z: number,
    rotation: number,
    scale: number,
    role: string,
    axisScale?: [number, number, number],
    check = false,
  ) => {
    const a: Attachment = {
        asset,
        position: [x, y, z],
        rotation,
        scale,
        role,
        ...(axisScale ? { axisScale } : {}),
      },
      b = attachmentBounds(a);
    if (
      Math.abs(b.position[0]) + b.size[0] / 2 > 11.5 ||
      Math.abs(b.position[2]) + b.size[2] / 2 > 11.5 ||
      b.size.some((v) => v <= 0)
    ) return false;
    if (
      check &&
      (obstacles.some((o) => overlaps(b, o)) ||
        attachments.some((o) => overlaps(b, attachmentBounds(o))))
    ) return false;
    attachments.push(a);
    return true;
  };
  const onWall = (
    w: Wall,
    asset: string,
    offset: number,
    y: number,
    scale: number,
    role: string,
    axis?: [number, number, number],
    rear = .045,
    check = false,
  ) => {
    const angle = Math.atan2(w.nx, w.nz);
    return push(
      asset,
      w.x + Math.cos(angle) * offset + w.nx * rear,
      y,
      w.z - Math.sin(angle) * offset + w.nz * rear,
      angle,
      scale,
      role,
      axis,
      check,
    );
  };
  const top = (w: Wall) =>
    !masses.some((m) =>
      Math.abs(m.y - w.y - w.height) < .001 &&
      w.x - w.nx * .1 > m.x - m.width / 2 &&
      w.x - w.nx * .1 < m.x + m.width / 2 &&
      w.z - w.nz * .1 > m.z - m.depth / 2 && w.z - w.nz * .1 < m.z + m.depth / 2
    );
  if (lod === "far") {
    if (input.roofActive) {
      const m = masses.at(-1)!;
      parts.push({
        kind: "hip",
        position: [m.x, m.y + m.height + .9, m.z],
        size: [m.width, 1.8, m.depth],
        color: "#596268",
      });
    }
    return { attachments, parts, notes };
  }
  if (kit.corners === "matching" && lod === "near") {
    for (const c of corners.filter((c) => c.kind === "convex")) {
      const adjacent = walls.filter((w) =>
        w.y === c.y && (w.nz
          ? Math.abs(w.z - c.z) < .001 &&
            Math.abs(Math.abs(w.x - c.x) - w.length / 2) < .001
          : Math.abs(w.x - c.x) < .001 &&
            Math.abs(Math.abs(w.z - c.z) - w.length / 2) < .001)
      );
      if (adjacent.length !== 2) {
        continue;
      }
      const below = corners.some((b) =>
        Math.abs(b.y + b.height - c.y) < .001 && Math.abs(b.x - c.x) < .001 &&
        Math.abs(b.z - c.z) < .001
      );
      const above = corners.some((b) =>
        Math.abs(c.y + c.height - b.y) < .001 && Math.abs(b.x - c.x) < .001 &&
        Math.abs(b.z - c.z) < .001
      );
      const prefix = family === "brick"
        ? "Brick_CornerColumn"
        : family === "glass"
        ? "Metal_Column"
        : "Marble_BevelColumn";
      // Source bottom/centre/top pieces are complete storeys, not tiny trim segments.
      const scale = family === "brick" ? .55 : family === "glass" ? .8 : .65;
      const sequence = [
        prefix + (!below ? "_Bottom" : !above ? "_Top" : "_Center"),
      ];
      const available = c.height + (c.y === .65 ? .4 : 0),
        heights = [available];
      let y = c.y === .65 ? .25 : c.y;
      // Square posts own the corner once. A bevelled strip faces the diagonal,
      // avoiding two intersecting copies at the same corner.
      const faces = family === "brick" || family === "glass"
        ? [adjacent[0]]
        : [{nx:adjacent.reduce((n,w)=>n+w.nx,0)/Math.SQRT2,nz:adjacent.reduce((n,w)=>n+w.nz,0)/Math.SQRT2}];
      for (let i = 0; i < sequence.length; i++) {
        const asset = sequence[i], dim = D[asset], h = heights[i];
        for (const w of faces) {
          const angle = Math.atan2(w.nx, w.nz),
            x = c.x + w.nx * .07,
            z = c.z + w.nz * .07;
          const depth = dim[2] * scale;
          push(
            asset,
            x - Math.sin(angle) * depth / 2,
            y,
            z - Math.cos(angle) * depth / 2,
            angle,
            scale,
            "column",
            [scale, h / dim[1], scale],
            true,
          );
        }
        y += h;
      }
      if (!above && family === "brick") {
        const w = adjacent[0],
          angle = Math.atan2(w.nx, w.nz),
          dep = D.Brick_CornerColumn_Cap[2] * scale;
        push(
          "Brick_CornerColumn_Cap",
          c.x + w.nx * .07 - Math.sin(angle) * dep / 2,
          y,
          c.z + w.nz * .07 - Math.cos(angle) * dep / 2,
          angle,
          scale,
          "column",
          [scale, .18 / D.Brick_CornerColumn_Cap[1], scale],
          true,
        );
      }
    }
  }
  if (lod === "near" && kit.roofline && kit.roofline !== "existing") {
    for (const w of walls.filter(top)) {
      const f = kit.roofline === "industrial"
        ? "Metal"
        : kit.roofline === "restrained"
        ? "Small_Metal"
        : family === "brick"
        ? "Brick"
        : family === "creative"
        ? "WhiteBrick"
        : "Marble";
      const prefix = `Cornice_${f}`,
        center = D[prefix + "_Center"],
        scale = kit.roofline === "classical" ? .45 : .35;
      const cells = Math.max(3, Math.ceil(w.length / (2 * scale))),
        step = w.length / cells;
      const localAngle = Math.atan2(w.nx, w.nz);
      for (let i = 0; i < cells; i++) {
        const dir = i === 0 ? -1 : i === cells - 1 ? 1 : 0;
        const ex = w.x + Math.cos(localAngle) * dir * w.length / 2,
          ez = w.z - Math.sin(localAngle) * dir * w.length / 2;
        const convex = dir &&
          corners.some((c) =>
            c.kind === "convex" && c.y === w.y && Math.abs(c.x - ex) < .01 &&
            Math.abs(c.z - ez) < .01
          );
        const asset = prefix +
            (dir
              ? (convex ? "_90Angle_" : "_") + (dir < 0 ? "L" : "R")
              : "_Center"),
          dim = D[asset];
        // 90-degree pieces have an extra 0.5 m inward return; align their outer profiles.
        const rear = .045 - (dim[2] - center[2]) * scale;
        onWall(
          w,
          asset,
          -w.length / 2 + (i + .5) * step,
          w.y + w.height + .02,
          scale,
          "cornice",
          [step / dim[0], scale, scale],
          rear,
        );
      }
    }
  }
  if (kit.frontage && kit.frontage !== "existing") {
    const w = walls.find((w) =>
      w.y === .65 && w.nz === 1 && Math.abs(w.z - entrance.z) < .001 &&
      Math.abs(w.x) < w.length / 2
    );
    if (w) {
      const width = Math.min(
          w.length - .8,
          kit.frontage === "cafe" ? 6 : kit.frontage === "boutique" ? 5 : 12,
        ),
        scale = Math.min(
          1,
          width / D.Prop_Awning_Long[0],
          (10.7 - w.z) / D.Prop_Awning_Long[2],
        );
      if (scale > .3) {
        const count = kit.frontage === "department" ? 2 : 1,
          span = width / count;
        for (let i = 0; i < count; i++) {
          push(
            "Prop_Awning_Long",
            -width / 2 + (i + .5) * span,
            w.y + w.height - .5,
            w.z + .06,
            0,
            scale,
            "frontage",
            [span / D.Prop_Awning_Long[0], scale, scale],
          );
        }
      } else notes.push("The awning needs more forecourt depth.");
    }
  }
  if (input.roofActive) {
    const m = masses.at(-1)!, scale = .6, inset = 2 * scale, y = m.y + m.height;
    const roofAssets = new Set<string>();
    for (const w of walls.filter((w) => w.y === m.y)) {
      const count = Math.max(
          1,
          Math.round((w.length - 2 * inset) / (2 * scale)),
        ),
        span = (w.length - 2 * inset) / count;
      for (let i = 0; i < count; i++) {
        const asset =
          kit.roof === "slate-dormers" && i === Math.floor(count / 2) &&
            w.nz === 1
            ? "Roof_Slate_Window_1"
            : "Roof_Slate_Center";
        // Source slopes rise away from the outside edge: rear plane sits at the inner rim.
        onWall(
          w,
          asset,
          -w.length / 2 + inset + (i + .5) * span,
          y,
          scale,
          "roof",
          [span / 2, scale, scale],
          -inset,
        );
        roofAssets.add(asset);
      }
    }
    for (
      const [sx, sz, angle] of [[-1, 1, 0], [1, 1, Math.PI / 2], [
        1,
        -1,
        Math.PI,
      ], [-1, -1, -Math.PI / 2]]
    ) {
      const dim = D.Roof_Slate_Corner;
      const cx = m.x + sx * (m.width / 2 - inset / 2),
        cz = m.z + sz * (m.depth / 2 - inset / 2);
      push(
        "Roof_Slate_Corner",
        cx - Math.sin(angle) * inset / 2,
        y,
        cz - Math.cos(angle) * inset / 2,
        angle,
        scale,
        "roof",
        [inset / dim[0], 3 * scale / dim[1], inset / dim[2]],
      );
    }
    roofAssets.add("Roof_Slate_Corner");
    parts.push({
      kind: "box",
      position: [m.x, y + 3 * scale - .08, m.z],
      size: [m.width - 2 * inset, .16, m.depth - 2 * inset],
      color: "#596268",
      squareEdges: true,
    });
    // Closed low-detail/loading roof; disappears only when the entire native roof is available.
    parts.push({
      kind: "hip",
      position: [m.x, y + .9, m.z],
      size: [m.width, 1.8, m.depth],
      color: "#596268",
      fallback: "facade",
      fallbackAssets: [...roofAssets],
    });
  }
  if (lod === "near") {
    if (kit.connectedPlanters) {
      for (
        const slot of slots.filter((s) =>
          s.active && s.selected === "planter" && s.id.startsWith("ground.")
        )
      ) {
        const [x, , z] = slot.position, scale = .5, span = 3;
        const bounds = { position: [x, .55, z], size: [span, .6, 1] };
        if (
          obstacles.some((o) => overlaps(bounds, o)) ||
          masses.some((m) =>
            overlaps(bounds, {
              position: [m.x, m.y + m.height / 2, m.z],
              size: [m.width, m.height, m.depth],
            })
          )
        ) continue;
        for (let i = 0; i < 3; i++) {
          push(
            [
              "Prop_Planter_Side_L",
              "Prop_Planter_Center",
              "Prop_Planter_Side_R",
            ][i],
            x - 1 + i,
            .25,
            z - .5,
            0,
            scale,
            "planter-run",
            [scale, 1, scale],
          );
        }
      }
    }
    if (kit.ornaments) {
      for (const w of walls.filter(top).filter((w) => w.length >= 6)) {
        const asset = input.seed % 2 ? "Prop_Ornament_1" : "Prop_Ornament_2",
          scale = .65;
        onWall(
          w,
          asset,
          0,
          w.y + w.height - .65,
          scale,
          "ornament",
          undefined,
          .055,
          true,
        );
      }
    }
    if (kit.rooftopUnits && input.equipmentAllowed) {
      const m = masses.at(-1)!;
      push(
        "Prop_ACUnit",
        m.x + m.width / 2 - 1.5,
        m.y + m.height + .05,
        m.z - m.depth / 2 + 1,
        0,
        1,
        "equipment",
        undefined,
        true,
      );
    }
  }
  return { attachments, parts, notes };
}
