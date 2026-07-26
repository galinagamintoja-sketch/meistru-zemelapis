import { z } from "zod";

export const tradespersonProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  companyName: z.string().trim().max(160).optional().default(""),
  phone: z.string().trim().regex(/^\+?[0-9][0-9\s-]{7,19}$/),
  whatsappNumber: z.string().trim().max(24).optional().default(""),
  publicEmail: z.string().trim().email().max(254),
  description: z.string().trim().min(40).max(2500)
});

export const tradespersonAreasUpdateSchema = z.object({
  baseCity: z.string().trim().min(2).max(100),
  cities: z.array(z.string().trim().min(2).max(100)).min(1).max(20),
  radiusKm: z.coerce.number().int().min(1).max(200)
});

export const tradespersonServicesUpdateSchema = z.object({
  subcategoryIds: z.array(z.string().uuid()).max(50)
});
