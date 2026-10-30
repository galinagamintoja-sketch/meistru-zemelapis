/**
 * Conservative public discovery gate, not a geocoder or an authoritative town list.
 * Never repair owner data or infer a replacement locality from an address.
 * Accept villages/districts and accented, multiword or hyphenated place names.
 */
export function isPublicSeoLocality(value: string): boolean {
  const locality = value.trim();
  if (locality.length < 2 || !/\p{L}/u.test(locality) ||
      !/^[\p{L}\p{M}\s.'’\-]+$/u.test(locality)) return false;
  const normalized = locality.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Match complete street-designator tokens, including dotted and slugged forms.
  return !/(?:^|[\s.,-])(?:g|gatve|street|pr|prospektas|al|aleja|pl|plentas|kelias|skg|skersgatvis|aklg|akligatvis)(?=$|[\s.,-])/u.test(normalized);
}
