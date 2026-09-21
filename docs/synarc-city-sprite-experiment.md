# Illustrated City experiment

The demo defaults to image buildings over the existing road grid. The view selector compares illustrated buildings, roads/plots only and the preceding Quaternius office experiment. `/city/demo` resolves to `/city?demo=1`; `cityRender=empty` and `cityRender=offices` select the alternatives. Live City and the separate asset showcase are unchanged.

## Asset and rendering contract

- Three 512x512 PNGs: `public/city/sprites/studio.png`, `cafe.png`, `games.png`.
- `tile-reference.png` is rendered by `scripts/city-sprite-reference.mjs` from a 47.8m plot and the City's actual orthographic direction `(420,380,420)`. Diamond target vertices are `(256,240)`, `(480,360)`, `(256,480)`, `(32,360)` in a 512px square.
- The built-in image-generation tool made the artwork. The first transparency attempt returned RGB with a baked checkerboard and was rejected. The accepted samples deliberately use a magenta colour-key background, removed once during texture preparation. These source PNGs are **not** true-alpha deliverables. Production should prefer verified RGBA output or a reviewed background-removal stage; the prototype key prohibits magenta branding and can erode magenta details.
- Source outputs were resized to the requested 512px with Sharp. Small generated framing deviations are corrected using reviewed corner anchors in `CitySpriteBuildings.tsx`. This is a manual calibration prototype, not proof that prompting alone guarantees pixel-perfect alignment.
- Three instanced, camera-aligned image planes replace building geometry and billboards. Shared texture/material resources, existing residency, entrance/displacement motion, matching filters and reduced motion are retained. Alpha-aware picking lets transparent corners pass through.
- A camera-normal depth offset prevents the bottom half of the flat image intersecting the ground; this leaves its orthographic screen position unchanged and preserves relative depth between plots. The fixed camera direction is part of the contract. Rotation would expose the flat artwork.
- `streets.glb` contains only the existing roads, markings and plaza paving. Rebuild it with `node scripts/build-city-sprite-streets.mjs`; the sprite demo no longer downloads either building pack. Decorative 3D trees, the pavilion, launch structures and street activity are hidden in this experimental mode.
- Three examples repeat by stable business ID. They are illustrative, not personalised representations or evidence of a live merchant generation endpoint. Business names remain separate UI so they stay legible and accurate.

## Generation prompt set

Mode: built-in image generation, `stylized-concept`; no CLI/API fallback. Each accepted request used `tile-reference.png` as the geometry/camera reference. The studio correction also used the rejected studio sample as a subject reference.

Shared prompt: one square 512x512 game sprite, exact isometric footprint above; orthographic equal X/Z camera, elevation 32.6 degrees; cozy toy-diorama miniature, smooth matte clay, clear chunky silhouettes, low texture detail, no tiny interiors, soft upper-left lighting. Entire building inside the tile with headroom. Smooth sage lawn and cream entrance path. No roads, billboards, text, watermark or thick floating base. Outside the subject: perfectly flat pure magenta `#ff00ff`, no gradient, shadow, noise or checkerboard; no magenta in the subject.

Subjects:

1. **Studio:** three ivory rounded floors, terracotta lower podium, broad teal windows, stepped terraces and three simple roof shrubs. The correction explicitly simplified the earlier detailed desks/interiors and grass texture.
2. **Café:** low two-storey buttery cream building, rounded terracotta roof, broad arched teal windows, sage striped awning, oversized coffee-cup roof emblem and two round shrubs.
3. **Games:** compact three-storey stepped lilac building, broad rounded navy windows, pale yellow recessed entrance, mint plinth, large simple yellow roof star and two smooth shrubs.

## Proposed merchant pipeline (not deployed)

Approve the visual direction and exact tile anchors before enabling generation. Reuse the existing business/campus import and fenced job infrastructure; do not add a second website crawler or unrestricted public provider proxy.

1. An authenticated business owner chooses an approved style and requests `generate_building_sprite` with business ID, current revision, approved logo/media asset IDs and an idempotency key. The server derives the business summary and palette from reviewed website import data, checks ownership/asset access, and freezes the tile-reference hash, style version and input hashes. No arbitrary URL fetch by the image provider.
2. Return a job ID immediately. The existing worker performs bounded generation with configured provider admission, budget and retry/reconciliation rules. Admission, billing and deployment need their own reviewed implementation; this frontend experiment does not enable them.
3. Validate MIME/dimensions, alpha/background, subject bounds, readable silhouette, ground anchors, safety and logo placement. Reject checkerboards and uncertain alignment. Save source and normalized candidate privately with versioned provenance; do not overwrite the published sprite.
4. Merchant previews the candidate on the real road grid at desktop/mobile zooms. Accepting a matching revision publishes the immutable 512px asset and anchor metadata through existing business publication review. Stale candidates remain reviewable without replacing newer content.
5. Public City receives only approved sprite URL/hash, dimensions, ground anchors and style version. Keep the previous approved image or a neutral fallback while loading/failing. An atlas/page strategy and lazy loading will be needed for hundreds of **unique** business images; the three-image demo does not validate that workload.

Exact logo typography should be composited from the authorised logo after generation rather than relying on generated text. Preserve logo aspect ratio and allow merchants to reject inappropriate representation. Future generation must be explicitly requested, never triggered by visitors panning.

## Verification

`scripts/city-sprite-browser.mjs` checks the canonical demo route, three shared sprite textures, absence of building-pack downloads, property selection, mobile viewport and empty mode. Run `scripts/city-navigation-browser.mjs` for repeated pan/zoom, blur recovery, central reset and reduced motion. Physical mobile performance, hundreds of unique textures and a live generation endpoint remain separate acceptance work.

Local browser checks passed with 72 resident properties, three shared textures and no console/runtime errors. Repeated navigation and reduced motion passed. The three PNGs total 964,637 bytes; the streets-only pack is 682,344 bytes. This measures asset transfer, not an FPS guarantee. These are frontend/asset changes only: no database migration, worker deployment, endpoint activation or new provider configuration.

## Corporate branding studies

`/city?demo=1&cityRender=corporate` adds Nike, Slack and Zoom to the first three demo properties, with corresponding names and explicit unofficial-concept descriptions. Their displayed geography and City Value remain simulated. These fixtures have no website, offer or redemption CTA; they do not represent participating merchants. The selector preserves the original three-image city for comparison. Remaining plots retain fictional businesses. Corporate mode loads six shared textures; ordinary sprite mode still loads only three.

Saved 512px files: `public/city/sprites/nike.png`, `slack.png`, `zoom.png`. All were generated with the built-in image tool from the same tile reference and manually calibrated anchors. The common prompt retained the orthographic camera, cozy smooth clay toy-diorama look, low texture detail, sage lawn, cream paths, upper-left lighting and flat magenta cutout background, with no separate billboards or promotional claims.

Subject prompts:

- Nike: unofficial flagship retail concept, white sculptural two-level sports store, black glazing, large black swoosh on the front facade, orange entrance accent, rooftop running track and chunky sneaker sculpture.
- Slack: unofficial headquarters, rounded ivory collaborative office with stepped terraces, dark plum windows, multicolour hash logo on the facade, cyan/yellow/green/red architectural fins and rooftop collaboration pods. Clear red rather than magenta protects the colour-key process.
- Zoom: unofficial white/bright-blue headquarters with rounded stepped terraces, sky-blue glazing, oversized video-camera roof emblem, lowercase white `zoom` wordmark on an integrated blue facade panel, and a small round meeting pavilion.

These generated logos are visual approximations, not approved brand assets. Production would composite a supplied authorised vector/logo rather than rely on generative logo accuracy. No merchant endpoint, provider configuration or deployment is added by these samples.
