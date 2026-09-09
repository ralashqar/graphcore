-- Reallocation preserves the global $25 admission ceiling and every prior hold.
alter table public.game_animation_setup_budgets add column motionbricks_cents integer not null default 0 check(motionbricks_cents between 0 and 500);
alter table public.game_animation_setup_budgets add column motionbricks_allocation_evidence jsonb;
alter table public.game_animation_setup_spend drop constraint game_animation_setup_spend_phase_check;
alter table public.game_animation_setup_spend add constraint game_animation_setup_spend_phase_check check(phase in ('benchmark','integration','ledge','motionbricks'));
create function public.game_animation_allocate_motionbricks(p_budget text,p_cents integer,p_evidence jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.game_animation_setup_budgets; committed bigint;
begin
 select * into strict b from public.game_animation_setup_budgets where id=p_budget for update;
 if b.motionbricks_cents=p_cents and b.motionbricks_allocation_evidence=p_evidence then return; end if;
 if b.motionbricks_cents<>0 or p_cents not between 1 and 500 or p_cents is null or p_evidence is null then raise exception 'Invalid or previously frozen allocation'; end if;
 select coalesce(sum(case when status='released' then 0 when status='settled' then actual_cents else reserved_cents end),0) into committed from public.game_animation_setup_spend where budget_id=p_budget and phase='ledge';
 if committed+p_cents>500 then raise exception 'Cannot reallocate committed ledge funds'; end if;
 update public.game_animation_setup_budgets set motionbricks_cents=p_cents,motionbricks_allocation_evidence=p_evidence where id=p_budget;
end $$;
revoke all on function public.game_animation_allocate_motionbricks(text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.game_animation_allocate_motionbricks(text,integer,jsonb) to service_role;
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
 phase_limit:=case p_phase when 'benchmark' then 1000 when 'integration' then 1000 when 'ledge' then 500-coalesce(b.motionbricks_cents,0) when 'motionbricks' then b.motionbricks_cents else null end;
 if phase_limit is null or p_cents is null or p_cents<=0 or p_purpose is null then raise exception 'Invalid reservation'; end if;
 select coalesce(sum(case when status='released' then 0 when status='settled' then actual_cents else reserved_cents end),0),
 coalesce(sum(case when phase<>p_phase or status='released' then 0 when status='settled' then actual_cents else reserved_cents end),0)
 into total_committed,phase_committed from public.game_animation_setup_spend where budget_id=p_budget;
 if total_committed+p_cents>b.admission_cents or phase_committed+p_cents>phase_limit then raise exception 'Animation setup budget exhausted'; end if;
 if p_phase='motionbricks' and p_purpose like 'MotionBricks compatibility%' and (select count(*) from public.game_animation_setup_spend where budget_id=p_budget and phase='motionbricks' and purpose like 'MotionBricks compatibility%' and status<>'released')>=2 then raise exception 'MotionBricks hardware attempt limit reached'; end if;
 insert into public.game_animation_setup_spend(id,budget_id,phase,purpose,reserved_cents)
 values(p_id,p_budget,p_phase,p_purpose,p_cents) returning * into prior;
 return to_jsonb(prior);
end $$;


create or replace function public.game_animation_before_review(p_actor uuid,p_command jsonb,p_rig jsonb default null,p_provider jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare did uuid:=(p_command->>'draftId')::uuid; pid uuid:=(p_command->>'projectId')::uuid;
 idem uuid:=(p_command->>'idempotencyKey')::uuid; w public.game_workspaces; old public.game_commands;
 jid uuid; result jsonb; binding jsonb; phase text;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft(did) or not exists(select 1 from public.project_drafts where id=did and project_id=pid) then raise exception 'Game workspace is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('game:'||did,0));
 select * into old from public.game_commands where draft_id=did and idempotency_key=idem;
 if found then
  if old.actor<>p_actor or old.command<>p_command then raise exception 'Idempotency mismatch'; end if;
  return old.result;
 end if;
 select * into strict w from public.game_workspaces where draft_id=did for update;
 if w.project_id<>pid or w.design->>'schemaVersion'<>'3' then raise exception 'Unified game required'; end if;
 if (p_command->>'expectedRevision')::integer is distinct from w.revision then raise exception 'Game revision conflict' using errcode='40001'; end if;
 if p_command->>'action'='generate_animation' then
  if p_rig->>'revision' is distinct from p_command->'recipe'->>'rigRevision' or p_provider is null then raise exception 'Frozen rig and provider required'; end if;
  if p_provider->>'processingVersion' is distinct from 'animation-1.1.0' then raise exception 'Supported frozen processing version required'; end if;
  if (select count(*) from public.game_jobs where draft_id=did and status in ('queued','running','attention'))>=4 then raise exception 'Finish active game jobs first'; end if;
  jid:=gen_random_uuid();
  phase:=case when p_command->'recipe'->>'provider'='motionbricks' then 'motionbricks' when p_command->'recipe'->>'state' in ('catch','hang','shimmy_left','shimmy_right','climb') then 'ledge' else 'integration' end;
  perform public.game_animation_reserve_setup(jid,'kimodo-initial-2026-09',phase,(p_provider->>'reservationCents')::integer,'Game animation '||jid);
  insert into public.game_animation_rigs(draft_id,revision,profile) values(did,p_rig->>'revision',p_rig) on conflict do nothing;
  if not exists(select 1 from public.game_animation_rigs where draft_id=did and revision=p_rig->>'revision' and profile=p_rig) then raise exception 'Rig revision collision'; end if;
  insert into public.game_jobs(id,draft_id,kind,input,requested_by)
   values(jid,did,'asset',jsonb_build_object('projectId',pid,'sourceRevision',w.revision,'template','unified.v1','animation',jsonb_build_object('recipe',p_command->'recipe','rig',p_rig,'provider',p_provider)),p_actor);
  insert into public.game_animation_recipes(job_id,draft_id,recipe,rig_revision,model_revision,processing_version)
   values(jid,did,p_command->'recipe',p_rig->>'revision',p_provider->>'modelRevision',p_provider->>'processingVersion');
 elsif p_command->>'action'='bind_animation' then
  if not exists(select 1 from jsonb_array_elements(w.design->'nodes') n where n->>'kind'='actor_definition' and n->>'id'=p_command->'graph'->>'actorDefinition') then raise exception 'Actor definition not found'; end if;
  for binding in select * from jsonb_array_elements(p_command->'graph'->'bindings') loop
   if not exists(select 1 from public.game_animation_candidates c where c.draft_id=did and c.id=(binding->>'clipRevision')::uuid and c.clip->'validation'->>'accepted'='true' and c.clip->>'rigRevision'=p_command->'graph'->>'rigRevision' and c.clip->>'state'=binding->>'state') then raise exception 'Missing or incompatible accepted clip'; end if;
  end loop;
  update public.game_workspaces set revision=revision+1,updated_at=now() where draft_id=did returning * into w;
  insert into public.game_revisions(draft_id,revision,design,created_by) values(did,w.revision,w.design,p_actor);
  insert into public.game_animation_graphs(draft_id,revision,actor_definition,graph) values(did,w.revision,p_command->'graph'->>'actorDefinition',p_command->'graph');
 else raise exception 'Unsupported animation command'; end if;
 result:=jsonb_build_object('revision',w.revision,'jobId',jid,'reservedCredits',0);
 insert into public.game_commands(draft_id,idempotency_key,actor,command,result) values(did,idem,p_actor,p_command,result);
 return result;
end $$;
-- Independent guard against accidentally registering a diagnostic as a clip.
create function app_private.guard_motionbricks_candidate() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare recipe jsonb;
begin
 select r.recipe into strict recipe from public.game_animation_recipes r where r.job_id=new.job_id and r.draft_id=new.draft_id;
 if recipe->>'provider'='motionbricks' and new.clip is not null then
  if recipe->>'purpose' is distinct from 'clip' or recipe->>'state' not in ('idle','walk') or
     new.clip->'provenance' is distinct from recipe->'provenance' or new.clip->>'loop' is distinct from 'true' then
   raise exception 'Diagnostic or incompatible MotionBricks motion cannot be registered as a clip';
  end if;
 end if;
 return new;
end $$;
create trigger guard_motionbricks_candidate before insert on public.game_animation_candidates for each row execute function app_private.guard_motionbricks_candidate();
