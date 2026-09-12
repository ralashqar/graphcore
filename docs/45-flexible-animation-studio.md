# Flexible animation studio

The default `/app/animations` page starts with an empty, project-owned graph. Version 3 (`animation-studio-2.0.0`) supports arbitrary clip descriptions, nested machines, explicit 1D/2D blends, named events, typed parameters, shared styles and static props/anchors. Version-2 authoring and existing game snapshots remain available through the legacy workspace. Conversion creates a new revision and clears active bindings; historical clips remain available. Conversion does not claim identical locomotion playback.

## Living graph edits

The existing `plan` command now dispatches by graph version. The flexible planner receives current structure, selected scope, recent prompt history and provider constraints. It returns typed collection upserts/removals and metadata edits. One semantic repair attempt includes the invalid edit and its validation diagnostics; provider transport failures are not treated as repairable graph errors. Server validation preserves existing candidate ownership and fingerprints, rejects invalid references/cycles/conditions, and freezes the resulting graph. Node labels and transition/input edits do not invalidate clips; motion descriptions, styles, duration, root settings, contact constraints and pinned entry sources do.

`animation_studio_finish_edit` applies a valid result atomically at its original revision and lease fence. A stale result is retained as `edit.conflict`; changes beyond a selected state and its descendants become `edit.scope_review`. The authenticated `apply_edit` command can apply that proposal only at its original revision. `restore` restores an immutable revision as a new revision. The UI exposes prompt history, changed/deleted nodes, full edit details, undo/redo and revision restoration. Failed jobs retain diagnostics and paid-generation uncertainty behavior.

Migration `20260912132026_animation_studio_flexible.sql` replaces the existing command implementation without changing table ownership or browser write permissions. History uses existing RLS-protected revision rows. Job prompts/results use the existing fenced game jobs; no new standalone conversation service is introduced.

## Standalone runtime

Machine entry descends to a playable leaf. Eligible transitions are ordered by leaf before ancestor, then explicit priority and ID; at most one is taken per tick. Conditions are typed comparisons, never scripts. Completion transitions use the active leaf; terminal non-looping clips hold their final pose. Event buffers are bounded. 1D blends interpolate adjacent samples; 2D blends use normalized inverse squared distance and exact sample selection.

The preview shares the Fabric/GLB renderer, and exposes event buttons/keys, parameter controls, per-node entry, scrub, pause/speed, active hierarchy, weights and transition history. Conventional `move_x`, `move_z` and `speed` parameters receive WASD/Shift controls; other parameters use their authored controls. Missing clips use a static neutral pose placeholder, not an invented performance. Static boxes/spheres/cylinders and anchor markers provide spatial references. Moving-character playback uses baked root curves; in-place playback suppresses horizontal displacement. Props provide no collision, IK or partner animation.

## Motion generation and game integration

Generic studio recipes use a `custom` motion role independently of the gameplay state catalog, with frozen `soma-fabric-flexible-1.0.0` CPU processing. Kimodo receives arbitrary motion text, shared style, adjacent descriptions and supported constraints. Contacts require explicit pelvis/hip milestone coordinates as well as an effector anchor; the compiler does not silently constrain a standing body. Textual entry/exit descriptions are guidance, not pose-continuity guarantees.

Independent clips use the existing bounded asset queue. A dependent node stays unready until the creator selects a generated predecessor candidate, whose owned source bytes are hash-checked and pinned before its next admission. Runtime cycles are allowed; source dependencies remain acyclic. Unrelated edits retain reusable clips, and stale/rejected sources remain in candidate/revision history.

Graph structural validation is independent of motion generation and creator visual review. A complete graph review requires accepted clips and explicit visual transition review. Flexible graphs can map six distinct looping clips to the supported neutral gameplay locomotion roles; movement clips must contain usable root displacement. The binding freezes both source graph and deterministic mapped graph. Unmapped custom states remain standalone; gameplay actions yield to the existing runtime and are not created or replaced by this mapping. Existing sword/combo attachment remains in the legacy interface.

## Validation and release limits

Focused tests cover arbitrary wave/bow sequences, terminal states, hierarchy precedence, blends, scope expansion, clip preservation/invalidation, dependency cycles, generic requests/anchors and immutable conversion. Rollback-only SQL tests cover exact replay, lease fences, automatic edit application, revision conflicts, scope review and history RLS without changing game designs. The browser fixture exercises initial and follow-up prompt results, custom keyboard events, completion, undo/redo and mobile overflow with provider traffic blocked. Its planner output is simulated; it does not establish hosted LLM quality.

`scripts/animation-flexible-bake.mjs` processes a saved Kimodo idle source through the generic adapter. Passing this verifies processing/validation plumbing, not newly generated wave/bow/dance quality. The native inference schema is updated locally. Existing GPU admissions remain off; no new inference or setup reservation is made by this upgrade. Deploy the updated native image and perform funded motion acceptance before enabling generation. Hosted planner acceptance remains subject to existing owner gates and design credits.

Deploy the additive migration, animation-studio/game-command/get-game-workspace/get-game-release functions, and isolated Fly game/preview apps together. The world worker does not execute these modules. Main frontend hosting remains unspecified; local frontend verification is separate from backend rollout.

### September 12 verification

The migration and four Edge functions are deployed. The preview Fly deployment passed machine checks. The game worker is redeployed with the bounded semantic-repair handler and all three machine checks passed. Local TypeScript/Deno checks, frontend/game builds, dev startup, both legacy/flexible browser checks and rollback database checks passed. The main suite passed 726 tests with 8 skipped; the v3 suite passed all 80 tests; studio suites passed all 16 tests. The generic CPU bake of a saved source passed.

The flexible browser fixture also exercises parameter controls and a static reference prop. Evidence is under `output/animation-flexible-*`. A conservative hosted planning script stopped because it could not verify Edge admission settings from worker configuration; this does not establish that the user-facing Edge gate is disabled. No live LLM request, GPU request or new inference reservation was made by that check. Hosted prompt acceptance still requires an authenticated Edge session with admission and design credits.
