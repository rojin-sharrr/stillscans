import type { CheckEvent, CheckRequest, CheckResult, CreateReportInput } from "@stillscans/shared";

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
