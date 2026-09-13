# Flexible studio locomotion processing

The optional `locomotion-post-1.0.0` profile gives arbitrary flexible clip nodes an explicit locomotion processing contract. Existing graphs and unprofiled custom recipes retain their previous behavior and motion fingerprints. This uses the existing CPU bake stages and Fabric renderer; it introduces no provider, database migration, inference admission or budget changes.

## Authoring and processing

The node inspector offers gait (walk/run), horizontal travel direction, synchronization group, optional numeric speed parameter in meters per second, bounded playback rates and foot locking. The planner can author the same typed profile in initial or follow-up graph edits. Processing requires a loop without authored contacts, anchor-relative roots or predecessor constraints. These restrictions prevent gait-cycle extraction from discarding authored milestone timing.

CPU processing searches up to eight gait-cycle candidates, detects bilateral stance intervals, applies the existing bounded contact correction and periodic smoothing, then validates stance coverage, direction, displacement, contact drift, corrections, loop seams and exported poses. The explicit processing version is frozen into the recipe hash and candidate metadata. Gait/direction changes invalidate the node's accepted binding; runtime synchronization/rate/lock edits do not. Old candidates and immutable revisions remain available for comparison and restoration.

`import_source` now accepts flexible locomotion reprocessing from a technically valid Kimodo candidate belonging to the same workspace and node. The Edge boundary verifies the originating immutable graph revision, motion description, style, duration, root mode, adjacent context, and absence of authored constraints. Only looping/processing options may change. The worker hash-checks the pinned source and uses the existing CPU-only import branch. This creates a new candidate for review. It does not reserve funds, submit inference or silently replace an accepted clip. A source with changed motion intent must be regenerated rather than relabeled.

## Playback and limitations

The standalone preview shares normalized left-foot touchdown phase within a synchronization group. It matches requested speed within each clip's rate bounds. Compatible active cycles use the intersection of their frequency ranges; incompatible ranges use bounded independent playback and disable locking. A zero requested speed pauses the gait. Moving preview displacement uses the resulting playback speed.

Foot locks operate on the flat preview floor through the existing rotational leg IK, preserving bone lengths. They require dominant locomotion/contact evidence, limit target correction to 4 cm and release unreachable contacts until the next stance. They are not terrain adaptation or a guarantee that unrelated styles blend naturally. Contact markers, phase/rate diagnostics and candidate bake metrics make those limits visible. This does not change gameplay movement, hit timing, physics, general-purpose motion matching or arbitrary partner/prop IK.

## Verification and rollout

Local verification passed: `npx tsc --noEmit`, `npm run build`, `npm run build:game`, Deno checks for the game worker and animation Edge entry, 21 focused tests, and the existing suite (726 passed, 8 skipped). The dev server started on port 5214 and `/app/animations` loaded without page errors. The existing saved-motion studio browser acceptance also passed.

`scripts/animation-locomotion-bake.mjs` processes saved neutral Kimodo walk/run sources through the new flexible profile. Both passed technical validation, including bilateral stance coverage and exported-pose checks. Walk contact error was 1.52 cm; run contact error was 2.33 cm. Both loop seam angles were zero within exported precision. These are saved neutral source fixtures, not acceptance of arbitrary new prompted styles.

`scripts/animation-locomotion-browser.mjs` loads the actual processed GLBs with provider traffic blocked. It verifies motion advances, contact locks become active, six walk/run transitions work, profile controls toggle, pause holds a stable frame and there are no page errors. Artifacts are under `output/animation-locomotion-*`.

The four affected Edge entries (`animation-studio`, `game-command`, `get-game-workspace`, `get-game-release`) and both isolated Fly apps are deployed. All three game worker processes are started on image `deployment-01M2B5JNM712T70YAEKC7RS6MW`; the asset health endpoint reports `game-animation-studio-2.1.0` and healthy. The preview returns HTTP 200; the animation boundary returns 401 without authentication and 200 for OPTIONS.

The marked fixture's hosted CPU import job `cfe2e5ef-8b0a-42e3-a3ef-6fcf4aec62c1` completed and produced technically validated candidate `d1a1722c-eadf-4362-a07e-a639bb32ea95`. Downloaded GLB bytes matched the recorded hash. `provider_started` stayed false and the inference reservation ledger count did not change. This service-scoped worker smoke test does not establish authenticated UI-to-Edge source-lineage acceptance; that boundary has domain-policy tests and remains a separate hosted acceptance check. No candidate was accepted into a user graph or gameplay binding. Main frontend hosting remains unspecified; frontend verification is local. Hosted authenticated prompt and creator review acceptance remain separate from these CPU/runtime checks.
