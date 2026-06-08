# Animatic Worker Scalability Roadmap

This document records the future scaling path for sequence animatic generation. It is intentionally documentation-only: it does not change Fly configuration, worker code, Supabase schema, queue behavior, or deployment posture.

## Current Capacity

GraphCore currently runs animatic work through the mixed Fly world-generation worker app:

- Fly app: `graphcore-world-generation`
- Worker entrypoint: `workers/world-generation/main.ts`
- Current production-style output workflow concurrency: `OUTPUT_WORKFLOW_WORKER_CONCURRENCY=3`
- Current Fly shape: one mixed worker process type that can run output workflows, visual jobs, world generation, and app generation loops
- Output workflow runs are claimed from Supabase through the durable `output_workflow_runs` queue using row-locked claiming with `FOR UPDATE SKIP LOCKED`

The rough active workflow lane formula is:

```text
active workflow lanes = active Fly machines * OUTPUT_WORKFLOW_WORKER_CONCURRENCY
```

For example:

```text
1 active machine  * 3 lanes = 3 active output workflow runs
5 active machines * 3 lanes = 15 active output workflow runs
10 active machines * 3 lanes = 30 active output workflow runs
```

This is not the same as complete animatics. A single animatic can consume multiple runs over time:

- master planning: creative screenplay, shot-continuity stream, manifest, orchestrator
- continuity reference asset batches
- storyboard block child workflows
- optional manual shot-video workflows
- utility work such as panel extraction and video assembly

Practical throughput depends on provider limits, child-run mix, average animatic length, retry rate, and whether video generation is enabled.

## Scaling Phases

### Phase 0: Current / Beta

Use the existing mixed worker app and keep capacity conservative while the animatic pipeline stabilizes.

- Keep one mixed Fly worker app.
- Keep per-machine output workflow concurrency modest.
- Scale manually only when testing higher load.
- Prefer reliability, clear recovery, and accurate progress events over raw throughput.

This phase is appropriate while the main risks are correctness, provider behavior, and UX clarity.

### Phase 1: Safe Capacity Increase

Increase active Fly machines for the current worker app without changing queue architecture.

- Add a small number of active Fly machines.
- Keep `OUTPUT_WORKFLOW_WORKER_CONCURRENCY` around `3-5` per machine.
- Avoid pushing one shared-CPU machine to high concurrency.
- Watch queue wait time, provider throttling, memory, CPU, and failed/stale runs.

This gives quick headroom, but all work still competes in one mixed pool.

### Phase 2: Split Worker Pools

Split the mixed worker into dedicated worker pools that use the same durable run model but claim different kinds of work.

Recommended pools:

- planning workers: creative screenplay, shot-continuity stream, manifest, orchestrator
- animatic asset workers: continuity reference batches and storyboard blocks
- video workers: shot video and final assembly work
- world/app/visual workers: existing non-animatic background workloads

Expected changes:

- Add queue classification to output workflow runs.
- Add filtered claim behavior so each worker pool claims only the queues it owns.
- Keep stale-run reclaim and row-locking behavior.
- Keep storyboard block concurrency conservative per animatic while allowing many animatics to progress in parallel.

This is the first major future-facing scaling step because it prevents storyboard/image/video work from starving planning work.

### Phase 3: Queue-Based Autoscaling

Autoscale worker pools from queue pressure rather than user count.

Useful metrics:

- queued count by queue
- running count by queue
- oldest queued age
- average queue wait time
- provider throttle/error rate
- retry and stale-reclaim rate

Example scaler formulas:

```text
planner_machines = clamp(1, 20, ceil(queued_animatic_planning / 3))
asset_machines   = clamp(1, 50, ceil((queued_storyboard_blocks + queued_continuity_assets) / 3))
video_machines   = clamp(0, 20, ceil(queued_shot_videos / 1))
```

Scale down only after the relevant queue has stayed empty for several minutes. Provider caps should remain separate from Fly machine count so autoscaling does not stampede OpenAI, Fal, MUAPI, or any future provider.

### Phase 4: Platform Scale

Move from a Postgres-backed durable queue to a dedicated workflow or queue platform only when queue volume and operational complexity justify it.

Candidates:

- Temporal
- Inngest
- Cloud Tasks / PubSub
- BullMQ / Redis
- a dedicated partitioned Postgres queue with advisory locks

Platform-scale requirements:

- explicit workflow state machine for animatic stages
- per-stage retry, timeout, cancellation, and resume policy
- provider governors and global rate budgets
- priority tiers and admission control
- cost estimation before enqueue
- per-job cost ledger and budget enforcement
- compacted current-state snapshots for UI
- event retention and archive policy

This phase is for hundreds or thousands of queued jobs with predictable service levels.

## Future Trigger Points

Start the next phase when one or more of these are true:

- Average queued wait exceeds the target for active users.
- Oldest queued animatic run regularly waits several minutes before claim.
- Provider throttling rises because too many lanes submit at once.
- Storyboard/image jobs block planning jobs from starting promptly.
- Manual Fly scaling becomes frequent operational work.
- Users regularly exceed the current active run capacity.
- Event volume makes animatic state polling or realtime refresh noticeably slower.

## Not Doing Now

This roadmap does not implement:

- Supabase schema changes
- Fly app split or process split
- filtered queue claiming
- autoscaler deployment
- Temporal or dedicated queue migration
- provider governor changes
- UI queue-position or SLA changes

The current implementation remains unchanged until a future scaling phase is explicitly started.
