# City studio UI v2: select, inspect, act

The construction studio (`/city?demo=1`) is reorganised around one loop: **select** something at the granularity you care about, **inspect** it on the right, **act** on it (or paint over it with one brush). It replaces the bottom tool belt with eight workspace tabs and sub-tabs. This is presentation and interaction only: no recipe, schema, validator, worker or backend change. Earlier history and feature docs: [city-studio-game-ux.md](city-studio-game-ux.md).

## Layout

A CSS grid shell (`.studio-shell` in `src/features/city/studio/studioShell.css`) lies over the canvas. Only the panels take pointer events; the stage passes clicks to the building.

```
┌──────────────────────── top bar: name · save state │ undo redo · sound · shortcuts │ Walk around · Done · Exit ┐
│ rail │ palette │                 stage                 │ views + storey rail │ inspector │
│  V   │ (per    │  (building; status line and notices   │ (top-right of stage)│ breadcrumb│
│  B   │  tool)  │   along the bottom edge)              │                     │ sections  │
│ ...  │         │            hotbar (bottom centre)     │                     │           │
└──────┴─────────┴───────────────────────────────────────┴─────────────────────┴───────────┘
```

- **Top bar:** building name and save state, undo/redo, sound, Isolate (`O`), the shortcut sheet (`?`), Walk around, Done, Exit.
- **Tool rail (left):** Select `V`, Build `B`, Paint `P`, Erase `E`, Roof `R`, Garden `G`, then Rooms `I` and Furnish `F`. Icon, hotkey badge and a tooltip with the hint. The chevron hides the palette.
- **Palette (flyout next to the rail):** content per tool, icons and thumbnails first, search on long kit lists, and a style filter (All / Tokyo / New York / Classic) wherever kit pieces or ideas are listed.
- **Stage:** camera views (Orbit, Top, Front, Frame selection) and the storey rail (add floor, floors, walls views All/Cut/Floor, slab) on its top-right edge; the status line, storefront unpack hint, roof notes and the "details need a little space" list on its bottom edge.
- **Inspector (right):** breadcrumb and contextual sections for the selection; in Rooms and Furnish it shows the room panel or the selected piece.
- **Hotbar (bottom centre):** quick slots `1`–`9` for recent brush items, a brush-size cycle button while painting or erasing, and New look (`Space`).
- **Narrow widths** (container queries on `.city-studio`): below 1180 px the panels slim down; below 860 px the inspector moves under the stage; below 600 px the stage is on top, then the inspector, the palette and a horizontal rail with the hotbar. On phones the palette and inspector share one slot: a Select selection shows the inspector and only the level chooser above the rail.
- Reduced motion turns off transitions; all controls are buttons with accessible names, tooltips carry hotkeys, and `Tab` keeps normal focus navigation while focus is in a panel.

## Selection model

`src/features/city/studioSelection.ts` (pure, unit-tested) and `studio/useStudioState.ts`.

- **Granularity filter** (Select palette, `Tab` / `Shift Tab` from the world): Part ▢, Wall ▭, Tile ▦, Opening ◫, Object. Each level has its own colour, used by the level chooser, the breadcrumb and the in-world outline: part amber (the existing dashed frame), wall blue, tile green, opening pink, object orange, erase red (`studio/StudioSceneMarks.tsx`).
- **Hover** highlights at the current level; **click** selects; **Shift** adds walls, tiles or openings; clicking empty space clears (Part level keeps the existing handle gizmo). **Double-click** drills Part → Wall → Tile → Opening. **Esc** and **Backspace** step up the breadcrumb; in another tool Esc first returns to Select.
- **Selection:** `building` · `part` · `wall` (one or more faces) · `tile` (bays on one face) · `opening` (free openings, kit tile openings or storefront stamps on one face) · `object` (decoration, skylight/dormer or roof detail). The part itself stays in `land.selectedVolume`, so handles, drawing, Ctrl+D and undo keep working; finer levels follow it and drop out when an edit or undo removes what they point at.
- **Delete** acts at the level: part → removes the part, opening/object → removes them, wall/tile → nothing (clearing a wall is an explicit erase). Furnishing still never deletes a building part (`studioKeys.ts`).
- **Picking** reuses the existing hit tests. The interaction hook gained one tool, `pick` (`useStudioInteraction.ts`): a click or hover resolves the bay and hit point (`hitBay`), the free opening on it (face-space picking), and, when no wall is in front, the roof opening (roof slope picking) and nearest roof detail on a flat roof. Pointer events report `detail` 0, so the hook counts double-clicks itself.

## Inspector sections

`studio/StudioInspector.tsx`. Sections are collapsible; advanced ones start closed.

| Selection | Contents |
|---|---|
| Building | name, part and storey count, New look (dice), Convert to editable facade, Default style (look, windows, quick roof), Variation and structure (variation rules and structure dimensions) |
| Part | kind and storeys; Duplicate, Rotate, Sculpt outline, Frame, Remove; Size (width, depth, storeys, base storey); Style (look, windows, quick roof, Shape roof); its walls as chips; Paint whole part (current brush finish), Reset local paint and openings; Erase on this part (openings, paint, decorations, trims, storefronts, roof details, with counts) |
| Wall | generated or kit tiles, plain/manual state; openings on the wall (select or remove each, unpack storefronts); facade rhythm on this wall (Unpack this wall, Make this wall plain, Keep this wall manual); Paint this wall, Paint a band; Erase on this wall |
| Tile | storey, module, entrance; Opening type (freeform shapes on generated walls, kit pieces with the style filter), Remove opening here; Paint this tile; decorations using the tile |
| Opening | free opening: shape, width and height, surround, Dress this opening (trims), remove; kit tile: swap piece, remove; storefront: unpack, remove; several: remove all |
| Object | skylight/dormer: dormer roof, window shape, remove; roof detail: turn, remove; decoration: look, Edit stair, remove |
| Rooms / Furnish | the room panel (rooms on this floor, floor finish, wall colour, open to below, Browse furniture) / the selected piece |

Below every exterior section sit the building rules: **Facade rhythm** (the existing `CityRhythmPanel`; opened from a wall or part it starts scoped to it, and its own scope/action picking pauses Select while active) and **Paint rules** (`CityPaintRulesPanel`, with its own toggle).

## Brush and eraser

`studio/PaletteBrush.tsx`. Paint and Erase are one brush in two modes (`E` toggles; the rail's Erase goes straight to erase mode). The palette asks **what to paint**:

| Target | Paint | Erase |
|---|---|---|
| Material | surface (wall, trim, frame, door), material, colour; Band and Around building; Sample (or Alt-click); C opens the quick paint ring | Tile/Freeform: the paint tool in restore mode (region erase on generated walls); Wall/Part: clears all paint there |
| Openings | Freeform shapes (Window … Arcade), Windows, Doors, Walls kit pieces with search and style filter | one opening (free or kit tile), or all on a wall/part |
| Storefronts | every studio stamp (`STUDIO_STOREFRONT_STAMPS`, including Tokyo) with style filter | one stamp, or all on a wall/part |
| Trims | click a free opening to toggle Shutters, Flower box, Keystone, Hood moulding, Stone lintel, Sill brackets, Canopy or Lamps | strips an opening's trims, or all on a wall/part |
| Decorations | Balcony, Cornice, Canopy, Stair, Pilaster, Ornament, Planter, Light (Simple/Ornate, stair options, placed stairs); Facade details (New York details, collection trims and Tokyo awning/fascia/hood) with style filter | decorations on a tile, or all on a wall/part |
| Roof details | Skylights and dormers, rooftop kit details (style filter, quick spots) | one skylight/dormer/detail, or all on a part |
| Themes | facade theme cards (thumbnails, search, style filter); click a part to theme it, Shift-click or Building size for the whole building, Alt-click (or the eyedropper) picks up a part's theme with its seed, colours and tuning; cards can also be dragged onto a part ([city-studio-themes.md](city-studio-themes.md#theme-brush)) | a part's own theme, or every theme at Building size / Shift-click |

**Size**: Tile, Wall, Part and Freeform for Material (Freeform adds Small/Medium/Large dabs and bands on generated walls); in erase mode every target takes Tile, Wall and Part. Themes take Part and Building in both modes; their Wall chip is shown disabled with a tooltip, because a theme's storefronts, decorations and roof props belong to a part. Sizes persist until changed. The hover footprint shows the size: tile highlights and the paint cursor while painting, a red outline of exactly what goes while erasing. Catalogues are read generically (`studioModules`, `STUDIO_STOREFRONT_STAMPS`, `FREE_TRIM_KINDS`, `ROOF_OPENING_PRESETS`), so new kit packs appear without UI changes. Every action is still one labelled undo step with the existing toasts, sounds and bursts; bulk erases are labelled "Remove openings on this wall" and so on.

Placing with a stroke tool (openings, decorations, storefronts) keeps the tool active; only drawing a block or dragging a handle returns to Select with the part selected.

## Build, hotbar, onboarding

- **Build palette:** big block icons Box, Round, Oval, Polygon (edit the selected part's outline: drag, add and remove corners, push/pull or move walls, bevel or recess corners, bay pulls; see [city-studio-sculpt-v2.md](city-studio-sculpt-v2.md)) and Cut; Starting ideas and the Blender collection open a sheet (style filter instead of the old New York toggle); My parts. Drawing on a roof still stacks on the storey above, and a drawn block is selected with its handles (Select at Part level).
- **Hotbar:** new brush items enter slot 1; items already in a slot keep it so number keys stay stable; nine slots, remembered per device (`city-studio-hotbar-v1`). Slots show a swatch, material sample, cut shape, kit thumbnail or theme thumbnail (a theme slot holds the theme on the Themes brush).
- **Onboarding:** a one-line-per-verb card on first visit (`city-studio-ui-v2-intro`; hidden in `cityStudioTest=1` runs unless `studioIntro=1`) and the shortcut sheet (`?`), generated from `STUDIO_SHORTCUTS`.
- Clicking the world hands keyboard focus back to it, so letters, Tab and Delete act on the building rather than the last panel button.

## Keys

| Key | Action |
|---|---|
| V B P E R G I F | Select, Build, Paint, Erase (toggle), Roof, Garden, Rooms, Furnish |
| Tab / Shift Tab | cycle Part, Wall, Tile, Opening, Object |
| Double-click | drill down |
| Esc / Backspace | step up (Esc also leaves other tools for Select) |
| Delete, Ctrl D | delete at the selection level, duplicate the part |
| 1 – 9 | hotbar slots |
| C, Alt click | quick paint ring, sample a finish |
| Space | New look |
| Z | frame the selection (was F, which is now Furnish) |
| O | Isolate on/off |
| PgUp / PgDn | storey |
| R | turn furniture or a roof detail while placing |
| ? | shortcut sheet |

## Isolate

The frame button in the top bar, or `O`, turns **Isolate** on and off. The edited building renders as usual. The rest of the scene gets cheaper and steps back:

- Every other studio plot is pinned to its far chunk and kit proxies (`CitySculptCity`): no near overlays, no medium/full kit, no free-door leaves and no shop interiors. The per-building path (`?cityGwBatch=0`) pins its detail batches far and drops interiors. Business buildings draw their simple representation (`CityVisibility`).
- Sun shadows (High quality) come only from the edited building. The shadow camera is fitted to the plot, and the parked car stops casting.
- Street figures, the car, the character's animation and launch-plaza motion pause.
- Beyond 40 m of the plot centre (62 m fully; more on larger plots) the city fades to a light, desaturated silhouette. The plot and its grounds stay fully visible. The fade is part of the canvas's fog node and is driven by uniforms, so toggling compiles no shaders.

The choice is remembered per device (`localStorage` `city-studio-isolate-v1`, guarded). Without a stored choice, Isolate is on for the existing low-power path (software-renderer detection; `?cityLowPower=1` in tests) and off elsewhere. Turning it off restores everything on the next frames without remounting the canvas. Walk around, Done and Exit restore the normal city. State: `src/features/city/cityStudioIsolate.ts`, a module store read by the renderer without scene re-renders. Development telemetry: `canvas.dataset.cityIsolate` (plot, fade radii, shadow radius) and `window.__cityGwStats.levels`.

Measured on the 396-plot unified benchmark city (`CITY_BENCH_ISOLATE=1 CITY_BENCH_VARIANTS=unified node scripts/city-generated-walls-benchmark.mjs`), native WebGPU, headless Edge, 1280 × 800, Balanced quality, from the studio view pulled back over its neighbours. The same camera was measured with Isolate on, then off again:

| Studio view | Off | On |
|---|---:|---:|
| Draw calls | 333 | 226 |
| Triangles | 1,200,594 | 813,694 |
| Frame p50 / p95 | 116.5 / 166.6 ms | 100.0 / 150.1 ms |
| Kit levels (plots) | near 2, full/medium 23, proxy 64 | proxy 89 |
| Textures | 28 | 22 |

The frame times come from a busy headless machine and are only comparable within the run. Screenshots: `output/isolate-bench-off.png` and `output/isolate-bench-on.png`. The benchmark's load check also reads the batched city's ready count, because a dynamic import of the registry can resolve to a second module instance after dev-server HMR.

## Old → new control map

Every control of the belt UI is still reachable.

| Old place | Control | Now |
|---|---|---|
| Header | name, save state, undo, redo, sound, Walk around, Done, Exit | top bar (unchanged names) |
| Header | Building help | top bar → shortcut sheet (`?`) |
| Camera bar | Orbit, Top, Front, Focus (F) | stage top-right; focus is `Z` |
| Storey rail | add floor, floors, All/Cut/Floor, slab | stage right edge (unchanged) |
| Belt | Build, Roof, Paint, Openings, Decorate, Garden, Rooms, Furniture (1–8) | rail Select/Build/Paint/Erase/Roof/Garden/Rooms/Furnish (letters); Openings → Paint › Openings / Storefronts; Decorate → Paint › Decorations |
| Belt | New look (Space) | hotbar and Inspector › Building |
| Belt | More → Build More | Inspector › Building › Variation and structure; Inspector › Part › Size |
| Context card | part kind/storeys, overlapping-part chooser | Inspector › Part; My parts in the Select and Build palettes |
| Context card | Move, Duplicate, Rotate, Remove | Part handles; Inspector › Part actions |
| Context card | Style: look, windows, Shape roof, quick roof, reset local paint and openings | Inspector › Part › Style / Paint; building defaults in Inspector › Building |
| Build tray | Select, Block, Round, Oval, Cut, Sculpt outline, Pull Wall/Bay, Corner Bevel/Recess | rail Select; Build › Box, Round, Oval, Cut, Polygon with the same options; Sculpt outline also on Inspector › Part |
| Build tray | Starting ideas (New York toggle), Blender collection, My parts, Empty plot, replace confirmation | Build › Starting ideas / Collection (style filter), My parts |
| Roof tray | roof styles, edges, joins, finishes, scope, precision; skylights and dormers; roof details, quick spots, rotate/remove | Roof palette (and Paint › Roof details for openings and details); a placed skylight/dormer opens in Inspector › Object |
| Openings › Rhythm | the whole rhythm panel | Inspector › Facade rhythm |
| Openings › Freeform | Window … Arcade, Remove | Paint › Openings › Freeform; Erase › Openings |
| Openings › Windows/Doors/Walls | kit pieces, Erase, Add Blender catalog | Paint › Openings › Windows/Doors/Walls (search, style filter), Erase › Openings, Add Blender catalog |
| Openings › Storefronts | stamps | Paint › Storefronts (now all studio stamps) |
| Openings | Convert to editable facade | Inspector › Building |
| Openings | Dress this opening (trims, remove, done) | Inspector › Opening (plus shape, size and surround) |
| Paint dock | channel, Small/Medium/Large, materials, swatches, custom colour | Paint › Material (Surface, Freeform sizes, Material, Colour) |
| Paint dock | Fill wall, Fill part | brush size Wall, Part (persistent) |
| Paint dock | Band, Around building, Sample finish | Paint › Material actions (Sample also Alt-click) |
| Paint dock | Restore tile | Erase › Material |
| Paint dock | Paint rules | Inspector (below every exterior section) |
| Decorate tray | look, Follow this wall, stair destination/exit/shape/flip, placed stairs (apply, remove), detail tiles, New York details, kit upgrade | Paint › Decorations (plus Tokyo trims and style filter) |
| Rooms tray | Add interiors, Draw wall, Door, Inside stair, door style/hinge, stair shape/flip, floor finish, wall colour, lists | Rooms palette |
| Room panel | rooms, selected room finish/colour/open to below, Browse furniture, choose room | Inspector (Rooms); "Choose room" tile in the Rooms palette |
| Furniture tray | library, search, categories, placed list, move, rotate, duplicate, delete | Furnish palette (unchanged) |
| Garden tray | planting, New arrangement, ground, boundary | Garden palette |
| Overlays | touch confirm, quick paint ring, toasts, unified notice, status line, retry, roof notes, inactive details, unpack storefront hint | unchanged; notices sit on the stage's bottom edge |

## Files

- `src/features/city/CityStudio.tsx` (from 87 KB to about 15 KB): 3D gizmos, ghosts and telemetry; mounts the shell.
- `src/features/city/studio/`: `useStudioState.ts` (state, recipe actions, keys), `useStudioCamera.ts`, `useStudioHotbar.ts`, `studioHandles.ts` (moved out of `useStudioInteraction.ts`), `StudioOverlay.tsx` (shell, top bar, stage, starters), `StudioToolRail.tsx`, `StudioPalette.tsx`, `PaletteBrush.tsx`, `RoofExtras.tsx`, `StudioInspector.tsx`, `StudioHotbar.tsx`, `StudioShortcutSheet.tsx`, `StudioSceneMarks.tsx`, `StudioDragGhosts.tsx`, `studioStatus.tsx`, `studioStyles.tsx`, `studioShell.css`.
- Pure and tested: `studioRail.ts` (rail, levels, targets, sizes, hotbar, shortcuts), `studioSelection.ts` (breadcrumb, stepping up, bulk erase, lookups), `studioKeys.ts` (level-aware Delete). `CityStudioToolBelt.tsx` and the belt registry are gone.
- Obsolete dock, belt, floating-card and dock-relative status rules were removed from `cityStudio.css`.

## Verification

- `npx tsc --noEmit`; `node --experimental-strip-types --test src/domain/cityStudio*.test.ts src/features/city/studio*.test.ts` (includes `studioRail.test.ts`, `studioSelection.test.ts`, `studioKeys.test.ts`).
- `scripts/city-studio-isolate-browser.mjs`: Isolate by button and `O`; neighbour levels (only `proxy`/`hidden`, no overlays), fade and shadow telemetry, lower draw calls and triangles, character paused and resumed, no canvas remount, per-device memory, restoration after Done, the low-power default; a fresh empty plot with no contact mark, one after drawing a block and none after undo, also in the city after Done. Screenshots: `output/isolate-on.png`, `output/isolate-off.png`, `output/empty-plot.png`, `output/empty-plot-block.png`.
- `scripts/city-studio-theme-brush-browser.mjs`: the Themes target, hover label, part and building painting, the eyedropper, erase, card drags (mouse, touch, Esc, outside) and a themed starter from a gallery drag; see [city-studio-themes.md](city-studio-themes.md#theme-brush).
- `scripts/city-studio-ui-v2-browser.mjs`: rail hotkeys and each palette, Part/Wall/Tile/Opening/Object selection with hover and breadcrumb, double-click drill and Esc, Tab, level-aware Delete, inspector duplicate and Paint this wall, brush colour on a wall, brushed openings, target-filtered erase, bulk erase with one-step undo, Box and Oval blocks, phone layout. Screenshots: `output/ui-v2-*.png`: desktop `select`, `build`, `paint`, `erase`, `roof`, `garden`, `rooms`, `furnish`, `shortcuts`, `inspector-part`, `inspector-wall`, `inspector-tile`, `inspector-object`, `inspector-opening`, `brush-paint`, `brush-opening`, `erase-hover`; phone `mobile-select`, `mobile-paint`, `mobile-erase`, `mobile-build`, `mobile-roof`, `mobile-garden`, `mobile-rooms`, `mobile-furnish`, `mobile-inspector`.
- The studio overlay is a drei `Html` root, separate from the scene's React root, so a panel click reaches the scene a tick later; the helpers wait for the canvas telemetry (`rail`, `target`, `level`) before clicking the building.
- The older suites drive the new UI through `scripts/city-studio-ui.mjs` (rail, brush target and size, opening group, Select level, inspector, visible-bay helpers) and keep their behavioural assertions.

## Known gaps

- Part level has no Shift multi-selection; walls, tiles and openings do.
- The openings, storefront, trim, decoration and roof targets paint one item per click; sizes apply to them only in erase mode. The Themes target paints a part or the building, never a single wall.
- Generated rhythm openings are not stored, so they cannot be selected or erased one by one: unpack the wall or make it plain.
- Object level covers decorations, skylights/dormers and roof details; furniture and rooms are edited in their own tools, and garden planting has no objects.
- Wall and tile highlights are tinted bay planes, which approximate curved walls facet by facet.
- While the Facade rhythm panel picks scopes or runs a wall action, clicks go to the panel instead of Select (as before).
- The tile inspector lists at most 24 kit pieces (the brush palette lists all).
- WebGL2 was not re-run this round; phone layout is verified by emulation at 390 × 844 only.
