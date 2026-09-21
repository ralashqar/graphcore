# City building customiser v2

## Editing and compatibility

The merchant Building Studio defaults to interactive 3D, with separate Shape, Architecture, Branding and Grounds controls beside the large preview. AI artwork retains its existing generation/credit/review flow. Changing modes alone does not alter the saved draft; editing/applying a 3D recipe clears the active artwork path in the draft. Applying image artwork later takes precedence over a retained recipe.

Shape supports office, stepped tower, courtyard and L-shaped footprints; 1–8 floors, 12–18 m width, 10–18 m depth, 3–4.5 m ground-floor height, a broader podium and 0–2 m stepped setbacks. Architectural families are glass office, warm brick, boutique storefront and creative studio. Roofs are flat, parapet, planted and rectangular-office-only pitched. Materials, native façade modules, plain bays and trim vary by family. Ground-floor storefront glazing is larger than upper-floor glazing.

Palette controls expose wall, trim, glass and roof colours and a coordinated business-colour palette. The entrance sign uses the business logo and name; the name remains visible while a logo loads or fails. Logos retain aspect ratio. Minimal/planted/urban grounds are independent of architecture. A saved seed changes approved plain bays and grounds placements without changing shape or brand colours.

The editor provides orbit, fixed city-angle and blueprint views, plot grid, reset camera, preset footprint thumbnails, family swatches, collapsible dimensions, 40-step session undo/redo and reset to the selected preset. The blueprint shows base footprint, upper footprint/setbacks, path and attachment points.

V1 recipes use the original geometry code, protected by a frozen-output hash test. Their controls remain disabled until **Upgrade design** is explicitly chosen; undo restores the original recipe. New recipes use version 2. Cosmetic floors/architecture do not change City Value, paid tier or geography.

## Geometry and assets

`cityBuildingV2.ts` is the shared pure resolver for editor and city. Each floor is a non-overlapping rectangle union. Exposed edges are split against neighbours then merged into contiguous walls; adjoining wings do not receive internal façade decoration. Whole, uniform-width bays are centred within each exposed wall, with balanced margins and procedural fillers. Native modules never receive independent width/height stretching. Modular finishes snap footprint dimensions to 2 m increments; server validation rejects unsnapped recipes.

Three finishes:

- **Clean procedural:** instanced shell, glazing and restrained frames.
- **Quaternius accents:** procedural glazing plus native door/frame, compatible cornice centres/endcaps, awning and grounds.
- **Quaternius façade:** native upper-floor window/plain-wall assemblies; larger procedural storefront glazing and fillers keep variable-height ground floors usable.

All combinations keep a clear entrance route, inset grounds and road clearance. Oversized decorations are suppressed. Curated 2 m corner blocks and marble/concrete entrance sections remain in the catalogue but are not forced into narrow joints; procedural corners/fillers avoid incompatible seams. This release does not expose manual placement of those catalogue pieces.

`public/city/decorators/manifest.json` records source hashes, dimensions, family-compatible neighbours, rear-bottom-centre mounting, outward +Z orientation and material slots. The CC0 source license is included. The separate GLB is **207,936 bytes**, has no image textures or interior shaders, and uses flat low-frequency materials. No GPL generator code was copied. Blender is used only offline.

Rebuild from the source pack:

```powershell
$env:CITY_MEGAKIT_SOURCE='C:\Users\daruk\Projects\GraphCore\Assets\Downtown City MegaKit[Source]'
& 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe' --background --python scripts/build-city-decorators.py
node scripts/optimise-city-decorators.mjs
```

The asset catalogue is curated, not a promise that every family member connects to every orientation. Placement uses the resolver's exposed-wall, bay-margin and footprint rules. New components must pass bounds/clearance tests before being placed.

## Runtime and persistence

`CityDesignBuildings` batches repeated primitives and native geometry/material pairs across properties, preserving shared selection, arrival/displacement, dimming and reduced-motion behavior. Near detail is limited to 12 nearby properties (selected first), medium detail uses procedural windows, and far detail retains silhouette/roof/palette/signage while dropping small decoration. Existing resident streaming remains intact.

The native pack loads only for a nearby modular design. Until a complete compatible pack is available, procedural fallbacks remain visible. A failed request does not remove the building or disable editing. Branding uses one shared 2048×1024 canvas atlas and an instanced sign draw, with no per-business texture draw call.

`CityProfile.buildingDesign` is a discriminated V1/V2 union. V2 adds `depth`, `groundHeight`, `podium`, `architecture`, `finish`, `roof`, `grounds`, `canopy`, `seed` and strict `palette` fields. Legacy fields remain readable. Existing owner/revision-checked draft save and publication review carry the recipe in profile JSON. No migration, new user identity, provider call or new purchase is required.

## Verification

- Seven geometry tests: all shape/family/finish extremes; real catalogue attachment bounds; all roof/grounds combinations; clear entrance; no overlapping wing masses; exposed walls; uniform bays; seeded shell stability; LOD reduction; frozen V1 output.
- Two Deno schema tests cover both versions, unknown fields and invalid dimensions/roof combinations. City server TypeScript and all five importing Edge entries plus `city-campus-worker.ts` check successfully.
- Browser fixtures cover live geometry/families/finishes, blueprint, undo/redo, logo loading, save/reload, responsive layout, city selection, failed optional assets and explicit V1 upgrade/undo. Persistence uses mocked endpoints; hosted publication is not claimed.
- Existing AI artwork browser regression passes without paid inference.
- App TypeScript, production build and fresh Vite dev startup pass. Existing landing-atlas/chunk-size warnings remain.
- A direct full-world-worker Deno check using the City Edge config is not a passing worker build: that config cannot resolve unrelated Three.js/domain imports and reports existing output-renderer type mismatches. The affected campus import path checks independently. A staging worker image build remains part of rollout.

400-property benchmark: Chromium on this Windows desktop GPU; 1440×960 desktop and 390×844 at DPR 2 mobile viewport. No physical phone was used. The scene includes existing roads and streaming, with 302/222 initial resident properties and 116/103 after zooming in. Capture files are `output/playwright/city-design-benchmark-1.json` and `-2.json`; frame times are requestAnimationFrame observations, memory is coarse browser JS heap, not GPU memory. 
| Scene | Calls | Triangles | p95 frame ms | FPS | JS heap MB |
| --- | ---: | ---: | ---: | ---: | ---: |
| V1 desktop | 29 | 843,538 | 16.7 | 60.10 | 177 |
| V2 mixed finishes desktop | 62 | 920,791 | 16.8 | 59.22 | 177 |
| V1 mobile viewport | 29 | 737,938 | 16.8 | 60.08 | 148 |
| V2 mixed finishes mobile viewport | 68 | 868,106 | 16.7 | 60.02 | 148 |

V2 mixes all four families and three finishes, adding 33 desktop material/geometry draws; desktop triangles increase about 9.2%. Geometry/texture counts are 72/8 versus 26/7 on desktop, and 72/6 versus 26/5 in the mobile viewport. Equal coarse heap readings do not demonstrate equal memory usage. Existing office-manifest public-import warnings remain in dev output; browser tests record no uncaught page errors. Physical-device GPU memory and thermal behavior remain unmeasured.

## Staging rollout and remaining acceptance

Deploy **city-api, city-command, city-building-art, city-reconcile, city-stripe-webhook**, the shared-profile-consuming **world-generation** Fly worker (`2026-09-21-city-design-2`), then the matching frontend to the designated isolated staging environment. The pairing is required because `city-campus-worker.ts` imports the same profile parser. Do not deploy unrelated game/director workers.

No isolated staging target is configured in this workspace. The existing staging readiness script explicitly rejects the shared production project. Consequently deployment, hosted owner/revision/publication verification and physical-mobile performance acceptance remain pending. No production activation, provider configuration changes or paid generation were performed. Keep broad activation gated until the real-device and staging checks are complete.
