-- Reliability hardening for output workflow runs and cinematic jobs.
--
-- 1. claim_output_workflow_run: cap reclaim attempts so a crash-looping run
--    cannot be reclaimed forever; exhausted runs are failed terminally with a
--    diagnostic instead of being silently re-run.
-- 2. fail_orphaned_output_workflow_runs: sweep helper (called periodically by
--    the Fly worker) that terminally fails running runs whose heartbeat went
--    stale after exhausting their attempts.
-- 3. Partial indexes so claim + sweep stay cheap as run tables grow.

create index if not exists output_workflow_runs_queued_claim_idx
  on public.output_workflow_runs (created_at asc)
  where status = 'queued';

create index if not exists output_workflow_runs_running_heartbeat_idx
  on public.output_workflow_runs (heartbeat_at asc)
  where status = 'running';

create index if not exists cinematic_run_jobs_active_status_idx
  on public.cinematic_run_jobs (run_id, status)
  where status in ('queued', 'running');

create or replace function public.claim_output_workflow_run(worker_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_run_id uuid;
  now_at timestamptz := timezone('utc'::text, now());
  p_worker_id text := trim(claim_output_workflow_run.worker_id);
  max_attempts constant integer := 4;
begin
  if p_worker_id is null or length(p_worker_id) = 0 then
    raise exception 'worker_id is required';
  end if;

  -- Terminally fail stale running runs that already exhausted their attempts
  -- so they stop being reclaimed and surface as failed to the user.
  update public.output_workflow_runs as run
  set
    status = 'failed',
    error_message = coalesce(
      run.error_message,
      'The workflow run was abandoned after ' || run.attempt_count || ' attempts (worker heartbeat went stale).'
    ),
    completed_at = now_at,
    metadata = coalesce(run.metadata, '{}'::jsonb)
      || jsonb_build_object('failedReason', 'stale_heartbeat_attempts_exhausted', 'failedAt', now_at)
  where run.status = 'running'
    and coalesce(run.heartbeat_at, run.updated_at, run.created_at) < now_at - interval '5 minutes'
    and run.attempt_count >= max_attempts;

  with candidate as (
    select id
    from public.output_workflow_runs
    where status = 'queued'
      or (
        status = 'running'
        and coalesce(heartbeat_at, updated_at, created_at) < now_at - interval '5 minutes'
        and attempt_count < max_attempts
      )
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.output_workflow_runs as run
  set
    status = 'running',
    worker_id = p_worker_id,
    attempt_count = run.attempt_count + 1,
    started_at = coalesce(run.started_at, now_at),
    heartbeat_at = now_at,
    error_message = null,
    metadata = coalesce(run.metadata, '{}'::jsonb)
      || jsonb_build_object('workerId', p_worker_id, 'claimedAt', now_at)
  from candidate
  where run.id = candidate.id
  returning run.id into claimed_run_id;

  return claimed_run_id;
end;
$$;

create or replace function public.fail_orphaned_output_workflow_runs(
  stale_minutes integer default 15,
  max_attempts integer default 4
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  failed_count integer;
begin
  update public.output_workflow_runs as run
  set
    status = 'failed',
    error_message = coalesce(
      run.error_message,
      'The workflow run was abandoned (worker heartbeat stale for over ' || stale_minutes || ' minutes).'
    ),
    completed_at = now_at,
    metadata = coalesce(run.metadata, '{}'::jsonb)
      || jsonb_build_object('failedReason', 'orphaned_stale_heartbeat', 'failedAt', now_at)
  where run.status = 'running'
    and coalesce(run.heartbeat_at, run.updated_at, run.created_at) < now_at - (stale_minutes || ' minutes')::interval
    and run.attempt_count >= max_attempts;

  get diagnostics failed_count = row_count;
  return failed_count;
end;
$$;

-- Re-queue cinematic jobs that were claimed for provider submission but never
-- received a provider request id (e.g. the submitting invocation crashed
-- between claim and submit). Mirrors cinematicSubmitClaimExpired in code.
create or replace function public.requeue_unsubmitted_cinematic_jobs(
  grace_minutes integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  requeued_count integer;
begin
  update public.cinematic_run_jobs as job
  set
    status = 'queued',
    error_message = null,
    result_context = coalesce(job.result_context, '{}'::jsonb) - 'submitClaimedAt'
  where job.status = 'running'
    and job.provider_request_id is null
    and coalesce(
      nullif(job.result_context ->> 'submitClaimedAt', '')::timestamptz,
      job.updated_at,
      job.created_at
    ) < now_at - (grace_minutes || ' minutes')::interval;

  get diagnostics requeued_count = row_count;
  return requeued_count;
end;
$$;

revoke all on function public.claim_output_workflow_run(text) from public, anon, authenticated;
revoke all on function public.fail_orphaned_output_workflow_runs(integer, integer) from public, anon, authenticated;
revoke all on function public.requeue_unsubmitted_cinematic_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_output_workflow_run(text) to service_role;
grant execute on function public.fail_orphaned_output_workflow_runs(integer, integer) to service_role;
grant execute on function public.requeue_unsubmitted_cinematic_jobs(integer) to service_role;
