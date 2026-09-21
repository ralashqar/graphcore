# Composable City buildings (v3)

## Business experience

The 3D designer now offers six complete compositions: Retail flagship, Glass headquarters, Brick creative studio, Stepped garden office, Courtyard workspace and Corner showroom. Applying a composition is one undoable edit and preserves uploaded branding and the current palette. Shape controls retain office/stepped/courtyard/L-shaped footprints. Architecture exposes a collapsible floor stack: one storefront/lobby/plinth base, 0–7 middle floors and an optional recessed/penthouse/terrace crown, capped at eight total floors. Crown setback is 0.5–2 m. Penthouse walls use glass; terrace crowns receive a planted roof treatment.

Vertical, ribbon and alternating façade rhythms reserve whole bays for entrances and selected signs. Middle-floor variation stays aligned vertically. V3 clips upper-floor rectangles against the actual supporting union below; V1/V2 output remains unchanged. Convex/concave/end classification controls restrained procedural corner posts. Native corner blocks are not forced into tight bays; Quaternius wall/window/cornice pieces are used where their uniform-size layout fits. Ribbon façades retain procedural glazing with native trim.

Attachment slots can be selected in the 3D preview or blueprint, and edited in Branding/Grounds. Available roles: entrance/façade/roof primary sign, one side campaign panel, entrance canopy, paired forecourt planter/bollard groups and paired roof planters. There is exactly one selected primary sign and at most one campaign panel. Slots report world-space position, orientation, dimensions, compatibility, selection, eligibility and an explanation. Unsupported, colliding or out-of-bounds selections remain saved but inactive; no silent relocation occurs. Blueprint rectangles show reserved attachment space. Larger free-standing billboards and arbitrary transforms are not included.

Vary façade and Vary grounds use independent deterministic seeds. A business ID seeds a new design; a session-stored UUID seeds an unsaved business and survives switching artwork modes/reloads in that browser session. Full grounds density adds a bounded shrub cluster. Shape, floor count and branding remain untouched by variation actions.

Preview orbit/fixed/blueprint views retain one WebGL canvas, avoiding asynchronous event-connection races during rapid view switching. Reset camera updates controls instead of remounting the renderer. Existing image-art mode remains separate and takes precedence in the City until explicitly replaced in the draft.

## Recipe and runtime

`buildingDesign.version: 3` extends the bounded V2 recipe with:

- `generatorRevision: city-grammar-1`
- `base`, `middleFloors`, `rhythm`, `crown`, `crownSetback`
- `facadeSeed`, `groundsSeed`, `density`
- `slots`: a partial map from the fixed slot ID catalogue to an allowed component or null

`floors` must equal one base plus middle floors plus an optional crown, and remain at most eight. Existing dimensions/palette/roof constraints remain. Server validation rejects unknown slots/components, incompatible pairs, duplicate primary signs and unsupported generator revisions. Geometrically inactive but otherwise legitimate selections are accepted so they can reactivate after a later edit. V1/V2 designs require explicit Upgrade design and can be restored with undo. Existing owner/revision checks, draft persistence and publication review remain authoritative; no database migration is needed.

The shared pure resolver drives preview and city. It emits masses, exposed walls, corners, primitive parts, curated attachments, resolved slots and primary/campaign signs. Geometry is calculated on recipe/LOD changes, not in frame callbacks. Primitive and native geometry/material batches retain selection, dimming, arrival and paid-market displacement behavior. Near-detail remains capped at 12 properties; medium/far LOD removes small details while retaining the supported silhouette, roof and primary branding.

The catalogue exporter and manifest now record attachment type, clearance size and near-detail eligibility. No external kit or new dependency is added. BuildingGeneratorThreeJS informed the architectural approach; no third-party source or model was copied. The existing Quaternius CC0 kit remains the native component source.

Signs share one atlas and draw. V3 allows up to two signs per property, so the atlas is 2048×2048 (16 MiB uncompressed RGBA before mipmaps, versus 8 MiB for V2). No atlas is allocated for a scene containing only V1/image/legacy properties. V3 logo/banner drawing compensates for each physical sign's aspect ratio. Campaign panels use the published business billboard/hero/logo and current offer title; no codes or invented stock/activity are rendered. Expiry schedules an atlas refresh and falls back to business branding. Draft previews use draft content; publication still uses the existing review boundary.

## Verification and performance

Geometry tests cover all six compositions across all supported footprints/finishes and dimension/floor extremes, upper-floor support, bounds, slot collisions, corner classification, inactive selection restoration, independent seeds and frozen V1/V2 geometry output. Deno tests cover all recipe versions, bounded floor stacks, slot allowlists and primary-sign limits. Browser fixtures cover presets, stack editing, clickable slots, save/reload, undo/redo, legacy upgrades, failed assets, responsive layout and City spatial selection. Hosted persistence/publication is not represented by those mocked API tests.

The existing navigation regression covers repeated held pan, zoom, blur recovery, central reset and reduced motion. AI-artwork regression uses mocked generation with no provider spend. Thirteen geometry tests and four Deno contract tests pass. TypeScript, City Edge/campus checks, production build and fresh dev startup pass. The fresh-session browser check also covers all six composition buttons, roof-slot deactivation/reactivation and campaign-panel selection.

400-property comparison on the same Windows desktop GPU/Chromium fixture, mixing four families and three finishes:

| Scene | Draw calls | Triangles | p95 rAF ms | FPS | Coarse JS heap MB |
| --- | ---: | ---: | ---: | ---: | ---: |
| V2 desktop | 62 | 920,791 | 16.8 | 59.22 | 177 |
| V3 desktop | 60 | 894,483 | 16.8 | 60.03 | 177 |
| V2 mobile viewport | 68 | 868,106 | 16.7 | 60.02 | 148 |
| V3 mobile viewport | 66 | 841,090 | 16.8 | 60.04 | 148 |

V3 meets the <=10% p95 regression target in this test. Streaming reduced residents from 302 to 116 desktop, and 222 to 103 mobile viewport after zoom. Mobile viewport uses desktop hardware, not a physical mobile device. rAF timing does not measure GPU frame time directly; coarse heap is not total/GPU memory. Benchmark artifacts: `output/playwright/city-design-benchmark-2.json` and `-3.json`. Reproduce with `CITY_DESIGN_VERSION=3 CITY_TEST_ORIGIN=http://localhost:5183 node --experimental-strip-types scripts/city-design-benchmark.mjs` (set environment variables using the shell's syntax).

## Rollout

Pair city-api, city-command, city-building-art, city-reconcile, city-stripe-webhook, matching frontend and the world-generation Fly worker (`2026-09-21-city-design-3`) on isolated staging. The campus worker imports the profile parser; unrelated workers do not require deployment. No migration, paid generation or production activation is part of this release.

The designated isolated staging identifiers have not been supplied. Hosted save/publication, staged worker image validation and a documented physical-mobile performance run remain release gates. Do not substitute the shared production project. The existing broader world-worker check with the City Edge configuration has unrelated dependency/type failures; the changed City/campus import path is checked independently. Existing office-manifest dev warnings and landing-atlas/chunk-size build warnings are tracked separately.

## Surface correction � 21 September 2026

The shared editor/city pitched-roof prism now uses outward triangle winding on both slopes, both gables and its underside. It remains a closed, front-sided mesh; double-sided materials are not used to conceal invalid normals. A regression test verifies outward normals, nondegenerate triangles and paired opposite edges.

Version-2 and version-3 wall shells now stop at the inner faces of their 18 cm floor and ceiling slabs. Previously the slab sides and wall sides occupied the same plane over these bands, producing depth fighting during camera movement. The recipe, silhouette, window placement and floor heights are unchanged. The version-2 geometry snapshot intentionally incorporates this visual bug fix; version-1 output remains frozen.

Verification: 15 local geometry tests, four Deno recipe/profile tests, TypeScript, production build and fresh development-server browser checks. The browser fixture covers presets, pitched-roof preview, save/reload, mobile layout, city rendering and missing-pack fallback using mocked APIs. Native fa�ade position/normal inspection confirmed no forward-facing surfaces on their zero-depth backing plane. No provider calls, database changes or hosted deployments are required for this visual correction.

## Unified presets - 21 September 2026

The editor now has Presets, Branding and Grounds sections. Presets contains the six complete compositions, followed by footprint, dimension, floor-stack and facade controls for fine-tuning. The older shape preset cards are removed: changing the footprint now changes only that choice (subject to existing geometry compatibility rules), without resetting floors or crown. Applying a complete composition remains one undoable action and retains business identity and palette. Saved recipe contracts are unchanged.

## Preview environment - 21 September 2026

The live editor frames the plot with a procedural street loop, lane markings, kerbs and grass fading into atmospheric haze. A CSS sky gradient sits behind the transparent canvas. Warm directional sunlight, cool hemisphere/fill light and one bounded 1024px shadow map replace flat ambient lighting. Four merged environment meshes require no texture downloads. Demand rendering and capped DPR remain enabled; the full city renderer and saved building recipes are unchanged. Desktop/mobile browser fixtures, TypeScript and the production build verify the preview change.

One repeat browser run reported an intermittent R3F null event-target/addEventListener error during canvas lifecycle changes; the initial and final repeat runs passed with no page errors. The race is not claimed fixed by this visual change.

## Presets own footprint - 21 September 2026

The independent fine-tuning footprint selector is removed. All four supported shapes already exist in the complete preset gallery, whose cards now label their footprint. Shape changes require choosing a complete preset; fine-tuning retains dimensions, floor stack, finishes and details. This supersedes the earlier independent footprint control described above. No saved recipes are modified.
