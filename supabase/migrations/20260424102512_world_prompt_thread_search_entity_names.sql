create or replace function public.world_prompt_thread_linked_entity_text(
  p_draft_id uuid,
  p_linked_entity_keys text[]
)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(string_agg(
    trim(concat_ws(
      ' ',
      e.name,
      array_to_string(coalesce(e.aliases, '{}'::text[]), ' ')
    )),
    ' '
  ), '')
  from public.world_entities e
  where e.draft_id = p_draft_id
    and e.status <> 'archived'
    and e.key = any(coalesce(p_linked_entity_keys, '{}'::text[]))
$$;

create or replace function public.world_threads_refresh_search_document()
returns trigger
language plpgsql
as $$
begin
  new.search_document := public.world_prompt_search_document(
    concat_ws(
      ' ',
      coalesce(new.title, ''),
      coalesce(new.summary, ''),
      coalesce(array_to_string(coalesce(new.linked_entity_keys, '{}'::text[]), ' '), ''),
      public.world_prompt_thread_linked_entity_text(new.draft_id, new.linked_entity_keys)
    )
  );
  return new;
end
$$;

create or replace function public.refresh_world_thread_search_documents_for_entity()
returns trigger
language plpgsql
as $$
begin
  update public.world_threads wt
  set search_document = public.world_prompt_search_document(
    concat_ws(
      ' ',
      coalesce(wt.title, ''),
      coalesce(wt.summary, ''),
      coalesce(array_to_string(coalesce(wt.linked_entity_keys, '{}'::text[]), ' '), ''),
      public.world_prompt_thread_linked_entity_text(wt.draft_id, wt.linked_entity_keys)
    )
  )
  where wt.draft_id = new.draft_id
    and wt.status <> 'parked'
    and new.key = any(coalesce(wt.linked_entity_keys, '{}'::text[]));

  return new;
end
$$;

drop trigger if exists world_threads_refresh_search_document on public.world_threads;
create trigger world_threads_refresh_search_document
before insert or update of title, summary, linked_entity_keys
on public.world_threads
for each row execute function public.world_threads_refresh_search_document();

drop trigger if exists world_entities_refresh_linked_thread_search_document on public.world_entities;
create trigger world_entities_refresh_linked_thread_search_document
after insert or update of name, aliases, status
on public.world_entities
for each row execute function public.refresh_world_thread_search_documents_for_entity();

update public.world_threads wt
set search_document = public.world_prompt_search_document(
  concat_ws(
    ' ',
    coalesce(wt.title, ''),
    coalesce(wt.summary, ''),
    coalesce(array_to_string(coalesce(wt.linked_entity_keys, '{}'::text[]), ' '), ''),
    public.world_prompt_thread_linked_entity_text(wt.draft_id, wt.linked_entity_keys)
  )
);
