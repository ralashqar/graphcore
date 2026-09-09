-- Validation is immutable machine evidence; approval is a separate human decision.
create table public.game_animation_reviews (
 candidate_id uuid primary key references public.game_animation_candidates(id),
 draft_id uuid not null references public.game_workspaces(draft_id),
 decision text not null check(decision in ('accepted','rejected')),
 actor uuid not null references auth.users(id), reason text not null default '' check(length(reason)<=1000),
 created_at timestamptz not null default now()
);
alter table public.game_animation_reviews enable row level security;
revoke all on public.game_animation_reviews from public,anon,authenticated;
grant select on public.game_animation_reviews to authenticated;
grant select,insert on public.game_animation_reviews to service_role;
create policy animation_review_read on public.game_animation_reviews for select to authenticated using(app_private.can_read_draft(draft_id));

create function app_private.require_reviewed_animation_graph() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare binding jsonb;
begin
 for binding in select * from jsonb_array_elements(new.graph->'bindings') loop
  if not exists(select 1 from public.game_animation_candidates c join public.game_animation_reviews r on r.candidate_id=c.id and r.draft_id=c.draft_id
   where c.draft_id=new.draft_id and c.id=(binding->>'clipRevision')::uuid and r.decision='accepted' and c.clip->'validation'->>'accepted'='true'
   and c.clip->>'state'=binding->>'state' and c.clip->>'rigRevision'=new.graph->>'rigRevision') then raise exception 'Binding requires a reviewed compatible animation'; end if;
 end loop;
 return new;
end $$;
create trigger require_reviewed_animation_graph before insert on public.game_animation_graphs for each row execute function app_private.require_reviewed_animation_graph();

alter function public.game_animation_command(uuid,jsonb,jsonb,jsonb) rename to game_animation_before_review;
create function public.game_animation_command(p_actor uuid,p_command jsonb,p_rig jsonb default null,p_provider jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare did uuid:=(p_command->>'draftId')::uuid; w public.game_workspaces; old public.game_commands; c public.game_animation_candidates; prior public.game_animation_reviews; result jsonb; decision text;
begin
 if p_command->>'action' not in ('accept_animation','reject_animation') then return public.game_animation_before_review(p_actor,p_command,p_rig,p_provider); end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft(did) then raise exception 'Draft is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('game:'||did,0));
 select * into old from public.game_commands where draft_id=did and idempotency_key=(p_command->>'idempotencyKey')::uuid;
 if found then
  if old.actor<>p_actor or old.command<>p_command then raise exception 'Idempotency mismatch'; end if;
  return old.result;
 end if;
 select * into strict w from public.game_workspaces where draft_id=did for update;
 if w.project_id<>(p_command->>'projectId')::uuid then raise exception 'Project mismatch' using errcode='42501'; end if;
 if w.revision<>(p_command->>'expectedRevision')::integer then raise exception 'Revision conflict' using errcode='40001'; end if;
 select * into strict c from public.game_animation_candidates where id=(p_command->>'candidateId')::uuid and draft_id=did;
 decision:=case when p_command->>'action'='accept_animation' then 'accepted' else 'rejected' end;
 if decision='accepted' and (c.clip is null or c.clip->'validation'->>'accepted' is distinct from 'true') then raise exception 'Candidate did not pass validation'; end if;
 select * into prior from public.game_animation_reviews where candidate_id=c.id;
 if found and prior.decision<>decision then raise exception 'Reviewed revisions are immutable; choose a replacement candidate'; end if;
 insert into public.game_animation_reviews(candidate_id,draft_id,decision,actor,reason) values(c.id,did,decision,p_actor,coalesce(p_command->>'reason','')) on conflict do nothing;
 if p_command->'graph' is not null then
  if decision<>'accepted' or not exists(select 1 from jsonb_array_elements(p_command->'graph'->'bindings') b where b->>'clipRevision'=c.id::text) then raise exception 'Acceptance graph must bind this candidate'; end if;
  if not exists(select 1 from jsonb_array_elements(w.design->'nodes') n where n->>'kind'='actor_definition' and n->>'id'=p_command->'graph'->>'actorDefinition') then raise exception 'Actor definition not found'; end if;
  update public.game_workspaces set revision=revision+1,updated_at=now() where draft_id=did returning * into w;
  insert into public.game_revisions(draft_id,revision,design,created_by) values(did,w.revision,w.design,p_actor);
  insert into public.game_animation_graphs(draft_id,revision,actor_definition,graph) values(did,w.revision,p_command->'graph'->>'actorDefinition',p_command->'graph');
 end if;
 result:=jsonb_build_object('revision',w.revision,'candidateId',c.id,'decision',decision,'reservedCredits',0);
 insert into public.game_commands(draft_id,idempotency_key,actor,command,result) values(did,(p_command->>'idempotencyKey')::uuid,p_actor,p_command,result);
 return result;
end $$;
revoke all on function public.game_animation_command(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.game_animation_command(uuid,jsonb,jsonb,jsonb) to service_role;

-- Bootstrap owned source motion, never arbitrary remote URLs or executable input.
create function public.game_animation_import(p_actor uuid,p_manifest jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare did uuid:=(p_manifest->>'draftId')::uuid; w public.game_workspaces; old public.game_commands; item jsonb; jid uuid; ids jsonb:='[]'; rig jsonb:=p_manifest->'rig'; result jsonb;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft(did) then raise exception 'Draft is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('game:'||did,0));
 select * into old from public.game_commands where draft_id=did and idempotency_key=(p_manifest->>'idempotencyKey')::uuid;
 if found then
  if old.actor<>p_actor or old.command<>p_manifest then raise exception 'Import idempotency mismatch'; end if;
  return old.result;
 end if;
 select * into strict w from public.game_workspaces where draft_id=did for update;
 if w.project_id<>(p_manifest->>'projectId')::uuid or w.design->>'schemaVersion'<>'3' then raise exception 'Unified project required'; end if;
 if w.revision<>(p_manifest->>'expectedRevision')::integer then raise exception 'Revision conflict' using errcode='40001'; end if;
 if jsonb_typeof(p_manifest->'clips') is distinct from 'array' then raise exception 'Invalid import clips'; end if;
 if jsonb_array_length(p_manifest->'clips') not between 1 and 6 or p_manifest->>'processingVersion' is distinct from 'animation-1.1.0' then raise exception 'Invalid import manifest'; end if;
 insert into public.game_animation_rigs(draft_id,revision,profile) values(did,rig->>'revision',rig) on conflict do nothing;
 if not exists(select 1 from public.game_animation_rigs where draft_id=did and revision=rig->>'revision' and profile=rig) then raise exception 'Rig revision collision'; end if;
 for item in select * from jsonb_array_elements(p_manifest->'clips') loop
  jid:=(item->>'jobId')::uuid;
  if item->>'sourcePath' is distinct from 'generated/game/'||did||'/'||jid||'/source-0.json' or coalesce(item->>'sourceHash','') !~ '^[a-f0-9]{64}$'
   or item->'recipe'->>'rigRevision' is distinct from rig->>'revision' or item->'recipe'->>'candidates' is distinct from '1' then raise exception 'Invalid owned import source'; end if;
  insert into public.game_jobs(id,draft_id,kind,input,checkpoint,requested_by,credits_settled)
   values(jid,did,'asset',jsonb_build_object('projectId',w.project_id,'sourceRevision',w.revision,'template','unified.v1','animation',
    jsonb_build_object('recipe',item->'recipe','rig',rig,'import',item,'provider',jsonb_build_object('modelRevision',p_manifest->>'modelRevision','processingVersion',p_manifest->>'processingVersion'))),
    jsonb_build_object('animationSources',jsonb_build_array(item->>'sourcePath'),'pendingProvider',false),p_actor,true);
  insert into public.game_animation_recipes(job_id,draft_id,recipe,rig_revision,model_revision,processing_version)
   values(jid,did,item->'recipe',rig->>'revision',p_manifest->>'modelRevision',p_manifest->>'processingVersion');
  ids:=ids||jsonb_build_array(jid);
 end loop;
 result:=jsonb_build_object('revision',w.revision,'jobIds',ids,'reservedCredits',0);
 insert into public.game_commands(draft_id,idempotency_key,actor,command,result) values(did,(p_manifest->>'idempotencyKey')::uuid,p_actor,p_manifest,result);
 return result;
end $$;
revoke all on function public.game_animation_import(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.game_animation_import(uuid,jsonb) to service_role;
