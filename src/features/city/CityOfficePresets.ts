import manifest from "../../../public/city/offices/manifest.json";

/** Six authored podium/terrace office assemblies; stable identity survives relocation. */
export function officePreset(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const key = `Office_${(hash >>> 0) % 6}`;
  const assets = manifest.assets as Record<string, { height?: number }>;
  return { key, height: assets[`${key}_near`]?.height ?? 32 };
}
