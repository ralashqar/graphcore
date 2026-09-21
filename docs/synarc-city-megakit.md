# Synarc City: Downtown MegaKit

## Source and intended appearance

Quaternius Downtown City MegaKit Standard supplies the roads, pavements, façade bays, roofs, doors and street furniture. The inspected download contains 153 glTF files, three complete buildings and 29 PNG textures; all external references resolve. Its included licence identifies the assets as CC0. The download itself is unchanged.

The implementation vendors 25 selected models and their required dependencies under `assets/city/megakit/source`, with the original licence and SHA-256 source inventory. Complete sample buildings are excluded: their 18,344–45,122 triangles and fixed sizes make them less suitable for the ranked skyline. The runtime uses reviewed modular assemblies instead. The Standard edition does not supply the richer engine-specific fake-interior shaders advertised for other editions.

Visual direction is a refined downtown: textured brick and dark metal, restrained window treatments, roof cornices, real entrance openings, modest brand-colour signs, planted setbacks and a pedestrian plaza. Decorative trees supplement the kit's planters. The selected property's logo appears on its frontage where supplied.

## Layout contract

All rendering uses metres. Plots are 24 × 24 m, grouped 2 × 2 inside 48 m blocks. Road centre lines are 66 m apart. The 18 m road corridors contain 12 m carriageways and 3 m pavements. Each plot faces its nearer east/west street; entrance paths connect its door to that pavement.

`plotAxis` maps logical coordinates to signed pairs: 21, 45, 87, 111 metres and so on. `logicalAxis` handles camera-to-region queries. Both camera navigation and building placement use these functions. Database plot IDs, coordinates, ranking, purchase rules and the 400-plot initial capacity remain unchanged. Half-filled expansion blocks receive landscaped reserved spaces until the next ring fills them.

The road graph uses the supplied crossroads internally, T-junctions on its boundary and rotated curves at its four corners. Eight 6 m straight segments connect adjacent 18 m junction bodies. At the origin, an 18 m paved plaza replaces the crossroads; bollards mark pedestrian space. Roads remain connected around it. Expanding capacity retains interior roads and replaces old perimeter junctions as necessary.

Junction crosswalk decals project beyond their 18 m physical bodies. The connector manifest therefore uses pavement/road edges, not aggregate bounds. Four-lane curve sockets are `(0, 0, 9)` and `(9, 0, 0)` relative to the native corner pivot. Two-lane assets are catalogued but not mixed into the four-lane network.

## Assembly and rendering

Each of six paid tiers has brick and metal variants, chosen deterministically from business identity. Tier floor counts are 1, 1, 2, 4, 7 and 10. Main façade footprints are 4×4, 8×8, 12×10, 12×12, 12×12 and 14×14 m. The landmark uses a 14 m core inside its 16 m maximum envelope, allowing ornament clearance; its top two floors step inward. All complete bounds stay within 16×16 m, preserving at least 4 m setback.

The Blender recipe places 2 m façade bays with 3 m floor heights, including source ground-floor windows, doors with jambs/header, upper windows, roof tiles, cornices and bounded rooftop plant. Corners meet without stretching façade bays. Closed roof terraces cover the landmark setback. Each detailed assembly has a distant counterpart retaining footprint, individual windows, storeys and crown silhouette.

The build exports 24 building assets plus ten infrastructure/prop assets. glTF Transform deduplicates, welds, conservatively simplifies with locked borders, and applies Meshopt compression with 16-bit positions. WebP textures are bounded to 1024 px; unused normal/ORM maps and vertex layers are removed because runtime materials use Lambert shading. The complete kit is embedded in one GLB; no decoder CDN is required. Quantized positions are expanded before node transforms are baked into runtime geometry.

Rendering instances each shared geometry/material. Detailed buildings are selected by projected height near the camera target, with the selected property always detailed. Other buildings use distant assemblies. Nearby blocks carry trees and planters. Scene geometry is culled around the current region; zoom-out is bounded to keep that region covering the view. Static shadow maps refresh on placement changes. Camera, labels, signs and rank transitions use the same world layout.

## Regeneration

Requirements: Node dependencies from `npm ci`, Blender 5.0, and Python with Pillow (verified with Pillow 10.3).

```text
npm run build:city:kit
npm run test:city:kit
```

The build uses committed source dependencies by default. Set `CITY_MEGAKIT_SOURCE` to a downloaded pack directory only when deliberately refreshing the source inventory. `BLENDER_BIN` and `PYTHON_BIN` override executable locations. Intermediate glTF/PNG files go to ignored `output/city-kit`; only the compressed GLB and manifest go to `public/city/downtown`. The original procedural kit remains available in history and is not loaded by the new scene.

`npm run test:city:kit` checks coordinate round trips, frontage, all connected road sockets, expansion stability, decompressed glTF validation and building bounds. `node scripts/city-kit-browser.mjs` exercises real wheel/drag controls and captures close-up/panned views; `npm run test:city:browser` covers public and business-flow regressions. Browser evidence is stored under ignored `output/playwright`.

## Acceptance limits

Local verification on 20 September 2026:

- A complete `npm run build:city:kit` regeneration produced byte-identical runtime output. Source hashes are verified, and Git preserves vendored source bytes across platforms. Production-preview close-up and navigation checks also passed without browser errors.

- Compressed runtime GLB: 9,203,880 bytes, seven shared embedded textures, fourteen materials. All 24 building detail-level exports pass bounds checks and decompressed Khronos glTF validation with zero errors.
- Layout tests pass coordinate round trips, frontage, socket pairing for the entire road network and expansion stability.
- `npx tsc --noEmit`, `npm run build`, dev-server startup, public/browser fallback checks, the mocked business onboarding/payment-handoff flow, and close-up/drag/return-to-plaza checks pass. The existing full-app landing-atlas and large-chunk build warnings remain.
- The occupied 400-plot API fixture averaged 60.09 FPS over ten seconds on Intel UHD Direct3D11 (1440×960), with 96 draw calls and 890,958 triangles. A 390×844, DPR-2 viewport on the same desktop GPU averaged 60.10 FPS; this is not a physical-phone result.
- The 2,000-business demo averaged 60.36 FPS over 2.50 seconds on the same GPU, with 88 draw calls and 1,119,902 triangles. The close-up navigation sample used 102 draw calls. These are local rendering samples, not hosted load tests.

Reproduce the 400-business fixture benchmark with `node --experimental-strip-types scripts/city-kit-benchmark.mjs`. It intercepts the city API and realtime connection locally; it does not create hosted businesses or payments.

The pack integration changes presentation and local build tools only. It needs no database migration, Edge/Fly deployment, payment change or new inference. Physical mobile performance and hosted-device acceptance remain separate from desktop Chromium and mobile viewport checks. No traffic simulation, interior navigation or business-operated building editor is introduced.

## Branded entrance billboards

Each property now has a supported entrance canopy and double-sided billboard above the walkway. Width follows the building tier (3.4–6 m); the 2:1 display begins at 3.3 m above ground. Frame, roof and supports remain within the 16 m building envelope, preserving the 4 m plot setback. The entrance path is aligned with the actual door bay for both street-facing orientations.

The billboard uses the existing approved `profile.logo` and `profile.hero` media. Logos fit inside a neutral badge without stretching; hero images fill the screen with a centred crop. Business name and tagline remain on the lower strip. Missing or undecodable images fall back to the brand colour and text. Screens do not play video. Clicking either side opens the same property panel as clicking the building.

One 2048×2048 canvas atlas holds at most 32 nearby/selected businesses, with two correctly oriented physical faces per sign. Four concurrent image workers deduplicate URLs within each refresh, use anonymous CORS loading, time out failed loads and fence stale callbacks. The selected business is always prioritised. More distant structures retain coloured frames until they enter the detail set. No extra public API or database fields are required.

Original fictional logo/promotion SVG fixtures live in `public/city/demo-signs`, regenerated by `python scripts/build-city-demo-signs.py`. The demonstration includes square, wide and transparent logos, landscape/portrait promotions, logo-only, image-only and text-only businesses. These files are test artwork, not customer branding or real offers. Real uploads keep their existing PNG/JPEG/WebP validation and review flow.

`node scripts/city-billboard-browser.mjs` checks loaded artwork, the 32-slot bound, a real 3D sign click, an undecodable-image fallback and a mobile viewport. The local test loaded 11 unique images; the failure fixture recovered with ten decoded images and one failed image, with no browser errors. Layout tests verify display bounds and unobstructed two-metre entrance paths. Screenshots and results are stored in `output/playwright/city-billboards*` and `city-billboard-results.json`.

Verification: TypeScript and production build passed. Public desktop/mobile browser checks, mocked business onboarding through checkout, and the 2,000-property scene passed with no browser errors. The headless Intel UHD / D3D11 benchmark measured 60.1 fps (91 draw calls, 10 textures); physical mobile performance remains unverified. Billboard loading and broken-image fallback also passed against the production preview.


## Hero roof signage and connected courtyards (September 2026)

City properties now reuse the exported MegaKit assemblies as two joined wings, with a lower frontage and taller return on higher tiers. Stable business identity selects mirrored L layouts and the existing brick/metal style. This replaces the standalone square silhouette without regenerating or uploading assets. The wings fit within the existing four-metre plot setback; a courtyard path stays outside both wings.

One single-sided, 2:1 hero sign spans almost the entire frontage roof: 11.6 metres on the two smallest tiers and 15.6 metres on higher tiers (previously capped at six). Its face always points toward +X or +Z, the two lower edges in the fixed isometric camera. It never rotates toward a rear edge on relocation. Short rooftop supports replace the old ground-level entrance canopy. The existing image/logo atlas, selection, fallback and reduced-motion behavior remain in use.

Geometry checks cover roof width, plot bounds, connected wings and the allowed sign orientations. Browser fixtures isolate hosted availability and exercise loaded test images/logos, failed-image fallback, clicking the sign, pan/zoom, central reset, mobile viewport and market displacement. No backend migration, flag activation, provider spending or deployment is required. Physical mobile performance remains a separate rollout check; two joined source assemblies add triangles even though rendering stays instanced.


## Uniform low-detail facades (September 2026)

The stretched-wing implementation above is superseded by complete generated L presets. Scaling finished MegaKit buildings independently along X/Z compressed their windows and trim differently on each facade. CityArchitecture now creates final-dimension wall masses, roof caps and fixed-size window planes once per tier/style/LOD, then instances each complete building at unit scale. Window bays use a three-metre pitch, windows are 1.5 by 1.8 metres, and all floor heights remain three metres. Lower wings round to whole floors. Shared interior-wall window detail is omitted.

Facade textures, tiny cornices, window frames and rooftop clutter are removed. Two neutral material palettes and the existing mirrored L silhouettes remain; branding lives on the hero billboard. Distant meshes omit alternating window rows. Near presets stay below 600 triangles each, rather than stretching detailed imported assemblies. MegaKit roads and street props are retained, and the original GLB still contains its legacy building source data; this change reduces rendered geometry, not the downloaded kit payload. Billboard roof mounts, entrance animation and market displacement use the same complete-property origin.

Validation covers fixed window dimensions on both orientations at every tier, whole-floor heights, the triangle budget, plot bounds, image loading/selection, 400-property desktop/mobile-viewport rendering and residency, TypeScript, build and development startup. Physical mobile performance remains separately unverified.

The same 400-property desktop fixture reported 487,350 rendered triangles and 63 draw calls, versus the preceding 1,328,250 triangles and 100 calls (about 63% fewer triangles). The mobile-sized desktop-GPU view reported 475,670 triangles and 63 calls. Both local runs were approximately 60 FPS; this does not establish phone performance.

## Detailed uniform modular facades (September 2026)

The plain facade implementation above is superseded at the user's request. The Blender pipeline now assembles complete L-shaped buildings from original MegaKit window, storefront, door and cornice modules at native dimensions: two-metre horizontal bays and three-metre floors on both wings. Whole buildings are instanced at unit scale; finished facades are never stretched to fit a wing. Larger frontage masses are 14 metres wide, leaving room for projecting trim within the 16-metre envelope. The returning wing uses an eight-metre depth to preserve complete bays. Roof billboards follow the exported massing and remain on the camera-facing edges.

Brick and metal architectural variants restore window frames, trim and storefront character. Shared internal facade sections are omitted, roofs use simple slabs, and far LODs use plain masses with sparse fixed-size window faces. The former procedural plain-building implementation is removed. The generated pack contains 24 near/far building presets and the existing street assets, totals 8,707,392 bytes, and passes glTF validation with zero errors. Source pack files remain unchanged. Versioned asset loading prevents reuse of the previous building pack.

The footprint regression compares every exported preset's wing dimensions against the runtime layout used by billboards. Layout, billboard/image fallback, navigation, TypeScript, production build and development checks are run for this change. The 400-property local desktop fixture rendered 893,580 triangles in 92 draw calls at approximately 60 FPS, versus 1,328,250 triangles in the earlier stretched detailed version. The mobile-sized viewport on the same desktop GPU rendered 880,780 triangles at approximately 60 FPS; this is not physical-phone validation. More geometry is intentionally retained than in the rejected plain facade version. No backend changes, deployment or provider spending are needed.
