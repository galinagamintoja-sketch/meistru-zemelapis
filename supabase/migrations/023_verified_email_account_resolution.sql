-- Resolve legacy LocalPro ownership only from a server-verified login email.
-- This is separate from the deprecated token claim flow in migration 012/018.
create table if not exists account_resolution_audit (
  auth_user_id uuid not null,
  outcome text not null,
  candidate_count integer not null check (candidate_count >= 0),
  created_at timestamptz not null default now()
);

alter table account_resolution_audit enable row level security;
comment on table account_resolution_audit is
  'Private verified-email resolution audit. Never stores raw email or profile data.';
revoke all on table account_resolution_audit from public, anon, authenticated;
grant select, delete on table account_resolution_audit to service_role;

create index if not exists users_normalized_email_idx on users ((lower(trim(email))));
create index if not exists unowned_profiles_normalized_email_idx
  on tradesperson_profiles ((lower(trim(email)))) where user_id is null;

create or replace function resolve_verified_email_account(
  p_auth_user_id uuid,
  p_email text,
  p_confirm boolean default false
)
returns table(outcome text, candidate_count integer, linked boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(trim(p_email));
  matched_user users%rowtype;
  current_user_row users%rowtype;
  matched_profile tradesperson_profiles%rowtype;
  user_matches integer := 0;
  profile_matches integer := 0;
  result_outcome text;
  result_linked boolean := false;
  affected integer := 0;
begin
  if p_auth_user_id is null or normalized_email = '' then
    raise exception 'Verified identity required';
  end if;

  -- Serializes every resolver using the same canonical email.
  perform pg_advisory_xact_lock(hashtextextended(normalized_email, 0));

  select * into current_user_row from users where auth_user_id = p_auth_user_id for update;
  if found and exists (select 1 from tradesperson_profiles where user_id = current_user_row.id) then
    result_outcome := 'already_linked';
    result_linked := true;
    candidate_count := 1;
  else
    select count(*)::integer into user_matches from users where lower(trim(email)) = normalized_email;
    select count(*)::integer into profile_matches from tradesperson_profiles
      where user_id is null and lower(trim(email)) = normalized_email;
    candidate_count := user_matches + profile_matches;

    if candidate_count = 0 then
      result_outcome := 'no_match';
    elsif candidate_count > 1 then
      result_outcome := 'ambiguous';
    elsif user_matches = 1 then
      select * into matched_user from users where lower(trim(email)) = normalized_email for update;
      if matched_user.auth_user_id is not null and matched_user.auth_user_id <> p_auth_user_id then
        result_outcome := 'ownership_conflict';
      elsif current_user_row.id is not null and current_user_row.id <> matched_user.id then
        result_outcome := 'ownership_conflict';
      elsif not p_confirm then
        result_outcome := 'unique_match';
      else
        update users set auth_user_id = p_auth_user_id, email = normalized_email,
          email_verified = true, updated_at = now()
        where id = matched_user.id and (auth_user_id is null or auth_user_id = p_auth_user_id);
        get diagnostics affected = row_count;
        if affected = 1 then result_outcome := 'linked'; result_linked := true;
        else result_outcome := 'ownership_conflict'; end if;
      end if;
    else
      select * into matched_profile from tradesperson_profiles
        where user_id is null and lower(trim(email)) = normalized_email for update;
      if current_user_row.id is not null then
        result_outcome := 'ownership_conflict';
      elsif not p_confirm then
        result_outcome := 'unique_match';
      else
        insert into users (auth_user_id, email, email_verified, role)
        values (p_auth_user_id, normalized_email, true, 'tradesperson')
        returning * into matched_user;
        update tradesperson_profiles set user_id = matched_user.id, updated_at = now()
          where id = matched_profile.id and user_id is null;
        get diagnostics affected = row_count;
        if affected <> 1 then raise exception 'Profile ownership changed concurrently'; end if;
        result_outcome := 'linked';
        result_linked := true;
      end if;
    end if;
  end if;

  insert into account_resolution_audit (auth_user_id, outcome, candidate_count)
  values (p_auth_user_id, result_outcome, candidate_count);
  return query select result_outcome, candidate_count, result_linked;
end;
$$;

revoke all on function resolve_verified_email_account(uuid, text, boolean) from public, anon, authenticated;
grant execute on function resolve_verified_email_account(uuid, text, boolean) to service_role;

-- Keep the old token operation disabled; do not repurpose it.
revoke all on function claim_tradesperson_profile(text) from public, anon, authenticated;

-- Expose the newly created resolver and audit grants after a clean 022 -> 023 replay.
notify pgrst, 'reload schema';
