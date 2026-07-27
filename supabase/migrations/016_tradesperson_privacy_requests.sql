create table if not exists account_privacy_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  tradesperson_profile_id uuid references tradesperson_profiles(id) on delete set null,
  request_type text not null check (request_type in ('data_export', 'account_deletion')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'rejected')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (auth_user_id, request_type, status)
);
alter table account_privacy_requests enable row level security;
comment on table account_privacy_requests is 'Server-managed GDPR requests; never exposed directly to browser clients.';
