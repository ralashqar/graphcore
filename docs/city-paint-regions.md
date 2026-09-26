# Region painting on generated walls (step 3, local)

Walls owned by free openings (manual or facade-rhythm generated) are painted as regions in face metres
instead of kit tiles. Kit faces keep per-tile painting unchanged.

## Data

- `studio.paintRegions` (`cityStudioPaintRegions.ts`): `{id, shapeId, side, channel: 'wall'|'trim', rects, band?, finish}`.
  Rectangles are `[x0, x1, y0, y1]` in face metres (x as `faceX`, y above the part base); later regions paint over earlier ones.
- Validated by `validateStudio` (`validatePaintRegions`: ≤160 regions, ≤96 rects each, finite bounded rects, valid side,
  curated textures). Business profiles (`validateModularBuilding`) and business imports (`validateVariationRecipe`) reject the field.
- Helpers: `brushRect`, `addPaintStroke` (one region per stroke; dabs merged, coarse fallback when over budget), `paintBand`,
  `fillPaintFace` (replaces the face's regions of that channel with one full-height band), `erasePaintAt` (topmost, optional channel),
  `paintRegionAt`, `recolorPaintRegion`, `paintFinishAt`.

## Rendering (`cityStudioPaintGeometry.ts`, worker)

- `studioFacePaint` (`cityStudioFreeFaces.ts`) builds the layers per owned face: legacy tile paint first, then `paintRegions`.
  The face base finish is now the part finish (defaults + part), not the ground-floor bay.
- **Legacy tile paint:** each owned bay whose resolved wall/trim finish (spot and wall surfaces) differs from the part finish becomes
  its face rectangle, so existing paint survives a face turning generated. Legacy trim layers keep tinting the painted style only.
- `paintPartition` sweeps the layers into horizontal strips of runs (one finish per run); no polygon booleans.
- The builder triangulates each outer-skin polygon once and `splitPaintedTriangles` clips triangles to the runs they overlap
  (axis-aligned Sutherland–Hodgman), with fast paths for triangles under a single finish. Pieces go to one buffer per finish
  (`geometry.wallPaint`); the opening distance is interpolated from the original triangle, so wear matches an unpainted wall.
- Caps are split where they cross region edges; caps and reveals take the topmost region at their midpoint. The inner skin stays base.
- Trim regions tint surrounds, sills and mullions of the openings they touch (painted vertex colours).
- `cityStudioDetailBatches.ts` routes each painted piece into the wall batch of its finish (same wear attribute, drawn near and far).

## Paint tool (`useStudioInteraction.ts`, `CityStudio.tsx`, `studioPaintRegionTool.ts`)

- Hovering an owned wall shows a brush cursor (moved without React renders) instead of tile highlights.
- **Brush · free walls:** Small 0.5 m, Medium 1 m, Large 2 m (shown when the building has generated walls). Dabs snap to a quarter
  brush and merge per stroke; one undo step per stroke; live preview through `setSculptPreview` every 120 ms.
- **Fill wall:** one full-face region. **Band:** drag up or down for a full-width band (plinth, string course); dragging past the base clamps.
- **Sample finish** reads the topmost region (or the legacy/base finish). **Restore tile** removes the topmost region of the current
  channel under the pointer, falling back to legacy tile paint.
- **Quick paint ring (C):** recolours the region under the pointer, or fills the face when none.
- Channels frame/door and **Fill part** keep their existing behaviour on owned faces.

## Verification

- `node --experimental-strip-types --test src/domain/cityStudioPaintGeometry.test.ts src/domain/cityStudioPaintRegions.test.ts`
- `node scripts/city-studio-paint-regions-browser.mjs` (and `CITY_BACKEND=webgl`): fill, stroke, band, trim, sample, restore,
  undo, quick ring, reload. Screenshots `output/city-studio-paint-regions*.png`.

## Limits

- Regions on a face that stops being owned stay stored but are not drawn (kit tiles use tile paint).
- Paint follows face metres; resizing a part keeps regions where they are (bands always span the face).
- Every distinct finish adds one wall batch (one draw call) per building.
- T-junctions between adjacent pieces are coplanar and share exact clip coordinates along run edges; no cracks were visible in
  screenshots, but they are not welded.
