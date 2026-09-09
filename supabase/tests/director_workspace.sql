-- Execute in a transaction after the migration. Creates no provider jobs outside the transaction.
do $$
declare p uuid; d uuid; actor uuid; sid uuid:=gen_random_uuid(); cmd jsonb; a jsonb; b jsonb; tid uuid; eid uuid; old_count integer;
begin
 select pr.id,pd.id,m.user_id into p,d,actor from public.projects pr join public.project_drafts pd on pd.project_id=pr.id join public.workspace_memberships m on m.workspace_id=pr.workspace_id and m.role in ('owner','editor') limit 1;
 if actor is null then raise exception 'Director SQL tests require an editable draft fixture'; end if;
 insert into public.user_credits(user_id,balance) values(actor,10000) on conflict(user_id) do update set balance=10000;
 cmd:=jsonb_build_object('action','create','sessionId',sid,'projectId',p,'draftId',d,'idempotencyKey',gen_random_uuid(),'title','Director transaction test','source','{}'::jsonb,'entityKeys','[]'::jsonb,'settings',jsonb_build_object('durationSeconds',5));
 a:=public.director_commit_command(actor,cmd); b:=public.director_commit_command(actor,cmd);
 if a<>b or (select count(*) from public.director_sessions where id=sid)<>1 then raise exception 'Create idempotency failed'; end if;
 begin
   perform public.director_commit_command(actor,cmd||jsonb_build_object('action','direct','idempotencyKey',gen_random_uuid(),'expectedRevision',0,'direction','Test'));
   raise exception 'Stale revisions must fail';
 exception when serialization_failure then null; end;
 begin
   perform public.director_commit_command(gen_random_uuid(),cmd||jsonb_build_object('idempotencyKey',gen_random_uuid()));
   raise exception 'Unauthorized actor must fail';
 exception when insufficient_privilege then null; end;
 if has_table_privilege('anon','public.director_sessions','select') or has_table_privilege('authenticated','public.director_takes','update') or has_function_privilege('authenticated','public.director_commit_command(uuid,jsonb)','execute') then raise exception 'Client grants are too broad'; end if;
 if exists(select 1 from pg_class where oid in ('public.director_sessions'::regclass,'public.director_takes'::regclass,'public.director_edits'::regclass,'public.director_messages'::regclass) and not relrowsecurity) then raise exception 'RLS must be enabled'; end if;
 insert into public.director_takes(session_id,project_id,draft_id,prompt,settings,context,status,asset_key,duration_seconds) values(sid,p,d,'test','{}','{}','completed','test-video',5) returning id into tid;
 cmd:=cmd||jsonb_build_object('action','review','idempotencyKey',gen_random_uuid(),'expectedRevision',1,'takeId',tid,'review','kept');
 a:=public.director_commit_command(actor,cmd);
 select active_edit_id into eid from public.director_sessions where id=sid;
 if eid is null then raise exception 'Keep must create edit'; end if;
 select count(*) into old_count from public.director_edits where session_id=sid;
 begin
   perform public.director_commit_command(actor,cmd||jsonb_build_object('action','edit','idempotencyKey',gen_random_uuid(),'expectedRevision',2,'clips',jsonb_build_array(jsonb_build_object('id','clip','takeId',tid,'inSeconds',0,'outSeconds',8))));
   raise exception 'Invalid trim must fail';
 exception when raise_exception then if sqlerrm='Invalid trim must fail' then raise; end if; end;
 if (select count(*) from public.director_edits where session_id=sid)<>old_count then raise exception 'Failed edits must not persist'; end if;
 cmd:=cmd||jsonb_build_object('action','direct','idempotencyKey',gen_random_uuid(),'expectedRevision',2,'direction','An empty observatory at dusk.');
 a:=public.director_commit_command(actor,cmd);
 cmd:=cmd||jsonb_build_object('action','generate','idempotencyKey',gen_random_uuid(),'expectedRevision',3,'context',jsonb_build_object('references','[]'::jsonb),'providerPrompt','Test cinematic','estimatedCostUsd',0.4);
 a:=public.director_commit_command(actor,cmd); b:=public.director_commit_command(actor,cmd);
 if a<>b or a->>'runId' is null then raise exception 'Enqueue must be atomic and idempotent'; end if;
 if not exists(select 1 from public.output_workflow_run_steps where run_id=(a->>'runId')::uuid) then raise exception 'Enqueue must materialize its step'; end if;
 perform public.director_commit_command(actor,cmd||jsonb_build_object('action','cancel','takeId',a->>'takeId','expectedRevision',4,'idempotencyKey',gen_random_uuid()));
 if (select status from public.output_workflow_runs where id=(a->>'runId')::uuid)<>'cancelled' then raise exception 'Cancellation must reach worker run'; end if;
 if (select balance from public.user_credits where user_id=actor)<>10000 then raise exception 'Cancelled unsubmitted take must refund its reservation exactly once'; end if;
 perform public.director_settle_credits((a->>'takeId')::uuid,0);
 if (select balance from public.user_credits where user_id=actor)<>10000 then raise exception 'Settlement retries must not duplicate refunds'; end if;
 raise notice 'Director transaction assertions passed';
end $$;
