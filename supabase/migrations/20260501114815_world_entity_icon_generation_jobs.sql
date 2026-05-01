do $$
begin
  if not exists (select 1 from pg_type where typname = 'world_entity_icon_generation_status') then
    create type public.world_entity_icon_generation_status as enum (
      'queued',
      'running',
      'completed',
      'failed',
      'cancelled'
    );
  end if;
end
$$;

create table if not exists public.world_entity_icon_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  status public.world_entity_icon_generation_status not null default 'queued',
  provider text not null default 'fal',
  model text not null default 'openai/gpt-image-2',
  grid_rows integer not null default 1 check (grid_rows between 1 and 4),
  grid_cols integer not null default 1 check (grid_cols between 1 and 4),
  entity_keys text[] not null default '{}',
  source_grid_asset_key text,
  created_asset_keys jsonb not null default '{}'::jsonb,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  requested_by uuid references auth.users (id) on delete set null,
  worker_id text,
  heartbeat_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists world_entity_icon_generation_jobs_draft_idx
  on public.world_entity_icon_generation_jobs (draft_id, created_at desc);

create index if not exists world_entity_icon_generation_jobs_status_idx
  on public.world_entity_icon_generation_jobs (status, heartbeat_at desc nulls last);

drop trigger if exists world_entity_icon_generation_jobs_set_updated_at on public.world_entity_icon_generation_jobs;
create trigger world_entity_icon_generation_jobs_set_updated_at
before update on public.world_entity_icon_generation_jobs
for each row execute function public.set_updated_at();

alter table public.world_entity_icon_generation_jobs enable row level security;

drop policy if exists "world entity icon generation job read" on public.world_entity_icon_generation_jobs;
create policy "world entity icon generation job read" on public.world_entity_icon_generation_jobs
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world entity icon generation job write" on public.world_entity_icon_generation_jobs;
create policy "world entity icon generation job write" on public.world_entity_icon_generation_jobs
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'world_entity_icon_generation_jobs'
  ) then
    alter publication supabase_realtime add table public.world_entity_icon_generation_jobs;
  end if;
end
$$;

create or replace function public.claim_world_entity_icon_generation_job(worker_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_job_id uuid;
  now_at timestamptz := timezone('utc'::text, now());
begin
  if worker_id is null or length(trim(worker_id)) = 0 then
    raise exception 'worker_id is required';
  end if;

  with candidate as (
    select id
    from public.world_entity_icon_generation_jobs
    where status = 'queued'
      or (
        status = 'running'
        and coalesce(heartbeat_at, updated_at, created_at) < now_at - interval '5 minutes'
      )
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.world_entity_icon_generation_jobs job
  set
    status = 'running',
    worker_id = trim(claim_world_entity_icon_generation_job.worker_id),
    started_at = coalesce(job.started_at, now_at),
    heartbeat_at = now_at,
    error_message = null,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || jsonb_build_object('workerId', trim(claim_world_entity_icon_generation_job.worker_id), 'claimedAt', now_at)
  from candidate
  where job.id = candidate.id
  returning job.id into claimed_job_id;

  return claimed_job_id;
end;
$$;

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
      || jsonb_build_object('workerId', trim(worker_id), 'lastHeartbeatAt', now_at)
  where job.id = heartbeat_world_entity_icon_generation_job.job_id
    and coalesce(job.worker_id, trim(worker_id)) = trim(worker_id);

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
      || jsonb_build_object('workerId', trim(worker_id), 'completedAt', now_at)
  where job.id = complete_world_entity_icon_generation_job.job_id
    and coalesce(job.worker_id, trim(worker_id)) = trim(worker_id);

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
      || jsonb_build_object('workerId', trim(worker_id), 'failedAt', now_at)
  where job.id = fail_world_entity_icon_generation_job.job_id
    and coalesce(job.worker_id, trim(worker_id)) = trim(worker_id);

  return found;
end;
$$;

revoke all on function public.claim_world_entity_icon_generation_job(text) from public, anon, authenticated;
revoke all on function public.heartbeat_world_entity_icon_generation_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_world_entity_icon_generation_job(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_world_entity_icon_generation_job(uuid, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.claim_world_entity_icon_generation_job(text) to service_role;
grant execute on function public.heartbeat_world_entity_icon_generation_job(uuid, text, jsonb) to service_role;
grant execute on function public.complete_world_entity_icon_generation_job(uuid, text, text, jsonb, jsonb) to service_role;
grant execute on function public.fail_world_entity_icon_generation_job(uuid, text, text, jsonb) to service_role;
