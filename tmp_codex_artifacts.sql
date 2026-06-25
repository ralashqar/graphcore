select
  a.id,
  a.run_id,
  a.node_id,
  a.key,
  a.name,
  a.kind,
  a.asset_key,
  a.mime_type,
  a.summary,
  a.metadata->>'role' as role,
  a.metadata->>'contractVersion' as contract_version,
  a.metadata->'sceneContinuityManifest'->>'status' as manifest_status,
  jsonb_array_length(coalesce(a.metadata->'sceneContinuityManifest'->'shotReadiness','[]'::jsonb)) as manifest_shot_count,
  jsonb_array_length(coalesce(a.metadata->'sceneContinuityManifest'->'blockers','[]'::jsonb)) as manifest_blocker_count,
  left(a.metadata::text, 1200) as metadata_head,
  a.created_at
from public.output_artifacts a
where a.created_at >= now() - interval '24 hours'
  and (
    a.metadata::text ilike '%scene_continuity_manifest%'
    or a.metadata::text ilike '%shotReferenceReadiness%'
    or a.metadata::text ilike '%coverage_anchor%'
    or a.metadata::text ilike '%zone_coverage%'
    or a.metadata::text ilike '%continuity_asset%'
  )
order by a.created_at desc
limit 80;
