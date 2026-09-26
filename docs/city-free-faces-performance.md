# Free-opening detail performance (September 2026)

Generated studio detail comprises free-opening walls, skylights, dormers and trims. It is now packed per building rather than per face, is transferred from the sculpt worker instead of copied, and uses a distance LOD. Near visuals are unchanged.

This covers only local studio plots: no schema, recipe, validator, backend or provider change. Business profiles and the world worker never see this data.

## What changed

- **Merged per building** (`src/domain/cityStudioDetailBatches.ts`, run in `citySculpt.worker.ts`):
  - Every free-opening face and roof-opening part is baked into building-local space and packed into one buffer set per material:
    - wall, per finish colour and texture, keeping the `openingDistance` wear attribute;
    - painted, vertex-coloured: surrounds, frames, sills, mullions, door leaves, dormer trim and flashing;
    - glass, per tone;
    - roof, per finish.
  - Flashing now carries its colour as a vertex colour, so it joins the painted batch.
  - A typical building draws in about 5 meshes instead of about 23 (3 faces × 5 channels + 2 roof parts × 4). The benchmark building averages 5.3 batches.
- **Transferables:**
  - The worker posts `details` with a transfer list: Float32Array attributes, Uint16Array indices (Uint32Array above 65,535 vertices), precomputed normals and a bounding sphere.
  - The main thread wraps the arrays in `BufferAttribute`s. It does no `computeVertexNormals` or `computeBoundingSphere` for these paths.
  - The per-face and per-part buffers are dropped from the posted result (`withoutDetailGeometry`). The copy keeps frames, groups, `freeTrims` and triangle counts for picking and trims.
  - The resolver's own arrays are never transferred, because merged arrays are fresh copies.
  - `citySculptService` caches the one received copy (`PreparedSculpt`). Nothing is transferred twice.
- **Distance LOD with no duplicate buffers:**
  - Indices are ordered near-only, then both, then far-only.
  - Near draws `[0, near)`. Far draws `[farStart, farStart+far)` on the same mesh and GPU buffers.
  - The free wall packs its inner skin last (`rearStart` in `cityStudioFreeOpeningGeometry.ts`), so far drops it.
  - Unglazed openings get far-only dark inset fills (`aperture`), so the far wall is never see-through.
  - `CityStudioDetailBatches.tsx` switches the LOD from a throttled frame check. It mutates `drawRange`/`visible` only: no React state, no remounts.
- **Trims** (`CityStudioTrimParts.tsx`, `cityStudioTrimMerge.ts`):
  - Deformed pieces are cached module-wide, not per building.
  - All placements of one building are merged into at most 4 geometries (trim, planting, metal, light), with the tint baked into vertex colours. The trims fixture drops from 42 instanced batches to 4.
  - Trims are near-only.
- **Shared materials:**
  - Detail materials are shared across buildings by key and reference counted.
  - Previously every face created its own wear material, and every roof-opening part created six materials.
- **Warm-up** (`cityStudioWarmup.ts`):
  - Hidden near-only materials (painted batch, trims) are compiled once through `renderer.compileAsync`.
  - Without it, the first approach to a far building compiled them mid-drive. One run measured a 1.2 s driving p99 spike before warm-up and 100 ms after.
- **Floor slicing:**
  - Per-face and roof visibility in cutaway/floor views uses a subset index built from the batch `owners` ranges. This applies to the edited plot only.
- **Unused file:** `CityStudioRoofOpenings.tsx` is no longer rendered and can be deleted. It was kept here because deleting files was out of scope for this change. `CityStudioFreeOpeningFace.tsx` now only exports the wall wear material.

## LOD thresholds and the far variant

| | |
|---|---|
| Threshold | Horizontal camera distance to the plot centre: near inside 55 m, far beyond 65 m. This is the same hysteresis as far modular buildings in `CityVisibility`. Orthographic cameras use the equivalent on-screen plot size. |
| Always near | The plot being edited, and floor-sliced views. |
| Far keeps | The wall outer skin with real holes, including the wear band. Also caps, reveals (the recess depth), glass, door leaves, skylight glass, dormer walls, roof panels and glass. |
| Far drops | The wall inner skin, surrounds, frames, sills, mullions, glazing bars, the door-hardware frame, skylight frames, flashing, dormer verges/fascias and all trims. |
| Far adds | Dark inset fills for unglazed openings. |
| Cost | The benchmark building has 6,388 triangles near and 1,812 far (28%). The merge costs 3–6 ms warm in the worker; the first calls take 10–15 ms. |

Test hook (with `?cityStudioTest`): set `window.__cityStudioDetailForce = 'near'|'far'` to pin every unedited building. `CITY_BENCH_SHOTS=1` writes `output/city-free-faces-lod-{near,far}.png` from the studio view:

- **Near:** unchanged.
- **Far:** windows read as dark apertures in worn plaster, without white frames or trims.

## Benchmark

`scripts/city-free-faces-benchmark.mjs` seeds 12 studio plots on the test plot and its nearest free plots. Each has 17 free openings on 3 faces, 2 skylights and 2 dormers. Every second plot adds 15 trim sets. The populated fixture background has 72 or 400 properties.

It measures:

- the drive spawn view, standing and on the drive route (the seeded plots are off-screen there, so this acts as a control);
- the studio view pulled back over the seeded neighbours;
- cache-busted background-lane worker round trips;
- 16 successive free-opening slides through the interactive preview lane, which is the same path as a drag: `setSculptPreview` → worker → `dataset.citySculptPreview`.

`kit` is the same buildings without free openings, roof openings or trims.

- **Environment:** Edge headless, Intel UHD, Vite dev server. Frame times are rAF intervals and quantise to 16.7/33/50 ms.
- **Before:** `HEAD` renderer files swapped in. The builder's packaging change was present but unused.

Commands (dev server on 5180):

```
CITY_BENCH_LABEL=after node scripts/city-free-faces-benchmark.mjs                                # native, 72, kit+free
CITY_BENCH_LABEL=after CITY_BACKEND=webgl CITY_BENCH_VARIANTS=free node scripts/city-free-faces-benchmark.mjs
CITY_BENCH_LABEL=after CITY_BENCH_BACKGROUND=400 CITY_BENCH_VARIANTS=free node scripts/city-free-faces-benchmark.mjs
CITY_BENCH_SHOTS=1 CITY_BENCH_VARIANTS=free CITY_BENCH_LABEL=shots node scripts/city-free-faces-benchmark.mjs   # LOD screenshots
```

Results are in `output/city-free-faces-benchmark.json`.

### Studio view (12 seeded plots in view)

| Run | Draw calls | Triangles | Frame p50 / p95 / p99 (ms) | Geometries |
|---|---|---|---|---|
| kit, native, 72 | 177 | 292k | 16.7 / 50–67 / 83 | 133 |
| free, before, native, 72 | 433 | 330k | 33.3 / 83.2 / 133.3 | 428 |
| free, after, native, 72 | **212** | **277k** | **16.8 / 50.1 / 66.8** | 191 |
| free, before, WebGL2, 72 | 433 | 337k | 33.2 / 50 / 66.7 | 428 |
| free, after, WebGL2, 72 | **212** | **277k** | **16.7 / 50 / 50** | 192 |
| free, before, native, 400 | 375 | 255k | 16.7 / 66.8 / 150 | 353 |
| free, after, native, 400 | **179** | 147k* | 16.7 / 66.7 / 100 | 157 |

- Free-opening overhead over kit tiles drops from +256 to +35 draw calls.
- Far walls cost fewer triangles than the kit tiles they replace.
- \*The 400-property studio framing differs between runs, so its triangle totals are not comparable.

### Edit-to-frame (free-opening slide on the edited plot, 16 steps)

| Run | Preview to frame, p50 / p95 (ms) | Frame p95 / p99 / max during the drag (ms) |
|---|---|---|
| before, native, 72 | 1,234 / 1,601 | 1,383 / 1,484 / 1,484 |
| after, native, 72 | **186 / 718** | **67 / 83 / 83** |
| before, WebGL2, 72 (13 of 16 finished) | 4,199 / 4,584 | 2,217 / 2,567 / 2,783 |
| after, WebGL2, 72 | **181 / 715** | **50 / 67 / 133** |
| before, native, 400 | 1,413 / 1,665 | 1,400 / 1,500 / 1,500 |
| after, native, 400 | **190 / 677** | **50 / 67 / 67** |

- The old path rebuilt about 25 face/part meshes plus 42 trim `InstancedMesh`es on every preview. Trim batches remounted because their keys included instance counts and their deformed geometry was new.
- Preview to frame is now dominated by the worker resolve.

### Worker

In isolation, warm (one heavy plot, 10 successive slides on the interactive lane):

| | Round trip | Worker resolve | Merge |
|---|---|---|---|
| Before | 88–94 ms | — | — |
| After | 93–102 ms | 84–98 ms | 3–6 ms |

The main thread no longer rebuilds normals or copies about 0.5 MB of per-face buffers per result. Background cache-busted round trips in the full scene are noisy: 204 → 243 ms native (page-thread resolve 131 → 148 ms in the same runs).

### Controls and limits

- The drive spawn view and route do not include the seeded plots. Their draw calls (32) and triangles match between runs.
- Driving p99 at 400 properties stays dominated by the known background streaming stalls: 250 ms before and 400 ms after, noisy. This work does not address them.

## Verification

- Unit tests, all passing (28 tests including existing suites):

  ```
  node --experimental-strip-types --test src/domain/cityStudioDetailBatches.test.ts src/features/city/cityStudioTrimMerge.test.ts src/features/city/citySculptService.test.ts src/domain/cityStudioFreeOpenings.test.ts src/domain/cityStudioRoofOpenings.test.ts src/domain/cityStudioTrimParts.test.ts
  ```

  They check vertex and index preservation, one batch per material, transforms and normals, tier ordering and near/far ranges, owner ranges, bounding spheres, compact index types, transfer (detached sender, intact resolver buffers), baked trim transforms and tints.
- Browser scripts on native WebGPU and `CITY_BACKEND=webgl` (`CITY_TEST_ORIGIN=http://localhost:5180`):
  - `scripts/city-studio-free-openings-browser.mjs`, `city-studio-roof-openings-browser.mjs` and `city-studio-trims-browser.mjs`. Trims report 4 batches instead of 42, with the same 81 pieces and 10,552 triangles.
  - `scripts/city-studio-game-ux-browser.mjs`.
- Screenshots: fixed-camera shots are pixel-identical or nearly so (mean difference ≤ 0.5/255). Orbit shots differ only by camera timing and background.

## Remaining limits for a city-wide switch from kit tiles to generated walls

- **Resolve cost:**
  - Every free face is rebuilt by `resolveSculpt` on any edit to its building: about 90 ms warm per heavy building in the worker.
  - Merged batches are per building. Identical facades across buildings are not instanced, and nothing is cached by face input yet.
  - A city of generated walls needs per-face geometry caching keyed by frame and groups, plus instancing of repeated faces or opening modules.
- **Per-building draw calls:** about 5 per building near or far. That is fine for tens of local plots, not for 400 properties.
  - A city-wide path would need cross-building material atlasing (colour as a vertex attribute for walls and glass) or multi-draw indirect.
- **Main-thread remains:** the sculpt envelope (`vertices`, volume walls, curved walls) is still posted as `number[]` and normal-computed on the main thread.
- **First use:** warm-up avoids mid-drive shader compiles, but the first building still compiles the wall wear, painted, glass and trim pipelines.
- **Far wall wear:** the far representation keeps the near-band triangulation so the wear shader reads the same. A coarser far wall would halve it again at the cost of a smeared wear band.
- **Validation:** physical-mobile and 400-property visible-plot validation are pending.
