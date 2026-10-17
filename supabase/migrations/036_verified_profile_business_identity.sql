-- Business schema requires reviewed evidence, never an owner-entered company name.
-- Evidence and reviewer identity are private; only the matching public business name is projected.
create table if not exists public.profile_business_verifications (
  profile_id uuid primary key references public.tradesperson_profiles(id) on delete cascade,
  verified_name text not null check (length(trim(verified_name)) between 2 and 160),
  evidence_reference text not null check (length(trim(evidence_reference)) >= 10),
  verification_method text not null check (verification_method in ('registry_record', 'business_document')),
  verified_by text not null check (length(trim(verified_by)) >= 3),
  verified_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.profile_business_verifications enable row level security;
revoke all on public.profile_business_verifications from public, anon, authenticated;
grant select, insert, update, delete on public.profile_business_verifications to service_role;

-- Changing a self-editable name invalidates proof, even if the name is later changed back.
create or replace function public.revoke_changed_business_identity()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
begin
  if new.company_name is distinct from old.company_name then
    update public.profile_business_verifications set revoked_at = statement_timestamp()
      where profile_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;
revoke all on function public.revoke_changed_business_identity() from public, anon, authenticated;
drop trigger if exists revoke_changed_business_identity on public.tradesperson_profiles;
create trigger revoke_changed_business_identity after update of company_name on public.tradesperson_profiles
  for each row execute function public.revoke_changed_business_identity();
notify pgrst, 'reload schema';
