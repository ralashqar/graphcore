select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name in ('world_prompt_generation_jobs','visual_generation_jobs','world_prompt_generation_job_steps')
order by table_name, ordinal_position;
