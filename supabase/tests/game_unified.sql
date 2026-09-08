do $$ declare d uuid:=current_setting('graphcore.game.test_draft')::uuid; actor uuid:=current_setting('graphcore.game.test_actor')::uuid; p uuid; rev integer; cmd jsonb; r jsonb; jid uuid; planid uuid; materialid uuid; candidate jsonb; begin
 select project_id,revision into p,rev from public.game_workspaces where draft_id=d;
 candidate:='{"schemaVersion":3,"template":"unified.v1","nodes":[{"id":"objective.first","kind":"objective"}],"assets":[]}'::jsonb;
 cmd:=jsonb_build_object('projectId',p,'draftId',d,'idempotencyKey',gen_random_uuid(),'expectedRevision',rev,'action','save','design',candidate);
 perform public.game_commit_command(actor,cmd);rev:=rev+1;
 if not exists(select 1 from public.game_spec_nodes where draft_id=d and revision=rev and node_id='objective.first') then raise exception 'Schema 3 nodes not captured'; end if;
 cmd:=jsonb_build_object('projectId',p,'draftId',d,'idempotencyKey',gen_random_uuid(),'expectedRevision',rev,'template','unified.v1','action','plan','prompt','Create a mission');
 r:=public.game_commit_command(actor,cmd);planid:=(r->>'jobId')::uuid;
 if public.game_commit_command(actor,cmd)<>r then raise exception 'Planning is not idempotent'; end if;
 update public.game_jobs set status='running',lease_owner='unified-test',lease_until=now()+interval '90 seconds',fence=1 where id=planid;
 perform public.game_finish_job(planid,'unified-test',1,jsonb_build_object('plan',jsonb_build_object('intent','new_game','unsupported','[]'::jsonb,'sourceRevision',rev)));
 if (select revision from public.game_workspaces where draft_id=d)<>rev then raise exception 'Planning mutated revision'; end if;
 cmd:=jsonb_build_object('projectId',p,'draftId',d,'idempotencyKey',gen_random_uuid(),'expectedRevision',rev,'template','unified.v1','action','materialize','planJobId',planid);
 r:=public.game_commit_command(actor,cmd);materialid:=(r->>'jobId')::uuid;
 if (select input->'plan' from public.game_jobs where id=materialid) is null then raise exception 'Plan was not frozen'; end if;
 update public.game_jobs set status='running',lease_owner='unified-test',lease_until=now()+interval '90 seconds',fence=1 where id=materialid;
 if public.game_finish_job(materialid,'wrong',1,jsonb_build_object('design',candidate)) then raise exception 'Wrong worker completed design'; end if;
 perform public.game_finish_job(materialid,'unified-test',1,jsonb_build_object('design',candidate));rev:=rev+1;
 begin
  perform public.game_commit_command(actor,jsonb_set(jsonb_set(cmd,'{idempotencyKey}',to_jsonb(gen_random_uuid())),'{expectedRevision}',to_jsonb(rev)));
  raise exception 'Stale plan was accepted';
 exception when others then if sqlerrm='Stale plan was accepted' then raise; end if; end;
 cmd:=jsonb_build_object('projectId',p,'draftId',d,'idempotencyKey',gen_random_uuid(),'expectedRevision',rev,'template','unified.v1','action','plan','prompt','Explain');
 r:=public.game_commit_command(actor,cmd);jid:=(r->>'jobId')::uuid;
 update public.game_jobs set status='running',lease_owner='unified-test',lease_until=now()+interval '90 seconds',fence=1 where id=jid;
 perform public.game_finish_job(jid,'unified-test',1,'{"plan":{"intent":"explain","unsupported":[]}}');
 begin
  perform public.game_commit_command(actor,jsonb_build_object('projectId',p,'draftId',d,'idempotencyKey',gen_random_uuid(),'expectedRevision',rev,'template','unified.v1','action','materialize','planJobId',jid));
  raise exception 'Explanation materialized';
 exception when others then if sqlerrm='Explanation materialized' then raise; end if; end;
end $$;
