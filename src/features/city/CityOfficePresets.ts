import manifest from "../../../public/city/megacity/manifest.json";
import { buildingVariant } from "../../domain/cityLayout";

const offices = manifest.assets.filter(a => a.key.startsWith("office-"));
/** Stable business identity keeps the same office when its paid position changes. */
export function officePreset(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return offices[(hash >>> 0) % offices.length];
}
export function officeBillboard(_tier: number, id = "") {
  const office = officePreset(id);
  const width = Math.max(11.6, office.width - 0.4);
  return { width, height: width / 2, front: office.depth / 2 + 0.15,
    bottom: office.height + 0.35, depth: 0.3,
    rotation: buildingVariant(id) ? Math.PI / 2 : 0 };
}
