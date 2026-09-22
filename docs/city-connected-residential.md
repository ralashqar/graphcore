# Connected residential architecture

## Availability and saved design

The Residential category adds Garden bungalow, Gabled cottage, Detached family house, Terraced townhouse, Modern suburban house, Courtyard villa, Farmhouse and Small apartment house. They opt into version-3 recipe revision `city-connected-3`. Existing designs keep `city-grammar-1` or `city-shell-2` until the explicit upgrade action. Selecting a residential preset is one undoable action and keeps identity, palette and advertising choices.

Optional `connectedArchitecture` stores opening layout; pitch, overhang and ridge direction; porch and support style; dormer count/style; shutters, window boxes, chimney, gutters and balconies. Server validation bounds these values and rejects them on older revisions. Derived surfaces, connection geometry and reservations are never persisted. No database migration, provider or authentication changes.

## Geometry and ownership

The connected roof resolver creates planar surface regions for gable, hip, shed, mansard and flat profiles. It clips overlapping roof ownership and upper-wall footprints, creates closed roof deck cells, and combines generated meshes by material role. Gable infill sits on the actual wall plane rather than the overhang. Exterior trim follows the roof boundary. Nearby gutters and downpipes are restricted to real footprint corners.

Dormers reserve rectangles within a single sloped roof face, subtract those areas from the roof, and provide cheek walls, glazing and a separate roof. Invalid attachments retain their choice and report a reason. This is a bounded orthogonal exterior generator, not a general CAD kernel.

Residential openings use fixed window dimensions and sill height. Doors reserve their existing aperture first. Shutters require neighbouring wall clearance; sills, lintels and window boxes derive from the selected opening. Upper-front balconies replace a suitable window aperture with taller access glazing. Their slabs and rails are procedural exterior representations, not navigable interiors.

Porches share one roof/post/ledger/step layout. The entrance sign mounts on the new porch beam; other sign conflicts disable the porch with a reason. Side porches conflict-check exterior stairs. Courtyard porches require a multi-wing footprint. Blueprint view includes roof surfaces, openings, porch envelopes and supports.

Residential openings currently own their procedural facade in both display modes: native facade selections are retained with an explanation rather than stretching modules or layering duplicate native doors. Existing commercial Quaternius finishes remain available; native roof ownership is explicitly explained when it disables procedural roof controls. New residential native wall replacements are not claimed as implemented.

## Rendering

Generated mesh geometry is pooled by shape identity, instanced, and disposed when unused. Roof and wall-infill triangles are consolidated by material. City worker preparation and recipe caches are reused. Nearby connected-revision editor previews retain procedural detail in light mode; city medium detail removes small residential mullions/trim, while preserving roof, porch and balcony forms. Earlier revision light-mode preview detail is unchanged.

## Verification and rollout

35 focused geometry/regression tests and 18 typed Deno schema tests pass. Browser tests cover eight rendered presets, connected controls, mocked save/reload, undo, mobile layout and full-detail fallback. Preset thumbnails are rendered from the editor, without AI generation. Hosted publication has not been verified by these mocked tests.

The actual shared import path remains world-generation/main -> city-campus-worker -> city.ts -> city-building-design-schema. Deploy frontend, city-api, city-command, city-reconcile, city-building-art and city-stripe-webhook together with world worker `2026-09-22-city-design-3.17` to designated staging. No staging identifier is currently supplied; no deployment, production activation or new spending has been performed.

Physical mobile testing remains outstanding. Desktop mobile viewport measurements are not physical mobile acceptance. Performance evidence is recorded below after the final controlled local comparison.

## Reference

Independently implemented architectural ideas informed by Pascal editor commit `5ce72119d4b781c54f3fc96d5f3294b808cc78e5`: roof-segment, dormer, lean-to-extension, column and roof intersection tests. No Pascal asset bundle, runtime or code was imported.


## Final local performance comparison

September 22, Windows Chromium headless, ANGLE Intel UHD Graphics 0x00009BC4 / D3D11, development server 5188, default light mode. Same benchmark and camera, 400 properties, preparation warm-up then 10 seconds of frame sampling. Baseline uses existing commercial v3 recipes; mixed fixture replaces half with all eight residential presets. Architectural families and finish choices remain mixed. These are fixture comparisons rather than identical-scene timing guarantees.

| View | Baseline | Residential mix |
|---|---:|---:|
| Desktop p95 frame time | 33.4 ms | 33.3 ms |
| Desktop FPS | 49.4 | 54.2 |
| Desktop draw calls | 23 | 38 |
| Desktop triangles | 600,154 | 544,230 |
| Desktop JS heap | 435 MB | 410 MB |
| Mobile viewport p95 | 16.7 ms | 16.7 ms |
| Mobile viewport triangles | 253,354 | 224,986 |
| Mobile viewport JS heap | 269 MB | 254 MB |

The final measured p95 stays within the 10% target on this setup. Increased roof geometry variety adds draw calls; removing small residential details at city distance lowers triangle count. Zoom streaming assertions passed. Evidence: output/city-connected-stable-baseline.log and output/city-connected-stable-mixed.log. Earlier runs during thumbnail generation or hot reload are excluded. No physical mobile or hosted performance acceptance is claimed.
