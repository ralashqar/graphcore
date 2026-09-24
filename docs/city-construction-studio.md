# City construction studio (local preview)

The opt-in studio is available at `/city?demo=1&cityStudio=1`. Buy a local test plot or reopen an owned plot while exploring. `cityStudio=0` retains the original editor. This flag remains off by default while the release gates below are open. No public business-profile schema, backend, payment provider or deployment was changed.

## Player controls

The persistent workspace has Shape, Openings, Surfaces, Details and Garden tools. Right-drag orbits, middle-drag pans and the wheel zooms. Shape offers block, round, oval and subtractive cut footprints, magnetic movement, face resizing, height, lift, duplicate and quarter turn. Precision is optional. Click an exposed face or roof to select; My parts also selects buried parts. Starting ideas includes three European references and an explicit undoable replacement dialog.

Brush windows/doors or paint wall, trim, frame and door channels with Spot, Wall and Part scopes. Spot edits win over broader style changes. The eyedropper copies a finish and erase restores inheritance. Details store balcony runs, cornices, canopies, stairs, pilasters, ornaments, planters and lamps. New detail strokes validate against their prepared placement result before committing. Invalidated existing details retain their original host identity and reason. Follow this wall extends a cornice over compatible coplanar bays.

Walk around uses the prepared draft and returns to the same editing camera. Done commits through the existing revision-checked local repository. Touch gestures have an explicit placement confirmation; physical-device acceptance has not been performed.

## Data and rendering

Local sculpt version 5 pins `synarc-kit-2`, preserving the old readers. Conversion of existing designs is explicit and undoable. Part/source-face/floor/normalized-span anchors keep appearance and assemblies independent of generated mesh indices. Appearance resolves building, part, wall, then spot. Removed host records stay inactive instead of migrating to another source face.

The existing sculpt worker resolves union walls, bays, genuine apertures, kit placements, assemblies and roof envelopes. Planar pitched/mansard surfaces clip around courtyard holes and taller parts; curved regions retain flat roofs with a visible explanation. Terrace edges receive railings. Interactive preparation has a separate worker lane from background plots, deduplicated requests and a bounded result cache. Preview and authored results retain latest-result filtering and the last valid representation. Immediate footprint ghosts do not wait for detailed geometry.

Kit loading retains UVs and groups geometry/material channels. Instance colours support patch variation without one material per patch. Worker failure does not resolve detailed geometry on the main thread. Missing kit files retain a simple aperture-preserving fallback; an online event retries the loader.

Pedestrian collision uses shell walls, rail barriers, ramps, landings and stacked walking surfaces. The driving layer retains whole-plot exclusion. Camera obstruction includes elevated deck undersides. Render and collision use the same completed authored result. A changed walking surface returns an affected character to the plot entrance. Stair landing decks overlap their host edge to avoid a tiny gap dropping the character before stepping onto a terrace.

## Reproducible assets

- Authoring script: `scripts/build-city-studio-kit.py`.
- Editable source: `assets/city/synarc-kit/v2/synarc-city-kit-v2.blend`.
- Runtime: `public/city/synarc-kit/v2/kit.glb`.
- Catalogue and measured manifest: `public/city/synarc-kit/v2/`.
- Thumbnail renderer: `scripts/render-city-studio-thumbnails.py`.
- Validator: `node scripts/validate-city-studio-kit.mjs`.

Blender MCP was restored and the kit was produced in a dedicated scene, preserving unrelated scenes. The export has 64 module definitions and 10,792 triangles; the three palettes share geometry. The manifest records source/export hashes, bounds, sockets, opening envelopes, material channels, stretch axes, collision category and detail hints. All 64 thumbnails are included. The validator checks hashes, metadata equality, finite bounds/sockets, opening bounds, normals presence and thumbnail/export membership. It does not constitute visual approval of every possible assembled seam.

## Verification and release gates

Focused automated coverage includes legacy sculpt/kit behaviour, local purchase and revision handling, v5 reference persistence at both plot sizes, unions, spot precedence, inactive hosts, connected balcony termination, ground-height-aware switchback landings, courtyard roof clipping, stacked surfaces, camera obstruction, driving exclusion and movement up generated flights onto a terrace. TypeScript and the Vite production build were run; Vite reports the existing large-chunk warning.

Browser checks cover simulated purchase, unified UI, reference replacement, window brush strokes, undo, and entering draft walk-through. The forced WebGL2 attempt stalled during scene preparation and did not complete; compatibility acceptance is explicitly unverified. These are local development checks, not acceptance by new players.

Remaining release gates:

- Five first-time usability sessions and the four-of-five success threshold.
- Complete native WebGPU and forced WebGL2 end-to-end walkthrough, including missing assets, interrupted preparation and storage failure.
- Controlled 72/400-property before/after frame-time and preview p95 measurements. The severe 400-property streaming hitch remains unresolved; no performance target is claimed.
- Full corner/concave assembly seam review, stair-to-balcony combinations, vegetation/fence clearance, and distance-detail tuning for the v2 asset path.
- Touch usability and physical-device performance certification.

Keep the flag opt-in until these pass. This is a substantial playable preview, not a release-complete certification of the entire design plan.

The local warm CPU-only resolver benchmark (`node --experimental-strip-types scripts/benchmark-city-studio.mjs`, 60 samples per reference) measured median/p95 of 3.5/4.6 ms for the café, 4.8/7.5 ms for the townhouse and 9.9/12.7 ms for the courtyard apartment. These exclude worker transfer, GPU preparation and display latency and do not satisfy the end-to-end 150 ms target by themselves. The missing-asset fallback was subsequently batched into one instanced cube draw per building; v2 near-detail modules are omitted beyond 120 world units. Neither change certifies the unresolved streaming performance gate.

Final focused suite: 80 passing tests across `cityStudio`, `citySculpt`, `citySynarcKit`, `cityLand`, `cityExploration`, `citySculptPreview` and `citySculptService`. The service tests explicitly cover lane isolation, deduplication, worker failure and retry. Source-face tests cover lifting and cuts removing a host bay without relocation.
