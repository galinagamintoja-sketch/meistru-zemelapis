-- Migration 015 introduced the canonical LocalPro taxonomy while retaining
-- legacy rows for existing profile references. Keep those rows, but hide them
-- from new registration and request selectors, which read active categories.
update service_categories
set is_active = false
where slug not in (
  'vidaus-apdaila',
  'santechnika',
  'elektra-ir-apsauga',
  'sildymas-vedinimas-kondicionavimas',
  'stogai-ir-skardinimas',
  'fasadai-ir-siltinimas',
  'statyba-ir-konstrukcijos',
  'langai-durys-laiptai',
  'medzio-darbai-ir-baldai',
  'lauko-ir-sklypo-darbai',
  'griovimas-ir-atlieku-isvezimas',
  'meistras-i-namus',
  'projektavimas-ir-prieziura'
);
