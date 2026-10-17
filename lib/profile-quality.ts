import type { Specialist } from "./types";
import { isPublicLocality } from "./validators";
import { canonicalCategorySlug } from "./service-taxonomy";

const onsiteCategories = new Set([
  "santechnika", "vidaus-apdaila", "medzio-darbai-ir-baldai", "elektra-ir-apsauga",
  "stogai-ir-skardinimas", "lauko-ir-sklypo-darbai", "statyba-ir-konstrukcijos",
  "langai-durys-laiptai", "griovimas-ir-atlieku-isvezimas", "meistras-i-namus"
]);
const searchable = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[-_]/g, " ");
// Deliberately narrow: a website mention or missing trade keyword alone is not a mismatch.
const websiteWork = /\b(?:(?:internet\w*\s+)?svetain\w*\s+(?:kur\w*|programav\w*)|(?:kur\w*|programuoj\w*)\s+(?:internet\w*\s+)?svetain\w*|(?:web\s*(?:site)?|website)\s+(?:design\w*|develop\w*)|(?:design\w*|develop\w*|build\w*)\s+(?:websites?|web\s+sites?))\b/;
const digitalSelection = /\b(?:svetain\w*|web\w*|programav\w*|programin\w*|software|it\s+paslaug\w*)\b/;
const onsiteMention = /\b(?:santech\w*|vamzd\w*|vandentiek\w*|nuotek\w*|maisytuv\w*|sildym\w*|elektr\w*|instaliacij\w*|apdail\w*|dazym\w*|plytel\w*|glaist\w*|stog\w*|skardin\w*|bald\w*|medien\w*|stalia\w*|statyb\w*|remont\w*|renov\w*|gipso\w*|dur\w*|lang\w*|laipt\w*|trinkel\w*|aplink\w*|tvor\w*|griov\w*|plumb\w*|pipes?|heating|electri\w*|paint\w*|roof\w*|carpentr\w*|construction|repairs?|renovat\w*|furniture|tiling)\b/;
// Abstain on negation, past-work and third-party context rather than guessing intent.
const uncertainContext = /\b(?:ne\w*|not|no|never|don['’]?t|doesn['’]?t|cannot|can['’]?t|without|anks[c]?iau|previously|formerly|used\s+to|partner\w*|rekomend\w*|recommend\w*|ieskau|looking\s+for)\b/;

function descriptionServiceWarning(profile: Specialist): string | null {
  if (!onsiteCategories.has(canonicalCategorySlug(profile.categorySlug) ?? "")) return null;
  const selections = [profile.trade, ...(profile.categorySlugs ?? []), ...(profile.categoryNames ?? []),
    ...(profile.subcategorySlugs ?? []), ...(profile.subcategoryNames ?? [])].filter(Boolean).join(" ");
  // Secondary categories/services are evidence too: never infer a single-trade restriction.
  if (digitalSelection.test(searchable(selections))) return null;
  const description = searchable(profile.description || "");
  if (onsiteMention.test(description)) return null;
  const offer = description.split(/[.!?;\n]+/).find((clause) => websiteWork.test(clause) && !uncertainContext.test(clause));
  if (!offer) return null;
  return "Patikrinkite aprašymo ir pasirinktų paslaugų atitiktį: aprašyme minima svetainių kūrimo veikla, bet ji nenurodyta tarp pasirinktų paslaugų";
}

const normalized = (value: string) => value.trim().toLocaleLowerCase("lt").replace(/\s+/g, " ");

export function profileQualityWarnings(profile: Specialist, profiles: Specialist[] = []) {
  const warnings: string[] = [];
  const description = normalized(profile.description || "");
  const sentences = description.split(/[.!?]+/).map((part) => part.trim()).filter((part) => part.length > 12);
  const serviceWarning = descriptionServiceWarning(profile);
  if (serviceWarning) warnings.push(serviceWarning);
  if (!profile.photoUrls?.length) warnings.push("Trūksta darbų nuotraukų");
  if (sentences.length !== new Set(sentences).size) warnings.push("Aprašyme kartojasi tas pats sakinys");
  if (profile.town && !isPublicLocality(profile.town)) warnings.push("Vieša vietovė panaši į adresą");
  if (profile.town && profile.town === profile.town.toLocaleLowerCase("lt")) warnings.push("Patikrinkite vietovės rašybą didžiąja raide");
  if (profiles.some((other) => other.id !== profile.id && normalized(other.name) === normalized(profile.name))) warnings.push("Yra kitas profilis tokiu pačiu vardu");
  return warnings;
}
