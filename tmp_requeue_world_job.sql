begin;
update public.world_prompt_generation_job_steps
set status = 'queued',
    heartbeat_at = null,
    error_message = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('requeuedAfterWorkerRestartAt', timezone('utc'::text, now()), 'requeueReason', 'worker_restart_after_claim')
where job_id = '5b6a227f-0ee0-4680-9267-d4c0269ce8df'
  and step_key = 'full_stream'
  and status = 'running'
  and heartbeat_at <= timezone('utc'::text, now()) - interval '1 minute';

update public.world_prompt_generation_jobs
set status = 'queued',
    heartbeat_at = null,
    error_message = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('requeuedAfterWorkerRestartAt', timezone('utc'::text, now()), 'requeueReason', 'worker_restart_after_claim')
where id = '5b6a227f-0ee0-4680-9267-d4c0269ce8df'
  and status = 'running'
  and heartbeat_at <= timezone('utc'::text, now()) - interval '1 minute';
commit;

select id, status::text, kind, heartbeat_at, updated_at, metadata->>'requeueReason' as requeue_reason
from public.world_prompt_generation_jobs
where id = '5b6a227f-0ee0-4680-9267-d4c0269ce8df';
