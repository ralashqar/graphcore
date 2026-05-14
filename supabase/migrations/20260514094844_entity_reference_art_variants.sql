create table if not exists public.world_entity_visual_variants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  entity_key text not null,
  variant_key text not null,
  key text generated always as (entity_key || ':' || variant_key) stored,
  label text not null default '',
  summary text not null default '',
  variant_type text not null default 'reference_variant',
  source_variant_key text not null default 'default',
  asset_key text,
  visual_job_id uuid references public.visual_generation_jobs (id) on delete set null,
  guidance text not null default '',
  status text not null default 'pending' check (status in ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, entity_key, variant_key),
  unique (draft_id, key),
  foreign key (draft_id, entity_key) references public.world_entities (draft_id, key) on delete cascade
);

create index if not exists world_entity_visual_variants_project_idx
  on public.world_entity_visual_variants (project_id, draft_id);

create index if not exists world_entity_visual_variants_entity_idx
  on public.world_entity_visual_variants (draft_id, entity_key, created_at);

create index if not exists world_entity_visual_variants_job_idx
  on public.world_entity_visual_variants (visual_job_id)
  where visual_job_id is not null;

drop trigger if exists world_entity_visual_variants_set_updated_at on public.world_entity_visual_variants;
create trigger world_entity_visual_variants_set_updated_at
before update on public.world_entity_visual_variants
for each row execute function public.set_updated_at();

alter table public.world_entity_visual_variants enable row level security;

drop policy if exists "world entity visual variant read" on public.world_entity_visual_variants;
create policy "world entity visual variant read" on public.world_entity_visual_variants
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "world entity visual variant write" on public.world_entity_visual_variants;
create policy "world entity visual variant write" on public.world_entity_visual_variants
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop trigger if exists world_entity_visual_variants_draft_change on public.world_entity_visual_variants;
create trigger world_entity_visual_variants_draft_change
after insert or update or delete on public.world_entity_visual_variants
for each row execute function app_private.record_draft_change('draft_id', '', 'key');

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'world_entity_visual_variants'
  ) then
    alter publication supabase_realtime add table public.world_entity_visual_variants;
  end if;
end
$$;
