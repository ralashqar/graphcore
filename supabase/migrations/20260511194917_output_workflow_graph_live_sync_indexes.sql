create index if not exists output_workflow_run_steps_run_order_idx
  on public.output_workflow_run_steps (run_id, order_index);

create index if not exists output_workflow_run_steps_run_updated_idx
  on public.output_workflow_run_steps (run_id, updated_at desc);

create index if not exists output_workflow_nodes_workflow_updated_idx
  on public.output_workflow_nodes (workflow_id, updated_at desc);

create index if not exists output_workflow_edges_workflow_updated_idx
  on public.output_workflow_edges (workflow_id, updated_at desc);

create index if not exists output_artifacts_workflow_updated_idx
  on public.output_artifacts (workflow_id, updated_at desc);
