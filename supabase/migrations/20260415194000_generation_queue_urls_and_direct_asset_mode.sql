alter table public.mesh_generation_jobs
  add column if not exists status_url text,
  add column if not exists response_url text,
  add column if not exists cancel_url text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'world_build_batches_planner_mode_check'
  ) then
    alter table public.world_build_batches
      drop constraint world_build_batches_planner_mode_check;
  end if;

  alter table public.world_build_batches
    add constraint world_build_batches_planner_mode_check
    check (planner_mode in ('world_build', 'cinematic_build', 'direct_asset_generation'));
end
$$;
