alter table public.output_requests
  add column if not exists parent_request_id uuid
  references public.output_requests(id) on delete cascade;

create index if not exists output_requests_parent_request_idx
  on public.output_requests(parent_request_id)
  where parent_request_id is not null;
