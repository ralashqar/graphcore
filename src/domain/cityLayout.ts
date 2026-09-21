/** Presentation geometry only. Database coordinates and ranking remain authoritative. */
export const CITY_LAYOUT = {
  plot: 24,
  block: 48,
  road: 18,
  pitch: 66,
  setback: 4,
} as const;
export const BUILDING_RECIPES = [
  { width: 4, depth: 4, floors: 1 },
  { width: 8, depth: 8, floors: 1 },
  { width: 12, depth: 10, floors: 2 },
  { width: 12, depth: 12, floors: 4 },
  { width: 12, depth: 12, floors: 7 },
  { width: 14, depth: 14, floors: 10 },
] as const;
export function plotAxis(coordinate: number): number {
  if (!coordinate) return 0;
  const index = Math.abs(coordinate) - 1;
  return (
    Math.sign(coordinate) * (21 + (index % 2) * 24 + Math.floor(index / 2) * 66)
  );
}
export function logicalAxis(world: number): number {
  if (Math.abs(world) <= 9) return 0;
  const group = Math.floor(Math.abs(world) / 66);
  let nearest = 1,
    distance = Infinity;
  for (let i = Math.max(1, group * 2 - 1); i <= group * 2 + 4; i++) {
    const d = Math.abs(plotAxis(i) - Math.abs(world));
    if (d < distance) {
      nearest = i;
      distance = d;
    }
  }
  return Math.sign(world) * nearest;
}
export function buildingVariant(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2;
}
/** Joined wings share a roof frontage; both orientations face the default +X/+Z camera. */
export function buildingMassing(tier: number, id: string) {
  const recipe = BUILDING_RECIPES[tier];
  const variant = buildingVariant(id);
  const width = tier < 2 ? 12 : 14;
  const height = recipe.floors * 3;
  const frontageHeight = (tier >= 3 ? Math.max(1, Math.round(recipe.floors * 0.65)) : recipe.floors) * 3;
  const wings = [
    { x: 0, z: 4.5, width, depth: 6, height: frontageHeight },
    { x: width / 2 - 3, z: -2.5, width: 6, depth: 8, height },
  ];
  // Transpose, rather than rotate, so neither layout puts its sign on a rear edge.
  return { wings: wings.map(w => variant ? { ...w, x: w.z, z: w.x, width: w.depth, depth: w.width } : w),
    width, frontageHeight, rotation: variant ? Math.PI / 2 : 0 };
}
export function billboardEnvelope(tier: number, id = "") {
  const layout = buildingMassing(tier, id);
  const width = layout.width - 0.4;
  return { width, height: width / 2, front: 7.65, depth: 0.3,
    bottom: layout.frontageHeight + 0.35, rotation: layout.rotation };
}
/** Local +Z façade faces the nearer east/west street. Stable within its plot. */
export function frontage(x: number): number {
  const towardPositive = (Math.abs(x) % 2 === 0) === x > 0;
  return towardPositive ? Math.PI / 2 : -Math.PI / 2;
}
export type CityPlacement = {
  key: string;
  asset: string;
  x: number;
  z: number;
  rotation: number;
};
export type RoadNode = {
  x: number;
  z: number;
  exits: string[];
  kind: "cross" | "tee" | "curve" | "plaza";
};
export function roadNetwork(capacity: number): {
  placements: CityPlacement[];
  nodes: RoadNode[];
} {
  const radius = Math.ceil(Math.sqrt(capacity) / 4);
  const placements: CityPlacement[] = [],
    nodes: RoadNode[] = [];
  function add(asset: string, x: number, z: number, rotation = 0) {
    placements.push({ key: `${asset}:${x}:${z}`, asset, x, z, rotation });
  }
  for (let i = -radius; i <= radius; i++)
    for (let j = -radius; j <= radius; j++) {
      const x = i * 66,
        z = j * 66,
        edgeX = Math.abs(i) === radius,
        edgeZ = Math.abs(j) === radius;
      const exits = [
        ...(i > -radius ? ["W"] : []),
        ...(i < radius ? ["E"] : []),
        ...(j > -radius ? ["N"] : []),
        ...(j < radius ? ["S"] : []),
      ];
      const kind =
        i === 0 && j === 0
          ? "plaza"
          : edgeX && edgeZ
            ? "curve"
            : edgeX || edgeZ
              ? "tee"
              : "cross";
      nodes.push({ x, z, exits, kind });
      if (kind === "curve") {
        const rotation =
          i > 0 ? (j > 0 ? 0 : Math.PI / 2) : j > 0 ? -Math.PI / 2 : Math.PI;
        add(
          "Street_Curve_4LaneShort",
          x - 9 * (Math.cos(rotation) + Math.sin(rotation)),
          z - 9 * (Math.cos(rotation) - Math.sin(rotation)),
          rotation,
        );
      } else if (kind === "tee") {
        add(
          "Street_TIntersection",
          x,
          z,
          edgeX ? (i > 0 ? Math.PI / 2 : -Math.PI / 2) : j > 0 ? 0 : Math.PI,
        );
      } else if (kind === "cross") add("Street_4WayIntersection", x, z);
      if (i < radius)
        for (let k = 0; k < 8; k++) add("Street_4Lane", x + 12 + 6 * k, z);
      if (j < radius)
        for (let k = 0; k < 8; k++)
          add("Street_4Lane", x, z + 12 + 6 * k, Math.PI / 2);
    }
  return { placements, nodes };
}
