import type { CheckRequest } from "@stillscans/shared";

/**
 * Hands a check from the input widget to /check across a page load. Uses
 * sessionStorage, so an uploaded photo's thumbnail never leaves the browser.
 */
export interface PendingCheck {
  request: CheckRequest | null; // null: the code couldn't be read
  /** Filename, or null for a pasted link. */
  label: string | null;
  thumbnail: string | null;
}

const PENDING_KEY = "ss:pending-check";
const scanKey = (id: string) => `ss:scan:${id}`;

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage can be full or blocked. The thumbnail is cosmetic, so carry on.
  }
}

export function beginCheck(pending: PendingCheck): void {
  write(PENDING_KEY, JSON.stringify(pending));
  window.location.assign("/check/");
}

export function takePendingCheck(): PendingCheck | null {
  const raw = read(PENDING_KEY);
  if (!raw) return null;
  try {
    sessionStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw) as PendingCheck;
  } catch {
    return null;
  }
}

export interface ScanDetails {
  label: string | null;
  thumbnail: string | null;
}

export function rememberScan(id: string, details: ScanDetails): void {
  write(scanKey(id), JSON.stringify(details));
}

export function recallScan(id: string): ScanDetails | null {
  const raw = read(scanKey(id));
  return raw ? (JSON.parse(raw) as ScanDetails) : null;
}
