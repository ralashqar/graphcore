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
  active_node_key text;
  active_node_label text;
  latest_step_error text;
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
    into active_node_key, active_node_label
    from public.output_workflow_run_steps
    where run_id = run_row.id
      and status in ('running', 'failed', 'queued')
    order by
      case status
        when 'running' then 0
        when 'failed' then 1
        when 'queued' then 2
        else 3
      end,
      case when status = 'queued' then order_index end asc,
      updated_at desc,
      order_index asc
    limit 1;

    select error_message
    into latest_step_error
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
    active_node_key,
    active_node_label,
    coalesce(request_row.error_message, run_row.error_message, latest_step_error),
    coalesce(artifact_keys, '{}'),
    coalesce(preview_asset_keys, '{}'),
    next_graph_revision,
    next_timeline_revision,
    coalesce(run_row.status::text, request_row.status) in ('completed', 'completed_with_errors', 'failed', 'cancelled'),
    jsonb_build_object(
      'projectionVersion', 3,
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
