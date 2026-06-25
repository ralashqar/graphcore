select
  r.id,
  r.status::text as request_status,
  r.output_kind::text as output_kind,
  r.title,
  r.latest_run_id,
  r.created_at,
  r.updated_at,
  r.metadata->>'screenplayAnimaticRole' as role,
  r.metadata->>'sequenceAnimaticRole' as legacy_role,
  r.metadata->>'sceneId' as scene_id,
  r.metadata->>'setId' as set_id,
  r.metadata->>'zoneId' as zone_id,
  r.metadata->>'nodeId' as node_id,
  r.metadata->>'batchKind' as batch_kind,
  r.metadata->>'batchId' as batch_id,
  r.metadata->>'generationPolicy' as generation_policy,
  left(coalesce(r.prompt, ''), 120) as prompt_head
from public.output_requests r
where r.created_at >= now() - interval '8 hours'
  and r.status in ('queued','running')
  and (
    r.metadata::text ilike '%scene_003%'
    or r.metadata::text ilike '%scene 3%'
    or r.metadata::text ilike '%spot_atlas%'
    or r.metadata::text ilike '%zone_spatial_map%'
    or r.metadata::text ilike '%sequence_animatic_continuity_asset%'
  )
order by r.updated_at desc
limit 50;
