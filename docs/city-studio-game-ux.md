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
| 2. Tool belt and floor rail | 8 hotkeyed tools replace workspace + mode; one floor rail with walls All/Cut/Floor; context card near selection; shared catalogue drawer; dropdowns become chips | Mostly done: belt, rail, hotkeys, context card and garden/stair chips. Shared catalogue drawer, roof-tray dropdowns and splitting `useStudioInteraction` remain |
| 3. Direct manipulation | World-space height handles with storey notches and live measurements; cursor-local grid; roof pitch/eave handles; click-to-place roof extras; stair destination by clicking; brush sizes | Planned |
| 4. Feel layer | Bundled CC0 SFX with mute; spring pops, dust/splash particles, cutaway wall fades, snap guides, dice facade flip | Planned |
| 5. Furnish and Style sheet | Wall-snap furniture, drag-to-move, eyedropper, touch drag; layer cards with locks, thumbnail pools and 3D region brushing | Planned |
| 6. Onboarding and flow | Silent kit/interior upgrades, starter carousel, first-build quest, Done reveal, photo mode, retire old preset editor | Planned |

Building stays a pure sandbox: no costs or budgets.

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
- **Tests:** browser suites use the new tool names. `scripts/city-studio-game-ux-browser.mjs` covers the belt, number keys, rail, PageUp/PageDown, walls view and context card.

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
