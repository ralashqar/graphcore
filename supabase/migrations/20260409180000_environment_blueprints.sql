create table if not exists public.draft_environment_blueprints (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  environment_key text not null,
  name text not null,
  document jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create index if not exists draft_environment_blueprints_draft_idx on public.draft_environment_blueprints (draft_id);

drop trigger if exists draft_environment_blueprints_set_updated_at on public.draft_environment_blueprints;
create trigger draft_environment_blueprints_set_updated_at before update on public.draft_environment_blueprints for each row execute function public.set_updated_at();

alter table public.draft_environment_blueprints enable row level security;

drop policy if exists "environment blueprint read" on public.draft_environment_blueprints;
create policy "environment blueprint read" on public.draft_environment_blueprints
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "environment blueprint write" on public.draft_environment_blueprints;
create policy "environment blueprint write" on public.draft_environment_blueprints
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));
