export const REGISTRATION_PHOTO_MAX_ITEMS = 8;
export const REGISTRATION_PHOTO_INPUT_MAX_BYTES = 10 * 1024 * 1024;
export const REGISTRATION_PHOTO_MAX_BYTES = 1024 * 1024;
export const REGISTRATION_PHOTO_TYPES = ["image/webp"] as const;
export const REGISTRATION_PHOTO_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const REGISTRATION_PHOTO_ACCEPT = [...REGISTRATION_PHOTO_INPUT_TYPES, ".heic", ".heif"].join(",");
export const REGISTRATION_PHOTO_MAX_EDGE = 1920;

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
    if (!isSupportedPhotoInput(file)) {
      invalidTypeCount += 1;
      continue;
    }
    if (file.size < 1 || file.size > REGISTRATION_PHOTO_INPUT_MAX_BYTES) {
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

  if (invalidTypeCount) messages.push(`${invalidTypeCount} fail. netinkamo tipo; rinkitės JPG, PNG, WebP arba HEIC.`);
  if (oversizedCount) messages.push(`${oversizedCount} fail. viršija 10 MB ribą.`);
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

export function isSupportedPhotoInput(file: Pick<RegistrationPhotoFileLike, "name" | "type">) {
  const extension = file.name.toLowerCase().split(".").pop();
  return REGISTRATION_PHOTO_INPUT_TYPES.includes(file.type.toLowerCase() as (typeof REGISTRATION_PHOTO_INPUT_TYPES)[number])
    || ((extension === "heic" || extension === "heif") && (!file.type || file.type === "application/octet-stream"));
}

export function fitPhotoDimensions(width: number, height: number, maxEdge = REGISTRATION_PHOTO_MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Naršyklė negali sukurti WebP nuotraukos.")), "image/webp", quality);
  });
}

async function hasExpectedImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...bytes);
  if (file.type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === "image/png") return bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (file.type === "image/webp") return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
  if (file.type === "image/heic" || file.type === "image/heif" || /\.hei[cf]$/i.test(file.name)) {
    return ascii.slice(4, 8) === "ftyp" && /hei[cf]|heix|hevc|mif1/.test(ascii.slice(8));
  }
  return false;
}

export async function compressProfilePhoto(file: File) {
  if (!isSupportedPhotoInput(file) || file.size < 1 || file.size > REGISTRATION_PHOTO_INPUT_MAX_BYTES) {
    throw new Error("Pasirinkite JPG, PNG, WebP arba HEIC nuotrauką iki 10 MB.");
  }
  if (!(await hasExpectedImageSignature(file))) {
    throw new Error("Failo turinys neatitinka nurodyto nuotraukos tipo.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Šios nuotraukos naršyklė neperskaito. HEIC failą pabandykite pasirinkti telefonu arba konvertuoti į JPG.");
  }

  try {
    let dimensions = fitPhotoDimensions(bitmap.width, bitmap.height);
    let quality = 0.8;
    let blob: Blob | null = null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Nuotraukos apdoroti nepavyko.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, dimensions.width, dimensions.height);
      context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
      blob = await canvasToWebp(canvas, quality);
      if (blob.size <= REGISTRATION_PHOTO_MAX_BYTES) break;
      quality = Math.max(0.72, quality - 0.03);
      if (quality <= 0.72) {
        dimensions = fitPhotoDimensions(Math.round(dimensions.width * 0.88), Math.round(dimensions.height * 0.88));
      }
    }

    if (!blob || blob.size > REGISTRATION_PHOTO_MAX_BYTES) {
      throw new Error("Nuotraukos nepavyko sumažinti iki 1 MB neprarandant per daug kokybės.");
    }

    const outputName = `${file.name.replace(/\.[^.]+$/, "") || "nuotrauka"}.webp`;
    return new File([blob], outputName, { type: "image/webp", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
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
