import { applyComposition, COMPOSITIONS, identitySeed, newDesign, normalizeV3 } from "./cityBuildingV3.ts";
import { ARCHITECTURES, brandPalette, FINISHES } from "./cityBuildingV2.ts";
import { ENCLOSURES, PAVING_PATTERNS, DETAIL_SETS } from "./cityBuildingGrounds.ts";
import { roofVariants } from "./cityBuildingArchetypes.ts";

/** Stable fictional fixtures; never modifies a merchant recipe or paid geography. */
export function demoBuildingDesign(index: number, color: string) {
  let state = identitySeed(`city-demo-building:${index}`);
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
  // Coprime stride covers every complete preset, including the first visible rings.
  const d = applyComposition(newDesign(`demo-${index}`), (index * 9 + 1) % COMPOSITIONS.length);
  d.palette = brandPalette(color);
  d.architecture = pick(ARCHITECTURES);
  d.finish = pick(FINISHES);
  d.enclosure = pick(ENCLOSURES);
  d.pavingPattern = pick(PAVING_PATTERNS);
  d.detailSet = pick(DETAIL_SETS);
  d.detailScope = pick(["all", "entrance", "crown"] as const);
  d.grounds = pick(["minimal", "planted", "urban"] as const);
  d.density = pick(["restrained", "full"] as const);
  d.groundHeight = pick([3, 3.6, 4.2]);
  d.width = Math.min(18, Math.max(d.massing === "hall-wings" ? 12 : d.blueprint === "office" ? 8 : 12, d.width + pick([-2, 0, 2])));
  d.depth = Math.min(14, Math.max(d.blueprint === "office" && d.massing !== "hall-wings" ? 8 : 10, d.depth + pick([-2, 0, 2])));
  if (!["cafe", "kiosk"].includes(d.archetype || "")) d.middleFloors = Math.min(5, Math.max(0, d.middleFloors + pick([-1, 0, 1])));
  d.roofVariant = pick(roofVariants(d));
  d.slots["ground.left"] = d.slots["ground.right"] = d.grounds === "minimal" ? null : d.grounds === "urban" ? "bollards" : "planter";
  return normalizeV3(d);
}
