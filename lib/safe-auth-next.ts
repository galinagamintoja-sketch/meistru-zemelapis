export function safeAuthNext(value: string | null | undefined, fallback = "/meistras") {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
