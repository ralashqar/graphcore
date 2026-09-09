-- Run together with the additive migration in one transaction; always rollback.
do $$
declare p uuid; d uuid; actor uuid; sid uuid:=gen_random_uuid(); cmd jsonb; a jsonb; b jsonb; j jsonb; jid uuid; rid uuid; tid uuid; first_token bigint; balance_before integer; other uuid; asset jsonb;
 competing_session uuid:=gen_random_uuid();competing_take uuid;competing_run uuid;
begin
 select pr.id,pd.id,m.user_id into p,d,actor from public.projects pr join public.project_drafts pd on pd.project_id=pr.id join public.workspace_memberships m on m.workspace_id=pr.workspace_id and m.role in ('owner','editor') limit 1;
 if actor is null then raise exception 'Editable draft fixture required'; end if;
 insert into public.user_credits(user_id,balance) values(actor,10000) on conflict(user_id) do update set balance=10000;
 cmd:=jsonb_build_object('action','create','sessionId',sid,'projectId',p,'draftId',d,'idempotencyKey',gen_random_uuid(),'title','Runtime test','source','{}'::jsonb,'entityKeys','[]'::jsonb,'settings',jsonb_build_object('durationSeconds',5,'resolution','768p'));
 perform public.director_commit_command(actor,cmd);
 cmd:=cmd||jsonb_build_object('action','generate','idempotencyKey',gen_random_uuid(),'expectedRevision',1,'direction','The observatory at dusk','executionVersion','director_v2','providerPrompt','Frozen prompt','context',jsonb_build_object('references','[]'::jsonb),'estimatedCostUsd',0.4);
 a:=public.director_commit_command(actor,cmd);b:=public.director_commit_command(actor,cmd);
 if a<>b then raise exception 'Duplicate command created another run'; end if;
 if public.director_lookup_command(actor,cmd)<>a then raise exception 'Lost acknowledgement not recoverable'; end if;
 rid:=(a->>'runId')::uuid;tid:=(a->>'takeId')::uuid;
 select id into jid from public.director_runtime_jobs where run_id=rid;
 if jid is null or (select metadata->>'executionOwner' from public.output_workflow_runs where id=rid)<>'director_v2' then raise exception 'Missing immutable execution owner'; end if;
 if (select snapshot->>'direction' from public.director_runtime_jobs where id=jid)<>'The observatory at dusk' then raise exception 'Atomic direction was not frozen'; end if;
 begin
  update public.director_runtime_jobs set snapshot='{}' where id=jid;
  raise exception 'Snapshot mutability regression';
 exception when raise_exception then if sqlerrm='Snapshot mutability regression' then raise; end if;end;
 -- Put this transaction's job first; live jobs outside this transaction remain untouched.
 update public.director_runtime_jobs set next_attempt_at='2000-01-01' where id=jid;
 j:=public.director_claim_job('test-media','media');
 if j->>'id'<>jid::text then raise exception 'Wrong media job claim'; end if;
 first_token:=(j->>'lease_token')::bigint;
 update public.director_runtime_jobs set lease_until=now()-interval '1 second' where id=jid;
 j:=public.director_claim_job('replacement','media');
 begin
  perform public.director_checkpoint(jid,'test-media',first_token,'submit','{"model":"wrong"}');
  raise exception 'Stale worker wrote checkpoint';
 exception when serialization_failure then null;end;
 perform public.director_checkpoint(jid,'replacement',(j->>'lease_token')::bigint,'submit','{"model":"minimax/h3-max/text-to-video","prompt":"Frozen prompt"}');
 update public.director_runtime_jobs set next_attempt_at='2000-01-01' where id=jid;
 j:=public.director_claim_job('test-orchestrator','orchestration');
 if not (j->>'provider_permit')::boolean then raise exception 'Provider permit not retained'; end if;
 if not public.director_begin_submission(jid,'test-orchestrator',(j->>'lease_token')::bigint) then raise exception 'Initial submission denied'; end if;
 if public.director_begin_submission(jid,'test-orchestrator',(j->>'lease_token')::bigint) then raise exception 'Duplicate paid submission allowed'; end if;
 -- Early webhook, duplicate payload, then provider handle persistence.
 insert into public.director_provider_inbox(request_id,digest,payload) values('test-request','test-digest','{"status":"OK"}') on conflict do nothing;
 insert into public.director_provider_inbox(request_id,digest,payload) values('test-request','test-digest','{"status":"OK"}') on conflict do nothing;
 if (select count(*) from public.director_provider_inbox where request_id='test-request')<>1 then raise exception 'Webhook dedupe failed'; end if;
 perform public.director_record_provider(jid,'test-request');
 perform public.director_checkpoint(jid,'test-orchestrator',(j->>'lease_token')::bigint,'await_provider','{}',5);
 if (select lease_until from public.director_runtime_jobs where id=jid) is not null then raise exception 'Provider wait held a worker'; end if;
 if not (select provider_permit from public.director_runtime_jobs where id=jid) then raise exception 'Provider capacity released too early'; end if;
 insert into public.director_sessions(id,project_id,draft_id,title,settings,created_by) values(competing_session,p,d,'Capacity test','{}',actor);
 insert into public.director_takes(session_id,project_id,draft_id,prompt,settings,context) values(competing_session,p,d,'Capacity test','{}','{}') returning id into competing_take;
 competing_run:=public.director_enqueue_run(competing_session,actor,'take',jsonb_build_object('takeId',competing_take));
 update public.director_takes set run_id=competing_run where id=competing_take;
 update public.director_runtime_jobs set phase='submit',next_attempt_at='2000-01-01' where run_id=competing_run;
 if public.director_claim_job('competing-provider','orchestration') is not null then raise exception 'Same project exceeded provider capacity'; end if;
 perform public.director_cancel_job(actor,competing_run);
 -- Legacy stale recovery must not mutate an owned run, even after all old attempts are exhausted.
 update public.output_workflow_runs set status='running',heartbeat_at=now()-interval '1 hour',attempt_count=99 where id=rid;
 other:=public.claim_output_workflow_run('legacy-test');
 if other=rid or (select status from public.output_workflow_runs where id=rid)<>'running' then raise exception 'Legacy worker adopted/failed a Director job'; end if;
 update public.director_runtime_jobs set next_attempt_at='2000-01-01' where id=jid;
 j:=public.director_claim_job('poll','orchestration');
 perform public.director_checkpoint(jid,'poll',(j->>'lease_token')::bigint,'ingest','{"videoUrl":"https://example.invalid/test.mp4","providerTerminal":true}');
 update public.director_runtime_jobs set next_attempt_at='2000-01-01' where id=jid;
 j:=public.director_claim_job('ingest','media');
 -- Failed ingestion stays on ingestion; it cannot transition back to submit.
 begin
  perform public.director_checkpoint(jid,'ingest',(j->>'lease_token')::bigint,'submit');
  raise exception 'Ingestion could regenerate';
 exception when raise_exception then if sqlerrm='Ingestion could regenerate' then raise; end if;end;
 asset:=jsonb_build_object('assetKey','director.'||tid,'storagePath','generated/director-v2/'||jid||'/3/result.mp4','mimeType','video/mp4','durationSeconds',5);
 perform public.director_checkpoint(jid,'ingest',(j->>'lease_token')::bigint,'finalize',jsonb_build_object('asset',asset));
 update public.director_runtime_jobs set next_attempt_at='2000-01-01' where id=jid;
 j:=public.director_claim_job('finalize','orchestration');
 begin
  perform public.director_finalize_job(jid,'finalize',(j->>'lease_token')::bigint,null);
  raise exception 'Missing usage allowed partial finalize';
 exception when raise_exception then if sqlerrm='Missing usage allowed partial finalize' then raise; end if;end;
 if exists(select 1 from public.project_assets where key=asset->>'assetKey') then raise exception 'Failed finalize left partial asset'; end if;
 perform public.director_finalize_job(jid,'finalize',(j->>'lease_token')::bigint,'{}');
 perform public.director_finalize_job(jid,'finalize',(j->>'lease_token')::bigint,'{}');
 if (select count(*) from public.director_usage_outbox where job_id=jid)<>1 or not (select credits_settled from public.director_takes where id=tid) then raise exception 'Atomic/idempotent finalization failed'; end if;
 if (select status from public.output_workflow_runs where id=rid)<>'completed' then raise exception 'Legacy history projection missing'; end if;
 -- New unsubmitted job cancellation fences an in-flight media worker and refunds once.
 cmd:=cmd||jsonb_build_object('idempotencyKey',gen_random_uuid(),'expectedRevision',2);
 a:=public.director_commit_command(actor,cmd);rid:=(a->>'runId')::uuid;tid:=(a->>'takeId')::uuid;
 select id into jid from public.director_runtime_jobs where run_id=rid;
 update public.director_runtime_jobs set next_attempt_at='2000-01-01' where id=jid;
 j:=public.director_claim_job('cancel-race','media');
 select balance into balance_before from public.user_credits where user_id=actor;
 perform public.director_cancel_job(actor,rid);perform public.director_cancel_job(actor,rid);
 if (select balance from public.user_credits where user_id=actor)<>balance_before+40 then raise exception 'Cancellation refund duplicated or missing'; end if;
 begin
  perform public.director_checkpoint(jid,'cancel-race',(j->>'lease_token')::bigint,'submit','{"model":"late"}');
  raise exception 'Cancelled worker could publish';
 exception when serialization_failure then null;end;
 if has_table_privilege('authenticated','public.director_runtime_jobs','select') or has_function_privilege('authenticated','public.director_claim_job(text,text)','execute') then raise exception 'Runtime is exposed to browser roles'; end if;
 raise notice 'Director runtime recovery, fencing, billing, ownership, and atomicity assertions passed';
end $$;
