import type { DesignPart } from "./cityBuildingV2.ts";
export const ENTRANCE_STYLES = ["standard", "wide-canopy", "portico", "pediment"] as const;
export function frontStructure(style: typeof ENTRANCE_STYLES[number] | undefined, blueprint: string, front: number, width: number, groundHeight: number, wall: string, trim: string) {
  const parts: DesignPart[] = [];
  const requested = style === "portico" || style === "pediment";
  const depth = Math.min(2.3, 10.65 - front - .6);
  const reason = requested && (blueprint !== "office" || depth < 1.4)
    ? "This entrance needs a rectangular building and more forecourt depth. Reduce building depth to restore it."
    : null;
  if (!requested || reason) return { parts, reason, depth: 0, envelope: null };
  const w = Math.min(8, width - 1);
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string) =>
    parts.push({kind:"box", position:[x,y,z], size:[sx,sy,sz], color});
  box(0,.45,front+depth/2,w,.4,depth,trim);
  box(0,.35,front+depth+.15,w,.2,.3,trim);
  box(0,.3,front+depth+.45,w,.1,.3,trim);
  for (const x of [-w/2+.55,w/2-.55]) {
    box(x,.75,front+depth-.4,.7,.2,.7,trim);
    parts.push({kind:"column", position:[x,(.85+groundHeight+.1)/2,front+depth-.4], size:[.46,groundHeight-.75,.46], color:wall});
    box(x,groundHeight+.16,front+depth-.4,.72,.13,.72,trim);
  }
  box(0,groundHeight+.55,front+depth/2,w,.65,depth,trim);
  if (style === "pediment") parts.push({kind:"pediment", position:[0,groundHeight+1.375,front+depth/2], size:[w,1,depth], color:trim});
  return {parts, reason, depth, envelope:{position:[0,(groundHeight+2.125)/2,front+(depth+.6)/2] as [number,number,number], size:[w,groundHeight+1.875,depth+.6] as [number,number,number]}};
}
