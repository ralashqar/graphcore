create or replace function public.heartbeat_world_entity_icon_generation_job(
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
begin
  update public.world_entity_icon_generation_jobs job
  set
    heartbeat_at = now_at,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || coalesce(metadata_patch, '{}'::jsonb)
      || jsonb_build_object(
        'workerId', trim(heartbeat_world_entity_icon_generation_job.worker_id),
        'lastHeartbeatAt', now_at
      )
  where job.id = heartbeat_world_entity_icon_generation_job.job_id
    and coalesce(job.worker_id, trim(heartbeat_world_entity_icon_generation_job.worker_id))
      = trim(heartbeat_world_entity_icon_generation_job.worker_id);

  return found;
end;
$$;

create or replace function public.complete_world_entity_icon_generation_job(
  job_id uuid,
  worker_id text,
  source_grid_asset_key text,
  created_asset_keys jsonb,
  metadata_patch jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
begin
  update public.world_entity_icon_generation_jobs job
  set
    status = 'completed',
    completed_at = now_at,
    heartbeat_at = now_at,
    source_grid_asset_key = complete_world_entity_icon_generation_job.source_grid_asset_key,
    created_asset_keys = coalesce(complete_world_entity_icon_generation_job.created_asset_keys, '{}'::jsonb),
    error_message = null,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || coalesce(metadata_patch, '{}'::jsonb)
      || jsonb_build_object(
        'workerId', trim(complete_world_entity_icon_generation_job.worker_id),
        'completedAt', now_at
      )
  where job.id = complete_world_entity_icon_generation_job.job_id
    and coalesce(job.worker_id, trim(complete_world_entity_icon_generation_job.worker_id))
      = trim(complete_world_entity_icon_generation_job.worker_id);

  return found;
end;
$$;

create or replace function public.fail_world_entity_icon_generation_job(
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
begin
  update public.world_entity_icon_generation_jobs job
  set
    status = 'failed',
    completed_at = now_at,
    heartbeat_at = now_at,
    error_message = fail_world_entity_icon_generation_job.error_message,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || coalesce(metadata_patch, '{}'::jsonb)
      || jsonb_build_object(
        'workerId', trim(fail_world_entity_icon_generation_job.worker_id),
        'failedAt', now_at
      )
  where job.id = fail_world_entity_icon_generation_job.job_id
    and coalesce(job.worker_id, trim(fail_world_entity_icon_generation_job.worker_id))
      = trim(fail_world_entity_icon_generation_job.worker_id);

  return found;
end;
$$;

update public.world_entity_icon_generation_jobs
set
  status = 'queued',
  worker_id = null,
  heartbeat_at = null,
  error_message = null,
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'resetAfterRpcFixAt', timezone('utc'::text, now()),
      'resetReason', 'icon_worker_heartbeat_rpc_fix'
    )
where status = 'running'
  and provider = 'fal'
  and source_grid_asset_key is null
  and created_asset_keys = '{}'::jsonb;

revoke all on function public.heartbeat_world_entity_icon_generation_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_world_entity_icon_generation_job(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_world_entity_icon_generation_job(uuid, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.heartbeat_world_entity_icon_generation_job(uuid, text, jsonb) to service_role;
grant execute on function public.complete_world_entity_icon_generation_job(uuid, text, text, jsonb, jsonb) to service_role;
grant execute on function public.fail_world_entity_icon_generation_job(uuid, text, text, jsonb) to service_role;
