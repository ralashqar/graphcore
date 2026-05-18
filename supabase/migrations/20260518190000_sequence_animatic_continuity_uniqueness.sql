create unique index if not exists output_requests_sequence_animatic_continuity_unique_idx
  on public.output_requests (
    parent_request_id
  )
  where parent_request_id is not null
    and coalesce(metadata ->> 'sequenceAnimaticRole', metadata ->> 'screenplayAnimaticRole') = 'continuity_pack'
    and coalesce((metadata ->> 'sequenceAnimaticStale')::boolean, false) = false;
