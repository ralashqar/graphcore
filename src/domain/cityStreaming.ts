/** Conservative ground-plane coverage for the fixed isometric camera, plus preload margin. */
export function streamRadius(width: number, height: number, zoom: number) {
  return Math.max(120, Math.min(520, Math.hypot(width, height / 0.54) / (2 * Math.max(zoom, 1)) + 70));
}
export function entranceScale(elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / 550));
  // One restrained overshoot; no ongoing spring or oscillation.
  return 1 + 2 * (t - 1) ** 3 + (t - 1) ** 2;
}

export type CityDetail = "near" | "medium" | "far";
/** A residency owns its detail choice. Eviction, not camera movement, resets it. */
export function residentDetails(previous: ReadonlyMap<string, CityDetail>, candidates: ReadonlyMap<string, CityDetail>) {
  const result = new Map<string, CityDetail>();
  for (const id of candidates.keys()) if (previous.has(id)) result.set(id, previous.get(id)!);
  let nearCount = [...result.values()].filter(detail => detail === "near").length;
  for (const [id, candidate] of candidates) {
    if (result.has(id)) continue;
    const detail = candidate === "near" && nearCount >= 12 ? "medium" : candidate;
    result.set(id, detail);
    if (detail === "near") nearCount++;
  }
  return result;
}

export type CityRepresentation = "full" | "simple" | "hidden";
/** Pixel-space hysteresis applies to a complete building, never its individual parts. */
export function cityRepresentation(previous: CityRepresentation | undefined, pixels: number, visible: boolean, moving = false): CityRepresentation {
  if(moving)return previous === "full" ? "full" : "simple";
  if(!visible)return "hidden";
  return pixels > (previous === "full" ? 210 : 290) ? "full" : "simple";
}
