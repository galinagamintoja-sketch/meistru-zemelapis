-- LocalPro Marketing CRM foundation. Browser roles receive no direct access;
-- authenticated admin server routes use the existing service-role client.
create type marketing_contact_status as enum (
  'new', 'contacted', 'replied', 'interested', 'registered',
  'not_interested', 'do_not_contact', 'invalid_contact'
);
create type marketing_identity_type as enum ('phone', 'email', 'telegram_user_id');
create type marketing_channel as enum ('telegram', 'email', 'sms');
create type marketing_message_direction as enum ('inbound', 'outbound');
create type marketing_message_status as enum (
  'draft', 'approved', 'queued', 'sending', 'accepted', 'sent',
  'delivered', 'failed', 'cancelled', 'unknown', 'received'
);
create type marketing_sequence_state as enum ('active', 'paused', 'completed', 'cancelled');
create type marketing_draft_status as enum ('draft', 'approved', 'rejected', 'superseded');
create type marketing_queue_status as enum ('queued', 'leased', 'completed', 'failed', 'cancelled', 'unknown');

create table marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  company_name text,
  trade text,
  area text,
  status marketing_contact_status not null default 'new',
  recipient_category text not null default 'unknown' check (recipient_category in ('individual', 'legal_entity', 'unknown')),
  owner_email text,
  notes text,
  specialist_profile_id uuid unique references tradesperson_profiles(id) on delete set null,
  registered_at timestamptz,
  manually_corrected_fields text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table marketing_contact_identities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references marketing_contacts(id) on delete cascade,
  identity_type marketing_identity_type not null,
  raw_value text not null,
  normalized_value text not null,
  is_primary boolean not null default false,
  is_valid boolean not null default true,
  confidence text not null default 'exact' check (confidence in ('exact', 'verified', 'manual', 'uncertain')),
  invalid_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (identity_type, normalized_value)
);
create index marketing_contact_identities_contact_idx on marketing_contact_identities(contact_id);

create table marketing_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  status text not null default 'previewed' check (status in ('previewed', 'committed', 'failed')),
  mapping jsonb not null default '{}'::jsonb,
  row_counts jsonb not null default '{}'::jsonb,
  error_report jsonb not null default '[]'::jsonb,
  created_by text not null,
  committed_at timestamptz,
  created_at timestamptz not null default now()
);

create table marketing_contact_sources (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references marketing_contacts(id) on delete cascade,
  import_id uuid references marketing_imports(id) on delete set null,
  source_type text not null default 'import',
  source_url text,
  group_url text,
  post_url text,
  source_label text,
  discovered_at timestamptz,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index marketing_contact_sources_natural_key
  on marketing_contact_sources(contact_id, source_type, coalesce(post_url, ''), coalesce(source_url, ''), coalesce(source_label, ''));

create table marketing_channel_accounts (
  id uuid primary key default gen_random_uuid(),
  channel marketing_channel not null,
  label text not null,
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'degraded', 'paused')),
  capabilities jsonb not null default '{}'::jsonb,
  secret_reference text,
  last_seen_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table marketing_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references marketing_contacts(id) on delete set null,
  needs_reply boolean not null default false,
  unread_count integer not null default 0 check (unread_count >= 0),
  assigned_owner text,
  status text not null default 'open' check (status in ('open', 'resolved', 'needs_matching')),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index marketing_conversations_one_open_per_contact
  on marketing_conversations(contact_id) where contact_id is not null and status <> 'resolved';

create table marketing_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references marketing_contacts(id) on delete set null,
  conversation_id uuid not null references marketing_conversations(id) on delete cascade,
  channel marketing_channel not null,
  channel_account_id uuid references marketing_channel_accounts(id) on delete set null,
  direction marketing_message_direction not null,
  body text not null,
  status marketing_message_status not null,
  sender_identity text,
  recipient_identity text,
  external_thread_id text,
  external_message_id text,
  provider_event_id text,
  sent_at timestamptz,
  received_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index marketing_messages_provider_event_idx
  on marketing_messages(channel_account_id, provider_event_id) where provider_event_id is not null;
create unique index marketing_messages_external_id_idx
  on marketing_messages(channel_account_id, external_message_id) where external_message_id is not null;

create table marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table marketing_sequences (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references marketing_campaigns(id) on delete cascade,
  name text not null,
  revision integer not null default 1,
  is_active boolean not null default false,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table marketing_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references marketing_sequences(id) on delete cascade,
  contact_id uuid not null references marketing_contacts(id) on delete cascade,
  state marketing_sequence_state not null default 'active',
  current_step integer not null default 0 check (current_step >= 0),
  due_at timestamptz,
  pause_reason text,
  completed_outcome text,
  sequence_revision integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_id, contact_id)
);

create table marketing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel marketing_channel not null,
  template_type text not null check (template_type in ('initial', 'follow_up', 'reply')),
  body text not null,
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table marketing_approval_batches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open' check (status in ('open', 'partially_approved', 'approved', 'closed')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table marketing_drafts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references marketing_contacts(id) on delete cascade,
  conversation_id uuid references marketing_conversations(id) on delete set null,
  campaign_id uuid references marketing_campaigns(id) on delete set null,
  sequence_enrollment_id uuid references marketing_sequence_enrollments(id) on delete set null,
  template_id uuid references marketing_templates(id) on delete set null,
  approval_batch_id uuid references marketing_approval_batches(id) on delete set null,
  channel marketing_channel not null,
  channel_account_id uuid references marketing_channel_accounts(id) on delete set null,
  recipient_identity text not null,
  body text not null,
  draft_type text not null check (draft_type in ('initial', 'follow_up', 'reply')),
  status marketing_draft_status not null default 'draft',
  revision integer not null default 1,
  approved_revision integer,
  approved_by text,
  approved_at timestamptz,
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'approved') or (approved_revision = revision and approved_at is not null))
);

create table marketing_send_queue (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references marketing_drafts(id) on delete restrict,
  contact_id uuid not null references marketing_contacts(id) on delete cascade,
  due_at timestamptz not null,
  status marketing_queue_status not null default 'queued',
  idempotency_key text not null unique,
  leased_by text,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  transport_job_id text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index marketing_send_queue_due_idx on marketing_send_queue(status, due_at);

create or replace function approve_marketing_draft(
  target_draft_id uuid, target_revision integer, reviewer text, target_due_at timestamptz default now()
) returns uuid language plpgsql security definer set search_path = public as $$
declare current_draft marketing_drafts%rowtype; queue_id uuid;
begin
  select * into current_draft from marketing_drafts where id = target_draft_id for update;
  if not found or current_draft.status <> 'draft' or current_draft.revision <> target_revision then
    raise exception using errcode = '40001', message = 'draft_changed_or_not_approvable';
  end if;
  update marketing_drafts set status = 'approved', approved_revision = target_revision,
    approved_by = reviewer, approved_at = now(), updated_at = now() where id = target_draft_id;
  insert into marketing_send_queue(draft_id, contact_id, due_at, idempotency_key)
    values(target_draft_id, current_draft.contact_id, target_due_at, 'draft:' || target_draft_id || ':revision:' || target_revision)
    on conflict(idempotency_key) do update set due_at = excluded.due_at
    returning id into queue_id;
  insert into marketing_events(contact_id,event_type,actor_type,actor_id,payload)
    values(current_draft.contact_id,'draft_approved','admin',reviewer,jsonb_build_object('draftId',target_draft_id,'revision',target_revision));
  return queue_id;
end $$;

create table marketing_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references marketing_contacts(id) on delete set null,
  conversation_id uuid references marketing_conversations(id) on delete set null,
  event_type text not null,
  actor_type text not null default 'system',
  actor_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index marketing_events_contact_idx on marketing_events(contact_id, created_at desc);

create table marketing_suppressions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references marketing_contacts(id) on delete set null,
  identity_type marketing_identity_type,
  normalized_value text,
  scope text not null default 'all' check (scope in ('all', 'telegram', 'email', 'sms')),
  reason text not null,
  evidence text,
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text,
  check (contact_id is not null or normalized_value is not null)
);
create unique index marketing_suppressions_active_identity_idx
  on marketing_suppressions(identity_type, normalized_value, scope)
  where revoked_at is null and normalized_value is not null;

create table marketing_settings (
  key text primary key,
  value jsonb not null,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into marketing_settings(key, value) values
  ('outreach_rules', '{"channelPriority":["telegram","email","sms"],"newContactsPerDay":5,"maximumNewContactsPerDay":10,"proactiveMessagesPerDay":20,"delayDays":4,"weekdays":[1,2,3,4,5],"windowStart":"09:00","windowEnd":"18:00","timezone":"Europe/Vilnius","maximumAttempts":3,"humanApprovalRequired":true,"pauseOnReply":true,"stopOnRegistration":true,"globalPause":true}'::jsonb),
  ('import_rules', '{"deduplicatePhone":true,"deduplicateEmail":true,"preserveManualCorrections":true,"preserveSources":true,"quarantineConflicts":true}'::jsonb)
on conflict (key) do nothing;

-- One import row is resolved and written atomically. The advisory lock makes
-- concurrent imports for the same identities serialize before unique checks.
create or replace function import_marketing_contact_row(
  target_import_id uuid, target_name text, target_company text, target_trade text, target_area text,
  phone_raw text, phone_normalized text, email_raw text, email_normalized text,
  target_source_url text, target_group_url text, target_post_url text, target_source_label text,
  target_discovered_at timestamptz, target_row_number integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare phone_owner uuid; email_owner uuid; resolved_contact uuid; created_contact boolean := false;
  added_identity boolean := false; protected_fields text[]; profile_ids uuid[];
begin
  if nullif(trim(target_name), '') is null or (phone_normalized is null and email_normalized is null) then
    raise exception using errcode = '22023', message = 'invalid_marketing_contact_row';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(phone_normalized,'') || '|' || coalesce(email_normalized,''), 0));
  select i.contact_id into phone_owner from marketing_contact_identities i
    where i.identity_type = 'phone' and i.normalized_value = phone_normalized;
  select i.contact_id into email_owner from marketing_contact_identities i
    where i.identity_type = 'email' and i.normalized_value = email_normalized;
  if phone_owner is not null and email_owner is not null and phone_owner <> email_owner then
    raise exception using errcode = '23505', message = 'marketing_identity_conflict';
  end if;
  resolved_contact := coalesce(phone_owner, email_owner);
  if resolved_contact is null then
    insert into marketing_contacts(display_name,company_name,trade,area)
      values(trim(target_name),nullif(trim(target_company),''),nullif(trim(target_trade),''),nullif(trim(target_area),''))
      returning id into resolved_contact;
    created_contact := true;
  else
    select manually_corrected_fields into protected_fields from marketing_contacts where id = resolved_contact for update;
    update marketing_contacts set
      company_name = case when nullif(trim(target_company),'') is not null and not ('company_name'=any(protected_fields)) then trim(target_company) else company_name end,
      trade = case when nullif(trim(target_trade),'') is not null and not ('trade'=any(protected_fields)) then trim(target_trade) else trade end,
      area = case when nullif(trim(target_area),'') is not null and not ('area'=any(protected_fields)) then trim(target_area) else area end,
      updated_at = now() where id = resolved_contact;
  end if;
  if phone_normalized is not null and phone_owner is null then
    insert into marketing_contact_identities(contact_id,identity_type,raw_value,normalized_value,is_primary)
      values(resolved_contact,'phone',phone_raw,phone_normalized,true);
    added_identity := true;
  end if;
  if email_normalized is not null and email_owner is null then
    insert into marketing_contact_identities(contact_id,identity_type,raw_value,normalized_value,is_primary)
      values(resolved_contact,'email',email_raw,email_normalized,true);
    added_identity := true;
  end if;
  insert into marketing_contact_sources(contact_id,import_id,source_type,source_url,group_url,post_url,source_label,discovered_at,raw_data)
    values(resolved_contact,target_import_id,'import',nullif(target_source_url,''),nullif(target_group_url,''),nullif(target_post_url,''),target_source_label,target_discovered_at,jsonb_build_object('rowNumber',target_row_number))
    on conflict do nothing;
  select array_agg(distinct p.id) into profile_ids from tradesperson_profiles p
    where (phone_normalized is not null and p.phone = phone_normalized)
       or (email_normalized is not null and lower(trim(p.email)) = email_normalized);
  if coalesce(array_length(profile_ids,1),0) = 1 then
    perform reconcile_marketing_registration(profile_ids[1]);
  elsif coalesce(array_length(profile_ids,1),0) > 1 then
    update marketing_sequence_enrollments set state='paused',pause_reason='registration_match_conflict',updated_at=now()
      where contact_id=resolved_contact and state='active';
    insert into marketing_events(contact_id,event_type,payload)
      values(resolved_contact,'registration_match_conflict',jsonb_build_object('profileIds',profile_ids));
  end if;
  return jsonb_build_object('contactId',resolved_contact,'status',case when created_contact then 'created' when added_identity then 'updated' else 'already_exists' end);
end $$;

-- Any inbound message pauses acquisition synchronously, before classification.
create or replace function marketing_pause_on_inbound_message()
returns trigger language plpgsql as $$
begin
  if new.direction = 'inbound' then
    update marketing_conversations set needs_reply = true, unread_count = unread_count + 1,
      last_inbound_at = coalesce(new.received_at, new.created_at), updated_at = now()
      where id = new.conversation_id;
    update marketing_sequence_enrollments set state = 'paused', pause_reason = 'reply_received', updated_at = now()
      where contact_id = new.contact_id and state = 'active';
    update marketing_contacts set status = case when status in ('new','contacted') then 'replied' else status end, updated_at = now()
      where id = new.contact_id;
    update marketing_send_queue set status = 'cancelled', last_error = 'reply_received', updated_at = now()
      where contact_id = new.contact_id and status in ('queued','leased');
  end if;
  return new;
end $$;
create trigger marketing_messages_pause_on_inbound
after insert on marketing_messages for each row execute function marketing_pause_on_inbound_message();

-- A profile insert/update reconciles a unique phone or email match and stops outreach.
create or replace function reconcile_marketing_registration(target_profile_id uuid)
returns table(result text, contact_id uuid) language plpgsql security definer set search_path = public as $$
declare profile_row tradesperson_profiles%rowtype; phone_value text; email_value text; matches uuid[];
begin
  select * into profile_row from tradesperson_profiles where id = target_profile_id;
  if not found then return query select 'profile_not_found'::text, null::uuid; return; end if;
  phone_value := normalize_lithuanian_contact_number(profile_row.phone);
  email_value := lower(trim(profile_row.email));
  select array_agg(distinct i.contact_id) into matches from marketing_contact_identities i
    where (i.identity_type = 'phone' and i.normalized_value = phone_value)
       or (i.identity_type = 'email' and i.normalized_value = email_value);
  if coalesce(array_length(matches, 1), 0) = 1 then
    update marketing_contacts set specialist_profile_id = target_profile_id, status = 'registered', registered_at = now(), updated_at = now()
      where id = matches[1];
    update marketing_sequence_enrollments set state = 'cancelled', pause_reason = 'registered', updated_at = now()
      where marketing_sequence_enrollments.contact_id = matches[1] and state in ('active','paused');
    update marketing_send_queue set status = 'cancelled', last_error = 'registered', updated_at = now()
      where marketing_send_queue.contact_id = matches[1] and status in ('queued','leased');
    insert into marketing_events(contact_id,event_type,payload)
      values(matches[1],'registration_matched',jsonb_build_object('specialistProfileId',target_profile_id));
    return query select 'matched'::text, matches[1]; return;
  elsif coalesce(array_length(matches, 1), 0) > 1 then
    update marketing_sequence_enrollments set state = 'paused', pause_reason = 'registration_match_conflict', updated_at = now()
      where marketing_sequence_enrollments.contact_id = any(matches) and state = 'active';
    return query select 'conflict'::text, unnest(matches); return;
  end if;
  return query select 'no_match'::text, null::uuid;
end $$;

create or replace function marketing_reconcile_profile_trigger()
returns trigger language plpgsql as $$ begin perform reconcile_marketing_registration(new.id); return new; end $$;
create trigger tradesperson_profiles_marketing_reconcile
after insert or update of phone, email on tradesperson_profiles
for each row execute function marketing_reconcile_profile_trigger();

revoke all on function reconcile_marketing_registration(uuid) from public, anon, authenticated;
revoke all on function approve_marketing_draft(uuid,integer,text,timestamptz) from public, anon, authenticated;
revoke all on function import_marketing_contact_row(uuid,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,integer) from public, anon, authenticated;
grant execute on function reconcile_marketing_registration(uuid) to service_role;
grant execute on function approve_marketing_draft(uuid,integer,text,timestamptz) to service_role;
grant execute on function import_marketing_contact_row(uuid,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz,integer) to service_role;

do $$ declare table_name text; begin
  foreach table_name in array array[
    'marketing_contacts','marketing_contact_identities','marketing_contact_sources','marketing_imports',
    'marketing_conversations','marketing_messages','marketing_campaigns','marketing_sequences',
    'marketing_sequence_enrollments','marketing_templates','marketing_drafts','marketing_approval_batches',
    'marketing_send_queue','marketing_events','marketing_suppressions','marketing_channel_accounts','marketing_settings'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('revoke all on table %I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table %I to service_role', table_name);
  end loop;
end $$;

comment on table marketing_contacts is 'Private LocalPro marketing CRM contacts. Server-side admin access only.';
comment on table marketing_send_queue is 'Durable approved-send handoff; transport workers must recheck eligibility before dispatch.';
