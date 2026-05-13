select id, status::text, kind, attempt_count, created_at, updated_at, heartbeat_at, started_at, completed_at, error_message,
       metadata->>'workerId' as worker_id,
       metadata->>'runtime' as runtime
from public.world_prompt_generation_jobs
where id = '5b6a227f-0ee0-4680-9267-d4c0269ce8df';

select id, step_key, phase, status::text, attempt_count, started_at, completed_at, heartbeat_at, error_message,
       metadata->>'workerId' as worker_id
from public.world_prompt_generation_job_steps
where job_id = '5b6a227f-0ee0-4680-9267-d4c0269ce8df'
order by order_index;

select id, status::text, kind::text, provider, worker_id, attempt_count, created_at, updated_at, heartbeat_at, error_message,
       target_keys->>'entityKey' as entity_key,
       target_keys->>'role' as role
from public.visual_generation_jobs
where created_at >= now() - interval '90 minutes'
  and status in ('queued','running','failed')
order by created_at desc
limit 15;
