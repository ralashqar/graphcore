# Prompt-to-game motion components

Runtime: `gameplay-3.6.0`. Worker: `game-motion-components-3.6.0`.
Catalog: `humanoid-motion-2.0.0`. Previous builds retain their versioned behavior.

## Authoring flow

New unified plans freeze the motion catalog and propose actor `motionProfile` values: rig, gait style and equipment. Fabric Y-Bot is the new humanoid default. Existing actors retain their rig selection. Planning proposes separate locomotion and traversal sets and never submits GPU work. Requirements follow the actor's movement, enabled abilities and authored traversal components.

The Animations workspace exposes rig/style/equipment selection, per-role reuse and capability gaps, selected generation reservations, reviewed-set activation and child workflow inspection. Individual candidate preview, comparison, acceptance, rejection and graph transition editing remain available. Browser pending commands persist by authenticated user/draft and are replayed with their original idempotency key after uncertain network results.

Commands through `game-command`:

- `save_motion_set`: save an immutable set definition and the actor's proposed motion profile.
- `generate_animation_set`: reuse reviewed compatible clips, then atomically reserve and enqueue the remaining selected roles. All child reservations succeed together or the transaction rolls back. The client's maximum reservation bounds the total quote.
- `bind_animation_set`: require every role to be reviewed and compatible; check loop/contact/root-direction evidence, then freeze set/rig/profile/graph references. Locomotion and traversal components can coexist on one graph.
- `cancel_animation_set`: fence all remaining child jobs; existing provider cancellation and financial reconciliation handle each job.
- `save_traversal_component`: add a validated authored low-vault component without inference.

`game_motion_sets`, `game_motion_set_runs` and `game_motion_set_jobs` have RLS-protected reads and service-only writes. Set bindings have database triggers requiring the immutable component snapshot, project-owned reviewed clips, matching rig/style and complete roles. Graph and clip revisions remain unchanged after publication. Changing a proposed profile does not replace the currently bound graph.

## Motion and presentation

Six stored Kimodo source motions were re-baked locally for Fabric: idle, walk, run, backward and both strafes. All passed the existing contact, correction, root-direction, loop and post-GLB checks. `soma-fabric-1.0.0` is a CPU-only recipe revision: canonical identity rest axes and matching hierarchy permit world-rotation transfer to the target's immutable proportions, followed by bounded stance processing. It is stripped from native inference requests. No motion was regenerated for these bakes.

Set locomotion uses a shared gait clock aligned to left-foot contact evidence. `sword-stance-1.0.0` masks only the right arm over the existing gait; fixed IK targets are cached per rig. The sword attaches to the right hand, stows during two-hand traversal/attachments and restores afterward. Full-body actions fade out the stance. Root motion, collision, damage and hit timing remain gameplay-owned.

New Fabric-profile builds load the pinned mesh even before clips are bound, using procedural poses. The static GLB is bundled in both runtime container builds; existing rig/runtime dispatch is preserved.

The MotionBricks adapter remains admitted for neutral idle/walk only. Typed experiment proposals now distinguish movement from facing and identify the upstream side-step/style primitives. They are **plans, not deployed directional inference support**. No verified running primitive is advertised. Zombie, injured and stealth generation remain experimental gaps.

## Traversal

Existing jump, roll and authored straight-ledge gameplay/procedural poses remain available. Generated replacements still require separate validated candidates and review; this release does not claim new generated jump/ledge coverage.

The low-vault prototype is deliberately narrow: a ground-level box 0.8 m high, 0.5 m deep and at least 1 m wide, approached from its negative-Z face. Press Interact to follow a capsule-safe lift/cross/land route. Every segment and the landing support are checked before admission and again during execution. Drop/cancel and forced movement release control at the current position. Saving and live replacement are disallowed while a vault owns the controller. The visual is a procedural clearance approximation, not a validated hand-planted or generated vault animation.

The mechanic planner may select supplied low-vault recipes when an eligible authored collider exists. Missing geometry is an explicit capability gap. Scoped mechanic edits preserve existing traversal components. Both simulation and browser build gates exercise placed vaults before promoting a build.

## Budget and rollout

The original $30 total setup allowance, $25 admission ceiling and $5 buffer are unchanged. The last read-only Runpod serverless billing response reported $0.06371381622739136 across the Kimodo and MotionBricks endpoints; the separate endpoint billing response was empty. These are aggregate records for an open window, not final per-reservation reconciliation. Existing $23.50 reservations remain committed. No new GPU work was submitted during this implementation.

Migration `20260909214012_game_motion_sets.sql`, the three game Edge entries and both isolated Fly game apps were deployed together on 9 September 2026. Database checks passed again against the applied schema. Shared world-worker deployment is unnecessary: changed game-domain modules execute only in the isolated game paths. Main frontend builds and browser checks passed locally; hosting remains pending its destination. On Windows, use `npm.cmd run game:migrate -- --motion-sets` to preserve forwarded arguments.

Service import: `node --experimental-strip-types scripts/game-fabric-motion-import.mjs import` reuses the six original source hashes and provider IDs in the marked acceptance project. `review` retrieves hosted validation and GLBs. It never accepts candidates or submits inference.

All six imports completed on the isolated Fly asset worker. Stored GLBs were downloaded and hash-checked. No inference reservation was created and no candidate was accepted or bound. Project `6fee993a-9583-4fd6-8546-11274c5cb7b3`, draft `8afdea20-3709-4ffa-9e8f-360aa20b01a8`, retained workspace revision 10.

| Motion | Pending-review candidate |
| --- | --- |
| Idle | `11f68b53-1a09-45bb-ad77-ad747c75154e` |
| Walk | `578c215b-ef13-41df-904b-1db807c29c55` |
| Run | `ffb643ce-689b-4bc2-9bdd-0b38d579069a` |
| Backward | `202dbb17-a180-40ee-9a74-90e9630d3b8e` |
| Strafe left | `ea25d80e-e8c8-4dd6-98e4-bd4d3f17bcb9` |
| Strafe right | `eb756225-6ed0-4144-921e-ea936f68db6f` |

`node scripts/game-motion-components-review.mjs` opens read-only hosted clip review on port 5195 and local sword/vault acceptance fixtures on ports 5196/5197. This does not publish or activate a project animation graph. The previously published `14ea1703-6d8a-4bf8-a28d-8e10034aed9f` still loads and restores saves after deployment with provider requests blocked. Publication of the new six-clip component remains pending creator acceptance and binding.

## Verification

- `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run build:game`, development server startup.
- `node --experimental-strip-types --test src/domain/game/v3/*.test.ts`.
- `node scripts/verify-game-motion-sets-db.mjs` (rollback transaction); use `--existing` after migration deployment.
- `node --experimental-strip-types scripts/game-fabric-kimodo-test.mjs` (saved sources only).
- `node scripts/game-motion-sets-browser.mjs` and existing animation-authoring browser checks.
- `node --experimental-strip-types scripts/game-motion-components-fixture.mjs`, then `node scripts/game-browser-acceptance.mjs output/game-fabric-kimodo/runtime --locomotion`.
- Generate `--vault` and `--vault --blocked` fixtures; run `game-vault-browser.mjs` against each, passing `--blocked` for the latter.

Local evidence is under `output/game-fabric-kimodo/` and `output/game-motion-sets-browser/`. Reviewable candidates are not automatically active project bindings. Broader MotionBricks directions/archetypes and generated traversal remain gated until measured provider experiments and target-rig acceptance pass.
