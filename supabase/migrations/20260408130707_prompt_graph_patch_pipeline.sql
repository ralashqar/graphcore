alter table public.draft_graph_nodes
  add column if not exists template_key text,
  add column if not exists subtitle text,
  add column if not exists display jsonb not null default '{}'::jsonb;
