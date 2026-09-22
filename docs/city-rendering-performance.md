# City rendering performance — 22 September 2026

## Changes

- Up to 100 properties remain resident in both map and drive mode. Larger cities retain their existing streaming boundary.
- Immutable design recipes have weakly held assembly caches. Camera position no longer invalidates building assembly or instance lists. Brand/design/detail changes still invalidate their own result.
- City buildings prepare detailed and simplified representations once. One shared property-level decision chooses the representation for all its components. The editor continues to show the full design.
- Screen-space hysteresis promotes above 290 projected plot pixels and demotes below 210. Visibility is checked every 150 ms. Hidden properties remember their detail choice; paid displacement keeps the current representation visible throughout the transition. No LOD switch changes arrival timestamps.
- Simplified buildings retain authored footprint, floors, palette, roof choice, branding and grounds settings, using procedural facade geometry and square small primitives instead of native kit detail. They are an approximation of native facade styling, not an exact baked mesh of it. Nearby buildings use the full near-detail kit.
- Instanced buffers compact away offscreen properties and road/environment pieces. Buffers and source assets remain loaded. Selection and exposure metadata follow the compacted instance indices; sign-atlas indices remain unmodified.
- Batches upload only when their relevant visibility changes. Colours and environment bounds are cached. Inline piece-array allocation no longer forces uploads.
- Far textured surfaces use dominant-axis texture sampling; close surfaces retain blended projection and bump. The low-amplitude procedural noise layer is removed; real albedo/roughness maps and glass reflections remain.
- Sustained slow rendering can lower pixel resolution to a minimum 0.85 after startup, with a cooldown. Geometry does not reload. `cityQuality=high` disables this automatic pixel reduction; it does not disable visibility culling or distance detail.

No saved-recipe, database, publication or provider changes. No hosted deployment or paid generation.

## Measurement

1440x900 desktop viewport, headless Chromium with ANGLE D3D11 on Intel UHD Graphics. Five-second requestAnimationFrame samples after twelve seconds of warm-up. Pan follows the same repeated right-drag path; drive holds forward. Other desktop/browser work can affect these short measurements, so they are directional comparisons, not guaranteed frame rates or GPU-only timings.

Original development run: idle 18.3 FPS / p95 100 ms; pan 13.0 FPS / p95 366.6 ms; drive 26.7 FPS / p95 66.7 ms. Map rendering: 251 calls / 1,784,719 triangles. Drive: 182 calls / 1,646,490 triangles.

Intermediate optimised run (before restoring full near-kit detail): idle 44.5 FPS / p95 50 ms; pan 44.9 FPS / p95 83.2 ms; drive 50.4 FPS / p95 33.3 ms. Map: 47 calls / 327,598 triangles; drive: 95 calls / 192,326 triangles. JS heap increased from approximately 131 MB to 148 MB: intentionally retaining both representations trades memory for smooth transitions.

Reproduce with `node scripts/city-performance-browser.mjs`; set `CITY_TEST_ORIGIN` to the intended dev/preview origin. The script records GPU, draw calls, triangles, heap, frame-time percentiles, errors and map/drive screenshots under `output/playwright`. It browses the demo and makes no hosted writes.

## Verification

- Focused tests cover recipe caching, authored-design immutability, sign agreement and whole-building LOD hysteresis/displacement.
- Existing browser checks cover stable retained matrices, repeated held navigation, zoom, blur recovery, central reset, reduced motion, driving and mobile-sized controls.
- A mobile viewport on a desktop GPU is not a physical mobile-device benchmark. Physical-device validation remains outstanding.
- Deferred further work: baking native-style distant meshes/texture atlases to improve visual parity; worker-based initial assembly if larger-city startup requires it; physical-device quality tuning.

### Large-scene cold-start check

The existing 400-property benchmark passed its streaming assertions (desktop residents 302 → 116 on zoom; mobile-sized desktop viewport 222 → 103) and reported no runtime errors. Its short two-second warm-up captured an 8.28-second desktop startup frame, with ~793 MB JS heap. This is not acceptable evidence of smooth 400-property startup; initial assembly/asset preparation needs separate scheduling work before broad large-city activation. The subsequent mobile-sized desktop-GPU run measured 41.2 FPS, but is not a physical-mobile result and does not erase the cold-start finding. Do not present these as a 400-property performance pass.

### Final production-build check

Final code, same Intel UHD/D3D11/1440x900 setup, Vite production preview: idle 38.1 FPS / p95 66.6 ms; pan 30.6 FPS / p95 133.2 ms; drive 46.4 FPS / p95 33.3 ms. Map: 47 calls / 327,598 triangles. Drive: 92 calls / 214,920 triangles. JS heap ~139 MB. All 72 properties remained resident; no page or WebGL/shader errors were reported. This confirms improvement, not a sustained 60 FPS claim; pan tail latency still warrants further profiling. Original numbers above were development builds, so FPS comparisons are indicative rather than controlled production-to-production comparisons.

Final verification: `npx tsc --noEmit`, `npm run build`, `npm run dev` startup, six focused tests, stable resident matrices (14,911), navigation/reduced-motion checks, driving/mobile-control checks, and production runtime benchmark passed. Existing large-chunk and landing-atlas build warnings remain. Temporary dev/preview servers used for verification were stopped; the user's City server at 5188 was retained.

## Default-on light-mode experiment

`src/features/city/cityRenderMode.ts` now enables clean procedural rendering globally by default. `VITE_CITY_LIGHT_MODE=false` disables the default at build/dev startup; `cityLight=1` or `cityLight=0` provides a per-page comparison override. The demo banner has a Light mode checkbox which reloads with that override. The editor explains that the preview is overridden while retaining authored finish selections.

Light mode uses only the simplified procedural representation, skips Quaternius decoration-pack loading and attachment replacement, and resolves signs against the same effective recipe. It does not rewrite saved recipes, remove existing road assets or affect separate AI artwork. Switching back restores the original authored kit choices. The browser regression confirms no decorator-pack request in light map/drive and restoration when unchecked.
