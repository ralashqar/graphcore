create or replace function public.claim_visual_generation_job(worker_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_job_id uuid;
  now_at timestamptz := timezone('utc'::text, now());
  p_worker_id text := trim(claim_visual_generation_job.worker_id);
begin
  if p_worker_id is null or length(p_worker_id) = 0 then
    raise exception 'worker_id is required';
  end if;

  with candidate as (
    select id
    from public.visual_generation_jobs
    where status = 'queued'
      or (
        status = 'running'
        and coalesce(heartbeat_at, updated_at, created_at) < now_at - interval '5 minutes'
      )
    order by
      case
        when kind = 'wiki_visual'
          and coalesce(target_keys->>'role', input->>'role') = 'world_concept_image'
          then 0
        else 1
      end,
      created_at asc
    for update skip locked
    limit 1
  )
  update public.visual_generation_jobs as job
  set
    status = 'running',
    worker_id = p_worker_id,
    attempt_count = job.attempt_count + 1,
    started_at = coalesce(job.started_at, now_at),
    heartbeat_at = now_at,
    error_message = null,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || jsonb_build_object('workerId', p_worker_id, 'claimedAt', now_at)
  from candidate
  where job.id = candidate.id
  returning job.id into claimed_job_id;

  return claimed_job_id;
end;
$$;
