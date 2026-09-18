const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function textValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

export function normalizeMarketingEmail(value: unknown) {
  const raw = textValue(value);
  if (!raw || !emailPattern.test(raw)) return null;
  const at = raw.lastIndexOf("@");
  return `${raw.slice(0, at).toLowerCase()}@${raw.slice(at + 1).toLowerCase()}`;
}

export function normalizeMarketingPhone(value: unknown) {
  const raw = textValue(value);
  if (!raw) return null;
  const leadingPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (/^370\d{8}$/.test(digits)) return `+${digits}`;
  if (/^[08]\d{8}$/.test(digits)) return `+370${digits.slice(1)}`;
  if (leadingPlus && /^\d{8,15}$/.test(digits)) return `+${digits}`;
  return null;
}

export function normalizedIdentityKey(type: "phone" | "email", value: string) {
  return `${type}:${value}`;
}

