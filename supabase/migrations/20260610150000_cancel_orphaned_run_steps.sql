-- Janitor for orphaned run steps.
--
-- A worker executing a run that gets reclaimed or terminally failed elsewhere
-- ("zombie" executor) can still write step rows back to queued/running after
-- the run itself reached a terminal status. fail/cancel RPCs already settle
-- steps at the moment the run terminates, but writes landing afterwards stick
-- forever and UIs render them as eternally-loading nodes.
--
-- This sweep cancels queued/running steps whose parent run has been terminal
-- for longer than a grace period. Called from the Fly worker maintenance loop.

create or replace function public.cancel_orphaned_output_workflow_run_steps(
  grace_minutes integer default 10
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := timezone('utc'::text, now());
  affected integer := 0;
begin
  update public.output_workflow_run_steps as step
  set
    status = 'cancelled',
    completed_at = now_at,
    error_message = coalesce(
      nullif(step.error_message, ''),
      'Run ended before this step completed (orphaned step swept).'
    )
  from public.output_workflow_runs as run
  where run.id = step.run_id
    and step.status in ('queued', 'running')
    and run.status in ('failed', 'cancelled', 'completed', 'completed_with_errors')
    and coalesce(run.completed_at, run.updated_at) < now_at - (grace_minutes || ' minutes')::interval;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.cancel_orphaned_output_workflow_run_steps(integer) from public;
revoke all on function public.cancel_orphaned_output_workflow_run_steps(integer) from anon;
revoke all on function public.cancel_orphaned_output_workflow_run_steps(integer) from authenticated;
grant execute on function public.cancel_orphaned_output_workflow_run_steps(integer) to service_role;
