# Promptable pose programs

## Delivery

1. Versioned key-pose sequences, deterministic interpolation, grounded presentation and bounded rotational IK. A prompt can propose an animation-only sequence with no ability.
2. Forward roll: Z input, eligibility, stamina/cooldown, eased collision-resolved displacement, recovery, no dodge protection.
3. Uppercut: X input, fixed-facing hit window, swept melee hit, damage, compatible receiver reaction (recoil → fall → physics landing → prone → clearance → get-up → control).
4. Kimodo replacement adapter: approved milestone constraints, motion-contract hashing, immutable clip validation and compatible playback. **GPU replacement remains gated and has no generated-motion acceptance yet.**

## Authoring and review

The existing authenticated `plan_mechanic` route uses `performance-1.0.0`. It receives the actor, current programs, supported recipes, SOMA joint catalog, coordinate convention and receiver definitions. Its bounded output contains sequences, ability programs and reaction programs. Unsupported capabilities return gaps. No executable scripts or arbitrary interpolation expressions are accepted.

Scope merging preserves unrelated mechanics and pose records. Plans freeze the catalog/design revision. Workflow steps include intent, capabilities, composition, each pose sequence, aggregate validation, contracts, simulation and creator review. Each stage uses existing fenced/idempotent checkpoints. Review does not mutate the running game. Accepting a proposal updates the saved design; the existing build/acceptance/apply/rollback flow makes it playable at a safe checkpoint.

The Mechanics tab includes prompt examples, motion selection, orbit/zoom, pause, speed, scrubbing, targets/contact overlays and a behavior/animation graph. Custom animation-only sequences can be previewed and saved but have no automatic gameplay trigger. Published-player sessions have no authoring privileges.

## Contracts and execution

`poseSequence.ts` rejects unknown joints, malformed timelines, unsupported rotations, duplicate markers and inconsistent loops. `performance.ts` checks identity, role, required motion references and agreement between active hit markers and ability timing. Generated curves are interpolated by fixed code. Pose validation checks finite normalized transforms, angular speed and reachable milestones/contacts; the solver preserves bone lengths. Pose root offsets are visual only. The collision controller consumes requested travel once.

Programs require `motion-1.0.0` and the SOMA mannequin. Runtime `gameplay-3.5.0` is selected only for designs using performance programs. Previous manifests remain readable. New replacement bindings on other rigs are rejected. Roll direction is fixed for this first recipe. Knockdown keeps the full upright capsule rather than ragdoll or prone collision geometry, so narrow-space motion is conservative. Repeated hits can damage but do not restart an existing reaction. Dead actors do not get up. Save/live patch is unavailable during a reaction.

## Kimodo handoff and cost gates

`replacementRecipe` evaluates milestones into the adapter-supported pelvis/hip/hand/foot constraints. A contract hash freezes the sequence and rig; semantic markers remain part of the sequence hash. Only explicit generation commands submit work. Server admission checks the saved sequence and exact compiled constraints/thresholds, allowing a different seed/candidate count within existing bounds. The CPU baker rejects replacement duration or milestone mismatches; exported motion must also pass the existing GLB checks. Bind/build/playback reject stale contract hashes. Fallback remains procedural when no compatible replacement is available.

The checked-in Runpod request schema supports the new optional contract and state names. **The running Runpod container has not been redeployed for this change.** `GAME_PERFORMANCE_ANIMATION_ENABLED` must stay off until its schema is deployed and bounded paid tests demonstrate quality. The UI displays this gate. Existing $30 setup/$25 admission/$5 buffer accounting is unchanged, no GPU experiments were submitted, and previous billing reservations remain held. Existing owner mechanic credit/admission restrictions remain in force; no paid LLM planning was bypassed for testing.

## Verification

- TypeScript, frontend build and standalone runtime build.
- Regression coverage for legacy game mechanics, animation requirements, loops and unified missions.
- New tests: invalid pose data, full-roll winding, fixed bone lengths, unreachable targets, timing mismatches, sibling preservation, runtime downgrade rejection, roll distance/protection/recovery, blocked roll, actual uppercut sweep, knockdown/get-up and replacement milestone hashing.
- Isolated real-browser authoring exercises the actual React workspace with a stub command API; it verifies review before materialization, timeline and graph controls. This does not establish hosted LLM quality.
- Standalone real-browser Courier acceptance includes Z/X actions and SOMA presentation with all external requests blocked. The close-range receiver fixture additionally proves keyboard uppercut → damage → reaction → get-up; `node --experimental-strip-types scripts/game-performance-smoke.mjs` repeats it.
- Existing database transaction tests verify service-only mutation, ownership, idempotency and stale-review rejection, and roll back all fixtures.

Run `npm run test:game-mechanics`, `node --experimental-strip-types scripts/game-mechanics-authoring-browser.mjs --performance`, and `node scripts/game-browser-acceptance.mjs output/game-performance` after preparing a fixture and building the runtime. Main frontend hosting remains unspecified; development is verified locally. Hosted deployment evidence is appended below when complete.

## Hosted rollout evidence — 9 September 2026

- Deployed `game-command`, `get-game-workspace`, `get-game-release`, isolated Fly game worker `game-performance-3.5.0`, and isolated preview app. No world-worker execution path changed.
- Installed only the deterministic default roll/uppercut recipes in the existing marked Courier fixture, preserving the previous mechanics and six accepted SOMA locomotion clips. The fixture import and build reserved zero credits; it is not evidence of a paid hosted LLM planning run.
- First build `c7f1dc59-b26b-415c-9f56-eb45be44121c` was rejected by the legacy wall-jump browser timer. Its snapshot showed a successful wall jump, descending 0.116m above the floor after eight wall-clock seconds. The acceptance test now separates a 180-simulation-tick landing limit from a 30-second software-renderer timeout. Previous-runtime local wall traversal also passed the corrected test.
- Build `a022545f-c521-45e6-a7c3-41ce79310243`, source revision 9, passed all **39 hosted checks** and was published. The failed build never replaced the previous accepted pointer.
- Published demo: https://graphcore-game-preview.fly.dev/?release=a022545f-c521-45e6-a7c3-41ce79310243 . **Z** rolls; **X** uppercuts; F/Q combos/dashes and original mechanics remain available.
- Main authoring frontend builds locally and its dev route returned HTTP 200 with no page errors. Hosted frontend destination remains unspecified. Owner live mechanic planning remains gated pending design credits; Runpod replacement stays gated pending provider-schema deployment, billing reconciliation and measured motion quality. No new GPU request was submitted.
- Fresh-session published F/Q/Z/X playback, all six clip bindings, and save/reload restoration passed with Runpod/Fal requests blocked. Evidence: output/game-performance-release-browser/report.json.
