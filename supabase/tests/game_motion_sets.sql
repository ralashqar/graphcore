do $$ begin
 if current_setting('graphcore.animation_test_transaction',true) is distinct from 'on' then raise exception 'Rollback-only test'; end if;
 if has_function_privilege('authenticated','public.game_motion_set_command(uuid,jsonb,jsonb)','execute') or has_table_privilege('authenticated','public.game_motion_sets','insert') then raise exception 'Set write privilege leak'; end if;
 insert into public.game_animation_setup_budgets(id,total_cents,admission_cents,enabled) values('motion-set-test',3000,2500,true);
 execute replace(pg_get_functiondef('public.game_motion_set_command(uuid,jsonb,jsonb)'::regprocedure),'kimodo-initial-2026-09','motion-set-test');
end $$;
do $$
declare w public.game_workspaces; actor uuid; actor_id text; cmd jsonb; payload jsonb; definition jsonb; result jsonb; run uuid; candidate uuid:=gen_random_uuid(); jid uuid:=gen_random_uuid(); graph jsonb; before_count integer;
begin
 select ws.* into strict w from public.game_workspaces ws where ws.design->>'schemaVersion'='3' and not exists(select 1 from public.game_jobs j where j.draft_id=ws.draft_id and j.status in ('queued','running','attention')) limit 1;
 select m.user_id into strict actor from public.projects p join public.workspace_memberships m on m.workspace_id=p.workspace_id where p.id=w.project_id and m.role='owner' limit 1;
 select n->>'id' into actor_id from jsonb_array_elements(w.design->'nodes') n where n->>'kind'='actor_definition' limit 1;
 definition:=jsonb_build_object('version',1,'id','motion.test.locomotion','actorDefinition',actor_id,'group','locomotion','catalogVersion','humanoid-motion-2.0.0','rigRevision',repeat('d',64),'profile',jsonb_build_object('version',1,'rig','humanoid.fabric-ybot.v1','style','neutral','equipment','one_handed_sword'),'states',jsonb_build_array('idle','walk'));
 payload:=jsonb_build_object('definition',definition,'revision',repeat('e',64),'rig',jsonb_build_object('revision',repeat('d',64)));
 cmd:=jsonb_build_object('projectId',w.project_id,'draftId',w.draft_id,'expectedRevision',w.revision,'idempotencyKey',gen_random_uuid(),'action','save_motion_set','definition',definition);
 result:=public.game_motion_set_command(actor,cmd,payload);
 if public.game_motion_set_command(actor,cmd)<>result then raise exception 'Save replay mismatch'; end if;
 begin perform public.game_motion_set_command(gen_random_uuid(),cmd,payload); raise exception 'Foreign owner admitted'; exception when insufficient_privilege then null; end;
 select * into w from public.game_workspaces where draft_id=w.draft_id;
 cmd:=cmd-'definition'||jsonb_build_object('expectedRevision',w.revision,'idempotencyKey',gen_random_uuid(),'action','generate_animation_set','setId',definition->>'id','setRevision',repeat('e',64),'states',jsonb_build_array('idle','walk'),'provider','kimodo','maxReservationCents',200);
 payload:=payload||jsonb_build_object('entries',(select jsonb_agg(jsonb_build_object('state',s,'recipe',jsonb_build_object('state',s,'rigRevision',repeat('d',64)),'provider',jsonb_build_object('reservationCents',100,'processingVersion','animation-1.1.0','modelRevision','test'))) from jsonb_array_elements_text(definition->'states') s));
 select count(*) into before_count from public.game_jobs;
 begin perform public.game_motion_set_command(actor,jsonb_set(cmd,'{maxReservationCents}','100'),payload); raise exception 'Quote bypass'; exception when others then if sqlerrm<>'Set quote exceeded' then raise; end if; end;
 if (select count(*) from public.game_jobs)<>before_count then raise exception 'Failed quote leaked jobs'; end if;
 -- Fail the second reservation: the first child, hold and run must roll back.
 perform public.game_animation_reserve_setup(gen_random_uuid(),'motion-set-test','integration',900,'test');
 begin perform public.game_motion_set_command(actor,cmd,payload); raise exception 'Atomic budget bypass'; exception when others then if sqlerrm='Atomic budget bypass' then raise; end if; end;
 if (select count(*) from public.game_jobs)<>before_count or exists(select 1 from public.game_motion_set_runs where draft_id=w.draft_id and set_id='motion.test.locomotion') then raise exception 'Partial set admission'; end if;
 delete from public.game_animation_setup_spend where budget_id='motion-set-test';
 result:=public.game_motion_set_command(actor,cmd,payload);run:=(result->>'runId')::uuid;
 if jsonb_array_length(result->'jobIds')<>2 or (result->>'reservedCents')::integer<>200 then raise exception 'Set admission mismatch'; end if;
 if public.game_motion_set_command(actor,cmd)<>result then raise exception 'Paid replay mismatch'; end if;
 if (select count(*) from public.game_motion_set_jobs where run_id=run)<>2 then raise exception 'Child duplication'; end if;
 perform public.game_motion_set_command(actor,cmd||jsonb_build_object('action','cancel_animation_set','runId',run,'idempotencyKey',gen_random_uuid()));
 if exists(select 1 from public.game_jobs where id in(select job_id from public.game_motion_set_jobs where run_id=run) and (status<>'cancelled' or fence<1)) then raise exception 'Cancellation not fenced'; end if;
 insert into public.game_jobs(id,draft_id,kind,input,requested_by) values(jid,w.draft_id,'asset','{}',actor);
 insert into public.game_animation_recipes(job_id,draft_id,recipe,rig_revision,model_revision,processing_version) values(jid,w.draft_id,'{}',repeat('d',64),'test','animation-1.1.0');
 insert into public.game_animation_candidates(id,job_id,draft_id,candidate_index,source_path,clip,diagnostics) values(candidate,jid,w.draft_id,0,'test',jsonb_build_object('state','idle','rigRevision',repeat('d',64),'validation',jsonb_build_object('accepted',true)),'{}');
 graph:=jsonb_build_object('version',1,'id','test.graph','actorDefinition',actor_id,'rigRevision',repeat('d',64),'bindings',jsonb_build_array(jsonb_build_object('state','idle','clipRevision',candidate)),'transitions','[]'::jsonb,'motionSets',jsonb_build_array(jsonb_build_object('version',1,'setId',definition->>'id','revision',repeat('e',64),'profile',definition->'profile','requiredStates',definition->'states')));
 begin insert into public.game_animation_graphs(draft_id,revision,actor_definition,graph) values(w.draft_id,w.revision,actor_id,graph); raise exception 'Incomplete set activated'; exception when others then if sqlerrm<>'Motion component incomplete or wrong style' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 set local role authenticated;
 if exists(select 1 from public.game_motion_sets where draft_id=w.draft_id) or exists(select 1 from public.game_motion_set_runs where id=run) then raise exception 'Foreign set read leak'; end if;
 reset role;
end $$;
