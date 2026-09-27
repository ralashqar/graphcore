# Generated walls at city scale (September 2026)

Step 5 of "Unifying facades" (`docs/city-studio-game-ux.md`): make many generated-wall buildings cheap in the city
(map and driving views, plots not being edited) before business buildings adopt them, and prove it with a
400-property benchmark. Local studio plots only: no recipe, schema, validator, backend or provider change.

## What changed

Every finished studio plot (recipe v5/v6, not the plot being edited) now draws through one component,
`CitySculptCity` (`src/features/city/CitySculptCity.tsx`), instead of one `CitySculptBuilding` each. The old
per-building path is unchanged and still draws the edited plot; `?cityGwBatch=0` routes every plot back to it.

| Piece | Before (per building) | Now (city) |
|---|---|---|
| Worker | one background lane, `number[]` envelopes normal-computed on the main thread | a pool of up to 3 city workers (`prepareSculptCity`); the worker bakes everything static into world space, transferred as typed arrays with normals (`src/domain/citySculptCityBake.ts`) |
| Generated walls, roofs, roof edges, flashing, entrance path | 10–20 meshes and materials per building | chunks of 2×2 plots concatenate their plots' bakes per material (`src/domain/citySculptCityChunks.ts`): about 4 draws per chunk. Colour is a vertex attribute, so different finishes share one material (`freeWallMaterial(..., vertexColor)`, a vertex-coloured surface material, a vertex-coloured glass) |
| Kit pieces (kit tiles and kit pieces inside generated walls) | an instanced mesh per module × channel × texture per building | one instanced mesh per module × channel × texture for the whole city (`CitySculptSharedKit.tsx`), world matrices computed once per plot, compacted to the visible plots |
| Signs | a canvas texture and material per building | one 2048² atlas (256×48 cells) and one merged quad mesh |
| Grounds | a design preparation per building | three shared preparations (three design workers) |
| Near detail (frames, surrounds, inner skin, trims, door leaves, interiors, see-through glass, full-resolution sign) | always mounted, switched by distance | a near overlay: the plot's own merged detail batches (`CityStudioDetailBatches`, unchanged), mounted hidden from 95 m and shown inside 55 m |

### Levels

| Level | Where | Drawn |
|---|---|---|
| Near overlay | inside 55 m (leave at 65 m), as before | the plot's per-building near detail; its chunk leaves out that plot's far detail (index rewrite in place, draw range, no new buffers) |
| Chunk far | everywhere else | the generated walls' existing far representation (outer skin with real holes, reveals, glass, dark aperture fills; see `docs/city-free-faces-performance.md`), roofs, edges, flashing, path |
| Kit near | 3D camera distance under 120 m | all kit pieces, including `minDetail: near` modules (as before) |
| Kit full | from 120 m to 135 m equivalent distance | kit pieces without near-only modules (as before) |
| Kit medium | 135 m (leave at 121.5 m) to 400 m (leave at 448 m) | the same pieces from the prepared medium kit (see "Medium kit" below) |
| Kit proxy | beyond | business-style far proxies: the kit wall channel as boxes around the aperture, a recessed glass pane, other modules as one box |
| Hidden | outside the view frustum (bounds of the plot's kit pieces) | kit instances compacted away; chunks are frustum-culled per mesh |

Distances are horizontal camera distances, or the orthographic equivalent from the plot's on-screen size (the
existing `viewDistance`). Swaps never leave a gap: the overlay reports itself only after its detail is mounted,
and when a plot leaves the near radius the chunk takes it back while the overlay stays drawn for 0.6 s.

The proxy threshold is deliberately far. A 150 m switch cut the map view from 3.3M to 0.86M triangles and its
p50 from 67 to 17 ms, but changed 9.4 % of map pixels (window frames, sills, balconies and cornices become boxes),
so it is not the default. `?cityGwKitFar=<m>` moves the switch for measurements. The medium kit (below) takes most
of that saving without the change in look.

### Medium kit (September 2026)

Kit window triangles dominated the zoomed-out map (about 2.6M of 3.1M for 396 unified buildings, 3.7M of 4.0M as
kit tiles). The medium kit is a prepared low-detail copy of each kit, drawn between the full kit and the proxies.

**Asset pipeline.** `scripts/build-city-kit-medium.py` (Blender 5.0, headless, deterministic) reads the shipped
`public/city/synarc-kit/v{2,3,4,5}/kit.glb` and writes `kit-medium.glb` and `kit-medium.json` (source and output
SHA-256, per-module triangles and what was removed) next to it:

```
"C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup --python scripts/build-city-kit-medium.py [-- 2 3 4 5]
```

The kit modules are boxes (bevelled with one segment in the New York and collection modules), six-sided rods and a
few cones. Per module, in module space:

- Bevels: a convex bevelled box (at least 80 % of its bounding box volume, faces on all six sides) becomes its
  bounding box. Bevels only cut corners, so each part keeps its outer extents: a 44-triangle frame, sill, jamb or
  cornice step becomes 12 triangles or fewer.
- Small parts: islands under 10 cm in every direction (knobs, dentils), and strips under 4.5 cm across and 30 cm
  long (handles, shutter louvres). Scroll ornaments are made of such short rods, so rail scrolls go too.
- Hidden faces: faces facing into the wall at or behind the wall front of window, door, trim and ornament modules;
  wall-channel faces resting on the module below; faces inside or against another box of the same module. Walls,
  parapets, cornices and other crowns keep their back faces (they can stand above a roof edge; plain walls are also
  terrace parapets). A first version without that exception lost the parapets' inner faces (3.5 % of kit-tile map
  pixels).
- Kept: window frames, mullions, transoms, glazing bars, reveals, sills, lintels, keystones, jambs, piers, shutter
  panels, awning stripes, cornice steps and brackets, balusters and rails, water tanks and roof items.

Output normals are flat and there are no UVs (the city surface material is triplanar in world space). Root names and
material names match the kit, so `loadStudioKit(version, 'medium')` reads it like the kit. The assets are derived
from the self-authored CC0 kit only. `src/domain/cityStudioKitMedium.test.ts` checks that each medium file was built
from the current `kit.glb` (rebuild after any kit change), has the same modules, never adds a channel, keeps geometry
for every module drawn beyond 120 m, and stays under 60 % of the kit's triangles.

| Kit | Full triangles | Medium | Example |
|---|---|---|---|
| v2 | 10,792 | 4,515 (42 %) | |
| v3 | 11,108 | 4,793 (43 %) | window-sash 204 → 128 |
| v4 (New York) | 21,286 | 8,901 (42 %) | window-nyc-sash 576 → 116, nyc-cornice 528 → 122 |
| v5 | 28,414 | 14,024 (49 %) | |

Near-only modules (scrolls, rosettes) are never drawn at the medium level; their medium entries are placeholders.

**Runtime.** `CitySculptSharedKit` loads both kits per version and refines CitySculptCity's `full` level into
`medium` from 135 m equivalent distance (back to full inside 121.5 m), five times a second and on every level change,
only once that version's medium kit has loaded. Medium groups are their own instanced meshes (one per module ×
channel × texture, like the other levels); a level change only recompacts the affected plots' blocks, so there is no
remount and no gap. `?cityGwKitMedium=<m>` moves the switch and `?cityGwKitMedium=0` turns the level off; a forced
kit level (`__cityGwForce={kit:…}`, which now also accepts `medium`) disables the refinement. Kit-tile (legacy)
buildings go through the same shared kit and get the same level. The per-building path (`CityStudioMeshes`: the
edited plot, `?cityGwBatch=0`) swaps a studio building's kit to the medium kit beyond the same distance; business
buildings keep CityVisibility's full/proxy switch at 55/65 m. In development `window.__cityKitStats()` and
`__cityGwStats.kit` report kit triangles per level.

**Results** (`scripts/city-generated-walls-benchmark.mjs`, 396 plots, the same code with `?cityGwKitMedium=0` as
"full"; generated-wall changes from concurrent work were live in both runs, so draw calls differ from the tables
below). Triangles are the renderer's per-frame mean; "kit" is the shared kit's own share.

Native WebGPU, `pfull` against `pmed`:

| View | Unified: triangles (kit) | Unified: calls | Kit tiles: triangles (kit) | Kit tiles: calls |
|---|---|---|---|---|
| Map (zoomed out) | 3.10M → **1.22M** (2.56M → 0.67M) | 227 → 229 | 4.00M → **1.38M** (3.67M → 1.06M) | 150 → 150 |
| Map zoomed | 1.46M → **0.71M** (1.03M → 0.28M) | 182 → 182 | 1.90M → **0.79M** (1.66M → 0.56M) | 128 → 128 |
| Drive, standing | 1.81M → **0.98M** | 235 → 275 | 2.44M → **1.27M** | 169 → 223 |
| Driving | 1.68M → **0.89M** | 227 → 265 | 2.35M → **1.15M** | 166 → 216 |
| Studio over its neighbours | 1.92M → **1.24M** | 310 → 357 | 2.37M → **1.41M** | 225 → 291 |

The zoomed-out map drops by 61 % (unified) and 65 % (kit tiles); the kit itself by 74 % and 71 %. GPU memory
(renderer estimate) is unchanged on the map (137–150 MB) and 20–60 MB higher in drive and studio views, where both the
full and the medium kit are in frame (their instance buffers and a second geometry set). JS heap is within run-to-run
noise (unified 0.58–0.64 GB, kit tiles 0.33–0.39 GB). Load to settled: 59 s → 48 s (unified), 75 s → 58 s (kit
tiles); both kits load in parallel (the medium files are 0.3–1.0 MB). Studio edit preview-to-frame p50 was 224 → 173
ms (unified) and 132 → 152 ms (kit tiles): unchanged within noise, since the edited plot is always near.

Frame times on this machine were shared with other browser benchmarks during these runs and are not a reliable
comparison; triangles, draw calls and memory are.

Parity (`node scripts/city-generated-walls-parity.mjs <full> <medium> <variant> [-webgl]`, share of pixels changed
by more than 40/255 / mean difference):

| Variant (native) | Map | Map zoomed | Drive | Studio | Studio, all far |
|---|---|---|---|---|---|
| 396 unified (`pfull`/`pmed`) | 0.12 % / 0.59 | 0.08 % / 0.35 | 0.02 % / 0.20 | 0.21 % / 1.79 | 0.21 % / 1.79 |
| 396 kit tiles (`pfull`/`pmed`) | 0.12 % / 0.64 | 0.09 % / 0.40 | 0.03 % / 0.25 | 0.10 % / 1.21 | 0.10 % / 1.21 |

WebGL2 (`CITY_BACKEND=webgl`) was not measured for the medium kit.

The remaining differences are single pixels on frame and sill edges where a bevel's shading is gone. Screenshots:
`output/city-gw-{pfull,pmed}-{unified,kit}-{map,map-zoomed,drive,studio}.png`; diffs
`output/city-gw-diff-pfull-pmed-*.png` (kit tiles) and `output/city-gw-diff-pfull-pmed-unified-{map,drive}.png`.

### Edited plot and edit latency

`CityLandScene` keeps the edited plot on `CitySculptBuilding` and out of `CitySculptCity`, so the studio edit path
(interactive worker lane, per-building meshes) is untouched. Opening a plot removes it from its chunk at once;
finishing re-bakes it and rebuilds that chunk only. Collision and doors: every finished plot still publishes its
studio result (without geometry) to `cityStudioRegistry`; a plot's registry entry is withdrawn only if it is still
this component's.

## Benchmark

`scripts/city-generated-walls-benchmark.mjs` (Playwright, Edge, Vite dev server; `CITY_TEST_ORIGIN`):

- Every estate position of the 400-address demo city becomes an owned land plot with a finished studio building
  (396 plots, `CITY_BENCH_PLOTS` limits it; the demo businesses move to an outer ring, `CITY_BENCH_BACKGROUND`,
  default none).
- `unified`: plot `i%6` 0–2 are the six New York presets converted with `convertToUnifiedFacade`, 3–4 facade
  rhythm buildings (six styles, seed `i`), 5 a round tower with an oval wing and a rhythm (198/132/65 buildings);
  the first plot is the 17-opening free-face building the edit test drags. `kit`: the same buildings as kit
  tiles (presets as authored, no rhythm).
- Views: map (default camera zoomed out), map zoomed, map pan, drive spawn standing, driving (forward 7 s, turn),
  the studio pulled back over its neighbours; worker round trips; 16 free-opening edits (preview-to-frame).
  `CITY_BENCH_PATH=building` is the old per-building path (same code, `?cityGwBatch=0`).
- `CITY_BENCH_SHOTS=1` writes `output/city-gw-<label>-<variant>-<view>.png`;
  `scripts/city-generated-walls-parity.mjs <a> <b>` diffs two runs (UI panels masked).

Environment: Intel UHD, Edge headless (ANGLE D3D11 for WebGL2), 1280×800, Vite dev server. Frame times are rAF
intervals (they quantise to 16.7/33/50 ms). Other browser tests were running on the same machine during some
runs, so single-run frame percentiles are noisy; draw calls, triangles, load and memory are stable.

### Results: 396 unified buildings (native WebGPU)

Before: the per-building path (`CITY_BENCH_PATH=building`, two runs: `fbefore`, `gbefore`). After: `hafter`.
Frame times are p50 / p95 / p99 in ms.

| View | Draw calls | Triangles | Frames before (two runs) | Frames after |
|---|---|---|---|---|
| Map (zoomed out) | 1,559 → **177** | 2.84M → 3.11M | 50/50/67 · 67/67/83 | **33/50/67** |
| Map zoomed | 811 → **138** | 1.38M → 1.46M | 33/33/34 · 33/50/50 | **17/34/50** |
| Map pan | 823 → **147** | 1.45M → 1.57M | 33/417/533 · 33/467/750 | **17/50/100** |
| Drive, standing | 2,457 → **198** | 4.72M → **1.84M** | 50/67/83 · 83/100/100 | **17/33/50** |
| Driving | ~2,070 → **189** | 3.86M → **1.75M** | 67/100/867 · 83/100/633 (max 2.7 s) | **17/34/50** (max 67) |
| Studio over its neighbours | 2,623 → **258** | 4.35M → **1.91M** | 100/233/233 · 83/100/100 | **33/50/50** |

| | Before | After |
|---|---|---|
| All plots prepared (page load to last result) | 161 s · 130 s | **12.5 s** (bakes done at 9.4 s) |
| Settled (draw calls and triangles stable) | 178 s · 145 s | **38 s** (grounds preparation is the tail) |
| Worker per plot, city pool | — | resolve 54 ms + bake 8 ms (3 workers in parallel; 64–100 ms in busier runs) |
| Worker round trip, background lane, cache-busted | 115–154 ms | 107–160 ms |
| JS heap | 1.1–1.9 GB | **0.62–0.68 GB** |
| GPU memory (renderer estimate) | 117 MB map … 540 MB studio | 147 MB map … 235 MB studio |
| Studio edit, preview to frame p50 / p95 | 284 / 400 · 400 / 676 ms | **153** / 624 ms |
| Frames during the edit drag, p95 | 83 · 117 ms | **50** ms |

The zoomed-out map is the one view that does not get cheaper in triangles: the old path frustum-culled each
building's own instanced meshes, the city path culls kit instances per plot (bounds of the plot's kit pieces) and
chunks per 2×2 plots, and the view is dominated by kit window triangles either way. Its frame time still improved
with a tenth of the draws. Edit latency p95 is dominated by the worker resolve of the edited plot, which is unchanged.

### Today's kit-tile buildings (the same 396 plots as kit tiles, native)

| View | Draw calls | Triangles | Frames before → after |
|---|---|---|---|
| Map | 1,866 → **139** | 3.74M → 4.00M | 50/50/67 → **33/50/67** |
| Map zoomed | 992 → **117** | 1.73M → 1.90M | 33/84/700 → **17/50/50** |
| Map pan | 1,011 → **127** | 1.93M → 2.02M | 50/850/1317 → **17/50/83** |
| Drive, standing | 2,907 → **169** | 6.27M → **2.44M** | 100/133/133 → **17/50/50** |
| Driving | 2,558 → **166** | 5.32M → **2.31M** | 83/150/1667 → **33/50/67** |
| Studio | 3,217 → **208** | 5.84M → **2.37M** | 83/117/167 → **33/50/67** |

Loaded in 6.5 s instead of 134 s; JS heap 0.33 GB instead of 0.74–1.76 GB; GPU memory 155–205 MB instead of
403–1,751 MB. On the city path unified buildings cost about what kit-tile buildings cost (fewer triangles, since
generated walls replace the kit wall slabs, and a few more draws for the chunk wall batches).

### WebGL2 (`CITY_BACKEND=webgl`, unified)

| View | Draw calls | Triangles | Frames before → after |
|---|---|---|---|
| Map | 1,559 → 177 | 2.84M → 3.11M | 84/133/133 → **33/50/83** |
| Map zoomed | 811 → 138 | 1.38M → 1.46M | 100/117/117 → **17/33/67** |
| Map pan | 816 → 140 | 1.44M → 1.47M | 83/1067/4033 → **17/34/100** |
| Drive, standing | 2,457 → 198 | 4.72M → 1.84M | 83/117/417 → **17/34/34** |
| Driving | 2,348 → 188 | 4.38M → 1.74M | 117/333/6600 → **17/33/66** (max 333) |
| Studio | 2,508 → 258 | 4.15M → 1.91M | 150/217/250 → **17/33/34** |

Loaded in 18 s instead of 172 s; heap 0.59–0.63 GB instead of 1.1–1.5 GB.

### Far kit proxies (not the default)

`proxy150` (`?cityGwKitFar=150`): map 3.36M → 0.86M triangles and p50 67 → 17 ms, but 9.4 % of map pixels (6.3 %
zoomed) change against the per-building path: window frames, sills, balconies and cornices become boxes.

### Parity

`node scripts/city-generated-walls-parity.mjs <before> <after> [variant] [-webgl]`: share of pixels changed by more
than 40/255 and the mean difference (/255), UI panels masked. Diff images: `output/city-gw-diff-*.png`.

| Comparison | Map | Map zoomed | Drive | Studio | Studio, all far |
|---|---|---|---|---|---|
| 396 unified, native (`gbefore`/`hafter`) | 0.00 % / 0.01 | 0.00 % / 0.01 | 0.00 % / 0.02 | camera differs* | camera differs* |
| 396 kit tiles, native (`fbefore`/`hafter`) | 0.00 % / 0.01 | 0.00 % / 0.02 | 0.00 % / 0.01 | camera differs* | camera differs* |
| 396 unified, WebGL2 (`fbefore`/`hafter`) | 0.24 % / 1.51 | 0.18 % / 1.42 | 0.01 % / 0.03 | 0.18 % / 1.68 | 0.18 % / 1.67 |
| 40 unified, native (`sbefore`/`safter`) | 0.00 % / 0.01 | 0.00 % / 0.01 | 0.00 % / 0.01 | 0.20 % / 1.65 | 0.21 % / 1.64 |

\* The studio camera is pulled back with the mouse wheel; on the native per-building path with 396 plots the page
runs at about 10 fps and the zoom glide ends elsewhere, so those two shots are not comparable. The 40-plot native
run and the 396-plot WebGL2 run compare the same camera.

- Map and drive views (the drive view has near overlays and far chunks in one frame) are pixel-identical on WebGPU.
- The remaining differences are isolated single pixels on kit window edges: kit instances now carry world
  matrices (the plot transform folded in, Float32) instead of a nested transform.
- "Studio, all far" pins every unedited plot to its far representation (`__cityGwForce={overlay:'far'}`, and the
  old path's `__cityStudioDetailForce='far'`), so the chunks' far walls are compared with the old far walls.
- Baked AO, lighting and reflections: the per-building path had no baked AO attributes on generated walls, roofs or
  kit pieces either, so nothing is lost; the chunk glass keeps the canvas-scoped prefiltered reflection
  (`useCityReflection`); lighting, haze and the wall wear shader are the same materials with colour moved to a
  vertex attribute.

## Verification

- `npx tsc --noEmit`: clean. `npm run build`: succeeds (existing chunk-size warnings).
- Unit tests, 256 passing: `node --experimental-strip-types --test src/domain/cityStudio*.test.ts
  src/domain/citySculpt*.test.ts src/domain/cityBuildingVariation*.test.ts src/domain/cityNyc*.test.ts
  src/domain/cityLand*.test.ts src/features/city/citySculptService.test.ts src/features/city/cityStudioTrimMerge.test.ts`.
  New: `src/domain/citySculptCityBake.test.ts` (far detail and envelope kept; world transform of positions,
  normals and the sign; vertex colours; one batch per material; chunk concatenation; leaving one plot's detail
  out) and a city-pool test in `citySculptService.test.ts`.
- Browser suites on native WebGPU (dev server on port 5190): every `scripts/city-studio-*-browser.mjs`,
  `city-furniture-browser.mjs`, `city-variation-studio-browser.mjs` and `city-nyc-browser.mjs` pass (curved walls
  and NYC needed one retry while other browser tests shared the machine). `city-land-browser.mjs` fails waiting for
  "Save & Finish", a button the studio no longer has; it fails the same with the batches switched off, so it is a
  stale test, not this change.
- The benchmark and parity scripts ran on WebGPU and WebGL2 (tables above).

## Limits

- Triangles, not draw calls, bound the zoomed-out map on this GPU. With the medium kit, 396 unified buildings are
  about 1.2M triangles (3.1M with the full kit); proxies would cut further but change the look.
- The medium kit adds instanced meshes: a plot switching between full and medium kit uploads its instance blocks to
  the other level's meshes (as the proxy switch does), and drive views with both levels in frame draw about 40 more
  calls and hold 20–60 MB more instance memory. Rebuild `kit-medium.glb` whenever a `kit.glb` changes (the unit test
  fails until then).
- The near overlay re-resolves the plot on the background lane when it first approaches (about 100 ms, off-thread);
  trims are still fitted on the main thread when an overlay mounts (hidden, before it is needed).
- Chunks keep their merged arrays on the CPU (needed to rebuild without one plot); the far detail and envelope
  of 396 buildings are about 1.3M triangles.
- Grounds still prepare the whole land design (a preset building) just for its grounds layer; it now runs on three
  shared workers instead of one per plot, but a grounds-only preparation would load faster.
- The old per-building path remains for the edited plot, non-studio sculpt recipes and `?cityGwBatch=0`.
- Physical-mobile validation is pending.

## Instanced openings and cached faces (September 2026)

Two follow-ups for the generated walls themselves: identical openings are no longer built and stored once per
opening, and resolving a building no longer rebuilds faces whose inputs did not change. Local studio plots only: no
recipe, schema, validator, backend or provider change; version-1 rhythm hashes are unchanged.

### Instanced openings

An opening's own detail (surround, frame, mullions, sill, glass or dark aperture fill, glazing bars, static door leaf,
rail, bar and handle) depends only on its shape, not on where it stands. It is now a canonical piece
(`src/domain/cityStudioOpeningPieces.ts`) placed by a matrix:

- **Key.** The group relative to its origin (x0, and y0 for windows; doors keep face heights because rail and handle
  heights are measured from the base), quantised to 0.1 mm, plus style, glazing, openable (v6), surround and wall
  thickness, hashed. The size thresholds of the detail (vertical bar on panels wider than 0.85 m, transom bar, arched
  leaf, wide door) are decided on the group as built and are part of the key, so a rhythm panel of exactly 0.85 m
  keeps whichever bar it had (float noise decided that before, and still does per opening).
- **Piece.** Built once per thread into two tiered geometries, indices `[near-only, both, far-only]` like the detail
  batches: `painted` (trim and frame near only; door leaf, rail, bar and handle in both, or far only on openable v6
  faces) and `glass` (glazing and glazed leaves in both, dark aperture fills far only). Painted vertices carry a tint
  slot (trim, frame, door leaf, or their own colour for the brass handle).
- **Instance.** A building-local matrix and four tints (trim paint region, frame, door leaf, glass). Straight faces
  rotate and translate; curved faces map onto the opening's flat chord plane (`planePoint`), which stretches x by
  chord/arc width, a few per cent at most (the instance shader corrects the normals for it; the old bend did not).
  On curved faces the surround follows the arc and stays merged in the face; everything else is instanced.
- **Wall.** The wall with its cut holes, reveals, paint and wear band stays merged per building, unchanged.
- **Worker.** Faces built with `instance` list their openings instead of emitting that detail
  (`buildFreeOpeningFaceGeometry(..., {instance})`); `buildStudioDetailBatches` returns `openings` (instances per key)
  next to the batches; the city bake carries them in world space (`bake.openings`), so the chunks' far detail no longer
  contains opening glass and leaves. Each worker sends a piece to the main thread once; the main thread keeps one
  registry (`cityStudioOpeningRegistry.ts`, dependency-free), and a key is the same geometry wherever it was built.

Rendering (`src/features/city/CityStudioOpeningInstances.tsx`): one store per scene. Buildings register their
instances as blocks in world space with a level; the store draws one `InstancedMesh` per piece key and variant for the
whole scene: `painted-near`, `painted-far`, `glass-see` (near, see-through), `glass-near` (near, opaque where nothing
is behind the glass) and `glass-far`. Tints are instanced vertex attributes read by three shared node materials (the
detail batches' painted, see-through and opaque glass shading), so every finish shares one draw per piece. Far glass
of rectangular windows (5,809 of 8,065 openings in the benchmark city) does not use its key's far variant: it is one
shared unit rectangle, scaled per instance (`unitRectPiece`), so rectangular windows of every size draw far in one
glass and one aperture draw.

- **Levels are the batches' levels.** `CityStudioDetailBatches` (edited plot, near overlays, per-building path)
  registers its building at its own LOD (near/far, see-through as before, owners hidden by floor slicing left out,
  off while any ancestor is hidden, so a preloaded overlay draws nothing). `CitySculptCity` registers every ready plot
  at the far level from its bake and turns it off exactly when its chunk leaves out that plot's far detail (overlay
  shown); the overlay then draws it at the near level. During the 0.6 s leave both draw, as the chunk and overlay did.
- Blocks outside the frustum are left out (bounds of their instances, tested at most every 0.15 s); a change rewrites
  only the instance buffers of the keys it touches, grown by powers of two. The instanced materials are compiled once
  through the existing warm-up. `canvas.dataset.cityOpenings` (DEV) reports keys, meshes, drawn meshes and instances.
- Switch for measurements: `?cityOpenings=0` builds every opening into the merged batches as before (the worker gets
  the flag with each request; `OPENING_INSTANCING` in Node).

Share instanced (`node --experimental-strip-types scripts/city-opening-stats.mjs`, the 396 benchmark buildings, all
counted as if near):

| | |
|---|---|
| Generated openings (shaped groups; New York kit apertures are kit pieces already) | 8,065 in 198 buildings |
| Distinct pieces | 72 (35 rectangular: far through the unit rectangle) |
| Opening-detail triangles instanced | near 86.6 % (the rest are curved surrounds), far 100 % |
| Stored for that detail | 139.3 MB merged before; 21.6 MB now (19.5 MB curved surrounds and roof openings still merged, 0.9 MB instances, 1.2 MB pieces) |
| Chunk far detail | 1,185,884 → 1,055,488 triangles |

Equivalence: `cityStudioOpeningPieces.test.ts` expands the instances and compares them with the merged detail
(instancing off) for free openings (v5 and v6 openable doors), a townhouse rhythm and a curved tower with a rhythm:
same triangle counts per tier and material, area, centroid and colour; every rhythm style (two seeds each) matches in
triangle counts; unit rectangles match their pieces' far range.

### Face cache and faster faces

- **Face cache** (`src/domain/cityStudioFaceCache.ts`). A built face (hole cutting, triangulation, wear distances, paint
  split, bend) is cached per thread under a 106-bit hash of its inputs: dimensions, exposed region, groups (not their
  ids), palette, paint and build options, plus the curve and its coarse ring for curved faces. The key hashes float
  bits directly (`InputHash`): building it with `JSON.stringify` was most of a cached face's cost. LRU, 32 MB per
  thread; results are shared and read-only (nothing downstream mutates them; transfers use fresh merged copies). An
  edit rebuilds only the faces it changes; a design repeated on other plots (or rotated) resolves from the cache.
  Each worker reply reports its hits and misses (`timing.faces`; `citySculptCity.worker.faceHits/faceMisses` in DEV).
  `?cityFaceCache=0` / `FACE_CACHE.enabled=false` turns it off.
- **Carving.** The far field and near band are now two clipping sweeps instead of five (unions of bands and holes
  were redundant). Kit apertures get no wear band (they never had wear), so a face with only kit pieces is the
  region minus holes, and holes that are axis-aligned rectangles strictly inside the region are simply added as hole
  rings (no sweep); doors at the base and abutting tiles are still clipped. Shaped faces produce byte-identical
  geometry; New York faces keep the same wall area (checked on 320 faces, largest relative difference 1e-15) with
  slightly fewer triangles.
- **Regions.** The exposed-region union is memoised, and bays that tile the whole wall (87 % of faces) give the
  rectangle directly. Colour parsing in the face builder is memoised.
- **City pool.** Not routed by design: each of the three city workers builds a face once and then hits its own
  cache (79 % hits over the 396-plot load, 1,248 of 1,585 faces).

### Results

Resolve, Node, quiet machine, median of 25 (`scripts/benchmark-city-unified-facades.mjs`; cold clears the face cache
before every run, cached is the same design again). Before: `HEAD` 7c91b7d.

| Preset | Kit | Unified before | Unified now, cold | Cached |
|---|---|---|---|---|
| Corner deli | 3.4 ms | 17.8 ms | **8.7 ms** | 4.8 ms |
| Neighborhood café | 1.9 ms | 10.4 ms | **5.3 ms** | 2.9 ms |
| SoHo cast-iron loft | 3.2 ms | 17.5 ms | **7.5 ms** | 4.0 ms |
| Garage workshop loft | 1.9 ms | 13.0 ms | **4.8 ms** | 2.9 ms |
| Balcony apartments | 3.0 ms | 17.7 ms | **7.1 ms** | 3.6 ms |
| Ornate commercial corner | 4.2 ms | 24.2 ms | **8.5 ms** | 5.4 ms |

The 396 benchmark buildings in one thread (`scripts/profile-city-resolve.mjs`; `SRC=<dir>` runs another copy of
`src/domain`, here `git archive HEAD`):

| | Before | Now |
|---|---|---|
| Cold, per building: New York / rhythm / curved | 17.9 / 47.2 / 51.1 ms | 6.6 / 35.4 / 49.2 ms |
| In plot order (one worker's view), total | 12.5 s | **5.0 s** (face cache 88 % hits, 32 MB) |
| Resolve and detail merge, total | 13.5 s | **4.6 s** |
| Studio examples (`scripts/benchmark-city-studio.mjs`, median) | 2.4 / 8.2 / 4.9 ms | 2.2 / 7.7 / 5.1 ms |

396 unified buildings in the browser (native WebGPU, `scripts/city-generated-walls-benchmark.mjs`, one run each,
back to back). Before: `?cityOpenings=0&cityFaceCache=0` (instancing and the face cache off; the carving and region
speedups cannot be switched off and are in both, so the Node table above is the before/after for them). Frames p50 /
p95 in ms (rAF intervals); another agent's browser benchmarks shared the machine earlier in the session.

| View | Draw calls | Triangles | GPU MB | Frames |
|---|---|---|---|---|
| Map | 177 → 200 | 1.221M → 1.215M | 142.5 → 141.3 | 33/50 → 17/50 |
| Map zoomed | 138 → 161 | 710k → 707k | 156.8 → 154.9 | 17/33 → 17/33 |
| Map pan | 147 → 166 | 767k → 763k | 156.8 → 154.9 | 17/33 → 17/33 |
| Drive, standing | 236 → 250 | 977k → 978k | 225.2 → 219.3 | 17/17 → 17/33 |
| Driving | 227 → 240 | 897k → 899k | 231.3 → 228.2 | 17/33 → 17/33 |
| Studio over its neighbours | 303 → 328 | 1.246M → 1.245M | 264.7 → 259.9 | 17/50 → 17/50 |

| | Before | Now |
|---|---|---|
| All plots prepared (page load to last result) | 13.2 s | **11.0 s** |
| City loaded (`citySculptCity.loadedMs`) | 10.4 s | **8.0 s** |
| Worker per plot, city pool: resolve + bake | 54.4 + 10.5 ms | **34.6 + 6.1 ms** |
| Worker round trip, background lane, cache-busted | 105 ms | 90 ms |
| JS heap (map … studio) | 633–694 MB | 612–656 MB |
| Studio edit, preview to frame p50 / p95 | 214 / 920 ms | 243 / 1,058 ms |

- Draw calls rise by 14–25: the instanced openings draw one mesh per piece and variant (52 in the final studio
  frame; 72 pieces city-wide), while the chunks lose their glass batches (375 → 285 chunk batches). The unit rectangle
  keeps this small; without it the map was at 229 draws. The count is per distinct piece, not per building, so it
  does not grow with the city; a 40-plot city pays about the same absolute cost (147 → 174 on the map).
- Load: the pool resolves each plot 36 % faster and bakes 42 % faster; page load to all plots prepared falls 17 %.
  The 12.5 s of the table above (earlier session) measured the same thing on a different machine state; this table's
  before and after ran back to back.
- Edit latency: a single run each on a busy machine; the worker part (145 → 160 ms) dominates and varies run to run.
  The 40-plot runs measured 146/655 ms before and 117/639 ms after. The edited face is rebuilt as before; the
  unchanged faces now come from the cache.

### Parity

`node scripts/city-generated-walls-parity.mjs obefore oafter`: map 0.00 % / 0.00, map zoomed 0.00 % / 0.01, drive
0.00 % / 0.00, studio 0.05 % / 0.17, studio all far 0.05 % / 0.17 (pixels changed by more than 40/255 / mean
difference). Diff images: `output/city-gw-diff-obefore-oafter-*.png`, shots `output/city-gw-o{before,after}-unified-*.png`.
`scripts/city-studio-unified-facade-browser.mjs` (converted Corner deli, same camera): 0.87 % / 1.35 (was 0.73–0.82 %).

**WebGL2 was not checked** (`CITY_BACKEND=webgl` benchmarks, parity and browser suites were skipped on request).

### Verification

- `npx tsc --noEmit`: no errors in these files; at the time of the final check it failed only on
  `src/features/city/studioSelection.ts` (another change in progress), so `npm run build` stopped at `tsc`;
  `npx vite build` alone succeeds.
- Unit tests (272): the suites listed above, including new `cityStudioOpeningPieces.test.ts` (equivalence, sharing,
  tiers, openable leaves, world transform and transfer, unit rectangles) and `cityStudioFaceCache.test.ts` (reuse,
  single-face rebuild, ids ignored, cache off, a preset on another plot, hash, kit carving area, every rhythm style).
  Tests of the old packaging run with instancing off.
- Browser suites, native WebGPU (dev server on port 5192): every `scripts/city-studio-*-browser.mjs`,
  `city-furniture-browser.mjs`, `city-variation-studio-browser.mjs` and `city-nyc-browser.mjs` pass; rhythm rules,
  unified facade and NYC needed their one retry.

### Limits and risks

- More draw calls (above) for fewer bytes and less work: instancing trades per-building merges for per-piece draws.
  Rare pieces (one or two instances in view) would be cheaper merged; not done.
- Trims (Blender trim parts) stay merged per building on the main thread; curved surrounds, roof openings and
  interior shells stay merged in the batches.
- The see-through near glass of all near buildings is one transparent mesh per piece, sorted as one object.
- Each sculpt worker may hold up to 32 MB of cached faces (five workers: two studio lanes, three city).
- A new far-level instance rewrite touches every block using the key (and every far rectangle when a block with
  rectangular windows changes): about a millisecond at 396 plots, measured only indirectly.
- Physical-mobile validation is pending; WebGL2 not checked in this round.
