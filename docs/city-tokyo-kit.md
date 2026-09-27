# Tokyo building kit (local construction studio)

A self-authored pack of 32 Blender modules for small-lot Tokyo mixed-use buildings (zakkyo, shotengai shophouses,
izakaya, konbini-like stores, backstreet mansions), loaded beside the SynArc kit v5 in the construction studio
(`/city?demo=1&cityStudio=1`). Everything is unbranded: sign "lettering" is abstract stroke geometry (generic
kanji-like clusters with no meaning), fascias and billboards are blank or abstract, and there are no logos,
trademarks or real brand names. Local studio only: business/profile validators reject every Tokyo id, there is no
schema, backend, provider or deployment change.

## Pack, not a new kit version

The pack is **an additional module set under the existing `synarc-kit-5` catalogue**, not a `synarc-kit-6`.

- Kit versions are hard-coded across the studio (`['synarc-kit-4','synarc-kit-5']` checks for stamps, variation,
  roof details, finishes, soffits, camera framing and the NYC detail variant) and typed `2|3|4|5` in the UI files.
  A v6 would have needed edits in all of them, including UI files owned by another agent, and a re-export of the
  141 v5 modules.
- `synarc-kit-5` is also the business catalogue. The pack therefore joins only the **studio** view of v5:
  `studioModules(5)` / `STUDIO_MODULES_V5_STUDIO` and `STUDIO_MODULE_MAP`. `STUDIO_MODULES_V5` (business variation
  pools, `variationChoices`) and `STOREFRONT_STAMPS` (business stamps, the business designer) are unchanged.
  `validateModularBuilding` and the business branch of `validateVariationRecipe` reject Tokyo module and stamp ids
  (`usesTokyoKit`), so business recipes keep exactly the shared catalogue.
- `loadStudioKit(5, detail)` (`CityStudioMeshes.tsx`, the one runtime change outside the domain) loads
  `public/city/tokyo-kit/v1/kit.glb` (or `kit-medium.glb`) in parallel with the v5 file and merges the modules, so
  the studio, the city's shared instanced kit (`CitySculptSharedKit`) and the medium level all see one v5 pack.
  The v5 kit files, catalogue, thumbnails and hashes are untouched. Cost: one extra ~0.75 MB (medium ~0.55 MB) GLB
  per session, loaded with kit v5.

## Pipeline

```powershell
# modules, catalogue, measured manifest, kit.glb, tray thumbnails, review contact sheet (about 40 s)
& "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup --python scripts/build-city-kit-tokyo.py
# medium level (kit-medium.glb/json), same rules as the synarc kit
& "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup --python scripts/build-city-kit-medium.py -- tokyo
```

`scripts/build-city-kit-tokyo.py` is the editable source (no .blend is checked in; the script rebuilds everything
deterministically). It builds each module per channel from boxes (optionally with a one-segment bevel), capped prisms
and rods, then exports one root per module (named by id) with one mesh per channel.

| Output | Content |
| --- | --- |
| `public/city/tokyo-kit/v1/catalogue.json` | module metadata, same fields as the synarc catalogues (`size`, `opening`, `stretch`, `channels`, `connectors`, `clearance`, `collision`, `minDetail`) |
| `public/city/tokyo-kit/v1/manifest.json` | catalogue + measured triangles and runtime bounds + `scriptSha256`/`glbSha256` |
| `public/city/tokyo-kit/v1/kit.glb` | full detail, flat normals, box-projected UVs |
| `public/city/tokyo-kit/v1/kit-medium.{glb,json}` | medium level (`build-city-kit-medium.py -- tokyo`) |
| `public/city/synarc-kit/v5/thumbnails/<id>.png` | 160 px tray thumbnails (the studio trays read `v5/thumbnails`) |
| `output/tokyo-kit-sheet.png` | review contact sheet (not shipped) |

Conventions are the synarc kit's: runtime metres, +Z out of the wall, origin bottom-centre; facade tiles are 0.3 m
slabs centred on the wall line (front at z = 0.15) whose `wall` channel frames a centred rectangular aperture (the
catalogue `opening`), so kit pieces in generated walls drop that channel and the wall's own hole replaces it.
Materials are `studio/tokyo/<channel>`; the studio paints per channel. In this pack **door** is the accent (noren,
lanterns, sign strokes, awning fabric, vending machine, laundry), **trim** the light panels (sign faces, sills,
balcony slabs and upstands, AC casings, shoji paper, tank), **frame** aluminium/steel/timber frames, lattices and
shutters, **glass** glazing, **wall** the tile slab (and the rooftop stair house body, which follows the wall colour).
Studio code reads ids: doors start with `door-`, windows with `window-`, shopfronts contain `shop`.

Far proxies need nothing new: they are built at runtime from the catalogue (`opening`, `size`, `collision`).

## Modules (32 modules, 9,852 triangles; medium 7,494)

| Id | Category | Label | Size (m) | Aperture (width, bottom-top) | Triangles | Medium |
| --- | --- | --- | --- | --- | ---: | ---: |
| `window-tokyo-sash` | window | Tokyo aluminium sash | 2x3x0.3 | 1.50, 0.85-2.35 | 284 | 232 |
| `window-tokyo-grille` | window | Tokyo sash with grille | 2x3x0.3 | 1.10, 1.00-2.15 | 412 | 320 |
| `window-tokyo-shoji` | window | Tokyo sliding shoji | 2x3x0.3 | 1.60, 0.60-2.30 | 520 | 410 |
| `window-tokyo-strip` | window | Tokyo ribbon window | 2x3x0.3 | 1.60, 0.90-2.20 | 168 | 154 |
| `window-tokyo-sash-ac` | window | Tokyo sash with AC unit | 2x3x0.3 | 1.20, 0.95-2.30 | 536 | 394 |
| `window-tokyo-balcony` | window | Tokyo enclosed utility balcony | 2x3x0.3 | 1.60, 0.05-2.25 | 440 | 348 |
| `window-tokyo-balcony-rail` | window | Tokyo rail balcony | 2x3x0.3 | 1.60, 0.05-2.25 | 672 | 514 |
| `door-tokyo-stair` | door | Tokyo narrow stair door | 1.1x3x0.3 | 0.85, 0.00-2.15 | 176 | 118 |
| `door-tokyo-sliding` | door | Tokyo glass sliding doors | 2x3x0.3 | 1.70, 0.00-2.45 | 264 | 240 |
| `door-tokyo-noren` | door | Tokyo lattice door with noren | 2x3x0.3 | 1.60, 0.00-2.25 | 504 | 414 |
| `door-tokyo-shop-shutter` | door | Tokyo shutter shopfront, half open | 2x3x0.3 | 1.86, 0.00-2.50 | 272 | 178 |
| `window-tokyo-shop-glass` | window | Tokyo glazed shopfront | 2x3x0.3 | 1.86, 0.25-2.50 | 144 | 130 |
| `window-tokyo-shop-shutter-closed` | window | Tokyo roll-up shutter, closed | 2x3x0.3 | 1.86, 0.00-2.50 | 320 | 172 |
| `window-tokyo-shop-lattice` | window | Tokyo timber lattice shopfront | 2x3x0.3 | 1.80, 0.45-2.30 | 368 | 322 |
| `wall-tokyo-tile` | wall | Tokyo tiled wall | 2x3x0.3 | - | 180 | 150 |
| `wall-tokyo-sign` | wall | Tokyo projecting vertical sign | 1x3x0.3 | - | 440 | 326 |
| `wall-tokyo-sign-flat` | wall | Tokyo flat vertical sign | 1x3x0.3 | - | 272 | 202 |
| `wall-tokyo-lantern` | wall | Tokyo red lanterns | 1x3x0.3 | - | 328 | 298 |
| `wall-tokyo-ac` | wall | Tokyo wall AC unit | 1x3x0.3 | - | 252 | 185 |
| `wall-tokyo-pipes` | wall | Tokyo pipes and meters (near only) | 1x3x0.3 | - | 260 | 140 |
| `wall-tokyo-vending` | wall | Tokyo vending machine | 2x3x0.3 | - | 228 | 114 |
| `wall-tokyo-louvre` | wall | Tokyo louvre screen | 2x3x0.3 | - | 204 | 170 |
| `tokyo-awning` | trim | Tokyo shop awning (stretches) | 2x1.1x1.25 | - | 120 | 82 |
| `tokyo-fascia` | trim | Tokyo light-box fascia (stretches) | 2x0.55x0.25 | - | 260 | 166 |
| `tokyo-hood` | trim | Tokyo concrete hood (stretches) | 2x0.12x0.6 | - | 56 | 20 |
| `tokyo-roof-water-tank` | roof | Tokyo panel water tank | 2.2x3.1x1.9 | - | 468 | 360 |
| `tokyo-roof-ac-cluster` | roof | Tokyo condenser cluster | 2.7x1.2x1.1 | - | 472 | 340 |
| `tokyo-roof-antenna` | roof | Tokyo antenna mast (near only) | 1.4x3.4x1.4 | - | 336 | 316 |
| `tokyo-roof-billboard` | roof | Tokyo billboard frame (blank) | 4.3x4.6x2.0 | - | 264 | 205 |
| `tokyo-roof-stairhouse` | roof | Tokyo stair and lift house | 2.6x2.9x2.9 | - | 312 | 178 |
| `tokyo-roof-laundry` | roof | Tokyo laundry rails | 2.4x1.8x1.0 | - | 188 | 172 |
| `tokyo-roof-railing` | roof | Tokyo safety railing | 3.0x1.1x0.2 | - | 132 | 124 |

Budgets (tested): window 800, door 700, wall 600, trim 400, roof 900 triangles; the heaviest module is the rail
balcony (672). The whole pack is about a third of kit v5 (28,414). The medium level is 76 % of the full triangles
(v5: 49 %): the pack is mostly plain boxes, so there are few bevels for the medium rules to remove; it drops small
parts (grille lugs, clamps, meter details, antenna elements under 30 cm) and hidden faces.

Balconies, AC units, lanterns, signs, pipes and the vending machine are part of their tiles, so they need no new
assembly code: a balcony window is a floor-level aperture (sliding door) with its slab, upstand/rails, partition
boards and laundry pole; wall tiles without an aperture are **panels** (relief only on a generated wall), so the
Walls tray and rhythm pools place them like any kit piece. Signs and lanterns are 1 m tiles and stack per storey.

## Where it plugs in (existing data paths only)

| Studio surface | Data path | Tokyo content |
| --- | --- | --- |
| Openings: Windows / Doors / Walls trays, Freeform kit pieces | `studioModules(5)` + `moduleOpeningSpec` | all window, door and wall modules (apertures cut the generated wall; wall tiles are panels) |
| Rhythm: Kit pieces pool chips | `studioModules(5)` filtered by `moduleOpeningSpec` | all apertures and panels |
| Rhythm style presets | `RHYTHM_STYLES` (`cityStudioFacadeRhythm.ts`) | new **Tokyo** style |
| Roof details (click to place) | `studioModules(5)` category `roof` | 7 rooftop props |
| Storefront stamps | `STAMP_MAP` / `TOKYO_STOREFRONT_STAMPS` (`cityStorefrontStamps.ts`) | 8 stamps (see UI hooks) |
| Starting ideas | `STUDIO_EXAMPLES` / `studioExample` (`cityStudioExamples.ts`, `cityTokyoPresets.ts`) | 4 Tokyo buildings |
| Facade details (module assemblies) | assemblies with `module` (category trim) | awning, fascia, hood via stamps and presets (see UI hooks) |

### Tokyo rhythm style

`tokyo` in `RHYTHM_SPECS`: 2.4 m columns, narrow rect door, shop ground, rect uppers. New optional `Spec.modules`
lists the kit pieces its preset pools draw (`module:<id>` entries: sash, sash + AC, rail balcony and grille above;
glazed, shuttered and lattice shopfronts below; ribbon windows in the attic), with variety spreading weight onto the
secondary pieces. Where the building's catalogue lacks a piece (any kit other than v5), a street-front piece falls on
a side wall, or the column cannot take the piece, the cell falls back to the style's own opening shape; other styles
keep their behaviour (a kit piece that does not fit leaves the cell blank). Choosing the style on a building without a
rhythm gives a version-2 rhythm (pools); a building with an existing version-1 rhythm keeps the legacy slot generator
(shapes only).

### Storefront stamps

`stamp-tokyo-konbini-{2,3}` (glazed shopfront, sliding doors, fascia), `stamp-tokyo-izakaya-{1,2}` (lattice, noren
door, hood, fascia), `stamp-tokyo-ramen-{1,2}` (glass, noren, awning under the fascia), `stamp-tokyo-shutter-{2,3}`
(closed and half-open shutters, awning, fascia). They need a 3 m ground storey, like the shared stamps.

### Starting ideas (`TOKYO_PRESETS`)

Unified facades with the Tokyo rhythm, party walls off, manual kit pieces and stamps as spans the rhythm fills
around, ground storey 3.6 m (a 3 m tile plus the rhythm's 0.5 m storey clearance), roof details on the flat roof:

- **Tokyo zakkyo building** 7 x 12 m, 6 storeys: stair door and a 4 m convenience store, ribbon and AC windows,
  projecting signs stacked up the corner, billboard, water tank, stair house, condensers and antenna.
- **Tokyo shotengai shophouse** 8 x 10 m, 3 storeys: stair door, shutter shops and a ramen counter, rail balconies.
- **Tokyo izakaya corner** 6 x 9 m, 4 storeys: noren door, lattice front, awning and fascia, vending machine,
  lanterns, signs and pipes on the corner wall, shoji and balconies above.
- **Tokyo backstreet mansion** 8 x 11 m, 5 storeys: lobby doors, meters, shuttered store, enclosed utility balconies.

## UI hooks for the studio UI (not implemented here)

The UI files belong to another agent; these are the only places that need a hook:

1. **Storefronts tray** lists `STOREFRONT_STAMPS`. Use `STUDIO_STOREFRONT_STAMPS` in the construction studio (keep
   `STOREFRONT_STAMPS` in the business designer / `CityVariationPanel` business mode).
2. **Facade details tray** (`CityNycFacadeDetails`) shows NYC ids and `collection-*` trims only. Add
   `p.id.startsWith('tokyo-')&&p.category==='trim'` so the awning, fascia and hood can be placed as details.
3. Optional: a "Tokyo" filter/group for the Windows/Doors/Walls trays and roof details (ids start with or contain
   `tokyo`; `TOKYO_MODULE_IDS` is exported), and a Tokyo group in the Starting ideas tray (`TOKYO_EXAMPLE_START`).

## Shaped (non-kit) opening kinds: follow-ups for the generated-wall agent

The pack covers these as kit apertures; true shaped generated openings would need geometry work in
`cityStudioFreeOpenings`/`cityStudioFreeOpeningGeometry`:
- a `slide` glazing style for generated rect openings (two offset aluminium sashes, transom light);
- a roll-up shutter state for generated shop/door openings (housing above the head, slatted curtain at a height);
- a lattice (koshi) infill option for generated ground openings;
- a narrow steel stair-door style (plain leaf, vision slit, small hood).

## Licensing

All geometry is authored procedurally in `scripts/build-city-kit-tokyo.py` for this project (CC0-compatible);
no third-party meshes, textures, fonts or reference imagery are included. The sign strokes are generic abstract
stroke clusters, not text, marks or logos.

## Verification

- `node --experimental-strip-types --test src/domain/cityStudioTokyoKit.test.ts` (7 tests): catalogue/manifest/GLB
  agreement and hashes, one root per module, channel set, per-module triangle counts, budgets, bounds, wall-channel
  rule, id conventions, thumbnails; medium level (hash, modules, channels, non-near geometry); studio-only catalogue
  membership and opening kinds; business rejection (schema and preset import) of Tokyo windows, defaults, assemblies,
  roof details, stamps and pools while the construction studio accepts them; every Tokyo stamp paints and resolves;
  the Tokyo rhythm uses the pack on v5 and shapes on v3; the four starting ideas validate and resolve with nothing
  inactive on 24 m and 48 m plots and together show 26+ of the 32 modules.
- `src/domain/cityStudioKitMedium.test.ts` compares kit v5 with its own modules; the unified-facade conversion
  parity test skips examples that are already unified (the Tokyo ideas).
- `node --experimental-strip-types --test src/domain/cityStudio*.test.ts src/domain/cityNyc*.test.ts` pass; the full
  domain suite has the same 8 failures as the base commit (legacy v3 presets, demo designs, Supabase exposure, world
  prompt), none involving the pack.
- `CITY_TEST_ORIGIN=http://localhost:5180 node scripts/city-tokyo-kit-browser.mjs`: native WebGPU (Edge headless),
  all four starting ideas load with kit v5 + the pack (173 modules), no page errors; `output/tokyo-<idea>-orbit.png`,
  `-front.png`, `-street.png` and `output/tokyo-kit-thumbnails.png`. `CITY_BACKEND=webgl` runs WebGL2 (not run).
- `npx tsc --noEmit` and `npm run build` pass. Deno profile tests were not run (no Deno on this machine); the shared
  schema imports `cityBuildingVariation.ts`, which now also imports the Tokyo catalogue JSON.

## Limits

- No colliders for the pieces' projections (balcony slabs, signs, vending machine) beyond what kit pieces already
  have; the walkable balcony deck of the balcony assembly is not created by balcony windows.
- Glass reads dark like the other kit glazing; there are no lit signs or night emissive materials.
- The Tokyo presets are unified-facade recipes, which the variation panel's JSON preset export does not carry.
