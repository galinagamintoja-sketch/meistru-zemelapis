export function normalizeLithuanianPhone(value: unknown) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.startsWith("370") && digits.length === 11) return `+${digits}`;
  if ((digits.startsWith("8") || digits.startsWith("0")) && digits.length === 9) return `+370${digits.slice(1)}`;
  return trimmed;
}

export function isLithuanianPhone(value: string) {
  return /^\+370\d{8}$/.test(normalizeLithuanianPhone(value).replace(/\s+/g, ""));
}
