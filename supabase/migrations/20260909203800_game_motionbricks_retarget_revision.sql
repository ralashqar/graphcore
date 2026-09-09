-- Preserve original inference provenance while freezing an independent CPU adapter.
create or replace function app_private.guard_motionbricks_candidate() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare recipe jsonb;
begin
 select r.recipe into strict recipe from public.game_animation_recipes r where r.job_id=new.job_id and r.draft_id=new.draft_id;
 if recipe->>'provider'='motionbricks' and new.clip is not null then
  if recipe->>'purpose' is distinct from 'clip' or recipe->>'state' not in ('idle','walk') or
     new.clip->'provenance' is distinct from recipe->'provenance' or new.clip->>'loop' is distinct from 'true' or
     new.clip->>'retargetRevision' is distinct from recipe->>'retargetRevision' then
   raise exception 'Diagnostic or incompatible MotionBricks motion cannot be registered as a clip';
  end if;
 end if;
 return new;
end $$;
