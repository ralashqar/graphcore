alter function public.get_draft_delta(uuid, bigint, text)
  security definer;

alter function public.get_draft_delta(uuid, bigint, text)
  set search_path = public, app_private, pg_temp;

revoke all on function public.get_draft_delta(uuid, bigint, text) from public;
grant execute on function public.get_draft_delta(uuid, bigint, text) to authenticated;
