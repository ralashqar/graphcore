# City studio game UX revamp

The construction studio (`/city?demo=1`, opt out with `cityStudio=0`) should feel like a building game in the spirit of Tiny Glade, The Sims build/buy and Townscaper, not a form. The recipe/domain layer and worker pipeline stay unchanged; this is a presentation, interaction and feel revamp.

## Pillars

1. The world is the UI: edit on the building with handles, brushes and in-world labels.
2. One verb at a time: a flat tool belt instead of workspace → mode → sub-tab → Build More.
3. Every action answers back: hover, ghost, snap tick, pop, dust, sound.
4. Undo is one step per player intention, labelled and confirmed.
5. Beautiful by default: dice and suggestions first, exact numbers on request.
6. Calm pacing, and reduced motion respected everywhere.

## Phases

| Phase | Scope | Status |
|---|---|---|
| 1. Foundations | Intention-sized labelled undo with toast, Delete/duplicate routing by workspace, hover glow in Select, camera glides, grid for rooms/furniture | Done (see below) |
| 2. Tool belt and floor rail | 8 hotkeyed tools replace workspace + mode; one floor rail with walls All/Cut/Floor; context card near selection; shared catalogue drawer; dropdowns become chips | Mostly done: belt, rail, hotkeys, context card, garden/stair/roof chips. Shared catalogue drawer and splitting `useStudioInteraction` remain |
| 3. Direct manipulation | World-space height handles with storey notches and live measurements; cursor-local grid; roof pitch/eave handles; click-to-place roof extras; stair destination by clicking; brush sizes | Started: world-space height/lift handles and live measurements. Roof handles, click-to-place roof extras, clickable stair destinations and a cursor grid remain |
| 4. Feel layer | Sounds with mute; pops, dust/splash particles, cutaway wall fades, snap guides, dice facade flip | Started: procedural sounds, edit bursts, drag ticks, room chime, mute. Cutaway fades, snap guides and dice flip remain |
| 5. Furnish and Style sheet | Wall-snap furniture, drag-to-move, eyedropper, touch drag; layer cards with locks, thumbnail pools and 3D region brushing | Planned |
| 6. Onboarding and flow | Silent kit/interior upgrades, starter carousel, first-build quest, Done reveal, photo mode, retire old preset editor | Planned |

Building stays a pure sandbox: no costs or budgets.

## Tiny Glade direction: quick wins (implemented)

Research notes:
- Tiny Glade builds everything from rules, not tiles.
- A window becomes a door, a merged multi-panel window or a trapdoor depending on where it lands.
- Roofs fit the footprint.
- Walls store their distance to windows so the shader can blend plaster around them.

The quick wins below bring the studio's handles and feedback closer to that. Free openings, which bring the rules themselves, are a separate proof of concept.

- **Part gizmo:**
  - The selected part shows a dashed construction frame (`studioFrame.ts`, `CityStudioPartFrame`) instead of a solid wireframe.
  - Handles are round white chips: Move, Height, Lift, and a new Turn handle at the base corner.
- **Free rotation** (`cityStudioRotate.ts`):
  - Turn sweeps the part around its centre, snapping to 15° (Shift turns freely).
  - Rectangles and polygons become polygons that keep their wall ids, so anchored paint, openings and details stay on their walls.
  - Circles ignore rotation; ovals report that they cannot turn yet.
- **Place where you click:** drawing a block over an existing part starts on the storey above it (roof stacking). Elsewhere the storey rail decides.
- **Frame first:**
  - While drawing, the ghost shows a dashed frame including a gable, hip or mansard roof silhouette from the style that will apply.
  - After commit, a warm shell sweeps up from the foundation while the frame fades.
- **Quick paint ring** (`CityStudioPaintRing`):
  - In Paint, pressing C over a tile opens a ring around the cursor: colours outside, materials inside.
  - Hovering previews the stroke live through the existing sculpt preview. Clicking applies it as one undo step and makes it the current brush. Escape, C or an outside click cancels.
  - The interaction hook ignores keys while the ring is open.

## Free openings (Tiny Glade-style, local proof of concept)

Openings no longer have to be bay tiles. The optional, local-only `studio.freeOpenings` field stores openings anywhere on a straight part face:

```
{id, shapeId, side, u (continuous 0..1 like StudioAnchor.u), bottom (m above the part base), width, height, shape: rect|arch|round|pointed, style?: timber|stone|painted, glazing?}
```

- **Rules** (`cityStudioFreeOpenings.ts`):
  - **Door:** an opening that touches the base of a ground-level part becomes a door (round openings never do). Placing within 0.45 m of the base snaps it down.
  - **Merge:** neighbours on the same face with a gap under 0.25 m and more than 60% vertical overlap merge into one mullioned window.
  - **Fitting:** openings are drawn within 0.3 m side and 0.2 m top margins. Stored positions are never moved.
  - **Inactive with a reason:** openings that cannot fit, or sit on walls hidden by other parts, are listed rather than moved.
- **Geometry** (`cityStudioFreeOpeningGeometry.ts`, typed arrays built inside the existing sculpt worker):
  - A face that has any free opening owns its exposed wall: its kit tiles are suppressed, and kit openings on it are reported inactive ("Free openings own this wall").
  - The face is rebuilt with real holes, 0.3 m reveals, surrounds and frames swept along arch and pointed curves, sills, stone mullions, recessed glazing and doors.
  - A per-vertex distance-to-opening attribute drives a stone and plaster wear band in the TSL wall material (`CityStudioFreeOpeningFace`), Tiny Glade's blending technique.
  - Ground-floor blockers are split around free doors so they can be walked through, and a kit entrance on an owned face moves to the free door.
- **Studio tool:**
  - Openings has a **Freeform** group with Window, Wide window, Tall window, Arch, Pointed arch, Round window, Arched door and Remove.
  - A shaped ghost follows the pointer on the wall, warmer when it will become a door.
  - Click cuts an opening. Dragging an existing one slides it along its face with a live preview, and the release is one undo step. Remove deletes the one clicked.
  - Helpers live in `studioFreeOpeningTool.ts`.
- **Hover highlight:** now a warm dashed frame instead of a tinted shell, so recessed glazing is not tinted.
- **Validation:**
  - `validateStudio` accepts free openings for local plots.
  - `validateModularBuilding` and `validateVariationRecipe` keep rejecting them, so business profiles, the shared schema and the world worker are unchanged. Taking this to hosted saving would need the usual paired City endpoint/world-worker rollout.
- **Limits:**
  - Straight faces only.
  - A face spans all its storeys, so floor slicing hides it whole, and a tall window can cross an interior slab.
  - No interior portals for free doors yet.
  - Per-tile paint on owned faces is ignored (the wall takes the part's floor-0 finish).
  - Each owned face adds roughly 5 draw calls and a few thousand triangles; faces are not instanced.
- **Measurements:**
  - A face with 10 openings resolves and builds in about 15 ms warm in Node.
  - The fixture's full `resolveSculpt` took 90–160 ms in the page thread. It normally runs in the worker.
- **Tests:**
  - `src/domain/cityStudioFreeOpenings.test.ts`: rules, geometry, validators and integration.
  - `src/features/city/studioFreeOpeningTool.test.ts`: outlines, door snap, picking.
  - `scripts/city-studio-free-openings-browser.mjs`: rendering on WebGPU and WebGL2, then the Freeform ghost, cut, drag, undo and remove.

## Phase 4 (implemented so far)

- **Sounds** (`studioAudio.ts`):
  - Short cues are synthesised with Web Audio, so no audio files are bundled or downloaded: build, grow, place, paint, remove, dice, tick, undo/redo, invalid and chime.
  - ±8% pitch variance and per-cue throttling.
  - Silent while the tab is hidden.
  - A header toggle mutes sound, remembered per device (`city-studio-muted`).
  - A CC0 sample pack can replace the synthesis later without changing call sites.
- **Cues follow edits, not buttons:**
  - `useCityLand` emits a `lastEdit` signal (label and continuous flag) for every recorded edit, and `studioCueForEdit` maps its history label to a sound.
  - Continuous controls tick instead of playing full cues.
  - Invalid placements thunk.
  - Closing a new room on the current floor chimes.
  - Dragging ticks on every storey or size snap.
- **Bursts** (`studioJuice.ts`, `CityStudioJuice`):
  - `studioJuiceBursts` diffs the recipe before and after an edit, capped at 24 bursts per edit:
    - new part: a dust puff and pop shell;
    - taller part: a pop at the new roof line;
    - removed part: settling dust;
    - openings, details and furniture: a pop where they land;
    - painted tiles: a splash in the paint colour.
  - Each burst lasts 0.62 s with pooled instanced particles.
  - Nothing renders under reduced motion.
- **Paint dock:** stays centred with the belt instead of jumping to a narrow right-hand panel. Old `.studio-dock>nav` rules are gone.
- **Compact belt:** the furniture library keeps its right-hand panel so the room stays visible. A container query switches the belt to icons with hotkey hints in docks narrower than 640 px (the furniture panel and phones); labels remain as accessible names.
- **Furniture suite:** `city-furniture-browser.mjs` now nudges the pointer until the placement ghost is ready, as a player moving the mouse would. A single move was intermittently read before the ghost had been computed.

## Phase 3 (implemented so far)

- **Height and Lift handles:**
  - Drag on a vertical, camera-facing plane through the part and snap to the nearest storey line (`studioStoreys.ts`).
  - Dragging behaves the same at any zoom.
  - A drag that ends where it started commits nothing.
- **Live measurements:** while dragging or drawing a part, a pill shows `W × D m · N storeys · H m` (and the base storey when lifted).
- **Roof tray:** edge, join and finish are chips (finish with colour swatches) instead of selects.

## Phase 2 (implemented so far)

- **Tool belt** (`CityStudioToolBelt`, registry `studioTools.ts`):
  - Build, Roof, Paint, Openings, Decorate, Garden, Rooms and Furniture on keys 1–8.
  - "New look" style dice on Space (disabled until the building uses the Blender catalog).
  - "More" opens Build More.
  - Replaces the four workspaces and their mode buttons.
- **Storey rail** (`CityStudioFloorRail`):
  - One vertical storey control on the left, shared by every tool, with PageUp/PageDown and Add floor.
  - Walls view All / Cut / Floor.
  - A slab toggle while in Rooms or Furniture.
  - Replaces the camera-bar storey stepper, the view toggles and the separate interior floor panel. The camera cluster now holds only Orbit / Top / Front / Focus (F).
- **Context card:** the selected part's actions and style panel float above the part (drei `Html`) instead of a fixed side panel, and hide while dragging.
- **Chips:** stair destination, ground finish and plot boundary are button groups instead of selects. "New arrangement" gets a dice icon.
- **Tests:** browser suites use the new tool names. `scripts/city-studio-game-ux-browser.mjs` covers:
  - the belt, number keys, rail, PageUp/PageDown, walls view and context card;
  - the world-space height drag with live measurement and one-step undo;
  - a paint burst and the remembered mute.

## Phase 1 (implemented)

- **Undo history** (`src/domain/cityLandHistory.ts`, used by `useCityLand`):
  - Entries carry a player-facing label (e.g. "Rename building", "Add furniture", "Paint").
  - Continuous DOM controls coalesce into one entry per interaction: range, colour, number and text inputs, grouped by element with a 1.2 s idle window. Clicks, selects and 3D gestures still record their own entry.
  - The cap is raised from 50 to 100.
  - Undo/redo show a short toast (`CityStudioToast`).
- **Keyboard routing** (`src/features/city/studioKeys.ts`):
  - Delete removes the selected furniture while furnishing and never removes a building part selected earlier from an interior workspace.
  - Ctrl+D duplicates parts only in exterior workspaces.
  - The listener is bound once.
- **Camera glides** (`src/features/city/studioCameraGlide.ts`):
  - View presets, focus and interior floor framing ease over 520 ms, arcing around the building in spherical coordinates.
  - Orbiting cancels a glide.
  - Reduced motion keeps instant jumps.
  - Browser fixtures (`cityStudioTest=1`) also keep instant jumps, because they read screen positions right after view changes. Add `studioGlide=1` to test glides.
  - The canvas dataset reports `gliding`.
- **Hover glow** (`CityStudioHoverShell`): in Select, the part under the cursor gets a soft outset shell. The canvas test dataset exposes `hoverPart`.
- **Floor grid:** the grid also shows for interior tools (rooms, doors, stairs, furniture).

### Verification

- Unit tests: `node --experimental-strip-types --test src/domain/cityLandHistory.test.ts src/features/city/studioKeys.test.ts src/features/city/studioCameraGlide.test.ts`.
- Browser: typing a new building name produced one history entry, and one undo restored the name and showed "Undid: Rename building".
- Existing suites were run against the dev server; see the release notes for results.
- Mid-flight camera frames could not be captured in a hidden browser pane; the final poses were verified.

No schema, backend, provider or deployment change.
