# Paint rules on generated walls (local studio)

Paint rules are the rule-based part of the facade paint layer. A rule paints one finish on every generated wall
in a scope: whole storeys, a plinth, string courses, a frieze, corner quoins or alternate opening columns. Rules
are resolved per face at resolve time and are never stored per face, so they follow part resizing, storey-height
changes, new parts and curved walls. Hand-drawn regions (`docs/city-paint-regions.md`) still paint on top.

## Data (`src/domain/cityStudioPaintRules.ts`)

`studio.paintRules?: StudioPaintRule[]` (local plots only):

```
{id, kind: 'floors'|'band'|'quoins'|'alternate', scope?, channel: 'wall'|'trim', finish,
 floors?, band?, quoins?, alternate?}
```

| Field | Meaning |
|---|---|
| `scope` | Absent = whole building; otherwise exactly one of `parts: string[]` or `walls: {partId, side}[]` (≤ 32). |
| `floors` | `'ground'` (building floor 0), `'upper'` (floor 1+), `'top'` (the part's top storey) or `{from, to}` (building floor indices). Required for `kind: 'floors'`; on other kinds it limits the rule to those storeys. |
| `band` | `{at, offset, height, floor?}` in metres. `base`: y0 = part base + offset (plinth). `storeys`: y0 = every internal storey line + offset (string courses). `top`: y1 = wall top − offset (frieze). `floor`: y0 = bottom of building floor `floor` + offset. |
| `quoins` | `{width, course?}`: strips at both ends of straight walls; with `course`, alternating long/short stones (short = 0.6 × width). Curved ring walls have no corners and are skipped. |
| `alternate` | `{phase: 0|1}`: every other opening column. Columns come from the face's resolved opening groups (rhythm or manual; centres clustered within 0.35 m, split at midpoints). Faces with fewer than two columns are skipped. |

All heights come from `sculptFloorBottom/Top` with the current design, so storey-relative rules move when storey
heights change. Validation (`validatePaintRules`, called from `validateStudio`): ≤ 24 rules, unique ids, each kind
carries exactly its own settings, curated finishes (`validPaintFinish`, shared with paint regions), bounded numbers,
no extra keys. Business profiles (`validateModularBuilding`) and business imports (`validateVariationRecipe`) reject
the field (their studio key whitelists).

Presets (`PAINT_RULE_PRESETS`): Plinth (0.9 m base band), Ground floor, Upper floors, Top floor, String courses
(0.25 m centred on each storey line), Corner quoins (0.7 m, 0.45 m courses), Frieze (0.6 m under the top), Alternate bays.

## Precedence

On one face, bottom to top:

1. Part finish (defaults + part).
2. Rules: storey fills (`floors`, `alternate`) first, then accents (`band`, `quoins`); within each tier building <
   parts < walls; within a scope class, list order (later wins). The tier keeps a building-wide plinth visible over a
   part's own ground-floor finish.
3. Legacy tile paint (per-tile surfaces on the face).
4. `studio.paintRegions` (hand strokes, bands and fills always win).

## Resolve

`resolveStudioFreeFaces` builds `paintRuleFace(r, d, shapeId, side, frame, resolution.groups)` (storeys in face
metres, a floor-line lookup, opening columns, `closed` for curves) and passes it to `studioFacePaint`, which prepends
`paintRuleLayers` before the tile paint and regions. Everything downstream is the existing path: `paintPartition`
strips, `splitPaintedTriangles`, per-finish wall batches, curved bending. A rule whose finish equals the face base
drops into the base slot (it can "restore" the base over earlier rules).

Cost: rule resolution itself is negligible; the extra time is the same triangle splitting a hand-drawn region of
that shape would cost. In Node (interleaved medians of 9, `cityStudioPaintRules.test.ts`), a four-part building
(three boxes and a round tower, facade rhythm, 13 generated faces) resolves in 129–141 ms without rules and
154–176 ms with Plinth + Upper floors + String courses + Corner quoins (+25–35 ms, about 20%). Individually: plinth
and upper floors are within noise, string courses about +8 ms, quoins about +0–5 ms. Every distinct finish adds one
wall batch (draw call) per building, as for regions.

## Studio (Paint → Paint rules, `CityPaintRulesPanel.tsx`)

- **Paint rules** opens the panel under the paint tray (the status line moves to the top while it is open).
- **Apply to:** Whole building / These parts / These walls. Parts and walls are picked by clicking the building (Shift
  adds or removes); picking never paints. The hovered part or wall is previewed and the chosen targets are amber.
  Picking goes through `onPaintPick` in the paint branch of `useStudioInteraction`.
- **Add with current finish:** eight preset tiles; each adds one rule with the current colour/material and channel
  (wall, or trim when Trim is selected) for the chosen scope. One undo step.
- **Rules list:** swatch, label, scope, up/down, remove; rows can be dragged to reorder. Each change is one undo step.
- **Editing:** click a rule to select it. The scope picker then edits that rule's scope directly (clicks and chip
  removal commit), and an editor shows Use current finish, wall/trim, storeys (G / upper / top / the current storey),
  band height and offset, quoin width and long-and-short stones, column phase, and "Only on" floors for accents.
  Number and range inputs are grouped into one undo step per control drag.
- **Band around the building:** with **Band** active, hold **Shift** while dragging (or turn on **Around building**)
  to create a building-wide `band` rule anchored to the floor the band starts in (offset from that floor line)
  instead of a per-wall region.

## Verification

- `node --experimental-strip-types --test src/domain/cityStudioPaintRules.test.ts` (rule rectangles per kind,
  tiers/specificity/list order, regions over rules on a resolved face, storey-relative courses after an upper-height
  change on a curved face, around-band anchors, recipe edits, validation and business/profile rejection, performance).
- `node scripts/city-studio-paint-rules-browser.mjs` and `CITY_BACKEND=webgl node scripts/city-studio-paint-rules-browser.mjs`
  (dev server on `CITY_TEST_ORIGIN`, default `http://localhost:5180`): a box plus a round tower with a facade rhythm;
  brick plinth for the building, a ground-floor finish picked on the tower in 3D, string courses, Shift+Band around the
  building, a hand stroke over the band (checked to win), undo/redo, move up, edit + undo, drag reorder and reload.
  Screenshots `output/city-studio-paint-rules*.png` (`-pick`, `-edit`, `-panel`, `-orbit`, `-reload`, `-scope`).
  The script keeps Vite's HMR socket inert so concurrent source edits cannot reload the page mid-run.
- Regression suites: `city-studio-paint-regions-browser.mjs`, `city-studio-paint-browser.mjs`,
  `city-studio-curved-walls-browser.mjs`, `city-studio-rhythm-rules-browser.mjs`.

## Limits

- Rules paint generated (free-opening or rhythm) walls only; kit-tile walls keep per-tile paint.
- Alternation follows resolved opening groups; fully blind columns are not counted.
- A rule targeting a removed part or wall stays stored and simply matches nothing.
- The band editor edits metres; switching a band between anchors (base / storeys / top / floor) is done by adding
  the matching preset.
