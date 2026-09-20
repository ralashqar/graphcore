-- City is financially independent from generation credits. All writes are service-only.
create table public.city_state (
  id boolean primary key default true check(id), revision bigint not null default 0,
  radius integer not null default 10, updated_at timestamptz not null default now()
);
insert into public.city_state(id) values(true);
create table public.city_admins(user_id uuid primary key references auth.users(id));
create table public.city_businesses (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references auth.users(id),
  slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{2,47}$'),
  draft jsonb not null, published jsonb,
  draft_version integer not null default 1, submitted_version integer,
  status text not null default 'draft' check(status in ('draft','pending','approved','rejected','suspended')),
  verification_token uuid not null default gen_random_uuid(), verified_at timestamptz,
  verified_host text, review_note text, land_value bigint not null default 0 check(land_value >= 0),
  reached_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table public.city_memberships (
  business_id uuid not null references public.city_businesses(id), user_id uuid not null references auth.users(id),
  role text not null default 'owner' check(role = 'owner'), primary key(business_id,user_id)
);
create table public.city_reviews (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.city_businesses(id),
  actor_id uuid not null references auth.users(id), version integer not null, action text not null,
  note text not null default '', profile jsonb not null, created_at timestamptz not null default now()
);
create table public.city_plots (
  priority integer primary key, x integer not null, z integer not null, unique(x,z)
);
insert into public.city_plots(priority,x,z)
select row_number() over(order by x*x+z*z,x,z)::integer,x,z
from generate_series(-10,10) x cross join generate_series(-10,10) z where x<>0 and z<>0;
create table public.city_listings (
  business_id uuid primary key references public.city_businesses(id), slug text not null unique,
  profile jsonb not null, land_value bigint not null, rank integer not null unique,
  x integer not null, z integer not null, tier integer not null, saves bigint not null default 0, claims bigint not null default 0,
  search_document tsvector generated always as (to_tsvector('english',
    coalesce(profile->>'name','') || ' ' || coalesce(profile->>'category','') || ' ' ||
    coalesce(profile->>'tagline','') || ' ' || coalesce(profile->>'description','') || ' ' || coalesce(profile->'offer'->>'title',''))) stored
);
create index city_search_idx on public.city_listings using gin(search_document);
create index city_space_idx on public.city_listings(x,z);
create table public.city_orders (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.city_businesses(id),
  user_id uuid not null references auth.users(id), request_key uuid not null,
  amount bigint not null check(amount between 1000 and 5000000), currency text not null default 'gbp' check(currency='gbp'),
  status text not null default 'created', stripe_session_id text unique, stripe_payment_intent text unique,
  checkout_url text, terms_version text not null default 'city-1', terms_accepted_at timestamptz not null default now(), effective_value bigint not null default 0 check(effective_value >= 0),
  adjustment_version integer not null default 0, lease_token uuid, lease_until timestamptz,
  last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,request_key)
);
create table public.city_ledger (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.city_orders(id),
  business_id uuid not null references public.city_businesses(id), adjustment_version integer not null,
  delta bigint not null, reason text not null, created_at timestamptz not null default now(), unique(order_id,adjustment_version)
);
create table public.city_payment_events (
  stripe_event_id text primary key, order_id uuid references public.city_orders(id), status text not null default 'received',
  error text, created_at timestamptz not null default now(), processed_at timestamptz
);
create table public.city_events (
  id uuid primary key default gen_random_uuid(), business_id uuid not null references public.city_businesses(id),
  name text not null, kind text not null, from_rank integer, to_rank integer not null,
  revision bigint not null, land_value bigint not null, color text not null, created_at timestamptz not null default now()
);
create index city_events_latest on public.city_events(created_at desc);
create table public.city_saves (
  user_id uuid not null references auth.users(id), business_id uuid not null references public.city_businesses(id),
  created_at timestamptz not null default now(), primary key(user_id,business_id)
);
create table public.city_claims (
  user_id uuid not null references auth.users(id), business_id uuid not null references public.city_businesses(id),
  offer_key text not null, offer jsonb not null, business_name text not null, created_at timestamptz not null default now(), primary key(user_id,business_id,offer_key)
);
create table public.city_engagement (
  business_id uuid not null references public.city_businesses(id), visitor_hash text not null,
  kind text not null check(kind in ('view','click','share')), day date not null default current_date,
  primary key(business_id,visitor_hash,kind,day)
);
create table public.city_reports (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  business_id uuid not null references public.city_businesses(id), reason text not null,
  status text not null default 'open' check(status in ('open','resolved')), created_at timestamptz not null default now()
);
create table public.city_rate_limits (
  key text primary key, window_start timestamptz not null default now(), count integer not null default 0
);

-- No browser may change business approvals, ledger, inventory, or engagement counts.
do $$ declare t text; begin
  foreach t in array array['state','admins','businesses','memberships','reviews','plots','listings','orders','ledger','payment_events','events','saves','claims','engagement','reports','rate_limits'] loop
    execute format('alter table public.city_%I enable row level security',t);
    execute format('revoke all on public.city_%I from anon, authenticated',t);
    execute format('grant all on public.city_%I to service_role',t);
  end loop;
end $$;
-- The revision is safe to subscribe to; details are read through the bounded public API.
grant select on public.city_state to anon, authenticated;
create policy city_state_read on public.city_state for select to anon,authenticated using(true);
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.city_state;
  end if;
end $$;

create function public.city_reallocate() returns void language plpgsql security invoker set search_path=public as $$
declare n integer; r integer; offset_n integer; rev bigint;
begin
  perform pg_advisory_xact_lock(73190421);
  select radius into r from city_state where id;
  select count(*) into n from city_businesses where published is not null and status <> 'suspended' and land_value>0;
  while (select count(*) from city_plots)<n loop
    r := r+1;
    select count(*) into offset_n from city_plots;
    insert into city_plots(priority,x,z)
    select offset_n+row_number() over(order by x*x+z*z,x,z)::integer,x,z
    from generate_series(-r,r) x cross join generate_series(-r,r) z
    where x<>0 and z<>0 and greatest(abs(x),abs(z))=r;
  end loop;
  update city_state set radius=r, revision=revision+1, updated_at=now() where id returning revision into rev;
  -- Capture moves before replacing the unique rank assignments.
  insert into city_events(business_id,name,kind,from_rank,to_rank,revision,land_value,color)
  select b.id,b.published->>'name',case when l.rank is null then 'arrival' when l.rank=b.new_rank then 'upgrade' when b.new_rank=1 then 'central' else 'move' end,
    l.rank,b.new_rank,rev,b.land_value,b.published->>'color'
  from (select *,row_number() over(order by land_value desc,reached_at,id)::integer new_rank
    from city_businesses where published is not null and status<>'suspended' and land_value>0) b
  left join city_listings l on l.business_id=b.id where l.rank is distinct from b.new_rank
    or l.tier < case when b.land_value>=5000000 then 5 when b.land_value>=1000000 then 4 when b.land_value>=200000 then 3 when b.land_value>=50000 then 2 when b.land_value>=10000 then 1 else 0 end;
  delete from city_listings;
  insert into city_listings(business_id,slug,profile,land_value,rank,x,z,tier,saves,claims)
  select b.id,b.slug,b.published,b.land_value,b.new_rank,p.x,p.z,
    case when b.land_value>=5000000 then 5 when b.land_value>=1000000 then 4 when b.land_value>=200000 then 3 when b.land_value>=50000 then 2 when b.land_value>=10000 then 1 else 0 end,
    (select count(*) from city_saves s where s.business_id=b.id),(select count(*) from city_claims c where c.business_id=b.id)
  from (select *,row_number() over(order by land_value desc,reached_at,id)::integer new_rank
    from city_businesses where published is not null and status<>'suspended' and land_value>0) b
  join city_plots p on p.priority=b.new_rank;
end $$;

create function public.city_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security invoker set search_path=public as $$
declare n integer;
begin
  insert into city_rate_limits(key,count) values(p_key,1)
  on conflict(key) do update set count=case when city_rate_limits.window_start < now()-make_interval(secs=>p_seconds) then 1 else city_rate_limits.count+1 end,
    window_start=case when city_rate_limits.window_start < now()-make_interval(secs=>p_seconds) then now() else city_rate_limits.window_start end returning count into n;
  return n<=p_limit;
end $$;

create function public.city_mutate(p_user uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare b city_businesses; o city_orders; v_id uuid; v_profile jsonb; v_host text; v_admin boolean; v_offer jsonb;
begin
  if p_user is null then raise exception 'Authentication required'; end if;
  select exists(select 1 from city_admins where user_id=p_user) into v_admin;
  if p_action='create' then
    insert into city_businesses(owner_id,slug,draft) values(p_user,p_data->>'slug',p_data->'profile') returning * into b;
    insert into city_memberships(business_id,user_id) values(b.id,p_user);
    return to_jsonb(b);
  end if;
  v_id := (p_data->>'businessId')::uuid;
  -- Use a consistent lock order for every mutation affecting allocations.
  perform pg_advisory_xact_lock(73190421);
  select * into b from city_businesses where id=v_id for update;
  if b.id is null then raise exception 'Business not found'; end if;
  if p_action in ('save','submit','verify','order') and b.owner_id<>p_user then raise exception 'Owner access required'; end if;
  if p_action='save' then
    if b.status='suspended' then raise exception 'Business is suspended'; end if;
    if b.draft_version<>(p_data->>'version')::integer then raise exception 'Draft changed; reload before saving'; end if;
    v_host := p_data->>'host';
    update city_businesses set draft=p_data->'profile',draft_version=draft_version+1, submitted_version=null,status='draft',
      verified_at=case when verified_host=v_host then verified_at else null end,
      verified_host=case when verified_host=v_host then verified_host else null end where id=b.id returning * into b;
  elsif p_action='verify' then
    if b.draft_version<>(p_data->>'version')::integer then raise exception 'Draft changed; verify the current website'; end if;
    update city_businesses set verified_at=now(),verified_host=p_data->>'host' where id=b.id returning * into b;
  elsif p_action='submit' then
    if b.status='suspended' or b.verified_at is null then raise exception 'Verify the website before submitting'; end if;
    if b.draft_version<>(p_data->>'version')::integer then raise exception 'Draft changed; reload before submitting'; end if;
    update city_businesses set status='pending',submitted_version=draft_version where id=b.id returning * into b;
  elsif p_action='review' then
    if not v_admin then raise exception 'Administrator access required'; end if;
    if p_data->>'decision' not in ('approve','reject','suspend') then raise exception 'Invalid review decision'; end if;
    if b.draft_version<>(p_data->>'version')::integer then raise exception 'Review is stale'; end if;
    if p_data->>'decision'<>'suspend' and (b.status<>'pending' or b.submitted_version is distinct from b.draft_version) then raise exception 'No matching submitted revision'; end if;
    if p_data->>'decision'='approve' and b.verified_at is null then raise exception 'Domain is not verified'; end if;
    insert into city_reviews(business_id,actor_id,version,action,note,profile) values(b.id,p_user,b.draft_version,p_data->>'decision',coalesce(p_data->>'note',''),b.draft);
    update city_businesses set status=case p_data->>'decision' when 'approve' then 'approved' when 'reject' then 'rejected' else 'suspended' end,
      published=case when p_data->>'decision'='approve' then draft else published end,review_note=p_data->>'note' where id=b.id returning * into b;
    perform city_reallocate();
  elsif p_action='order' then
    if b.published is null or b.status='suspended' then raise exception 'An approved property is required'; end if;
    insert into city_orders(business_id,user_id,request_key,amount) values(b.id,p_user,(p_data->>'requestKey')::uuid,(p_data->>'amount')::bigint)
    on conflict(user_id,request_key) do nothing;
    select * into o from city_orders where user_id=p_user and request_key=(p_data->>'requestKey')::uuid;
    if o.business_id<>b.id or o.amount<>(p_data->>'amount')::bigint then raise exception 'Idempotency key was used for a different purchase'; end if;
    return to_jsonb(o);
  elsif p_action='save_business' then
    if not exists(select 1 from city_listings where business_id=b.id) then raise exception 'Property is unavailable'; end if;
    if coalesce((p_data->>'saved')::boolean,true) then
      insert into city_saves(user_id,business_id) values(p_user,b.id) on conflict do nothing;
    else delete from city_saves where user_id=p_user and business_id=b.id; end if;
    update city_listings set saves=(select count(*) from city_saves where business_id=b.id) where business_id=b.id;
    return jsonb_build_object('ok',true);
  elsif p_action='claim' then
    select profile->'offer' into v_offer from city_listings where business_id=b.id;
    if coalesce(v_offer->>'title','')='' or (nullif(v_offer->>'expiresAt','') is not null and (v_offer->>'expiresAt')::timestamptz<=now()) then raise exception 'Offer is unavailable or expired'; end if;
    insert into city_claims(user_id,business_id,offer_key,offer,business_name) values(p_user,b.id,md5(v_offer::text),v_offer,b.published->>'name') on conflict do nothing;
    update city_listings set claims=(select count(*) from city_claims where business_id=b.id) where business_id=b.id;
    return v_offer;
  elsif p_action='report' then
    insert into city_reports(user_id,business_id,reason) values(p_user,b.id,left(p_data->>'reason',1000));
    return jsonb_build_object('ok',true);
  else raise exception 'Unknown city command'; end if;
  return to_jsonb(b);
end $$;

create function public.city_order_lease(p_order uuid) returns uuid language plpgsql security invoker set search_path=public as $$
declare token uuid;
begin
  update city_orders set lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds'
  where id=p_order and (lease_until is null or lease_until<now()) returning lease_token into token;
  return token;
end $$;

create function public.city_apply_payment(p_order uuid,p_token uuid,p_effective bigint,p_status text,p_intent text) returns void
language plpgsql security invoker set search_path=public as $$
declare o city_orders; delta bigint;
begin
  perform pg_advisory_xact_lock(73190421);
  select * into o from city_orders where id=p_order for update;
  if o.id is null or o.lease_token is distinct from p_token or o.lease_until<now() then raise exception 'Payment reconciliation lease expired'; end if;
  if p_effective<0 or p_effective>o.amount then raise exception 'Invalid payment principal'; end if;
  if o.stripe_payment_intent is not null and o.stripe_payment_intent is distinct from p_intent then raise exception 'Payment intent mismatch'; end if;
  delta := p_effective-o.effective_value;
  if delta<>0 then
    insert into city_ledger(order_id,business_id,adjustment_version,delta,reason) values(o.id,o.business_id,o.adjustment_version+1,delta,p_status);
    update city_businesses set land_value=land_value+delta,reached_at=clock_timestamp() where id=o.business_id;
  end if;
  update city_orders set effective_value=p_effective,status=p_status,stripe_payment_intent=p_intent,
    adjustment_version=adjustment_version+case when delta<>0 then 1 else 0 end,lease_token=null,lease_until=null,last_error=null,updated_at=now() where id=o.id;
  if delta<>0 then perform city_reallocate(); end if;
end $$;

create function public.city_search(p_query text,p_limit integer default 30) returns setof public.city_listings
language sql stable security invoker set search_path=public as $$
  select * from city_listings where search_document @@ websearch_to_tsquery('english',left(p_query,160))
    or profile->>'name' ilike '%' || replace(replace(left(p_query,160),'%','\%'),'_','\_') || '%'
  order by rank limit least(greatest(p_limit,1),100);
$$;

create function public.city_analytics(p_business uuid) returns jsonb language sql stable security invoker set search_path=public as $$
  select jsonb_build_object('views',(select count(*) from city_engagement where business_id=p_business and kind='view'),
    'clicks',(select count(*) from city_engagement where business_id=p_business and kind='click'),
    'shares',(select count(*) from city_engagement where business_id=p_business and kind='share'),
    'saves',(select count(*) from city_saves where business_id=p_business),
    'claims',(select count(*) from city_claims where business_id=p_business));
$$;

-- SECURITY INVOKER + service-only EXECUTE: no exposed privilege escalation helpers.
revoke all on function public.city_reallocate(),public.city_rate_limit(text,integer,integer),public.city_mutate(uuid,text,jsonb),
  public.city_order_lease(uuid),public.city_apply_payment(uuid,uuid,bigint,text,text),public.city_search(text,integer),public.city_analytics(uuid) from public,anon,authenticated;
grant execute on function public.city_reallocate(),public.city_rate_limit(text,integer,integer),public.city_mutate(uuid,text,jsonb),
  public.city_order_lease(uuid),public.city_apply_payment(uuid,uuid,bigint,text,text),public.city_search(text,integer),public.city_analytics(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('city-media','city-media',false,20000000,array['image/png','image/jpeg','image/webp','video/mp4']) on conflict(id) do nothing;
-- Private media is uploaded and signed only by the authenticated city command boundary.

create function public.city_public_snapshot(p_x integer default 0,p_z integer default 0,p_slug text default null,
  p_mode text default 'snapshot',p_query text default '',p_sort text default 'rank',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=public as $$
select jsonb_build_object('revision',s.revision,'capacity',(select count(*) from city_plots),'total',(select count(*) from city_listings),
  'properties',coalesce((select jsonb_agg(to_jsonb(t)-'search_document') from (
    select l.* from city_listings l where
    (p_mode<>'snapshot' or (l.x between p_x-12 and p_x+12 and l.z between p_z-12 and p_z+12) or l.slug=p_slug)
    and (p_query='' or l.search_document @@ websearch_to_tsquery('english',left(p_query,160)) or l.profile->>'name' ilike '%'||replace(replace(left(p_query,160),'%','\%'),'_','\_')||'%')
    order by case when p_sort='saves' then l.saves when p_sort='claims' then l.claims else 0 end desc,l.rank
    limit case when p_mode='snapshot' then 626 else 40 end offset greatest(0,least(p_offset,100000))
  ) t),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select ev.* from city_events ev join city_businesses b on b.id=ev.business_id
    where b.status<>'suspended' order by ev.created_at desc limit 16) e),'[]'::jsonb)) from city_state s where s.id;
$$;
revoke all on function public.city_public_snapshot(integer,integer,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.city_public_snapshot(integer,integer,text,text,text,text,integer) to service_role;

create function public.city_immutable_ledger() returns trigger language plpgsql as $$
begin raise exception 'City ledger entries are immutable; append a compensating entry'; end $$;
revoke all on function public.city_immutable_ledger() from public,anon,authenticated;
create trigger city_ledger_immutable before update or delete on public.city_ledger for each row execute function public.city_immutable_ledger();
