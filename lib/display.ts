import type { Specialist } from "./types";

type LithuanianForms = {
  one: string;
  few: string;
  many: string;
};

const specialistForms = {
  one: "specialistas",
  few: "specialistai",
  many: "specialistų"
};

const markerForms = {
  one: "žymeklis",
  few: "žymekliai",
  many: "žymeklių"
};

const masterForms = {
  one: "Meistras",
  few: "Meistrai",
  many: "Meistrų"
};

const reviewForms = {
  one: "atsiliepimas",
  few: "atsiliepimai",
  many: "atsiliepimų"
};

export const verificationDisplay = {
  contact: {
    icon: "✓",
    label: "Kontaktas patvirtintas"
  },
  portfolio: {
    icon: "▣",
    label: "Yra darbų nuotraukų"
  },
  whatsapp: {
    icon: "☎",
    label: "Galima susisiekti per WhatsApp"
  }
} as const;

export function pluralizeLt(count: number, forms: LithuanianForms) {
  const absolute = Math.abs(count);
  const lastTwo = absolute % 100;
  const last = absolute % 10;

  if (last === 1 && lastTwo !== 11) {
    return forms.one;
  }

  if (last >= 2 && last <= 9 && (lastTwo < 12 || lastTwo > 19)) {
    return forms.few;
  }

  return forms.many;
}

export function formatSpecialistCount(count: number) {
  return `${count} ${pluralizeLt(count, specialistForms)}`;
}

export function formatMarkerCount(count: number) {
  return `${count} ${pluralizeLt(count, markerForms)}`;
}

export function formatMasterCount(count: number) {
  return `${count} ${pluralizeLt(count, masterForms)}`;
}

export function formatReviewCount(count: number) {
  return `${count} ${pluralizeLt(count, reviewForms)}`;
}

export function formatVerificationLabel(value: string) {
  const key = value.trim().toLowerCase() as keyof typeof verificationDisplay;
  return verificationDisplay[key]?.label ?? value;
}

export function formatVerificationBadge(value: string) {
  const key = value.trim().toLowerCase() as keyof typeof verificationDisplay;
  const item = verificationDisplay[key];
  return item ? `${item.icon} ${item.label}` : value;
}

export function formatVerificationSummary(values: string[]) {
  const labels = values.map(formatVerificationLabel).filter(Boolean);
  return labels.length ? labels.join(", ") : "Kontaktas tikrinamas";
}

export function isObviousPublicTestProfile(specialist: Pick<Specialist, "name" | "email" | "description" | "source">) {
  const name = specialist.name.trim().toLowerCase();
  const email = specialist.email.trim().toLowerCase();
  const description = specialist.description.trim().toLowerCase();

  return (
    /^deployment test\b/.test(name) ||
    /^test builder\b/.test(name) ||
    /^test meistras\b/.test(name) ||
    email.endsWith("@example.lt") ||
    email.endsWith("@example.com") ||
    description.includes("automated production deployment test") ||
    description.includes("test builder account") ||
    description.includes("testinis profilio aprasymas")
  );
}
