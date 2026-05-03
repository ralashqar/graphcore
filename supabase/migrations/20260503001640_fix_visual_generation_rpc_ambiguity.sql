create or replace function public.claim_visual_generation_job(worker_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_job_id uuid;
  now_at timestamptz := timezone('utc'::text, now());
  p_worker_id text := trim(claim_visual_generation_job.worker_id);
begin
  if p_worker_id is null or length(p_worker_id) = 0 then
    raise exception 'worker_id is required';
  end if;

  with candidate as (
    select id
    from public.visual_generation_jobs
    where status = 'queued'
      or (
        status = 'running'
        and coalesce(heartbeat_at, updated_at, created_at) < now_at - interval '5 minutes'
      )
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.visual_generation_jobs as job
  set
    status = 'running',
    worker_id = p_worker_id,
    attempt_count = job.attempt_count + 1,
    started_at = coalesce(job.started_at, now_at),
    heartbeat_at = now_at,
    error_message = null,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || jsonb_build_object('workerId', p_worker_id, 'claimedAt', now_at)
  from candidate
  where job.id = candidate.id
  returning job.id into claimed_job_id;

  return claimed_job_id;
end;
$$;

create or replace function public.heartbeat_visual_generation_job(
  job_id uuid,
  worker_id text,
  metadata_patch jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  p_job_id uuid := heartbeat_visual_generation_job.job_id;
  p_worker_id text := trim(heartbeat_visual_generation_job.worker_id);
  p_metadata_patch jsonb := coalesce(heartbeat_visual_generation_job.metadata_patch, '{}'::jsonb);
begin
  update public.visual_generation_jobs as job
  set
    heartbeat_at = now_at,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || p_metadata_patch
      || jsonb_build_object('workerId', p_worker_id, 'lastHeartbeatAt', now_at)
  where job.id = p_job_id
    and coalesce(job.worker_id, p_worker_id) = p_worker_id;

  return found;
end;
$$;

create or replace function public.complete_visual_generation_job(
  job_id uuid,
  worker_id text,
  outputs jsonb,
  metadata_patch jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  next_status public.visual_generation_status := 'completed';
  p_job_id uuid := complete_visual_generation_job.job_id;
  p_worker_id text := trim(complete_visual_generation_job.worker_id);
  p_outputs jsonb := coalesce(complete_visual_generation_job.outputs, '{}'::jsonb);
  p_metadata_patch jsonb := coalesce(complete_visual_generation_job.metadata_patch, '{}'::jsonb);
begin
  if p_metadata_patch->>'status' = 'completed_with_errors' then
    next_status := 'completed_with_errors';
  end if;

  update public.visual_generation_jobs as job
  set
    status = next_status,
    completed_at = now_at,
    heartbeat_at = now_at,
    outputs = p_outputs,
    error_message = null,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || p_metadata_patch
      || jsonb_build_object('workerId', p_worker_id, 'completedAt', now_at)
  where job.id = p_job_id
    and coalesce(job.worker_id, p_worker_id) = p_worker_id;

  return found;
end;
$$;

create or replace function public.fail_visual_generation_job(
  job_id uuid,
  worker_id text,
  error_message text,
  metadata_patch jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  p_job_id uuid := fail_visual_generation_job.job_id;
  p_worker_id text := trim(fail_visual_generation_job.worker_id);
  p_error_message text := fail_visual_generation_job.error_message;
  p_metadata_patch jsonb := coalesce(fail_visual_generation_job.metadata_patch, '{}'::jsonb);
begin
  update public.visual_generation_jobs as job
  set
    status = 'failed',
    completed_at = now_at,
    heartbeat_at = now_at,
    error_message = p_error_message,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || p_metadata_patch
      || jsonb_build_object('workerId', p_worker_id, 'failedAt', now_at)
  where job.id = p_job_id
    and coalesce(job.worker_id, p_worker_id) = p_worker_id;

  return found;
end;
$$;

create or replace function public.cancel_visual_generation_job(job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  p_job_id uuid := cancel_visual_generation_job.job_id;
begin
  update public.visual_generation_jobs as job
  set
    status = 'cancelled',
    completed_at = now_at,
    heartbeat_at = now_at,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || jsonb_build_object('cancelledAt', now_at)
  where job.id = p_job_id
    and job.status in ('queued', 'running');

  return found;
end;
$$;

revoke all on function public.claim_visual_generation_job(text) from public, anon, authenticated;
revoke all on function public.heartbeat_visual_generation_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_visual_generation_job(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_visual_generation_job(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.cancel_visual_generation_job(uuid) from public, anon, authenticated;

grant execute on function public.claim_visual_generation_job(text) to service_role;
grant execute on function public.heartbeat_visual_generation_job(uuid, text, jsonb) to service_role;
grant execute on function public.complete_visual_generation_job(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.fail_visual_generation_job(uuid, text, text, jsonb) to service_role;
grant execute on function public.cancel_visual_generation_job(uuid) to service_role;
