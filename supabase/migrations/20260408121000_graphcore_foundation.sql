drop policy if exists "Public todos are readable" on public.todos;
drop table if exists public.todos cascade;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_role') then
    create type public.workspace_role as enum ('owner', 'editor', 'viewer');
  end if;

  if not exists (select 1 from pg_type where typname = 'visibility_scope') then
    create type public.visibility_scope as enum ('private', 'internal', 'public');
  end if;

  if not exists (select 1 from pg_type where typname = 'definition_kind') then
    create type public.definition_kind as enum ('item', 'stat', 'quest', 'character', 'location', 'market', 'narrative_flow', 'graph');
  end if;

  if not exists (select 1 from pg_type where typname = 'asset_kind') then
    create type public.asset_kind as enum ('image', 'audio', 'json', 'document', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'patch_status') then
    create type public.patch_status as enum ('draft', 'proposed', 'applied', 'rejected');
  end if;

  if not exists (select 1 from pg_type where typname = 'compile_status') then
    create type public.compile_status as enum ('queued', 'running', 'succeeded', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'release_status') then
    create type public.release_status as enum ('draft', 'published', 'archived');
  end if;
end $$;

create schema if not exists app_private;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  summary text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  llm_hints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.workspace_memberships (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (workspace_id, user_id)
);

create or replace function public.insert_workspace_owner_membership()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is not null then
    insert into public.workspace_memberships (workspace_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict (workspace_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slug text not null,
  name text not null,
  summary text not null default '',
  visibility public.visibility_scope not null default 'private',
  status text not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  llm_hints jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (workspace_id, slug)
);

create table if not exists public.project_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  version integer not null default 1,
  is_primary boolean not null default false,
  base_release_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists project_drafts_primary_per_project_idx
on public.project_drafts (project_id)
where is_primary = true;

create table if not exists public.project_definitions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  kind public.definition_kind not null,
  name text not null,
  summary text not null default '',
  status text not null default 'draft',
  tags text[] not null default '{}',
  schema_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  llm_hints jsonb not null default '{}'::jsonb,
  asset_refs jsonb not null default '[]'::jsonb,
  definition_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create table if not exists public.project_definition_components (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.project_definitions (id) on delete cascade,
  component_type text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (definition_id, component_type)
);

create table if not exists public.draft_graphs (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  name text not null,
  graph_type text not null default 'narrative_flow',
  summary text not null default '',
  entry_node_key text,
  metadata jsonb not null default '{}'::jsonb,
  llm_hints jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create table if not exists public.draft_graph_nodes (
  id uuid primary key default gen_random_uuid(),
  graph_id uuid not null references public.draft_graphs (id) on delete cascade,
  key text not null,
  node_type text not null,
  title text not null,
  position_x numeric not null default 0,
  position_y numeric not null default 0,
  body jsonb not null default '{}'::jsonb,
  condition_expr jsonb,
  effect_ops jsonb not null default '[]'::jsonb,
  ports jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (graph_id, key)
);

create table if not exists public.draft_graph_edges (
  id uuid primary key default gen_random_uuid(),
  graph_id uuid not null references public.draft_graphs (id) on delete cascade,
  key text not null,
  source_node_key text not null,
  source_port text,
  target_node_key text not null,
  target_port text,
  label text,
  condition_expr jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (graph_id, key)
);

create table if not exists public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  key text not null,
  name text not null,
  kind public.asset_kind not null,
  mime_type text not null,
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  llm_hints jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (project_id, key),
  unique (project_id, storage_path)
);

create table if not exists public.patch_sets (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  prompt text not null default '',
  summary text not null default '',
  status public.patch_status not null default 'draft',
  operations jsonb not null default '[]'::jsonb,
  diagnostics jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.compile_jobs (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  release_id uuid,
  trigger_source text not null default 'manual',
  status public.compile_status not null default 'queued',
  bundle_manifest jsonb not null default '{}'::jsonb,
  diagnostics jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  finished_at timestamptz
);

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  version text not null,
  label text not null,
  status public.release_status not null default 'published',
  manifest jsonb not null default '{}'::jsonb,
  bundle_json jsonb not null default '{}'::jsonb,
  diagnostics jsonb not null default '[]'::jsonb,
  storage_object_path text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (project_id, version)
);

alter table public.compile_jobs
  add constraint compile_jobs_release_id_fkey
  foreign key (release_id) references public.releases (id) on delete set null;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  draft_id uuid references public.project_drafts (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.draft_presence (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null default 'draft',
  entity_key text,
  cursor jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default timezone('utc'::text, now()) + interval '5 minutes',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create or replace function app_private.role_rank(input_role public.workspace_role)
returns integer
language sql
stable
set search_path = public
as $$
  select case input_role
    when 'owner' then 3
    when 'editor' then 2
    when 'viewer' then 1
  end;
$$;

create or replace function app_private.current_workspace_role(target_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public
as $$
  select wm.role
  from public.workspace_memberships wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = auth.uid()
  limit 1;
$$;

create or replace function app_private.can_read_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.current_workspace_role(target_workspace_id) is not null;
$$;

create or replace function app_private.can_edit_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app_private.role_rank(app_private.current_workspace_role(target_workspace_id)), 0) >= 2;
$$;

create or replace function app_private.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.current_workspace_role(target_workspace_id) = 'owner';
$$;

create or replace function app_private.project_workspace_id(target_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.workspace_id
  from public.projects p
  where p.id = target_project_id;
$$;

create or replace function app_private.draft_project_id(target_draft_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.project_id
  from public.project_drafts d
  where d.id = target_draft_id;
$$;

create or replace function app_private.definition_draft_id(target_definition_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.id
  from public.project_definitions pd
  join public.project_drafts d on d.id = pd.draft_id
  where pd.id = target_definition_id;
$$;

create or replace function app_private.graph_draft_id(target_graph_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select g.draft_id
  from public.draft_graphs g
  where g.id = target_graph_id;
$$;

create or replace function app_private.can_read_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.can_read_workspace(app_private.project_workspace_id(target_project_id));
$$;

create or replace function app_private.can_edit_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.can_edit_workspace(app_private.project_workspace_id(target_project_id));
$$;

create or replace function app_private.can_read_draft(target_draft_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.can_read_project(app_private.draft_project_id(target_draft_id));
$$;

create or replace function app_private.can_edit_draft(target_draft_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.can_edit_project(app_private.draft_project_id(target_draft_id));
$$;

create index if not exists project_definitions_draft_idx on public.project_definitions (draft_id);
create index if not exists draft_graphs_draft_idx on public.draft_graphs (draft_id);
create index if not exists draft_graph_nodes_graph_idx on public.draft_graph_nodes (graph_id);
create index if not exists draft_graph_edges_graph_idx on public.draft_graph_edges (graph_id);
create index if not exists project_assets_project_idx on public.project_assets (project_id);
create index if not exists patch_sets_draft_idx on public.patch_sets (draft_id);
create index if not exists releases_project_idx on public.releases (project_id);
create index if not exists draft_presence_draft_idx on public.draft_presence (draft_id);

drop trigger if exists workspaces_set_updated_at on public.workspaces;
create trigger workspaces_set_updated_at before update on public.workspaces for each row execute function public.set_updated_at();

drop trigger if exists workspace_memberships_set_updated_at on public.workspace_memberships;
create trigger workspace_memberships_set_updated_at before update on public.workspace_memberships for each row execute function public.set_updated_at();

drop trigger if exists workspaces_insert_owner_membership on public.workspaces;
create trigger workspaces_insert_owner_membership
after insert on public.workspaces
for each row execute function public.insert_workspace_owner_membership();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();

drop trigger if exists project_drafts_set_updated_at on public.project_drafts;
create trigger project_drafts_set_updated_at before update on public.project_drafts for each row execute function public.set_updated_at();

drop trigger if exists project_definitions_set_updated_at on public.project_definitions;
create trigger project_definitions_set_updated_at before update on public.project_definitions for each row execute function public.set_updated_at();

drop trigger if exists project_definition_components_set_updated_at on public.project_definition_components;
create trigger project_definition_components_set_updated_at before update on public.project_definition_components for each row execute function public.set_updated_at();

drop trigger if exists draft_graphs_set_updated_at on public.draft_graphs;
create trigger draft_graphs_set_updated_at before update on public.draft_graphs for each row execute function public.set_updated_at();

drop trigger if exists draft_graph_nodes_set_updated_at on public.draft_graph_nodes;
create trigger draft_graph_nodes_set_updated_at before update on public.draft_graph_nodes for each row execute function public.set_updated_at();

drop trigger if exists draft_graph_edges_set_updated_at on public.draft_graph_edges;
create trigger draft_graph_edges_set_updated_at before update on public.draft_graph_edges for each row execute function public.set_updated_at();

drop trigger if exists project_assets_set_updated_at on public.project_assets;
create trigger project_assets_set_updated_at before update on public.project_assets for each row execute function public.set_updated_at();

drop trigger if exists patch_sets_set_updated_at on public.patch_sets;
create trigger patch_sets_set_updated_at before update on public.patch_sets for each row execute function public.set_updated_at();

drop trigger if exists compile_jobs_set_updated_at on public.compile_jobs;
create trigger compile_jobs_set_updated_at before update on public.compile_jobs for each row execute function public.set_updated_at();

drop trigger if exists releases_set_updated_at on public.releases;
create trigger releases_set_updated_at before update on public.releases for each row execute function public.set_updated_at();

drop trigger if exists draft_presence_set_updated_at on public.draft_presence;
create trigger draft_presence_set_updated_at before update on public.draft_presence for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.projects enable row level security;
alter table public.project_drafts enable row level security;
alter table public.project_definitions enable row level security;
alter table public.project_definition_components enable row level security;
alter table public.draft_graphs enable row level security;
alter table public.draft_graph_nodes enable row level security;
alter table public.draft_graph_edges enable row level security;
alter table public.project_assets enable row level security;
alter table public.patch_sets enable row level security;
alter table public.compile_jobs enable row level security;
alter table public.releases enable row level security;
alter table public.audit_events enable row level security;
alter table public.draft_presence enable row level security;

drop policy if exists "workspace read" on public.workspaces;
create policy "workspace read" on public.workspaces
for select to authenticated
using (app_private.can_read_workspace(id));

drop policy if exists "workspace insert" on public.workspaces;
create policy "workspace insert" on public.workspaces
for insert to authenticated
with check (auth.uid() = created_by);

drop policy if exists "workspace update" on public.workspaces;
create policy "workspace update" on public.workspaces
for update to authenticated
using (app_private.is_workspace_owner(id))
with check (app_private.is_workspace_owner(id));

drop policy if exists "workspace delete" on public.workspaces;
create policy "workspace delete" on public.workspaces
for delete to authenticated
using (app_private.is_workspace_owner(id));

drop policy if exists "membership read" on public.workspace_memberships;
create policy "membership read" on public.workspace_memberships
for select to authenticated
using (app_private.can_read_workspace(workspace_id));

drop policy if exists "membership insert" on public.workspace_memberships;
create policy "membership insert" on public.workspace_memberships
for insert to authenticated
with check (app_private.is_workspace_owner(workspace_id));

drop policy if exists "membership update" on public.workspace_memberships;
create policy "membership update" on public.workspace_memberships
for update to authenticated
using (app_private.is_workspace_owner(workspace_id))
with check (app_private.is_workspace_owner(workspace_id));

drop policy if exists "membership delete" on public.workspace_memberships;
create policy "membership delete" on public.workspace_memberships
for delete to authenticated
using (app_private.is_workspace_owner(workspace_id));

drop policy if exists "project read" on public.projects;
create policy "project read" on public.projects
for select to authenticated
using (app_private.can_read_workspace(workspace_id));

drop policy if exists "project insert" on public.projects;
create policy "project insert" on public.projects
for insert to authenticated
with check (app_private.can_edit_workspace(workspace_id));

drop policy if exists "project update" on public.projects;
create policy "project update" on public.projects
for update to authenticated
using (app_private.can_edit_workspace(workspace_id))
with check (app_private.can_edit_workspace(workspace_id));

drop policy if exists "project delete" on public.projects;
create policy "project delete" on public.projects
for delete to authenticated
using (app_private.can_edit_workspace(workspace_id));

drop policy if exists "draft read" on public.project_drafts;
create policy "draft read" on public.project_drafts
for select to authenticated
using (app_private.can_read_project(project_id));

drop policy if exists "draft write" on public.project_drafts;
create policy "draft write" on public.project_drafts
for all to authenticated
using (app_private.can_edit_project(project_id))
with check (app_private.can_edit_project(project_id));

drop policy if exists "definition read" on public.project_definitions;
create policy "definition read" on public.project_definitions
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "definition write" on public.project_definitions;
create policy "definition write" on public.project_definitions
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "component read" on public.project_definition_components;
create policy "component read" on public.project_definition_components
for select to authenticated
using (app_private.can_read_draft(app_private.definition_draft_id(definition_id)));

drop policy if exists "component write" on public.project_definition_components;
create policy "component write" on public.project_definition_components
for all to authenticated
using (app_private.can_edit_draft(app_private.definition_draft_id(definition_id)))
with check (app_private.can_edit_draft(app_private.definition_draft_id(definition_id)));

drop policy if exists "graph read" on public.draft_graphs;
create policy "graph read" on public.draft_graphs
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "graph write" on public.draft_graphs;
create policy "graph write" on public.draft_graphs
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "graph node read" on public.draft_graph_nodes;
create policy "graph node read" on public.draft_graph_nodes
for select to authenticated
using (app_private.can_read_draft(app_private.graph_draft_id(graph_id)));

drop policy if exists "graph node write" on public.draft_graph_nodes;
create policy "graph node write" on public.draft_graph_nodes
for all to authenticated
using (app_private.can_edit_draft(app_private.graph_draft_id(graph_id)))
with check (app_private.can_edit_draft(app_private.graph_draft_id(graph_id)));

drop policy if exists "graph edge read" on public.draft_graph_edges;
create policy "graph edge read" on public.draft_graph_edges
for select to authenticated
using (app_private.can_read_draft(app_private.graph_draft_id(graph_id)));

drop policy if exists "graph edge write" on public.draft_graph_edges;
create policy "graph edge write" on public.draft_graph_edges
for all to authenticated
using (app_private.can_edit_draft(app_private.graph_draft_id(graph_id)))
with check (app_private.can_edit_draft(app_private.graph_draft_id(graph_id)));

drop policy if exists "asset read" on public.project_assets;
create policy "asset read" on public.project_assets
for select to authenticated
using (app_private.can_read_project(project_id));

drop policy if exists "asset write" on public.project_assets;
create policy "asset write" on public.project_assets
for all to authenticated
using (app_private.can_edit_project(project_id))
with check (app_private.can_edit_project(project_id));

drop policy if exists "patch read" on public.patch_sets;
create policy "patch read" on public.patch_sets
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "patch write" on public.patch_sets;
create policy "patch write" on public.patch_sets
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "compile read" on public.compile_jobs;
create policy "compile read" on public.compile_jobs
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "compile write" on public.compile_jobs;
create policy "compile write" on public.compile_jobs
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "release read" on public.releases;
create policy "release read" on public.releases
for select to authenticated
using (app_private.can_read_project(project_id));

drop policy if exists "release write" on public.releases;
create policy "release write" on public.releases
for all to authenticated
using (app_private.can_edit_project(project_id))
with check (app_private.can_edit_project(project_id));

drop policy if exists "audit read" on public.audit_events;
create policy "audit read" on public.audit_events
for select to authenticated
using ((workspace_id is not null and app_private.can_read_workspace(workspace_id))
  or (project_id is not null and app_private.can_read_project(project_id))
  or (draft_id is not null and app_private.can_read_draft(draft_id)));

drop policy if exists "audit insert" on public.audit_events;
create policy "audit insert" on public.audit_events
for insert to authenticated
with check ((workspace_id is not null and app_private.can_edit_workspace(workspace_id))
  or (project_id is not null and app_private.can_edit_project(project_id))
  or (draft_id is not null and app_private.can_edit_draft(draft_id)));

drop policy if exists "presence read" on public.draft_presence;
create policy "presence read" on public.draft_presence
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "presence write" on public.draft_presence;
create policy "presence write" on public.draft_presence
for all to authenticated
using (auth.uid() = user_id and app_private.can_edit_draft(draft_id))
with check (auth.uid() = user_id and app_private.can_edit_draft(draft_id));

insert into storage.buckets (id, name, public)
values ('project-assets', 'project-assets', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('release-bundles', 'release-bundles', false)
on conflict (id) do nothing;

drop policy if exists "project assets read" on storage.objects;
create policy "project assets read" on storage.objects
for select to authenticated
using (
  bucket_id = 'project-assets'
  and exists (
    select 1
    from public.project_assets pa
    where pa.storage_path = name
      and app_private.can_read_project(pa.project_id)
  )
);

drop policy if exists "project assets write" on storage.objects;
create policy "project assets write" on storage.objects
for all to authenticated
using (
  bucket_id = 'project-assets'
  and exists (
    select 1
    from public.project_assets pa
    where pa.storage_path = name
      and app_private.can_edit_project(pa.project_id)
  )
)
with check (
  bucket_id = 'project-assets'
  and exists (
    select 1
    from public.project_assets pa
    where pa.storage_path = name
      and app_private.can_edit_project(pa.project_id)
  )
);

drop policy if exists "release bundles read" on storage.objects;
create policy "release bundles read" on storage.objects
for select to authenticated
using (
  bucket_id = 'release-bundles'
  and exists (
    select 1
    from public.releases r
    where r.storage_object_path = name
      and app_private.can_read_project(r.project_id)
  )
);

drop policy if exists "release bundles write" on storage.objects;
create policy "release bundles write" on storage.objects
for all to authenticated
using (
  bucket_id = 'release-bundles'
  and exists (
    select 1
    from public.releases r
    where r.storage_object_path = name
      and app_private.can_edit_project(r.project_id)
  )
)
with check (
  bucket_id = 'release-bundles'
  and exists (
    select 1
    from public.releases r
    where r.storage_object_path = name
      and app_private.can_edit_project(r.project_id)
  )
);
