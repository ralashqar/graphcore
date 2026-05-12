create or replace function public.claim_visual_generation_job(
  worker_id text,
  openai_running_limit integer default 8
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_job_id uuid;
  now_at timestamptz := timezone('utc'::text, now());
  openai_limit integer := greatest(coalesce(openai_running_limit, 8), 1);
begin
  if worker_id is null or length(trim(worker_id)) = 0 then
    raise exception 'worker_id is required';
  end if;

  with provider_capacity as (
    select count(*)::integer as active_openai_jobs
    from public.visual_generation_jobs
    where provider = 'openai'
      and status = 'running'
      and coalesce(heartbeat_at, updated_at, created_at) >= now_at - interval '5 minutes'
  ),
  candidate as (
    select job.id
    from public.visual_generation_jobs job
    cross join provider_capacity capacity
    where (
        job.status = 'queued'
        or (
          job.status = 'running'
          and coalesce(job.heartbeat_at, job.updated_at, job.created_at) < now_at - interval '5 minutes'
        )
      )
      and (
        job.provider <> 'openai'
        or capacity.active_openai_jobs < openai_limit
        or (
          job.status = 'running'
          and coalesce(job.heartbeat_at, job.updated_at, job.created_at) < now_at - interval '5 minutes'
        )
      )
    order by
      case
        when job.kind = 'wiki_visual'
          and coalesce(job.target_keys->>'role', job.input->>'role') = 'world_concept_image'
          then 0
        else 1
      end,
      job.created_at asc
    for update of job skip locked
    limit 1
  )
  update public.visual_generation_jobs job
  set
    status = 'running',
    worker_id = trim(claim_visual_generation_job.worker_id),
    attempt_count = job.attempt_count + 1,
    started_at = coalesce(job.started_at, now_at),
    heartbeat_at = now_at,
    error_message = null,
    metadata = coalesce(job.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'workerId', trim(claim_visual_generation_job.worker_id),
        'claimedAt', now_at,
        'openAiRunningLimit', openai_limit
      )
  from candidate
  where job.id = candidate.id
  returning job.id into claimed_job_id;

  return claimed_job_id;
end;
$$;

revoke all on function public.claim_visual_generation_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_visual_generation_job(text, integer) to service_role;
