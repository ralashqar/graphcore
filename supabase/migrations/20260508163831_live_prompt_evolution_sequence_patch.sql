alter table public.world_prompt_generation_job_steps
  drop constraint if exists world_prompt_generation_job_steps_phase_check;

alter table public.world_prompt_generation_job_steps
  add constraint world_prompt_generation_job_steps_phase_check
  check (phase in ('full_stream', 'world_bible', 'core_entities', 'sequence_units', 'relationships', 'finalize', 'prompt_update'));

create or replace function public.claim_world_prompt_generation_job(
  worker_id text,
  worker_secret text default null
)
returns table (
  job_id uuid,
  step_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
begin
  if worker_id is null or length(trim(worker_id)) = 0 then
    raise exception 'worker_id is required';
  end if;

  return query
  with candidate as (
    select
      j.id as candidate_job_id,
      s.id as candidate_step_id
    from public.world_prompt_generation_jobs j
    join public.world_prompt_generation_job_steps s
      on s.job_id = j.id
    where coalesce(j.metadata->>'runtime', 'supabase') = 'fly'
      and (
        (j.kind = 'initial_seed_stream' and s.step_key = 'full_stream')
        or (j.kind = 'prompt_update_stream' and s.step_key = 'prompt_update')
      )
      and (
        j.status = 'queued'
        or (
          j.status = 'running'
          and coalesce(j.heartbeat_at, j.updated_at, j.created_at) < now_at - interval '5 minutes'
        )
      )
      and (
        s.status = 'queued'
        or (
          s.status = 'running'
          and coalesce(s.heartbeat_at, s.updated_at, s.created_at) < now_at - interval '5 minutes'
        )
      )
    order by j.created_at asc
    for update of j, s skip locked
    limit 1
  ),
  updated_job as (
    update public.world_prompt_generation_jobs j
    set
      status = 'running',
      started_at = coalesce(j.started_at, now_at),
      heartbeat_at = now_at,
      error_message = null,
      metadata = coalesce(j.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'runtime', 'fly',
          'workerId', trim(worker_id),
          'claimedAt', now_at,
          'lastHeartbeatAt', now_at
        )
    from candidate
    where j.id = candidate.candidate_job_id
    returning j.id
  ),
  updated_step as (
    update public.world_prompt_generation_job_steps s
    set
      status = 'running',
      started_at = coalesce(s.started_at, now_at),
      heartbeat_at = now_at,
      error_message = null,
      metadata = coalesce(s.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'runtime', 'fly',
          'workerId', trim(worker_id),
          'claimedAt', now_at,
          'lastHeartbeatAt', now_at
        )
    from candidate
    where s.id = candidate.candidate_step_id
    returning s.id
  )
  select updated_job.id, updated_step.id
  from updated_job
  cross join updated_step;
end;
$$;

create or replace function public.heartbeat_world_prompt_generation_job(
  job_id uuid,
  worker_id text,
  counts jsonb default null,
  token_usage jsonb default null,
  cursor text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
begin
  update public.world_prompt_generation_jobs j
  set
    heartbeat_at = now_at,
    counts = coalesce(heartbeat_world_prompt_generation_job.counts, j.counts),
    token_usage = coalesce(heartbeat_world_prompt_generation_job.token_usage, j.token_usage),
    latest_applied_op_cursor = coalesce(heartbeat_world_prompt_generation_job.cursor, j.latest_applied_op_cursor),
    metadata = coalesce(j.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'lastHeartbeatAt', now_at,
        'workerId', trim(worker_id)
      )
  where j.id = heartbeat_world_prompt_generation_job.job_id
    and coalesce(j.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  update public.world_prompt_generation_job_steps s
  set
    heartbeat_at = now_at,
    counts = coalesce(heartbeat_world_prompt_generation_job.counts, s.counts),
    token_usage = coalesce(heartbeat_world_prompt_generation_job.token_usage, s.token_usage),
    latest_applied_op_cursor = coalesce(heartbeat_world_prompt_generation_job.cursor, s.latest_applied_op_cursor),
    metadata = coalesce(s.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'lastHeartbeatAt', now_at,
        'workerId', trim(worker_id)
      )
  where s.job_id = heartbeat_world_prompt_generation_job.job_id
    and s.step_key in ('full_stream', 'prompt_update')
    and coalesce(s.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  return found;
end;
$$;

create or replace function public.complete_world_prompt_generation_job(
  job_id uuid,
  worker_id text,
  final_status public.world_prompt_generation_job_status default 'completed',
  counts jsonb default null,
  token_usage jsonb default null,
  cursor text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
begin
  update public.world_prompt_generation_jobs j
  set
    status = final_status,
    completed_at = now_at,
    heartbeat_at = now_at,
    counts = coalesce(complete_world_prompt_generation_job.counts, j.counts),
    token_usage = coalesce(complete_world_prompt_generation_job.token_usage, j.token_usage),
    latest_applied_op_cursor = coalesce(complete_world_prompt_generation_job.cursor, j.latest_applied_op_cursor),
    error_message = null,
    metadata = coalesce(j.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'completedByWorkerId', trim(worker_id),
        'lastHeartbeatAt', now_at
      )
  where j.id = complete_world_prompt_generation_job.job_id
    and coalesce(j.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  update public.world_prompt_generation_job_steps s
  set
    status = case when final_status = 'failed' then 'failed' else 'completed' end,
    completed_at = now_at,
    heartbeat_at = now_at,
    counts = coalesce(complete_world_prompt_generation_job.counts, s.counts),
    token_usage = coalesce(complete_world_prompt_generation_job.token_usage, s.token_usage),
    latest_applied_op_cursor = coalesce(complete_world_prompt_generation_job.cursor, s.latest_applied_op_cursor),
    error_message = null,
    metadata = coalesce(s.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'completedByWorkerId', trim(worker_id),
        'lastHeartbeatAt', now_at
      )
  where s.job_id = complete_world_prompt_generation_job.job_id
    and s.step_key in ('full_stream', 'prompt_update')
    and coalesce(s.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  return found;
end;
$$;

create or replace function public.fail_world_prompt_generation_job(
  job_id uuid,
  worker_id text,
  final_status public.world_prompt_generation_job_status default 'failed',
  error_message text default null,
  counts jsonb default null,
  token_usage jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
begin
  update public.world_prompt_generation_jobs j
  set
    status = final_status,
    completed_at = case when final_status in ('failed', 'completed_with_errors', 'cancelled') then now_at else j.completed_at end,
    heartbeat_at = now_at,
    counts = coalesce(fail_world_prompt_generation_job.counts, j.counts),
    token_usage = coalesce(fail_world_prompt_generation_job.token_usage, j.token_usage),
    error_message = fail_world_prompt_generation_job.error_message,
    metadata = coalesce(j.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'failedByWorkerId', trim(worker_id),
        'lastHeartbeatAt', now_at
      )
  where j.id = fail_world_prompt_generation_job.job_id
    and coalesce(j.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  update public.world_prompt_generation_job_steps s
  set
    status = case when final_status = 'cancelled' then 'cancelled' else 'failed' end,
    completed_at = now_at,
    heartbeat_at = now_at,
    counts = coalesce(fail_world_prompt_generation_job.counts, s.counts),
    token_usage = coalesce(fail_world_prompt_generation_job.token_usage, s.token_usage),
    error_message = fail_world_prompt_generation_job.error_message,
    metadata = coalesce(s.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'failedByWorkerId', trim(worker_id),
        'lastHeartbeatAt', now_at
      )
  where s.job_id = fail_world_prompt_generation_job.job_id
    and s.step_key in ('full_stream', 'prompt_update')
    and coalesce(s.metadata->>'workerId', trim(worker_id)) = trim(worker_id);

  return found;
end;
$$;

create or replace function public.apply_world_sequence_patch(
  p_draft_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  entry jsonb;
  entity_payload jsonb;
  relationship_payload jsonb;
  target_key text;
  candidate_key text;
  base_key text;
  suffix integer;
  source_key text;
  target_relationship_key text;
  target_entity_key text;
  v_source_entity_id uuid;
  v_target_entity_id uuid;
  existing_entity_id uuid;
  existing_relationship_id uuid;
  existing_ordinal numeric;
  incoming_ordinal numeric;
  created_entity_keys text[] := '{}';
  updated_entity_keys text[] := '{}';
  touched_entity_keys text[] := '{}';
  created_relationship_keys text[] := '{}';
  touched_relationship_keys text[] := '{}';
  deleted_relationship_keys text[] := '{}';
  shifted_ordinals jsonb := '[]'::jsonb;
  old_chain jsonb := '[]'::jsonb;
  new_chain jsonb := '[]'::jsonb;
begin
  if p_draft_id is null then
    raise exception 'p_draft_id is required';
  end if;

  old_chain := coalesce(p_patch #> '{auditSummary,oldChain}', '[]'::jsonb);
  new_chain := coalesce(p_patch #> '{auditSummary,newChain}', '[]'::jsonb);
  shifted_ordinals := coalesce(p_patch #> '{auditSummary,shiftedOrdinals}', '[]'::jsonb);

  for entry in select * from jsonb_array_elements(coalesce(p_patch->'unitUpserts', '[]'::jsonb))
  loop
    entity_payload := coalesce(entry->'entity', '{}'::jsonb);
    target_key := nullif(entry->>'targetEntityKey', '');
    if target_key is null then
      base_key := 'world.sequence_unit.' || trim(both '-' from regexp_replace(lower(coalesce(entity_payload->>'name', 'sequence unit')), '[^a-z0-9]+', '-', 'g'));
      if base_key = 'world.sequence_unit.' then
        base_key := 'world.sequence_unit.unit';
      end if;
      candidate_key := base_key;
      suffix := 2;
      while exists (select 1 from public.world_entities where draft_id = p_draft_id and key = candidate_key) loop
        candidate_key := base_key || '-' || suffix::text;
        suffix := suffix + 1;
      end loop;
      target_key := candidate_key;
    end if;

    select id into existing_entity_id
    from public.world_entities
    where draft_id = p_draft_id and key = target_key;

    if existing_entity_id is null then
      insert into public.world_entities (
        draft_id, key, name, summary, context, node_type, aliases, tags, status,
        thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata
      )
      values (
        p_draft_id,
        target_key,
        coalesce(nullif(entity_payload->>'name', ''), 'Untitled sequence unit'),
        coalesce(entity_payload->>'summary', ''),
        coalesce(entity_payload->>'context', ''),
        'sequence_unit',
        coalesce(ARRAY(select jsonb_array_elements_text(coalesce(entity_payload->'aliases', '[]'::jsonb))), '{}'::text[]),
        coalesce(ARRAY(select jsonb_array_elements_text(coalesce(entity_payload->'tags', '[]'::jsonb))), '{}'::text[]),
        coalesce(nullif(entity_payload->>'status', ''), 'active'),
        nullif(entity_payload->>'thumbnailAssetKey', ''),
        nullif(entity_payload->>'linkedDefinitionKey', ''),
        coalesce(nullif(entity_payload->>'source', ''), 'ai'),
        coalesce(entity_payload->'customProperties', '{}'::jsonb),
        coalesce(entity_payload->'metadata', '{}'::jsonb)
      );
      created_entity_keys := array_append(created_entity_keys, target_key);
    else
      update public.world_entities
      set
        name = coalesce(nullif(entity_payload->>'name', ''), name),
        summary = coalesce(entity_payload->>'summary', summary),
        context = coalesce(entity_payload->>'context', context),
        aliases = case when entity_payload ? 'aliases' then coalesce(ARRAY(select jsonb_array_elements_text(coalesce(entity_payload->'aliases', '[]'::jsonb))), '{}'::text[]) else aliases end,
        tags = case when entity_payload ? 'tags' then coalesce(ARRAY(select jsonb_array_elements_text(coalesce(entity_payload->'tags', '[]'::jsonb))), '{}'::text[]) else tags end,
        status = coalesce(nullif(entity_payload->>'status', ''), status),
        thumbnail_asset_key = coalesce(nullif(entity_payload->>'thumbnailAssetKey', ''), thumbnail_asset_key),
        source = coalesce(nullif(entity_payload->>'source', ''), source),
        custom_properties = coalesce(custom_properties, '{}'::jsonb) || coalesce(entity_payload->'customProperties', '{}'::jsonb),
        metadata = coalesce(metadata, '{}'::jsonb) || coalesce(entity_payload->'metadata', '{}'::jsonb),
        updated_at = now_at
      where draft_id = p_draft_id and key = target_key;
      updated_entity_keys := array_append(updated_entity_keys, target_key);
    end if;
    touched_entity_keys := array_append(touched_entity_keys, target_key);
  end loop;

  for entry in select * from jsonb_array_elements(coalesce(p_patch->'unitUpdates', '[]'::jsonb))
  loop
    target_key := nullif(entry->>'targetEntityKey', '');
    entity_payload := coalesce(entry->'changes', '{}'::jsonb);
    if target_key is null then
      raise exception 'sequence_patch unitUpdates require targetEntityKey';
    end if;
    select id,
      case
        when coalesce(custom_properties #>> '{sequence,ordinal}', metadata #>> '{sequence,ordinal}', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then coalesce(custom_properties #>> '{sequence,ordinal}', metadata #>> '{sequence,ordinal}')::numeric
        else null
      end
    into existing_entity_id, existing_ordinal
    from public.world_entities
    where draft_id = p_draft_id and key = target_key and node_type = 'sequence_unit';
    if existing_entity_id is null then
      raise exception 'sequence_patch unit % is not a sequence_unit in this draft', target_key;
    end if;
    incoming_ordinal := case
      when coalesce(entity_payload #>> '{customProperties,sequence,ordinal}', entity_payload #>> '{metadata,sequence,ordinal}', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then coalesce(entity_payload #>> '{customProperties,sequence,ordinal}', entity_payload #>> '{metadata,sequence,ordinal}')::numeric
      else null
    end;
    update public.world_entities
    set
      name = coalesce(nullif(entity_payload->>'name', ''), name),
      summary = coalesce(entity_payload->>'summary', summary),
      context = coalesce(entity_payload->>'context', context),
      aliases = case when entity_payload ? 'aliases' then coalesce(ARRAY(select jsonb_array_elements_text(coalesce(entity_payload->'aliases', '[]'::jsonb))), '{}'::text[]) else aliases end,
      tags = case when entity_payload ? 'tags' then coalesce(ARRAY(select jsonb_array_elements_text(coalesce(entity_payload->'tags', '[]'::jsonb))), '{}'::text[]) else tags end,
      status = coalesce(nullif(entity_payload->>'status', ''), status),
      thumbnail_asset_key = coalesce(nullif(entity_payload->>'thumbnailAssetKey', ''), thumbnail_asset_key),
      source = coalesce(nullif(entity_payload->>'source', ''), source),
      custom_properties = coalesce(custom_properties, '{}'::jsonb) || coalesce(entity_payload->'customProperties', '{}'::jsonb),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(entity_payload->'metadata', '{}'::jsonb),
      updated_at = now_at
    where draft_id = p_draft_id and key = target_key;
    updated_entity_keys := array_append(updated_entity_keys, target_key);
    touched_entity_keys := array_append(touched_entity_keys, target_key);
    if incoming_ordinal is not null and incoming_ordinal is distinct from existing_ordinal then
      shifted_ordinals := shifted_ordinals || jsonb_build_array(jsonb_build_object(
        'entityKey', target_key,
        'from', existing_ordinal,
        'to', incoming_ordinal
      ));
    end if;
  end loop;

  for entry in select * from jsonb_array_elements(coalesce(p_patch->'relationshipArchives', '[]'::jsonb))
  loop
    target_relationship_key := nullif(entry->>'targetRelationshipKey', '');
    if target_relationship_key is null then
      continue;
    end if;
    delete from public.world_relationships r
    using public.world_entities s, public.world_entities t
    where r.draft_id = p_draft_id
      and r.key = target_relationship_key
      and s.id = r.source_entity_id
      and t.id = r.target_entity_id
      and s.node_type = 'sequence_unit'
      and t.node_type = 'sequence_unit'
    returning r.key into target_relationship_key;
    deleted_relationship_keys := array_append(deleted_relationship_keys, target_relationship_key);
  end loop;

  for entry in select * from jsonb_array_elements(coalesce(p_patch->'relationshipUpserts', '[]'::jsonb))
  loop
    target_relationship_key := nullif(entry->>'targetRelationshipKey', '');
    relationship_payload := coalesce(entry->'relationship', '{}'::jsonb);
    source_key := nullif(relationship_payload->>'sourceEntityKey', '');
    target_entity_key := nullif(relationship_payload->>'targetEntityKey', '');
    if source_key is null or target_entity_key is null then
      raise exception 'sequence_patch relationship upserts require sourceEntityKey and targetEntityKey';
    end if;
    select id into v_source_entity_id
    from public.world_entities
    where draft_id = p_draft_id and key = source_key and node_type = 'sequence_unit';
    select id into v_target_entity_id
    from public.world_entities
    where draft_id = p_draft_id and key = target_entity_key and node_type = 'sequence_unit';
    if v_source_entity_id is null or v_target_entity_id is null then
      raise exception 'sequence_patch relationship endpoints must both be sequence_unit entities';
    end if;

    if target_relationship_key is null then
      select id, key into existing_relationship_id, target_relationship_key
      from public.world_relationships
      where draft_id = p_draft_id
        and source_entity_id = v_source_entity_id
        and target_entity_id = v_target_entity_id
        and verb = coalesce(nullif(relationship_payload->>'verb', ''), 'precedes')
      limit 1;
    else
      select id into existing_relationship_id
      from public.world_relationships
      where draft_id = p_draft_id and key = target_relationship_key;
    end if;

    if existing_relationship_id is null then
      if target_relationship_key is null then
        base_key := 'world.relationship.' || trim(both '-' from regexp_replace(lower(source_key || '-' || coalesce(nullif(relationship_payload->>'verb', ''), 'precedes') || '-' || target_entity_key), '[^a-z0-9]+', '-', 'g'));
        candidate_key := base_key;
        suffix := 2;
        while exists (select 1 from public.world_relationships where draft_id = p_draft_id and key = candidate_key) loop
          candidate_key := base_key || '-' || suffix::text;
          suffix := suffix + 1;
        end loop;
        target_relationship_key := candidate_key;
      end if;
      insert into public.world_relationships (
        draft_id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata
      )
      values (
        p_draft_id,
        target_relationship_key,
        v_source_entity_id,
        v_target_entity_id,
        coalesce(nullif(relationship_payload->>'verb', ''), 'precedes'),
        coalesce(nullif(relationship_payload->>'direction', ''), 'outbound'),
        nullif(relationship_payload->>'strength', '')::numeric,
        nullif(relationship_payload->>'confidence', '')::numeric,
        coalesce(nullif(relationship_payload->>'source', ''), 'ai'),
        coalesce(relationship_payload->>'notes', ''),
        coalesce(nullif(relationship_payload->>'state', ''), 'confirmed'),
        coalesce(relationship_payload->'metadata', '{}'::jsonb)
      );
      created_relationship_keys := array_append(created_relationship_keys, target_relationship_key);
    else
      update public.world_relationships
      set
        notes = coalesce(relationship_payload->>'notes', notes),
        strength = coalesce(nullif(relationship_payload->>'strength', '')::numeric, strength),
        confidence = coalesce(nullif(relationship_payload->>'confidence', '')::numeric, confidence),
        state = coalesce(nullif(relationship_payload->>'state', ''), state),
        metadata = coalesce(metadata, '{}'::jsonb) || coalesce(relationship_payload->'metadata', '{}'::jsonb),
        updated_at = now_at
      where id = existing_relationship_id;
    end if;
    touched_relationship_keys := array_append(touched_relationship_keys, target_relationship_key);
    touched_entity_keys := array_append(touched_entity_keys, source_key);
    touched_entity_keys := array_append(touched_entity_keys, target_entity_key);
  end loop;

  return jsonb_build_object(
    'createdEntityKeys', to_jsonb(coalesce(created_entity_keys, '{}'::text[])),
    'updatedEntityKeys', to_jsonb(coalesce(updated_entity_keys, '{}'::text[])),
    'touchedEntityKeys', to_jsonb((select array_agg(distinct key) from unnest(coalesce(touched_entity_keys, '{}'::text[])) as key)),
    'createdRelationshipKeys', to_jsonb(coalesce(created_relationship_keys, '{}'::text[])),
    'touchedRelationshipKeys', to_jsonb((select array_agg(distinct key) from unnest(coalesce(touched_relationship_keys, '{}'::text[])) as key)),
    'deletedRelationshipKeys', to_jsonb((select array_agg(distinct key) from unnest(coalesce(deleted_relationship_keys, '{}'::text[])) as key)),
    'sequencePatchAudit', jsonb_build_object(
      'title', coalesce(p_patch #>> '{auditSummary,title}', 'Sequence rewired'),
      'summary', coalesce(p_patch #>> '{auditSummary,summary}', ''),
      'reason', coalesce(p_patch->>'reason', ''),
      'sequenceKey', p_patch->>'sequenceKey',
      'oldChain', old_chain,
      'newChain', new_chain,
      'shiftedOrdinals', shifted_ordinals,
      'archivedRelationshipKeys', to_jsonb((select array_agg(distinct key) from unnest(coalesce(deleted_relationship_keys, '{}'::text[])) as key)),
      'createdRelationshipKeys', to_jsonb(coalesce(created_relationship_keys, '{}'::text[])),
      'touchedEntityKeys', to_jsonb((select array_agg(distinct key) from unnest(coalesce(touched_entity_keys, '{}'::text[])) as key)),
      'touchedRelationshipKeys', to_jsonb((select array_agg(distinct key) from unnest(coalesce(touched_relationship_keys, '{}'::text[])) as key))
    )
  );
end;
$$;

revoke all on function public.claim_world_prompt_generation_job(text, text) from public, anon, authenticated;
revoke all on function public.heartbeat_world_prompt_generation_job(uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.complete_world_prompt_generation_job(uuid, text, public.world_prompt_generation_job_status, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.fail_world_prompt_generation_job(uuid, text, public.world_prompt_generation_job_status, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.apply_world_sequence_patch(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.claim_world_prompt_generation_job(text, text) to service_role;
grant execute on function public.heartbeat_world_prompt_generation_job(uuid, text, jsonb, jsonb, text) to service_role;
grant execute on function public.complete_world_prompt_generation_job(uuid, text, public.world_prompt_generation_job_status, jsonb, jsonb, text) to service_role;
grant execute on function public.fail_world_prompt_generation_job(uuid, text, public.world_prompt_generation_job_status, text, jsonb, jsonb) to service_role;
grant execute on function public.apply_world_sequence_patch(uuid, jsonb) to service_role;
