alter table public.world_views
add column if not exists show_derived_layer boolean not null default true;

create table if not exists public.world_operators (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  operator_type text not null,
  input_entity_keys text[] not null default '{}',
  label text not null default '',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create table if not exists public.world_results (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  result_type text not null,
  source_operator_key text not null,
  title text not null,
  summary text not null default '',
  preview_asset_key text,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create table if not exists public.world_graph_connections (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  source_node_key text not null,
  source_node_kind text not null,
  target_node_key text not null,
  target_node_kind text not null,
  role text not null default 'input',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create index if not exists world_operators_draft_idx on public.world_operators (draft_id);
create index if not exists world_results_draft_idx on public.world_results (draft_id);
create index if not exists world_results_source_operator_idx on public.world_results (draft_id, source_operator_key);
create index if not exists world_graph_connections_draft_idx on public.world_graph_connections (draft_id);
create index if not exists world_graph_connections_source_idx on public.world_graph_connections (draft_id, source_node_key);
create index if not exists world_graph_connections_target_idx on public.world_graph_connections (draft_id, target_node_key);

drop trigger if exists world_operators_set_updated_at on public.world_operators;
create trigger world_operators_set_updated_at before update on public.world_operators for each row execute function public.set_updated_at();

drop trigger if exists world_results_set_updated_at on public.world_results;
create trigger world_results_set_updated_at before update on public.world_results for each row execute function public.set_updated_at();

drop trigger if exists world_graph_connections_set_updated_at on public.world_graph_connections;
create trigger world_graph_connections_set_updated_at before update on public.world_graph_connections for each row execute function public.set_updated_at();

alter table public.world_operators enable row level security;
alter table public.world_results enable row level security;
alter table public.world_graph_connections enable row level security;

drop policy if exists "world operator read" on public.world_operators;
create policy "world operator read" on public.world_operators
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world operator write" on public.world_operators;
create policy "world operator write" on public.world_operators
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "world result read" on public.world_results;
create policy "world result read" on public.world_results
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world result write" on public.world_results;
create policy "world result write" on public.world_results
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "world graph connection read" on public.world_graph_connections;
create policy "world graph connection read" on public.world_graph_connections
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world graph connection write" on public.world_graph_connections;
create policy "world graph connection write" on public.world_graph_connections
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));
