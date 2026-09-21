import manifest from "../../../public/city/megacity/manifest.json";
const offices = manifest.assets.filter(a => a.key.startsWith("office-"));
export function officePreset(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return offices[(hash >>> 0) % offices.length];
}
