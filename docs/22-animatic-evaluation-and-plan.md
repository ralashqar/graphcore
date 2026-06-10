# 22 — Sequence Animatic System: Evaluation & Improvement Plan

> **Status update (2026-06-10): Phases 1–4 core items implemented.** See §5 "Implemented changes" at the end for the changelog, deploy order, and verification steps.

Date: 2026-06-10. Scope: chapter/sequence-unit → animatic pipeline (script → continuity plan/graph → continuity assets → storyboard blocks → keyframes → shot video), its backend (Supabase edge functions + Fly worker), and UX/UI.

---

## 1. How it works today (verified map)

**Client flow** (all orchestrated from `src/features/world-builder/WorldGraphPage.tsx`, ~17.7k lines):

1. `handleGenerateSequenceAnimatic` → `start-output-request` with `sequenceAnimaticMode: 'master_script_only'`, `cinematicPipelineVersion: 'v3_script_storyboards'` (WorldGraphPage.tsx:7387–7430).
2. Master workflow authors screenplay + director plan (`author-cinematic-script`, gpt-5.4 / gpt-5.4-mini).
3. Client then drives each later stage via ensure→run pairs:
   - `ensure-sequence-animatic-continuity-workflow` → `derive-sequence-animatic-continuity-block` (continuity scene graph per block)
   - `ensure-sequence-animatic-continuity-asset-workflow` → `start-output-workflow-run` (anchor/reference images, single or batch grid)
   - `ensure-sequence-animatic-block-workflows` → `start-output-workflow-run` (storyboard sheet → panel extract → video prompt)
   - `ensure-sequence-animatic-keyframe-workflows` (shot stills + coverage anchors)
   - `ensure-sequence-animatic-shot-revision-workflow` (revisions)
   - `start-cinematic-run` / `poll-cinematic-run` (Seedance video via FAL/MUAPI)
4. State readback: `get-sequence-animatic-state` aggregate + realtime signals on `output_request_events`, debounced refresh + 7.5s fallback interval (WorldGraphPage.tsx:7290–7350); generic poll loop is fixed 2.5s × 240 attempts (7378–7386).

**Backend**: `output_workflows/_nodes/_edges`, `output_workflow_runs/_run_steps`, `output_requests`, `output_artifacts`, `cinematic_runs/_jobs`. Fly worker (`workers/world-generation/main.ts`) claims runs via `claim_output_workflow_run` RPC (3 output-workflow lanes, 10s poll, circuit breaker). Node execution lives in `_shared/output-workflow.ts` (~28k lines, 45+ node types). Graph factories in `_shared/sequence-animatic-workflow-factory.ts`.

**Models**: text `gpt-5.4` default (`output-workflow.ts:105`), `gpt-5.4-mini` for intent/light tasks; images `openai/gpt-image-2[/edit]` hardcoded in ~46 places; stills `fal-ai/nano-banana-2[/edit]`; video `bytedance/seedance-2.0/{image,reference}-to-video` (env-overridable fallbacks). `_shared/openai.ts` passes `reasoning` through but nothing sets it — no thinking-mode policy anywhere.

---

## 2. Evaluation — gaps and bugs

Legend: ✅ = verified directly in code; ◐ = found by code survey, verify line refs before fixing.

### P0 — correctness/reliability (causes the "unreliable sometimes")

| # | Issue | Where | Notes |
|---|-------|-------|-------|
| 1 | ✅ **Client owns orchestration.** The ensure→run chains, and `poll-cinematic-run` itself, are driven from the browser (WorldGraphPage callbacks; App.tsx invokes pollCinematicRun). Close the tab / lose network mid-pipeline → runs stall in non-terminal states. Webhooks (`fal-webhook`) exist but the state machine still needs a client to advance it. | WorldGraphPage.tsx:7387+, App.tsx, poll-cinematic-run | Single biggest source of unreliability. |
| 2 | ✅ **No idempotency on provider submit.** `poll-cinematic-run` submits queued jobs to FAL without checking an existing `provider_request_id`; if the post-submit DB update fails or two polls race, the same job is submitted twice (duplicate cost, divergent state). | poll-cinematic-run/index.ts:640–740 | Also no optimistic locking vs `fal-webhook` writes to the same row. |
| 3 | ◐ **One-job-per-poll.** Each `poll-cinematic-run` invocation advances ~1 job then breaks. Long shot lists progress at (poll cadence × jobs) and feel stuck. | poll-cinematic-run:460–1130 | Many `break`s confirmed; drain runnable jobs per call instead. |
| 4 | ◐ **No stale-run recovery.** `claim_output_workflow_run` doesn't reclaim runs whose `heartbeat_at` is old; worker crash/OOM → run stuck `running` forever. `repair-output-workflow-state` exists but is manual. | worker main.ts; output-workflow.ts claim/heartbeat | Add heartbeat-timeout requeue in the claim RPC + a cron sweep. |
| 5 | ◐ **Unbounded/aggressive provider polling, 1h default timeouts, no backoff** in `waitForFalImageAsync` and OpenAI background-structured-response loops. | output-workflow.ts (~18.5k, ~15.3k regions) | Hammering + hour-long silent hangs. |
| 6 | ◐ **Continuity manifest staleness.** Block workflows are hashed against the manifest; on change blocks are flagged `sequenceAnimaticStale` but downstream (keyframes, shot revisions, already-generated assets) aren't consistently invalidated; scene-state carryover between blocks/takes can drop. No validation that every shot's coverage anchors resolved to actual assets before video. | ensure-* functions, cinematicTimelineProjection.ts:163–183 | This is the main *continuity-quality* gap. |

### P1 — robustness/data integrity

7. ◐ Ensure-* functions create workflow+nodes+edges via RPC but surrounding multi-step updates aren't transactional → orphaned workflows on partial failure (migrations `20260518*` added atomic child-ensure + uniqueness, so part of this is already mitigated — confirm coverage for continuity-asset batch path).
8. ✅ Schema drift handled inline forever: `screenplayAnimaticRole ?? sequenceAnimaticRole`, `continuityAnchorIds` vs `continuityAnchorRefIds` read in both client and edge functions. Normalize in DB + one mapper.
9. ✅ Node-key magic strings duplicated client↔server (`'continuity_batch_prompt'`, `'continuity_asset_artifact'`, `forceNodeKeys` lists in WorldGraphPage.tsx:7459–7570 must match factory output). One rename breaks runs silently. Share a constants module (domain ↔ `_shared`).
10. ◐ No dead-letter/alerting: failed runs just sit `failed`; user sees a hung card. No retry-with-backoff at run level.
11. ✅ Client polling: fixed 2.5s × 240 (10 min hard cap) with no backoff/jitter; separate 7.5s fallback interval; multiple overlapping refresh paths can race (`knownRevision` guards the store, but wasted load).
12. ◐ `get-sequence-animatic-state` recomputes the full aggregate per call (all requests+artifacts+events); gets slow as event tables grow. (Edge-load failure already falls back to direct table reads — good.)

### P2 — UX/UI

13. ✅ `WorldGraphPage.tsx` is a 17.7k-line monolith holding the whole animatic UI + orchestration + view derivation. Slow to change, easy to break; this is itself a reliability issue.
14. ✅ Single global busy key (`sequenceAnimaticBlockRunKey`) serializes all block/asset/keyframe actions — can't run two blocks in parallel from the UI even though backend supports it.
15. Errors land as a string per sequence key (toast-ish); no per-stage error surface with "retry this step" affordance; failures deep in a child workflow require the user to guess which button re-runs what.
16. No single pipeline progress view: master → continuity → assets → blocks → keyframes → video stages each have separate chips/labels; users can't see "where am I, what's blocked, what does it cost to proceed."
17. Stale-block UX: stale items need explicit "what changed / regenerate impacted" flow rather than silent flags.

### P3 — model strategy (your explicit ask)

18. ✅ Models hardcoded in ~50 places; no central registry, no task-complexity routing, no reasoning-effort policy despite `openai.ts` already supporting `reasoning` passthrough. Light tasks (panel extraction labels, video prompt phrasing) pay gpt-5.4 prices; heavy tasks (director plan, continuity derivation) get no extended thinking.

---

## 3. Improvement plan

### Phase 1 — Reliability backbone (server-owned progress) — *highest impact*
1. **Move job advancement server-side.** Add a cinematic/animatic lane to the Fly worker (or a pg_cron sweep) that drains `cinematic_run_jobs` and advances ensure-chains, so progress never depends on an open tab. Client becomes a *viewer* (realtime + state fetch), with a manual "nudge" kept as fallback.
2. **Idempotent provider submits**: persist a submit-intent (idempotency key) on the job row *before* calling FAL; skip submit when `provider_request_id` exists; add `WHERE status='queued'` guards / version column to all `cinematic_run_jobs` updates (poll vs webhook race).
3. **Drain-all-runnable in poll-cinematic-run** (respect `depends_on_job_ids`), per-invocation time budget instead of one-job break.
4. **Stale-run reclaim**: claim RPC reclaims `running` runs with `heartbeat_at < now() - interval '3 min'`; attempt_count + max attempts → terminal `failed` with reason; nightly sweep marks orphans.
5. **Backoff + sane timeouts** in provider wait loops (expo backoff w/ jitter, 5–10 min defaults for stills, configurable for video).

### Phase 2 — Continuity correctness
6. **Coverage validation gate**: before keyframes/video, validate every shot's anchors/references resolve to ready assets; surface unresolved ones as actionable list (generate missing → proceed).
7. **Deterministic invalidation**: manifest-hash change cascades: block stale ⇒ dependent keyframes/videos stale; expose "impacted items" diff and one-click selective regeneration.
8. **Normalize schema drift** (migration + single mapper for `sequenceAnimaticRole`/`screenplayAnimaticRole`, anchor id fields). Share node-key constants between `src/domain` and `_shared` (single source imported by both; they're both TS).
9. **Scene-state carryover**: persist end-of-block scene state into the continuity sidecar and feed it into the next block's derivation context (the structure exists; make the handoff explicit and tested).

### Phase 3 — Model routing & thinking modes
10. **Central model registry** in `_shared/model-policy.ts`: map *task class* → model + reasoning effort + structured-output flag, env-overridable per class. Suggested defaults:
    - `director_plan`, `continuity_structure_derivation`: gpt-5.4 + reasoning effort high
    - `screenplay_author`: gpt-5.4, medium
    - `video_prompt`, `panel_labels`, `intent_classify`, `repair`: gpt-5.4-mini, low/none
    - stills: nano-banana-2[/edit] (env), continuity/keyframe images: gpt-image-2[/edit]; video: seedance-2.0 (env)
11. Replace the ~50 hardcoded literals with registry lookups; log chosen model + tokens per step into `output_workflow_run_steps` (columns exist) and `ai_usage_events` for cost visibility.
12. Optional: complexity heuristic (shot count, anchor count, manifest size) bumps effort tier; cap with per-run budget.

### Phase 4 — UX/UI
13. **Extract the animatic feature** from WorldGraphPage into `src/features/world-builder/animatic/` (view model already started in `sequenceAnimaticViewModel.ts`): stage components + a `useSequenceAnimaticPipeline` hook. No behavior change, just decomposition — prerequisite for the rest.
14. **Pipeline rail UI**: one horizontal stage tracker (Script → Continuity → Assets → Storyboards → Keyframes → Video) with per-stage status, blockers, retry, and cost estimate; replaces scattered chips.
15. Per-target busy state (replace global `sequenceAnimaticBlockRunKey` with a keyed map) to allow parallel block actions; optimistic UI from realtime events.
16. Failure UX: per-step error cards with cause (provider error vs validation) + "retry step" wired to the right `forceNodeKeys` automatically.

### Phase 5 — Observability & ops
17. Request-id propagation (client → edge fn → worker → provider metadata), structured status-transition logs.
18. Dead-letter view (admin): runs failed ≥N attempts, stuck heartbeats, webhook/poll divergence; alert via simple Slack/email function.
19. Load-shed `get-sequence-animatic-state`: revision-gated cache or materialized projection (a status projection already exists per migration `20260512145441` — extend it to the animatic aggregate).

### Suggested order & effort
Phase 1 (items 1–5): ~1–2 weeks, removes most "stuck/unreliable" reports. Phase 2 (6–9): ~1 week, fixes continuity quality. Phase 3 (10–12): 2–3 days. Phase 4 (13–16): 1–2 weeks, can run parallel to 2/3 after the extraction. Phase 5: ongoing, start with 17–18.

---

## 4. Live-state checklist (run on your machine; this sandbox has no Supabase/Fly network access)

```bash
# stuck runs / stale heartbeats
npx supabase db query "select status, count(*) from output_workflow_runs group by 1;"
npx supabase db query "select id, status, heartbeat_at, attempt_count from output_workflow_runs where status='running' and heartbeat_at < now() - interval '5 minutes';"
# cinematic job health
npx supabase db query "select status, kind, count(*) from cinematic_run_jobs group by 1,2 order by 3 desc;"
npx supabase db query "select error_message, count(*) from cinematic_run_jobs where status='failed' group by 1 order by 2 desc limit 20;"
# duplicate provider submits (idempotency bug evidence)
npx supabase db query "select provider_request_id, count(*) from cinematic_run_jobs where provider_request_id is not null group by 1 having count(*)>1;"
# worker
fly logs --config fly.world-generation.toml | tail -200
fly status --config fly.world-generation.toml
```

Findings from these determine whether Phase 1 item 4 needs an immediate one-off repair script (requeue/fail orphans) before the structural fix.

---

## 5. Implemented changes (2026-06-10)

### Phase 1 — backend reliability
- **`supabase/functions/_shared/fal-queue.ts` (new)**: shared FAL queue helpers (submit/status/result/error parsing), extracted from poll-cinematic-run so the webhook path submits identically.
- **`supabase/functions/_shared/cinematics.ts`**: new reliability layer — `claimQueuedCinematicJobForSubmit` (atomic queued→running claim; prevents duplicate FAL submissions), `cinematicSubmitClaimExpired` + `requeueUnsubmittedCinematicJob` (3-min grace then requeue instead of insta-failing), `submitClaimedCinematicVideoJob` (queue-based, webhook-completed video submission from a stored execution plan), `advanceDependentCinematicJobs` (server-side still→video chain advancement).
- **`supabase/functions/poll-cinematic-run/index.ts`**: drains *all* runnable jobs per invocation (25s budget, in-pass dependency tracking) instead of one-job-per-poll; atomic claim before every submit; video jobs now submit to the FAL queue with webhook completion instead of a blocking 3-minute `ai-fal subscribe`; running-without-request-id jobs get grace+requeue instead of terminal failure; job failures no longer starve the rest of the run.
- **`supabase/functions/fal-webhook/index.ts`**: after any cinematic job completes/fails via webhook, dependent queued jobs are advanced server-side (`advanceCinematicDependents`) — shot videos start without an open tab. Terminal-status guards added to both cinematic handlers (poll/webhook double-processing race).
- **`supabase/migrations/20260610100000_output_workflow_run_reliability.sql`**: claim RPC now caps reclaim attempts (4) and terminally fails exhausted stale runs; new `fail_orphaned_output_workflow_runs()` and `requeue_unsubmitted_cinematic_jobs()` sweeps; partial indexes for queued/running runs and active cinematic jobs.
- **`workers/world-generation/main.ts`**: new maintenance loop (default 3 min) calling both sweeps — zombie runs surface as failed, crashed mid-submit cinematic jobs requeue automatically.

### Phase 2 — continuity correctness
- **Coverage validation gate surfaced**: `ensure-sequence-animatic-keyframe-workflows` now returns `blockedShotKeyframes` (shot id, reason `missing_coverage_anchor`/`missing_previous_keyframe`, blocking ids) instead of silently skipping; schema extended in `src/domain/outputWorkflow.ts`; client raises an actionable message when everything is blocked.
- **Staleness cascade**: non-provisional shot keyframes whose `sourceShotHash` no longer matches the current plan are flagged `sequenceAnimaticStale` with a reason, so the UI can offer targeted regeneration instead of silently reusing outdated keyframes.
- **`src/domain/sequenceAnimaticNodeKeys.ts` (new)** + **`sequenceAnimaticNodeKeys.test.ts` (new)**: canonical node-key constants shared by client run metadata; the test builds real factory graphs and asserts every force/target key exists — a rename on either side now fails CI instead of silently no-oping runs. WorldGraphPage's six hardcoded key lists replaced with the constants.
- Role-field drift (`screenplayAnimaticRole`/`sequenceAnimaticRole`) audited: all 9 readers already read both fields and writers write both — no change needed.

### Phase 3 — model policy
- **`supabase/functions/_shared/model-policy.ts` (new)**: task-class → {model, reasoningEffort} registry. Defaults preserve current model choices (no quality regression); reasoning effort is now complexity-aware: `director_plan`/`continuity_structure` high, `screenplay_author`/`block_script`/`chapter_prose` medium, `utility_prompt`/`repair` low. Env overrides: `OUTPUT_WORKFLOW_MODEL_<CLASS>`, `OUTPUT_WORKFLOW_REASONING_<CLASS>`, plus `OUTPUT_WORKFLOW_USE_LIGHT_MODELS=true` + `OUTPUT_WORKFLOW_LIGHT_TEXT_MODEL` to route light classes to a cheaper model.
- Wired into: continuity-structure stream, screenplay author (markdown + structured), cinematic sequence plan, block script (output-workflow.ts); `runStructuredWorldBuildModel` gained a `reasoningEffort` param (was hardcoded `low` even for script authorship); `author-cinematic-script` passes policy-driven model + effort.

### Phase 4 — UX
- **Per-target busy state**: the single global `sequenceAnimaticBlockRunKey` (which serialized every animatic action) replaced with a `Set`-based `sequenceAnimaticBusyRunKeys` — different blocks/assets/keyframes can run in parallel; only the same target is serialized. All ~25 UI spinner/disabled checks migrated.
- **Client polling backoff**: `pollSequenceAnimaticOutputRequest` now backs off 1.5s→10s (15-min budget) instead of fixed 2.5s × 240.
- **Blocked-shot surfacing**: keyframe generation reports *why* nothing started (missing anchors / earlier keyframes) instead of appearing stuck.

### Deploy order
1. `npx supabase db push` (migration must land before the worker deploy — the maintenance loop calls the new RPCs).
2. Deploy edge functions: `poll-cinematic-run`, `fal-webhook`, `ensure-sequence-animatic-keyframe-workflows`, `author-cinematic-script`, plus anything bundling `_shared` (`start-output-workflow-run` etc. — `npx supabase functions deploy` for the affected set).
3. `npm run fly:worker:deploy`.
4. Frontend ships with the next build (`npm run build`).

### Verify before deploy (sandbox here could not run the full suite — broken node_modules over the mount)
```bash
npx tsc --noEmit          # typecheck (includes WorldGraphPage + domain changes)
npm test                  # includes new src/domain/sequenceAnimaticNodeKeys.test.ts (passed in sandbox)
npx supabase functions serve  # smoke poll-cinematic-run / fal-webhook locally if desired
```

---

## 6. Creative/design evaluation — is this the right way to make a good animatic?

Assessment of the *generation design itself* (not reliability): does the pipeline produce animatics with correct shots, keyframes, references, continuity, and flow — efficiently?

### What the current design gets right
The factorization mirrors real production and is fundamentally sound: screenplay → director plan (shots with action/camera/lighting/dialogue/performance beats) → continuity graph (sets/zones/spots/viewpoints) → anchor atlases split into reusable refs → coverage anchors per camera setup → per-shot keyframes conditioned on {coverage anchor, previous keyframe, storyboard panel, asset pack} → video per shot. Three ideas in particular are strong: **coverage setups as reusable camera setups** (matches how real coverage works and amortizes generation cost across shots that share an angle), **atlas-then-extract for anchors** (one image generation yields many consistent refs), and **hash-based staleness** over the manifest/plan. These are better than the naive per-shot-prompt approach most tools use.

### Design gaps and improvement ideas (ordered by quality impact)

**1. Shot grammar is described but never validated.** The plan carries camera fields, but nothing checks eyeline match, the 180° line, or screen direction across cuts — the three things that make an animatic feel "wrong" even when every frame looks good. Idea: give each set in the continuity graph a *scene axis*, annotate each coverage setup with side-of-line and subject facing, then run a deterministic **continuity lint** over the shot list (axis jumps, crossed line between reverse shots, mismatched eyelines, missing reaction coverage for dialogue scenes). It's a pure-text pass — nearly free — and should gate keyframe generation the way the coverage gate now does.

**2. Previous-keyframe chaining serializes shots and accumulates drift.** Conditioning each keyframe on the literal previous frame propagates artifacts and forces sequential generation (the main wall-clock cost). Better: condition on the **coverage anchor + a structured scene-state record** (who holds what, wardrobe, time of day, light) and only chain frames *within the same setup*. Persist the scene-state record at each shot's end and feed it forward as text. This both improves consistency (state is explicit, not inferred from pixels) and unlocks **parallel keyframe generation per setup** — likely a 3–5× latency win on long sequences.

**3. No cheap editorial pass before expensive renders.** An animatic's first job is testing *pacing*, and pacing needs no pretty pixels. Idea: a tiered "pencil → ink" flow — T0: plan + lint (text only, seconds); T1: sketch-style storyboard grids (one batched low-res image per block) + timed cuts + **TTS dialogue temp audio** assembled in the existing timeline player; T2: high-fidelity keyframes only for approved blocks; T3: video only for approved shots. Today the pipeline pushes toward T2/T3 immediately; most iteration should happen at T1 where a full pass costs cents and minutes.

**4. Reference budget needs an explicit selector.** Edit models degrade past ~3–4 reference images. Shots carry visibleCharacterRefIds/propRefIds/locationRefIds plus anchors; there should be a deterministic ranker: coverage anchor always; then speaker > visible characters > hero props > location, capped at N, with the rejected refs recorded in diagnostics so users see *why* a ref wasn't used.

**5. Timing is under-modeled.** durationSeconds exists per shot/block but isn't derived from anything. Derive shot duration from dialogue length (TTS duration) + action beats, add pacing presets (slow burn / standard / action), enforce a target runtime, and flag rhythm problems (six 2-second shots in a row reads as chatter). This is what makes the assembled animatic *flow*.

**6. Single-pass director plan with no critique loop.** Block status `needs_review` exists in the schema but nothing sets it. Add a cheap critic pass (can be the lint from #1 plus an LLM check for coverage completeness: establishing shot present, each speaker covered, reactions exist) that marks blocks needs_review with reasons and optionally auto-repairs — catching plan-level mistakes before any image is paid for.

**7. Keyframe QC loop.** Convert "unreliable output" into self-healing: after each keyframe, a cheap VLM check (right character count, framing matches the planned shot size, identity matches the anchor) → auto-retry once with corrective prompt → otherwise flag for review. Combined with per-setup seeds (reuse a seed per coverage setup for look stability) this addresses most "keyframe came out wrong" cases without human babysitting.

**8. Start+end keyframes for motion control.** Seedance accepts end_image_url; for shots >4s, generating an end keyframe (same setup, evolved scene state) gives the video model an arc instead of letting it hallucinate one. Cost: one extra image per long shot; payoff: far fewer unusable clips at the most expensive tier.

**9. Cross-sequence reuse.** Anchor assets (characters, props, location spots) are world-level facts but are generated per master request. Cache them per entity+art-style in the world: chapter 2's animatic should reuse chapter 1's character anchors — cheaper *and* more consistent across the work as a whole.

**10. Batch keyframes per setup.** The atlas-then-extract trick used for anchors extends to keyframes: shots sharing a coverage setup can be generated as one grid then cropped — same look, same lighting, fraction of the cost. (The batch continuity grid machinery already exists; point it at keyframes.)

Suggested order: #1 + #6 (text-only, immediate quality gates) → #2 (parallelism + consistency) → #3 + #5 (editorial tier + timing, the biggest "feels like a real animatic" jump) → #4, #7, #8 (per-image quality) → #9, #10 (cost).

### Implemented from §6 (2026-06-10, second pass)
- **Continuity lint (§6.1)**: `src/domain/sequenceAnimaticContinuityLint.ts` (+12 tests) — deterministic film-grammar validation over shots + coverage setups: unknown/dangling coverage references, 180° screen-direction flips within a set (neutral wides/inserts and reverse angles exempt), reverse-angle pairs that fail to mirror screen direction or share subjects, OTS pair subject mismatches, speakers with dialogue never covered in their block, scenes missing establishing coverage, setup/subject and scene-binding mismatches, framing monotony, and same-setup jump-cut runs. Wired into `ensure-sequence-animatic-keyframe-workflows`: the report returns as `keyframePlan.continuityLint` and is emitted as a deduped `continuity_lint` event on `output_request_events` (flows to clients via the existing realtime channel + state aggregate). Lint informs, never blocks.
- **Scene-state conditioning (§6.2)**: `src/domain/sequenceAnimaticSceneState.ts` (+6 tests) — explicit per-shot continuity state derived from the director plan: location chain (set/zone/spot), lighting inherited within a set (with provenance), time-of-day hint, characters present/speaking, props in play vs already established in the scene, effective screen direction, continuity mode, and previous/same-setup shot links. Each shot keyframe job now carries `sceneState`; it lands in the keyframe workflow node config and the `planned_keyframe_prompt` executor embeds it as a "Scene state (maintain strict continuity with these facts)" block (prompt version bumped to v2 so existing prompts recompute). This is the foundation for de-chaining keyframes from previous-frame pixels; a follow-up can relax `previousShotId` dependencies to same-setup-only for parallel generation.
- Also: pipeline rail UI (`animatic/SequenceAnimaticPipelineRail.tsx` + derivation module, 5 tests) integrated into both animatic surfaces; `get-sequence-animatic-state` unchanged fast-path now skips all per-asset URL signing.

### Known follow-ups (not yet implemented)
- Relax keyframe `previousShotId` dependencies to same-setup-only now that scene state is explicit (unlocks parallel keyframe generation).
- Continuity-lint UI panel (findings list with per-shot links) — data already flows via `continuity_lint` events.
- Scene-state in shot-video prompts (currently keyframes only).
- Pipeline-rail UI (single stage tracker replacing scattered chips) and per-step retry cards — plan §3 items 14–16.
- Extraction of the animatic feature out of WorldGraphPage (17.8k lines) — plan §3 item 13.
- `get-sequence-animatic-state` materialized projection — plan §3 item 19.
- Request-id propagation + dead-letter admin view — plan §3 items 17–18.
