-- Keep phone numbers at their original source; store only a reviewed presence flag.
alter table public.public_jobs add column has_contact_number boolean not null default false;
create index public_jobs_contact_recent_idx on public.public_jobs (posted_at desc, id desc) where has_contact_number and status = 'active';

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
    title, summary, has_contact_number, posted_at, expires_at)
  values(payload->>'source_url', payload->>'source_identity', payload->>'source_post_id',
    payload->>'source_name', payload->>'title', payload->>'summary',
    (payload->>'has_contact_number')::boolean, (payload->>'posted_at')::timestamptz, (payload->>'posted_at')::timestamptz + interval '14 days')
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

create or replace function public.list_public_jobs(
  filter_trade uuid, filter_area text, since_at timestamptz,
  before_posted timestamptz, before_id uuid, snapshot_at timestamptz, row_limit integer, contact_only boolean
) returns table (
  id uuid, title text, summary text, source_url text, source_name text, has_contact_number boolean,
  posted_at timestamptz, expires_at timestamptz, trades jsonb, areas jsonb
) language sql stable security definer set search_path = public as $$
  select j.id, j.title, j.summary, j.source_url, j.source_name, j.has_contact_number, j.posted_at, j.expires_at,
    (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
      from public.public_job_trades jt join public.service_subcategories s on s.id = jt.trade_id
      where jt.job_id = j.id),
    (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind) order by a.name), '[]'::jsonb)
      from public.public_job_areas ja join public.job_areas a on a.id = ja.area_id
      where ja.job_id = j.id)
  from public.public_jobs j
  where j.status = 'active' and j.expires_at > now() and j.created_at <= snapshot_at
    and (not contact_only or j.has_contact_number)
    and (since_at is null or j.posted_at >= since_at)
    and (before_posted is null or (j.posted_at, j.id) < (before_posted, before_id))
    and (filter_trade is null or exists (select 1 from public.public_job_trades jt
      where jt.job_id = j.id and jt.trade_id = filter_trade))
    and (filter_area is null or exists (select 1 from public.public_job_areas ja
      where ja.job_id = j.id and ja.area_id = filter_area))
  order by j.posted_at desc, j.id desc
  limit least(greatest(row_limit, 1), 7);
$$;
revoke all on function public.list_public_jobs(uuid,text,timestamptz,timestamptz,uuid,timestamptz,integer,boolean) from public, anon, authenticated;
grant execute on function public.list_public_jobs(uuid,text,timestamptz,timestamptz,uuid,timestamptz,integer,boolean) to service_role;
