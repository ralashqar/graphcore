do $$
begin
  if not exists (select 1 from pg_type where typname = 'world_prompt_generation_job_status') then
    create type public.world_prompt_generation_job_status as enum (
      'queued',
      'running',
      'completed',
      'completed_with_errors',
      'failed',
      'cancelled'
    );
  end if;
end
$$;

create table if not exists public.world_prompt_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  session_id uuid not null references public.world_prompt_sessions (id) on delete cascade,
  turn_id uuid not null references public.world_prompt_turns (id) on delete cascade,
  kind text not null default 'initial_seed_stream',
  status public.world_prompt_generation_job_status not null default 'queued',
  attempt_count integer not null default 0,
  heartbeat_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  token_usage jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  latest_applied_op_cursor text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists world_prompt_generation_jobs_draft_idx
  on public.world_prompt_generation_jobs (draft_id, created_at desc);

create index if not exists world_prompt_generation_jobs_turn_idx
  on public.world_prompt_generation_jobs (turn_id);

create index if not exists world_prompt_generation_jobs_status_idx
  on public.world_prompt_generation_jobs (status, heartbeat_at desc nulls last);

drop trigger if exists world_prompt_generation_jobs_set_updated_at on public.world_prompt_generation_jobs;
create trigger world_prompt_generation_jobs_set_updated_at
before update on public.world_prompt_generation_jobs
for each row execute function public.set_updated_at();

alter table public.world_prompt_generation_jobs enable row level security;

drop policy if exists "world prompt generation job read" on public.world_prompt_generation_jobs;
create policy "world prompt generation job read" on public.world_prompt_generation_jobs
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world prompt generation job write" on public.world_prompt_generation_jobs;
create policy "world prompt generation job write" on public.world_prompt_generation_jobs
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
      and tablename = 'world_prompt_generation_jobs'
  ) then
    alter publication supabase_realtime add table public.world_prompt_generation_jobs;
  end if;
end
$$;
