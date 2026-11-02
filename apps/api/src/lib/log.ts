type Level = "info" | "warn" | "error";

/** One JSON object per line, so Workers Logs can filter on any field. */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  console[level === "info" ? "log" : level](JSON.stringify({ level, event, ...fields }));
}

export function errorFields(error: unknown): { error: string; stack?: string } {
  return error instanceof Error
    ? { error: error.message, stack: error.stack }
    : { error: String(error) };
}
