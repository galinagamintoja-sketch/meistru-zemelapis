alter table profile_photos
  add column if not exists rejection_reason text,
  add column if not exists is_primary boolean not null default false,
  add column if not exists replaces_photo_id uuid references profile_photos(id) on delete set null;

create unique index if not exists profile_photos_one_primary_per_profile
  on profile_photos (tradesperson_profile_id)
  where is_primary and removed_from_profile_at is null;

comment on column profile_photos.replaces_photo_id is
  'Approved photo kept public until this pending replacement is approved.';

create or replace function approve_profile_photo_replacement(target_photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target profile_photos;
begin
  select * into target from profile_photos where id = target_photo_id for update;
  if target.id is null then raise exception 'Photo not found'; end if;

  update profile_photos
    set moderation_status = 'approved', rejection_reason = null
    where id = target.id;

  if target.replaces_photo_id is not null then
    update profile_photos
      set removed_from_profile_at = now(), is_primary = false
      where id = target.replaces_photo_id
        and tradesperson_profile_id = target.tradesperson_profile_id;
  end if;
end;
$$;
