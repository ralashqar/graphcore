select id, job_id, step_key, phase, status, attempt_count, started_at, completed_at, heartbeat_at, error_message, updated_at
from public.world_prompt_generation_job_steps
where job_id = '5b6a227f-0ee0-4680-9267-d4c0269ce8df'
order by order_index;

select id, status, kind, attempt_count, created_at, updated_at, heartbeat_at, started_at, completed_at, error_message, metadata
from public.world_prompt_generation_jobs
where id = '5b6a227f-0ee0-4680-9267-d4c0269ce8df';
