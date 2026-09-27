# Free doors, glass and every door opening (local)

Free-opening glazing is now real glass, and free doors open like kit exterior doors. Both are local studio features: no recipe field, schema, validator, backend or provider change.

## See-through windows

- **Material** (`CityStudioDetailBatches.tsx`): free-face glass is its own batch (`glass|<tone>|see`).
  - Near the camera it is transparent. It is drawn in the transparent pass after opaque geometry, without depth writes, and single-sided.
  - The glazing is built as two opposite one-sided sheets, so exactly one sheet draws from either side and nothing blends twice.
  - Opacity follows a Fresnel curve: about 0.2 head-on, rising to 0.9 at grazing angles.
  - It samples the canvas-scoped prefiltered reflection from `CityEnvironment` / `useCityReflection` (the same environment as city glass), with environment intensity 3 so reflections survive the low opacity.
  - Studio glass previously had no reflection environment. The opaque variant now uses it too.
- **Far view:** the same buffers swap to the opaque reflective glass material, so no second draw call is added.
  - The far representation has no inner wall skins and interiors are not drawn beyond 60 m, so transparent far glass would look into the void.
  - An invisible mesh warms the opaque variant with the rest of the batch.
- **What the glass shows:**
  - **Recipe v6 (interiors):** the real rooms: floors, partitions, painted walls, furniture and stairs. `CitySculptBuilding` passes `seeThrough` only while those are drawn (editing, or within 60 m). Between 60 and 65 m the near detail can still show while interiors are hidden, so the glass stays opaque there.
  - **Buildings without interiors (recipe v5):** opaque reflective glass, near and far. This is the same opaque material the far view uses, and the detail batch key has no `|see`. There is nothing behind the glass to show, so it reflects instead.
    - The lit "room box" shells behind openings are removed: `buildFreeFaceShell`, the `shell` detail batch and `cityInteriorShellMaterial`. From the street they read as extra planes going inward through open doorways and see-through windows. The city bake had already skipped them; nothing else drew them.
    - Leafless doorways (stone arcades, open kit fronts) and unglazed windows keep their dark aperture fill in the near range too. The fill (`g.aperture`, or the instanced piece's aperture fill) moves from far-only to both tiers, via the opening piece option `interior`. With the wall's reveal around it, this reads as a shallow dark recess.
    - A thin `free-recess/<group>` blocker closes those leafless doorways, because they lead nowhere.
- **Roof openings:** dormer and skylight glass stays opaque reflective glass. It would look into the unfinished roof void.

## Openable free doors

- **Leaves** (`freeDoorLeaves`):
  - A door group (role `door`) gets leaves that fill the clear opening inside the 0.075 m glazing frame, from the threshold to the arch spring. The fanlight and transom stay fixed.
  - Mullions split merged groups into one leaf per bay.
  - A single opening wider than 1.5 m opens as a hinged pair (`exterior/free/<group>` and `…#2`). `toggleStudioDoor` moves every leaf of the group together.
  - Glazed openings (shopfronts, lofts) get glazed leaves: a kick panel under a clear pane.
- **Stone doorways are open arcades:** no leaf, no glass, no portal, and a dark far-only fill.
  - This covers facade-rhythm arcades (previously a glass sheet) and the Arcade preset (previously a solid leaf).
  - Changing a door's style to stone therefore opens it.
- **Portals** (at first v6 only; now every studio building, see "Every door opens"):
  - `resolveStudioInteriors` adds one `exterior/free/<groupId>` portal per leaf, at the glazing plane: floor 0, the part base as `y`, the spring height, face rotation, hinge, and `panelled`/`glazed` from the opening.
  - It also adds a level doorstep landing plus a ramp from the pavement (`entry/free/<groupId>[/landing]`).
  - Kit door bays on faces that free openings own no longer produce phantom portals.
  - Existing blocker splitting leaves the doorway open; the portal's dynamic leaf blocker closes it.
  - Walk-through: stand at the door, press **E**, walk in, and press **E** again to close it once clear of the swing.
- **v5 (no interiors):** since "Every door opens" (below), free doors are portals on v5 buildings too, and lead into an implicit empty interior. Arcades there are closed dark recesses.
- **No duplicated leaves:**
  - The static leaf (panel or glazed pane below the spring, rail, centre bar, handle) is now the `door` / `doorGlass` channel.
  - On openable faces it is indexed far-only. Near the camera the animated leaves (`CityStudioFreeDoorLeaves`, children of the detail batch near group) replace it.
  - Floor slicing hides both with their face.
- **Interior links:**
  - Partitions entering the 1.6 m clear zone inside a free door are inactive with "Leave the doorway clear.". So are stairs whose footprint overlaps it.
  - Furniture already respects every portal.
  - Room detection is unchanged.

## Verification

- **Unit tests:**
  - `node --experimental-strip-types --test src/domain/cityStudioFreeDoors.test.ts` covers portal transforms, pairs, arcades, ramps, no near-range static leaves, see-through glass only with interiors (opaque glass and near dark fills without), v5 portals with the implicit interior and arcade recesses, closed doors on business buildings, collision closed/open, and doorway clearance.
  - The other studio suites also pass, including updated expectations in `cityStudioDetailBatches.test.ts`.
- **Browser:**
  - `node scripts/city-studio-free-doors-browser.mjs`, plus `CITY_BACKEND=webgl`, against the running dev server (default `http://localhost:5180`).
  - It seeds a furnished v6 building, checks the portal and glass keys, and screenshots through the windows. Then it walks to the door, confirms the closed leaf blocks, opens it with E, walks onto the ground-floor slab and closes it again.
  - It then switches the building to v5 and checks the door is still a portal, the implicit interior is resolved, the glass is opaque and there are no room boxes.
  - Screenshots: `output/city-studio-glass*.png` (v5: `city-studio-glass-opaque*.png`) and `output/city-studio-free-door-{closed,open,inside}*.png`.

## Performance

These numbers come from `scripts/city-free-faces-benchmark.mjs` with 12 studio plots and 72 background properties, on native WebGPU on the same Intel machine. The earlier rows are the recorded step-1 run (`after`).

The kit variant does not use this code, so it serves as the control. It got slower between the two runs (standing p95 33 → 67 ms, studio edit p95 67 → 133 ms), which suggests the machine was busier during the second run. Read the frame-time changes as within noise.

| Studio view over the plots (free variant) | Step 1 | Glass and doors |
|---|---|---|
| Draw calls | 212 | 228 |
| Triangles | 276,653 | 276,725 |
| Frame p50 / p95 / p99 | 16.8 / 50.1 / 66.8 ms | 16.8 / 66.7 / 83.4 ms |
| Kit control p95 | 66.6 ms | 66.8 ms |
| Detail batches per building | 5.3 | 8 (includes region-paint batches from the parallel paint work) |

- **Draw calls:** the 16 extra calls measured here were one near-only shell batch per nearby building without interiors, plus separate roof-opening glass. The shells are now removed, and without interiors face and roof glass share one opaque batch, so those calls are gone (not re-measured).
- **Transparency:** one blended batch per building replaces one opaque batch. The fill cost is limited to the window area.
- **v6 buildings:** animated free-door leaves add two small meshes per leaf, near only. Animated kit door leaves add one small instanced mesh per leaf and channel, for plots near the camera only.

## Limits

- **Glass:**
  - Transparent glass is sorted per building batch, not per window.
  - It does not refract, and reflections come from the shared prefiltered environment, not from neighbouring buildings.
- **Leaves:**
  - Arched doors keep a fixed fanlight, so on low doors (for example a 1.4 × 2.4 m arch, spring 1.7 m) the character's head crosses the transom when passing.
  - Leaves are boxes, not arch-shaped.
- **Kit exterior doors:** fixed by "Every door opens": ground-floor kit tiles now get the doorstep landing too.
- **Not yet measured:** physical mobile, and 400-property runs with interiors.

## Every door opens (kit doors, stamps, rhythm doors)

Before, only generated free doors on v6 buildings opened. Kit door tiles, kit door pieces in generated walls, storefront stamp doors and facade-rhythm doors were static, so the character could not open them after Done. Now every door is an openable portal: walk up to it and press **E**.

### Door motion catalogue

- `scripts/build-city-kit-door-motion.mjs` reads each kit GLB (SynArc kit v2 to v5, the Tokyo pack, the storefront pack) and writes `doors.json` beside its `catalogue.json` (`public/city/<kit>/<version>/doors.json`). Re-run it when a kit is rebuilt.
- For every door module it records the leaves, the motion and the passage.
- Leaf boxes are derived from the geometry. The non-wall triangles are grouped into connected components. The "core" is the tall panel standing in the aperture: an inset leaf, a recessed panel or leaf frame, or a frameless leaf's glass. Handles, pulls, panels, meeting stiles and glazing bars on it join it.
  - The SynArc kits use their part names (`inset leaf`, `door panel`, `handle`, `mullion`, `divided light`); surrounds, fanlights and lintels are excluded.
  - The merged-channel Tokyo and storefront packs use plane and containment tests, with explicit zones where leaf frames are welded to the fixed frame (Tokyo sliding and lattice doors, the tiled sliding door).
- The motion is the module's design, declared per id in the script. Single leaves hinge away from their handle.

| Family | Modules | Motion |
| --- | --- | --- |
| SynArc single | `door-panelled`, `door-arched`, `door-nyc-shop`, `door-nyc-residential`, `door-collection-cottage`, `door-collection-craftsman` | hinged, one leaf (hinge opposite the handle) |
| SynArc double | `door-double`, `door-shop`, `door-lobby`, `door-balcony`, `door-nyc-double`, `door-collection-villa`, `-cafe`, `-bank`, `-museum` | hinged pair (left and right), split at the meeting stile |
| Tokyo | `door-tokyo-stair` | hinged single (handle on the left, so hinged right) |
| Tokyo | `door-tokyo-sliding`, `door-tokyo-noren` (the lattice doors behind the noren) | two leaves sliding apart into the wall |
| Tokyo | `door-tokyo-shop-shutter` | roll-up: the shutter and the glazed door under it roll into the head |
| Storefront | `door-shop-victorian`, `-pub`, `-recessed`, `-corner-splay` | hinged single |
| Storefront | `door-shop-steel-pivot` | hinged single about the pivot post (the side light stays) |
| Storefront | `door-shop-castiron`, `-aluminium`, `-stone-arch` | hinged pair |
| Storefront | `door-shop-tiled-sliding` | sliding pair (the strip curtain stays) |
| Storefront | `door-shop-stall-open`, `-bead-curtain`, `-cafe-folding` | open: no leaf, a passable opening |
| Generated free doors (manual and facade rhythm) | | hinged, as before (`freeDoorLeaves`); stone doorways are open arcades |

Window-category modules (roll-down shop shutters, arcade and stall shop windows) stay windows.

### Runtime

- `src/domain/cityStudioDoorMotion.ts`:
  - catalogue lookup (`kitDoorMotion`);
  - portals (`kitDoorPortals`): one per leaf, `exterior/kit/<piece>` then `#2`; leaves with the same prefix toggle together;
  - the passage cut (`cutBlockerForPassage`);
  - the collision box per motion (`portalLeafBox`): swing about the hinge, slide along the wall by 92% of the leaf, roll 94% towards the head;
  - the leaf transform (`kitLeafMatrix`);
  - the geometry split (`splitDoorLeaves`): cut at `cuts`, then a triangle moves with a leaf when it lies wholly in one of its boxes.
- Loading (`CityStudioMeshes.loadStudioKit`, full kit only): each door module's channels are split into the static rest and one piece per leaf. The medium kit keeps its leaves baked.
- Resolve (`resolveStudioInteriors`): every placed kit door piece with a motion becomes portals and is marked `portal`.
  - A tile's wall blocker is cut into jambs and a head around the passage; generated walls already leave doorways open.
  - Ground-floor kit tiles get a level doorstep and a ramp, like free doors, so the E prompt no longer misses on 48 m plots.
- Drawing: near the camera the static kit skips the leaf pieces of portal doors, and `CityStudioKitDoorLeaves` draws them per door, moved each frame by the door state. "Near" is within 120 m in `CityStudioMeshes`, and the `near` level in the city's shared kit. Elsewhere the leaves draw closed with the instanced kit (shared kit tier `leaf`, shown at `full`).
- Collision (`StudioWalkingCollision`): the dynamic leaf box follows the motion. `doorClear` needs 0.8 m for swings and 0.5 m for slides and shutters.
- Business buildings (`resolveModularBuilding`, `resolveSculpt(..., {doors:false})`) keep closed doors, no portals and no interior levels.
- Test data: with `?cityStudioTest`, the exploration canvas data (`data-city-exploration`) reports the nearest door and its open fraction.

### Doors on buildings without interiors

A door needs somewhere to go. On a v5 building the resolver now builds an **implicit empty interior**: the same storey slabs, decks and portals that an explicit "Add interiors" gives, with no rooms (`StudioResolved.implicitInterior`). It is not saved: the recipe stays v5, there is no undo step, the glass stays opaque and business validators are untouched.

- Its floors (default timber and wall colour) mount hidden and show the first time one of the plot's doors opens, then stay (`ImplicitInteriorGate`). Closed buildings cost nothing extra, and the character is never left in the void after closing a door behind them.
- The doorsteps and ramps (`entry/…` decks) are drawn on their own (`CityStudioEntryRamps`), so they are always visible.
- Rooms → Add interiors still upgrades the recipe to v6 for partitions, stairs, furniture and see-through glass.
- Why not the alternatives:
  - Silently upgrading to v6 would rewrite every saved building (almost every building has an entrance), switch its glass to see-through into empty rooms and add undo noise.
  - Doors that open onto nothing would show the void behind the walls.

### Verification (every door)

- `node --experimental-strip-types --test src/domain/cityStudioDoorMotion.test.ts` checks:
  - every door module in every kit has a motion, and each family has the expected one;
  - leaves split real triangles from the GLBs and stay inside the aperture;
  - swing, slide and roll transforms and collision boxes;
  - portals and walk-through for a classic kit tile (v5 and v6), a Tokyo sliding door, a storefront double door, a Tokyo shutter, the open stall front (a recess on v5, passable on v6), storefront and Tokyo stamps, and shopfront, townhouse and Tokyo rhythm doors.
- `node scripts/city-studio-kit-doors-browser.mjs` (and `CITY_BACKEND=webgl`) builds a v5 building with a kit door tile, a Tokyo sliding door, a storefront double door and a rhythm door.
  - It presses Done and walks to each door. It checks the closed door blocks, presses E, checks the door state, then walks through into the implicit interior and back.
  - Screenshots: `output/kit-doors-<door>-{closed,open,inside}.png`.

### Limits

- Leaf boxes are geometric heuristics per kit build.
  - The splayed corner door swings about a vertical axis at its end, although its leaf is diagonal.
  - The Tokyo half-open shutter rolls its glazed door up with the shutter instead of opening it separately.
- Leaves of a kit door piece scaled narrower than its module (bays under 2 m) turn in the scaled frame, so they shear slightly while swinging.
- Arched and stone-arched fanlights stay fixed. On the stone-arched shop door the character's head crosses the fanlight when passing (the collision passage uses the aperture head).
- Implicit interiors are empty floors: no rooms, lights or furniture.
