# Facade themes (local construction studio)

A theme dresses one part, or the whole building, in one go. It sets:

- the facade rhythm (pools, coverage, pattern and uniformity per layer);
- colours, materials and the roof;
- paint rules;
- ground-floor storefronts and an entrance;
- decorations: fire escapes, balconies, AC units, vertical signs, lanterns, pipes, awnings, shop lights, wall lamps,
  cornices, belt courses, piers, ornaments and street objects;
- rooftop props.

Themes are resolved from a small stored reference at resolve time. So a themed part re-fits when it is resized or
reshaped, and it fills around hand-placed items.

This is local studio work only. Business and profile validators reject the new field, business behaviour is unchanged,
and there is no schema, backend, provider or deployment change.

## Model

### Theme data (`src/domain/cityStudioThemeCatalog.ts`)

`FacadeTheme` is pure data. It has no runtime imports, so `validateStudio` can import its validator.

| Field | Meaning |
|---|---|
| `rhythm` | The rhythm style (slot geometry) plus `variety`, `trims`, `bay`, `density` and v2 `layers`: pools, including `module:<kit id>` pieces, with coverage, spacing, pattern and uniformity for the ground, upper, top, corners and trims layers. |
| `look` | Family, 1–8 colourways (wall finish with texture, trim, frame, door), roof type and roof settings. |
| `paint` | Paint rules: plinths, floors, string-course bands, friezes, quoins and alternating columns. A finish can be a token (`trim`, `frame`, `door`) that follows the current colourway. |
| `shops` | Stamp families (`stamp-sf-bodega`, `stamp-tokyo-ramen`…; every span of a family is a candidate) with weights. `density` is the share of free street bays. `random` goes from 0 (regular gaps) to 1 (seeded gaps). An optional `entrance` puts a kit door on its own bay at the start, end, centre or a random position. |
| `decor` | Entries `{kind, modules?, density, floors?, align?, corners?, sides?, variant?, span?, depth?, edge?}`. |
| `roof` | Weighted rooftop modules and a density. |
| `starter` | The standard size used for empty plots. |
| `legacy` | The old rhythm style this theme replaces. |
| `tags` | Style filter ids. |

The `decor` entry fields:

- `floors`: building floor indices, or `ground`, `upper`, `top`, `below-top` or `all`.
- `align`: `stacked` (one roll per column), `alternating` (every other storey), `random` (per cell) or `row` (per storey).
- `corners`: `avoid`, `only` or `any`.
- `sides`: `street` or `all`.
- For balconies:
  - `variant`: `iron`, `classic`, `slab` or `juliet`;
  - `span`: `column` or `run` (continuous along a storey);
  - `depth`.
- `edge` (strips only): `left`, `right` or `either`.

### Stored reference (`studio.facadeThemes`)

`studio.facadeThemes?: StudioThemeRef[]` holds up to 33 references: one for the building and one per part. Each is:

```
{id, theme, partId?, seed, palette?, tune?, locks?, seeds?, detached?}
```

- `tune[aspect]` is an absolute density from 0 to 1 that replaces the theme's own density for that aspect. Entries of
  the same kind scale proportionally.
- `seeds[aspect]` are reroll counters.
- `locks` lists aspects a reroll must keep.
- The aspects are `shops`, each decoration kind, and `roof`.

A part uses its own reference, else the building's. `validateFacadeThemes` runs from `validateStudio`. It checks keys,
known themes, integer seeds, densities from 0 to 1, known aspects and one reference per scope. `validateModularBuilding`
and `validateVariationRecipe` reject the field through their key whitelists.

### What applying writes (`src/domain/cityStudioThemes.ts`)

`applyFacadeTheme(recipe, design, themeId, {partId?, seed?, palette?})` does the following, as one undo step in the
studio:

1. A kit-tile building is converted to unified facades first (`convertToUnifiedFacade`), and the recipe switches to the
   Blender catalogue.
2. It writes the theme's rhythm as ordinary rhythm settings at the scope. For a part, this is a `{partId}` rule. For the
   building, it is the base and every rule's styling is dropped. Plain (`off`) and keep-manual wall rules survive.
3. It writes the colourway, family and roof to `studio.parts[partId]` or to the defaults. Applying to the whole building
   clears part overrides and part themes.
4. It stores the reference.

Everything else is resolved each time.

### Resolve time

**Before bays and rhythm** (`cityStudioThemeExpand.ts`, called first in `expandBuildingVariation`, so every caller
sees the same themed recipe):

- **Paint rules** (`theme/<ref>/paint/<n>`), placed before the user's own rules, which win. They are scoped to the parts
  the reference themes.
- **Edge strips**: vertical signs, lanterns and pipes. These are Tokyo kit wall panels, added as generated free
  openings at one end of a face and stacked per storey. The rhythm fills around them like any kit piece.
- **The entrance**: a kit door, added as a generated free opening, on a free ground bay of the street face. It is skipped
  when the part already has a door.
- **Storefronts**: generated stamps (`theme-<ref>-…`) walk the free street bays in order. Bays are skipped when they hold
  the resolved entrance (unless a theme door has taken over), manual or generated openings with their edge margin,
  hand-placed stamps or kit tiles. At each free bay a seeded or regular gap is rolled; otherwise a shop family is picked
  with the widest span that fits (or a random span at high randomness). Stamps then expand exactly like hand-placed
  ones, with their awnings, fascias, signs and street dressing. The v2 rhythm treats them as manual spans.

**After the rhythm** (`cityStudioThemeDecor.ts`, one call in `resolveStudio`):

Openings are grouped into cells: rhythm panels merge per column, and hand-placed openings stand alone. Decorations are
then placed on those cells:

| Kind | Placement |
|---|---|
| Fire escapes | The street face of parts with 3+ storeys, over a pair of neighbouring columns. Landings (NYC balcony slab, rails, brackets, walkable decks) on every upper storey, with alternating step flights between them. |
| Balconies | Per column (opening width plus a margin) or as continuous runs, split around fire escapes. Iron, classic, slab or juliet. Rails are colliders and slabs are decks. |
| AC units | The Tokyo wall AC with its slab omitted, under windows whose sill is at least 0.6 m. |
| Awnings, shop lights | Over ground openings that are not stamps, kept inside the storey. |
| Wall lamps | Beside doors, including stamp doors. |
| Ornaments | Over windows. |
| Cornices, belt courses | Stretched along exposed spans: the top of the part and storey lines. Chunked on curves and for NYC cornices. |
| Piers, pilasters | At wall ends and between columns, storey by storey. |
| Street objects | In front of ground openings. Door-safe pieces only near doors; walking colliders; spacing from stamp dressing. |
| Rooftop props | Seeded spots fitted through `resolveStudioRoofDetails`. Props that do not fit are skipped silently. |

Rolls use `themeRoll(ref, aspect, …)`: seed, aspect, reroll counter and position. Densities come from `themeDensity`
(the theme's value or the tuned one). Pieces that would leave the plot are left out, and nothing ever becomes inactive.

## Themes (25)

| Id | Theme | In one line |
|---|---|---|
| `nyc-tenement` | NYC walk-up tenement | Brick sashes, fire escapes, window AC units, a pressed-metal cornice, bodega, deli, laundromat and barber, water tanks. |
| `nyc-cast-iron` | NYC cast-iron loft | Uniform tall loft windows between piers, a band on every storey, a glazed shop base and a bank door. |
| `nyc-brownstone` | NYC brownstone | Arched parlour windows, hooded sashes with flower boxes, a juliet balcony, lamps, a sandstone plinth. |
| `tokyo-zakkyo` | Tokyo zakkyo building | Dense and random: ribbon windows, AC sashes, stacked vertical signs, pipes, konbini, izakaya and ramen, billboards. |
| `tokyo-shotengai` | Tokyo shotengai shophouse | Shutter shops, ramen and izakaya, lanterns, rail balconies, bicycles and pots, laundry on the roof. |
| `tokyo-mansion` | Tokyo mansion apartment | Uniform enclosed and rail balconies with laundry poles, a glazed lobby, meters and AC units. |
| `london-georgian` | London Georgian townhouse | Stock brick over a stucco ground floor, iron balconettes on the first floor, a string course, cornice and mansard. |
| `london-high-street` | London Victorian high street | Pub, bookshop, butcher and greengrocer under bay windows, brick cornice and gable. |
| `paris-haussmann` | Paris Haussmann | Limestone French windows, continuous wrought balconies on the 2nd and 5th floors, a café base and a mansard. |
| `amsterdam-canal` | Amsterdam canal house | Narrow, dark brick, white frames, a steep street gable, bicycles by the door. |
| `italian-palazzo` | Italian palazzo | Ochre render, shuttered arches, rusticated ground floor with quoins, a piano-nobile balcony, trattoria and a hipped roof. |
| `mediterranean-village` | Mediterranean village house | Whitewash, sparse random small windows with shutters, blue doors, pots and a terrace. |
| `scandi-modern` | Scandinavian modern | Timber or white render, large uniform windows, slab balconies, a dark lean-to roof and solar panels. |
| `brutalist-civic` | Brutalist civic | Raw concrete, identical windows between fins, slab-edge bands, a blank attic, plant on the roof. |
| `art-deco-office` | Art deco office | Limestone and gold, deco windows between pilasters, banded crown and a bank entrance. |
| `glass-office` | Glass modern office | A curtain wall with slab bands, a glazed lobby and a coffee kiosk. |
| `suburban-cottage` | Suburban cottage | Pastel cottage windows, shutters, flower boxes, a lamp by the door and a tiled gable. |
| `warehouse-conversion` | Warehouse conversion | Industrial arched windows, a painted sign band, a fire escape, a shuttered shop, water tanks and skylights. |
| `chinatown-shophouse` | Chinatown shophouse | Vertical signs and red lanterns, shop lanterns, a first-floor veranda balcony, busy shops. |
| `seaside` | Beach and seaside | Pastels, striped awnings, open balconies, a gelateria with parasols and a terrace. |
| `soviet-block` | Soviet panel block | A strict panel grid with joints, alternating panel tones, stacked slab balconies and antennas. |
| `mexican-colonial` | Mexican colonial | Saturated colour, an arched stone base, iron balconies over shutters, a painted plinth and frieze. |
| `victorian-terrace` | Victorian terrace | Red brick, canted bay windows, hooded sashes, cream string courses, chimneys and a slate gable. |
| `german-half-timber` | Old-town half-timber | Cream plaster with timber bands and corner posts, a stone plinth, small paired windows and a steep roof. |
| `civic-classical` | Civic classical | A stone arcade, pilasters between arched windows, round attic lights, a heavy cornice. |

The old style chooser maps onto themes (`themeForStyle`):

| Old style | Theme |
|---|---|
| townhouse | London Georgian |
| shopfront | London Victorian high street |
| civic | Civic classical |
| cottage | Suburban cottage |
| warehouse | Warehouse conversion |
| loft | NYC cast-iron loft |
| tokyo | Tokyo zakkyo |

Rhythm styles are unchanged. The rhythm panel shows a **Full theme: …** button under its style tiles for the building
or a single chosen part.

Thumbnails are `public/city/themes/<id>.jpg` (320 × 240). They are rendered by
`scripts/build-city-theme-thumbnails.mjs`: every theme on the same 12 × 10 m, four-storey test building, applied through
the gallery with `?themeSeed=7`, on native WebGPU, and resized with sharp. Until a thumbnail exists the gallery draws a
colour swatch from the first colourway.

## Studio UI (`src/features/city/studio/StudioThemes.tsx`)

- **Themes gallery.** A sheet of thumbnail cards with a search box (label, description and tags) and the shared style
  filter. It opens from:
  - Inspector › Part › Theme (**Apply theme to this part**);
  - Inspector › Building › Theme (**Apply to whole building**);
  - Build › Start from › **Themes**, or the **Themes…** tile in Starting ideas. On an empty plot, or from the ideas, it
    builds the theme's starter box, themed.

  Picking a card is one labelled undo step, for example "Theme part: Tokyo zakkyo building", with the usual cue and
  bursts; undo shows "Undid: …". `?themeSeed=<n>` fixes the seed for reproducible runs; otherwise every apply rolls a
  new look.
- **Theme section in the inspector,** for a part or the building. A part without its own theme says which building theme
  dresses it. The section has:
  - the active theme's thumbnail and description;
  - **Reroll theme** (dice: every unlocked aspect plus the rhythm at that scope);
  - **Next colours** (cycles the colourway);
  - **Change theme**;
  - **Detach theme**: storefronts, paint rules, kit strips, the entrance and roof props become ordinary items. The rhythm
    already consists of plain settings. The reference stays, marked detached, so the decorations keep resolving;
  - **Remove theme**: shops, decorations, paint and props go; the rhythm and colours stay.

  Rows with sliders:
  - Ground, upper and top-storey openings: rhythm coverage at the scope.
  - Uniformity: every opening layer's uniformity.
  - Storefronts.
  - Each decoration kind the theme uses.
  - Rooftop props.

  Each slider drag is one undo step (continuous input coalescing). Theme aspects also have per-aspect dice, a lock and a
  reset to the theme's own value. Rhythm rows use the rhythm's layer locks.
- **Space / New look:** rerolls every theme reference (locks respected). Without themes it keeps its old behaviour.
- **Combining themes:** a theme on part A and another on part B are two references with their own part-class rhythm
  rules, colours and decorations. Scoped rhythm rules (wall, floor, region) still apply on top. The facade rhythm panel
  and paint rules panel stay fully usable.

## Theme brush

Applying a theme also works like skinning parts: hold a theme on the brush, or drag its card onto a part. Every path
calls the studio's one `applyTheme`, which calls `applyFacadeTheme`, so the result matches Inspector › Part › **Apply
theme to this part**, and each apply is one labelled undo step ("Theme part: …", "Theme building: …") with the usual
cue, bursts and undo toast. Parts carrying different themes keep them: painting one part only replaces that part's
reference.

### Paint › Themes

**Themes** is a target in the Paint brush's "what to paint" chooser (`studioRail.ts`). The palette reuses the gallery's
cards (`ThemeCards` in `StudioThemes.tsx`) in a compact two-column layout, with the search box and the shared style
filter. Above the cards, the held theme shows with its thumbnail, whether it carries a picked-up look, and an
eyedropper button.

- **Hover** a part: its frame and walls glow and a ghost label reads "Apply <theme>" (`StudioThemeMarks.tsx`). Holding
  Shift, or the Building size, highlights every part and reads "Apply <theme> to the building".
- **Click** a part: the theme goes on that part only. A plain card rolls a fresh look per click (`?themeSeed=<n>` fixes
  it, as in the gallery).
- **Sizes**: Part (default) and Building (the chip, or Shift-click). The Wall chip is shown disabled with a tooltip: a
  theme reference is scoped to a part or the building, and its storefronts, decorations, roof props and colours belong
  to that part, so one wall cannot carry its own theme. Use Facade rhythm's wall rules for per-wall variation.
- **Erase** (E, or the Erase mode) with the Themes target: clicking a part removes that part's own theme ("Remove
  theme: …"); a part dressed only by the building theme says so. Building size or Shift-click removes every theme
  ("Remove every theme"). As with the inspector's Remove theme, the rhythm and colours stay as ordinary settings.
- **Eyedropper**: Alt-click a themed part (or use the eyedropper button) to pick up the theme that dresses it (its own,
  else the building's) with its seed, colourway, aspect tuning, locks, reroll counters and the rhythm layers at its
  scope (coverage, uniformity, pools). The next click paints exactly that look onto another part. A status line says
  where it came from; choosing a card again drops the picked-up look.
- **Hotbar**: a theme enters the hotbar like a colour or kit item, with its thumbnail; the slot (or its number key)
  selects the Themes target with that theme.

Pure helpers: `src/domain/cityStudioThemeBrush.ts` (`sampleThemeBrush`, `themeBrushOptions`, `eraseThemeAt`) and
`src/features/city/studioThemeBrush.ts` (click scope, drop outcome, ghost labels, drag start rules).
`applyFacadeTheme` accepts `tune`, `locks`, `seeds` and `layers` options for a picked-up look; aspects the theme does
not use are dropped.

### Drag a theme card

Cards in the gallery and in the palette can be dragged onto the 3D view. The drag uses pointer events, not HTML5
drag-and-drop, because the studio overlay is a separate React root over the canvas: window listeners follow the
pointer, `document.elementFromPoint` checks the canvas is under it, and the interaction hook's `probePart` ray-casts
the part (wall, roof or flat top, the same rules as Select) and the plot ground. A small external store
(`studio/themeDrag.ts`) feeds the floating card ghost in the overlay and the drop highlight in the scene, so pointer
moves do not re-render the studio.

- Over a part: the part glows and the ghost reads "Apply <theme>"; releasing applies it to that part.
- Over empty ground in an empty plot: a green starter block previews and the ghost reads "Start a <theme> block";
  releasing builds the theme's starter box, themed (the existing `themeStarterRecipe` path).
- Esc, or releasing over a panel or outside the view, cancels. Releasing on ground next to a building explains "Drop
  the theme on a part."
- Mouse drags start after a 6 px move. On touch, a still long-press (380 ms) lifts the card and the next moves drag it;
  moving first scrolls the list as usual. Card images are not natively draggable, so the browser's image drag cannot
  steal the pointer.

## Performance

`node --experimental-strip-types scripts/benchmark-city-themes.mjs` resolves a 6-storey, 20 × 12 m part with the theme's
own facade rhythm only, and then fully themed. Timings are medians of 15, in Node (`output/city-themes-benchmark.json`).

- **Cold** (face cache cleared): themed resolve is ×0.90–×1.36 of the plain rhythm, with a mean of ×1.08. For example:
  - NYC tenement: 29.7 → 27.8 ms;
  - Paris Haussmann: 28.4 → 37.0 ms;
  - Soviet block: 23.1 → 31.5 ms;
  - Italian palazzo: 113.5 → 135 ms, where curved and arched rhythm faces dominate.
- **Cached**: +0 to +5.5 ms.

This is well within the 2× budget. The themed work is one extra `studioBays` call (only for themes with shops or strips)
plus linear passes over the cells. Themes add 2–193 instanced kit pieces per part (for example 161 for NYC tenement and
190 for Haussmann). These pieces use the existing instanced kit batches.

## Verification

- `npx tsc --noEmit`: clean.
- `node --experimental-strip-types --test src/domain/cityStudioThemes.test.ts`: 10 tests.
  - The catalogue: 25 themes. Each has a valid rhythm, existing kit modules, street objects and stamp families, and each
    old style maps to a theme.
  - Every theme resolves with nothing inactive on 24 m and 48 m plots and with a round tower.
  - Expected decorations: fire escapes, storefronts, roof props, signs, Haussmann runs, awnings and fins.
  - Determinism per seed, and a different look for another seed.
  - Re-fit after widening a part.
  - Manual openings are kept and filled around.
  - Two part themes plus a building theme, with plain wall rules surviving.
  - Tune, lock, reroll, palette, detach and remove.
  - Kit-tile conversion and starters.
  - Business validators reject the field, and the studio validator catches bad references.
- The existing suites pass: `node --experimental-strip-types --test src/domain/cityStudio*.test.ts src/domain/citySculpt*.test.ts src/domain/cityNyc*.test.ts src/features/city/studio*.test.ts`. They include the hash-pinned version-1 rhythm cases.
- `CITY_TEST_ORIGIN=http://localhost:5180 node scripts/city-studio-themes-browser.mjs` runs on native WebGPU and does
  the following:
  1. Themes one part (Tokyo zakkyo) and the other (Paris Haussmann) from the Part inspector.
  2. Themes the whole building (NYC tenement), replacing both.
  3. Moves sliders (fire escapes off, AC units up, upper coverage), locks storefronts, rerolls, and checks the lock.
  4. Undoes back to the exact saved recipe, with "Undid: Reroll theme", then redoes.
  5. Starts a themed palazzo from Build › Themes on an empty plot.
  6. Applies all 25 themes through the gallery with nothing inactive and no page errors.

  Screenshots: `output/theme-<id>.png`, `output/theme-contact-sheet.png`, `output/theme-apply-parts.png`,
  `output/theme-apply-building.png`, `output/theme-tuned.png` and `output/theme-panel.png`.

- `node --experimental-strip-types --test src/domain/cityStudioThemeBrush.test.ts src/features/city/studioThemeBrush.test.ts`:
  two part themes, the eyedropper carrying seed, colours, tuning, locks and rhythm layers into an identical look,
  building-theme sampling, erase rules, click scope, drop outcomes, labels and drag start rules.
- `CITY_TEST_ORIGIN=http://localhost:5180 node scripts/city-studio-theme-brush-browser.mjs` (native WebGPU):
  1. Paint › Themes: Wall is disabled with its tooltip; the hover label; Tokyo zakkyo brushed on one part and Paris
     Haussmann on the other (different rhythm styles, finishes and themed pieces, nothing inactive).
  2. Alt-click picks up the first part's look and paints it onto the second (same seed, palette and finishes).
  3. Erase removes the second part's theme; Shift-click themes the whole building.
  4. A palette card dragged onto a part applies it; Esc cancels a drag; releasing outside the view does nothing; a
     synthetic touch long-press and drag applies a theme.
  5. A gallery card dragged onto an empty plot builds a themed starter.
  6. Undo/redo after each step with its "Undid: …" toast.

  Screenshots: `output/theme-brush-hover.png`, `output/theme-brush-parts.png`, `output/theme-brush-eyedropper.png`,
  `output/theme-brush-building.png`, `output/theme-brush-drag.png`, `output/theme-brush-dragging.png` (the drag ghost)
  and `output/theme-brush-starter.png`.

## Known gaps

- The theme brush has no Wall size: a theme cannot be scoped to one wall.
- The eyedropper carries the rhythm layers at the theme's own scope. Scoped rhythm rules on the source part (a wall,
  floor or region rule) are not copied.
- Touch drag was exercised with synthetic touch pointer events in the browser suite, not on a physical device.

- There is no raised stoop: the ground storey sits at street level. Brownstones get a lamp-lit door with a canopy
  instead.
- There is no noren or laundry as separate decorations. They come with the Tokyo kit pieces (noren doors, rail
  balconies with poles) and roof laundry rails.
- Half-timbering is paint (timber bands, corner posts and a plinth). There are no diagonal braces or jettied storeys.
- Fire escapes are composed from NYC balcony slabs, rails and stair steps. There is no drop ladder, and the flights run
  across the windows behind them, like the real thing but without cut-outs in the landing above.
- Generated decorations and storefronts are not selectable one by one. Tune them with the theme sliders, detach the
  theme, or unpack a wall. Detached decorations still come from the reference, because balconies, strips and fire
  escapes have no hand-placed equivalent on generated walls.
- Rhythm layer locks are recipe-wide (the rhythm's own `locks`), not per theme scope.
- Kit-piece pools need columns at least 2 m wide. Themes set bays of about 2.4–3.2 m, but on very short walls some
  cells stay blank, as in the rhythm.
- Themes need the Blender catalogue and unified facades, so applying one converts the building.
- Curved parts take rhythm, paint, cornices, belts, piers and AC units. They do not take fire escapes, balconies,
  awnings, storefronts or strips.
- WebGL2 and physical-mobile runs were not repeated for this round.
