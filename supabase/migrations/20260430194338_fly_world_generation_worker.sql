alter table public.world_prompt_generation_job_steps
  drop constraint if exists world_prompt_generation_job_steps_phase_check;

alter table public.world_prompt_generation_job_steps
  add constraint world_prompt_generation_job_steps_phase_check
  check (phase in ('full_stream', 'world_bible', 'core_entities', 'sequence_units', 'relationships', 'finalize'));

create or replace function public.claim_world_prompt_generation_job(
  worker_id text,
  worker_secret text default null
)
returns table (
  job_id uuid,
  step_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
begin
  if worker_id is null or length(trim(worker_id)) = 0 then
    raise exception 'worker_id is required';
  end if;

  return query
  with candidate as (
    select
      j.id as candidate_job_id,
      s.id as candidate_step_id
    from public.world_prompt_generation_jobs j
    join public.world_prompt_generation_job_steps s
      on s.job_id = j.id
    where j.kind = 'initial_seed_stream'
      and coalesce(j.metadata->>'runtime', 'supabase') = 'fly'
      and s.step_key = 'full_stream'
      and (
        j.status = 'queued'
        or (
          j.status = 'running'
          and coalesce(j.heartbeat_at, j.updated_at, j.created_at) < now_at - interval '5 minutes'
        )
      )
      and (
        s.status = 'queued'
        or (
          s.status = 'running'
          and coalesce(s.heartbeat_at, s.updated_at, s.created_at) < now_at - interval '5 minutes'
        )
      )
    order by j.created_at asc
    for update of j, s skip locked
    limit 1
  ),
  updated_job as (
    update public.world_prompt_generation_jobs j
    set
      status = 'running',
      started_at = coalesce(j.started_at, now_at),
      heartbeat_at = now_at,
      error_message = null,
      metadata = coalesce(j.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'runtime', 'fly',
          'workerId', trim(worker_id),
          'claimedAt', now_at,
          'lastHeartbeatAt', now_at,
          'streamMode', 'single_response_ndjson'
        )
    from candidate
    where j.id = candidate.candidate_job_id
    returning j.id
  ),
  updated_step as (
    update public.world_prompt_generation_job_steps s
    set
      status = 'running',
      started_at = coalesce(s.started_at, now_at),
      heartbeat_at = now_at,
      error_message = null,
      metadata = coalesce(s.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'runtime', 'fly',
          'workerId', trim(worker_id),
          'claimedAt', now_at,
          'lastHeartbeatAt', now_at
        )
    from candidate
    where s.id = candidate.candidate_step_id
    returning s.id
  )
  select updated_job.id, updated_step.id
  from updated_job
  cross join updated_step;
end;
$$;

create or replace function public.heartbeat_world_prompt_generation_job(
  job_id uuid,
  worker_id text,
  counts jsonb default null,
  token_usage jsonb default null,
  cursor text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
begin
  update public.world_prompt_generation_jobs j
  set
    heartbeat_at = now_at,
    counts = coalesce(heartbeat_world_prompt_generation_job.counts, j.counts),
    token_usage = coalesce(heartbeat_world_prompt_generation_job.token_usage, j.token_usage),
    latest_applied_op_cursor = coalesce(heartbeat_world_prompt_generation_job.cursor, j.latest_applied_op_cursor),
    metadata = coalesce(j.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'lastHeartbeatAt', now_at,
        'workerId', trim(worker_id)
      )
  where j.id = heartbeat_world_prompt_generation_job.job_id
    and coalesce(j.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  update public.world_prompt_generation_job_steps s
  set
    heartbeat_at = now_at,
    counts = coalesce(heartbeat_world_prompt_generation_job.counts, s.counts),
    token_usage = coalesce(heartbeat_world_prompt_generation_job.token_usage, s.token_usage),
    latest_applied_op_cursor = coalesce(heartbeat_world_prompt_generation_job.cursor, s.latest_applied_op_cursor),
    metadata = coalesce(s.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'lastHeartbeatAt', now_at,
        'workerId', trim(worker_id)
      )
  where s.job_id = heartbeat_world_prompt_generation_job.job_id
    and s.step_key = 'full_stream'
    and coalesce(s.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  return found;
end;
$$;

create or replace function public.complete_world_prompt_generation_job(
  job_id uuid,
  worker_id text,
  final_status public.world_prompt_generation_job_status default 'completed',
  counts jsonb default null,
  token_usage jsonb default null,
  cursor text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
begin
  update public.world_prompt_generation_jobs j
  set
    status = final_status,
    completed_at = now_at,
    heartbeat_at = now_at,
    counts = coalesce(complete_world_prompt_generation_job.counts, j.counts),
    token_usage = coalesce(complete_world_prompt_generation_job.token_usage, j.token_usage),
    latest_applied_op_cursor = coalesce(complete_world_prompt_generation_job.cursor, j.latest_applied_op_cursor),
    error_message = null,
    metadata = coalesce(j.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'completedByWorkerId', trim(worker_id),
        'lastHeartbeatAt', now_at
      )
  where j.id = complete_world_prompt_generation_job.job_id
    and coalesce(j.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  update public.world_prompt_generation_job_steps s
  set
    status = case when final_status = 'failed' then 'failed' else 'completed' end,
    completed_at = now_at,
    heartbeat_at = now_at,
    counts = coalesce(complete_world_prompt_generation_job.counts, s.counts),
    token_usage = coalesce(complete_world_prompt_generation_job.token_usage, s.token_usage),
    latest_applied_op_cursor = coalesce(complete_world_prompt_generation_job.cursor, s.latest_applied_op_cursor),
    error_message = null,
    metadata = coalesce(s.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'completedByWorkerId', trim(worker_id),
        'lastHeartbeatAt', now_at
      )
  where s.job_id = complete_world_prompt_generation_job.job_id
    and s.step_key = 'full_stream'
    and coalesce(s.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  return found;
end;
$$;

create or replace function public.fail_world_prompt_generation_job(
  job_id uuid,
  worker_id text,
  final_status public.world_prompt_generation_job_status default 'failed',
  error_message text default null,
  counts jsonb default null,
  token_usage jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
begin
  update public.world_prompt_generation_jobs j
  set
    status = final_status,
    completed_at = case when final_status in ('failed', 'completed_with_errors', 'cancelled') then now_at else j.completed_at end,
    heartbeat_at = now_at,
    counts = coalesce(fail_world_prompt_generation_job.counts, j.counts),
    token_usage = coalesce(fail_world_prompt_generation_job.token_usage, j.token_usage),
    error_message = fail_world_prompt_generation_job.error_message,
    metadata = coalesce(j.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'failedByWorkerId', trim(worker_id),
        'lastHeartbeatAt', now_at
      )
  where j.id = fail_world_prompt_generation_job.job_id
    and coalesce(j.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  update public.world_prompt_generation_job_steps s
  set
    status = case when final_status = 'cancelled' then 'cancelled' else 'failed' end,
    completed_at = now_at,
    heartbeat_at = now_at,
    counts = coalesce(fail_world_prompt_generation_job.counts, s.counts),
    token_usage = coalesce(fail_world_prompt_generation_job.token_usage, s.token_usage),
    error_message = fail_world_prompt_generation_job.error_message,
    metadata = coalesce(s.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'failedByWorkerId', trim(worker_id),
        'lastHeartbeatAt', now_at
      )
  where s.job_id = fail_world_prompt_generation_job.job_id
    and s.step_key = 'full_stream'
    and coalesce(s.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  return found;
end;
$$;

revoke all on function public.claim_world_prompt_generation_job(text, text) from public, anon, authenticated;
revoke all on function public.heartbeat_world_prompt_generation_job(uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.complete_world_prompt_generation_job(uuid, text, public.world_prompt_generation_job_status, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.fail_world_prompt_generation_job(uuid, text, public.world_prompt_generation_job_status, text, jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.claim_world_prompt_generation_job(text, text) to service_role;
grant execute on function public.heartbeat_world_prompt_generation_job(uuid, text, jsonb, jsonb, text) to service_role;
grant execute on function public.complete_world_prompt_generation_job(uuid, text, public.world_prompt_generation_job_status, jsonb, jsonb, text) to service_role;
grant execute on function public.fail_world_prompt_generation_job(uuid, text, public.world_prompt_generation_job_status, text, jsonb, jsonb) to service_role;
