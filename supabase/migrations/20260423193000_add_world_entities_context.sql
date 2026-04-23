alter table public.world_entities
  add column if not exists context text not null default '';
