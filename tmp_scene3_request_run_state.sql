select
  req.id as request_id,
  req.status::text as request_status,
  req.title,
  req.latest_run_id,
  req.updated_at as request_updated_at,
  req.error_message as request_error,
  req.metadata->>'screenplayAnimaticRole' as role,
  req.metadata->>'sequenceAnimaticRole' as legacy_role,
  req.metadata->>'generationPolicy' as generation_policy,
  req.metadata->>'batchKind' as batch_kind,
  left(coalesce(req.prompt, ''), 180) as prompt_head,
  run.status::text as run_status,
  run.worker_id,
  run.heartbeat_at,
  run.started_at as run_started_at,
  run.completed_at as run_completed_at,
  run.updated_at as run_updated_at,
  coalesce(run.error_message, run.error, run.last_error) as run_error
from public.output_requests req
left join public.output_workflow_runs run on run.id = req.latest_run_id
where req.id in ('d991cafe-bd95-441b-8ba7-7bb947eb4a3d','e3276ee5-ae37-4ecc-9e3c-6de54f2da8b8')
order by req.updated_at desc;
