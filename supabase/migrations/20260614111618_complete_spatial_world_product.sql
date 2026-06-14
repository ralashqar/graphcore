create table if not exists public.spatial_world_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  variant_id uuid not null references public.spatial_world_variants (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  operation text not null default 'validate' check (operation in ('validate', 'optimize', 'generate_lods')),
  input jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  error_message text,
  worker_id text,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz
);

create unique index if not exists spatial_world_processing_active_variant_idx
  on public.spatial_world_processing_jobs (variant_id, operation)
  where status in ('queued', 'running');
create index if not exists spatial_world_processing_claim_idx
  on public.spatial_world_processing_jobs (status, created_at asc);

drop trigger if exists spatial_world_processing_set_updated_at on public.spatial_world_processing_jobs;
create trigger spatial_world_processing_set_updated_at before update on public.spatial_world_processing_jobs
for each row execute function public.set_updated_at();

drop trigger if exists spatial_world_processing_draft_change on public.spatial_world_processing_jobs;
create trigger spatial_world_processing_draft_change after insert or update or delete on public.spatial_world_processing_jobs
for each row execute function app_private.record_draft_change('draft_id', '', 'id');

alter table public.spatial_world_processing_jobs enable row level security;
create policy "spatial processing read" on public.spatial_world_processing_jobs
for select to authenticated using (app_private.can_read_draft(draft_id));
create policy "spatial processing write" on public.spatial_world_processing_jobs
for all to authenticated using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

create or replace function public.claim_spatial_world_processing_job(worker_id text, lease_seconds integer default 300)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare claimed_job_id uuid; now_at timestamptz := timezone('utc'::text, now());
begin
  if worker_id is null or length(trim(worker_id)) = 0 then raise exception 'worker_id is required'; end if;
  with candidate as (
    select id from public.spatial_world_processing_jobs
    where status = 'queued'
       or (status = 'running' and coalesce(lease_expires_at, heartbeat_at, updated_at) < now_at)
    order by created_at asc
    for update skip locked limit 1
  )
  update public.spatial_world_processing_jobs job
  set status = 'running', worker_id = trim(claim_spatial_world_processing_job.worker_id), heartbeat_at = now_at,
      lease_expires_at = now_at + make_interval(secs => greatest(lease_seconds, 30)), attempt_count = attempt_count + 1,
      error_message = null
  from candidate where job.id = candidate.id returning job.id into claimed_job_id;
  return claimed_job_id;
end;
$$;

revoke all on function public.claim_spatial_world_processing_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_spatial_world_processing_job(text, integer) to service_role;

alter publication supabase_realtime add table public.spatial_world_processing_jobs;

create table if not exists public.spatial_world_performance_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  variant_id uuid not null references public.spatial_world_variants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  event_type text not null check (event_type in ('load', 'frame_sample', 'walk_recovery', 'webgl_error')),
  fps numeric(8, 3),
  frame_time_ms numeric(10, 3),
  load_time_ms integer,
  selected_lod_asset_key text,
  device_memory_gb numeric(8, 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);
create index if not exists spatial_world_performance_variant_idx on public.spatial_world_performance_events (variant_id, created_at desc);
alter table public.spatial_world_performance_events enable row level security;
create policy "spatial performance read" on public.spatial_world_performance_events
for select to authenticated using (app_private.can_read_draft(draft_id));
create policy "spatial performance insert" on public.spatial_world_performance_events
for insert to authenticated with check (app_private.can_read_draft(draft_id) and user_id = auth.uid());

create or replace function app_private.enforce_spatial_world_active_job_quota()
returns trigger language plpgsql set search_path = public, app_private as $$
declare active_count integer;
begin
  if new.status not in ('queued', 'submitting', 'running') then return new; end if;
  select count(*) into active_count from public.spatial_world_generation_jobs
  where draft_id = new.draft_id and status in ('queued', 'submitting', 'running');
  if active_count >= 4 then raise exception 'Spatial world generation quota reached: at most four active jobs are allowed per draft.'; end if;
  return new;
end;
$$;
drop trigger if exists spatial_world_active_job_quota on public.spatial_world_generation_jobs;
create trigger spatial_world_active_job_quota before insert on public.spatial_world_generation_jobs
for each row execute function app_private.enforce_spatial_world_active_job_quota();

create or replace function public.cleanup_spatial_world_history(retention_days integer default 90)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cutoff timestamptz := timezone('utc'::text, now()) - make_interval(days => greatest(retention_days, 7));
declare processing_deleted integer := 0; performance_deleted integer := 0; variants_archived integer := 0;
begin
  delete from public.spatial_world_processing_jobs where status in ('completed', 'failed', 'cancelled') and updated_at < cutoff;
  get diagnostics processing_deleted = row_count;
  delete from public.spatial_world_performance_events where created_at < cutoff;
  get diagnostics performance_deleted = row_count;
  update public.spatial_world_variants set status = 'archived', archived_at = timezone('utc'::text, now())
  where status = 'failed' and updated_at < cutoff and not is_active;
  get diagnostics variants_archived = row_count;
  return jsonb_build_object('processingDeleted', processing_deleted, 'performanceDeleted', performance_deleted, 'variantsArchived', variants_archived);
end;
$$;
revoke all on function public.cleanup_spatial_world_history(integer) from public, anon, authenticated;
grant execute on function public.cleanup_spatial_world_history(integer) to service_role;
