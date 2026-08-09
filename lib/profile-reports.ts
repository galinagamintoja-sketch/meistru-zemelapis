import { z } from "zod";

export const profileReportReasons = [
  "wrong_photo",
  "wrong_contact",
  "misleading_details",
  "inappropriate",
  "other"
] as const;

export const profileReportReasonLabels: Record<(typeof profileReportReasons)[number], string> = {
  wrong_photo: "Nuotrauka nesusijusi arba netinkama",
  wrong_contact: "Neteisingas telefonas ar kitas kontaktas",
  misleading_details: "Klaidinanti profilio informacija",
  inappropriate: "Netinkamas arba įžeidžiantis turinys",
  other: "Kita problema"
};

export const profileReportSchema = z.object({
  profileId: z.string().uuid(),
  reason: z.enum(profileReportReasons),
  details: z.string().trim().min(10).max(1000),
  reporterEmail: z.union([z.string().trim().email().max(254), z.literal("")]).optional().default(""),
  website: z.string().max(0).optional().default("")
}).strict();

export const profileReportStatusSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["reviewing", "resolved", "dismissed"]),
  adminNotes: z.string().trim().max(1000).optional().default("")
}).strict();
