/** The analytics wire contract. Every figure is an anonymous aggregate. */

export interface AnalyticsCount {
  key: string | null;
  scans: number;
}

export interface AnalyticsLocation {
  city: string | null;
  region: string | null;
  country: string | null;
  scans: number;
}

export interface AnalyticsRecentScan {
  scannedAt: number;
  city: string | null;
  region: string | null;
  country: string | null;
  deviceType: string;
  os: string;
  label: string | null;
  shortCode: string;
}

export interface AnalyticsResponse {
  days: number;
  totals: { scans: number; visitors: number };
  /** One entry per day in the range, including days with no scans. */
  byDay: { day: string; scans: number }[];
  byDevice: AnalyticsCount[];
  byOs: AnalyticsCount[];
  byLocation: AnalyticsLocation[];
  byCountry: AnalyticsCount[];
  byCode: { id: string; label: string | null; shortCode: string; scans: number }[];
  recent: AnalyticsRecentScan[];
}
