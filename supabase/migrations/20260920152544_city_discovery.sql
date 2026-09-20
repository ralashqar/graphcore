-- Discovery does not write to placement, orders or the financial ledger.
create table public.city_discovery_entries (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('trail','launch')),
 slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{2,47}$'), business_id uuid references public.city_businesses(id),
 draft jsonb not null, published jsonb, version integer not null default 1,
 status text not null default 'pending' check(status in ('pending','published','rejected','archived')),
 featured boolean not null default false, created_at timestamptz not null default now(), unique(kind,slug),
 check((kind='launch')=(business_id is not null))
);
create table public.city_discovery_reviews(id uuid primary key default gen_random_uuid(),entry_id uuid not null references public.city_discovery_entries(id),actor_id uuid not null references auth.users(id),version integer not null,decision text not null,content jsonb not null,created_at timestamptz not null default now());
create table public.city_follows(user_id uuid references auth.users(id) on delete cascade, business_id uuid references public.city_businesses(id) on delete cascade, primary key(user_id,business_id));
create index city_follows_business on public.city_follows(business_id);
create table public.city_saved_launches(user_id uuid references auth.users(id) on delete cascade, launch_id uuid references public.city_discovery_entries(id) on delete cascade, primary key(user_id,launch_id));
create table public.city_trail_progress(user_id uuid references auth.users(id) on delete cascade, trail_id uuid references public.city_discovery_entries(id) on delete cascade, completed uuid[] not null default '{}', updated_at timestamptz not null default now(), primary key(user_id,trail_id));
create table public.city_discovery_metrics(business_id uuid references public.city_businesses(id) on delete cascade, context_id uuid references public.city_discovery_entries(id) on delete cascade, scope text not null, visitor_hash text not null, kind text not null check(kind in ('trail_start','trail_complete','sample_start','sample_interaction','launch_view','follow')), day date not null default current_date, primary key(scope,visitor_hash,kind,day));
create index city_discovery_metrics_business on public.city_discovery_metrics(business_id,day);
create index city_discovery_metrics_context on public.city_discovery_metrics(context_id,day);
do $$ declare t text; begin
 foreach t in array array['city_discovery_reviews','city_discovery_entries','city_follows','city_saved_launches','city_trail_progress','city_discovery_metrics'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create function public.city_discovery_mutate(p_user uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare e city_discovery_entries; b city_businesses; a boolean; v_kind text; v_content jsonb; v_id uuid; v_completed uuid[];
begin
 if p_user is null then raise exception 'Authentication required'; end if;
 select exists(select 1 from city_admins where user_id=p_user) into a;
 if p_action='entry_save' then
   v_kind:=p_data->>'kind'; v_content:=p_data->'content';
   if v_kind='trail' and not a then raise exception 'Operator access required'; end if;
   if v_kind='launch' then
     select * into b from city_businesses where id=(p_data->>'businessId')::uuid;
     if b.id is null or b.owner_id<>p_user or b.published is null or b.status='suspended' then raise exception 'Approved business owner required'; end if;
     if (v_content->>'endsAt')::timestamptz <= (v_content->>'startsAt')::timestamptz then raise exception 'Invalid launch dates'; end if;
   end if;
   if v_kind='trail' and (jsonb_array_length(v_content->'stops') not between 3 and 5) then raise exception 'Trails need three to five stops'; end if;
   if p_data->>'id' is null then
     insert into city_discovery_entries(kind,slug,business_id,draft) values(v_kind,p_data->>'slug',b.id,v_content) returning * into e;
   else
     select * into e from city_discovery_entries where id=(p_data->>'id')::uuid for update;
     if e.id is null or e.kind<>v_kind or e.business_id is distinct from b.id or e.version<>(p_data->>'version')::integer then raise exception 'Entry changed; reload'; end if;
     update city_discovery_entries set draft=v_content,version=version+1,status='pending' where id=e.id returning * into e;
   end if;
   return to_jsonb(e);
 elsif p_action='entry_review' then
   if not a then raise exception 'Operator access required'; end if;
   perform pg_advisory_xact_lock(73190422);
   select * into e from city_discovery_entries where id=(p_data->>'id')::uuid for update;
   if e.id is null or e.version<>(p_data->>'version')::integer then raise exception 'Review is stale'; end if;
   if p_data->>'decision' not in ('publish','reject','archive') then raise exception 'Invalid review'; end if;
   if p_data->>'decision'='publish' then
     if e.kind='launch' and not exists(select 1 from city_businesses where id=e.business_id and published is not null and status<>'suspended') then raise exception 'Business unavailable'; end if;
     if e.kind='trail' and exists(select 1 from jsonb_array_elements(e.draft->'stops') s where not exists(select 1 from city_businesses where id=(s->>'businessId')::uuid and published is not null and status<>'suspended')) then raise exception 'Trail contains unavailable businesses'; end if;
     if coalesce((p_data->>'featured')::boolean,false) and e.kind='launch' and (select count(*) from city_discovery_entries where kind='launch' and featured and status<>'archived' and id<>e.id and (published->>'endsAt')::timestamptz>now())>=5 then raise exception 'At most five featured launches'; end if;
   end if;
   insert into city_discovery_reviews(entry_id,actor_id,version,decision,content) values(e.id,p_user,e.version,p_data->>'decision',e.draft);
   update city_discovery_entries set published=case when p_data->>'decision'='publish' then draft else published end,status=case p_data->>'decision' when 'publish' then 'published' when 'reject' then 'rejected' else 'archived' end,featured=case when p_data->>'decision'='publish' then coalesce((p_data->>'featured')::boolean,false) else false end where id=e.id returning * into e;
   return to_jsonb(e);
 elsif p_action='follow' then
   select * into b from city_businesses where id=(p_data->>'businessId')::uuid;
   if coalesce((p_data->>'enabled')::boolean,false) then
     if b.published is null or b.status='suspended' then raise exception 'Business unavailable'; end if;
     insert into city_follows values(p_user,b.id) on conflict do nothing;
   else delete from city_follows where user_id=p_user and business_id=(p_data->>'businessId')::uuid; end if;
 elsif p_action='save_launch' then
   select * into e from city_discovery_entries where id=(p_data->>'id')::uuid;
   if coalesce((p_data->>'enabled')::boolean,false) then
     if e.id is null or e.kind<>'launch' or e.published is null or e.status='archived' or not exists(select 1 from city_businesses where id=e.business_id and published is not null and status<>'suspended') then raise exception 'Launch unavailable'; end if;
     insert into city_saved_launches values(p_user,e.id) on conflict do nothing;
   else delete from city_saved_launches where user_id=p_user and launch_id=(p_data->>'id')::uuid; end if;
 elsif p_action='progress' then
   select * into e from city_discovery_entries where id=(p_data->>'id')::uuid;
   if e.id is null or e.kind<>'trail' or e.published is null or e.status='archived' then raise exception 'Trail unavailable'; end if;
   select coalesce(array_agg(distinct v::uuid),'{}') into v_completed from jsonb_array_elements_text(p_data->'completed') v where exists(select 1 from jsonb_array_elements(e.published->'stops') s where s->>'businessId'=v);
   insert into city_trail_progress(user_id,trail_id,completed) values(p_user,e.id,v_completed)
   on conflict(user_id,trail_id) do update set completed=(select coalesce(array_agg(distinct x),'{}'::uuid[]) from unnest(city_trail_progress.completed || excluded.completed) x),updated_at=now();
 else raise exception 'Unknown discovery command'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.city_discovery_mutate(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.city_discovery_mutate(uuid,text,jsonb) to service_role;

create or replace function public.city_mutate(p_user uuid,p_action text,p_data jsonb) returns jsonb
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
    if b.published is null or b.status='suspended' then raise exception 'Property is unavailable'; end if;
    if coalesce((p_data->>'saved')::boolean,true) then
      insert into city_saves(user_id,business_id) values(p_user,b.id) on conflict do nothing;
    else delete from city_saves where user_id=p_user and business_id=b.id; end if;
    update city_listings set saves=(select count(*) from city_saves where business_id=b.id) where business_id=b.id;
    return jsonb_build_object('ok',true);
  elsif p_action='claim' then
    if b.published is null or b.status='suspended' then raise exception 'Property is unavailable'; end if;
    v_offer:=b.published->'offer';
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


create or replace function public.city_record_visit(p_business uuid,p_user uuid) returns void language plpgsql security invoker set search_path=public as $$ begin
 delete from city_visit_days where day<current_date-29;
 if exists(select 1 from city_businesses where id=p_business and published is not null and status<>'suspended' and owner_id<>p_user) then
 insert into city_visit_days(business_id,user_id) values(p_business,p_user) on conflict do nothing; end if;
end $$;
