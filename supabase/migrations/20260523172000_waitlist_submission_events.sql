create table if not exists public.waitlist_submission_events (
  id uuid primary key default gen_random_uuid(),
  normalized_email text,
  ip_hash text,
  user_agent_hash text,
  origin text,
  decision text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint waitlist_submission_events_decision_check check (
    decision in ('allowed', 'blocked', 'rate_limited', 'invalid', 'turnstile_failed')
  )
);

create index if not exists waitlist_submission_events_ip_hash_created_at_idx
  on public.waitlist_submission_events (ip_hash, created_at desc);

create index if not exists waitlist_submission_events_email_created_at_idx
  on public.waitlist_submission_events (normalized_email, created_at desc);

create index if not exists waitlist_submission_events_decision_created_at_idx
  on public.waitlist_submission_events (decision, created_at desc);

alter table public.waitlist_submission_events enable row level security;

revoke all on public.waitlist_submission_events from anon;
revoke all on public.waitlist_submission_events from authenticated;

grant select, insert, update, delete on public.waitlist_submission_events to service_role;
