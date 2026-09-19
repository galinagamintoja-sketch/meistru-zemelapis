import { parsePhoneNumberFromString } from "libphonenumber-js";

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
  const compact = raw.replace(/[\s().-]/g, "");
  const lithuanianCandidate = /^370\d+$/.test(compact)
    ? `+${compact}`
    : /^[08]\d+$/.test(compact)
      ? `+370${compact.slice(1)}`
      : compact;
  const phone = parsePhoneNumberFromString(lithuanianCandidate, "LT");
  return phone?.isValid() ? phone.number : null;
}

export function phoneInvalidReason(value: unknown) {
  const raw = textValue(value);
  return raw && !normalizeMarketingPhone(raw) ? "invalid_phone_number" : null;
}

export function emailInvalidReason(value: unknown) {
  const raw = textValue(value);
  return raw && !normalizeMarketingEmail(raw) ? "invalid_email_address" : null;
}

export function normalizedIdentityKey(type: "phone" | "email", value: string) {
  return `${type}:${value}`;
}
