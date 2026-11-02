import type { AnalyticsLocation } from "@stillscans/shared";

const DEVICES: Record<string, string> = { mobile: "Phone or tablet", desktop: "Computer" };
const SYSTEMS: Record<string, string> = {
  ios: "iPhone or iPad",
  android: "Android",
  windows: "Windows",
  mac: "Mac",
};

export const deviceName = (key: string | null) => DEVICES[key ?? ""] ?? "Unknown";
export const systemName = (key: string | null) => SYSTEMS[key ?? ""] ?? "Other";

const regions = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string | null): string {
  if (!code) return "Unknown";
  try {
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}

export function placeName({ city, region, country }: Omit<AnalyticsLocation, "scans">): string {
  if (city) return region ? `${city}, ${region}` : city;
  return region ?? countryName(country);
}

export function timeAgo(time: number, now = Date.now()): string {
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

/** Whole, evenly spaced axis steps, so ticks never read as 1.33 scans. */
export function axisMax(peak: number): { max: number; step: number } {
  if (peak <= 4) return { max: 4, step: 1 };
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const step = [0.25, 0.5, 1, 2.5, 5]
    .map((factor) => factor * magnitude)
    .find((candidate) => candidate >= 1 && Number.isInteger(candidate) && peak / candidate <= 4);
  const resolved = step ?? magnitude * 10;
  return { max: Math.ceil(peak / resolved) * resolved, step: resolved };
}
