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

## Grounds and Quaternius detail choices - 21 September 2026

Optional v3 choices add low stone/brick walls or railings with fixed open gateposts, plus checker, terracotta, basalt and ribbon paving. Boundaries sit outside the largest supported footprint and forecourt slots, inside the tile; the 4.4 m opening aligns with the entrance path under rotation. Paving stays below the path and foundation. Small paving/railing details drop at far LOD and reuse the existing box batches.

Curated matching, brick, white-brick, marble and metal sets use existing CC0 pack assets. Placement is all compatible areas, entrance only or roofline only. Accents use entrances/cornices; facade mode also uses upper-wall modules. Native window widths follow their 2 m/4 m family; structural masses and brand palette remain unchanged. Pitched roofs omit cornices and ribbon facades retain procedural glazing. Procedural mode disables native details. No new asset download or texture is introduced.

Fields enclosure, pavingPattern, detailSet and detailScope are optional strict enums shared by client and server. Omitted fields preserve older recipes. No migration is needed. Local geometry, Deno profile validation, affected endpoint/campus checks, browser mocked save/reload, TypeScript, build and dev-runtime verification cover the release. Hosted saving of the new fields requires the matching five City endpoints and world worker 2026-09-21-city-design-3.1 to be deployed with the frontend. Designated isolated staging is still unavailable, so no hosted rollout or production activation was performed.

## Small business and civic buildings - 21 September 2026

The gallery now has 14 complete presets: the original six plus Terrace cafe, Gabled cafe, Village shop, Canopy kiosk, Gabled kiosk, City museum, Civic bank and Boutique hotel. Rectangular v3 buildings may use 8 m width/depth; other footprints retain their existing minimums, and legacy schemas are unchanged. Preset-specific attachment overrides now apply, including no-canopy variants.

Optional entranceStyle adds a wide storefront canopy or a bounded columned portico, optionally with a front-facing pediment. Columns and pediments are low-poly instanced primitives. The portico has steps, a clear central route and a front-beam sign. It is inactive when the footprint/forecourt cannot fit; its choice persists. Attachment clearances include the entrance structure. Round columns use 12 sides; the pediment reuses the outward-wound roof prism rotated to face the entrance. No textures, assets or providers are added.

Tests cover compact dimensions, roof variants, preset bounds, open column spacing, inactive/restored porticos, shared schema, all preset browser previews and existing save/reload/mobile/fallback flows. TypeScript, build, dev runtime, six Deno tests and 19 geometry tests verify this change. Matching five City endpoints, frontend and profile-consuming world worker 2026-09-21-city-design-3.2 remain pending designated isolated staging; hosted activation and provider spending are excluded.


## Distinct archetypes and roof compositions (2026-09-21)

Optional v3 archetype, massing and roofVariant choices deepen the existing presets without altering recipes that omit them. Cafes add bounded seating, shops add frontage fascia and entry jambs, kiosks add serving counters, museums use a supported central hall and lower side wings, banks gain a four-column entrance, and hotels use a supported canopy and penthouse. Branding remains intact when applying presets.

Rectangular buildings support hip roofs; cafe/shop/kiosk designs also support shed roofs, and museums support sawtooth roofs. Hall-and-wings massing requires at least 12 by 10 metres and excludes the legacy gabled roof. Incompatible sign/terrace slots remain inactive with their selections retained. Closed roof geometry has outward-facing normals and reuses instanced batches.

The grouped preset gallery uses 14 locally rendered WebP previews (approximately 66 KB combined). Regenerate using CITY_PRESET_THUMBNAILS=1 and CITY_TEST_ORIGIN pointing at the local dev server with scripts/city-design-browser.mjs. No provider or paid generation is involved.

Verification: 23 geometry tests and 7 shared schema tests passed; TypeScript and all five affected City Edge entries plus campus-worker Deno checks passed. Browser save/reload uses the existing mocked API fixture, not hosted publication. An initial browser run encountered the previously observed intermittent R3F canvas-mount null-event-target error; repeat-run results are recorded with release verification. Physical-mobile and new 400-property benchmarks were not performed for this extension.

Rollout remains pending designated isolated staging. Deploy matching City endpoints, frontend and shared-profile-consuming world worker (city-design-3.3) together; no production activation, migration or provider spending is included.

Repeat browser verification passed: live presets, grouped rendered previews, compatible roof controls, blueprint, mocked save/reload, mobile layout and city rendering, with no page errors on that run. The intermittent first-run canvas mount issue remains a known limitation.

Production build passed; existing large-chunk and missing landing-atlas warnings remain. Fresh Vite startup and runtime checks completed; existing public-office-manifest import warnings remain.


## Customised demo city (2026-09-21)

The default demo now uses complete v3 presets with deterministic per-business variation: dimensions, floor counts, architectural family, compatible roofs, Quaternius finishes, grounds, paving and boundary styles. All fourteen presets occur across the city; identities and paid plot ordering remain unchanged. Explicit illustrated, corporate, empty and office modes remain available in the View selector. No merchant designs or server contracts are changed.

The customised demo uses the preview's warm sunlight, hemisphere sky/ground fill and cool secondary light, with matching haze colour. Existing roads, streaming, instancing and shadow controls remain; mobile/software renderers keep shadows disabled. A 400-design deterministic/bounds test passes. Browser evidence is generated by scripts/city-preset-demo-browser.mjs using CITY_TEST_ORIGIN. This is frontend-only and needs no Edge/Fly deployment or provider spending.

TypeScript passed. D3D11 browser verification rendered 72 residents and completed right-drag navigation without page errors. Software rendering displayed the initial scene but timed out capturing the post-pan screenshot; physical-mobile performance remains unverified. Fresh Vite started with the existing public-office-manifest warning.

Production build passed with existing landing-atlas and chunk-size warnings.


## Reliable modular facade coverage (2026-09-21)

V3 facade mode now assembles native wall/window modules on all eligible floors and elevations, including ground floors and ribbon patterns. Accent scope controls entrances rather than disabling facade coverage. Modules use a uniform family scale, whole bays and balanced plain corner fillers; door/sign reservations remain clear. Plain modules fill alternating/plinth bays. Tiles sit forward of the closed structural shell and above floor slabs.

Oversized open source cornice strips are no longer placed along V3 roof edges; closed procedural parapets and floor bands provide restrained solid trim. This fixes the visible open-ended crown pieces without double-sided material workarounds. V1/V2 geometry remains unchanged.

Native facade tiles persist at medium detail; small accents remain near-only. Per-asset fallback keeps other valid assets visible if one module is missing, and missing packs leave procedural windows intact. No asset export, schema, provider or migration changes. Shared validators still import the renderer module, but no server contract/execution behavior changes; this is a frontend rendering correction.

Verification: 19 focused geometry tests, seven Deno schema tests, TypeScript and the mocked save/reload/mobile/failed-pack browser suite passed. Four native facade families were rendered and visually reviewed on the same office preset. Physical-mobile and 400-property frame-time benchmarking remain unverified for the wider medium-detail native coverage.

The 72-property customised demo also rendered and panned without browser page errors. All 14 preset thumbnails were regenerated; procedural preset defaults produced unchanged preview files.

Production build passed with the existing landing-atlas and chunk-size warnings.


## Stable whole-building streaming (2026-09-21)

Building detail is chosen on entry and retained for that residency. Camera panning no longer reranks existing residents into different component sets. Full eviction clears the detail choice; re-entry uses the existing shared property arrival timestamp. This intentionally trades immediate in-place LOD changes for stable silhouettes and facades. Explicit recipe edits still regenerate the building.

Instance batches no longer interpolate individual component poses, which were keyed by generated indices and could become different components after detail changes. All matrices and bounds are initialized in layout effects before painting newly allocated instance buffers. Explicit whole-property market motion and shared arrival scaling remain; reduced motion still bypasses both.

Streaming residency and arrival tests cover stable detail, eviction and bounded overshoot. Browser verification compares retained instance sets and matrices while right-dragging the full demo city. No server contract, deployment pairing or provider changes.

Verification: seven streaming/market tests passed. The D3D11 browser retained identical component sets and 15,837 identical instance transforms across a pan, with no page errors. The twelve-property near-detail budget is reserved by current residents, preventing detail growth during travel. Physical-mobile performance remains unverified.

Production build and fresh dev-runtime checks passed with the existing landing-atlas, public-office-manifest and large-chunk warnings.
