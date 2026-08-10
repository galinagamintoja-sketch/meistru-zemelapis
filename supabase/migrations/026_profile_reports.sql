-- Public profile reporting with a service-role-only moderation queue.
create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  tradesperson_profile_id uuid not null references public.tradesperson_profiles(id) on delete cascade,
  reason text not null check (reason in ('wrong_photo', 'wrong_contact', 'misleading_details', 'inappropriate', 'other')),
  details text not null check (char_length(trim(details)) between 10 and 1000),
  reporter_email text check (reporter_email is null or char_length(reporter_email) <= 254),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 1000),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profile_reports_open_created_at
  on public.profile_reports (status, created_at desc)
  where status in ('pending', 'reviewing');
create index if not exists profile_reports_profile_created_at
  on public.profile_reports (tradesperson_profile_id, created_at desc);

alter table public.profile_reports enable row level security;
revoke all on table public.profile_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.profile_reports to service_role;

comment on table public.profile_reports is
  'User-submitted public profile issues. Browser roles have no direct access; server routes use service_role.';

notify pgrst, 'reload schema';
