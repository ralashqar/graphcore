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

The showcase contains 21 buildings: five storefronts/landmarks, ten offices and all six skyscrapers. Collection selection and five-building office pages keep the gallery bounded; all six skyscrapers appear together; individual camera framing uses building height. Office 10 is excluded because its left-door FBX has a used material slot not resolved by its prefab. The converter rejects that mismatch instead of guessing.

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

The repeated-building far-detail scene measured approximately 60 FPS over five seconds on the local desktop GPU, with eleven draw calls and 877,636 rendered triangles, repeating all six skyscrapers. It is not a full-city benchmark: search, customer activity, production billboards, roads and backend feeds are not part of that stress fixture. Physical mobile performance remains unverified. Browser runs reported no console/runtime errors. TypeScript, production build and development startup are checked; existing large-chunk and landing-atlas build warnings are unrelated.

Before applying these presets to live businesses, review the visual style, remove or adapt fixed vendor branding where appropriate, choose tier/category mappings and verify the complete City pipeline. Roads remain Quaternius because MegaCity's sampled ten-metre road grid is not a direct match for the current six-metre segments/eighteen-metre corridors. This release adds no database migration, provider spending, worker deployment or production activation.

## Earlier demo-city office experiment (superseded)

The demo route now renders one complete MegaCity office per occupied plot, replacing Quaternius building assemblies only in the demonstration. A stable hash of business identity chooses among the ten reviewed offices; no skyscrapers or extra building clusters are used. Office choice does not change with rank, and paid geography/displacement remain unchanged. In this experiment office size follows the selected preset rather than the normal paid tier progression.

Quaternius roads, junctions, markings and landscaping remain in place. The converted office footprints retain their uniform source proportions and plot setbacks. Near/far instancing, arrival/movement animation, search dimming and selection reuse the existing renderer. The demo additionally loads the 4.9 MB MegaCity pack; only office geometry is prepared for instancing. Live City visits keep the Quaternius building path and do not request this extra GLB.

Hero billboards use each office's roof height, width and frontage with the same lower-edge orientation rule. Labels and entrance paths follow the selected office orientation. Existing approved/demo image loading and fallback behavior remain unchanged. This is a frontend experiment without backend, provider or deployment changes.

## Single-block demo estates

The demo experiment now allocates one 48m road-bounded block to each business instead of subdividing a block into four plots. The latest iteration restores one enlarged Quaternius L-shaped assembly per block, rotated onto the top-right and bottom-right edges. One 36m by 18m billboard stands 2.5m above ground along +Z, the bottom-left isometric edge, leaving a clear courtyard in front of the L-shaped building. Clicking the sign selects the property. The entrance and landscaping stay inside the block.

A scene-owned coordinate context maps existing logical plot coordinates to block centres without changing ranking or database data. Camera region lookup, selection, search markers, streaming, arrival and displacement use the same mapping. Road inventory expands to cover the existing business capacity; each axis has one business centre per 66m road pitch. Normal City and the asset showcase retain their existing spacing. Initial demo framing zooms farther out to accommodate the larger plots.

Layout tests verify unique block centres, coordinate round-trips and road clearances; the existing road and asset validation remains unchanged. Physical mobile performance remains unverified.


## Quaternius estate iteration

The current demo replaces the Unity office experiment with the original detailed Quaternius presets. Complete assemblies scale uniformly by 1.7–1.9 according to stable business identity, with both brick/metal variants, a stable one-tier silhouette variation and tier-based heights approximately 20–57m. The two wings align 19m from the plot centre along +X and -Z (bottom-right and top-right); the single large billboard remains at +Z (bottom-left). The lower frontage/taller-return variants add silhouette variation. The demo uses a minimum visual tier of 3 for substantial buildings; financial ranking is unchanged.

No module rebake or directional facade stretching is introduced. Near/far variants, relocation and arrival animation receive the same uniform transform. The Unity pack remains available in the standalone showcase but is no longer requested by the demo. Normal City buildings retain their earlier size and layout. Eight layout tests cover the legacy renderer and the estate bounds, right-edge alignment, varied presets and billboard clearance.


## Prefab restoration

The Quaternius estate iteration is reverted at the user�s request. The current demo again uses one centred Unity office prefab per 48m block, with the single large bottom-left billboard retained. Stable identity selects among the ten offices; no skyscrapers are used. The normal City and showcase remain unchanged.


### Current demo architecture

The layered-office experiment supersedes the Unity prefab selection in `/city/demo`. Demo estates now use six Quaternius podium-and-tower assemblies; this Unity showcase and all converted assets remain available for comparison. See [office experiment](synarc-city-megakit.md#layered-office-experiment-september-2026).
