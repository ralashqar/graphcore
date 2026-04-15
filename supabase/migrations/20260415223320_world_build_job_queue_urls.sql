alter table public.world_build_jobs
  add column if not exists provider_request_id text,
  add column if not exists status_url text,
  add column if not exists response_url text,
  add column if not exists cancel_url text;

create index if not exists world_build_jobs_provider_request_idx
  on public.world_build_jobs (provider_request_id)
  where provider_request_id is not null;

update public.world_build_jobs
set
  provider_request_id = coalesce(provider_request_id, nullif(result_context->>'providerRequestId', '')),
  status_url = coalesce(status_url, nullif(result_context->>'statusUrl', '')),
  response_url = coalesce(response_url, nullif(result_context->>'responseUrl', '')),
  cancel_url = coalesce(cancel_url, nullif(result_context->>'cancelUrl', ''))
where
  provider_request_id is null
  or status_url is null
  or response_url is null
  or cancel_url is null;
