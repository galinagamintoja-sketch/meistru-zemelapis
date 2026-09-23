-- Public work-opportunity index. Apply only to an identified LocalPro preview DB first.
create table public.job_areas (
  id text primary key check (id ~ '^[a-z0-9-]{2,80}$'),
  name text not null,
  kind text not null check (kind in ('town', 'municipality')),
  aliases text[] not null default '{}',
  is_active boolean not null default true
);

-- Deliberately limited V1 area taxonomy. Unknown places are rejected, not guessed.
insert into public.job_areas (id, name, kind, aliases) values
  ('vilnius', 'Vilnius', 'town', array['vilniuje']),
  ('vilniaus-rajonas', 'Vilniaus rajonas', 'municipality', array['vilniaus r.', 'vilniaus raj.']),
  ('lentvaris', 'Lentvaris', 'town', array['lentvaryje']),
  ('traku-rajonas', 'Trakų rajonas', 'municipality', array['trakų r.', 'traku rajonas']),
  ('kaunas', 'Kaunas', 'town', array['kaune']),
  ('kauno-rajonas', 'Kauno rajonas', 'municipality', array['kauno r.', 'kauno raj.']),
  ('klaipeda', 'Klaipėda', 'town', array['klaipėdoje', 'klaipeda']),
  ('klaipedos-rajonas', 'Klaipėdos rajonas', 'municipality', array['klaipėdos r.', 'klaipedos rajonas']),
  ('siauliai', 'Šiauliai', 'town', array['šiauliuose', 'siauliai']),
  ('siauliu-rajonas', 'Šiaulių rajonas', 'municipality', array['šiaulių r.', 'siauliu rajonas']),
  ('panevezys', 'Panevėžys', 'town', array['panevėžyje', 'panevezys']),
  ('panevezio-rajonas', 'Panevėžio rajonas', 'municipality', array['panevėžio r.', 'panevezio rajonas']),
  ('alytus', 'Alytus', 'town', array['alytuje']),
  ('alytaus-rajonas', 'Alytaus rajonas', 'municipality', array['alytaus r.', 'alytaus raj.']),
  ('marijampole', 'Marijampolė', 'town', array['marijampolėje', 'marijampole']),
  ('utena', 'Utena', 'town', array['utenoje']),
  ('utenos-rajonas', 'Utenos rajonas', 'municipality', array['utenos r.', 'utenos raj.']),
  ('taurage', 'Tauragė', 'town', array['tauragėje', 'taurage']),
  ('telsiai', 'Telšiai', 'town', array['telšiuose', 'telsiai']);

create table public.public_jobs (
  id uuid primary key default gen_random_uuid(),
  source_platform text not null default 'facebook' check (source_platform = 'facebook'),
  source_url text not null unique,
  source_identity text not null unique,
  source_post_id text,
  source_name text,
  title text not null check (char_length(title) between 5 and 100),
  summary text not null check (char_length(summary) between 20 and 350),
  posted_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'closed', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > posted_at)
);
create index public_jobs_feed_idx on public.public_jobs (posted_at desc, id desc)
  where status = 'active';
create index public_jobs_expiry_idx on public.public_jobs (expires_at)
  where status = 'active';

create table public.public_job_trades (
  job_id uuid not null references public.public_jobs(id) on delete cascade,
  trade_id uuid not null references public.service_subcategories(id) on delete restrict,
  primary key (job_id, trade_id)
);
create index public_job_trades_trade_idx on public.public_job_trades (trade_id, job_id);

create table public.public_job_areas (
  job_id uuid not null references public.public_jobs(id) on delete cascade,
  area_id text not null references public.job_areas(id) on delete restrict,
  primary key (job_id, area_id)
);
create index public_job_areas_area_idx on public.public_job_areas (area_id, job_id);

create table public.public_job_import_audit (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  importer text not null check (char_length(importer) between 1 and 80),
  outcome text not null check (outcome in ('accepted', 'duplicate', 'rejected', 'conflict', 'failed', 'rate_limited')),
  reason_code text not null check (reason_code ~ '^[a-z_]{2,60}$'),
  job_id uuid references public.public_jobs(id) on delete set null,
  source_identity text,
  received_at timestamptz not null default now()
);
create index public_job_import_audit_recent_idx on public.public_job_import_audit (received_at desc);
create index public_job_import_audit_rate_idx on public.public_job_import_audit (importer, received_at desc);

create table public.public_job_import_rate (
  importer text not null,
  minute_bucket timestamptz not null,
  attempts integer not null default 0,
  primary key (importer, minute_bucket)
);

create table public.public_job_guest_sessions (
  id uuid primary key,
  reveal_count smallint not null default 0 check (reveal_count between 0 and 5),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table public.public_job_guest_reveals (
  session_id uuid not null references public.public_job_guest_sessions(id) on delete cascade,
  action_id uuid not null,
  request_key text not null,
  created_at timestamptz not null default now(),
  primary key (session_id, action_id)
);

create table public.public_job_admin_actions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.public_jobs(id) on delete cascade,
  admin_email text not null,
  action text not null check (action in ('hide', 'close')),
  created_at timestamptz not null default now()
);

alter table public.job_areas enable row level security;
alter table public.public_jobs enable row level security;
alter table public.public_job_trades enable row level security;
alter table public.public_job_areas enable row level security;
alter table public.public_job_import_audit enable row level security;
alter table public.public_job_import_rate enable row level security;
alter table public.public_job_guest_sessions enable row level security;
alter table public.public_job_guest_reveals enable row level security;
alter table public.public_job_admin_actions enable row level security;

revoke all on public.job_areas, public.public_jobs, public.public_job_trades,
  public.public_job_areas, public.public_job_import_audit, public.public_job_import_rate, public.public_job_guest_sessions,
  public.public_job_guest_reveals, public.public_job_admin_actions
  from public, anon, authenticated;
grant select, insert, update, delete on public.job_areas, public.public_jobs, public.public_job_trades,
  public.public_job_areas, public.public_job_import_audit, public.public_job_import_rate, public.public_job_guest_sessions,
  public.public_job_guest_reveals, public.public_job_admin_actions to service_role;

-- All accepted jobs, associations and the acceptance audit commit in one transaction.
create or replace function public.import_public_job(payload jsonb, importer_name text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  existing public.public_jobs%rowtype;
  matched_id uuid;
  result_id uuid;
  trade_count integer;
  area_count integer;
begin
  -- Lock both independent identities in a fixed order, including URL-only retries.
  perform pg_advisory_xact_lock(hashtextextended(key, 0))
  from (select key from (values (payload->>'source_identity'), (payload->>'source_url')) as keys(key)
        where key is not null order by key) ordered;

  select id into matched_id from public.public_jobs
  where source_identity = payload->>'source_identity' or source_url = payload->>'source_url'
  limit 1;
  if matched_id is not null then
    select * into existing from public.public_jobs where id = matched_id;
    if existing.source_identity <> payload->>'source_identity'
       or existing.source_url <> payload->>'source_url'
       or (existing.source_post_id is not null and payload ? 'source_post_id'
           and existing.source_post_id <> payload->>'source_post_id') then
      return jsonb_build_object('outcome', 'conflict', 'reason_code', 'source_identity_conflict');
    end if;
    if existing.source_post_id is null and payload ? 'source_post_id' then
      update public.public_jobs set source_post_id = payload->>'source_post_id', updated_at = now()
      where id = existing.id;
    end if;
    insert into public.public_job_import_audit(attempt_id, importer, outcome, reason_code, job_id, source_identity)
      values(request_id, importer_name, 'duplicate', 'already_imported', existing.id, existing.source_identity);
    return jsonb_build_object('outcome', 'duplicate', 'job_id', existing.id);
  end if;

  select count(*) into trade_count from public.service_subcategories
  where id in (select value::uuid from jsonb_array_elements_text(payload->'trade_ids')) and is_active;
  select count(*) into area_count from public.job_areas
  where id in (select value from jsonb_array_elements_text(payload->'area_ids')) and is_active;
  if trade_count <> jsonb_array_length(payload->'trade_ids') then
    return jsonb_build_object('outcome', 'rejected', 'reason_code', 'unsupported_trade');
  end if;
  if area_count <> jsonb_array_length(payload->'area_ids') then
    return jsonb_build_object('outcome', 'rejected', 'reason_code', 'unsupported_area');
  end if;

  insert into public.public_jobs(source_url, source_identity, source_post_id, source_name,
    title, summary, posted_at, expires_at)
  values(payload->>'source_url', payload->>'source_identity', payload->>'source_post_id',
    payload->>'source_name', payload->>'title', payload->>'summary',
    (payload->>'posted_at')::timestamptz, (payload->>'posted_at')::timestamptz + interval '14 days')
  returning id into result_id;
  insert into public.public_job_trades(job_id, trade_id)
    select result_id, value::uuid from jsonb_array_elements_text(payload->'trade_ids');
  insert into public.public_job_areas(job_id, area_id)
    select result_id, value from jsonb_array_elements_text(payload->'area_ids');
  insert into public.public_job_import_audit(attempt_id, importer, outcome, reason_code, job_id, source_identity)
    values(request_id, importer_name, 'accepted', 'accepted', result_id, payload->>'source_identity');
  return jsonb_build_object('outcome', 'accepted', 'job_id', result_id);
end;
$$;
revoke all on function public.import_public_job(jsonb,text,uuid) from public, anon, authenticated;
grant execute on function public.import_public_job(jsonb,text,uuid) to service_role;

create or replace function public.reserve_public_job_import(importer_name text)
returns boolean language plpgsql security definer set search_path = public as $$
declare next_count integer;
begin
  insert into public.public_job_import_rate(importer, minute_bucket, attempts)
    values(importer_name, date_trunc('minute', now()), 1)
    on conflict (importer, minute_bucket) do update
      set attempts = public_job_import_rate.attempts + 1
    returning attempts into next_count;
  return next_count <= 30;
end;
$$;
revoke all on function public.reserve_public_job_import(text) from public, anon, authenticated;
grant execute on function public.reserve_public_job_import(text) to service_role;

create or replace function public.consume_public_job_reveal(
  guest_id uuid, action_id uuid, request_key text
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  session_row public.public_job_guest_sessions%rowtype;
  prior_key text;
begin
  select * into session_row from public.public_job_guest_sessions
    where id = guest_id and expires_at > now() for update;
  if not found then return false; end if;
  select r.request_key into prior_key from public.public_job_guest_reveals r
    where r.session_id = guest_id and r.action_id = consume_public_job_reveal.action_id;
  if found then return prior_key = request_key; end if;
  if session_row.reveal_count >= 5 then return false; end if;
  insert into public.public_job_guest_reveals(session_id, action_id, request_key)
    values(guest_id, action_id, request_key);
  update public.public_job_guest_sessions set reveal_count = reveal_count + 1 where id = guest_id;
  return true;
end;
$$;
revoke all on function public.consume_public_job_reveal(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.consume_public_job_reveal(uuid,uuid,text) to service_role;

create or replace function public.list_public_jobs(
  filter_trade uuid, filter_area text, since_at timestamptz,
  before_posted timestamptz, before_id uuid, snapshot_at timestamptz, row_limit integer
) returns table (
  id uuid, title text, summary text, source_url text, source_name text,
  posted_at timestamptz, expires_at timestamptz, trades jsonb, areas jsonb
) language sql stable security definer set search_path = public as $$
  select j.id, j.title, j.summary, j.source_url, j.source_name, j.posted_at, j.expires_at,
    (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
      from public.public_job_trades jt join public.service_subcategories s on s.id = jt.trade_id
      where jt.job_id = j.id),
    (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind) order by a.name), '[]'::jsonb)
      from public.public_job_areas ja join public.job_areas a on a.id = ja.area_id
      where ja.job_id = j.id)
  from public.public_jobs j
  where j.status = 'active' and j.expires_at > now() and j.created_at <= snapshot_at
    and (since_at is null or j.posted_at >= since_at)
    and (before_posted is null or (j.posted_at, j.id) < (before_posted, before_id))
    and (filter_trade is null or exists (select 1 from public.public_job_trades jt
      where jt.job_id = j.id and jt.trade_id = filter_trade))
    and (filter_area is null or exists (select 1 from public.public_job_areas ja
      where ja.job_id = j.id and ja.area_id = filter_area))
  order by j.posted_at desc, j.id desc
  limit least(greatest(row_limit, 1), 7);
$$;
revoke all on function public.list_public_jobs(uuid,text,timestamptz,timestamptz,uuid,timestamptz,integer) from public, anon, authenticated;
grant execute on function public.list_public_jobs(uuid,text,timestamptz,timestamptz,uuid,timestamptz,integer) to service_role;

create or replace function public.moderate_public_job(target_id uuid, admin_identity text, next_status text)
returns boolean language plpgsql security definer set search_path = public as $$
declare changed integer;
begin
  if next_status not in ('hidden', 'closed') then return false; end if;
  update public.public_jobs set status = next_status, updated_at = now()
    where id = target_id and status <> next_status;
  get diagnostics changed = row_count;
  if changed = 0 then return false; end if;
  insert into public.public_job_admin_actions(job_id, admin_email, action)
    values(target_id, admin_identity, case when next_status = 'hidden' then 'hide' else 'close' end);
  return true;
end;
$$;
revoke all on function public.moderate_public_job(uuid,text,text) from public, anon, authenticated;
grant execute on function public.moderate_public_job(uuid,text,text) to service_role;

create or replace function public.cleanup_public_jobs()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sessions_removed integer;
  audits_removed integer;
  rate_removed integer;
  actions_removed integer;
begin
  delete from public.public_job_guest_sessions where expires_at < now();
  get diagnostics sessions_removed = row_count;
  delete from public.public_job_import_audit where received_at < now() - interval '90 days';
  get diagnostics audits_removed = row_count;
  delete from public.public_job_import_rate where minute_bucket < now() - interval '2 days';
  get diagnostics rate_removed = row_count;
  delete from public.public_job_admin_actions where created_at < now() - interval '1 year';
  get diagnostics actions_removed = row_count;
  return jsonb_build_object('sessions_removed', sessions_removed, 'audits_removed', audits_removed,
    'rate_removed', rate_removed, 'actions_removed', actions_removed);
end;
$$;
revoke all on function public.cleanup_public_jobs() from public, anon, authenticated;
grant execute on function public.cleanup_public_jobs() to service_role;

create or replace function public.public_job_daily_import_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  with today as (
    select outcome, reason_code from public.public_job_import_audit
    where received_at >= (date_trunc('day', now() at time zone 'Europe/Vilnius') at time zone 'Europe/Vilnius')
  )
  select jsonb_build_object(
    'imports_today', count(*) filter (where outcome = 'accepted'),
    'duplicates_today', count(*) filter (where outcome = 'duplicate'),
    'failures_today', count(*) filter (where outcome = 'failed'),
    'rejected_by_reason', coalesce((select jsonb_object_agg(reason_code, amount)
      from (select reason_code, count(*) as amount from today where outcome = 'rejected' group by reason_code) grouped), '{}'::jsonb)
  ) from today;
$$;
revoke all on function public.public_job_daily_import_stats() from public, anon, authenticated;
grant execute on function public.public_job_daily_import_stats() to service_role;

notify pgrst, 'reload schema';
