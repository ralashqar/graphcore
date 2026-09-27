# City studio outline sculpting v2

The construction studio (`/city?demo=1`) now edits a part's outline the way a light modelling tool does: drag corners, add corners on walls, push or pull walls, and let the building fill the gaps. It replaces the 12-edge limit of [city-studio-outline.md](city-studio-outline.md) for studio recipes. Business recipes are unchanged (see Limits).

## Using it

Select a solid part, then **Build › Polygon** or **Inspector › Part › Sculpt outline** (the polygon icon) or **Outline › Edit outline**. Top view (`Top`) is the easiest angle; the grips sit on the part's top.

| Gesture | Result |
|---|---|
| Drag a corner (white grip) | moves it; lengths of both walls and the corner angle are shown live |
| Click a corner / Shift click | selects it / adds or removes it from the selection (blue); dragging a selected corner moves them all |
| Double-click a corner, or Delete / Backspace with corners selected | removes them (Esc clears the selection); also **Remove corner** in the palette |
| Click a wall's middle grip, or anywhere on a wall line | adds a corner there (0.25 m along the wall); hovering a wall line shows where ("Click to add a corner") |
| Drag a wall's middle grip | **Push/pull** (default): the wall moves along its normal; neighbours that run along the normal stretch, others stay put and new return walls fill the gap. Outward adds a bay, inward carves a notch. **Alt** switches to **Move** (both neighbours stretch). The palette's Walls → Move makes Move the default and Alt the push/pull. |
| Ctrl while dragging (Alt for corners) | no snapping |

Snapping: 0.25 m grid; corners and pushed walls line up with other corners of this part and every other solid part (blue guide) and with the buildable plot edge (orange guide); a corner steps in 15° from either neighbour (yellow guide). A refused edit turns the ghost red with the reason in plain language: walls crossing, a wall folding back, a wall shorter than 0.5 m, leaving the buildable plot, fewer than three corners or more than 64. Releasing a refused drag saves nothing.

The palette keeps the earlier tools: Corners → **Bevel** / **Recess** and Walls → **Bay** behave as before (0.5 m snap, exposed walls only, block parts only).

**Inspector › Part › Outline** lists every wall with its length: type a length and press Enter (the next corner moves along the wall, the next wall stretches). Actions: **Straighten** (walls within 10° of the plot axes become exact and snap to the grid), **Square corners** (walls within 15° of the longest wall's direction or its perpendicular become square), **Simplify** (removes straight-through and nearly straight corners within 0.15 m, and walls shorter than 0.5 m), **Split at storey N** (see Per storey).

Every gesture and inspector action is one labelled undo step with the usual toast, sound and juice. When content had to go, the label says so, for example `Push out wall · removed 2 windows on the changed walls` or `Move corner · removed 1 furniture piece outside the new outline`; undo brings it back. While dragging, a warning label (`Will remove …`) previews the loss before release.

## Shapes

- **Boxes** become polygons on the first edit, with walls named `south`, `east`, `north`, `west` so every existing anchor keeps working.
- **Ovals** become their canonical bay-sized facets (8–32 walls, the same footprint and bay phase) on the first edit, with walls `edge:arc0…`. Content on the curved wall maps onto the facet under it; openings wider than their facet are removed and reported. Keeping an arc edge type was not done: the resolver and every facade system already treat oval walls as facets, so facets give the same look with real per-wall editing.
- **Cut-outs** (subtract parts) are not editable yet.
- **Unified / generated facades** regenerate on the new walls (facade rhythm fills new and changed walls automatically).

## Per storey

Outlines belong to parts; a part spans a storey range. **Split at storey N** (Outline section, for parts with more than one storey; N follows the storey rail) turns the storeys from N up into their own part with the same outline and style, then selects the part on the current storey. Kit anchors on those storeys, free openings and paint above the split (rebased), paint and rhythm rules scoped to the part (duplicated), variation part rules (duplicated) and roof openings/details (moved to the upper part) follow; free openings crossing the split are removed and reported. Each part's outline then edits alone; stacked parts drawn on a roof already work this way.

## Edge ids and migration

Polygon parts keep one id per wall (`edgeIds`). Rectangle side names stay; new walls get `edge:<6 random base-36 characters>`. An id belongs to one wall for its lifetime:

- inserting a corner: the first half keeps the id, the second half gets a new one;
- deleting corners: the merged wall keeps the id of its longest former wall;
- push/pull: the pushed wall keeps its id, return walls are new;
- moves, lengths, straighten and square keep all ids.

So untouched walls never change identity, and every anchor on them (openings, paint, rules, trims) stays exactly as it was. Old recipes need no migration: their rectangle side names and `edge:` ids are read as before, and a rectangle converts to the equivalent polygon with the same side names (bays and anchors resolve identically; covered by a unit test).

Straight-through corners (left by inserting a corner) are allowed in studio outlines. The union footprint drops such points, so `sculptWalls` splits walls at them to keep each source wall its own face (only studio outlines can have them).

## Filling the gaps: content re-fit

`refitOutlineContent` / `applyOutlineEdit` (`src/domain/cityStudioOutlineEdit.ts`) run on every outline edit, including during the drag for the detailed preview:

1. Walls whose endpoints did not move are **unchanged**: nothing on them is touched.
2. For an item on a changed (or removed) wall, its old centre point is projected onto the new walls. Candidates are the same wall (it may have turned) or a new wall running the same way (a split-off half, or the wall that absorbed a deleted one). The item is kept at its **absolute** position if it fits there; else at its **relative** position on its own wall (when the wall was stretched, not split); else **nudged** by at most its half width into the wall holding most of it (an opening straddling a new corner); else **removed** and counted.
3. Whole-wall choices follow the wall and a split: wall-scope tile paint, paint bands, paint rules scoped to walls, facade rhythm rules for a wall (and painted rhythm ranges by position), variation region rules. Oval whole-wall choices spread to every facet.
4. Kit tiles (manual openings, storefront stamps, decorations, legacy tile anchors, entrance attachments) are point anchors: they snap to the bay containing their new position; if their wall is gone they are removed. Decorations lose all their anchors together; a stair's exit anchor is dropped for re-routing.
5. Free openings use their width; their trims are pruned with them. Painted rectangles move with their centre and are clipped to the new wall.
6. Interiors on the part's storeys: furniture, inside stairs and room finishes that were inside the old footprint and are outside the new one are removed; interior walls are clipped to their longest inside run (removed below 1.25 m) and their doors re-parameterised or removed.
7. Generated rhythm openings are not stored, so they simply regenerate.

Roof openings and roof details keep their part-relative position; the roof resolver marks them inactive with a reason if the new roof no longer holds them.

## Limits and performance

| | corners | straight-through corners |
|---|---|---|
| Construction studio (`validateSculpt` default, `validateVariationRecipe(..., allowInterior=true)`) | 64 (`SCULPT_STUDIO_POLYGON_LIMIT`) | allowed |
| Business presets/profile (`validateVariationRecipe` without interiors, `validateModularDesign`, shared profile schema) | 12 (`SCULPT_BUSINESS_POLYGON_LIMIT`) | rejected |

The business path passes `SCULPT_BUSINESS_POLYGON_RULES` explicitly, so its behaviour is unchanged. The limit was chosen by measuring a worst case: a concave 64-corner zigzag star, 4 storeys, radius 9 m (node, warm, median of 10 full `resolveSculpt` calls, this machine):

| roof | 12 corners | 64 | 96 | 128 |
|---|---|---|---|---|
| flat, kit walls | 15 ms | 24–39 ms | 52 ms | 51 ms |
| flat, unified facade | 18–22 ms | 39–45 ms | 62 ms | 76 ms |
| hip, kit walls | 47 ms | 349 ms | 677 ms | 1177 ms |

Flat roofs over detailed concave outlines were dominated by per-triangle roof clipping; outlines with more than 12 corners (studio-only) under a single roof plane now keep one roof face (`cityStudioRoofEnvelope.ts`), which took the 64-corner flat case from about 160–225 ms to 24–45 ms. Pitched roofs over many concave corners still clip per triangle and grow super-linearly, so 64 is the limit: realistic outlines (a box with a few notches and bays, 10–30 corners) stay well under 100 ms per worker preparation, which runs off the main thread and is throttled during drags.

## Files

- `src/domain/citySculpt.ts`: polygon rules (`sculptPolygonProblem`, business/studio rule sets), straight-corner wall splitting.
- `src/domain/cityStudioOutline.ts`: shared refusal messages; bevel/recess use the studio limit.
- `src/domain/cityStudioOutlineEdit.ts`: editable outlines, corner/wall operations, tidy actions, per-storey split, content re-fit and removal summaries.
- `src/domain/cityVariationValidation.ts`, `src/features/city/CityVariationPanel.tsx`: business vs studio rules.
- `src/domain/cityStudioRoofEnvelope.ts`: single-plane roofs over detailed outlines.
- `src/features/city/studioOutlineSnap.ts`: grid, alignment, plot-edge and 15° snapping, corner angles.
- `src/features/city/useStudioInteraction.ts`: outline gestures, corner selection, Delete/Esc, `editOutline`.
- `src/features/city/studio/studioHandles.ts`, `StudioDragGhosts.tsx`, `StudioPalette.tsx`, `StudioInspector.tsx`, `studioStatus.tsx`, `useStudioState.ts`, `CityStudio.tsx`, `studioShell.css`: grips, ghost with labels and guides, palette modes and actions, inspector Outline section, split, telemetry.

## Verification

- `node --experimental-strip-types --test src/domain/cityStudioOutlineEdit.test.ts src/features/city/studioOutlineSnap.test.ts` (insert/delete/move corners, push/pull and move walls, lengths, stable ids, re-fit by absolute/relative/nudge and removal summaries, split walls, kit anchors, interiors, rectangle and oval migration, 64-corner and business 12-corner limits, straighten/square/simplify, unified facades, per-storey split; snapping).
- `scripts/city-studio-sculpt-browser.mjs`: draws a box, adds corners by grip and by wall line, drags a corner (live labels), a crossing drag refused in red, pushes a wall section with a return wall, the window on the untouched wall unchanged and the one on the pushed wall kept on it, Delete key, inspector wall list and numeric length, undo back to the drawn box. Screenshots `output/sculpt-box.png`, `sculpt-insert.png`, `sculpt-vertex-drag.png`, `sculpt-refused.png`, `sculpt-extrude.png`, `sculpt-after.png`, `sculpt-inspector.png`, `sculpt-undo.png`.
- The earlier `scripts/city-studio-outline-browser.mjs` (wall, recess and bay pulls) still passes with Push/pull as the default wall action.

## Known gaps

- Cut-out parts, arcs as true curved edges and free-form (non-straight) walls are not editable.
- Straighten and square are simple axis clamps; they can refuse (crossing) on very irregular outlines.
- Pitched roofs over outlines with many concave corners are slow to prepare (see Limits).
- Roof openings and details are not re-fitted (the roof resolver may mark them inactive).
- Touch: corner selection and push/pull work with a finger, but Shift multi-select and Alt/Ctrl modifiers need a keyboard; physical touch devices are unverified.

## Roofs on turned and reshaped parts

Turning a part bakes the turn into its outline, so roofs used to be built along the plot's X/Z axes from the outline's
axis-aligned bounding box: a part turned 45° kept a plot-aligned ridge sized to that box. Roofs now use the part's own
frame (`roofFrame` in `src/domain/cityStudioRoofEnvelope.ts`). Named walls travel with their edges, so the direction
of the south wall (or east/north/west, offset by quarter turns) gives the building's heading; outlines without named
walls use the smallest enclosing box, preferring the unturned frame on ties. Gable, hip, half-hip, gambrel, mansard,
lean-to and pyramid planes are written in that frame and turned back to plot space, and the ridge setting ("along
x/z") refers to the part's own axes. Unturned parts keep their original centre and size, so their roofs are
unchanged. A reshaped outline follows its south wall's direction, so tilting that wall also tilts the roof frame.
`cityStudioRoofs.test.ts` checks that a turned box gets the unturned roof turned (30°, 45°, 90°) with the same area.
