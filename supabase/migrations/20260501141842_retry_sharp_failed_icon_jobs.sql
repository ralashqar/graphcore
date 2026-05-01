update public.world_entity_icon_generation_jobs
set
  status = 'queued',
  heartbeat_at = null,
  error_message = null,
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'phase', 'retrying_after_worker_dependency_fix',
      'retryReason', 'sharp runtime dependency fixed',
      'retryQueuedAt', timezone('utc'::text, now())
    )
where status = 'failed'
  and provider = 'fal'
  and metadata ? 'falRequestId'
  and error_message ilike 'Could not load the "sharp" module%';
