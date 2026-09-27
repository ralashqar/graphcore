# Storefront kit (local construction studio)

A self-authored pack of 89 Blender modules for street-believable shops: 34 shopfront sections (22 windows, 12 doors)
with a display behind the glass, 24 overhead trims (7 awnings/canopies, 5 fascias, 5 lettering pieces, 7 signs and
overhead extras) and 31 street objects that stand on the pavement in front of the shop. Styles: New York, Paris,
London, Italian, Tokyo and modern. 22 shop types (43 stamps, 1-3 bays) combine them into complete shops, and six
street starting ideas put four or five shops side by side. Loaded beside the SynArc kit v5 in the construction studio
(`/city?demo=1&cityStudio=1`), only when a building uses one of its pieces.

Everything is unbranded: fascia "lettering", neon and script are abstract stroke shapes with no meaning, most fascias
are blank boards (the sign atlas can still dress them), the pharmacy cross is a plain plus shape and the scooter has no
marque details. No logos, trademarks or real names. Local studio only: business/profile validators reject every pack
id; there is no schema, backend, provider or deployment change.

## Pack, not a kit version

Like the Tokyo pack ([city-tokyo-kit.md](city-tokyo-kit.md)) this is an additional module set under the existing
`synarc-kit-5` catalogue:

- `STUDIO_MODULES_STOREFRONT` / `STOREFRONT_MODULE_IDS` (`cityStudioCatalog.ts`) join the studio's v5 list
  (`studioModules(5)`, `STUDIO_MODULES_V5_STUDIO`, `STUDIO_MODULE_MAP`), never the shared business list
  `STUDIO_MODULES_V5`. `storefrontModuleStyle(id)` and `streetModule(id)` read the pack's extra catalogue fields.
- Business validators reject pack modules and stamps: `usesTokyoKit` became `usesStudioOnlyKit` (the old name is kept
  as an alias; `cityVariationValidation.ts` is unchanged) and covers both studio-only packs.

### Load size

`kit.glb` is 2.1 MB (37,592 triangles, positions and normals only: the city material is triplanar, so no UVs are
exported) and `kit-medium.glb` 2.3 MB (the medium level stores its faces unshared). It is **not** part of the default
v5 load: `loadStudioKit(5, detail, storefront)` (`CityStudioMeshes.tsx`) returns the plain v5 + Tokyo pack
(173 modules) unless `storefront` is true, in which case it copies that pack and adds the storefront modules (shared
geometry, cached separately). `CityStudioMeshes` passes `usesStorefrontKit(pieces)`; `CitySculptSharedKit` (finished
buildings across the city) loads the storefront variant while any plot uses the pack and draws the plain pack until it
arrives. Business buildings and ordinary studio buildings never fetch it (checked by the browser script).

## Pipeline

```powershell
# modules, catalogue, measured manifest, kit.glb, tray thumbnails, review contact sheet (under a minute)
& "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup --python scripts/build-city-kit-storefront.py
# medium level (kit-medium.glb/json), same rules as the synarc and Tokyo kits
& "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe" --background --factory-startup --python scripts/build-city-kit-medium.py -- storefront
```

`scripts/build-city-kit-storefront.py` is the editable source (no .blend). It builds each module per channel from
boxes (optionally with a one-segment bevel), frustums/rods, extruded profiles (arches, consoles, awning cheeks) and a
deterministic per-module random sequence (goods, flowers, lettering), then exports one root per module with one mesh
per channel. `build-city-kit-medium.py` accepts `storefront` as it does `tokyo`.

| Output | Content |
| --- | --- |
| `public/city/storefront-kit/v1/catalogue.json` | module metadata: the synarc catalogue fields plus `style`, and for street objects `mount: "ground"`, `doorSafe`, `obstacles` |
| `public/city/storefront-kit/v1/manifest.json` | catalogue + measured triangles and bounds + `scriptSha256`/`glbSha256` |
| `public/city/storefront-kit/v1/kit.glb`, `kit-medium.{glb,json}` | full and medium levels |
| `public/city/synarc-kit/v5/thumbnails/<id>.png` | 160 px tray thumbnails (glass rendered see-through) |
| `output/storefront-kit-sheet.png` | review contact sheet (not shipped) |

Conventions are the synarc kit's (runtime metres, +Z out of the wall, origin bottom-centre, 2 x 3 x 0.3 m facade
tiles whose `wall` channel frames the catalogue `opening`). Materials are `studio/storefront/<channel>`; the studio
paints per channel, so the user's colours apply and repeated shops follow the building's finishes:

| Channel | Used for |
| --- | --- |
| `frame` | shopfront joinery (timber, cast iron, black steel, aluminium), shelving, furniture frames, crates, fascia boards |
| `trim` | stall risers, display backs and beds, stone surrounds, table tops, gilt/painted lettering, light panels |
| `door` | door leaves and the accent: awning fabric and stripes, neon, flowers, foliage, goods, cushions |
| `glass` | glazing: transparent (Fresnel) near the camera in the studio, so the displays read through it |
| `wall` | the tile slab only (dropped in generated walls) |

Door modules keep the accent on the leaf only (interior portal doors omit `door` and `glass`). Foliage and flowers
follow the accent colour, like the Tokyo noren and lanterns.

### Displays behind the glass

Every section carries a shallow display "diorama" behind its glazing (back panel, bed, ceiling and cheeks, 0.7-1.3 m
deep, inside the building) with goods: book rows, bread, deli counter and bottles, stacked cases, mannequins and hat
stands, pendant lamps, flower buckets, washing machines, barber chairs and mirror, hams and cheese wheels, gelato tubs,
café tables. `StudioInstances` gets a `seeThrough` flag and `CityStudioMeshes` sets it for pack glass (the existing
`seeThroughGlass` helper). The city's shared instanced kit keeps kit glass opaque (displays show only near the edited
building); see Limits.

### Awnings, fascias and lettering

Trims are placed at the top of the bay (the existing module-assembly rule). Awnings attach at the fascia line, 0.55 m
below the bay top where shop apertures end, so a stamp's fascia covers their header and the valance clears about 2 m
on a 3 m storey (2.6 m on the 3.6 m storeys the starting ideas use). Fascias are blank boards that stretch per bay.
Lettering is a separate 0.7 m-tall, one-bay module (a different height from every fascia, so the assembly overlap rule
does not treat them as the same slot) placed once per shop, so a multi-bay fascia does not repeat a word on every bay.
Projecting signs (hanging bracket sign, neon blade, cross, barber pole) sit at the bay's right edge.

## Street objects

Street objects are `trim` modules with `mount: "ground"`, one bay (2 m) wide and up to 1.7 m deep, built 0-1.66 m in
front of the module origin (which the assembly places 0.18 m out from the wall line). `cityStudio.ts` gives them their
own branch of the module-assembly placement:

- they stand on the bay's floor (`b.y`) instead of hanging from the bay top, keep their size (no stretch), and are
  refused above the ground storey ("Street furniture stands at street level");
- in front of a doorway (the entrance bay, a `door-` kit piece, or a free/generated opening that is a door, within
  0.55 m) only `doorSafe` pieces are allowed ("Keep the entrance clear"). Door-safe pieces keep every vertex and
  collider at |x| >= 0.55 m (`STREET_ENTRANCE_CLEAR`), leaving a 1.1 m path in front of the door; this is tested
  against the GLB geometry. Stamps put a door-safe piece (A-frame, menu stand, planters, bay trees, bollards, bin,
  crates, news boxes, racks, floor lanterns, pots) or nothing on the door's bay;
- each carries walking colliders (`obstacles`, boxes in module space) that become `blockers`, so on-foot exploration
  walks around café tables and crates;
- the assembly overlap rule keeps one street object per bay.

They are also individual decorations: the Facade details tray (`CityNycFacadeDetails`) lists the pack's trims and
street objects (with the style filter) and places them as `ornament` assemblies, one per clicked or dragged bay.

## Storefront stamps (shop types)

`STOREFRONT_KIT_STAMPS` (`cityStorefrontStamps.ts`, ids `stamp-sf-<type>-<span>`), listed in the Storefronts brush with
the other studio stamps. `StorefrontStamp` gained optional studio-only fields, read by `placeStamp`
(`cityBuildingVariation.ts`): `style`, `doorBay`, `letters` (one bay, beside the door), `sign` (last bay), `overhead`
(every bay: baskets, lanterns, string lights), `dressing` (street object per bay, door bay first) and `alternates`
(window, canopy, letters, dressing). Alternatives are picked per placed stamp from its id (`variationHash`), so two
bodegas side by side can differ in window, awning and pavement dressing while each stays stable across edits and
reloads; `previewStorefront` now computes the final stamp id before expanding, so the preview shows the same pick.
The dressing pool for the door bay is filtered to door-safe pieces.

| Shop type | Style | Widths | Pieces | Street objects |
| --- | --- | --- | --- | --- |
| New York bodega | new-york | 4 m, 6 m | `window-shop-castiron-bodega`, `door-shop-aluminium`, `shop-awning-boxed`, `shop-fascia-lightbox` | `street-newsboxes`, `street-fruit-trestle` |
| New York deli | new-york | 4 m, 6 m | `window-shop-castiron-deli`, `door-shop-castiron`, `shop-awning-dome`, `shop-fascia-dark`, `shop-neon-script` | `street-aboard`, `street-bench` |
| Laundromat | new-york | 4 m, 6 m | `window-shop-laundromat`, `door-shop-aluminium`, `shop-fascia-lightbox` | `street-bin`, `street-bench` |
| Barber | new-york | 2 m, 4 m | `window-shop-barber`, `door-shop-castiron`, `shop-fascia-steel`, `shop-letters-raised`, `shop-sign-barber-pole` | `street-aboard` |
| Corner store, splayed door | new-york | 4 m, 6 m | `window-shop-aluminium`, `door-shop-corner-splay`, `shop-awning-boxed`, `shop-fascia-dark`, `shop-neon-script` | `street-fruit-trestle`, `street-milk-crates` |
| Paris café | paris | 4 m, 6 m | `window-shop-trattoria`, `door-shop-cafe-folding`, `shop-awning-retract-open`, `shop-fascia-gilt`, `shop-letters-script` | `street-menu-stand`, `street-bistro-row` |
| Boulangerie | paris | 2 m, 4 m | `window-shop-boulangerie`, `door-shop-victorian`, `shop-awning-scalloped`, `shop-fascia-gilt`, `shop-letters-gilt-short` | `street-aboard` |
| Florist | paris | 4 m, 6 m | `window-shop-florist`, `door-shop-recessed`, `shop-awning-striped`, `shop-fascia-gilt`, `shop-letters-script` | `street-planters-pair`, `street-flower-buckets` |
| Pharmacy | paris | 2 m, 4 m | `window-shop-pharmacy`, `door-shop-steel-pivot`, `shop-fascia-steel`, `shop-letters-raised`, `shop-sign-cross` | `street-planters-pair` |
| Paris boutique | paris | 4 m, 6 m | `window-shop-boutique-arched`, `door-shop-victorian`, `shop-fascia-gilt`, `shop-letters-gilt`, `shop-lanterns-pair` | `street-bay-trees`, `street-planter-trough` |
| London pub | london | 4 m, 6 m | `window-shop-pub`, `door-shop-pub`, `shop-fascia-timber`, `shop-letters-gilt`, `shop-sign-blade-bracket`, `shop-hanging-baskets` | `street-aboard`, `street-barrel-tables` |
| Bookshop | london | 2 m, 4 m | `window-shop-victorian-books`, `door-shop-victorian`, `shop-awning-retract-closed`, `shop-fascia-timber`, `shop-letters-gilt-short` | `street-aboard` |
| Butcher | london | 4 m | `window-shop-butcher`, `door-shop-victorian`, `shop-awning-retract-open`, `shop-fascia-timber`, `shop-letters-gilt` | `street-bollards`, `street-planter-trough` |
| Greengrocer | london | 4 m, 6 m | `window-shop-stall-open`, `door-shop-stall-open`, `shop-awning-striped`, `shop-fascia-timber`, `shop-letters-gilt-short` | `street-milk-crates`, `street-fruit-trestle` |
| Trattoria | italian | 4 m, 6 m | `window-shop-trattoria`, `door-shop-stone-arch`, `shop-fascia-gilt`, `shop-letters-script`, `shop-string-lights` | `street-menu-stand`, `street-cafe-parasol` |
| Gelateria | italian | 2 m, 4 m | `window-shop-gelato`, `door-shop-steel-pivot`, `shop-awning-scalloped`, `shop-fascia-dark`, `shop-neon-script` | `street-aboard` |
| Alimentari | italian | 4 m, 6 m | `window-shop-alimentari`, `door-shop-bead-curtain`, `shop-awning-boxed`, `shop-fascia-gilt`, `shop-letters-gilt` | `street-produce-baskets` |
| Souvenir shop | italian | 4 m | `window-shop-stone-arcade`, `door-shop-stone-arch`, `shop-awning-scalloped` | `street-postcard-rack`, `street-sunglasses-rack` |
| Modern boutique | modern | 2 m, 4 m, 6 m | `window-shop-steel-mannequins`, `door-shop-steel-pivot`, `shop-canopy-glass`, `shop-fascia-steel`, `shop-letters-raised` | `street-bay-trees` |
| Coffee kiosk | modern | 2 m | `window-shop-kiosk-hatch`, `shop-canopy-glass`, `shop-fascia-steel` | `street-bike-rack` |
| Closed shop, shutters down | modern | 2 m, 4 m, 6 m | `window-shop-shutter-down`, `shop-fascia-lightbox` |  |
| Tokyo diner, food samples | tokyo | 2 m, 4 m | `window-shop-tiled-samples`, `door-shop-tiled-sliding`, `tokyo-awning`, `tokyo-fascia` | `street-tokyo-pots` |

(Street objects listed for the narrowest width; wider shops add the next entries, and alternates vary them.)

## Modules (89 modules, 37,592 triangles; medium 30,301)

Budgets (tested): window 1300, door 1000, trim 600, street object 800 triangles. Notes: door-side = keeps the entrance path clear; near = drawn only near the camera.

### Shopfront sections (34, 23760 triangles)

| Id | Label | Style | Aperture (width, bottom-top) | Triangles | Medium | Notes |
| --- | --- | --- | --- | ---: | ---: | --- |
| `window-shop-victorian-books` | Victorian bookshop window | london | 1.74, 0.55-2.45 | 1260 | 1074 | |
| `window-shop-boulangerie` | Boulangerie window | paris | 1.74, 0.60-2.45 | 1128 | 1054 | |
| `window-shop-castiron-deli` | Cast-iron deli window | new-york | 1.84, 0.40-2.45 | 1032 | 790 | |
| `window-shop-castiron-bodega` | Cast-iron bodega window | new-york | 1.84, 0.40-2.45 | 1224 | 922 | |
| `window-shop-stone-arcade` | Stone arcade shop window | italian | 1.70, 0.25-2.45 | 900 | 823 | |
| `window-shop-steel-mannequins` | Black steel boutique window | modern | 1.90, 0.12-2.45 | 644 | 574 | |
| `window-shop-aluminium` | Aluminium convenience window | new-york | 1.86, 0.30-2.45 | 564 | 494 | |
| `window-shop-tiled-samples` | Tiled window with food samples | tokyo | 1.60, 0.80-2.25 | 904 | 560 | |
| `window-shop-bay` | Canted bay shop window | london | 1.70, 0.55-2.35 | 476 | 402 | |
| `window-shop-stall-open` | Open stall counter, shutter up | london | 1.86, 0.05-2.45 | 656 | 570 | |
| `window-shop-kiosk-hatch` | Kiosk serving hatch | modern | 1.20, 0.95-2.05 | 524 | 362 | |
| `window-shop-florist` | Florist window | paris | 1.74, 0.45-2.45 | 756 | 684 | |
| `window-shop-pharmacy` | Pharmacy window | paris | 1.80, 0.50-2.45 | 600 | 528 | |
| `window-shop-laundromat` | Laundromat window | new-york | 1.86, 0.35-2.45 | 984 | 668 | |
| `window-shop-barber` | Barber window with pole | new-york | 1.74, 0.45-2.45 | 892 | 564 | |
| `window-shop-butcher` | Butcher window, tiled riser | london | 1.80, 0.75-2.45 | 600 | 506 | |
| `window-shop-gelato` | Gelateria counter window | italian | 1.80, 0.35-2.45 | 408 | 374 | |
| `window-shop-trattoria` | Trattoria window, caf� curtain | italian | 1.70, 0.60-2.45 | 932 | 762 | |
| `window-shop-pub` | Pub window, etched lights | london | 1.72, 0.70-2.45 | 600 | 544 | |
| `window-shop-shutter-down` | Rolled-down shop shutter | modern | 1.86, 0.00-2.45 | 440 | 314 | |
| `window-shop-alimentari` | Alimentari window | italian | 1.74, 0.50-2.45 | 1028 | 818 | |
| `window-shop-boutique-arched` | Arched boutique window | paris | 1.60, 0.40-2.45 | 704 | 640 | |
| `door-shop-victorian` | Victorian shop door, side lights | london | 1.00, 0.00-2.45 | 500 | 442 | |
| `door-shop-castiron` | Cast-iron double shop door | new-york | 1.30, 0.00-2.45 | 620 | 572 | |
| `door-shop-steel-pivot` | Steel pivot door | modern | 1.30, 0.00-2.45 | 248 | 202 | |
| `door-shop-aluminium` | Aluminium double door | new-york | 1.70, 0.00-2.45 | 352 | 336 | |
| `door-shop-cafe-folding` | Caf� with folding doors open | paris | 1.80, 0.00-2.45 | 720 | 672 | |
| `door-shop-recessed` | Recessed splayed entrance | london | 1.84, 0.00-2.45 | 536 | 485 | |
| `door-shop-corner-splay` | Splayed corner door | new-york | 1.84, 0.00-2.45 | 480 | 416 | |
| `door-shop-stone-arch` | Stone arched shop door | italian | 1.40, 0.00-2.45 | 644 | 613 | |
| `door-shop-pub` | Pub door, panelled | london | 1.05, 0.00-2.45 | 560 | 498 | |
| `door-shop-tiled-sliding` | Tiled sliding door, strip curtain | tokyo | 1.60, 0.00-2.25 | 696 | 418 | |
| `door-shop-stall-open` | Open stall front, shutter up | london | 1.86, 0.00-2.45 | 808 | 744 | |
| `door-shop-bead-curtain` | Bar door with fly curtain | italian | 1.00, 0.00-2.35 | 340 | 330 | |

### Awnings, fascias, lettering and signs (24, 4968 triangles)

| Id | Label | Style | Aperture (width, bottom-top) | Triangles | Medium | Notes |
| --- | --- | --- | --- | ---: | ---: | --- |
| `shop-awning-striped` | Striped awning | paris | - | 280 | 186 | |
| `shop-awning-scalloped` | Scalloped awning | italian | - | 484 | 354 | |
| `shop-awning-retract-open` | Retractable awning, open | london | - | 168 | 114 | |
| `shop-awning-retract-closed` | Retractable awning, closed | london | - | 92 | 54 | |
| `shop-awning-dome` | Dome awning | new-york | - | 424 | 336 | |
| `shop-canopy-glass` | Glass canopy | modern | - | 156 | 125 | |
| `shop-awning-boxed` | Boxed fabric awning | new-york | - | 72 | 66 | |
| `shop-fascia-timber` | Timber fascia with cornice | london | - | 92 | 76 | |
| `shop-fascia-steel` | Steel fascia band | modern | - | 24 | 20 | |
| `shop-fascia-gilt` | Painted fascia, gilt line | paris | - | 72 | 68 | |
| `shop-fascia-dark` | Dark fascia board | new-york | - | 36 | 30 | |
| `shop-fascia-lightbox` | Light-box fascia | new-york | - | 80 | 36 | |
| `shop-letters-raised` | Raised letters (abstract) | modern | - | 300 | 0 |near |
| `shop-letters-gilt` | Gilt letters (abstract) | london | - | 288 | 0 |near |
| `shop-letters-gilt-short` | Short gilt letters (abstract) | paris | - | 180 | 0 |near |
| `shop-neon-script` | Neon script (abstract) | new-york | - | 296 | 64 |near |
| `shop-letters-script` | Painted script (abstract) | paris | - | 276 | 84 |near |
| `shop-sign-blade-bracket` | Hanging sign on bracket | london | - | 116 | 89 | |
| `shop-sign-blade-neon` | Neon blade sign | new-york | - | 332 | 232 | |
| `shop-sign-cross` | Projecting cross sign | paris | - | 112 | 46 | |
| `shop-sign-barber-pole` | Barber pole | new-york | - | 148 | 146 | |
| `shop-string-lights` | String lights | italian | - | 412 | 32 |near |
| `shop-hanging-baskets` | Hanging baskets | london | - | 320 | 310 | |
| `shop-lanterns-pair` | Wall lanterns, pair | paris | - | 208 | 160 | |

### Street objects (31, 8864 triangles)

| Id | Label | Style | Aperture (width, bottom-top) | Triangles | Medium | Notes |
| --- | --- | --- | --- | ---: | ---: | --- |
| `street-aboard` | A-frame sidewalk board | london | - | 64 | 60 |door-side |
| `street-menu-stand` | Menu stand | paris | - | 80 | 80 |door-side |
| `street-cafe-set` | Caf� table and chairs | paris | - | 304 | 304 | |
| `street-cafe-parasol` | Caf� table with parasol | italian | - | 392 | 392 | |
| `street-bistro-row` | Bistro tables facing the street | paris | - | 608 | 608 | |
| `street-planters-pair` | Planters flanking the door | modern | - | 288 | 216 |door-side |
| `street-planter-trough` | Planter trough | london | - | 140 | 103 | |
| `street-flower-buckets` | Flower bucket stand | paris | - | 504 | 442 |near |
| `street-flower-cart` | Flower cart | paris | - | 424 | 396 | |
| `street-fruit-trestle` | Fruit crates on trestles | london | - | 420 | 402 | |
| `street-veg-crates` | Tilted vegetable crates | italian | - | 252 | 234 | |
| `street-newspaper-rack` | Newspaper rack | london | - | 156 | 156 |door-side |
| `street-newsboxes` | Street news boxes | new-york | - | 136 | 60 |door-side |
| `street-bike-rack` | Bike rack with bicycle | modern | - | 472 | 470 | |
| `street-bicycle` | Parked bicycle with basket | tokyo | - | 284 | 282 | |
| `street-bench` | Street bench | london | - | 120 | 116 | |
| `street-bin` | Litter bin | london | - | 108 | 108 |door-side near |
| `street-bollards` | Bollards, pair | modern | - | 168 | 168 |door-side near |
| `street-milk-crates` | Stacked delivery crates | new-york | - | 168 | 155 |door-side near |
| `street-delivery-cart` | Hand truck with boxes | new-york | - | 156 | 136 |door-side near |
| `street-ice-cream-freezer` | Ice-cream freezer | italian | - | 132 | 32 | |
| `street-postcard-rack` | Postcard spinner rack | italian | - | 236 | 236 |door-side |
| `street-sunglasses-rack` | Sunglasses rack | italian | - | 180 | 32 |door-side |
| `street-floor-lanterns` | Floor lanterns flanking the door | tokyo | - | 192 | 172 |door-side |
| `street-bay-trees` | Clipped bay trees, pair | modern | - | 256 | 256 |door-side |
| `street-barrel-tables` | Pub barrel tables and stools | london | - | 480 | 480 | |
| `street-produce-baskets` | Produce baskets on a bench | italian | - | 260 | 230 | |
| `street-bakery-rack` | Bread crate rack | paris | - | 732 | 584 | |
| `street-bench-planter` | Bench between planters | modern | - | 336 | 242 | |
| `street-scooter` | Parked scooter | italian | - | 240 | 190 | |
| `street-tokyo-pots` | Potted plants by the door | tokyo | - | 576 | 576 |door-side near |

## Starting ideas (`STOREFRONT_PRESETS`, `cityStorefrontPresets.ts`)

Appended after the Tokyo ideas (`STOREFRONT_EXAMPLE_START` in `cityStudioExamples.ts`). Each is one unified-facade
building with a facade rhythm above, a kit entrance door on the first bay, shop stamps along the ground storey
(3.6 m), plain party walls and a flat parapet roof:

| Idea | Size | Rhythm | Shops |
| --- | --- | --- | --- |
| New York shop block | 18 x 10 m, 4 storeys, brick | loft, NYC sashes | bodega, barber, laundromat, deli |
| Paris shop street | 18 x 10 m, 5 storeys, plaster | townhouse | café terrace, boulangerie, florist, pharmacy |
| London high street parade | 20 x 10 m, 3 storeys, brick | shopfront | pub, bookshop, butcher, greengrocer |
| Italian piazza shops | 18 x 10 m, 3 storeys, plaster | cottage | trattoria, gelateria, alimentari, souvenir shop |
| Modern retail row | 18 x 10 m, 2 storeys, concrete | loft | boutique, coffee kiosk, boutique, closed unit |
| Tokyo shotengai row | 14 x 10 m, 3 storeys | Tokyo kit | food-sample diners, Tokyo ramen counter and convenience store |

## Studio UI (existing data paths)

| Surface | Path | Storefront content |
| --- | --- | --- |
| Brush → Openings → Windows / Doors, Inspector → Tile kit pieces | `studioModules(5)` + `moduleOpeningSpec` | all 34 sections (apertures) |
| Brush → Storefronts | `STUDIO_STOREFRONT_STAMPS` | 43 shop stamps |
| Brush → Decorations → Facade details | `CityNycFacadeDetails` (one-line filter change) | awnings, fascias, lettering, signs, street objects |
| Build → Starting ideas | `STUDIO_EXAMPLES` / `studioExample` | 6 street ideas |

The style filter (`studioStyles.tsx`) gained Paris, London, Italian and Modern (it wraps in the palette);
`moduleStyle`, `stampStyle` and `exampleStyle` read the catalogue/stamp `style` (`new-york` maps to New York).

## Licensing

All geometry is authored procedurally in `scripts/build-city-kit-storefront.py` for this project (CC0-compatible);
no third-party meshes, textures, fonts or reference imagery are included. Lettering, neon and script shapes are
generic stroke patterns, not text, marks or logos.

## Verification

- `node --experimental-strip-types --test src/domain/cityStudioStorefrontKit.test.ts` (9 tests): catalogue, manifest
  and GLB agree (hashes, one root per module, no node transforms, channels, per-module triangles, budgets: window
  1300, door 1000, trim 600, street object 800; bounds in width, height and depth; wall channel on sections only; id
  conventions; styles; thumbnails; 30+ sections and 30+ street objects); street objects (ground mount, no stretch,
  colliders inside their slot, door-safe geometry and colliders at |x| >= 0.55 m, 10+ door-side pieces); medium level;
  studio-only membership, opening kinds and stamp consistency (every module exists, door-bay dressing door-safe, 16+
  shop types, every style); business rejection of pack windows, defaults, awnings, street objects, stamps and pools
  while the studio accepts them; every stamp paints and resolves with nothing inactive and brings colliders; seeded
  alternatives differ between placed stamps and are deterministic; street placement rules (ground storey, entrance,
  door-side, colliders); the six starting ideas validate and resolve with nothing inactive on 24 m and 48 m plots.
- `src/domain/cityStudioTokyoKit.test.ts` updated for the larger studio catalogue, stamp list and example order.
- `node --experimental-strip-types --test src/domain/cityStudio*.test.ts src/domain/cityNyc*.test.ts`: 233 tests pass
  (the "ten openings stays interactive" timing test can exceed 100 ms under parallel load; it passes on its own).
- `CITY_TEST_ORIGIN=http://localhost:5180 node scripts/city-storefronts-browser.mjs`: native WebGPU (Edge headless),
  no storefront `kit.glb` request before a storefront building opens, every street idea loads with the pack (plain v5
  pack 173 modules, with the pack 262), no page errors. Screenshots `output/storefronts-<style>.png` (street level),
  `-front.png`, `-along.png`, and the labelled sheet `output/storefronts-thumbnails.png`. WebGL2 not run.
- `npx tsc --noEmit` and `npm run build` pass.

## Limits

- Displays read through the glass in the studio (edited building); the city's shared instanced kit keeps kit glass
  opaque, so finished shops across the city show reflective glazing.
- Foliage, flowers and goods use the accent (`door`) colour; there is no separate planting channel.
- Street objects need a ground-storey bay in front of which the plot has room; they are not snapped to the kerb or
  shared between neighbouring buildings, and colliders are simple boxes.
- Street objects on generated walls use the wall's 2 m tile bays, not the rhythm's columns.
- The medium level is 81 % of the full triangles and slightly larger on disk (faces stored unshared); lettering and
  small props are near-only.
- The lettering and neon are abstract; real shop names come from the existing sign atlas on blank fascias.
