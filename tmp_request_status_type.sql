select udt_name, data_type
from information_schema.columns
where table_schema='public' and table_name='output_requests' and column_name='status';

select distinct status::text as status
from public.output_requests
order by status;
