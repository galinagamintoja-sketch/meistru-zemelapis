-- Legacy uploads stored only a public Storage URL. The profile-photos bucket
-- is now private, so retain the object path and let public reads issue a
-- short-lived signed URL after approval checks.

update profile_photos
set storage_path = split_part(
  split_part(url, '/storage/v1/object/public/profile-photos/', 2),
  '?',
  1
)
where storage_path is null
  and url like '%/storage/v1/object/public/profile-photos/%'
  and split_part(url, '/storage/v1/object/public/profile-photos/', 2) <> '';
