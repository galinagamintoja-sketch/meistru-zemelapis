import { z } from "zod";

export const photoFieldMetadata = {
  maxItems: 8,
  maxSizeMb: 5,
  acceptedTypes: ["image/jpeg", "image/png", "image/webp"] as const
};

export function normalizeLithuanianPhone(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const digits = trimmed.replace(/[^\d]/g, "");

  if (digits.startsWith("370") && digits.length === 11) {
    return `+${digits}`;
  }

  if (digits.startsWith("8") && digits.length === 9) {
    return `+370${digits.slice(1)}`;
  }

  return trimmed;
}

export function isLithuanianPhone(value: string) {
  const normalized = normalizeLithuanianPhone(value);
  return /^\+370\d{8}$/.test(normalized.replace(/\s+/g, ""));
}

export const lithuanianPhoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(40)
  .refine(isLithuanianPhone, "Įveskite lietuvišką telefono numerį, pvz. +37061234567");

export const photoUrlSchema = z.string().trim().url().max(500);
export const photoUploadSchema = z.object({
  name: z.string().trim().min(1).max(180),
  type: z.enum(photoFieldMetadata.acceptedTypes),
  size: z.number().int().min(1).max(photoFieldMetadata.maxSizeMb * 1024 * 1024),
  dataUrl: z.string().startsWith("data:image/").max(8_000_000)
});

export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(140),
  phone: lithuanianPhoneSchema,
  whatsapp: z.string().trim().max(40).optional().default("").refine((value) => !value || isLithuanianPhone(value), "Įveskite lietuvišką WhatsApp numerį"),
  email: z.string().trim().email().max(180),
  city: z.string().trim().min(2).max(80),
  trade: z.string().trim().min(2).max(120).optional().default(""),
  categorySlugs: z.array(z.string().trim().min(2).max(80)).max(8).optional().default([]),
  subcategorySlugs: z.array(z.string().trim().min(2).max(80)).max(20).optional().default([]),
  description: z.string().trim().min(10).max(1200),
  radiusKm: z.coerce.number().min(5).max(150),
  operatingCities: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
  photoUrls: z.array(photoUrlSchema).max(photoFieldMetadata.maxItems).optional().default([]),
  photoUploads: z.array(photoUploadSchema).max(photoFieldMetadata.maxItems).optional().default([]),
  consentAccepted: z.literal(true)
});

export const enquirySchema = z.object({
  specialistId: z.string().uuid().or(z.string().min(2).max(80)),
  eventType: z.enum(["profile_viewed", "phone_click", "whatsapp_click", "message"]),
  clientName: z.string().trim().max(140).optional(),
  clientPhone: z.string().trim().max(40).optional(),
  clientEmail: z.string().trim().email().max(180).optional(),
  city: z.string().trim().max(80).optional(),
  service: z.string().trim().max(120).optional(),
  message: z.string().trim().max(1500).optional()
});

export const reviewSchema = z.object({
  specialistId: z.string().uuid().or(z.string().min(2).max(80)),
  clientName: z.string().trim().min(2).max(140),
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().trim().min(5).max(1500),
  photos: z.array(z.string().url()).max(8).optional().default([])
});
