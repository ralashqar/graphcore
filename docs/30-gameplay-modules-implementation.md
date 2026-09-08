# Gameplay modules: combat and traversal

Implemented September 8, 2026. This is the first gameplay-focused release following the [Fabric review](29-fabric-gameplay-reuse-review.md), alongside the existing [adventure workspace](28-game-workspace-implementation.md).

The subsequent [spatial interaction extension](31-spatial-interactions-implementation.md) adds chairs, quadruped mounts, basic vehicle control, doors and reusable contact contracts.

## Delivered scope

`/app/game` offers separate Adventure and Combat & traversal foundations. A saved draft keeps its template; use a new draft for another foundation. The combat workspace has Overview, Systems, Levels, Assets and Build & Play pages. Each system exposes its definition, composition references, behavior, generation steps, acceptance reports, dependencies and pose/socket inspection. Definitions have editable scalar fields and a validated structured editor for nested fields.

The `combat_traversal.v1` template contains 19 nodes across nine strict kinds: actor, ability, movement, projectile, pose, rig, behavior, world and scenario. It supports mage and melee player archetypes, an enemy and a training target; strike, slowing bolt, dodge and shield; patrol/chase/attack behavior; jump, grip, shimmy, climb, drop and death. The courtyard objective requires defeating the hostile and climbing the platform. Keyboard controls are WASD, Shift sprint, Space jump, E grip/climb/activate, C drop, F attack, Q dodge and R shield.

Fabric informed the decomposition, affordance semantics and characterization scenarios. No Fabric source or bundled models/animation packs were copied: the reviewed repository had no located license, so the implemented runtime and definitions are independent. This release does not claim to import its entire effect or macro catalog.

## Contracts and execution

- `src/domain/game/v2/spec.ts`: versioned strict definitions, stable IDs, references, numeric bounds, semantic sockets and immutable build manifest.
- `compiler.ts`: kind/reference validation, required state transitions, geometry restrictions, source/node hashes and reverse dependency invalidation.
- `physics.ts`: pinned Rapier 0.17.3, static colliders, capsule character motor, clearance/support tests and swept projectile collision.
- `simulation.ts`: fixed 60 Hz input-driven simulation. Ability requests validate cost/cooldown/state, pay once, then execute windup/active/recovery. Player and NPC share the same ability executor. Damage, invulnerability, interruption and projectile lifecycle are independent of visual animation.
- `pose.ts`: canonical articulated body, bounded two-bone IK and phase poses. Eight logical sockets provide position and forward direction for effects, attachments and grips before a final mesh exists.
- `src/game-runtime/combatRenderer.ts`: Babylon primitive presentation, camera-relative input and debug sockets. The motor owns actor position; rendering consumes simulation state.

Interactive simulation runs locally in the isolated preview. The server owns authoring, revision history, validation and publication. The existing schema-1 adventure runtime and asset pipeline remain available.

## Server workflow

`game-command` remains the authenticated command boundary. It supports schema-2 save, node edits, scoped generate, test, build, cancel, deterministic build retry and publish. `template: "combat_traversal.v1"` identifies module commands; `targetNodeIds` limits a generation scope. Node edits preserve ID and kind and are merged under the existing optimistic revision lock.

The additive migration `20260908174628_game_module_nodes.sql` creates immutable revision nodes and durable `game_job_steps`. Browser roles have read-only RLS access. `game_write_step` requires the parent's current lease owner and fence, rejects hash changes and limits attempts. The read endpoint accepts a job ID and optional node ID for detailed steps.

`workers/game/modules.ts` runs scope selection → per-node structured planning → contract validation → headless acceptance. The planner receives frozen world context and the selected node's dependencies; its output cannot replace sibling nodes. The default model remains `gpt-4.1` through the shared provider/usage gateway. Unsupported mechanics fail with diagnostics. Contract repair is bounded. An uncertain provider submission goes to the existing reconciliation path instead of automatic paid resubmission.

Builds run per-node validation → manifest compilation → simulation → isolated Chromium keyboard acceptance. Steps persist their input hash, dependencies, attempts, result and diagnostics. Unchanged node validations reuse completed results from the same draft; whole-game acceptance is rerun when its design input changes. Cache keys include runtime implementation, and planning keys include model and frozen context. Test-only runs retain build reports without promoting the active build. Failed builds cannot replace the previous accepted pointer. Retrying a failed deterministic build resumes cached steps under a new fenced lease; uncertain paid planning is not exposed as a generic retry.

Gameplay checkpoints reject unsafe airborne/active-action saves and mismatched builds. They are browser-local single-player saves, not authoritative multiplayer state.

## Deployment and operation

Deploy the module migration, `game-command`, `get-game-workspace`, `get-game-release`, the isolated `graphcore-game` Fly app and `graphcore-game-preview`. This release adds no execution ownership to Director or world-generation jobs. Worker source changes require redeploying `fly.game.toml`; runtime changes require `fly.game-preview.toml` as well.

`GAME_MODULES_ENABLED` defaults false and additionally gates combat generate/build/test/retry admissions. Existing `GAME_GENERATION_ENABLED` and `GAME_GENERATION_USERS` still apply. Frontend exposure uses `VITE_GAME_BUILDER_ENABLED`. Shared defaults remain disabled; the deployed rollout is restricted to the existing consenting workspace owner. Deterministic primitive builds/tests are free; generation uses the existing quoted design-credit reservation and provider usage ledger.

Verification commands:

```text
npx tsc --noEmit
npm test
npm run build
npm run build:game
npm run dev
npm run test:game-modules
npm run test:game-modules-browser
npm run test:game-modules-workspace
npm run test:game-modules-db:existing
```

`GAME_TEST_ARCHETYPE=melee` selects melee for the browser scenario. `scripts/game-module-live.mjs` creates a clearly marked acceptance fixture, runs a scoped live edit/build, inspects persisted steps, publishes and archives the fixture. It reuses the previously consenting owner and never charges that owner for acceptance fixtures. The normal authenticated command path retains credit reservations. Evidence is stored locally under ignored `output/game-module-*` directories.

## Acceptance evidence (September 8, 2026)

The additive migration and all three game Edge entries are deployed. Both Fly apps passed deployment health checks. `GAME_MODULES_ENABLED=true` is set on the hosted command service; the existing owner allowlist remains the admission boundary. The local frontend contains the new workspace; this task did not publish the main application frontend.

- TypeScript compilation, app build, separate game build and worker Deno checks passed. The development server started and the workspace browser run had no page errors.
- Full suite: 687 passed, 8 skipped, zero failures. The 13 module tests cover contracts, deterministic replay, costs/cooldowns, shield/death, sockets/limb bounds, swept projectiles, save isolation, traversal safety and both archetype scenarios. Database transaction tests passed against the applied migration.
- Mage and melee passed isolated real-keyboard playthroughs, including combat, jump/grip/climb, objective and save/restart/load.
- Hosted build `5cfa1c33-3f19-4928-909c-e953765f8190` passed simulation and Chromium acceptance. Scoped planner job `130cd6b6-f37f-4e94-beec-1b95ca1c0415` changed only projectile damage from 25 to 30 and preserved every other node.
- Rebuild `95fc1913-3bc1-40a2-859f-18a7e86b795f` passed; 17 unchanged node validations and the already accepted simulation result were cached. Changed projectile and ability dependency validations reran, as did compile and browser acceptance.
- [Published combat preview](https://graphcore-game-preview.fly.dev/?release=95fc1913-3bc1-40a2-859f-18a7e86b795f) loaded, accepted keyboard combat and saved without browser errors. The previous published adventure build also loaded both GLBs and saved without browser errors.

## Deliberate first-release limits

This is a bounded gameplay foundation, not arbitrary prompt-generated source code or an unrestricted RPG engine. It has four primitive ability operations, fixed required motor transitions, a small NPC state machine and one proving arena. Graph topology is inspected visually; nested references/geometry are edited through validated definitions rather than arbitrary graph wiring. New mechanics require extending the schema, compiler, runtime and acceptance together.

Ledges are authored static horizontal segments running +X and facing -Z, with explicit landings and compatible endpoint connections. Moving platforms, general curved ledges, navigation meshes, multiplayer, arbitrary animation retargeting, arbitrary Blender scripts and arbitrary code execution are outside this release. Browser acceptance assumes the courtyard scenario and will reject geometry/behavior edits that make it unplayable by that route.

Combat uses articulated primitives and approximate logical poses. Production character visuals, Fabric animation packs, motion generation and a visual asset replacement pipeline are deferred for this template; the separate adventure image-to-mesh/Blender pipeline is preserved. Geometry budget checks and software-rendered browser playthroughs are acceptance evidence, not a hardware performance guarantee.
