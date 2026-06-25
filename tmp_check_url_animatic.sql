select id, status::text, title, output_kind::text, created_at, updated_at,
       metadata->>'screenplayAnimaticRole' as role,
       metadata->>'sequenceAnimaticMode' as mode,
       metadata->>'cinematicAnimaticMode' as cinematic_mode
from public.output_requests
where id = '6e49cd9a-41cb-497a-be88-9353cb13c4f9';
