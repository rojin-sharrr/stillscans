import { z } from "zod";

export const MAX_URL_LENGTH = 2048;
const MAX_QR_PAYLOAD_LENGTH = 4296; // QR version 40 alphanumeric capacity.

const urlInput = z.string().trim().min(1).max(MAX_URL_LENGTH);
const label = z.string().trim().min(1).max(120);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** A logo is a downscaled PNG kept with the code. PNG only, so no script can hide in it. */
const MAX_LOGO_LENGTH = 90_000;
const pngDataUrl = z
  .string()
  .max(MAX_LOGO_LENGTH)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/);

export const qrDesignSchema = z.object({
  foreground: hexColor,
  background: hexColor,
  modules: z.enum(["square", "rounded", "dots"]),
  frame: z.enum(["none", "label"]),
  /** Call to action under the code, such as "Scan for menu". */
  callToAction: z.string().trim().max(32),
  logo: pngDataUrl.nullable(),
});

export type QrDesign = z.infer<typeof qrDesignSchema>;

export const DEFAULT_QR_DESIGN: QrDesign = {
  foreground: "#0E1116",
  background: "#FFFFFF",
  modules: "square",
  frame: "none",
  callToAction: "Scan me",
  logo: null,
};

export const createCodeSchema = z.object({
  destination: urlInput,
  label: label.optional(),
  design: qrDesignSchema.optional(),
});

export const updateCodeSchema = z
  .object({
    destination: urlInput.optional(),
    label: label.nullable().optional(),
    status: z.enum(["active", "paused"]).optional(),
    design: qrDesignSchema.optional(),
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

export const joinWaitlistSchema = z
  .object({
    email: z.email().max(254),
    plan: z.enum(["pro", "business"]),
    /** The page the person signed up from. */
    source: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const ANALYTICS_RANGES = [7, 30, 90, 365] as const;

export const analyticsQuerySchema = z.object({
  days: z.coerce
    .number()
    .refine((days) => (ANALYTICS_RANGES as readonly number[]).includes(days))
    .default(30),
  device: z.enum(["mobile", "desktop", "unknown"]).optional(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  codeId: z.string().min(1).max(40).optional(),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type CreateCodeInput = z.infer<typeof createCodeSchema>;
export type UpdateCodeInput = z.infer<typeof updateCodeSchema>;
export type CheckRequest = z.infer<typeof checkRequestSchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;
