select
  a.id,
  a.run_id,
  a.key,
  a.kind::text as kind,
  a.asset_key,
  a.name,
  a.created_at,
  a.metadata->>'role' as artifact_role,
  a.metadata->>'screenplayAnimaticRole' as screenplay_role,
  a.metadata->>'targetNodeId' as target_node_id,
  a.metadata->>'nodeId' as node_id,
  a.metadata->>'batchId' as batch_id,
  a.metadata->>'batchKind' as batch_kind,
  left(a.metadata::text, 700) as metadata_head
from public.output_artifacts a
where a.run_id in (
  'ebb57999-55ad-4406-a941-001c0b999b05',
  '0863b61c-15db-4f60-94d3-690c053535bf',
  '67c1f1e0-2566-4dd6-9cbb-f547f0635249',
  'bd46f21e-3361-461d-9501-6986b2e32033',
  'bb580656-bf05-4669-8fe5-a50f8f4f92b6',
  'fb267ccb-9003-4740-a102-3380b1b06f59'
)
order by a.created_at desc;
