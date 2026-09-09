-- Setup expenditure is independent of user credits. All RPCs are service-only.
create table public.game_animation_setup_budgets (
 id text primary key,
 total_cents integer not null check (total_cents = 3000),
 admission_cents integer not null check (admission_cents = 2500),
 enabled boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.game_animation_setup_spend (
 id uuid primary key,
 budget_id text not null references public.game_animation_setup_budgets(id),
 phase text not null check (phase in ('benchmark','integration','ledge')),
 purpose text not null check (length(purpose) between 1 and 500),
 reserved_cents integer not null check (reserved_cents > 0),
 actual_cents integer check (actual_cents >= 0),
 status text not null default 'reserved' check (status in ('reserved','submitted','uncertain','settled','released')),
 provider_request_id text,
 evidence jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index game_animation_setup_spend_budget on public.game_animation_setup_spend(budget_id);
insert into public.game_animation_setup_budgets(id,total_cents,admission_cents)
 values('kimodo-initial-2026-09',3000,2500);

alter table public.game_animation_setup_budgets enable row level security;
alter table public.game_animation_setup_spend enable row level security;
revoke all on public.game_animation_setup_budgets,public.game_animation_setup_spend from public,anon,authenticated;
grant select,insert,update on public.game_animation_setup_budgets,public.game_animation_setup_spend to service_role;

create function public.game_animation_reserve_setup(p_id uuid,p_budget text,p_phase text,p_cents integer,p_purpose text)
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
 phase_limit:=case p_phase when 'benchmark' then 1000 when 'integration' then 1000 when 'ledge' then 500 else null end;
 if phase_limit is null or p_cents is null or p_cents<=0 or p_purpose is null then raise exception 'Invalid reservation'; end if;
 select coalesce(sum(case when status='released' then 0 when status='settled' then actual_cents else reserved_cents end),0),
 coalesce(sum(case when phase<>p_phase or status='released' then 0 when status='settled' then actual_cents else reserved_cents end),0)
 into total_committed,phase_committed from public.game_animation_setup_spend where budget_id=p_budget;
 if total_committed+p_cents>b.admission_cents or phase_committed+p_cents>phase_limit then raise exception 'Animation setup budget exhausted'; end if;
 insert into public.game_animation_setup_spend(id,budget_id,phase,purpose,reserved_cents)
 values(p_id,p_budget,p_phase,p_purpose,p_cents) returning * into prior;
 return to_jsonb(prior);
end $$;

create function public.game_animation_update_setup(p_id uuid,p_status text,p_actual_cents integer default null,p_request_id text default null,p_evidence jsonb default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare r public.game_animation_setup_spend; bid text;
begin
 select budget_id into bid from public.game_animation_setup_spend where id=p_id;
 if not found then raise exception 'Unknown setup reservation'; end if;
 perform 1 from public.game_animation_setup_budgets where id=bid for update;
 select * into r from public.game_animation_setup_spend where id=p_id for update;
 if r.status in ('settled','released') then
  if r.status<>p_status or r.actual_cents is distinct from p_actual_cents or r.evidence is distinct from p_evidence then raise exception 'Terminal setup reservation mismatch'; end if;
  return to_jsonb(r);
 end if;
 if p_status not in ('submitted','uncertain','settled','released') then raise exception 'Invalid setup transition'; end if;
 if p_status='released' and (r.status<>'reserved' or p_actual_cents is distinct from 0 or p_evidence is null) then raise exception 'Only proven unsubmitted work may be released'; end if;
 if p_status='submitted' and (r.status not in ('reserved','uncertain') or p_request_id is null) then raise exception 'Submission requires a new provider request'; end if;
 if p_status='settled' and (p_actual_cents is null or p_actual_cents<0 or p_evidence is null) then raise exception 'Settlement requires billing evidence'; end if;
 if p_status in ('submitted','uncertain') and p_actual_cents is not null then raise exception 'Unsettled work cannot release budget'; end if;
 if r.provider_request_id is not null and p_request_id is not null and r.provider_request_id<>p_request_id then raise exception 'Provider request mismatch'; end if;
 update public.game_animation_setup_spend set status=p_status,actual_cents=p_actual_cents,
 provider_request_id=coalesce(provider_request_id,p_request_id),evidence=p_evidence,updated_at=now() where id=p_id returning * into r;
 -- Unexpected overruns are recorded honestly and stop further paid work.
 if p_status='settled' and p_actual_cents>r.reserved_cents then
  update public.game_animation_setup_budgets set enabled=false where id=bid;
 end if;
 return to_jsonb(r);
end $$;
revoke all on function public.game_animation_reserve_setup(uuid,text,text,integer,text) from public,anon,authenticated;
revoke all on function public.game_animation_update_setup(uuid,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.game_animation_reserve_setup(uuid,text,text,integer,text) to service_role;
grant execute on function public.game_animation_update_setup(uuid,text,integer,text,jsonb) to service_role;
