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
