import type { QrDesign } from "@stillscans/shared";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const MIN_CONTRAST = 4.5;

/** Problems a person can fix. The render is also decoded before any download. */
export function designWarning(design: QrDesign): string | null {
  if (luminance(design.foreground) > luminance(design.background)) {
    return "Use a code color darker than the background. Many phones can't read light-on-dark codes.";
  }
  if (contrastRatio(design.foreground, design.background) < MIN_CONTRAST) {
    return "These colors are too close together for phones to read reliably.";
  }
  return null;
}

/** A draft survives the trip through sign-in. */
export interface CreateDraft {
  destination: string;
  kind: "static" | "dynamic";
  label: string;
  design: QrDesign;
}

const DRAFT_KEY = "ss:create-draft";

export function saveDraft(draft: CreateDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // A large logo can exceed storage. The person just re-enters it after signing in.
  }
}

export function loadDraft(): CreateDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as CreateDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}
