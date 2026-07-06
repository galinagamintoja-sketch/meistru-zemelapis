import { z } from "zod";

export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(140),
  phone: z.string().trim().min(6).max(40),
  whatsapp: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().email().max(180),
  city: z.string().trim().min(2).max(80),
  trade: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(1200),
  radiusKm: z.coerce.number().min(5).max(150),
  operatingCities: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
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
