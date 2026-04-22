create or replace function public.reset_project_world(
  target_project_id uuid,
  target_draft_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  deleted_world_prompt_events integer := 0;
  deleted_world_prompt_messages integer := 0;
  deleted_world_prompt_turns integer := 0;
  deleted_world_prompt_sessions integer := 0;
  deleted_world_threads integer := 0;
  deleted_world_build_batches integer := 0;
  deleted_world_graph_connections integer := 0;
  deleted_world_results integer := 0;
  deleted_world_operators integer := 0;
  deleted_world_relationships integer := 0;
  deleted_world_views integer := 0;
  deleted_world_entities integer := 0;
  deleted_project_definitions integer := 0;
begin
  if app_private.draft_project_id(target_draft_id) is distinct from target_project_id then
    raise exception 'Draft % does not belong to project %.', target_draft_id, target_project_id;
  end if;

  with deleted as (
    delete from public.world_prompt_events
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_prompt_events from deleted;

  with deleted as (
    delete from public.world_prompt_messages
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_prompt_messages from deleted;

  with deleted as (
    delete from public.world_prompt_turns
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_prompt_turns from deleted;

  with deleted as (
    delete from public.world_prompt_sessions
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_prompt_sessions from deleted;

  with deleted as (
    delete from public.world_threads
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_threads from deleted;

  with deleted as (
    delete from public.world_build_batches
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_build_batches from deleted;

  with deleted as (
    delete from public.world_graph_connections
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_graph_connections from deleted;

  with deleted as (
    delete from public.world_results
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_results from deleted;

  with deleted as (
    delete from public.world_operators
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_operators from deleted;

  with deleted as (
    delete from public.world_relationships
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_relationships from deleted;

  with deleted as (
    delete from public.world_views
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_views from deleted;

  with deleted as (
    delete from public.world_entities
    where draft_id = target_draft_id
    returning 1
  )
  select count(*) into deleted_world_entities from deleted;

  with deleted as (
    delete from public.project_definitions
    where draft_id = target_draft_id
      and kind in ('character', 'environment', 'item')
    returning 1
  )
  select count(*) into deleted_project_definitions from deleted;

  return jsonb_build_object(
    'worldPromptEvents', deleted_world_prompt_events,
    'worldPromptMessages', deleted_world_prompt_messages,
    'worldPromptTurns', deleted_world_prompt_turns,
    'worldPromptSessions', deleted_world_prompt_sessions,
    'worldThreads', deleted_world_threads,
    'worldBuildBatches', deleted_world_build_batches,
    'worldGraphConnections', deleted_world_graph_connections,
    'worldResults', deleted_world_results,
    'worldOperators', deleted_world_operators,
    'worldRelationships', deleted_world_relationships,
    'worldViews', deleted_world_views,
    'worldEntities', deleted_world_entities,
    'projectDefinitions', deleted_project_definitions
  );
end;
$$;

revoke all on function public.reset_project_world(uuid, uuid) from public;
revoke all on function public.reset_project_world(uuid, uuid) from anon;
revoke all on function public.reset_project_world(uuid, uuid) from authenticated;
grant execute on function public.reset_project_world(uuid, uuid) to service_role;
