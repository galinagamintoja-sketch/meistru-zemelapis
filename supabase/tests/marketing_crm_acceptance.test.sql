begin;

create or replace function pg_temp.assert_true(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'acceptance assertion failed: %', label;
  end if;
end $$;

-- Real database permission checks: browser roles have no table privileges.
select pg_temp.assert_true(not has_table_privilege('anon', 'marketing_contacts', 'select'), 'anon cannot read contacts');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'marketing_contacts', 'select'), 'authenticated cannot read contacts');
select pg_temp.assert_true(not has_table_privilege('anon', 'marketing_messages', 'insert'), 'anon cannot insert messages');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'marketing_send_queue', 'update'), 'authenticated cannot update queue');
select pg_temp.assert_true(has_table_privilege('service_role', 'marketing_contacts', 'select'), 'service role can read contacts');
select pg_temp.assert_true(has_function_privilege('service_role', 'link_marketing_conversation_to_contact(uuid,uuid,text)', 'execute'), 'service role can link conversations');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'link_marketing_conversation_to_contact(uuid,uuid,text)', 'execute'), 'authenticated cannot link conversations');

-- Historical Lithuanian normalization variants remain equivalent.
select pg_temp.assert_true(normalize_lithuanian_contact_number('+37061234567') = '+37061234567', '+370 phone');
select pg_temp.assert_true(normalize_lithuanian_contact_number('37061234567') = '+37061234567', '370 phone');
select pg_temp.assert_true(normalize_lithuanian_contact_number('061234567') = '+37061234567', 'domestic 0 phone');
select pg_temp.assert_true(normalize_lithuanian_contact_number('861234567') = '+37061234567', 'legacy 8 phone');

insert into marketing_imports(id,file_name,created_by)
values ('10000000-0000-4000-8000-000000000001','qa-20260920-marketing.xlsx','qa-admin');

-- Import, invalid evidence idempotency, and source preservation.
select import_marketing_contact_row(
  '10000000-0000-4000-8000-000000000001','QA Contact A',null,'builder','Vilnius',
  '+37061234567','+37061234567','broken@',null,
  'https://facebook.test/source/1','https://facebook.test/group/1','https://facebook.test/post/1','QA source',now(),1,
  null,'invalid_email_address'
);
select import_marketing_contact_row(
  '10000000-0000-4000-8000-000000000001','QA Contact A',null,'builder','Vilnius',
  '37061234567','+37061234567','broken@',null,
  'https://facebook.test/source/1','https://facebook.test/group/1','https://facebook.test/post/1','QA source',now(),2,
  null,'invalid_email_address'
);
select import_marketing_contact_row(
  '10000000-0000-4000-8000-000000000001','QA Contact A',null,'builder','Vilnius',
  '061234567','+37061234567','also-broken',null,
  'https://facebook.test/source/2','https://facebook.test/group/2','https://facebook.test/post/1','QA source 2',now(),3,
  null,'invalid_email_address'
);
select import_marketing_contact_row(
  '10000000-0000-4000-8000-000000000001','QA Contact A',null,'builder','Vilnius',
  '861234567','+37061234567',null,null,
  'https://facebook.test/source/3','https://facebook.test/group/1','https://facebook.test/post/2','QA source 3',now(),4,
  null,null
);

select pg_temp.assert_true((select count(*) = 1 from marketing_contacts where display_name='QA Contact A'), 'phone variants resolve one contact');
select pg_temp.assert_true((select count(*) = 1 from marketing_contact_identities where raw_value='broken@' and not is_valid), 'same invalid email dedupes');
select pg_temp.assert_true((select count(*) = 2 from marketing_contact_identities where identity_type='email' and not is_valid), 'different invalid emails remain');
select pg_temp.assert_true((select count(*) = 3 from marketing_contact_sources s join marketing_contacts c on c.id=s.contact_id where c.display_name='QA Contact A'), 'exact source dedupes and distinct group/post remain');

-- Foreign phone and valid email are accepted as normalized import identities.
select import_marketing_contact_row(
  '10000000-0000-4000-8000-000000000001','QA Contact B',null,'electrician','Kaunas',
  '+447911123456','+447911123456','qa-b@example.test','qa-b@example.test',
  null,null,null,'QA foreign',now(),5,null,null
);
select pg_temp.assert_true((select count(*) = 1 from marketing_contact_identities where identity_type='phone' and normalized_value='+447911123456' and is_valid), 'foreign phone preserved');
select pg_temp.assert_true((select count(*) = 1 from marketing_contact_identities where identity_type='email' and normalized_value='qa-b@example.test' and is_valid), 'valid email preserved');

-- Split-owner input cannot silently merge two contacts.
insert into marketing_contacts(id,display_name) values ('20000000-0000-4000-8000-000000000003','QA Contact C');
insert into marketing_contact_identities(contact_id,identity_type,raw_value,normalized_value)
values ('20000000-0000-4000-8000-000000000003','email','qa-c@example.test','qa-c@example.test');
do $$
begin
  perform import_marketing_contact_row(
    '10000000-0000-4000-8000-000000000001','QA Conflict',null,null,null,
    '+447911123456','+447911123456','qa-c@example.test','qa-c@example.test',
    null,null,null,'QA conflict',now(),6,null,null
  );
  raise exception 'acceptance assertion failed: split-owner import was accepted';
exception when unique_violation then null;
end $$;

-- Contactability ownership, validity, and channel mapping.
insert into marketing_contact_identities(id,contact_id,identity_type,raw_value,normalized_value)
select '30000000-0000-4000-8000-000000000001',id,'telegram_user_id','123456','123456'
from marketing_contacts where display_name='QA Contact A';
insert into marketing_contactability(contact_id,identity_id,channel,eligibility_state)
select contact_id,id,'email','permitted' from marketing_contact_identities where normalized_value='qa-b@example.test';
insert into marketing_contactability(contact_id,identity_id,channel,eligibility_state)
select contact_id,id,'sms','permitted' from marketing_contact_identities where normalized_value='+447911123456';
insert into marketing_contactability(contact_id,identity_id,channel,eligibility_state)
select contact_id,id,'telegram','permitted' from marketing_contact_identities where id='30000000-0000-4000-8000-000000000001';
insert into marketing_contactability(contact_id,identity_id,channel,eligibility_state)
select id,null,'telegram','unknown' from marketing_contacts where display_name='QA Contact A';
do $$
declare contact_a uuid; email_b uuid; invalid_a uuid;
begin
  select id into contact_a from marketing_contacts where display_name='QA Contact A';
  select id into email_b from marketing_contact_identities where normalized_value='qa-b@example.test';
  select id into invalid_a from marketing_contact_identities where raw_value='broken@';
  begin
    insert into marketing_contactability(contact_id,identity_id,channel) values(contact_a,email_b,'email');
    raise exception 'acceptance assertion failed: cross-contact identity accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into marketing_contactability(contact_id,identity_id,channel)
    select contact_id,id,'sms' from marketing_contact_identities where normalized_value='qa-b@example.test';
    raise exception 'acceptance assertion failed: email identity accepted for SMS';
  exception when check_violation then null; end;
  begin
    insert into marketing_contactability(contact_id,identity_id,channel) values(contact_a,invalid_a,'email');
    raise exception 'acceptance assertion failed: invalid identity accepted';
  exception when check_violation then null; end;
end $$;
select pg_temp.assert_true((select count(*) = 1 from marketing_contactability where identity_id is null and channel='telegram' and eligibility_state='unknown'), 'contact-level Telegram eligibility remains unknown and fail-closed');

-- Campaign fixtures used by reply, suppression, and linking safety tests.
insert into marketing_campaigns(id,name,status) values ('40000000-0000-4000-8000-000000000001','QA Campaign','active');
insert into marketing_sequences(id,campaign_id,name,revision,is_active)
values ('40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','QA Sequence',1,true);

-- Approval snapshots remain immutable and edits cancel stale queue work.
insert into marketing_drafts(id,contact_id,campaign_id,channel,recipient_identity,body,draft_type)
select '50000000-0000-4000-8000-000000000001',id,'40000000-0000-4000-8000-000000000001','email','qa-b@example.test','Original body','initial'
from marketing_contacts where display_name='QA Contact B';
select approve_marketing_draft('50000000-0000-4000-8000-000000000001',1,'qa-reviewer',now());
select revise_marketing_draft('50000000-0000-4000-8000-000000000001',1,'Revised body','qa-b@example.test','email',null,'qa-editor');
select pg_temp.assert_true((select body='Original body' and approved_revision=1 and approved_by='qa-reviewer' and superseded_at is not null from marketing_approved_message_snapshots where draft_id='50000000-0000-4000-8000-000000000001'), 'approval snapshot immutable');
select pg_temp.assert_true((select status='cancelled' and cancellation_reason='draft_revised' from marketing_send_queue where draft_id='50000000-0000-4000-8000-000000000001'), 'revision cancels stale queue');
select pg_temp.assert_true((select status='draft' and revision=2 and approved_revision is null from marketing_drafts where id='50000000-0000-4000-8000-000000000001'), 'revision requires reapproval');

-- Inbound reply synchronously pauses acquisition and cancels pending outreach.
insert into marketing_sequence_enrollments(sequence_id,contact_id,state,sequence_revision)
select '40000000-0000-4000-8000-000000000002',id,'active',1 from marketing_contacts where display_name='QA Contact B';
insert into marketing_drafts(id,contact_id,channel,recipient_identity,body,draft_type)
select '50000000-0000-4000-8000-000000000002',id,'sms','+447911123456','Pending body','initial' from marketing_contacts where display_name='QA Contact B';
select approve_marketing_draft('50000000-0000-4000-8000-000000000002',1,'qa-reviewer',now());
insert into marketing_conversations(id,contact_id,status)
select '60000000-0000-4000-8000-000000000001',id,'open' from marketing_contacts where display_name='QA Contact B';
insert into marketing_messages(conversation_id,contact_id,channel,direction,body,status,received_at)
select '60000000-0000-4000-8000-000000000001',id,'sms','inbound','Reply','received',now() from marketing_contacts where display_name='QA Contact B';
select pg_temp.assert_true((select state='paused' and pause_reason='reply_received' from marketing_sequence_enrollments e join marketing_contacts c on c.id=e.contact_id where c.display_name='QA Contact B'), 'inbound pauses sequence');
select pg_temp.assert_true((select status='cancelled' and cancellation_reason='reply_received' from marketing_send_queue where draft_id='50000000-0000-4000-8000-000000000002'), 'inbound cancels queue');
select pg_temp.assert_true((select needs_reply from marketing_conversations where id='60000000-0000-4000-8000-000000000001'), 'inbound sets needs reply');

-- Unmatched inbound linking applies the same safety state and rejects relinking.
insert into marketing_contacts(id,display_name) values ('20000000-0000-4000-8000-000000000004','QA Link Target');
insert into marketing_sequence_enrollments(sequence_id,contact_id,state,sequence_revision)
values ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004','active',1);
insert into marketing_drafts(id,contact_id,channel,recipient_identity,body,draft_type)
values ('50000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004','telegram','999','Pending Telegram','initial');
select approve_marketing_draft('50000000-0000-4000-8000-000000000003',1,'qa-reviewer',now());
insert into marketing_conversations(id,status) values ('60000000-0000-4000-8000-000000000002','needs_matching');
insert into marketing_messages(conversation_id,channel,direction,body,status,received_at)
values ('60000000-0000-4000-8000-000000000002','telegram','inbound','Unknown sender','received',now());
select link_marketing_conversation_to_contact('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004','qa-admin');
select pg_temp.assert_true((select contact_id='20000000-0000-4000-8000-000000000004' and needs_reply and linked_by='qa-admin' from marketing_conversations where id='60000000-0000-4000-8000-000000000002'), 'conversation linked explicitly');
select pg_temp.assert_true((select contact_id='20000000-0000-4000-8000-000000000004' from marketing_messages where conversation_id='60000000-0000-4000-8000-000000000002'), 'unmatched messages linked');
select pg_temp.assert_true((select state='paused' from marketing_sequence_enrollments where contact_id='20000000-0000-4000-8000-000000000004'), 'link pauses sequence');
select pg_temp.assert_true((select status='cancelled' and cancellation_reason='reply_received' from marketing_send_queue where draft_id='50000000-0000-4000-8000-000000000003'), 'link cancels queue');
select pg_temp.assert_true((select count(*)=1 from marketing_events where conversation_id='60000000-0000-4000-8000-000000000002' and event_type='conversation_linked_to_contact'), 'link audited');
do $$ begin
  perform link_marketing_conversation_to_contact('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000004','qa-admin');
  raise exception 'acceptance assertion failed: relink accepted';
exception when serialization_failure then null; end $$;

-- Telegram message IDs are scoped by thread/chat.
insert into marketing_conversations(id,status) values ('60000000-0000-4000-8000-000000000003','needs_matching');
insert into marketing_messages(conversation_id,channel,direction,body,status,external_thread_id,external_message_id)
values
  ('60000000-0000-4000-8000-000000000002','telegram','inbound','Thread A','received','chat-a','same-id'),
  ('60000000-0000-4000-8000-000000000003','telegram','inbound','Thread B','received','chat-b','same-id');
select pg_temp.assert_true((select count(*)=2 from marketing_messages where external_message_id='same-id'), 'same Telegram message ID allowed in distinct threads');

-- Suppression cancels work and survives contact deletion as endpoint evidence.
insert into marketing_contacts(id,display_name) values ('20000000-0000-4000-8000-000000000005','QA Suppressed');
insert into marketing_contact_identities(contact_id,identity_type,raw_value,normalized_value)
values ('20000000-0000-4000-8000-000000000005','email','suppressed@example.test','suppressed@example.test');
insert into marketing_sequence_enrollments(sequence_id,contact_id,state,sequence_revision)
values ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000005','active',1);
select suppress_marketing_contact('20000000-0000-4000-8000-000000000005','all','qa_opt_out','QA evidence','qa-admin');
select pg_temp.assert_true((select state='cancelled' and pause_reason='suppressed' from marketing_sequence_enrollments where contact_id='20000000-0000-4000-8000-000000000005'), 'suppression cancels sequence');
delete from marketing_contacts where id='20000000-0000-4000-8000-000000000005';
select pg_temp.assert_true((select count(*)=1 and bool_and(contact_id is null) from marketing_suppressions where normalized_value='suppressed@example.test' and revoked_at is null), 'suppression endpoint survives deletion');

-- Registration reconciliation handles a unique historical phone and fails closed on ambiguity.
create temp table qa_profiles as
select id, row_number() over (order by id) as row_number from tradesperson_profiles limit 2;
insert into marketing_contacts(id,display_name) values ('20000000-0000-4000-8000-000000000006','QA Registration Unique');
insert into marketing_contact_identities(contact_id,identity_type,raw_value,normalized_value)
values ('20000000-0000-4000-8000-000000000006','phone','+37069990001','+37069990001');
insert into marketing_sequence_enrollments(sequence_id,contact_id,state,sequence_revision)
values ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000006','active',1);
insert into marketing_drafts(id,contact_id,channel,recipient_identity,body,draft_type)
values ('50000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000006','sms','+37069990001','Registration pending','initial');
select approve_marketing_draft('50000000-0000-4000-8000-000000000004',1,'qa-reviewer',now());
set local session_replication_role = replica;
update tradesperson_profiles set phone='869990001', email='qa-registration@example.test'
where id=(select id from qa_profiles where row_number=1);
set local session_replication_role = origin;
select * from reconcile_marketing_registration((select id from qa_profiles where row_number=1));
select pg_temp.assert_true((select status='registered' and specialist_profile_id=(select id from qa_profiles where row_number=1) from marketing_contacts where id='20000000-0000-4000-8000-000000000006'), 'unique registration matched');
select pg_temp.assert_true((select state='cancelled' and pause_reason='registered' from marketing_sequence_enrollments where contact_id='20000000-0000-4000-8000-000000000006'), 'registration cancels sequence');
select pg_temp.assert_true((select status='cancelled' and cancellation_reason='registered' from marketing_send_queue where draft_id='50000000-0000-4000-8000-000000000004'), 'registration cancels queue');

insert into marketing_contacts(id,display_name) values
  ('20000000-0000-4000-8000-000000000007','QA Registration Ambiguous A'),
  ('20000000-0000-4000-8000-000000000008','QA Registration Ambiguous B');
insert into marketing_contact_identities(contact_id,identity_type,raw_value,normalized_value) values
  ('20000000-0000-4000-8000-000000000007','phone','+37069990002','+37069990002'),
  ('20000000-0000-4000-8000-000000000008','phone','+37069990002','+37069990002');
insert into marketing_sequence_enrollments(sequence_id,contact_id,state,sequence_revision) values
  ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000007','active',1),
  ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000008','active',1);
set local session_replication_role = replica;
update tradesperson_profiles set phone='869990002', email='qa-ambiguous@example.test'
where id=(select id from qa_profiles where row_number=2);
set local session_replication_role = origin;
select * from reconcile_marketing_registration((select id from qa_profiles where row_number=2));
select pg_temp.assert_true((select count(*)=0 from marketing_contacts where id in ('20000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000008') and specialist_profile_id is not null), 'ambiguous registration does not link');
select pg_temp.assert_true((select count(*)=2 from marketing_sequence_enrollments where contact_id in ('20000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000008') and state='paused' and pause_reason='registration_match_conflict'), 'ambiguous registration pauses both contacts');

select 'marketing_crm_acceptance_passed' as result;
rollback;
