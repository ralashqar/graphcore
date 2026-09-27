// Construction studio shared constants. The flat tool belt of September 2026 was replaced by the v2 tool rail
// (studioRail.ts, docs/city-studio-ui-v2.md); the legacy workspace categories remain for Delete routing,
// floor views and telemetry.
export type StudioCategory='Shape'|'Roofs'|'Surfaces'|'Openings'|'Details'|'Garden'|'Rooms'|'Furniture';
export const STUDIO_DICE_KEY=' ';
/** Next storey for PageUp/PageDown, clamped to the building. */
export const studioFloorStep=(floor:number,storeys:number,direction:1|-1)=>Math.max(0,Math.min(Math.max(1,storeys)-1,floor+direction));
