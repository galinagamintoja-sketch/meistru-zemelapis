import { z } from "zod";
import { isLithuanianPhone } from "./phone";
import { MAX_PROFILE_CATEGORIES, MAX_PROFILE_SERVICES } from "./service-taxonomy";

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
  publicContactConsent: z.boolean(),
  labourRateUnit: z.enum(["hour", "sqm", "agreed"]),
  labourRateAmount: z.coerce.number().int().nullable(),
  serviceLabourRates: z.array(z.object({ serviceId: z.string().uuid(), amount: z.coerce.number().int().min(5).max(200) })).max(MAX_PROFILE_SERVICES)
}).superRefine((value, context) => {
  if (value.labourRateUnit === "hour" && (value.labourRateAmount === null || value.labourRateAmount < 10 || value.labourRateAmount > 100)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["labourRateAmount"], message: "Valandinis įkainis turi būti 10–100 €." });
  if (value.labourRateUnit !== "hour" && value.labourRateAmount !== null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["labourRateAmount"], message: "Šiam kainos tipui bendras skaitinis įkainis netaikomas." });
  if (value.labourRateUnit === "sqm" && !value.serviceLabourRates.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceLabourRates"], message: "Pridėkite bent vieną paslaugos m² kainą." });
  if (value.labourRateUnit !== "sqm" && value.serviceLabourRates.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceLabourRates"], message: "m² kainos taikomos tik pasirinkus kainą už m²." });
  const ids = value.serviceLabourRates.map((rate) => rate.serviceId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceLabourRates"], message: "Paslaugų kainos negali kartotis." });
});

export const tradespersonAreasUpdateSchema = z.object({
  baseCity: z.string().trim().min(2).max(100),
  registeredAddress: z.string().trim().min(4).max(260).optional().default("Privatus adresas"),
  googlePlaceId: z.string().trim().max(220).optional().default(""),
  latitude: z.number().min(53.8).max(56.5).nullable().optional().default(null),
  longitude: z.number().min(20.5).max(27).nullable().optional().default(null),
  cities: z.array(z.string().trim().min(2).max(100)).optional(),
  radiusKm: z.coerce.number().int().refine((value) => [5, 10, 20, 25, 30, 50, 75, 100, 150].includes(value))
});

export const tradespersonServicesUpdateSchema = z.object({
  categoryIds: z.array(z.string().uuid()).min(1).max(MAX_PROFILE_CATEGORIES).refine((ids) => new Set(ids).size === ids.length),
  subcategoryIds: z.array(z.string().uuid()).max(MAX_PROFILE_SERVICES).refine((ids) => new Set(ids).size === ids.length)
});

export const tradespersonServicesAndAreaUpdateSchema = tradespersonServicesUpdateSchema.extend({
  area: tradespersonAreasUpdateSchema
});
