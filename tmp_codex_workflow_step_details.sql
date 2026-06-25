with recent_runs as (
  select req.id as request_id, req.title, req.metadata, req.latest_run_id
  from public.output_requests req
  where req.id in (
    '72fa24d0-b862-46ac-817d-a65050b32594', -- scene board prep
    'd3478906-c854-4408-93c4-90d95af39795', -- set ref
    'e33bac21-0b83-458a-9367-acdb0d458e9e', -- zone map
    '2861a5ad-da26-4373-8d5c-7de81f7e5c8d', -- spot atlas pre-fix
    'e632e1a5-025c-441e-b25a-01f17e021009', -- coverage intents
    '558dcbf7-b8a7-4412-a4ad-eb02e4a84749', -- coverage grid 1
    'e2049799-3f5c-4777-92d8-6d7f41b0b648'  -- coverage grid 2
  )
)
select
  rr.request_id,
  rr.title,
  rs.node_key,
  rs.status::text as step_status,
  rs.provider,
  rs.model,
  rs.provider_request_id,
  rs.outputs->'image'->>'assetKey' as image_asset_key,
  rs.outputs->'image'->>'width' as image_width,
  rs.outputs->'image'->>'height' as image_height,
  rs.outputs->'image'->>'referenceImageCount' as reference_count,
  rs.outputs->'image'->'selectedReferenceAssetKeys' as selected_reference_keys,
  rs.outputs->'image'->'referenceDiagnostics' as reference_diagnostics,
  left(coalesce(rs.outputs->>'prompt', rs.outputs->>'text', rs.outputs->'image'->>'prompt', ''), 700) as prompt_head
from recent_runs rr
join public.output_workflow_run_steps rs on rs.run_id = rr.latest_run_id
where rs.node_key in (
  'continuity_asset_prompt','continuity_asset_image','continuity_asset_artifact',
  'continuity_batch_prompt','continuity_batch_image','continuity_batch_extract','continuity_batch_artifact',
  'zone_coverage_board_prompt','zone_coverage_board_image','zone_coverage_board_extract','zone_coverage_board_artifact',
  'coverage_anchor_prompt','coverage_anchor_image','planned_keyframe_prompt','planned_keyframe_image'
)
order by rr.request_id, rs.created_at;
