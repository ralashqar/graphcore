create unique index if not exists output_requests_sequence_animatic_block_unique_idx
  on public.output_requests (
    parent_request_id,
    ((metadata ->> 'storyboardBlockId'))
  )
  where parent_request_id is not null
    and coalesce(metadata ->> 'sequenceAnimaticRole', metadata ->> 'screenplayAnimaticRole') = 'storyboard_block'
    and coalesce((metadata ->> 'sequenceAnimaticStale')::boolean, false) = false;

create unique index if not exists output_requests_sequence_animatic_shot_unique_idx
  on public.output_requests (
    parent_request_id,
    ((metadata ->> 'shotId'))
  )
  where parent_request_id is not null
    and coalesce(metadata ->> 'sequenceAnimaticRole', metadata ->> 'screenplayAnimaticRole') = 'shot_video'
    and coalesce((metadata ->> 'sequenceAnimaticStale')::boolean, false) = false;
