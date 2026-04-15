update world_build_jobs
set status = 'failed',
    error_message = 'Stopped manually during debugging.',
    updated_at = timezone('utc', now())
where status in ('queued', 'running')
returning id, batch_id, kind, status, updated_at;
