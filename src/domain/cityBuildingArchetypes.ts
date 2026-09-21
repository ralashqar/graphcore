import type { DesignPart } from "./cityBuildingV2.ts";
export const ARCHETYPES = ["cafe", "shop", "kiosk", "museum", "bank", "hotel"] as const;
export const ROOF_VARIANTS = ["standard", "hip", "shed", "sawtooth"] as const;
export type ArchetypeChoices = {
  archetype?: typeof ARCHETYPES[number];
  massing?: "standard" | "hall-wings";
  roofVariant?: typeof ROOF_VARIANTS[number];
};
export function roofVariants(d: ArchetypeChoices & {blueprint: string}) {
  const allowed: typeof ROOF_VARIANTS[number][] = ["standard"];
  if (d.blueprint !== "office") return allowed;
  allowed.push("hip");
  if (!d.archetype || ["cafe", "shop", "kiosk"].includes(d.archetype)) allowed.push("shed");
  if (!d.archetype || d.archetype === "museum") allowed.push("sawtooth");
  return allowed;
}
export function presetCategory(archetype: ArchetypeChoices["archetype"]) {
  return archetype === "cafe" || archetype === "shop" || archetype === "kiosk" ? "Food & Retail"
    : archetype === "museum" || archetype === "bank" ? "Civic"
    : archetype === "hotel" ? "Hospitality" : "Workspaces";
}
/** Coherent, low-detail exterior features; nothing occupies the central entrance route. */
export function archetypeParts(archetype: ArchetypeChoices["archetype"], width: number, depth: number, front: number, groundHeight: number, trim: string, brand: string, lod: "near" | "medium" | "far") {
  const parts: DesignPart[] = [];
  const box = (x:number,y:number,z:number,w:number,h:number,d:number,color:string) => parts.push({kind:"box",position:[x,y,z],size:[w,h,d],color});
  if (archetype === "shop") {
    box(0, groundHeight+.28, front+.18, width-.5, .55, .22, brand);
    for (const x of [-1.25,1.25]) box(x,1.85,front+.28,.22,2.4,.5,trim);
  }
  if (archetype === "kiosk") {
    for (const x of [-width/2+1.25,width/2-1.25]) box(x,1.55,front+.3,2,.16,.6,trim);
    box(width/2+.25,1.55,0,.5,.16,depth-1,trim);
    if (lod !== "far") {
      for (const x of [-width/2+1.25,width/2-1.25]) box(x,2.72,front+.12,1.8,.22,.22,brand);
    }
  }
  if (archetype === "cafe" && lod !== "far" && front+3.25 < 10.8) {
    for (const x of [-4,4]) {
      box(x,1.02,front+2.35,1.3,.14,1.3,trim);
      parts.push({kind:"column",position:[x,.64,front+2.35],size:[.16,.62,.16],color:brand});
      for (const dz of [-.85,.85]) {
        box(x,.65,front+2.35+dz,.7,.12,.55,brand);
        box(x,.95,front+2.35+dz+Math.sign(dz)*.23,.7,.55,.1,brand);
        if (lod === "near") for (const dx of [-.25,.25]) box(x+dx,.43,front+2.35+dz,.08,.32,.4,trim);
      }
    }
  }
  if (archetype === "hotel") {
    for (const x of [-2.2,2.2]) box(x,1.8,front+.45,.15,2.3,.15,trim);
    box(0,2.98,front+1.05,4.7,.18,2.2,brand);
  }
  return parts;
}
