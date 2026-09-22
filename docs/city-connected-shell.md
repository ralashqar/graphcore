# Connected procedural buildings — first architectural release

New recipes use `city-shell-2` within buildingDesign v3. Stored `city-grammar-1` recipes retain the old renderer; the preset panel exposes an undoable explicit upgrade. V1/v2 remain unchanged. Applying a complete preset is an explicit replacement using the new revision. Demo recipes now include all 18 compositions.

## Delivered

- Exposed-wall union analysis remains the source of external walls. Procedural wall thickness is consistently 0.3 m; horizontal walls own convex corner squares and perpendicular walls stop at their inner face instead of overlapping.
- The existing window partition now also cuts the main entrance. The door pane sits within the wall, not over a solid wall. Openings remain at all detail levels for the new revision.
- Closed outward-wound mansard roof with two slopes, reused and instanced alongside existing gable, hip and shed geometry.
- Mansard townhouse, industrial workshop, garden courtyard café and stepped theatre presets; generated local preview thumbnails.
- Shared strict save validator accepts the new revision and roof choice. Branding, owner/revision publication checks, Quaternius ownership and default-on light mode are preserved.

This is an independent implementation informed by the Pascal source review at commit 5ce72119d4b781c54f3fc96d5f3294b808cc78e5. No Pascal code, assets or packages were copied. No new runtime dependency or provider call.

## Verification

- 22 geometry/preset tests passed, including existing preset dimension coverage, watertight outward roof winding, corner ownership and entrance clearance at near/medium/far.
- 15 typed Deno tests passed, including all preset recipes through the shared schema and legacy/unknown revision handling. Deno schema check passed.
- Customiser rendered 18 thumbnails without browser errors. Focused browser test passed preset selection, undo, mocked owner save/reload and mobile layout. These are local mocked persistence tests, not a hosted publication claim.
- Full historical customiser script stops at its stale one-gallery assertion (the existing native source gallery makes two). The focused CITY_SHELL_AUDIT path covers this release independently.
- 72-property light-mode development sample, headless Chromium, Intel UHD ANGLE D3D11, 1440×900: idle 52.9 FPS/p95 33.4 ms; pan 40.4 FPS/p95 50 ms; drive 60.1 FPS/p95 16.8 ms. Map 44 calls/335k triangles; drive 41 calls/119k triangles; heap about 109 MB. Not a controlled before/after comparison; compilation ran concurrently. No 400-property or physical-mobile performance acceptance claimed.

## Rollout and remaining work

Local only. Deploy the City API, command, reconcile, building-art and Stripe webhook plus the world worker together to designated staging. Import evidence: world-generation/main → city-campus-worker → city.ts → city-building-design-schema. Worker revision: 2026-09-22-city-design-3.13. Staging identifiers remain unspecified. No production activation or spending.

The broader research roadmap is not all implemented by this slice: arched/bay procedural window families, chamfered/round footprints, compound connected gables/dormers, genuine spiral stairs, rebuild scheduling/worker compilation and 400-property cold-start optimisation remain. Existing native fire escapes stay available; this release does not pretend they are procedural spiral stairs. Physical mobile and controlled full/light benchmarks are still required before broad rollout.

Final verification: TypeScript compilation and production build passed (Vite 1m23s); development server startup passed. Build retains pre-existing large-chunk and missing landing atlas warnings. Temporary verification servers were stopped; the user's City server remains on port 5188.
