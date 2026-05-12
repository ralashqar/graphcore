select
  r.id,
  r.project_id,
  r.draft_id,
  r.workflow_id,
  r.latest_run_id,
  r.output_kind,
  r.status,
  r.title,
  r.error_message,
  r.created_at,
  r.updated_at,
  wr.status as run_status,
  wr.updated_at as run_updated_at
from public.output_requests r
left join public.output_workflow_runs wr on wr.id = r.latest_run_id
order by r.updated_at desc
limit 20;
