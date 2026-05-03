do $$
begin
  if not exists (select 1 from pg_type where typname = 'visual_generation_status') then
    create type public.visual_generation_status as enum (
      'queued',
      'running',
      'completed',
      'completed_with_errors',
      'failed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'visual_generation_kind') then
    create type public.visual_generation_kind as enum (
      'world_entity_icon_grid',
      'brand_atlas',
      'screen_mockup',
      'character_sheet',
      'wiki_visual',
      'app_screen_mockup'
    );
  end if;
end
$$;

create table if not exists public.visual_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  status public.visual_generation_status not null default 'queued',
  kind public.visual_generation_kind not null,
  provider text not null default 'fal',
  model text not null default 'openai/gpt-image-2',
  target_keys jsonb not null default '{}'::jsonb,
  input jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  error_message text,
  worker_id text,
  heartbeat_at timestamptz,
  attempt_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists visual_generation_jobs_draft_idx
  on public.visual_generation_jobs (draft_id, created_at desc);

create index if not exists visual_generation_jobs_status_idx
  on public.visual_generation_jobs (status, heartbeat_at desc nulls last);

create index if not exists visual_generation_jobs_kind_status_idx
  on public.visual_generation_jobs (kind, status, created_at desc);

drop trigger if exists visual_generation_jobs_set_updated_at on public.visual_generation_jobs;
create trigger visual_generation_jobs_set_updated_at
before update on public.visual_generation_jobs
for each row execute function public.set_updated_at();

alter table public.visual_generation_jobs enable row level security;

drop policy if exists "visual generation job read" on public.visual_generation_jobs;
create policy "visual generation job read" on public.visual_generation_jobs
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "visual generation job write" on public.visual_generation_jobs;
create policy "visual generation job write" on public.visual_generation_jobs
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
      and tablename = 'visual_generation_jobs'
  ) then
    alter publication supabase_realtime add table public.visual_generation_jobs;
  end if;
end
$$;

create or replace function public.claim_visual_generation_job(worker_id text)
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
  update public.visual_generation_jobs job
  set
    status = 'running',
    worker_id = trim(claim_visual_generation_job.worker_id),
    attempt_count = job.attempt_count + 1,
    started_at = coalesce(job.started_at, now_at),
    heartbeat_at = now_at,
    error_message = null,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || jsonb_build_object('workerId', trim(claim_visual_generation_job.worker_id), 'claimedAt', now_at)
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
begin
  update public.visual_generation_jobs job
  set
    heartbeat_at = now_at,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || coalesce(metadata_patch, '{}'::jsonb)
      || jsonb_build_object('workerId', trim(worker_id), 'lastHeartbeatAt', now_at)
  where job.id = heartbeat_visual_generation_job.job_id
    and coalesce(job.worker_id, trim(worker_id)) = trim(worker_id);

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
begin
  if coalesce(metadata_patch, '{}'::jsonb)->>'status' = 'completed_with_errors' then
    next_status := 'completed_with_errors';
  end if;

  update public.visual_generation_jobs job
  set
    status = next_status,
    completed_at = now_at,
    heartbeat_at = now_at,
    outputs = coalesce(complete_visual_generation_job.outputs, '{}'::jsonb),
    error_message = null,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || coalesce(metadata_patch, '{}'::jsonb)
      || jsonb_build_object('workerId', trim(worker_id), 'completedAt', now_at)
  where job.id = complete_visual_generation_job.job_id
    and coalesce(job.worker_id, trim(worker_id)) = trim(worker_id);

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
begin
  update public.visual_generation_jobs job
  set
    status = 'failed',
    completed_at = now_at,
    heartbeat_at = now_at,
    error_message = fail_visual_generation_job.error_message,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || coalesce(metadata_patch, '{}'::jsonb)
      || jsonb_build_object('workerId', trim(worker_id), 'failedAt', now_at)
  where job.id = fail_visual_generation_job.job_id
    and coalesce(job.worker_id, trim(worker_id)) = trim(worker_id);

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
begin
  update public.visual_generation_jobs job
  set
    status = 'cancelled',
    completed_at = now_at,
    heartbeat_at = now_at,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || jsonb_build_object('cancelledAt', now_at)
  where job.id = cancel_visual_generation_job.job_id
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
