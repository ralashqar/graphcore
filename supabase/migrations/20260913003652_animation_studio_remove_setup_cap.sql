-- User requested removal of the cumulative virtual studio setup budget.
-- Historical experimental reservations remain untouched. Per-command maxima remain enforced.
alter table public.game_animation_setup_budgets
 add column enforce_setup_cap boolean not null default true;
insert into public.game_animation_setup_budgets(id,total_cents,admission_cents,enabled,enforce_setup_cap)
 values('animation-studio-live',3000,2500,true,false);
-- Legacy fixed-value columns remain for compatibility; they are not caps for this accounting ledger.
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
 if not b.enforce_setup_cap and (p_budget<>'animation-studio-live' or p_phase<>'integration' or p_purpose is distinct from 'Animation studio '||p_id::text) then raise exception 'Invalid studio accounting reservation'; end if;
 if not b.enabled then raise exception 'Animation setup admissions disabled'; end if;
 if exists(select 1 from public.game_animation_setup_spend where budget_id=p_budget and status='uncertain') then raise exception 'Reconcile uncertain setup work before admitting more'; end if;
 phase_limit:=case p_phase when 'benchmark' then 1000 when 'integration' then 1000+b.studio_additional_cents when 'ledge' then 500-coalesce(b.motionbricks_cents,0) when 'motionbricks' then b.motionbricks_cents else null end;
 if phase_limit is null or p_cents is null or p_cents<=0 or p_purpose is null then raise exception 'Invalid reservation'; end if;
 select coalesce(sum(case when status='released' then 0 when status='settled' then actual_cents else reserved_cents end),0),
 coalesce(sum(case when phase<>p_phase or status='released' then 0 when status='settled' then actual_cents else reserved_cents end),0)
 into total_committed,phase_committed from public.game_animation_setup_spend where budget_id=p_budget;
 if b.enforce_setup_cap and (total_committed+p_cents>b.admission_cents+b.studio_additional_cents or phase_committed+p_cents>phase_limit) then raise exception 'Animation setup budget exhausted'; end if;
 if p_phase='motionbricks' and p_purpose like 'MotionBricks compatibility%' and (select count(*) from public.game_animation_setup_spend where budget_id=p_budget and phase='motionbricks' and purpose like 'MotionBricks compatibility%' and status<>'released')>=2 then raise exception 'MotionBricks hardware attempt limit reached'; end if;
 insert into public.game_animation_setup_spend(id,budget_id,phase,purpose,reserved_cents)
 values(p_id,p_budget,p_phase,p_purpose,p_cents) returning * into prior;
 return to_jsonb(prior);
end $$;

do $migration$
declare definition text; original text;
begin
 select pg_get_functiondef('public.animation_studio_command(uuid,jsonb,jsonb)'::regprocedure) into original;
 definition:=replace(original, $old$game_animation_reserve_setup(jid,'kimodo-initial-2026-09','integration'$old$, $new$game_animation_reserve_setup(jid,'animation-studio-live','integration'$new$);
 if definition=original then raise exception 'Expected studio reservation call missing'; end if;
 execute definition;
end $migration$;
