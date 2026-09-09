# MotionBricks baked animation integration

MotionBricks is a separate, default-off provider. Kimodo remains the default.
This integration targets the public G1 release, not the human Unreal demo.
Only idle and forward walk are eligible clip capabilities. Diagnostic
idle → walk → turn → stop sequences cannot be accepted or bound as clips.

## Reproducibility

`workers/game/motionbricks/release.json` freezes upstream commit
`087f9ac01d46f6d8e4d0b73c01ae64799f292a38`, all four checkpoint artifacts,
normalization arrays, skeleton metadata and XML. SHA-256 and byte length are
verified before loading any checkpoint. `requirements.lock` pins transitive
Python dependencies. The NVIDIA dual-license notice accompanies the worker.
The source metadata topology is attributed in `g1Skeleton.ts`.
The canonical manifest digest is
`c35e98c3a07b547069488552263454d81da1cf383505e08af8a9a7cfcd8c7bcd`.
`python scripts/game-motionbricks-manifest.py <upstream-checkout>` reproduces
it from Git blobs and LFS pointers, avoiding Windows checkout line endings.

The image uses the official Python navigation agent in a headless adapter.
Supplied idle/walk primitives, requested speed and deterministic seed drive
generation. Description text labels the recipe; this adapter does not offer
unrestricted text-to-motion. Pose, contact, ability and explicit path constraints
are rejected. Completing a constrained SOMA pose and solving valid G1 hinge
angles remain gated work, not silently approximated input.

## Contracts and durable execution

Version-1 Kimodo recipes and sources keep their existing representation.
Version-2 recipes discriminate MotionBricks and freeze model-manifest, upstream,
source skeleton, adapter and validation revisions. Native and converted motion
are stored separately. Native topology and rest proportions must match G1;
converted topology and proportions must match the 77-joint SOMA rig.

The authenticated command boundary selects only server-configured provider
URLs, checks the owner allowlist, rig and provider gates, and uses the existing
service-only transaction for idempotency and reservations. Generation stages:

1. Constraint/capability validation.
2. Submit once, persist request ID, or reuse durable source.
3. Native G1 GLB export.
4. Versioned anatomical G1-to-SOMA conversion.
5. Retarget, loop/contact processing, GLB export and post-export validation.
6. Candidate registration, separate user review, then optional binding.

The G1-to-SOMA adapter calibrates anatomical bone directions, combines hinge
chains through global rotations, preserves target bone lengths and scales root
motion by measured leg proportions. Missing face, finger and neck articulation
inherits the target parent with neutral local pose. This is an experimental
retargeter until real motion acceptance passes. It is not automatic rigging.

CPU retarget revision `g1-soma-1.1.0` is frozen separately in recipes and clips.
It measures full hip/shoulder hinge spans, reconstructs source anatomical limb
directions per frame and calibrates pelvis height. The original adapter remains
available for recipes without `retargetRevision`. Native inference requests
omit this CPU-only field, so an upgrade reuses byte-identical stored source and
preserves its original provider provenance. The service-only import manifest
records the parent source hash/job and the retarget upgrade. A second additive
migration, `20260909203800_game_motionbricks_retarget_revision.sql`, rejects
clip registration when the frozen CPU revision does not match.

Every CPU stage uses the existing fenced step cache. Retry uses stored source;
it cannot issue another GPU request. Uncertain submissions keep their holds.
Existing review/ownership/build snapshot rules apply unchanged. An additional
database trigger prohibits bindable diagnostic or unsupported MotionBricks
candidates. Accepted clip metadata freezes provider provenance; builds remain
provider-independent and use the existing signed GLB publication flow.

## Authoring

Animations offers a capability-filtered provider selector, with Kimodo default.
MotionBricks shows its experimental/gated status and a reservation before
generation. Native G1 and converted SOMA can be inspected independently,
with source/GLB downloads. Existing loop, scrub, speed, contact/root overlays,
comparison, acceptance and binding controls are reused. Planning lists eligible
providers without reserving money or submitting inference.

## Budget and infrastructure

The original $30 total and $25 admission ceiling remain. The owner authorized
reallocating up to $5 of uncommitted ledge funds. The migration adds an immutable,
audited allocation; it cannot take previously committed ledge funds. Budget-row
locking serializes allocation and reservations across projects. The two original
$10 holds are preserved. A $2.50 hold covers the first compatibility experiment,
and a $1 hold covers the steady-walking experiment. Total holds are $23.50;
they are not asserted charges. Hardware experiments are capped at two, with all
spend sharing the same allocation/global caps.

Runpod's 2026-09-09 account read reports $0.05546718277037144 serverless cost for
the Kimodo endpoint, consistent with the displayed $0.06. This is daily aggregate
evidence, not per-reservation reconciliation, so no prior hold was released.
The available AMPERE_16 serverless pool is quoted at $0.58/hour. Each request is
one candidate, at most eight seconds, a ten-minute execution timeout and a
fifteen-minute wall-clock/TTL envelope. Minimum workers 0, maximum 1 during an
experiment, maximum 0 afterwards. No local GPU is used.

The worker image is built remotely with `fly.motionbricks-build.toml` using
`--build-only --push`; that file must never deploy a Fly Machine. Runpod gets
an expiring read-only registry credential, not the Fly account credential.
Its renewal is necessary before future image pulls after expiry.
The separate endpoint is `9xu1t68ad23fy0`. Its image is pinned by digest:
`registry.fly.io/graphcore-game@sha256:952e8cc0f91c115232504bd3ed6d8a2d773467076bf0a59982f61c438f365f5b`.
Verify the OCI manifest by digest before endpoint admission: Fly reported a
successful tag push before external manifest resolution was available. Do not
infer image availability from the build log alone or use a mutable tag.

Configuration (all server-only): `GAME_MOTIONBRICKS_ENABLED`,
`GAME_MOTIONBRICKS_CLIPS_ENABLED`, `GAME_MOTIONBRICKS_RUN_URL`,
`GAME_MOTIONBRICKS_STATUS_URL`, `GAME_MOTIONBRICKS_CANCEL_URL`,
`GAME_MOTIONBRICKS_RESERVATION_CENTS`, `GAME_MOTIONBRICKS_PRICING_EVIDENCE`.
The existing `RUNPOD_GRAPHCORE` runtime key is reused securely. No Fal changes.

Migration `20260909194613_game_motionbricks_provider.sql` is additive. Because
unrelated older local migrations are pending, this migration was applied alone
through the linked database query command and its history marked applied.
No unrelated migration was applied or repaired.

## Verification and release gates

Run `node --experimental-strip-types --test src/domain/game/v3/motionbricks.test.ts`,
`python -m unittest discover -s workers/game/motionbricks -p test_handler.py`,
`node scripts/verify-game-motionbricks-db.mjs --existing`,
`node --experimental-strip-types scripts/game-motionbricks-bake-test.mjs`, and
the existing animation/gameplay/browser tests. Synthetic bake tests validate
transform/export correctness only, not the quality of generated motion.

The compatibility script durably records a single explicit request and stops
the endpoint in `finally`. Its `import` operation reuses source into the marked
project fixture with no new generation reservation. It never accepts a clip.
`derive idle|walk` slices the saved diagnostic with recorded frame ranges;
`reprocess idle-retargeted|walk-retargeted` freezes a CPU adapter upgrade without
new inference. `review <case>` downloads the owned, hash-checked stage artifacts.
`node scripts/game-motionbricks-review.mjs` opens a read-only review server at
`http://127.0.0.1:5194/`, including native/converted playback, validation results
and GLB downloads. The product workspace uses the same preview component.

Deployment requires game-command, get-game-workspace, get-game-release and the
isolated Fly game/preview apps as a compatible set. These modules do not execute
in the shared world worker. Main frontend hosting still awaits its destination.

Both MotionBricks gates stay off until review/binding and the final hosted
publication check pass. Native inference, revised SOMA idle/walk validation and
isolated runtime acceptance have passed; project candidates are pending user
review and no active binding has changed. No sitting, attacks, rolls, wall motion, arbitrary rigs, model
training or live streaming is advertised by this provider.

### 2026-09-09 implementation verification

The additive migration and all three game Edge entries are applied. The
isolated game worker and preview deployments passed Machine health checks.
TypeScript, the frontend and runtime builds, four Python request tests, the
animation/provider TypeScript tests, thirty gameplay tests and transactional
database tests passed. Authoring and actual workspace browser checks passed
including narrow layout, vertical scrolling and no page errors.

The synthetic G1-to-SOMA bake passed with maximum post-export error
`0.00000133313` metres. Existing published release
`14ea1703-6d8a-4bf8-a28d-8e10034aed9f` passed combat, six existing clip bindings
and fresh-page checkpoint restoration with inference blocked. These checks
preserve existing capabilities; they do not certify MotionBricks motion quality.

Native Runpod requests `e7fd9004-cfe9-453a-8898-0b5618ffee98-e1` and
`0365467f-88b5-4697-9925-dcc60e64db39-e1` completed on RTX A4500: 240 diagnostic
frames in 12,009 ms execution and 180 steady-walk frames in 13,200 ms. Both
sources are persisted in the owned project. Runpod health subsequently reported
two completed jobs, no retries, no queued/running jobs and zero active workers.
Its billing response still has no records for this endpoint; no reservation was
released and the empty response is not interpreted as zero expense.

The first retargeter passed transform integrity but lost foot stance during
walking. Those failed candidates are retained. The native contact audit proved
the source had planted-foot samples; measuring from an intermediate hip hinge
had incorrectly shortened the thigh and raised the target feet. Revision 1.1
fixes that geometry without relaxing thresholds. Its local steady-walk bake
passed with 1.77 cm maximum contact error and left/right stance coverage of
39.3%/28.6%. Hosted reprocessing also passed with unchanged thresholds:

- Idle job `850031d3-ec57-4308-8310-53d160613fdf`, candidate
  `c88591a6-f06e-47cd-adc5-ee3ffb36e899`.
- Walk job `bd467ec1-a97f-46e9-b88f-3b7cb86a91e9`, candidate
  `01c3e5a3-b7bc-47be-ab00-0ac1375a3bfe`.

Both remain pending review. No acceptance command or graph binding was applied.
The isolated runtime fixture passed 12 checks, including 14 idle loops, 30 walk
loops, fallback direction changes and identical saved/restored player positions
after a fresh page load with all external requests blocked. It uses the actual
hosted GLBs but does not activate project candidates or claim a newly published
MotionBricks release. `scripts/game-motionbricks-runtime-fixture.mjs` assembles
that fixture, followed by `scripts/game-browser-acceptance.mjs` with
`--partial-locomotion`. Existing six-clip tests retain their full requirements.

Both migrations, the three game Edge entries and the isolated game/preview
apps are deployed. Final frontend/runtime builds, TypeScript, database tests,
retarget tests and browser checks passed. The read-only review page includes
the original failed candidates and both revised candidates. Final enablement
requires user review, accepted binding/publication acceptance, billing
reconciliation and renewal of the expiring registry credential before future
image pulls. Main frontend hosting still awaits its destination.
