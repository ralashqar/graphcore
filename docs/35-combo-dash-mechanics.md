# Composable combo and dash actions

## Scope

The optional `mechanics.actions` catalog (`actions-1.0.0`) extends unified builds with runtime `gameplay-3.3.0`. It supplies a three-strike tap combo and a forward dash for the player actor. Existing traversal-only builds keep `gameplay-3.2.0`; prior animation and legacy schemas remain readable. These are tested, bounded gameplay recipes, not arbitrary generated controller code.

Each combo strike has separate anticipation, active time, recovery, range, damage and stamina cost. A rising attack edge can buffer one next strike for a bounded period. Expired taps are discarded; holding the button cannot chain attacks. Recovery defines the chain/cancel window. Each strike uses the existing swept hit query and per-target hit set. Damage, death, interaction ownership and forced movement retain the existing combat rules; a lost action token discards its buffered continuation.

Dash captures facing at activation and uses the existing collision-resolved action movement. It has independent windup, distance, active duration, stamina cost, recovery and cooldown. It grants no dodge protection, does not steer, and cannot start airborne or while attached. Its cooldown survives checkpoint restoration. A blocked dash remains in recovery; obstruction does not refund its cost. Combo recovery may cancel into an available dash. This phase does not introduce hit-stun, aerial combos, lock-on, animation-generated displacement or arbitrary cancel graphs.

Both actions lower into reserved runtime ability/pose nodes; authored sibling nodes are unchanged. Generated runtime IDs cannot be activated directly through the legacy ability input. F (or the existing attack mouse control) sends combo taps; Q sends dash. Keys 1–4 preserve access to the original four ability slots, so adding a combo/dash never removes the existing spell, dodge or shield inputs. Missing action packages retain original attack/dodge bindings. Procedural poses remain visible during these actions instead of playing an unrelated accepted locomotion clip. No GPU work or new animation-budget reservation is involved.

## Authoring and live application

The Mechanics workspace accepts combat prompts with no wall selected. Example: **“Give this character a three-hit combo while tapping attack and a forward dash.”** The hosted planner receives separate action and wall catalogs and returns typed recipes or explicit capability gaps. Action catalog/model versions are frozen in admission context, and the existing durable workflow separates intent, capabilities, composition, contracts, simulation and review. Planning uses the existing design-credit reservation; materialization/building are deterministic.

Review shows each action's runtime graph and its input, state, timing and movement contracts. Saved recipe parameters, including per-strike values, are editable; edits mark the draft dirty and require Save and a new accepted build. Review does not replace the playing build. Explicit live application is allowed only at a safe grounded checkpoint and preserves mission, inventory, health and positions. It recompiles runtime action nodes atomically; rollback removes or restores those nodes. Existing geometry, rig and animation compatibility checks remain in force.

Action bundles are stored in the existing immutable mechanic revision JSON. No new database migration is required. Existing RLS/service-only mutation, idempotency, cancellation and frozen-revision materialization apply. Public play still does not accept authoring commands. `GAME_MECHANICS_ENABLED` remains owner-gated and off pending hosted prompt acceptance; fixture tests are not proof of enabled paid planning.

## Verification and deployment

- `npm run test:game-mechanics` includes action contracts, scoped ownership, tap/hold/expiry behavior, once-per-target damage, recovery cancellation, cooldown save/restore, collision limits, one controller move per tick, no dash protection and live replacement.
- Build admission calls `acceptActions` against the candidate's actual world and checks three releases, bounded dash movement, recovery and checkpoint restoration.
- The isolated browser worker runs real F/Q keyboard action acceptance alongside mission and wall traversal checks.
- `scripts/game-mechanics-browser.mjs` tests action installation, keyboard playback, checkpoint restoration and rollback through the actual creator iframe protocol.
- `scripts/game-mechanics-authoring-browser.mjs` exercises the actual React prompt/review/graph controls using an isolated command API; it does not invoke a hosted model.

Deploy the affected game Edge entries and both isolated Fly game/preview apps together. The shared world-generation worker does not execute these modules. Main frontend hosting remains unspecified; build and verify it locally. Preserve the existing $30 total animation setup limit and pending billing reservations.

## Local verification

TypeScript, Deno worker/Edge checks, full application and runtime builds passed. The existing regression suite passed 715 tests with 8 skipped; the mechanics suite passed all 17 tests. Database ownership, immutable revision and exact command checks passed in a rolled-back transaction. The authoring component test and full creator keyboard/apply/rollback/checkpoint browser test passed with no observed runtime errors. The full dev app returned HTTP 200 without page errors at `http://127.0.0.1:5184/app/game`.

The previous published fixture (`67e5d80e-2c2d-4faf-ba2b-235c410c4f04`) also passed mission, wall traversal, all six clips and fresh-page checkpoint restoration on the new preview app with inference domains blocked. Workflow cache keys retain runtime 3.2 for older frozen wall-only jobs; action catalog jobs/builds use runtime 3.3.

The fixture owner still has no `user_credits` balance record. Hosted prompt generation has not been verified and admissions remain off. The fixture's revision 6 contains manually installed tested action recipes; this is distinct from LLM-generated output. No model/GPU requests or new setup reservations were made.

Logs and reports: `output/actions-*.log`, `output/game-mechanics/report.json`, `output/game-mechanics-authoring/report.json`.


The first hosted revision-6 candidate (`fd51394f-fdf3-4f47-be54-3f0da3df9bfc`) was rejected by the Courier keyboard mission: replacing F with combo made the driver stop using the existing spell. Original loadout slots are now explicitly retained on keys 1–4, and the mission driver uses the original equipped attack while separate F/Q tests exercise the new actions. The corrected local Courier browser gate passed every objective, interaction, action, traversal and checkpoint check. The rejection preserved the previous published build.


The second candidate (`2b8b83d3-2bf8-4c8d-a593-e13910728515`) passed mission/combo/dash but was rejected when the wall-jump driver's exact waypoint correction oscillated roughly 16 cm from its target at hosted frame cadence. The driver now uses a tolerance derived from the renderer's six-tick input sample bound for intermediate waypoints and then approaches the authored face until collision contact. Actual traversal, release and landing assertions remain unchanged. The complete corrected local Courier browser gate passed.


## Hosted release

Build `a01a7d25-bf28-4899-b28a-8339577ea22b` passed all 35 hosted checks and is published at https://graphcore-game-preview.fly.dev/?release=a01a7d25-bf28-4899-b28a-8339577ea22b. Mission, original spell loadout, combo, dash, three wall mechanics, six animation bindings and checkpoint tests passed. The new public release then passed F/Q playback and fresh-page checkpoint restoration in a clean browser context with Runpod/Fal blocked: no provider requests and no observed runtime errors. Evidence: `output/game-action-release-browser/report.json`.

The game Edge entries and isolated Fly apps are deployed; worker health reports `game-mechanics-3.3.0`. No world-worker deployment was required. Main frontend remains verified locally, pending a hosting destination. This validates manually authored combo/dash gameplay and publication. Hosted LLM prompt acceptance still requires the fixture's 25 app credits, and `GAME_MECHANICS_ENABLED` remains off. The $30 total animation setup budget and existing held reservations are unchanged.
