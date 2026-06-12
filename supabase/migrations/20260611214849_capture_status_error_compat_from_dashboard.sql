-- Capture compatibility fixes that were applied directly in the Supabase
-- dashboard so migrations remain the source of truth.

alter type public.output_workflow_run_status add value if not exists 'succeeded';

alter type public.cinematic_run_job_status add value if not exists 'completed';
alter type public.cinematic_run_job_status add value if not exists 'completed_with_errors';

alter table public.output_workflow_runs
  add column if not exists error text,
  add column if not exists last_error text;

update public.output_workflow_runs
set
  error = coalesce(error, error_message),
  last_error = coalesce(last_error, error_message)
where error is null
  or last_error is null;

create or replace function public.sync_output_workflow_run_error_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.error_message := coalesce(new.error_message, new.error, new.last_error);
  new.error := coalesce(new.error, new.error_message, new.last_error);
  new.last_error := coalesce(new.last_error, new.error_message, new.error);
  return new;
end;
$$;

revoke all on function public.sync_output_workflow_run_error_fields() from public, anon, authenticated;
grant execute on function public.sync_output_workflow_run_error_fields() to service_role;

drop trigger if exists trg_sync_output_workflow_run_error_fields on public.output_workflow_runs;
create trigger trg_sync_output_workflow_run_error_fields
  before insert or update on public.output_workflow_runs
  for each row
  execute function public.sync_output_workflow_run_error_fields();
