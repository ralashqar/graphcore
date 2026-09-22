# Procedural entrance families

## Pascal reference and implementation

Reviewed the pinned Pascal door schema at commit 5ce72119d4b781c54f3fc96d5f3294b808cc78e5 (`packages/core/src/schema/nodes/door.ts`). Useful ideas include door families, panel/glass segments, frames, handles and hosted openings. This implementation is independently authored using our existing primitives and shared arched geometry. No Pascal code, bundled models or runtime dependencies were copied.

## Controls and ownership

The Entrances tab exposes Automatic, glazed door with sidelight, double glass, French, panelled with sidelight, sliding storefront and arched glass entrance. Rectangular families offer minimal/framed/classical/industrial surrounds and an optional glazed transom. Existing simple entry, wide canopy, portico and pediment structures are accessible in the same tab. Selecting these procedural options explicitly enables procedural finish; Quaternius door modules remain available in Presets and retain exclusive ownership in native finishes.

Every generated door uses the existing 2m by 2.4m aperture and .65m floor datum. Jambs, thresholds, panels, glass, dividers and handles are bounded within that aperture; decorative jamb fluting never crosses the doorway. Native and procedural door assemblies are mutually exclusive. Arched doors reuse closed curved glass and solid upper infill; rectangular frame/transom selections remain saved but inactive for arches. Door parts are untextured palette materials so roof tiles cannot accidentally appear on door panels merely because they share a colour. Door leaves are static exterior presentation, not interactive swing animations or interior access.

Optional v3 fields: `doorFamily`, `doorSurround`, `doorTransom`. Missing options preserve prior rendering. The strict shared schema validates curated values and existing owner/revision checks remain in place. Demo properties cycle the new families and surrounds.

## Verification and rollout

Domain tests cover all families/surrounds/transom settings at all three detail levels, positive bounded geometry, every preset and exclusive native ownership. Typed Deno tests cover round-trip storage and invalid-style rejection. Focused browser checks cover all six authored families, inactive arched options, save/reload, undo and mobile overflow. These are local mocked persistence checks, not hosted publication acceptance.

No migration or provider spending. Stage profile-consuming City API, command, reconcile, building-art and Stripe webhook together with the world worker (`2026-09-22-city-design-3.15`) and frontend. Actual worker import path remains main → city-campus-worker → city.ts → city-building-design-schema. Staging targets are unspecified; no deployment or production activation performed.

Final verification: 18 geometry/regression tests and 17 typed shared validation tests passed; browser save/reload, undo and mobile checks passed. TypeScript, development startup and final production build passed (Vite 2m15s). Existing chunk-size warnings remain. Temporary dev server stopped; user's 5188 server retained.
