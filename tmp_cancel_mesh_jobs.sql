update mesh_generation_jobs
set status = 'cancelled',
    provider_status = 'CANCELLED',
    error_message = 'Cancelled manually during debugging.',
    updated_at = timezone('utc', now())
where status in ('queued', 'submitting', 'running')
returning id, definition_key, status, provider_request_id, updated_at;
