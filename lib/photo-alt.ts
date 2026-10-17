import type { Specialist } from "./types";

/** Upload labels often contain filenames, not descriptions of the image. */
export function descriptivePhotoLabel(label?: string | null): string | undefined {
  const text = label?.replace(/\s+/g, " ").trim();
  if (!text || /^(?:https?:|data:|blob:|\/)/i.test(text) || /[/\\]/.test(text)) return undefined;
  if (/\.(?:avif|heic|heif|jpe?g|png|webp|gif|svg)(?:[?#].*)?$/i.test(text)) return undefined;
  if (/^(?:IMG|DSC|DSCN|PXL|DCIM)[_\s-]?\d/i.test(text)) return undefined;
  return text;
}

export function profilePhotoAlt(name: string, label?: string | null, index?: number): string {
  return descriptivePhotoLabel(label) ?? `${name.trim() || "Specialisto"} darbų nuotrauka${index === undefined ? "" : ` ${index + 1}`}`;
}

/** Resolve by the actual displayed URL, including when a card falls back. */
export function specialistPhotoAlt(
  profile: Pick<Specialist, "name" | "trade" | "photoLabels" | "photoUrls" | "cardPhotoUrls">,
  src?: string | null
): string {
  if (src?.startsWith("/trade-defaults/")) return `${profile.trade} iliustracinė nuotrauka`;
  const index = Math.max(profile.photoUrls?.indexOf(src ?? "") ?? -1, profile.cardPhotoUrls?.indexOf(src ?? "") ?? -1);
  return profilePhotoAlt(profile.name, src ? profile.photoLabels?.[src] : undefined, index >= 0 ? index : undefined);
}
