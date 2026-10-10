import type { Specialist } from "./types";

// Public DTOs contain only visible approved photos. Do not mistake portfolio
// labels for URLs, or exclude approved work photos because they aren't primary.
export function specialistPhotoCandidates(profile: Pick<Specialist, "cardPhotoUrls" | "photoUrls" | "photoRecords" | "photos">): string[] {
  const originals = [
    ...(profile.photoRecords ?? []).filter((photo) => photo.moderationStatus === "approved" && !photo.removedAt).map((photo) => photo.url),
    ...(profile.photoUrls ?? []),
    ...(profile.photos ?? [])
  ];
  const candidates = [profile.cardPhotoUrls?.[0], ...originals, ...(profile.cardPhotoUrls ?? []).slice(1)];
  return [...new Set(candidates.flatMap((value) => {
    const url = value?.trim();
    return url && /^(https?:\/\/|\/(?!\/))/.test(url) ? [url] : [];
  }))];
}
