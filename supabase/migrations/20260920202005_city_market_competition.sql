-- Permanent paid geography. All writes and quotes are service-only.
create table public.city_market_transitions (
 revision bigint primary key, version integer not null default 1,
 cause text not null check(cause in ('purchase','correction')),
 initiator uuid, created_at timestamptz not null default now(), moves jsonb not null
);
create table public.city_market_preferences (
 business_id uuid primary key references city_businesses(id) on delete cascade,
 lose_central boolean not null default true, leave_top_ten boolean not null default true,
 below_rank integer check(below_rank between 1 and 100000)
);
create table public.city_market_alerts (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references city_businesses(id) on delete cascade,
 revision bigint not null references city_market_transitions(revision), from_rank integer, to_rank integer,
 created_at timestamptz not null default now(), read_at timestamptz,
 unique(business_id,revision)
);
create index city_market_alerts_owner on city_market_alerts(business_id,created_at desc);
alter table city_market_transitions enable row level security;
alter table city_market_preferences enable row level security;
alter table city_market_alerts enable row level security;
revoke all on city_market_transitions,city_market_preferences,city_market_alerts from anon,authenticated;
grant all on city_market_transitions,city_market_preferences,city_market_alerts to service_role;
create function public.city_market_tier(value bigint) returns integer language sql immutable as $$
 select case when value>=5000000 then 5 when value>=1000000 then 4 when value>=200000 then 3 when value>=50000 then 2 when value>=10000 then 1 else 0 end;
$$;
create function public.city_market_places() returns jsonb language sql stable set search_path=public as $$
 select coalesce(jsonb_object_agg(business_id,jsonb_build_object('id',business_id,'slug',slug,'name',profile->>'name','color',profile->>'color','logo',profile->>'logo','billboard',profile->>'billboard','billboardCrop',profile->'billboardCrop','rank',rank,'value',land_value,'x',x,'z',z,'tier',tier)),'{}'::jsonb) from city_listings;
$$;
alter function public.city_reallocate() rename to city_reallocate_base;
create or replace function public.city_reallocate_base() returns void language plpgsql security invoker set search_path=public as $$
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
    or l.tier < city_market_tier(b.land_value);
  delete from city_listings;
  insert into city_listings(business_id,slug,profile,land_value,rank,x,z,tier,saves,claims)
  select b.id,b.slug,b.published,b.land_value,b.new_rank,p.x,p.z,
    city_market_tier(b.land_value),
    (select count(*) from city_saves s where s.business_id=b.id),(select count(*) from city_claims c where c.business_id=b.id)
  from (select *,row_number() over(order by land_value desc,reached_at,id)::integer new_rank
    from city_businesses where published is not null and status<>'suspended' and land_value>0) b
  join city_plots p on p.priority=b.new_rank;
end $$;
create function public.city_reallocate() returns void language plpgsql security invoker set search_path=public as $$
declare old_places jsonb; new_places jsonb; changes jsonb; rev bigint; reason text; actor uuid;
begin
 perform pg_advisory_xact_lock(73190421);
 old_places:=city_market_places();
 perform city_reallocate_base();
 new_places:=city_market_places();
 select revision into rev from city_state where id;
 reason:=case when current_setting('city.market_cause',true)='purchase' then 'purchase' else 'correction' end;
 actor:=nullif(current_setting('city.market_actor',true),'')::uuid;
 select coalesce(jsonb_agg(jsonb_build_object('id',k,'before',old_places->k,'after',new_places->k)),'[]'::jsonb) into changes
 from (select jsonb_object_keys(old_places) k union select jsonb_object_keys(new_places) k) keys
 where old_places->k is distinct from new_places->k;
 insert into city_market_transitions(revision,cause,initiator,moves) values(rev,reason,actor,changes);
 -- Legacy share events remain readable; corrections are never purchase celebrations.
 if reason='correction' then update city_events set kind='correction' where revision=rev; end if;
 insert into city_market_alerts(business_id,revision,from_rank,to_rank)
 select (m->>'id')::uuid,rev,(m->'before'->>'rank')::integer,(m->'after'->>'rank')::integer
 from jsonb_array_elements(changes) m
 left join city_market_preferences pref on pref.business_id=(m->>'id')::uuid
 where m->'before'->>'rank' is not null
 and (m->'after'->>'rank' is null or (m->'after'->>'rank')::integer>(m->'before'->>'rank')::integer)
 and ((coalesce(pref.lose_central,true) and (m->'before'->>'rank')::integer=1)
 or (coalesce(pref.leave_top_ten,true) and (m->'before'->>'rank')::integer<=10 and coalesce((m->'after'->>'rank')::integer,2147483647)>10)
 or ((m->'before'->>'rank')::integer<=pref.below_rank and coalesce((m->'after'->>'rank')::integer,2147483647)>pref.below_rank));
end $$;
create function public.city_market_quote(p_business uuid,p_amount bigint) returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare b city_businesses; current_place city_listings; projected integer; target_plot city_plots; shortcuts jsonb;
begin
 if p_amount<1000 or p_amount>5000000 then raise exception 'Purchases must be between £10 and £50,000'; end if;
 select * into b from city_businesses where id=p_business;
 if b.id is null or b.published is null or b.status='suspended' then raise exception 'Publish an eligible property first'; end if;
 select * into current_place from city_listings where business_id=b.id;
 -- A new contribution reaches a tied value later than incumbents.
 select 1+count(*) into projected from city_businesses where id<>b.id and published is not null and status<>'suspended' and land_value>0 and land_value>=b.land_value+p_amount;
 select * into target_plot from city_plots where priority=projected;
 select coalesce(jsonb_agg(jsonb_build_object('rank',t.rank,'amount',greatest(1000,t.land_value+1-b.land_value),'available',greatest(1000,t.land_value+1-b.land_value)<=5000000) order by t.rank),'[]'::jsonb) into shortcuts
 from city_listings t where t.business_id<>b.id and t.rank in (1,10,greatest(1,coalesce(current_place.rank,2147483647)-1)) and (current_place.rank is null or t.rank<current_place.rank);
 return jsonb_build_object('revision',(select revision from city_state where id),'quotedAt',statement_timestamp(),'businessId',b.id,'amount',p_amount,'currentRank',current_place.rank,'currentValue',b.land_value,'newValue',b.land_value+p_amount,'rank',projected,'tier',city_market_tier(b.land_value+p_amount),'currentTier',city_market_tier(b.land_value),'from',case when current_place.rank is null then null else jsonb_build_object('x',current_place.x,'z',current_place.z) end,'to',case when target_plot.priority is null then null else jsonb_build_object('x',target_plot.x,'z',target_plot.z) end,'targets',shortcuts,'overtaken',coalesce((select jsonb_agg(jsonb_build_object('name',s.profile->>'name','rank',s.rank)) from (select * from city_listings where business_id<>b.id and rank>=projected and (current_place.rank is null or rank<current_place.rank) order by rank limit 10) s),'[]'::jsonb));
end $$;
revoke all on function city_market_tier(bigint),city_market_places(),city_reallocate_base(),city_reallocate(),city_market_quote(uuid,bigint) from public,anon,authenticated;
grant execute on function city_market_tier(bigint),city_market_places(),city_reallocate_base(),city_reallocate(),city_market_quote(uuid,bigint) to service_role;

create or replace function public.city_apply_payment(p_order uuid,p_token uuid,p_effective bigint,p_status text,p_intent text) returns void
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
  if delta<>0 then
    perform set_config('city.market_cause',case when delta>0 and o.adjustment_version=0 and p_status='fulfilled' then 'purchase' else 'correction' end,true);
    perform set_config('city.market_actor',o.business_id::text,true);
    perform city_reallocate();
    perform set_config('city.market_cause','',true);
    perform set_config('city.market_actor','',true);
  end if;
end $$;

create function public.city_market_read(p_before bigint default null) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('revision',(select revision from city_state where id),'top',coalesce((select jsonb_agg(to_jsonb(l) order by rank) from city_listings l where rank<=10),'[]'::jsonb),'events',coalesce((select jsonb_agg(to_jsonb(t) order by revision desc) from (select revision,version,cause,initiator,created_at,(select coalesce(jsonb_agg(m),'[]'::jsonb) from jsonb_array_elements(moves) m join city_businesses b on b.id=(m->>'id')::uuid where b.status<>'suspended' and b.published is not null) moves from city_market_transitions where p_before is null or revision<p_before order by revision desc limit 20) t),'[]'::jsonb));
$$;
revoke all on function city_market_read(bigint) from public,anon,authenticated;
grant execute on function city_market_read(bigint) to service_role;

create table public.city_market_attribution (
 business_id uuid not null references city_businesses(id) on delete cascade,
 actor text not null, day date not null default (now() at time zone 'UTC')::date,
 source text not null check(source in ('paid_top_spots','organic','deal','share','city')),
 kind text not null check(kind in ('view','click','share','card_impression')),
 primary key(business_id,actor,day,source,kind)
);
alter table city_market_attribution enable row level security;
revoke all on city_market_attribution from anon,authenticated;
grant all on city_market_attribution to service_role;
create function public.city_market_metrics(p_business uuid) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from (select source,kind,count(*)::integer count from city_market_attribution where business_id=p_business and day>=(now() at time zone 'UTC')::date-29 group by source,kind) t;
$$;
revoke all on function city_market_metrics(uuid) from public,anon,authenticated;
grant execute on function city_market_metrics(uuid) to service_role;

create function public.city_market_immutable() returns trigger language plpgsql as $$
begin raise exception 'City market history is immutable'; end $$;
revoke all on function city_market_immutable() from public,anon,authenticated;
create trigger city_market_history_immutable before update or delete on city_market_transitions for each row execute function city_market_immutable();
