# Free doors and see-through glass (step 4, local)

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
  - **Buildings without interiors:** a cheap lit shell (`buildFreeFaceShell` in `cityStudioFreeDoors.ts`, one near-only draw call per building, unlit vertex colours).
    - Per storey and per run of openings, an inward-facing box sits behind the inner skin: a dark floor, warm walls that brighten upwards, and a lit ceiling.
    - The depth is at most 1.6 m and stops short of the opposite wall, measured from the opposite bays.
    - Because the faces point inwards, the shell disappears when seen from behind.
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
- **Portals only where there is an interior (recipe v6), like kit exterior doors:**
  - `resolveStudioInteriors` adds one `exterior/free/<groupId>` portal per leaf, at the glazing plane: floor 0, the part base as `y`, the spring height, face rotation, hinge, and `panelled`/`glazed` from the opening.
  - It also adds a level doorstep landing plus a ramp from the pavement (`entry/free/<groupId>[/landing]`).
  - Kit door bays on faces that free openings own no longer produce phantom portals.
  - Existing blocker splitting leaves the doorway open; the portal's dynamic leaf blocker closes it.
  - Walk-through: stand at the door, press **E**, walk in, and press **E** again to close it once clear of the swing.
- **v5 (no interiors):** there is no portal and the door keeps its baked closed leaf. A thin `free-door/<group>` blocker now stops walking through it; before, the character could pass through the closed leaf. Arcades stay passable.
  - Upgrading a building to interiors (Rooms → Add interiors) makes its free doors openable.
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
  - `node --experimental-strip-types --test src/domain/cityStudioFreeDoors.test.ts` covers portal transforms, pairs, arcades, ramps, no near-range static leaves, the see-through glass key, v5 blockers and shell bounds, collision closed/open, and doorway clearance.
  - The other studio suites also pass, including updated expectations in `cityStudioDetailBatches.test.ts`.
- **Browser:**
  - `node scripts/city-studio-free-doors-browser.mjs`, plus `CITY_BACKEND=webgl`, against the running dev server (default `http://localhost:5180`).
  - It seeds a furnished v6 building, checks the portal and glass keys, and screenshots through the windows. Then it walks to the door, confirms the closed leaf blocks, opens it with E, walks onto the ground-floor slab and closes it again.
  - Screenshots: `output/city-studio-glass*.png` and `output/city-studio-free-door-{closed,open,inside}*.png`.

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

- **Draw calls:** the 16 extra calls are one near-only shell batch per nearby building without interiors, plus separate roof-opening glass. Far buildings add nothing: the shell is near-only and glass swaps material in place.
- **Transparency:** one blended batch per building replaces one opaque batch. The fill cost is limited to the window area.
- **v6 buildings:** no shell. Animated free-door leaves add two small meshes per leaf, near only.

## Limits

- **Glass:**
  - Transparent glass is sorted per building batch, not per window.
  - It does not refract, and reflections come from the shared prefiltered environment, not from neighbouring buildings.
- **Shells:** they are boxes, not rooms. On a building without interiors, walking in through an arcade shows their backs.
- **Leaves:**
  - Arched doors keep a fixed fanlight, so on low doors (for example a 1.4 × 2.4 m arch, spring 1.7 m) the character's head crosses the transom when passing.
  - Leaves are boxes, not arch-shaped.
- **Kit exterior doors:** they do not get the new doorstep landing. On 48 m plots (scale 2), their E prompt can miss, because `nearestDoor`'s height check and the ramp slope leave the character slightly low. Free doors avoid this with the landing.
- **Not yet measured:** physical mobile, and 400-property runs with interiors.
