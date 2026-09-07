import type { Specialist } from "./types";
import { isPublicLocality } from "./validators";

const normalized = (value: string) => value.trim().toLocaleLowerCase("lt").replace(/\s+/g, " ");

export function profileQualityWarnings(profile: Specialist, profiles: Specialist[] = []) {
  const warnings: string[] = [];
  const description = normalized(profile.description || "");
  const sentences = description.split(/[.!?]+/).map((part) => part.trim()).filter((part) => part.length > 12);
  if (!profile.photoUrls?.length) warnings.push("Trūksta darbų nuotraukų");
  if (sentences.length !== new Set(sentences).size) warnings.push("Aprašyme kartojasi tas pats sakinys");
  if (profile.town && !isPublicLocality(profile.town)) warnings.push("Vieša vietovė panaši į adresą");
  if (profile.town && profile.town === profile.town.toLocaleLowerCase("lt")) warnings.push("Patikrinkite vietovės rašybą didžiąja raide");
  if (profiles.some((other) => other.id !== profile.id && normalized(other.name) === normalized(profile.name))) warnings.push("Yra kitas profilis tokiu pačiu vardu");
  return warnings;
}
