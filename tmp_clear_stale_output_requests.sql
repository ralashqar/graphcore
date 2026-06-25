with stale as (
  select req.id, run.status::text as run_status, coalesce(run.error_message, run.error, run.last_error, 'Latest workflow run ended without completing.') as run_error
  from public.output_requests req
  join public.output_workflow_runs run on run.id = req.latest_run_id
  where req.id in ('d991cafe-bd95-441b-8ba7-7bb947eb4a3d','e3276ee5-ae37-4ecc-9e3c-6de54f2da8b8')
    and req.status = 'running'
    and run.status in ('failed','cancelled','completed_with_errors')
), updated as (
  update public.output_requests req
  set status = 'failed',
      error_message = stale.run_error,
      updated_at = timezone('utc', now()),
      metadata = coalesce(req.metadata, '{}'::jsonb) || jsonb_build_object(
        'staleRunningStatusClearedAt', timezone('utc', now()),
        'staleRunningStatusReason', 'latest_run_' || stale.run_status
      )
  from stale
  where req.id = stale.id
  returning req.id, req.status::text as new_status, req.error_message
)
select * from updated;
