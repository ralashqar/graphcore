create index if not exists output_workflow_run_steps_provider_request_id_idx
  on public.output_workflow_run_steps (provider_request_id)
  where provider_request_id is not null;

create index if not exists output_workflow_run_steps_fal_request_id_metadata_idx
  on public.output_workflow_run_steps ((metadata->>'falRequestId'))
  where metadata ? 'falRequestId';

create index if not exists visual_generation_jobs_fal_request_id_metadata_idx
  on public.visual_generation_jobs ((metadata->>'falRequestId'))
  where metadata ? 'falRequestId';
