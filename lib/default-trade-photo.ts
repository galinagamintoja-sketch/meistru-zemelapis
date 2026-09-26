import { canonicalCategorySlug } from "./service-taxonomy";

const TRADE_PHOTOS: Record<string, string> = {
  "vidaus-apdaila": "/trade-defaults/vidaus-apdaila.webp",
  santechnika: "/trade-defaults/santechnika.webp",
  "elektra-ir-apsauga": "/trade-defaults/elektra-ir-apsauga.webp",
  "sildymas-vedinimas-kondicionavimas": "/trade-defaults/sildymas-vedinimas-kondicionavimas.webp",
  "stogai-ir-skardinimas": "/trade-defaults/stogai-ir-skardinimas.webp",
  "fasadai-ir-siltinimas": "/trade-defaults/fasadai-ir-siltinimas.webp",
  "statyba-ir-konstrukcijos": "/trade-defaults/statyba-ir-konstrukcijos.webp",
  "langai-durys-laiptai": "/trade-defaults/langai-durys-laiptai.webp",
  "medzio-darbai-ir-baldai": "/trade-defaults/medzio-darbai-ir-baldai.webp",
  "lauko-ir-sklypo-darbai": "/trade-defaults/lauko-ir-sklypo-darbai.webp",
  "griovimas-ir-atlieku-isvezimas": "/trade-defaults/griovimas-ir-atlieku-isvezimas.webp",
  "meistras-i-namus": "/trade-defaults/meistras-i-namus.webp",
  "projektavimas-ir-prieziura": "/trade-defaults/projektavimas-ir-prieziura.webp"
};

export function defaultTradePhoto(categorySlug?: string | null) {
  const canonicalSlug = canonicalCategorySlug(categorySlug);
  return (canonicalSlug && TRADE_PHOTOS[canonicalSlug]) || TRADE_PHOTOS["meistras-i-namus"];
}
