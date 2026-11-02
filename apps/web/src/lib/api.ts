import type {
  AnalyticsResponse,
  CheckEvent,
  CheckRequest,
  CheckResult,
  CreateReportInput,
  JoinWaitlistInput,
  QrDesign,
} from "@stillscans/shared";

const API_URL: string = import.meta.env.PUBLIC_API_URL ?? "https://api.usestillscans.com";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiRequestError";
  }
}

async function errorFrom(response: Response): Promise<ApiRequestError> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
  return new ApiRequestError(response.status, body?.error?.code ?? "unknown");
}

/** Runs a check, calling `onEvent` as each line of progress arrives. */
export async function streamCheck(
  request: CheckRequest,
  onEvent: (event: CheckEvent) => void,
): Promise<void> {
  const response = await fetch(`${API_URL}/api/check`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/x-ndjson" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await errorFrom(response);
  if (!response.body) throw new ApiRequestError(response.status, "no_stream");

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line) onEvent(JSON.parse(line) as CheckEvent);
    }
  }
}

export async function fetchCheck(id: string): Promise<CheckResult> {
  const response = await fetch(`${API_URL}/api/check/${encodeURIComponent(id)}`);
  if (!response.ok) throw await errorFrom(response);
  return (await response.json()) as CheckResult;
}

export async function sendReport(report: CreateReportInput): Promise<void> {
  const response = await fetch(`${API_URL}/api/reports`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!response.ok) throw await errorFrom(response);
}

export async function joinWaitlist(entry: JoinWaitlistInput): Promise<void> {
  const response = await fetch(`${API_URL}/api/waitlist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!response.ok) throw await errorFrom(response);
}

/** Calls an endpoint that uses the session cookie. */
async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: init.body ? { "content-type": "application/json" } : undefined,
  });
  if (!response.ok) throw await errorFrom(response);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

const post = <T>(path: string, body: unknown, method = "POST") =>
  authed<T>(path, { method, body: JSON.stringify(body) });

export const googleSignInUrl = `${API_URL}/api/auth/google`;

export const fetchAuthConfig = () => authed<{ google: boolean }>("/api/auth/config");
export const signOut = () => authed<void>("/api/auth/logout", { method: "POST" });

export interface Account {
  email: string;
  codeAllowance: number;
  liveCodes: number;
}
export const fetchAccount = () => authed<Account>("/api/auth/me");

export interface Code {
  id: string;
  shortCode: string;
  printedLink: string;
  label: string | null;
  destination: string;
  design: QrDesign | null;
  status: "active" | "paused" | "blocked" | "archived";
  createdAt: number;
  updatedAt: number;
  scans?: number;
}

export interface NewCode {
  destination: string;
  label?: string;
  design: QrDesign;
}

export interface CodeChanges {
  destination?: string;
  label?: string | null;
  status?: "active" | "paused";
  design?: QrDesign;
}

export const fetchCodes = () => authed<{ codes: Code[] }>("/api/codes");
export const fetchCode = (id: string) =>
  authed<{ code: Code; destinations: { destination: string; createdAt: number }[] }>(
    `/api/codes/${encodeURIComponent(id)}`,
  );
export const createCode = (code: NewCode) => post<{ code: Code }>("/api/codes", code);
export const updateCode = (id: string, changes: CodeChanges) =>
  post<{ code: Code }>(`/api/codes/${encodeURIComponent(id)}`, changes, "PATCH");
export const archiveCode = (id: string) =>
  authed<void>(`/api/codes/${encodeURIComponent(id)}`, { method: "DELETE" });
export const fetchExport = () => authed<unknown>("/api/codes/export");

export interface AnalyticsFilters {
  days: number;
  device?: string;
  country?: string;
  codeId?: string;
}

export function fetchAnalytics(filters: AnalyticsFilters): Promise<AnalyticsResponse> {
  const params = new URLSearchParams({ days: String(filters.days) });
  for (const key of ["device", "country", "codeId"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  return authed<AnalyticsResponse>(`/api/analytics?${params}`);
}
