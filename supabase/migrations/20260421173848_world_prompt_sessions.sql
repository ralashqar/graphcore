create table if not exists public.world_prompt_sessions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  title text not null,
  status text not null default 'active',
  is_active boolean not null default true,
  summary_memory text not null default '',
  last_context jsonb not null default '{}'::jsonb,
  selected_root_entity_key text,
  selected_view_key text,
  model text not null default 'gpt-5.4-mini',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create table if not exists public.world_prompt_turns (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  session_id uuid not null references public.world_prompt_sessions (id) on delete cascade,
  prompt text not null,
  status text not null default 'queued',
  model text not null default 'gpt-5.4-mini',
  resolved_context jsonb not null default '{}'::jsonb,
  approval_state text not null default 'not_required',
  assistant_summary text not null default '',
  error_message text,
  response_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.world_prompt_messages (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  session_id uuid not null references public.world_prompt_sessions (id) on delete cascade,
  turn_id uuid references public.world_prompt_turns (id) on delete set null,
  role text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.world_prompt_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  session_id uuid not null references public.world_prompt_sessions (id) on delete cascade,
  turn_id uuid not null references public.world_prompt_turns (id) on delete cascade,
  sequence integer not null,
  event_type text not null,
  op_id text,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (turn_id, sequence)
);

create index if not exists world_prompt_sessions_draft_idx on public.world_prompt_sessions (draft_id, is_active, updated_at desc);
create index if not exists world_prompt_turns_draft_idx on public.world_prompt_turns (draft_id, created_at desc);
create index if not exists world_prompt_turns_session_idx on public.world_prompt_turns (session_id, created_at desc);
create index if not exists world_prompt_messages_session_idx on public.world_prompt_messages (session_id, created_at asc);
create index if not exists world_prompt_messages_turn_idx on public.world_prompt_messages (turn_id, created_at asc);
create index if not exists world_prompt_events_draft_idx on public.world_prompt_events (draft_id, created_at asc);
create index if not exists world_prompt_events_turn_idx on public.world_prompt_events (turn_id, sequence asc);

drop trigger if exists world_prompt_sessions_set_updated_at on public.world_prompt_sessions;
create trigger world_prompt_sessions_set_updated_at before update on public.world_prompt_sessions for each row execute function public.set_updated_at();

drop trigger if exists world_prompt_turns_set_updated_at on public.world_prompt_turns;
create trigger world_prompt_turns_set_updated_at before update on public.world_prompt_turns for each row execute function public.set_updated_at();

alter table public.world_prompt_sessions enable row level security;
alter table public.world_prompt_turns enable row level security;
alter table public.world_prompt_messages enable row level security;
alter table public.world_prompt_events enable row level security;

drop policy if exists "world prompt session read" on public.world_prompt_sessions;
create policy "world prompt session read" on public.world_prompt_sessions
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world prompt session write" on public.world_prompt_sessions;
create policy "world prompt session write" on public.world_prompt_sessions
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "world prompt turn read" on public.world_prompt_turns;
create policy "world prompt turn read" on public.world_prompt_turns
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world prompt turn write" on public.world_prompt_turns;
create policy "world prompt turn write" on public.world_prompt_turns
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "world prompt message read" on public.world_prompt_messages;
create policy "world prompt message read" on public.world_prompt_messages
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world prompt message write" on public.world_prompt_messages;
create policy "world prompt message write" on public.world_prompt_messages
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "world prompt event read" on public.world_prompt_events;
create policy "world prompt event read" on public.world_prompt_events
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world prompt event write" on public.world_prompt_events;
create policy "world prompt event write" on public.world_prompt_events
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'world_prompt_sessions'
  ) then
    alter publication supabase_realtime add table public.world_prompt_sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'world_prompt_turns'
  ) then
    alter publication supabase_realtime add table public.world_prompt_turns;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'world_prompt_messages'
  ) then
    alter publication supabase_realtime add table public.world_prompt_messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'world_prompt_events'
  ) then
    alter publication supabase_realtime add table public.world_prompt_events;
  end if;
end
$$;
