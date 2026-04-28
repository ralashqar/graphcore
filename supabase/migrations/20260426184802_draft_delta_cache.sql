create table if not exists public.draft_change_events (
  revision bigint generated always as identity primary key,
  draft_id uuid not null references public.project_drafts (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  table_name text not null,
  record_key text not null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  changed_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists draft_change_events_draft_revision_idx
on public.draft_change_events (draft_id, revision);

create index if not exists draft_change_events_draft_table_idx
on public.draft_change_events (draft_id, table_name, revision desc);

alter table public.draft_change_events enable row level security;
grant select on public.draft_change_events to authenticated;

drop policy if exists "draft change event read" on public.draft_change_events;
create policy "draft change event read" on public.draft_change_events
for select to authenticated
using (app_private.can_read_draft(draft_id));

create or replace function app_private.record_draft_change()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  row_data jsonb;
  target_draft_id uuid;
  target_project_id uuid;
  target_record_key text;
  draft_column text := nullif(tg_argv[0], '');
  project_column text := nullif(tg_argv[1], '');
  key_column text := coalesce(nullif(tg_argv[2], ''), 'key');
begin
  row_data := to_jsonb(coalesce(new, old));
  target_record_key := coalesce(row_data ->> key_column, row_data ->> 'id');

  if target_record_key is null then
    return coalesce(new, old);
  end if;

  if draft_column is not null then
    target_draft_id := (row_data ->> draft_column)::uuid;
    target_project_id := app_private.draft_project_id(target_draft_id);
    insert into public.draft_change_events (
      draft_id,
      project_id,
      table_name,
      record_key,
      operation
    ) values (
      target_draft_id,
      target_project_id,
      tg_table_name,
      target_record_key,
      lower(tg_op)
    );
  elsif project_column is not null then
    target_project_id := (row_data ->> project_column)::uuid;
    insert into public.draft_change_events (
      draft_id,
      project_id,
      table_name,
      record_key,
      operation
    )
    select
      d.id,
      target_project_id,
      tg_table_name,
      target_record_key,
      lower(tg_op)
    from public.project_drafts d
    where d.project_id = target_project_id;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function app_private.record_world_build_job_change()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  row_data jsonb;
  target_draft_id uuid;
  target_project_id uuid;
  target_record_key text;
begin
  row_data := to_jsonb(coalesce(new, old));
  target_record_key := coalesce(row_data ->> 'id', row_data ->> 'plan_item_id');

  if target_record_key is null or row_data ->> 'batch_id' is null then
    return coalesce(new, old);
  end if;

  select batch.draft_id, batch.project_id
  into target_draft_id, target_project_id
  from public.world_build_batches batch
  where batch.id = (row_data ->> 'batch_id')::uuid;

  if target_draft_id is not null and target_project_id is not null then
    insert into public.draft_change_events (
      draft_id,
      project_id,
      table_name,
      record_key,
      operation
    ) values (
      target_draft_id,
      target_project_id,
      tg_table_name,
      target_record_key,
      lower(tg_op)
    );
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function app_private.record_cinematic_run_job_change()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  row_data jsonb;
  target_draft_id uuid;
  target_project_id uuid;
  target_record_key text;
begin
  row_data := to_jsonb(coalesce(new, old));
  target_record_key := row_data ->> 'id';

  if target_record_key is null or row_data ->> 'run_id' is null then
    return coalesce(new, old);
  end if;

  select run.draft_id, run.project_id
  into target_draft_id, target_project_id
  from public.cinematic_runs run
  where run.id = (row_data ->> 'run_id')::uuid;

  if target_draft_id is not null and target_project_id is not null then
    insert into public.draft_change_events (
      draft_id,
      project_id,
      table_name,
      record_key,
      operation
    ) values (
      target_draft_id,
      target_project_id,
      tg_table_name,
      target_record_key,
      lower(tg_op)
    );
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists project_definitions_draft_change on public.project_definitions;
create trigger project_definitions_draft_change
after insert or update or delete on public.project_definitions
for each row execute function app_private.record_draft_change('draft_id', '', 'key');

drop trigger if exists project_assets_draft_change on public.project_assets;
create trigger project_assets_draft_change
after insert or update or delete on public.project_assets
for each row execute function app_private.record_draft_change('', 'project_id', 'key');

drop trigger if exists world_entities_draft_change on public.world_entities;
create trigger world_entities_draft_change
after insert or update or delete on public.world_entities
for each row execute function app_private.record_draft_change('draft_id', '', 'key');

drop trigger if exists world_relationships_draft_change on public.world_relationships;
create trigger world_relationships_draft_change
after insert or update or delete on public.world_relationships
for each row execute function app_private.record_draft_change('draft_id', '', 'key');

drop trigger if exists world_views_draft_change on public.world_views;
create trigger world_views_draft_change
after insert or update or delete on public.world_views
for each row execute function app_private.record_draft_change('draft_id', '', 'key');

drop trigger if exists world_operators_draft_change on public.world_operators;
create trigger world_operators_draft_change
after insert or update or delete on public.world_operators
for each row execute function app_private.record_draft_change('draft_id', '', 'key');

drop trigger if exists world_results_draft_change on public.world_results;
create trigger world_results_draft_change
after insert or update or delete on public.world_results
for each row execute function app_private.record_draft_change('draft_id', '', 'key');

drop trigger if exists world_graph_connections_draft_change on public.world_graph_connections;
create trigger world_graph_connections_draft_change
after insert or update or delete on public.world_graph_connections
for each row execute function app_private.record_draft_change('draft_id', '', 'key');

drop trigger if exists world_threads_draft_change on public.world_threads;
create trigger world_threads_draft_change
after insert or update or delete on public.world_threads
for each row execute function app_private.record_draft_change('draft_id', '', 'key');

drop trigger if exists world_prompt_sessions_draft_change on public.world_prompt_sessions;
create trigger world_prompt_sessions_draft_change
after insert or update or delete on public.world_prompt_sessions
for each row execute function app_private.record_draft_change('draft_id', '', 'key');

drop trigger if exists world_prompt_turns_draft_change on public.world_prompt_turns;
create trigger world_prompt_turns_draft_change
after insert or update or delete on public.world_prompt_turns
for each row execute function app_private.record_draft_change('draft_id', '', 'id');

drop trigger if exists world_prompt_messages_draft_change on public.world_prompt_messages;
create trigger world_prompt_messages_draft_change
after insert or update or delete on public.world_prompt_messages
for each row execute function app_private.record_draft_change('draft_id', '', 'id');

drop trigger if exists world_prompt_events_draft_change on public.world_prompt_events;
create trigger world_prompt_events_draft_change
after insert or update or delete on public.world_prompt_events
for each row execute function app_private.record_draft_change('draft_id', '', 'id');

drop trigger if exists world_prompt_suggestions_draft_change on public.world_prompt_suggestions;
create trigger world_prompt_suggestions_draft_change
after insert or update or delete on public.world_prompt_suggestions
for each row execute function app_private.record_draft_change('draft_id', '', 'id');

drop trigger if exists world_build_batches_draft_change on public.world_build_batches;
create trigger world_build_batches_draft_change
after insert or update or delete on public.world_build_batches
for each row execute function app_private.record_draft_change('draft_id', '', 'id');

drop trigger if exists world_build_jobs_draft_change on public.world_build_jobs;
create trigger world_build_jobs_draft_change
after insert or update or delete on public.world_build_jobs
for each row execute function app_private.record_world_build_job_change();

drop trigger if exists mesh_generation_jobs_draft_change on public.mesh_generation_jobs;
create trigger mesh_generation_jobs_draft_change
after insert or update or delete on public.mesh_generation_jobs
for each row execute function app_private.record_draft_change('draft_id', '', 'id');

drop trigger if exists cinematic_runs_draft_change on public.cinematic_runs;
create trigger cinematic_runs_draft_change
after insert or update or delete on public.cinematic_runs
for each row execute function app_private.record_draft_change('draft_id', '', 'id');

drop trigger if exists cinematic_run_jobs_draft_change on public.cinematic_run_jobs;
create trigger cinematic_run_jobs_draft_change
after insert or update or delete on public.cinematic_run_jobs
for each row execute function app_private.record_cinematic_run_job_change();

create or replace function public.get_draft_delta(
  target_draft_id uuid,
  since_revision bigint default null,
  cache_schema_version text default 'world-cache-v1'
)
returns jsonb
language plpgsql
set search_path = public, app_private
as $$
declare
  current_revision bigint := 0;
  changed_count integer := 0;
  max_delta_rows integer := 500;
  changed jsonb := '{}'::jsonb;
  deleted jsonb := '{}'::jsonb;
  compact jsonb := '{}'::jsonb;
  min_available bigint := 0;
  invalid_schema boolean := cache_schema_version is distinct from 'world-cache-v1';
begin
  if not app_private.can_read_draft(target_draft_id) then
    raise exception 'Not authorized to read draft delta.';
  end if;

  select coalesce(max(revision), 0)
  into current_revision
  from public.draft_change_events
  where draft_id = target_draft_id;

  select coalesce(min(revision), 0)
  into min_available
  from public.draft_change_events
  where draft_id = target_draft_id;

  if since_revision is null or invalid_schema or (min_available > 0 and since_revision < min_available - 1) then
    return jsonb_build_object(
      'currentRevision', current_revision,
      'requiresSnapshot', true,
      'changedKeysByTable', '{}'::jsonb,
      'deletedKeysByTable', '{}'::jsonb,
      'compactRows', '{}'::jsonb
    );
  end if;

  select count(*)
  into changed_count
  from public.draft_change_events
  where draft_id = target_draft_id
    and revision > since_revision;

  if changed_count > max_delta_rows then
    return jsonb_build_object(
      'currentRevision', current_revision,
      'requiresSnapshot', true,
      'changedKeysByTable', '{}'::jsonb,
      'deletedKeysByTable', '{}'::jsonb,
      'compactRows', '{}'::jsonb
    );
  end if;

  with events as (
    select table_name, record_key, operation
    from public.draft_change_events
    where draft_id = target_draft_id
      and revision > since_revision
  ),
  changed_grouped as (
    select table_name, jsonb_agg(distinct record_key) as keys
    from events
    where operation in ('insert', 'update')
    group by table_name
  ),
  deleted_grouped as (
    select table_name, jsonb_agg(distinct record_key) as keys
    from events
    where operation = 'delete'
    group by table_name
  )
  select
    coalesce((select jsonb_object_agg(table_name, keys) from changed_grouped), '{}'::jsonb),
    coalesce((select jsonb_object_agg(table_name, keys) from deleted_grouped), '{}'::jsonb)
  into changed, deleted;

  compact := jsonb_build_object(
    'project_definitions', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, key, kind, name, summary, status, icon_asset_key, archetype_key, tags, schema_version, metadata, asset_refs
        from public.project_definitions
        where draft_id = target_draft_id
          and key in (select jsonb_array_elements_text(coalesce(changed -> 'project_definitions', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'project_assets', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, key, name, kind, mime_type, storage_path, metadata
        from public.project_assets
        where project_id = app_private.draft_project_id(target_draft_id)
          and key in (select jsonb_array_elements_text(coalesce(changed -> 'project_assets', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_entities', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, key, name, summary, context, node_type, aliases, tags, status, thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata, created_at, updated_at
        from public.world_entities
        where draft_id = target_draft_id
          and key in (select jsonb_array_elements_text(coalesce(changed -> 'world_entities', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_relationships', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata, created_at, updated_at
        from public.world_relationships
        where draft_id = target_draft_id
          and key in (select jsonb_array_elements_text(coalesce(changed -> 'world_relationships', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_views', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, key, name, mode, filters, search, root_entity_key, camera, focus_depth, show_suggestions, show_labels, show_derived_layer, collapsed_state, sort_mode, metadata, created_at, updated_at
        from public.world_views
        where draft_id = target_draft_id
          and key in (select jsonb_array_elements_text(coalesce(changed -> 'world_views', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_operators', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, key, operator_type, input_entity_keys, label, status, metadata, created_at, updated_at
        from public.world_operators
        where draft_id = target_draft_id
          and key in (select jsonb_array_elements_text(coalesce(changed -> 'world_operators', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_results', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, key, result_type, source_operator_key, title, summary, preview_asset_key, status, metadata, created_at, updated_at
        from public.world_results
        where draft_id = target_draft_id
          and key in (select jsonb_array_elements_text(coalesce(changed -> 'world_results', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_graph_connections', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, key, source_node_key, source_node_kind, target_node_key, target_node_kind, role, metadata, created_at, updated_at
        from public.world_graph_connections
        where draft_id = target_draft_id
          and key in (select jsonb_array_elements_text(coalesce(changed -> 'world_graph_connections', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_threads', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, draft_id, key, title, summary, status, priority, linked_entity_keys, source_turn_id, last_turn_id, metadata, created_at, updated_at
        from public.world_threads
        where draft_id = target_draft_id
          and key in (select jsonb_array_elements_text(coalesce(changed -> 'world_threads', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_prompt_sessions', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, draft_id, key, title, status, is_active, summary_memory, last_context, selected_root_entity_key, selected_view_key, model, metadata, created_at, updated_at
        from public.world_prompt_sessions
        where draft_id = target_draft_id
          and key in (select jsonb_array_elements_text(coalesce(changed -> 'world_prompt_sessions', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_prompt_turns', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, session_id, draft_id, prompt, status, model, resolved_context, approval_state, assistant_summary, error_message, response_id, metadata, created_at, updated_at
        from public.world_prompt_turns
        where draft_id = target_draft_id
          and id::text in (select jsonb_array_elements_text(coalesce(changed -> 'world_prompt_turns', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_prompt_messages', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, session_id, turn_id, draft_id, role, content, metadata, created_at
        from public.world_prompt_messages
        where draft_id = target_draft_id
          and id::text in (select jsonb_array_elements_text(coalesce(changed -> 'world_prompt_messages', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_prompt_events', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, session_id, turn_id, draft_id, sequence, event_type, op_id, payload, metadata, created_at
        from public.world_prompt_events
        where draft_id = target_draft_id
          and event_type = 'op_applied'
          and id::text in (select jsonb_array_elements_text(coalesce(changed -> 'world_prompt_events', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_prompt_suggestions', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, draft_id, session_id, turn_id, thread_key, label, prompt, kind, style, source, summary, estimated_node_count, estimated_edge_count, will_queue_images, will_queue_cinematics, state, rank, used_turn_id, dismissed_at, metadata, created_at, updated_at
        from public.world_prompt_suggestions
        where draft_id = target_draft_id
          and id::text in (select jsonb_array_elements_text(coalesce(changed -> 'world_prompt_suggestions', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_build_batches', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, draft_id, project_id, prompt, request_summary, planner_mode, status, diagnostics, created_at, updated_at
        from public.world_build_batches
        where draft_id = target_draft_id
          and id::text in (select jsonb_array_elements_text(coalesce(changed -> 'world_build_batches', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'world_build_jobs', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, batch_id, plan_item_id, kind, status, depends_on_job_ids, target_keys, provider_request_id, status_url, response_url, cancel_url, error_message, order_index, created_at, updated_at
        from public.world_build_jobs
        where id::text in (select jsonb_array_elements_text(coalesce(changed -> 'world_build_jobs', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'mesh_generation_jobs', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, project_id, draft_id, definition_key, source_image_asset_key, target_mesh_asset_key, provider, model, provider_request_id, status_url, response_url, cancel_url, status, provider_status, error_message, storage_path, created_at, updated_at
        from public.mesh_generation_jobs
        where draft_id = target_draft_id
          and id::text in (select jsonb_array_elements_text(coalesce(changed -> 'mesh_generation_jobs', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'cinematic_runs', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, draft_id, project_id, graph_key, graph_name, mode, status, shot_node_key, diagnostics, created_at, updated_at
        from public.cinematic_runs
        where draft_id = target_draft_id
          and id::text in (select jsonb_array_elements_text(coalesce(changed -> 'cinematic_runs', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb),
    'cinematic_run_jobs', coalesce((
      select jsonb_agg(to_jsonb(row))
      from (
        select id, run_id, graph_key, shot_node_key, kind, status, order_index, depends_on_job_ids, still_asset_key, video_asset_key, provider, model, provider_request_id, error_message, created_at, updated_at
        from public.cinematic_run_jobs
        where id::text in (select jsonb_array_elements_text(coalesce(changed -> 'cinematic_run_jobs', '[]'::jsonb)))
      ) row
    ), '[]'::jsonb)
  );

  return jsonb_build_object(
    'currentRevision', current_revision,
    'requiresSnapshot', false,
    'changedKeysByTable', changed,
    'deletedKeysByTable', deleted,
    'compactRows', compact
  );
end;
$$;

grant execute on function public.get_draft_delta(uuid, bigint, text) to authenticated;
