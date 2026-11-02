/**
 * The contract between api (writer) and redirect (reader). Changing the shape of
 * a KV record is a data migration: a record exists for every printed code.
 *
 * Billing state must never appear here. The product promise is that codes keep
 * working when someone stops paying, so redirect cannot know about payment at all.
 */
export type KvCodeStatus = "active" | "paused" | "blocked";

export interface KvCodeRecord {
  /** Destination URL. */
  d: string;
  /** Status. */
  s: KvCodeStatus;
}

export function kvKey(shortCode: string): string {
  return `code:${shortCode}`;
}

/** Sent to the scan queue by redirect, consumed by api. Queues are at-least-once, so `id` dedupes. */
export interface ScanEvent {
  id: string;
  shortCode: string;
  scannedAt: number;
  country: string | null;
  city: string | null;
  deviceType: "mobile" | "desktop" | "unknown";
}
