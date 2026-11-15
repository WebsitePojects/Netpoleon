/**
 * An error the caller is allowed to see. The title is returned to the client verbatim, so it
 * must never carry a value, a query or a stack; anything that is not an AppError is reported
 * as an opaque 500 instead.
 */
export class AppError extends Error {
  readonly detail: string | undefined;
  /** Extra response headers, such as Retry-After on a 429. */
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    readonly status: number,
    readonly code: string,
    title: string,
    detail?: string,
    headers: Record<string, string> = {},
  ) {
    super(title);
    this.name = 'AppError';
    this.detail = detail;
    this.headers = headers;
  }
}
