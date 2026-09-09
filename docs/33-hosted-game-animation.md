# Hosted game animation implementation status

The approved release is **not complete**. Five generated locomotion clips now pass local motion validation; project-owned publication and the ledge sequence remain unvalidated. Keep animation admissions disabled. The dated sections below preserve the setup history.

## Provider and budget — 9 September 2026

Runpod authentication works using server-only `RUNPOD_GRAPHCORE` from a Git-ignored env file. The user connected Runpod to `ralashqar/graphcore`.

Endpoint `dr79dd76cb16de` (`graphcore-kimodo`) was created from branch `codex/hosted-game-animation`, commit `1d266cd9be91e8e5953d92dbf692070039bfe635`, Dockerfile `workers/game/animation/Dockerfile`, root context. Build `d54916c7-2a25-4517-a443-e1bcafea7db0` verified imports and reached image export. This image is **not ready for inference**: the public LLM2Vec MNTP repository contains adapters referencing gated `meta-llama/Meta-Llama-3-8B-Instruct` weights. An unauthenticated base-config request returned HTTP 401 with an explicit access restriction. No inference was submitted.

Endpoint read-back: queue, AMPERE_24, one GPU, minimum workers 0, maximum 1, five-second idle timeout, ten-minute execution timeout, Flashboot off, 50 GB disk, no network volume. Console quote: $0.69/hour active worker time. Current-hour billing returned zero records and $0; delayed billing remains possible.

Budget migration `20260909051220_game_animation_pipeline.sql` is deployed. Reservation `48f6de62-96fb-4565-a7e4-7ccf954eb7fb` holds $10 for deployment/benchmarking, submitted against the endpoint. This is a reservation, not measured expenditure. Retain it until billing reconciliation. The allowance is $30 total, with $25 admission ceiling and $10 benchmark / $10 integration / $5 ledge phase limits; no recurring allowance.

## Local implementation

- Versioned rig, recipe, accepted clip, graph and transport contracts; separate articulated humanoid with SOMA mapping.
- Typed Runpod handler, pinned dependencies, bounded work, offline inference and pre-initialization constraint validation.
- Fixed Blender retarget, loop/contact processing, root separation, GLB export and re-import validation. Generated walk, run, backward and both strafes pass policy `animation-1.1.0` on the supported mannequin.
- Authenticated commands, immutable candidates/graphs, RLS reads, service mutations, frozen build snapshots and fenced stages. The animation-job migration is **undeployed**; SQL checks roll it back.
- Submit-once checkpoint, uncertain reservations, cancellation and reuse of stored motion after processing failures.
- Animations workspace, preview, binding and workflow inspection; Babylon loading and directional blending, measured-speed playback and procedural fallback.
- Distinct roll without dodge protection, facing-preserving strafes, publication metadata and runtime `gameplay-3.1.0`.

Application changes are local, not deployed to Edge/Fly. Only the initial provider-directory commit is pushed. The current benchmark worker is described in the approved-access section below. Never place credentials in Docker build arguments or source.

## Remaining gates

1. Reconcile the benchmark and integration reservations against delayed provider billing before extending either phase's paid experiments.
2. Validate jump/roll and canonical hand-contact ledge recipes, runtime contact correction, and the complete authoring controls. The CPU foot-contact pipeline and authored graph crossfades are implemented; that does not establish ledge support.
3. Expand durability, isolation and concurrent-budget checks, verify recovery commands for animation jobs, and reconcile startup/idle pricing.
4. Validate generated locomotion loops/blends and catch → hang → shimmy → climb → walk. Failed candidates cannot replace accepted revisions.
5. Deploy the job migration, game Edge entries and isolated Fly game/preview apps together, with owner-only admission. Set server credentials, provider URLs and measured pricing. Main frontend hosting destination is still unspecified.

## Checks

TypeScript and Deno checks passed; application/runtime builds passed with chunk warnings. Thirteen focused animation/transport/runtime tests pass; the unchanged Python handler's five tests previously passed. SQL transaction tests previously passed using an isolated test budget, including command idempotency and cancellation fencing. CPU fixtures cover GLB round-trip, successful and impossible contacts, duration clipping and invalid root displacement. The development server starts and serves `/app/game`. Generated six-clip locomotion browser acceptance passed as recorded below. Project-owned hosted publication, jump/roll and the ledge sequence remain outstanding.

## Locomotion milestone — 9 September 2026

The five-request integration batch completed on the existing image. Request IDs and source motion are retained in `output/kimodo-locomotion-20260909-attempt2`. The first request took 144.562 seconds of reported execution including initialization; subsequent requests took 4.520–4.583 seconds each. The complete bounded batch lasted about 260 seconds. The guard restored min/max workers to zero and idle timeout to five seconds; a read-back confirmed zero workers. The provider temporarily listed one running and one throttled worker; no second simultaneous running worker was observed.

Reservation `d105efcf-ec6c-49d5-9b21-710f510c9fc0` retains $10 for integration. Together with the benchmark hold, **$20 is reserved, not reconciled expenditure**. Billing still returned zero records after the batch. Do not settle either reservation to zero or extend the integration phase beyond its cap without reconciliation. The $5 ledge allocation and $5 overall buffer remain uncommitted.

Policy `animation-1.1.0` fixes the previous seam algorithm, which erased the final swing by blending ending poses directly to the starting pose. It now corrects endpoint differences, searches at most eight distinct cycle windows, uses bounded two-link contact correction and pelvis adjustment, then applies a periodic filter. Inferred walking stance uses a 2.5 cm height band and 0.35 m/s ankle-speed gate; the shorter running heel/toe pivot uses 5.5 cm and 0.65 m/s. Stance coverage must reach 12% per foot for walking or 5% for running. Accepted contacts remain within the recipe's 3 cm positional tolerance after all processing. These inferred contacts are a supported-mannequin approximation, not full biomechanical contact reconstruction.

Validation independently checks correction magnitude, endpoint pose, second-order endpoint velocity, root speed (maximum 12 m/s), requested travel direction (dot product at least 0.7), bone lengths and re-imported GLB poses. Contact intervals are clipped to exported duration. Existing policy-1.0 clips remain readable. No recipe thresholds were relaxed to accept the generated clips.

| Clip | Maximum contact error | Seam velocity error | Maximum correction |
| --- | ---: | ---: | ---: |
| Walk | 1.25 cm | 0.091 m/s | 5.01 cm |
| Run | 1.91 cm | 0.180 m/s | 6.95 cm |
| Backward | 2.54 cm | 0.158 m/s | 5.60 cm |
| Strafe left | 1.28 cm | 0.082 m/s | 6.70 cm |
| Strafe right | 1.27 cm | 0.152 m/s | 7.33 cm |

All five have zero endpoint pose error and GLB round-trip position error below 0.002 mm. The isolated Chromium fixture combines them with the earlier generated idle clip. Real-keyboard mission, gate interaction, save/restart/load, six binding loads and repeated loops passed without browser errors. Measured loops: idle 10, walk 25, run 5, backward 13, left strafe 6, right strafe 5. Outbound requests were blocked by the acceptance harness; playback made no provider calls. This remains a local fixture, not a project-owned published build.

Babylon now uses authored graph crossfade durations, preserves the current blend when interrupted and exposes loop counters. Thirteen focused TypeScript tests pass, including interrupted transitions. CPU fixtures additionally verify successful planted contacts, duration clipping and rejection of invalid root displacement. Reproduce with `scripts/game-animation-bake-directory.mjs`, `scripts/game-animation-browser-fixture.mjs`, and `scripts/game-browser-acceptance.mjs output/game-animation-locomotion-browser --locomotion`. No new GPU generation is required for these checks.

Admissions freeze `processingVersion` alongside provider/model revisions. The database records that supplied version instead of a stale hard-coded policy, and workers refuse incompatible snapshots. Transaction tests reject obsolete versions and route command reservations to a separate test budget through a transaction-local function replacement, rolled back with all fixtures. They do not release, enlarge or consume the live setup reservations. The application migration remains undeployed.
## Approved model access and rebuild

Hugging Face access was approved and the saved `HF_TOKEN` returned HTTP 200 for the pinned base-model config. Runpod endpoint credential configuration returned HTTP 200; secret values were not logged. GitHub builder secret mounts were not verified, so commit `4e9b1efcd126f793428e05e39e919ae760dc19a1` uses public build-time assets and a pinned gated base download during first job initialization, limited to five minutes. The token is removed from the Python process environment before model loading; inference then uses local paths and offline mode. This benchmark route adds cold-start download time; a production cache/bake strategy remains needed.

GitHub prerelease `kimodo-worker-20260909.1` triggered build `23ad70d5-5569-4994-9591-e19c7f1e5540`. Maximum workers were temporarily set to zero while it builds after a worker on the old image remained initializing. Restore one only for the bounded test. `scripts/game-animation-benchmark.mjs` stores the submission marker and request ID, prohibits automatic resubmission, bounds wall time to fifteen minutes and sets maximum workers back to zero on completion/failure. The existing $10 benchmark reservation remains held.

Local follow-up fixes add stored-motion-only recovery via the existing retry command, per-user pending-command storage, and hash-checked local animation staging for isolated Chromium acceptance. SQL recovery/idempotency checks pass. Generated motion has not yet been accepted.
## First generated motion acceptance

Build `23ad70d5-5569-4994-9591-e19c7f1e5540` completed at 06:25:01 UTC. The first admission returned HTTP 409 without a request ID during worker-setting propagation; two health reads showed zero jobs. Its audit marker is retained. After explicit reconciliation and a propagation delay, request `2077cbfe-abff-49d1-8d09-6aca9864926a-e2` completed: 60 frames, 77 SOMA joints, 48,683 ms provider execution and approximately 242 seconds total cold-start wall time.

The saved idle motion passed fixed-script retargeting, seam processing, GLB export and re-import validation. Real motion exposed a validation bug hidden by a static fixture: Blender's fresh import scene defaulted to 24 fps. Setting the validation scene to 30 fps fixed temporal comparison without regenerating the motion. Maximum export position error was 0.000000889 metres. The regression fixture now contains time-varying motion and passes.

Isolated Chromium acceptance using this generated idle GLB passed keyboard mission completion, animation loading/playback and save/restart/load with no browser errors. Artifacts and report are in `output/kimodo-benchmark-20260909-attempt2` and `output/game-animation-real-browser`. These are local benchmark artifacts, not published project clips.

The benchmark guard set minimum and maximum workers to zero; Runpod read-back reports zero workers. Billing still returned no records, which is not final zero-cost evidence. Keep the $10 reservation pending reconciliation. The full locomotion, jump/roll and authored ledge release remains incomplete; production gates stay disabled.
