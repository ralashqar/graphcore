do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.asset_kind'::regtype
      and enumlabel = 'video'
  ) then
    alter type public.asset_kind add value 'video';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cinematic_run_status') then
    create type public.cinematic_run_status as enum ('queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'cinematic_run_mode') then
    create type public.cinematic_run_mode as enum ('graph_run', 'preview_still', 'preview_video');
  end if;

  if not exists (select 1 from pg_type where typname = 'cinematic_run_job_status') then
    create type public.cinematic_run_job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'skipped');
  end if;
end $$;

create table if not exists public.cinematic_runs (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  graph_key text not null,
  graph_name text not null default '',
  mode public.cinematic_run_mode not null default 'graph_run',
  status public.cinematic_run_status not null default 'queued',
  shot_node_key text,
  diagnostics jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.cinematic_run_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cinematic_runs (id) on delete cascade,
  graph_key text not null,
  shot_node_key text not null,
  kind text not null,
  status public.cinematic_run_job_status not null default 'queued',
  order_index integer not null default 0,
  depends_on_job_ids uuid[] not null default '{}'::uuid[],
  still_asset_key text,
  video_asset_key text,
  provider text,
  model text,
  provider_request_id text,
  prompt text not null default '',
  result_context jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists cinematic_runs_draft_idx on public.cinematic_runs (draft_id, created_at desc);
create index if not exists cinematic_runs_project_idx on public.cinematic_runs (project_id, created_at desc);
create index if not exists cinematic_run_jobs_run_idx on public.cinematic_run_jobs (run_id, order_index asc);

drop trigger if exists cinematic_runs_set_updated_at on public.cinematic_runs;
create trigger cinematic_runs_set_updated_at before update on public.cinematic_runs for each row execute function public.set_updated_at();

drop trigger if exists cinematic_run_jobs_set_updated_at on public.cinematic_run_jobs;
create trigger cinematic_run_jobs_set_updated_at before update on public.cinematic_run_jobs for each row execute function public.set_updated_at();

alter table public.cinematic_runs enable row level security;
alter table public.cinematic_run_jobs enable row level security;

drop policy if exists "cinematic run read" on public.cinematic_runs;
create policy "cinematic run read" on public.cinematic_runs
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "cinematic run write" on public.cinematic_runs;
create policy "cinematic run write" on public.cinematic_runs
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "cinematic run job read" on public.cinematic_run_jobs;
create policy "cinematic run job read" on public.cinematic_run_jobs
for select to authenticated
using (
  exists (
    select 1
    from public.cinematic_runs run
    where run.id = run_id
      and app_private.can_read_draft(run.draft_id)
  )
);

drop policy if exists "cinematic run job write" on public.cinematic_run_jobs;
create policy "cinematic run job write" on public.cinematic_run_jobs
for all to authenticated
using (
  exists (
    select 1
    from public.cinematic_runs run
    where run.id = run_id
      and app_private.can_edit_draft(run.draft_id)
  )
)
with check (
  exists (
    select 1
    from public.cinematic_runs run
    where run.id = run_id
      and app_private.can_edit_draft(run.draft_id)
  )
);
