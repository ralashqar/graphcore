select id, status, kind, provider, worker_id, attempt_count, created_at, updated_at, heartbeat_at, started_at, completed_at, error_message,
       target_keys->>'entityKey' as entity_key,
       target_keys->>'role' as role
from public.visual_generation_jobs
where created_at >= now() - interval '90 minutes'
  and status in ('queued','running','failed')
order by created_at desc
limit 20;

select id, status, kind, attempt_count, created_at, updated_at, heartbeat_at, started_at, completed_at, error_message,
       metadata->>'runtime' as runtime
from public.world_prompt_generation_jobs
where created_at >= now() - interval '90 minutes'
  and status in ('queued','running','failed')
order by created_at desc
limit 10;
