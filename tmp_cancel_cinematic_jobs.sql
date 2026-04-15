update cinematic_run_jobs
set status = 'cancelled',
    error_message = 'Cancelled manually during debugging.',
    updated_at = timezone('utc', now())
where status in ('queued', 'running')
returning id, run_id, kind, status, provider_request_id, updated_at;
