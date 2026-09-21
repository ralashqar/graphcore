import { z } from "npm:zod@4";
import {
  BLUEPRINTS,
  FACADES,
  TILE_STYLES,
} from "../../../src/domain/cityBuildingDesign.ts";
export const buildingDesignSchema = z.object({
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
