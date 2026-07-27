create table if not exists profile_claim_invitations (
  id uuid primary key default gen_random_uuid(),
  tradesperson_profile_id uuid not null references tradesperson_profiles(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_auth_user_id uuid,
  created_by_admin_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table profile_claim_invitations enable row level security;

create index if not exists profile_claim_invitations_active_idx
  on profile_claim_invitations (expires_at)
  where used_at is null;

create or replace function claim_tradesperson_profile(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation profile_claim_invitations%rowtype;
  local_user_id uuid;
  claimed_profile_id uuid;
  authenticated_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  authenticated_email := nullif(auth.jwt() ->> 'email', '');
  if authenticated_email is null then
    raise exception 'Verified email required';
  end if;

  select * into invitation
  from profile_claim_invitations
  where token_hash = lower(p_token_hash)
    and used_at is null
    and expires_at > now()
  for update;

  if invitation.id is null then
    raise exception 'Claim link is invalid or expired';
  end if;

  select id into local_user_id from users where auth_user_id = auth.uid();
  if local_user_id is null then
    insert into users (auth_user_id, email, email_verified, role)
    values (auth.uid(), lower(authenticated_email), true, 'tradesperson')
    returning id into local_user_id;
  end if;

  update tradesperson_profiles
  set user_id = local_user_id, updated_at = now()
  where id = invitation.tradesperson_profile_id
    and user_id is null
  returning id into claimed_profile_id;

  if claimed_profile_id is null then
    raise exception 'Profile is already linked';
  end if;

  update profile_claim_invitations
  set used_at = now(), used_by_auth_user_id = auth.uid()
  where id = invitation.id;

  insert into admin_actions (tradesperson_profile_id, action, notes, created_by_role)
  values (claimed_profile_id, 'profile_claimed', 'Profile linked through a single-use invitation', 'tradesperson');

  return claimed_profile_id;
end;
$$;

revoke all on function claim_tradesperson_profile(text) from public;
grant execute on function claim_tradesperson_profile(text) to authenticated;

comment on table profile_claim_invitations is
  'Single-use expiring profile claim invitations. Only SHA-256 token hashes are stored.';
