select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('output_workflow_runs','output_workflow_run_steps')
order by table_name, ordinal_position;
