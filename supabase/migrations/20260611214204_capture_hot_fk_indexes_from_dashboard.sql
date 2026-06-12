-- Capture FK indexes that were added directly in the Supabase dashboard AI
-- agent so local migrations remain the source of truth. These are intentionally
-- idempotent because production already has the indexes.

create index if not exists idx_output_request_events_draft_id
  on public.output_request_events (draft_id);
create index if not exists idx_output_request_events_project_id
  on public.output_request_events (project_id);
create index if not exists idx_output_request_events_request_id
  on public.output_request_events (request_id);
create index if not exists idx_output_request_events_run_id
  on public.output_request_events (run_id);
create index if not exists idx_output_request_events_workflow_id
  on public.output_request_events (workflow_id);

create index if not exists idx_output_request_status_projections_draft_id
  on public.output_request_status_projections (draft_id);
create index if not exists idx_output_request_status_projections_latest_run_id
  on public.output_request_status_projections (latest_run_id);
create index if not exists idx_output_request_status_projections_project_id
  on public.output_request_status_projections (project_id);
create index if not exists idx_output_request_status_projections_request_id
  on public.output_request_status_projections (request_id);
create index if not exists idx_output_request_status_projections_workflow_id
  on public.output_request_status_projections (workflow_id);

create index if not exists idx_output_requests_draft_id
  on public.output_requests (draft_id);
create index if not exists idx_output_requests_latest_run_id
  on public.output_requests (latest_run_id);
create index if not exists idx_output_requests_parent_request_id
  on public.output_requests (parent_request_id);
create index if not exists idx_output_requests_project_id
  on public.output_requests (project_id);
create index if not exists idx_output_requests_requested_by
  on public.output_requests (requested_by);
create index if not exists idx_output_requests_workflow_id
  on public.output_requests (workflow_id);

create index if not exists idx_output_workflow_run_steps_draft_id
  on public.output_workflow_run_steps (draft_id);
create index if not exists idx_output_workflow_run_steps_node_id
  on public.output_workflow_run_steps (node_id);
create index if not exists idx_output_workflow_run_steps_run_id
  on public.output_workflow_run_steps (run_id);
create index if not exists idx_output_workflow_run_steps_workflow_id
  on public.output_workflow_run_steps (workflow_id);

create index if not exists idx_output_workflow_runs_draft_id
  on public.output_workflow_runs (draft_id);
create index if not exists idx_output_workflow_runs_project_id
  on public.output_workflow_runs (project_id);
create index if not exists idx_output_workflow_runs_requested_by
  on public.output_workflow_runs (requested_by);
create index if not exists idx_output_workflow_runs_workflow_id
  on public.output_workflow_runs (workflow_id);

create index if not exists idx_user_workspace_state_active_draft_id
  on public.user_workspace_state (active_draft_id);
create index if not exists idx_user_workspace_state_active_project_id
  on public.user_workspace_state (active_project_id);
create index if not exists idx_user_workspace_state_user_id
  on public.user_workspace_state (user_id);

create index if not exists idx_world_prompt_generation_job_steps_draft_id
  on public.world_prompt_generation_job_steps (draft_id);
create index if not exists idx_world_prompt_generation_job_steps_job_id
  on public.world_prompt_generation_job_steps (job_id);
create index if not exists idx_world_prompt_generation_job_steps_session_id
  on public.world_prompt_generation_job_steps (session_id);
create index if not exists idx_world_prompt_generation_job_steps_turn_id
  on public.world_prompt_generation_job_steps (turn_id);

create index if not exists idx_world_prompt_generation_jobs_draft_id
  on public.world_prompt_generation_jobs (draft_id);
create index if not exists idx_world_prompt_generation_jobs_session_id
  on public.world_prompt_generation_jobs (session_id);
create index if not exists idx_world_prompt_generation_jobs_turn_id
  on public.world_prompt_generation_jobs (turn_id);

create index if not exists idx_world_prompt_messages_draft_id
  on public.world_prompt_messages (draft_id);
create index if not exists idx_world_prompt_messages_session_id
  on public.world_prompt_messages (session_id);
create index if not exists idx_world_prompt_messages_turn_id
  on public.world_prompt_messages (turn_id);

create index if not exists idx_world_prompt_suggestions_draft_id
  on public.world_prompt_suggestions (draft_id);
create index if not exists idx_world_prompt_suggestions_session_id
  on public.world_prompt_suggestions (session_id);
create index if not exists idx_world_prompt_suggestions_turn_id
  on public.world_prompt_suggestions (turn_id);
create index if not exists idx_world_prompt_suggestions_used_turn_id
  on public.world_prompt_suggestions (used_turn_id);

create index if not exists idx_world_threads_draft_id
  on public.world_threads (draft_id);
create index if not exists idx_world_threads_last_turn_id
  on public.world_threads (last_turn_id);
create index if not exists idx_world_threads_source_turn_id
  on public.world_threads (source_turn_id);
