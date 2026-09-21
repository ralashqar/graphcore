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
  generatorRevision: z.literal("city-grammar-1"),
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
  base: z.enum(["storefront", "lobby", "plinth"]),
  middleFloors: z.number().int().min(0).max(7),
  rhythm: z.enum(["vertical", "ribbon", "alternating"]),
  crown: z.enum(["none", "recessed", "penthouse", "terrace"]),
  crownSetback: z.number().min(.5).max(2),
  facadeSeed: z.number().int().min(0).max(999999),
  groundsSeed: z.number().int().min(0).max(999999),
  density: z.enum(["restrained", "full"]),
  slots: z.partialRecord(z.enum(SLOT_IDS), z.enum(COMPONENTS).nullable()),
}).strict().superRefine((d, ctx) => {
  if (d.massing === "hall-wings" && (d.blueprint !== "office" || d.width < 12 || d.depth < 10 || d.roof === "pitched")) ctx.addIssue({code:"custom", message:"Hall and wings require a rectangular 12 by 10 m footprint and compatible roof."});
  if (d.roofVariant && !roofVariants(d).includes(d.roofVariant)) ctx.addIssue({code:"custom", message:"Roof variant is incompatible with this archetype."});
  if (d.blueprint !== "office" && (d.width < 12 || d.depth < 10)) ctx.addIssue({code:"custom", message:"Compact dimensions require a rectangular building."});
  if (d.roof === "pitched" && d.blueprint !== "office") {
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
