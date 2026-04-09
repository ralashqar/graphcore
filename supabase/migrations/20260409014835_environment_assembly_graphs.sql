create table if not exists public.draft_assembly_graphs (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  name text not null,
  summary text not null default '',
  bound_environment_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create table if not exists public.draft_assembly_nodes (
  id uuid primary key default gen_random_uuid(),
  assembly_graph_id uuid not null references public.draft_assembly_graphs (id) on delete cascade,
  key text not null,
  kind text not null,
  title text not null,
  subtitle text,
  position_x numeric not null default 0,
  position_y numeric not null default 0,
  ports jsonb not null default '[]'::jsonb,
  params jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (assembly_graph_id, key)
);

create table if not exists public.draft_assembly_edges (
  id uuid primary key default gen_random_uuid(),
  assembly_graph_id uuid not null references public.draft_assembly_graphs (id) on delete cascade,
  key text not null,
  source_node_key text not null,
  source_port text not null,
  target_node_key text not null,
  target_port text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (assembly_graph_id, key)
);

create or replace function app_private.assembly_graph_draft_id(target_graph_id uuid)
returns uuid
language sql
stable
as $$
  select g.draft_id
  from public.draft_assembly_graphs g
  where g.id = target_graph_id;
$$;

create index if not exists draft_assembly_graphs_draft_idx on public.draft_assembly_graphs (draft_id);
create index if not exists draft_assembly_nodes_graph_idx on public.draft_assembly_nodes (assembly_graph_id);
create index if not exists draft_assembly_edges_graph_idx on public.draft_assembly_edges (assembly_graph_id);

drop trigger if exists draft_assembly_graphs_set_updated_at on public.draft_assembly_graphs;
create trigger draft_assembly_graphs_set_updated_at before update on public.draft_assembly_graphs for each row execute function public.set_updated_at();

drop trigger if exists draft_assembly_nodes_set_updated_at on public.draft_assembly_nodes;
create trigger draft_assembly_nodes_set_updated_at before update on public.draft_assembly_nodes for each row execute function public.set_updated_at();

drop trigger if exists draft_assembly_edges_set_updated_at on public.draft_assembly_edges;
create trigger draft_assembly_edges_set_updated_at before update on public.draft_assembly_edges for each row execute function public.set_updated_at();

alter table public.draft_assembly_graphs enable row level security;
alter table public.draft_assembly_nodes enable row level security;
alter table public.draft_assembly_edges enable row level security;

drop policy if exists "assembly graph read" on public.draft_assembly_graphs;
create policy "assembly graph read" on public.draft_assembly_graphs
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "assembly graph write" on public.draft_assembly_graphs;
create policy "assembly graph write" on public.draft_assembly_graphs
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "assembly node read" on public.draft_assembly_nodes;
create policy "assembly node read" on public.draft_assembly_nodes
for select to authenticated
using (app_private.can_read_draft(app_private.assembly_graph_draft_id(assembly_graph_id)));

drop policy if exists "assembly node write" on public.draft_assembly_nodes;
create policy "assembly node write" on public.draft_assembly_nodes
for all to authenticated
using (app_private.can_edit_draft(app_private.assembly_graph_draft_id(assembly_graph_id)))
with check (app_private.can_edit_draft(app_private.assembly_graph_draft_id(assembly_graph_id)));

drop policy if exists "assembly edge read" on public.draft_assembly_edges;
create policy "assembly edge read" on public.draft_assembly_edges
for select to authenticated
using (app_private.can_read_draft(app_private.assembly_graph_draft_id(assembly_graph_id)));

drop policy if exists "assembly edge write" on public.draft_assembly_edges;
create policy "assembly edge write" on public.draft_assembly_edges
for all to authenticated
using (app_private.can_edit_draft(app_private.assembly_graph_draft_id(assembly_graph_id)))
with check (app_private.can_edit_draft(app_private.assembly_graph_draft_id(assembly_graph_id)));
