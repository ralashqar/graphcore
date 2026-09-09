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
 execute replace(pg_get_functiondef('public.game_animation_command(uuid,jsonb,jsonb,jsonb)'::regprocedure), 'kimodo-initial-2026-09', 'animation-transaction-test');
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
