-- Checkout test codes are private, never customer inventory or analytics.
create table public.city_deal_checkout_tests (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.city_deals(id),
 code text not null check(length(code) between 1 and 200), terms jsonb not null,
 outcome text not null default 'untested' check(outcome in ('untested','passed','failed')),
 note text not null default '', reported_at timestamptz, actor uuid not null references auth.users(id),
 created_at timestamptz not null default now(), unique(deal_id,code)
);
create index city_deal_checkout_latest on public.city_deal_checkout_tests(deal_id,created_at desc);
alter table public.city_deal_checkout_tests enable row level security;
revoke all on public.city_deal_checkout_tests from public,anon,authenticated;
grant all on public.city_deal_checkout_tests to service_role;
alter table public.city_deal_claims add column source_exhibit_id text, add column source_exhibit_title text;
create table public.city_deal_exhibit_metrics (
 deal_id uuid not null references public.city_deals(id), exhibit_id text not null,
 visitor_hash text not null, kind text not null check(kind in ('open','click')),
 day date not null default current_date, primary key(deal_id,exhibit_id,visitor_hash,kind,day)
);
alter table public.city_deal_exhibit_metrics enable row level security;
revoke all on public.city_deal_exhibit_metrics from public,anon,authenticated;
grant all on public.city_deal_exhibit_metrics to service_role;
create function public.city_deal_checkout_command(p_user uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql set search_path=public as $$
declare d city_deals; b city_businesses; t city_deal_checkout_tests;
begin
 select * into d from city_deals where id=(p_data->>'id')::uuid for update;
 select * into b from city_businesses where id=d.business_id;
 if p_user is null or b.id is null or b.owner_id<>p_user then raise exception 'Owner access required'; end if;
 if d.version is distinct from (p_data->>'version')::integer then raise exception 'Stale deal version; reload'; end if;
 if p_action='register' then
  perform pg_advisory_xact_lock(hashtextextended('city-deal-code:'||d.business_id::text,0));
  if coalesce(length(trim(p_data->>'code')),0) not between 1 and 200 then raise exception 'Supply a dedicated merchant test code'; end if;
  if exists(select 1 from city_deal_codes c join city_deals other on other.id=c.deal_id where other.business_id=d.business_id and c.code=trim(p_data->>'code')) then raise exception 'Customer inventory cannot be used as a checkout test'; end if;
  select * into t from city_deal_checkout_tests where deal_id=d.id and code=trim(p_data->>'code');
  if t.id is not null then
   if t.terms<>d.terms then raise exception 'Create a fresh test code for the changed terms'; end if;
   return to_jsonb(t);
  end if;
  insert into city_deal_checkout_tests(deal_id,code,terms,actor) values(d.id,trim(p_data->>'code'),d.terms,p_user) returning * into t;
 elsif p_action='report' then
  select * into t from city_deal_checkout_tests where id=(p_data->>'testId')::uuid and deal_id=d.id for update;
  if t.id is null or t.terms<>d.terms then raise exception 'Checkout test does not match current terms'; end if;
  if p_data->>'outcome' not in ('passed','failed') or coalesce(length(trim(p_data->>'note')),0)<10 then raise exception 'Record the result and what you checked'; end if;
  if p_data->>'outcome'='passed' and (p_data->>'confirmed') is distinct from 'true' then raise exception 'Confirm merchant checkout testing'; end if;
  update city_deal_checkout_tests set outcome=p_data->>'outcome',note=trim(p_data->>'note'),reported_at=now(),actor=p_user where id=t.id returning * into t;
 else raise exception 'Unknown checkout test action'; end if;
 insert into city_deal_audit(deal_id,actor,action,detail) values(d.id,p_user,'checkout_'||p_action,jsonb_build_object('testId',t.id,'outcome',t.outcome,'note',t.note));
 return to_jsonb(t);
end $$;
revoke all on function public.city_deal_checkout_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.city_deal_checkout_command(uuid,text,jsonb) to service_role;

create or replace function public.city_deal_mutate(p_user uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql set search_path=public as $$
declare d city_deals; b city_businesses; c city_deal_claims; code_row city_deal_codes; n integer; t jsonb; a boolean; output jsonb; exhibit jsonb;
begin
 if p_user is null then raise exception 'Sign in required'; end if;
 select exists(select 1 from city_admins where user_id=p_user) into a;
 if p_action='save' and not(p_data ? 'id') then
  select * into b from city_businesses where id=(p_data->>'businessId')::uuid for share;
  if b.id is null or b.owner_id<>p_user or b.published is null or b.status='suspended' then raise exception 'Approved business owner required'; end if;
  insert into city_deals(business_id,terms) values(b.id,p_data->'terms') returning * into d;
 else
  select * into d from city_deals where id=(p_data->>'id')::uuid for update;
  if d.id is null then raise exception 'Deal unavailable'; end if;
  select * into b from city_businesses where id=d.business_id for share;
 end if;
 if p_action='claim' then
  -- A repeat returns the original entitlement even when issuance has ended.
  select * into c from city_deal_claims where deal_id=d.id and user_id=p_user;
  if c.id is null then
   if b.published is null or b.status='suspended' or d.status<>'approved' or d.paused or d.ended
    or now()<(d.terms->>'startsAt')::timestamptz or now()>=(d.terms->>'endsAt')::timestamptz
    or d.issued>=d.quantity then raise exception 'Deal is not available to claim'; end if;
   select * into code_row from city_deal_codes where deal_id=d.id and not assigned order by id limit 1 for update;
   if code_row.id is null then raise exception 'Sold out'; end if;
   if nullif(p_data->>'sourceExhibitId','') is not null then
    select e into exhibit from jsonb_array_elements(coalesce(b.published->'campus'->'exhibits','[]'::jsonb)) e
     where e->>'id'=p_data->>'sourceExhibitId' and e->>'dealId'=d.id::text limit 1;
    if exhibit is null then raise exception 'This exhibit no longer links to this deal; refresh the campus'; end if;
   end if;
   insert into city_deal_claims(deal_id,user_id,code_id,terms,business_name,source_exhibit_id,source_exhibit_title)
    values(d.id,p_user,code_row.id,d.terms,b.published->>'name',exhibit->>'id',exhibit->>'title') returning * into c;
   update city_deal_codes set assigned=true where id=code_row.id;
   update city_deals set issued=issued+1 where id=d.id;
  end if;
  select to_jsonb(c)||jsonb_build_object('code',code) into output from city_deal_codes where id=c.code_id;
  return output;
 end if;
 if p_action='review' then
  if not a then raise exception 'Operator access required'; end if;
 else
  if b.owner_id<>p_user then raise exception 'Owner access required'; end if;
 end if;
 if p_action not in ('report','correct') and (p_data ? 'id') and d.version is distinct from (p_data->>'version')::integer then raise exception 'Stale deal version; reload'; end if;
 if p_action='save' then
  if d.issued>0 then raise exception 'Terms are frozen after the first claim; create a new deal'; end if;
  t=p_data->'terms';
  if coalesce(length(t->>'title'),0)=0 or (t->>'startsAt')::timestamptz >= (t->>'endsAt')::timestamptz then raise exception 'Invalid deal terms'; end if;
  if t->>'redeemBy' is not null and (t->>'redeemBy')::timestamptz < (t->>'endsAt')::timestamptz then raise exception 'Redemption deadline must cover the claim window'; end if;
  update city_deals set terms=t,status='draft',version=version+1 where id=d.id returning * into d;
 elsif p_action='import' then
  perform pg_advisory_xact_lock(hashtextextended('city-deal-code:'||d.business_id::text,0));
  if jsonb_typeof(p_data->'codes')<>'array' or jsonb_array_length(p_data->'codes') not between 1 and 1000 then raise exception 'Import 1–1000 codes'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_data->'codes') x where length(trim(x)) not between 1 and 200) then raise exception 'Invalid code'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_data->'codes') x join city_deal_checkout_tests t on t.code=trim(x) join city_deals other on other.id=t.deal_id and other.business_id=d.business_id) then raise exception 'Checkout test codes can never enter customer inventory'; end if;
  insert into city_deal_codes(deal_id,code) select d.id,trim(x) from jsonb_array_elements_text(p_data->'codes') x;
  get diagnostics n=row_count;
  update city_deals set quantity=quantity+n,version=version+1 where id=d.id returning * into d;
 elsif p_action='submit' then
  if d.quantity=0 then raise exception 'Upload codes first'; end if;
  if d.status not in ('draft','rejected') then raise exception 'Deal already submitted'; end if;
  update city_deals set status='pending',version=version+1 where id=d.id returning * into d;
 elsif p_action='review' then
  if d.status<>'pending' then raise exception 'Deal is not pending review'; end if;
  if p_data->>'decision' not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  update city_deals set status=p_data->>'decision',review_note=p_data->>'note',version=version+1 where id=d.id returning * into d;
 elsif p_action='pause' then
  update city_deals set paused=(p_data->>'paused')::boolean,version=version+1 where id=d.id returning * into d;
 elsif p_action='end' then
  update city_deals set ended=true,version=version+1 where id=d.id returning * into d;
 elsif p_action in ('report','correct') then
  select * into c from city_deal_claims where id=(p_data->>'claimId')::uuid and deal_id=d.id for update;
  if c.id is null then raise exception 'Claim unavailable'; end if;
  if p_action='report' and c.redeemed_at is null then
   update city_deal_claims set redeemed_at=now(),merchant_order_id=nullif(p_data->>'orderId','') where id=c.id;
  elsif p_action='correct' then
   if coalesce(length(p_data->>'note'),0)<3 then raise exception 'Correction reason required'; end if;
   update city_deal_claims set redeemed_at=null,merchant_order_id=null where id=c.id;
  else return jsonb_build_object('ok',true); end if;
 else raise exception 'Unknown deal command'; end if;
 insert into city_deal_audit(deal_id,claim_id,actor,action,detail) values(d.id,c.id,p_user,p_action,
  jsonb_build_object('version',d.version,'note',p_data->>'note','orderId',p_data->>'orderId'));
 return to_jsonb(d);
end $$;
revoke all on function public.city_deal_mutate(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.city_deal_mutate(uuid,text,jsonb) to service_role;


create function public.city_deal_exhibit_stats(p_ids uuid[]) returns table(deal_id uuid,exhibit_id text,title text,opens bigint,clicks bigint,claims bigint,reported bigint)
language sql stable set search_path=public as $$
 with sources as (
 select m.deal_id,m.exhibit_id from city_deal_exhibit_metrics m where m.deal_id=any(p_ids)
 union select c.deal_id,c.source_exhibit_id from city_deal_claims c where c.deal_id=any(p_ids) and c.source_exhibit_id is not null
 )
 select s.deal_id,s.exhibit_id,
 coalesce((select c.source_exhibit_title from city_deal_claims c where c.deal_id=s.deal_id and c.source_exhibit_id=s.exhibit_id order by c.created_at desc limit 1),s.exhibit_id),
 (select count(*) from city_deal_exhibit_metrics m where m.deal_id=s.deal_id and m.exhibit_id=s.exhibit_id and kind='open'),
 (select count(*) from city_deal_exhibit_metrics m where m.deal_id=s.deal_id and m.exhibit_id=s.exhibit_id and kind='click'),
 (select count(*) from city_deal_claims c where c.deal_id=s.deal_id and c.source_exhibit_id=s.exhibit_id),
 (select count(*) from city_deal_claims c where c.deal_id=s.deal_id and c.source_exhibit_id=s.exhibit_id and c.redeemed_at is not null)
 from sources s;
$$;
revoke all on function public.city_deal_exhibit_stats(uuid[]) from public,anon,authenticated;
grant execute on function public.city_deal_exhibit_stats(uuid[]) to service_role;

create index city_deal_claim_source on public.city_deal_claims(deal_id,source_exhibit_id);
create function public.city_deal_launch_summary(p_ids uuid[]) returns table(deal_id uuid,checkout jsonb)
language sql stable set search_path=public as $$
 select d.id,case when t.id is null then null else jsonb_build_object('id',t.id,'outcome',t.outcome,'note',t.note,'reportedAt',t.reported_at,'current',t.terms=d.terms) end
 from city_deals d left join lateral (select * from city_deal_checkout_tests c where c.deal_id=d.id order by created_at desc,id desc limit 1) t on true
 where d.id=any(p_ids);
$$;
revoke all on function public.city_deal_launch_summary(uuid[]) from public,anon,authenticated;
grant execute on function public.city_deal_launch_summary(uuid[]) to service_role;
