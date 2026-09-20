-- Private, authenticated-only return measurement. Anonymous identifiers stay daily.
create table public.city_visit_days (
  business_id uuid not null references public.city_businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  primary key (business_id,user_id,day)
);
alter table public.city_visit_days enable row level security;
revoke all on public.city_visit_days from public,anon,authenticated;
grant select,insert,delete on public.city_visit_days to service_role;
create index city_visit_days_user on public.city_visit_days(user_id);
create index city_visit_days_retention on public.city_visit_days(day);
create function public.city_record_visit(p_business uuid,p_user uuid) returns void
language plpgsql security invoker set search_path=public as $$
begin
  delete from city_visit_days where day < current_date - 29;
  if exists(select 1 from city_listings l join city_businesses b on b.id=l.business_id where b.id=p_business and b.owner_id<>p_user) then
    insert into city_visit_days(business_id,user_id) values(p_business,p_user) on conflict do nothing;
  end if;
end $$;
create or replace function public.city_analytics(p_business uuid) returns jsonb language sql stable security invoker set search_path=public as $$
  select jsonb_build_object(
    'views',(select count(*) from city_engagement where business_id=p_business and kind='view'),
    'clicks',(select count(*) from city_engagement where business_id=p_business and kind='click'),
    'shares',(select count(*) from city_engagement where business_id=p_business and kind='share'),
    'saves',(select count(*) from city_saves where business_id=p_business),
    'claims',(select count(*) from city_claims where business_id=p_business),
    'views30d',(select count(*) from city_engagement where business_id=p_business and kind='view' and day>=current_date-29),
    'clicks30d',(select count(*) from city_engagement where business_id=p_business and kind='click' and day>=current_date-29),
    'claims30d',(select count(*) from city_claims where business_id=p_business and created_at>=current_date-29),
    'signedInVisitors30d',(select count(distinct user_id) from city_visit_days where business_id=p_business and day>=current_date-29),
    'returningVisitors30d',(select count(*) from (select user_id from city_visit_days where business_id=p_business and day>=current_date-29 group by user_id having count(*)>=2) v)
  );
$$;
revoke all on function public.city_record_visit(uuid,uuid) from public,anon,authenticated;
grant execute on function public.city_record_visit(uuid,uuid) to service_role;

-- Pilot aggregates filter these tables by business rather than the user-first primary keys.
create index city_claims_business_time on public.city_claims(business_id,created_at);
create index city_saves_business on public.city_saves(business_id);
