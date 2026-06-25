select
  req.id,
  req.status::text as request_status,
  req.title,
  req.latest_run_id,
  req.created_at,
  req.updated_at,
  req.error_message,
  req.metadata->>'screenplayAnimaticRole' as role,
  req.metadata->>'sequenceAnimaticRole' as legacy_role,
  req.metadata->>'sceneId' as scene_id,
  req.metadata->>'setId' as set_id,
  req.metadata->>'zoneId' as zone_id,
  req.metadata->>'nodeId' as node_id,
  req.metadata->>'batchKind' as batch_kind,
  req.metadata->>'batchId' as batch_id,
  req.metadata->>'generationPolicy' as generation_policy,
  run.status::text as run_status,
  run.worker_id,
  run.started_at as run_started_at,
  run.completed_at as run_completed_at,
  coalesce(run.error_message, run.error, run.last_error) as run_error
from public.output_requests req
left join public.output_workflow_runs run on run.id = req.latest_run_id
where req.created_at >= now() - interval '24 hours'
  and (
    req.metadata::text ilike '%scene_board%'
    or req.metadata::text ilike '%spot_atlas%'
    or req.metadata::text ilike '%zone_spatial_map%'
    or req.metadata::text ilike '%coverage%'
    or req.metadata::text ilike '%keyframe%'
    or req.metadata::text ilike '%sequence_animatic%'
  )
order by req.created_at desc
limit 80;
