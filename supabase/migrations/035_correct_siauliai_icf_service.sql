-- ICF is insulated concrete form construction, not timber-frame construction.
-- Use the existing method-neutral Individualių namų statyba service.
-- Modify only the association: never delete/reimport or UPDATE the listing row.
begin;

do $$
declare
  target_job uuid;
  target_count integer;
  correct_trade uuid;
  incorrect_trade uuid;
begin
  select count(*), (array_agg(id))[1] into target_count, target_job
  from public.public_jobs where source_post_id = '2145257802786153';
  if target_count = 0 then
    raise notice 'ICF source post is absent in this environment; no listing changed';
    return;
  end if;
  if target_count <> 1 then
    raise exception 'ICF correction requires exactly one source post match';
  end if;
  perform 1 from public.public_jobs where id = target_job for update;
  if not exists (select 1 from public.public_job_areas where job_id = target_job and area_id = 'siauliai') then
    raise exception 'ICF correction requires the existing Šiauliai area';
  end if;
  select s.id into correct_trade from public.service_subcategories s
  join public.service_categories c on c.id = s.service_category_id
  where s.slug = 'individualiu-namu-statyba' and s.is_active
    and c.slug = 'statyba-ir-konstrukcijos' and c.is_active;
  select id into incorrect_trade from public.service_subcategories
  where slug = 'karkasiniu-namu-statyba';
  if correct_trade is null or incorrect_trade is null then
    raise exception 'ICF correction requires the existing construction services';
  end if;
  if not exists (select 1 from public.public_job_trades
                 where job_id = target_job and trade_id in (incorrect_trade, correct_trade)) then
    raise exception 'ICF correction found an unexpected existing service assignment';
  end if;
  insert into public.public_job_trades(job_id, trade_id)
  values (target_job, correct_trade) on conflict do nothing;
  delete from public.public_job_trades
  where job_id = target_job and trade_id = incorrect_trade;
end $$;

commit;
