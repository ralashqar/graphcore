-- Drop exact duplicate non-unique indexes after capturing the dashboard-created
-- FK index names. Keep the clearer/canonical names used by the latest
-- migrations and remove hashed or superseded duplicates.

drop index if exists public.idx_fk_022f2c2deedb2b59;
drop index if exists public.idx_fk_3e4bdbaa418d02aa;
drop index if exists public.idx_fk_8ef9ac51117894a4;

drop index if exists public.output_workflow_run_steps_run_idx;
drop index if exists public.output_workflow_runs_draft_idx;

drop index if exists public.world_prompt_generation_jobs_turn_idx;
drop index if exists public.world_prompt_suggestions_turn_idx;
