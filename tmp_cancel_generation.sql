with cancelled_cinematic_runs as (
  update cinematic_runs
  set status = 'cancelled',
      diagnostics = '["Cancelled manually during webhook debugging."]'::jsonb,
      updated_at = timezone('utc', now())
  where status in ('queued', 'running')
  returning 'cinematic_run'::text as row_type, id::text as id, graph_key::text as label, status::text as new_status
), cancelled_cinematic_jobs as (
  update cinematic_run_jobs
  set status = 'cancelled',
      error_message = 'Cancelled manually during webhook debugging.',
      updated_at = timezone('utc', now())
  where status in ('queued', 'running')
  returning 'cinematic_job'::text as row_type, id::text as id, kind::text as label, status::text as new_status
), cancelled_world_build_batches as (
  update world_build_batches
  set status = 'cancelled',
      updated_at = timezone('utc', now())
  where status = 'running'
  returning 'world_build_batch'::text as row_type, id::text as id, coalesce(planner_mode, 'unknown')::text as label, status::text as new_status
), cancelled_world_build_jobs as (
  update world_build_jobs
  set status = 'cancelled',
      error_message = 'Cancelled manually during webhook debugging.',
      updated_at = timezone('utc', now())
  where status in ('queued', 'running')
  returning 'world_build_job'::text as row_type, id::text as id, kind::text as label, status::text as new_status
), cancelled_mesh_jobs as (
  update mesh_generation_jobs
  set status = 'cancelled',
      provider_status = 'CANCELLED',
      error_message = 'Cancelled manually during webhook debugging.',
      updated_at = timezone('utc', now())
  where status in ('queued', 'submitting', 'running')
  returning 'mesh_job'::text as row_type, id::text as id, definition_key::text as label, status::text as new_status
)
select * from cancelled_cinematic_runs
union all
select * from cancelled_cinematic_jobs
union all
select * from cancelled_world_build_batches
union all
select * from cancelled_world_build_jobs
union all
select * from cancelled_mesh_jobs
order by row_type, id;
