# Unified facades: kit pieces in generated walls (local studio)

This round makes the facade one system (see "Unifying facades" in `docs/city-studio-game-ux.md`). Every Blender
kit window, door and decorative wall tile is now also an **opening type** of the generated wall, storefront stamps
and kit tiles are **manual spans** that the rhythm fills around, and **no kit tile owns a whole wall** any more.
Old kit-tile buildings convert explicitly and undoably. Local studio plots only: business/profile validators still
reject every new field, there is no schema, backend or provider change, and nothing was deployed.

## Model

### Kit pieces as opening types (`module`)

`StudioFreeOpening.module?: string` hosts one kit module (`src/domain/cityStudioModuleSpec.ts`):

| Kind | Modules | Wall | Drawn |
|---|---|---|---|
| aperture | every window and door, the NYC garage | cut at the catalogue's measured `opening` (rectangle; "arched" kit windows are arched in their trim only) | the kit piece without its `wall` channel |
| panel | `wall-panel`, `wall-rusticated` | not cut | the kit piece without its `wall` channel (the relief) |
| blind | `wall-full`, `wall-half`, `wall-quarter`, `wall-nyc-brick` | not cut | nothing: the opening only reserves its span |

Corners and `wall-curve` cannot be openings. The kit tiles are 0.3 m slabs centred on the wall line whose `wall`
channel is four boxes around the aperture (checked in `kit.glb`: e.g. `window-nyc-sash` hole ±0.59 × 0.70–2.55 m =
the catalogue aperture), so the generated wall's own hole, reveal and wall material replace that channel exactly.

- **Stored shape:** `width`/`height` are the tile's native size (validated to ±5 mm), `shape` is `rect`, no
  `style`/`glazing`. `bottom` is the storey floor it stands on; `u` its centre (the usual free-opening convention).
  Kit pieces are never clamped or narrowed: a piece that does not fit is inactive with a reason.
- **Resolution** (`resolveFreeOpenings`): kit pieces never merge; tiles may abut (like bays) but not overlap; a
  shaped opening may not cut into a kit aperture plus its 0.2 m surround (`FREE_OPENING.moduleKeep`). The kit
  aperture is a group with `module` set: `buildFreeOpeningFaceGeometry` keeps its reveal but draws no surround,
  frame, sill, glass or leaf. Door modules at the base of a ground-level face take the door role (threshold,
  ground blocker cut, v6 portal); door modules higher up (balcony doors) are windows of the wall.
- **Pieces:** `resolveStudioFreeFaces` emits one `StudioPiece` per aperture/panel (`free/<opening id>`) at native
  scale, `omit: ['wall']` (v6 portal doors also omit `door` and `glass`, their leaves are the animated portal).
  `CityStudioMeshes` skips omitted channels in the instanced kit, the fallback boxes and the far proxies (far
  proxies keep a glass box, also for "solid" kit windows). Finishes come from the tile paint of the bay under the
  piece; a trim paint region over the tile tints its trim.
- **Curved walls:** apertures sit on their group's flat chord plane (`bendPose`), like procedural frames; the curve
  must allow the aperture width (`curveMaxOpening`), otherwise "This wall curves too tightly for this piece."
- **Wear:** the stone-through-plaster wear band is driven by shaped openings only; kit apertures bring their own
  finished surround, so their reveals and the wall around them stay plain. This is what keeps converted buildings
  looking like before (with the band every brick window read as a pale plaster patch).
- **Limits:** up to 64 shaped openings plus up to 400 kit pieces per building (a converted tower has one per bay).
- **Placement:** `placeFreeOpening(..., {module})` puts the tile on the storey floor under the pointer, clamped to the
  face ends and snapped to a bay centre within 0.35 m (`fitModuleOnFace`); dragging (`nudgeFreeOpening`) moves it
  freely along the face and to the nearest storey. The Freeform ghost shows the whole tile.

### Explicit kit tiles and stamps are manual spans

On a generated wall, explicit kit tile intents (`studio.openings`, including the openings a storefront stamp expands
to and merged wide spans) resolve as derived kit-piece openings `kit/<intent id>` (`studioKitModuleOpenings`, via
`StudioBay.source`). They come first on the face, so a later free opening over them goes inactive. Inactive ones are
reported under the intent id (a storefront under its stamp id). Variation-generated tiles are not derived: on a
generated wall the rhythm replaces them, as before.

- **Rhythm (version 2):** kit tiles and stamps join the manual openings the rhythm fills around (span + margin);
  a part with a kit door gets no generated door. Version-1 rhythms keep the old rule (a kit opening owns its wall;
  the legacy hashes are unchanged).
- **Stamps stay bespoke:** they are still placed on bays, expand to kit openings and canopy/fascia assemblies, and
  are only split up by "Unpack". Their tiles render as kit pieces in the generated wall.

### Whole-wall ownership is retired

"Free openings own this wall" is gone: a wall with free or rhythm openings becomes one generated wall and its kit
tiles stay as kit pieces in their own apertures. Default (non-explicit) kit windows on such a wall still yield to the
generated wall. A wall is entirely manual only through the rhythm's "Keep wall manual" rule.

### Unified buildings (`studio.facade: 'unified'`)

- Every exposed part face is a generated wall, openings or not. Faces of straight cut-out parts (courtyards,
  notches) are now faces too (`studioFaceFrame` accepts rectangle/polygon subtract volumes, facing into the cut).
- Bays stay resolved for picking, paint anchors, parapets and assemblies. A bay reports the kit piece standing on it
  (or the part's window under a shaped free opening, else `wall-full`), and a kit piece wider than a bay merges its
  bays into one (`opening/<id>`), exactly like a wide kit opening, so balconies, awnings, pilasters and belt courses
  keep their checks and positions. No default windows are generated; no entrance door is forced onto a bay.

## Conversion (`convertToUnifiedFacade`, `src/domain/cityStudioUnifiedFacade.ts`)

Pure, explicit, one undo step (the studio commits it with the label "Updated to unified facades"). It resolves the
building as it looks now, then:

1. every window/door/panel tile drawn on a kit wall (defaults, manual tiles, the entrance, a stair's balcony door,
   variation picks) becomes a kit-piece free opening at the bay's centre and storey floor;
2. on walls that were already generated only the explicit kit tiles were drawn, so only they are materialised;
3. stamps stay stamps; `studio.openings` is emptied (its tiles now live as kit pieces);
4. **variation: materialised** (decision). Its openings become kit pieces, its generated assemblies and roof props
   are kept under `converted/` ids, and the variation is dropped. A rhythm cannot reproduce the variation's per-bay
   layout (2 m bays edge to edge versus the rhythm's corner margins and column pitch), so an "equivalent rhythm" would
   visibly change the building; materialising keeps it exact. The dice on a converted building shuffles a facade
   rhythm (add one in Rhythm; it fills only where the kit pieces leave room);
5. tile paint (`studio.surfaces`) is untouched: generated walls already draw it as face rectangles (the paint
   plumbing in `studioFacePaint`) and kit pieces take the finishes of their bay;
6. a version-1 rhythm set to fill gets an `off` rule on walls kit tiles owned;
7. a tile that cannot stand in a generated wall (one centred on the seam of a round wall) is left out with a note
   rather than kept inactive; tiles squeezed into narrower-than-native bays (old kits) are left out with a note.

**Studio:** Openings shows **Convert to editable facade** on any kit-tile building. With `?cityFacade=unified` a
building that is already there when the studio opens converts silently, with a notice; each plot is offered once per
page session, so undo keeps the tiles. On a unified building the Windows, Doors and Walls trays place kit pieces
freely (the Freeform tool with a kit preset: click to place on a storey, drag to move, Erase to remove); Storefronts
still paints stamps. The Rhythm panel lists **Kit pieces** (thumbnails from `/city/synarc-kit/v{n}/thumbnails`) as
pool chips `module:<id>`; they are placed at native size on the storey floor, centred on their column, when the tile
fits the column pitch and the aperture its opening room (doors on the ground storey only). Existing pool ids work as
before; `validateStudio` checks that pooled and placed modules exist in the building's catalogue.

## Parity evidence

- Unit tests compare, for all six New York presets and every studio example, the kit tiles drawn before and after
  conversion (module, position, rotation): identical, except one tile across the seam of the round tower example.
  Assembly pieces (cornices, awnings, balconies, pilasters, belt courses) match by module, position and scale;
  decks and inactive lists are unchanged.
- Browser (`output/city-studio-unified-before.png` / `-after.png`, Corner deli, same camera, the converted plot
  reopened): 0.73–0.82 % of pixels differ by more than 40/255 (mean difference 0.9–1.2/255) on WebGPU and WebGL2.
  The remainder is the brick mapping (generated walls map texture in face metres, tiles per tile) and 2 cm of kit
  trim depth (NYC tiles sit 2 cm behind the generated wall face).
- An earlier version kept the stone wear band around kit apertures: every brick window then read as a pale plaster
  patch (3.2 % of pixels changed); the band is now reserved for shaped openings.

## Performance (`node --experimental-strip-types scripts/benchmark-city-unified-facades.mjs`)

Node, warm, median of 25; "draw groups" are the instanced kit groups (module × channel × texture, omitted channels
excluded) plus the merged generated-wall batches; near triangles are kit pieces (from `kit.glb`) plus generated walls.

| Preset | Resolve (kit → unified) | Draw groups | Near triangles | Pieces |
|---|---|---|---|---|
| Corner deli | 4.1 → 21.2 ms | 36 → 33 | 70,572 → 56,700 | 195 → 173 |
| Neighborhood café | 2.5 → 13.3 ms | 33 → 30 | 46,324 → 37,856 | 137 → 119 |
| SoHo cast-iron loft | 4.3 → 22.9 ms | 36 → 32 | 94,896 → 77,660 | 230 → 209 |
| Garage workshop loft | 2.5 → 14.8 ms | 34 → 30 | 63,388 → 49,736 | 180 → 159 |
| Balcony apartments | 3.7 → 20.8 ms | 37 → 34 | 87,892 → 70,592 | 265 → 243 |
| Ornate commercial corner | 5.2 → 26.2 ms | 34 → 31 | 125,694 → 101,070 | 358 → 332 |

- Draw calls and triangles fall: the kit wall slabs (up to 176 triangles per NYC tile), headers and fillers go,
  and the generated walls are merged per building (2 batches here). In the browser the whole studio scene went
  from 72–74 to 69–70 draw calls and about 149k to 135k triangles (WebGPU; WebGL2 82 → 76, 188k → 143k).
- Resolve time grows 4–6× because every wall is now a generated face with 30–40 holes; it runs in the sculpt worker
  like rhythm walls. The first version measured 50–120 ms; caching each face's exposed region and a rectangle fast
  path for the hidden-wall test (which every kit piece and shaped opening runs) brought it to 13–26 ms. Geometry
  (carving and triangulating the holes) is now most of it, about 6–9 ms per 40-hole face.
- Conversion itself resolves the building twice (about 40–60 ms on the page thread, once).

## Verification

- `node --experimental-strip-types --test src/domain/cityStudioUnifiedFacade.test.ts` (13 tests).
- All `src/domain/cityStudio*.test.ts`, `citySculpt`, NYC/collection presets, variation tests: pass.
- `CITY_TEST_ORIGIN=http://localhost:5180 node scripts/city-studio-unified-facade-browser.mjs` (`CITY_BACKEND=webgl`
  for WebGL2): convert with same-camera parity, undo/redo, the silent flag conversion (and no re-conversion after
  undo), a kit window from the Windows tray on a rhythm wall (the rhythm fills around it) and a storefront stamp.
- Existing browser suites (all `scripts/city-studio-*-browser.mjs`, `city-furniture-browser.mjs`,
  `city-variation-studio-browser.mjs`, `city-nyc-browser.mjs`) pass. `city-studio-game-ux-browser.mjs` now clears
  the café's shop tiles before dragging its arcade: those tiles reserve their span, so arches over them are refused
  (previously the arcade took the whole wall and silently hid them).

## Limits

- A new connected stair on a unified wall turns its exit bay into a balcony door for assemblies only; place a
  `door-balcony` kit piece there (conversion materialises existing ones).
- Kit pieces cannot cross the seam of a round wall; round cut-outs keep kit tiles.
- Old-kit tiles scaled into bays narrower than the tile are not converted.
- The known stale eye-level frame after a commit (see `docs/city-studio-game-ux.md`) also shows after conversion
  in some runs; the browser test hovers the canvas to get a fresh frame and reports it.
