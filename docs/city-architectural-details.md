# City architectural detail and background preparation

## Implemented

- Optional v3 `windowFamily`: automatic, storefront, warehouse, sash, picture and arched. Storefront/grid/sash mullions fit existing recessed openings. Arched windows use extruded glass and matching solid upper infill in the same wall opening; they are not rectangular decals. Native Quaternius façades retain their authored windows. Selecting a procedural family explicitly switches to procedural finish.
- Optional `stairExtension: spiral`: closed wedge treads, centre column, posts and continuous inclined handrail segments, with 24 steps per storey and rise derived from actual elevations. A landing meets the flat roof. The side core is aligned and fitted inside the plot, including single-storey buildings. Projecting native windows are suppressed in the stair strip; signs/slots reserve its bounds. Selecting the option makes the roof flat and disables native roof assemblies in the same undoable edit. Incompatible loaded settings produce an explanation. This is a visual exterior roof-access assembly, not a navigable interior or a building-code certification.
- Complete presets select appropriate window families; legacy saved recipes without new options retain their appearance. Existing strict owner/revision save flow is reused.
- Demo preset stride now covers all 18 presets (the old stride 9 only visited two once the list reached 18). It includes all procedural window styles and six spiral examples among 72 businesses.
- City preparation uses a module worker, sending resolved recipes back individually to warm the shared immutable-recipe cache. The customiser remains synchronous. Worker errors/unavailability or 15-second stalls use a paced per-recipe fallback, with cancellation on changed input/unmount. Camera motion does not regenerate cached recipes. GPU geometry, instancing and final matrix upload remain on the rendering thread; this is not a claim that every source of startup delay has moved off-thread.
- New shared geometries are instanced and disposed with the existing render resources; fixes the previous mansard resource disposal omission.

## Verification

- 28 domain/cache/geometry tests passed, including window bounds, every preset's spiral clearance/roof landing, handrail winding and closed edges, legacy shell and roof tests.
- 16 typed Deno save-boundary tests passed, including new curated values and invalid-value rejection.
- Focused customiser browser check passed all window styles, spiral preview, undo, save and reload. City light/full toggle and drive entry/exit passed without page errors.
- Background worker browser test passed normal execution and deliberately unavailable Worker fallback.
- Production build passed and emitted the worker bundle. Development startup passed on a temporary port; user's 5188 server retained.
- Standard 400-property light-mode fixture on Intel UHD desktop GPU: 49 FPS / p95 33.4ms / 521 MB JS heap at desktop viewport; 60 FPS / p95 16.7ms / 286 MB for mobile-sized viewport on the same desktop GPU. This is not physical mobile verification or a controlled before/after comparison. An opt-in CITY_DETAIL_BENCHMARK fixture adds all new window styles and spiral stairs.

## Rollout

No database migration, provider generation or production activation. Updated strict profile data is also consumed by the world worker: main → city-campus-worker → city.ts → city-building-design-schema. Stage the five profile-consuming City endpoints and world worker revision 2026-09-22-city-design-3.14 together with the frontend when a staging target is designated. No staging deployment has been claimed.

Still outside this iteration: bay-window projections, arbitrary floorplan editing/interiors, compound dormer roofs, freeform stairs, geometry-buffer transfer from workers, and physical-mobile acceptance. The worker cache reduces recipe work on the UI thread; large scenes still carry meaningful memory and GPU costs.

Additional optimisation: sign preparation now caches and transfers only signs, instead of retaining another complete far-detail building merely to draw branding. A focused test verifies sign-only reads do not populate the full geometry cache. Light-mode arches use eight arc segments; full mode retains 24. The dense 400-property detail fixture measured approximately 45 FPS / p95 50ms after reducing curve detail, versus 35 FPS / p95 83ms in the earlier dense sample. These are development diagnostics, not controlled performance guarantees; heap readings vary with collection and concurrent tools.

Final sign-cache benchmark: dense 400-property detail scene, desktop 41.4 FPS / p95 50ms / 342 MB heap / 28 draw calls / 851,596 triangles. This variability reinforces that the samples are diagnostics rather than an isolated speedup claim. The physical-mobile check and broad-activation performance acceptance remain outstanding. Final TypeScript check passed after narrowing the sign-only cache result; worker/fallback browser checks passed on this implementation.
Final production build passed (Vite 1m26s). Known existing chunk-size and landing-atlas warnings remain. No deployment was performed.

The customiser now exposes a dedicated Windows tab with six visual cards (Automatic plus five styles), pressed-state selection, explanations, undo and a shortcut to native window blocks. The existing advanced dropdown remains available. Focused browser checks passed card selection, undo, mocked saving and mobile layout.


### Closed treads and straight apartment stairs

Spiral treads use a watertight wedge including both radial cut faces, with outward winding. Straight apartment stairs are procedural alternating flights with solid risers, treads, guarded landings and a roof landing. They remain visible in light mode and reserve a 7.2 m wall strip. Selecting this option aligns the side and selects a flat roof. Existing native fire escapes remain available. These are exterior visual assemblies; no usable interior floor doors or navigation are implied. Geometry tests cover every preset; browser checks cover choice, mocked save/reload and console errors. Hosted backend rollout remains pending designated staging.
