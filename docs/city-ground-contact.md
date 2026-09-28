# City ground contact and plot walking (September 2026)

Buildings now stand on their plot ground, and the plot ground is part of walking collision. This is a frontend and
domain change only: no schema, saved-recipe, backend, worker or provider change.

## What was wrong

All heights below are plot-local units. World height = local × plot scale (1 on 24 m plots, 2 on 48 m plots).

| Surface | Local height |
| --- | --- |
| Plot kerb ring (V1–V3 procedural grounds) | top .17 |
| Plot surface slab | top .25 (paving patterns .27–.29; the kit/modular pad .28) |
| Entrance path strips | top .33 (grounds path), .335 (studio path) |
| Ground-floor datum (every resolver: `sculptFloorBottom(0)`, masses' `y`, door thresholds) | .65 |
| Walkable ground-floor deck / door landings | .69 |

Measured gaps between the drawn plot ground and the lowest building geometry:

- **Studio buildings (sculpt v1–v6, every studio example, NYC, Tokyo, storefront, Blender kit-tile presets):** walls,
  kit pieces and generated faces all start at the .65 datum; nothing was drawn below. The gap was .40 (0.40 m on
  24 m plots, **0.80 m on 48 m plots**), .36–.38 over paving patterns. From a low angle the plot showed through
  under the whole building (`output/ground-before-studio-view.png`, `ground-before-storefront.png`).
- **Kit-tile business buildings (V3 `synarcKit`) and modular business buildings (`city-variation-5`):** walls from
  .65 over a pad at .28, a .37 gap.
- **V1, V2, V3 procedural and connected-residential business buildings:** a foundation box already filled .25–.65, but
  its bottom was flush with the surface top, leaving hairlines on offset or patterned grounds.
- Offices (`city-office-4`) carry their own plinth mesh from .26; unchanged.

Walking: a studio plot was a flat plateau at .18 × scale everywhere within 12 local units of its centre (0.36 m on a
48 m plot), so the character's feet sank 0.14 m into the drawn surface, floated over the kerb ring and path, and walked
straight through garden walls, rails and gate posts.

## Fixes

`src/domain/cityGroundContact.ts` names the heights (`PLOT_GROUND`) and builds the foundation:

- **Foundation plinth.** `foundationVertices(floors[0].polygons)` extrudes every ground-floor polygon (courtyard holes
  included) from `FOUNDATION_BOTTOM` = .13 (a .12 skirt below the surface, below paving and the kit pad) up to the .65
  datum, outset .05 so it reads as a base course, with an upward cap. Outer rings offset outwards and holes into the
  hole (mitred, clamped at sharp corners). The raised ground floor is intended (it carries door thresholds, stoops and
  interior floors), so the plinth fills it rather than the datum moving.
- **Studio view:** `CitySculptBuilding` draws the plinth (stone `PLINTH_COLOR`) for every sculpt version.
- **City:** `buildSculptCityBake` adds the plinth to the always-drawn envelope, so bakes and city chunks carry it in
  world space at every distance.
- **Business buildings:** `resolveSynarcKitV3` adds a foundation box under each ground mass; `resolveModularBuilding`
  adds a plinth mesh from its resolved footprint; the V1, V2 and V3 procedural foundations now start at .15 / .13
  instead of .25. Saved designs are untouched; only resolved geometry changes (legacy geometry hash pins updated).
- **Contact shadow:** `CityBuildingGrounding` shadow proxies of ground masses now start at the plot surface.
- Interiors are unchanged and consistent: the walkable ground floor is the .69 slab, door landings are level with it,
  kit and free-door thresholds sit at the datum, and doorstep ramps start at or below the surface.

## Walking on plots

`src/domain/cityPlotGround.ts` derives a plot's walkable ground from exactly the parts the city draws in its grounds
layer (`isGroundPart`, now shared with `CityDesignBuildings`):

- boxes up to .45 local are **pads** (kerb ring, surface slab, paving, entrance paths; strips under .3 wide such as
  grid lines are ignored); taller boxes are **walls** (garden walls and caps, rails and posts, gate posts).
- `plotGroundProfile(design)` (`cityPlotGroundProfile.ts`, cached by content) resolves the design once; every studio
  collision publisher passes it: the edited plot (`CitySculptBuilding`), finished city plots (`CitySculptCity`) and
  modular business buildings (`CityModularBuildings`). Without one the default kerb and surface apply.

`StudioWalkingCollision` (`cityStudioCollision.ts`):

- `ground()` stands the character on the highest pad at or below its reach, plus decks as before.
- Pads block like walls only where they rise more than `PLOT_STEP_UP` (0.35 m, also the grounded step margin in
  `advanceFoot`) above the walker; kerbs (0.16 m on 48 m plots) and the kerb-to-path rise (0.32 m) are stepped up and
  down automatically.
- Walls join the plot's blockers for walking and for the follow camera. The gate opening (4.2 local between post caps)
  and the entrance path stay walkable.
- The drawn character and follow camera ease through a step (`cityFootStepSmoothing.ts`); physics snaps as before.
  Only discontinuities between 0.1 and 0.5 m are eased, so ramps, stairs, jumps and falls are drawn exactly.

Driving is unchanged: the car collider still covers each plot (`syncCityDriveWorld`), studio plots are ignored only
for walking, and business plots without a studio assembly remain protected.

## Verification

- `node --experimental-strip-types --test --test-concurrency=1 src/domain/cityStudio*.test.ts src/domain/cityLand*.test.ts src/features/city/studio*.test.ts`
  includes `cityStudioGroundContact.test.ts`: datum and plinth for every studio example; the bake envelope in world
  space; interior, landing and doorstep heights; a foundation reaching below the drawn ground for V1, V2, V3 presets,
  facade, kit-tile and modular designs; saved designs unchanged; ring offsets and face orientation; pad, kerb, path
  and surface heights; stepping on and off the plot; garden and side walls block, gate and path stay walkable up to the
  door landing; tall ledges block; cars stay off plots.
- `scripts/city-ground-contact-browser.mjs` (native WebGPU, Playwright msedge; `CITY_TEST_ORIGIN`, `GROUND_TAG`,
  `GROUND_SHOTS_ONLY=1`): low-angle base close-ups in the studio and in the city (studio café, NYC, Tokyo, storefront,
  Blender kit-tile house, a demo business building) into `output/ground-<tag>-*.png`; then in play mode walks from the
  pavement up the kerb, through the gate onto the path, onto the surface, against the front and side garden walls
  (blocked) and along the entrance path onto the door landing, asserting heights. Dev test hooks used:
  `window.__cityCameraPin` (`CityTestCameraPin`) and `window.__cityFootTeleport` (`cityFootTestHook`), both only with
  `?cityStudioTest`/`?cityGroundTest` in development.

## Limitations

- Business plots without a studio assembly stay fully protected for walking; around 48 m business plots the character
  still walks at pavement height over the outer kerb ring.
- Trees, planters and garden props are not colliders; studio garden decorations of older sculpt recipes neither.
- Other agents' stair and entrance code still uses .18 as the stair-foot and ramp start height; it lies below the
  surface, so ramps meet the ground, and collision takes the higher plot surface there.
- The "before" city close-ups were captured before the shared kit could be forced near, so the kit-tile and NYC
  "before" shots do not show their walls; the studio view and storefront shots show the gap.
