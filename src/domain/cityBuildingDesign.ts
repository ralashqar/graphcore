import { massesV3, resolveV3, type CityBuildingDesignV3 } from "./cityBuildingV3.ts";
import { massesV2, resolveDesign, type CityBuildingDesignV2 } from "./cityBuildingV2.ts";
/** Versioned, bounded geometry recipe. No executable content or asset URLs. */
export const BLUEPRINTS = [
  "office",
  "terraces",
  "courtyard",
  "l-shape",
] as const;
export const FACADES = ["ribbon", "grid", "piers"] as const;
export const TILE_STYLES = ["garden", "limestone", "slate"] as const;
export type CityBuildingDesign = CityBuildingDesignV1 | CityBuildingDesignV2 | CityBuildingDesignV3;
export type CityBuildingDesignV1 = {
  version: 1;
  blueprint: typeof BLUEPRINTS[number];
  floors: number;
  width: number;
  setback: number;
  facade: typeof FACADES[number];
  tile: typeof TILE_STYLES[number];
  landscaping: boolean;
  rotation: number;
};
export const DEFAULT_BUILDING_DESIGN: CityBuildingDesignV1 = {
  version: 1,
  blueprint: "terraces",
  floors: 4,
  width: 16,
  setback: 1,
  facade: "ribbon",
  tile: "garden",
  landscaping: true,
  rotation: 0,
};
export const BUILDING_PRESETS: {
  name: string;
  description: string;
  design: CityBuildingDesignV1;
}[] = [
  {
    name: "Modern office",
    description: "A glass pavilion on a broad podium",
    design: {
      ...DEFAULT_BUILDING_DESIGN,
      blueprint: "office",
      floors: 3,
      facade: "grid",
      tile: "limestone",
    },
  },
  {
    name: "Stepped tower",
    description: "Receding floors and generous terraces",
    design: { ...DEFAULT_BUILDING_DESIGN, floors: 6 },
  },
  {
    name: "Courtyard",
    description: "Three connected wings around an open garden",
    design: {
      ...DEFAULT_BUILDING_DESIGN,
      blueprint: "courtyard",
      floors: 3,
      facade: "piers",
    },
  },
  {
    name: "Corner studio",
    description: "An L-shaped footprint with an open forecourt",
    design: {
      ...DEFAULT_BUILDING_DESIGN,
      blueprint: "l-shape",
      floors: 3,
      tile: "slate",
    },
  },
];
export type BuildingMass = {
  x: number;
  z: number;
  width: number;
  depth: number;
  y: number;
  height: number;
};
export function buildingMasses(d: CityBuildingDesign): BuildingMass[] {
  if(d.version===3)return massesV3(d);
  if(d.version===2)return massesV2(d);
  const w = d.width, floorHeight = 2.25, masses: BuildingMass[] = [];
  for (let floor = 0; floor < d.floors; floor++) {
    const step = d.blueprint === "terraces"
      ? Math.floor(floor / 2) * d.setback
      : 0;
    const span = Math.max(7, w - step * 2), y = .65 + floor * floorHeight;
    if (d.blueprint === "courtyard") {
      masses.push({
        x: 0,
        z: -span / 2 + 2,
        width: span,
        depth: 4,
        y,
        height: floorHeight,
      }, {
        x: -span / 2 + 2,
        z: 2,
        width: 4,
        depth: span - 4,
        y,
        height: floorHeight,
      }, {
        x: span / 2 - 2,
        z: 2,
        width: 4,
        depth: span - 4,
        y,
        height: floorHeight,
      });
    } else if (d.blueprint === "l-shape") {
      masses.push({
        x: 0,
        z: -span / 2 + 2.5,
        width: span,
        depth: 5,
        y,
        height: floorHeight,
      }, {
        x: span / 2 - 2.5,
        z: 2.5,
        width: 5,
        depth: span - 5,
        y,
        height: floorHeight,
      });
    } else {
      masses.push({
        x: 0,
        z: 0,
        width: span,
        depth: Math.max(6, span - 3),
        y,
        height: floorHeight,
      });
    }
  }
  return masses;
}
export type BuildingPart = {
  kind: "box" | "tree" | "roof" | "column" | "pediment" | "hip" | "shed";
  position: [number, number, number];
  size: [number, number, number];
  color: string;
};
export function buildingParts(
  d: CityBuildingDesign,
  brand: string,
): BuildingPart[] {
  if(d.version===3)return resolveV3(d,brand).parts;
  if(d.version===2)return resolveDesign(d,brand).parts;
  const parts: BuildingPart[] = [];
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    depth: number,
    color: string,
  ) =>
    parts.push({
      kind: "box",
      position: [x, y, z],
      size: [w, h, depth],
      color,
    });
  const ground =
    { garden: "#8d9e78", limestone: "#d7d1bf", slate: "#727e83" }[d.tile];
  box(0, .05, 0, 23.5, .24, 23.5, "#bab7a6");
  box(0, .2, 0, 22.8, .1, 22.8, ground);
  if(d.tile!=="garden") for(let grid=-8;grid<=8;grid+=4) {
    box(grid,.26,0,.045,.02,22.7,"#a7aaa0");
    box(0,.26,grid,22.7,.02,.045,"#a7aaa0");
  }
  // A broad foundation stays clear of the road and wraps the footprint.
  for (const m of buildingMasses({ ...d, floors: 1 })) {
    box(m.x, .45, m.z, m.width + .6, .4, m.depth + .6, "#d3cbb6");
  }
  for (const m of buildingMasses(d)) {
    box(m.x, m.y + m.height / 2, m.z, m.width, m.height, m.depth, "#d8d6c9");
    box(
      m.x,
      m.y + m.height - .12,
      m.z,
      m.width + .25,
      .24,
      m.depth + .25,
      "#ede9da",
    );
    for (const sign of [-1, 1]) {
      const glass = "#648f98";
      box(
        m.x,
        m.y + 1.15,
        m.z + sign * (m.depth / 2 + .018),
        m.width - .65,
        1.48,
        .06,
        glass,
      );
      box(
        m.x + sign * (m.width / 2 + .018),
        m.y + 1.15,
        m.z,
        .06,
        1.48,
        m.depth - .65,
        glass,
      );
      const spacing = d.facade === "grid" ? 1.8 : d.facade === "piers" ? 3 : 5;
      for (let x = -m.width / 2 + .4; x < m.width / 2; x += spacing) {
        box(
          m.x + x,
          m.y + 1.15,
          m.z + sign * (m.depth / 2 + .065),
          d.facade === "piers" ? .3 : .1,
          1.62,
          .14,
          d.facade === "piers" ? brand : "#dedfd7",
        );
      }
      for (let z = -m.depth / 2 + .4; z < m.depth / 2; z += spacing) {
        box(
          m.x + sign * (m.width / 2 + .065),
          m.y + 1.15,
          m.z + z,
          .14,
          1.62,
          d.facade === "piers" ? .3 : .1,
          d.facade === "piers" ? brand : "#dedfd7",
        );
      }
    }
  }
  const first = buildingMasses(d)[0];
  const entranceZ = first.z + first.depth / 2;
  box(0,.3,(entranceZ+11.4)/2,3.2,.08,11.4-entranceZ,"#ded8c6");
  box(0, 1.5, entranceZ + .12, 2.4, 1.8, .2, "#354f59");
  box(0, 2.55, entranceZ + .7, 3.6, .23, 1.7, brand);
  // Raised roof crown and a broad integrated brand panel.
  const roof = buildingMasses(d).at(-1)!;
  box(
    roof.x,
    roof.y + roof.height + .2,
    roof.z,
    Math.max(2, roof.width - 2),
    .4,
    Math.max(2, roof.depth - 2),
    "#85928b",
  );
  box(
    first.x,
    2.0,
    first.z - first.depth / 2 - .12,
    Math.min(5, first.width - 1),
    .6,
    .18,
    brand,
  );
  if (d.landscaping) {
    for (const [x, z] of [[-9.8, -9.8], [-9.8, 7.5], [9.8, 9.8]]) {
      box(x, .55, z, 1.8, .6, 1.8, "#c4bcaa");
      box(x, 1.15, z, .22, 1, .22, "#81715e");
      parts.push({
        kind: "tree",
        position: [x, 2.3, z],
        size: [1.05, 1.35, 1.05],
        color: "#648357",
      });
    }
  }
  return parts;
}
