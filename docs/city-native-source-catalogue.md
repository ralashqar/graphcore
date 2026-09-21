# Quaternius source catalogue

Source: `Downtown City MegaKit[Source]/Exports/glTF` (CC0).

The customiser exposes 39 facade recipes, with the source asset filename visible in both the selector and browser grid. The five-value automatic family preset is separate from this module library. All vertical wall/window source modules are selectable, including asymmetric white-brick returns, trim bay and weathered upper window sections. Eight additional solid/inset variants expand the original 27 recipes alongside four added window modules.

The source contains 36 window-named files. Their roles are recorded below; roof dormers and bay caps are not misrepresented as full wall tiles.

| Source file | Application role |
|---|---|
| `Brick_BayWindow` | Selectable facade module |
| `Brick_Inset_Window` | Selectable facade module |
| `Brick_Inset_Window_Curved` | Selectable facade module |
| `Brick_Inset_Window_Curved_Small` | Selectable facade module |
| `Brick_RedWhite_DoubleWindow` | Selectable facade module |
| `Brick_Window_CurvedDouble` | Selectable facade module |
| `Brick_Window_Square_Single` | Selectable facade module |
| `Brick_Window_Trim` | Selectable facade module |
| `Brick_Window_Trim_Single` | Selectable facade module |
| `Floor_BayWindow` | Bay support/cap; not a standalone wall module |
| `Marble_ShopWindow` | Selectable facade module |
| `Marble_Window` | Selectable facade module |
| `Marble_Window_Single` | Selectable facade module |
| `Marble_WindowTriple` | Selectable facade module |
| `Metal_BayWindow_Bottom` | Selectable facade module |
| `Metal_FirstFloor_Window` | Selectable facade module |
| `Metal_FullWindow` | Selectable facade module |
| `Metal_Panel_Window_4` | Selectable facade module |
| `Metal_Window` | Selectable facade module |
| `Metal_Window_Half` | Selectable facade module |
| `Roof_Slate_Window_1` | Roof-only dormer; not a vertical wall module |
| `Roof_SlateCornice_Window_1` | Roof-only dormer; not a vertical wall module |
| `Trim_BayWindow` | Selectable facade module |
| `Trim_BayWindow_Corner_L` | Bay support/cap; not a standalone wall module |
| `Trim_BayWindow_Corner_R` | Bay support/cap; not a standalone wall module |
| `Trim_BayWindow_Top` | Bay support/cap; not a standalone wall module |
| `Trim_FirstFloor_Window` | Selectable facade module |
| `Trim_FirstFloor_Window_Columns` | Selectable facade module |
| `Trim_Window` | Selectable facade module |
| `WhiteBrick_Window` | Selectable facade module |
| `WhiteBrick_Window_Center` | Selectable facade module |
| `WhiteBrick_Window_L` | Selectable facade module |
| `WhiteBrick_Window_R` | Selectable facade module |
| `WornBrick_WindowLarge` | Selectable facade module |
| `WornBrick_WindowLarge_Top` | Selectable facade module |
| `WornBrick_WindowTriple` | Selectable facade module |

Native pack v7: 8,120,760 bytes. Uniform module fitting, native fillers, inward edge returns and source texture handling remain shared between editor and city. Existing recipe IDs remain valid. The optional nativeFacade enum imports the catalogue directly; no database migration is needed.

Staging rollout remains pending: matching City endpoints and the shared-profile-consuming world worker city-design-3.9 must be deployed together. No production activation or provider spending is included.

Verification: all 39 UI choices, mocked save/reload, undo/redo, mobile layout and driving controls pass. All 11 shared Deno profile tests pass. Actual GLB ray coverage identified and corrected the trim bay overhang/structural-span mismatch; the targeted trim-bay regression passes. TypeScript and fresh Vite runtime checks pass, with the existing public-manifest import warning. No physical-mobile benchmark was performed.

Final verification: the complete 21-test geometry/assembly/demo suite passes, including every new module across the supported footprints. Production build passes with existing large-chunk and landing-atlas warnings.

Architectural assembly update (2026-09-22): pack v8 now contains 142 curated nodes (9,203,212 bytes), including the connected corner/cornice, entrance, slate-roof and grounds sets described in [city-architectural-assemblies.md](city-architectural-assemblies.md). The 39 facade choices remain unchanged. Matching staged worker revision is city-design-3.10.
