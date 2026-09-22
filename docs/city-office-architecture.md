# Connected office architecture

## Local implementation — September 22, 2026

Six opt-in compositions use the `city-office-4` revision within the existing v3 JSON recipe: Twin-Tower HQ, Round Tower, Elliptical HQ, Rounded Office, Art Deco Setback Tower and Atrium Campus. Existing revisions keep their original resolver. The shared editor/city resolver, background preparation, cached geometry and instanced rendering are reused.

`officeArchitecture` stores bridge storey, tower separation, shorter-tower difference and a curated visual character. The editor exposes these beside dimensions/floor count, retains undo and the owner/revision checked draft flow, and displays matching preview thumbnails. Demo selection includes all six. No database migration or external assets are needed.

## Geometry and boundaries

- Twin towers share a ground lobby. A bridge storey is a single concave perimeter with continuous floor and ceiling decks; internal end walls are absent at both connections. A bridge is unavailable when either tower does not reach its selected storey. Its authored selection is retained, with a reason, and becomes active when valid again.
- Circular/elliptical outlines use equal arc-length samples, bounded to 16–40 panels. Windows are rigid recessed panes aligned with each panel; they are not stretched around curves. Rounded offices combine straight sides with faceted corner arcs.
- Wall junctions use shared inward mitres, and all generated wall strips and roof decks have closed solid cross-sections with outward winding. Front ground-floor bays reserve a fitted entrance and signage band.
- Art Deco towers step inward every two storeys. Atrium campuses have two upper wings around a glazed lobby roof. Geometry is visual exterior architecture, not engineering certification or a walkable interior.
- Wall/trim/roof geometry is merged by material role and cached; glass and remaining repeated boxes use existing instancing. Medium distance removes fine mullions. No per-frame geometry generation or new mount animation.

## Explicit compatibility limits

This release implements the recommended first six presets. Curves are faceted, not true curved glass. Native Quaternius replacement panels, custom door kits, extra ad positions, exterior stairs and legacy roof assemblies do not fit these envelopes yet. Saved choices are retained; unavailable controls are disabled with an explanation. The integrated entrance brand sign, colours, textures, plot paving and perimeter fencing remain supported. Legacy presets retain their broader kit controls.

Skybridges connect towers within one plot only. There is no cross-property bridge, new paid geography, unbounded polygon editor, simulation or interior circulation. Arcades, convention halls, station roofs and advanced structural-frame presets remain later extensions.

## Verification and rollout

Local checks include six rendered previews, bridge controls, mocked draft save/reload, undo, mobile viewport layout, bounded deterministic geometry at width/depth/floor extremes, arc spacing, bridge invalidation/restoration, legacy geometry regressions and strict shared-schema tests. Browser screenshots are in `output/playwright/office-*.png`. Hosted save/publication and physical mobile testing are not claimed.

The changed profile schema executes through city-campus-worker → city.ts → city-building-design-schema in the world worker. Matching frontend, City API/command/reconcile/building-art/Stripe webhook and world worker `2026-09-22-city-design-3.18` require designated staging rollout together. Staging is still unspecified; nothing was deployed. No production activation, paid generation or provider spending.

## Final performance comparison

Windows Chromium, Intel UHD Graphics 0x00009BC4 / ANGLE D3D11, development server 5188, default light mode. Sequential runs after build/thumbnail work stopped. 400 properties, same camera and sampling script; mixed fixture replaces half of baseline properties with the six office presets. This is a fixture comparison, not identical-scene hardware certification.

| Metric | Baseline | Office mix after LOD optimization |
|---|---:|---:|
| Desktop p95 | 49.9 ms | 50.0 ms |
| Desktop FPS | 46.6 | 46.1 |
| Desktop triangles | 600,154 | 565,106 |
| Desktop calls | 23 | 46 |
| Desktop JS heap | 462 MB | 254 MB |
| Mobile viewport p95 | 16.8 ms | 16.7 ms |
| Mobile viewport triangles | 253,354 | 235,314 |
| Mobile viewport JS heap | 269 MB | 212 MB |

The initial detailed city representation measured 83.3 ms p95 and 927,302 triangles. The accepted medium representation keeps a closed envelope and uses thin glazing panels instead of individual aperture returns; near/editor views retain real recessed openings. Geometry batching remains per shared shape/material. The final p95 regression is within the 10% target on this setup. Streaming/zoom assertions passed. Mobile viewport runs use the desktop GPU and are not physical-device acceptance.

Evidence: `output/city-office-baseline.log`, `output/city-office-mixed.log` (initial), and `output/city-office-optimized.log` (final).

Final local verification passed: focused geometry/regression checks plus closed-edge/outward-volume and distinct-character tests; 19 typed shared-schema tests; browser preset/control/mock-save/reload/undo/mobile-layout checks; TypeScript; production build and final bundle refresh; dev-server startup and runtime previews. The six final thumbnails were regenerated from the shared renderer. The default bridge sits near the front for city-camera visibility. Tiny wall returns stay solid rather than receiving compressed sliver windows. Existing unrelated uncommitted work is preserved.
