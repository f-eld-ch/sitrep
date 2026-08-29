export type ApiErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INCIDENT_NOT_CLOSED"
  | "INCIDENT_NOT_DELETABLE"
  | "JOURNAL_NOT_OPEN"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "ApiError";
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
