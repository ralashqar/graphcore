create or replace function public.ensure_sequence_animatic_child_workflow(
  p_project_id uuid,
  p_draft_id uuid,
  p_parent_request_id uuid,
  p_role text,
  p_identity_key text,
  p_identity_value text,
  p_workflow jsonb,
  p_nodes jsonb,
  p_edges jsonb,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_request public.output_requests%rowtype;
  ensured_request public.output_requests%rowtype;
  ensured_workflow public.output_workflows%rowtype;
  node_item jsonb;
  edge_item jsonb;
  created_request boolean := false;
begin
  if p_project_id is null or p_draft_id is null or p_parent_request_id is null then
    raise exception 'project_id, draft_id, and parent_request_id are required';
  end if;

  if coalesce(nullif(p_role, ''), '') = '' then
    raise exception 'role is required';
  end if;

  select *
    into existing_request
  from public.output_requests
  where project_id = p_project_id
    and draft_id = p_draft_id
    and parent_request_id = p_parent_request_id
    and coalesce((metadata ->> 'sequenceAnimaticStale')::boolean, false) = false
    and coalesce(metadata ->> 'screenplayAnimaticRole', metadata ->> 'sequenceAnimaticRole') = p_role
    and (
      coalesce(nullif(p_identity_key, ''), '') = ''
      or metadata ->> p_identity_key = p_identity_value
    )
  order by created_at asc
  limit 1
  for update;

  if existing_request.id is not null then
    if existing_request.workflow_id is not null then
      select * into ensured_workflow
      from public.output_workflows
      where id = existing_request.workflow_id;
    end if;

    perform public.refresh_output_request_status_projection(existing_request.id);

    return jsonb_build_object(
      'ok', true,
      'created', false,
      'reused', true,
      'request', to_jsonb(existing_request),
      'workflow', case when ensured_workflow.id is null then null else to_jsonb(ensured_workflow) end,
      'nodes', coalesce((
        select jsonb_agg(to_jsonb(n) order by n.created_at asc)
        from public.output_workflow_nodes n
        where n.workflow_id = existing_request.workflow_id
      ), '[]'::jsonb),
      'edges', coalesce((
        select jsonb_agg(to_jsonb(e) order by e.created_at asc)
        from public.output_workflow_edges e
        where e.workflow_id = existing_request.workflow_id
      ), '[]'::jsonb)
    );
  end if;

  insert into public.output_workflows (
    project_id,
    draft_id,
    key,
    name,
    description,
    preset,
    status,
    created_by,
    metadata
  )
  values (
    p_project_id,
    p_draft_id,
    p_workflow ->> 'key',
    coalesce(nullif(p_workflow ->> 'name', ''), 'Sequence Animatic Child Workflow'),
    coalesce(p_workflow ->> 'description', ''),
    coalesce(nullif(p_workflow ->> 'preset', ''), 'cinematic_episode_from_sequence')::public.output_workflow_preset,
    coalesce(nullif(p_workflow ->> 'status', ''), 'active')::public.output_workflow_status,
    nullif(p_workflow ->> 'created_by', '')::uuid,
    coalesce(p_workflow -> 'metadata', '{}'::jsonb)
  )
  on conflict (draft_id, key) do update
    set name = excluded.name,
        description = excluded.description,
        preset = excluded.preset,
        status = excluded.status,
        metadata = excluded.metadata
  returning * into ensured_workflow;

  for node_item in select value from jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb))
  loop
    insert into public.output_workflow_nodes (
      workflow_id,
      draft_id,
      key,
      node_type,
      label,
      position,
      config,
      inputs,
      outputs,
      dirty,
      input_hash,
      output_hash,
      metadata
    )
    values (
      ensured_workflow.id,
      p_draft_id,
      node_item ->> 'key',
      (node_item ->> 'node_type')::public.output_workflow_node_type,
      coalesce(nullif(node_item ->> 'label', ''), node_item ->> 'key'),
      coalesce(node_item -> 'position', '{"x":0,"y":0}'::jsonb),
      coalesce(node_item -> 'config', '{}'::jsonb),
      coalesce(node_item -> 'inputs', '{}'::jsonb),
      coalesce(node_item -> 'outputs', '{}'::jsonb),
      coalesce((node_item ->> 'dirty')::boolean, true),
      coalesce(node_item ->> 'input_hash', ''),
      coalesce(node_item ->> 'output_hash', ''),
      coalesce(node_item -> 'metadata', '{}'::jsonb)
    )
    on conflict (workflow_id, key) do update
      set node_type = excluded.node_type,
          label = excluded.label,
          position = excluded.position,
          config = excluded.config,
          inputs = excluded.inputs,
          outputs = excluded.outputs,
          dirty = excluded.dirty,
          input_hash = excluded.input_hash,
          output_hash = excluded.output_hash,
          metadata = excluded.metadata;
  end loop;

  for edge_item in select value from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb))
  loop
    insert into public.output_workflow_edges (
      workflow_id,
      draft_id,
      key,
      source_node_key,
      source_port,
      target_node_key,
      target_port,
      metadata
    )
    values (
      ensured_workflow.id,
      p_draft_id,
      edge_item ->> 'key',
      edge_item ->> 'source_node_key',
      edge_item ->> 'source_port',
      edge_item ->> 'target_node_key',
      edge_item ->> 'target_port',
      coalesce(edge_item -> 'metadata', '{}'::jsonb)
    )
    on conflict (workflow_id, key) do update
      set source_node_key = excluded.source_node_key,
          source_port = excluded.source_port,
          target_node_key = excluded.target_node_key,
          target_port = excluded.target_port,
          metadata = excluded.metadata;
  end loop;

  begin
    insert into public.output_requests (
      project_id,
      draft_id,
      parent_request_id,
      workflow_id,
      requested_by,
      source_surface,
      prompt,
      title,
      intent,
      output_kind,
      status,
      selected_entity_keys,
      selected_sequence_unit_keys,
      page_count,
      target_format,
      planner_notes,
      metadata
    )
    values (
      p_project_id,
      p_draft_id,
      p_parent_request_id,
      ensured_workflow.id,
      nullif(p_request ->> 'requested_by', '')::uuid,
      coalesce(nullif(p_request ->> 'source_surface', ''), 'outputs'),
      coalesce(p_request ->> 'prompt', ''),
      coalesce(nullif(p_request ->> 'title', ''), 'Untitled output'),
      coalesce(nullif(p_request ->> 'intent', ''), 'output_generation'),
      coalesce(nullif(p_request ->> 'output_kind', ''), 'cinematic_episode'),
      coalesce(nullif(p_request ->> 'status', ''), 'awaiting_confirmation'),
      coalesce(array(select jsonb_array_elements_text(coalesce(p_request -> 'selected_entity_keys', '[]'::jsonb))), '{}')::text[],
      coalesce(array(select jsonb_array_elements_text(coalesce(p_request -> 'selected_sequence_unit_keys', '[]'::jsonb))), '{}')::text[],
      nullif(p_request ->> 'page_count', '')::integer,
      coalesce(nullif(p_request ->> 'target_format', ''), 'video'),
      coalesce(p_request ->> 'planner_notes', ''),
      coalesce(p_request -> 'metadata', '{}'::jsonb)
    )
    returning * into ensured_request;
    created_request := true;
  exception when unique_violation then
    select *
      into ensured_request
    from public.output_requests
    where project_id = p_project_id
      and draft_id = p_draft_id
      and parent_request_id = p_parent_request_id
      and coalesce((metadata ->> 'sequenceAnimaticStale')::boolean, false) = false
      and coalesce(metadata ->> 'screenplayAnimaticRole', metadata ->> 'sequenceAnimaticRole') = p_role
      and (
        coalesce(nullif(p_identity_key, ''), '') = ''
        or metadata ->> p_identity_key = p_identity_value
      )
    order by created_at asc
    limit 1;

    if ensured_request.id is null then
      raise;
    end if;
  end;

  if ensured_request.workflow_id is distinct from ensured_workflow.id and ensured_request.workflow_id is not null then
    select * into ensured_workflow
    from public.output_workflows
    where id = ensured_request.workflow_id;
  end if;

  perform public.refresh_output_request_status_projection(ensured_request.id);

  return jsonb_build_object(
    'ok', true,
    'created', created_request,
    'reused', not created_request,
    'request', to_jsonb(ensured_request),
    'workflow', to_jsonb(ensured_workflow),
    'nodes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at asc)
      from public.output_workflow_nodes n
      where n.workflow_id = ensured_workflow.id
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at asc)
      from public.output_workflow_edges e
      where e.workflow_id = ensured_workflow.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.ensure_sequence_animatic_child_workflow(uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb) from anon, authenticated;
grant execute on function public.ensure_sequence_animatic_child_workflow(uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb, jsonb) to service_role;
