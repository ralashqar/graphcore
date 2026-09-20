-- Customer discovery is independent of the land ledger. All reads pass through Edge.
create table public.city_customer_activity (
 business_id uuid not null references public.city_businesses(id) on delete cascade,
 actor text not null, kind text not null check(kind in ('property_open','deal_open','save','claim')),
 day date not null default current_date, created_at timestamptz not null default now(),
 primary key(business_id,actor,kind,day)
);
create index city_customer_activity_recent on public.city_customer_activity(created_at,business_id);
create table public.city_saved_deals (
 user_id uuid not null references auth.users(id) on delete cascade,
 deal_id uuid not null references public.city_deals(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,deal_id)
);
alter table public.city_customer_activity enable row level security;
alter table public.city_saved_deals enable row level security;
revoke all on public.city_customer_activity,public.city_saved_deals from public,anon,authenticated;
grant all on public.city_customer_activity,public.city_saved_deals to service_role;

create function public.city_customer_record(p_business uuid,p_actor text,p_kind text) returns void
language sql security invoker set search_path=public as $$
 insert into city_customer_activity(business_id,actor,kind)
 select id,left(p_actor,160),p_kind from city_businesses
 where id=p_business and published is not null and status<>'suspended'
 and p_actor<>'u:'||owner_id::text
 on conflict do nothing;
$$;
-- Entitlements and saves contribute only after their database transaction succeeds.
create function public.city_customer_committed() returns trigger language plpgsql security invoker set search_path=public as $$
declare bid uuid;
begin
 if tg_table_name='city_saves' then bid:=new.business_id;
 else select business_id into bid from city_deals where id=new.deal_id; end if;
 perform city_customer_record(bid,'u:'||new.user_id::text,case when tg_table_name='city_deal_claims' then 'claim' else 'save' end);
 return new;
end $$;
create trigger city_customer_claim after insert on city_deal_claims for each row execute function city_customer_committed();
create trigger city_customer_save after insert on city_saved_deals for each row execute function city_customer_committed();
create trigger city_customer_business_save after insert on city_saves for each row execute function city_customer_committed();

create view public.city_customer_content with (security_invoker=true) as
with businesses as (
 select b.id,b.slug,b.published,b.created_at,l.rank,l.x,l.z
 from city_businesses b left join city_listings l on l.business_id=b.id
 where b.published is not null and b.status<>'suspended'
), content as (
 select 'business:'||b.id as key,b.id as business_id,b.slug,b.published->>'name' as business_name,
 coalesce(b.published->>'category','') as category,'business'::text as kind,b.id::text as content_id,
 b.published->>'name' as title,coalesce(b.published->>'description','') as description,
 '/city/business/'||b.slug as destination,b.rank,b.x,b.z,b.created_at,
 null::timestamptz as starts_at,null::timestamptz as ends_at,null::integer as remaining,
 false as free,false as exclusive,true as available
 from businesses b
 union all
 select 'exhibit:'||b.id||':'||(e->>'id'),b.id,b.slug,b.published->>'name',coalesce(b.published->>'category',''),
 'exhibit',e->>'id',e->>'title',coalesce((select string_agg(i->>'description',' ') from jsonb_array_elements(coalesce(e->'items','[]')) i),''),
 '/city/business/'||b.slug||'/space/'||(e->>'id'),b.rank,b.x,b.z,b.created_at,null,null,null,false,false,true
 from businesses b cross join lateral jsonb_array_elements(coalesce(b.published->'campus'->'exhibits','[]')) e
 union all
 select 'deal:'||d.id,b.id,b.slug,b.published->>'name',coalesce(b.published->>'category',''),
 'deal',d.id::text,d.terms->>'title',d.terms->>'description','/city/deal/'||d.id,b.rank,b.x,b.z,d.created_at,
 (d.terms->>'startsAt')::timestamptz,(d.terms->>'endsAt')::timestamptz,greatest(0,d.quantity-d.issued),
 coalesce((d.terms->>'freeConfirmed')::boolean,false) and (d.terms->>'minimumSpend')::numeric=0,
 coalesce((d.terms->>'exclusive')::boolean,false),
 not d.paused and not d.ended and now()>=(d.terms->>'startsAt')::timestamptz
 and now()<(d.terms->>'endsAt')::timestamptz and d.issued<d.quantity
 from city_deals d join businesses b on b.id=d.business_id where d.status='approved'
 union all
 select 'launch:'||e.id,b.id,b.slug,b.published->>'name',coalesce(b.published->>'category',''),
 'launch',e.id::text,e.published->>'title',e.published->>'description','/city/launches/'||e.slug,b.rank,b.x,b.z,e.created_at,
 (e.published->>'startsAt')::timestamptz,(e.published->>'endsAt')::timestamptz,null,false,false,
 now()<(e.published->>'endsAt')::timestamptz
 from city_discovery_entries e join businesses b on b.id=e.business_id
 where e.kind='launch' and e.status='published' and e.published is not null
)
select *,to_tsvector('english',coalesce(business_name,'')||' '||category||' '||coalesce(title,'')||' '||coalesce(description,'')) as document from content;
revoke all on public.city_customer_content from public,anon,authenticated;
grant select on public.city_customer_content to service_role;

create function public.city_customer_search(p_query text default '',p_filter text default 'all',p_category text default '',p_offset integer default 0,p_deals boolean default false,p_campus boolean default false)
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
 where c.available and (p_deals or c.kind<>'deal') and (p_campus or c.kind<>'exhibit')
 and (p_category='' or c.category=p_category)
 and (p_query='' or c.document @@ websearch_to_tsquery('english',left(p_query,160)) or position(lower(left(p_query,160)) in lower(c.title))>0)
 and (p_filter in ('all','hot') or (p_filter='free' and c.free) or (p_filter='exclusive' and c.exclusive)
 or (p_filter='ending' and c.ends_at>now() and c.ends_at<=now()+interval '24 hours'))
 ), page as (
 select * from matched order by relevance desc,score desc,case when kind='business' then 1 else 0 end,created_at desc,key
 limit 41 offset least(greatest(p_offset,0),10000)
 )
 select jsonb_build_object('now',now(),'revision',floor(extract(epoch from now())/300),
 'items',coalesce((select jsonb_agg(to_jsonb(p)-'document'-'relevance'-'score') from page p),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(business_id) from (select distinct business_id from matched where rank is not null limit 2000) ids),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(distinct category) from city_customer_content where category<>''),'[]'::jsonb));
$$;
create function public.city_customer_save_deal(p_user uuid,p_deal uuid,p_saved boolean) returns void
language plpgsql security invoker set search_path=public as $$
begin
 if p_user is null then raise exception 'Sign in required'; end if;
 if not p_saved then delete from city_saved_deals where user_id=p_user and deal_id=p_deal; return; end if;
 if not exists(select 1 from city_customer_content where kind='deal' and content_id=p_deal::text) then raise exception 'Deal unavailable'; end if;
 insert into city_saved_deals(user_id,deal_id) values(p_user,p_deal) on conflict do nothing;
end $$;
revoke all on function public.city_customer_record(uuid,text,text),public.city_customer_committed(),public.city_customer_search(text,text,text,integer,boolean,boolean),public.city_customer_save_deal(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.city_customer_record(uuid,text,text),public.city_customer_committed(),public.city_customer_search(text,text,text,integer,boolean,boolean),public.city_customer_save_deal(uuid,uuid,boolean) to service_role;

create table public.city_customer_revision(id boolean primary key default true check(id),revision bigint not null default 0);
insert into city_customer_revision values(true,0);
alter table city_customer_revision enable row level security;
revoke all on city_customer_revision from public,anon,authenticated;
grant select on city_customer_revision to anon,authenticated;
grant all on city_customer_revision to service_role;
create policy city_customer_revision_read on city_customer_revision for select to anon,authenticated using(true);
create function public.city_customer_invalidate() returns trigger language plpgsql security invoker set search_path=public as $$
begin update city_customer_revision set revision=revision+1 where id; return null; end $$;
revoke all on function city_customer_invalidate() from public,anon,authenticated;
grant execute on function city_customer_invalidate() to service_role;
create trigger city_customer_deals_changed after insert or update or delete on city_deals for each statement execute function city_customer_invalidate();
create trigger city_customer_business_changed after update on city_businesses for each statement execute function city_customer_invalidate();
create trigger city_customer_launch_changed after insert or update or delete on city_discovery_entries for each statement execute function city_customer_invalidate();
do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table city_customer_revision; end if; end $$;
create index city_saved_deals_deal on city_saved_deals(deal_id);

-- Product measurements are diagnostic, never entitlement or ranking authority.
create table public.city_customer_metrics (
 actor text not null, kind text not null check(kind in ('city_open','search','search_result_click','surprise_me','wallet_open','property_impression','deal_impression','merchant_visit')),
 business_id uuid references city_businesses(id) on delete cascade, scope text not null default 'city',day date not null default current_date,
 created_at timestamptz not null default now(), primary key(actor,kind,scope,day)
);
create index city_customer_metrics_business on city_customer_metrics(business_id,created_at);
create index city_customer_metrics_kind on city_customer_metrics(kind,day);
alter table city_customer_metrics enable row level security;
revoke all on city_customer_metrics from public,anon,authenticated;
grant all on city_customer_metrics to service_role;
create function public.city_customer_funnel(p_business uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
 'propertyImpressions',(select count(*) from city_customer_metrics where business_id=p_business and kind='property_impression' and day>=current_date-30),
 'propertyOpens',(select count(*) from city_customer_activity where business_id=p_business and kind='property_open' and day>=current_date-30),
 'dealOpens',(select count(*) from city_customer_activity where business_id=p_business and kind='deal_open' and day>=current_date-30),
 'claims',(select count(*) from city_deal_claims c join city_deals d on d.id=c.deal_id where d.business_id=p_business and c.created_at>=now()-interval '30 days'),
 'merchantReportedRedemptions',(select count(*) from city_deal_claims c join city_deals d on d.id=c.deal_id where d.business_id=p_business and c.redeemed_at>=now()-interval '30 days'),
 'merchantVisits',(select count(*) from city_customer_metrics where business_id=p_business and kind='merchant_visit' and day>=current_date-30));
$$;
revoke all on function city_customer_funnel(uuid) from public,anon,authenticated;
grant execute on function city_customer_funnel(uuid) to service_role;
create function public.city_customer_claim_activity() returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (
 select 'claims:'||d.id as key,b.id as business_id,b.published->>'name' as business_name,
 count(*)::text||' claims in the last 24 hours · '||(d.terms->>'title') as label,
 '/city/deal/'||d.id as destination
 from city_deal_claims c join city_deals d on d.id=c.deal_id join city_businesses b on b.id=d.business_id
 where c.created_at>=now()-interval '24 hours' and not c.cancelled and c.user_id<>b.owner_id
 and b.published is not null and b.status<>'suspended' and d.status='approved'
 group by d.id,b.id having count(*)>=5 order by count(*) desc limit 5
 ) a;
$$;
revoke all on function city_customer_claim_activity() from public,anon,authenticated;
grant execute on function city_customer_claim_activity() to service_role;

create function public.city_customer_merge(p_user uuid,p_items jsonb,p_deals boolean) returns jsonb language plpgsql security invoker set search_path=public as $$
begin
 if p_user is null or jsonb_array_length(p_items)>200 then raise exception 'Invalid saved items'; end if;
 insert into city_saves(user_id,business_id)
 select distinct p_user,b.id from jsonb_array_elements(p_items) i join city_businesses b on b.id=(i->>'id')::uuid
 where i->>'kind'='business' and b.published is not null and b.status<>'suspended' on conflict do nothing;
 insert into city_saved_launches(user_id,launch_id)
 select distinct p_user,e.id from jsonb_array_elements(p_items) i join city_discovery_entries e on e.id=(i->>'id')::uuid
 join city_businesses b on b.id=e.business_id
 where i->>'kind'='launch' and e.kind='launch' and e.status='published' and e.published is not null and b.published is not null and b.status<>'suspended' on conflict do nothing;
 if p_deals then
 insert into city_saved_deals(user_id,deal_id)
 select distinct p_user,d.id from jsonb_array_elements(p_items) i join city_deals d on d.id=(i->>'id')::uuid
 join city_businesses b on b.id=d.business_id
 where i->>'kind'='deal' and d.status='approved' and b.published is not null and b.status<>'suspended' on conflict do nothing;
 end if;
 return coalesce((select jsonb_agg(i->>'id') from jsonb_array_elements(p_items) i
 where (i->>'kind'='business' and exists(select 1 from city_saves where user_id=p_user and business_id=(i->>'id')::uuid))
 or (i->>'kind'='launch' and exists(select 1 from city_saved_launches where user_id=p_user and launch_id=(i->>'id')::uuid))
 or (i->>'kind'='deal' and exists(select 1 from city_saved_deals where user_id=p_user and deal_id=(i->>'id')::uuid))),'[]'::jsonb);
end $$;
revoke all on function city_customer_merge(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function city_customer_merge(uuid,jsonb,boolean) to service_role;
