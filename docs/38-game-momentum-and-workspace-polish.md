# Game movement and workspace polish

## Changes

- Actor roots and camera targets share `presentPose`, a fixed-step interpolator with teleport snapping and shortest-path yaw. Animation blend/gait clocks use render time; simulation velocity remains sampled at fixed ticks. Locomotion cadence continues independently beneath full-body actions rather than collapsing when locomotion blend weights approach zero. Approximation poses use the same fractional simulation time.
- New roll recipes freeze `movementPolicy: momentum-1.0.0`. Entry carries actual collision-resolved velocity. Steering is bounded to 0.35 radians from entry heading at 1.5 radians/second; recovery blends to held locomotion or brakes to rest. One physics move resolves displacement. Stationary rolls retain their authored travel distance. Moving rolls include entry/exit travel and are not limited to that stationary distance. No dodge protection is granted. Older recipes without this policy retain their behavior.
- The game route owns vertical scrolling inside the existing viewport shell. Builder surfaces, controls and graphs use SynArc's existing navy/cyan/violet theme variables. Narrow content reflows without horizontal overflow.
- Build shows sandbox authoring directly, with prompt examples and optional wall setup. Local primitive previews use ephemeral valid manifest IDs when demo project IDs are not UUIDs; no saved ownership or hosted command IDs are changed. Offline authoring does not issue a pending-command authentication request.

## Verification

- 30 game mechanic/action/motion/performance tests, plus a 144 Hz interpolation/teleport/yaw regression.
- Real browser acceptance covers held-running roll, camera-to-presented-root error, stationary roll, uppercut/receiver recovery, and previous action checks.
- `scripts/game-workspace-polish-browser.mjs` checks the actual local app at port 5192, desktop scrolling, visible sandbox authoring, and a 640px viewport without horizontal overflow. Artifacts are in `output/game-polish/`.
- TypeScript, application build and isolated runtime build are required before release.

## Deployment and limits

Affected game Edge entries and the isolated Fly game/preview apps deploy together. No shared world-worker execution changed. Worker/cache implementation is 3.5.2. Runtime manifest dispatch remains compatible with 3.5.0 and previous schemas; movement policy is frozen in each ability definition. Paid inference and planner gates stay unchanged. No new GPU spending is needed. Main frontend hosting remains pending its destination.

Local browser momentum acceptance measured a minimum moving-roll speed of 2.66 m/s and camera alignment error below 1e-12 meters. Initial hosted build 61fbcbb7-6416-4b99-8608-aefe92880073 was rejected by a pre-existing wall-approach wall-clock timeout; the new momentum/camera checks passed. The test now holds movement input and separately bounds simulation ticks and wall time, preserving all wall collision/attachment assertions. The revised full local movement fixture passed 17 browser checks. Replacement build `14ea1703-6d8a-4bf8-a28d-8e10034aed9f` (draft revision 10) passed all 40 hosted checks and was published. The affected Edge entries and both isolated Fly apps are deployed; the last worker/cache version is 3.5.2. Local TypeScript, full frontend build, isolated runtime build, development-server startup, authoring browser checks and runtime checks passed. Fresh-session published playback passed combo/dash, moving roll/camera alignment, stationary roll, uppercut and save/reload/checkpoint restoration with Runpod/Fal routes blocked. All six existing clip bindings loaded; no provider calls or browser errors were recorded. The main frontend remains local at http://127.0.0.1:5192/app/game until a hosted destination is supplied. No GPU work or additional generation reservations were submitted.
