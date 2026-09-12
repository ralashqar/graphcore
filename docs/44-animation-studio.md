# Animation studio

This document describes the original version-2 studio, retained in the legacy workspace. The default page now uses the flexible version-3 graph described in [45-flexible-animation-studio.md](45-flexible-animation-studio.md).

The dedicated `/app/animations` route authors project-owned humanoid motion graphs independently of game designs. The initial catalog is `animation-studio-1.0.0`; graph format is version 2. Templates provide upright locomotion and right-handed sword locomotion/three-strike combos. Unsupported traversal, mounting and style requests remain explicit planning gaps.

## Authoring and runtime

`src/domain/game/animation-studio` owns strict graph contracts, template expansion, deterministic state-machine evaluation, canonical boundary poses, recipe compilation, binding compatibility and transition validation. Nodes have stable identities independent of their motion roles. Locomotion blends share a gait clock; transitions have typed events and bounded windows. The evaluator processes at most one transition per tick. Generation dependencies must be acyclic even though runtime transitions may cycle.

The animation canvas and output workflow overlay share `WorkflowNodeFrame` over React Flow, including keyboard selection and ports. The page offers graph proposal review, selected-node refinement/generation, stance/transition editing, a Fabric preview, candidate review, immutable graph acceptance, saved-source reuse and explicit game attachment. Preview keys are WASD, Shift, F and C; action keys are remappable. Game attachment keeps existing controls and uses T for a presentation stance toggle. Other gameplay actions and traversal retain the legacy presentation path.

The shared Babylon studio visual samples GLB tracks or clearly labelled procedural approximations. Gameplay combo phases remain authoritative. Attachment rejects duration/impact mismatches and offers a separate existing mechanic-planner request; the proposal still requires review/materialization in the game Mechanics workspace. A studio graph cannot author damage or bypass collision.

## Persistence and worker execution

Migration `20260912123937_animation_studio.sql` adds studio workspaces, immutable revisions, commands, reviews and build bindings. Existing animation job/step/rig/candidate ownership references the real project draft directly rather than requiring a game workspace. `game_jobs.animation_workspace_id` identifies studio-owned work. This permits library authoring without inserting or modifying a game design. Existing RLS draft permissions and service-only write boundaries remain in place.

The authenticated `animation-studio` Edge function handles read, save, plan, generate, import_source, cancel, retry, review_clip, review_graph and attach. Exact command replay precedes admission checks. Planning uses the existing provider gateway and design-credit reservation; proposed graphs are job output until explicitly saved. The existing Fly asset pipeline performs inference/import, retargeting, processing, GLB export and validation. `GAME_ASSET_CONCURRENCY` permits one or two concurrent jobs (default two); each provider worker remains serial.

Generation atomically reserves the selected total under the existing setup ledger and caller maximum. Cancellation fences jobs; submitted/uncertain reservations are retained. Processing retry requires saved motion. Source reuse is restricted to owned compatible neutral Kimodo locomotion and makes no inference reservation. A selected predecessor candidate is hash-checked and converted to an entry constraint before dependent generation.

## Kimodo and validation limits

`soma-fabric-studio-1.0.0` adds a versioned CPU adapter contract for studio locomotion and `sword_strike` motion roles. Existing adapter revisions remain unchanged. Recipes carry canonical sparse full-body positions/rotations and separate target-rig milestone poses. The native Kimodo handler uses the pinned release's FullBodyConstraintSet plus right-hand end-effector orientation. CPU target poses are stripped from native requests.

Baking measures target pose and wrist orientation error and archives joint boundary positions, velocities and rotations. Fixed combo connections compare every baked pose in the permitted transition window with the successor entry; missing samples or excessive position, velocity or rotation differences reject graph acceptance. Transitions involving locomotion still need creator visual review across gait phases. A passed clip is not an accepted graph. Runtime snapshots contain only reviewed immutable clips, and source storage remains private.

`GAME_ANIMATION_STUDIO_GENERATION_ENABLED` defaults off in addition to existing owner/provider gates. No new GPU request is authorized or submitted by this implementation. The existing $25 admission ceiling is exhausted by retained holds; this work does not reset or release them. Real Kimodo sword quality and hosted prompt/graph publication acceptance remain release gates. Synthetic sword fixtures validate contract plumbing only.

## Verification and rollout

- `npx tsc --noEmit`, `npm run build`, `npm run build:game`, `npm test` and dev-server startup.
- `node --experimental-strip-types --test src/domain/game/animation-studio/studio.test.ts` and existing v3 tests.
- `node scripts/animation-studio-browser.mjs`: isolated browser UI, real Fabric renderer, provider traffic blocked.
- `node scripts/verify-animation-studio-db.mjs`: transaction rollback; ownership, RLS, idempotency, revision conflict, reservation maximum and cancellation fencing. Use `--existing` after migration deployment.
- `node --experimental-strip-types scripts/animation-studio-bake.mjs`: saved idle/walk and explicitly synthetic sword-contract fixtures, no inference.

Deploy migration via `npm.cmd run game:migrate -- --animation-studio`, then the animation-studio/game-command/get-game-workspace/get-game-release Edge functions and both isolated Fly game/preview apps. The shared world worker does not execute this feature. The Kimodo inference image needs the new handler/schema before enabling studio generation; keep its endpoint stopped until funded validation is admitted. Main frontend hosting remains unspecified; the page is available in the local dev build.

### September 12 rollout evidence

The migration, four Edge functions and isolated Fly game/preview apps deployed successfully. Worker machine checks passed. TypeScript and Deno checks, frontend/game builds and dev startup passed. The main suite passed 726 tests with 8 skipped; the existing v3 suite passed 80 tests. The studio suite subsequently passed 8 tests, including transition-window rejection and proposal review of non-node changes. Browser acceptance passed with provider traffic blocked, real Fabric rendering, keyboard locomotion/combo/recovery, saved edits, mobile layout and no console errors.

The marked existing hosted fixture now contains studio workspace `2766f715-b55d-4d0a-b1d6-b37db6fcac57`. Saved-source job `dd611ced-31e9-48d6-b79d-86cf53480eb4` completed retargeting, processing, export and validation with `provider_started=false`. Candidate `7cb44b90-be56-4c15-aad6-30fa34f676d1` passed validation and its downloaded GLB matched the stored hash. The setup-reservation count did not change. No candidate acceptance, game attachment or publication was performed by this test. Evidence is in `output/animation-studio-hosted/status.json`; repeat the read-only check with `node --experimental-strip-types scripts/animation-studio-hosted.mjs status`.

Remaining release acceptance: deploy the updated native Kimodo image, validate real generated sword/stance clips under an admitted budget, exercise hosted LLM planning with available design credits, and review a complete graph before game binding/publication. These are not established by the synthetic CPU fixtures or saved-source import.
