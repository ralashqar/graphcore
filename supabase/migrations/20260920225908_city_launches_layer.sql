-- Organic launches never mutate city allocation or the financial ledger.
alter table city_discovery_entries add column review_state text not null default 'submitted' check(review_state in ('draft','submitted','approved','rejected'));
alter table city_discovery_entries add column launch_paused boolean not null default false;
update city_discovery_entries set review_state=case status when 'published' then 'approved' when 'rejected' then 'rejected' else 'submitted' end;

-- Keep the last approved snapshot public while an edit awaits review.
create function city_launch_publication_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if new.kind='launch' then
   if new.status='pending' and (new.draft is distinct from old.draft or old.status<>'pending') then new.review_state:='submitted'; end if;
   if new.status='rejected' then new.review_state:='rejected'; end if;
   if new.published is distinct from old.published then new.review_state:='approved'; end if;
   if new.published is not null and new.status in ('pending','rejected') and not new.launch_paused then new.status:='published'; end if;
   if new.launch_paused then new.status:='archived'; end if;
 end if; return new;
end $$;
create trigger city_launch_publication_guard before update on city_discovery_entries for each row execute function city_launch_publication_guard();

create table city_launch_signals(
 launch_id uuid not null references city_discovery_entries(id), user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('interested','reminder','save','claim')), first_at timestamptz not null default now(), enabled boolean not null default true,
 primary key(launch_id,user_id,kind)
);
create index city_launch_signals_recent on city_launch_signals(first_at,launch_id) where enabled;
alter table city_launch_signals enable row level security;
revoke all on city_launch_signals from public,anon,authenticated;
grant select,insert,update on city_launch_signals to service_role;
alter table city_deal_claims add column source_launch_id uuid references city_discovery_entries(id);
create index city_claim_launch on city_deal_claims(source_launch_id) where source_launch_id is not null;
create table city_launch_observations(launch_id uuid not null references city_discovery_entries(id),actor text not null,kind text not null check(kind in ('impression','product_visit','share')),day date not null default current_date,primary key(launch_id,actor,kind,day));
alter table city_launch_observations enable row level security;
revoke all on city_launch_observations from public,anon,authenticated;
grant select,insert on city_launch_observations to service_role;

-- Tombstones retain the original action timestamp through repeated toggling.
create function city_capture_launch_signal() returns trigger language plpgsql set search_path=public as $$
declare r record; k text;
begin
 if tg_op='DELETE' then r:=old; else r:=new; end if;
 k:=case tg_table_name when 'city_launch_reminders' then 'reminder' else 'save' end;
 insert into city_launch_signals(launch_id,user_id,kind,enabled) values(r.launch_id,r.user_id,k,tg_op<>'DELETE')
 on conflict(launch_id,user_id,kind) do update set enabled=excluded.enabled;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
create trigger city_launch_reminder_signal after insert or delete on city_launch_reminders for each row execute function city_capture_launch_signal();
create trigger city_launch_save_signal after insert or delete on city_saved_launches for each row execute function city_capture_launch_signal();

create function city_launch_scores() returns table(launch_id uuid,actors bigint,interested bigint,score numeric,rank bigint)
language sql stable security invoker set search_path=public as $$
 with per_actor as (
 select s.launch_id,s.user_id,max((case s.kind when 'interested' then 4 when 'claim' then 6 else 3 end)*power(.5,greatest(0,extract(epoch from(now()-s.first_at)))/21600)) contribution
 from city_launch_signals s join city_discovery_entries e on e.id=s.launch_id join city_businesses b on b.id=e.business_id
 where s.enabled and s.first_at>now()-interval '48 hours' and s.user_id<>b.owner_id
 and e.published is not null and e.status='published' and not e.launch_paused and b.published is not null and b.status<>'suspended'
 and least((e.published->>'endsAt')::timestamptz,(e.published->>'startsAt')::timestamptz+interval '7 days')>now()
 group by s.launch_id,s.user_id
 ), sums as (select launch_id,count(*) actors,sum(contribution) score from per_actor group by launch_id), ranks as (
 select launch_id,row_number() over(order by score desc,launch_id) rank from sums where actors>=5
 ) select e.id,coalesce(s.actors,0),
 (select count(*) from city_launch_signals i join city_businesses b on b.id=e.business_id where i.launch_id=e.id and i.kind='interested' and i.enabled and i.user_id<>b.owner_id),
 case when s.actors>=5 then s.score else 0 end,r.rank
 from city_discovery_entries e left join sums s on s.launch_id=e.id left join ranks r on r.launch_id=e.id where e.kind='launch';
$$;

alter function city_discovery_mutate(uuid,text,jsonb) rename to city_discovery_mutate_before_launches;
create function city_discovery_mutate(p_user uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare e city_discovery_entries; output jsonb; overlap boolean;
begin
 if p_user is null then raise exception 'Authentication required'; end if;
 if p_action='entry_review' and not exists(select 1 from city_admins where user_id=p_user) then raise exception 'Operator access required'; end if;
 if p_action in ('entry_review','launch_pause') then
  perform pg_advisory_xact_lock(73190422);
  select * into e from city_discovery_entries where id=(p_data->>'id')::uuid for update;
  if e.id is null then raise exception 'Launch unavailable'; end if;
  if p_action='launch_pause' then
   if e.kind<>'launch' or not exists(select 1 from city_businesses where id=e.business_id and owner_id=p_user) then raise exception 'Owner required'; end if;
   if e.status='archived' and not e.launch_paused then raise exception 'Operator-archived launches cannot be resumed by the merchant'; end if;
   update city_discovery_entries set launch_paused=(p_data->>'paused')::boolean,status=case when (p_data->>'paused')::boolean then 'archived' when published is not null then 'published' else 'pending' end where id=e.id;
   return '{"ok":true}';
  end if;
  if e.kind='launch' and p_data->>'decision'='publish' then
   if e.published is not null and (e.published->>'startsAt')::timestamptz<=now() and e.published->>'startsAt' is distinct from e.draft->>'startsAt' then raise exception 'A launched release keeps its original start; create a reviewed major update instead'; end if;
   if e.review_state='draft' then raise exception 'Submit the draft before review'; end if;
   if nullif(e.draft->>'rewardDealId','') is not null and not exists(select 1 from city_deals where id=(e.draft->>'rewardDealId')::uuid and business_id=e.business_id and status='approved' and not ended) then raise exception 'Reward must be an approved deal belonging to this business'; end if;
   select exists(select 1 from city_discovery_entries x where x.kind='launch' and x.id<>e.id and x.business_id=e.business_id and x.published is not null and x.status='published' and not x.launch_paused and
    ((x.published->>'startsAt')::timestamptz < (e.draft->>'startsAt')::timestamptz+interval '24 hours' and (x.published->>'startsAt')::timestamptz+interval '24 hours' > (e.draft->>'startsAt')::timestamptz
     or (nullif(e.draft->>'productKey','') is not null and x.published->>'productKey'=e.draft->>'productKey' and abs(extract(epoch from((x.published->>'startsAt')::timestamptz-(e.draft->>'startsAt')::timestamptz)))<2592000))) into overlap;
   if overlap then
    if length(coalesce(p_data->>'overrideReason',''))<15 or not exists(select 1 from city_admins where user_id=p_user) then raise exception 'Overlapping launch or product relaunched within 30 days'; end if;
    insert into city_discovery_reviews(entry_id,actor_id,version,decision,content) values(e.id,p_user,e.version,'cooldown_override',jsonb_build_object('reason',p_data->>'overrideReason','draft',e.draft));
   end if;
  end if;
 end if;
 output:=city_discovery_mutate_before_launches(p_user,p_action,p_data);
 if p_action='entry_review' and p_data->>'decision'='archive' then
  update city_discovery_entries set launch_paused=false where id=(output->>'id')::uuid;
 end if;
 if p_action='entry_review' and p_data->>'decision'='publish' then
  update city_discovery_entries set review_state='approved' where id=(output->>'id')::uuid;
 end if;
 if p_action='entry_save' and p_data->>'kind'='launch' then
  update city_discovery_entries set review_state=case when coalesce((p_data->>'saveDraft')::boolean,false) then 'draft' else 'submitted' end where id=(output->>'id')::uuid;
  output:=output||jsonb_build_object('review_state',case when coalesce((p_data->>'saveDraft')::boolean,false) then 'draft' else 'submitted' end);
 end if;
 return output;
end $$;

-- Allocation and launch attribution are committed in the same transaction.
alter function city_deal_mutate(uuid,text,jsonb) rename to city_deal_mutate_before_launches;
create function city_deal_mutate(p_user uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare output jsonb; e city_discovery_entries; existing uuid; d city_deals;
begin
 if p_action='claim' and nullif(p_data->>'sourceLaunchId','') is not null then
  select * into d from city_deals where id=(p_data->>'id')::uuid for update;
  select id into existing from city_deal_claims where deal_id=d.id and user_id=p_user;
  if existing is null then
   select * into e from city_discovery_entries where id=(p_data->>'sourceLaunchId')::uuid for share;
   if e.id is null or e.kind<>'launch' or e.published is null or e.status<>'published' or e.launch_paused or e.business_id<>d.business_id or e.published->>'rewardDealId' is distinct from d.id::text
   or now()<(e.published->>'startsAt')::timestamptz or now()>=least((e.published->>'endsAt')::timestamptz,(e.published->>'startsAt')::timestamptz+interval '7 days') then raise exception 'Launch reward unavailable'; end if;
  end if;
  output:=city_deal_mutate_before_launches(p_user,p_action,p_data);
  if existing is null then
   update city_deal_claims set source_launch_id=e.id where id=(output->>'id')::uuid;
   insert into city_launch_signals(launch_id,user_id,kind) values(e.id,p_user,'claim') on conflict do nothing;
   output:=output||jsonb_build_object('source_launch_id',e.id);
  end if;
  return output;
 end if;
 return city_deal_mutate_before_launches(p_user,p_action,p_data);
end $$;

create function city_launch_interest(p_user uuid,p_id uuid,p_enabled boolean) returns jsonb language plpgsql security invoker set search_path=public as $$
begin
 if p_user is null then raise exception 'Sign in required'; end if;
 if not exists(select 1 from city_discovery_entries e join city_businesses b on b.id=e.business_id where e.id=p_id and e.kind='launch' and e.status='published' and e.published is not null and not e.launch_paused and b.published is not null and b.status<>'suspended') then raise exception 'Launch unavailable'; end if;
 insert into city_launch_signals(launch_id,user_id,kind,enabled) values(p_id,p_user,'interested',p_enabled) on conflict(launch_id,user_id,kind) do update set enabled=excluded.enabled;
 return jsonb_build_object('ok',true);
end $$;

-- Existing metadata remains public only through sanitized Edge responses.
create function city_launch_catalog(p_user uuid,p_slug text,p_filter text,p_query text,p_category text,p_offset integer,p_plaza boolean) returns jsonb language sql stable security invoker set search_path=public as $$
 with eligible as (
 select e.id,e.slug,e.business_id,b.slug business_slug,b.published->>'name' business_name,e.published content,
 coalesce(s.interested,0) interested,coalesce(s.score,0) score,s.rank,
 exists(select 1 from city_launch_signals i where i.launch_id=e.id and i.user_id=p_user and i.kind='interested' and i.enabled) as "viewerInterested",
 (e.published->>'startsAt')::timestamptz starts,
 least((e.published->>'endsAt')::timestamptz,(e.published->>'startsAt')::timestamptz+interval '7 days') ends
 from city_discovery_entries e join city_businesses b on b.id=e.business_id left join city_launch_scores() s on s.launch_id=e.id
 where e.kind='launch' and e.published is not null and e.status='published' and not e.launch_paused and b.published is not null and b.status<>'suspended'
 and (p_slug is null or e.slug=p_slug or e.id::text=p_slug)
 and (p_query='' or to_tsvector('simple',e.published::text||' '||coalesce(b.published->>'name','')) @@ plainto_tsquery('simple',p_query))
 and (p_category='' or coalesce(e.published->>'category',b.published->>'category')=p_category or e.published->'secondaryCategories' ? p_category)
 ), filtered as (
 select * from eligible where p_slug is not null or (
 ends>now() and case p_filter
 when 'today' then starts<=now() and starts>now()-interval '24 hours'
 when 'upcoming' then starts>now()
 when 'trending' then rank is not null
 when 'recent' then starts<=now()
 when 'reminders' then exists(select 1 from city_launch_reminders x where x.user_id=p_user and x.launch_id=eligible.id)
 when 'saved' then exists(select 1 from city_saved_launches x where x.user_id=p_user and x.launch_id=eligible.id)
 else true end)
 ), numbered as (
 select *,row_number() over(partition by starts>now() order by case when starts>now() then starts end asc,rank asc nulls last,starts desc,id) group_position
 from filtered where not p_plaza or starts<=now()+interval '3 days'
 ), page as (
 select * from numbered order by
 case when p_plaza then case when starts>now() and group_position<=4 or starts<=now() and group_position<=8 then 0 else 1 end else 0 end,
 case when starts>now() then 1 else 0 end,
 case when starts>now() then starts end asc,rank asc nulls last,starts desc,id
 offset greatest(0,least(p_offset,10000)) limit case when p_plaza then 12 else 25 end
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)-'starts'-'ends'-'group_position') from page p),'[]'),
 'hasMore',(select count(*) from numbered)>p_offset+case when p_plaza then 12 else 25 end);
$$;
create function city_launch_analytics(p_business uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object(
 'id',e.id,'title',coalesce(e.published,e.draft)->>'title','startsAt',coalesce(e.published,e.draft)->>'startsAt','status',e.status,
 'interested',(select count(*) from city_launch_signals s where s.launch_id=e.id and s.kind='interested' and s.enabled and s.user_id<>b.owner_id),
 'reminders',(select count(*) from city_launch_reminders r where r.launch_id=e.id),
 'observedOpens',(select count(*) from city_discovery_metrics m where m.context_id=e.id and m.kind='launch_view'),
 'observedImpressions',(select count(*) from city_launch_observations o where o.launch_id=e.id and o.kind='impression'),
 'productVisits',(select count(*) from city_launch_observations o where o.launch_id=e.id and o.kind='product_visit'),
 'observedShares',(select count(*) from city_launch_observations o where o.launch_id=e.id and o.kind='share'),
 'claims',(select count(*) from city_deal_claims c where c.source_launch_id=e.id),
 'merchantReportedRedemptions',(select count(*) from city_deal_claims c where c.source_launch_id=e.id and c.redeemed_at is not null)
 ) order by e.created_at desc),'[]')) from city_discovery_entries e join city_businesses b on b.id=e.business_id where e.business_id=p_business and e.kind='launch';
$$;
revoke all on function city_launch_catalog(uuid,text,text,text,text,integer,boolean),city_launch_analytics(uuid) from public,anon,authenticated;
grant execute on function city_launch_catalog(uuid,text,text,text,text,integer,boolean),city_launch_analytics(uuid) to service_role;
do $$ declare f text; begin
 foreach f in array array['city_launch_scores()','city_launch_interest(uuid,uuid,boolean)','city_discovery_mutate(uuid,text,jsonb)','city_discovery_mutate_before_launches(uuid,text,jsonb)','city_deal_mutate(uuid,text,jsonb)','city_deal_mutate_before_launches(uuid,text,jsonb)'] loop
 execute 'revoke all on function '||f||' from public,anon,authenticated';
 execute 'grant execute on function '||f||' to service_role';
 end loop;
end $$;

create or replace view public.city_customer_content with (security_invoker=true) as
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
 select 'launch:'||e.id,b.id,b.slug,b.published->>'name',coalesce(e.published->>'category',b.published->>'category',''),
 'launch',e.id::text,e.published->>'title',concat_ws(' ',e.published->>'description',e.published->>'tagline',e.published->>'launchType',e.published->>'secondaryCategories'),'/city/launches/'||e.slug,b.rank,b.x,b.z,e.created_at,
 (e.published->>'startsAt')::timestamptz,least((e.published->>'endsAt')::timestamptz,(e.published->>'startsAt')::timestamptz+interval '7 days'),null,false,false,
 now()<least((e.published->>'endsAt')::timestamptz,(e.published->>'startsAt')::timestamptz+interval '7 days')
 from city_discovery_entries e join businesses b on b.id=e.business_id
 where e.kind='launch' and not e.launch_paused and e.status='published' and e.published is not null
)
select *,to_tsvector('english',coalesce(business_name,'')||' '||category||' '||coalesce(title,'')||' '||coalesce(description,'')) as document from content;

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
 and (p_filter in ('all','hot') or (p_filter='deals' and c.kind='deal') or (p_filter='drops' and c.kind='launch') or (p_filter='free' and c.free) or (p_filter='exclusive' and c.exclusive)
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
create or replace function public.city_living_inbox(p_user uuid,p_deals boolean,p_launches boolean,p_activity boolean,p_offset integer default 0) returns jsonb language sql stable security invoker set search_path=public as $$
 with items as (
 select 'event:'||e.id as key,e.business_id,e.title,e.business_name,e.destination,e.kind,e.created_at as at,e.evidence
 from city_content_events e join city_follows f on f.business_id=e.business_id and f.user_id=p_user join city_businesses b on b.id=e.business_id
 where b.published is not null and b.status<>'suspended' and e.created_at>=greatest(f.created_at,now()-interval '30 days')
 and (e.kind='business_update' or (p_activity and e.kind='organic_milestone') or (e.kind in ('deal_published','sold_out') and p_deals and exists(select 1 from city_deals d where 'deal:'||d.id=e.content_key and d.status='approved' and not d.paused and not d.ended and (d.terms->>'endsAt')::timestamptz>now())) or (e.kind in ('launch_published','launch_milestone') and p_launches and exists(select 1 from city_customer_content c where c.key=e.content_key and c.available)))
 union all
 select 'reminder:'||e.id||':'||md5(e.published->>'startsAt'),e.business_id,e.published->>'title',b.published->>'name','/city/launches/'||e.slug,'launch_reminder',(e.published->>'startsAt')::timestamptz,'{}'::jsonb
 from city_launch_reminders r join city_discovery_entries e on e.id=r.launch_id join city_businesses b on b.id=e.business_id
 where r.user_id=p_user and p_launches and e.status='published' and b.published is not null and b.status<>'suspended' and (e.published->>'startsAt')::timestamptz<=now() and least((e.published->>'endsAt')::timestamptz,(e.published->>'startsAt')::timestamptz+interval '7 days')>now()
 ), marked as(select i.*,r.read_at from items i left join city_inbox_receipts r on r.user_id=p_user and r.item_key=i.key), page as(select * from marked order by at desc,key limit 40 offset least(greatest(p_offset,0),10000))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'unread',(select count(*) from marked where read_at is null),'total',(select count(*) from marked),'reminders',coalesce((select jsonb_agg(launch_id) from city_launch_reminders where user_id=p_user),'[]'),'follows',coalesce((select jsonb_agg(business_id) from city_follows where user_id=p_user),'[]'));
$$;

alter table city_content_events drop constraint city_content_events_kind_check;
alter table city_content_events add constraint city_content_events_kind_check check(kind in ('business_update','deal_published','launch_published','sold_out','organic_milestone','launch_milestone'));
create function city_capture_launch_milestone() returns trigger language plpgsql security invoker set search_path=public as $$
declare e city_discovery_entries; b city_businesses; s record; milestone integer; headline text; source text;
begin
 if not new.enabled then return new; end if;
 select * into e from city_discovery_entries where id=new.launch_id;
 select * into b from city_businesses where id=e.business_id;
 if e.status<>'published' or e.launch_paused or b.published is null or b.status='suspended' or new.user_id=b.owner_id then return new; end if;
 select * into s from city_launch_scores() where launch_id=e.id;
 milestone:=case when s.interested>=10000 then 10000 when s.interested>=1000 then 1000 when s.interested>=100 then 100 when s.interested>=10 then 10 else 0 end;
 if milestone>0 then
 insert into city_content_events(business_id,kind,source_key,content_key,title,business_name,destination,evidence)
 values(b.id,'launch_milestone','launch-interest:'||e.id||':'||milestone,'launch:'||e.id,(e.published->>'title')||' reached '||milestone||' interested accounts',b.published->>'name','/city/launches/'||e.slug,jsonb_build_object('policy',1,'interested',s.interested,'milestone',milestone)) on conflict do nothing;
 end if;
 if s.rank is not null and s.rank<=10 then
 insert into city_content_events(business_id,kind,source_key,content_key,title,business_name,destination,evidence)
 values(b.id,'launch_milestone','launch-rank:'||e.id||':'||current_date,'launch:'||e.id,(e.published->>'title')||' reached #'||s.rank||' in rolling launches',b.published->>'name','/city/launches/'||e.slug,jsonb_build_object('policy',1,'rank',s.rank,'score',s.score,'actors',s.actors,'windowHours',48)) on conflict do nothing;
 end if; return new;
end $$;
create trigger city_launch_milestone after insert or update on city_launch_signals for each row execute function city_capture_launch_milestone();

-- Repair old pending-edit visibility without inventing a new publication event.
alter table city_discovery_entries disable trigger city_content_launch;
update city_discovery_entries set status='published' where kind='launch' and published is not null and status in ('pending','rejected');
alter table city_discovery_entries enable trigger city_content_launch;
