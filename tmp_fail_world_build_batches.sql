update world_build_batches
set status = 'failed',
    updated_at = timezone('utc', now())
where status = 'running'
returning id, planner_mode, status, updated_at;
