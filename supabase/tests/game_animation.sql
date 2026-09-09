-- Runs inside a rolled-back transaction. Does not contact providers.
do $$ begin
 if current_setting('graphcore.animation_test_transaction',true) is distinct from 'on' then raise exception 'Run through verify-game-animation-db.mjs inside its rollback transaction'; end if;
end $$;
do $$ declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); r jsonb; begin
 if has_function_privilege('authenticated','public.game_animation_command(uuid,jsonb,jsonb,jsonb)','execute') or has_table_privilege('authenticated','public.game_animation_candidates','insert') or has_table_privilege('anon','public.game_animation_candidates','select') then raise exception 'Animation privilege leak'; end if;
 insert into public.game_animation_setup_budgets(id,total_cents,admission_cents,enabled) values('animation-transaction-test',3000,2500,true);
 r:=public.game_animation_reserve_setup(a,'animation-transaction-test','benchmark',1000,'test');
 if public.game_animation_reserve_setup(a,'animation-transaction-test','benchmark',1000,'test')<>r then raise exception 'Duplicate reservation changed'; end if;
 begin perform public.game_animation_reserve_setup(b,'animation-transaction-test','benchmark',1,'test'); raise exception 'Phase budget bypass'; exception when others then if sqlerrm='Phase budget bypass' then raise; end if; end;
 perform public.game_animation_update_setup(a,'uncertain');
 begin perform public.game_animation_reserve_setup(b,'animation-transaction-test','integration',100,'test'); raise exception 'Uncertain work bypass'; exception when others then if sqlerrm='Uncertain work bypass' then raise; end if; end;
 begin perform public.game_animation_update_setup(a,'released',0,null,'{}'); raise exception 'Uncertain work refunded'; exception when others then if sqlerrm='Uncertain work refunded' then raise; end if; end;
 perform public.game_animation_update_setup(a,'submitted',null,'provider-test');
 perform public.game_animation_update_setup(a,'settled',30,'provider-test','{"billing":"test"}');
 begin perform public.game_animation_update_setup(a,'settled',0,'provider-test','{}'); raise exception 'Settlement changed'; exception when others then if sqlerrm='Settlement changed' then raise; end if; end;
 if not exists(select 1 from pg_class where oid='public.game_animation_candidates'::regclass and relrowsecurity) then raise exception 'Animation RLS missing'; end if;
end $$;

-- Redirect only this transaction's command function to the isolated test budget.
-- The live reservations and function definition are untouched after rollback.
do $$ begin
 execute replace(pg_get_functiondef('public.game_animation_before_review(uuid,jsonb,jsonb,jsonb)'::regprocedure), 'kimodo-initial-2026-09', 'animation-transaction-test');
end $$;

do $$ declare p uuid; d uuid; actor uuid; rev integer; cmd jsonb; result jsonb; jid uuid; rig jsonb; begin
 select w.project_id,w.draft_id,m.user_id,w.revision into p,d,actor,rev from public.game_workspaces w join public.projects pr on pr.id=w.project_id join public.workspace_memberships m on m.workspace_id=pr.workspace_id and m.role='owner' where w.design->>'schemaVersion'='3' and not exists(select 1 from public.game_jobs j where j.draft_id=w.draft_id and j.status in ('queued','running','attention')) limit 1;
 if actor is null then raise exception 'Need an idle unified workspace for transaction-only test'; end if;
 rig:=jsonb_build_object('revision',repeat('a',64));
 cmd:=jsonb_build_object('projectId',p,'draftId',d,'expectedRevision',rev,'idempotencyKey',gen_random_uuid(),'action','generate_animation','recipe',jsonb_build_object('state','idle','rigRevision',repeat('a',64)));
 begin
  perform public.game_animation_command(actor,cmd,rig,'{"reservationCents":100,"modelRevision":"pinned","processingVersion":"animation-1.0.0"}');
  raise exception 'Obsolete processing policy admitted';
 exception when others then
  if sqlerrm <> 'Supported frozen processing version required' then raise; end if;
 end;
 result:=public.game_animation_command(actor,cmd,rig,'{"reservationCents":100,"modelRevision":"pinned","processingVersion":"animation-1.1.0"}');
 jid:=(result->>'jobId')::uuid;
 if not exists(select 1 from public.game_animation_recipes where job_id=jid and processing_version='animation-1.1.0') then raise exception 'Processing policy was not frozen'; end if;
 if public.game_animation_command(actor,cmd)<>result then raise exception 'Animation command not idempotent'; end if;
 if (select count(*) from public.game_animation_setup_spend where id=jid)<>1 then raise exception 'Reservation duplicated'; end if;
 begin perform public.game_animation_command(gen_random_uuid(),cmd); raise exception 'Other user accepted'; exception when insufficient_privilege then null; end;
 if public.game_animation_register(jid,'wrong',1,'[]') then raise exception 'Invalid lease registered'; end if;
 update public.game_jobs set status='running',lease_owner='animation-test',lease_until=now()+interval '90 seconds',fence=1 where id=jid;
 perform public.game_commit_command(actor,jsonb_build_object('action','cancel','template','unified.v1','projectId',p,'draftId',d,'expectedRevision',rev,'idempotencyKey',gen_random_uuid(),'jobId',jid));
 if public.game_animation_register(jid,'animation-test',1,'[]') then raise exception 'Cancelled animation registered'; end if;
 cmd:=jsonb_build_object('projectId',p,'draftId',d,'expectedRevision',rev,'idempotencyKey',gen_random_uuid(),'action','retry','template','unified.v1','jobId',jid);
 begin perform public.game_retry_animation_command(actor,cmd); raise exception 'Cancelled animation resumed'; exception when others then if sqlerrm='Cancelled animation resumed' then raise; end if; end;
 update public.game_jobs set status='failed',input=jsonb_set(input,'{animation,recipe,candidates}','1') where id=jid;
 begin perform public.game_retry_animation_command(actor,cmd); raise exception 'Missing inference resubmitted'; exception when others then if sqlerrm='Missing inference resubmitted' then raise; end if; end;
 update public.game_jobs set checkpoint=jsonb_build_object('pendingProvider',false,'animationSources',jsonb_build_array('generated/game/'||d||'/'||jid||'/source-0.json')) where id=jid;
 result:=public.game_retry_animation_command(actor,cmd);
 if public.game_retry_animation_command(actor,cmd)<>result then raise exception 'Animation recovery not idempotent'; end if;
 if (select count(*) from public.game_animation_setup_spend where id=jid)<>1 then raise exception 'Recovery duplicated reservation'; end if;
end $$;

do $$ declare w public.game_workspaces; actor uuid; candidate uuid:=gen_random_uuid(); jid uuid; graph jsonb; cmd jsonb; result jsonb; count_before integer; manifest jsonb; imported uuid:=gen_random_uuid(); begin
 if not has_schema_privilege('service_role','app_private','usage') then raise exception 'Animation server cannot access authorization helpers'; end if;
 select * into w from public.game_workspaces where design->>'schemaVersion'='3' limit 1;
 select m.user_id into actor from public.projects p join public.workspace_memberships m on m.workspace_id=p.workspace_id and m.role='owner' where p.id=w.project_id limit 1;
 jid:=gen_random_uuid();
 insert into public.game_animation_rigs(draft_id,revision,profile) values(w.draft_id,repeat('b',64),jsonb_build_object('revision',repeat('b',64))) on conflict do nothing;
 insert into public.game_jobs(id,draft_id,kind,input,requested_by) values(jid,w.draft_id,'asset','{}',actor);
 insert into public.game_animation_recipes(job_id,draft_id,recipe,rig_revision,model_revision,processing_version) values(jid,w.draft_id,'{}',repeat('b',64),'test','animation-1.1.0');
 insert into public.game_animation_candidates(id,job_id,draft_id,candidate_index,source_path,clip,diagnostics) values(candidate,jid,w.draft_id,0,'test',jsonb_build_object('state','idle','rigRevision',repeat('b',64),'validation',jsonb_build_object('accepted',true)),'{}');
 graph:=jsonb_build_object('version',1,'id','test.graph','actorDefinition',(select n->>'id' from jsonb_array_elements(w.design->'nodes') n where n->>'kind'='actor_definition' limit 1),'rigRevision',repeat('b',64),'bindings',jsonb_build_array(jsonb_build_object('state','idle','clipRevision',candidate)),'transitions','[]'::jsonb);
 cmd:=jsonb_build_object('projectId',w.project_id,'draftId',w.draft_id,'expectedRevision',w.revision,'idempotencyKey',gen_random_uuid(),'action','bind_animation','graph',graph);
 begin perform public.game_animation_command(actor,cmd); raise exception 'Unreviewed binding accepted'; exception when others then if sqlerrm<>'Binding requires a reviewed compatible animation' then raise; end if; end;
 cmd:=cmd-'graph'||jsonb_build_object('action','accept_animation','candidateId',candidate);
 begin perform public.game_animation_command(gen_random_uuid(),cmd); raise exception 'Other user reviewed candidate'; exception when insufficient_privilege then null; end;
 result:=public.game_animation_command(actor,cmd);
 if public.game_animation_command(actor,cmd)<>result then raise exception 'Review is not idempotent'; end if;
 perform public.game_animation_command(actor,(cmd-'candidateId')||jsonb_build_object('idempotencyKey',gen_random_uuid(),'action','bind_animation','graph',graph));
 select * into w from public.game_workspaces where draft_id=w.draft_id;
 select count(*) into count_before from public.game_animation_setup_spend;
 manifest:=jsonb_build_object('projectId',w.project_id,'draftId',w.draft_id,'expectedRevision',w.revision,'idempotencyKey',gen_random_uuid(),'processingVersion','animation-1.1.0','modelRevision','test','rig',jsonb_build_object('revision',repeat('b',64)),
  'clips',jsonb_build_array(jsonb_build_object('jobId',imported,'sourcePath','generated/game/'||w.draft_id||'/'||imported||'/source-0.json','sourceHash',repeat('a',64),'recipe',jsonb_build_object('rigRevision',repeat('b',64),'candidates',1,'state','idle'))));
 result:=public.game_animation_import(actor,manifest);
 if public.game_animation_import(actor,manifest)<>result then raise exception 'Import not idempotent'; end if;
 if (select count(*) from public.game_animation_setup_spend)<>count_before then raise exception 'Import reserved inference budget'; end if;
 if has_function_privilege('authenticated','public.game_animation_import(uuid,jsonb)','execute') or has_table_privilege('authenticated','public.game_animation_reviews','insert') then raise exception 'Review/import privilege leak'; end if;
end $$;
