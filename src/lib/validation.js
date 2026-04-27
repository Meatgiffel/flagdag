import { z } from "zod";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const eventFormSchema = z.object({
  title: z.string().trim().min(2).max(90),
  morningTime: timeSchema,
  eveningTime: timeSchema,
  dates: z.string().min(1),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "Det nye password skal være mindst 8 tegn.").max(200),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "De to nye passwords er ikke ens.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "Det nye password skal være anderledes end det nuværende.",
    path: ["newPassword"],
  });

export const signupSchema = z
  .object({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().max(80).optional().default(""),
    phone: z.string().trim().max(40).optional().default(""),
    email: z.string().trim().max(120).optional().default(""),
    ownerKey: z.string().trim().max(160).optional().default(""),
    role: z.enum(["DRIVER", "HELPER"]),
    tripIds: z.array(z.string().min(1)).min(1),
    company: z.string().optional().default(""),
  })
  .refine((data) => data.phone.length > 0 || data.email.length > 0, {
    message: "Skriv telefon eller email.",
    path: ["phone"],
  })
  .refine((data) => data.company.length === 0, {
    message: "Tilmeldingen kunne ikke gemmes.",
    path: ["company"],
  });

export function parseDates(value) {
  const uniqueDates = [...new Set(String(value).split(",").map((date) => date.trim()).filter(Boolean))];
  const dates = uniqueDates.filter((date) => dateKeySchema.safeParse(date).success).sort();

  if (dates.length === 0) {
    throw new Error("Vælg mindst en dato.");
  }

  return dates;
}

export function normalizeTripIds(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}
