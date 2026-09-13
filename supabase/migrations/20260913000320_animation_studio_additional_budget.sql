-- Explicit user authorization: up to $10 additional for fresh studio motions (2026-09-13).
-- Preserve the original budget and every historical reservation.
alter table public.game_animation_setup_budgets
 add column studio_additional_cents integer not null default 0 check (studio_additional_cents between 0 and 1000),
 add column studio_additional_evidence jsonb;
update public.game_animation_setup_budgets set studio_additional_cents=1000,
 studio_additional_evidence=jsonb_build_object('date','2026-09-13','authorization','User approved up to $10 additional to enable and test fresh studio motions')
 where id='kimodo-initial-2026-09';
create or replace function public.game_animation_reserve_setup(p_id uuid,p_budget text,p_phase text,p_cents integer,p_purpose text)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare b public.game_animation_setup_budgets; prior public.game_animation_setup_spend;
 total_committed bigint; phase_committed bigint; phase_limit integer;
begin
 select * into b from public.game_animation_setup_budgets where id=p_budget for update;
 if not found then raise exception 'Unknown animation setup budget'; end if;
 select * into prior from public.game_animation_setup_spend where id=p_id;
 if found then
  if prior.budget_id<>p_budget or prior.phase<>p_phase or prior.reserved_cents<>p_cents or prior.purpose<>p_purpose then
   raise exception 'Reservation idempotency mismatch';
  end if;
  return to_jsonb(prior);
 end if;
 if not b.enabled then raise exception 'Animation setup admissions disabled'; end if;
 if exists(select 1 from public.game_animation_setup_spend where budget_id=p_budget and status='uncertain') then raise exception 'Reconcile uncertain setup work before admitting more'; end if;
 phase_limit:=case p_phase when 'benchmark' then 1000 when 'integration' then 1000+b.studio_additional_cents when 'ledge' then 500-coalesce(b.motionbricks_cents,0) when 'motionbricks' then b.motionbricks_cents else null end;
 if phase_limit is null or p_cents is null or p_cents<=0 or p_purpose is null then raise exception 'Invalid reservation'; end if;
 select coalesce(sum(case when status='released' then 0 when status='settled' then actual_cents else reserved_cents end),0),
 coalesce(sum(case when phase<>p_phase or status='released' then 0 when status='settled' then actual_cents else reserved_cents end),0)
 into total_committed,phase_committed from public.game_animation_setup_spend where budget_id=p_budget;
 if total_committed+p_cents>b.admission_cents+b.studio_additional_cents or phase_committed+p_cents>phase_limit then raise exception 'Animation setup budget exhausted'; end if;
 if p_phase='motionbricks' and p_purpose like 'MotionBricks compatibility%' and (select count(*) from public.game_animation_setup_spend where budget_id=p_budget and phase='motionbricks' and purpose like 'MotionBricks compatibility%' and status<>'released')>=2 then raise exception 'MotionBricks hardware attempt limit reached'; end if;
 insert into public.game_animation_setup_spend(id,budget_id,phase,purpose,reserved_cents)
 values(p_id,p_budget,p_phase,p_purpose,p_cents) returning * into prior;
 return to_jsonb(prior);
end $$;
