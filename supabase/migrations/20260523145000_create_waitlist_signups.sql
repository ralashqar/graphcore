create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null,
  name text,
  role text,
  use_case text,
  referral_source text,
  page_url text,
  app_profile text not null default 'landing',
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'joined',
  submission_count integer not null default 1 check (submission_count >= 1),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  last_submitted_at timestamptz not null default timezone('utc'::text, now()),
  constraint waitlist_signups_email_length check (char_length(email) between 3 and 320),
  constraint waitlist_signups_normalized_email_length check (char_length(normalized_email) between 3 and 320),
  constraint waitlist_signups_status_check check (status in ('joined', 'existing', 'blocked'))
);

create unique index if not exists waitlist_signups_normalized_email_key
  on public.waitlist_signups (normalized_email);

create index if not exists waitlist_signups_created_at_idx
  on public.waitlist_signups (created_at desc);

create index if not exists waitlist_signups_status_idx
  on public.waitlist_signups (status);

drop trigger if exists waitlist_signups_set_updated_at on public.waitlist_signups;
create trigger waitlist_signups_set_updated_at
  before update on public.waitlist_signups
  for each row execute function public.set_updated_at();

alter table public.waitlist_signups enable row level security;

revoke all on public.waitlist_signups from anon;
revoke all on public.waitlist_signups from authenticated;

grant select, insert, update, delete on public.waitlist_signups to service_role;
