create table if not exists public.output_request_status_projections (
  request_id uuid primary key references public.output_requests(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  draft_id uuid not null references public.project_drafts(id) on delete cascade,
  workflow_id uuid references public.output_workflows(id) on delete set null,
  latest_run_id uuid references public.output_workflow_runs(id) on delete set null,
  status text not null default 'queued',
  output_kind text not null default 'unknown',
  title text not null default 'Untitled output',
  progress jsonb not null default '{}'::jsonb,
  active_node_key text,
  active_node_label text,
  latest_error text,
  artifact_keys text[] not null default '{}',
  preview_asset_keys text[] not null default '{}',
  graph_revision text not null default '',
  timeline_revision text not null default '',
  terminal boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists output_request_status_projections_draft_updated_idx
  on public.output_request_status_projections(draft_id, updated_at desc);

create index if not exists output_request_status_projections_draft_status_updated_idx
  on public.output_request_status_projections(draft_id, status, updated_at desc);

create index if not exists output_request_status_projections_workflow_idx
  on public.output_request_status_projections(workflow_id)
  where workflow_id is not null;

create index if not exists output_workflow_runs_active_draft_updated_idx
  on public.output_workflow_runs(draft_id, status, updated_at desc)
  where status in ('queued', 'running');

create index if not exists output_workflow_run_steps_active_run_updated_idx
  on public.output_workflow_run_steps(run_id, status, updated_at desc)
  where status in ('queued', 'running');

create index if not exists output_artifacts_workflow_kind_created_idx
  on public.output_artifacts(workflow_id, kind, created_at desc)
  where workflow_id is not null;

create index if not exists output_artifacts_run_kind_created_idx
  on public.output_artifacts(run_id, kind, created_at desc)
  where run_id is not null;

drop trigger if exists output_request_status_projections_set_updated_at on public.output_request_status_projections;
create trigger output_request_status_projections_set_updated_at
  before update on public.output_request_status_projections
  for each row execute function public.set_updated_at();

alter table public.output_request_status_projections enable row level security;

drop policy if exists output_request_status_projections_read on public.output_request_status_projections;
create policy output_request_status_projections_read on public.output_request_status_projections
  for select to authenticated
  using (app_private.can_read_draft(draft_id));

drop policy if exists output_request_status_projections_write on public.output_request_status_projections;
create policy output_request_status_projections_write on public.output_request_status_projections
  for all to authenticated
  using (app_private.can_edit_draft(draft_id))
  with check (app_private.can_edit_draft(draft_id));

create or replace function public.refresh_output_request_status_projection(p_request_id uuid)
returns public.output_request_status_projections
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.output_requests%rowtype;
  run_row public.output_workflow_runs%rowtype;
  workflow_updated_at timestamptz;
  nodes_updated_at timestamptz;
  edges_updated_at timestamptz;
  steps_updated_at timestamptz;
  artifacts_updated_at timestamptz;
  step_counts jsonb := '{}'::jsonb;
  total_steps integer := 0;
  running_step record;
  failed_step record;
  artifact_keys text[] := '{}';
  preview_asset_keys text[] := '{}';
  next_graph_revision text := '';
  next_timeline_revision text := '';
  projected public.output_request_status_projections%rowtype;
begin
  select *
  into request_row
  from public.output_requests
  where id = p_request_id;

  if not found then
    delete from public.output_request_status_projections where request_id = p_request_id;
    return null;
  end if;

  if request_row.latest_run_id is not null then
    select *
    into run_row
    from public.output_workflow_runs
    where id = request_row.latest_run_id;
  elsif request_row.workflow_id is not null then
    select *
    into run_row
    from public.output_workflow_runs
    where workflow_id = request_row.workflow_id
      and draft_id = request_row.draft_id
    order by created_at desc
    limit 1;
  end if;

  if run_row.id is not null then
    select
      count(*)::integer,
      jsonb_build_object(
        'queued', count(*) filter (where status = 'queued'),
        'running', count(*) filter (where status = 'running'),
        'completed', count(*) filter (where status = 'completed'),
        'completedWithErrors', count(*) filter (where status = 'completed_with_errors'),
        'failed', count(*) filter (where status = 'failed'),
        'cancelled', count(*) filter (where status = 'cancelled')
      )
    into total_steps, step_counts
    from public.output_workflow_run_steps
    where run_id = run_row.id;

    select node_key, label
    into running_step
    from public.output_workflow_run_steps
    where run_id = run_row.id
      and status = 'running'
    order by updated_at desc, order_index asc
    limit 1;

    select node_key, label, error_message
    into failed_step
    from public.output_workflow_run_steps
    where run_id = run_row.id
      and status = 'failed'
      and error_message is not null
    order by updated_at desc, order_index asc
    limit 1;

    select max(updated_at)
    into steps_updated_at
    from public.output_workflow_run_steps
    where run_id = run_row.id;
  end if;

  if request_row.workflow_id is not null then
    select updated_at into workflow_updated_at from public.output_workflows where id = request_row.workflow_id;
    select max(updated_at) into nodes_updated_at from public.output_workflow_nodes where workflow_id = request_row.workflow_id;
    select max(updated_at) into edges_updated_at from public.output_workflow_edges where workflow_id = request_row.workflow_id;
  end if;

  select
    coalesce(array_agg(key order by created_at desc) filter (where key is not null), '{}')::text[],
    coalesce(array_agg(asset_key order by created_at desc) filter (where asset_key is not null), '{}')::text[],
    max(updated_at)
  into artifact_keys, preview_asset_keys, artifacts_updated_at
  from public.output_artifacts
  where draft_id = request_row.draft_id
    and (
      (request_row.workflow_id is not null and workflow_id = request_row.workflow_id)
      or (run_row.id is not null and run_id = run_row.id)
    );

  next_graph_revision := md5(jsonb_build_object(
    'workflow', request_row.workflow_id,
    'run', run_row.id,
    'workflowUpdatedAt', workflow_updated_at,
    'nodesUpdatedAt', nodes_updated_at,
    'edgesUpdatedAt', edges_updated_at,
    'stepsUpdatedAt', steps_updated_at,
    'artifactsUpdatedAt', artifacts_updated_at,
    'requestUpdatedAt', request_row.updated_at,
    'status', coalesce(run_row.status::text, request_row.status)
  )::text);

  next_timeline_revision := md5(jsonb_build_object(
    'workflow', request_row.workflow_id,
    'run', run_row.id,
    'artifactsUpdatedAt', artifacts_updated_at,
    'stepsUpdatedAt', steps_updated_at,
    'artifactKeys', artifact_keys,
    'previewAssetKeys', preview_asset_keys
  )::text);

  insert into public.output_request_status_projections (
    request_id,
    project_id,
    draft_id,
    workflow_id,
    latest_run_id,
    status,
    output_kind,
    title,
    progress,
    active_node_key,
    active_node_label,
    latest_error,
    artifact_keys,
    preview_asset_keys,
    graph_revision,
    timeline_revision,
    terminal,
    metadata,
    created_at,
    updated_at
  )
  values (
    request_row.id,
    request_row.project_id,
    request_row.draft_id,
    request_row.workflow_id,
    coalesce(request_row.latest_run_id, run_row.id),
    coalesce(run_row.status::text, request_row.status),
    request_row.output_kind,
    request_row.title,
    jsonb_build_object(
      'totalSteps', coalesce(total_steps, 0),
      'steps', coalesce(step_counts, '{}'::jsonb),
      'runStatus', run_row.status,
      'requestStatus', request_row.status
    ),
    running_step.node_key,
    running_step.label,
    coalesce(request_row.error_message, run_row.error_message, failed_step.error_message),
    coalesce(artifact_keys, '{}'),
    coalesce(preview_asset_keys, '{}'),
    next_graph_revision,
    next_timeline_revision,
    coalesce(run_row.status::text, request_row.status) in ('completed', 'completed_with_errors', 'failed', 'cancelled'),
    jsonb_build_object(
      'projectionVersion', 1,
      'refreshedAt', timezone('utc'::text, now()),
      'workflowUpdatedAt', workflow_updated_at,
      'nodesUpdatedAt', nodes_updated_at,
      'edgesUpdatedAt', edges_updated_at,
      'stepsUpdatedAt', steps_updated_at,
      'artifactsUpdatedAt', artifacts_updated_at
    ),
    request_row.created_at,
    timezone('utc'::text, now())
  )
  on conflict (request_id) do update
  set
    project_id = excluded.project_id,
    draft_id = excluded.draft_id,
    workflow_id = excluded.workflow_id,
    latest_run_id = excluded.latest_run_id,
    status = excluded.status,
    output_kind = excluded.output_kind,
    title = excluded.title,
    progress = excluded.progress,
    active_node_key = excluded.active_node_key,
    active_node_label = excluded.active_node_label,
    latest_error = excluded.latest_error,
    artifact_keys = excluded.artifact_keys,
    preview_asset_keys = excluded.preview_asset_keys,
    graph_revision = excluded.graph_revision,
    timeline_revision = excluded.timeline_revision,
    terminal = excluded.terminal,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at
  returning * into projected;

  return projected;
end
$$;

revoke all on function public.refresh_output_request_status_projection(uuid) from anon, authenticated;
grant execute on function public.refresh_output_request_status_projection(uuid) to service_role;

create or replace function public.refresh_output_request_status_projection_for_request_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.output_request_status_projections where request_id = old.id;
    return old;
  end if;
  perform public.refresh_output_request_status_projection(new.id);
  return new;
end
$$;

create or replace function public.refresh_output_request_status_projection_for_run_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
  touched_run_id uuid := coalesce(new.id, old.id);
  touched_workflow_id uuid := coalesce(new.workflow_id, old.workflow_id);
begin
  if tg_op = 'UPDATE'
    and old.status is not distinct from new.status
    and old.error_message is not distinct from new.error_message
    and old.completed_at is not distinct from new.completed_at
    and old.started_at is not distinct from new.started_at
  then
    return new;
  end if;

  for request_id in
    select id
    from public.output_requests
    where latest_run_id = touched_run_id
       or (touched_workflow_id is not null and output_requests.workflow_id = touched_workflow_id)
  loop
    perform public.refresh_output_request_status_projection(request_id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create or replace function public.refresh_output_request_status_projection_for_step_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
  touched_run_id uuid := coalesce(new.run_id, old.run_id);
  touched_workflow_id uuid := coalesce(new.workflow_id, old.workflow_id);
begin
  if tg_op = 'UPDATE'
    and old.status is not distinct from new.status
    and old.output_hash is not distinct from new.output_hash
    and old.error_message is not distinct from new.error_message
    and old.completed_at is not distinct from new.completed_at
    and old.started_at is not distinct from new.started_at
  then
    return new;
  end if;

  for request_id in
    select id
    from public.output_requests
    where latest_run_id = touched_run_id
       or (touched_workflow_id is not null and output_requests.workflow_id = touched_workflow_id)
  loop
    perform public.refresh_output_request_status_projection(request_id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create or replace function public.refresh_output_request_status_projection_for_artifact_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
  touched_run_id uuid := coalesce(new.run_id, old.run_id);
  touched_workflow_id uuid := coalesce(new.workflow_id, old.workflow_id);
begin
  for request_id in
    select id
    from public.output_requests
    where (touched_run_id is not null and latest_run_id = touched_run_id)
       or (touched_workflow_id is not null and output_requests.workflow_id = touched_workflow_id)
  loop
    perform public.refresh_output_request_status_projection(request_id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists output_requests_projection_refresh on public.output_requests;
create trigger output_requests_projection_refresh
  after insert or update or delete on public.output_requests
  for each row execute function public.refresh_output_request_status_projection_for_request_trigger();

drop trigger if exists output_workflow_runs_projection_refresh on public.output_workflow_runs;
create trigger output_workflow_runs_projection_refresh
  after insert or update or delete on public.output_workflow_runs
  for each row execute function public.refresh_output_request_status_projection_for_run_trigger();

drop trigger if exists output_workflow_run_steps_projection_refresh on public.output_workflow_run_steps;
create trigger output_workflow_run_steps_projection_refresh
  after insert or update or delete on public.output_workflow_run_steps
  for each row execute function public.refresh_output_request_status_projection_for_step_trigger();

drop trigger if exists output_artifacts_projection_refresh on public.output_artifacts;
create trigger output_artifacts_projection_refresh
  after insert or update or delete on public.output_artifacts
  for each row execute function public.refresh_output_request_status_projection_for_artifact_trigger();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'output_request_status_projections'
    ) then
      alter publication supabase_realtime add table public.output_request_status_projections;
    end if;
  end if;
end
$$;

insert into public.output_request_status_projections (
  request_id,
  project_id,
  draft_id,
  workflow_id,
  latest_run_id,
  status,
  output_kind,
  title,
  latest_error,
  graph_revision,
  timeline_revision,
  terminal,
  created_at,
  updated_at
)
select
  id,
  project_id,
  draft_id,
  workflow_id,
  latest_run_id,
  status,
  output_kind,
  title,
  error_message,
  md5(jsonb_build_object('request', id, 'updatedAt', updated_at, 'status', status)::text),
  md5(jsonb_build_object('request', id, 'updatedAt', updated_at, 'latestRunId', latest_run_id)::text),
  status in ('completed', 'completed_with_errors', 'failed', 'cancelled'),
  created_at,
  timezone('utc'::text, now())
from public.output_requests
on conflict (request_id) do nothing;
