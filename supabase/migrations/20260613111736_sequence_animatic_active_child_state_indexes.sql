create index if not exists output_requests_seq_anim_active_child_parent_created_idx
  on public.output_requests (
    project_id,
    draft_id,
    parent_request_id,
    created_at
  )
  where parent_request_id is not null
    and coalesce((metadata ->> 'sequenceAnimaticStale')::boolean, false) = false;
