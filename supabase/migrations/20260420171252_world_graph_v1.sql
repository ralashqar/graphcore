create table if not exists public.world_entities (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  name text not null,
  summary text not null default '',
  node_type text not null,
  aliases text[] not null default '{}',
  tags text[] not null default '{}',
  status text not null default 'active',
  thumbnail_asset_key text,
  linked_definition_key text,
  source text not null default 'user',
  custom_properties jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create table if not exists public.world_relationships (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  source_entity_id uuid not null references public.world_entities (id) on delete cascade,
  target_entity_id uuid not null references public.world_entities (id) on delete cascade,
  verb text not null,
  direction text not null default 'outbound',
  strength numeric,
  confidence numeric,
  source text not null default 'user',
  notes text not null default '',
  state text not null default 'confirmed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create table if not exists public.world_views (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  name text not null,
  mode text not null default 'graph',
  filters jsonb not null default '{}'::jsonb,
  search text not null default '',
  root_entity_key text,
  camera jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb,
  focus_depth integer not null default 1,
  show_suggestions boolean not null default true,
  show_labels boolean not null default true,
  node_positions jsonb not null default '{}'::jsonb,
  collapsed_state jsonb not null default '{}'::jsonb,
  sort_mode text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create index if not exists world_entities_draft_idx on public.world_entities (draft_id);
create index if not exists world_entities_linked_definition_idx on public.world_entities (draft_id, linked_definition_key);
create index if not exists world_relationships_draft_idx on public.world_relationships (draft_id);
create index if not exists world_relationships_source_idx on public.world_relationships (source_entity_id);
create index if not exists world_relationships_target_idx on public.world_relationships (target_entity_id);
create index if not exists world_views_draft_idx on public.world_views (draft_id);

drop trigger if exists world_entities_set_updated_at on public.world_entities;
create trigger world_entities_set_updated_at before update on public.world_entities for each row execute function public.set_updated_at();

drop trigger if exists world_relationships_set_updated_at on public.world_relationships;
create trigger world_relationships_set_updated_at before update on public.world_relationships for each row execute function public.set_updated_at();

drop trigger if exists world_views_set_updated_at on public.world_views;
create trigger world_views_set_updated_at before update on public.world_views for each row execute function public.set_updated_at();

alter table public.world_entities enable row level security;
alter table public.world_relationships enable row level security;
alter table public.world_views enable row level security;

drop policy if exists "world entity read" on public.world_entities;
create policy "world entity read" on public.world_entities
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world entity write" on public.world_entities;
create policy "world entity write" on public.world_entities
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "world relationship read" on public.world_relationships;
create policy "world relationship read" on public.world_relationships
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world relationship write" on public.world_relationships;
create policy "world relationship write" on public.world_relationships
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "world view read" on public.world_views;
create policy "world view read" on public.world_views
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world view write" on public.world_views;
create policy "world view write" on public.world_views
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));
