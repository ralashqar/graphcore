select
  q.request_id,
  q.request_status,
  q.title,
  q.role,
  q.scene_id,
  q.zone_id,
  q.batch_kind,
  q.generation_policy,
  q.run_id,
  q.run_status,
  q.worker_id,
  q.heartbeat_at,
  q.run_started_at,
  q.run_updated_at,
  q.run_error,
  q.prompt_head
from (
  select
    req.id as request_id,
    req.status::text as request_status,
    req.title,
    req.metadata->>'screenplayAnimaticRole' as role,
    req.metadata->>'sceneId' as scene_id,
    req.metadata->>'zoneId' as zone_id,
    req.metadata->>'batchKind' as batch_kind,
    req.metadata->>'generationPolicy' as generation_policy,
    run.id as run_id,
    run.status::text as run_status,
    run.worker_id,
    run.heartbeat_at,
    run.started_at as run_started_at,
    run.updated_at as run_updated_at,
    coalesce(run.error_message, run.error, run.last_error) as run_error,
    left(coalesce(req.prompt, ''), 160) as prompt_head
  from public.output_requests req
  left join public.output_workflow_runs run on run.id = req.latest_run_id
  where req.id in ('d991cafe-bd95-441b-8ba7-7bb947eb4a3d','e3276ee5-ae37-4ecc-9e3c-6de54f2da8b8')
) q
order by q.run_updated_at desc nulls last;

select
  s.run_id,
  s.node_key,
  s.label,
  s.node_type::text as node_type,
  s.status::text as step_status,
  s.provider,
  s.model,
  s.provider_request_id,
  s.started_at,
  s.completed_at,
  s.updated_at,
  s.error_message,
  left(coalesce(s.outputs::text, ''), 240) as outputs_head
from public.output_workflow_run_steps s
where s.run_id in ('2481c6ae-d3fb-44e6-bce9-30d5d517042e','d787088a-7cc7-46e0-a08c-c910aea40971')
order by s.updated_at desc
limit 80;
