create table if not exists public.output_request_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  request_id uuid not null references public.output_requests (id) on delete cascade,
  workflow_id uuid references public.output_workflows (id) on delete set null,
  run_id uuid references public.output_workflow_runs (id) on delete set null,
  sequence integer not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (request_id, sequence)
);

create index if not exists output_request_events_request_idx
  on public.output_request_events (request_id, sequence asc);

create index if not exists output_request_events_draft_idx
  on public.output_request_events (draft_id, created_at asc);

alter table public.output_request_events enable row level security;

drop policy if exists "output request event read" on public.output_request_events;
create policy "output request event read" on public.output_request_events
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "output request event write" on public.output_request_events;
create policy "output request event write" on public.output_request_events
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'output_request_events'
  ) then
    alter publication supabase_realtime add table public.output_request_events;
  end if;
end
$$;
