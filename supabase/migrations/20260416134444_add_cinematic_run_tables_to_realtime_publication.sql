do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cinematic_runs'
  ) then
    execute 'alter publication supabase_realtime add table public.cinematic_runs';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cinematic_run_jobs'
  ) then
    execute 'alter publication supabase_realtime add table public.cinematic_run_jobs';
  end if;
end
$$;
