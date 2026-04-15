update cinematic_runs
set status = 'cancelled',
    diagnostics = '["Cancelled manually during debugging."]'::jsonb,
    updated_at = timezone('utc', now())
where status in ('queued', 'running')
returning id, graph_key, mode, status, updated_at;
