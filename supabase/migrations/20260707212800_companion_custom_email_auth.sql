create table if not exists public.companion_email_login_requests (
  email_hash text primary key,
  ip_hash text,
  last_sent_at timestamptz not null default now(),
  hour_window_start timestamptz not null default date_trunc('hour', now()),
  sent_count_hour integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companion_email_login_requests_sent_count_hour_check check (sent_count_hour >= 0)
);

alter table public.companion_email_login_requests enable row level security;

create index if not exists companion_email_login_requests_ip_hash_idx
  on public.companion_email_login_requests (ip_hash, last_sent_at desc);

create index if not exists companion_email_login_requests_last_sent_at_idx
  on public.companion_email_login_requests (last_sent_at desc);
