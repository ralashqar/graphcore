# MegaCity asset showcase

`/city/asset-showcase` is an isolated visual review page for the first JC MegaCity conversion. It does not replace live City properties, change paid allocation or introduce backend commands. `src/main.tsx` lazy-loads it separately, so normal City visits do not load its asset pack.

## Included presets

| Preview label | Near triangles (including prefab parts) | Far triangles | Height after uniform fit |
| --- | ---: | ---: | ---: |
| Corner shop | 1,710 | 684 | 5.1 m |
| Compact retail | 846 | 338 | 5.7 m |
| Small storefront | 2,371 | 947 | 3.9 m |
| Candy kiosk | 5,916 | 2,200 | 7.4 m |
| Civic landmark | 13,516 | 2,198 | 12.7 m |
| Office 01 | 11,006 | 2,199 | 16.6 m |
| Office 02 | 11,953 | 2,200 | 30.2 m |
| Office 03 | 6,320 | 2,200 | 35.6 m |
| Office 04 | 11,064 | 2,199 | 22.6 m |
| Office 05 | 6,712 | 2,200 | 25.7 m |
| Office 06 | 8,202 | 2,199 | 23.0 m |
| Office 07 | 5,756 | 2,200 | 18.6 m |
| Office 08 | 7,612 | 2,200 | 22.2 m |
| Office 09 | 4,637 | 1,854 | 19.0 m |
| Office 11 | 13,005 | 2,199 | 17.4 m |
| Skyscraper 01 | 34,155 | 2,200 | 80.3 m |
| Skyscraper 02 | 61,918 | 2,199 | 62.5 m |
| Skyscraper 03 | 63,080 | 2,200 | 74.0 m |
| Skyscraper 04 | 68,746 | 2,200 | 101.2 m |
| Skyscraper 05 | 45,783 | 2,200 | 94.9 m |
| Skyscraper 06 | 28,614 | 2,199 | 64.3 m |

The showcase contains 21 buildings: five storefronts/landmarks, ten offices and all six skyscrapers. Collection selection and five-building pages keep the gallery bounded; individual camera framing uses building height. Office 10 is excluded because its left-door FBX has a used material slot not resolved by its prefab. The converter rejects that mismatch instead of guessing.

Three independently selectable decorative modules are also included: air-conditioning unit, wall vent and roof vent. The page provides near/far selection, sample billboard visibility, Quaternius reference buildings, individual camera focus, pan/zoom and a 400-building instancing scene. The comparison tiers are reference choices, not a new paid-tier allocation rule. Original signs such as BANK and the kiosk's candy decoration remain part of the vendor meshes; they are not claims of real business participation.

## Rebuild

Set `CITY_MEGACITY_SOURCE` to the original `C:\Unity\KatchAGem\KatchAGem\Assets\JC_LP_MegaCity` folder, then run:

```powershell
$env:CITY_MEGACITY_SOURCE='C:\Unity\KatchAGem\KatchAGem\Assets\JC_LP_MegaCity'
node scripts/build-city-megacity.mjs
```

Dependencies: Python with PyYAML, Blender (`BLENDER_BIN` override), and the project's Node dependencies including glTF Transform, Sharp and Meshoptimizer. `PYTHON_BIN` overrides Python. The source Unity project is read-only. Original FBXs, Unity materials, prefabs and textures are not vendored into this repository. Only the converted runtime artifact, portable source-hash inventory, converter and review UI are committed. Local resolved paths, geometry probes and intermediate exports remain under ignored `output/megacity-*` directories.

The bounded prefab resolver reads Unity YAML and `.meta` GUIDs, follows mesh and material references, and composes parent transforms. It ignores scripts, physics components, baked lighting and other Unity runtime behavior. Nested prefabs, unresolved GUIDs, custom importer units/scales, used material-slot mismatches and multi-mesh FBXs needing file-ID resolution fail for explicit review. Unused FBX material slots can be omitted by the Unity renderer.

Blender imports mesh-local geometry. FBX scene translation is discarded before applying prefab transforms, with the Unity/FBX handedness conversion applied to those transforms. Keeping both translations initially placed the bank doors inside the building; a conversion regression check now verifies both doors are aligned with the front entrance. Completed assemblies are centred and grounded, then uniformly scaled only if their footprint exceeds 14 metres. Larger offices and towers use one uniform scale factor on all axes; the selected-model panel exposes that factor. Tower heights remain approximately 62–101 metres after fitting. Before joining prefab parts, the converter retains and consistently names UV0, dropping auxiliary lightmap layers. Different door/body UV layer names otherwise produced grey façades.

## Materials and rendering

Prefab materials resolve to four shared browser materials and one 2048-pixel WebP colour atlas. UVs are preserved; glass uses an opaque approximation rather than Unity transparency/refraction. Unity-only lighting and emissive effects are not replicated. Billboard branding uses a separate generated example texture with a supported frontage mount; it does not alter the building atlas. Existing Quaternius signs use their current roof envelope.

Far geometry targets at most 2,200 triangles or 40% of its source, whichever is smaller. Near and decimated far presets are exported together, welded and Meshopt-compressed. The final GLB is 4,878,340 bytes. Validation requires all 48 named near/far presets, UVs on textured primitives, grounded bounds inside the plot envelope, smaller far versions, an eight-MiB payload limit and zero Khronos glTF validation errors. It preserves mesh proportions and leaves the source files untouched.

## Verification and limits

`node scripts/city-megacity-browser.mjs` (with optional `CITY_TEST_ORIGIN`) covers loading, model selection, decoration inspection, billboards, comparison visibility, both detail levels, 400 repeated skyscrapers, office/tower pagination, mobile overflow and reduced-motion presentation. Screenshots and measurements are written to `output/playwright/megacity-*`.

The repeated-building far-detail scene measured approximately 60 FPS over five seconds on the local desktop GPU, with nine draw calls and 876,320 rendered triangles, repeating the first five skyscrapers. It is not a full-city benchmark: search, customer activity, production billboards, roads and backend feeds are not part of that stress fixture. Physical mobile performance remains unverified. Browser runs reported no console/runtime errors. TypeScript, production build and development startup are checked; existing large-chunk and landing-atlas build warnings are unrelated.

Before applying these presets to live businesses, review the visual style, remove or adapt fixed vendor branding where appropriate, choose tier/category mappings and verify the complete City pipeline. Roads remain Quaternius because MegaCity's sampled ten-metre road grid is not a direct match for the current six-metre segments/eighteen-metre corridors. This release adds no database migration, provider spending, worker deployment or production activation.
