export type HttpErrorPayload = {
  detail: string;
  code?: string;
  [key: string]: unknown;
};

export class HttpError extends Error {
  readonly status: number;
  readonly payload: HttpErrorPayload;

  constructor(status: number, detail: string, extra: Record<string, unknown> = {}) {
    super(detail);
    this.status = status;
    this.payload = { detail, ...extra };
  }
}
