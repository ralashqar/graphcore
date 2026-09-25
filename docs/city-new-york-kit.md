# New York architecture pack

The opt-in local construction studio (`/city?demo=1&cityStudio=1`) includes six editable historic New York presets under **Shape → Starting ideas → New York collection**. Selecting one uses the existing undoable replacement flow. The pack contains Corner deli, Neighborhood café, SoHo cast-iron loft, Garage workshop loft, Balcony apartments and Ornate commercial corner. Their 3–6 storeys retain the same proportions on 24 m and 48 m plots.

## Assets and authoring

`synarc-kit-4` contains the original 72 studio definitions plus 33 new modules. Existing v2/v3 catalogs and binary assets are unchanged. The new work includes recessed sash/paired/loft/industrial windows, tall shop glazing and entrances, a 4 m closed roller shutter, masonry profiles, striped fabric awnings, iron balcony pieces, cornices and parapets, chimneys, vents, hatches and a water tank.

- Editable modules: `assets/city/synarc-kit/v4/synarc-city-kit-v4.blend`.
- Six complete building scenes: `assets/city/synarc-kit/v4/new-york-buildings.blend`.
- Runtime catalog, GLB, measured manifest and 105 module thumbnails: `public/city/synarc-kit/v4/`.
- Complete reference GLBs and actual Blender renders: `public/city/synarc-kit/v4/presets/`.

The buildings are assembled **inside Blender through MCP from the same resolved recipes used by the game**, rather than independently approximating the game buildings. The full-building GLBs are reference exports; runtime rendering continues to instance reusable modules. Preset definitions live in `src/domain/cityNycPresets.ts`.

Rebuild from the repository root, with Blender MCP running:

```powershell
node scripts/prepare-city-nyc-kit.mjs
node --experimental-strip-types scripts/export-city-nyc-presets.ts
uv run --with mcp python scripts/city-blender-mcp.py scripts/build-city-studio-kit.py scripts/render-city-studio-thumbnails.py scripts/build-city-nyc-showcase.py
node scripts/validate-city-studio-kit.mjs
```

The bridge first reads the active scene. Authoring uses dedicated scenes and returns to the previously active scene; reruns archive the prior generated module scene rather than clearing unrelated work. Modifiers are applied before export, including fabric thickness. New geometry retains UVs and the measured v4 bounds use runtime X/Y/Z coordinates. The complete kit is 21,286 triangles and approximately 2.2 MB uncompressed GLB.

## Editing and geometry

**Openings** shows catalog-appropriate parts. An existing building can explicitly add the New York catalog as an undoable edit. **Details** uses NYC awnings, balcony rails and cornices on v4 and exposes individual facade trims. **Roofs** adds roof-detail selection, supported placement positions, rotation and removal after selecting a roof part.

Local studio intent adds the `synarc-kit-4` catalog, optional opening `span`, optional assembly `variant`/`module`, and roof-detail records anchored to a source part and normalized roof position. No public profile schema changes are involved. Older catalogs reject the new choices.

Wide openings occupy contiguous bays on a single straight exposed face and floor. Their measured dimensions determine fitting and infill. A missing host, shorter wall, lower storey, overlapping authored opening or occupied pedestrian entrance retains an inactive intent and reason. Single-bay replacements use half-open span ownership to avoid duplicating an opening at an old wide-bay midpoint.

Roof props require supported flat roof space, edge clearance and no overlap with other structures. Their collision and rendering come from the same prepared result. The garage is deliberately static and solid, with a separate pedestrian entrance. The pack supplies exterior architecture; **Add interiors** reuses the existing generic operable-door and interior-shell system rather than introducing furnished shops or bespoke animated storefront doors.

The source renderer illustrates the same geometry with Blender lighting; the game uses its existing shared TSL materials, world-space brick textures and glass response. Minor Blender/game material differences are expected. No inference provider is called.

## Verification

- 130 focused tests pass, covering the six recipes at both plot sizes, persistence, wide openings, entrance conflicts, failed host retention, roof support, corner connections, connected stairs, interior conversion, and existing studio/sculpt/land/worker behavior.
- Asset validator covers v2/v3/v4 hashes, module membership, bounds, sockets, opening metadata, normals, v4 UVs, thumbnails and all six reference exports.
- Browser script: `scripts/city-nyc-browser.mjs`, with `CITY_TEST_ORIGIN` pointing to Vite. `CITY_BACKEND=webgl` forces compatibility rendering; `CITY_FAIL_KIT=1` verifies asset failure and online-event recovery.
- Native Edge WebGPU and forced WebGL2 runs cover all six preset replacements, catalog loading, undo/redo, interior conversion, walkthrough, save/reload and missing-asset recovery. The final native run additionally erases/repaints the wide garage shutter and places a roof vent through the UI. Actual screenshots are in `output/playwright/city-nyc-*`.
- TypeScript and the final Vite production build pass; existing large-chunk and missing landing-atlas build warnings remain unrelated.

Warm CPU resolver measurements over 60 samples per preset were approximately 3–6 ms median and 5–8.2 ms p95. These exclude worker transfer, loading and GPU work. `scripts/city-nyc-benchmark.mjs` compares the same 72/400-property background, driving route and six local plots using legacy versus NYC modules. It is not a 400-NYC-building certification.

Controlled local Edge WebGPU results (1000 × 750, Balanced/Architectural, six occupied local plots with identical masses):

| Background properties | Kit | Resident background | Frame p95 | Draw calls | Rendered triangles |
| --- | --- | --- | --- | --- | --- |
| 72 | Legacy | 72 | 16.8 ms | 81 | 236,733 |
| 72 | NYC | 72 | 16.8 ms | 97 | 268,479 |
| 400 | Legacy | 208 | 16.8 ms | 48 | 367,519 |
| 400 | NYC | 208 | 16.8 ms | 65 | 408,187 |

The 400-property fixture is seeded into the demo's local occupied inventory so the construction feature remains enabled; fixtures never reach a backend. Counts describe the recorded view, not every object in the world. The 400-property sample recorded 371 legacy frames versus 324 NYC frames over the timed driving sequence, despite equal p95. Rare hitches and total elapsed frame behavior are therefore not certified by this percentile result. The existing streaming regression remains open. Raw results: `output/city-nyc-benchmark.json`.

Physical mobile remains unverified. The studio stays opt-in. No hosted deployment, backend, account, payment or provider configuration changes are included.
