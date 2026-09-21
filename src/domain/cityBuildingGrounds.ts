import type { DesignPart } from "./cityBuildingV2.ts";
export const ENCLOSURES = ["none", "garden-wall", "brick-court", "open-rail"] as const;
export const PAVING_PATTERNS = ["classic", "checker", "terracotta", "basalt", "ribbon"] as const;
export const DETAIL_SETS = ["matching", "brick", "white-brick", "marble", "metal"] as const;
export const DETAIL_SCOPES = ["all", "entrance", "crown"] as const;
export type GroundsChoices = {
  enclosure?: typeof ENCLOSURES[number];
  pavingPattern?: typeof PAVING_PATTERNS[number];
  detailSet?: typeof DETAIL_SETS[number];
  detailScope?: typeof DETAIL_SCOPES[number];
};
export function groundsParts(d: GroundsChoices, lod: "near" | "medium" | "far"): DesignPart[] {
  const parts: DesignPart[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, depth: number, color: string) =>
    parts.push({ kind: "box", position: [x,y,z], size: [w,h,depth], color });
  const pattern = d.pavingPattern ?? "classic";
  if (pattern !== "classic") {
    const colors = { checker: ["#ded8c8", "#8b9390"], terracotta: ["#ba8e76", "#d0aa8d"], basalt: ["#687579", "#829091"], ribbon: ["#d4c9ae", "#9daba3"] }[pattern];
    box(0, .26, 0, 22.7, .02, 22.7, colors[0]);
    if (lod !== "far") {
      if (pattern === "ribbon") {
        for (let x = -9; x <= 9; x += 3) box(x, .28, 0, .75, .02, 22.6, colors[1]);
      } else {
        for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) {
          box(-9.6 + col*3.2, .28, -9.6 + row*3.2, 3.16, .02, 3.16,
            colors[(row + col) % 2]);
        }
      }
    }
  }
  if (!d.enclosure || d.enclosure === "none") return parts;
  const rail = d.enclosure === "open-rail", brick = d.enclosure === "brick-court";
  const wall = brick ? "#ac7e68" : "#d1cabc", cap = brick ? "#d7c8b3" : "#e4decd";
  // Fixed perimeter lies outside the maximum footprint and decoration envelopes.
  // A 4.4 m opening remains aligned with the 3.2 m entrance path under plot rotation.
  const segments = [
    [-11.05, 0, .35, 21.75], [11.05, 0, .35, 21.75],
    [0, -11.05, 22.45, .35], [-6.625, 11.05, 8.85, .35], [6.625, 11.05, 8.85, .35],
  ];
  for (const [x,z,w,depth] of segments) {
    box(x, rail ? .4 : .64, z, w, rail ? .3 : .78, depth, wall);
    box(x, rail ? 1.14 : 1.08, z, w, .1, depth, rail ? "#536563" : cap);
    if (rail && lod !== "far") {
      const alongX = w > depth, length = alongX ? w : depth;
      for (let offset = -length/2 + .4; offset < length/2; offset += .8) {
        box(x + (alongX ? offset : 0), .82, z + (alongX ? 0 : offset), .07, .54, .07, "#536563");
      }
    }
  }
  for (const x of [-2.45, 2.45]) {
    box(x, .91, 11.05, .5, 1.32, .5, wall);
    box(x, 1.62, 11.05, .58, .1, .58, cap);
  }
  return parts;
}
