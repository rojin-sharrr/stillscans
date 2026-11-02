import { z } from "zod";

export const MAX_URL_LENGTH = 2048;
const MAX_QR_PAYLOAD_LENGTH = 4296; // QR version 40 alphanumeric capacity.

const urlInput = z.string().trim().min(1).max(MAX_URL_LENGTH);
const label = z.string().trim().min(1).max(120);

export const createCodeSchema = z.object({
  destination: urlInput,
  label: label.optional(),
});

export const updateCodeSchema = z
  .object({
    destination: urlInput.optional(),
    label: label.nullable().optional(),
    status: z.enum(["active", "paused"]).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "No fields to update" });

/**
 * `url` is what someone pasted; `decodedText` is the raw payload of a QR code the
 * browser decoded. They differ for non-URL payloads such as Wi-Fi details or text.
 */
export const checkRequestSchema = z.union([
  z.object({ url: urlInput }).strict(),
  z.object({ decodedText: z.string().min(1).max(MAX_QR_PAYLOAD_LENGTH) }).strict(),
]);

export const createReportSchema = z
  .object({
    providerSlug: z.string().trim().min(1).max(80).optional(),
    domain: z.string().trim().min(1).max(253).optional(),
    message: z.string().trim().min(1).max(2000),
    email: z.email().max(254).optional(),
  })
  .strict();

export type CreateCodeInput = z.infer<typeof createCodeSchema>;
export type UpdateCodeInput = z.infer<typeof updateCodeSchema>;
export type CheckRequest = z.infer<typeof checkRequestSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
