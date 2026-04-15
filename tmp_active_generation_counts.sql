select 'cinematic_runs' as table_name, status, count(*) as row_count
from cinematic_runs
where status in ('queued', 'running')
group by status
union all
select 'cinematic_run_jobs' as table_name, status, count(*) as row_count
from cinematic_run_jobs
where status in ('queued', 'running')
group by status
union all
select 'mesh_generation_jobs' as table_name, status, count(*) as row_count
from mesh_generation_jobs
where status in ('queued', 'submitting', 'running')
group by status
union all
select 'world_build_batches' as table_name, status, count(*) as row_count
from world_build_batches
where status = 'running'
group by status
union all
select 'world_build_jobs' as table_name, status, count(*) as row_count
from world_build_jobs
where status in ('queued', 'running')
group by status
order by table_name, status;
