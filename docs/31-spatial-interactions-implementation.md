# Spatial interactions, quadrupeds and seating

Implemented September 2026 as an additive extension to the [combat gameplay workspace](30-gameplay-modules-implementation.md). Runtime implementation is `gameplay-2.1.0`; existing schema-1 adventure and `gameplay-2.0.0` combat manifests remain readable.

## Using it

Open a combat workspace, choose **Add interaction playground**, and inspect the new **Interactions** tab. Save the design to enable server builds and scoped generation. A prompt can also request the tested interaction playground; the scope planner selects its allowlisted recipe and the worker adds its definitions deterministically. The recipe introduces 28 nodes, bringing the default courtyard to 47.

The playground contains a chair, a rideable quadruped, a basic drivable vehicle and a hinged door. Approach a target and press E. E or C exits a seat when a clear supported exit is available; a moving mount is stopped before exit. WASD transfers to the occupied horse/vehicle controller. Escape cancels an interaction. The socket debug toggle also displays target anchors.

The interaction laboratory shows participant proportions, phase poses, target body outlines and spatial anchors in front/side views. Unreachable contacts surface diagnostics. The Systems views expose typed definitions, contact references, composition dependencies, runtime phases and durable generation steps. Larger composition graphs show the selected dependency branch. Nested data, including anchors and contacts, remains editable through the validated structured definition editor.

## Architecture

Seven reusable node kinds are defined in `src/domain/game/interactions/spec.ts`:

| Kind | Contract |
| --- | --- |
| `body` | Humanoid, quadruped or rigid family; dimensions and limb scale |
| `anchor_set` | Target-local position, yaw and role for approach, pelvis, contact and exit anchors |
| `contact_pose` | Participant body, explicit anchor-set dependency, pelvis target and bounded hand/foot contact constraints |
| `interaction` | Participant body, target anchors, exclusive slot, approach/exit references, motion tolerance and ordered phases |
| `mechanism` | Bounded hinged panel, lock, travel angle and duration |
| `locomotor` | Quadruped or vehicle movement, speed, acceleration, braking and turn rate |
| `interactive_entity` | Instanced body, anchors, offered interactions, optional motor/mechanism and transform |

Composition references determine generation dependencies. Runtime phases use a separate ordered control graph: align → contact phases → attach or actuate. Compiler checks require exactly one terminal commit, validate referenced kinds/anchors/body compatibility, and reject unreachable contact definitions. The existing required combat motor transitions remain intact.

`InteractionRuntime` owns local slot reservations and actor sessions. Requests check actor state, range, target availability, slot ownership, target speed, approach clearance, support, door locks and contact reach. Both player and NPC requests use the same executor API, although the existing NPC brain does not autonomously seek chairs or mounts in this release.

Only one movement controller owns an actor during an interaction. Once attached, the actor root follows the target-relative seating frame and input controls the target motor. Costs and combat actions cannot accidentally run while the actor is owned by the interaction. Target motion during alignment, damage, death, cancellation or target loss triggers release or a safe exit. Blocked exits retain the attachment and report why it cannot be released.

Target movement uses bounded kinematic collision checks, braking, ground support at the body corners and rider clearance. A mount that fits below a beam cannot carry a clipping rider through it. Hinge rotation samples its swept movement; an obstruction stops the mechanism and identifies the collider. The door's visual transform and collider share the same hinge calculation.

`poses.ts` solves humanoid hand/foot targets with bounded two-bone IK and exposes target-relative transforms. Horse mounting includes a hand and foot contact phase before the seated pose. The quadruped presenter has four articulated limb chains and a procedural alternating gait. These are approximate poses and motion for gameplay validation; no animation clips or generated character meshes are required.

Safe checkpoints include target transforms, mechanism angles, occupied slots and attached actor relations. Transitional interactions, moving targets and moving doors cannot be saved. Restore validates matching entity IDs, slots, body references, seating transforms, collision and support, and rolls back failed restoration. Checkpoints remain local single-player state.

## Server integration and deployment

The existing game-owned command, immutable revision, step-cache, RLS, fenced lease and billing boundaries are reused. No new database tables or migration are required. Existing `game_spec_nodes` captures the additional kinds. The maximum design size is now 120 nodes; scoped command limits remain bounded.

`workers/game/modules.ts` permits the `interaction_playground` recipe only when offered. Explicit child-node targets cannot add recipes. Recipe creation commits the tested defaults after acceptance and never rewrites their nodes in that command, even if scope selection lists redundant node IDs. Subsequent prompts use the schema-restricted child planners to refine individual body, anchor, pose, interaction, mechanism or movement definitions. Pose planners receive their explicit anchor-set dependency. Source world context is frozen and never mutated. Planner/default model and credit reservations remain unchanged. Cache identities include `gameplay-2.1.0`, preventing old validation results from substituting for new runtime checks.

Deploy `game-command`, `get-game-workspace`, `get-game-release`, the isolated Fly game worker and the separate preview app together. Admission remains behind `GAME_MODULES_ENABLED`, `GAME_GENERATION_ENABLED` and the existing owner allowlist; shared defaults stay disabled. Main application frontend hosting is separate from these backend/preview deployments.

## Verification

```text
npx tsc --noEmit
npm test
npm run build
npm run build:game
npm run test:game-interactions
npm run test:game-modules-db:existing
npm run test:game-modules-workspace
```

Set `GAME_TEST_INTERACTIONS=true` for `npm run test:game-modules-browser`. The browser completes combat and ledge traversal, then reaches every interaction using real keyboard input and collision-aware approach paths. It checks rider control and attached save/restart/load. The worker runs the same acceptance path before promoting a build. The test probe exposes state and route queries only, with no teleport/state-write hook.

The focused tests cover contract/dependency validation, exclusive slots, cancellation, moving-target/damage interruption, target loss, blocked exits, locked/obstructed doors, unreachable contacts, attached save validation, controller transfer, rider clearance, rotated anchors, quadruped limb bounds and deterministic replay. Local evidence is under ignored `output/game-interactions-*` and `output/game-module-*` paths. The marked live fixture script can request the recipe through the provider, refine only the horse motor, build/publish and archive its fixture.

## Acceptance record

Local verification passed: 699 active tests, 8 skipped, no failures; TypeScript/app/game builds; Deno checks for the worker and all three game Edge entries; existing database transaction tests; and the workspace interaction inspector. Mage and melee both completed the real-keyboard interaction playthrough. The existing published adventure release still loaded both GLBs and saved successfully.

The live recipe request expanded the design from 19 to 47 nodes while preserving all original nodes. A subsequent scoped provider request changed only `motor.horse.maxSpeed` from 3 to 3.5. The earlier live attempt exposed unwanted refinement of recipe defaults; it failed without changing the saved design. The corrected path separates recipe creation from subsequent refinement and preserves that failed run's diagnostics.

Hosted build `9f8f360e-7f18-4518-ad3c-6a31ea80763e` was accepted after all contract, simulation and Chromium interaction checks passed. All three game Edge entries and the isolated game/preview Fly apps are deployed. Admission remains restricted to the existing owner allowlist. The previous published combat release also still loads and saves correctly. Main frontend changes are local; this task did not publish the main application frontend.

The [published interaction demo](https://graphcore-game-preview.fly.dev/?release=9f8f360e-7f18-4518-ad3c-6a31ea80763e) passed a separate public-host browser playthrough: 14 checks, no browser errors, including combat/climb completion, all four interactions, controller transfer and attached checkpoint restoration. The synthetic acceptance project is archived after verification; the immutable published build remains available.

## Bounds of this release

This is reusable interaction infrastructure with a curated primitive library. New physical operations still require extending the compiler/runtime/tests together. Participant pose solving currently supports humanoids; quadrupeds are moving targets with a canonical four-leg body. Arbitrary user-defined skeleton chains and full animation retargeting are not included.

The vehicle has collision-aware kinematic steering, acceleration and braking on supported ground. It is an open seating/control example, not a suspension, tire, transmission or crash simulator; vehicle door-entry composition can be added using the mechanism and interaction contracts. Mounting starts from a stationary target. There is no multiplayer reservation authority, moving-platform network prediction or general full-body dynamics. Reservations and simulation are local; authoring, validation and publication are server-owned.

Spatial anchors are authored/generated structured data and must be validated against body reach and scene clearance. Final art, complex motion generation, automatic landmark detection from arbitrary meshes and Blender rigging remain later production steps. The current complete gameplay route remains the courtyard acceptance scenario.
