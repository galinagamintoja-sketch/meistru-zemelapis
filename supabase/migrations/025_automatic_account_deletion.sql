-- Seven-day, owner-cancellable automatic account deletion jobs.
alter table account_privacy_requests
  drop constraint if exists account_privacy_requests_status_check,
  drop constraint if exists account_privacy_requests_auth_user_id_request_type_status_key;

alter table account_privacy_requests
  alter column auth_user_id drop not null,
  add column if not exists scheduled_deletion_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists last_error text,
  add column if not exists worker_claim_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add constraint account_privacy_requests_status_check
    check (status in ('pending', 'processing', 'failed', 'completed', 'cancelled', 'rejected'));

create unique index if not exists account_privacy_requests_one_active_deletion
  on account_privacy_requests (auth_user_id)
  where request_type = 'account_deletion'
    and status in ('pending', 'processing', 'failed')
    and auth_user_id is not null;

create unique index if not exists account_privacy_requests_one_active_export
  on account_privacy_requests (auth_user_id)
  where request_type = 'data_export' and status in ('pending', 'processing')
    and auth_user_id is not null;

create index if not exists account_privacy_requests_due_deletions
  on account_privacy_requests (scheduled_deletion_at, requested_at)
  where request_type = 'account_deletion' and status in ('pending', 'failed');

create index if not exists account_privacy_requests_stale_processing
  on account_privacy_requests (lease_expires_at)
  where request_type = 'account_deletion' and status = 'processing';

revoke all on table account_privacy_requests from public, anon, authenticated;
grant select, insert, update, delete on table account_privacy_requests to service_role;

create or replace function schedule_account_deletion(p_auth_user_id uuid)
returns table(
  request_id uuid,
  request_status text,
  scheduled_at timestamptz,
  profile_hidden boolean,
  existing_request_reused boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  local_user_id uuid;
  owned_profile_id uuid;
  active_request account_privacy_requests%rowtype;
  was_public boolean := false;
begin
  if p_auth_user_id is null then raise exception 'verified_identity_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 251));

  select id into local_user_id from public.users where auth_user_id = p_auth_user_id for update;
  if local_user_id is not null then
    select id into owned_profile_id from public.tradesperson_profiles
      where user_id = local_user_id for update;
  end if;

  select * into active_request
  from public.account_privacy_requests
  where auth_user_id = p_auth_user_id
    and request_type = 'account_deletion'
    and status in ('pending', 'processing', 'failed')
  order by requested_at limit 1 for update;

  if active_request.id is not null then
    return query select active_request.id, active_request.status,
      active_request.scheduled_deletion_at, false, true;
    return;
  end if;

  insert into public.account_privacy_requests (
    auth_user_id, tradesperson_profile_id, request_type, status,
    requested_at, scheduled_deletion_at
  ) values (
    p_auth_user_id, owned_profile_id, 'account_deletion', 'pending',
    statement_timestamp(), statement_timestamp() + interval '7 days'
  ) returning * into active_request;

  if owned_profile_id is not null then
    select public_status = 'public' into was_public
      from public.tradesperson_profiles where id = owned_profile_id;
    update public.tradesperson_profiles
      set public_status = 'private', updated_at = statement_timestamp()
      where id = owned_profile_id;
    insert into public.admin_actions (tradesperson_profile_id, action, notes, created_by_role)
      values (owned_profile_id, 'account_deletion_scheduled',
        'Owner scheduled automatic account deletion; profile hidden', 'tradesperson');
  end if;

  return query select active_request.id, active_request.status,
    active_request.scheduled_deletion_at, was_public, false;
end;
$$;

create or replace function cancel_account_deletion(
  p_auth_user_id uuid,
  p_restore_profile boolean default false
)
returns table(
  request_status text,
  profile_restored boolean,
  profile_id uuid,
  already_cancelled boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target account_privacy_requests%rowtype;
  can_restore boolean := false;
begin
  if p_auth_user_id is null then raise exception 'verified_identity_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 251));

  select * into target from public.account_privacy_requests
  where auth_user_id = p_auth_user_id and request_type = 'account_deletion'
    and status in ('pending', 'failed')
  order by requested_at desc limit 1 for update;

  if target.id is null then
    if exists (select 1 from public.account_privacy_requests
      where auth_user_id = p_auth_user_id and request_type = 'account_deletion' and status = 'processing') then
      raise exception 'deletion_already_processing';
    end if;
    if exists (select 1 from public.account_privacy_requests
      where auth_user_id = p_auth_user_id and request_type = 'account_deletion' and status = 'cancelled') then
      return query select 'cancelled'::text, false, null::uuid, true;
      return;
    end if;
    raise exception 'active_deletion_not_found';
  end if;

  if target.tradesperson_profile_id is not null and p_restore_profile then
    select p.approval_status = 'approved'
      and p.public_contact_consent_at is not null
      and (nullif(trim(p.display_name), '') is not null or nullif(trim(p.company_name), '') is not null)
      and p.service_category_id is not null
      and length(trim(coalesce(p.description, ''))) >= 80
      and exists (select 1 from public.operating_areas a
        where a.tradesperson_profile_id = p.id and length(trim(a.city)) >= 2 and coalesce(a.radius_km, 0) > 0)
      and (select count(*) from public.profile_services s
        where s.tradesperson_profile_id = p.id and s.service_subcategory_id is not null) >= 2
      into can_restore
      from public.tradesperson_profiles p
      where p.id = target.tradesperson_profile_id for update;
  end if;

  update public.account_privacy_requests set
    status = 'cancelled', cancelled_at = statement_timestamp(),
    scheduled_deletion_at = null, processing_started_at = null,
    worker_claim_token = null, lease_expires_at = null, last_error = null
  where id = target.id;

  if target.tradesperson_profile_id is not null then
    if can_restore then
      update public.tradesperson_profiles set public_status = 'public', updated_at = statement_timestamp()
        where id = target.tradesperson_profile_id and approval_status = 'approved';
    end if;
    insert into public.admin_actions (tradesperson_profile_id, action, notes, created_by_role)
      values (target.tradesperson_profile_id, 'account_deletion_cancelled',
        case when can_restore then 'Owner cancelled deletion; eligible profile restored'
          else 'Owner cancelled deletion; profile remains private' end, 'tradesperson');
  end if;

  return query select 'cancelled'::text, can_restore,
    target.tradesperson_profile_id, false;
end;
$$;

create or replace function claim_due_account_deletions(
  p_batch_size integer default 10,
  p_request_id uuid default null,
  p_lease_minutes integer default 15
)
returns table(
  request_id uuid,
  auth_user_id uuid,
  tradesperson_profile_id uuid,
  claim_token uuid,
  attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if p_batch_size < 1 or p_batch_size > 50 or p_lease_minutes < 5 or p_lease_minutes > 60 then
    raise exception 'invalid_worker_limits';
  end if;

  update public.account_privacy_requests set
    status = 'failed', worker_claim_token = null, lease_expires_at = null,
    processing_started_at = null, last_error = 'worker_lease_expired'
  where request_type = 'account_deletion' and status = 'processing'
    and lease_expires_at < statement_timestamp();

  return query
  with candidates as (
    select r.id from public.account_privacy_requests r
    where r.request_type = 'account_deletion'
      and r.status in ('pending', 'failed')
      and r.scheduled_deletion_at <= statement_timestamp()
      and (p_request_id is null or r.id = p_request_id)
    order by r.scheduled_deletion_at, r.requested_at
    for update skip locked
    limit p_batch_size
  ), claimed as (
    update public.account_privacy_requests r set
      status = 'processing', processing_started_at = statement_timestamp(),
      last_attempt_at = statement_timestamp(), attempt_count = r.attempt_count + 1,
      last_error = null, worker_claim_token = gen_random_uuid(),
      lease_expires_at = statement_timestamp() + make_interval(mins => p_lease_minutes)
    from candidates c where r.id = c.id
    returning r.id, r.auth_user_id, r.tradesperson_profile_id,
      r.worker_claim_token, r.attempt_count
  )
  select c.id, c.auth_user_id, c.tradesperson_profile_id,
    c.worker_claim_token, c.attempt_count from claimed c;
end;
$$;

create or replace function delete_account_application_data(
  p_request_id uuid,
  p_claim_token uuid
)
returns table(auth_user_id uuid, profile_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target public.account_privacy_requests%rowtype;
  local_user_id uuid;
  imported_lead_ids uuid[];
begin
  select * into target from public.account_privacy_requests
    where id = p_request_id and request_type = 'account_deletion'
      and status = 'processing' and worker_claim_token = p_claim_token
      and lease_expires_at >= statement_timestamp() for update;
  if target.id is null then raise exception 'invalid_or_expired_claim'; end if;

  if target.tradesperson_profile_id is not null then
    update public.tradesperson_profiles set public_status = 'private', updated_at = statement_timestamp()
      where id = target.tradesperson_profile_id;

    select array_agg(id) into imported_lead_ids from public.imported_leads
      where duplicate_of_profile_id = target.tradesperson_profile_id;

    update public.consent_logs set user_id = null, tradesperson_profile_id = null,
      consent_text = 'Consent evidence retained after account deletion',
      ip_address = null, user_agent = null
      where tradesperson_profile_id = target.tradesperson_profile_id;
    update public.admin_actions set tradesperson_profile_id = null,
      notes = case when notes is null then null else 'Privacy-safe audit record retained' end
      where tradesperson_profile_id = target.tradesperson_profile_id;
    delete from public.whatsapp_conversations
      where tradesperson_profile_id = target.tradesperson_profile_id
        or (imported_lead_ids is not null and imported_lead_id = any(imported_lead_ids));
    delete from public.imported_leads where duplicate_of_profile_id = target.tradesperson_profile_id;
    delete from public.tradesperson_profiles where id = target.tradesperson_profile_id;
  end if;

  select u.id into local_user_id from public.users u where u.auth_user_id = target.auth_user_id for update;
  if local_user_id is not null then
    update public.consent_logs set user_id = null, consent_text = 'Consent evidence retained after account deletion',
      ip_address = null, user_agent = null where user_id = local_user_id;
    update public.admin_actions set admin_user_id = null,
      notes = case when notes is null then null else 'Privacy-safe audit record retained' end
      where admin_user_id = local_user_id;
    delete from public.users where id = local_user_id;
  end if;
  delete from public.account_resolution_audit where account_resolution_audit.auth_user_id = target.auth_user_id;

  return query select target.auth_user_id, target.tradesperson_profile_id;
end;
$$;

create or replace function fail_account_deletion(
  p_request_id uuid, p_claim_token uuid, p_safe_error text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare affected integer;
begin
  if p_safe_error is null or p_safe_error !~ '^[a-z0-9_]{1,80}$' then p_safe_error := 'deletion_failed'; end if;
  update public.account_privacy_requests set status = 'failed', last_error = p_safe_error,
    worker_claim_token = null, lease_expires_at = null, processing_started_at = null
  where id = p_request_id and status = 'processing' and worker_claim_token = p_claim_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function complete_account_deletion(
  p_request_id uuid, p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare affected integer;
begin
  update public.account_privacy_requests set
    status = 'completed', completed_at = statement_timestamp(),
    auth_user_id = null, tradesperson_profile_id = null,
    scheduled_deletion_at = null, processing_started_at = null,
    worker_claim_token = null, lease_expires_at = null, last_error = null
  where id = p_request_id and status = 'processing' and worker_claim_token = p_claim_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function schedule_account_deletion(uuid) from public, anon, authenticated;
revoke all on function cancel_account_deletion(uuid, boolean) from public, anon, authenticated;
revoke all on function claim_due_account_deletions(integer, uuid, integer) from public, anon, authenticated;
revoke all on function delete_account_application_data(uuid, uuid) from public, anon, authenticated;
revoke all on function fail_account_deletion(uuid, uuid, text) from public, anon, authenticated;
revoke all on function complete_account_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function schedule_account_deletion(uuid) to service_role;
grant execute on function cancel_account_deletion(uuid, boolean) to service_role;
grant execute on function claim_due_account_deletions(integer, uuid, integer) to service_role;
grant execute on function delete_account_application_data(uuid, uuid) to service_role;
grant execute on function fail_account_deletion(uuid, uuid, text) to service_role;
grant execute on function complete_account_deletion(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
