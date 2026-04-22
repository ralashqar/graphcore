create table if not exists public.world_prompt_suggestions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  session_id uuid not null references public.world_prompt_sessions (id) on delete cascade,
  turn_id uuid references public.world_prompt_turns (id) on delete set null,
  thread_key text,
  label text not null,
  prompt text not null,
  kind text not null,
  style text not null default 'secondary',
  source text not null default 'wave2',
  summary text,
  estimated_node_count integer,
  estimated_edge_count integer,
  will_queue_images boolean not null default false,
  will_queue_cinematics boolean not null default false,
  state text not null default 'active',
  rank integer not null default 0,
  used_turn_id uuid references public.world_prompt_turns (id) on delete set null,
  dismissed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint world_prompt_suggestions_state_check check (state in ('active', 'used', 'dismissed', 'superseded'))
);

create index if not exists world_prompt_suggestions_session_state_idx
  on public.world_prompt_suggestions (session_id, state, rank, created_at desc);
create index if not exists world_prompt_suggestions_turn_idx
  on public.world_prompt_suggestions (turn_id);

drop trigger if exists world_prompt_suggestions_set_updated_at on public.world_prompt_suggestions;
create trigger world_prompt_suggestions_set_updated_at
before update on public.world_prompt_suggestions
for each row execute function public.set_updated_at();

alter table public.world_prompt_suggestions enable row level security;

drop policy if exists "world prompt suggestion read" on public.world_prompt_suggestions;
create policy "world prompt suggestion read" on public.world_prompt_suggestions
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world prompt suggestion write" on public.world_prompt_suggestions;
create policy "world prompt suggestion write" on public.world_prompt_suggestions
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'world_prompt_suggestions'
  ) then
    alter publication supabase_realtime add table public.world_prompt_suggestions;
  end if;
end
$$;
