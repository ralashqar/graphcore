import { KIT_CORNERS, KIT_ROOFLINES, KIT_ENTRANCES, KIT_FRONTAGES, KIT_ROOFS } from "./cityArchitecturalKit.ts";
import { advertisingLayout } from "./cityAdvertising.ts";
import { buildingMasses } from "./cityBuildingDesign.ts";
import { buildingSlots } from "./cityBuildingV3.ts";
import { applyComposition, COMPOSITIONS, identitySeed, newDesign, normalizeV3 } from "./cityBuildingV3.ts";
import { ARCHITECTURES, brandPalette, FINISHES } from "./cityBuildingV2.ts";
import { ENCLOSURES, PAVING_PATTERNS, DETAIL_SETS } from "./cityBuildingGrounds.ts";
import { NATIVE_FACADES } from "./cityNativeFacades.ts";
import { roofVariants } from "./cityBuildingArchetypes.ts";

// A seeded shuffled bag gives every source module a turn, without changing the
// existing shape/grounds/advertising random stream or depending on render order.
const demoFacades = [...NATIVE_FACADES].sort((a, b) =>
  identitySeed(`city-demo-facade:${a.id}`) - identitySeed(`city-demo-facade:${b.id}`) || a.id.localeCompare(b.id));
const facadeOrdinals: number[] = [];
let facadeCount = 0;
function demoRandom(index: number) {
  let state = identitySeed(`city-demo-building:${index}`);
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function demoFacade(index: number) {
  while (facadeOrdinals.length <= index) {
    const random = demoRandom(facadeOrdinals.length);
    random(); // Architecture precedes finish in the existing fixture stream.
    const finish = FINISHES[Math.floor(random() * FINISHES.length)];
    facadeOrdinals.push(facadeCount);
    if (finish === "facade") facadeCount++;
  }
  return demoFacades[facadeOrdinals[index] % demoFacades.length].id;
}

/** Stable fictional fixtures; never modifies a merchant recipe or paid geography. */
export function demoBuildingDesign(index: number, color: string) {
  const random = demoRandom(index);
  const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
  // Coprime stride covers every complete preset, including the first visible rings.
  const d = applyComposition(newDesign(`demo-${index}`), (index * (COMPOSITIONS.length-1) + 1) % COMPOSITIONS.length);
  if(d.generatorRevision==="city-office-4"){d.palette=brandPalette(color);d.finish="procedural";d.enclosure=pick(ENCLOSURES);d.textures={wall:"plaster",roof:"metal",ground:"pavers",groundBorder:"concrete"};return normalizeV3(d);}
  if(d.base==="residential"){
    d.palette=brandPalette(color);d.finish="procedural";
    d.textures={wall:pick(["plaster","brick","none"] as const),roof:"terracotta",ground:"grass-meadow",wallBorder:"none",groundBorder:"concrete"};
    d.connectedArchitecture={...d.connectedArchitecture,shutters:index%3===0,windowBoxes:index%4===0};
    if(d.archetype==="apartment"&&index%2===0)d.stairExtension="straight";
    return normalizeV3(d);
  }
  d.doorFamily=(["glazed","double-glass","french","panelled","sliding","arched"] as const)[index%6];
  d.doorSurround=(["minimal","framed","classical","industrial"] as const)[index%4];
  d.doorTransom=index%3===0;
  d.palette = brandPalette(color);
  d.windowFamily=(["storefront","warehouse","sash","picture","arched"] as const)[index%5];
  d.architecture = pick(ARCHITECTURES);
  d.finish = pick(FINISHES);
  d.enclosure = pick(ENCLOSURES);
  d.pavingPattern = pick(PAVING_PATTERNS.filter(pattern => pattern !== "checker"));
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
  const result = normalizeV3(d);
  // Every demo property exercises real materials, with stable choices across reloads.
  result.textures = {
    wall: pick(["brick", "plaster", "concrete", "timber", "metal"] as const),
    roof: pick(["terracotta", "metal", "concrete"] as const),
    ground: pick(["pavers", "concrete", "grass-lawn", "grass-meadow", "grass-lush"] as const),
  };
  // Use a separate random stream so texture choices never change advertising layout.
  const borders = ["plaster", "concrete", "metal"] as const;
  const chooseBorder = (primary: string | undefined, salt: string) => {
    const choices = borders.filter(id => id !== primary);
    return choices[identitySeed(`city-demo-border:${index}:${salt}`) % choices.length];
  };
  result.textures.wallBorder = chooseBorder(result.textures.wall, "wall");
  result.textures.groundBorder = chooseBorder(result.textures.ground, "ground");
  // Modular facades showcase their own authored UV/PBR materials by default.
  if (result.finish === "facade") {
    result.nativeFacade = demoFacade(index);
    result.textures.wall = "none";
    result.textures.wallBorder = "none";
  }
  result.solidSideWalls = index % 4 === 0;
  result.stairExtension = result.finish === "procedural" || index % 3 !== 0 ? "none" : index % 2 ? "marble" : "concrete";
  const kitPick=<T,>(values:readonly T[],salt:string)=>values[identitySeed(`city-demo-kit:${index}:${salt}`)%values.length];
  result.architecturalKit={corners:kitPick(KIT_CORNERS,"corners"),roofline:kitPick(KIT_ROOFLINES,"roofline"),entrance:kitPick(KIT_ENTRANCES,"entrance"),frontage:kitPick(KIT_FRONTAGES,"frontage"),roof:result.blueprint==="office" && result.massing!=="hall-wings"?kitPick(KIT_ROOFS,"roof"):"existing",entranceSteps:index%3===1,connectedPlanters:index%2===0,stairRails:index%3!==0,ornaments:index%4===0,rooftopUnits:index%5===0};
  // Guaranteed early-ring examples, preserving the existing facade shuffled bag.
  if(result.finish!=="procedural" && index%4===0){
    result.stairExtension="fire-escape";
    if(result.middleFloors===0 && result.crown==="none")result.middleFloors=1;
    Object.assign(result,normalizeV3(result));
  }
  if(index%12===5){result.stairExtension="spiral";result.roof="flat";result.roofVariant="standard";result.architecturalKit.roof="existing";}
  result.advertising = { placements: [], width: pick([6, 8, 10, 12]), height: pick([3, 4, 5]), style: pick(["image", "text"] as const) };
  const masses = buildingMasses(result);
  const available = advertisingLayout(result, masses, buildingSlots(result, masses)).fits.filter(f => !f.reason);
  const count = pick([1, 2]);
  while (available.length && result.advertising.placements.length < count) {
    const [fit] = available.splice(Math.floor(random() * available.length), 1);
    result.advertising.placements.push(fit.id);
  }
  return result;
}
