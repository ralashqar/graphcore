do $$
begin
  if not exists (select 1 from pg_type where typname = 'world_build_batch_status') then
    create type public.world_build_batch_status as enum ('planned', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'world_build_job_status') then
    create type public.world_build_job_status as enum ('queued', 'running', 'succeeded', 'failed', 'skipped');
  end if;
end $$;

create table if not exists public.world_build_batches (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  prompt text not null default '',
  request_summary text not null default '',
  plan_json jsonb not null default '[]'::jsonb,
  status public.world_build_batch_status not null default 'planned',
  diagnostics jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.world_build_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.world_build_batches (id) on delete cascade,
  plan_item_id text not null,
  kind text not null,
  status public.world_build_job_status not null default 'queued',
  depends_on_job_ids uuid[] not null default '{}'::uuid[],
  target_keys jsonb not null default '{}'::jsonb,
  prompt text not null default '',
  options jsonb not null default '{}'::jsonb,
  result_context jsonb,
  error_message text,
  order_index integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists world_build_batches_draft_idx on public.world_build_batches (draft_id, created_at desc);
create index if not exists world_build_batches_project_idx on public.world_build_batches (project_id, created_at desc);
create index if not exists world_build_jobs_batch_idx on public.world_build_jobs (batch_id, order_index asc);
create index if not exists world_build_jobs_status_idx on public.world_build_jobs (status, order_index asc);

drop trigger if exists world_build_batches_set_updated_at on public.world_build_batches;
create trigger world_build_batches_set_updated_at before update on public.world_build_batches for each row execute function public.set_updated_at();

drop trigger if exists world_build_jobs_set_updated_at on public.world_build_jobs;
create trigger world_build_jobs_set_updated_at before update on public.world_build_jobs for each row execute function public.set_updated_at();

alter table public.world_build_batches enable row level security;
alter table public.world_build_jobs enable row level security;

drop policy if exists "world build batch read" on public.world_build_batches;
create policy "world build batch read" on public.world_build_batches
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world build batch write" on public.world_build_batches;
create policy "world build batch write" on public.world_build_batches
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "world build job read" on public.world_build_jobs;
create policy "world build job read" on public.world_build_jobs
for select to authenticated
using (
  exists (
    select 1
    from public.world_build_batches batch
    where batch.id = batch_id
      and app_private.can_read_draft(batch.draft_id)
  )
);

drop policy if exists "world build job write" on public.world_build_jobs;
create policy "world build job write" on public.world_build_jobs
for all to authenticated
using (
  exists (
    select 1
    from public.world_build_batches batch
    where batch.id = batch_id
      and app_private.can_edit_draft(batch.draft_id)
  )
)
with check (
  exists (
    select 1
    from public.world_build_batches batch
    where batch.id = batch_id
      and app_private.can_edit_draft(batch.draft_id)
  )
);
