select 'world_prompt_generation_jobs' as table_name, status::text as status, kind::text as kind, count(*)
from public.world_prompt_generation_jobs
where created_at >= now() - interval '2 hours'
group by status::text, kind::text
union all
select 'visual_generation_jobs' as table_name, status::text as status, kind::text as kind, count(*)
from public.visual_generation_jobs
where created_at >= now() - interval '2 hours'
group by status::text, kind::text
order by table_name, status, kind;

select id, status, kind, attempt_count, created_at, updated_at, heartbeat_at, started_at, completed_at, error_message,
       metadata->>'runtime' as runtime,
       metadata->>'currentStepId' as current_step_id
from public.world_prompt_generation_jobs
where created_at >= now() - interval '2 hours'
order by created_at desc
limit 10;

select job_id, step_key, phase, status, attempt_count, started_at, completed_at, heartbeat_at, error_message, updated_at
from public.world_prompt_generation_job_steps
where created_at >= now() - interval '2 hours'
order by created_at desc
limit 20;

select id, status, kind, provider, model, worker_id, attempt_count, created_at, updated_at, heartbeat_at, started_at, completed_at, error_message,
       target_keys->>'entityKey' as entity_key,
       target_keys->>'role' as role
from public.visual_generation_jobs
where created_at >= now() - interval '2 hours'
order by created_at desc
limit 30;
