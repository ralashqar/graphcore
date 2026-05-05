create table if not exists public.output_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  draft_id uuid not null references public.project_drafts(id) on delete cascade,
  workflow_id uuid references public.output_workflows(id) on delete set null,
  latest_run_id uuid references public.output_workflow_runs(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  source_surface text not null default 'outputs',
  prompt text not null default '',
  title text not null default 'Untitled output',
  intent text not null default 'output_generation' check (intent in ('world_mutation', 'output_generation', 'answer_only', 'ambiguous')),
  output_kind text not null default 'unknown' check (output_kind in ('concept_art_image', 'poster_image', 'short_story', 'ebook_from_world', 'comic_issue_from_sequence', 'cinematic_episode', 'cinematic_trailer', 'ugc_episode', 'unknown')),
  status text not null default 'queued' check (status in ('queued', 'planning', 'awaiting_confirmation', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  selected_entity_keys text[] not null default '{}',
  selected_sequence_unit_keys text[] not null default '{}',
  page_count integer,
  target_format text not null default 'pdf',
  planner_notes text not null default '',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists output_requests_draft_status_created_idx
  on public.output_requests(draft_id, status, created_at desc);

create index if not exists output_requests_workflow_idx
  on public.output_requests(workflow_id)
  where workflow_id is not null;

create trigger set_output_requests_updated_at
  before update on public.output_requests
  for each row execute function public.set_updated_at();

alter table public.output_requests enable row level security;

drop policy if exists output_requests_read on public.output_requests;
create policy output_requests_read on public.output_requests
  for select
  using (app_private.can_read_draft(draft_id));

drop policy if exists output_requests_insert on public.output_requests;
create policy output_requests_insert on public.output_requests
  for insert
  with check (app_private.can_edit_draft(draft_id));

drop policy if exists output_requests_update on public.output_requests;
create policy output_requests_update on public.output_requests
  for update
  using (app_private.can_edit_draft(draft_id))
  with check (app_private.can_edit_draft(draft_id));

drop policy if exists output_requests_delete on public.output_requests;
create policy output_requests_delete on public.output_requests
  for delete
  using (app_private.can_edit_draft(draft_id));

alter publication supabase_realtime add table public.output_requests;
