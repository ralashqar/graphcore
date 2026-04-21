create table if not exists public.world_threads (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  title text not null,
  summary text not null default '',
  status text not null default 'open',
  priority text not null default 'secondary',
  linked_entity_keys text[] not null default '{}'::text[],
  source_turn_id uuid references public.world_prompt_turns (id) on delete set null,
  last_turn_id uuid references public.world_prompt_turns (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create index if not exists world_threads_draft_updated_idx on public.world_threads (draft_id, updated_at desc);
create index if not exists world_threads_draft_status_priority_idx on public.world_threads (draft_id, status, priority, updated_at desc);

drop trigger if exists world_threads_set_updated_at on public.world_threads;
create trigger world_threads_set_updated_at before update on public.world_threads for each row execute function public.set_updated_at();

alter table public.world_threads enable row level security;

drop policy if exists "world thread read" on public.world_threads;
create policy "world thread read" on public.world_threads
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world thread write" on public.world_threads;
create policy "world thread write" on public.world_threads
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'world_threads'
  ) then
    alter publication supabase_realtime add table public.world_threads;
  end if;
end
$$;
