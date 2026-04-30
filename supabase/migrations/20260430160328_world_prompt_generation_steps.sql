create extension if not exists pgmq;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'world_prompt_generation_step_status') then
    create type public.world_prompt_generation_step_status as enum (
      'queued',
      'running',
      'completed',
      'failed',
      'skipped',
      'cancelled'
    );
  end if;
end
$$;

do $$
begin
  begin
    perform pgmq.create('world_prompt_generation');
  exception
    when duplicate_table then null;
    when unique_violation then null;
  end;
end
$$;

create or replace function public.enqueue_world_prompt_generation(message jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  queued_message_id bigint;
begin
  select pgmq.send('world_prompt_generation', message, 0) into queued_message_id;
  return queued_message_id;
end;
$$;

create or replace function public.read_world_prompt_generation()
returns table (
  msg_id bigint,
  read_ct integer,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
)
language plpgsql
security definer
set search_path = public, pgmq
as $$
begin
  return query
  select
    queue_message.msg_id,
    queue_message.read_ct::integer,
    queue_message.enqueued_at,
    queue_message.vt,
    queue_message.message
  from pgmq.read('world_prompt_generation', 180, 1) as queue_message;
end;
$$;

create or replace function public.delete_world_prompt_generation_message(message_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  deleted boolean;
begin
  select pgmq.delete('world_prompt_generation', message_id) into deleted;
  return coalesce(deleted, false);
end;
$$;

revoke all on function public.enqueue_world_prompt_generation(jsonb) from public, anon, authenticated;
revoke all on function public.read_world_prompt_generation() from public, anon, authenticated;
revoke all on function public.delete_world_prompt_generation_message(bigint) from public, anon, authenticated;
grant execute on function public.enqueue_world_prompt_generation(jsonb) to service_role;
grant execute on function public.read_world_prompt_generation() to service_role;
grant execute on function public.delete_world_prompt_generation_message(bigint) to service_role;

create table if not exists public.world_prompt_generation_job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.world_prompt_generation_jobs (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  session_id uuid not null references public.world_prompt_sessions (id) on delete cascade,
  turn_id uuid not null references public.world_prompt_turns (id) on delete cascade,
  step_key text not null,
  phase text not null,
  status public.world_prompt_generation_step_status not null default 'queued',
  attempt_count integer not null default 0,
  order_index integer not null default 0,
  heartbeat_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  token_usage jsonb not null default '{}'::jsonb,
  counts jsonb not null default '{}'::jsonb,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  latest_applied_op_cursor text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint world_prompt_generation_job_steps_phase_check
    check (phase in ('world_bible', 'core_entities', 'sequence_units', 'relationships', 'finalize')),
  constraint world_prompt_generation_job_steps_unique_key
    unique (job_id, step_key)
);

create index if not exists world_prompt_generation_job_steps_job_idx
  on public.world_prompt_generation_job_steps (job_id, order_index);

create index if not exists world_prompt_generation_job_steps_draft_idx
  on public.world_prompt_generation_job_steps (draft_id, created_at desc);

create index if not exists world_prompt_generation_job_steps_status_idx
  on public.world_prompt_generation_job_steps (status, heartbeat_at desc nulls last);

drop trigger if exists world_prompt_generation_job_steps_set_updated_at on public.world_prompt_generation_job_steps;
create trigger world_prompt_generation_job_steps_set_updated_at
before update on public.world_prompt_generation_job_steps
for each row execute function public.set_updated_at();

alter table public.world_prompt_generation_job_steps enable row level security;

drop policy if exists "world prompt generation job step read" on public.world_prompt_generation_job_steps;
create policy "world prompt generation job step read" on public.world_prompt_generation_job_steps
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world prompt generation job step write" on public.world_prompt_generation_job_steps;
create policy "world prompt generation job step write" on public.world_prompt_generation_job_steps
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
      and tablename = 'world_prompt_generation_job_steps'
  ) then
    alter publication supabase_realtime add table public.world_prompt_generation_job_steps;
  end if;
end
$$;
