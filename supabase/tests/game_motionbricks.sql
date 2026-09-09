-- Run with the existing animation suite in a rollback-only transaction.
do $$ declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); begin
 if current_setting('graphcore.animation_test_transaction',true) is distinct from 'on' then raise exception 'Transaction wrapper required'; end if;
 if has_function_privilege('authenticated','public.game_animation_allocate_motionbricks(text,integer,jsonb)','execute') then raise exception 'Allocation privilege leak'; end if;
 insert into public.game_animation_setup_budgets(id,total_cents,admission_cents,enabled) values('mb-allocation-test',3000,2500,true);
 perform public.game_animation_reserve_setup(a,'mb-allocation-test','ledge',100,'held ledge');
 begin perform public.game_animation_allocate_motionbricks('mb-allocation-test',500,'{"approval":"test"}'); raise exception 'Committed allocation stolen'; exception when others then if sqlerrm<>'Cannot reallocate committed ledge funds' then raise; end if; end;
 perform public.game_animation_allocate_motionbricks('mb-allocation-test',400,'{"approval":"test"}');
 perform public.game_animation_allocate_motionbricks('mb-allocation-test',400,'{"approval":"test"}');
 perform public.game_animation_reserve_setup(b,'mb-allocation-test','motionbricks',400,'test');
 begin perform public.game_animation_reserve_setup(gen_random_uuid(),'mb-allocation-test','motionbricks',1,'test'); raise exception 'Allocation bypass'; exception when others then if sqlerrm<>'Animation setup budget exhausted' then raise; end if; end;
 perform public.game_animation_reserve_setup(gen_random_uuid(),'mb-allocation-test','benchmark',1000,'test');
 perform public.game_animation_reserve_setup(gen_random_uuid(),'mb-allocation-test','integration',1000,'test');
 begin perform public.game_animation_reserve_setup(gen_random_uuid(),'mb-allocation-test','ledge',1,'test'); raise exception 'Global/ledge ceiling bypass'; exception when others then if sqlerrm<>'Animation setup budget exhausted' then raise; end if; end;
 if (select reserved_cents from public.game_animation_setup_spend where id=a)<>100 then raise exception 'Prior hold changed'; end if;
end $$;

do $$ declare c public.game_animation_candidates; jid uuid; begin
 select * into strict c from public.game_animation_candidates where clip is not null and clip->>'state' in ('idle','walk') limit 1;
 -- Isolated transaction can temporarily amend an existing recipe to exercise
 -- the guard; rollback restores it, and browser/service grants cannot update it.
 jid:=c.job_id;
 update public.game_animation_recipes set recipe='{"provider":"motionbricks","purpose":"diagnostic","state":"idle"}' where job_id=jid;
 begin
  insert into public.game_animation_candidates(id,job_id,draft_id,candidate_index,source_path,clip,diagnostics)
   values(gen_random_uuid(),jid,c.draft_id,2,c.source_path,c.clip,'{}');
  raise exception 'Diagnostic registered as bindable';
 exception when others then if sqlerrm<>'Diagnostic or incompatible MotionBricks motion cannot be registered as a clip' then raise; end if; end;
 update public.game_animation_recipes set recipe=jsonb_build_object('provider','motionbricks','purpose','clip','state','idle','provenance','{}'::jsonb,'retargetRevision','g1-soma-1.1.0') where job_id=jid;
 begin
  insert into public.game_animation_candidates(id,job_id,draft_id,candidate_index,source_path,clip,diagnostics)
   values(gen_random_uuid(),jid,c.draft_id,2,c.source_path,(c.clip-'retargetRevision')||'{"state":"idle","loop":true,"provenance":{}}','{}');
  raise exception 'Unfrozen CPU retarget registered';
 exception when others then if sqlerrm<>'Diagnostic or incompatible MotionBricks motion cannot be registered as a clip' then raise; end if; end;
end $$;
