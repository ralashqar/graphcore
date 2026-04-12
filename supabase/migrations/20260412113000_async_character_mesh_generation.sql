do $$
begin
  if not exists (select 1 from pg_type where typname = 'mesh_generation_job_status') then
    create type public.mesh_generation_job_status as enum ('queued', 'submitting', 'running', 'succeeded', 'failed', 'cancelled');
  end if;
end $$;

create table if not exists public.mesh_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  definition_key text not null,
  source_image_asset_key text not null,
  target_mesh_asset_key text not null,
  provider text not null default 'fal',
  model text not null default 'fal-ai/trellis-2',
  provider_request_id text,
  status public.mesh_generation_job_status not null default 'queued',
  provider_status text,
  provider_logs jsonb not null default '[]'::jsonb,
  error_message text,
  storage_path text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists mesh_generation_jobs_draft_idx on public.mesh_generation_jobs (draft_id, created_at desc);
create index if not exists mesh_generation_jobs_project_idx on public.mesh_generation_jobs (project_id, created_at desc);
create index if not exists mesh_generation_jobs_definition_idx on public.mesh_generation_jobs (draft_id, definition_key, created_at desc);
create unique index if not exists mesh_generation_jobs_active_definition_idx
on public.mesh_generation_jobs (draft_id, definition_key)
where status in ('queued', 'submitting', 'running');

drop trigger if exists mesh_generation_jobs_set_updated_at on public.mesh_generation_jobs;
create trigger mesh_generation_jobs_set_updated_at before update on public.mesh_generation_jobs for each row execute function public.set_updated_at();

alter table public.mesh_generation_jobs enable row level security;

drop policy if exists "mesh generation job read" on public.mesh_generation_jobs;
create policy "mesh generation job read" on public.mesh_generation_jobs
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "mesh generation job write" on public.mesh_generation_jobs;
create policy "mesh generation job write" on public.mesh_generation_jobs
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));
