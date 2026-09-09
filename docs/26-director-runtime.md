# Director runtime and rollout

Saved Director takes and exports have a dedicated execution path. Existing screenplay, scene assignment, shot plans, reference/keyframe preparation, cinematic production graphs, and already queued Director jobs retain their original runtime. Live Director remains the existing gated internal beta.

## Boundaries

`director-command` verifies the user, looks up an earlier command acknowledgement, freezes world context and quotes, then commits the direction/settings/reference selection and media job in one transaction. A frozen snapshot includes reference storage paths, parent media, edit clips, settings, direction, and the reservation. Session edits cannot change an admitted job.

Only requests admitted with `DIRECTOR_RUNTIME_ENABLED=true` and a matching `DIRECTOR_RUNTIME_USERS` entry receive `executionOwner=director_v2`. The allowlist accepts comma-separated user UUIDs; `*` explicitly admits everyone. Both gates default off/empty. `DIRECTOR_GENERATION_ENABLED` remains the overall media admission switch.

`director_runtime_jobs` owns these new executions. The existing output workflow/run/step records are compatibility projections for history. The old claim RPC excludes owned runs from **both** claiming and stale-attempt failure. It preserves the previous ordering and recovery predicates for every unmarked run. Generic start/rerun routes owned workflows to `director_recover_job`; a database trigger also prevents inserting another generic run for an owned workflow. No job is automatically adopted, migrated, or regenerated.

## Processes

`fly.director.toml` defines a separate `graphcore-director` app in London. Each process group runs on a separate Machine. The old world worker configuration and concurrency are unchanged.

| Group | Initial machine | Concurrency | Work |
| --- | --- | --- | --- |
| orchestration | 1 shared CPU, 1 GB | 4 | Submit, single status probe, final commit, cancellation |
| media | 1 shared CPU, 2 GB | 1 | Extract branch references; download, probe, stage takes |
| export | 2 shared CPUs, 4 GB | 1 | Normalize and concatenate saved edits |

All groups remain warm. A signed `/wake` notification accelerates dispatch; each process also checks for eligible work every 500 ms. Claims use `FOR UPDATE SKIP LOCKED`, a 90-second lease, monotonic fencing token, and a 20-second heartbeat. Database-enforced provider capacity is two requests globally and one per project/session. Provider permits survive process restarts and waiting phases. Uncertain submissions retain capacity until reconciled.

The new image pins Deno and its direct database/schema dependencies. The worker uses bounded database/storage requests and has no import of the monolithic output workflow executor. `/health` reports version, group, last successful claim, and active task count; it returns 503 for stale database connectivity or shutdown.

## Recovery and media

Take phases are `prepare → submit → await_provider → ingest → finalize`. Export uses `prepare → finalize` on its own Machine. Each completed phase writes a durable checkpoint and releases the worker slot. Provider checks start after five seconds and increase to fifteen seconds, with a ten-minute provider deadline. Transient failures back off; repeated failures or ambiguous submission move the job to `attention`.

A compare-and-set submission marker is written **before** the Fal POST. A crash during that POST cannot cause an automatic second paid submission. Request IDs can be recorded after lease loss/cancellation without allowing late asset publication. A known request can be recovered through `director-recover`; an unknown submission requires audited service-side reconciliation.

`director-fal-webhook` always verifies the Fal signature through the shared signature helper. It commits a deduplicated inbox entry before acknowledgement. Early callbacks are retained until the request ID is attached; successful terminal deliveries take precedence over out-of-order failures. Polling recovers a lost notification. The existing `fal-webhook` route and provider registrations are unchanged.

Downloads stream to temporary files with a 256 MiB limit and 90-second timeout. FFprobe has a 15-second deadline; FFmpeg calls have a three-minute deadline. Exports are limited to 100 clips / ten minutes, with a bounded disk budget and overall processing deadline. Source files are deleted as each clip is normalized. Lease-specific staging paths prevent an old worker from overwriting a newer worker's media.

`director_finalize_job` atomically binds the staged asset, completes the take, settles its reservation, updates workflow history, and inserts a usage outbox entry. Exports atomically register an output artifact. A failed transaction publishes none of these effects. The outbox retries the shared usage ledger independently with its existing idempotency key.

Cancellation fences old leases and blocks late finalization. Unsubmitted work refunds exactly once. Submitted cancellation is best effort; an acknowledgement alone does not establish the provider charge. The reservation remains available for reconciliation. Maintenance runs every minute, retries usage delivery, logs overdue reservations/submissions after 24 hours, removes old unused terminal-job staging objects through Storage, and cleans temporary directories left by killed processes. Feed `director_reconciliation_overdue` log events into the production alert destination before opening the allowlist publicly.

Service-only recovery examples (operator identity and evidence are mandatory):

```sql
-- Attach a request ID verified against provider history.
select director_resolve_submission(
  p_job := '<job UUID>', p_actor := '<operator identity>',
  p_reason := '<provider evidence / incident reference>', p_request := '<verified request ID>'
);
-- Or resolve the charged credits using verified billing evidence (0 means full refund).
select director_resolve_submission(
  p_job := '<job UUID>', p_actor := '<operator identity>',
  p_reason := '<provider evidence / invoice reference>', p_charge := 0
);
```

These functions are not executable by browser roles. Actual provider invoice reconciliation remains an operational step; saved-take charging preserves the quoted reservation policy.

## Client behavior

Pending commands are saved in session storage, scoped to the account/project/draft, **before** dispatch. A reload offers the original command for retry with its original idempotency key. It never silently creates a replacement command. Definitive validation/revision errors clear it; uncertain transport errors retain it. An earlier accepted command can be recovered even while media admissions are disabled.

An RLS-protected `director_session_status` row emits only session/draft IDs, phase, revision, and timestamp through Realtime. Updates trigger coalesced progress reads containing take status/media bindings, job phase, and exports; they do not retransmit world context or scripts. Full session reads handle initial load, editing revisions, and recovery. Five-second polling runs while work is active or the event connection is unavailable. Signed media links refresh periodically; edit playback preloads the next clip and maintains its playhead locally in the player.

## Deployment

1. Verify `npx tsc --noEmit`, `npm test`, `npm run test:director-runtime`, `npm run build`, and dev startup. `npm run test:director-db` executes the additive migration and both SQL assertion suites against the linked database in one transaction, then rolls it back. After the migration is actually deployed, use `npm run test:director-db -- --existing` to omit reapplying its DDL. The tests require an editable draft fixture. Do not run a broad database push that includes unrelated pending migrations.
2. Apply `20260906202603_director_isolated_runtime.sql` after the original Director migration. Keep `DIRECTOR_GENERATION_ENABLED=false` during this rollout. Deploy the affected Edge dependency closure, preserving each existing endpoint's JWT configuration. This includes `director-command`, `get-director-session`, `director-fal-webhook`, `director-recover`, `start-output-workflow-run`, `cancel-output-workflow-run`, the legacy Fal webhook, and any entry points importing the changed Director domain/media modules.
3. Complete the paired legacy worker deployment: `npm run fly:worker:deploy`. Its code version is `2026-09-06-director-runtime-compat-v2`. Its machine size and concurrency remain unchanged.
4. Create the separate Fly app in the intended organization, if absent. Set server-only secrets: `SUPABASE_URL`, `SB_SECRET_KEY` (or the legacy service-role key), `FAL_KEY`, `DIRECTOR_WORKER_WAKE_SECRET`, and `DIRECTOR_FAL_WEBHOOK_URL=https://<project>.supabase.co/functions/v1/director-fal-webhook`. Set matching `DIRECTOR_WORKER_WAKE_SECRET` and `DIRECTOR_WORKER_WAKE_URL=https://graphcore-director.fly.dev/wake` on Edge. Keep all service secrets out of the browser.
5. Run `npm run fly:director:deploy`; verify one healthy Machine for **each** process group, FFmpeg/FFprobe availability, lease recovery, and signed wakes. Use the Fly CLI's `scale count` if existing machine counts differ; the deployment script disables automatic HA duplicates on initial creation.
6. Enable the runtime for internal UUIDs, then enable Director media admission. Run the paid acceptance sequence below with a controlled credit budget. Expand the allowlist gradually only after measured results. Keep both live beta gates disabled.

Rollback stops **new admissions** by setting `DIRECTOR_GENERATION_ENABLED=false`. Keep all three Director processes running to drain accepted work. Do not clear execution ownership, restore an older claim RPC, or route new-runtime jobs into the legacy worker. Recovery and cancellation remain callable while admission is disabled.

## Verification and release gates

The SQL suite covers command replay, atomic direction, frozen snapshots, lease loss, submit-once markers, provider permits across waits, inbox deduplication, legacy stale recovery exclusion, ingestion transition restrictions, atomic asset/billing/outbox rollback, duplicate finalization, cancellation races/refunds, and browser privilege restrictions. Eleven worker tests use fake provider responses and perform no paid inference: successful/ambiguous/429 submissions, restart with a handle, early/out-of-order/lost callbacks, polling throttling, invalid outputs, cancellation, repeated download failures, and expired provider media renewal. Two media integration tests exercise real FFmpeg frame extraction, a three-second motion tail, ingestion, trimmed concatenation with audio normalization, and streaming byte-limit enforcement. Run them with FFmpeg and FFprobe on PATH and `deno test --allow-env --allow-read --allow-write --allow-run=ffmpeg,ffprobe --config workers/director/deno.json workers/director/media.integration.test.ts` (quote the comma-containing flag in PowerShell). The existing application suite covers cinematic contracts and scene/shot/reference/graph behavior.

Before public admission, run an authenticated session through generate → keep → trim → branch → keep → undo/redo → export → reload, including expired links and disconnect/reconnect. Kill a test worker in each phase, force one upload failure, and run a screenplay/graph cinematic workload concurrently to measure isolation. Verify real output playback and reconcile the controlled provider bill. These are acceptance gates, not claims made by mocked tests.

Targets to measure are p95 command acknowledgement <1 second, eligible-job dispatch <1 second, and durable-status visibility <1 second with Realtime connected. `director_command_ack` logs acknowledgement timing, `director_job_dispatched` logs eligible-queue delay, and `director_phase_finished` logs phase duration. Provider generation and media processing are measured separately. Polling fallback can take five seconds; these targets have not yet been demonstrated against deployed workers.

Implementation verification on September 6: application suite 659 passed / 8 skipped; eleven worker recovery tests and two real-media integration tests passed; original and new SQL assertions passed in a rolled-back transaction. Frontend TypeScript/build, new worker/Director endpoint Deno checks, and signed-out browser rendering passed. A broader strict Deno check of the legacy workflow dependency graph still reports 188 existing import/type errors, including unmapped geometry dependencies and the old workflow client RPC type. That broader check is not green; it is separate from the passing new runtime checks.

The new runtime migration has **not** been applied and this architecture upgrade has **not** been deployed. Local Fly authentication remains unavailable, so paid browser/provider acceptance and deployed performance measurements remain pending. The earlier V1 Director migration/Edge rollout is documented separately in document 25.

References: [Fal asynchronous queue](https://fal.ai/docs/documentation/model-apis/inference/queue), [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [Fly process groups](https://fly.io/docs/launch/processes/).
