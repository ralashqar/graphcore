create or replace function public.replace_world_entity(
  p_draft_id uuid,
  p_target_entity_key text,
  p_replacement_entity_key text,
  p_transfer_relationships boolean default true,
  p_transfer_graph_connections boolean default true,
  p_transfer_derived_results boolean default true,
  p_archive_old_entity boolean default true,
  p_delete_old_entity boolean default false,
  p_reason text default null,
  p_archive_old_definition_key text default null,
  p_replacement_definition_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  old_entity public.world_entities%rowtype;
  replacement_entity public.world_entities%rowtype;
  touched_relationship_keys text[] := '{}'::text[];
  touched_view_keys text[] := '{}'::text[];
  touched_operator_keys text[] := '{}'::text[];
  touched_result_keys text[] := '{}'::text[];
  touched_connection_keys text[] := '{}'::text[];
  touched_thread_keys text[] := '{}'::text[];
begin
  select *
  into old_entity
  from public.world_entities
  where draft_id = p_draft_id
    and key = p_target_entity_key
  for update;

  if old_entity.id is null then
    raise exception 'Target world entity % was not found for draft %.', p_target_entity_key, p_draft_id;
  end if;

  select *
  into replacement_entity
  from public.world_entities
  where draft_id = p_draft_id
    and key = p_replacement_entity_key
  for update;

  if replacement_entity.id is null then
    raise exception 'Replacement world entity % was not found for draft %.', p_replacement_entity_key, p_draft_id;
  end if;

  if replacement_entity.id = old_entity.id then
    raise exception 'Replacement entity must differ from the target entity.';
  end if;

  update public.world_entities
  set
    status = 'active',
    linked_definition_key = coalesce(p_replacement_definition_key, linked_definition_key),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'replacement',
      coalesce(metadata -> 'replacement', '{}'::jsonb) || jsonb_build_object(
        'replacesEntityKey', old_entity.key,
        'replacedAt', timezone('utc'::text, now()),
        'reason', p_reason
      )
    )
  where draft_id = p_draft_id
    and key = replacement_entity.key;

  if p_transfer_relationships then
    with updated_source as (
      update public.world_relationships
      set source_entity_id = replacement_entity.id
      where draft_id = p_draft_id
        and source_entity_id = old_entity.id
      returning key
    ), updated_target as (
      update public.world_relationships
      set target_entity_id = replacement_entity.id
      where draft_id = p_draft_id
        and target_entity_id = old_entity.id
      returning key
    )
    select coalesce(array_agg(distinct key), '{}'::text[])
    into touched_relationship_keys
    from (
      select key from updated_source
      union all
      select key from updated_target
    ) keys;

    with ranked as (
      select
        id,
        key,
        row_number() over (
          partition by draft_id, source_entity_id, target_entity_id, lower(verb), direction
          order by created_at, id
        ) as rn
      from public.world_relationships
      where draft_id = p_draft_id
    ), deleted as (
      delete from public.world_relationships relationship
      using ranked
      where relationship.id = ranked.id
        and ranked.rn > 1
      returning relationship.key
    )
    select coalesce(array_agg(distinct key), '{}'::text[])
    into touched_relationship_keys
    from (
      select unnest(touched_relationship_keys) as key
      union all
      select key from deleted
    ) keys;
  end if;

  if p_transfer_derived_results then
    with updated_operators as (
      update public.world_operators as operator_entry
      set input_entity_keys = coalesce((
        select array_agg(value order by first_ordinal)
        from (
          select replaced.value, min(replaced.ordinality) as first_ordinal
          from (
            select
              case when entry.value = old_entity.key then replacement_entity.key else entry.value end as value,
              entry.ordinality
            from unnest(coalesce(operator_entry.input_entity_keys, '{}'::text[])) with ordinality as entry(value, ordinality)
          ) replaced
          group by replaced.value
        ) ordered_values
      ), '{}'::text[])
      where draft_id = p_draft_id
        and coalesce(operator_entry.input_entity_keys, '{}'::text[]) @> array[old_entity.key]::text[]
      returning key
    )
    select coalesce(array_agg(distinct key), '{}'::text[])
    into touched_operator_keys
    from updated_operators;

    if array_length(touched_operator_keys, 1) is not null then
      select coalesce(array_agg(distinct key), '{}'::text[])
      into touched_result_keys
      from public.world_results
      where draft_id = p_draft_id
        and source_operator_key = any(touched_operator_keys);
    end if;
  end if;

  if p_transfer_graph_connections then
    with updated_connections as (
      update public.world_graph_connections
      set
        source_node_key = case
          when source_node_kind = 'entity' and source_node_key = old_entity.key then replacement_entity.key
          else source_node_key
        end,
        target_node_key = case
          when target_node_kind = 'entity' and target_node_key = old_entity.key then replacement_entity.key
          else target_node_key
        end
      where draft_id = p_draft_id
        and (
          (source_node_kind = 'entity' and source_node_key = old_entity.key)
          or (target_node_kind = 'entity' and target_node_key = old_entity.key)
        )
      returning key
    ), deduped_connections as (
      select
        id,
        key,
        row_number() over (
          partition by draft_id, source_node_key, source_node_kind, target_node_key, target_node_kind, role
          order by created_at, id
        ) as rn
      from public.world_graph_connections
      where draft_id = p_draft_id
    ), deleted_connections as (
      delete from public.world_graph_connections connection
      using deduped_connections
      where connection.id = deduped_connections.id
        and deduped_connections.rn > 1
      returning connection.key
    )
    select coalesce(array_agg(distinct key), '{}'::text[])
    into touched_connection_keys
    from (
      select key from updated_connections
      union all
      select key from deleted_connections
    ) keys;

    with updated_views as (
      update public.world_views
      set
        root_entity_key = case
          when root_entity_key = old_entity.key then replacement_entity.key
          else root_entity_key
        end,
        node_positions = case
          when coalesce(node_positions, '{}'::jsonb) ? old_entity.key then
            (coalesce(node_positions, '{}'::jsonb) - old_entity.key)
            || jsonb_build_object(
              replacement_entity.key,
              coalesce(
                coalesce(node_positions, '{}'::jsonb) -> replacement_entity.key,
                coalesce(node_positions, '{}'::jsonb) -> old_entity.key
              )
            )
          else coalesce(node_positions, '{}'::jsonb)
        end,
        collapsed_state = case
          when coalesce(collapsed_state, '{}'::jsonb) ? old_entity.key then
            (coalesce(collapsed_state, '{}'::jsonb) - old_entity.key)
            || jsonb_build_object(
              replacement_entity.key,
              coalesce(
                coalesce(collapsed_state, '{}'::jsonb) -> replacement_entity.key,
                coalesce(collapsed_state, '{}'::jsonb) -> old_entity.key
              )
            )
          else coalesce(collapsed_state, '{}'::jsonb)
        end
      where draft_id = p_draft_id
        and (
          root_entity_key = old_entity.key
          or coalesce(node_positions, '{}'::jsonb) ? old_entity.key
          or coalesce(collapsed_state, '{}'::jsonb) ? old_entity.key
        )
      returning key
    )
    select coalesce(array_agg(distinct key), '{}'::text[])
    into touched_view_keys
    from updated_views;

    with updated_threads as (
      update public.world_threads as thread_entry
      set linked_entity_keys = coalesce((
        select array_agg(value order by first_ordinal)
        from (
          select replaced.value, min(replaced.ordinality) as first_ordinal
          from (
            select
              case when entry.value = old_entity.key then replacement_entity.key else entry.value end as value,
              entry.ordinality
            from unnest(coalesce(thread_entry.linked_entity_keys, '{}'::text[])) with ordinality as entry(value, ordinality)
          ) replaced
          group by replaced.value
        ) ordered_values
      ), '{}'::text[])
      where draft_id = p_draft_id
        and coalesce(thread_entry.linked_entity_keys, '{}'::text[]) @> array[old_entity.key]::text[]
      returning key
    )
    select coalesce(array_agg(distinct key), '{}'::text[])
    into touched_thread_keys
    from updated_threads;
  end if;

  if p_replacement_definition_key is not null then
    update public.project_definitions
    set
      status = 'active',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'replacement',
        coalesce(metadata -> 'replacement', '{}'::jsonb) || jsonb_build_object(
          'replacesEntityKey', old_entity.key,
          'replacedAt', timezone('utc'::text, now()),
          'reason', p_reason
        )
      )
    where draft_id = p_draft_id
      and key = p_replacement_definition_key;
  end if;

  if p_archive_old_definition_key is not null and p_archive_old_definition_key <> p_replacement_definition_key then
    update public.project_definitions
    set
      status = 'archived',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'replacement',
        coalesce(metadata -> 'replacement', '{}'::jsonb) || jsonb_build_object(
          'replacedByEntityKey', replacement_entity.key,
          'replacedAt', timezone('utc'::text, now()),
          'reason', p_reason
        )
      )
    where draft_id = p_draft_id
      and key = p_archive_old_definition_key;
  end if;

  if p_delete_old_entity then
    delete from public.world_entities
    where draft_id = p_draft_id
      and key = old_entity.key;
  elsif p_archive_old_entity then
    update public.world_entities
    set
      status = 'archived',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'replacement',
        coalesce(metadata -> 'replacement', '{}'::jsonb) || jsonb_build_object(
          'replacedByEntityKey', replacement_entity.key,
          'replacementReason', p_reason,
          'replacedAt', timezone('utc'::text, now())
        )
      )
    where draft_id = p_draft_id
      and key = old_entity.key;
  end if;

  return jsonb_build_object(
    'archivedEntityKey', case when p_delete_old_entity then null else old_entity.key end,
    'replacementEntityKey', replacement_entity.key,
    'touchedRelationshipKeys', touched_relationship_keys,
    'touchedViewKeys', touched_view_keys,
    'touchedOperatorKeys', touched_operator_keys,
    'touchedResultKeys', touched_result_keys,
    'touchedConnectionKeys', touched_connection_keys,
    'touchedThreadKeys', touched_thread_keys
  );
end;
$$;

revoke all on function public.replace_world_entity(uuid, text, text, boolean, boolean, boolean, boolean, boolean, text, text, text) from public;
revoke all on function public.replace_world_entity(uuid, text, text, boolean, boolean, boolean, boolean, boolean, text, text, text) from anon;
revoke all on function public.replace_world_entity(uuid, text, text, boolean, boolean, boolean, boolean, boolean, text, text, text) from authenticated;
grant execute on function public.replace_world_entity(uuid, text, text, boolean, boolean, boolean, boolean, boolean, text, text, text) to service_role;
