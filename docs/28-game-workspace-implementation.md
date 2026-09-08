# Prompt-to-game adventure workspace

Implemented 8 September 2026. This is the first desktop-web adventure slice from the [architecture review](27-prompt-to-game-architecture-review.md). Existing world canon, narrative prototypes, Three.js authoring and Director execution remain independent.

## Product flow

`/app/game` is a dedicated, lazy-loaded workspace. Game projects expose a Game navigation action when `VITE_GAME_BUILDER_ENABLED=true`. Overview establishes the loop and art direction; Systems separates composition from a selected subsystem's production workflow; Levels edits the scene hierarchy; Assets exposes independent recipes; Build & Play previews local greyboxes or accepted immutable builds. Generation uses the current saved world as reference data and never edits world entities.

The initial supported template is `adventure.v1`: camera-relative movement, sprint/stamina, proximity interaction, one collectible key, capacity-limited inventory, progress-sensitive NPC dialogue, a locked gate, an objective, build-scoped save/load and restart. It targets flat, axis-aligned levels in meters. Unsupported mechanics are recorded in the design. Arbitrary generated TypeScript/Python, multiplayer, platforming physics, open-world streaming and a second engine/template are not enabled in this slice.

## Boundaries and contracts

| Boundary | Implementation |
| --- | --- |
| Specifications | `src/domain/game/contracts.ts`: strict schemas for designs, systems/ports, prefabs, levels, recipes, assets, manifests and commands |
| Template modules | `template.ts`, `simulation.ts`: fixed interfaces and independently testable gameplay rules; Babylon is a renderer/input adapter |
| Compiler | `compiler.ts`: ownership/interface/cycle/reference validation, semantic input hashes, dependency invalidation, artifact filtering and desktop geometry/byte budgets |
| Scoped planning | `planning.ts`, `workers/game/planner.ts`: scope selection followed by schema-restricted brief, style, movement, inventory and scene children |
| Workflow views | `workflows.ts`, `GameGraph.tsx`: reusable workflow-manifest primitives and separate composition, generation, asset and build views |
| Command boundary | `game-command`: authenticated draft access followed by service-only `game_commit_command` |
| Durable execution | `game_jobs` + `workers/game/main.ts`: frozen inputs, fenced leases, heartbeat, checkpoints, bounded repair and explicit ambiguous-provider state |
| Preview | `game-runtime/`, `src/game-runtime/`: separately deployed Babylon host, validated manifest messages and no app credentials |

The hierarchy is project → saved design revision → gameplay systems, level instances and asset recipes → production job → phase checkpoints → validated artifact/build revision. The graph is an inspection/editor view of these contracts, not an unrestricted node-wiring language. Each supported system binds a tested module. A scoped movement planner cannot return a level or mesh recipe: its output schema rejects those fields.

Generation freezes canon context and the starting design revision at admission. Completed child sections persist in checkpoints. Art changes advance style/recipe versions without changing gameplay. Compiler hashes invalidate only affected contracts and dependent consumers. A collision-size change invalidates level acceptance. Builds freeze the asset revisions present when admitted; later asset completion cannot silently change a queued build. Registration promotes a build only when it passes and still matches the workspace source revision.

## Art and mesh production

Image-to-3D recipes use a dedicated isolated-subject reference, generated with GPT Image 2, then Fal Trellis 2 at 512 resolution. Existing project image assets can be explicitly bound as sources. Multi-panel wiki sheets are not automatically used as mesh input. Provider IDs persist before polling; a crash after a submit marker but before saving a request ID enters `attention`, avoiding an automatic second paid submission.

Blender 5.0.1 executes checked-in operations with `--factory-startup --disable-autoexec`: import, transform normalization, triangulation/decimation, texture resizing, GLB export and collision-proxy generation. Static assets are checked before import and after export. `approved_rig` uses a checked-in rigid-weight humanoid with Idle/Walk clips; this is a reproducible technical character template, not generative humanoid rigging. The Babylon loader requires both clips on a bound player and switches them from movement state. Procedural assets currently use a bounded box recipe; richer modular/environment recipes remain an extension point.

Hosted image/mesh jobs, Blender preparation and browser acceptance run outside Edge request lifetimes. The supervisor stages inputs and registers outputs; subprocess environments contain only tool paths and browser runtime settings, with timeouts and no application secrets. This is a boundary for trusted recipe programs and declarative game data. Running arbitrary model-generated code would require an additional disposable sandbox with its own filesystem/network policy and is deliberately unsupported.

Prepared artifacts carry source hash, content hash, bytes, triangles, dimensions and validation reports. Builds limit bound assets to 64MB/250,000 triangles. Browser validation also measures scene meshes/vertices and records FPS. Software-rendered CI FPS is diagnostic, not certification of a 60fps hardware target. Failed asset generation preserves the greybox. Rejected builds retain reports and a screenshot and cannot replace or publish over the last accepted build.

## Storage, access and billing

The additive game migration introduces `game_workspaces`, `game_revisions`, `game_jobs`, `game_builds`, `game_asset_revisions`, `game_commands`, and service-only reconciliation evidence. Browser roles have draft-scoped RLS reads and no direct writes. Commands enforce editing access, project/draft identity, exact idempotency, optimistic revisions and job admission limits. Cancellation increments the fence; late workers cannot bind outputs. Client pending commands are scoped by user/project/draft and reuse the original command ID after an uncertain acknowledgement.

Default quoted reservations are 25 credits per design operation and 150 per image-to-3D recipe. Template/procedural assets and builds reserve no credits. The workspace displays server quotes before commands. Completion settles the quote; unsubmitted cancellation/failure refunds exactly once. Submitted failures/ambiguous cancellation retain the reservation until a service operator calls `game_reconcile_job(job, charge, evidence)` after checking provider receipts. Reconciliation is audited and idempotent. The usage ledger records provider costs separately; Trellis prices remain estimates until invoice reconciliation.

## Running and deploying

The feature defaults off in shared configuration. Local exploration requires:

```text
VITE_GAME_BUILDER_ENABLED=true
VITE_GAME_PREVIEW_URL=https://graphcore-game-preview.fly.dev
```

For two local servers, omit the preview URL and run `npm run dev:game` on port 5174 alongside the main app. Same-origin game preview URLs are rejected. The iframe checks both message origin and source; the release endpoint serves only an explicitly published accepted build. The preview receives signed asset URLs, never a Supabase user token or provider secret.

Server configuration:

| Setting | Purpose/default |
| --- | --- |
| `GAME_GENERATION_ENABLED` | Admission gate; defaults off |
| `GAME_GENERATION_USERS` | Comma-separated allowlisted user IDs; `*` requires deliberate public rollout |
| `GAME_PLAN_CREDITS`, `GAME_ASSET_CREDITS` | Quoted reservations, 25/150 |
| `GAME_PLANNER_MODEL` | Scoped structured planner, `gpt-4.1` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` or `SB_SECRET_KEY` | Worker database/storage access |
| `OPENAI_API_KEY`, `FAL_KEY` | Worker provider access |
| `GAME_WORKER_KIND` | `generate`, `build`, or `asset` |
| `GAME_ASSET_HOSTS` | HTTPS media-download host allowlist |
| `VITE_GAME_RELEASE_URL` | Preview build-time release endpoint |

Deploy the base migration with `npm run game:migrate`, then the lock-order/recovery migration with `npm run game:migrate:recovery`. These transactional scripts record migration history without applying unrelated pending migrations. Run each once. `npm run test:game-db` tests the unapplied migrations in a rollback transaction; after deployment use `npm run test:game-db:existing`.

Asset recovery preserves the same job, provider request ID and frozen input. `Resume asset` permits at most three explicit recoveries of known mesh requests or deterministic preparation jobs. It rejects ambiguous submissions and already-settled paid jobs. The recovery migration also makes completion acquire the same per-draft advisory lock as commands before locking job/workspace rows, preventing a cancellation/completion lock-order inversion.

Deploy `game-command`, `get-game-workspace`, and `get-game-release` together. `npm run fly:game:deploy` deploys the separate `graphcore-game` app: one generate process, one build process and one asset process. Build/generate have 2GB RAM each; asset has 4GB. `npm run fly:game-preview:deploy` deploys the public static preview. The deploy helper can stage four allowlisted credentials from the existing owned world-worker app using the authenticated Machines API; it does not write or log secret values. No world-worker deployment is needed for these isolated new modules.

Only enable an allowlisted user's generation after all three game processes report healthy and a real hosted prompt/build/asset acceptance run completes. Roll back by disabling new admissions first; drain or cancel existing jobs without transferring execution ownership. Keep accepted builds and asset revisions. Public rollout additionally needs provider/invoice reconciliation, device testing and operational cleanup policy for unbound staging objects.

## Verification

Automated coverage includes scoped planner ownership, dependency invalidation, invalid contracts/cycles, save isolation, collision bounds, duplicate pickups, capacity, unreachable layouts, stale asset exclusion, database permissions/idempotency/revision conflicts/refunds/fencing, rejected-build preservation, and accepted-only publishing.

`test:game-browser` drives real keyboard input in isolated Chromium through the locked-door negative path, pickup, unlock, completion and save/restart/load. `test:game-assets` additionally runs local Blender, glTF validation and a bound animated character/prop through that browser path. `test:game-workspace` checks the dedicated pages in a running feature-enabled app. `test:game-live` is an explicit, owner-scoped hosted acceptance fixture with phases selected through `GAME_LIVE_PHASE`; it never mutates a user's existing world.

### Verified rollout, 8 September 2026

Both game migrations and all three Edge entries are deployed. The isolated Fly generate/build/asset processes and public preview are deployed and healthy. Existing world and Director workers were not redeployed by this game rollout.

Hosted accepted build `39ca5c73-235f-4627-bbf1-ffbd58be9121` is [playable here](https://graphcore-game-preview.fly.dev/?release=39ca5c73-235f-4627-bbf1-ffbd58be9121). A separate browser check loaded both published GLBs, exercised keyboard movement and saved successfully with zero browser errors. The synthetic fixture is archived while retaining immutable build/job evidence. Generation is enabled only for the consenting workspace owner through `GAME_GENERATION_USERS`; shared feature defaults stay off. The local frontend is enabled with the hosted preview URL.

`npx tsc --noEmit`, the app build, standalone runtime typecheck/build, Deno worker check, and dev-server startup passed. The full suite passed 674 tests with 8 skips and no failures; the game-specific suite has 15 tests. Both deployed migration transaction tests, workspace page smoke checks, local Blender/GLB checks and real keyboard browser acceptance passed.

The separate hosted acceptance fixture generated a desert-observatory design through the real planners. A scoped request changed stamina drain to 25 while preserving level and asset recipes exactly. GPT Image 2 reference generation, the saved Trellis mesh request, Blender preparation, and the approved animated rig completed. Live testing found and fixed malformed raw normals and missing WebP loader support: raw validation permits only repairable non-unit normals, Blender recalculates them, and exported artifacts still require strict validation. Babylon registers `EXT_texture_webp` explicitly. Recovery reused the saved mesh request without another paid submission.

The asset-bound browser test verifies key/gate progression, collision-aware traversal, completion, save/restart/load, both player animation clips and no runtime errors. The representative scene has 15 meshes and 9,925 vertices. Software-rendered test FPS is diagnostic. Main-app UI checks use a fixture; a signed-in user's complete live UI/billing experience and hardware/device performance remain rollout checks. The main frontend code is local; this deployment publishes the backend and isolated game runtime.
