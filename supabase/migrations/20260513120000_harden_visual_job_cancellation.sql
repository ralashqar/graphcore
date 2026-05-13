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
    and job.status = 'running'
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
    and job.status = 'running'
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
    and job.status = 'running'
    and coalesce(job.worker_id, p_worker_id) = p_worker_id;

  return found;
end;
$$;

revoke all on function public.heartbeat_visual_generation_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_visual_generation_job(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_visual_generation_job(uuid, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.heartbeat_visual_generation_job(uuid, text, jsonb) to service_role;
grant execute on function public.complete_visual_generation_job(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.fail_visual_generation_job(uuid, text, text, jsonb) to service_role;
