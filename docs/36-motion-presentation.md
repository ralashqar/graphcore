# Motion presentation and SOMA mannequin

## Implementation

- Optional frozen `motion-1.0.0` profile selects `gameplay-3.4.0`; schema 1/2 and previous schema 3 remain readable. Scoped mechanic composition proposes the new profile. No automatic migration of published builds.
- Dash uses the integral of a smoothstep velocity ramp, cruise and brake. Brake time is bounded by recovery. Discrete differences preserve requested distance. Collision consumes each displacement once; blocked distance is discarded. No dodge protection is added.
- `humanoid.soma.v2` contains the saved source's 77-joint hierarchy, local bind offsets, meter/Y-up/Z-forward convention and sockets. Neutral idle is a pose rather than a changed bind/rest pose. Provenance lives in `somaSkeleton.ts`.
- The new mannequin plays generated clips and procedural approximations on the same transform hierarchy. Displayed poses blend through interruptions; fixed-step root transforms are interpolated for rendering. Character collision is not interpolated or displaced by animation.
- Three combo stages use distinct torso/arm milestones. Dash compresses and leans through braking. Airborne, roll, guard/cast and hang fallback poses remain approximations. Two-bone rotational contact correction preserves lengths and rejects unreachable targets instead of stretching. This is not automatic motion synthesis or arbitrary-terrain animation support.
- Old and SOMA rigs are both recognized by the explicit animation command. Planning selects the SOMA rig for designs using the new motion profile. GPU gates and the $30 total budget are unchanged.

## Re-bake and rollout

`scripts/game-animation-hosted.mjs import --soma` creates a separate immutable manifest under `output/game-animation-soma`, uploads the six existing source motions and reuses original provider request IDs. It does not submit inference. Normal isolated Fly asset stages retarget/process/export/validate/register candidates. The fixture-only `test-bind --soma` explicitly filters the new rig revision; ordinary user projects still require manual acceptance. `scripts/game-mechanics-hosted.mjs install-motion` only operates on the marked acceptance fixture.

Deploy affected game Edge functions plus isolated Fly game and preview apps. Shared world-generation execution does not import these changed paths. Main frontend remains a local build until a hosting destination is supplied.

## Verification status

Local curve/distance/runtime-version, rig hierarchy, neutral pose, bone-length and rejected-contact tests pass. Legacy combo/traversal tests and real keyboard wall/combo/dash/rollback/checkpoint tests pass. All six hosted re-bakes passed the unchanged post-export validation thresholds and were explicitly accepted in the marked fixture. Published revision 8 is `a55996c5-d556-40ed-a6c6-da52b52c778e` (runtime `gameplay-3.4.0`): all 35 hosted checks passed. The first candidate `dc42ed03-1c63-4f3f-8bf4-9bbd62376bf8` was rejected after 34/35 checks because the wall approach driver used movement pulses shorter than a hosted simulation frame. The driver now holds movement until the simulation advances; no gameplay assertion or motion threshold was weakened.

Fresh public playback loaded all six clips, exercised combo/dash procedural presentation, and restored a checkpoint after reload with Runpod/Fal blocked (`errors=[]`, `providerCalls=[]`). The earlier public build `a01a7d25-bf28-4899-b28a-8339577ea22b` also passed fresh-session compatibility checks on the updated preview app. Source imports and build/publish operations reserved zero generation credits. Existing setup-budget reservations remain unchanged; no GPU generation was submitted.

Verification: 20 focused motion/mechanics tests, 37 gameplay/animation regression tests, 17 local Courier keyboard checks, database review/import tests, Deno checks, `npx tsc --noEmit`, full frontend and game runtime builds, and a newly started development server/browser check. Build warnings are the existing bundle-size warnings. The temporary verification dev server was stopped; the existing local servers were preserved.

Evidence: `output/motion-bake-status.log`, `output/motion-hosted-status.log`, `output/game-motion-release-browser/report.json`, `output/game-motion-courier/report.json`, and `output/motion-release-frontend.log`. Game Edge entries and both isolated Fly apps are deployed. The final keyboard-driver-only correction was deployed to the game worker, where it executes.

[Published demo](https://graphcore-game-preview.fly.dev/?release=a55996c5-d556-40ed-a6c6-da52b52c778e).

Rig changes require a new build/reload; live mechanic replacement does not retarget a running character. Contact and action poses remain bounded procedural approximations, not newly generated jump/roll/ledge clips. Gameplay hit tests and projectile timing retain their authoritative controller contracts.
