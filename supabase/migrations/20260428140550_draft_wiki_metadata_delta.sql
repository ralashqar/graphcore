drop trigger if exists project_drafts_draft_change on public.project_drafts;
create trigger project_drafts_draft_change
after insert or update on public.project_drafts
for each row execute function app_private.record_draft_change('id', '', 'id');

alter function public.get_draft_delta(uuid, bigint, text) rename to get_draft_delta_v1;

create or replace function public.get_draft_delta(
  target_draft_id uuid,
  since_revision bigint default null,
  cache_schema_version text default 'world-cache-v2'
)
returns jsonb
language sql
set search_path = public, app_private
as $$
  select public.get_draft_delta_v1(
    target_draft_id,
    since_revision,
    case
      when cache_schema_version in ('world-cache-v1', 'world-cache-v2') then 'world-cache-v1'
      else cache_schema_version
    end
  );
$$;

grant execute on function public.get_draft_delta(uuid, bigint, text) to authenticated;
