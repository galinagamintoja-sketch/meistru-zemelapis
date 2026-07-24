import { describe, expect, it, vi } from "vitest";
import { registrationSchema } from "../lib/validators";
import {
  mergeRegistrationPhotoSelections,
  REGISTRATION_PHOTO_MAX_BYTES,
  type RegistrationPhotoFileLike,
  type RegistrationPhotoSelection,
  type RegistrationPhotoUploadPlan,
  uploadRegistrationPhotos
} from "../lib/registration-photos";

function file(name: string, options: Partial<RegistrationPhotoFileLike> = {}): RegistrationPhotoFileLike {
  return {
    name,
    type: "image/jpeg",
    size: 1024,
    lastModified: 1000,
    ...options
  };
}

let id = 0;
function selection(value: RegistrationPhotoFileLike): RegistrationPhotoSelection {
  return {
    id: `photo-${id++}`,
    name: value.name,
    type: value.type as RegistrationPhotoSelection["type"],
    size: value.size,
    lastModified: value.lastModified,
    previewUrl: `blob:${value.name}`
  };
}

function merge(existing: RegistrationPhotoSelection[], incoming: RegistrationPhotoFileLike[], manualUrlCount = 0) {
  return mergeRegistrationPhotoSelections(existing, incoming, manualUrlCount, selection);
}

const validRegistration = {
  name: "Test Meistras",
  phone: "+37061234567",
  email: "test@example.lt",
  address: "Trakų g. 10, Lentvaris",
  trade: "Apdaila",
  categorySlugs: ["apdaila"],
  subcategorySlugs: ["dazymas", "glaistymas"],
  description: "Pakankamai ilgas kontroliuojamo specialisto aprašymas registracijos nuotraukų validavimo testui atlikti.",
  travelRange: "25",
  consentAccepted: true,
  termsAccepted: true,
  privacyAcknowledged: true,
  publicContactConsent: true
};

describe("registration photo selection behavior", () => {
  it("keeps two selected images when one more is selected later", () => {
    const first = merge([], [file("one.jpg"), file("two.jpg", { lastModified: 1001 })]);
    const second = merge(first.next, [file("three.jpg", { lastModified: 1002 })]);
    expect(second.next.map((photo) => photo.name)).toEqual(["one.jpg", "two.jpg", "three.jpg"]);
  });

  it("never exceeds eight and clearly reports files that did not fit", () => {
    const seven = merge([], Array.from({ length: 7 }, (_, index) => file(`${index}.jpg`, { lastModified: index })));
    const result = merge(seven.next, [file("seven.jpg", { lastModified: 10 }), file("eight.jpg", { lastModified: 11 })]);
    expect(result.next).toHaveLength(8);
    expect(result.limitRejectedCount).toBe(1);
    expect(result.message).toContain("1 netilpo");
  });

  it("allows another image after one is removed", () => {
    const initial = merge([], [file("one.jpg"), file("two.jpg", { lastModified: 2 })]).next;
    const afterRemoval = initial.filter((photo) => photo.name !== "one.jpg");
    expect(merge(afterRemoval, [file("three.jpg", { lastModified: 3 })]).next.map((photo) => photo.name))
      .toEqual(["two.jpg", "three.jpg"]);
  });

  it("allows the same file to be reselected after it was removed", () => {
    const original = file("same.jpg", { size: 333, lastModified: 44 });
    const selected = merge([], [original]).next;
    expect(merge(selected.filter(() => false), [original]).acceptedCount).toBe(1);
  });

  it("does not add duplicates identifiable by name, size and lastModified", () => {
    const original = file("same.jpg", { size: 333, lastModified: 44 });
    const selected = merge([], [original]).next;
    const result = merge(selected, [original]);
    expect(result.next).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.message).toContain("pasikartojanti");
  });

  it("counts uploaded files and non-empty manual URLs together", () => {
    const seven = merge([], Array.from({ length: 7 }, (_, index) => file(`${index}.jpg`, { lastModified: index }))).next;
    const result = merge(seven, [file("extra.jpg", { lastModified: 99 })], 1);
    expect(result.next).toHaveLength(7);
    expect(result.limitRejectedCount).toBe(1);

    const parsed = registrationSchema.safeParse({
      ...validRegistration,
      photoUrls: ["https://example.lt/manual.jpg"],
      photoUploads: Array.from({ length: 8 }, (_, index) => ({
        name: `${index}.jpg`,
        type: "image/jpeg",
        size: 1000,
        lastModified: index
      }))
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid file types", () => {
    const result = merge([], [file("bad.pdf", { type: "application/pdf" })]);
    expect(result.next).toHaveLength(0);
    expect(result.invalidTypeCount).toBe(1);
  });

  it("rejects files over the supported five megabyte limit", () => {
    const result = merge([], [file("large.jpg", { size: REGISTRATION_PHOTO_MAX_BYTES + 1 })]);
    expect(result.next).toHaveLength(0);
    expect(result.oversizedCount).toBe(1);
  });
});

describe("registration direct upload behavior", () => {
  const photos = [selection(file("one.jpg")), selection(file("two.jpg", { lastModified: 2 }))];
  const plans: RegistrationPhotoUploadPlan[] = photos.map((photo) => ({
    storagePath: `profile/${photo.name}`,
    signedUrl: `https://storage.example/${photo.name}`,
    uploadToken: `token-${photo.id}`
  }));

  it("keeps successful uploads pending when another direct upload fails and reports partial failure", async () => {
    const finalize = vi.fn(async () => undefined);
    const abort = vi.fn(async () => undefined);
    const result = await uploadRegistrationPhotos(photos, plans, {
      directUpload: async (_plan, photo) => {
        if (photo.name === "two.jpg") throw new Error("Tinklo klaida");
      },
      finalize,
      abort
    });

    expect(result.successes.map((photo) => photo.name)).toEqual(["one.jpg"]);
    expect(result.failures).toHaveLength(1);
    expect(result.complete).toBe(false);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(abort).toHaveBeenCalledWith(plans[1]);
  });

  it("never reports complete success when a required finalize operation fails", async () => {
    const result = await uploadRegistrationPhotos(photos, plans, {
      directUpload: async () => undefined,
      finalize: async (plan) => {
        if (plan === plans[1]) throw new Error("Įrašo klaida");
      },
      abort: async () => undefined
    });
    expect(result.complete).toBe(false);
    expect(result.failures[0].message).toContain("Įrašo klaida");
  });
});
