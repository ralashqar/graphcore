# MegaCity asset showcase

`/city/asset-showcase` is an isolated visual review page for the first JC MegaCity conversion. It does not replace live City properties, change paid allocation or introduce backend commands. `src/main.tsx` lazy-loads it separately, so normal City visits do not load its asset pack.

## Included presets

| Source prefab | Preview label | Near triangles (including prefab parts) | Far triangles |
| --- | --- | ---: | ---: |
| Commercial 01 | Corner shop | 1,710 | 684 |
| Commercial 04 | Compact retail | 846 | 338 |
| Commercial 10 | Small storefront | 2,371 | 948 |
| Commercial 18 | Candy kiosk | 5,916 | 2,366 |
| Bank | Civic landmark | 13,516 | 5,404 |

Three independently selectable decorative modules are also included: air-conditioning unit, wall vent and roof vent. The page provides near/far selection, sample billboard visibility, Quaternius reference buildings, individual camera focus, pan/zoom and a 400-building instancing scene. The comparison tiers are reference choices, not a new paid-tier allocation rule. Original signs such as BANK and the kiosk's candy decoration remain part of the vendor meshes; they are not claims of real business participation.

## Rebuild

Set `CITY_MEGACITY_SOURCE` to the original `C:\Unity\KatchAGem\KatchAGem\Assets\JC_LP_MegaCity` folder, then run:

```powershell
$env:CITY_MEGACITY_SOURCE='C:\Unity\KatchAGem\KatchAGem\Assets\JC_LP_MegaCity'
node scripts/build-city-megacity.mjs
```

Dependencies: Python with PyYAML, Blender (`BLENDER_BIN` override), and the project's Node dependencies including glTF Transform, Sharp and Meshoptimizer. `PYTHON_BIN` overrides Python. The source Unity project is read-only. Original FBXs, Unity materials, prefabs and textures are not vendored into this repository. Only the converted runtime artifact, portable source-hash inventory, converter and review UI are committed. Local resolved paths, geometry probes and intermediate exports remain under ignored `output/megacity-*` directories.

The bounded prefab resolver reads Unity YAML and `.meta` GUIDs, follows mesh and material references, and composes parent transforms. It ignores scripts, physics components, baked lighting and other Unity runtime behavior. Nested prefabs, unresolved GUIDs, custom importer units/scales, used material-slot mismatches and multi-mesh FBXs needing file-ID resolution fail for explicit review. Unused FBX material slots can be omitted by the Unity renderer.

Blender imports mesh-local geometry. FBX scene translation is discarded before applying prefab transforms, with the Unity/FBX handedness conversion applied to those transforms. Keeping both translations initially placed the bank doors inside the building; a conversion regression check now verifies both doors are aligned with the front entrance. Completed assemblies are centred and grounded, then uniformly scaled only if their footprint exceeds 14 metres. All current presets fit at scale 1.

## Materials and rendering

Prefab materials resolve to four shared browser materials and one 2048-pixel WebP colour atlas. UVs are preserved; glass uses an opaque approximation rather than Unity transparency/refraction. Unity-only lighting and emissive effects are not replicated. Billboard branding uses a separate generated example texture with a supported frontage mount; it does not alter the building atlas. Existing Quaternius signs use their current roof envelope.

Near and decimated far presets are exported together, welded and Meshopt-compressed. The final GLB is 512,524 bytes. Validation requires all sixteen named meshes, UVs on textured primitives, grounded bounds inside the plot envelope, smaller far versions, a four-MB payload limit and zero Khronos glTF validation errors. It preserves mesh proportions and leaves the source files untouched.

## Verification and limits

`node scripts/city-megacity-browser.mjs` (with optional `CITY_TEST_ORIGIN`) covers loading, model selection, decoration inspection, billboards, comparison visibility, both detail levels, 400 repeated buildings, mobile overflow and reduced-motion presentation. Screenshots and measurements are written to `output/playwright/megacity-*`.

The repeated-building far-detail scene measured approximately 60 FPS over five seconds on the local desktop GPU, with ten draw calls and 783,520 rendered triangles. It is not a full-city benchmark: search, customer activity, production billboards, roads and backend feeds are not part of that stress fixture. Physical mobile performance remains unverified. Browser runs reported no console/runtime errors. TypeScript, production build and development startup are checked; existing large-chunk and landing-atlas build warnings are unrelated.

Before applying these presets to live businesses, review the visual style, remove or adapt fixed vendor branding where appropriate, choose tier/category mappings and verify the complete City pipeline. Roads remain Quaternius because MegaCity's sampled ten-metre road grid is not a direct match for the current six-metre segments/eighteen-metre corridors. This release adds no database migration, provider spending, worker deployment or production activation.
