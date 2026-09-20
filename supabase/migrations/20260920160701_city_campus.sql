-- Campus content uses the existing profile draft/review revision, publishing atomically.
create table public.city_campus_revisions (
 business_id uuid references public.city_businesses(id) on delete cascade, version integer not null,
 campus jsonb not null, created_at timestamptz not null default now(), primary key(business_id,version)
);
create function public.city_capture_campus() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.draft->'campus' is not null and new.draft->'campus'<>'null'::jsonb then
 insert into city_campus_revisions values(new.id,new.draft_version,new.draft->'campus',now()) on conflict do nothing;
 end if; return new;
end $$;
create trigger city_capture_campus after insert or update of draft on public.city_businesses for each row execute function public.city_capture_campus();
create table public.city_setup_budget(id boolean primary key default true check(id), enabled boolean not null default false, cap_cents integer not null default 2000 check(cap_cents between 0 and 2000));
insert into public.city_setup_budget default values;
create table public.city_setup_jobs (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.city_businesses(id), user_id uuid not null references auth.users(id),
 request_key uuid not null, kind text not null check(kind in ('initial','refine')), base_version integer not null,
 input jsonb not null, pricing jsonb not null, model text not null, policy text not null default 'city-campus-1.0.0',
 status text not null default 'queued' check(status in ('queued','running','ready','failed','uncertain','cancelled','applied')),
 stage text not null default 'extract', manifest jsonb, plan jsonb, candidate jsonb, error text,
 reserved_cents integer not null check(reserved_cents between 0 and 100), spent_cents integer not null default 0 check(spent_cents>=0),
 provider_pending boolean not null default false, calls integer not null default 0 check(calls between 0 and 2), responses jsonb not null default '[]',
 lease uuid, worker text, heartbeat timestamptz, attempts integer not null default 0,
 created_at timestamptz not null default now(), unique(user_id,request_key)
);
create index city_setup_queue on public.city_setup_jobs(status,created_at);
create index city_setup_owner on public.city_setup_jobs(user_id,business_id);
create table public.city_campus_metrics(business_id uuid references public.city_businesses(id) on delete cascade, exhibit_id text not null, kind text not null check(kind in ('view','sample_start','sample_interaction','click')), visitor_hash text not null, day date not null default current_date, primary key(business_id,exhibit_id,kind,visitor_hash,day));
do $$ declare t text; begin
 foreach t in array array['city_campus_revisions','city_setup_budget','city_setup_jobs','city_campus_metrics'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.city_setup_command(p_user uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare b city_businesses; j city_setup_jobs; budget city_setup_budget; amount integer; saved jsonb;
begin
 if p_user is null then raise exception 'Authentication required'; end if;
 -- All setup admissions serialize on the budget. Profile writes use the marketplace lock order.
 select * into budget from city_setup_budget where id=true for update;
 if p_action='start' then
 select * into j from city_setup_jobs where user_id=p_user and request_key=(p_data->>'requestKey')::uuid;
 if j.id is not null then
 if j.business_id<>(p_data->>'businessId')::uuid or j.input is distinct from p_data->'input' or j.kind<>p_data->>'kind' then raise exception 'Idempotency key conflict'; end if;
 return to_jsonb(j); end if;
 end if;
 perform pg_advisory_xact_lock(73190421);
 select * into b from city_businesses where id=(p_data->>'businessId')::uuid for update;
 if b.id is null or b.owner_id<>p_user or b.status='suspended' then raise exception 'Business owner required'; end if;
 if p_action='start' then
 if not budget.enabled then raise exception 'Setup pilot budget is disabled'; end if;
 if b.draft_version is distinct from (p_data->>'version')::integer then raise exception 'Draft changed; reload'; end if;
 if exists(select 1 from city_setup_jobs where business_id=b.id and status in ('queued','running','uncertain')) then raise exception 'A setup is already active or awaiting reconciliation'; end if;
 if (select count(*) from city_setup_jobs where business_id=b.id and kind=p_data->>'kind') >= (case when p_data->>'kind'='initial' then 1 else 2 end) then raise exception 'Pilot allowance used; manual editing remains available'; end if;
 amount:=(p_data->>'reserve')::integer;
 if amount is null or amount<1 or amount>100 or coalesce((p_data->'pricing'->>'input')::numeric,0)<=0 or coalesce((p_data->'pricing'->>'output')::numeric,0)<=0 then raise exception 'Invalid setup pricing'; end if;
 if (select coalesce(sum(greatest(reserved_cents,spent_cents)),0) from city_setup_jobs)+amount > budget.cap_cents then raise exception 'Pilot budget exhausted'; end if;
 insert into city_setup_jobs(business_id,user_id,request_key,kind,base_version,input,pricing,model,reserved_cents)
 values(b.id,p_user,(p_data->>'requestKey')::uuid,p_data->>'kind',b.draft_version,p_data->'input',p_data->'pricing',p_data->>'model',amount) returning * into j;
 elsif p_action in ('cancel','retry','apply') then
 select * into j from city_setup_jobs where id=(p_data->>'id')::uuid and business_id=b.id and user_id=p_user for update;
 if j.id is null then raise exception 'Setup not found'; end if;
 if p_action='cancel' then
 if j.status not in ('queued','running','failed','uncertain','ready') then raise exception 'Cannot cancel this setup'; end if;
 update city_setup_jobs set status='cancelled',lease=null,reserved_cents=case when provider_pending then reserved_cents else spent_cents end where id=j.id returning * into j;
 elsif p_action='retry' then
 if not budget.enabled then raise exception 'Setup pilot disabled'; end if;
 if j.status not in ('failed','ready') or j.provider_pending or j.attempts>=3 or (j.status='ready' and (j.plan is null or not exists(select 1 from jsonb_array_elements(j.manifest->'images') i where (i->>'failed')::boolean=true))) then raise exception 'This request cannot be retried automatically'; end if;
 if j.base_version<>b.draft_version then raise exception 'Draft changed; keep candidate separate'; end if;
 update city_setup_jobs set status='queued',error=null,lease=null,manifest=case when manifest is null then null else jsonb_set(manifest,'{images}',coalesce((select jsonb_agg(i-'failed') from jsonb_array_elements(manifest->'images') i),'[]'::jsonb)) end where id=j.id returning * into j;
 else
 if j.status<>'ready' or j.base_version<>b.draft_version or j.base_version is distinct from (p_data->>'version')::integer then raise exception 'Candidate is stale or unavailable'; end if;
 saved:=city_mutate(p_user,'save',jsonb_build_object('businessId',b.id,'version',b.draft_version,'profile',j.candidate->'profile','host',j.input->>'host'));
 update city_setup_jobs set status='applied' where id=j.id returning * into j;
 end if;
 else raise exception 'Unknown setup command'; end if;
 return to_jsonb(j);
end $$;

create function public.city_setup_claim(p_worker text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare j city_setup_jobs;
begin
 perform pg_advisory_xact_lock(73190423);
 update city_setup_jobs set status=case when provider_pending then 'uncertain' when attempts>=3 then 'failed' else 'queued' end,lease=null,error='Worker interrupted; saved stages retained' where status='running' and heartbeat<now()-interval '3 minutes';
 if not exists(select 1 from city_setup_budget where id=true and enabled) or exists(select 1 from city_setup_jobs where status='running') then return null; end if;
 select * into j from city_setup_jobs where status='queued' order by created_at for update skip locked limit 1;
 if j.id is null then return null; end if;
 update city_setup_jobs set status='running',worker=p_worker,lease=gen_random_uuid(),heartbeat=now(),attempts=attempts+1 where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

create function public.city_setup_checkpoint(p_id uuid,p_lease uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security invoker set search_path=public as $$
declare j city_setup_jobs; cost integer;
begin
 select * into j from city_setup_jobs where id=p_id for update;
 if j.id is null or j.lease is distinct from p_lease or j.status<>'running' then raise exception 'Setup lease lost'; end if;
 if p_action='submit_provider' then
 if not exists(select 1 from city_businesses where id=j.business_id and owner_id=j.user_id and status<>'suspended') then raise exception 'Business no longer eligible'; end if;
 if j.provider_pending or j.calls>=2 then raise exception 'Provider submission is uncertain or limit reached'; end if;
 update city_setup_jobs set provider_pending=true,calls=calls+1,heartbeat=now(),stage='plan' where id=j.id returning * into j;
 elsif p_action='provider_result' then
 cost:=(p_data->>'cost')::integer;
 if not j.provider_pending or cost is null or cost<0 then raise exception 'Invalid provider result'; end if;
 update city_setup_jobs set provider_pending=false,spent_cents=spent_cents+cost,responses=responses||jsonb_build_array(p_data),heartbeat=now() where id=j.id returning * into j;
 elsif p_action='checkpoint' then
 update city_setup_jobs set stage=coalesce(p_data->>'stage',stage),manifest=coalesce(p_data->'manifest',manifest),plan=coalesce(p_data->'plan',plan),candidate=coalesce(p_data->'candidate',candidate),heartbeat=now() where id=j.id returning * into j;
 elsif p_action='finish' then
 if p_data->>'status' not in ('ready','failed','uncertain','queued') then raise exception 'Invalid terminal state'; end if;
 update city_setup_jobs set status=case when provider_pending then 'uncertain' else p_data->>'status' end,error=p_data->>'error',reserved_cents=case when p_data->>'status'='ready' and not provider_pending then spent_cents else reserved_cents end,lease=null,heartbeat=now() where id=j.id returning * into j;
 else raise exception 'Unknown checkpoint'; end if;
 return to_jsonb(j);
end $$;
revoke all on function public.city_capture_campus() from public,anon,authenticated;
revoke all on function public.city_setup_command(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.city_setup_claim(text) from public,anon,authenticated;
revoke all on function public.city_setup_checkpoint(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.city_capture_campus(),public.city_setup_command(uuid,text,jsonb),public.city_setup_claim(text),public.city_setup_checkpoint(uuid,uuid,text,jsonb) to service_role;

-- Service-only reconciliation after matching provider usage to this exact job.
create function public.city_setup_reconcile(p_id uuid,p_receipt text,p_cost integer,p_response text default '') returns jsonb language plpgsql security invoker set search_path=public as $$
declare j city_setup_jobs;
begin
 select * into j from city_setup_jobs where id=p_id for update;
 if j.id is null or not j.provider_pending or j.status not in ('uncertain','cancelled') then raise exception 'No uncertain submission to reconcile'; end if;
 if p_receipt is null or length(p_receipt)<10 or p_cost is null or p_cost<0 then raise exception 'Verified provider receipt and nonnegative cost required'; end if;
 update city_setup_jobs set provider_pending=false,spent_cents=spent_cents+p_cost,
 responses=responses||jsonb_build_array(jsonb_build_object('receipt',p_receipt,'cost',p_cost,'text',p_response,'reconciledAt',now())),
 reserved_cents=case when status='cancelled' then least(100,spent_cents+p_cost) else reserved_cents end,
 status=case when status='cancelled' then 'cancelled' else 'failed' end,error='Provider usage reconciled; saved response can be resumed'
 where id=p_id returning * into j;
 return to_jsonb(j);
end $$;
revoke all on function public.city_setup_reconcile(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.city_setup_reconcile(uuid,text,integer,text) to service_role;
