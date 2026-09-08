-- Match the command lock order before claiming job/workspace rows.
create or replace function public.game_finish_job(p_job uuid,p_worker text,p_fence bigint,p_result jsonb) returns boolean
language plpgsql security invoker set search_path=public as $$
declare j public.game_jobs; w public.game_workspaces; next_design jsonb; accepted boolean;
begin
 select * into j from public.game_jobs where id=p_job;
 if not found then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('game:'||j.draft_id,0));
 select * into j from public.game_jobs where id=p_job for update;
 if not found or j.status<>'running' or j.lease_owner<>p_worker or j.fence<>p_fence or j.lease_until<=now() then return false; end if;
 select * into strict w from public.game_workspaces where draft_id=j.draft_id for update;
 if j.kind='generate' then
  if w.revision<>(j.input->>'sourceRevision')::integer then
   update public.game_jobs set status='failed',error='Design changed during generation; regenerate against the current revision',updated_at=now() where id=j.id;
   perform public.game_settle_reservation(j.id,j.reserved_credits); return false;
  end if;
  next_design:=p_result->'design';
  if next_design is null then raise exception 'Generated design missing'; end if;
  update public.game_workspaces set design=next_design,revision=revision+1,updated_at=now() where draft_id=j.draft_id returning * into w;
  insert into public.game_revisions(draft_id,revision,design,source_context,created_by) values(w.draft_id,w.revision,w.design,j.input->'context',j.requested_by);
 elsif j.kind='build' then
  accepted:=(p_result->>'accepted')::boolean;
  insert into public.game_builds(id,draft_id,source_revision,manifest,reports,status)
  values(j.id,j.draft_id,(j.input->>'sourceRevision')::integer,p_result->'manifest',p_result->'reports',case when accepted then 'accepted' else 'rejected' end);
  if accepted and w.revision=(j.input->>'sourceRevision')::integer then update public.game_workspaces set active_build_id=j.id,updated_at=now() where draft_id=j.draft_id; end if;
 elsif j.kind='asset' then
  insert into public.game_asset_revisions(id,draft_id,recipe_key,artifact) values(j.id,j.draft_id,j.input->>'recipeKey',p_result->'artifact');
 end if;
 update public.game_jobs set status='completed',phase='complete',lease_until=null,checkpoint=p_result,updated_at=now() where id=j.id;
 perform public.game_settle_reservation(j.id,j.reserved_credits);
 return true;
end $$;

create function public.game_retry_asset_command(p_actor uuid,p_command jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare did uuid:=(p_command->>'draftId')::uuid; w public.game_workspaces; j public.game_jobs; old public.game_commands; result jsonb; retries integer;
begin
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 if not app_private.can_edit_draft(did) then raise exception 'Draft is not editable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('game:'||did,0));
 select * into old from public.game_commands where draft_id=did and idempotency_key=(p_command->>'idempotencyKey')::uuid;
 if found then
  if old.actor<>p_actor or old.command<>p_command then raise exception 'Idempotency conflict'; end if;
  return old.result;
 end if;
 select * into strict w from public.game_workspaces where draft_id=did for update;
 if w.project_id<>(p_command->>'projectId')::uuid then raise exception 'Project mismatch' using errcode='42501'; end if;
 if w.revision<>(p_command->>'expectedRevision')::integer then raise exception 'Game revision conflict' using errcode='40001'; end if;
 select * into strict j from public.game_jobs where id=(p_command->>'jobId')::uuid and draft_id=did for update;
 if j.kind<>'asset' or j.status not in ('failed','attention') then raise exception 'Only interrupted asset jobs can resume'; end if;
 if coalesce((j.checkpoint->>'pendingProvider')::boolean,false) then raise exception 'Uncertain submission needs provider reconciliation'; end if;
 if j.provider_started and (j.checkpoint->>'requestId' is null or j.credits_settled) then raise exception 'No unsettled existing mesh request to resume'; end if;
 if not j.provider_started and exists(select 1 from jsonb_array_elements(j.input->'design'->'assets') a where a->>'key'=j.input->>'recipeKey' and a->>'method'='image_to_3d') then raise exception 'Start a new asset job; there is no provider request to resume'; end if;
 retries:=coalesce((j.checkpoint->>'manualRetries')::integer,0)+1;
 if retries>3 then raise exception 'Asset recovery limit reached'; end if;
 if (select count(*) from public.game_jobs where draft_id=did and status in ('queued','running','attention'))>=4 then raise exception 'Active job limit reached'; end if;
 update public.game_jobs set status='queued',error=null,fence=fence+1,lease_until=null,lease_owner=null,attempts=0,
 checkpoint=checkpoint||jsonb_build_object('manualRetries',retries,'pollingDeadlineAt',floor(extract(epoch from now()+interval '15 minutes')*1000)),updated_at=now() where id=j.id;
 result:=jsonb_build_object('revision',w.revision,'jobId',j.id,'reservedCredits',0);
 insert into public.game_commands(draft_id,idempotency_key,actor,command,result) values(did,(p_command->>'idempotencyKey')::uuid,p_actor,p_command,result);
 return result;
end $$;
revoke all on function public.game_retry_asset_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.game_retry_asset_command(uuid,jsonb) to service_role;
