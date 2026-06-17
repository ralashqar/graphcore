select t.typname as enum_name, e.enumlabel
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname in ('output_request_status','output_workflow_run_status','output_workflow_step_status')
order by t.typname, e.enumsortorder;
