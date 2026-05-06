do $$
begin
  create type public.output_workflow_status as enum ('draft', 'active', 'archived');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.output_workflow_node_type as enum (
    'world_context_query',
    'text_llm',
    'image_generation',
    'video_generation',
    'document_render',
    'utility_transform',
    'output_artifact'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.output_workflow_run_status as enum (
    'queued',
    'running',
    'completed',
    'completed_with_errors',
    'failed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.output_artifact_kind as enum (
    'manuscript',
    'html',
    'pdf',
    'epub',
    'docx',
    'comic_pdf',
    'video',
    'image',
    'package',
    'other'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.output_workflow_preset as enum (
    'ebook_from_world',
    'comic_issue_from_sequence',
    'cinematic_episode_from_sequence',
    'cinematic_trailer',
    'ugc_episode',
    'composite_reference'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.output_workflows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  name text not null,
  description text not null default '',
  preset public.output_workflow_preset not null default 'ebook_from_world',
  status public.output_workflow_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create table if not exists public.output_workflow_nodes (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.output_workflows (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  node_type public.output_workflow_node_type not null,
  label text not null,
  position jsonb not null default '{"x":0,"y":0}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  inputs jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  dirty boolean not null default true,
  input_hash text not null default '',
  output_hash text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (workflow_id, key)
);

create table if not exists public.output_workflow_edges (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.output_workflows (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  key text not null,
  source_node_key text not null,
  source_port text not null,
  target_node_key text not null,
  target_port text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (workflow_id, key)
);

create table if not exists public.output_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  workflow_id uuid not null references public.output_workflows (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  status public.output_workflow_run_status not null default 'queued',
  preset public.output_workflow_preset not null default 'ebook_from_world',
  prompt text not null default '',
  target_format text not null default 'pdf',
  world_snapshot_fingerprint text not null default '',
  input jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  error_message text,
  worker_id text,
  heartbeat_at timestamptz,
  attempt_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.output_workflow_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.output_workflow_runs (id) on delete cascade,
  workflow_id uuid not null references public.output_workflows (id) on delete cascade,
  node_id uuid references public.output_workflow_nodes (id) on delete set null,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  node_key text not null,
  node_type public.output_workflow_node_type not null,
  status public.output_workflow_run_status not null default 'queued',
  order_index integer not null default 0,
  label text not null,
  input_hash text not null default '',
  output_hash text not null default '',
  outputs jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  provider_request_id text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (run_id, node_key)
);

create table if not exists public.output_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  workflow_id uuid references public.output_workflows (id) on delete set null,
  run_id uuid references public.output_workflow_runs (id) on delete set null,
  node_id uuid references public.output_workflow_nodes (id) on delete set null,
  key text not null,
  name text not null,
  kind public.output_artifact_kind not null default 'other',
  asset_key text,
  mime_type text not null default '',
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (draft_id, key)
);

create index if not exists output_workflows_draft_idx on public.output_workflows (draft_id, created_at desc);
create index if not exists output_workflow_nodes_workflow_idx on public.output_workflow_nodes (workflow_id, created_at asc);
create index if not exists output_workflow_edges_workflow_idx on public.output_workflow_edges (workflow_id, created_at asc);
create index if not exists output_workflow_runs_draft_idx on public.output_workflow_runs (draft_id, created_at desc);
create index if not exists output_workflow_runs_status_idx on public.output_workflow_runs (status, heartbeat_at desc nulls last);
create index if not exists output_workflow_run_steps_run_idx on public.output_workflow_run_steps (run_id, order_index asc);
create index if not exists output_artifacts_draft_idx on public.output_artifacts (draft_id, created_at desc);

drop trigger if exists output_workflows_set_updated_at on public.output_workflows;
create trigger output_workflows_set_updated_at before update on public.output_workflows for each row execute function public.set_updated_at();

drop trigger if exists output_workflow_nodes_set_updated_at on public.output_workflow_nodes;
create trigger output_workflow_nodes_set_updated_at before update on public.output_workflow_nodes for each row execute function public.set_updated_at();

drop trigger if exists output_workflow_edges_set_updated_at on public.output_workflow_edges;
create trigger output_workflow_edges_set_updated_at before update on public.output_workflow_edges for each row execute function public.set_updated_at();

drop trigger if exists output_workflow_runs_set_updated_at on public.output_workflow_runs;
create trigger output_workflow_runs_set_updated_at before update on public.output_workflow_runs for each row execute function public.set_updated_at();

drop trigger if exists output_workflow_run_steps_set_updated_at on public.output_workflow_run_steps;
create trigger output_workflow_run_steps_set_updated_at before update on public.output_workflow_run_steps for each row execute function public.set_updated_at();

drop trigger if exists output_artifacts_set_updated_at on public.output_artifacts;
create trigger output_artifacts_set_updated_at before update on public.output_artifacts for each row execute function public.set_updated_at();

alter table public.output_workflows enable row level security;
alter table public.output_workflow_nodes enable row level security;
alter table public.output_workflow_edges enable row level security;
alter table public.output_workflow_runs enable row level security;
alter table public.output_workflow_run_steps enable row level security;
alter table public.output_artifacts enable row level security;

drop policy if exists "output workflow read" on public.output_workflows;
create policy "output workflow read" on public.output_workflows
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "output workflow write" on public.output_workflows;
create policy "output workflow write" on public.output_workflows
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "output workflow node read" on public.output_workflow_nodes;
create policy "output workflow node read" on public.output_workflow_nodes
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "output workflow node write" on public.output_workflow_nodes;
create policy "output workflow node write" on public.output_workflow_nodes
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "output workflow edge read" on public.output_workflow_edges;
create policy "output workflow edge read" on public.output_workflow_edges
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "output workflow edge write" on public.output_workflow_edges;
create policy "output workflow edge write" on public.output_workflow_edges
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "output workflow run read" on public.output_workflow_runs;
create policy "output workflow run read" on public.output_workflow_runs
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "output workflow run write" on public.output_workflow_runs;
create policy "output workflow run write" on public.output_workflow_runs
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "output workflow run step read" on public.output_workflow_run_steps;
create policy "output workflow run step read" on public.output_workflow_run_steps
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "output workflow run step write" on public.output_workflow_run_steps;
create policy "output workflow run step write" on public.output_workflow_run_steps
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

drop policy if exists "output artifact read" on public.output_artifacts;
create policy "output artifact read" on public.output_artifacts
for select to authenticated
using (app_private.can_read_draft(draft_id));

drop policy if exists "output artifact write" on public.output_artifacts;
create policy "output artifact write" on public.output_artifacts
for all to authenticated
using (app_private.can_edit_draft(draft_id))
with check (app_private.can_edit_draft(draft_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'output_workflow_runs') then
      alter publication supabase_realtime add table public.output_workflow_runs;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'output_workflow_run_steps') then
      alter publication supabase_realtime add table public.output_workflow_run_steps;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'output_artifacts') then
      alter publication supabase_realtime add table public.output_artifacts;
    end if;
  end if;
end
$$;

create or replace function public.claim_output_workflow_run(worker_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_run_id uuid;
  now_at timestamptz := timezone('utc'::text, now());
  p_worker_id text := trim(claim_output_workflow_run.worker_id);
begin
  if p_worker_id is null or length(p_worker_id) = 0 then
    raise exception 'worker_id is required';
  end if;

  with candidate as (
    select id
    from public.output_workflow_runs
    where status = 'queued'
      or (
        status = 'running'
        and coalesce(heartbeat_at, updated_at, created_at) < now_at - interval '5 minutes'
      )
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.output_workflow_runs as run
  set
    status = 'running',
    worker_id = p_worker_id,
    attempt_count = run.attempt_count + 1,
    started_at = coalesce(run.started_at, now_at),
    heartbeat_at = now_at,
    error_message = null,
    metadata = coalesce(run.metadata, '{}'::jsonb)
      || jsonb_build_object('workerId', p_worker_id, 'claimedAt', now_at)
  from candidate
  where run.id = candidate.id
  returning run.id into claimed_run_id;

  return claimed_run_id;
end;
$$;

create or replace function public.heartbeat_output_workflow_run(
  run_id uuid,
  worker_id text,
  metadata_patch jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  p_run_id uuid := heartbeat_output_workflow_run.run_id;
  p_worker_id text := trim(heartbeat_output_workflow_run.worker_id);
begin
  update public.output_workflow_runs as run
  set
    heartbeat_at = now_at,
    metadata = coalesce(run.metadata, '{}'::jsonb)
      || coalesce(metadata_patch, '{}'::jsonb)
      || jsonb_build_object('workerId', p_worker_id, 'lastHeartbeatAt', now_at)
  where run.id = p_run_id
    and run.status = 'running'
    and coalesce(run.worker_id, p_worker_id) = p_worker_id;

  return found;
end;
$$;

create or replace function public.complete_output_workflow_run(
  run_id uuid,
  worker_id text,
  outputs jsonb,
  metadata_patch jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  next_status public.output_workflow_run_status := 'completed';
  p_run_id uuid := complete_output_workflow_run.run_id;
  p_worker_id text := trim(complete_output_workflow_run.worker_id);
begin
  if coalesce(metadata_patch, '{}'::jsonb)->>'status' = 'completed_with_errors' then
    next_status := 'completed_with_errors';
  end if;

  update public.output_workflow_runs as run
  set
    status = next_status,
    completed_at = now_at,
    heartbeat_at = now_at,
    outputs = coalesce(complete_output_workflow_run.outputs, '{}'::jsonb),
    error_message = null,
    metadata = coalesce(run.metadata, '{}'::jsonb)
      || coalesce(metadata_patch, '{}'::jsonb)
      || jsonb_build_object('workerId', p_worker_id, 'completedAt', now_at)
  where run.id = p_run_id
    and run.status = 'running'
    and coalesce(run.worker_id, p_worker_id) = p_worker_id;

  return found;
end;
$$;

create or replace function public.fail_output_workflow_run(
  run_id uuid,
  worker_id text,
  error_message text,
  metadata_patch jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  p_run_id uuid := fail_output_workflow_run.run_id;
  p_worker_id text := trim(fail_output_workflow_run.worker_id);
begin
  update public.output_workflow_runs as run
  set
    status = 'failed',
    completed_at = now_at,
    heartbeat_at = now_at,
    error_message = fail_output_workflow_run.error_message,
    metadata = coalesce(run.metadata, '{}'::jsonb)
      || coalesce(metadata_patch, '{}'::jsonb)
      || jsonb_build_object('workerId', p_worker_id, 'failedAt', now_at)
  where run.id = p_run_id
    and run.status = 'running'
    and coalesce(run.worker_id, p_worker_id) = p_worker_id;

  update public.output_workflow_run_steps as step
  set
    status = 'failed',
    completed_at = now_at,
    error_message = fail_output_workflow_run.error_message
  where step.run_id = p_run_id
    and step.status in ('queued', 'running');

  return found;
end;
$$;

create or replace function public.cancel_output_workflow_run(run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  p_run_id uuid := cancel_output_workflow_run.run_id;
begin
  update public.output_workflow_runs as run
  set
    status = 'cancelled',
    completed_at = now_at,
    heartbeat_at = now_at,
    metadata = coalesce(run.metadata, '{}'::jsonb)
      || jsonb_build_object('cancelledAt', now_at)
  where run.id = p_run_id
    and run.status in ('queued', 'running')
    and (
      auth.role() = 'service_role'
      or app_private.can_edit_draft(run.draft_id)
    );

  update public.output_workflow_run_steps as step
  set
    status = 'cancelled',
    completed_at = now_at
  where step.run_id = p_run_id
    and step.status in ('queued', 'running');

  return found;
end;
$$;

revoke all on function public.claim_output_workflow_run(text) from public, anon, authenticated;
revoke all on function public.heartbeat_output_workflow_run(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.complete_output_workflow_run(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_output_workflow_run(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.cancel_output_workflow_run(uuid) from public, anon, authenticated;

grant execute on function public.claim_output_workflow_run(text) to service_role;
grant execute on function public.heartbeat_output_workflow_run(uuid, text, jsonb) to service_role;
grant execute on function public.complete_output_workflow_run(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.fail_output_workflow_run(uuid, text, text, jsonb) to service_role;
grant execute on function public.cancel_output_workflow_run(uuid) to service_role;
grant execute on function public.cancel_output_workflow_run(uuid) to authenticated;
