-- Observed scene exposure is separate from discovery ranking and card impressions.
alter table public.city_market_attribution drop constraint city_market_attribution_kind_check;
alter table public.city_market_attribution add constraint city_market_attribution_kind_check check(kind in ('view','click','share','card_impression','canvas_exposure'));
create function public.city_record_exposures(p_actor text,p_user uuid,p_ids uuid[],p_kind text) returns integer
language plpgsql security invoker set search_path=public as $$
declare inserted integer;
begin
 if p_kind not in ('card_impression','canvas_exposure') or coalesce(cardinality(p_ids),0)>20 or length(p_actor)>160 or length(p_actor)<3 then raise exception 'Invalid exposure batch'; end if;
 insert into city_market_attribution(business_id,actor,source,kind)
 select distinct b.id,p_actor,case when p_kind='card_impression' then 'paid_top_spots' else 'city' end,p_kind
 from city_businesses b join city_listings l on l.business_id=b.id
 where b.id=any(p_ids) and b.status<>'suspended' and b.published is not null and b.owner_id is distinct from p_user
 on conflict do nothing;
 get diagnostics inserted=row_count;
 return inserted;
end $$;
revoke all on function city_record_exposures(text,uuid,uuid[],text) from public,anon,authenticated;
grant execute on function city_record_exposures(text,uuid,uuid[],text) to service_role;

create or replace function public.city_market_quote(p_business uuid,p_amount bigint) returns jsonb language plpgsql stable security invoker set search_path=public as $$
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
 return jsonb_build_object('leader',(select jsonb_build_object('name',profile->>'name','value',land_value,'id',business_id) from city_listings where rank=1),'revision',(select revision from city_state where id),'quotedAt',statement_timestamp(),'businessId',b.id,'amount',p_amount,'currentRank',current_place.rank,'currentValue',b.land_value,'newValue',b.land_value+p_amount,'rank',projected,'tier',city_market_tier(b.land_value+p_amount),'currentTier',city_market_tier(b.land_value),'from',case when current_place.rank is null then null else jsonb_build_object('x',current_place.x,'z',current_place.z) end,'to',case when target_plot.priority is null then null else jsonb_build_object('x',target_plot.x,'z',target_plot.z) end,'targets',shortcuts,'overtaken',coalesce((select jsonb_agg(jsonb_build_object('name',s.profile->>'name','rank',s.rank)) from (select * from city_listings where business_id<>b.id and rank>=projected and (current_place.rank is null or rank<current_place.rank) order by rank limit 10) s),'[]'::jsonb));
end $$;
