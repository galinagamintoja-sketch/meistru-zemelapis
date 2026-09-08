alter table profile_photos add column if not exists card_storage_path text;

comment on column profile_photos.storage_path is 'Private gallery/high-quality WebP object path (up to 1 MB).';
comment on column profile_photos.card_storage_path is 'Private card WebP derivative object path (up to 150 KB).';
