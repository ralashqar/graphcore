# Composable game mechanics and creator play

Action composition extends this foundation with combo and dash recipes; see [docs/35-combo-dash-mechanics.md](35-combo-dash-mechanics.md).

## Release scope

Runtime `gameplay-3.2.0` adds optional versioned mechanic packages to unified schema-3 designs. Existing schema-1/2 and schema-3 designs without mechanics retain their dispatch. This is a bounded traversal composition catalog, not an arbitrary physics or executable-code generator.

The first recipes are wall run, wall slide and wall jump for the player controller on explicitly selected static, axis-aligned box faces. Contact processing supports humanoids 1.65–1.95 m tall. Autonomous NPC traversal, moving walls, curved surfaces, corner transfer, arbitrary rigs and player-authored changes in published games are not supported. Unsupported prompt requests must return capability gaps.

`GAME_MECHANICS_ENABLED` defaults off and is checked with the existing unified/generation flags and owner allowlist. Enable only after the specific rollout acceptance gates pass. Main frontend hosting remains separate from the local build.

## Authoring and workflow

The Mechanics area and the creator controls beside the Build preview select an actor, collider face and prompt. `plan_mechanic` reserves the existing configured design credits (default 25), freezes the request in the existing durable game job and uses the shared provider gateway. It does not reserve GPU money or submit animation inference.

Inspect stages independently: intent → capabilities → composition → contracts → simulation → creator review. `materialize_mechanic` requires a completed, compatible proposal at the exact current revision. It saves only the reviewed mechanic bundle; the previous active build remains unchanged. Build/test/publish continue through the existing commands. Cancellation and fenced checkpoints retain existing ownership. Uncertain provider submissions are not automatically submitted again. A client command waiting for acknowledgement is persisted with its original idempotency key.

`game_mechanic_revisions` records immutable bundle snapshots whenever a design revision contains mechanics. Authenticated readers use draft RLS; mutations and the command RPC are service-only. Exact command reuse returns the original result; a changed payload with the same key is rejected.

## Runtime contracts

The catalog defines eight bounded primitive operations: surface query, airborne eligibility, tangent motion, gravity scaling, clearance, stamina consumption, exit impulse and contact pose. Their compiled graph exposes sensing, state, movement and presentation groups, units, resource ownership and transitions. The dataflow is fixed by tested catalog operations, rather than accepting arbitrary graph code or cycles. Inspector edits are schema validated and require a new accepted build.

The motor uses inactive, attached and departing states. Authored surface metadata is checked against actual box geometry. Capsule sweeps resolve requested movement once. Exclusive actions and existing interactions preempt traversal. New-runtime impulse effects queue a bounded forced movement instead of moving an actor again in the effect callback. Legacy effect behavior is preserved.

Wall run defaults: 2 m/s entry speed, 5 m/s tangent travel, 1.5-second limit, 0.25 gravity, 10 stamina/second. Wall slide caps descent at 2 m/s. Exit jumps request 3.5 m/s outward and 5 m/s upward, with a 0.25-second cooldown and one wall jump per airborne sequence. Hold V for traversal, Space to depart, C to drop. Collision and supported ground determine outcomes.

Procedural contact poses run at the fixed simulation tick. Alternating stance feet retain world-space anchors; the two-bone solver preserves limb lengths. Unreachable contacts beyond the package threshold release traversal and record a diagnostic. Presentation reads cached poses. Existing baked animations fall back to procedural wall poses during attachment; no new motion assets are required.

## Live application

Fetch an accepted build through the authenticated workspace endpoint, choose Stage live mechanic replacement, then explicitly Apply. The creator iframe validates parent origin, source window, session nonce and current build identity. Published release pages ignore creator messages.

Compatibility compares hashed non-mechanic design, assets and animation bindings. Geometry, rigs and sibling gameplay systems cannot change live. Application requires a grounded checkpoint with no attached interactions, actions, projectiles or active traversal. The synchronous simulation update preserves mission, inventory, health and actor positions and changes the build identity. A rejected update leaves the current simulation intact. The previous accepted mechanic build can be restored at the same safe boundary. Saves remain build-specific. Restart uses the most recently applied design.

## Validation and deployment

- `npm run test:game-mechanics`: composition, motor, contact lengths/anchors, correction rejection, compatibility and safe application.
- `npm run test:game-mechanics-browser`: actual keyboard wall run, slide and jump, creator protocol rejection, safe application, geometry rejection, rollback and checkpoint restoration with external network requests blocked.
- `npm run test:game-mechanics-db`: additive migration and command checks in a rolled-back transaction; use `node scripts/verify-game-mechanics-db.mjs --existing` after migration.
- Existing mission acceptance additionally checks each mechanic independently on an authored surface, including contact, release and landing. This can reject a proposal whose authored surface lacks sufficient height, approach space or landing support.
- Run TypeScript, Deno worker/Edge checks, application/runtime builds, full regression tests, dev-server and browser checks before rollout.

Deploy migration `20260909140823_game_mechanic_composition.sql`, affected game Edge entries, and both isolated Fly game/preview apps. The world-generation worker does not import these mechanic modules. Keep admissions off until hosted workflow and traversal acceptance pass. No GPU requests or changes to the existing $30 animation setup allowance are part of this release.

Local validation artifacts live under `output/game-mechanics/`; generated reports are not source files. This document describes implementation contracts, not proof that an arbitrary requested mechanic or animation has passed acceptance.

## September 9 rollout evidence

The additive migration and three game Edge entries are deployed. Both isolated Fly apps were updated; the worker health endpoint reports `game-mechanics-3.2.0`. No world-worker deployment was required. TypeScript, Deno worker/Edge checking, application and runtime builds, 715 existing tests (8 skipped), 10 mechanic tests, rolled-back database checks, actual Mechanics component review controls and keyboard/live-application browser checks passed. The full local dev app runs at `http://127.0.0.1:5183/app/game` without observed browser runtime errors.

The marked Courier fixture at draft `8afdea20-3709-4ffa-9e8f-360aa20b01a8` contains manually installed, tested recipes. Build `67e5d80e-2c2d-4faf-ba2b-235c410c4f04` passed hosted mission, all three traversal keyboard checks and the six existing animation bindings, and is published at `https://graphcore-game-preview.fly.dev/?release=67e5d80e-2c2d-4faf-ba2b-235c410c4f04`. The previous candidate was correctly rejected after the browser driver's approach timeout; it did not replace the active build. The driver was corrected and the full gate rerun.

Fresh published-browser verification also passed all three traversal mechanics, the mission and checkpoint restoration with Runpod/Fal access blocked: zero provider calls, zero observed runtime errors, six loaded clip bindings. The keyboard driver waits for the first jump to reach the airborne state before sending the second jump edge, avoiding frame-dependent input coalescing. Evidence: `output/game-animation-release-browser/report.json`.

**Remaining gate:** the hosted `plan_mechanic` command was rejected for insufficient GraphCore design credits before a model request was submitted. The fixture needs 25 app credits to finish prompt → proposal → review → build verification. `GAME_MECHANICS_ENABLED` remains off. Do not describe prompt-generated wall traversal as fully enabled. The fixture publication proves the deterministic authoring/runtime path, not hosted LLM planning. No GPU requests or setup-budget reservations were made by this work. `scripts/game-mechanics-hosted.mjs` retains the fixture command/result files and checks for prior admission before refreshing a stale, rejected command.
