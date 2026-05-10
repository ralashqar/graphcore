create index if not exists output_workflow_run_steps_run_order_idx
  on public.output_workflow_run_steps (run_id, order_index);

create index if not exists output_workflow_runs_draft_created_idx
  on public.output_workflow_runs (draft_id, created_at desc);

create index if not exists output_requests_draft_created_idx
  on public.output_requests (draft_id, created_at desc);
