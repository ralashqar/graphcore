-- Living storefront evidence never writes paid allocation or financial records.
alter table public.city_follows add column created_at timestamptz not null default now();
create table public.city_content_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references city_businesses(id),
 kind text not null check(kind in ('business_update','deal_published','launch_published','sold_out','organic_milestone')),
 source_key text not null unique, content_key text, title text not null, business_name text not null,
 destination text not null, evidence jsonb not null default '{}', created_at timestamptz not null default now()
);
create index city_content_events_business on city_content_events(business_id,created_at desc);
create table public.city_launch_reminders(user_id uuid references auth.users(id) on delete cascade, launch_id uuid references city_discovery_entries(id) on delete cascade, created_at timestamptz not null default now(), primary key(user_id,launch_id));
create table public.city_inbox_receipts(user_id uuid references auth.users(id) on delete cascade, item_key text not null check(length(item_key)<=200), read_at timestamptz not null default now(), primary key(user_id,item_key));
alter table city_content_events enable row level security;
alter table city_launch_reminders enable row level security;
alter table city_inbox_receipts enable row level security;
revoke all on city_content_events,city_launch_reminders,city_inbox_receipts from public,anon,authenticated;
grant select,insert on city_content_events to service_role;
grant all on city_launch_reminders,city_inbox_receipts to service_role;
create function public.city_content_immutable() returns trigger language plpgsql as $$ begin raise exception 'Content history is immutable'; end $$;
create trigger city_content_immutable before update or delete on city_content_events for each row execute function city_content_immutable();

create function public.city_capture_content() returns trigger language plpgsql security invoker set search_path=public as $$
declare b city_businesses; k text; ck text; t text; dest text; fingerprint text; ev jsonb:='{}'; oldj jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
 if tg_table_name='city_businesses' then
   if new.published is null or new.status='suspended' or new.published is not distinct from oldj->'published' then return new; end if;
   b:=new;k:='business_update';t:='Storefront updated';dest:='/city/business/'||b.slug;fingerprint:=md5(new.published::text);
 elsif tg_table_name='city_discovery_entries' then
   if new.kind<>'launch' or new.status<>'published' or new.published is null or (new.published is not distinct from oldj->'published' and oldj->>'status'='published') then return new; end if;
   select * into b from city_businesses where id=new.business_id;
   k:='launch_published';ck:='launch:'||new.id;t:=new.published->>'title';dest:='/city/launches/'||new.slug;fingerprint:=new.id||':'||md5(new.published::text);ev:=jsonb_build_object('startsAt',new.published->>'startsAt','endsAt',new.published->>'endsAt');
 else
   if new.status<>'approved' then return new; end if;
   select * into b from city_businesses where id=new.business_id;
   ck:='deal:'||new.id;t:=new.terms->>'title';dest:='/city/deal/'||new.id;
   if new.quantity>0 and new.issued>=new.quantity and new.issued>coalesce((oldj->>'issued')::integer,0) then
     k:='sold_out';fingerprint:=new.id||':'||new.quantity;ev:=jsonb_build_object('issued',new.issued,'quantity',new.quantity);
   elsif oldj->>'status' is distinct from 'approved' then k:='deal_published';fingerprint:=new.id||':'||md5(new.terms::text);
   else return new; end if;
 end if;
 if b.published is null or b.status='suspended' then return new; end if;
 insert into city_content_events(business_id,kind,source_key,content_key,title,business_name,destination,evidence)
 values(b.id,k,k||':'||b.id||':'||fingerprint,ck,t,b.published->>'name',dest,ev) on conflict do nothing;
 return new;
end $$;
create trigger city_content_business after insert or update on city_businesses for each row execute function city_capture_content();
create trigger city_content_launch after insert or update on city_discovery_entries for each row execute function city_capture_content();
create trigger city_content_deal after insert or update on city_deals for each row execute function city_capture_content();

create function public.city_activity_summary(p_ids uuid[]) returns table(business_id uuid,actors bigint,score numeric)
language sql stable security invoker set search_path=public as $$
 select a.business_id,count(distinct a.actor),sum((case a.kind when 'property_open' then 1 when 'deal_open' then 2 when 'save' then 3 else 6 end)*power(0.5,greatest(0,extract(epoch from (to_timestamp(floor(extract(epoch from now())/300)*300)-a.created_at)))/21600))
 from city_customer_activity a join city_businesses b on b.id=a.business_id
 where a.business_id=any(p_ids) and a.created_at>=now()-interval '48 hours' and a.actor<>'u:'||b.owner_id::text
 and b.published is not null and b.status<>'suspended' group by a.business_id;
$$;
create function public.city_capture_milestone() returns trigger language plpgsql security invoker set search_path=public as $$
declare a record; b city_businesses;
begin
 select * into a from city_activity_summary(array[new.business_id]);
 if a.actors>=5 and a.score>=60 then
 select * into b from city_businesses where id=new.business_id;
 insert into city_content_events(business_id,kind,source_key,title,business_name,destination,evidence)
 values(b.id,'organic_milestone','organic:'||b.id||':'||current_date,'Very busy through customer activity',b.published->>'name','/city/business/'||b.slug,jsonb_build_object('policy',1,'windowHours',48,'score',a.score,'band','very_busy')) on conflict do nothing;
 end if;return new;
end $$;
create trigger city_content_milestone after insert on city_customer_activity for each row execute function city_capture_milestone();

create function public.city_living_content(p_ids uuid[],p_deals boolean,p_launches boolean) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(c)-'document'||jsonb_build_object('sold_out_at',case when c.kind='deal' then (select max(e.created_at) from city_content_events e where e.content_key=c.key and e.kind='sold_out') end)),'[]')
 from city_customer_content c where c.business_id=any(p_ids) and c.ends_at>now() and ((p_launches and c.kind='launch') or (p_deals and c.kind='deal' and exists(select 1 from city_deals d where d.id::text=c.content_id and not d.paused and not d.ended)));
$$;
create function public.city_living_inbox(p_user uuid,p_deals boolean,p_launches boolean,p_activity boolean,p_offset integer default 0) returns jsonb language sql stable security invoker set search_path=public as $$
 with items as (
 select 'event:'||e.id as key,e.business_id,e.title,e.business_name,e.destination,e.kind,e.created_at as at,e.evidence
 from city_content_events e join city_follows f on f.business_id=e.business_id and f.user_id=p_user join city_businesses b on b.id=e.business_id
 where b.published is not null and b.status<>'suspended' and e.created_at>=greatest(f.created_at,now()-interval '30 days')
 and (e.kind='business_update' or (p_activity and e.kind='organic_milestone') or (e.kind in ('deal_published','sold_out') and p_deals and exists(select 1 from city_deals d where 'deal:'||d.id=e.content_key and d.status='approved' and not d.paused and not d.ended and (d.terms->>'endsAt')::timestamptz>now())) or (e.kind='launch_published' and p_launches and exists(select 1 from city_customer_content c where c.key=e.content_key and c.available)))
 union all
 select 'reminder:'||e.id||':'||md5(e.published->>'startsAt'),e.business_id,e.published->>'title',b.published->>'name','/city/launches/'||e.slug,'launch_reminder',(e.published->>'startsAt')::timestamptz,'{}'::jsonb
 from city_launch_reminders r join city_discovery_entries e on e.id=r.launch_id join city_businesses b on b.id=e.business_id
 where r.user_id=p_user and p_launches and e.status='published' and b.published is not null and b.status<>'suspended' and (e.published->>'startsAt')::timestamptz<=now() and (e.published->>'endsAt')::timestamptz>now()
 ), marked as(select i.*,r.read_at from items i left join city_inbox_receipts r on r.user_id=p_user and r.item_key=i.key), page as(select * from marked order by at desc,key limit 40 offset least(greatest(p_offset,0),10000))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'unread',(select count(*) from marked where read_at is null),'total',(select count(*) from marked),'reminders',coalesce((select jsonb_agg(launch_id) from city_launch_reminders where user_id=p_user),'[]'),'follows',coalesce((select jsonb_agg(business_id) from city_follows where user_id=p_user),'[]'));
$$;
create function public.city_living_preference(p_user uuid,p_launch uuid,p_enabled boolean) returns void language plpgsql security invoker set search_path=public as $$
begin
 if p_user is null then raise exception 'Sign in required';end if;
 if not p_enabled then delete from city_launch_reminders where user_id=p_user and launch_id=p_launch;return;end if;
 if not exists(select 1 from city_customer_content where kind='launch' and content_id=p_launch::text and available) then raise exception 'Launch unavailable';end if;
 insert into city_launch_reminders values(p_user,p_launch,now()) on conflict do nothing;
end $$;
revoke all on function city_content_immutable(),city_capture_content(),city_activity_summary(uuid[]),city_capture_milestone(),city_living_content(uuid[],boolean,boolean),city_living_inbox(uuid,boolean,boolean,boolean,integer),city_living_preference(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function city_content_immutable(),city_capture_content(),city_activity_summary(uuid[]),city_capture_milestone(),city_living_content(uuid[],boolean,boolean),city_living_inbox(uuid,boolean,boolean,boolean,integer),city_living_preference(uuid,uuid,boolean) to service_role;

create or replace function public.city_customer_search(p_query text default '',p_filter text default 'all',p_category text default '',p_offset integer default 0,p_deals boolean default false,p_campus boolean default false)
returns jsonb language sql stable security invoker set search_path=public as $$
with clock as (select to_timestamp(floor(extract(epoch from now())/300)*300) as at),
 scores as (
 select business_id,count(distinct actor) as actors,
 sum((case kind when 'property_open' then 1 when 'deal_open' then 2 when 'save' then 3 else 6 end)*power(0.5,greatest(0,extract(epoch from ((select at from clock)-created_at)))/21600)) as score
 from city_customer_activity where created_at>=(select at from clock)-interval '48 hours' group by business_id
 ), matched as (
 select c.*,coalesce(s.actors,0)>=5 as trending,case when s.actors>=5 then s.score else 0 end as score,
 ts_rank(c.document,websearch_to_tsquery('english',left(p_query,160))) as relevance
 from city_customer_content c left join scores s using(business_id)
 where c.available and (p_deals or c.kind<>'deal') and (p_campus or c.kind not in ('exhibit','launch'))
 and (p_category='' or c.category=p_category)
 and (p_query='' or c.document @@ websearch_to_tsquery('english',left(p_query,160)) or position(lower(left(p_query,160)) in lower(c.title))>0)
 and (p_filter in ('all','hot') or (p_filter='drops' and c.kind='launch') or (p_filter='free' and c.free) or (p_filter='exclusive' and c.exclusive)
 or (p_filter='ending' and c.ends_at>now() and c.ends_at<=now()+interval '24 hours'))
 ), page as (
 select * from matched order by case when p_filter='drops' then case when starts_at<=now() then 0 else 1 end end,case when p_filter='drops' and starts_at<=now() then starts_at end desc,case when p_filter='drops' and starts_at>now() then starts_at end asc,relevance desc,score desc,case when kind='business' then 1 else 0 end,created_at desc,key
 limit 41 offset least(greatest(p_offset,0),10000)
 )
 select jsonb_build_object('now',now(),'revision',floor(extract(epoch from now())/300),
 'items',coalesce((select jsonb_agg(to_jsonb(p)-'document'-'relevance'-'score') from page p),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(business_id) from (select distinct business_id from matched where rank is not null limit 2000) ids),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(distinct category) from city_customer_content where category<>''),'[]'::jsonb));
$$;
