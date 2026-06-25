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
    order by
      case
        when status = 'queued' and coalesce(metadata ->> 'stage', '') = 'waiting_resumable' then 1
        else 0
      end asc,
      created_at asc
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

revoke all on function public.claim_output_workflow_run(text) from public, anon, authenticated;
grant execute on function public.claim_output_workflow_run(text) to service_role;
