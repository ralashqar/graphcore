-- Private inventories and entitlements. Only authenticated Edge code uses these invoker RPCs.
create table public.city_deals (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.city_businesses(id),
 terms jsonb not null, status text not null default 'draft' check(status in ('draft','pending','approved','rejected')),
 paused boolean not null default false, ended boolean not null default false,
 version integer not null default 1, issued integer not null default 0 check(issued>=0),
 quantity integer not null default 0 check(quantity>=issued), review_note text not null default '',
 created_at timestamptz not null default now()
);
create index city_deals_business on public.city_deals(business_id);
create table public.city_deal_codes (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.city_deals(id),
 code text not null check(length(code) between 1 and 200), assigned boolean not null default false,
 unique(deal_id,code), unique(id,deal_id)
);
create index city_deal_available on public.city_deal_codes(deal_id) where not assigned;
create table public.city_deal_claims (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.city_deals(id),
 user_id uuid not null references auth.users(id), code_id uuid not null unique,
 terms jsonb not null, business_name text not null, created_at timestamptz not null default now(),
 redeemed_at timestamptz, merchant_order_id text, cancelled boolean not null default false,
 unique(deal_id,user_id), foreign key(code_id,deal_id) references public.city_deal_codes(id,deal_id)
);
create index city_deal_claims_user on public.city_deal_claims(user_id,created_at desc);
create table public.city_deal_audit (
 id uuid primary key default gen_random_uuid(), deal_id uuid not null references public.city_deals(id),
 claim_id uuid references public.city_deal_claims(id), actor uuid not null references auth.users(id),
 action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.city_deal_metrics (
 deal_id uuid not null references public.city_deals(id), visitor_hash text not null,
 kind text not null check(kind in ('open','click')), day date not null default current_date,
 primary key(deal_id,visitor_hash,kind,day)
);
do $$ declare t text; begin
 foreach t in array array['city_deals','city_deal_codes','city_deal_claims','city_deal_audit','city_deal_metrics'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.city_deal_mutate(p_user uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql set search_path=public as $$
declare d city_deals; b city_businesses; c city_deal_claims; code_row city_deal_codes; n integer; t jsonb; a boolean; output jsonb;
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
   insert into city_deal_claims(deal_id,user_id,code_id,terms,business_name)
    values(d.id,p_user,code_row.id,d.terms,b.published->>'name') returning * into c;
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
  if jsonb_typeof(p_data->'codes')<>'array' or jsonb_array_length(p_data->'codes') not between 1 and 1000 then raise exception 'Import 1–1000 codes'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_data->'codes') x where length(trim(x)) not between 1 and 200) then raise exception 'Invalid code'; end if;
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

create function public.city_deal_stats(p_ids uuid[]) returns table(id uuid,opens bigint,clicks bigint,reported bigint)
language sql stable set search_path=public as $$
 select d.id,
 (select count(*) from city_deal_metrics m where m.deal_id=d.id and m.kind='open'),
 (select count(*) from city_deal_metrics m where m.deal_id=d.id and m.kind='click'),
 (select count(*) from city_deal_claims c where c.deal_id=d.id and c.redeemed_at is not null)
 from city_deals d where d.id=any(p_ids);
$$;
revoke all on function public.city_deal_stats(uuid[]) from public,anon,authenticated;
grant execute on function public.city_deal_stats(uuid[]) to service_role;
