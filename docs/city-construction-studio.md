# City construction studio (local preview)

The construction studio is the default builder for local demo plots at `/city?demo=1`; `/city?demo=1&cityStudio=1` selects it explicitly. Buy a local test plot or reopen an owned plot while exploring. `cityStudio=0` retains the original editor for comparison. Outside the local demo, the studio still requires the explicit flag while the release gates below are open. No public business-profile schema, backend, payment provider or deployment was changed.

## Player controls

The in-world workspace has four player-facing steps: Structure, Facade, Extras and Inside. Structure keeps shapes and roofs together; Facade groups surface painting, openings and quick variation shuffles; Extras holds architectural details and the garden. Precision dimensions, weighted variation rules and import/export live in Build More, which opens beside the building. Right-drag orbits, middle-drag pans and the wheel zooms. Shape offers block, round, oval and subtractive cut footprints, magnetic movement, face resizing, height, lift, duplicate and quarter turn. Click an exposed face or roof to select; My parts also selects buried parts. Starting ideas includes three European references and an explicit undoable replacement dialog.

Brush windows/doors or choose a material and paint one facade tile per click. Dragging crosses tiles without leaving gaps; the brush and finish remain selected for the next click. Fill wall and Fill part are explicit one-shot actions with a 3D target preview; spot edits still win over broader style changes. Sample copies a finish and returns to the brush, while Restore tile reveals the inherited finish. A paint drag is one undo step, and rapid strokes apply to the latest draft while detailed geometry catches up. Protected storefront tiles explain why they cannot be painted and offer an undoable Unpack action. On narrow screens, paint options collapse to keep more of the building visible. Details store balcony runs, cornices, canopies, stairs, pilasters, ornaments, planters and lamps. New detail strokes validate against their prepared placement result before committing. Invalidated existing details retain their original host identity and reason. Follow this wall extends a cornice over compatible coplanar bays.

The new connected-access revision gives Stair three exit choices: an automatically fitted upper door, a door onto an existing balcony, or a flat terrace. Auto chooses a straight run where it fits and a switchback otherwise; the tray also offers explicit Straight, Switchback and Flip direction choices. The resolver measures one continuous exposed wall across joined source volumes, fits actual storey heights, creates a ground foot and upper transition, keeps the primary street entrance clear, and pins the selected exit bay after placement. Editing away that bay leaves a visible inactive reason. The upper door is generated from the stair intent and disappears if the stair is removed. A balcony exit requires a same-height connected deck. Painting targets and material choices are visible buttons rather than dropdowns.
Placed stairs appear in a compact list for refitting or removal as an undoable edit. v2 buildings show an explicit, undoable kit upgrade before enabling the new stair tool.

Walk around uses the prepared draft and returns to the same editing camera. Done commits through the existing revision-checked local repository. Touch gestures have an explicit placement confirmation; physical-device acceptance has not been performed.

## Data and rendering

### Playable interior shell (local version 6)

Rooms adds an explicit **Add interiors** upgrade for an existing studio building. The upgrade is one undoable edit; version-5 buildings continue to render as before until converted. Version 6 stores stable partition, door and stair intent IDs, room finish anchors and a small set of furniture placements. This remains local to purchased plots; public profiles and backend data do not change.

The level control offers Whole building, Cutaway and This floor. These are camera/editor views, not architectural edits. Rooms draws straight snapped partitions, places a hinged door on a partition, and drags a stair from one storey to the next. The resolver detects enclosed regions, fits a straight flight or a switchback, and removes that stair's owned opening from the upper slab. It preserves a failed stair or door intent with an inactive reason instead of silently moving it. Exterior entrances and partition doors have real apertures. In walkthrough, the nearest door takes the E action ahead of the car; the door leaf animates, collides while closed, and cannot close on the character.

Rooms now enters a floor-focused view with Ground/Floor tabs above the building. Add floor extends the top occupied volumes and matching vertical cuts as one undoable edit, then selects the new storey. All occupied storeys receive a full union-footprint slab by default; upper tabs offer an explicit **Open to below** control to remove and later restore that entire slab. Stair-owned holes stay separate. Walls and doors belong to their selected floor and rise only to the next storey. The floor renderer uses authored façade floor anchors and kit placement floor IDs, so an origin close to the storey boundary cannot pull a higher wall into the lower view. Separate volumes at the same storey stay visible together. Curved shell triangles clip to the selected height band.

Drawn partitions now divide the exact union footprint into bounded room polygons. The Rooms side panel selects each detected region, applies its own floor finish and partition-wall colour, or opens that upper room to the space below while neighbouring rooms keep their slabs. Room choices persist by an interior anchor; if the original room disappears, its intent remains inactive with a reason. The whole-floor opening remains available in the floor bar. A six-piece procedural furniture set (table, chair, sofa, bookcase, plant and floor lamp) places with a click and quarter-turn control. Placement checks the covered room, stair and door routes, and other furnishings. Each placement and removal is undoable and uses the same prepared render/collision result.

The focused floor-view browser check covers the courtyard reference and two separate wings, capturing ground and upper tabs for both. In floor view, multi-storey exterior stair assemblies are hidden to keep long supports from extending into the isolated storey; the complete stair returns outside floor view. The interior browser flow also verifies floor opening/restoration and adding a storey across save/reload. These editor views never change walking collision; only a saved Open to below choice or stair intent changes the actual slab.

Interior slabs, undersides, partitions, stair pieces and door portals are prepared with pedestrian collision in the existing worker result. Stacked slab collision supports standing both below and above an opening. The editor cuts away higher and camera-facing shell groups without rebuilding the recipe, while distant buildings continue to use their exterior representation. Draft walking uses the prepared result and a shorter indoor camera distance. V5 and earlier readers and exterior assets remain available.

The reference browser flow in `scripts/city-studio-interiors-browser.mjs` seeds two joined volumes, upgrades, draws a partition, places a door and stair, edits a room finish and opening, places a furnishing, switches floor views, enters walkthrough, reloads and verifies the saved intent. Domain tests drive the actual pedestrian movement through a closed/open street door, closed/open partition door and fitted stair to the upper floor. They also check a room-sized open-to-below void and furniture clearance. Hands-on walking across varied shapes, first-time usability, worker/storage failure recovery, 72/400-property measurements, native WebGPU device validation and physical mobile remain release gates; the construction flag stays opt-in.

Local sculpt version 5 now pins `synarc-kit-3` and `connected-access-1` for new studios; existing v2 intent retains its old assembly path and v2 asset loader. Conversion of existing designs is explicit and undoable. Part/source-face/floor/normalized-span anchors keep appearance and assemblies independent of generated mesh indices. Appearance resolves building, part, wall, then spot. Removed host records stay inactive instead of migrating to another source face.

The existing sculpt worker resolves union walls, bays, genuine apertures, kit placements, assemblies and roof envelopes. Planar pitched/mansard surfaces clip around courtyard holes and taller parts; curved regions retain flat roofs with a visible explanation. Terrace edges receive railings. Interactive preparation has a separate worker lane from background plots, deduplicated requests and a bounded result cache. Preview and authored results retain latest-result filtering and the last valid representation. Immediate footprint ghosts do not wait for detailed geometry.

Kit loading retains UVs and groups geometry/material channels. Instance colours support patch variation without one material per patch. Worker failure does not resolve detailed geometry on the main thread. Missing kit files retain a simple aperture-preserving fallback; an online event retries the loader.

Pedestrian collision uses shell walls, rail barriers, ramps, landings and stacked walking surfaces. The driving layer retains whole-plot exclusion. Camera obstruction includes elevated deck undersides. Render and collision use the same completed authored result. A changed walking surface returns an affected character to the plot entrance. Stair landing decks overlap their host edge to avoid a tiny gap dropping the character before stepping onto a terrace.
Procedural vegetation also reserves the exterior stair wall corridor, including a margin around its ground foot and switchback lane.

## Reproducible assets

- Authoring script: `scripts/build-city-studio-kit.py`.
- Editable source: `assets/city/synarc-kit/v2/synarc-city-kit-v2.blend`.
- Runtime: `public/city/synarc-kit/v2/kit.glb`.
- Catalogue and measured manifest: `public/city/synarc-kit/v2/`.
- Thumbnail renderer: `scripts/render-city-studio-thumbnails.py`.
- Validator: `node scripts/validate-city-studio-kit.mjs`.

The v3 source is generated by `scripts/prepare-city-studio-kit-v3.py` followed by the same Blender builder with `CITY_STUDIO_VERSION=3`. It adds eight connector modules: two stair stringers, a return guard, upper threshold, stair-to-balcony link, two canopy ends and a canopy corner. Its editable `.blend`, GLB, manifest and 72 thumbnails live in parallel `v3` directories. The original 64 v2 definitions and exports remain unchanged. Blender MCP produced v3 in a dedicated scene and returned to the user's original scene. The validator checks both versions.

Blender MCP was restored and the kit was produced in a dedicated scene, preserving unrelated scenes. The export has 64 module definitions and 10,792 triangles; the three palettes share geometry. The manifest records source/export hashes, bounds, sockets, opening envelopes, material channels, stretch axes, collision category and detail hints. All 64 thumbnails are included. The validator checks hashes, metadata equality, finite bounds/sockets, opening bounds, normals presence and thumbnail/export membership. It does not constitute visual approval of every possible assembled seam.

## Verification and release gates

Focused automated coverage includes legacy sculpt/kit behaviour, local purchase and revision handling, v5 reference persistence at both plot sizes, unions, spot precedence, inactive hosts, connected balcony termination, ground-height-aware switchback landings, courtyard roof clipping, stacked surfaces, camera obstruction, driving exclusion and movement up generated flights onto a terrace. TypeScript and the Vite production build were run; Vite reports the existing large-chunk warning.

Browser checks cover simulated purchase, unified UI, reference replacement, window brush strokes, undo, and entering draft walk-through. The focused connected-access flow passes in Edge with its default backend selection and with forced WebGL2 locally. Broader compatibility acceptance, including failure/recovery cases and physical devices, remains unverified. These are local development checks, not acceptance by new players.

The play-first paint flow is checked by `scripts/city-studio-paint-browser.mjs`: repeated Brick clicks, a drag across adjacent tiles, one-step undo/redo, wall and part fills, sample, restore, save/reload, and a narrow layout. The variation, connected-access and interior browser flows were also updated for the four-step navigation. These checks use desktop Edge and a mobile-sized viewport; physical touch behavior and first-time usability remain open gates.

The connected-access browser check (`node scripts/city-studio-access-browser.mjs` with the local Vite server) loads the v3 GLB, places a switchback with an automatically fitted upper door from Extras, refits its direction, waits for autosave, walks around the draft, reloads and confirms the pinned exit remains. It also checks the visual paint target/material controls. The current focused suite passes 89 tests and the two-version asset validator passes. These checks do not replace the first-time usability or physical-device gates.

Remaining release gates:

- Five first-time usability sessions and the four-of-five success threshold.
- Complete verified native WebGPU and forced WebGL2 failure/recovery walkthrough, including missing assets, interrupted preparation and storage failure. The connected-access happy path passes Edge's default backend selection and forced WebGL2 locally.
- Controlled 72/400-property before/after frame-time and preview p95 measurements. The severe 400-property streaming hitch remains unresolved; no performance target is claimed.
- Full corner/concave assembly seam review, vegetation/fence clearance, and distance-detail tuning for the v3 access modules. Automated stair-to-balcony checks pass; hands-on traversal across varied shapes is still needed.
- Touch usability and physical-device performance certification.

Keep the flag opt-in until these pass. This is a substantial playable preview, not a release-complete certification of the entire design plan.

The local warm CPU-only resolver benchmark (`node --experimental-strip-types scripts/benchmark-city-studio.mjs`, 60 samples per reference) measured median/p95 of 6.8/9.9 ms for the café, 23.2/30.2 ms for the townhouse and 15.1/21.0 ms for the courtyard apartment after connected access. These vary between runs and exclude worker transfer, GPU preparation and display latency; they do not satisfy the end-to-end 150 ms target by themselves. The missing-asset fallback remains batched into one instanced cube draw per building and near-detail modules are omitted beyond 120 world units. The 400-property streaming performance gate remains open.

Final focused suite: 89 passing tests across `cityStudio`, `citySculpt`, `citySynarcKit`, `cityLand`, `cityExploration`, `citySculptPreview` and `citySculptService`. The service tests explicitly cover lane isolation, deduplication, worker failure and retry. Source-face tests cover lifting and cuts removing a host bay without relocation.

## Interior furniture library

Inside → Furniture now provides 48 Blender-authored pieces, categorized thumbnails, search, live placement ghosts and floor-specific selection/editing. The former six primitive renderers are replaced while retaining saved IDs. See [furniture library](city-furniture-library.md) for authoring, controls, validation and limitations.
