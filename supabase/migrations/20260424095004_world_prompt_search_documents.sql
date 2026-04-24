create or replace function public.world_prompt_search_document(value text)
returns tsvector
language sql
immutable
as $$
  select to_tsvector('simple'::regconfig, coalesce(value, ''))
$$;

alter table public.world_entities
add column if not exists search_document tsvector
default ''::tsvector;

alter table public.world_relationships
add column if not exists search_document tsvector
default ''::tsvector;

alter table public.world_threads
add column if not exists search_document tsvector
default ''::tsvector;

create or replace function public.world_entities_refresh_search_document()
returns trigger
language plpgsql
as $$
begin
  new.search_document := public.world_prompt_search_document(
    coalesce(new.name, '')
    || ' ' || coalesce(array_to_string(coalesce(new.aliases, '{}'::text[]), ' '), '')
    || ' ' || coalesce(array_to_string(coalesce(new.tags, '{}'::text[]), ' '), '')
    || ' ' || coalesce(new.summary, '')
    || ' ' || coalesce(new.context, '')
  );
  return new;
end
$$;

create or replace function public.world_relationships_refresh_search_document()
returns trigger
language plpgsql
as $$
begin
  new.search_document := public.world_prompt_search_document(
    coalesce(new.verb, '')
    || ' ' || coalesce(new.notes, '')
  );
  return new;
end
$$;

create or replace function public.world_threads_refresh_search_document()
returns trigger
language plpgsql
as $$
begin
  new.search_document := public.world_prompt_search_document(
    coalesce(new.title, '')
    || ' ' || coalesce(new.summary, '')
    || ' ' || coalesce(array_to_string(coalesce(new.linked_entity_keys, '{}'::text[]), ' '), '')
  );
  return new;
end
$$;

drop trigger if exists world_entities_refresh_search_document on public.world_entities;
create trigger world_entities_refresh_search_document
before insert or update of name, aliases, tags, summary, context
on public.world_entities
for each row execute function public.world_entities_refresh_search_document();

drop trigger if exists world_relationships_refresh_search_document on public.world_relationships;
create trigger world_relationships_refresh_search_document
before insert or update of verb, notes
on public.world_relationships
for each row execute function public.world_relationships_refresh_search_document();

drop trigger if exists world_threads_refresh_search_document on public.world_threads;
create trigger world_threads_refresh_search_document
before insert or update of title, summary, linked_entity_keys
on public.world_threads
for each row execute function public.world_threads_refresh_search_document();

update public.world_entities
set search_document = public.world_prompt_search_document(
  coalesce(name, '')
  || ' ' || coalesce(array_to_string(coalesce(aliases, '{}'::text[]), ' '), '')
  || ' ' || coalesce(array_to_string(coalesce(tags, '{}'::text[]), ' '), '')
  || ' ' || coalesce(summary, '')
  || ' ' || coalesce(context, '')
);

update public.world_relationships
set search_document = public.world_prompt_search_document(
  coalesce(verb, '')
  || ' ' || coalesce(notes, '')
);

update public.world_threads
set search_document = public.world_prompt_search_document(
  coalesce(title, '')
  || ' ' || coalesce(summary, '')
  || ' ' || coalesce(array_to_string(coalesce(linked_entity_keys, '{}'::text[]), ' '), '')
);

create index if not exists world_entities_search_document_idx
on public.world_entities using gin (search_document);

create index if not exists world_relationships_search_document_idx
on public.world_relationships using gin (search_document);

create index if not exists world_threads_search_document_idx
on public.world_threads using gin (search_document);

create or replace function public.world_prompt_search_resources(
  p_draft_id uuid,
  p_query text,
  p_limit integer default 12
)
returns table (
  resource_type text,
  resource_key text,
  score real,
  entity_key text,
  source_entity_key text,
  target_entity_key text,
  title text,
  summary text,
  linked_entity_keys text[]
)
language sql
stable
security invoker
set search_path = public
as $$
with normalized_query as (
  select websearch_to_tsquery(
    'simple',
    trim(regexp_replace(coalesce(p_query, ''), '[^[:alnum:]_\-\s]+', ' ', 'g'))
  ) as query
),
entity_hits as (
  select
    'entity'::text as resource_type,
    e.key as resource_key,
    ts_rank_cd(e.search_document, nq.query)::real as score,
    e.key as entity_key,
    null::text as source_entity_key,
    null::text as target_entity_key,
    e.name as title,
    left(concat_ws(' ', nullif(e.summary, ''), nullif(e.context, '')), 420) as summary,
    '{}'::text[] as linked_entity_keys
  from public.world_entities e
  cross join normalized_query nq
  where e.draft_id = p_draft_id
    and e.status <> 'archived'
    and numnode(nq.query) > 0
    and e.search_document @@ nq.query
),
relationship_hits as (
  select
    'relationship'::text as resource_type,
    wr.key as resource_key,
    ts_rank_cd(
      to_tsvector(
        'simple',
        concat_ws(
          ' ',
          coalesce(wr.verb, ''),
          coalesce(wr.notes, ''),
          coalesce(se.name, ''),
          array_to_string(coalesce(se.aliases, '{}'::text[]), ' '),
          coalesce(te.name, ''),
          array_to_string(coalesce(te.aliases, '{}'::text[]), ' ')
        )
      ),
      nq.query
    )::real as score,
    null::text as entity_key,
    se.key as source_entity_key,
    te.key as target_entity_key,
    concat(se.name, ' ', wr.verb, ' ', te.name) as title,
    left(coalesce(wr.notes, ''), 420) as summary,
    array[se.key, te.key]::text[] as linked_entity_keys
  from public.world_relationships wr
  join public.world_entities se on se.id = wr.source_entity_id
  join public.world_entities te on te.id = wr.target_entity_id
  cross join normalized_query nq
  where wr.draft_id = p_draft_id
    and se.draft_id = p_draft_id
    and te.draft_id = p_draft_id
    and se.status <> 'archived'
    and te.status <> 'archived'
    and numnode(nq.query) > 0
    and to_tsvector(
      'simple',
      concat_ws(
        ' ',
        coalesce(wr.verb, ''),
        coalesce(wr.notes, ''),
        coalesce(se.name, ''),
        array_to_string(coalesce(se.aliases, '{}'::text[]), ' '),
        coalesce(te.name, ''),
        array_to_string(coalesce(te.aliases, '{}'::text[]), ' ')
      )
    ) @@ nq.query
),
thread_hits as (
  select
    'thread'::text as resource_type,
    wt.key as resource_key,
    ts_rank_cd(wt.search_document, nq.query)::real as score,
    null::text as entity_key,
    null::text as source_entity_key,
    null::text as target_entity_key,
    wt.title as title,
    left(coalesce(wt.summary, ''), 420) as summary,
    wt.linked_entity_keys as linked_entity_keys
  from public.world_threads wt
  cross join normalized_query nq
  where wt.draft_id = p_draft_id
    and wt.status <> 'parked'
    and numnode(nq.query) > 0
    and wt.search_document @@ nq.query
)
select *
from (
  select * from entity_hits
  union all
  select * from relationship_hits
  union all
  select * from thread_hits
) search_hits
order by score desc, resource_type asc, title asc
limit greatest(coalesce(p_limit, 12), 1);
$$;
