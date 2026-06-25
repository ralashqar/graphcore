create index if not exists output_requests_seq_anim_coverage_anchor_lookup_idx
  on public.output_requests (
    project_id,
    draft_id,
    parent_request_id,
    ((metadata ->> 'coverageSetupId')),
    created_at
  )
  where coalesce(metadata ->> 'screenplayAnimaticRole', metadata ->> 'sequenceAnimaticRole') = 'coverage_anchor'
    and coalesce((metadata ->> 'sequenceAnimaticStale')::boolean, false) = false;

create index if not exists output_requests_seq_anim_shot_production_lookup_idx
  on public.output_requests (
    project_id,
    draft_id,
    parent_request_id,
    ((metadata ->> 'shotId')),
    created_at
  )
  where coalesce(metadata ->> 'screenplayAnimaticRole', metadata ->> 'sequenceAnimaticRole') = 'shot_production'
    and coalesce((metadata ->> 'sequenceAnimaticStale')::boolean, false) = false;

create index if not exists output_requests_seq_anim_continuity_asset_lookup_idx
  on public.output_requests (
    project_id,
    draft_id,
    parent_request_id,
    ((metadata ->> 'assetIdentity')),
    created_at
  )
  where coalesce(metadata ->> 'screenplayAnimaticRole', metadata ->> 'sequenceAnimaticRole') = 'continuity_asset'
    and coalesce((metadata ->> 'sequenceAnimaticStale')::boolean, false) = false;

create index if not exists output_requests_seq_anim_continuity_batch_lookup_idx
  on public.output_requests (
    project_id,
    draft_id,
    parent_request_id,
    ((metadata ->> 'continuityBatchIdentity')),
    created_at
  )
  where coalesce(metadata ->> 'screenplayAnimaticRole', metadata ->> 'sequenceAnimaticRole') = 'continuity_asset_batch'
    and coalesce((metadata ->> 'sequenceAnimaticStale')::boolean, false) = false;
