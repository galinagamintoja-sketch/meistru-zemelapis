export const REGISTRATION_PHOTO_MAX_ITEMS = 8;
export const REGISTRATION_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const REGISTRATION_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type RegistrationPhotoType = (typeof REGISTRATION_PHOTO_TYPES)[number];

export type RegistrationPhotoFileLike = {
  name: string;
  type: string;
  size: number;
  lastModified: number;
};

export type RegistrationPhotoSelection = {
  id: string;
  name: string;
  type: RegistrationPhotoType;
  size: number;
  lastModified: number;
  previewUrl: string;
  file?: File;
};

export type RegistrationPhotoUploadPlan = {
  storagePath: string;
  signedUrl: string;
  uploadToken: string;
};

export const PARTIAL_REGISTRATION_PHOTO_NOTICE =
  "Profilis sukurtas ir aktyvus, tačiau dalies nuotraukų įkelti nepavyko. Jas galite įkelti dar kartą skiltyje „Nuotraukos“.";

export function countNonEmptyPhotoUrls(photoUrls: string[]) {
  return photoUrls.filter((url) => url.trim().length > 0).length;
}

export function registrationPhotoFingerprint(photo: RegistrationPhotoFileLike) {
  return `${photo.name}\u0000${photo.size}\u0000${photo.lastModified}`;
}

export function mergeRegistrationPhotoSelections(
  existing: RegistrationPhotoSelection[],
  incoming: RegistrationPhotoFileLike[],
  manualUrlCount: number,
  createSelection: (file: RegistrationPhotoFileLike) => RegistrationPhotoSelection
) {
  const existingFingerprints = new Set(existing.map(registrationPhotoFingerprint));
  const uniqueValid: RegistrationPhotoFileLike[] = [];
  let duplicateCount = 0;
  let invalidTypeCount = 0;
  let oversizedCount = 0;

  for (const file of incoming) {
    if (!REGISTRATION_PHOTO_TYPES.includes(file.type as RegistrationPhotoType)) {
      invalidTypeCount += 1;
      continue;
    }
    if (file.size < 1 || file.size > REGISTRATION_PHOTO_MAX_BYTES) {
      oversizedCount += 1;
      continue;
    }
    const fingerprint = registrationPhotoFingerprint(file);
    if (existingFingerprints.has(fingerprint)) {
      duplicateCount += 1;
      continue;
    }
    existingFingerprints.add(fingerprint);
    uniqueValid.push(file);
  }

  const available = Math.max(0, REGISTRATION_PHOTO_MAX_ITEMS - existing.length - manualUrlCount);
  const acceptedFiles = uniqueValid.slice(0, available);
  const limitRejectedCount = uniqueValid.length - acceptedFiles.length;
  const next = [...existing, ...acceptedFiles.map(createSelection)];
  const messages: string[] = [];

  if (invalidTypeCount) messages.push(`${invalidTypeCount} fail. netinkamo tipo; rinkitės JPG, PNG arba WebP.`);
  if (oversizedCount) messages.push(`${oversizedCount} fail. viršija 5 MB ribą.`);
  if (duplicateCount) messages.push(`${duplicateCount} pasikartojanti nuotrauka nepridėta.`);
  if (limitRejectedCount) {
    messages.push(
      `Pridėta ${acceptedFiles.length}, o ${limitRejectedCount} netilpo: iš viso galima pasirinkti daugiausia ${REGISTRATION_PHOTO_MAX_ITEMS} nuotraukas.`
    );
  }

  return {
    next,
    acceptedCount: acceptedFiles.length,
    duplicateCount,
    invalidTypeCount,
    oversizedCount,
    limitRejectedCount,
    message: messages.join(" ")
  };
}

export async function uploadRegistrationPhotos(
  selections: RegistrationPhotoSelection[],
  plans: Array<RegistrationPhotoUploadPlan | null | undefined>,
  dependencies: {
    directUpload: (plan: RegistrationPhotoUploadPlan, photo: RegistrationPhotoSelection, onProgress: (percent: number) => void) => Promise<void>;
    finalize: (plan: RegistrationPhotoUploadPlan) => Promise<void>;
    abort: (plan: RegistrationPhotoUploadPlan) => Promise<void>;
    onProgress?: (photoId: string, percent: number) => void;
  }
) {
  const failures: Array<{ photo: RegistrationPhotoSelection; message: string }> = [];
  const successes: RegistrationPhotoSelection[] = [];

  for (let index = 0; index < selections.length; index += 1) {
    const photo = selections[index];
    const plan = plans[index];
    if (!plan) {
      failures.push({ photo, message: "Serveris neparuošė nuotraukos įkėlimo." });
      continue;
    }

    try {
      await dependencies.directUpload(plan, photo, (percent) => dependencies.onProgress?.(photo.id, percent));
      await dependencies.finalize(plan);
      dependencies.onProgress?.(photo.id, 100);
      successes.push(photo);
    } catch (error) {
      await dependencies.abort(plan).catch(() => undefined);
      failures.push({
        photo,
        message: error instanceof Error ? error.message : "Nuotraukos įkelti nepavyko."
      });
    }
  }

  return { successes, failures, complete: failures.length === 0 };
}
