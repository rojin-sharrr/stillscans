import type { ContentfulStatusCode } from "hono/utils/http-status";

/** An expected failure the client can act on. `code` is stable; `message` is for people. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (message = "Not found") => new ApiError(404, "not_found", message);
