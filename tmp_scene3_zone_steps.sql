select
  s.run_id,
  s.node_key,
  s.label,
  s.node_type::text as node_type,
  s.status::text as status,
  s.provider,
  s.model,
  s.provider_request_id,
  s.started_at,
  s.completed_at,
  s.error_message,
  left(s.outputs::text, 1200) as outputs_head
from public.output_workflow_run_steps s
where s.run_id in ('ebb57999-55ad-4406-a941-001c0b999b05','0863b61c-15db-4f60-94d3-690c053535bf','bd46f21e-3361-461d-9501-6986b2e32033')
order by s.run_id, s.updated_at;
