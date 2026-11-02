import { DEFAULT_QR_DESIGN, type QrDesign } from "./schemas";

/**
 * What each plan unlocks. Enforced by the API; the web app only reflects it. A plan
 * never affects redirects, so a printed code keeps working on any plan.
 */
export const PLANS = {
  free: { label: "Free", codes: 5, analytics: false, branding: false },
  pro: { label: "Pro", codes: 100, analytics: true, branding: true },
  business: { label: "Business", codes: 1000, analytics: true, branding: true },
} as const;

export type Plan = keyof typeof PLANS;

/** True when a design uses logo or color options that need a paid plan. */
export function designNeedsBranding(design: QrDesign): boolean {
  return (
    design.logo !== null ||
    design.foreground.toUpperCase() !== DEFAULT_QR_DESIGN.foreground ||
    design.background.toUpperCase() !== DEFAULT_QR_DESIGN.background
  );
}

/** The closest design a plan without branding can use. */
export function withoutBranding(design: QrDesign): QrDesign {
  return {
    ...design,
    foreground: DEFAULT_QR_DESIGN.foreground,
    background: DEFAULT_QR_DESIGN.background,
    logo: null,
  };
}
