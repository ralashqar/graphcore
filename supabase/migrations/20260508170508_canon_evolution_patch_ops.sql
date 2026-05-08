create or replace function public.apply_world_relationship_rewire_patch(
  p_draft_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rewire jsonb;
  relationship_record record;
  source_entity record;
  target_entity record;
  next_source_id uuid;
  next_target_id uuid;
  next_source_key text;
  next_target_key text;
  next_verb text;
  next_direction text;
  next_notes text;
  next_metadata jsonb;
  touched_entity_keys text[] := '{}'::text[];
  touched_relationship_keys text[] := '{}'::text[];
  before_rows jsonb := '[]'::jsonb;
  after_rows jsonb := '[]'::jsonb;
begin
  if p_draft_id is null then
    raise exception 'p_draft_id is required';
  end if;
  if jsonb_typeof(coalesce(p_patch->'rewires', '[]'::jsonb)) <> 'array' then
    raise exception 'relationship_rewire_patch.rewires must be an array';
  end if;

  for rewire in select value from jsonb_array_elements(coalesce(p_patch->'rewires', '[]'::jsonb)) loop
    if coalesce(rewire->>'targetRelationshipKey', '') = '' then
      raise exception 'relationship_rewire_patch targetRelationshipKey is required';
    end if;

    select
      r.id,
      r.key,
      r.source_entity_id,
      r.target_entity_id,
      r.verb,
      r.direction,
      r.notes,
      r.metadata,
      src.key as source_key,
      src.name as source_name,
      tgt.key as target_key,
      tgt.name as target_name
    into relationship_record
    from public.world_relationships r
    join public.world_entities src on src.id = r.source_entity_id
    join public.world_entities tgt on tgt.id = r.target_entity_id
    where r.draft_id = p_draft_id
      and r.key = rewire->>'targetRelationshipKey'
    for update;

    if relationship_record.id is null then
      raise exception 'World relationship % not found', rewire->>'targetRelationshipKey';
    end if;

    next_source_id := relationship_record.source_entity_id;
    next_target_id := relationship_record.target_entity_id;
    next_source_key := relationship_record.source_key;
    next_target_key := relationship_record.target_key;

    if coalesce(rewire->>'sourceEntityKey', '') <> '' then
      select id, key, name into source_entity
      from public.world_entities
      where draft_id = p_draft_id and key = rewire->>'sourceEntityKey'
      for update;
      if source_entity.id is null then
        raise exception 'Source entity % not found', rewire->>'sourceEntityKey';
      end if;
      next_source_id := source_entity.id;
      next_source_key := source_entity.key;
    end if;

    if coalesce(rewire->>'targetEntityKey', '') <> '' then
      select id, key, name into target_entity
      from public.world_entities
      where draft_id = p_draft_id and key = rewire->>'targetEntityKey'
      for update;
      if target_entity.id is null then
        raise exception 'Target entity % not found', rewire->>'targetEntityKey';
      end if;
      next_target_id := target_entity.id;
      next_target_key := target_entity.key;
    end if;

    if next_source_id = next_target_id then
      raise exception 'Relationship % cannot point to the same entity on both ends', relationship_record.key;
    end if;

    next_verb := coalesce(nullif(trim(rewire->>'verb'), ''), relationship_record.verb);
    next_direction := coalesce(nullif(trim(rewire->>'direction'), ''), relationship_record.direction);
    if next_direction not in ('outbound', 'inbound', 'bidirectional') then
      raise exception 'Invalid relationship direction %', next_direction;
    end if;
    next_notes := coalesce(rewire->>'notes', relationship_record.notes);
    next_metadata := coalesce(relationship_record.metadata, '{}'::jsonb)
      || coalesce(rewire->'metadata', '{}'::jsonb)
      || jsonb_build_object(
        'lastRewirePatch', jsonb_build_object(
          'reason', coalesce(p_patch->>'reason', ''),
          'rewiredAt', timezone('utc'::text, now()),
          'before', jsonb_build_object(
            'sourceEntityKey', relationship_record.source_key,
            'targetEntityKey', relationship_record.target_key,
            'verb', relationship_record.verb,
            'direction', relationship_record.direction
          )
        )
      );

    before_rows := before_rows || jsonb_build_array(jsonb_build_object(
      'relationshipKey', relationship_record.key,
      'sourceEntityKey', relationship_record.source_key,
      'sourceName', relationship_record.source_name,
      'targetEntityKey', relationship_record.target_key,
      'targetName', relationship_record.target_name,
      'verb', relationship_record.verb,
      'direction', relationship_record.direction,
      'notes', relationship_record.notes
    ));

    update public.world_relationships
    set
      source_entity_id = next_source_id,
      target_entity_id = next_target_id,
      verb = next_verb,
      direction = next_direction,
      notes = next_notes,
      metadata = next_metadata
    where id = relationship_record.id;

    after_rows := after_rows || jsonb_build_array(jsonb_build_object(
      'relationshipKey', relationship_record.key,
      'sourceEntityKey', next_source_key,
      'targetEntityKey', next_target_key,
      'verb', next_verb,
      'direction', next_direction,
      'notes', next_notes
    ));
    touched_relationship_keys := array_append(touched_relationship_keys, relationship_record.key);
    touched_entity_keys := array_append(touched_entity_keys, relationship_record.source_key);
    touched_entity_keys := array_append(touched_entity_keys, relationship_record.target_key);
    touched_entity_keys := array_append(touched_entity_keys, next_source_key);
    touched_entity_keys := array_append(touched_entity_keys, next_target_key);
  end loop;

  return jsonb_build_object(
    'touchedEntityKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_entity_keys) key where key is not null and key <> ''),
    'touchedRelationshipKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_relationship_keys) key where key is not null and key <> ''),
    'relationshipRewireAudit', jsonb_build_object(
      'title', coalesce(nullif(p_patch #>> '{auditSummary,title}', ''), 'Relationship rewired'),
      'summary', coalesce(nullif(p_patch #>> '{auditSummary,summary}', ''), ''),
      'reason', coalesce(p_patch->>'reason', ''),
      'before', before_rows,
      'after', after_rows,
      'touchedEntityKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_entity_keys) key where key is not null and key <> ''),
      'touchedRelationshipKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_relationship_keys) key where key is not null and key <> '')
    )
  );
end;
$$;

create or replace function public.apply_world_entity_merge_patch(
  p_draft_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  source_entity record;
  target_entity record;
  source_key text := p_patch->>'sourceEntityKey';
  target_key text := p_patch->>'targetEntityKey';
  touched_entity_keys text[] := '{}'::text[];
  touched_relationship_keys text[] := '{}'::text[];
  touched_operator_keys text[] := '{}'::text[];
  touched_result_keys text[] := '{}'::text[];
  touched_connection_keys text[] := '{}'::text[];
  transfer_relationships boolean := coalesce((p_patch->>'transferRelationships')::boolean, true);
  transfer_graph_connections boolean := coalesce((p_patch->>'transferGraphConnections')::boolean, true);
  transfer_derived_results boolean := coalesce((p_patch->>'transferDerivedResults')::boolean, true);
  archive_source boolean := coalesce((p_patch->>'archiveSource')::boolean, true);
begin
  if p_draft_id is null then
    raise exception 'p_draft_id is required';
  end if;
  if coalesce(source_key, '') = '' or coalesce(target_key, '') = '' then
    raise exception 'entity_merge_patch sourceEntityKey and targetEntityKey are required';
  end if;
  if source_key = target_key then
    raise exception 'entity_merge_patch source and target must be different';
  end if;

  select * into source_entity
  from public.world_entities
  where draft_id = p_draft_id and key = source_key
  for update;
  if source_entity.id is null then
    raise exception 'Source entity % not found', source_key;
  end if;

  select * into target_entity
  from public.world_entities
  where draft_id = p_draft_id and key = target_key
  for update;
  if target_entity.id is null then
    raise exception 'Target entity % not found', target_key;
  end if;

  touched_entity_keys := array_append(touched_entity_keys, source_key);
  touched_entity_keys := array_append(touched_entity_keys, target_key);

  if transfer_relationships then
    with updated_relationships as (
      update public.world_relationships
      set
        source_entity_id = case when source_entity_id = source_entity.id then target_entity.id else source_entity_id end,
        target_entity_id = case when target_entity_id = source_entity.id then target_entity.id else target_entity_id end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'entityMergePatch', jsonb_build_object(
            'sourceEntityKey', source_key,
            'targetEntityKey', target_key,
            'reason', coalesce(p_patch->>'reason', ''),
            'mergedAt', timezone('utc'::text, now())
          )
        )
      where draft_id = p_draft_id
        and (source_entity_id = source_entity.id or target_entity_id = source_entity.id)
      returning key
    ), deleted_self_links as (
      delete from public.world_relationships relationship
      where relationship.draft_id = p_draft_id
        and relationship.source_entity_id = relationship.target_entity_id
      returning relationship.key
    )
    select coalesce(array_agg(distinct key), '{}'::text[])
    into touched_relationship_keys
    from (
      select key from updated_relationships
      union all
      select key from deleted_self_links
    ) keys;
  end if;

  if transfer_derived_results then
    with updated_operators as (
      update public.world_operators operator_entry
      set input_entity_keys = coalesce((
        select array_agg(value order by first_ordinal)
        from (
          select replaced.value, min(replaced.ordinality) as first_ordinal
          from (
            select
              case when entry.value = source_key then target_key else entry.value end as value,
              entry.ordinality
            from unnest(coalesce(operator_entry.input_entity_keys, '{}'::text[])) with ordinality as entry(value, ordinality)
          ) replaced
          group by replaced.value
        ) ordered_values
      ), '{}'::text[])
      where draft_id = p_draft_id
        and coalesce(operator_entry.input_entity_keys, '{}'::text[]) @> array[source_key]::text[]
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

  if transfer_graph_connections then
    with updated_connections as (
      update public.world_graph_connections
      set
        source_node_key = case when source_node_kind = 'entity' and source_node_key = source_key then target_key else source_node_key end,
        target_node_key = case when target_node_kind = 'entity' and target_node_key = source_key then target_key else target_node_key end
      where draft_id = p_draft_id
        and (
          (source_node_kind = 'entity' and source_node_key = source_key)
          or (target_node_kind = 'entity' and target_node_key = source_key)
        )
      returning key
    )
    select coalesce(array_agg(distinct key), '{}'::text[])
    into touched_connection_keys
    from updated_connections;
  end if;

  if archive_source then
    update public.world_entities
    set
      status = 'archived',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'mergedIntoEntityKey', target_key,
        'mergeReason', coalesce(p_patch->>'reason', ''),
        'mergedAt', timezone('utc'::text, now()),
        'mergePatch', jsonb_build_object(
          'targetEntityKey', target_key,
          'targetEntityName', target_entity.name
        )
      )
    where id = source_entity.id;
  end if;

  update public.world_entities
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'lastEntityMergePatch', jsonb_build_object(
      'sourceEntityKey', source_key,
      'sourceEntityName', source_entity.name,
      'reason', coalesce(p_patch->>'reason', ''),
      'mergedAt', timezone('utc'::text, now())
    )
  )
  where id = target_entity.id;

  return jsonb_build_object(
    'touchedEntityKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_entity_keys) key where key is not null and key <> ''),
    'touchedRelationshipKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_relationship_keys) key where key is not null and key <> ''),
    'touchedOperatorKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_operator_keys) key where key is not null and key <> ''),
    'touchedResultKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_result_keys) key where key is not null and key <> ''),
    'touchedConnectionKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_connection_keys) key where key is not null and key <> ''),
    'entityMergeAudit', jsonb_build_object(
      'title', coalesce(nullif(p_patch #>> '{auditSummary,title}', ''), 'Entities merged'),
      'summary', coalesce(nullif(p_patch #>> '{auditSummary,summary}', ''), ''),
      'reason', coalesce(p_patch->>'reason', ''),
      'sourceEntityKey', source_key,
      'sourceEntityName', source_entity.name,
      'targetEntityKey', target_key,
      'targetEntityName', target_entity.name,
      'archivedSource', archive_source,
      'transferredRelationshipKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_relationship_keys) key where key is not null and key <> ''),
      'touchedOperatorKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_operator_keys) key where key is not null and key <> ''),
      'touchedResultKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_result_keys) key where key is not null and key <> ''),
      'touchedConnectionKeys', (select coalesce(array_agg(distinct key), '{}'::text[]) from unnest(touched_connection_keys) key where key is not null and key <> '')
    )
  );
end;
$$;

revoke all on function public.apply_world_relationship_rewire_patch(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.apply_world_entity_merge_patch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_world_relationship_rewire_patch(uuid, jsonb) to service_role;
grant execute on function public.apply_world_entity_merge_patch(uuid, jsonb) to service_role;
