select
  req.id,
  req.status::text as request_status,
  req.title,
  req.latest_run_id,
  req.created_at,
  req.updated_at,
  req.metadata->>'screenplayAnimaticRole' as role,
  req.metadata->>'sceneId' as scene_id,
  req.metadata->>'zoneId' as zone_id,
  req.metadata->>'generationPolicy' as generation_policy,
  left(coalesce(req.prompt,''), 160) as prompt_head,
  run.status::text as run_status,
  run.worker_id,
  run.heartbeat_at,
  run.completed_at,
  coalesce(run.error_message, run.error, run.last_error) as run_error
from public.output_requests req
left join public.output_workflow_runs run on run.id = req.latest_run_id
where req.created_at >= now() - interval '3 hours'
  and req.status in ('queued','running')
  and (
    req.metadata::text ilike '%scene_003%'
    or req.metadata::text ilike '%zone_ritual_chamber_inner_ring%'
    or req.metadata::text ilike '%spot_atlas%'
    or req.metadata::text ilike '%zone_spatial_map%'
    or req.metadata::text ilike '%zone_coverage_board%'
    or req.prompt ilike '%Ritual Chamber Inner Ring%'
    or req.prompt ilike '%Camera Grid%'
  )
order by req.updated_at desc;
