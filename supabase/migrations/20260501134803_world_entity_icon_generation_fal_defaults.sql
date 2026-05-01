alter table public.world_entity_icon_generation_jobs
  alter column provider set default 'fal',
  alter column model set default 'openai/gpt-image-2';

update public.world_entity_icon_generation_jobs
set
  provider = 'fal',
  model = 'openai/gpt-image-2',
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'providerMigratedAt', timezone('utc'::text, now()),
      'providerMigration', 'fal_openai_gpt_image_2'
    )
where status in ('queued', 'running', 'failed')
  and provider = 'openai'
  and model = 'gpt-image-2';
