select
  req.id,
  req.status::text as request_status,
  req.title,
  req.latest_run_id,
  req.metadata->>'screenplayAnimaticRole' as role,
  req.metadata->>'sceneId' as scene_id,
  req.metadata->>'zoneId' as zone_id,
  req.metadata->>'generationPolicy' as generation_policy,
  req.metadata->>'batchKind' as batch_kind,
  run.status::text as run_status,
  run.worker_id,
  run.heartbeat_at,
  run.completed_at,
  left(coalesce(req.prompt,''), 140) as prompt_head
from public.output_requests req
left join public.output_workflow_runs run on run.id = req.latest_run_id
where req.created_at >= now() - interval '8 hours'
  and req.status in ('queued','running')
  and (
    req.metadata::text ilike '%scene_003%'
    or req.metadata::text ilike '%spot_atlas%'
    or req.metadata::text ilike '%spot_grid%'
    or req.metadata::text ilike '%zone_spatial_map%'
    or req.prompt ilike '%Akane Opposite Position%'
  )
order by req.updated_at desc
limit 50;
