export function safeAuthNext(value: string | null | undefined, fallback = "/meistras") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/u.test(value)) return fallback;
  try {
    const target = new URL(value, "https://localpro.invalid");
    return target.origin === "https://localpro.invalid" ? `${target.pathname}${target.search}${target.hash}` : fallback;
  } catch { return fallback; }
}
