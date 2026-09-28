# Stairs, entrances and railings (local construction studio)

Building entrances were a plain doorstep and a slope, interior stairs were two grey layouts with box guards, and nothing
guarded the opening a stair cut into the floor above. This round adds:

- an **entrance system** for every ground-floor door (kit tiles, kit pieces and free doors, storefront doors, rhythm and
  theme doors) with ten presets, per-door choice, part and building defaults and facade-theme defaults;
- **interior stairs** in five shapes (straight, L, U / dog-leg, spiral, switch-back core) with entry and exit sides, turn,
  width and five railing styles, automatic stairwell openings with guards, headroom and fit checks;
- a reusable **railing / balustrade generator** used by stairs, stairwell guards and entrances;
- a Blender **stair parts pack** (`public/city/stairs/v1`) for newels, balusters, scroll panels, porch columns, brackets,
  pediments, urns and stoop lamps.

Everything is local studio data. Business and profile validators reject the new fields (`studio.entrances`, and v6
interiors as a whole); business buildings have no portals, so they get no entrances. No schema, backend, provider or
deployment change.

## Why every door needs a way up

The ground floor slab sits at 0.65 m (`sculptFloorBottom`), its walking surface and door thresholds at 0.69 m, and the plot
at 0.18 m. So every door has a 0.51 m rise: three 0.17 m risers for most presets, four shallow 0.13 m civic risers for the
grand stair. Treatments are sized from the door's clear width and its threshold and head heights.

## Entrances (`src/domain/cityStudioEntrances.ts`)

| Preset | What is built | Collision |
|---|---|---|
| `steps` (default) | Stone steps (0.30 m going) and a 0.9 m landing, door width + 0.5 m | Side blockers on the landing and upper steps |
| `railed-steps` | Georgian steps and a 1 m landing with railings both sides and newels at the foot | Railings |
| `stoop` | Brownstone stoop: 1.3 m top landing, sloping cheek walls with capping and iron rails, lamp newels, a flared bottom step with rounded corners | Cheek walls, flared-step deck |
| `porch` | Timber porch deck (≥ 3.2 m wide, 2 m deep) with boards and skirt, Tuscan columns, beam and a zinc shed roof, rails either side of centred steps | Columns, rails |
| `canopy` | Steps under a glass canopy with a steel frame and tie rods | Steps |
| `hood` | Steps under a classical hood on two scrolled console brackets | Steps |
| `ramp` | Accessible 1:12 ramp along the wall (≤ 6.5 m), a 1.5 m landing, front steps, steel rails and a wall handrail; tries the other side if one does not fit | Rails, ramp kerb |
| `vestibule` | Deep entry: stone cheeks and a lintel 1.25 m out, a raised floor between them, steps in front | Cheeks |
| `grand` | Civic stair: ≥ 4.5 m wide, 0.40 m going, shallow risers, 1.6 m landing, stone balustrades with piers and urn finials, plinths | Balustrades |
| `slope` | The original doorstep and sloped path | — |

Optional per choice: railing style (below), a door surround (`pilasters`, or `pediment` with the Blender pediment), and the
ramp side (seen from the street).

**Choice order** (`entranceChoice`): the door's own entry (`free:<opening id>`, `kit:<opening id>` or `stamp:<stamp id>`,
which also matches generated rhythm and theme door ids), the part's (`part:<id>`), the building's (`building`), the facade
theme's default, then `steps`. Storefront doors keep plain steps under a theme. The inspector shows which of these a door
follows.

**Theme defaults** (`THEME_ENTRANCES`): NYC brownstone → stoop; NYC tenement, London Georgian and Amsterdam canal →
railed steps; Victorian terrace and German half-timber → hood; Paris Haussmann, Italian palazzo and Mexican colonial →
vestibule; civic classical, art deco office and brutalist civic → grand stair; glass office and warehouse conversion →
side ramp; Scandinavian modern, Soviet block and Tokyo mansion → glass canopy; suburban cottage and seaside → porch; the
rest → steps. Each also sets the step material (brownstone, granite, limestone, concrete, brick, render or timber).

**Fitting** (`resolveStudioEntrances`): doors are fitted in a stable order. A treatment that would leave the plot
(beyond the garden-wall line, |x| or |z| > 10.8 in plot-local units, both plot sizes), run into the building's ground floor or overlap an earlier
door's entrance falls back to `steps`; an explicit choice then appears in the inactive list with the reason. Plain steps
are always placed.

**Walking**: the landing deck `entry/<key>/landing` is level with the threshold and reaches 0.2 m into the reveal, so the
character stands at the door to press E; the flight deck `entry/<key>` ramps from the ground to the threshold along the
steps (the same ids and ends as before). Ramps are drawn by their stairwork (decks carry `stairwork: true`), not as plain
slopes.

**Wiring**: `resolveStudioInteriors` collects doors from generated faces (`freeDoorEntranceDoors`) and ground-floor kit
tiles, then calls `resolveStudioEntrances`. Its render data is `StudioResolved.stairwork` (kind `entrance`, with the door
frame and brush target).

## Interior stairs (`src/domain/cityStudioStairs.ts`)

Intent (recipe v6 `interior.stairs[]`): `{id, floor, x, z, rotation, layout, flip, rail?, entry?, exit?, width?}`.

- `layout`: `straight`, `l`, `u`, `spiral`, `core`, or `auto` (the first of straight, U, L, spiral that fits). Saved
  `switchback` stairs (the old two-flight layout) are read as `u`; `auto` and `straight` keep their deck ids
  (`<id>/ramp0`, `<id>/upper`).
- `entry`: `front`, `left` or `right`: which side you approach from. A side entry starts with a three-riser flight from that
  side and a quarter landing.
- `exit`: `ahead`, `left` or `right`: a side exit ends on a landing at the upper floor level that you leave sideways.
- `flip` turns L, U, core and spiral stairs the other way (they turn left by default). `width` is 0.8–1.6 m (default 1 m).

**Frame and geometry**: the placed point is where you step on (the centre of the first riser; a spiral's walk line) and
`rotation` points up the main flight. Risers are at most 0.19 m (16 × 0.1875 m for a 3 m storey), the going 0.27 m
(2R + G = 0.645 m); spirals use 0.36 rad treads, 0.22 m on the 0.62 m walk line, a 1 m radius and a centre column. Every
shape is flights joined by landings: a quarter landing (L, side entries), a half landing across both flights and a 0.12 m
well (U, core), or a top landing (side exits).

**Walking surfaces**: each flight is a ramp through the tread midpoints, half a riser above the floor at the bottom and half
a riser below the landing at the top, so the character never floats more than half a riser and never needs more than half
a riser to step, even on 48 m plots (scaled ×2). Spiral treads are planes rising along the walk line for the same reason.
Landings are flat decks; `<id>/upper` marks the arrival for furniture clearance.

**Stairwell** (upper slab): only the part where standing on the stair would leave less than 2.05 m under the 0.2 m slab is
cut (plus 0.08 m for rails), so the low end of a straight stair stays covered. Around that opening, on the floor above,
`stairwellGuards` draws the same railing style along every edge that has floor beside it, except where the stair arrives,
outside walls and other stairwells. A switch-back core gets walls instead: around the U on the lower floor (entry end
open) and around the opening on the floor above (arrival open).

**Refusals** (the stair stays inactive with the reason, shown in the Rooms tray and the placement ghost):

- "This storey is too low for a stair." (under 2.3 m), "This storey is too low for that stair shape." (a leg under two
  risers);
- "The stair does not fit within this floor.", "The stair must stay under the floor above.";
- "Needs clear floor space at the bottom of the stair." / "…where the stair arrives." (1 m zones at both ends);
- "Not enough headroom over the stair (x.xx m); move or turn it." (every tread and landing against the slab and the stair
  itself) and, for spirals, "Not enough headroom where the spiral passes over itself";
- "Another stair already occupies this opening.", "Another stair is in the way.", "The stair would arrive in another
  stairwell.", "Keep the foot of each stair clear.";
- the existing partition, doorway and open-to-below checks.

**Rails on the stair**: each side of the walking path is a chain (flight edges, landing edges). Runs against an outside
wall or a partition become wall handrails on brackets; free runs are balustrades with newels at the bottom and top.

## Railings (`src/domain/cityStudioRailings.ts`)

`railing(builder, id, path, style, options)` runs along any polyline of base points (level or sloped) and emits:

| Style | Handrail | Infill | Posts |
|---|---|---|---|
| `timber` | oak 70 × 65 mm | turned balusters every 0.115 m, a base rail | turned newels at the ends, square posts at corners |
| `iron` | flat iron bar | twisted balusters every 0.12 m on slopes; scroll panels between square bars on level runs ≥ 0.9 m | cast-iron newels at the ends |
| `glass` | steel tube | frameless glass panels (parallelograms on slopes) in a base shoe | — |
| `steel` | steel tube | four rods | round posts every ≤ 1.2 m |
| `stone` | 260 mm stone rail | bottle balusters every 0.3 m on a plinth | stone piers with urn finials at the ends |

Balusters stay vertical and scale in height to the slope. Each run collides as a chain of thin blockers (≤ 0.8 m long)
from its base to the handrail; wall handrails do not collide. Output goes to a `StairworkBuilder`: boxes and cylinders
(instanced per material), triangle soups (glass, cheek walls, spiral treads; merged per material) and Blender parts
(instanced per part).

## Stair parts pack (`public/city/stairs/v1`)

`scripts/build-city-stair-parts.py` (Blender 5.0, headless, reproducible) writes `kit.glb`, `kit-medium.glb`,
`catalogue.json`, `manifest.json` and `thumbnails/`. Frame: +X along the run, +Y up, +Z out, origin bottom centre
(brackets and pediments on the wall skin). Colours bake to vertex colours; metal and light classes stay metallic or glow.

| Part | Label | Triangles (full / medium) |
|---|---|---|
| `newel-timber` | Turned timber newel | 396 / 234 |
| `newel-iron` | Cast-iron newel | 584 / 332 |
| `newel-stone` | Stone pier | 120 / 120 |
| `baluster-timber` | Turned timber baluster | 248 / 140 |
| `baluster-iron` | Twisted iron baluster | 324 / 160 |
| `baluster-stone` | Stone bottle baluster | 296 / 164 |
| `panel-iron-scroll` | Wrought-iron scroll panel | 1352 / 508 |
| `porch-column` | Tuscan porch column | 632 / 404 |
| `bracket-console` | Scrolled console bracket | 348 / 172 |
| `pediment` | Door pediment | 50 / 50 |
| `urn-finial` | Stone urn finial | 388 / 202 |
| `newel-lamp` | Stoop lamp newel | 472 / 376 |
| **Total** | 12 parts | **5,210 / 2,862** |

`CityStudioStairwork` loads both levels once, instances parts per id and switches to the medium level beyond 28 m.

## Studio UI

- **Inspector › Opening** (a door: a kit or free door piece, a free opening at the ground, a kit door tile on the ground
  floor, a storefront): *Entrance* shows what the door gets now and from where (this door, part, building, theme,
  storefront default), the preset tiles, railing, surround and ramp side, *Use default*, and *Brush onto other doors*.
- **Inspector › Building** and **› Part**: *Entrances* sets the default for every door there without its own choice;
  *Back to theme defaults* clears it.
- **Paint (brush) › Openings › Doors**: the *Entrances* tray holds a treatment; *Brush entrances onto doors* arms it. Doors
  highlight, the one under the pointer shows `current → new`, and each click is one labelled undo step
  ("Entrance: Brownstone stoop").
- **Rooms › Inside stair**: shape tiles (auto, straight, L, U, spiral, core), *Flip turn*, *Rotate*, *Enter from*
  (front, left, right), *Leave the top* (ahead, left, right), railing and width. With a stair chosen from the list the
  controls edit it (one undo step each) and show its refusal reason. Otherwise they set the next stair, and a placement
  ghost follows the pointer: the stair that would be built, its footprint in green, arrows where you step on and arrive,
  and "U / dog-leg · 16 risers · click to place, drag to turn", or the refusal in red. Dragging still turns it in quarter
  turns.

UI state lives in `studio/studioStairsEntrances.ts`; the canvas tools are `CityStudioStairTools.tsx` (ghost and brush
picker) and the drawing is `CityStudioStairwork.tsx`.

## Files and shared edits

New: `cityStudioRailings.ts`, `cityStudioStairs.ts`, `cityStudioEntrances.ts` (+ tests `cityStudioStairs.test.ts`,
`cityStudioEntrances.test.ts`, `cityStudioStairParts.test.ts`), `CityStudioStairwork.tsx`, `CityStudioStairTools.tsx`,
`studio/StudioEntrances.tsx`, `studio/studioStairsEntrances.ts`, `studio/studioStairsEntrances.css`,
`scripts/build-city-stair-parts.py`, `scripts/city-studio-stairs-entrances-browser.mjs`, `public/city/stairs/v1/*`.

Targeted edits: `cityStudioTypes.ts` (stair fields, `StudioDeck.stairwork`, `StudioResolved.stairwork`,
`StudioIntent.entrances`), `cityStudioInteriors.ts` (stairs and entrances through the new modules; the stair validator),
`cityStudioFreeDoors.ts` (`freeDoorEntranceDoors`), `cityStudio.ts` (entrance validation), `CityStudioInteriorMeshes.tsx`
(skip decks drawn by stairwork), `CitySculptBuilding.tsx` and `CitySculptCity.tsx` (mount the stairwork and tools),
`useStudioInteraction.ts` (a placed stair takes the tray options), `StudioPalette.tsx` (the stair tray),
`StudioInspector.tsx` (entrance sections), `PaletteBrush.tsx` (the entrance brush tray under Doors).

## Verification

- `npx tsc --noEmit`; `node --experimental-strip-types --test --test-concurrency=1 src/domain/cityStudio*.test.ts src/features/city/studio*.test.ts`.
  - Stairs: rise/run and 2R + G, ramps adding up to the storey; quarter and half landing positions and turn directions;
    side entries and side exits; headroom (low storey, slab, self-overlap); the stairwell cut only where needed, the side
    guard blocking and the arrival open; every shape (and side entry/exit and flipped variants) walked up and down with
    the character controller, also at 48 m-plot scale; core walls; every railing style; `switchback` migration;
    stair-to-stair refusals; strict validation; business rejection.
  - Entrances: every preset level with the threshold and climbing from the ground; the character walks from the street
    onto every landing; rails, cheeks, columns and balustrades block from the side; theme defaults (brownstone, Georgian,
    civic, tenement storefronts); choice order and fallbacks (plot edge, overlap, ramp side); surround and Blender parts;
    validation.
  - Pack: catalogue ↔ `STAIR_PARTS`, GLB hashes, medium lighter than full.
- `CITY_TEST_ORIGIN=… node scripts/city-studio-stairs-entrances-browser.mjs` (native WebGPU; `CITY_BACKEND=webgl`
  for the fallback). A building with ten doors, one per preset: sets and undoes a building default in the inspector, arms
  the entrance brush, then in play mode walks to every door, climbs to the threshold, opens it with E and walks in. A
  second building holds every stair shape: the Rooms ghost and a UI-placed U stair (undone), then the character enters
  and climbs each stair to the floor above and back, and the straight stair's guard stops a walk into the opening.
  Screenshots: `output/entrance-<preset>.png`, `entrance-studio.png`, `entrance-brush.png`, `stair-<shape>.png`,
  `stair-<shape>-top.png`, `stair-well-guard.png`, `stair-ghost.png`, `stair-overview.png` and
  `stair-pack-contact-sheet.png`.

### Results (2026-09-28, native WebGPU, own dev server on port 5199 because 5180 was down)

- Unit tests: 338 studio tests pass, including 12 stair, 7 entrance and 1 pack test.
- `city-studio-stairs-entrances-browser.mjs`: passes. All ten entrances are climbed to the 0.69 m threshold and entered, and all five stairs are climbed to 3.69 m and descended. The straight stair's guard holds the character at x = −8.5, beside the opening edge at −8.72.
- Other `city-studio-*-browser.mjs` scripts (outline excluded): all pass, some after their one allowed retry, except `kit-doors`. That script's west-door "street" target sits 2.4 m out, which is beyond the plot's garden wall. The wall now collides for walkers because of concurrent plot-ground work (`cityPlotGround`, `StudioWalkingCollision.ground` profile walls), so the target cannot be reached whatever entrance is drawn.
- `isolate`: passes on a rerun. A WebGPU "binding size is zero" page error in one run also appeared with stairwork rendering switched off.

## Known gaps

- The ground floor itself is not raised: stoops rise the fixed 0.51 m to the threshold, so a brownstone stoop has three
  risers rather than a full parlour-floor flight.
- The vestibule projects from the wall (cheeks and lintel) instead of setting the door back into the building.
- Theme balconies, fire escapes and exterior access stairs keep their kit rails; the railing generator is not yet used
  there.
- Entrances draw with the near building (inside 60 m in the city) and are not part of the far city bake, like the old
  ramps. Theme street objects near doors are not moved out of an entrance's way.
- The entrance brush applies to doors (rhythm doors by their generated id, which changes if the rhythm regenerates);
  there is no per-door entrance on upper-floor doors.
- Railing blockers are straight pieces along curved spiral rails; spiral decks are planes per tread, so the character's
  height is exact on the walk line and within half a riser elsewhere.
- WebGL2 and physical-mobile runs were not repeated in this round.
