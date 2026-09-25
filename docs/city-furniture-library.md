# City interior furniture library

## Player workflow

Open the opt-in construction studio, choose **Inside → Furniture**, then a floor. Add interiors first on older buildings. Eight icon categories contain six pieces each: seating, tables, storage, bedroom, kitchen, bathroom, lighting and decor. Search finds all 48 items; thumbnails show the actual exported models and footprint dimensions.

Choose a piece, move the live model ghost over the room and click to place. **R** turns it a quarter turn; **Escape** cancels. Amber ghosts explain invalid placements. **On this floor** lists saved pieces, including inactive pieces. Select from the scene or list to move, rotate, duplicate or delete. Each committed edit uses the existing undo, worker preparation and local persistence path.

The old six primitive furniture renderers are removed. Their IDs remain accepted and now resolve to corresponding detailed Blender assets. No furniture recipe migration, public schema, backend or deployment change is required.

## Assets and production

The original 48-piece v1 pack uses warm wood, fabric, painted cabinetry, ceramic and metal details. Bevels, shaped cushions, paneled doors, handles, shelves, bedding, plumbing and plant silhouettes are authored geometry. The entire GLB is 4.36 MiB and 59,504 triangles; this is the complete pack, not a per-room cost.

- Authoring script: `scripts/build-city-furniture.py`
- Editable source: `assets/city/furniture/v1/city-furniture-v1.blend`
- Runtime: `public/city/furniture/v1/furniture.glb`
- Generated catalogue, measured manifest and 48 thumbnails: `public/city/furniture/v1/`

The script was executed through the connected Blender MCP service. It authors a dedicated furniture scene and preserves unrelated scenes. To reproduce, execute the script definitions with `__file__` set to the script path, then call `build()`, `setup_render()` and `render_batch(0,48)` in the same execution namespace. MCP executions do not retain Python globals automatically. The build saves the editable source and exports bottom-centred assets before generating thumbnails. Manifest hashes pin source, script and export together.

`node scripts/validate-city-furniture.mjs` verifies all 48 IDs, source/script/export hashes, thumbnail presence, triangle budgets, normals and actual transformed vertex bounds against configuration.

## Placement and rendering

A shared rule function checks rotated footprints against covered rooms, complete floor surfaces, openings, walls, stair routes, door clearance and other solid furniture. Full polygon coverage detects shafts through the middle of a footprint. Rugs allow furniture above them. Moving ignores the item's own old bounds. Invalid saved intent remains inactive rather than moving elsewhere. The building limit is 192 pieces.

The pack loads lazily, exposes failure and retry, and caches successful loads. Models merge into at most two shared finish batches per kind and instance per floor. Shared geometry survives unmounting and view changes. Repeated pieces reuse geometry/materials; distant properties retain the existing exterior-only detail policy. Hover checks reuse results within an unchanged snapped cell and prepared revision.

## Verification and limits

- Asset validation passes for all 48 models.
- 126 focused sculpt, studio, interior, furniture, outline, roof and variation tests pass.
- Native WebGPU and WebGL2 furniture browser flows pass: loading failure/retry, categories, search, valid/invalid model ghosts, rotation, move, duplication, deletion, rugs, floor isolation, undo/redo and reload.
- Existing interior browser flow passes with partitions, doors, stairs, furniture, room finishes, removed/restored slabs, added floors and reload.
- Type checking and production build pass. Existing large-bundle and unresolved landing-atlas build warnings remain.

Run browser checks with the local Vite server using `node scripts/city-furniture-browser.mjs`; set `CITY_BACKEND=webgl` for compatibility rendering. The existing interior regression is `scripts/city-studio-interiors-browser.mjs`.

Furniture is floor-supported in this release. Tabletop/wall mounting, sitting/sleeping actions, operable cupboards, furniture recolouring and functional light sources are not implemented. Touch has explicit placement confirmation but physical-device usability/performance is unverified. The full 72/400-property benchmark was not rerun for this pack, and the existing 400-property streaming release gate remains unresolved.
