alter table public.project_definitions
  add column if not exists icon_asset_key text,
  add column if not exists archetype_key text;

create table if not exists public.project_archetypes (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  name text not null,
  summary text not null default '',
  definition_kind public.definition_kind not null default 'item',
  icon_asset_key text,
  metadata jsonb not null default '{}'::jsonb,
  llm_hints jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create table if not exists public.project_archetype_fields (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  archetype_id uuid references public.project_archetypes (id) on delete cascade,
  definition_id uuid references public.project_definitions (id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null,
  description text not null default '',
  required boolean not null default false,
  default_value jsonb,
  constraints jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check (
    (archetype_id is not null and definition_id is null)
    or (archetype_id is null and definition_id is not null)
  )
);

create unique index if not exists project_archetype_fields_archetype_key_idx
on public.project_archetype_fields (archetype_id, key)
where archetype_id is not null;

create unique index if not exists project_archetype_fields_definition_key_idx
on public.project_archetype_fields (definition_id, key)
where definition_id is not null;

create table if not exists public.project_definition_field_values (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.project_definitions (id) on delete cascade,
  field_key text not null,
  value jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (definition_id, field_key)
);

create or replace function app_private.archetype_draft_id(target_archetype_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.draft_id
  from public.project_archetypes a
  where a.id = target_archetype_id;
$$;

create index if not exists project_archetypes_draft_idx on public.project_archetypes (draft_id);
create index if not exists project_archetype_fields_draft_idx on public.project_archetype_fields (draft_id);
create index if not exists project_definition_field_values_definition_idx on public.project_definition_field_values (definition_id);

drop trigger if exists project_archetypes_set_updated_at on public.project_archetypes;
create trigger project_archetypes_set_updated_at before update on public.project_archetypes for each row execute function public.set_updated_at();

drop trigger if exists project_archetype_fields_set_updated_at on public.project_archetype_fields;
create trigger project_archetype_fields_set_updated_at before update on public.project_archetype_fields for each row execute function public.set_updated_at();

drop trigger if exists project_definition_field_values_set_updated_at on public.project_definition_field_values;
create trigger project_definition_field_values_set_updated_at before update on public.project_definition_field_values for each row execute function public.set_updated_at();

alter table public.project_archetypes enable row level security;
alter table public.project_archetype_fields enable row level security;
alter table public.project_definition_field_values enable row level security;

drop policy if exists "archetype read" on public.project_archetypes;
create policy "archetype read" on public.project_archetypes
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "archetype write" on public.project_archetypes;
create policy "archetype write" on public.project_archetypes
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "archetype field read" on public.project_archetype_fields;
create policy "archetype field read" on public.project_archetype_fields
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "archetype field write" on public.project_archetype_fields;
create policy "archetype field write" on public.project_archetype_fields
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "definition field value read" on public.project_definition_field_values;
create policy "definition field value read" on public.project_definition_field_values
for select to authenticated
using (app_private.can_read_draft(app_private.definition_draft_id(definition_id)));

drop policy if exists "definition field value write" on public.project_definition_field_values;
create policy "definition field value write" on public.project_definition_field_values
for all to authenticated
using (app_private.can_edit_draft(app_private.definition_draft_id(definition_id)))
with check (app_private.can_edit_draft(app_private.definition_draft_id(definition_id)));
