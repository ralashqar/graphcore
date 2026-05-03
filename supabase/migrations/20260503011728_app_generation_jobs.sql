do $$
begin
  create type public.app_generation_job_status as enum (
    'queued',
    'running',
    'completed',
    'completed_with_errors',
    'failed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.app_generation_job_kind as enum (
    'code_generation',
    'preview_build'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.app_generated_file_kind as enum (
    'config',
    'route',
    'screen',
    'component',
    'hook',
    'adapter',
    'model',
    'test',
    'asset',
    'docs',
    'style'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.app_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  status public.app_generation_job_status not null default 'queued',
  kind public.app_generation_job_kind not null default 'code_generation',
  target_gate text not null default 'code_generated',
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

create table if not exists public.app_generation_job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.app_generation_jobs (id) on delete cascade,
  status public.app_generation_job_status not null default 'queued',
  step_key text not null,
  label text not null,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.app_generated_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  job_id uuid not null references public.app_generation_jobs (id) on delete cascade,
  path text not null,
  kind public.app_generated_file_kind not null default 'screen',
  owner_tower text not null default '',
  content text not null default '',
  content_hash text not null default '',
  exports jsonb not null default '[]'::jsonb,
  imports jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint app_generated_files_job_path_unique unique (job_id, path)
);

create index if not exists app_generation_jobs_draft_idx
  on public.app_generation_jobs (draft_id, created_at desc);

create index if not exists app_generation_jobs_status_idx
  on public.app_generation_jobs (status, heartbeat_at desc nulls last);

create index if not exists app_generation_job_steps_job_idx
  on public.app_generation_job_steps (job_id, created_at asc);

create index if not exists app_generated_files_draft_idx
  on public.app_generated_files (draft_id, created_at desc);

create index if not exists app_generated_files_job_idx
  on public.app_generated_files (job_id, path);

drop trigger if exists app_generation_jobs_set_updated_at on public.app_generation_jobs;
create trigger app_generation_jobs_set_updated_at
before update on public.app_generation_jobs
for each row execute function public.set_updated_at();

drop trigger if exists app_generation_job_steps_set_updated_at on public.app_generation_job_steps;
create trigger app_generation_job_steps_set_updated_at
before update on public.app_generation_job_steps
for each row execute function public.set_updated_at();

drop trigger if exists app_generated_files_set_updated_at on public.app_generated_files;
create trigger app_generated_files_set_updated_at
before update on public.app_generated_files
for each row execute function public.set_updated_at();

alter table public.app_generation_jobs enable row level security;
alter table public.app_generation_job_steps enable row level security;
alter table public.app_generated_files enable row level security;

drop policy if exists "app generation job read" on public.app_generation_jobs;
create policy "app generation job read" on public.app_generation_jobs
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "app generation job write" on public.app_generation_jobs;
create policy "app generation job write" on public.app_generation_jobs
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "app generation job step read" on public.app_generation_job_steps;
create policy "app generation job step read" on public.app_generation_job_steps
for select to authenticated
using (
  exists (
    select 1
    from public.app_generation_jobs job
    where job.id = app_generation_job_steps.job_id
      and app_private.can_read_draft(job.draft_id)
  )
);

drop policy if exists "app generation job step write" on public.app_generation_job_steps;
create policy "app generation job step write" on public.app_generation_job_steps
for all to authenticated
using (
  exists (
    select 1
    from public.app_generation_jobs job
    where job.id = app_generation_job_steps.job_id
      and app_private.can_edit_draft(job.draft_id)
  )
)
with check (
  exists (
    select 1
    from public.app_generation_jobs job
    where job.id = app_generation_job_steps.job_id
      and app_private.can_edit_draft(job.draft_id)
  )
);

drop policy if exists "app generated file read" on public.app_generated_files;
create policy "app generated file read" on public.app_generated_files
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "app generated file write" on public.app_generated_files;
create policy "app generated file write" on public.app_generated_files
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_generation_jobs'
  ) then
    null;
  elsif exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.app_generation_jobs;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_generation_job_steps'
  ) then
    null;
  elsif exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.app_generation_job_steps;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_generated_files'
  ) then
    null;
  elsif exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.app_generated_files;
  end if;
end
$$;
