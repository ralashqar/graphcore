# Blender architecture collection

The local City construction studio now offers **Shape → Blender collection**. It contains the six New York buildings plus 24 additional complete buildings, grouped into Houses, Shops & Dining, Civic, and City & Towers. Enable the existing studio with `/city?demo=1&cityStudio=1` and enter construction on an owned demo plot.

Selecting a building assigns its editable volumes, catalog revision, window and entrance modules, materials, roof profiles, facade assemblies and supported roof equipment. Replacement uses the existing confirmation and undo history. Existing recipes retain their catalog; the Openings tray can explicitly upgrade a building to the new catalog. The game assembles instanced module geometry, rather than loading a monolithic building mesh for every plot.

## Buildings

| Collection | Presets |
| --- | --- |
| Houses | Garden cottage; Craftsman house; Bay-window townhouse; Terracotta villa; Courtyard house; Modern terrace house |
| Shops & Dining | Bakery pavilion; Neighborhood bistro; Corner restaurant; Garden courtyard café; Market arcade; Rooftop restaurant |
| Civic | Neighborhood bank; Classical museum; Modern courtyard museum; City library |
| City & Towers | L-shaped office; Courtyard residences; Grand courtyard hotel; Setback glass tower; Art Deco tower; Skybridge twin towers; Glass atrium campus; Faceted city tower |

`src/domain/cityCollectionPresets.ts` is the authoritative recipe source. All buildings fit the existing 24 m plot and retain their authored proportions in 48 m plots. Height remains bounded to eight floors. Courtyard cutouts remain empty; intersecting volumes remove internal facades; the twin towers join through an elevated glazed volume with a downward-facing soffit and collision headroom. The shapes remain editable with the existing block/outline tools. These are exterior presets; interior partitions, furniture and vertical circulation are still separate studio edits.

## Assets and authoring

`synarc-kit-5` contains 141 modules: the prior 105 plus 36 new Blender-authored modules. The extension includes 16 window treatments, six entrances, ten facade details and four roof props. Geometry has closed masonry reveals, inset glazing, role-separated materials, measured bounds and UVs. Civic pilasters fit beside openings. Windows retain their native dimensions, with masonry fillers for wider bays.

- Editable module source: `assets/city/synarc-kit/v5/synarc-city-kit-v5.blend`.
- Editable building collection: `assets/city/synarc-kit/v5/architecture-collection.blend` (24 scenes).
- Runtime pack: `public/city/synarc-kit/v5/kit.glb` (28,414 triangles across the entire catalog, approximately 3.1 MB).
- Complete building reference exports and rendered gallery images: `public/city/synarc-kit/v5/presets/`.
- Catalog and measured source/export hashes: `catalogue.json` and `manifest.json` in the v5 asset directory.

The full-building GLBs are reference exports; the game uses the same resolved module placements and connected roof geometry that were exported into Blender. Blender preview lighting differs from the game's shared environment. No image generation or external model provider is used.

Rebuild in this order:

1. `node scripts/prepare-city-collection.mjs`
2. Execute `scripts/build-city-collection-kit.py` through Blender MCP with `CITY_STUDIO_ROOT` set to the repository path. This creates a dedicated v5 scene and restores the original active scene.
3. `node --experimental-strip-types scripts/export-city-collection.ts`
4. Execute `scripts/build-city-collection-showcase.py` through Blender MCP with the same root. Optional `CITY_COLLECTION_IDS` limits rebuilding to selected preset IDs.
5. Execute `scripts/render-city-collection-thumbnails.py` through Blender MCP.
6. `node scripts/validate-city-studio-kit.mjs`

The scripts reuse the established kit/showcase pipeline and the new `city-collection-geometry.py` authoring routines. V2–V4 assets are not rewritten. Blender source scenes unrelated to this collection are preserved. Roof prop placement checks actual roof support and rotated blocker extents; unsupported placements retain their intent with an explanation.

## Verification and limits

Local tests cover deterministic resolution and serialization on both plot sizes, module availability, native opening proportions, a single primary entrance, courtyard voids, bridge joins/undersides, and rejection of v5 modules in earlier catalogs. The combined focused City suite passes 135 tests. Asset validation covers all four catalog versions, source/export hashes, module identities, bounds, connectors, apertures, normals, UVs and every module/preset image.

The Edge browser flow exercises all 24 gallery selections, category filters, 141-module loading, undo/redo and saved draft reload on native WebGPU and forced WebGL2. Browser artifacts are under `output/city-collection-browser-*.json`; screenshots are under `output/playwright/city-collection-*`.

The gallery also passed selection/replacement at a 390 × 844 desktop-emulated viewport. TypeScript and the production Vite build passed; existing large-chunk and missing landing-atlas warnings remain unrelated.

`scripts/city-collection-benchmark.mjs` compares six local office/residential/tower recipes against the same shapes with the older modules and without the new ornaments. In a 400-property background (208 resident/prepared), native Edge measured legacy/new p95 frame times of **17.2 / 17.1 ms**, 42 / 48 final draw calls and 416,187 / 422,119 final triangles. The 7.7-second route captured 338 / 365 frames. This is a short local comparison with six authored plots, not certification of a city filled with 400 detailed towers or of hitch-free streaming. Results: `output/city-collection-benchmark.json`.

This is frontend and local asset work. It does not change public business recipes, APIs, database schemas, Supabase/Fly deployments, payments or providers. No hosted rollout was performed. Physical mobile testing remains outstanding; desktop viewport emulation is not physical-device acceptance.
