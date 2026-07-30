# LocalPro taxonomy audit

Status: Preview proposal only. Migration `021_normalize_service_taxonomy.sql` has not been applied to production.

## Scope and decisions

- Keep all 13 existing main categories, shown in the interface as **Darbo sritys**.
- Show leaf-level offerings as **Paslaugos**.
- Preserve similar services unless they were explicitly included in the approved merge list.
- Use one canonical service row for every merged identity.
- Use `service_category_assignments` to show a canonical service under more than one relevant work area.
- Store at most one `profile_services` relationship per profile and canonical service.
- Normalize the previously conflicting work-area limits to 8 selected work areas and raise the service limit from 15/20 to 25 in registration, dashboard validation, API validation, and the atomic database function.

## Canonical merges

| Canonical service | Replaces |
|---|---|
| Vidaus durų montavimas | two category-specific duplicates |
| Baldų surinkimas | two category-specific duplicates |
| Pilna būsto apdaila ir remontas | Pilna buto apdaila; Remonto darbai |
| Gipso kartono ir pertvarų montavimas | Gipso kartono montavimas; Pertvarų montavimas |
| Rozečių ir jungiklių montavimas | Rozečių montavimas; Jungiklių montavimas |
| Vėdinimo ir rekuperacijos sistemos | Rekuperacijos sistemos; Vėdinimo sistemos |
| Stogo įrengimas ir dangos keitimas | Naujo stogo įrengimas; Stogo dangos keitimas |
| Angų pjovimas ir įrengimas | Angų įrengimas; Angų pjovimas |
| Laiptų gamyba ir montavimas | Laiptų gamyba; Laiptų montavimas |
| Stoginės, pergolės ir pavėsinės | Stoginių statyba; Pergolės; Pavėsinės |
| Tvorų ir vartų montavimas | Tvorų montavimas; Vartų montavimas |
| Sienų ir pertvarų ardymas | Sienų ardymas; Pertvarų ardymas |
| Spynų ir durų furnitūros keitimas | Spynų keitimas; Durų rankenų keitimas |
| Santechnikos remontas ir smulkūs darbai | Santechnikos remontas; Smulkūs santechnikos darbai |
| Elektros remontas ir smulkūs darbai | Elektros instaliacijos remontas; Smulkūs elektros darbai |

`Stogo remontas` and `Deimantinis gręžimas` remain separate.

## Data-preservation strategy

The migration:

1. creates and backfills category-to-service assignments;
2. selects one existing service ID as the canonical ID for each merge group;
3. removes only duplicate profile-service join rows for the same profile and merge group;
4. repoints surviving profile-service rows to the canonical ID;
5. updates stored request service slugs to the canonical slug;
6. removes only obsolete duplicate taxonomy rows;
7. adds a uniqueness index preventing future double-selection of one canonical service;
8. persists explicit profile work-area selections and replaces the atomic dashboard service function with limits of 25 services and 8 work areas.

It does not delete profiles, requests, photos, operating areas, consent logs, or admin history.

## Unresolved input

The supplied instruction ended after “Do not combine the following because they represent different work:”. No continuation list was received. Therefore this proposal performs no additional similarity-based merges beyond the 15 explicit groups.
