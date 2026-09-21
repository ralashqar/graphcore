# Native architectural assemblies

Implemented 22 September 2026 in the shared v3 building resolver. In the business designer, open **Presets → Architectural assemblies**. Choices use the existing session undo/redo and owner/revision-checked draft/publication flow. `architecturalKit` is optional; absent or empty settings preserve existing recipes, including v1/v2. No database migration is required.

## Assemblies

- **Corners:** matching brick corner-column Bottom/Center/Top/Cap, marble bevel-column and metal column stacks. Storey-height fitting follows exposed convex corners and ends each stack at setbacks. Square posts own a corner once; a single diagonal marble bevel avoids overlapping perpendicular copies. Main and service door clearances exclude ornaments/columns.
- **Rooflines:** restrained small-metal, classical family-matched masonry and industrial metal profiles. Repeated centre cells fill the wall run; exposed ends and convex corners use their L/R and 90-degree counterparts. Rear-plane compensation aligns the extra return depth on corner pieces. Small cornices render near only; ordinary roof-edge geometry remains at medium/far distance.
- **Entrances:** wood/Door_2, metal-brick/Door_3, grand marble/Door_4 and grand concrete/Door_3. One frame owns a measured aperture; uniformly scaled leaves fit it. Entrance steps are independently optional and use the larger 2x2 entrance modules. Combined frame/steps fit ground-floor height and available forecourt depth. Existing portico geometry does not duplicate the selected native entrance.
- **Storefronts:** cafe recessed brick bays, boutique broad marble display windows and department-store trim windows with a split long canopy. Source `Prop_Awning_Long` has no unrelated business name. Storefront returns shorten to reserve two display bays around the measured entrance and sign; panels preserve their proportions. Ground-front panels change without replacing the selected upper-floor facade. Ordinary canopies serve as loading fallbacks.
- **Roofs:** complete rectangular slate perimeter assemblies, optional front dormer, four measured corner modules and a closed upper deck. Corners and sloped sections own separate packing cells. Rectangular office footprints are supported; courtyard/L/hall-and-wing designs retain the selected option as inactive and explain why. No inner-corner roof support is claimed. A solid roof fallback remains during loading and at far detail.
- **Secondary details:** three-piece connected planter runs replace eligible single planters; matching rails accompany fitted side stairs; a bounded ornament set and one small AC unit are optional. AC units require a flat/parapet roof without planted terrace or native slate roof. Fire escapes remain deferred.

All fittings use the same resolver in the editor and city. Decorations stay inside the plot and native door openings retain precedence. Window proportions remain unchanged. No manual placement, provider generation or third-party branded signs are added.

## Assets and performance

The CC0 Quaternius `Exports/glTF` source remains the only asset source. The existing offline Blender export/optimization workflow now outputs 142 curated nodes with authored UV/PBR materials, capped 512 px texture images and no fake interior shaders. Pack v8 is 9,203,212 bytes (previously 8,120,760). `cityKitDimensions.ts` is generated from the optimized GLB and keeps attachment bounds independent from facade panel-closing metadata.

Rebuild: run Blender with `scripts/build-city-decorators.py`, then `node scripts/optimise-city-decorators.mjs`. Assets remain lazy loaded, shared and instanced by geometry/material. Cornices, columns, ornaments and grounds details are near-only; roof silhouettes/frontages remain at medium detail. Failed requests retain procedural surfaces.

The reproducible CPU-only `scripts/city-kit-assembly-benchmark.mjs` uses 400 mixed recipes (8 near, 92 medium, 300 far). One warm run recorded baseline 45,573 procedural parts / 4,869 attachments / 61 distinct assets versus 44,992 / 6,616 / 81 with the kit. Recipe assembly measured 213 ms versus 196 ms; these noisy CPU timings are not a GPU speedup or frame-time claim. No physical-mobile or GPU draw-call/frame-time benchmark has been performed.

## Verification and rollout

Geometry tests cover all supported footprints, family choices and dimension extremes, deterministic output, frame ownership, adjacent cornice cells, optional roof compatibility, old-recipe equivalence and detail levels. Actual exported-mesh ray tests cover the slate roof including dormer/corner seams and native cornice continuity. Shared Deno tests verify strict recipe parsing, public-profile preservation and rejection of unknown/executable fields. Browser fixtures cover preset changes, saved draft reload, undo, mobile controls and complete asset-load failure with a usable preview.

Local evidence: `output/city-kit-tests.log` (30-test broad regression), `city-kit-final-tests.log` (24 focused tests after final fitting refinements), `city-kit-deno.log`, `city-kit-deno-check.log`, `city-kit-browser.log`, `city-kit-tsc.log`, `city-kit-build.log`; preview images are under `output/playwright/city-kit-*`.

Staging deployment remains pending because no designated staging project/app has been supplied. The actual import chain is `workers/world-generation/main.ts → city-campus-worker.ts → city.ts → city-building-design-schema.ts`. Pair the frontend with `city-command`, `city-api`, `city-building-art`, `city-reconcile`, `city-stripe-webhook` and the world worker (`2026-09-22-city-design-3.10`). Unrelated game workers are unaffected. Hosted saving of the new optional fields needs that matching schema rollout. No production deployment or provider spending was performed.

The React review keeps assembly notes memoized by recipe/brand and reuses the existing renderer memoization and asset loader. Native roof materials follow the roof texture channel rather than wall overrides. Browser verification includes mock persistence, undo, all entrance/frontage options, mobile width, shader/runtime error capture and a deliberately failed GLB request. These local checks do not establish hosted publication or physical-device GPU performance.

Final verification: TypeScript, production build, shared Deno checks/12 validation tests, the broad native assembly suite, final fitting tests, editor browser checks and driving/mobile checks pass. Fresh Vite startup passed. Existing public-manifest, unresolved landing-atlas and large-chunk warnings remain. No physical-device acceptance or hosted publication was performed.
