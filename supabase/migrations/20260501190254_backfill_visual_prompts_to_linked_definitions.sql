-- Backfill linked-definition visual prompt components from canonical world entity
-- metadata. Generated world entities store the source of truth at
-- world_entities.metadata.visualDescription; Library/definition workspaces read
-- render component prompts, so older linked records need this projection.

with visual_entities as (
  select
    pd.id as definition_id,
    pd.kind,
    btrim(e.metadata->>'visualDescription') as visual_description
  from public.project_definitions pd
  join public.world_entities e
    on e.draft_id = pd.draft_id
   and e.linked_definition_key = pd.key
  where e.metadata ? 'visualDescription'
    and btrim(coalesce(e.metadata->>'visualDescription', '')) <> ''
)
update public.project_definition_components pdc
set
  config = jsonb_set(
    jsonb_set(
      coalesce(pdc.config, '{}'::jsonb),
      '{conceptPrompt}',
      to_jsonb(coalesce(nullif(pdc.config->>'conceptPrompt', ''), ve.visual_description)),
      true
    ),
    '{generationPrompt}',
    to_jsonb(coalesce(nullif(pdc.config->>'generationPrompt', ''), ve.visual_description)),
    true
  ),
  updated_at = timezone('utc'::text, now())
from visual_entities ve
where pdc.definition_id = ve.definition_id
  and pdc.component_type = 'render_3d_binding'
  and ve.kind in ('character', 'item', 'group', 'concept', 'event')
  and (
    coalesce(nullif(pdc.config->>'conceptPrompt', ''), '') = ''
    or coalesce(nullif(pdc.config->>'generationPrompt', ''), '') = ''
  );

with visual_entities as (
  select
    pd.id as definition_id,
    pd.kind,
    btrim(e.metadata->>'visualDescription') as visual_description
  from public.project_definitions pd
  join public.world_entities e
    on e.draft_id = pd.draft_id
   and e.linked_definition_key = pd.key
  where e.metadata ? 'visualDescription'
    and btrim(coalesce(e.metadata->>'visualDescription', '')) <> ''
)
insert into public.project_definition_components (definition_id, component_type, config)
select
  ve.definition_id,
  'render_3d_binding',
  jsonb_build_object(
    'primaryMeshAssetKey', null,
    'previewImageAssetKey', null,
    'conceptPrompt', ve.visual_description,
    'generationPrompt', ve.visual_description,
    'generationStyle', null
  )
from visual_entities ve
where ve.kind in ('character', 'item', 'group', 'concept', 'event')
  and not exists (
    select 1
    from public.project_definition_components existing
    where existing.definition_id = ve.definition_id
      and existing.component_type = 'render_3d_binding'
  )
on conflict (definition_id, component_type) do nothing;

with visual_entities as (
  select
    pd.id as definition_id,
    pd.kind,
    btrim(e.metadata->>'visualDescription') as visual_description
  from public.project_definitions pd
  join public.world_entities e
    on e.draft_id = pd.draft_id
   and e.linked_definition_key = pd.key
  where e.metadata ? 'visualDescription'
    and btrim(coalesce(e.metadata->>'visualDescription', '')) <> ''
)
update public.project_definition_components pdc
set
  config = jsonb_set(
    coalesce(pdc.config, '{}'::jsonb),
    '{generationPrompt}',
    to_jsonb(coalesce(nullif(pdc.config->>'generationPrompt', ''), ve.visual_description)),
    true
  ),
  updated_at = timezone('utc'::text, now())
from visual_entities ve
where pdc.definition_id = ve.definition_id
  and pdc.component_type = 'environment_render_binding'
  and ve.kind = 'environment'
  and coalesce(nullif(pdc.config->>'generationPrompt', ''), '') = '';

with visual_entities as (
  select
    pd.id as definition_id,
    pd.kind,
    btrim(e.metadata->>'visualDescription') as visual_description
  from public.project_definitions pd
  join public.world_entities e
    on e.draft_id = pd.draft_id
   and e.linked_definition_key = pd.key
  where e.metadata ? 'visualDescription'
    and btrim(coalesce(e.metadata->>'visualDescription', '')) <> ''
)
insert into public.project_definition_components (definition_id, component_type, config)
select
  ve.definition_id,
  'environment_render_binding',
  jsonb_build_object(
    'primaryMeshAssetKey', null,
    'previewImageAssetKey', null,
    'lightingProfile', '',
    'generationPrompt', ve.visual_description,
    'generationStyle', null
  )
from visual_entities ve
where ve.kind = 'environment'
  and not exists (
    select 1
    from public.project_definition_components existing
    where existing.definition_id = ve.definition_id
      and existing.component_type = 'environment_render_binding'
  )
on conflict (definition_id, component_type) do nothing;
