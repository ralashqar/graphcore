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
export const buildingDesignSchema = z.union([legacy, current]);
