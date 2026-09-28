# City studio surfaces: wall materials, paint effects and floor finishes (September 2026)

The construction studio paints buildings with a library of procedural surface patterns: brick bonds, stone,
render, claddings, tiles, metal and concrete on walls, and timber, tile, stone, soft and paving finishes on
floors. Any material takes any colour; patterns scale and rotate, wear, can be painted over, fade and be
stencilled. Everything is local studio data: business validators reject the new fields, so business
behaviour, the curated texture ids and every existing recipe are unchanged.

## What is available

**Wall materials** (Paint → Material → surface library, grouped by kind):
brick stretcher, Flemish and English bonds; stone ashlar and rubble; render/stucco and smooth paint;
weatherboard (clapboard), shingles, timber cladding; corrugated metal; concrete panels with joints and tie
holes; glazed tile, Tokyo tile, subway tile, square and hex tile, terrazzo, marble and polished concrete.
The original photo textures stay as plain texture ids in the quick row (Smooth, Brick, Plaster, Stone,
Timber) and the Classic group (plus metal, terracotta and pavers).

**Floor finishes** (Rooms): timber planks, herringbone, chevron and parquet; square, hex, checker and subway
tile, terrazzo; stone flags, polished concrete, veined marble; carpet, studded rubber, cobbles, brick paving
(herringbone bricks) and tatami (1.8 × 0.9 m mats with cloth borders, alternating layout). Each has colour,
joint colour, scale, rotation and wear.

**Paint features**
- Tint: the brush colour tints every material (patterns and photo textures).
- Joints / accent colour: mortar, grout, veins, chips and borders.
- Pattern scale (0.25–4×) and rotation (15° steps).
- Wear: blotchy grime and extra roughness; on painted finishes it chips the paint.
- Painted over: paints the brush colour over the material's natural colour, keeping the relief (painted brick);
  the natural colour shows through wear chips.
- Soft edge (0–1.5 m feather) on generated walls.
- Fades: Rising damp (darker at the bottom of the stroke) and Sun-faded (paler at the top), with a custom fade
  colour and direction. A fade spans the vertical extent of the stroke, band or fill it is painted with.
- Stencils: horizontal bands or vertical stripes with stripe width and gap, dragged as a band.
- Swatch library with material groups, recents (per device) and the colour picker.
- Match (eyedropper, or Alt-click): picks up material, colour, scale, rotation, wear, paint and joint colour.
- Floor brush: arm "Paint rooms" and click rooms (Choose room), or paint every room of a storey at once; each
  storey also has its own default floor.

Every paint and floor edit is one labelled undo step ("Paint", "Floor finish"); slider drags coalesce.
Soft edges, fades and stencils are stroke effects of generated walls (free openings, facade rhythm or unified
facades). Kit tiles and whole parts take the material, colour, scale, rotation, wear and paint.

## Recipe fields (local-only)

```ts
StudioFinish = {color?, texture?, surface?: {
  pattern, accent?, scale?, rotation?, wear?, painted?,
  soft?,                          // paint regions only
  fade?: {color, y0, y1},         // paint regions only; face metres, y0 fully fade colour
}};
StudioRoomFinish.floorSurface?: {pattern, color?, accent?, scale?, rotation?, wear?};
StudioInteriorIntent.floorSurfaces?: {floor, surface}[];   // storey defaults
```

- `validSurfaceSpec` / `validFloorSurface` (src/domain/cityStudioSurfaces.ts) bound every value; part and
  tile finishes reject `soft` and `fade`; paint rules reject `fade`.
- Business imports (`validateVariationRecipe`) and profiles keep exact-key checks (`color`, `texture`; the old
  interior keys), so any recipe carrying these fields is refused there (tests cover both).
- Old ids: plain texture finishes keep their exact render path (`finishRenderTexture` returns the texture id).
  The library shows their CC0 equivalent (`LEGACY_TEXTURE_PATTERN`); rooms with a legacy `floorFinish`
  (timber/tile/stone) keep the old flat material, and the Rooms panel's quick timber/tile/stone buttons remain.
  `setRoomLegacyFloor` clears a patterned surface; a room with neither falls back to the storey default.

## How it renders

- **One pattern source.** `src/domain/citySurfacePatterns.ts` writes each pattern once against a small
  arithmetic interface (`SurfaceOps`): numbers draw swatches and run the tests, TSL nodes build the shader
  (`TSL_OPS` in `citySurfacePatternMaterial.ts`). Patterns are branchless (step/mix), per-tile tone and
  roughness come from a sine-free hash (stable at large world coordinates), rubble and cobbles use unrolled
  3×3 Worley cells, herringbone is solved on the (1,1)/(n,−n) lattice (a test proves full coverage without
  overlap).
- **Render keys.** A finish with a surface becomes `s:pattern|tint|accent|scale|rotation|wear|painted|fade`
  (`finishRenderTexture`). The key travels wherever a texture id travels: free-face wall batches, roof walls,
  kit instances and the city bake. Keys carry their tint, so vertex and instance colours are white for them.
- **Shared pipelines.** Each key is one node material (reference counted by the existing batch/kit caches),
  but every parameter is a uniform, so all keys of one pattern share one compiled pipeline. The browser check
  paints a new scale/wear of an already used pattern and asserts the renderer pipeline count stays the same
  (70 → 70). `retuneSurfaceMaterial` can retune a material in place.
- **Coordinates.** Generated walls use their face-metre uv (continuous along curved walls, and fades measure
  face height); kit pieces and floors project world position onto the surface plane.
- **Crisp regions.** Paint regions still split the outer skin by strips (cityStudioPaintGeometry). Soft edges
  are `SOFT_STEPS` (3) feather rings composited into strips (colour mixed by coverage, material switching at
  half), so edges stay exact and geometry-only; opaque layers resolve exactly as before.
- **Anti-aliasing.** Joints widen to the pixel footprint (`aa` = fwidth) and dim instead of aliasing; fine
  sub-features (weave, ribs, grain, chips) fade on their own; the whole pattern fades to its mean once pixels
  approach the main cell size. Bump relief fades out by 65 m.
- **Generated-wall wear.** Render-like patterns keep the stone reveal near openings; masonry patterns keep
  their own joints and take only the edge grime.
- **Low-power path** (`cityLowPower`): no bump and single-octave wear noise, a cheaper program.
- **WebGL2**: the same node materials run on the WebGL2 backend (smoke-tested).
- **Texture memory.** No new texture files. CC0 photo patterns share one GPU texture per file across every
  material (the curated texture path is unchanged).

## Performance and warm-up

Measured by the browser check (headless Edge on the development machine) on native WebGPU and the WebGL2 backend:

| | Native WebGPU | WebGL2 |
|---|---|---|
| Pipelines before/after retuning a painted pattern | 67 → 67 (no compile) | 67 → 67 |
| Longest main-thread task, plain colour fill (baseline) | 462 ms | 805 ms |
| Longest task per first fill with a new pattern (16 / 4 patterns) | 66–349 ms, median 216 ms | 233 ms – 2.0 s (up to 3.3 s in an earlier run) |
| Longest task, retuned fill (same pattern, new scale/wear) | 119 ms | 247 ms |
| Background warm-up per variant, end to end (wall / kit) | 0.8–2.0 s / 0.06–1.1 s | 0.9–2.2 s / 0.03–1.2 s |
| Synchronous part of a warm-up request | ≤ 1 ms | ≤ 1 ms |

Long tasks include the worker round trip, geometry upload and React work of each fill, so the baseline row is the
comparison: on WebGPU a first use of a pattern costs no more than an ordinary repaint.
Choosing a pattern in the library queues it with `requestSurfaceWarmup`; a mounted studio detail batch
compiles the generated-wall and kit variants off-screen through `compileAsync`, one pipeline at a time
(`warmSurfacePatterns` in cityStudioWarmup.ts; `window.__citySurfaceWarm` has the times). The synchronous part
is under 2 ms, so the pick itself never blocks; by the time the first stroke lands the pipeline is usually
ready. On WebGL2 the program link is synchronous: a first use can still cost 2–3 s once per pattern.

## Licences

All wall and floor patterns are self-authored procedural code in this repository (no third-party assets).
The CC0 ambientCG photo sets already bundled under `public/city/textures` (see
[city-texture-presets.md](city-texture-presets.md) and `public/city/textures/sources.json`) are reused for the
`cc0-*` patterns; no new textures were added.

## Files

- Domain: `src/domain/citySurfacePatterns.ts` (catalogue, pattern math), `src/domain/cityStudioSurfaces.ts`
  (specs, validation, render keys, fades, floor surfaces, brush helpers), `src/domain/cityStudioPieceSurface.ts`
  (kit piece keys and tints); paint regions (`paintStripes`, fade resolution), paint geometry (soft rings and
  compositing), free faces (base colour for compositing), detail batches, city bake, roof walls, interiors
  (room and storey surfaces), undo labels (`describeLandChange`).
- Rendering: `src/features/city/citySurfacePatternMaterial.ts`, `CitySurfaceMaterial.ts` (routing, shared
  occlusion), `CityStudioFreeOpeningFace.tsx`, `CityFloorSurfaceMesh.tsx`, `cityStudioWarmup.ts`.
- UI: `studio/StudioSurfaceLibrary.tsx`, `studio/StudioFloorSurfaces.tsx`, `studio/useSurfaceBrush.ts`,
  `studio/surfaceSwatch.ts`, `studio/studioSurfaces.css`.
- Tests: `src/domain/cityStudioSurfaces.test.ts`; browser: `scripts/city-studio-surfaces-browser.mjs`
  (screenshots `output/surface-wall-*.png`, `output/surface-floor-*.png`, `output/surface-swatches.png`,
  `output/surface-contact-sheet.png`, `-webgl` suffix on `CITY_BACKEND=webgl`).

## Known gaps

- Exterior paving, plot grounds, balconies and roof terraces still use their existing materials; the floor
  patterns are ready for them (`floorRenderKey`) but no local-only grounds field was added.
- Soft edges are three stepped rings, not a continuous gradient; fades are vertical only.
- Kit tiles use world-plane projection, so a pattern does not follow a kit piece's own rotation.
- At studio distances the finest patterns (terrazzo chips, studs, small cobbles) settle to their mean tone.
- WebGL2 first use of a pattern links its program synchronously (2–3 s once per pattern on the measured machine).
- Physical-mobile performance is unmeasured.
