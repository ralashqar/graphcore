alter table public.world_build_batches
  add column if not exists planner_mode text not null default 'world_build',
  add column if not exists cinematic_plan jsonb;

update public.world_build_batches
set planner_mode = 'world_build'
where planner_mode is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'world_build_batches_planner_mode_check'
  ) then
    alter table public.world_build_batches
      add constraint world_build_batches_planner_mode_check
      check (planner_mode in ('world_build', 'cinematic_build'));
  end if;
end
$$;
