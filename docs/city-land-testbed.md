# City land and construction test bed

## Trying it

Open `/city?demo=1` using the procedural preset renderer. The test bed is enabled by default there; `cityBuild=0` disables it for comparisons. Other city render modes and live city data are unaffected.

Drive to the edge of the populated city, exit with E, and approach a fenced vacant plot's street-facing entrance. The prompt is available within two metres while grounded, with a clear approach. E or the touch button inspects it. Purchase is **simulated USD $5**, with no real payment. Cancel returns to the street. Purchased land is fixed in position, independently of City Value/ranking.

Construction uses the existing v3 recipes and shared renderer. Choose a preset from the bottom carousel; switch to Grounds, Nature, Style or Branding for a compact side panel. Drag roof/side handles to resize within recipe limits, or use +/- controls. Orbit and zoom on the canvas. Save & Finish commits the visible building and returns to walking. Exit saves an unfinished draft. Revisiting restores that draft while the last finished building remains the public local-world presentation outside the editor. Undo/redo covers the current session; one dimensional drag produces one history entry.

The driving HUD exposes a separately confirmed Reset test world action. This removes local purchases/designs, not any real business data.

## Data and integration

`cityLand.ts` defines version-1 plot/world records and the asynchronous LandRepository contract. The local simulator persists under `city-land-v1-{plotSize}-{capacity}` using browser storage. The initial occupied demo snapshot is frozen with the vacant allocation. Both 24-unit plots and whole 48-unit estates use their own layout coordinates; roads, the centre and launch plaza are excluded. All available plots have a permanent collider independent of rendering.

Purchase checks availability/revision, assigns the local test owner and writes a receipt immediately. Same-receipt retries are idempotent. Draft/finish commands require ownership and the expected revision. Commands serialize within a repository and use browser Web Locks across tabs when available. The local test identity/storage are not a security boundary. A future server adapter must derive identity, price and ownership on the server and verify payment using its provider webhook before purchase completion. No existing GBP City Value contracts are repurposed.

Autosave debounces edits, serializes in-flight saves and does not clear dirty state for newer edits. Storage failures retain the editor/draft and expose Retry. Revision conflicts offer explicitly confirmed reloading of the saved version. Leaving with unsaved data requests the browser's normal unload warning. Reload resumes safe exploration, not mid-staging/celebration.

The existing exploration actors and camera remain mounted. Inspection, purchasing, celebration and construction exclusively own input while active. The character follows a short collision-checked path to a safe street marker. Near-car and near-plot interactions use reachable distance, with car winning ties. Reduced motion skips staging travel and confetti. Construction editing changes recipes, never arbitrary mesh vertices. Dimensions are clamped to 8–18 recipe units (higher blueprint minimums still apply) and at most eight floors; estates scale the same recipes consistently. Dragging previews bounds only and commits geometry on release. Construction retains the last prepared recipe while the worker prepares its replacement, avoiding blank buildings between edits; ordinary city rendering keeps its existing preparation policy.

## Assets and performance

`public/assets/city/nature/source.json` records source URL/version, archive hash and selected GLB hashes. The four original GLBs and CC0 licence are retained. Runtime preparation normalizes ground origins and relative heights and uses matte bark/leaf colours with zero metalness. Geometry/materials are cached and repeated plants/fences/signs are instanced. Failed downloads retain procedural greenery. Nature placement is seeded; building bounds and the entrance route suppress overlapping plants without changing the seed. The optional grass/paving choices reuse existing texture presets.

## Verification

- 33 combined domain tests pass: existing driving/character behavior plus fixed allocations, purchase idempotency, revision rejection, draft/finished independence, failed writes, safe entrance approaches, preset bounds and deterministic nature.
- `scripts/city-land-browser.mjs` walks to a nearby seeded vacant test site and checks inspection/cancellation, rejected storage writes, purchase, presets, direct floor-handle dragging, undo/redo, branding, nature, mobile layout, finish, unfinished revision preservation and reload. Passed native WebGPU and WebGL with reduced motion and blocked nature assets.
- Browser fixtures remove one occupied near-spawn property only in their isolated browser context. The ordinary demo allocation is unchanged.
- Performance: sequential 72-business driving runs on the same Windows desktop/Edge native WebGPU setup, 1000 x 750, balanced lighting and architectural AO. The test bed enabled all remaining saleable sites. p50 stayed 16.7 ms, p95 stayed 16.8 ms, and controller/camera p95 stayed 0.2 ms. Final sampled draw calls changed 49 to 57; triangles 168,409 to 220,251. This meets the 10% frame-time target on this setup. Evidence: `output/city-drive-land-before.json` and `output/city-drive-land-after.json`. Toggle `CITY_BENCH_LAND=0` for the baseline; `CITY_TEST_ORIGIN` selects the running dev server.

Physical mobile and a complete 400-business rendered before/after benchmark remain unverified. The 400-site allocation/collision tests do not substitute for those. No production deployment, real purchases or account ownership are enabled.

Final verification after restart: the dev server is running on 127.0.0.1:5188. TypeScript, production build and the final native WebGPU browser flow passed, including retained previews during preparation and immediate owned-plot interaction labels. Existing large-chunk/landing-image build warnings and the dev office-manifest warning remain unrelated. No browser runtime errors were observed. No deployment or commit was made.


## Responsive construction presets

Interactive preparation is keyed by recipe content, so autosave/object refreshes do not restart identical work. New recipes prepare in a worker; the old building stays mounted with a loading indicator and usable carousel. Only the latest requested recipe is accepted. A prepared replacement scales the entire building out/in through one plot-centred transform; reduced motion switches immediately. Handles and Finish wait for the visible result. Worker failures retain the previous building and expose Retry, rather than running the expensive geometry/AO fallback on the main thread. Ordinary city loading preserves its existing fallback.

CPU preparation is asynchronous; Three.js mesh updates and GPU uploads still occur on the rendering thread. This is not a claim of zero GPU upload cost. The browser regression includes delayed preparation, responsive tab changes, retained old geometry, injected worker failure and successful retry.

The responsive-construction browser regression passed on native WebGPU and WebGL with reduced motion, including injected preparation failure/retry and delayed worker responsiveness. The WebGL setup needed a longer walking timeout while the production build was running. Nine land-domain tests and TypeScript passed; no new browser page errors were reported.

Production build passed after the responsive-preview changes. Existing landing-image and chunk-size warnings remain. The development server remains available at `http://127.0.0.1:5188/city?demo=1`.

## Seamless dimension editing

Only explicit preset selection requests a scale transition. Floors, width, depth, palettes, branding and grounds replace prepared geometry in place. Initial entry also displays at full scale. The orbit target is captured per plot entry and zoom limits no longer depend on the changing building height, preserving framing during edits.

Interactive preparation retains its completed worker for subsequent jobs, releasing it on unmount or cancelling unfinished work when superseded. Surrounding vacant plots have a revision-keyed instance set separate from the active plot's landscaping; editing and autosaving the active plot no longer regenerate their fence/sign/plant instance buffers. The city stays visible.

The browser regression asserts idle/full-size dimension updates and unchanged camera position/target across a floor change, followed by preset loading/retry, undo/redo, direct handles and save/reload. The first run passed; a measured floor update took 1,181 ms including 400 ms of intentional settling during a concurrent production build. This is not an isolated performance benchmark or a claim that all geometry uploads are instantaneous.

Resize handles remain visible and editable during preparation/autosave; the existing revision-aware save queue preserves newer edits. Only finishing waits for preparation. Final surrounding-instance browser verification passed with unchanged framing, no dimension animation, preset switching, failure/retry and purchase/save/reload.

## Vertical construction transitions

Preset transitions now render stationary plot surfaces/perimeter enclosures separately from the animated building. Building geometry and attached signs scale on Y only around the plot surface datum; X/Z remain exactly one. The old building collapses completely before the new building rises, without overshoot. Ground-slot planters/bollards are marked as stationary generated geometry; rooftop planting remains attached to the building. Imported paving and ground prop assemblies use the same separation. Grounding stays on the stationary layer. Other city/customiser renderers retain their combined default layer.

Dimension changes still replace geometry without animation or camera changes. No recipe schema, saved profile, public API or deployment changes are introduced by the generated-part layer hint.

Vertical-transition verification: browser assertions passed for ordered outgoing/incoming phases, collapse to the footprint and fixed X/Z scales, plus unchanged dimension-edit framing and the purchase/save/reload regression. TypeScript and nine land-domain tests passed.
