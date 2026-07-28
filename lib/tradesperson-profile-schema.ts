import { z } from "zod";
import { isLithuanianPhone } from "./phone";

export const tradespersonProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(160).optional().default(""),
  primaryCategoryId: z.string().uuid(),
  experienceYears: z.coerce.number().int().min(0).max(80),
  phone: z.string().trim().refine(isLithuanianPhone),
  whatsappNumber: z.string().trim().max(24).refine((value) => !value || isLithuanianPhone(value)).optional().default(""),
  publicEmail: z.string().trim().email().max(254),
  description: z.string().trim().min(40).max(2500),
  languages: z.array(z.string().trim().min(2).max(40)).max(12),
  publicContactConsent: z.boolean()
});

export const tradespersonAreasUpdateSchema = z.object({
  baseCity: z.string().trim().min(2).max(100),
  registeredAddress: z.string().trim().min(4).max(260).optional().default("Privatus adresas"),
  googlePlaceId: z.string().trim().max(220).optional().default(""),
  latitude: z.number().min(53.8).max(56.5).nullable().optional().default(null),
  longitude: z.number().min(20.5).max(27).nullable().optional().default(null),
  cities: z.array(z.string().trim().min(2).max(100)).optional(),
  radiusKm: z.coerce.number().int().refine((value) => [5, 10, 20, 30, 50, 75, 100, 150].includes(value))
});

export const tradespersonServicesUpdateSchema = z.object({
  subcategoryIds: z.array(z.string().uuid()).max(15).refine((ids) => new Set(ids).size === ids.length)
});
