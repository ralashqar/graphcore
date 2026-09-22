import {OFFICE_TYPES} from "../../../src/domain/cityOfficeArchitecture.ts";
import {DOOR_FAMILIES,DOOR_SURROUNDS} from "../../../src/domain/cityProceduralEntrances.ts";
import { WINDOW_FAMILIES } from "../../../src/domain/cityWindowFamilies.ts";
import { KIT_CORNERS,KIT_ROOFLINES,KIT_ENTRANCES,KIT_FRONTAGES,KIT_ROOFS } from "../../../src/domain/cityArchitecturalKit.ts";
import { NATIVE_FACADE_IDS } from "../../../src/domain/cityNativeFacades.ts";
import { TEXTURE_IDS } from "../../../src/domain/cityTexturePresets.ts";
import { AD_PLACEMENTS } from "../../../src/domain/cityAdvertising.ts";
import { ARCHETYPES, ROOF_VARIANTS, roofVariants } from "../../../src/domain/cityBuildingArchetypes.ts";
import { ENTRANCE_STYLES } from "../../../src/domain/cityBuildingEntrances.ts";
import { ENCLOSURES, PAVING_PATTERNS, DETAIL_SETS, DETAIL_SCOPES } from "../../../src/domain/cityBuildingGrounds.ts";
import { z } from "npm:zod@4";
import {
  BLUEPRINTS,
  FACADES,
  TILE_STYLES,
} from "../../../src/domain/cityBuildingDesign.ts";
const legacy = z.object({
  version: z.literal(1),
  blueprint: z.enum(BLUEPRINTS),
  floors: z.number().int().min(1).max(8),
  width: z.number().int().min(12).max(18),
  setback: z.number().int().min(0).max(2),
  facade: z.enum(FACADES),
  tile: z.enum(TILE_STYLES),
  landscaping: z.boolean(),
  rotation: z.number().int().min(0).max(3),
}).strict();

import {
  ARCHITECTURES,
  FINISHES,
  ROOFS,
} from "../../../src/domain/cityBuildingV2.ts";
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const current = legacy.extend({
  version: z.literal(2),
  depth: z.number().int().min(10).max(18),
  groundHeight: z.number().min(3).max(4.5),
  podium: z.boolean(),
  architecture: z.enum(ARCHITECTURES),
  finish: z.enum(FINISHES),
  roof: z.enum(ROOFS),
  grounds: z.enum(["minimal", "planted", "urban"]),
  canopy: z.boolean(),
  seed: z.number().int().min(0).max(999999),
  palette: z.object({ wall: color, trim: color, glass: color, roof: color })
    .strict(),
}).strict().refine(
  (d) => d.roof !== "pitched" || d.blueprint === "office",
  "Pitched roofs require the office blueprint.",
).refine(
  (d) => d.finish === "procedural" || (d.width % 2 === 0 && d.depth % 2 === 0),
  "Modular finishes require whole 2 m footprint increments.",
);
import { COMPONENTS, SLOT_IDS } from "../../../src/domain/cityBuildingV3.ts";
const v3 = z.object({
  ...current.shape,
  version: z.literal(3),
  generatorRevision: z.enum(["city-grammar-1", "city-shell-2", "city-connected-3", "city-office-4"]),
  officeArchitecture:z.object({bridgeFloor:z.number().int().min(1).max(7).optional(),towerGap:z.number().min(2).max(6).optional(),shorterTower:z.number().int().min(0).max(3).optional(),style:z.enum(["international","deco","brutalist"]).optional()}).strict().optional(),
  connectedArchitecture:z.object({
    openingLayout:z.enum(["compact","balanced","paired"]).optional(),
    roofPitch:z.number().min(15).max(50).optional(),roofOverhang:z.number().min(0).max(.6).optional(),ridgeDirection:z.enum(["x","z"]).optional(),
    porch:z.enum(["none","entrance","veranda","side","courtyard"]).optional(),supportStyle:z.enum(["timber","classical","metal"]).optional(),
    dormers:z.union([z.literal(0),z.literal(1),z.literal(2)]).optional(),dormerRoof:z.enum(["gable","shed"]).optional(),
    shutters:z.boolean().optional(),windowBoxes:z.boolean().optional(),chimney:z.boolean().optional(),gutters:z.boolean().optional(),balconies:z.boolean().optional(),
  }).strict().optional(),
  architecturalKit: z.object({corners:z.enum(KIT_CORNERS).optional(),roofline:z.enum(KIT_ROOFLINES).optional(),entrance:z.enum(KIT_ENTRANCES).optional(),frontage:z.enum(KIT_FRONTAGES).optional(),roof:z.enum(KIT_ROOFS).optional(),entranceSteps:z.boolean().optional(),connectedPlanters:z.boolean().optional(),stairRails:z.boolean().optional(),ornaments:z.boolean().optional(),rooftopUnits:z.boolean().optional()}).strict().optional(),
  doorFamily:z.enum(DOOR_FAMILIES).optional(),
  doorSurround:z.enum(DOOR_SURROUNDS).optional(),
  doorTransom:z.boolean().optional(),
  windowFamily: z.enum(WINDOW_FAMILIES).optional(),
  nativeFacade: z.enum(NATIVE_FACADE_IDS).optional(),
  solidSideWalls: z.boolean().optional(),
  stairExtension: z.enum(["none","concrete","marble","fire-escape","spiral","straight"]).optional(),
  textures: z.object({wall:z.enum(TEXTURE_IDS).optional(),roof:z.enum(TEXTURE_IDS).optional(),ground:z.enum(TEXTURE_IDS).optional(),wallBorder:z.enum([...TEXTURE_IDS,"primary"]).optional(),groundBorder:z.enum([...TEXTURE_IDS,"primary"]).optional()}).strict().optional(),
  advertising: z.object({placements:z.array(z.enum(AD_PLACEMENTS)).max(2).refine(v=>new Set(v).size===v.length,"Duplicate placements"),width:z.number().min(3).max(18),height:z.number().min(2).max(24),style:z.enum(["image","text"])}).strict().optional(),
  entranceStyle: z.enum(ENTRANCE_STYLES).optional(),
  archetype: z.enum(ARCHETYPES).optional(),
  massing: z.enum(["standard", "hall-wings"]).optional(),
  roofVariant: z.enum(ROOF_VARIANTS).optional(),
  width: z.number().int().min(8).max(18),
  depth: z.number().int().min(8).max(18),
  enclosure: z.enum(ENCLOSURES).optional(),
  pavingPattern: z.enum(PAVING_PATTERNS).optional(),
  detailSet: z.enum(DETAIL_SETS).optional(),
  detailScope: z.enum(DETAIL_SCOPES).optional(),
  base: z.enum(["storefront", "lobby", "plinth", "residential"]),
  middleFloors: z.number().int().min(0).max(7),
  rhythm: z.enum(["vertical", "ribbon", "alternating"]),
  crown: z.enum(["none", "recessed", "penthouse", "terrace"]),
  crownSetback: z.number().min(.5).max(2),
  facadeSeed: z.number().int().min(0).max(999999),
  groundsSeed: z.number().int().min(0).max(999999),
  density: z.enum(["restrained", "full"]),
  slots: z.partialRecord(z.enum(SLOT_IDS), z.enum(COMPONENTS).nullable()),
}).strict().superRefine((d, ctx) => {
  if(d.generatorRevision==="city-office-4" && !OFFICE_TYPES.some(t=>t===d.archetype))ctx.addIssue({code:"custom",message:"Connected office envelopes require a matching preset."});
  if(d.generatorRevision!=="city-office-4" && (d.officeArchitecture || OFFICE_TYPES.some(t=>t===d.archetype)))ctx.addIssue({code:"custom",message:"Office architecture requires its generator revision."});
  if(d.generatorRevision!=="city-connected-3" && (d.connectedArchitecture || d.base==="residential"))ctx.addIssue({code:"custom",message:"Connected architecture requires an explicit generator upgrade."});
  if (d.massing === "hall-wings" && (d.blueprint !== "office" || d.width < 12 || d.depth < 10 || d.roof === "pitched")) ctx.addIssue({code:"custom", message:"Hall and wings require a rectangular 12 by 10 m footprint and compatible roof."});
  if (d.roofVariant && !roofVariants(d).includes(d.roofVariant)) ctx.addIssue({code:"custom", message:"Roof variant is incompatible with this archetype."});
  if (d.blueprint !== "office" && (d.width < 12 || d.depth < 10)) ctx.addIssue({code:"custom", message:"Compact dimensions require a rectangular building."});
  if (d.generatorRevision !== "city-connected-3" && d.roof === "pitched" && d.blueprint !== "office") {
    ctx.addIssue({ code: "custom", message: "Pitched roofs require office." });
  }
  if (d.finish !== "procedural" && (d.width % 2 || d.depth % 2)) {
    ctx.addIssue({ code: "custom", message: "Use whole modular dimensions." });
  }
  if (
    d.floors !== 1 + d.middleFloors + (d.crown === "none" ? 0 : 1) ||
    d.floors > 8
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Floor stack must match the bounded floor count.",
    });
  }
  let brands = 0, campaigns = 0;
  for (const [slot, component] of Object.entries(d.slots)) {
    if (!component) continue;
    const valid = slot.startsWith("brand.")
      ? component === "brand"
      : slot === "campaign.side"
      ? component === "campaign"
      : slot === "canopy.entrance"
      ? component === "canopy"
      : slot.startsWith("terrace.")
      ? component === "planter"
      : component === "planter" || component === "bollards";
    if (!valid) {
      ctx.addIssue({
        code: "custom",
        message: "Component is incompatible with this slot.",
      });
    }
    if (component === "brand") brands++;
    if (component === "campaign") campaigns++;
  }
  if (brands !== 1 || campaigns > 1) {
    ctx.addIssue({
      code: "custom",
      message:
        "Select exactly one primary sign and at most one campaign panel.",
    });
  }
});
export const buildingDesignSchema = z.union([legacy, current, v3]);
