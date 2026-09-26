# Facade rhythm rules (local studio)

The facade rhythm (`studio.facadeRhythm`, `src/domain/cityStudioFacadeRhythm.ts`) generates free openings and
trims on every straight wall. This round turns it into a rules system with the old tile-variation controls: weighted
pools, coverage, spacing, pattern and uniformity. Rules can be scoped to parts, walls, floors and painted regions.
Manual openings now **fill** by default.

Generation is still pure and deterministic. Columns come from each wall's exposed length and storey heights. Sill and
head lines are shared per storey, and columns stay aligned across storeys. Generated ids (`generated/rhythm/...`) never
enter the saved recipe. Business and profile validators still reject `facadeRhythm`.

## Schema

`{version:1|2, seed, style, density?, variety?, trims?, manual?, bay?, locks?, layerSeeds?, layers?, rules?}`

| Field | Meaning |
|---|---|
| `style` | Preset: townhouse, shopfront, civic, cottage, warehouse or loft. |
| `density` / `bay` | Column pitch. `bay` is in metres (1.2–8, version 2) and overrides the pitch derived from density. |
| `variety` | 0–1. Feeds the presets: weights of alternative shapes, uniformity and blind bays. |
| `trims` | `none`, `simple` or `rich`. |
| `manual` | `fill` (version 2 default) or `own` (version 1 default). |
| `locks` / `layerSeeds` | Per-layer shuffle locks and counters for ground, upper, attic and trims. |
| `layers` | Per pool layer (version 2): ground, upper, attic (top storey), corners and trims. See below. |
| `rules` | Scoped overrides (up to 32). See Scopes. |

A layer rule has the form `{pool?, coverage?, spacing?, pattern?, uniformity?}`:

- **pool**: up to 24 `{id, weight}` entries, with weights from 0.01 to 100.
  - Window layers take the opening types `rect`, `tall`, `wide`, `arch`, `pointed`, `round`, `paired`, `triple`, `door`, `shop` and `blind`.
  - The trims layer takes trim kinds.
- **coverage**: the share of cells that get an opening; the rest stay blind wall. A storey is never blanked completely while coverage is at least 0.5.
- **spacing**: only every (spacing+1)-th column opens. The count is mirrored for symmetric styles.
- **pattern**: sets which cells share a roll.
  - `aligned`: one roll per column across the layer's storeys.
  - `groups`: 2×2 blocks.
  - `alternating`: per column, odd and even storeys differ.
  - `independent`: every cell rolls on its own.
- **uniformity**: the chance that a cell takes the favourite instead of its own weighted roll. The favourite is the heaviest entry, with a seeded pick among ties.

Types map onto the storey's slot from the style: sill, head clearance and base width.

| Type | Result |
|---|---|
| `rect`, `arch`, `pointed`, `round` | The single window in that shape. |
| `tall` | A French window with a low sill, full storey height. |
| `wide` | A broad window that fills the column. |
| `paired`, `triple` | Mullioned groups kept inside one column. |
| `door` | An extra door on the ground floor; a tall window above. |
| `shop` | A glazed shopfront on street ground floors; a rect window on side walls; a wide window above. |
| `blind` | No opening. |

`corners` overrides the outer columns of upper storeys when it is set. On a style without an attic treatment, `attic`
inherits from `upper`.

## Presets

A style is a preset, and `rhythmLayerPreset(style, variety, layer)` returns the pool it stands for:

- **Main pick:** the style's slot shape at weight 1. Shop ground floors use `shop`; paired and triple uppers use `paired` or `triple`.
- **Alternative shapes and the single variant:** weight `variety × 0.5`.
- **Coverage:** `1 − blind × variety` for styles with blind bays (cottage), otherwise 1.
- **Uniformity:** `1 − 0.6 × variety`.
- **Pattern:** aligned.
- **Trims preset:** all kinds the style uses. The default trims path keeps the style's per-role combinations until a trims pool or coverage is set.

`layers` fields override the preset field by field. The pool is replaced as a whole.

Setting a style at a scope (`applyRhythmStyle`) applies the preset: it sets `style` and clears the layer overrides
written at that scope. While folding, a rule that sets a style also discards the layer overrides it inherited, so a wing
restyled as a loft gets the loft pools rather than the building's hand-tuned townhouse pools.

## Scopes and precedence

A rule target is `{partId?, side?, fromFloor?, toFloor?, x0?, x1?}`. Precedence runs from lowest to highest, and a later
rule wins within its class:

1. Building
2. Part class: side only < part < part and side
3. Floor (`fromFloor`/`toFloor`, optionally with a part or side)
4. Region (`partId`, `side`, x range in face metres, optional floors)

Part-class rules act on the whole wall. They can set style, seed, density, bay, variety, trims, off, manual, layers and
layerSeeds.

Floor and region rules act per cell, at a storey and a column centre. They can set style (slot shapes and presets),
seed, variety, trims, off, layers and layerSeeds. Bays, the door plan and manual precedence stay at wall level, so
columns remain aligned.

`rhythmScopeSettings(rhythm, target)` returns the effective settings at a target for the panel. It includes the full
per-layer rules and which layers are explicitly edited.

## Manual precedence

- **`fill`** (version 2 default): a manual free opening reserves its span plus 0.6 m sideways and 0.5 m vertically.
  - Generated cells that overlap it are dropped as a whole: a pair never loses one panel.
  - Every other cell keeps its exact grid position, so columns stay aligned.
  - Generated openings never merge with the manual one.
  - A manual door still suppresses the generated street door of that part.
- **`own`**: set per wall with a rule `{partId, side, manual:'own'}` ("Keep wall manual"), or for the whole building.
  - A wall with a manual free opening is left entirely to the user.
- **Kit openings and storefront stamps** always own their wall. Kit tiles cannot be partly suppressed without changing the free-face geometry modules.
- **Unpacking a filled wall** (`materializeFacadeRhythm`) adds the keep-manual rule, so the unpacked copies are not filled around a second time.

## Compatibility

- **Version 1 recipes** keep the original generator code path unchanged. `cityStudioFacadeRhythmRules.test.ts` pins ten version-1 recipes by hash (`cityStudioFacadeRhythmLegacyCases.ts`); the hashes were recorded before this change.
- **Version-2 fields** are `bay`, `layers`, and floor or region targets. They are rejected on version 1, and a recipe upgrades only when one of them is written, or when a keep-manual wall rule is set. A version-1 recipe edited with the old controls (style, density, variety, trims, locks, shuffle) stays version 1.
- **`newFacadeRhythm`** creates version 2.

## Studio panel (Openings → Rhythm, `CityRhythmPanel.tsx`)

- **Style preset:** six tiles. They apply to the current scope.
- **Apply to:**
  - **Whole building.**
  - **These parts** and **This wall:** click in 3D; Shift adds or removes.
  - **These floors:** follows the storey rail; Shift-click a storey to extend the range.
  - **Painted region:** click where it starts, then where it ends on the same wall. It covers the clicked bays and the storeys between them.
  - Chosen targets appear as chips and are highlighted in amber on the building. Hovering previews what a click picks.
- **Layer tabs:** Ground, Upper, Top, Corners and Trims.
  - Each tab has a lock (`Lock ground` …). A dot marks edited layers.
  - **Reroll layer** reshuffles one layer at the current scope.
  - **Reset to style** clears the layer's overrides at that scope.
- **Pool chips:** thumbnail outlines drawn from `freeOpeningOutline`.
  - Tap to include.
  - Double-tap or **+** to favour. Weight becomes 1, then doubles.
  - Long-press or right-click to avoid: the entry is removed at once.
  - **−** halves the weight, and removes the entry once it is at 1 or below.
  - Chips show each entry's share and multiplier.
- **Sliders:** coverage, uniformity and bay width. Bay width has **Auto**. A slider drag is one undo step, because `useCityLand` coalesces input events per element.
- **Pattern and spacing:** pattern chips and every 1st, 2nd or 3rd column.
- **Style chips:** variety, trim level, and manual openings (**Fill around** / **Own the wall**).
- **Wall actions:**
  - **Keep wall manual** and **Plain wall** are click modes that toggle a wall rule. With walls selected in the This wall scope, they act on the selection directly.
  - **Unpack a wall**.
  - **Shuffle**. Space and the belt's **New look** also work.
  - **Remove rhythm**.
- **Scoped rules list:** each rule has a summary. Click a rule to edit its scope; × removes it.

## Verification

- `node --experimental-strip-types --test src/domain/cityStudioFacadeRhythm.test.ts src/domain/cityStudioFacadeRhythmRules.test.ts`: 19 tests.
  - Legacy hashes.
  - Pools, weights and determinism.
  - Every pool type in every style fits and never merges.
  - Coverage, patterns, spacing and uniformity.
  - Scope precedence, including regions and multi-wall edits.
  - Manual fill: alignment, no merges and door handling.
  - Keep manual, unpack, presets, per-layer reroll and locks, corners and trim pools.
  - Validation.
- `CITY_TEST_ORIGIN=http://localhost:5180 node scripts/city-studio-rhythm-rules-browser.mjs` runs these steps:
  - Apply a style.
  - Favour, then long-press-avoid round on the top storey.
  - Favour arches.
  - Drag coverage.
  - Scope a civic preset and a pool to one clicked wall.
  - Keep another wall plain.
  - Cut a manual round window on a rhythm wall and check that generated openings remain, with no collisions or merges.
  - Keep a wall manual.
  - Remove a rule from the list.

  Screenshots: `output/city-studio-rhythm-rules*.png`.
- These suites still pass: `city-studio-game-ux-browser.mjs` (rhythm names kept; its wall picking now avoids the taller dock), `city-studio-facade-rhythm-browser.mjs`, `city-studio-free-openings-browser.mjs` and `city-studio-paint-regions-browser.mjs`.

## Limits

- Region x ranges are stored in face metres. Resizing a part keeps the metres, so a region can cover different columns afterwards.
- Floor and region rules cannot change bay width or the door plan, because columns are laid per wall.
- Kit or stamp openings still own their whole wall.
- There is no drag-painting for regions yet; they use two clicks.
