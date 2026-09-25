# Shared building variations

The business designer has a **Variations** tab. It starts from the 24 Blender collection templates, including houses, shops, civic buildings, courtyards and skybridge towers. Construction has a **Variation** tool beside Shape, and storefront stamps in **Openings**. Construction remains the existing local test world (`/city?demo=1&cityStudio=1`).

## Authoring

- Set width, depth, floors, ground height and upper-storey height. Dimension changes resize the authored union operands, retaining cutouts, part identities and normalized facade anchors. Upper heights are bounded to 3–4.5 m; total storeys remain bounded to eight.
- Simple controls expose coverage, uniformity, independent layer shuffles and locks. Advanced rules expose weighted pools, spacing, alignment/grouping/alternation, placement zones, part selection, floor ranges and selectable exposed-bay regions.
- Layers are ground floor, upper windows, corners, balconies, facade accents, roof details and props. Props include roof equipment and facade ornaments. Roof equipment requires supported flat roof space; unsupported or colliding details remain inactive.
- Precedence is building defaults, part overrides, floor overrides, painted-region overrides, then manual edits. Within a scope class, later rules win. Clearing a scoped layer restores inheritance. Missing hosts are reported without moving the saved selection elsewhere.
- Shuffling changes the relevant deterministic seeds. Existing manual openings, painted finishes, assemblies, roof details and storefront stamps remain protected. Whole-layer and scoped locks are respected.
- Seventeen storefront stamps compose catalog modules: cafe, restaurant, boutique, retail and lobby in one, two or three bays, plus two- and three-bay garages. The garage needs 3.8 m ground height. Stamps reserve adjacent exposed bays, use native opening proportions and preserve the main entrance. Unavailable generated storefront choices fall back to a fitting candidate or wall infill.
- The shared panel previews the complete storefront span before Apply. The construction Openings brush highlights the entire span in green/red and previews the assembly during a pointer gesture; release commits one undoable edit. Replacing a stamp replaces the whole stamp. Unpack turns its constituents into protected manual pieces; manual tile painting asks for unpacking first.
- Local named presets and JSON import/export include the shape, tile rules, manual details and storey heights. Imports validate exact supported fields, catalog IDs, array bounds, dimensions and the 64 KB payload limit. Local construction can also round-trip its interior recipe. Business profiles accept exterior version-five recipes only. There is no public preset marketplace.

The facade-region picker is an accessible exposed-bay selector, with part/face/normalized-position labels. It is not a freehand screen-space lasso. Existing 3D finish painting remains separate. Ordinary control changes update the live preview immediately and use the existing undo history; storefront placement has an explicit span preview.

## Shared implementation

`cityBuildingVariation.ts` expands authored intent into ephemeral openings and assemblies. The stored recipe contains pools, rules, seeds, scopes and manual edits, not generated meshes or generated placement arrays. Both `resolveSculpt` and the business `resolveV3` path use this engine. The existing roof, union, aperture, assembly-clearance and collision solvers remain authoritative.

Business recipes opt into `generatorRevision: city-variation-5`, with a versioned `modular` payload and optional `upperHeight`. Older recipes retain their existing renderer unless explicitly replaced. Switching back to a legacy composition removes modular intent. The new presets reuse the immutable 141-module Blender v5 catalog; this change does not rebake or overwrite earlier asset versions. House and civic templates initialize suitable window pools, while the twin-tower bridge keeps its own window override.

City preparation uses the existing worker/cache path. Catalog geometry is instanced across properties, as are equivalent roof patches and roof-edge geometry. Visibility compacts active instance buffers instead of submitting zero-scaled hidden meshes. The default light city mode uses shared simplified geometry around real apertures and inset panes, without loading the native kit or allocating its instance buffers. Full-detail city mode retains native geometry nearby, with a 55/65 m hysteresis band, and simplified geometry farther away. Business previews and construction authoring retain the native kit. These choices apply to modular buildings only.

## Validation and rollout

The shared strict profile schema accepts the new revision and rejects its payload on older revisions. Manual intent, module IDs, unknown fields, floor stacks and legal branding slots are checked. Ownership, publication, revision and media checks remain unchanged. No database migration or paid generation is introduced.

The affected profile consumers are `city-api`, `city-command`, `city-building-art`, `city-reconcile`, `city-stripe-webhook` and the existing world-generation worker. Function-local Deno configuration adds pinned Three.js and polygon-clipping dependencies; existing Zod mappings are retained. The world worker revision is `2026-09-25-city-variation-1`. These consumers and the frontend require a paired designated-staging rollout before hosted saving. No staging designation or hosted deployment is included in this work.

Local verification:

- 127 domain regression tests covering studio geometry, roofs, outlines, land, the Blender collections and variation rules.
- 20 Deno profile/schema tests, including all 24 modular templates and invalid revision, field, dimension and module cases.
- Business browser checks cover template selection, scoped rules, dimensions, undo, mocked save/reload, mobile-width layout and preset storage/import validation.
- Construction browser checks cover floor rules, shuffle/undo, storey height, full-span 3D storefront painting and local reload.
- Both browser flows pass on native WebGPU and the WebGL2 compatibility backend. TypeScript and the production build pass.

### City stress measurements

`scripts/city-variation-benchmark.mjs` compares legacy recipes with eight repeating complex collection templates across every occupied property. Runs use local development, headless Edge, native WebGPU, default light mode, balanced daylight and architectural occlusion, with a fixed driving route after preparation. No build or other browser test ran concurrently. These are individual local samples, not production or device certification. Reported GPU bytes are renderer telemetry, not total process memory.

| Properties / recipes | Mean frame | p95 | p99 | Longest frame | GPU memory | Draw calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 72 / legacy | 16.7 ms | 16.8 ms | 17.2 ms | 17.3 ms | 67.6 MB | 32 |
| 72 / variation | 16.8 ms | 16.8 ms | 17.0 ms | 33.3 ms | 76.3 MB | 67 |
| 400 / legacy | 25.6 ms | 33.2 ms | 216.6 ms | 550.0 ms | 84.0 MB | 32 |
| 400 / variation | 44.3 ms | 33.3 ms | 1116.6 ms | 1916.7 ms | 103.1 MB | 75 |

The 400-property runs retained 208 legacy / 206 variation resident buildings at the final sample. There were no page exceptions. The variation run contained seven frames over 50 ms; its long frames extended the measured route to 9.7 seconds. Its similar p95 therefore does **not** establish performance parity: streaming stalls remain a material regression, and 400-property performance acceptance remains outstanding. Default-light geometry and instance compaction reduced the earlier variation run's reported GPU memory from about 349 MB to 103 MB and its longest frame from 3.87 s to 1.92 s, but did not eliminate the stalls. Raw final measurements are in `output/city-variation-benchmark.json`.

Full-detail city stress performance and physical-mobile acceptance remain unverified. Desktop browser emulation is not physical-mobile acceptance. Hosted saving, publishing and the paired staging rollout remain unverified.
