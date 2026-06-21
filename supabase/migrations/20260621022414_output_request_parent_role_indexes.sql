create index if not exists output_requests_parent_created_idx
  on public.output_requests (parent_request_id, created_at)
  where parent_request_id is not null;

create index if not exists output_requests_parent_screenplay_role_created_idx
  on public.output_requests (parent_request_id, ((metadata ->> 'screenplayAnimaticRole')), created_at)
  where parent_request_id is not null;

create index if not exists output_requests_parent_sequence_role_created_idx
  on public.output_requests (parent_request_id, ((metadata ->> 'sequenceAnimaticRole')), created_at)
  where parent_request_id is not null;
