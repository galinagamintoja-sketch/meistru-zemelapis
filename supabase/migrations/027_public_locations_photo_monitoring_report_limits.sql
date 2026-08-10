-- Stable, non-reversible public map positions and atomic profile-report abuse limits.
alter table public.tradesperson_profiles
  add column if not exists public_latitude double precision,
  add column if not exists public_longitude double precision;

create or replace function public.set_approximate_profile_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  angle double precision;
  distance_km double precision;
begin
  if new.latitude is null or new.longitude is null then
    new.public_latitude := null;
    new.public_longitude := null;
  elsif tg_op = 'INSERT' or new.public_latitude is null or new.public_longitude is null
     or new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude then
    -- Randomness is generated and stored in the database. It is not derivable from a public identifier.
    angle := random() * 2 * pi();
    distance_km := 1.0 + random();
    new.public_latitude := new.latitude + (cos(angle) * distance_km) / 111.0;
    new.public_longitude := new.longitude + (sin(angle) * distance_km) / (111.0 * cos(radians(new.latitude)));
  end if;
  return new;
end;
$$;

drop trigger if exists set_approximate_profile_location on public.tradesperson_profiles;
create trigger set_approximate_profile_location
before insert or update on public.tradesperson_profiles
for each row execute function public.set_approximate_profile_location();

update public.tradesperson_profiles
set public_latitude = null, public_longitude = null
where latitude is not null and longitude is not null
  and (public_latitude is null or public_longitude is null);

alter table public.profile_reports
  add column if not exists source_ip_hash text,
  add column if not exists report_fingerprint text;

create index if not exists profile_reports_ip_created_at
  on public.profile_reports (source_ip_hash, created_at desc);
create index if not exists profile_reports_ip_profile_created_at
  on public.profile_reports (source_ip_hash, tradesperson_profile_id, created_at desc);
create index if not exists profile_reports_fingerprint_created_at
  on public.profile_reports (report_fingerprint, created_at desc);

create or replace function public.submit_profile_report(
  target_profile_id uuid,
  report_reason text,
  report_details text,
  report_email text,
  source_hash text,
  fingerprint text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  window_start timestamptz := now() - interval '24 hours';
begin
  perform pg_advisory_xact_lock(hashtextextended(source_hash, 0));
  if not exists (
    select 1 from public.tradesperson_profiles
    where id = target_profile_id and public_status = 'public' and approval_status = 'approved'
  ) then raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND'; end if;

  if exists (select 1 from public.profile_reports where source_ip_hash = source_hash
      and tradesperson_profile_id = target_profile_id and created_at >= window_start)
    or exists (select 1 from public.profile_reports where report_fingerprint = fingerprint
      and created_at >= window_start)
    or (select count(*) from public.profile_reports where source_ip_hash = source_hash
      and created_at >= window_start) >= 10 then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED';
  end if;

  insert into public.profile_reports (
    tradesperson_profile_id, reason, details, reporter_email, source_ip_hash, report_fingerprint
  ) values (target_profile_id, report_reason, report_details, nullif(report_email, ''), source_hash, fingerprint)
  returning id into inserted_id;
  return inserted_id;
end;
$$;

revoke all on function public.submit_profile_report(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_profile_report(uuid,text,text,text,text,text) to service_role;

-- Browser roles must not be able to read reports or exact registered locations directly.
revoke all on table public.profile_reports from public, anon, authenticated;
revoke select on public.tradesperson_profiles from public, anon, authenticated;
grant select (
  id,
  display_name,
  company_name,
  phone,
  whatsapp_number,
  email,
  base_city,
  radius_km,
  service_category_id,
  description,
  service_area_label,
  review_score,
  review_count,
  verification_labels,
  public_status,
  approval_status,
  source,
  public_latitude,
  public_longitude
) on public.tradesperson_profiles to anon, authenticated;

drop policy if exists "Browser can read approved public profiles" on public.tradesperson_profiles;
create policy "Browser can read approved public profiles"
on public.tradesperson_profiles
for select
to anon, authenticated
using (
  approval_status = 'approved'
  and public_status = 'public'
  and is_demo = false
  and public_contact_consent_at is not null
);

comment on column public.tradesperson_profiles.public_latitude is 'Stable approximate coordinate for public map display.';
comment on column public.tradesperson_profiles.public_longitude is 'Stable approximate coordinate for public map display.';
comment on column public.profile_reports.source_ip_hash is 'Server-generated keyed hash; raw IP addresses are not stored.';
