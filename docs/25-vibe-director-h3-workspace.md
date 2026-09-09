# Vibe Director: H3 workspace

Implemented September 6, 2026. This workspace is independent of canonical world mutations. The previous director remains available through **Legacy view**, or with `VITE_VIBE_DIRECTOR_V2=false`.

## Workflow

1. Select a generated script, sequence, shot, or custom scene brief.
2. Select world entities and optionally a composed starting/ending frame. **Prepare keyframe** invokes the existing animatic workflow; Wiki remains the reference preparation surface.
3. Enter direction and generate an H3 take. Cuts shorter than five seconds generate five seconds and use an editorial trim.
4. Keep/reject takes. Kept footage forms an immutable edit revision. Trim, reorder, replace, undo, and redo affect the edit, never source footage.
5. Branch at the selected media time after keeping its source take. Frame branches extract the actual frame; motion branches extract up to three preceding seconds and add a video reference. Keeping a branch preserves the prefix and replaces the following edit. A changed source revision must be restored before keeping an older branch.
6. Select another scene/shot without discarding the edit, or create a separate session. Export normalizes video and audio with FFmpeg and creates a project asset/output artifact.

See [Director runtime and rollout](26-director-runtime.md) for the subsequent isolated saved-take runtime. The descriptions below cover the original compatibility path.

## Modules and persistence

- `src/domain/directorWorkspace.ts`: command, context, take, and edit contracts; prompt compilation; branch/edit validation.
- `src/domain/h3Video.ts`: endpoint selection, media reference limits, payload construction, conservative cost estimates.
- `src/features/vibe-director/`: workspace, player, direction panel, take library, timeline, source bridge, controller, and UI-only Zustand store.
- `src/data/directorRepository.ts`: authenticated commands and coalesced reads.
- `director-command`: validates input/auth, snapshots world references, and calls the transactional service-only RPC.
- `get-director-session`: RLS reads, paginated takes, active-edit media, recent messages, and exports.
- `director-workflow-runtime.ts`: Fly execution for take generation, branch media extraction, export, and live recording finalization.
- `director-media.ts`: project-scoped signing, bounded downloads, FFmpeg processing, and durable asset registration.

`director_sessions`, `director_takes`, `director_edits`, `director_messages`, and `director_commands` store durable state. Browser roles have no direct write grants. Commands validate draft membership, serialize by session, require the current revision, and cache results by idempotency key. Media work uses existing output workflow runs and Fly claiming. The active edit's takes are loaded even when outside the current history page.

Provider request IDs survive polling failures. A submission marker prevents automatic duplicate paid submissions if the worker dies between provider acceptance and request-ID persistence; ambiguous submissions fail for manual reconciliation. Cancellation prevents attaching late results. Failed workflow starts are reconciled before the next generation command. Usage records are idempotent entries in `ai_usage_events`; USD figures are estimates, not reconciled provider invoices.

## H3 contracts

Supported clip endpoints:

- `minimax/h3-max/text-to-video`
- `minimax/h3-max/image-to-video`
- `minimax/h3-max/reference-to-video`
- `minimax/h3-max-turbo/text-to-video`
- `minimax/h3-max-turbo/image-to-video`

Duration: 5–15 whole seconds. Resolutions: 480P/768P. Balanced prompt expansion and native audio are used. Reference-to-video supports at most nine images, three videos, three audio files, and twelve total files; audio/video inputs are 2–15 seconds with a 15-second total per modality. Turbo does not support multiple reference inputs. Image-to-video uses `image_url`/`end_image_url`, and inherits its first image's aspect ratio.

Queue submission uses the full endpoint path; polling and cancellation use the model root (`minimax/h3-max` or `minimax/h3-max-turbo`). Estimates deliberately use list rates rather than time-limited launch discounts. Motion references can cost more than generated footage. A branch frame is visual grounding; it does not guarantee seamless motion or restore the model's hidden state.

## Live Director beta

`minimax/h3-max/director` is isolated behind `VITE_DIRECTOR_LIVE_BETA=true` **and** Edge secrets `DIRECTOR_LIVE_ENABLED=true` plus `DIRECTOR_LIVE_BETA_USERS` (comma-separated user UUIDs). All are off/empty by default. SDK pinned to `@fal-ai/client@1.11.0-alpha.2` and dynamically imported. This is an internal beta, not a generally enabled paid product.

The `director-live-gateway` only proxies the three fixed WMA routes `/ice`, `/session`, and `/session/heartbeat`. It verifies ownership, forces the H3 Director endpoint, binds the returned provider session ID, allows one negotiation per take, and limits each lease to 120 seconds. One live lease per account and ten sessions per rolling day bound beta access. Server signing is restricted to that take's recording folder. FAL_KEY stays server-side.

The beta requires a composed starting frame and supports 16:9/9:16/1:1. Configure is sent once; later direction updates carry increasing prompt versions. Buffer telemetry is displayed. MediaRecorder writes two-second WebM chunks into IndexedDB before background signed uploads. Stop flushes recording, closes WebRTC, uploads missing chunks, and queues Fly finalization. Reloaded clients can recover local footage for up to 72 hours. The worker assembles the original ordered recorder chunks, transcodes to MP4, probes the result, and only then marks the take completed.

No browser camera/microphone input is requested. Do not call this path production-ready until real provider access, audio/video recording on target browsers, expiry behavior, and billing reconciliation have been exercised. The provider has a one-minute minimum; the displayed conservative two-minute list-rate budget is $9.60. Commands atomically reserve credits at the configured GRAPHCORE_CREDITS_PER_USD rate before enqueue or live negotiation. Clip completion settles the quoted list-rate reservation; live completion settles the capped 60–120 second wall-time estimate and refunds the remainder. Unsubmitted cancellations refund once. Uncertain provider submissions retain their reservation for manual reconciliation. Provider invoice reconciliation is not implemented; keep the allowlist restricted to internal testing until real billing behavior has been verified.

Live branching uses saved footage through the regular take workflow; the alpha protocol exposes no native hidden-state fork, pause/resume, or server recording API. Recording captures delivered playback, including freezes, and cannot reconstruct video lost before reaching the browser. Raw local chunks are deleted after durable finalization is queued; server chunks remain recoverable. Browsers without WebM MediaRecorder support cannot start the beta.

## Deployment and verification

Apply `supabase/migrations/20260906193426_director_workspace.sql`. Deploy `director-command`, `get-director-session`, `director-live-gateway`, the affected workflow entry points, and the Fly worker together. FFmpeg/ffprobe are already installed in the worker image. Standard clip generation requires the existing worker FAL_KEY; live additionally requires that secret on the gateway. Worker code version: `2026-09-06-director-h3-workspace-v1`.

`DIRECTOR_GENERATION_ENABLED` defaults off on the command endpoint. Set it to `true` in Supabase only after the updated Fly worker is deployed and healthy. Planning/editing remain available while media commands are gated. This prevents the old worker from receiving the new handler before the paired rollout finishes.

Run `npx tsc --noEmit`, `npm test`, `npm run build`, and start `npm run dev`. Deno-check the new Edge entries and shared runtime. `supabase/tests/director_workspace.sql` must run inside a transaction followed by rollback; it checks authorization/grants, idempotency, revision conflicts, edit validation, enqueue atomicity, and cancellation against an editable draft fixture. It submits no provider jobs outside that transaction.

Release acceptance also needs an authenticated browser run: generate → keep → trim → branch → keep → undo/redo → export → reload. Verify paid-provider footage and live capture separately from mocked/local contract checks. Do not infer provider success from a successful build or a queued workflow row.

Sources: [H3 reference-to-video](https://fal.ai/models/minimax/h3-max/reference-to-video/api), [H3 Director protocol](https://fal.ai/models/minimax/h3-max/director/api).

## Verification / rollout record

- TypeScript, production build, Deno checks, and 657 tests passed; eight existing tests are skipped.
- Transactional database tests passed, including credit reservation/refund idempotency. The migration was applied and recorded without applying the unrelated pending `20260621022414` migration.
- All 71 affected Supabase functions were updated with existing gateway authentication settings preserved. Three oversized endpoints (`ensure-sequence-animatic-keyframe-workflows`, `ensure-sequence-animatic-shot-production-graph`, `start-workflow-command`) needed esbuild local bundling with external package imports, retained function names, and whitespace/syntax minification before upload; their bundles are below 2.4 MB. Source stays modular in the repository.
- All three new endpoints returned 401 to unauthenticated requests. The new scene setup rendered at desktop and 390px mobile width without browser console errors.
- Fly deployment was attempted but blocked by missing local Fly authentication. Run `fly auth login`, then `npm run fly:worker:deploy`, verify worker version/startup and media tooling, then set `DIRECTOR_GENERATION_ENABLED=true`.
- The authenticated generate/branch/export smoke test and paid live capture were not run; the available browser was signed out. Live beta remains disabled.
