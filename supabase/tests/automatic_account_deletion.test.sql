begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create temp table deletion_test_context as
  select gen_random_uuid() auth_id, gen_random_uuid() future_auth_id;
create temp table first_schedule as
  select s.* from deletion_test_context c cross join lateral schedule_account_deletion(c.auth_id) s;
create temp table second_schedule as
  select s.* from deletion_test_context c cross join lateral schedule_account_deletion(c.auth_id) s;

select is((select request_status from first_schedule), 'pending', 'owner schedules a pending deletion');
select ok((select scheduled_at between statement_timestamp() + interval '6 days 23 hours 59 minutes'
  and statement_timestamp() + interval '7 days 1 minute' from first_schedule), 'deadline is seven days');
select ok((select existing_request_reused from second_schedule), 'duplicate scheduling reuses active request');
select is((select request_id from second_schedule), (select request_id from first_schedule), 'duplicate schedule keeps request id');
select is((select scheduled_at from second_schedule), (select scheduled_at from first_schedule), 'duplicate schedule keeps original deadline');
select is((select count(*)::integer from account_privacy_requests r, deletion_test_context c
  where r.auth_user_id = c.auth_id and r.request_type = 'account_deletion'
    and r.status in ('pending', 'processing', 'failed')), 1, 'only one active deletion exists');

select is((select request_status from deletion_test_context c cross join lateral cancel_account_deletion(c.auth_id, false)),
  'cancelled', 'owner cancels before worker claim');
select is((select count(*)::integer from claim_due_account_deletions(10, (select request_id from first_schedule), 15)),
  0, 'cancelled request is never claimable');

create temp table future_schedule as
  select s.* from deletion_test_context c cross join lateral schedule_account_deletion(c.future_auth_id) s;
select is((select count(*)::integer from claim_due_account_deletions(10, (select request_id from future_schedule), 15)),
  0, 'future request is not claimable');

select ok(not has_function_privilege('anon', 'schedule_account_deletion(uuid)', 'execute'), 'anon cannot schedule through RPC');
select ok(not has_function_privilege('authenticated', 'cancel_account_deletion(uuid,boolean)', 'execute'), 'authenticated cannot call cancellation RPC');
select ok(not has_function_privilege('anon', 'claim_due_account_deletions(integer,uuid,integer)', 'execute'), 'anon cannot claim worker jobs');
select ok(has_function_privilege('service_role', 'claim_due_account_deletions(integer,uuid,integer)', 'execute'), 'service role can claim worker jobs');

select * from finish();
rollback;
